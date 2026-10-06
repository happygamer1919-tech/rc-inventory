import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// take-stock-guard.spec - linia de acceptanta a cardului P3-185.
//
// CE SE DOVEDESTE, cu jetoane adevarate prin PostgREST, pe stiva locala din CI:
//   1. public.outbound_issue_take_stock refuza o iesire care nu mai asteapta
//      expedierea si nu scrie nici pozitie, nici rand de istoric.
//   2. Un operator (account_manager) activ nu mai poate adauga direct o pozitie
//      si nici schimba direct sale_price_mdl pe outbound_lines.
//   3. Proprietarul poate inca, iar fluxul ecranelor (ambele usi, apoi expedierea)
//      merge pentru operator exact ca inainte.
//
// FIECARE REFUZ ARE UN MARTOR: acelasi cont face intai lucrul permis cel mai
// apropiat, ca un refuz sa nu treaca si pe o cale pe care nu o poate folosi nimeni.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici este
// prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3185-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "take-stock-guard.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
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
let projectId = "";
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

/** Randurile de istoric ale unei iesiri, cu cheia de serviciu. */
async function historyOf(issueId: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(
    `status_history?select=id,from_status,to_status&entity_type=eq.outbound_issue&entity_id=eq.${issueId}&order=id.asc`,
  );
  expect(rows.ok, `istoricul nu a putut fi citit: ${rows.text}`).toBe(true);
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
async function newAccount(label: string, role: "account_manager" | "owner"): Promise<string> {
  const email = `p3-185-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-185-${randomUUID()}`;
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
    body: [{ id, email, role, full_name: "Test P3-185", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return accessToken(email, password);
}

/** O iesire catre client direct, scrisa prin usa pe care o foloseste ecranul. */
async function createDirectIssue(token: string, reference: string, price = 20): Promise<string> {
  const created = await asUser(token, "rpc/create_direct_client_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_lines: [{ product_id: productId, quantity: 1, sale_price_mdl: price }],
      p_client_id: clientId,
      p_pickup_date: "2026-10-06",
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

async function ship(token: string, issueId: string): Promise<Rest> {
  return asUser(token, "rpc/ship_outbound_issue", { method: "POST", body: { p_issue_id: issueId } });
}

test.beforeAll(async () => {
  const client = await asService("clients?select=id", { method: "POST", body: { name: `${TAG} client` } });
  expect(client.ok, `clientul de test nu a putut fi scris: ${client.text}`).toBe(true);
  clientId = String(client.rows[0]!.id);

  const project = await asService("projects?select=id", {
    method: "POST",
    body: { client_id: clientId, name: `${TAG} proiect` },
  });
  expect(project.ok, `proiectul de test nu a putut fi scris: ${project.text}`).toBe(true);
  projectId = String(project.rows[0]!.id);

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
   1. STOCUL NU SE MAI SCADE PE O IESIRE EXPEDIATA
   ======================================================================= */

test("P3-185: take stock pe o iesire expediata este refuzat si nu scrie nici pozitie, nici istoric", async () => {
  const manager = await newAccount("expediata", "account_manager");
  const issueId = await createDirectIssue(manager, `${TAG}-EXPEDIATA`);

  // MARTORUL: cat timp iesirea asteapta expedierea, rutina merge pentru acelasi cont.
  const allowed = await takeStock(manager, issueId, 1);
  expect(allowed.ok, `iesire in asteptare: rutina a refuzat: ${allowed.status} ${allowed.text}`).toBe(true);

  const shipped = await ship(manager, issueId);
  expect(shipped.ok, `expedierea nu a mers: ${shipped.status} ${shipped.text}`).toBe(true);

  const linesBefore = await linesOf(issueId);
  const historyBefore = await historyOf(issueId);
  expect(linesBefore, "doua pozitii inainte de refuz").toHaveLength(2);

  const refused = await takeStock(manager, issueId, 3);
  expect(refused.ok, "iesire expediata: rutina a SCAZUT stocul").toBe(false);
  expect(refused.text, "refuzul spune de ce, in romana").toContain("deja expedia");

  expect(await linesOf(issueId), "nicio pozitie noua dupa refuz").toEqual(linesBefore);
  expect(await historyOf(issueId), "niciun rand de istoric nou dupa refuz").toEqual(historyBefore);
});

/* =======================================================================
   2. UN OPERATOR NU MAI SCRIE DIRECT PE outbound_lines
   ======================================================================= */

test("P3-185: un operator activ nu poate adauga direct o pozitie si nici schimba pretul de vanzare", async () => {
  const manager = await newAccount("scriere", "account_manager");
  const issueId = await createDirectIssue(manager, `${TAG}-SCRIERE`);

  // MARTORUL: contul este activ si isi vede pozitia, deci refuzurile de mai jos
  // vin din regula de scriere si nu dintr-un cont fara acces.
  const visible = await asUser(manager, `outbound_lines?select=id,sale_price_mdl&outbound_issue_id=eq.${issueId}`);
  expect(visible.rows, "operator activ: isi vede pozitia").toHaveLength(1);
  const lineId = String(visible.rows[0]!.id);
  const before = await linesOf(issueId);

  const inserted = await asUser(manager, "outbound_lines?select=id", {
    method: "POST",
    body: { outbound_issue_id: issueId, product_id: productId, quantity: 1, sale_price_mdl: 1 },
  });
  expect(inserted.ok, "operator activ: a ADAUGAT direct o pozitie").toBe(false);

  // O actualizare refuzata de politica atinge zero randuri si nu este o eroare.
  const patched = await asUser(manager, `outbound_lines?id=eq.${lineId}&select=id,sale_price_mdl`, {
    method: "PATCH",
    body: { sale_price_mdl: 999 },
  });
  expect(patched.rows, "operator activ: niciun pret schimbat").toEqual([]);

  expect(await linesOf(issueId), "pozitiile sunt exact cele de dinainte").toEqual(before);
});

/* =======================================================================
   3. PROPRIETARUL SI FLUXUL ECRANELOR MERG CA INAINTE
   ======================================================================= */

test("P3-185: proprietarul poate inca adauga o pozitie si schimba pretul direct", async () => {
  const owner = await newAccount("proprietar", "owner");
  const issueId = await createDirectIssue(owner, `${TAG}-PROPRIETAR`);
  const [first] = await linesOf(issueId);

  const inserted = await asUser(owner, "outbound_lines?select=id", {
    method: "POST",
    body: { outbound_issue_id: issueId, product_id: productId, quantity: 1, sale_price_mdl: 30 },
  });
  expect(inserted.ok, `proprietar: pozitia nu a putut fi adaugata: ${inserted.status} ${inserted.text}`).toBe(true);

  const patched = await asUser(owner, `outbound_lines?id=eq.${String(first!.id)}&select=id,sale_price_mdl`, {
    method: "PATCH",
    body: { sale_price_mdl: 21 },
  });
  expect(patched.ok, `proprietar: pretul nu a putut fi schimbat: ${patched.text}`).toBe(true);
  expect(patched.rows, "proprietar: pozitia schimbata se intoarce").toHaveLength(1);

  const after = await linesOf(issueId);
  expect(after, "proprietar: doua pozitii").toHaveLength(2);
  expect(Number(after.find((l) => l.id === first!.id)?.sale_price_mdl), "pretul nou este scris").toBe(21);
});

test("P3-185: un operator creeaza ambele feluri de iesire si o expediaza, ca inainte", async () => {
  const manager = await newAccount("flux", "account_manager");

  const project = await asUser(manager, "rpc/create_outbound_issue", {
    method: "POST",
    body: {
      p_reference: `${TAG}-FLUX-PROIECT`,
      p_client_name: "",
      p_project_name: "",
      p_lines: [{ product_id: productId, quantity: 2, sale_price_mdl: 25 }],
      p_project_id: projectId,
    },
  });
  expect(project.ok, `usa proiectului a refuzat: ${project.status} ${project.text}`).toBe(true);
  const projectIssue = String(project.rows[0]);

  const directIssue = await createDirectIssue(manager, `${TAG}-FLUX-DIRECT`, 26);

  const projectLines = await linesOf(projectIssue);
  expect(projectLines, "iesirea pe proiect are pozitia ei").toHaveLength(1);
  expect(Number(projectLines[0]!.sale_price_mdl), "pretul de pe ecran ajunge pe pozitie").toBe(25);
  const directLines = await linesOf(directIssue);
  expect(directLines, "iesirea catre client direct are pozitia ei").toHaveLength(1);
  expect(Number(directLines[0]!.sale_price_mdl), "pretul de pe ecran ajunge pe pozitie").toBe(26);

  expect(await historyOf(projectIssue), "un singur rand de istoric la creare").toHaveLength(1);

  const shipped = await ship(manager, projectIssue);
  expect(shipped.ok, `expedierea nu a mers: ${shipped.status} ${shipped.text}`).toBe(true);
  expect(await historyOf(projectIssue), "expedierea adauga al doilea rand de istoric").toHaveLength(2);

  // Peste stoc, refuzul de pe ecran ramane cel de dinainte.
  const tooMuch = await asUser(manager, "rpc/create_direct_client_issue", {
    method: "POST",
    body: {
      p_reference: `${TAG}-FLUX-PREA-MULT`,
      p_lines: [{ product_id: productId, quantity: 100000, sale_price_mdl: 1 }],
      p_client_id: clientId,
      p_pickup_date: "2026-10-06",
    },
  });
  expect(tooMuch.ok, "peste stoc: iesirea a fost scrisa").toBe(false);
  expect(tooMuch.text, "contractul INSUFFICIENT_STOCK este neschimbat").toContain("INSUFFICIENT_STOCK");
});
