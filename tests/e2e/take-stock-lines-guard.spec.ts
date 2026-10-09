import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// take-stock-lines-guard.spec - linia de acceptanta a cardului P3-199.
//
// CE SE DOVEDESTE, cu jetoane adevarate prin PostgREST, pe stiva locala din CI:
//   (a) un operator care cheama outbound_issue_take_stock pe iesirea altcuiva este
//       refuzat si nu se scrie nicio pozitie in outbound_lines.
//   (b) acelasi apel pe o iesire care are deja pozitii este refuzat pentru un
//       neproprietar, chiar daca el este autorul iesirii.
//   (c) prima scadere a autorului pe iesirea lui goala merge, apelul proprietarului
//       merge, iar cele doua usi ale ecranelor merg ca inainte.
//
// FIECARE REFUZ ARE UN MARTOR: acelasi cont face intai lucrul permis cel mai
// apropiat, ca un refuz sa nu treaca si pe o cale pe care nu o poate folosi nimeni.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici este
// prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3199-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "take-stock-lines-guard.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de " +
        "pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, anon, service };
}

function serviceHeaders() {
  return { apikey: env().service, Authorization: `Bearer ${env().service}` };
}

function userHeaders(token: string) {
  return { apikey: env().anon, Authorization: `Bearer ${token}` };
}

type Rest = { status: number; ok: boolean; rows: Record<string, unknown>[]; text: string };

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown } = { headers: {} },
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

const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: serviceHeaders() });
const asUser = (token: string, path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: userHeaders(token) });

/* ----------------------------------------------------------- fixturi -- */

let clientId = "";
let productId = "";

async function anyCategoryId(): Promise<string> {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(rows.rows.length, "nu exista nicio categorie, deci nu se poate scrie un produs").toBeGreaterThan(0);
  return String(rows.rows[0]!.id);
}

