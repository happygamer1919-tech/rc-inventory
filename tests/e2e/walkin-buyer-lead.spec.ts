import { expect, test, type Page } from "@playwright/test";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// CARDUL P3-262. Pe Ieșiri materiale, la clientul direct, cumparatorul poate fi
// un lead. Decizia proprietarului, Max, 2026-10-10: "yes do the lead option".
// Leadul apare in lista marcat "Lead"; bonul se scrie pe acel rand si randul
// devine Client in aceeasi salvare, pentru administrator si pentru managerul de
// cont. Migratia 0081 face asta in baza, intr-o singura tranzactie, prin
// public.walkin_lead_becomes_client, chemata de public.create_direct_client_issue.
//
// Ce se dovedeste aici, cu jetoane adevarate prin PostgREST si prin ecran:
//   - managerul vede leadul marcat "Lead", vinde catre el, randul este Client,
//     cu exact un rand de istoric, si niciun client nou nu s-a creat
//   - managerul nu poate muta un lead in Client fara vanzare: nici prin
//     set_client_stage, nici printr-un PATCH, nici prin functia noua chemata pe
//     un bon mai vechi
//   - o vanzare refuzata (stoc insuficient) lasa leadul la etapa lui
//   - administratorul: aceeasi vanzare catre un lead, si set_client_stage merge
//     in continuare ca inainte
//   - un lead inactiv nu apare in lista
//
// Ruleaza pe stiva locala din CI, niciodata pe productie. Datele de test nu se
// sterg: fiecare rand poarta eticheta rularii.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3262-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "walkin-buyer-lead.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

async function accessToken(account: TestAccount): Promise<string> {
  const { origin, anon } = env();
  const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`autentificarea API a raspuns ${response.status}`);
  }
  return body.access_token;
}

