import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// extraction-line-math-consistency.spec - linia de acceptanta a cardului
// P3-75, constatarea F7 a lui Ivan, citata in termeni:
//
//   "F7 a line whose line_total is right but quantity x unit price disagrees is
//    caught, on every shape."
//
// CE AFIRMA. Fiecare linie a fiecarui payload este verificata pe ea insasi,
// cantitate ori pret unitar fata de totalul liniei, iar rezultatul se SCRIE in
// coloanele noastre (platform_math_outcome, platform_math_diff pe linie si
// platform_line_math_failed pe ciorna). Nimic altceva nu se schimba: nici
// statusul, nici codul, nici liniile pastrate, nici raspunsul HTTP.
//
// RASPUNSUL HTTP SE AFIRMA PRIN VALOARE, NU PRIN "ACELASI CA INAINTE". Fiecare
// caz scrie codul si corpul pe care ruta le dadea si inainte de acest card
// pentru exact acel payload; un raspuns schimbat de aceasta verificare ar pica
// aici, pe numele cazului.
//
// CAZUL 1 ESTE CONSTATAREA INSASI. Doua linii gresite in sens invers cu aceeasi
// suma: tabelul se aduna la subtotal, antetul se aduna cu el insusi, deci
// reconcilierea trece si documentul ramane `extracted`. Inainte de acest card
// nimic nu vedea cele doua linii.

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
 *  Acelasi drum ca in extraction-webhook-number-coercion.spec. */
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

type Line = { quantity: number | null; unit_price: number | null; line_total: number | null };

function line(name: string, l: Line) {
  return {
    product_name: `${name} F7 ${RUN}`,
    unit: "pcs",
    unit_raw: "buc",
    currency: "MDL",
    currency_raw: "lei",
    category: null,
    category_raw: null,
    ...l,
  };
}

/** Un antet SANATOS: subtotal + TVA = total si subtotal * 20% = TVA, deci
 *  verificarile EXT-18 trec si singurul lucru care poate decide este suma
 *  liniilor. */
function body(
  orderId: string,
  shape: { status: string; document_source: string; error_code: string | null },
  header: { subtotal: number; vat_amount: number; document_total: number },
  lines: Line[],
) {
  return {
    order_id: orderId,
    ...shape,
    reason: shape.error_code === null ? null : "TEST F7",
    supplier_name: `TEST Furnizor F7 ${RUN}`,
    order_date: "2026-09-18",
    prices_include_vat: false,
    vat_rate: 20,
    currency: "MDL",
    currency_raw: "lei",
    ...header,
    lines: lines.map((l, i) => line(`Linie ${i + 1}`, l)),
  };
}

// 3 x 10 = 30, si linia spune 40. 2 x 25 = 50, si linia spune 40. Suma este 80
// in amandoua cazurile, deci tabelul se aduna la subtotal si greselile se anuleaza.
const WRONG_UP: Line = { quantity: 3, unit_price: 10, line_total: 40 };
const WRONG_DOWN: Line = { quantity: 2, unit_price: 25, line_total: 40 };
const RIGHT_A: Line = { quantity: 3, unit_price: 10, line_total: 30 };
const RIGHT_B: Line = { quantity: 2, unit_price: 25, line_total: 50 };
const HEADER_80 = { subtotal: 80, vat_amount: 16, document_total: 96 };

function expectLine(l: Record<string, unknown>, outcome: string | null, diff: number | null, label: string) {
  expect(l.platform_math_outcome, `${label}: rezultat`).toBe(outcome);
  if (diff === null) expect(l.platform_math_diff, `${label}: diferenta`).toBeNull();
  else expect(Number(l.platform_math_diff), `${label}: diferenta`).toBe(diff);
}

