import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { buildPdf } from "./support/pdf-builder.mjs";
import {
  EXTRACTION_META_ABSENT,
  EXTRACTION_META_LABEL,
  EXTRACTION_META_TITLE,
  formatExtractionDuration,
} from "@/lib/data/extraction-types";

// extraction-meta-shown.spec - linia de acceptanta a cardului P3-72,
// constatarea F5 a lui Ivan.
//
// CE AFIRMA. `_meta` soseste la fiecare callback si este stocat verbatim in
// `extraction_drafts.meta` de la migratia 0008 incoace, iar numarul de pagini
// raportat de model are coloana lui de la 0032. Pana la acest card nimic nu le
// citea inapoi: comentariile amandurora spun, in termeni, "stocat si niciodata
// aratat operatorului". Un camp pe care nimeni nu il poate vedea nu explica
// nimic nimanui, care este exact rostul pentru care blocul a fost stocat.
//
// ACELASI TRANSPORT MOCAT CA LA P2-08a SI P2-09. Serverul fals de Make asculta
// pe 127.0.0.1 si aplicatia il vede prin MAKE_WEBHOOK_URL. Callback-ul il
// trimite specul, direct catre endpointul aplicatiei, ca fiecare caz sa
// controleze exact ce ajunge in `_meta`.
//
// CIORNELE INTRA PRIN BANDA DE EXTRAGERE, ca in review.spec: fisierul se incarca
// fara ca vreo comanda sa existe, deci ciorna apare in lista de verificat.
//
// TEXTELE SE CITESC DIN SURSA, NU SE COPIAZA AICI. Doua siruri, unul pe ecran si
// unul in test, pot ajunge sa nu fie de acord, si atunci proba nu mai spune
// nimic despre ce vede operatorul.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

/** Un PDF minim, cand numarul lui de pagini nu conteaza pentru caz. */
function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

/** Incarca un document pe banda de extragere si intoarce order_id-ul mintit. */
async function uploadForExtraction(
  page: Page,
  request: APIRequestContext,
  tag: string,
  buffer: Buffer = pdfBytes(tag),
): Promise<string> {
  const filename = `TEST-${tag}-${RUN}.pdf`;
  await page.goto(UPLOAD);
  await page.getByTestId("extraction-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer,
  });

  const card = page.locator(`[data-testid="draft-card"]`).filter({ hasText: filename });
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  const orderId = (await card.getAttribute("data-order-id")) ?? "";
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

  const fired = await firedFor(request, orderId);
  expect(fired).toHaveLength(1);
  expect(fired[0]!.documentFilename).toBe(filename);
  return orderId;
}

function post(request: APIRequestContext, body: unknown) {
  return request.post(CALLBACK, {
    headers: {
      "Content-Type": "application/json",
      "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
    },
    data: body,
    maxRetries: MACHINE_RETRIES,
  });
}

function draftCard(page: Page, orderId: string) {
  return page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
}

/** Deschide blocul de diagnostic al unei ciorne si il intoarce.
 *
 *  SE APASA, SI ASTA ESTE O AFIRMATIE A CARDULUI, NU O NECESITATE A PROBEI.
 *  Blocul este un `details` inchis: ecranul are un singur rost, reconcilierea, si
 *  un nume de model nu are ce cauta in fata acelei sarcini. Proba deschide exact
 *  cum deschide operatorul care intreaba de ce a iesit asa. */
async function openMeta(page: Page, orderId: string) {
  await page.goto(UPLOAD);
  const card = draftCard(page, orderId);
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  const details = card.getByTestId("draft-meta");
  await expect(details).toHaveCount(1);

  const body = card.getByTestId("draft-meta-body");
  // INCHIS INAINTE DE APASARE. Fara aceasta linie, un `details` randat deschis ar
  // trece restul cazului si afirmatia despre aglomerarea ecranului ar fi falsa.
  await expect(body).toBeHidden();

  const toggle = card.getByTestId("draft-meta-toggle");
  await expect(toggle).toHaveText(EXTRACTION_META_TITLE);
  await toggle.click();
  await expect(body).toBeVisible({ timeout: 15_000 });
  return card;
}

