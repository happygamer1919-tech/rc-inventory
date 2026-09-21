import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { EXTRACTION_ERROR_LABEL } from "@/lib/data/extraction-types";

// extraction-digital-partial-vat-error-code.spec - linia de acceptanta a cardului
// P3-83, constatarea F8 a lui Ivan, asa cum a hotarat-o Max (hotararea R-211):
//
//   "F8 digital partial with unknown VAT flag: store an error code, not only
//    our verdict."
//
// CE AFIRMA. Un `partial` DIGITAL, fara cheia error_code, cu prices_include_vat
// null, cu un antet care se aduna cu el insusi si cu liniile care nu se potrivesc
// cu niciunul dintre cele doua totaluri (bratul anchor_unknown), este stocat cu
// error_code `unreadable_document`, nu null. Statusul ramane `partial`, liniile
// raman, iar platform_error_code si platform_arm poarta exact ce purtau inainte.
// CONTROALELE: acelasi document cu steagul cunoscut primeste reconciliation_failed
// ca inainte, iar acelasi document cu steagul necunoscut si cu liniile care SE
// potrivesc nu primeste niciun cod, deci nimic nu se inventeaza.
//
// CODUL HTTP SE AFIRMA PRIN VALOARE: 202 la prima sosire, ca inainte de acest
// card pentru fiecare payload de aici. Corpul spune statusul STOCAT.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

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
  const filename = `TEST-${tag}-${RUN}.pdf`;
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

/** O linie cu aritmetica ei proprie corecta, ca verificarea P3-75 sa nu fie
 *  motivul pentru nimic din ce se afirma aici. */
function line(name: string, quantity: number, unitPrice: number) {
  return {
    product_name: `${name} F8 ${RUN}`,
    quantity,
    unit: "pcs",
    unit_raw: "buc",
    unit_price: unitPrice,
    line_total: Math.round(quantity * unitPrice * 100) / 100,
    currency: "MDL",
    currency_raw: "lei",
    category: null,
    category_raw: null,
  };
}

/** Linii care dau 70: nu se potrivesc nici cu subtotalul 80, nici cu totalul 96,
 *  la o toleranta de 0.05 pe doua linii. */
const MISSING_LINES = () => [line("Linie 1", 3, 10), line("Linie 2", 2, 20)];
/** Linii care dau 80, exact subtotalul. */
const MATCHING_LINES = () => [line("Linie 1", 3, 10), line("Linie 2", 2, 25)];

/** Un `partial` DIGITAL FARA CHEIA error_code. Antetul se aduna cu el insusi:
 *  80 + 16 = 96, iar 16 este 20% din 80, deci bratul header_inconsistent nu
 *  poate fi cel care decide. */
function digitalPartial(
  orderId: string,
  pricesIncludeVat: boolean | null,
  lines: ReturnType<typeof line>[],
): Record<string, unknown> {
  return {
    order_id: orderId,
    status: "partial",
    document_source: "digital",
    reason: `Documentul nu spune daca preturile includ TVA ${RUN}`,
    supplier_name: `TEST Furnizor F8 ${RUN}`,
    order_date: "2026-09-21",
    prices_include_vat: pricesIncludeVat,
    vat_rate: 20,
    currency: "MDL",
    currency_raw: "lei",
    subtotal: 80,
    vat_amount: 16,
    document_total: 96,
    lines,
  };
}

test.describe("F8: un partial digital cu steagul TVA necunoscut stocheaza un cod, nu numai verdictul nostru", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. F8: partial digital fara cod, prices_include_vat null, liniile nu se potrivesc cu niciun total: error_code unreadable_document, status partial, liniile pastrate", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f8-anchor");

    const payload = digitalPartial(orderId, null, MISSING_LINES());
    expect(Object.prototype.hasOwnProperty.call(payload, "error_code"), "cheia error_code lipseste").toBe(
      false,
    );

    const r = await post(request, payload);
    expect(r.status(), "codul HTTP este cel de totdeauna").toBe(202);
    expect(await r.json(), "corpul spune statusul stocat").toEqual({
      order_id: orderId,
      status: "partial",
      lines: 2,
    });

    const d = await draftState(request, orderId);
    // 1. CODUL ESTE STOCAT PE CIORNA, nu null.
    expect(d.error_code, "codul bratului anchor_unknown, pe ciorna").toBe("unreadable_document");
    // 2. STATUSUL NU SE MUTA.
    expect(d.status, "statusul ramane partial").toBe("partial");
    // 3. VERDICTUL NOSTRU ESTE CEL DE INAINTE.
    expect(d.platform_error_code, "verdictul nostru, neschimbat").toBe("unreadable_document");
    expect(d.platform_arm, "bratul, neschimbat").toBe("anchor_unknown");
    expect(d.error_code, "acelasi cod ca platform_error_code").toBe(d.platform_error_code);
    expect(d.prices_include_vat, "steagul necunoscut este stocat null").toBeNull();
    expect(d.lines, "liniile raman, ele sunt motivul pentru care partial exista").toHaveLength(2);

    // CINE CITESTE NUMAI CIORNA VEDE DE CE: propozitia codului, in romana.
    const row = await draftRow(page, orderId);
    await expect(row).toHaveAttribute("data-status", "partial");
    const sentence = row.getByTestId("draft-error-sentence");
    await expect(sentence).toHaveAttribute("data-error-code", "unreadable_document");
    await expect(sentence).toHaveText(EXTRACTION_ERROR_LABEL.unreadable_document);
    await expect(row).not.toContainText("unreadable_document");
  });

  test("2. CONTROLUL: acelasi document cu steagul CUNOSCUT primeste reconciliation_failed exact ca inainte", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f8-known");

    const r = await post(request, digitalPartial(orderId, false, MISSING_LINES()));
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "partial", lines: 2 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("partial");
    expect(d.error_code, "codul de inainte, neschimbat").toBe("reconciliation_failed");
    expect(d.platform_error_code).toBe("reconciliation_failed");
    expect(d.platform_arm).toBe("line_sum_missed");
    expect(d.lines).toHaveLength(2);
  });

  test("3. CONTROLUL: steagul necunoscut si liniile care SE potrivesc cu un total: niciun cod inventat", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f8-match");

    const r = await post(request, digitalPartial(orderId, null, MATCHING_LINES()));
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "partial", lines: 2 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("partial");
    expect(d.error_code, "liniile se potrivesc, deci nu exista niciun cod de furnizat").toBeNull();
    expect(d.platform_error_code).toBeNull();
    expect(d.platform_arm).toBeNull();
    expect(d.lines).toHaveLength(2);

    const row = await draftRow(page, orderId);
    await expect(row.getByTestId("draft-error-sentence")).toHaveCount(0);
  });
});
