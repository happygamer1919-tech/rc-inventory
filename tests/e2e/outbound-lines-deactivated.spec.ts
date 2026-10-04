import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// outbound-lines-deactivated.spec - linia de acceptanta a cardului P3-138.
//
// CE SE DOVEDESTE. Migratia 0069 pune pe public.outbound_lines acelasi predicat
// pe care 0067 l-a pus pe antetul iesirii: public.current_app_role() is not null.
// Un postgres gol ruleaza ca superutilizator si ocoleste politicile, deci
// asertiunea assertions/0069 poate arata doar ca politicile EXISTA. Ce lasa ele
// sa treaca se vede numai cu jetoane adevarate prin PostgREST, si de aici vine.
//
// FIECARE CAZ ARE UN MARTOR. Acelasi cont face intai, cat timp este activ, exact
// lucrul care apoi trebuie refuzat. Fara martor, un refuz ar trece si pe o
// tabela pe care nimeni nu o poate atinge, adica si pe o politica stricata.
//
// public.outbound_issue_take_stock NU ARE UN REFUZ AL SAU. Este SECURITY INVOKER,
// deci inserarea pozitiilor din ea trece prin politica de inserare a apelantului.
// Cazul de mai jos o cheama direct, pe o iesire care exista deja, adica exact
// calea pe care un cont dezactivat ar fi putut scadea stocul inainte de 0069.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici
// este prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3138-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "outbound-lines-deactivated.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
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
    body: {
      product_id: productId,
      inbound_order_id: orderId,
      order_line_id: String(line.rows[0]!.id),
      quantity,
    },
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

/** Un cont nou, cu profil activ de operator, care se poate dezactiva fara sa
 *  atinga conturile comune de test, pe care alte specificatii le folosesc. */
