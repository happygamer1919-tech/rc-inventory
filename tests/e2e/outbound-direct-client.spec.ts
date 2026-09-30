import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ALL_UNITS } from "@/lib/data/units";
import { acceptsUnit, validateNewIssue } from "@/lib/data/outbound-mode";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// outbound-direct-client.spec - linia de acceptanta a cardului P3-118, goal G73,
// Item 2 al lui Ivan. Hotararea R-215 este autoritatea.
//
// CE SE DOVEDESTE AICI SI CE SE DOVEDESTE IN ASERTIUNI. Fisierul
// scripts/poc-free/local-db/assertions/0067_outbound_direct_client.sql dovedeste
// tot ce se poate dovedi intr-o singura sesiune psql pe un postgres gol: forma
// coloanelor, cele doua restrictii pe mod, semnatura functiei si faptul ca
// randurile din public.batches sunt identice dupa amandoua modurile. Ce NU poate
// dovedi acolo este:
//
//   SECURITATEA PE RAND. Un postgres gol ruleaza ca superutilizator si OCOLESTE
//   politicile, deci o asertiune poate arata ca o politica EXISTA si nu poate
//   arata ce lasa sa treaca. Cele trei cazuri de izolare ale deviatiei D4 au
//   nevoie de jetoane adevarate prin PostgREST, si de aici vin.
//
//   CE VEDE OPERATORUL. Refuzul de facturare este o propozitie romaneasca pe fisa
//   iesirii, iar getIssueInvoiceability ruleaza in contextul unei cereri Next si
//   nu se poate chema din afara. Cazul se uita la ecran.
//
//   CA MODULUL DE VALIDARE NU ARE O LISTA PROPRIE DE UNITATI. Aceea este o
//   proprietate a FISIERULUI si se citeste de pe disc.
//
// NUMELE CAZURILOR SUNT CELE PE CARE LE SCRIE CARDUL, CUVANT CU CUVANT, fara
// diacritice. Un nume de caz este un identificator pe care acceptanta il citeaza,
// si a-l "corecta" ar rupe legatura dintre card si proba. Restul textului acestei
// specificatii este romanesc ca oriunde.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07: nici nu s-ar putea,
// fiindca migratia 0067 scoate si ultima politica de stergere de pe
// public.outbound_issues. Tot ce se scrie aici este prefixat TEST si rulat pe
// stiva locala din CI, niciodata pe productie.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3118-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "outbound-direct-client.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, " +
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
let ownerToken = "";

/** O categorie care exista deja. DEPINDE DE STARE VIE SI SPUNE ASTA TARE:
 *  migratia 0049 incarca optzeci de materiale, deci exista categorii. */
async function anyCategoryId(): Promise<string> {
  const rows = await asService("categories?select=id&limit=1");
  expect(rows.ok, `categoriile nu au putut fi citite: ${rows.text}`).toBe(true);
  expect(rows.rows.length, "nu exista nicio categorie, deci nu se poate scrie un produs").toBeGreaterThan(0);
  return String(rows.rows[0]!.id);
}

