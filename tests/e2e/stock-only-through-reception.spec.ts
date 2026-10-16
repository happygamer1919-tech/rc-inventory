import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// stock-only-through-reception.spec - linia de acceptanta a cardului P3-312.
//
// CE SE DOVEDESTE. Migratia 0087 inchide trei usi prin care stocul urca fara
// livrare, toate trei ocolind ecranele:
//   1. un lot scris direct pe tabela (stocul este suma loturilor minus iesirile);
//   2. o pozitie de comanda adaugata sau marita direct inainte de receptie
//      (receptia copiaza cantitatea pozitiei in lot);
//   3. o comanda salvata direct ca deja sosita, pe numele altcuiva, cu orice total.
// Lotul il creeaza numai receptia, pozitia o scriu numai functiile ecranelor
// Comanda noua si confirmarea ciornei, iar comanda noua incepe in asteptare, pe
// numele celui care o salveaza, cu totalul calculat din pozitii. Asertiunea
// assertions/0087 dovedeste acelasi lucru pe un postgres gol; aici se vede prin
// PostgREST, cu jetoane adevarate.
//
// FIECARE REFUZ ARE UN MARTOR. Acelasi cont face, prin functiile aplicatiei, exact
// lucrul pe care calea directa nu il mai poate face: creeaza comanda cu pozitia ei
// si o receptioneaza. Fara martor, un refuz ar trece si pe o tabela pe care nimeni
// nu o poate atinge, adica si pe o politica stricata.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici este
// prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3312-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "stock-only-through-reception.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
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

let categoryId = "";