function subOf(token: string): string {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")).sub as string;
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(
  path: string,
  headers: Record<string, string>,
  method = "GET",
  body?: unknown,
): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method,
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
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

const asService = (path: string, method = "GET", body?: unknown) =>
  rest(path, { apikey: env().service, Authorization: `Bearer ${env().service}` }, method, body);
const asUser = (token: string, path: string, method = "GET", body?: unknown) =>
  rest(path, { apikey: env().anon, Authorization: `Bearer ${token}` }, method, body);

/* ----------------------------------------------------------- fixturi -- */

const PRODUCT_NAME = `${TAG} produs`;
let productId = "";

async function anyCategoryId(): Promise<string> {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(rows.rows.length, "nu exista nicio categorie").toBeGreaterThan(0);
  return String(rows.rows[0]!.id);
}

/** Stocul este loturi minus pozitii de iesire: o comanda, o pozitie si un lot. */
async function seedStock(quantity: number): Promise<void> {
  const order = await asService("inbound_orders?select=id", "POST", {
    reference: `${TAG}-IN`,
    supplier_name: `${TAG} furnizor`,
  });
  expect(order.ok, `comanda de test nu a putut fi scrisa: ${order.text}`).toBe(true);
  const orderId = String(order.rows[0]!.id);
  const line = await asService("order_lines?select=id", "POST", {
    inbound_order_id: orderId,
    product_id: productId,
    quantity,
    unit_price: 10,
  });
  expect(line.ok, `pozitia comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);
  const batch = await asService("batches?select=id", "POST", {
    product_id: productId,
    inbound_order_id: orderId,
    order_line_id: String(line.rows[0]!.id),
    quantity,
  });
  expect(batch.ok, `lotul nu a putut fi scris: ${batch.text}`).toBe(true);
}

/** Un rand in public.clients, scris cu cheia de serviciu. */
async function seedClient(name: string, stage: string, active = true, extra: Record<string, unknown> = {}) {
  const created = await asService("clients?select=id", "POST", {
    name,
    type: "company",
    stage,
    active,
    phone: "069 000 262",
    ...extra,
  });
  expect(created.ok, `clientul ${name} nu s-a creat: ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

async function clientRow(id: string): Promise<Record<string, unknown>> {
  const row = await asService(`clients?select=id,name,stage,active,follow_up_date&id=eq.${id}`);
  expect(row.ok, `clientul nu s-a putut citi: ${row.text}`).toBe(true);
  expect(row.rows.length).toBe(1);
  return row.rows[0]!;
}

async function clientHistory(id: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(
    `status_history?select=from_status,to_status,changed_by&entity_type=eq.client&entity_id=eq.${id}`,
  );
  expect(rows.ok, `istoricul nu s-a putut citi: ${rows.text}`).toBe(true);
  return rows.rows;
}

async function clientsNamed(name: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(`clients?select=id&name=eq.${encodeURIComponent(name)}`);
  expect(rows.ok, `clientii nu s-au putut citi: ${rows.text}`).toBe(true);
  return rows.rows;
}

function directIssue(token: string, reference: string, clientId: string, quantity = 1) {
  return asUser(token, "rpc/create_direct_client_issue", "POST", {
    p_reference: reference,
    p_lines: [{ product_id: productId, quantity }],
    p_client_id: clientId,
    p_pickup_date: "2026-12-04",
  });
}

test.beforeAll(async () => {
  const product = await asService("products?select=id", "POST", {
    sku: `${TAG}-SKU`,
    name: PRODUCT_NAME,
    category_id: await anyCategoryId(),
    unit: "pcs",
    unit_value_mdl: 10,
  });
  expect(product.ok, `produsul de test nu a putut fi scris: ${product.text}`).toBe(true);
  productId = String(product.rows[0]!.id);
  await seedStock(100);
});

/* --------------------------------------------------------- ecranul -- */

async function chooseDirectClient(page: Page): Promise<void> {
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("issue-mode-direct_client").check();
  await expect(page.getByTestId("field-pickup-date")).toBeVisible({ timeout: 25_000 });
}

/** Scrie in combobox si intoarce textele randurilor din lista. */
async function comboItems(page: Page, testId: string, query: string): Promise<string[]> {
  const input = page.getByTestId(testId).locator("input").first();
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  return list.locator("li").allTextContents();
}

async function comboPick(page: Page, testId: string, query: string): Promise<void> {
  const items = await comboItems(page, testId, query);
  expect(items, `cautarea "${query}" trebuie sa dea exact o potrivire`).toHaveLength(1);
  await page.locator("[data-rc-combo-list] li").first().click();
}

/** Vinde prin ecran catre clientul cu acest nume unic si intoarce referinta. */
async function sellOnScreen(page: Page, buyer: string): Promise<string> {
  await chooseDirectClient(page);
  const items = await comboItems(page, "field-client", buyer);
  expect(items, "exact un rand pentru cumparator").toHaveLength(1);
  expect(items[0], "randul leadului este marcat Lead").toContain("Lead");
  await page.locator("[data-rc-combo-list] li").first().click();
  await expect(page.getByTestId("client-lead-note")).toBeVisible();

  await comboPick(page, "issue-product-0", PRODUCT_NAME);
  await page.getByTestId("issue-quantity-0").fill("1");
  await page.getByTestId("issue-pickup-date").fill("04.12.2026");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-created")).toContainText(buyer);
  await expect(page.getByTestId("issue-lead-became-client")).toBeVisible();
  return (await page.getByTestId("issue-reference").innerText()).trim();
}

async function issueClientId(reference: string): Promise<string> {
  const stored = await asService(
    `outbound_issues?select=client_id,issue_mode&reference=eq.${encodeURIComponent(reference)}`,
  );
  expect(stored.ok, `iesirea nu s-a putut citi: ${stored.text}`).toBe(true);
  expect(stored.rows.length).toBe(1);
  expect(stored.rows[0]!.issue_mode).toBe("direct_client");
  return String(stored.rows[0]!.client_id);
}

test.describe("P3-262, cumparatorul de la tejghea poate fi un lead", () => {
  test.describe.configure({ timeout: 150_000 });

  test("managerul: leadul apare marcat Lead, vanzarea se salveaza, randul devine Client cu un rand de istoric si niciun client nou", async ({
    page,
  }) => {
    const name = `${TAG} lead manager`;
    const leadId = await seedClient(name, "quoted");
    const managerId = subOf(await accessToken(managerAccount()));

    await signIn(page, managerAccount());
    const reference = await sellOnScreen(page, name);

    expect(await issueClientId(reference), "bonul este pe randul leadului").toBe(leadId);
    const after = await clientRow(leadId);
    expect(after.stage, "leadul este acum Client").toBe("client");
    expect(after.active).toBe(true);
    const history = await clientHistory(leadId);
    expect(history, "exact un rand de istoric").toHaveLength(1);
    expect(history[0]!.from_status).toBe("quoted");
    expect(history[0]!.to_status).toBe("client");
    expect(history[0]!.changed_by, "randul de istoric este al managerului").toBe(managerId);
    expect(await clientsNamed(name), "niciun client nou cu acelasi nume").toHaveLength(1);
  });

  test("managerul: un lead nu se muta in Client fara vanzare", async () => {
    const token = await accessToken(managerAccount());
    const leadId = await seedClient(`${TAG} lead fara vanzare`, "cold");

    // set_client_stage ramane al administratorului.
    const viaStage = await asUser(token, "rpc/set_client_stage", "POST", {
      p_client_id: leadId,
      p_stage: "client",
      p_follow_up_date: null,
      p_first: false,
    });
    expect(viaStage.ok, `set_client_stage a trecut pentru manager: ${viaStage.text}`).toBe(false);

    // Un PATCH direct nu atinge niciun rand (clients_update ramane owner).
    const viaPatch = await asUser(token, `clients?id=eq.${leadId}&select=id`, "PATCH", { stage: "client" });
    expect(viaPatch.rows.length, `managerul a modificat etapa: ${viaPatch.text}`).toBe(0);

    // Functia noua, chemata singura pe un bon scris de manager intr-o cerere
    // anterioara, catre acest lead: refuzata, fiindca bonul nu e scris acum.
    const old = await asUser(token, "outbound_issues?select=id", "POST", {
      reference: `${TAG}-VECHI`,
      issue_mode: "direct_client",
      client_id: leadId,
      pickup_date: "2026-12-04",
      status: "awaiting_shipment",
      created_by: subOf(token),
    });
    expect(old.ok, `bonul vechi nu s-a scris: ${old.text}`).toBe(true);
    const viaHelper = await asUser(token, "rpc/walkin_lead_becomes_client", "POST", {
      p_issue_id: String(old.rows[0]!.id),
    });
    expect(viaHelper.ok, `functia a mutat leadul fara vanzare: ${viaHelper.text}`).toBe(false);
    expect(viaHelper.text).toContain("42501");

    const after = await clientRow(leadId);
    expect(after.stage, "leadul a ramas la etapa lui").toBe("cold");
    expect(await clientHistory(leadId), "niciun rand de istoric").toHaveLength(0);
  });

  test("managerul: o vanzare refuzata lasa leadul la etapa lui", async () => {
    const token = await accessToken(managerAccount());
    const leadId = await seedClient(`${TAG} lead stoc`, "nurture");
    const refused = await directIssue(token, `${TAG}-STOC`, leadId, 1_000_000);
    expect(refused.ok, `vanzarea peste stoc a trecut: ${refused.text}`).toBe(false);
    expect(refused.text).toContain("INSUFFICIENT_STOCK");
    const after = await clientRow(leadId);
    expect(after.stage).toBe("nurture");
    expect(await clientHistory(leadId)).toHaveLength(0);
    const slips = await asService(`outbound_issues?select=id&reference=eq.${encodeURIComponent(`${TAG}-STOC`)}`);
    expect(slips.rows, "niciun bon ramas").toHaveLength(0);
  });

  test("managerul: o vanzare catre un client nu schimba etapa si nu scrie istoric", async () => {
    const token = await accessToken(managerAccount());
    const clientId = await seedClient(`${TAG} client`, "client");
    const sold = await directIssue(token, `${TAG}-CLIENT`, clientId);
    expect(sold.ok, `vanzarea catre client a fost refuzata: ${sold.text}`).toBe(true);
    expect((await clientRow(clientId)).stage).toBe("client");
    expect(await clientHistory(clientId)).toHaveLength(0);
  });

  test("administratorul: vanzarea catre un lead il face Client, si set_client_stage merge ca inainte", async ({
    page,
  }) => {
    const name = `${TAG} lead administrator`;
    const leadId = await seedClient(name, "follow_up", true, { follow_up_date: "2026-12-01" });
    const ownerId = subOf(await accessToken(ownerAccount()));

    await signIn(page, ownerAccount());
    const reference = await sellOnScreen(page, name);
    expect(await issueClientId(reference)).toBe(leadId);
    const after = await clientRow(leadId);
    expect(after.stage).toBe("client");
    expect(after.follow_up_date, "data de reluare se sterge ca la orice plecare din De reluat").toBeNull();
    const history = await clientHistory(leadId);
    expect(history).toHaveLength(1);
    expect(history[0]!.from_status).toBe("follow_up");
    expect(history[0]!.changed_by).toBe(ownerId);

    // Regulile administratorului in rest: set_client_stage muta in continuare.
    const otherLead = await seedClient(`${TAG} lead mutat de administrator`, "cold");
    const moved = await asUser(await accessToken(ownerAccount()), "rpc/set_client_stage", "POST", {
      p_client_id: otherLead,
      p_stage: "quoted",
      p_follow_up_date: null,
      p_first: false,
    });
    expect(moved.ok, `administratorul nu a mai putut muta etapa: ${moved.text}`).toBe(true);
    expect((await clientRow(otherLead)).stage).toBe("quoted");
  });

  test("un lead inactiv nu apare in lista de cumparatori", async ({ page }) => {
    const prefix = `${TAG}-Inactiv`;
    await seedClient(`${prefix}-lead activ`, "cold");
    await seedClient(`${prefix}-lead inactiv`, "cold", false);
    await signIn(page, managerAccount());
    await chooseDirectClient(page);
    const items = await comboItems(page, "field-client", prefix);
    expect(items.some((t) => t.includes(`${prefix}-lead activ`)), "leadul activ apare").toBe(true);
    expect(items.some((t) => t.includes(`${prefix}-lead inactiv`)), "leadul inactiv nu apare").toBe(false);
  });
});