/** Ridica stocul produsului de test cu o comanda, o poziție si un lot. Stocul
 *  este loturi minus pozitii de iesire, deci asta este singura cale de a avea
 *  ceva de scazut. */
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
  expect(line.ok, `poziția comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);

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

/** Randurile de lot ale produsului de test, in ordine stabila, ca doua
 *  fotografii sa se poata compara cu toEqual. */
async function batchRows(): Promise<Record<string, unknown>[]> {
  const rows = await asService(
    `batches?select=id,product_id,order_line_id,quantity&product_id=eq.${productId}&order=id.asc`,
  );
  expect(rows.ok, `loturile nu au putut fi citite: ${rows.text}`).toBe(true);
  return rows.rows;
}

async function availableStock(): Promise<number> {
  const asked = await asUser(ownerToken, "rpc/product_available_stock", {
    method: "POST",
    body: { p_product_id: productId },
  });
  expect(asked.ok, `product_available_stock a raspuns ${asked.status}: ${asked.text}`).toBe(true);
  return Number(asked.rows[0] ?? 0);
}

/** O iesire PE PROIECT, prin usa netinsa. Semnatura cu cinci argumente este exact
 *  cea pe care 0018 a declarat-o si 0026 a inlocuit-o, si migratia 0067 nu o
 *  atinge: R-215 promite ca modul "proiect" nu se schimba in nicio privinta. */
async function createProjectIssue(
  token: string,
  reference: string,
  lines: Record<string, unknown>[],
  projectId: string | null,
): Promise<Rest> {
  return asUser(token, "rpc/create_outbound_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_client_name: "",
      p_project_name: "",
      p_lines: lines,
      p_project_id: projectId,
    },
  });
}

/** O iesire CATRE CLIENT DIRECT, prin a doua usa. Ultima instructiune a acestei
 *  functii in baza este exact aceeasi public.outbound_issue_take_stock pe care o
 *  cheama si usa de mai sus, deci scaderea de stoc nu se ramifica. */
async function createDirectIssue(
  token: string,
  reference: string,
  lines: Record<string, unknown>[],
  clientIdArg: string | null,
  pickupDate: string | null,
): Promise<Rest> {
  return asUser(token, "rpc/create_direct_client_issue", {
    method: "POST",
    body: {
      p_reference: reference,
      p_lines: lines,
      p_client_id: clientIdArg,
      p_pickup_date: pickupDate,
    },
  });
}

test.beforeAll(async () => {
  ownerToken = await accessToken(ownerAccount());

  const client = await asService("clients?select=id", {
    method: "POST",
    body: { name: `${TAG} client` },
  });
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

  // Doua iesiri de 7 pe acelasi produs, plus loc pentru cazul de facturare.
  await seedStock(100);

  // O IESIRE CATRE CLIENT DIRECT PE CARE CAZURILE DE ACCES O CAUTA. Scrisa aici
  // si nu luata din cazul (c): un caz care depinde de un alt caz este un caz care
  // cade cand cineva ruleaza unul singur cu --grep.
  const seeded = await createDirectIssue(
    ownerToken,
    `${TAG}-SEED`,
    [{ product_id: productId, quantity: 1 }],
    clientId,
    "2026-10-01",
  );
  expect(seeded.ok, `iesirea de referinta nu a putut fi scrisa: ${seeded.status} ${seeded.text}`).toBe(true);
});

/* =======================================================================
   (c) ACEEASI SCADERE, FARA NICIO RAMURA
   ======================================================================= */

test("iesire client direct: stocul scade din loturi exact ca la o iesire pe proiect", async () => {
  // ACEST CAZ ESTE INIMA CARDULUI. R-215: "A direct client issue decrements
  // batches through EXACTLY the code path a project issue uses. There is no
  // second subtraction routine, no mode-specific arithmetic, no stored counter
  // and no total written anywhere."
  //
  // Se masoara pe acelasi produs, cu aceeasi cantitate, contra aceloraşi loturi
  // semanate, o data pe fiecare mod.
  const before = await batchRows();
  const availableBefore = await availableStock();
  expect(before.length, "produsul de test are un singur lot").toBe(1);

  const onProject = await createProjectIssue(
    ownerToken,
    `${TAG}-PROJ`,
    [{ product_id: productId, quantity: 7 }],
    projectId,
  );
  expect(onProject.ok, `iesirea pe proiect a raspuns ${onProject.status}: ${onProject.text}`).toBe(true);

  const afterProject = await batchRows();
  const availableAfterProject = await availableStock();

  const onDirect = await createDirectIssue(
    ownerToken,
    `${TAG}-DIRECT`,
    [{ product_id: productId, quantity: 7 }],
    clientId,
    "2026-10-01",
  );
  expect(onDirect.ok, `iesirea catre client direct a raspuns ${onDirect.status}: ${onDirect.text}`).toBe(true);

  const afterDirect = await batchRows();
  const availableAfterDirect = await availableStock();

  // RANDURILE DE LOT SUNT IDENTICE IN AMANDOUA RULARILE, fiindca niciun mod nu
  // atinge public.batches: stocul este o suma si nu o coloana, iar asta este ce
  // face imposibila abaterea dintre cele doua moduri.
  expect(afterProject, "randurile de lot dupa iesirea pe proiect").toEqual(before);
  expect(afterDirect, "randurile de lot dupa iesirea catre client direct").toEqual(before);

  // SI STOCUL A SCAZUT LA FEL DE MULT DE AMANDOUA ORILE. Fara aceasta jumatate,
  // egalitatea de mai sus ar fi adevarata si daca nicio iesire nu s-ar fi scris.
  expect(availableBefore - availableAfterProject, "iesirea pe proiect a scazut 7").toBe(7);
  expect(availableAfterProject - availableAfterDirect, "iesirea catre client direct a scazut 7").toBe(7);

  // SI NIMENI NU A SCRIS UN TOTAL NICAIERI: fiecare iesire are exact poziția ei.
  const stored = await asService(
    `outbound_issues?select=id,issue_mode,project_id,client_id,pickup_date,outbound_lines(product_id,quantity)` +
      `&reference=in.("${TAG}-PROJ","${TAG}-DIRECT")&order=reference.asc`,
  );
  expect(stored.ok, `iesirile nu s-au putut citi: ${stored.text}`).toBe(true);
  expect(stored.rows.length, "doua iesiri scrise").toBe(2);
  const direct = stored.rows.find((r) => r.issue_mode === "direct_client")!;
  const project = stored.rows.find((r) => r.issue_mode === "project")!;
  expect(direct.project_id, "iesirea catre client direct nu are proiect").toBeNull();
  expect(direct.client_id, "iesirea catre client direct are clientul ales").toBe(clientId);
  expect(direct.pickup_date, "iesirea catre client direct are data ridicarii").toBe("2026-10-01");
  expect(project.client_id, "iesirea pe proiect nu are client propriu").toBeNull();
  expect(project.pickup_date, "iesirea pe proiect nu are data de ridicare").toBeNull();
});

/* =======================================================================
   (d) UNITATILE, TOATE NOUA, SI NICIO LISTA PROPRIE
   ======================================================================= */

test("iesire client direct: unitatea se valideaza din ALL_UNITS si toate cele noua trec", () => {
  // DEVIATIA D3, confirmata de proprietar pe 2026-09-30: se pastreaza toate
  // noua. Cererea lui Ivan enumera sapte, iar lista aceea nu se adopta si nicio
  // unitate nu se scoate, pentru motivul pe care il da R-215.
  expect(ALL_UNITS.length, "lib/data/units.ts are noua unitati de la migratia 0030").toBe(9);

  for (const unit of ALL_UNITS) {
    expect(acceptsUnit(unit), `unitatea ${unit} trebuie primita`).toBe(true);
    const refusal = validateNewIssue({
      mode: "direct_client",
      clientId: "00000000-0000-0000-0000-000000000001",
      pickupDate: "2026-10-01",
      lines: [{ productId: "00000000-0000-0000-0000-000000000002", quantity: "1", salePriceMdl: "", unit }],
    });
    expect(refusal, `o iesire catre client direct cu unitatea ${unit} nu trebuie refuzata`).toBeNull();
  }

  // Un cuvant care nu este o unitate este refuzat, altfel cazul de mai sus ar
  // trece si pe un validator care primeste orice. `set` este alegerea deliberata:
  // cardul P3-102 l-a incercat si l-a si refuzat pe nume.
  expect(acceptsUnit("set"), "`set` nu este o unitate, cardul P3-102").toBe(false);

  // SI MODULUL NU ARE NICIO LISTA PROPRIE DE UNITATI. Proprietatea este a
  // fisierului, deci se citeste fisierul: singura mentiune de unitate permisa
  // este importul care intreaba lib/data/units.ts.
  const source = readFileSync("lib/data/outbound-mode.ts", "utf8");
  for (const unit of ALL_UNITS) {
    expect(
      source.includes(`"${unit}"`) || source.includes(`'${unit}'`),
      `lib/data/outbound-mode.ts scrie tokenul de unitate ${unit}, si nu are voie sa scrie niciunul`,
    ).toBe(false);
  }
  expect(source.includes("ALL_UNITS") || source.includes("isUnitCode"), "validarea intreaba units.ts").toBe(true);
});

/* =======================================================================
   (e) CELE TREI CAZURI DE IZOLARE, DEVIATIA D4
   ======================================================================= */
//
// NU EXISTA NICIO ORGANIZATIE SI NICIUNA NU SE INVENTEAZA. Cererea lui Ivan cere
// "an RLS test that a user sees only their organisation's issues"; platforma
// aceasta este o singura companie si nu are model de chiriasi. Corectarea a doua
// a hotararii R-215 preschimba propozitia in cele trei cazuri de mai jos, prin
// predicatele pe care depozitul le are: public.current_app_role() si
// public.is_owner(), amandoua security definer, amandoua din migratia 0001.

test("acces: o cerere nesemnata nu vede nicio iesire", async () => {
  const anonRead = await rest("outbound_issues?select=id&limit=1", { headers: { apikey: env().anon } });
  // NICIO IESIRE, si forma refuzului nu conteaza: migratia 0001 a revocat totul
  // de la rolul anon, deci raspunsul este un refuz si nu un set gol. Amandoua
  // sunt "nu vede nicio iesire" si cazul le primeste pe amandoua, ca sa nu cada
  // pe ziua in care revocarea de grant devine o politica sau invers.
  expect(
    !anonRead.ok || anonRead.rows.length === 0,
    `o cerere nesemnata a citit ${anonRead.rows.length} iesiri: ${anonRead.status} ${anonRead.text}`,
  ).toBe(true);

  const anonWrite = await rest("outbound_issues?select=id", {
    method: "POST",
    headers: { apikey: env().anon },
    body: { reference: `${TAG}-ANON`, issue_mode: "project", project_id: projectId },
  });
  expect(anonWrite.ok, "o cerere nesemnata a SCRIS o iesire").toBe(false);
});

test("acces: un cont dezactivat nu vede nicio iesire", async () => {
  // Contul este nou si se dezactiveaza dupa ce primeste jetonul, ca in
  // active-profile-table-reads.spec: conturile comune de test nu se dezactiveaza
  // niciodata, fiindca alte specificatii se autentifica cu ele.
  const { id, token } = await newDeactivatableAccount("dezactivat");

  // MARTORUL: cat timp este activ, citeste iesirile. Fara el, cazul ar trece si
  // pe o tabela pe care nimeni nu o citeste.
  const witness = await asUser(token, `outbound_issues?select=id&reference=eq.${TAG}-SEED`);
  expect(witness.rows, "profil activ: contul citeste iesirea").toHaveLength(1);

  const off = await asService(`profiles?id=eq.${id}`, { method: "PATCH", body: { active: false } });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);

  // UN REFUZ DE CITIRE ESTE UN SET GOL SI NU O EROARE: securitatea pe rand
  // filtreaza randuri. Aceeasi distinctie pe care o scrie migratia 0055.
  const blind = await asUser(token, `outbound_issues?select=id&reference=eq.${TAG}-SEED`);
  expect(blind.status, "profil dezactivat: citirea raspunde tot 200").toBe(200);
  expect(blind.rows, "profil dezactivat: nicio iesire").toEqual([]);
});

test("acces: un rol fara permisiune nu poate scrie o iesire", async () => {
  // CE ESTE "UN ROL FARA PERMISIUNE" IN ACEASTA PLATFORMA, spus pe fata fiindca
  // altfel cazul ar arata ca o intrebare la care nu s-a raspuns. Rolurile sunt
  // doua, owner si account_manager, si amandoua au dreptul la operatiuni: asta
  // este chiar hotararea pe care o scrie migratia 0001 in sectiunea 9. Un rol
  // fara permisiune este deci un apelant din care public.current_app_role()
  // citeste null, adica exact ce intoarce ea pentru un profil dezactivat si pentru
  // unul nesemnat. Acela este predicatul pe care politicile de scriere ale
  // migratiei 0067 il cer, si acesta este cazul care il incearca.
  const { id, token } = await newDeactivatableAccount("fara-rol");

  // MARTORUL: cat timp are rol, scrie.
  const allowed = await createProjectIssue(
    token,
    `${TAG}-ROL-OK`,
    [{ product_id: productId, quantity: 1 }],
    projectId,
  );
  expect(allowed.ok, `un cont cu rol nu a putut scrie: ${allowed.status} ${allowed.text}`).toBe(true);

  const off = await asService(`profiles?id=eq.${id}`, { method: "PATCH", body: { active: false } });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);

  // Prin functie, care este calea aplicatiei, si prin amandoua usile: refuzul este
  // al politicii de scriere si nu al unei usi anume.
  const refusedRpc = await createDirectIssue(
    token,
    `${TAG}-ROL-NU`,
    [{ product_id: productId, quantity: 1 }],
    clientId,
    "2026-10-01",
  );
  expect(refusedRpc.ok, "un rol fara permisiune a scris o iesire prin functie").toBe(false);

  const refusedProjectRpc = await createProjectIssue(
    token,
    `${TAG}-ROL-NU-PROJ`,
    [{ product_id: productId, quantity: 1 }],
    projectId,
  );
  expect(refusedProjectRpc.ok, "un rol fara permisiune a scris o iesire pe proiect").toBe(false);

  // Si direct pe tabela, care este calea pe care un formular nu o vede.
  const refusedTable = await asUser(token, "outbound_issues?select=id", {
    method: "POST",
    body: {
      reference: `${TAG}-ROL-NU-2`,
      issue_mode: "direct_client",
      client_id: clientId,
      pickup_date: "2026-10-01",
    },
  });
  expect(refusedTable.ok, "un rol fara permisiune a scris o iesire direct pe tabela").toBe(false);
});

/** Un cont de autentificare nou, cu profil activ, care poate fi dezactivat fara
 *  sa atinga conturile comune de test. */
async function newDeactivatableAccount(label: string): Promise<{ id: string; token: string }> {
  const email = `p3-118-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-118-${randomUUID()}`;
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
    body: [{ id, email, role: "account_manager", full_name: "Test P3-118", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return { id, token: await accessToken({ email, password, label }) };
}

/* =======================================================================
   (f) NICIODATA FACTURABILA, SI SPUNE DE CE
   ======================================================================= */

test("iesire client direct: nu este niciodata facturabila si spune de ce in romana", async ({ page }) => {
  // R-215, si aceasta este jumatatea purtatoare a hotararii: "NO INVOICE AND NO
  // SALE DOCUMENT IS PRODUCED, EVER, BY THIS MODE." Pasul evident de la "un client
  // a ridicat material si pozitia are pret" la "deci fa-i o factura" este REFUZAT
  // pe instructiunea proprietarului, nu doar nelasat construit.
  //
  // IESIREA DE AICI ARE PRET PE POZIȚIE, DELIBERAT. O iesire fara pret este deja
  // nefacturabila pentru alt motiv, deci ea ar face cazul sa treaca fara sa
  // dovedeasca nimic despre mod.
  const priced = await createDirectIssue(
    ownerToken,
    `${TAG}-FACT`,
    [{ product_id: productId, quantity: 1, sale_price_mdl: 25 }],
    clientId,
    "2026-10-01",
  );
  expect(priced.ok, `iesirea cu pret nu a putut fi scrisa: ${priced.status} ${priced.text}`).toBe(true);

  const stored = await asService(
    `outbound_lines?select=sale_price_mdl&outbound_issue_id=eq.${String(priced.rows[0] ?? "")}`,
  );
  expect(Number(stored.rows[0]?.sale_price_mdl ?? 0), "poziția are pret, deci refuzul nu vine de acolo").toBe(25);

  await signIn(page, managerAccount());
  await openIssuePanel(page, `${TAG}-FACT`);

  await expect(
    page.getByTestId("issue-invoice-reason"),
    "refuzul este o propozitie romaneasca si spune de ce",
  ).toContainText("client direct", { timeout: 25_000 });
  await expect(page.getByTestId("issue-invoice-reason")).toContainText("în afara sistemului");
  await expect(page.getByTestId("issue-create-invoice"), "butonul nu se poate apasa").toBeDisabled();

  // SI O IESIRE PE PROIECT CU PRET ESTE FACTURABILA, altfel cazul ar trece si pe
  // o cale care refuza totul.
  const onProject = await createProjectIssue(
    ownerToken,
    `${TAG}-FACT-PROJ`,
    [{ product_id: productId, quantity: 1, sale_price_mdl: 25 }],
    projectId,
  );
  expect(onProject.ok, `iesirea pe proiect nu a putut fi scrisa: ${onProject.text}`).toBe(true);

  await openIssuePanel(page, `${TAG}-FACT-PROJ`);
  await expect(page.getByTestId("issue-create-invoice"), "o iesire pe proiect cu pret se factureaza").toBeEnabled();
});

/** Deschide panoul unei iesiri de pe /comenzi, exact ca facturare-create.spec. */
async function openIssuePanel(page: Page, reference: string): Promise<void> {
  await page.goto("/comenzi");
  const item = page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`);
  await expect(item, `iesirea ${reference} nu este pe lista`).toHaveCount(1, { timeout: 25_000 });
  await item.click();
  await expect(page.getByTestId("outbound-panel")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-invoice-block")).toBeVisible({ timeout: 25_000 });
}
