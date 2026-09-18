import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// extraction-key-allowlist.spec - linia de acceptanta a cardului P3-76,
// constatarea F9 a lui Ivan, citata in termeni:
//
//   "F9 the validator gets an allowlist: unknown keys are logged and warned
//    (Ivan's 'decide': we take warn, never refuse, so nothing Andre sends today
//    starts failing). A card note records the choice."
//
// CE AFIRMA ACEST SPEC: JUMATATEA "never refuse". Un payload cu chei pe care nu
// le cunoastem este raspuns si stocat EXACT ca acelasi payload fara ele, iar un
// payload refuzat ramane refuzat cu acelasi text. Avertismentul insusi se scrie
// in jurnalul serverului, pe care un spec nu il poate citi; el este dovedit de
// `npm run check:callback-keys`, cu un jurnal fals, in pasul lui din `quality`.
//
// CIORNELE INTRA PRIN BANDA DE EXTRAGERE, ca in
// extraction-webhook-number-coercion.spec, iar payload-ul se declara DIGITAL din
// acelasi motiv scris acolo: cazurile sunt despre ce se raspunde si ce se
// stocheaza, nu despre reconciliere.

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

/** Ce scrie callback-ul pe ciorna. Fara order_id, callback_at si campurile
 *  incarcarii, care difera intre doua ciorne prin constructie. */
const DRAFT_FIELDS = [
  "status",
  "error_code",
  "reason",
  "supplier_name",
  "order_date",
  "subtotal",
  "vat_amount",
  "document_total",
  "prices_include_vat",
  "vat_rate",
  "currency",
  "currency_raw",
  "meta",
  "page_count",
  "document_source",
  "order_ref",
  "order_ref_series",
  "platform_error_code",
  "platform_arm",
  "platform_line_math_failed",
] as const;

const LINE_FIELDS = [
  "line_no",
  "product_name",
  "quantity",
  "unit",
  "unit_raw",
  "unit_price",
  "line_total",
  "currency",
  "currency_raw",
  "category",
  "category_raw",
  "platform_math_outcome",
  "platform_math_diff",
] as const;

function stored(d: Record<string, unknown> & { lines: Record<string, unknown>[] }) {
  return {
    draft: Object.fromEntries(DRAFT_FIELDS.map((f) => [f, d[f] ?? null])),
    lines: d.lines.map((l) => Object.fromEntries(LINE_FIELDS.map((f) => [f, l[f] ?? null]))),
  };
}

/** Un payload digital, extracted, numai cu cheile pe care ruta le citeste. */
function knownBody(orderId: string) {
  return {
    order_id: orderId,
    status: "extracted",
    document_source: "digital",
    error_code: null,
    reason: null,
    supplier_name: `TEST Furnizor F9 ${RUN}`,
    order_date: "2026-09-18",
    subtotal: 1000,
    vat_amount: 200,
    document_total: 1200,
    prices_include_vat: false,
    vat_rate: 20,
    currency: "MDL",
    currency_raw: "lei",
    order_ref: `F9-${RUN}`,
    order_ref_series: "TG",
    _meta: { page_count: 1, model: "test" },
    lines: [
      {
        product_name: `Tigla metalica F9 ${RUN}`,
        quantity: 10,
        unit: "m2",
        unit_raw: "mp",
        unit_price: 100,
        line_total: 1000,
        currency: "MDL",
        currency_raw: "lei",
        category: null,
        category_raw: "Invelitori",
      },
    ],
  };
}

/** Acelasi payload, plus chei necunoscute sus si pe linie, plus cele cinci ale
 *  lui EXT-34. `supplier` si `pages` sunt cheile pe care expeditorul le trimite
 *  astazi si pe care ruta nu le citeste. */
function withUnknownKeys(orderId: string) {
  const b = knownBody(orderId);
  return {
    ...b,
    supplier: "TEST Silvamat",
    pages: 1,
    cheie_noua_f9: { orice: [1, 2, 3] },
    document_type: "invoice",
    client_ref: "C-F9",
    lines: b.lines.map((l) => ({
      ...l,
      supplier_code: "S-F9",
      description: "descriere",
      line_total_source: "printed",
      camp_linie_nou_f9: true,
    })),
  };
}

test.describe("F9: o cheie necunoscuta in callback este avertizata, niciodata refuzata", () => {
  test.describe.configure({ timeout: 120_000 });

  test("1. chei necunoscute sus si pe linie: acelasi 202, acelasi raspuns, aceleasi valori stocate", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const controlId = await uploadForExtraction(page, request, "f9-control");
    const unknownId = await uploadForExtraction(page, request, "f9-chei");

    const control = await post(request, knownBody(controlId));
    const unknown = await post(request, withUnknownKeys(unknownId));

    // ACCEPTAT, CU ACELASI COD SI ACELASI CORP. Numai order_id-ul difera, si el
    // este al fiecarei ciorne.
    expect(control.status()).toBe(202);
    expect(unknown.status()).toBe(202);
    expect(await control.json()).toEqual({ order_id: controlId, status: "extracted", lines: 1 });
    expect(await unknown.json()).toEqual({ order_id: unknownId, status: "extracted", lines: 1 });

    // CE S-A STOCAT ESTE ACELASI LUCRU, camp cu camp. Nicio cheie necunoscuta nu
    // ajunge intr-o coloana, si nimic din ce ruta decide nu se misca.
    const a = stored(await draftState(request, controlId));
    const b = stored(await draftState(request, unknownId));
    expect(b).toEqual(a);
    expect(b.draft.status).toBe("extracted");
    expect(b.lines).toHaveLength(1);
  });

  test("2. un payload refuzat ramane refuzat, cu acelasi text, si cu o cheie necunoscuta in plus", async ({
    request,
  }) => {
    // STATUSUL ESTE VERIFICAT INAINTEA ORICAREI CITIRI DIN BAZA, deci nu este
    // nevoie de o ciorna: raspunsul este acelasi pentru orice uuid.
    const orderId = "00000000-0000-4000-8000-00000000f9f9";
    const base = { ...knownBody(orderId), status: "nu-exista" };

    const plain = await post(request, base);
    const extra = await post(request, { ...base, cheie_noua_f9: 1 });

    expect(plain.status()).toBe(400);
    expect(extra.status()).toBe(400);
    expect(await plain.json()).toEqual({ error: "status in afara multimii" });
    expect(await extra.json()).toEqual({ error: "status in afara multimii" });
  });
});