async function newProduct(label: string): Promise<string> {
  const product = await asService("products?select=id", {
    method: "POST",
    body: {
      sku: `${TAG}-${label}-SKU`,
      name: `${TAG} produs ${label}`,
      category_id: categoryId,
      unit: "pcs",
      unit_value_mdl: 10,
    },
  });
  expect(product.ok, `produsul de test nu a putut fi scris: ${product.text}`).toBe(true);
  return String(product.rows[0]!.id);
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

/** Un cont nou, cu profil activ, ca sa nu atinga conturile comune de test. */
async function newAccount(
  label: string,
  role: "account_manager" | "owner" = "account_manager",
): Promise<{ id: string; token: string }> {
  const email = `p3-312-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-312-${randomUUID()}`;
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
    body: [{ id, email, role, full_name: "Test P3-312", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return { id, token: await accessToken(email, password) };
}

/** O comanda creata de cont prin functia aplicatiei, ca ecranul Comanda noua.
 *  Patru bucati la 10 lei: ecranul calculeaza 40. */
async function createOrder(token: string, reference: string, productId: string, totalMdl = 40): Promise<Rest> {
  return asUser(token, "rpc/create_inbound_order", {
    method: "POST",
    body: {
      p_reference: reference,
      p_supplier_name: `${TAG} furnizor`,
      p_currency: "MDL",
      p_ordered_at: null,
      p_expected_at: "2026-10-20",
      p_total_mdl: totalMdl,
      p_lines: [{ product_id: productId, quantity: 4, unit_price: 10 }],
    },
  });
}

async function receiveOrder(token: string, orderId: string): Promise<Rest> {
  return asUser(token, "rpc/receive_inbound_order", { method: "POST", body: { p_order_id: orderId } });
}

/** Adevarul, citit cu cheia de serviciu, nu ce vede contul. */
async function truth(path: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(path);
  expect(rows.ok, `${path}: ${rows.text}`).toBe(true);
  return rows.rows;
}

async function stockOf(productId: string): Promise<number> {
  const rows = await truth(`batches?select=quantity&product_id=eq.${productId}`);
  return rows.reduce((t, r) => t + Number(r.quantity), 0);
}

test.beforeAll(async () => {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(rows.rows.length, "nu exista nicio categorie, deci nu se poate scrie un produs").toBeGreaterThan(0);
  categoryId = String(rows.rows[0]!.id);
});

/* =======================================================================
   1. UN LOT SE CREEAZA NUMAI PRIN RECEPTIE
   ======================================================================= */

for (const role of ["account_manager", "owner"] as const) {
  test(`loturi (${role}): un lot scris direct este refuzat, receptia il creeaza`, async () => {
    const { token } = await newAccount(`lot-${role}`, role);
    const productId = await newProduct(`LOT-${role}`);

    const created = await createOrder(token, `${TAG}-LOT-${role}`, productId);
    expect(created.ok, `crearea a fost refuzata: ${created.text}`).toBe(true);
    const orderId = String(created.rows[0]);
    const [line] = await truth(`order_lines?select=id,quantity&inbound_order_id=eq.${orderId}`);
    expect(line, "comanda are pozitia ei").toBeTruthy();

    // Constatarea 0 (HIGH): un lot postat direct pe pozitia unei comenzi in asteptare.
    const forged = await asUser(token, "batches?select=id", {
      method: "POST",
      body: { product_id: productId, inbound_order_id: orderId, order_line_id: line!.id, quantity: 100000 },
    });
    expect(forged.ok, `contul a ADAUGAT direct un lot: ${forged.text}`).toBe(false);
    expect(await stockOf(productId), "stocul nu a urcat").toBe(0);

    // MARTORUL: acelasi cont receptioneaza comanda, iar stocul urca exact cu pozitia.
    const received = await receiveOrder(token, orderId);
    expect(received.ok, `receptia a fost refuzata: ${received.text}`).toBe(true);
    expect(received.rows[0], "un lot creat").toEqual({ created_batches: 1, already_arrived: false });
    expect(await stockOf(productId), "stocul este cantitatea pozitiei").toBe(4);

    // Un lot existent nu se mai schimba: o actualizare refuzata atinge zero randuri.
    const raised = await asUser(token, `batches?inbound_order_id=eq.${orderId}&select=id`, {
      method: "PATCH",
      body: { quantity: 100000 },
    });
    expect(raised.rows, "niciun lot schimbat direct").toEqual([]);
    expect(await stockOf(productId), "stocul a ramas 4").toBe(4);
  });
}

/* =======================================================================
   2. O POZITIE SE SCRIE NUMAI PRIN ECRANUL COMENZII SI NU SE MAI SCHIMBA
   ======================================================================= */

for (const role of ["account_manager", "owner"] as const) {
  test(`pozitii (${role}): nicio pozitie adaugata sau marita direct inainte de receptie`, async () => {
    const { token } = await newAccount(`pozitie-${role}`, role);
    const productId = await newProduct(`POZITIE-${role}`);

    // MARTORUL: prin functia ecranului, comanda primeste pozitia ei.
    const created = await createOrder(token, `${TAG}-POZITIE-${role}`, productId);
    expect(created.ok, `crearea a fost refuzata: ${created.text}`).toBe(true);
    const orderId = String(created.rows[0]);
    const before = await truth(`order_lines?select=id,quantity,unit_price&inbound_order_id=eq.${orderId}`);
    expect(before, "o pozitie, scrisa de functie").toHaveLength(1);

    const added = await asUser(token, "order_lines?select=id", {
      method: "POST",
      body: { inbound_order_id: orderId, product_id: productId, quantity: 100000 },
    });
    expect(added.ok, `contul a ADAUGAT direct o pozitie: ${added.text}`).toBe(false);

    // Constatarea 1: cantitatea pozitiei marita, apoi receptie.
    for (const body of [{ quantity: 100000 }, { unit_price: 999 }]) {
      const changed = await asUser(token, `order_lines?inbound_order_id=eq.${orderId}&select=id`, {
        method: "PATCH",
        body,
      });
      expect(changed.rows, `nicio pozitie schimbata direct prin ${Object.keys(body).join(", ")}`).toEqual([]);
    }
    expect(
      await truth(`order_lines?select=id,quantity,unit_price&inbound_order_id=eq.${orderId}`),
      "pozitia este exact cea de dinainte",
    ).toEqual(before);

    const received = await receiveOrder(token, orderId);
    expect(received.ok, `receptia a fost refuzata: ${received.text}`).toBe(true);
    expect(await stockOf(productId), "receptia aduce cantitatea comandata, nu alta").toBe(4);
  });
}

/* =======================================================================
   3. O COMANDA NOUA INCEPE IN ASTEPTARE, PE NUMELE CELUI CARE O SALVEAZA
   ======================================================================= */

test("comenzi: o comanda nu se salveaza direct, nici sosita, nici pe numele altcuiva", async () => {
  const owner = await newAccount("comanda-proprietar", "owner");
  const { id, token } = await newAccount("comanda");

  // Constatarea 2: o comanda salvata direct ca deja sosita, cu orice total.
  const refusals = [
    {
      label: "SOSITA",
      body: { status: "arrived", arrived_at: new Date().toISOString(), total_mdl: 999999 },
      says: "Sosirea se confirmă numai prin recepție",
    },
    { label: "ALTUL", body: { created_by: owner.id }, says: "numai pe numele contului care o salvează" },
    { label: "DIRECT", body: { total_mdl: 999999 }, says: "numai din ecranul de comenzi" },
  ];
  for (const r of refusals) {
    const reference = `${TAG}-COMANDA-${r.label}`;
    const refused = await asUser(token, "inbound_orders?select=id", {
      method: "POST",
      body: { reference, supplier_name: `${TAG} furnizor`, ...r.body },
    });
    expect(refused.ok, `contul a SALVAT direct comanda ${r.label}`).toBe(false);
    expect(refused.text, "refuzul spune de ce, in romana").toContain(r.says);
    expect(await truth(`inbound_orders?select=id&reference=eq.${reference}`), `nicio comanda ${r.label}`).toEqual([]);
  }

  // MARTORUL: prin functia ecranului comanda se salveaza, in asteptare, pe numele
  // contului, cu totalul calculat din pozitii chiar daca apelul numeste altul.
  const productId = await newProduct("COMANDA");
  const reference = `${TAG}-COMANDA-ECRAN`;
  const created = await createOrder(token, reference, productId, 999999);
  expect(created.ok, `crearea a fost refuzata: ${created.text}`).toBe(true);
  const [order] = await truth(
    `inbound_orders?select=status,arrived_at,created_by,total_mdl&reference=eq.${encodeURIComponent(reference)}`,
  );
  expect({ ...order, total_mdl: Number(order?.total_mdl) }, "comanda salvata de ecran").toEqual({
    status: "pending_arrival",
    arrived_at: null,
    created_by: id,
    total_mdl: 40,
  });
});
