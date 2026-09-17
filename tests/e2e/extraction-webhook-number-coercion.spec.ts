import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// extraction-webhook-number-coercion.spec - linia de acceptanta a cardului
// P3-74, constatarea F2 a lui Ivan, citata in termeni:
//
//   "F2 number coercion in the extraction webhook route: \"\" and booleans must
//    arrive as null, not 0. Named tests that \"\" and true arrive as null."
//
// CE AFIRMA, SI DE CE NU PUTEA FI AFIRMAT DE CAZUL 8 DIN extraction.spec. Cazul
// acela trimite null in fiecare camp si cere null inapoi, ceea ce era adevarat si
// inainte de acest card: `num()` returna null pe null din prima linie. Defectul
// era pe VALORILE CARE AJUNG LA Number(): Number("") este 0, Number(true) este 1
// si Number(false) este 0, toate trei finite, deci toate trei se stocau ca si cum
// ar fi fost citite din document. Nimic nu trimitea acele valori pana aici.
//
// UN ZERO FALS NU SE DEOSEBESTE DE UN ZERO CITIT, si acesta este tot cardul.
// Operatorul care confirma ciorna vede 0 in dreptul subtotalului si nu are cum sa
// afle daca hartia spunea zero sau daca extractorul a trimis un camp gol.
//
// CIORNELE INTRA PRIN BANDA DE EXTRAGERE, ca in review.spec si in
// extraction-meta-shown.spec: fisierul se incarca fara ca vreo comanda sa
// existe, iar callback-ul il trimite specul direct catre endpointul aplicatiei,
// ca fiecare caz sa controleze exact ce ajunge in fiecare camp.
//
// PAYLOAD-UL SE DECLARA DIGITAL, acelasi motiv scris in capul lui `callbackBody`
// din extraction.spec: cazurile de aici sunt despre CE SE STOCHEAZA, iar o
// scanare ar trece prin reconciliere si ar deveni pe tacute un al doilea test de
// aritmetica, care ar cadea pentru un motiv pe care acest card nu il atinge.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CALLBACK = "/api/extraction/callback";
const UPLOAD = "/incarca-comanda";
const MACHINE_RETRIES = 2;

/** Un PDF minim: numarul lui de pagini nu conteaza pentru niciun caz de aici. */
function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

/** Incarca un document pe banda de extragere si intoarce order_id-ul trimis. */
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

/** Ciorna si liniile ei, citite pe acelasi drum al masinii pe care il foloseste
 *  si cazul 8 din extraction.spec: ce s-a SCRIS, nu ce arata un ecran. */
async function draftState(request: APIRequestContext, orderId: string) {
  const r = await request.get(`${CALLBACK}?order_id=${orderId}`, {
    headers: { "x-rc-callback-secret": MAKE_CALLBACK_SECRET },
    maxRetries: MACHINE_RETRIES,
  });
  expect(r.status()).toBe(200);
  return (await r.json()) as Record<string, unknown> & { lines: Record<string, unknown>[] };
}

/** Antetul contractului, cu cifrele scoase: fiecare caz isi pune ale lui.
 *
 *  DIGITAL SI extracted, deci `scanVerdict` este null si nimic din reconciliere
 *  nu se atinge de ce se stocheaza. */
function bodyWith(
  orderId: string,
  document: Record<string, unknown>,
  line: Record<string, unknown>,
) {
  return {
    order_id: orderId,
    status: "extracted",
    document_source: "digital",
    error_code: null,
    reason: null,
    supplier_name: `TEST Furnizor F2 ${RUN}`,
    order_date: "2026-09-17",
    prices_include_vat: false,
    currency: "MDL",
    currency_raw: "lei",
    ...document,
    lines: [
      {
        product_name: `Tigla metalica F2 ${RUN}`,
        unit: "m2",
        unit_raw: "mp",
        currency: "MDL",
        currency_raw: "lei",
        category: null,
        category_raw: "Invelitori",
        ...line,
      },
    ],
  };
}

const DOCUMENT_NUMERIC = ["subtotal", "vat_amount", "document_total", "vat_rate"] as const;
const LINE_NUMERIC = ["quantity", "unit_price", "line_total"] as const;

