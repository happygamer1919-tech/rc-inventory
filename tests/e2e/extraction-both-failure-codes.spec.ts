import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import {
  EXTRACTION_ERROR_LABEL,
  PLATFORM_ARM_LABEL,
  PLATFORM_VERDICT_PREFIX,
} from "@/lib/data/extraction-types";

// extraction-both-failure-codes.spec - linia de acceptanta a cardului P3-105,
// constatarea F26 a lui Ivan, hotararea R-214:
//
//   "the two fields answer different questions and MAY disagree; error_code stays
//    the sender's and stays authoritative for what Andre said (R-190 unchanged);
//    platform_error_code is our own reading. When they differ, the review screen
//    shows both in Romanian: the sender's message first, then one line
//    'Verificarea noastra: <ours in plain words>'."
//
// CE AFIRMA. Pe forma Matnord, unde expeditorul a trimis `reconciliation_failed`
// si verificarea noastra a ajuns la `unreadable_document` pe bratul `no_lines`,
// randul de verificare arata propozitia expeditorului PRIMA si neschimbata, iar
// sub ea inca un rand cu verdictul nostru in romana. Bratul se poate citi dintr-un
// atribut, deci proba nu depinde de proza.
//
// CELE DOUA CONTROALE SUNT JUMATATE DIN CARD. Cand cele doua coduri sunt ACELASI
// nu se adauga nimic, si cand al nostru LIPSESTE nu se adauga nimic: nici eticheta
// goala, nici cuvantul necunoscut. Un ecran care ar scrie ceva pentru un verdict
// absent ar inventa o a doua parere pe care nimeni nu a avut-o.
//
// FORMA, NU RANDUL. Comanda Matnord 4164defa din constatare este un rand REAL de
// productie. Nu se deschide, nu se citeste si nu se atinge: din ea se ia numai
// FORMA payload-ului, iar fixtura este construita de mana aici, cu valori
// prefixate TEST.
//
// SCANARE SI FARA CHEIA `lines`, SI NU ESTE O ALEGERE. EXT-20 raspunde 400 unei
// scanari esuate care poarta cheia `lines` deloc, deci o scanare esuata nu are
// linii, deci bratul nostru pe ea este `no_lines`. Exact forma constatarii.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

/** P3-101. O valoare de proba este unica PE RULARE SI PE CAZ, nu numai pe rulare:
 *  cazurile aceleiasi rulari se vad unul pe altul, fiindca datele de test nu se
 *  sterg niciodata in acest depozit. */
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
 *  Acelasi drum ca in extraction-unreadable-with-lines.spec. */
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

/** Propozitia EXPEDITORULUI, stocata si aratata exact asa cum a sosit. */
const SENDER_REASON = "Suma liniilor nu se potrivește cu totalul, după verificarea serviciului.";

/**
 * FORMA MATNORD: o SCANARE esuata, cu antetul complet si FARA cheia `lines`.
 *
 * Antetul se aduna cu el insusi, 50336.40 plus 10067.28 este exact 60403.68 si
 * 50336.40 ori 20% este exact 10067.28, deci `header_inconsistent` nu se aprinde.
 * Zero linii, deci bratul nostru este `no_lines` si codul nostru este
 * `unreadable_document`. Codul EXPEDITORULUI il decide apelantul.
 */
function scanFailure(orderId: string, tag: string, over: Record<string, unknown> = {}) {
  return {
    order_id: orderId,
    status: "failed",
    document_source: "scan",
    error_code: "reconciliation_failed",
    reason: SENDER_REASON,
    supplier_name: `TEST Furnizor F26 ${tag}`,
    order_date: "2026-09-27",
    currency: "MDL",
    currency_raw: "lei",
    prices_include_vat: false,
    vat_rate: 20.0,
    subtotal: 50336.4,
    vat_amount: 10067.28,
    document_total: 60403.68,
    ...over,
  };
}