async function newDeactivatableAccount(label: string): Promise<{ id: string; token: string }> {
  const email = `p3-138-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-138-${randomUUID()}`;
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
    body: [{ id, email, role: "account_manager", full_name: "Test P3-138", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return { id, token: await accessToken(email, password) };
}

async function deactivate(id: string): Promise<void> {
  const off = await asService(`profiles?id=eq.${id}`, { method: "PATCH", body: { active: false } });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);
}

/** O iesire catre client direct, scrisa de cont prin functia aplicatiei. */
async function createIssue(token: string, reference: string): Promise<string> {
  const created = await asUser(token, "rpc/create_direct_client_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_lines: [{ product_id: productId, quantity: 1, sale_price_mdl: 20 }],
      p_client_id: clientId,
      p_pickup_date: "2026-10-04",
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
   UN CONT DEZACTIVAT NU MAI ATINGE POZITIILE DE IESIRE
   ======================================================================= */

test("pozitii iesire: un cont dezactivat nu citeste nicio pozitie direct pe tabela", async () => {
  const { id, token } = await newDeactivatableAccount("citire");
  const issueId = await createIssue(token, `${TAG}-CITIRE`);

  // MARTORUL: activ, contul citeste pozitia direct pe tabela.
  const witness = await asUser(token, `outbound_lines?select=id,quantity,sale_price_mdl&outbound_issue_id=eq.${issueId}`);
  expect(witness.status, "profil activ: citirea raspunde 200").toBe(200);
  expect(witness.rows, "profil activ: contul citeste pozitia").toHaveLength(1);

  await deactivate(id);

  // Un refuz de citire este un set gol si nu o eroare: politica filtreaza randuri.
  const blind = await asUser(token, `outbound_lines?select=id,quantity,sale_price_mdl&outbound_issue_id=eq.${issueId}`);
  expect(blind.status, "profil dezactivat: citirea raspunde tot 200").toBe(200);
  expect(blind.rows, "profil dezactivat: nicio pozitie").toEqual([]);

  const all = await asUser(token, "outbound_lines?select=id&limit=5");
  expect(all.rows, "profil dezactivat: nicio pozitie din nicio iesire").toEqual([]);

  // Si pozitia exista in continuare: nu a disparut, doar nu se mai vede.
  expect(await linesOf(issueId), "pozitia este tot acolo").toHaveLength(1);
});

test("pozitii iesire: un cont dezactivat nu poate adauga si nici schimba o pozitie", async () => {
  const { id, token } = await newDeactivatableAccount("scriere");
  const issueId = await createIssue(token, `${TAG}-SCRIERE`);

  // MARTORII: activ, contul adauga o pozitie direct pe tabela si schimba un pret.
  const added = await asUser(token, "outbound_lines?select=id", {
    method: "POST",
    body: { outbound_issue_id: issueId, product_id: productId, quantity: 1, sale_price_mdl: 20 },
  });
  expect(added.ok, `profil activ: contul nu a putut adauga o pozitie: ${added.status} ${added.text}`).toBe(true);
  const lineId = String(added.rows[0]!.id);

  const changed = await asUser(token, `outbound_lines?id=eq.${lineId}&select=id,sale_price_mdl`, {
    method: "PATCH",
    body: { sale_price_mdl: 21 },
  });
  expect(changed.ok, `profil activ: contul nu a putut schimba pozitia: ${changed.text}`).toBe(true);
  expect(changed.rows, "profil activ: pozitia schimbata se intoarce").toHaveLength(1);

  await deactivate(id);
  const before = await linesOf(issueId);
  expect(before, "doua pozitii inainte de refuz").toHaveLength(2);

  const refusedInsert = await asUser(token, "outbound_lines?select=id", {
    method: "POST",
    body: { outbound_issue_id: issueId, product_id: productId, quantity: 1, sale_price_mdl: 20 },
  });
  expect(refusedInsert.ok, "profil dezactivat: contul a ADAUGAT o pozitie").toBe(false);

  // O actualizare refuzata de politica nu este o eroare: atinge zero randuri.
  // De aceea se citeste si adevarul cu cheia de serviciu.
  const refusedUpdate = await asUser(token, `outbound_lines?id=eq.${lineId}&select=id,sale_price_mdl`, {
    method: "PATCH",
    body: { sale_price_mdl: 999 },
  });
  expect(refusedUpdate.rows, "profil dezactivat: nicio pozitie schimbata").toEqual([]);

  expect(await linesOf(issueId), "pozitiile sunt exact cele de dinainte").toEqual(before);
});

test("pozitii iesire: un cont dezactivat nu poate scadea stocul prin outbound_issue_take_stock", async () => {
  const { id, token } = await newDeactivatableAccount("stoc");
  const issueId = await createIssue(token, `${TAG}-STOC`);

  // MARTORUL: activ, contul scade stocul direct prin rutina, pe iesirea lui.
  const allowed = await takeStock(token, issueId, 2);
  expect(allowed.ok, `profil activ: rutina a refuzat: ${allowed.status} ${allowed.text}`).toBe(true);

  await deactivate(id);
  const before = await linesOf(issueId);

  const refused = await takeStock(token, issueId, 3);
  expect(refused.ok, "profil dezactivat: rutina a SCAZUT stocul").toBe(false);

  // Nicio pozitie noua, deci stocul nu s-a miscat: stocul este loturi minus pozitii.
  expect(await linesOf(issueId), "nicio pozitie noua dupa refuz").toEqual(before);
});

test("pozitii iesire: un operator activ lucreaza ca inainte, prin ambele usi si direct", async () => {
  // CE NU TREBUIE SA SE SCHIMBE: un cont activ creeaza iesirea, isi citeste
  // pozitiile, scade stocul prin rutina si vede pozitiile scrise de altcineva.
  const { token } = await newDeactivatableAccount("activ");
  const issueId = await createIssue(token, `${TAG}-ACTIV`);
  expect((await takeStock(token, issueId, 1)).ok, "profil activ: rutina merge").toBe(true);

  const read = await asUser(token, `outbound_lines?select=id&outbound_issue_id=eq.${issueId}`);
  expect(read.rows, "profil activ: vede ambele pozitii").toHaveLength(2);

  const other = await newDeactivatableAccount("alt-activ");
  const otherIssue = await createIssue(other.token, `${TAG}-ALT`);
  const crossRead = await asUser(token, `outbound_lines?select=id&outbound_issue_id=eq.${otherIssue}`);
  expect(crossRead.rows, "profil activ: vede si pozitiile scrise de alt operator").toHaveLength(1);
});