test.describe("F2: cifrele callback-ului de extragere", () => {
  test.describe.configure({ timeout: 120_000 });

  test('1. F2: un sir GOL in fiecare camp numeric se stocheaza null, si in mod explicit NU 0', async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f2-gol");

    const r = await post(
      request,
      bodyWith(
        orderId,
        { subtotal: "", vat_amount: "", document_total: "", vat_rate: "" },
        { quantity: "", unit_price: "", line_total: "" },
      ),
    );
    // ACCEPTAT, SI ASTA ESTE JUMATATEA CARE CONTEAZA PENTRU ANDRE. Cardul nu
    // adauga niciun refuz: payload-ul care era acceptat inainte este acceptat si
    // acum, cu acelasi cod, si numai ce se STOCHEAZA se schimba.
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    for (const f of DOCUMENT_NUMERIC) {
      expect(d[f], `camp document ${f}`).toBeNull();
      expect(d[f], `camp document ${f}`).not.toBe(0);
      expect(d[f], `camp document ${f}`).not.toBe("0");
    }
    expect(d.lines).toHaveLength(1);
    const l = d.lines[0]!;
    for (const f of LINE_NUMERIC) {
      expect(l[f], `camp linie ${f}`).toBeNull();
      expect(l[f], `camp linie ${f}`).not.toBe(0);
      expect(l[f], `camp linie ${f}`).not.toBe("0");
    }
  });

  test('2. F2: `true` si `false` in campurile numerice se stocheaza null, si NU 1 sau 0', async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f2-bool");

    const r = await post(
      request,
      bodyWith(
        orderId,
        // true pe doua, false pe doua: Number(true) este 1 si Number(false) este
        // 0, deci cele doua valori gresite sunt DIFERITE si un caz care ar trece
        // numai pentru una ar fi vizibil.
        { subtotal: true, vat_amount: false, document_total: true, vat_rate: false },
        { quantity: true, unit_price: false, line_total: true },
      ),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    for (const f of DOCUMENT_NUMERIC) {
      expect(d[f], `camp document ${f}`).toBeNull();
      expect(d[f], `camp document ${f}`).not.toBe(1);
      expect(d[f], `camp document ${f}`).not.toBe(0);
    }
    const l = d.lines[0]!;
    for (const f of LINE_NUMERIC) {
      expect(l[f], `camp linie ${f}`).toBeNull();
      expect(l[f], `camp linie ${f}`).not.toBe(1);
      expect(l[f], `camp linie ${f}`).not.toBe(0);
    }
    // `prices_include_vat` TRECE PRIN bool() SI NU PRIN num(), si un boolean
    // acolo este o valoare adevarata. Cardul nu are voie sa il atinga.
    expect(d.prices_include_vat).toBe(false);
  });

  test("3. CONTROLUL: cifrele adevarate trec in continuare, si un zero TRIMIS ANUME ramane zero", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    const orderId = await uploadForExtraction(page, request, "f2-control");

    const r = await post(
      request,
      bodyWith(
        orderId,
        {
          // Un numar, si un sir numeric NEGOL: a doua forma este cea in care
          // numeric() peste PostgREST intoarce valorile, iar o reparatie care ar
          // refuza-o ar sparge fiecare document care se citeste corect astazi.
          subtotal: "18450.00",
          vat_amount: 3690.0,
          document_total: 22140.0,
          // ZERO TRIMIS ANUME, CA NUMAR, RAMANE ZERO. Un document poate spune
          // zero, iar acest card nu are voie sa transforme o citire in absenta.
          vat_rate: 0,
        },
        { quantity: 240.5, unit_price: "76.72", line_total: 18452.36 },
      ),
    );
    expect(r.status()).toBe(202);

    const d = await draftState(request, orderId);
    expect(Number(d.subtotal)).toBe(18450);
    expect(Number(d.vat_amount)).toBe(3690);
    expect(Number(d.document_total)).toBe(22140);
    expect(d.vat_rate).not.toBeNull();
    expect(Number(d.vat_rate)).toBe(0);

    const l = d.lines[0]!;
    expect(Number(l.quantity)).toBe(240.5);
    expect(Number(l.unit_price)).toBe(76.72);
    expect(Number(l.line_total)).toBe(18452.36);
  });
});
