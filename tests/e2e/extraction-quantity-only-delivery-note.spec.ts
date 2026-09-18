import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { QUANTITIES_ONLY_NOTICE } from "@/lib/data/extraction-types";

// extraction-quantity-only-delivery-note.spec - linia de acceptanta a cardului
// P3-82, constatarea F17 a lui Ivan, asa cum a hotarat-o Max (hotararea R-208):
//
//   "a readable delivery note (aviz) with line items and quantities but no
//    prices and no total is ACCEPTED, not failed."
//
// CE AFIRMA. O scanare `extracted`, fara error_code, cu cantitati pe fiecare
// linie, fara niciun unit_price si niciun line_total, si fara subtotal si fara
// document_total, este stocata `extracted`, niciodata `failed` si niciodata
// `unreadable_document`, cu fiecare linie pastrata, iar ecranul de verificare
// arata nota lui Max. CONTROALELE: o scanare careia ii lipsesc NUMAI UNELE
// totaluri, sau care tipareste un total in antet, se refuza exact ca inainte,
// pe bratul line_total_missing, si nu arata nota.
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
 *  Acelasi drum ca in extraction-derived-line-routes-partial.spec. */
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

/** O linie de aviz: denumire si cantitate. Pretul si totalul sunt null, sau
 *  totalul este dat, pentru controale. */
function line(name: string, quantity: number, lineTotal: number | null = null) {
  return {
    product_name: `${name} F17 ${RUN}`,
    quantity,
    unit: "pcs",
    unit_raw: "buc",
    unit_price: lineTotal === null ? null : Math.round((lineTotal / quantity) * 100) / 100,
    line_total: lineTotal,
    currency: null,
    currency_raw: null,
    category: null,
    category_raw: null,
  };
}

/** O scanare `extracted` fara cod. Antetul lipseste cu totul daca nu se dau
 *  cifre: niciun subtotal, niciun total, nicio TVA. */
function scanBody(
  orderId: string,
  lines: ReturnType<typeof line>[],
  header: { subtotal: number; vat_amount: number; document_total: number } | null = null,
) {
  return {
    order_id: orderId,
    status: "extracted",
    document_source: "scan",
    error_code: null,
    reason: null,
    supplier_name: `TEST Furnizor F17 ${RUN}`,
    order_date: "2026-09-18",
    prices_include_vat: header === null ? null : false,
    vat_rate: header === null ? null : 20,
    currency: null,
    currency_raw: null,
    subtotal: header?.subtotal ?? null,
    vat_amount: header?.vat_amount ?? null,
    document_total: header?.document_total ?? null,
    lines,
  };
}

test.describe("F17: un aviz cu cantitati si fara preturi este acceptat, nu refuzat", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. F17: scanare, fiecare linie fara pret si fara total, niciun total in antet: acceptat, liniile pastrate, nota pe ecran", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f17-aviz");

    const payload = scanBody(orderId, [line("Teava", 12), line("Cot", 30), line("Robinet", 4)]);
    const r = await post(request, payload);
    expect(r.status(), "codul HTTP este cel de totdeauna").toBe(202);
    expect(await r.json(), "corpul spune statusul stocat").toEqual({
      order_id: orderId,
      status: "extracted",
      lines: 3,
    });

    const d = await draftState(request, orderId);
    expect(d.status, "acceptat, nu refuzat").toBe("extracted");
    expect(d.status).not.toBe("failed");
    expect(d.error_code, "niciun cod, si deci nu unreadable_document").toBeNull();
    // Nu este un refuz, deci verdictul nostru nu scrie niciun brat.
    expect(d.platform_error_code).toBeNull();
    expect(d.platform_arm).toBeNull();

    expect(d.lines, "fiecare linie pastrata").toHaveLength(3);
    expect(d.lines.map((l) => Number(l.quantity))).toEqual([12, 30, 4]);
    for (const l of d.lines) {
      expect(l.unit_price, "niciun pret inventat").toBeNull();
      expect(l.line_total, "niciun total inventat").toBeNull();
    }

    const row = await draftRow(page, orderId);
    await expect(row).toHaveAttribute("data-status", "extracted");
    await expect(row).toHaveAttribute("data-lines", "3");
    await expect(row.getByTestId("draft-quantities-only")).toHaveText(
      "Document fără prețuri: cantitățile sunt citite, prețurile se completează din factură",
    );
    // Aceeasi propozitie ca in constanta, ca ecranul si proba sa nu poata diverge.
    await expect(row.getByTestId("draft-quantities-only")).toHaveText(QUANTITIES_ONLY_NOTICE);
    await expect(row.getByTestId("draft-error-sentence")).toHaveCount(0);
  });

  test("2. CONTROLUL: NUMAI UNELE linii fara total, niciun total in antet: refuzat exact ca inainte, line_total_missing", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f17-some");

    const r = await post(request, scanBody(orderId, [line("Teava", 12, 120), line("Cot", 30)]));
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "failed", lines: 0 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("unreadable_document");
    expect(d.platform_arm).toBe("line_total_missing");
    expect(d.lines).toHaveLength(0);

    const row = await draftRow(page, orderId);
    await expect(row).toHaveAttribute("data-status", "failed");
    await expect(row.getByTestId("draft-quantities-only")).toHaveCount(0);
  });

  test("3. CONTROLUL: un total in antet si o linie fara total, sau toate fara total: refuzat exact ca inainte, line_total_missing", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    // Antet sanatos: 80 + 16 = 96, 80 x 20% = 16.
    const header = { subtotal: 80, vat_amount: 16, document_total: 96 };
    const cases: { tag: string; lines: ReturnType<typeof line>[] }[] = [
      { tag: "f17-header-one", lines: [line("Teava", 3, 30), line("Cot", 2)] },
      // F17 spune "no prices AND no total". Un total tiparit in antet scoate
      // documentul din forma, chiar daca niciuna dintre linii nu are total.
      { tag: "f17-header-all", lines: [line("Teava", 3), line("Cot", 2)] },
    ];

    for (const c of cases) {
      const orderId = await uploadForExtraction(page, request, c.tag);
      const r = await post(request, scanBody(orderId, c.lines, header));
      expect(r.status(), c.tag).toBe(202);
      expect(await r.json(), c.tag).toEqual({ order_id: orderId, status: "failed", lines: 0 });

      const d = await draftState(request, orderId);
      expect(d.status, c.tag).toBe("failed");
      expect(d.error_code, c.tag).toBe("unreadable_document");
      expect(d.platform_arm, c.tag).toBe("line_total_missing");
      expect(d.lines, c.tag).toHaveLength(0);

      const row = await draftRow(page, orderId);
      await expect(row.getByTestId("draft-quantities-only")).toHaveCount(0);
    }
  });
});
