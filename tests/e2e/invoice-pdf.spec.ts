import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { chisinauToday } from "@/lib/data/format";
import { invoiceNumberText, invoiceStatusLabel } from "@/lib/data/facturare-types";

// invoice-pdf.spec - linia de acceptanta a cardului P3-272: butonul "Descarcă PDF" de pe
// factura si ruta /api/facturare/<id>/pdf.
//
// CE SE DOVEDESTE
//   1. O ciorna NU are buton, iar ruta ei raspunde 409 cu JSON, nu cu un PDF.
//   2. O factura emisa are butonul, iar descarcarea este un PDF adevarat: incepe cu
//      %PDF, are pe o singura pagina si poarta numarul facturii in numele fisierului.
//   3. O factura platita si una anulata au si ele butonul si descarca un PDF.
//   4. O cerere fara sesiune este refuzata: nu primeste niciun PDF.
//
// Continutul scris in PDF (diacriticele, campurile goale omise, marcajul ANULATĂ) nu se
// poate citi aici: fonturile se pastreaza in fisier ca submultime, deci textul nu apare
// in clar in octeti. Ce se vede in octeti este forma, si aceea se verifica.
//
// SERIA PROPRIE, ca in facturare-chisinau-day.spec: seria este globala si datele de test
// nu se sterg niciodata, deci prefixul este unic pe rulare, iar afterAll pune setarile
// inapoi pe implicitul produsului. DATELE DE TEST NU SE STERG: facturile ramane pe loc,
// iar cea de-a doua este anulata prin ecran, nu stearsa.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TODAY = chisinauToday();

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "invoice-pdf.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si " +
        "SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase credentials'. " +
        "Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Rest = { ok: boolean; rows: Record<string, unknown>[]; text: string };

