import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { MAKE_CALLBACK_SECRET, firedFor } from "./support/make";

// romanian-counts.spec - linia de acceptanta a cardului P3-98 pentru constatarea
// F12 a maturarii din 2026-09-22.
//
// CE AFIRMA. Cei sapte numaratori de pe ecranele CRM si de comenzi se acorda cu
// numarul lor dupa regula romaneasca CU TREI FORME, "20 de leaduri" si nu "20
// leaduri", exact ca numaratorii pe care i-a reparat P3-51:
//
//   Clienți (vederea Clienți)      "N client" / "N clienți" / "N de clienți"
//   Clienți (vederea Leaduri)      "N lead" / "N leaduri" / "N de leaduri"
//   Azi                            "N întârziat" / "N întârziați" / "N de întârziați"
//   Panoul de verificare           "N poziție citită" / ... / "N de poziții citite"
//   Fila Documente                 "cele N documente" / "cele N de documente"
//   Confirmarea comenzii manuale   "cu N poziție" / ... / "cu N de poziții"
//   Confirmarea de pe Încarcă      "N poziție." / ... / "N de poziții."
//
// SI CE NU SE ATINGE: randul "N de sunat" de pe Azi. "de sunat" este o expresie
// verbala, nu un substantiv numarat, deci regula celor trei forme nu i se aplica
// si el ramane cum a fost. Cazul de pe Azi il verifica anume.
//
// REGULA ESTE SCRISA AICI DIN NOU si nu importata din aplicatie, ca testul sa nu
// verifice aplicatia cu propria ei functie. Aceeasi conventie ca in
// copy-fixes.spec.ts, spec-ul cardului P3-51.
//
// NICIO TABELA NU SE GOLESTE CA SA SE AJUNGA LA UN NUMAR. Acolo unde numarul
// trebuie sa treaca de nouasprezece ca sa se vada forma cu "de", el se obtine
// ADAUGAND randuri, niciodata stergand. Datele de test nu se sterg niciodata.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TEST_CATEGORY = "TEST-Categorie";
const CALLBACK = "/api/extraction/callback";
const MACHINE_RETRIES = 2;

const NF = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 });

/** Regula romaneasca: 1 cere singularul, un numar al carui rest la 100 este
 *  intre 1 si 19 (si zero) cere pluralul simplu, restul cer "de" plus plural. */
function counted(n: number, one: string, many: string): string {
  const shown = NF.format(n);
  if (n === 1) return `${shown} ${one}`;
  const lastTwo = n % 100;
  if (n === 0 || (lastTwo >= 1 && lastTwo <= 19)) return `${shown} ${many}`;
  return `${shown} de ${many}`;
}

/** Explicatia de sub titlul unui card, acolo unde stau numaratorii de lista. */
function hintUnder(page: Page, title: string) {
  return page.locator("h2", { hasText: title }).locator("xpath=following-sibling::p");
}

/** Numarul dintr-un text de forma "20 de clienți", ca numar. */
function numberIn(text: string): number {
  const digits = text.replace(/\D/g, "");
  expect(digits, `niciun număr în "${text}"`).not.toBe("");
  return Number(digits);
}

// ---------------------------------------------------------------------------
// Pregatirea randurilor, prin PostgREST, cu jetonul contului de proprietar
// ---------------------------------------------------------------------------

type Rest = { api: APIRequestContext; headers: Record<string, string>; userId: string };

async function restAsOwner(): Promise<Rest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-98 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-98 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const account = ownerAccount();
  const api = await request.newContext({ baseURL: url });
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: account.email, password: account.password },
  });
  expect(token.ok(), await token.text()).toBe(true);
  const parsed = (await token.json()) as { access_token: string; user: { id: string } };
  return {
    api,
    userId: parsed.user.id,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${parsed.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

/** Insereaza dintr-o data leadurile cerute si intoarce id-urile lor. */
async function createLeads(
  rest: Rest,
  tag: string,
  howMany: number,
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const rows = Array.from({ length: howMany }, (_, i) => ({
    name: `TEST F12 ${tag} ${String(i + 1).padStart(2, "0")} ${RUN}`,
    active: true,
    phone: "069 000 412",
    ...extra,
  }));
  const created = await rest.api.post("/rest/v1/clients", {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: rows,
  });
  expect(created.status(), await created.text()).toBe(201);
  const ids = ((await created.json()) as { id: string }[]).map((r) => r.id);
  expect(ids).toHaveLength(howMany);
  return ids;
}

/** Ziua de azi in Chisinau, deplasata cu un numar de zile, `YYYY-MM-DD`. */
function chisinauDay(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + offsetDays)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

async function makeProduct(page: Page, tag: string): Promise<string> {
  const sku = `TEST-F12-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs F12 ${tag}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  return sku;
}

/** Completeaza fisa comenzii cu numarul cerut de pozitii, pe ecranul deschis. */
async function fillOrder(page: Page, sku: string, lines: number) {
  await expect(page.getByTestId("inbound-form")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("order-supplier").fill(`TEST Furnizor F12 ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  for (let i = 0; i < lines; i += 1) {
    if (i > 0) await page.getByTestId("order-add-line").click();
    const select = page.getByTestId(`line-product-${i}`);
    const option = select.locator("option").filter({ hasText: sku });
    await select.selectOption((await option.getAttribute("value")) ?? "");
    await page.getByTestId(`line-quantity-${i}`).fill("2");
    await page.getByTestId(`line-price-${i}`).fill("5");
  }
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 25_000 });
}

