import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";
import { DERIVED_PARTIAL_NOTICE } from "@/lib/data/extraction-types";

// extraction-derived-line-routes-partial.spec - linia de acceptanta a cardului
// P3-80, constatarea F6 a lui Ivan, citata in termeni:
//
//   "F6 `line_total_source` = derived routes the document to partial by itself,
//    in our reconciliation."
//
// CE AFIRMA. Un payload `extracted`, fara error_code, cu cel putin o linie al
// carei total a fost CALCULAT de cititor (`derived`), este stocat `partial`, pe
// orice sursa, cu liniile pastrate si fara cod inventat, iar mutarea este scrisa
// in platform_derived_partial si se vede pe ecran. Nimic altceva nu se muta: un
// payload cu error_code-ul lui ramane exact cum a sosit (R-190), iar un `failed`
// al reconcilierii noastre nu se inmoaie.
//
// CODUL HTTP SE AFIRMA PRIN VALOARE. Fiecare caz scrie codul pe care ruta il
// dadea si inainte de acest card pentru exact acel payload: 202 la prima sosire,
// 200 la a doua. Corpul spune statusul STOCAT, ca la EXT-16.

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
 *  Acelasi drum ca in extraction-line-math-consistency.spec. */
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

type Source = "printed" | "derived" | "Derived" | undefined;

/** O linie consistenta cu ea insasi, ca aritmetica P3-75 sa nu spuna nimic aici.
 *  `source` undefined inseamna ca cheia nu se trimite deloc. */
function line(name: string, quantity: number, unitPrice: number, source: Source) {
  return {
    product_name: `${name} F6 ${RUN}`,
    quantity,
    unit: "pcs",
    unit_raw: "buc",
    unit_price: unitPrice,
    line_total: Math.round(quantity * unitPrice * 100) / 100,
    currency: "MDL",
    currency_raw: "lei",
    category: null,
    category_raw: null,
    ...(source === undefined ? {} : { line_total_source: source }),
  };
}

/** Un antet SANATOS si o suma a liniilor care se potriveste EXACT: 30 + 50 = 80,
 *  80 + 16 = 96, 80 x 20% = 16. Pe o scanare reconcilierea noastra trece, deci
 *  singurul lucru care poate muta statusul este sursa totalului. */
function body(
  orderId: string,
  shape: { status: string; document_source: string; error_code: string | null },
  sources: [Source, Source],
  subtotal = 80,
) {
  return {
    order_id: orderId,
    ...shape,
    reason: shape.error_code === null ? null : "TEST F6",
    supplier_name: `TEST Furnizor F6 ${RUN}`,
    order_date: "2026-09-18",
    prices_include_vat: false,
    vat_rate: 20,
    currency: "MDL",
    currency_raw: "lei",
    subtotal,
    vat_amount: Math.round(subtotal * 20) / 100,
    document_total: Math.round(subtotal * 120) / 100,
    lines: [line("Linie 1", 3, 10, sources[0]), line("Linie 2", 2, 25, sources[1])],
  };
}