test.describe("F7: aritmetica fiecarei linii, pe orice forma", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. F7: o SCANARE extracted cu doua linii gresite care se anuleaza ramane extracted si AMBELE linii sunt marcate", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f7-scan");

    const r = await post(
      request,
      body(orderId, { status: "extracted", document_source: "scan", error_code: null }, HEADER_80, [
        WRONG_UP,
        WRONG_DOWN,
      ]),
    );
    // Reconcilierea trece (80 fata de 80), deci raspunsul este cel de totdeauna
    // pentru o scanare curata.
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "extracted", lines: 2 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.error_code).toBeNull();
    // Verdictul de reconciliere NU este atins: suma se potriveste.
    expect(d.platform_error_code).toBeNull();
    expect(d.platform_arm).toBeNull();
    expect(d.platform_line_math_failed).toBe(2);
    expect(d.lines).toHaveLength(2);
    expectLine(d.lines[0]!, "failed", 10, "linia 1");
    expectLine(d.lines[1]!, "failed", 10, "linia 2");
    // Cifrele expeditorului sunt stocate asa cum au sosit, neatinse.
    expect(Number(d.lines[0]!.line_total)).toBe(40);
    expect(Number(d.lines[1]!.line_total)).toBe(40);
  });

  test("2. F7: aceeasi linie gresita este marcata pe DIGITAL extracted, partial cu cod si failed cu cod, iar statusul si codul sunt cele trimise", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());

    const shapes = [
      { status: "extracted", document_source: "digital", error_code: null },
      { status: "partial", document_source: "digital", error_code: "extraction_failed" },
      { status: "failed", document_source: "digital", error_code: "extraction_failed" },
    ];

    for (const shape of shapes) {
      const label = `${shape.document_source}/${shape.status}`;
      const orderId = await uploadForExtraction(page, request, `f7-${shape.status}`);
      // Suma 70 nu se potriveste cu 80, dar calea digitala nu este reconciliata
      // (EXT-16), deci nimic nu se schimba din cauza ei. Numai linia 1 este gresita.
      const r = await post(request, body(orderId, shape, HEADER_80, [WRONG_UP, RIGHT_A]));
      expect(r.status(), label).toBe(202);
      expect(await r.json(), label).toEqual({ order_id: orderId, status: shape.status, lines: 2 });

      const d = await draftState(request, orderId);
      expect(d.status, label).toBe(shape.status);
      expect(d.error_code, label).toBe(shape.error_code);
      expect(d.platform_error_code, label).toBeNull();
      expect(d.platform_line_math_failed, label).toBe(1);
      expect(d.lines, label).toHaveLength(2);
      expectLine(d.lines[0]!, "failed", 10, `${label} linia 1`);
      expectLine(d.lines[1]!, "passed", 0, `${label} linia 2`);
    }
  });

  test("3. F7: o scanare pe care reconcilierea o stocheaza failed FARA linii pastreaza numarul pe ciorna", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f7-dropped");

    // 30 + 40 = 70 fata de un subtotal de 80: suma rateaza, reperul este
    // cunoscut, antetul este sanatos, deci bratul line_sum_missed, exact ca
    // inainte de acest card. Linia 2 este si gresita pe ea insasi (2 x 25 = 50).
    const r = await post(
      request,
      body(orderId, { status: "extracted", document_source: "scan", error_code: null }, HEADER_80, [
        RIGHT_A,
        WRONG_DOWN,
      ]),
    );
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "failed", lines: 0 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("failed");
    expect(d.error_code).toBe("reconciliation_failed");
    expect(d.platform_arm).toBe("line_sum_missed");
    expect(d.lines).toHaveLength(0);
    // Liniile nu mai exista, iar constatarea a supravietuit pe document.
    expect(d.platform_line_math_failed).toBe(1);
  });

  test("4. CONTROLUL: un payload in care fiecare linie se potriveste NU este marcat, inclusiv o linie in toleranta de rotunjire", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f7-clean");

    // 1000 x 1.23 = 1230.00, iar linia spune 1234.50: pretul adevarat era 1.2345
    // si hartia l-a tiparit rotunjit. Diferenta 4.50 este sub toleranta
    // 0.005 x 1000 = 5.00, deci trece. Antetul: 1284.50 + 256.90 = 1541.40.
    const r = await post(
      request,
      body(
        orderId,
        { status: "extracted", document_source: "scan", error_code: null },
        { subtotal: 1284.5, vat_amount: 256.9, document_total: 1541.4 },
        [{ quantity: 1000, unit_price: 1.23, line_total: 1234.5 }, RIGHT_B],
      ),
    );
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "extracted", lines: 2 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expect(d.error_code).toBeNull();
    expect(d.platform_line_math_failed).toBe(0);
    expectLine(d.lines[0]!, "passed", 4.5, "linia rotunjita");
    expectLine(d.lines[1]!, "passed", 0, "linia exacta");
  });

  test("5. F7: o linie fara pret unitar este not_run, nici trecuta nici picata, iar un document fara nicio linie verificabila are numarul null", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f7-notrun");

    const r = await post(
      request,
      body(orderId, { status: "extracted", document_source: "digital", error_code: null }, HEADER_80, [
        { quantity: 2, unit_price: null, line_total: 80 },
      ]),
    );
    expect(r.status()).toBe(202);
    expect(await r.json()).toEqual({ order_id: orderId, status: "extracted", lines: 1 });

    const d = await draftState(request, orderId);
    expect(d.status).toBe("extracted");
    expectLine(d.lines[0]!, "not_run", null, "linia fara pret");
    expect(d.lines[0]!.platform_math_outcome).not.toBe("passed");
    // Zero ar spune "am verificat si totul se potriveste". Nu s-a verificat nimic.
    expect(d.platform_line_math_failed).toBeNull();
  });
});
