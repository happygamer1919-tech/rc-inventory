import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { QUANTITIES_ONLY_NOTICE } from "@/lib/data/extraction-types";

// extraction-unreadable-with-lines.spec - linia de acceptanta a cardului P3-104,
// constatarea F24 a lui Ivan, asa cum a hotarat-o Max, optiunea (b), hotararea
// R-212:
//
//   "when the sender's status is failed with error_code = unreadable_document AND
//    the payload carries at least one line item with a quantity above zero, store
//    the draft as the quantity-only partial of R-208 ... not as Esuat. Every other
//    sender code still wins exactly as R-190 says."
//
// CE AFIRMA. Un aviz fara valori, trimis `failed` cu `unreadable_document` si cu
// linii care poarta cantitati peste zero, se stocheaza `partial`, ajunge in
// verificare, isi pastreaza fiecare linie cu cantitatea ei, are preturile null si
// arata nota lui Max pe ecran, iar codul si `reason` ale expeditorului raman
// stocate exact asa cum au sosit.
//
// CONTROALELE, SI ELE SUNT JUMATATE DIN CARD. Un payload cu `lines []` ramane
// `failed`, ceea ce este exact asteptarea de regresie a lui R-205 pentru
// aviz-silvamat-0044213.pdf; unul ale carui linii poarta toate cantitatea 0 ramane
// si el `failed`; iar orice ALT cod al expeditorului ramane exact unde il pune
// R-190.
//
// DIGITAL, SI NU ESTE O ALEGERE. EXT-20 raspunde 400 unei scanari esuate care
// poarta cheia `lines`, deci un payload esuat care poarta linii este digital prin
// constructie. Cazurile 23, 24 si 25 din extraction.spec.ts pazesc acel refuz si
// nu sunt atinse de acest card.
//
// CODUL HTTP SE AFIRMA PRIN VALOARE: 202 la prima sosire, ca inainte de acest
// card pentru fiecare payload de aici. Corpul spune statusul STOCAT.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

/** P3-101. O valoare de proba este unica PE RULARE SI PE CAZ, nu numai pe rulare:
 *  cazurile aceleiasi rulari se vad unul pe altul, fiindca datele de test nu se
 *  sterg niciodata in acest depozit. Fiecare caz isi poarta eticheta lui. */
function tagFor(caseName: string): string {
  return `${caseName}-${RUN}`;
}

function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

/** Incarca un document pe banda de extragere si intoarce order_id-ul trimis.
 *  Acelasi drum ca in extraction-quantity-only-delivery-note.spec. */
async function uploadForExtraction(
  page: Page,
  request: APIRequestContext,
  tag: string,
): Promise<string> {
  const filename = `TEST-${tag}.pdf`;
  await page.goto(UPLOAD);
  await page.getByTestId("extraction-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: pdfBytes(tag),
  });

  const card = page.locator(`[data-testid="draft-card"]`).filter({ hasText: filename });
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  const orderId = (await card.getAttribute("data-order-id")) ?? "";
  expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);

  const fired = await firedFor(request, orderId);
  expect(fired).toHaveLength(1);
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

async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: MACHINE_RETRIES,
  });
  expect(r.status()).toBe(200);
  return (await r.json()) as Record<string, unknown> & { lines: Record<string, unknown>[] };
}

/** Randul documentului pe ecranul de verificare, citit din nou dupa callback. */
async function draftRow(page: Page, orderId: string) {
  await page.goto(UPLOAD);
  const row = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  return row;
}

/** O linie de aviz: denumire si cantitate, fara pret si fara total. `unit` este o
 *  valoare din enumul public.unit_code; cuvantul documentului sta in `unit_raw`. */
function line(name: string, tag: string, quantity: number) {
  return {
    product_name: `${name} F24 ${tag}`,
    quantity,
    unit: "pcs",
    unit_raw: "buc",
    unit_price: null,
    line_total: null,
    currency: null,
    currency_raw: null,
    category: null,
    category_raw: null,
  };
}

/** SENDER_REASON este propozitia EXPEDITORULUI si se stocheaza asa cum a sosit.
 *  Hotararea R-208, pastrata de R-212: "reason is the sender's field and is stored
 *  as sent; overwriting it would hide what the reader said." */
const SENDER_REASON = "Documentul nu a putut fi citit de serviciul de extragere.";