test.describe("F6: un total de linie calculat trimite documentul in partial", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. F6: DIGITAL si SCANARE, extracted fara cod, o linie derived: stocat partial, liniile pastrate, motivul pe ecran", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    for (const source of ["digital", "scan"] as const) {
      const label = `${source}/extracted`;
      const orderId = await uploadForExtraction(page, request, `f6-${source}`);
      const payload = body(
        orderId,
        { status: "extracted", document_source: source, error_code: null },
        ["printed", "derived"],
      );

      const r = await post(request, payload);
      expect(r.status(), `${label}: codul HTTP este cel de totdeauna`).toBe(202);
      expect(await r.json(), `${label}: corpul spune statusul stocat`).toEqual({
        order_id: orderId,
        status: "partial",
        lines: 2,
      });

      const d = await draftState(request, orderId);
      expect(d.status, label).toBe("partial");
      expect(d.error_code, `${label}: niciun cod inventat`).toBeNull();
      expect(d.platform_derived_partial, `${label}: mutarea este scrisa`).toBe(true);
      // Verdictul de reconciliere NU este atins: suma se potriveste.
      expect(d.platform_error_code, label).toBeNull();
      expect(d.platform_arm, label).toBeNull();
      expect(d.lines, `${label}: ambele linii pastrate`).toHaveLength(2);
      expect(d.lines[1]!.line_total_source, label).toBe("derived");

      const row = await draftRow(page, orderId);
      await expect(row).toHaveAttribute("data-status", "partial");
      await expect(row.getByTestId("draft-derived-partial")).toHaveText(DERIVED_PARTIAL_NOTICE);

      // A DOUA SOSIRE: tot 200, ca inainte de acest card, si tot partial.
      const again = await post(request, payload);
      expect(again.status(), `${label}: duplicatul ramane 200`).toBe(200);
      expect(await again.json(), label).toEqual({ order_id: orderId, status: "partial", lines: 2 });
    }
  });

  test("2. CONTROLUL: toate liniile printed, sursa absenta, sau o valoare necunoscuta: stocat exact ca inainte, extracted", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    const cases: { tag: string; source: string; sources: [Source, Source] }[] = [
      { tag: "f6-printed-digital", source: "digital", sources: ["printed", "printed"] },
      { tag: "f6-printed-scan", source: "scan", sources: ["printed", "printed"] },
      { tag: "f6-absent", source: "digital", sources: [undefined, undefined] },
      // Numai sirul exact `derived` muta ceva: o valoare necunoscuta este stocata
      // asa cum a sosit si nu este ghicita.
      { tag: "f6-unknown", source: "digital", sources: ["printed", "Derived"] },
    ];

    for (const c of cases) {
      const orderId = await uploadForExtraction(page, request, c.tag);
      const r = await post(
        request,
        body(orderId, { status: "extracted", document_source: c.source, error_code: null }, c.sources),
      );
      expect(r.status(), c.tag).toBe(202);
      expect(await r.json(), c.tag).toEqual({ order_id: orderId, status: "extracted", lines: 2 });

      const d = await draftState(request, orderId);
      expect(d.status, c.tag).toBe("extracted");
      expect(d.error_code, c.tag).toBeNull();
      expect(d.platform_derived_partial, `${c.tag}: regula a rulat si nu a mutat nimic`).toBe(false);
      expect(d.lines, c.tag).toHaveLength(2);

      const row = await draftRow(page, orderId);
      await expect(row).toHaveAttribute("data-status", "extracted");
      await expect(row.getByTestId("draft-derived-partial")).toHaveCount(0);
    }
  });

  test("3. R-190: un payload cu error_code-ul LUI ramane exact cum a sosit, chiar cu o linie derived", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    const shapes = [
      { status: "partial", document_source: "digital", error_code: "extraction_failed" },
      { status: "partial", document_source: "scan", error_code: "extraction_failed" },
      { status: "failed", document_source: "digital", error_code: "extraction_failed" },
    ];

    for (const shape of shapes) {
      const label = `${shape.document_source}/${shape.status} cu cod`;
      const orderId = await uploadForExtraction(page, request, `f6-code-${shape.document_source}-${shape.status}`);
      const r = await post(request, body(orderId, shape, ["printed", "derived"]));
      expect(r.status(), label).toBe(202);
      expect(await r.json(), label).toEqual({ order_id: orderId, status: shape.status, lines: 2 });

      const d = await draftState(request, orderId);
      expect(d.status, `${label}: statusul trimis`).toBe(shape.status);
      expect(d.error_code, `${label}: codul trimis`).toBe(shape.error_code);
      expect(d.platform_derived_partial, `${label}: nimic mutat`).toBe(false);

      const row = await draftRow(page, orderId);
      await expect(row.getByTestId("draft-derived-partial")).toHaveCount(0);
    }
  });

  test("4. un failed al reconcilierii NOASTRE nu se inmoaie in partial de o linie derived", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f6-scan-missed");

    // Liniile fac 80 si subtotalul tiparit este 100: suma rateaza, reperul este
    // cunoscut, antetul este sanatos, deci bratul line_sum_missed si `failed`,
    // exact ca inainte de acest card, cu liniile scoase de EXT-15.
    const r = await post(
      request,
      body(orderId, { status: "extracted", document_source: "scan", error_code: null }, ["printed", "derived"], 100),
    );
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "failed", lines: 0 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("reconciliation_failed");
    expect(d.platform_arm).toBe("line_sum_missed");
    expect(d.platform_derived_partial, "regula a rulat si nu a mutat nimic").toBe(false);
    expect(d.lines).toHaveLength(0);
  });
});