let api: APIRequestContext;
let ownerToken = "";
let clientId = "";
let productId = "";

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<Rest> {
  const response = await api.fetch(`/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { ...init.headers, "Content-Type": "application/json", Prefer: "return=representation" },
    data: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { ok: response.ok(), rows, text };
}

const asOwner = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: { apikey: env().anon, Authorization: `Bearer ${ownerToken}` } });
const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: { apikey: env().service, Authorization: `Bearer ${env().service}` } });

/** O ciorna cu o linie, scrisa direct: ce se probeaza aici nu este formularul. */
async function seedDraft(): Promise<string> {
  const created = await asOwner("invoices?select=id", { method: "POST", body: { client_id: clientId } });
  expect(created.ok, `ciorna nu a putut fi creata: ${created.text}`).toBe(true);
  const id = String(created.rows[0]!.id);

  const line = await asOwner("invoice_lines?select=id", {
    method: "POST",
    body: {
      invoice_id: id,
      product_id: productId,
      description: `Linie PDF P3-272 ${RUN}`,
      quantity: 2,
      unit: "pcs",
      unit_price_mdl: 100,
      vat_rate: 20,
    },
  });
  expect(line.ok, `linia nu a putut fi adaugata: ${line.text}`).toBe(true);
  return id;
}

async function issue(id: string): Promise<void> {
  const issued = await asOwner("rpc/issue_invoice", {
    method: "POST",
    body: { p_invoice_id: id, p_issue_date: TODAY, p_due_date: null },
  });
  expect(issued.ok, `emiterea a esuat: ${issued.text}`).toBe(true);
}

/** Numarul scris al facturii, citit din baza si compus cu aceeasi functie ca aplicatia. */
async function numberTextOf(id: string): Promise<string> {
  const got = await asOwner(`invoices?select=series,number&id=eq.${id}`);
  expect(got.rows, `exact o factura pentru ${id}`).toHaveLength(1);
  const row = got.rows[0]!;
  const text = invoiceNumberText(
    (row.series as string | null) ?? null,
    row.number === null ? null : Number(row.number),
  );
  expect(text, "factura emisa are numar").not.toBeNull();
  return text!;
}

/** Numele de fisier asteptat: numarul, cu aceleasi semne sigure ca in ruta. */
function expectedFileName(numberText: string): string {
  return `${numberText.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}

/** Cate pagini are un PDF scris de pdfkit: obiectele `/Type /Page` (nu `/Pages`). */
function pageCount(bytes: Buffer): number {
  return (bytes.toString("latin1").match(/\/Type \/Page(?![s\w])/g) ?? []).length;
}

test.describe("Factura, descărcare PDF", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(async () => {
    const { origin, anon } = env();
    api = await request.newContext({ baseURL: origin });

    const owner = ownerAccount();
    const token = await api.post("/auth/v1/token?grant_type=password", {
      headers: { apikey: anon, "Content-Type": "application/json" },
      data: { email: owner.email, password: owner.password },
    });
    expect(token.ok(), `autentificarea API a raspuns ${token.status()}`).toBe(true);
    ownerToken = ((await token.json()) as { access_token: string }).access_token;

    const written = await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: { series_prefix: `TEST-PDF-${RUN}-`, number_includes_year: false },
    });
    expect(written.ok, `prefixul seriei nu a putut fi pus: ${written.text}`).toBe(true);

    const client = await asOwner("clients?select=id", {
      method: "POST",
      body: { name: `TEST Client PDF ${RUN}`, active: true },
    });
    expect(client.ok, `clientul de test nu a putut fi creat: ${client.text}`).toBe(true);
    clientId = String(client.rows[0]!.id);

    const category = await asService("categories?select=id&limit=1");
    expect(category.rows.length, "nu exista nicio categorie").toBeGreaterThan(0);
    const product = await asService("products?select=id", {
      method: "POST",
      body: {
        sku: `TEST-PDF-${RUN}`,
        name: `TEST Produs PDF ${RUN}`,
        category_id: String(category.rows[0]!.id),
        unit: "pcs",
        unit_value_mdl: 100,
        active: true,
      },
    });
    expect(product.ok, `produsul de test nu a putut fi creat: ${product.text}`).toBe(true);
    productId = String(product.rows[0]!.id);
  });

  test.afterAll(async () => {
    await asService("invoice_settings?id=eq.true", {
      method: "PATCH",
      body: { series_prefix: "RC-", number_includes_year: true },
    });
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ownerAccount());
  });

  test("1. o ciornă nu are buton PDF, iar ruta ei nu dă un PDF", async ({ page }) => {
    const id = await seedDraft();
    await page.goto(`/facturare/${id}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("draft"), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("factura-pdf")).toHaveCount(0);

    const response = await page.request.get(`/api/facturare/${id}/pdf`);
    expect(response.status(), "o ciornă nu are PDF").toBe(409);
    expect(response.headers()["content-type"] ?? "").toContain("application/json");
  });

  test("2. o factură emisă are butonul, iar descărcarea este un PDF de o pagină cu numărul în nume", async ({
    page,
  }) => {
    const id = await seedDraft();
    await issue(id);
    const numberText = await numberTextOf(id);

    await page.goto(`/facturare/${id}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"), {
      timeout: 25_000,
    });
    const button = page.getByTestId("factura-pdf");
    await expect(button).toBeVisible();
    await expect(button).toHaveText("Descarcă PDF");

    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename(), "numele fisierului este numarul facturii").toBe(
      expectedFileName(numberText),
    );
    const path = await download.path();
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 4).toString("latin1"), "fisierul este un PDF").toBe("%PDF");
    expect(pageCount(bytes), "o factura cu o linie sta pe o singura pagina").toBe(1);

    // Aceeasi ruta, cerută direct: antetele sunt cele ale unei descarcari, nu ale unei pagini.
    const direct = await page.request.get(`/api/facturare/${id}/pdf`);
    expect(direct.status()).toBe(200);
    expect(direct.headers()["content-type"]).toBe("application/pdf");
    expect(direct.headers()["content-disposition"]).toBe(
      `attachment; filename="${expectedFileName(numberText)}"`,
    );
  });

  test("3. factura plătită și cea anulată au butonul și descarcă un PDF", async ({ page }) => {
    // --- plătită, prin ecran -------------------------------------------------------
    const paidId = await seedDraft();
    await issue(paidId);
    await page.goto(`/facturare/${paidId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"), {
      timeout: 25_000,
    });
    await page.getByTestId("factura-platita").click();
    await expect(page.getByTestId("factura-platita-confirmare")).toBeVisible();
    await page.getByTestId("factura-platita-da").click();
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("paid"), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("factura-pdf")).toBeVisible();

    const paidNumber = await numberTextOf(paidId);
    const [paidDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("factura-pdf").click(),
    ]);
    expect(paidDownload.suggestedFilename()).toBe(expectedFileName(paidNumber));
    const paidBytes = await readFile(await paidDownload.path());
    expect(paidBytes.subarray(0, 4).toString("latin1")).toBe("%PDF");

    // --- anulată, prin ecran: se anulează, nu se șterge -----------------------------
    const cancelledId = await seedDraft();
    await issue(cancelledId);
    await page.goto(`/facturare/${cancelledId}`);
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("issued"), {
      timeout: 25_000,
    });
    await page.getByTestId("factura-anuleaza").click();
    await expect(page.getByTestId("factura-anuleaza-confirmare")).toBeVisible();
    await page.getByTestId("factura-anuleaza-motiv").fill(`Anulare de test P3-272 ${RUN}`);
    await page.getByTestId("factura-anuleaza-da").click();
    await expect(page.getByTestId("factura-stare")).toHaveText(invoiceStatusLabel("cancelled"), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("factura-pdf")).toBeVisible();

    const cancelledNumber = await numberTextOf(cancelledId);
    const [cancelledDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("factura-pdf").click(),
    ]);
    expect(cancelledDownload.suggestedFilename()).toBe(expectedFileName(cancelledNumber));
    const cancelledBytes = await readFile(await cancelledDownload.path());
    expect(cancelledBytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pageCount(cancelledBytes), "si cea anulata sta pe o pagina").toBe(1);
  });

  test("4. fără sesiune ruta este refuzată și nu dă niciun PDF", async ({ baseURL }) => {
    const id = await seedDraft();
    await issue(id);

    const anonymous = await request.newContext({ baseURL: baseURL! });
    try {
      const response = await anonymous.get(`/api/facturare/${id}/pdf`, { maxRedirects: 0 });
      expect(response.status(), "o cerere fara sesiune este redirectata, nu servita").toBeGreaterThanOrEqual(
        300,
      );
      expect(response.status()).toBeLessThan(400);
      expect(response.headers()["location"] ?? "").toContain("/autentificare");
      expect(response.headers()["content-type"] ?? "").not.toContain("application/pdf");
    } finally {
      await anonymous.dispose();
    }
  });
});