/** Un esec DIGITAL trimis de cititor, cu antetul complet gol: niciun subtotal,
 *  niciun total de document, nicio TVA, niciun pret pe nicio linie. */
function failedBody(
  orderId: string,
  tag: string,
  lines: ReturnType<typeof line>[],
  over: Record<string, unknown> = {},
) {
  return {
    order_id: orderId,
    status: "failed",
    document_source: "digital",
    error_code: "unreadable_document",
    reason: SENDER_REASON,
    supplier_name: `TEST Furnizor F24 ${tag}`,
    order_date: "2026-09-27",
    prices_include_vat: null,
    vat_rate: null,
    currency: null,
    currency_raw: null,
    subtotal: null,
    vat_amount: null,
    document_total: null,
    lines,
    ...over,
  };
}

test.describe("F24: un document numit necitibil care totusi trimite linii cu cantitati ajunge in verificare", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. G61 F24: failed plus unreadable_document plus linii cu cantitati peste zero: stocat partial, in verificare, cu nota si fara preturi", async ({
    page,
    request,
  }) => {
    const tag = tagFor("f24c1");
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, tag);

    const payload = failedBody(orderId, tag, [
      line("Teava", tag, 12),
      line("Cot", tag, 30),
      line("Robinet", tag, 4),
    ]);
    const r = await post(request, payload);
    expect(r.status(), "codul HTTP este cel de totdeauna").toBe(202);
    expect(await r.json(), "corpul spune statusul STOCAT, si el nu mai este failed").toEqual({
      order_id: orderId,
      status: "partial",
      lines: 3,
    });

    const d = await draftState(request, orderId);
    expect(d.status, "ajunge in verificare, nu in Esuat").toBe("partial");
    expect(d.status).not.toBe("failed");
    // Codul expeditorului NU se arunca: R-190 isi pastreaza jumatatea de
    // inregistrare, si cine citeste randul vede ce a spus cititorul.
    expect(d.error_code, "codul expeditorului ramane pe rand").toBe("unreadable_document");
    // Pe o cale digitala clasificarea noastra nu ruleaza, deci nu scriem niciun
    // verdict: null inseamna "nu a rulat", nu "nu a gasit nimic".
    expect(d.platform_error_code).toBeNull();
    expect(d.platform_arm).toBeNull();

    expect(d.lines, "fiecare linie pastrata").toHaveLength(3);
    expect(d.lines.map((l) => Number(l.quantity))).toEqual([12, 30, 4]);
    for (const l of d.lines) {
      expect(l.unit_price, "niciun pret inventat").toBeNull();
      expect(l.line_total, "niciun total inventat").toBeNull();
    }

    const row = await draftRow(page, orderId);
    await expect(row).toHaveAttribute("data-status", "partial");
    await expect(row).toHaveAttribute("data-lines", "3");
    await expect(row, "eticheta de stare nu mai citeste Esuat").toContainText("Parțial");
    await expect(row, "documentul are un drum catre verificare").toContainText("Verifică");
    await expect(row.getByTestId("draft-review")).toHaveCount(1);
    // Nota este DERIVATA din documentul stocat, prin isQuantitiesOnly, aceeasi
    // conditie pe care o citeste reconcilierea de la R-208 incoace.
    await expect(row.getByTestId("draft-quantities-only")).toHaveText(
      "Document fără prețuri: cantitățile sunt citite, prețurile se completează din factură",
    );
    // Aceeasi propozitie ca in constanta, ca ecranul si proba sa nu poata diverge.
    await expect(row.getByTestId("draft-quantities-only")).toHaveText(QUANTITIES_ONLY_NOTICE);
    // Ce a spus cititorul ramane vizibil langa nota.
    await expect(row.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "unreadable_document",
    );
  });

  test("2. G61 F24: CONTROLUL, lines [] ramane failed (asteptarea de regresie a lui R-205) si toate cantitatile 0 ramane failed", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    // (a) FORMA LUI R-205, VERBATIM DIN HOTARARE: "failed, error_code
    //     unreadable_document, document_source digital, lines []." Niciun rand nu
    //     poarta o linie, deci conditia noua nu se poate aprinde, si asteptarea de
    //     regresie ramane intreaga.
    {
      const tag = tagFor("f24c2a");
      const orderId = await uploadForExtraction(page, request, tag);
      const r = await post(request, failedBody(orderId, tag, []));
      expect(r.status(), "lines [] ramane acceptat ca inainte").toBe(202);
      expect(await r.json()).toEqual({ order_id: orderId, status: "failed", lines: 0 });

      const d = await draftState(request, orderId);
      expect(d.status, "R-205: un document fara nicio linie ramane esuat").toBe("failed");
      expect(d.error_code).toBe("unreadable_document");
      expect(d.lines).toHaveLength(0);

      const row = await draftRow(page, orderId);
      await expect(row).toHaveAttribute("data-status", "failed");
      await expect(row.getByTestId("draft-quantities-only")).toHaveCount(0);
      await expect(row.getByTestId("draft-review")).toHaveCount(0);
    }

    // (b) O CANTITATE NU ESTE O CANTITATE PESTE ZERO. Conditia hotararii cere cel
    //     putin o linie cu cantitatea PESTE zero; un document ale carui linii sosesc
    //     toate cu 0 nu o indeplineste si ramane esuat.
    {
      const tag = tagFor("f24c2b");
      const orderId = await uploadForExtraction(page, request, tag);
      const r = await post(
        request,
        failedBody(orderId, tag, [line("Teava", tag, 0), line("Cot", tag, 0)]),
      );
      expect(r.status()).toBe(202);
      expect(await r.json()).toEqual({ order_id: orderId, status: "failed", lines: 2 });

      const d = await draftState(request, orderId);
      expect(d.status, "numai cantitatea 0: ramane esuat").toBe("failed");
      expect(d.error_code).toBe("unreadable_document");

      const row = await draftRow(page, orderId);
      await expect(row).toHaveAttribute("data-status", "failed");
      await expect(row.getByTestId("draft-quantities-only")).toHaveCount(0);
      await expect(row.getByTestId("draft-review")).toHaveCount(0);
    }
  });

  test("3. G61 F24: ORICE ALT COD AL EXPEDITORULUI ramane exact unde il pune R-190", async ({
    page,
    request,
  }) => {
    const tag = tagFor("f24c3");
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, tag);

    // Acelasi payload, acelasi set de linii cu cantitati peste zero, si un ALT cod.
    // Ingustarea este de UN SINGUR cod: nimic altceva nu se misca.
    const r = await post(
      request,
      failedBody(
        orderId,
        tag,
        [line("Teava", tag, 12), line("Cot", tag, 30), line("Robinet", tag, 4)],
        { error_code: "download_failed" },
      ),
    );
    expect(r.status()).toBe(202);
    expect(await r.json(), "statusul stocat ramane failed").toEqual({
      order_id: orderId,
      status: "failed",
      lines: 3,
    });

    const d = await draftState(request, orderId);
    expect(d.status, "R-190: codul expeditorului castiga, ca pana acum").toBe("failed");
    expect(d.error_code).toBe("download_failed");

    const row = await draftRow(page, orderId);
    await expect(row).toHaveAttribute("data-status", "failed");
    await expect(row.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "download_failed",
    );
    await expect(row.getByTestId("draft-quantities-only")).toHaveCount(0);
    await expect(row.getByTestId("draft-review")).toHaveCount(0);
  });

  test("4. G61 F24: reason se stocheaza exact asa cum a sosit, iar codul expeditorului ramane inregistrat pe rand", async ({
    page,
    request,
  }) => {
    const tag = tagFor("f24c4");
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, tag);

    const r = await post(request, failedBody(orderId, tag, [line("Teava", tag, 7)]));
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("partial");
    // R-208, pastrata de R-212: nota este DERIVATA din documentul stocat si nu se
    // scrie in `reason`. `reason` este campul expeditorului, octet cu octet.
    expect(d.reason, "propozitia expeditorului, neatinsa").toBe(SENDER_REASON);
    expect(String(d.reason)).not.toContain("Document fără prețuri");
    expect(d.error_code, "codul expeditorului este inregistrat").toBe("unreadable_document");

    const row = await draftRow(page, orderId);
    await expect(row.getByTestId("draft-reason")).toHaveText(SENDER_REASON);
    await expect(row.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "unreadable_document",
    );
    await expect(row.getByTestId("draft-quantities-only")).toHaveText(QUANTITIES_ONLY_NOTICE);
  });
});
