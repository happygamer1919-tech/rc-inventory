import { expect, test } from "@playwright/test";
import { formatQty, formatQtyNumber } from "../../lib/data/format";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// p3-200-client-materials-decimals.spec - linia de acceptanta a cardului P3-200.
//
// CE SE DOVEDESTE. Fila 'Consum materiale' a clientului formata cantitatea cu
// formatNumber (zero zecimale), deci o vanzare la ghiseu de 2,5 m2 aparea ca 3 si
// una de 0,4 m3 ca 0. P3-146 reparase formularele si fisa de iesire, nu aceasta fila.
// Prima parte sunt doua teste pure (fara baza de date). A doua parte vinde 2,5 m2
// unui client de test si cauta "2,5" in randul si in totalul filei.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici
// este prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

test("formatarea cantitatii din fila pastreaza zecimalele: 2,5 m² si 0,4 m³", () => {
  expect(formatQty(2.5, "m2")).toBe("2,5 m²");
  expect(formatQty(0.4, "m3")).toBe("0,4 m³");
  expect(formatQtyNumber(2.5)).toBe("2,5");
  expect(formatQtyNumber(50)).toBe("50");
});

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3200-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "p3-200-client-materials-decimals.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Rest = { ok: boolean; status: number; rows: Record<string, unknown>[]; text: string };

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: { ...init.headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { ok: response.ok, status: response.status, rows, text };
}

const asService = (path: string, init: { method?: string; body?: unknown } = {}) =>
  rest(path, { ...init, headers: { apikey: env().service, Authorization: `Bearer ${env().service}` } });
const asUser = (token: string, path: string, init: { method?: string; body?: unknown } = {}) =>
  rest(path, { ...init, headers: { apikey: env().anon, Authorization: `Bearer ${token}` } });

async function ownerToken(): Promise<string> {
  const account = ownerAccount();
  const response = await fetch(`${env().origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env().anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`autentificarea API a raspuns ${response.status}`);
  return body.access_token;
}

test.describe("fila Consum materiale cu zecimale", () => {
  let clientId = "";

  test.beforeAll(async () => {
    const token = await ownerToken();

    const category = await asService("categories?select=id&limit=1");
    expect(category.ok && category.rows.length > 0, "nu exista nicio categorie").toBe(true);

    const product = await asService("products?select=id", {
      method: "POST",
      body: {
        sku: `${TAG}-SKU`,
        name: `${TAG} produs`,
        category_id: String(category.rows[0]!.id),
        unit: "m2",
        unit_value_mdl: 10,
      },
    });
    expect(product.ok, `produsul de test nu a putut fi scris: ${product.text}`).toBe(true);
    const productId = String(product.rows[0]!.id);

    const order = await asService("inbound_orders?select=id", {
      method: "POST",
      body: { reference: `${TAG}-IN`, supplier_name: `${TAG} furnizor` },
    });
    expect(order.ok, `comanda de test nu a putut fi scrisa: ${order.text}`).toBe(true);
    const orderId = String(order.rows[0]!.id);
    const line = await asService("order_lines?select=id", {
      method: "POST",
      body: { inbound_order_id: orderId, product_id: productId, quantity: 100, unit_price: 10 },
    });
    expect(line.ok, `pozitia comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);
    const batch = await asService("batches?select=id", {
      method: "POST",
      body: {
        product_id: productId,
        inbound_order_id: orderId,
        order_line_id: String(line.rows[0]!.id),
        quantity: 100,
      },
    });
    expect(batch.ok, `lotul nu a putut fi scris: ${batch.text}`).toBe(true);

    const client = await asService("clients?select=id", { method: "POST", body: { name: `${TAG} client` } });
    expect(client.ok, `clientul de test nu a putut fi scris: ${client.text}`).toBe(true);
    clientId = String(client.rows[0]!.id);

    const sale = await asUser(token, "rpc/create_direct_client_issue", {
      method: "POST",
      body: {
        p_reference: `${TAG}-W`,
        p_lines: [{ product_id: productId, quantity: 2.5, sale_price_mdl: 20 }],
        p_client_id: clientId,
        p_pickup_date: "2026-10-09",
      },
    });
    expect(sale.ok, `vanzarea la ghiseu nu a putut fi scrisa: ${sale.status} ${sale.text}`).toBe(true);
  });

  test("o vanzare la ghiseu de 2,5 m² apare cu zecimala in rand si in total", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto(`/clienti/${clientId}?fila=consum`);
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("material-row")).toContainText("2,5 m²");
    await expect(page.getByTestId("material-total")).toContainText("2,5");
  });
});
