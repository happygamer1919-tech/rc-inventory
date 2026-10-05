import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// client-material-walkin.spec - linia de acceptanta a cardului P3-159.
//
// CE SE DOVEDESTE. public.client_material_summary (0022) lega iesirile de client
// doar prin proiect. O vanzare la ghiseu (0067) nu are proiect si isi numeste
// cumparatorul in outbound_issues.client_id, deci fila 'Consum materiale' a
// cumparatorului spunea 'Niciun consum inregistrat'. Migratia 0071 numara si
// iesirile directe. Cazurile: un client cu o singura vanzare la ghiseu de 50 o
// vede pe pagina lui; un client cu o iesire pe proiect (30) si o vanzare la
// ghiseu (50) vede suma, fiecare pozitie o singura data; un alt client cu 5000 nu
// se amesteca.
//
// NU EXISTA UN CAZ PENTRU O VANZARE ANULATA: o iesire nu are stare anulata
// (enumul este awaiting_shipment si shipped, iar 0067 nu construieste anulare),
// deci functia nu a filtrat niciodata pe stare si nu are ce sa lase deoparte.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici
// este prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3159-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "client-material-walkin.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

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
  return { status: response.status, ok: response.ok, rows, text };
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

let token = "";
let productId = "";
let walkinOnlyClient = "";
let mixedClient = "";
let otherClient = "";

async function newClient(label: string): Promise<string> {
  const created = await asService("clients?select=id", { method: "POST", body: { name: `${TAG} ${label}` } });
  expect(created.ok, `clientul de test nu a putut fi scris: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

async function walkinSale(reference: string, clientId: string, quantity: number): Promise<void> {
  const created = await asUser(token, "rpc/create_direct_client_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_lines: [{ product_id: productId, quantity, sale_price_mdl: 20 }],
      p_client_id: clientId,
      p_pickup_date: "2026-10-04",
    },
  });
  expect(created.ok, `vanzarea la ghiseu nu a putut fi scrisa: ${created.status} ${created.text}`).toBe(true);
}

async function summary(clientId: string): Promise<Record<string, unknown>[]> {
  const result = await asUser(token, "rpc/client_material_summary", {
    method: "POST",
    body: { p_client_id: clientId, p_limit: 5 },
  });
  expect(result.ok, `rezumatul nu a putut fi citit: ${result.status} ${result.text}`).toBe(true);
  return result.rows;
}

test.beforeAll(async () => {
  token = await ownerToken();

  const category = await asService("categories?select=id&limit=1");
  expect(category.ok && category.rows.length > 0, "nu exista nicio categorie").toBe(true);

  const product = await asService("products?select=id", {
    method: "POST",
    body: {
      sku: `${TAG}-SKU`,
      name: `${TAG} produs`,
      category_id: String(category.rows[0]!.id),
      unit: "pcs",
      unit_value_mdl: 10,
    },
  });
  expect(product.ok, `produsul de test nu a putut fi scris: ${product.text}`).toBe(true);
  productId = String(product.rows[0]!.id);

  const order = await asService("inbound_orders?select=id", {
    method: "POST",
    body: { reference: `${TAG}-IN`, supplier_name: `${TAG} furnizor` },
  });
  expect(order.ok, `comanda de test nu a putut fi scrisa: ${order.text}`).toBe(true);
  const orderId = String(order.rows[0]!.id);
  const line = await asService("order_lines?select=id", {
    method: "POST",
    body: { inbound_order_id: orderId, product_id: productId, quantity: 10000, unit_price: 10 },
  });
  expect(line.ok, `pozitia comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);
  const batch = await asService("batches?select=id", {
    method: "POST",
    body: {
      product_id: productId,
      inbound_order_id: orderId,
      order_line_id: String(line.rows[0]!.id),
      quantity: 10000,
    },
  });
  expect(batch.ok, `lotul nu a putut fi scris: ${batch.text}`).toBe(true);

  walkinOnlyClient = await newClient("doar ghiseu");
  mixedClient = await newClient("proiect si ghiseu");
  otherClient = await newClient("alt client");

  const project = await asService("projects?select=id", {
    method: "POST",
    body: { client_id: mixedClient, name: `${TAG} proiect` },
  });
  expect(project.ok, `proiectul de test nu a putut fi scris: ${project.text}`).toBe(true);
  const projectIssue = await asUser(token, "rpc/create_outbound_issue", {
    method: "POST",
    body: {
      p_reference: `${TAG}-P`,
      p_client_name: "",
      p_project_name: "",
      p_lines: [{ product_id: productId, quantity: 30 }],
      p_project_id: String(project.rows[0]!.id),
    },
  });
  expect(projectIssue.ok, `iesirea pe proiect nu a putut fi scrisa: ${projectIssue.text}`).toBe(true);

  await walkinSale(`${TAG}-W1`, walkinOnlyClient, 50);
  await walkinSale(`${TAG}-W2`, mixedClient, 50);
  await walkinSale(`${TAG}-W3`, otherClient, 5000);
});

test("consum materiale: o vanzare la ghiseu de 50, fara proiect, apare la cumparator", async () => {
  const rows = await summary(walkinOnlyClient);
  const product = rows.filter((r) => r.row_kind === "row");
  expect(product, "un singur produs").toHaveLength(1);
  expect(Number(product[0]!.quantity), "50 de bucati").toBe(50);
  expect(Number(rows.find((r) => r.row_kind === "total")!.quantity), "totalul este 50").toBe(50);
});

test("consum materiale: iesirea pe proiect si vanzarea la ghiseu se aduna, fiecare o singura data", async () => {
  const rows = await summary(mixedClient);
  expect(rows.filter((r) => r.row_kind === "row"), "un singur produs").toHaveLength(1);
  expect(Number(rows.find((r) => r.row_kind === "total")!.quantity), "30 pe proiect plus 50 la ghiseu").toBe(80);
});

test("consum materiale: vanzarea altui client nu se amesteca", async () => {
  const rows = await summary(otherClient);
  expect(Number(rows.find((r) => r.row_kind === "total")!.quantity), "doar 5000 ai lui").toBe(5000);
});

test("fila Consum materiale a cumparatorului arata materialul luat la ghiseu", async ({ page }) => {
  await signIn(page, ownerAccount());
  await page.goto(`/clienti/${walkinOnlyClient}?fila=consum`);
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  const row = page.getByTestId("material-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`${TAG}-SKU`);
  await expect(page.getByTestId("panel-consum")).not.toContainText("Niciun consum înregistrat");
});