test.describe("Diagnosticul extragerii pe ecranul de verificare", () => {
  test.describe.configure({ timeout: 120_000 });

  test("1. F5: un partial care poarta model, versiunea promptului, durata si cauza le arata pe toate patru, in romana", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "meta-partial");

    // DIGITAL SI CU CIFRE CARE SE ADUNA, ca acest caz sa ramana despre
    // diagnostic si sa nu devina pe tacute un al doilea test de reconciliere:
    // subtotal 18450 plus TVA 3690 la cota 20 da exact 22140, iar singura linie
    // poarta subtotalul, deci diferenta este 0.
    const r = await post(request, {
      order_id: orderId,
      status: "partial",
      error_code: null,
      reason: "O pozitie nu a putut fi citita.",
      supplier_name: `TEST Furnizor meta ${RUN}`,
      document_source: "digital",
      order_date: "2026-09-16",
      subtotal: 18450.0,
      vat_amount: 3690.0,
      document_total: 22140.0,
      prices_include_vat: false,
      vat_rate: 20.0,
      currency: "MDL",
      currency_raw: "lei",
      lines: [
        {
          product_name: `Tigla metalica meta ${RUN}`,
          quantity: 240.5,
          unit: "m2",
          unit_raw: "mp",
          unit_price: 76.72,
          line_total: 18450.0,
          currency: "MDL",
          currency_raw: "lei",
          category: null,
          category_raw: "Invelitori",
        },
      ],
      _meta: {
        model: "gpt-4o-mini",
        prompt_version: "v2.3",
        duration_ms: 8140,
        // NU ESTE IN CONTRACT SI SOSESTE ORICUM, inauntrul blocului stocat
        // verbatim. Hotararea din decisions/inbox.md o spune in termeni, si
        // constatarea F5 o numeste pe nume.
        partial_cause: "lines",
      },
    });
    expect(r.status(), "un partial digital cu linii este acceptat").toBe(202);

    const card = await openMeta(page, orderId);

    const model = card.getByTestId("draft-meta-model");
    await expect(model).toContainText(EXTRACTION_META_LABEL.model);
    await expect(model).toContainText("gpt-4o-mini");

    const prompt = card.getByTestId("draft-meta-prompt-version");
    await expect(prompt).toContainText(EXTRACTION_META_LABEL.promptVersion);
    await expect(prompt).toContainText("v2.3");

    // DURATA IN CUVINTE, nu 8140 pe ecran. Sirul se calculeaza cu aceeasi
    // functie pe care o foloseste ecranul, ca proba sa nu inghete un format.
    const duration = card.getByTestId("draft-meta-duration");
    await expect(duration).toContainText(EXTRACTION_META_LABEL.durationMs);
    await expect(duration).toContainText(formatExtractionDuration(8140));

    const cause = card.getByTestId("draft-meta-partial-cause");
    await expect(cause).toContainText(EXTRACTION_META_LABEL.partialCause);
    await expect(cause).toContainText("lines");

    // NICIUN CUVANT ENGLEZESC DE ETICHETA. Valorile sunt ale expeditorului si
    // raman cum au sosit; etichetele sunt ale noastre si sunt romanesti.
    for (const label of [
      EXTRACTION_META_LABEL.model,
      EXTRACTION_META_LABEL.promptVersion,
      EXTRACTION_META_LABEL.durationMs,
      EXTRACTION_META_LABEL.partialCause,
    ]) {
      await expect(card.getByTestId("draft-meta-body")).toContainText(label);
    }
    await expect(card.getByTestId("draft-meta-body")).not.toContainText("prompt_version");
    await expect(card.getByTestId("draft-meta-body")).not.toContainText("duration_ms");
  });

  test("2. F5: pe o forma esuata numarul de pagini al MODELULUI se vede langa al NOSTRU, si nu se pot confunda", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    // PATRU PAGINI ADEVARATE IN FISIER, numarate de noi din bytes la incarcare.
    const orderId = await uploadForExtraction(
      page,
      request,
      "meta-pages",
      buildPdf(4, { objectStreams: true }),
    );

    // DIGITAL SI ESUAT, ca forma sa poarte cheia `lines`: o scanare esuata nu are
    // voie sa o trimita deloc (contract 4.1a), iar cazul acesta este despre cele
    // doua numere, nu despre forma scanarii.
    const r = await post(request, {
      order_id: orderId,
      status: "failed",
      error_code: "unreadable_document",
      reason: "Documentul nu a putut fi citit.",
      supplier_name: `TEST Furnizor pagini ${RUN}`,
      document_source: "digital",
      order_date: "2026-09-16",
      currency: "MDL",
      currency_raw: "lei",
      prices_include_vat: false,
      vat_rate: 20.0,
      subtotal: null,
      vat_amount: null,
      document_total: null,
      lines: [],
      _meta: {
        model: "gpt-4o-mini",
        prompt_version: "v2.3",
        duration_ms: 420,
        // O PAGINA RAPORTATA PE UN DOCUMENT DE PATRU. Aceasta este exact
        // semnatura pe care coloana 0032 exista ca sa o faca vizibila: un model
        // care a citit o pagina si a raspuns consecvent cu sine.
        page_count: 1,
      },
    });
    expect(r.status(), "un esec digital cu lines este acceptat").toBe(202);

    const card = await openMeta(page, orderId);

    const modelPages = card.getByTestId("draft-meta-model-pages");
    await expect(modelPages).toContainText(EXTRACTION_META_LABEL.modelPageCount);
    await expect(modelPages).toContainText("1");

    const uploadPages = card.getByTestId("draft-meta-upload-pages");
    await expect(uploadPages).toContainText(EXTRACTION_META_LABEL.uploadPageCount);
    await expect(uploadPages).toContainText("4");

    // DISTINCTE, SI ACEASTA ESTE AFIRMATIA CARDULUI. Doua elemente separate, doua
    // etichete care nu sunt acelasi sir, si doua valori care nu sunt acelasi
    // numar. Un singur camp numit "Pagini" ar fi trecut fiecare linie de mai sus
    // si ar fi lasat exact intrebarea fara raspuns.
    expect(EXTRACTION_META_LABEL.modelPageCount).not.toBe(
      EXTRACTION_META_LABEL.uploadPageCount,
    );
    await expect(modelPages).not.toContainText(EXTRACTION_META_LABEL.uploadPageCount);
    await expect(uploadPages).not.toContainText(EXTRACTION_META_LABEL.modelPageCount);

    // Durata si modelul raman vizibile si pe forma esuata: un esec este exact
    // documentul despre care cineva va intreba ce s-a intamplat.
    await expect(card.getByTestId("draft-meta-model")).toContainText("gpt-4o-mini");
    await expect(card.getByTestId("draft-meta-duration")).toContainText(
      formatExtractionDuration(420),
    );
  });

  test("3. F5: un _meta care nu are forma asteptata NU strica ecranul, si absenta se spune", async ({
    page,
    request,
  }) => {
    // `meta` este jsonb NEVALIDAT, scris verbatim dintr-un payload al altcuiva.
    // Nimic, nici la scriere nici la citire, nu ii verifica forma. O citire care
    // ar crede blobul pe cuvant ar cadea pe primul expeditor care trimite altceva
    // decat un obiect, si ar cadea pe ecranul operatorului, nu in laborator.
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "meta-broken");

    const r = await post(request, {
      order_id: orderId,
      status: "failed",
      error_code: "extraction_failed",
      reason: "Modelul nu a intors nimic utilizabil.",
      supplier_name: `TEST Furnizor stricat ${RUN}`,
      document_source: "digital",
      order_date: "2026-09-16",
      currency: "MDL",
      currency_raw: "lei",
      prices_include_vat: false,
      vat_rate: 20.0,
      subtotal: null,
      vat_amount: null,
      document_total: null,
      lines: [],
      // NU UN OBIECT. Legal ca jsonb, ilegal ca bloc de diagnostic.
      _meta: "nici macar nu este un obiect",
    });
    expect(r.status(), "un _meta fara forma nu respinge documentul").toBe(202);

    const card = await openMeta(page, orderId);

    // ECRANUL TRAIESTE, si fiecare camp spune ca nu s-a raportat, in loc sa
    // dispara. Un camp care lipseste de pe ecran nu se deosebeste de unul care nu
    // exista deloc.
    for (const id of ["draft-meta-model", "draft-meta-prompt-version", "draft-meta-duration"]) {
      await expect(card.getByTestId(id)).toContainText(EXTRACTION_META_ABSENT);
    }

    // CAUZA NU SE INVENTEAZA. Nu este in contract, deci un rand "Nu s-a raportat"
    // ar promite un camp pe care nimeni nu s-a angajat sa il trimita.
    await expect(card.getByTestId("draft-meta-partial-cause")).toHaveCount(0);

    // NUMARUL MODELULUI ABSENT SE SPUNE, SI NU DEVINE ZERO. Zero pagini nu este
    // un numar mai mic de pagini, este un raport stricat, si migratia 0032 refuza
    // sa il stocheze tocmai din acest motiv.
    const modelPages = card.getByTestId("draft-meta-model-pages");
    await expect(modelPages).toContainText(EXTRACTION_META_ABSENT);
    await expect(modelPages).not.toContainText("0");
  });
});