function pdfBytes(tag: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% RC test ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

// ---------------------------------------------------------------------------

test.describe("Numărătorii românești (P3-98, F12)", () => {
  test.describe.configure({ timeout: 240_000 });

  test("F12: lista de clienți se acordă cu numărul ei", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/clienti");

    const hint = hintUnder(page, "Listă");
    await expect(hint).toHaveCount(1, { timeout: 25_000 });
    const text = (await hint.innerText()).trim();
    expect(text, `rând neașteptat: ${text}`).toMatch(/^[\d.\s ]+(?:de )?(?:client|clienți)$/);
    expect(text).toBe(counted(numberIn(text), "client", "clienți"));
  });

  test("F12: vederea Leaduri ia forma cu «de» peste nouăsprezece", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAsOwner();
    // Douazeci de leaduri cu un termen de cautare numai al lor: numaratorul
    // vederii numara exact leadurile filtrate, deci numarul este sigur 20.
    const tag = `Leaduri${RUN}`;
    await createLeads(rest, tag, 20);

    await page.goto(`/clienti?${new URLSearchParams({ vedere: "leaduri", q: tag }).toString()}`);
    const hint = hintUnder(page, "Listă");
    await expect(hint).toHaveCount(1, { timeout: 25_000 });
    await expect(hint).toHaveText("20 de leaduri", { timeout: 25_000 });
    expect(counted(20, "lead", "leaduri")).toBe("20 de leaduri");

    await rest.api.dispose();
  });

  test("F12: Azi se acordă cu întârziații și lasă «de sunat» neatins", async ({ page }) => {
    await signIn(page, ownerAccount());
    const rest = await restAsOwner();
    // Douazeci de leaduri intarziati, ca numarul sa treaca sigur de nouasprezece.
    await createLeads(rest, `Azi${RUN}`, 20, {
      next_action_at: chisinauDay(-1),
      next_action: "sun neapărat",
    });

    await page.goto("/azi");
    await expect(page.getByRole("heading", { level: 1, name: "Azi", exact: true })).toBeVisible({
      timeout: 25_000,
    });
    const rows = page.getByTestId("azi-row");
    await expect(rows.first()).toBeVisible({ timeout: 25_000 });

    const total = await rows.count();
    const overdue = await page.locator('[data-testid="azi-row"][data-overdue="true"]').count();
    expect(overdue, "cele 20 de rânduri întârziate create aici").toBeGreaterThanOrEqual(20);

    const hint = hintUnder(page, "De sunat");
    await expect(hint).toHaveCount(1);
    const text = (await hint.innerText()).trim();

    // "de sunat" NU trece prin regula: ramane numarul urmat de expresie.
    expect(text).toBe(`${total} de sunat, ${counted(overdue, "întârziat", "întârziați")}`);
    expect(text).toContain("de întârziați");
  });

  test("F12: panoul de verificare numără pozițiile citite cu «de»", async ({ page, request }) => {
    await signIn(page, ownerAccount());

    const filename = `TEST-F12-citite-${RUN}.pdf`;
    await page.goto("/incarca-comanda");
    await page.getByTestId("extraction-input").setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: pdfBytes("citite"),
    });
    const card = page.locator('[data-testid="draft-card"]').filter({ hasText: filename });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    const orderId = (await card.getAttribute("data-order-id")) ?? "";
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await firedFor(request, orderId)).toHaveLength(1);

    // Douazeci de linii, aritmetica exacta, una cu totalul CALCULAT de cititor:
    // aceasta din urma trimite documentul in Parțial (cardul P3-80), care este
    // singura stare in care se vede randul numarat.
    const lines = Array.from({ length: 20 }, (_, i) => ({
      product_name: `Linie F12 ${i + 1} ${RUN}`,
      quantity: 1,
      unit: "pcs",
      unit_raw: "buc",
      unit_price: 10,
      line_total: 10,
      currency: "MDL",
      currency_raw: "lei",
      category: null,
      category_raw: null,
      line_total_source: i === 0 ? "derived" : "printed",
    }));
    const answered = await request.post(CALLBACK, {
      headers: {
        "Content-Type": "application/json",
        "x-rc-callback-secret": MAKE_CALLBACK_SECRET,
      },
      maxRetries: MACHINE_RETRIES,
      data: {
        order_id: orderId,
        status: "extracted",
        document_source: "digital",
        error_code: null,
        reason: null,
        supplier_name: `TEST Furnizor F12 ${RUN}`,
        order_date: "2026-09-24",
        prices_include_vat: false,
        vat_rate: 20,
        currency: "MDL",
        currency_raw: "lei",
        subtotal: 200,
        vat_amount: 40,
        document_total: 240,
        lines,
      },
    });
    expect(answered.status(), await answered.text()).toBe(202);
    expect(await answered.json()).toEqual({ order_id: orderId, status: "partial", lines: 20 });

    await page.goto("/incarca-comanda");
    const row = page.locator(`[data-testid="draft-card"][data-order-id="${orderId}"]`);
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row).toHaveAttribute("data-status", "partial");
    await expect(row.getByTestId("draft-kept-lines")).toHaveText(
      `${counted(20, "poziție citită", "poziții citite")} au fost păstrate.`,
    );
    expect(counted(20, "poziție citită", "poziții citite")).toBe("20 de poziții citite");
  });

  test("F12: confirmarea comenzii manuale se acordă cu pozițiile ei", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "manual");

    await page.goto("/adauga-manual");
    await fillOrder(page, sku, 1);
    await expect(page.getByTestId("order-created")).toContainText(
      `Introdusă manual, cu ${counted(1, "poziție", "poziții")}.`,
    );

    await page.goto("/adauga-manual");
    await fillOrder(page, sku, 2);
    await expect(page.getByTestId("order-created")).toContainText(
      `Introdusă manual, cu ${counted(2, "poziție", "poziții")}.`,
    );
  });

  test("F12: confirmarea de pe Încarcă comandă se acordă cu pozițiile ei", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "incarca");

    await page.goto("/incarca-comanda");
    await fillOrder(page, sku, 1);
    await expect(page.getByTestId("order-created")).toContainText(`${counted(1, "poziție", "poziții")}.`);

    await page.goto("/incarca-comanda");
    await fillOrder(page, sku, 2);
    await expect(page.getByTestId("order-created")).toContainText(`${counted(2, "poziție", "poziții")}.`);
  });

  test("F12: fila Documente numără documentele din legătura «Vezi toate»", async ({ page }) => {
    await signIn(page, ownerAccount());

    // Un client nou, ca numarul documentelor lui sa fie al acestui caz.
    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-name").fill(`TEST F12 Documente ${RUN}`);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    const url = page.url();
    const clientId = url.slice(url.lastIndexOf("/") + 1).split("?")[0]!;

    // Legatura apare abia peste cele cinci randuri aratate in fila, deci sase.
    const howMany = 6;
    await page.goto(`/clienti/${clientId}?fila=documente`);
    const panel = page.getByTestId("panel-documente");
    await expect(panel.getByTestId("document-upload")).toBeVisible({ timeout: 25_000 });
    for (let i = 0; i < howMany; i += 1) {
      const name = `TEST-F12-doc-${i + 1}-${RUN}.pdf`;
      await panel.getByTestId("document-kind").selectOption("contract");
      await panel.getByTestId("document-input").setInputFiles({
        name,
        mimeType: "application/pdf",
        buffer: pdfBytes(`doc-${i + 1}`),
      });
      await expect(panel.getByTestId("document-chosen")).toHaveText(name);
      await panel.getByTestId("document-submit").click();
      await expect(
        page.locator(`[data-testid="document-row"][data-name="${name}"]`),
      ).toBeVisible({ timeout: 60_000 });
    }

    const all = page.getByTestId("documents-all");
    await expect(all).toBeVisible({ timeout: 25_000 });
    await expect(all).toHaveText(`Vezi toate cele ${counted(howMany, "document", "documente")}`);
  });
});
