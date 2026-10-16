import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// inbound-active-account.spec - linia de acceptanta a cardului P3-180.
//
// CE SE DOVEDESTE. Migratia 0086 pune pe public.inbound_orders, public.order_lines
// si public.reminders predicatul pe care 0067, 0070 si 0073 l-au pus pe iesiri si
// pe loturi: public.current_app_role() is not null. Pe langa asta, un declansator
// pe inbound_orders lasa starea sa treaca la "sosita" numai prin
// receive_inbound_order si nu mai lasa pe nimeni sa schimbe totalul sau numarul
// unei comenzi dupa salvare. Asertiunea assertions/0086 dovedeste acelasi lucru pe
// un postgres gol; aici se vede prin PostgREST, cu jetoane adevarate.
//
// FIECARE CAZ ARE UN MARTOR. Acelasi cont face intai, cat timp este activ, exact
// lucrul care apoi trebuie refuzat. Fara martor, un refuz ar trece si pe o tabela
// pe care nimeni nu o poate atinge, adica si pe o politica stricata.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07. Tot ce se scrie aici este
// prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3180-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "inbound-active-account.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
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

/** O comanda in asteptare cu o pozitie, scrisa cu cheia de serviciu. */
async function seededOrder(reference: string, productId: string): Promise<{ orderId: string; lineId: string }> {
  const order = await asService("inbound_orders?select=id", {
    method: "POST",
    body: { reference, supplier_name: `${TAG} furnizor` },
  });
  expect(order.ok, `comanda de test nu a putut fi scrisa: ${order.text}`).toBe(true);
  const orderId = String(order.rows[0]!.id);
  const line = await asService("order_lines?select=id", {
    method: "POST",
    body: { inbound_order_id: orderId, product_id: productId, quantity: 5, unit_price: 10 },
  });
  expect(line.ok, `pozitia comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);
  return { orderId, lineId: String(line.rows[0]!.id) };
}

/** Comanda, citita cu cheia de serviciu: adevarul, nu ce vede contul. */
async function orderTruth(orderId: string): Promise<Record<string, unknown>> {
  const rows = await asService(
    `inbound_orders?select=reference,supplier_name,status,arrived_at,total_mdl,document_path&id=eq.${orderId}`,
  );
  expect(rows.ok, `comanda nu a putut fi citita: ${rows.text}`).toBe(true);
  expect(rows.rows, "comanda exista").toHaveLength(1);
  return rows.rows[0]!;
}

async function linesTruth(orderId: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(`order_lines?select=id,quantity,unit_price&inbound_order_id=eq.${orderId}&order=id.asc`);
  expect(rows.ok, `pozitiile nu au putut fi citite: ${rows.text}`).toBe(true);
  return rows.rows;
}

async function remindersTruth(productId: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(`reminders?select=id,is_armed,email_enabled&product_id=eq.${productId}`);
  expect(rows.ok, `mementourile nu au putut fi citite: ${rows.text}`).toBe(true);
  return rows.rows;
}

async function batchesTruth(orderId: string): Promise<Record<string, unknown>[]> {
  const rows = await asService(`batches?select=id,quantity&inbound_order_id=eq.${orderId}`);
  expect(rows.ok, `loturile nu au putut fi citite: ${rows.text}`).toBe(true);
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

/** Un cont nou, cu profil activ, care se poate dezactiva fara sa atinga conturile
 *  comune de test, pe care alte specificatii le folosesc. */
async function newDeactivatableAccount(
  label: string,
  role: "account_manager" | "owner" = "account_manager",
): Promise<{ id: string; token: string }> {
  const email = `p3-180-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-180-${randomUUID()}`;
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
    body: [{ id, email, role, full_name: "Test P3-180", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return { id, token: await accessToken(email, password) };
}

async function deactivate(id: string): Promise<void> {
  const off = await asService(`profiles?id=eq.${id}`, { method: "PATCH", body: { active: false } });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);
}

/** O comanda creata de cont prin functia aplicatiei, ca ecranul Comanda noua. */
async function createOrder(token: string, reference: string, productId: string): Promise<Rest> {
  return asUser(token, "rpc/create_inbound_order", {
    method: "POST",
    body: {
      p_reference: reference,
      p_supplier_name: `${TAG} furnizor`,
      p_currency: "MDL",
      p_ordered_at: null,
      p_expected_at: "2026-10-20",
      p_total_mdl: 40,
      p_lines: [{ product_id: productId, quantity: 4, unit_price: 10 }],
    },
  });
}

async function receiveOrder(token: string, orderId: string): Promise<Rest> {
  return asUser(token, "rpc/receive_inbound_order", { method: "POST", body: { p_order_id: orderId } });
}

test.beforeAll(async () => {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(rows.rows.length, "nu exista nicio categorie, deci nu se poate scrie un produs").toBeGreaterThan(0);
  categoryId = String(rows.rows[0]!.id);
});

/* =======================================================================
   UN CONT DEZACTIVAT NU MAI ATINGE COMENZILE DE INTRARE
   ======================================================================= */

test("comenzi intrare: un cont dezactivat nu citeste nicio comanda, pozitie sau memento", async () => {
  const { id, token } = await newDeactivatableAccount("citire");
  const productId = await newProduct("CITIRE");
  const { orderId } = await seededOrder(`${TAG}-CITIRE`, productId);
  const reminder = await asService("reminders?select=id", { method: "POST", body: { product_id: productId } });
  expect(reminder.ok, `mementoul de test nu a putut fi scris: ${reminder.text}`).toBe(true);

  // MARTORII: activ, contul citeste comanda, pozitia ei si mementoul produsului.
  const order = await asUser(token, `inbound_orders?select=id&id=eq.${orderId}`);
  expect(order.rows, "profil activ: contul vede comanda").toHaveLength(1);
  const lines = await asUser(token, `order_lines?select=id&inbound_order_id=eq.${orderId}`);
  expect(lines.rows, "profil activ: contul vede pozitia").toHaveLength(1);
  const reminders = await asUser(token, `reminders?select=id&product_id=eq.${productId}`);
  expect(reminders.rows, "profil activ: contul vede mementoul").toHaveLength(1);

  await deactivate(id);

  // Un refuz de citire este un set gol si nu o eroare: politica filtreaza randuri.
  for (const path of [
    `inbound_orders?select=id&id=eq.${orderId}`,
    `order_lines?select=id&inbound_order_id=eq.${orderId}`,
    `reminders?select=id&product_id=eq.${productId}`,
    "inbound_orders?select=id&limit=5",
    "order_lines?select=id&limit=5",
    "reminders?select=id&limit=5",
  ]) {
    const blind = await asUser(token, path);
    expect(blind.status, `profil dezactivat: ${path} raspunde tot 200`).toBe(200);
    expect(blind.rows, `profil dezactivat: niciun rand din ${path}`).toEqual([]);
  }

  // Si randurile exista in continuare: nu au disparut, doar nu se mai vad.
  expect((await orderTruth(orderId)).status, "comanda este tot acolo").toBe("pending_arrival");
  expect(await linesTruth(orderId), "pozitia este tot acolo").toHaveLength(1);
  expect(await remindersTruth(productId), "mementoul este tot acolo").toHaveLength(1);
});

test("comenzi intrare: un cont dezactivat nu poate adauga si nici schimba o comanda, o pozitie sau un memento", async () => {
  const { id, token } = await newDeactivatableAccount("scriere");
  const productId = await newProduct("SCRIERE");
  const otherProductId = await newProduct("SCRIERE-ALT");

  // MARTORII: activ, contul adauga o comanda cu pozitia ei si un memento, si le schimba.
  // P3-312 (0087): o comanda si o pozitie se adauga numai prin functia ecranului
  // Comanda noua, iar o pozitie nu se mai schimba deloc, nici de un cont activ
  // (stock-only-through-reception.spec). Martorul comenzii este deci functia.
  const added = await createOrder(token, `${TAG}-SCRIERE`, productId);
  expect(added.ok, `profil activ: contul nu a putut adauga o comanda: ${added.status} ${added.text}`).toBe(true);
  const orderId = String(added.rows[0]);
  const lineId = String((await linesTruth(orderId))[0]!.id);
  const addedReminder = await asUser(token, "reminders?select=id", {
    method: "POST",
    body: { product_id: productId },
  });
  expect(addedReminder.ok, `profil activ: contul nu a putut adauga un memento: ${addedReminder.text}`).toBe(true);

  const changedOrder = await asUser(token, `inbound_orders?id=eq.${orderId}&select=id`, {
    method: "PATCH",
    body: { supplier_name: `${TAG} furnizor martor` },
  });
  expect(changedOrder.rows, "profil activ: comanda schimbata se intoarce").toHaveLength(1);
  const changedReminder = await asUser(token, `reminders?product_id=eq.${productId}&select=id`, {
    method: "PATCH",
    body: { is_armed: false },
  });
  expect(changedReminder.rows, "profil activ: mementoul schimbat se intoarce").toHaveLength(1);

  await deactivate(id);
  const orderBefore = await orderTruth(orderId);
  const linesBefore = await linesTruth(orderId);
  const remindersBefore = await remindersTruth(productId);

  const refusedOrder = await asUser(token, "inbound_orders?select=id", {
    method: "POST",
    body: { reference: `${TAG}-SCRIERE-OPRIT`, supplier_name: `${TAG} furnizor` },
  });
  expect(refusedOrder.ok, "profil dezactivat: contul a ADAUGAT o comanda").toBe(false);
  const refusedLine = await asUser(token, "order_lines?select=id", {
    method: "POST",
    body: { inbound_order_id: orderId, product_id: productId, quantity: 5, unit_price: 10 },
  });
  expect(refusedLine.ok, "profil dezactivat: contul a ADAUGAT o pozitie").toBe(false);
  const refusedReminder = await asUser(token, "reminders?select=id", {
    method: "POST",
    body: { product_id: otherProductId },
  });
  expect(refusedReminder.ok, "profil dezactivat: contul a ADAUGAT un memento").toBe(false);

  // O actualizare refuzata de politica nu este o eroare: atinge zero randuri.
  // De aceea se citeste si adevarul cu cheia de serviciu.
  const updates = [
    { path: `inbound_orders?id=eq.${orderId}&select=id`, body: { supplier_name: `${TAG} furnizor oprit` } },
    { path: `order_lines?id=eq.${lineId}&select=id`, body: { unit_price: 999 } },
    { path: `reminders?product_id=eq.${productId}&select=id`, body: { is_armed: true } },
  ];
  for (const u of updates) {
    const refused = await asUser(token, u.path, { method: "PATCH", body: u.body });
    expect(refused.rows, `profil dezactivat: niciun rand schimbat prin ${u.path}`).toEqual([]);
  }

  expect(await orderTruth(orderId), "comanda este exact cea de dinainte").toEqual(orderBefore);
  expect(await linesTruth(orderId), "pozitiile sunt exact cele de dinainte").toEqual(linesBefore);
  expect(await remindersTruth(productId), "mementoul este exact cel de dinainte").toEqual(remindersBefore);
  expect(await remindersTruth(otherProductId), "niciun memento nou").toEqual([]);
  const stray = await asService(`inbound_orders?select=id&reference=eq.${TAG}-SCRIERE-OPRIT`);
  expect(stray.rows, "nicio comanda scrisa de contul dezactivat").toEqual([]);
});

test("comenzi intrare: un cont dezactivat nu poate crea si nici receptiona o comanda prin functiile aplicatiei", async () => {
  const { id, token } = await newDeactivatableAccount("functii");
  const productId = await newProduct("FUNCTII");

  // MARTORII: activ, contul creeaza o comanda si o receptioneaza prin functii.
  const witness = await createOrder(token, `${TAG}-FUNCTII-MARTOR`, productId);
  expect(witness.ok, `profil activ: crearea a fost refuzata: ${witness.status} ${witness.text}`).toBe(true);
  const witnessId = String(witness.rows[0]);
  const received = await receiveOrder(token, witnessId);
  expect(received.ok, `profil activ: receptia a fost refuzata: ${received.text}`).toBe(true);
  expect(await batchesTruth(witnessId), "profil activ: receptia a creat lotul").toHaveLength(1);

  const { orderId } = await seededOrder(`${TAG}-FUNCTII`, productId);

  await deactivate(id);

  const refusedCreate = await createOrder(token, `${TAG}-FUNCTII-OPRIT`, productId);
  expect(refusedCreate.ok, "profil dezactivat: contul a CREAT o comanda").toBe(false);
  const stray = await asService(`inbound_orders?select=id&reference=eq.${TAG}-FUNCTII-OPRIT`);
  expect(stray.rows, "nicio comanda scrisa de contul dezactivat").toEqual([]);

  // Functia ruleaza cu drepturile apelantului: comanda nu se vede, deci nu exista pentru el.
  const refusedReceive = await receiveOrder(token, orderId);
  expect(refusedReceive.ok, "profil dezactivat: contul a RECEPTIONAT o comanda").toBe(false);
  expect((await orderTruth(orderId)).status, "comanda a ramas in asteptare").toBe("pending_arrival");
  expect(await batchesTruth(orderId), "niciun lot, deci stocul nu a urcat").toEqual([]);
});

/* =======================================================================
   NICIUN CONT NU OCOLESTE RECEPTIA: STAREA, TOTALUL SI NUMARUL
   ======================================================================= */

test("comenzi intrare: o comanda nu se marcheaza sosita direct, iar totalul si numarul nu se schimba", async () => {
  const { token } = await newDeactivatableAccount("garda");
  const productId = await newProduct("GARDA");
  const created = await createOrder(token, `${TAG}-GARDA`, productId);
  expect(created.ok, `crearea a fost refuzata: ${created.text}`).toBe(true);
  const orderId = String(created.rows[0]);
  const before = await orderTruth(orderId);

  // MARTORUL: acelasi cont schimba direct o coloana pe care ecranul o scrie,
  // documentul atasat. Garda nu este un refuz al oricarei schimbari.
  const documentPath = `inbound/${orderId}/factura.pdf`;
  const allowed = await asUser(token, `inbound_orders?id=eq.${orderId}&select=id`, {
    method: "PATCH",
    body: { document_path: documentPath, document_uploaded_at: new Date().toISOString() },
  });
  expect(allowed.ok, `documentul nu a putut fi atasat: ${allowed.status} ${allowed.text}`).toBe(true);
  expect(allowed.rows, "documentul atasat se intoarce").toHaveLength(1);

  const refusals = [
    { body: { status: "arrived", arrived_at: new Date().toISOString() }, says: "se marchează sosită numai prin confirmarea recepției" },
    { body: { total_mdl: 999 }, says: "Valoarea unei comenzi nu se mai poate schimba" },
    { body: { reference: `${TAG}-GARDA-ALT` }, says: "Numărul unei comenzi nu se mai poate schimba" },
  ];
  for (const r of refusals) {
    const refused = await asUser(token, `inbound_orders?id=eq.${orderId}&select=id`, { method: "PATCH", body: r.body });
    expect(refused.ok, `contul a schimbat direct ${Object.keys(r.body).join(", ")}`).toBe(false);
    expect(refused.text, "refuzul spune de ce, in romana").toContain(r.says);
  }

  expect(await orderTruth(orderId), "comanda are doar documentul nou").toEqual({ ...before, document_path: documentPath });
  expect(await batchesTruth(orderId), "niciun lot").toEqual([]);

  // Dupa receptie, starea nu se mai intoarce si data sosirii nu se rescrie.
  expect((await receiveOrder(token, orderId)).ok, "receptia merge").toBe(true);
  const arrived = await orderTruth(orderId);
  for (const body of [{ status: "pending_arrival", arrived_at: null }, { arrived_at: "2026-01-01T00:00:00Z" }]) {
    const refused = await asUser(token, `inbound_orders?id=eq.${orderId}&select=id`, { method: "PATCH", body });
    expect(refused.ok, `contul a schimbat direct ${Object.keys(body).join(", ")} pe comanda sosita`).toBe(false);
  }
  expect(await orderTruth(orderId), "comanda sosita a ramas neatinsa").toEqual(arrived);
});

test("comenzi intrare: proprietarul nu marcheaza nici el o comanda sosita direct", async () => {
  const { token } = await newDeactivatableAccount("garda-proprietar", "owner");
  const productId = await newProduct("GARDA-PROPRIETAR");
  const created = await createOrder(token, `${TAG}-GARDA-PROPRIETAR`, productId);
  expect(created.ok, `crearea a fost refuzata: ${created.text}`).toBe(true);
  const orderId = String(created.rows[0]);
  const before = await orderTruth(orderId);

  for (const body of [{ status: "arrived", arrived_at: new Date().toISOString() }, { total_mdl: 1 }]) {
    const refused = await asUser(token, `inbound_orders?id=eq.${orderId}&select=id`, { method: "PATCH", body });
    expect(refused.ok, `proprietarul a schimbat direct ${Object.keys(body).join(", ")}`).toBe(false);
  }
  expect(await orderTruth(orderId), "comanda a ramas neatinsa").toEqual(before);
});

test("comenzi intrare: un cont activ inregistreaza o sosire cap la cap, ca inainte", async () => {
  // CE NU TREBUIE SA SE SCHIMBE: un cont activ creeaza comanda, o vede, ii vede
  // pozitia, o receptioneaza o singura data, iar stocul urca prin lotul ei.
  const { token } = await newDeactivatableAccount("activ");
  const productId = await newProduct("ACTIV");
  const reference = `${TAG}-ACTIV`;

  const created = await createOrder(token, reference, productId);
  expect(created.ok, `crearea a fost refuzata: ${created.text}`).toBe(true);
  const orderId = String(created.rows[0]);

  const read = await asUser(token, `inbound_orders?select=id,status,total_mdl,reference&id=eq.${orderId}`);
  expect(read.rows, "profil activ: vede comanda lui").toHaveLength(1);
  expect(read.rows[0]!.status).toBe("pending_arrival");
  const lines = await asUser(token, `order_lines?select=id,quantity&inbound_order_id=eq.${orderId}`);
  expect(lines.rows, "profil activ: vede pozitia comenzii").toHaveLength(1);

  const received = await receiveOrder(token, orderId);
  expect(received.ok, `receptia a fost refuzata: ${received.text}`).toBe(true);
  expect(received.rows[0], "un lot creat, comanda nu era sosita").toEqual({ created_batches: 1, already_arrived: false });

  const again = await receiveOrder(token, orderId);
  expect(again.rows[0], "a doua receptie nu face nimic").toEqual({ created_batches: 0, already_arrived: true });

  const truth = await orderTruth(orderId);
  expect(truth.status, "comanda este sosita").toBe("arrived");
  expect(truth.arrived_at, "cu data sosirii").not.toBeNull();
  expect(Number(truth.total_mdl), "cu totalul de la creare").toBe(40);
  expect(truth.reference, "cu numarul de la creare").toBe(reference);
  expect(await batchesTruth(orderId), "un singur lot").toEqual([expect.objectContaining({ quantity: 4 })]);

  const history = await asService(
    `status_history?select=to_status&entity_type=eq.inbound_order&entity_id=eq.${orderId}&order=created_at.asc`,
  );
  expect(history.rows.map((h) => h.to_status), "istoricul: creata, apoi sosita").toEqual(["pending_arrival", "arrived"]);

  // Si alt cont activ o vede, ca inainte.
  const other = await newDeactivatableAccount("alt-activ");
  const crossRead = await asUser(other.token, `inbound_orders?select=id&id=eq.${orderId}`);
  expect(crossRead.rows, "profil activ: vede si comenzile altcuiva").toHaveLength(1);
});