/** Stocul este loturi minus pozitii de iesire: o comanda, o pozitie si un lot. */
async function seedStock(quantity: number): Promise<void> {
  const order = await asService("inbound_orders?select=id", {
    method: "POST",
    body: { reference: `${TAG}-IN`, supplier_name: `${TAG} furnizor` },
  });
  expect(order.ok, `comanda de test nu a putut fi scrisa: ${order.text}`).toBe(true);
  const orderId = String(order.rows[0]!.id);

  const line = await asService("order_lines?select=id", {
    method: "POST",
    body: { inbound_order_id: orderId, product_id: productId, quantity, unit_price: 10 },
  });
  expect(line.ok, `pozitia comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);

  const batch = await asService("batches?select=id", {
    method: "POST",
    body: { product_id: productId, inbound_order_id: orderId, order_line_id: String(line.rows[0]!.id), quantity },
  });
  expect(batch.ok, `lotul nu a putut fi scris: ${batch.text}`).toBe(true);
}

/** Pozitiile unei iesiri, citite cu cheia de serviciu: adevarul, nu ce vede contul. */
async function linesOf(issueId: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(
    `outbound_lines?select=id,product_id,quantity,sale_price_mdl&outbound_issue_id=eq.${issueId}&order=id.asc`,
  );
  expect(rows.ok, `pozitiile nu au putut fi citite: ${rows.text}`).toBe(true);
  return rows.rows;
}

async function accessToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${env().origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env().anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`autentificarea API a raspuns ${response.status}`);
  }
  return body.access_token;
}

/** Un cont nou, cu profil activ, ca sa nu atingem conturile comune de test. */
async function newAccount(
  label: string,
  role: "account_manager" | "owner",
): Promise<{ id: string; token: string }> {
  const email = `p3-199-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-199-${randomUUID()}`;
  const created = await fetch(`${env().origin}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await created.json().catch(() => ({}))) as { id?: string };
  expect(created.ok && Boolean(body.id), "contul de test nu a putut fi creat").toBe(true);
  const id = String(body.id);

  const profile = await asService("profiles?on_conflict=id", {
    method: "POST",
    body: [{ id, email, role, full_name: "Test P3-199", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return { id, token: await accessToken(email, password) };
}

/** O iesire GOALA a unui cont, scrisa cu cheia de serviciu. */
async function emptyIssueOf(accountId: string, reference: string): Promise<string> {
  const created = await asService("outbound_issues?select=id", {
    method: "POST",
    body: {
      reference,
      issue_mode: "direct_client",
      client_id: clientId,
      pickup_date: "2026-10-09",
      status: "awaiting_shipment",
      created_by: accountId,
    },
  });
  expect(created.ok, `iesirea goala nu a putut fi scrisa: ${created.status} ${created.text}`).toBe(true);
  return String(created.rows[0]!.id);
}

/** O iesire catre client direct, scrisa prin usa pe care o foloseste ecranul. */
async function createDirectIssue(token: string, reference: string): Promise<string> {
  const created = await asUser(token, "rpc/create_direct_client_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_lines: [{ product_id: productId, quantity: 1, sale_price_mdl: 20 }],
      p_client_id: clientId,
      p_pickup_date: "2026-10-09",
    },
  });
  expect(created.ok, `iesirea nu a putut fi scrisa: ${created.status} ${created.text}`).toBe(true);
  return String(created.rows[0]);
}

async function takeStock(token: string, issueId: string, quantity: number): Promise<Rest> {
  return asUser(token, "rpc/outbound_issue_take_stock", {
    method: "POST",
    body: { p_issue_id: issueId, p_lines: [{ product_id: productId, quantity }] },
  });
}

test.beforeAll(async () => {
  const client = await asService("clients?select=id", { method: "POST", body: { name: `${TAG} client` } });
  expect(client.ok, `clientul de test nu a putut fi scris: ${client.text}`).toBe(true);
  clientId = String(client.rows[0]!.id);

  const product = await asService("products?select=id", {
    method: "POST",
    body: {
      sku: `${TAG}-SKU`,
      name: `${TAG} produs`,
      category_id: await anyCategoryId(),
      unit: "pcs",
      unit_value_mdl: 10,
    },
  });
  expect(product.ok, `produsul de test nu a putut fi scris: ${product.text}`).toBe(true);
  productId = String(product.rows[0]!.id);

  await seedStock(100);
});

/* =======================================================================
   (a) IESIREA ALTUIA: REFUZ, FARA NICIO POZITIE NOUA
   ======================================================================= */

test("P3-199: un operator nu poate scadea stocul pe iesirea creata de altcineva", async () => {
  const author = await newAccount("autor-a", "account_manager");
  const other = await newAccount("alt-operator-a", "account_manager");

  // Iesire goala a autorului: singura diferenta fata de martor este cine cheama.
  const issueId = await emptyIssueOf(author.id, `${TAG}-ALTUL`);

  const refused = await takeStock(other.token, issueId, 1);
  expect(refused.ok, "alt operator: rutina a ADAUGAT pozitii pe iesirea altcuiva").toBe(false);
  expect(refused.text, "refuzul spune de ce, in romana").toContain("Doar proprietarul");
  expect(await linesOf(issueId), "nicio pozitie nu s-a scris dupa refuz").toEqual([]);

  // MARTORUL: autorul, pe aceeasi iesire goala, este lasat.
  const allowed = await takeStock(author.token, issueId, 1);
  expect(allowed.ok, `autorul pe iesirea lui goala: rutina a refuzat: ${allowed.status} ${allowed.text}`).toBe(true);
  expect(await linesOf(issueId), "autorul a scris exact o pozitie").toHaveLength(1);
});

/* =======================================================================
   (b) IESIREA CARE ARE DEJA POZITII: REFUZ PENTRU UN NEPROPRIETAR
   ======================================================================= */

test("P3-199: pe o iesire care are deja pozitii, un neproprietar este refuzat, chiar si autorul", async () => {
  const author = await newAccount("autor-b", "account_manager");
  const other = await newAccount("alt-operator-b", "account_manager");

  // Usa ecranului: iesirea se naste cu o pozitie.
  const issueId = await createDirectIssue(author.token, `${TAG}-CU-POZITII`);
  const before = await linesOf(issueId);
  expect(before, "usa a scris pozitia ei").toHaveLength(1);

  const byAuthor = await takeStock(author.token, issueId, 1);
  expect(byAuthor.ok, "autorul a ADAUGAT pozitii pe o iesire care are deja una").toBe(false);
  const byOther = await takeStock(other.token, issueId, 1);
  expect(byOther.ok, "alt operator a ADAUGAT pozitii pe o iesire cu pozitii").toBe(false);

  expect(await linesOf(issueId), "pozitiile sunt exact cele de dinainte").toEqual(before);
});

/* =======================================================================
   (c) CE MERGE CA INAINTE
   ======================================================================= */

test("P3-199: autorul pe iesirea lui goala si proprietarul sunt lasati, iar cele doua usi merg", async () => {
  const author = await newAccount("autor-c", "account_manager");
  const owner = await newAccount("proprietar-c", "owner");

  // Prima scadere a autorului pe iesirea lui goala.
  const emptyIssue = await emptyIssueOf(author.id, `${TAG}-AUTOR-GOALA`);
  const first = await takeStock(author.token, emptyIssue, 2);
  expect(first.ok, `autor, iesire goala: rutina a refuzat: ${first.status} ${first.text}`).toBe(true);
  expect(await linesOf(emptyIssue), "autor: o pozitie scrisa").toHaveLength(1);

  // Proprietarul adauga pe o iesire care are deja pozitii, a altcuiva.
  const ownerCall = await takeStock(owner.token, emptyIssue, 3);
  expect(ownerCall.ok, `proprietar: rutina a refuzat: ${ownerCall.status} ${ownerCall.text}`).toBe(true);
  expect(await linesOf(emptyIssue), "proprietar: a doua pozitie scrisa").toHaveLength(2);

  // Ambele usi ale ecranelor, pentru un operator, ca inainte.
  const direct = await createDirectIssue(author.token, `${TAG}-USA-DIRECT`);
  expect(await linesOf(direct), "usa client direct: o pozitie").toHaveLength(1);

  const project = await asService("projects?select=id", {
    method: "POST",
    body: { client_id: clientId, name: `${TAG} proiect` },
  });
  expect(project.ok, `proiectul de test nu a putut fi scris: ${project.text}`).toBe(true);
  const viaProject = await asUser(author.token, "rpc/create_outbound_issue", {
    method: "POST",
    body: {
      p_reference: `${TAG}-USA-PROIECT`,
      p_client_name: "",
      p_project_name: "",
      p_lines: [{ product_id: productId, quantity: 1, sale_price_mdl: 25 }],
      p_project_id: String(project.rows[0]!.id),
    },
  });
  expect(viaProject.ok, `usa proiectului a refuzat: ${viaProject.status} ${viaProject.text}`).toBe(true);
  expect(await linesOf(String(viaProject.rows[0])), "usa proiect: o pozitie").toHaveLength(1);
});