test.describe("F26: doua coduri de esec pentru acelasi document, amandoua pe ecran", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. G62 F26: codul expeditorului si al nostru difera, deci ecranul le arata pe amandoua, al lui primul", async ({
    page,
    request,
  }) => {
    const tag = tagFor("f26c1");
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, tag);

    const r = await post(request, scanFailure(orderId, tag));
    expect(r.status(), "codul HTTP este cel de totdeauna").toBe(202);

    // --- CE S-A STOCAT: FORMA CONSTATARII, REPRODUSA ------------------------
    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    // AL LUI, AUTORITAR PRIN R-190, si acest card nu il misca.
    expect(d.error_code, "codul expeditorului ramane al lui").toBe("reconciliation_failed");
    expect(d.reason, "propozitia lui, stocata asa cum a sosit").toBe(SENDER_REASON);
    // AL NOSTRU, INREGISTRAT ALATURI prin EXT-26.
    expect(d.platform_error_code, "verdictul nostru").toBe("unreadable_document");
    expect(d.platform_arm, "si bratul care l-a produs").toBe("no_lines");
    // CELE DOUA CHIAR NU SUNT DE ACORD, altfel cazul nu dovedeste nimic.
    expect(d.platform_error_code).not.toBe(d.error_code);

    // --- CE SE VEDE: AMANDOUA, IN ORDINEA HOTARATA --------------------------
    const row = await draftRow(page, orderId);

    // 1. PROPOZITIA LUI, PRIMA SI NESCHIMBATA, cu markerii ei de totdeauna.
    const sender = row.getByTestId("draft-error-sentence");
    await expect(sender).toHaveAttribute("data-error-code", "reconciliation_failed");
    await expect(sender).toHaveText(EXTRACTION_ERROR_LABEL.reconciliation_failed);
    await expect(row.getByTestId("draft-reason")).toHaveText(SENDER_REASON);

    // 2. AL NOSTRU, DEDESUBT, CU BRATUL CITIBIL DINTR-UN ATRIBUT.
    const ours = row.getByTestId("draft-platform-verdict");
    await expect(ours).toHaveCount(1);
    await expect(ours).toHaveAttribute("data-platform-arm", "no_lines");
    // Sirul literal din hotarare, ca proba sa nu treaca daca textul se schimba
    // fara ca cineva sa se uite la el.
    await expect(ours).toHaveText("Verificarea noastră: nu am găsit linii în document");
    // SI ACELASI SIR COMPUS DIN CONSTANTE, ca ecranul si proba sa nu poata fi
    // doua siruri diferite.
    await expect(ours).toHaveText(`${PLATFORM_VERDICT_PREFIX}${PLATFORM_ARM_LABEL.no_lines}`);

    // 3. ORDINEA, AFIRMATA SI NU PRESUPUSA: propozitia lui este deasupra.
    const order = await row.evaluate((el) => {
      const s = el.querySelector('[data-testid="draft-error-sentence"]');
      const o = el.querySelector('[data-testid="draft-platform-verdict"]');
      if (!s || !o) return "lipseste unul";
      // DOCUMENT_POSITION_FOLLOWING inseamna "o vine dupa s in document".
      return (s.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        ? "al lui primul"
        : "al nostru primul";
    });
    expect(order, "propozitia expeditorului sta deasupra verdictului nostru").toBe(
      "al lui primul",
    );

    // 4. PE TELEFON, la 390x844. Randul nou este un paragraf frate cu `draft-reason`
    //    si poarta exact clasele lui, deci nu are nevoie de nicio clasa de telefon
    //    proprie; ce se afirma aici este ca ecranul nu incepe sa deruleze lateral
    //    din cauza lui si ca propozitia se vede intreaga.
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneRow = await draftRow(page, orderId);
    const phoneOurs = phoneRow.getByTestId("draft-platform-verdict");
    await expect(phoneOurs).toBeVisible();
    await expect(phoneOurs).toHaveText("Verificarea noastră: nu am găsit linii în document");
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, "verificarea derulează lateral la 390 px").toBeLessThanOrEqual(0);
  });

  test("2. G62 F26: CONTROLUL, cand cele doua coduri sunt ACELASI nu se adauga niciun rand", async ({
    page,
    request,
  }) => {
    const tag = tagFor("f26c2");
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, tag);

    // Aceeasi forma, cu codul expeditorului pus pe `unreadable_document`: verdictul
    // nostru cade tot pe `no_lines`, deci pe acelasi cod. Un acord nu este un
    // dezacord si nu are ce arata.
    const r = await post(
      request,
      scanFailure(orderId, tag, { error_code: "unreadable_document" }),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.error_code).toBe("unreadable_document");
    expect(d.platform_error_code, "al nostru a rulat si a ajuns la acelasi cod").toBe(
      "unreadable_document",
    );
    expect(d.platform_arm, "bratul se scrie oricum: el spune DE CE").toBe("no_lines");
    expect(d.platform_error_code).toBe(d.error_code);

    const row = await draftRow(page, orderId);
    // Propozitia lui este tot acolo, si nimic nu s-a schimbat in jurul ei.
    await expect(row.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "unreadable_document",
    );
    await expect(row.getByTestId("draft-error-sentence")).toHaveText(
      EXTRACTION_ERROR_LABEL.unreadable_document,
    );
    await expect(row.getByTestId("draft-reason")).toHaveText(SENDER_REASON);
    // NIMIC ADAUGAT. Nu un rand gol, nu "necunoscut": elementul nu exista.
    await expect(row.getByTestId("draft-platform-verdict")).toHaveCount(0);
  });

  test("3. G62 F26: CONTROLUL, cand verdictul nostru LIPSESTE nu se adauga niciun rand si nimic altceva nu se schimba", async ({
    page,
    request,
  }) => {
    const tag = tagFor("f26c3");
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, tag);

    // DIGITAL, deci clasificarea noastra nu ruleaza: acolo cifrele vin din text si
    // o nepotrivire inseamna altceva. `lines: []` este permis pe orice esec care nu
    // este o scanare, prin EXT-20. Amandoua coloanele raman null, si null inseamna
    // "nu a rulat", nu "nu a gasit nimic".
    const r = await post(
      request,
      scanFailure(orderId, tag, {
        document_source: "digital",
        error_code: "download_failed",
        lines: [],
      }),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("download_failed");
    expect(d.platform_error_code, "null inseamna ca nu am judecat nimic").toBeNull();
    expect(d.platform_arm).toBeNull();

    const row = await draftRow(page, orderId);
    // Ecranul este exact cel de dinaintea acestui card.
    await expect(row.getByTestId("draft-error-sentence")).toHaveAttribute(
      "data-error-code",
      "download_failed",
    );
    await expect(row.getByTestId("draft-error-sentence")).toHaveText(
      EXTRACTION_ERROR_LABEL.download_failed,
    );
    await expect(row.getByTestId("draft-reason")).toHaveText(SENDER_REASON);
    await expect(row.getByTestId("draft-platform-verdict")).toHaveCount(0);
  });

  test("4. G62 F26: fiecare brat isi poarta propozitia lui, si ea este alta pentru fiecare", async () => {
    // AL DOILEA BRAT CERUT DE ACCEPTANTA, afirmat pe constanta si nu pe ecran:
    // `line_sum_missed` este singurul brat care poarta `reconciliation_failed`, si
    // pe el cele doua coduri pot fi egale sau nu dupa ce a trimis expeditorul. Ce
    // se afirma aici este ca propozitia lui EXISTA si este ALTA, fiindca un
    // `Record` cu doua chei care arata acelasi text nu ar spune nimic operatorului.
    expect(PLATFORM_ARM_LABEL.no_lines).toBe("nu am găsit linii în document");
    expect(PLATFORM_ARM_LABEL.line_sum_missed).toBe(
      "liniile nu se adună la totalul documentului",
    );

    // TOATE SASE SUNT SCRISE, DISTINCTE SI IN ROMANA. Tipul `Record<ScanArm, string>`
    // obliga la sase la compilare; aceasta afirmatie adauga ce compilatorul nu poate
    // spune: ca niciuna nu este goala si ca niciodoua nu sunt acelasi sir.
    const sentences = Object.values(PLATFORM_ARM_LABEL);
    expect(sentences).toHaveLength(6);
    for (const s of sentences) expect(s.trim().length).toBeGreaterThan(0);
    expect(new Set(sentences).size, "nicio propozitie repetata").toBe(6);
  });
});
