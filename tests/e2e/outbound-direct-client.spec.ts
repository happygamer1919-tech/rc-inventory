import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ALL_UNITS, unitLabel } from "@/lib/data/units";
import {
  ALL_OUTBOUND_MODES,
  ISSUE_REFUSAL,
  acceptsUnit,
  validateNewIssue,
} from "@/lib/data/outbound-mode";
import { OUTBOUND_MODE_LABEL } from "@/lib/data/outbound-types";
// P3-120: ziua ridicarii se compara cu FUNCTIA care o scrie pe ecran si nu cu un
// sir scris de mana, ca o schimbare de format sa nu treaca pe langa cazul (b).
import { formatDate, formatMoneyExact } from "@/lib/data/format";
import { DIRECT_CLIENT_NOT_INVOICEABLE } from "@/lib/data/facturare-create-types";
import { DATE_PLACEHOLDER } from "@/components/ui/DateField";
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
    // P3-196: cumparatorul este un client, nu un lead (implicitul este cold).
    body: { name: `${TAG} client`, stage: "client" },
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
      unit_value_mdl: 12.5,
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

  // INTARIT DE CARDUL P3-119, CLAUZA 7, si spus aici pe fata fiindca este singura
  // afirmatie a lui P3-118 pe care acel card o schimba. Pana la P3-119 butonul
  // exista si era dezactivat, si aceasta linie citea `toBeDisabled()`. Clauza 7
  // cere ca el sa NU EXISTE: "a visible absence and not a broken button", fiindca
  // refuzul este al modului si nimic nu il poate desface, iar obiceiul acestui
  // proiect este ca ce nu se poate folosi nu apare. "Nu exista" implica "nu se
  // poate apasa", deci afirmatia s-a INTARIT si nu s-a slabit, care este
  // deosebirea ce conteaza: un test nu se schimba niciodata ca sa treaca.
  // Propozitia de mai sus rămâne cerută, si este chiar cea pe care o intoarce
  // P3-118: o absenta fara explicatie ar fi o intrebare fara raspuns.
  await expect(page.getByTestId("issue-create-invoice"), "butonul nu exista deloc").toHaveCount(0);

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

/* =======================================================================
   CARDUL P3-119, ACCEPTANTA (a) LA (f)
   =======================================================================

   PARTEA A DOUA A ITEMULUI 2: alegerea "Tip ieșire" si formularul clientului
   direct. Cazurile de mai sus sunt ale cardului P3-118 si dovedesc DATELE;
   acestea dovedesc ECRANUL. Unul singur de mai sus s-a schimbat, cel de
   facturare, si comentariul de la locul lui spune de ce si in ce fel.

   NUMELE CAZURILOR SUNT CELE PE CARE LE SCRIE CARDUL, CUVANT CU CUVANT, fara
   diacritice, pentru acelasi motiv scris in antetul acestui fisier.

   FIXTURILE SUNT CELE DE MAI SUS, semanate de beforeAll prin API de serviciu:
   produsul cu o suta de bucati, clientul si proiectul. Cazurile de interfata nu
   construiesc niciun produs prin ecran, si acesta este motivul pentru care nu au
   nevoie de drumul lung al lui outbound.spec.ts. */

const PRODUCT_NAME = `${TAG} produs`;
const CLIENT_NAME = `${TAG} client`;

/** Proiectul demonstrativ din scripts/seed-test-crm.mjs, cel pe care il foloseste
 *  si outbound.spec.ts. Cautarea dupa acest nume da exact o potrivire: proiectul
 *  semanat de beforeAll se numeste altfel. */
const TEST_PROJECT = "TEST Șantier E2E";

/** Scrie in comboboxul unei zone si alege prima optiune. Aceeasi forma ca in
 *  outbound.spec.ts, si pentru acelasi motiv: EXACT o potrivire, altfel cazul ar
 *  alege la intamplare intre randurile a doua rulari. */
async function comboPick(page: Page, testId: string, query: string): Promise<void> {
  const input = page.getByTestId(testId).locator("input").first();
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  await expect(
    list.locator("li"),
    `cautarea "${query}" trebuie sa dea exact o potrivire`,
  ).toHaveCount(1);
  await list.locator("li").first().click();
}

/** Umple prima poziție cu produsul de test si o cantitate. */
async function fillFirstLine(page: Page, quantity: string): Promise<void> {
  await comboPick(page, "issue-product-0", PRODUCT_NAME);
  await page.getByTestId("issue-quantity-0").fill(quantity);
}

/** Trece formularul pe modul client direct si asteapta campurile lui. */
async function chooseDirectClient(page: Page): Promise<void> {
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("issue-mode-direct_client").check();
  await expect(page.getByTestId("field-pickup-date")).toBeVisible({ timeout: 25_000 });
}

/** Randul de iesire scris, citit din baza dupa referinta. */
async function storedIssue(reference: string): Promise<Record<string, unknown>> {
  const stored = await asService(
    `outbound_issues?select=id,issue_mode,project_id,client_id,pickup_date&reference=eq.${reference}`,
  );
  expect(stored.ok, `iesirea ${reference} nu s-a putut citi: ${stored.text}`).toBe(true);
  expect(stored.rows.length, `iesirea ${reference} este in baza`).toBe(1);
  return stored.rows[0]!;
}

/* ------------------------------------------------------------------ (a) -- */

test("iesire: alegerea Tip iesire arata Proiect si Client direct si Proiect este implicit", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, ownerAccount());
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });

  const field = page.getByTestId("field-issue-mode");
  await expect(field, "alegerea este pe formularul de iesire noua").toBeVisible();
  await expect(field).toContainText("Tip ieșire");

  // EXACT DOUA OPTIUNI, si numarul se citeste din ALL_OUTBOUND_MODES si nu se
  // scrie aici: un mod adaugat mai tarziu fara o opțiune pe ecran trebuie sa faca
  // acest caz sa pice, nu sa il lase sa treaca pe un numar vechi scris de mana.
  // Aceea este lectura pe care cardul P3-116 a plata cu o rulare intreaga.
  expect(ALL_OUTBOUND_MODES.length, "cardul cere exact doua moduri").toBe(2);
  await expect(field.locator('input[type="radio"]')).toHaveCount(ALL_OUTBOUND_MODES.length);

  // CUVINTELE SUNT CELE DIN OUTBOUND_MODE_LABEL, verificate contra constantei si
  // nu contra unui sir scris in acest caz, deci o eticheta scrisa de mana in
  // component, alta decat cea din singura sursa, face cazul sa pice.
  //
  // SE CITESC DE PE ECRAN SI NU DE PE DISC, deliberat: proprietatea este despre ce
  // AJUNGE PE ECRAN, iar un caz care ar citi fisierul ar gasi eticheta si intr-un
  // comentariu care o citeaza. Lectura este in KNOWN-FAILURES si acest depozit a
  // plata pentru ea de doua ori intr-o zi.
  for (const mode of ALL_OUTBOUND_MODES) {
    await expect(
      page.getByTestId(`issue-mode-option-${mode}`),
      `opțiunea ${mode} poarta eticheta din OUTBOUND_MODE_LABEL`,
    ).toContainText(OUTBOUND_MODE_LABEL[mode]);
  }

  // "PROIECT" ESTE IMPLICIT, clauza 1, si formularul care se vede este al lui.
  await expect(page.getByTestId("issue-mode-project"), "Proiect este bifat").toBeChecked();
  await expect(page.getByTestId("issue-mode-direct_client")).not.toBeChecked();
  await expect(
    page.getByTestId("field-project"),
    "formularul implicit este cel pe proiect",
  ).toBeVisible();
  await expect(page.getByTestId("field-pickup-date")).toHaveCount(0);

  // SI ALEGEREA SCHIMBA FORMULARUL. Fara aceasta jumatate, cazul ar trece si pe
  // doua butoane care nu fac nimic.
  await page.getByTestId("issue-mode-direct_client").check();
  await expect(page.getByTestId("issue-mode-direct_client")).toBeChecked();
  await expect(
    page.getByTestId("field-pickup-date"),
    "modul client direct cere data ridicarii",
  ).toBeVisible();
  await expect(page.getByTestId("field-client"), "si cere un client").toBeVisible();
  await expect(
    page.getByTestId("field-project"),
    "si nu mai cere niciun proiect",
  ).toHaveCount(0);

  // Si se poate intoarce, fiindca un operator care a apasat greșit nu trebuie sa
  // reincarce pagina.
  await page.getByTestId("issue-mode-project").check();
  await expect(page.getByTestId("field-project")).toBeVisible();
});

/* ------------------------------------------------------------------ (b) -- */

test("iesire client direct: formularul refuza trimiterea fara client si fara data de ridicare, cu mesaj romanesc", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, ownerAccount());
  await chooseDirectClient(page);
  await fillFirstLine(page, "1");

  // 1. FARA CLIENT. Data este completa, deci singura lipsa este clientul, iar
  //    mesajul trebuie sa o NUMEASCA si nu sa spuna doar ca ceva lipseste.
  await page.getByTestId("issue-pickup-date").fill("01.12.2026");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-problems")).toContainText(ISSUE_REFUSAL.client);
  await expect(page.getByTestId("issue-problems")).not.toContainText(ISSUE_REFUSAL.pickupDate);
  await expect(page.getByTestId("issue-created"), "nimic nu s-a creat").toHaveCount(0);

  // SI CEREREA NU A PLECAT DELOC. Clauza 6: refuzul este PE ECRAN, INAINTE de
  // trimitere. Fara aceasta afirmatie, cazul ar trece si pe un formular care
  // trimite, primeste refuzul bazei si il afiseaza, care este alt lucru si s-ar
  // vedea in issue-error si nu in issue-problems.
  await expect(page.getByTestId("issue-error")).toHaveCount(0);

  // 2. FARA DATA DE RIDICARE. Clientul este ales, data se goleste.
  await comboPick(page, "field-client", CLIENT_NAME);
  await page.getByTestId("issue-pickup-date").fill("");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-problems")).toContainText(ISSUE_REFUSAL.pickupDate);
  await expect(page.getByTestId("issue-problems")).not.toContainText(ISSUE_REFUSAL.client);
  await expect(page.getByTestId("issue-created")).toHaveCount(0);
  await expect(page.getByTestId("issue-error")).toHaveCount(0);

  // 3. SI CU AMANDOUA COMPLETE TRECE, altfel cele doua refuzuri de mai sus ar fi
  //    adevarate si pe un formular care nu poate trimite nimic niciodata.
  await page.getByTestId("issue-pickup-date").fill("01.12.2026");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-reference")).toHaveText(/^IES-\d{4}-\d{4}$/);
});

/* ------------------------------------------------------------------ (c) -- */

test("iesire client direct: un client nou creat din ecran apare apoi in Clienti", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // NUMELE ESTE UNIC PE RULARE SI PE CAZ. Datele de test nu se sterg niciodata in
  // acest depozit, deci un nume care se repeta intre cazuri face ca selectorul sa
  // gaseasca doua randuri si comboPick sa pice pe numaratoare. `C` este semnul
  // cazului, exact ce cere lectura pe care cardul P3-101 a plata cu doua cazuri.
  //
  // IDNO RAMANE GOL, si nu din lene: indexul unic din migratia 0013 este pe IDNO,
  // deci un IDNO repetat intre rulari ar fi chiar ciocnirea de care vorbeste acea
  // lectura. Un nume nu este unic in schema, deci nu se poate ciocni.
  const newClient = `${TAG}-C nou client`;

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);

  // CREAREA PE LOC, FARA SA SE PLECE DE PE ECRAN. Cardul spune de ce: cumparatorul
  // sta la tejghea, iar trimiterea operatorului pe alt ecran este chiar felul in
  // care a inceput obiceiul proiectelor inventate.
  await page.getByTestId("client-create-open").click();
  await expect(page.getByTestId("client-create-form")).toBeVisible();
  await page.getByTestId("client-create-name").fill(newClient);
  await page.getByTestId("client-create-type").selectOption("company");
  // P3-210: telefonul tastat la creare apare indata in lista de clienti, ca
  // indiciu langa nume, fara reincarcare.
  const newClientPhone = "069 210 210";
  await page.getByTestId("client-create-phone").fill(newClientPhone);
  await page.getByTestId("client-create-save").click();

  // Formularul se inchide si clientul este DEJA ALES: operatorul are cumparatorul
  // in fata si nu trebuie sa il mai caute.
  await expect(page.getByTestId("client-create-form")).toHaveCount(0, { timeout: 25_000 });

  // P3-210: randul clientului nou din lista arata telefonul.
  const pickerInput = page.getByTestId("field-client").locator("input");
  await pickerInput.click();
  await pickerInput.fill(newClient);
  await expect(
    page.locator("[data-rc-combo-list] li").filter({ hasText: newClient }),
    "randul clientului creat pe loc arata telefonul",
  ).toContainText(newClientPhone);
  await pickerInput.press("Escape");

  // CLIENTUL ALES SE CITESTE DIN VALOAREA CAMPULUI SI NU DIN TEXTUL CASETEI.
  // Combobox arata alegerea ca <input value={...}>, iar valoarea unui input NU
  // este in textContent, deci `toContainText` pe caseta care il cuprinde nu putea
  // trece niciodata, oricat de bine ar fi mers codul: pe rularea 36864530498 a
  // raportat sirul gol dupa ce localizatorul se rezolvase de 24 de ori. Este chiar
  // capcana pe care acest card si-a scris-o in docs/LEARNINGS.md despre
  // placeholder, aplicata unui caz vecin si ratata acolo.
  // AFIRMATIA S-A INTARIT SI NU S-A SLABIT: `toHaveValue` cere numele exact si
  // intreg, iar `toContainText` cerea doar sa fie cuprins.
  await expect(
    page.getByTestId("field-client").locator("input"),
    "clientul creat pe loc este deja ales in camp",
  ).toHaveValue(newClient);

  // SI IESIREA SE DUCE PANA LA CAPAT CU EL, ca sa se vada ca randul creat este bun
  // de folosit si nu doar bun de aratat.
  await fillFirstLine(page, "2");
  await page.getByTestId("issue-pickup-date").fill("02.12.2026");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-created")).toContainText(newClient);
  const reference = (await page.getByTestId("issue-reference").innerText()).trim();

  // UN CLIENT CRM OBISNUIT SI NU UN FEL DEOSEBIT, R-215: apare in Clienți, se
  // poate deschide, si de acolo se poate modifica si dezactiva ca oricare altul.
  //
  // P3-172. CU FILTRUL VEDERII, nu pe /clienti gol. Pana la P3-172 cazul deschidea
  // lista fara vedere, care arata toate etapele, si trecea si cand cumparatorul
  // fusese salvat `cold` si statea printre Leaduri. Vederea Clienți arata numai
  // etapa `client`, deci acum cazul pica pe exact acel defect.
  await page.goto(`/clienti?vedere=clienti&q=${encodeURIComponent(newClient)}`);
  await expect(page.getByTestId("view-clienti"), "vederea Clienți este cea aleasa").toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const row = page.locator(`[data-testid="client-row"][data-name="${newClient}"]`);
  await expect(row, "clientul creat din Iesiri este un rand obisnuit in Clienți").toHaveCount(1, {
    timeout: 25_000,
  });
  // SE APASA LEGATURA DIN RAND SI NU RANDUL. Randul este un <tr> fara niciun
  // onClick (components/clients/ClientsScreen.tsx), iar navigarea este a
  // <Link data-testid="client-link"> din prima celula, deci un clic pe rand nu
  // ducea nicaieri si fisa nu se deschidea niciodata: asa a picat acest caz pe
  // rularea 36869250041, la toBeVisible, cu "element(s) not found".
  // ASTA ESTE CHIAR CE CERE R-215, un rand pe care cineva il poate DESCHIDE, deci
  // cazul s-a intarit: acum trece pe calea pe care o foloseste un operator.
  await row.getByTestId("client-link").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("client-detail")).toContainText(newClient);

  // SI IESIREA NUMESTE CHIAR RANDUL ACELA. Un nume pe ecran nu dovedeste nimic
  // despre ce s-a scris: R-215 cere un RAND pe care cineva il poate deschide, si
  // un nume scris de mana nu se primeste.
  const issue = await storedIssue(reference);
  expect(issue.issue_mode, "modul scris este client direct").toBe("direct_client");
  expect(issue.project_id, "o iesire catre client direct nu are proiect").toBeNull();
  expect(issue.pickup_date, "ziua ridicarii este cea tastata romaneste").toBe("2026-12-02");

  const clients = await asService(`clients?select=name,stage&id=eq.${String(issue.client_id ?? "")}`);
  expect(String(clients.rows[0]?.name ?? ""), "clientul iesirii este chiar randul creat").toBe(
    newClient,
  );
  // P3-172. Etapa stocata este `client`, citita din rand si nu de pe ecran.
  expect(String(clients.rows[0]?.stage ?? ""), "cumparatorul de la tejghea este client").toBe("client");
});

/** P3-172. Cifra de pe pastila Leaduri, de pe pagina data. */
async function leadCount(page: Page, path: string): Promise<number> {
  await page.goto(path);
  const count = page.getByTestId("view-leaduri").getByTestId("view-count");
  await expect(count).toHaveText(/^\d+$/, { timeout: 25_000 });
  return Number((await count.innerText()).trim());
}

test("iesire client direct: un client nou creat din ecran nu apare printre Leaduri si numarul de leaduri nu creste", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // P3-172. JUMATATEA A DOUA A DEFECTULUI. Cumparatorul salvat `cold` aparea in
  // Leaduri ca Lead rece si marea cifra de pe pastila. Un nume unic pe caz, `L`,
  // pentru acelasi motiv scris la cazul (c).
  const newClient = `${TAG}-L nou client`;

  await signIn(page, ownerAccount());
  const leadsBefore = await leadCount(page, "/clienti");

  await chooseDirectClient(page);
  await page.getByTestId("client-create-open").click();
  await expect(page.getByTestId("client-create-form")).toBeVisible();
  await page.getByTestId("client-create-name").fill(newClient);
  await page.getByTestId("client-create-type").selectOption("individual");
  await page.getByTestId("client-create-save").click();
  await expect(page.getByTestId("client-create-form")).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByTestId("field-client").locator("input")).toHaveValue(newClient);

  // 1. NU ESTE IN VEDEREA LEADURI, cautat dupa numele lui.
  const q = encodeURIComponent(newClient);
  await page.goto(`/clienti?vedere=leaduri&q=${q}`);
  await expect(page.getByTestId("view-leaduri")).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(`[data-testid="client-row"][data-name="${newClient}"]`),
    "cumparatorul de la tejghea nu este un lead",
  ).toHaveCount(0);
  await expect(
    page.getByTestId("view-leaduri").getByTestId("view-count"),
    "cautat dupa nume, nu numara niciun lead",
  ).toHaveText("0");

  // MARTORUL: acelasi nume, in vederea Clienți, da exact un rand. Fara el, cazul ar
  // trece si pe o cautare care nu gaseste nimic.
  await page.goto(`/clienti?vedere=clienti&q=${q}`);
  await expect(
    page.locator(`[data-testid="client-row"][data-name="${newClient}"]`),
    "acelasi nume este in vederea Clienți",
  ).toHaveCount(1, { timeout: 25_000 });

  // 2. NUMARUL DE LEADURI NU A CRESCUT.
  expect(await leadCount(page, "/clienti"), "numarul de leaduri este acelasi").toBe(leadsBefore);

  // 3. Si randul stocat este `client`.
  const stored = await asService(`clients?select=stage&name=eq.${q}`);
  expect(stored.ok, `clientul nu s-a putut citi: ${stored.text}`).toBe(true);
  expect(stored.rows.map((r) => r.stage), "un singur rand, la etapa client").toEqual(["client"]);
});

test("creare client fara etapa: randul ramane cold, implicitul pe care se bizuie celelalte cai", async () => {
  // P3-172. CELELALTE CAI DE CREARE NU SE SCHIMBA. createClientRecord nu numeste
  // `stage` in insert cand apelantul nu trimite o etapa, deci randul ia implicitul
  // coloanei din migratia 0039. Cazul scrie exact acel insert, cu jetonul
  // administratorului si prin securitatea pe rand, fara etapa, si citeste `cold`.
  // Numai formularul de la tejghea trimite acum `client`.
  const name = `${TAG}-U fara etapa`;
  const created = await asUser(ownerToken, "clients?select=id,stage", {
    method: "POST",
    body: { name, type: "company" },
  });
  expect(created.ok, `clientul fara etapa nu a putut fi scris: ${created.status} ${created.text}`).toBe(true);
  expect(String(created.rows[0]?.stage ?? ""), "un client creat fara etapa este cold").toBe("cold");
});

/* ------------------------------------------------------------------ P3-177 -- */

test("P3-177: doi clienti cu acelasi nume se pot deosebi in lista dupa telefon sau IDNO", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // P3-177, acceptanta (a). Doi clienti cu acelasi nume, cu numere de telefon
  // diferite. Ambele randuri arata telefonul; alegerea celui de al doilea salveaza
  // vânzarea pe cel de al doilea.
  const clientName = `${TAG}-Client-identic`;
  const phone1 = `${TAG}-phone1`;
  const phone2 = `${TAG}-phone2`;

  // Creare doi clienti cu acelasi nume, cu telefoane diferite.
  const client1 = await asService(
    "clients?select=id",
    { method: "POST", body: { name: clientName, type: "company", phone: phone1, active: true, stage: "client" } },
  );
  expect(client1.ok).toBe(true);
  const client1Id = client1.rows[0]?.id;

  const client2 = await asService(
    "clients?select=id",
    { method: "POST", body: { name: clientName, type: "company", phone: phone2, active: true, stage: "client" } },
  );
  expect(client2.ok).toBe(true);
  const client2Id = client2.rows[0]?.id;

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);

  // Tastarea numelui comun deschide lista.
  const clientInput = page.getByTestId("field-client").locator("input");
  await clientInput.fill(clientName);
  await page.waitForTimeout(500);

  // Ambele randuri arata telefonul.
  const listItems = page.locator('[data-rc-combo-list] li button');
  const itemCount = await listItems.count();
  expect(itemCount).toBeGreaterThanOrEqual(2);

  // Cautare randul care contine phone1 si randul care contine phone2.
  const allItems = await page.locator('[data-rc-combo-list] li button').allTextContents();
  const hasPhone1 = allItems.some((text) => text.includes(phone1));
  const hasPhone2 = allItems.some((text) => text.includes(phone2));
  expect(hasPhone1, "lista arata telefonul clientului 1").toBe(true);
  expect(hasPhone2, "lista arata telefonul clientului 2").toBe(true);

  // Alegerea celui de al doilea client, dupa telefon: ordinea a doua nume identice
  // nu este stabila, deci pozitia in lista nu spune care este care.
  await page.locator("[data-rc-combo-list] li button", { hasText: phone2 }).click();
  await expect(clientInput).toHaveValue(clientName);

  // Completare restul formularului si salvare.
  await page.getByTestId("issue-pickup-date").fill("01.12.2026");
  await fillFirstLine(page, "1");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });

  // Verificare ca vânzarea s-a salvat pe al doilea client.
  const issued = await asService(`outbound_issues?select=client_id&client_id=eq.${client2Id}`);
  expect(issued.ok).toBe(true);
  expect(issued.rows.length).toBeGreaterThan(0);
});

test("P3-177: tastarea unui nume comun si parasirea campului nu selecteaza nimic", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const clientName = `${TAG}-Client-dou`;
  const phone1 = "111";
  const phone2 = "222";

  // Creare doi clienti cu acelasi nume.
  await asService("clients?select=id", {
    method: "POST",
    body: { name: clientName, type: "company", phone: phone1, active: true, stage: "client" },
  });
  await asService("clients?select=id", {
    method: "POST",
    body: { name: clientName, type: "company", phone: phone2, active: true, stage: "client" },
  });

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);

  const clientInput = page.getByTestId("field-client").locator("input");
  await clientInput.fill(clientName);
  await page.waitForTimeout(500);

  // Parasire camp, cu un clic in afara (asa se inchide comboboxul). Cu doua
  // potriviri exacte nu se alege nimic si lista ramane deschisa.
  await page.getByTestId("outbound-form").click({ position: { x: 2, y: 2 } });
  await expect(page.locator("[data-rc-combo-list]")).toBeVisible();

  // Escape inchide lista fara sa aleaga: campul ramane gol.
  await clientInput.press("Escape");
  await expect(clientInput).toHaveValue("");

  // Formularul cere completarea clientului.
  await page.getByTestId("issue-submit").click();
  await expect(
    page.getByTestId("issue-problems"),
    "formularul refuza trimiterea fara client",
  ).toContainText("Alege clientul");
});

test("P3-196: un lead si un client inactiv nu apar in lista de cumparatori", async ({ page }) => {
  test.setTimeout(120_000);

  // P3-177, acceptanta (c), care nu fusese acoperita: lista oferea si leaduri.
  // Un client activ, un lead activ si un client inactiv, cu acelasi prefix.
  const prefix = `${TAG}-Cumparator`;
  const rows = [
    { name: `${prefix}-client`, active: true, stage: "client" },
    { name: `${prefix}-lead`, active: true, stage: "cold" },
    { name: `${prefix}-inactiv`, active: false, stage: "client" },
  ];
  for (const row of rows) {
    const created = await asService("clients?select=id", {
      method: "POST",
      body: { ...row, type: "company" },
    });
    expect(created.ok, `clientul ${row.name} s-a creat`).toBe(true);
  }

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);

  const clientInput = page.getByTestId("field-client").locator("input");
  await clientInput.fill(prefix);
  await expect(page.locator("[data-rc-combo-list]")).toBeVisible();
  const items = await page.locator("[data-rc-combo-list] li button").allTextContents();
  expect(items.some((text) => text.includes(`${prefix}-client`)), "clientul activ apare").toBe(true);
  expect(items.some((text) => text.includes(`${prefix}-lead`)), "leadul nu apare").toBe(false);
  expect(items.some((text) => text.includes(`${prefix}-inactiv`)), "clientul inactiv nu apare").toBe(false);
});

/* ------------------------------------------------------------- P3-147 -- */

test("iesire client direct: managerul de cont creeaza un client nou de la tejghea si iesirea se salveaza", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // CARDUL P3-147, hotararea q143 a proprietarului: managerul de cont, care este
  // omul de la tejghea, poate adauga pe loc un cumparator nou. Numele este unic pe
  // rulare si pe caz, `M` este semnul cazului, din acelasi motiv ca la cazul (c).
  const newClient = `${TAG}-M nou client`;

  await signIn(page, managerAccount());
  await chooseDirectClient(page);

  // BUTONUL EXISTA PENTRU MANAGER. Pana la acest card nu exista deloc.
  await page.getByTestId("client-create-open").click();
  await expect(page.getByTestId("client-create-form")).toBeVisible();
  await page.getByTestId("client-create-name").fill(newClient);
  await page.getByTestId("client-create-type").selectOption("company");
  await page.getByTestId("client-create-save").click();

  await expect(page.getByTestId("client-create-form")).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByTestId("client-create-error")).toHaveCount(0);
  await expect(
    page.getByTestId("field-client").locator("input"),
    "clientul creat de manager este deja ales in camp",
  ).toHaveValue(newClient);

  // SI IESIREA SE SALVEAZA CU EL.
  await fillFirstLine(page, "1");
  await page.getByTestId("issue-pickup-date").fill("04.12.2026");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-created")).toContainText(newClient);
  const reference = (await page.getByTestId("issue-reference").innerText()).trim();

  // CLIENTUL EXISTA IN BAZA DUPA, si este chiar clientul iesirii.
  const issue = await storedIssue(reference);
  expect(issue.issue_mode, "modul scris este client direct").toBe("direct_client");
  const stored = await asService(
    `clients?select=id,name,active&name=eq.${encodeURIComponent(newClient)}`,
  );
  expect(stored.ok, `clientul nu s-a putut citi: ${stored.text}`).toBe(true);
  expect(stored.rows.length, "exact un client cu acest nume").toBe(1);
  expect(String(stored.rows[0]!.id), "clientul iesirii este randul creat de manager").toBe(
    String(issue.client_id ?? ""),
  );
  expect(stored.rows[0]!.active, "clientul creat este activ").toBe(true);

  // SI LARGIREA NU A TRECUT DE CREARE. Prin baza, cu jetonul managerului: o
  // modificare a clientului este refuzata, fiindca clients_update ramane a
  // administratorului. Un update refuzat de securitatea pe rand nu atinge niciun
  // rand si raspunde cu un set gol, deci se masoara randul, nu codul.
  const managerToken = await accessToken(managerAccount());
  const renamed = `${newClient} redenumit`;
  const update = await asUser(
    managerToken,
    `clients?id=eq.${String(stored.rows[0]!.id)}&select=id`,
    { method: "PATCH", body: { name: renamed } },
  );
  expect(update.rows.length, `managerul a modificat un client: ${update.status} ${update.text}`).toBe(0);
  const after = await asService(`clients?select=name&id=eq.${String(stored.rows[0]!.id)}`);
  expect(String(after.rows[0]?.name ?? ""), "numele clientului a ramas cel creat").toBe(newClient);

  // SI ECRANUL CLIENȚI RAMANE AL ADMINISTRATORULUI: managerul nu vede butonul de
  // creare acolo.
  await page.goto("/clienti");
  await expect(page.getByTestId("clients-filters")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("client-new")).toHaveCount(0);
});

/* ------------------------------------------------------------------ (d) -- */

test("iesire pe proiect: nimic nu s-a schimbat", async ({ page }) => {
  test.setTimeout(120_000);

  // CLAUZA 1 A CARDULUI, SI SINGURA CARE POATE PICA ACEST CARD SINGURA. R-215
  // promite ca modul "Proiect" este neschimbat in orice privinta: aceleasi
  // campuri, aceeasi validare, acelasi comportament, acelasi efect pe stoc.
  //
  // ACEST CAZ NU INLOCUIESTE tests/e2e/outbound.spec.ts, IL DUBLEAZA IN LIMBAJUL
  // ACESTUI CARD. Fisierul acela este testul de iesire pe proiect care exista
  // dinainte, are sapte cazuri, NU este atins de acest card si ruleaza NEMODIFICAT
  // in aceeasi suita: `git diff origin/main...HEAD` nu il numeste. Un card care ar
  // fi trebuit sa il editeze ar fi rupt chiar clauza 1.
  await signIn(page, ownerAccount());
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });

  // ACELEASI CAMPURI. Proiectul se alege, clientul se CITESTE de pe el, si nu
  // exista nicio casuta de data pe calea proiectului.
  await expect(page.getByTestId("field-project")).toBeVisible();
  await expect(page.getByTestId("field-client")).toContainText("Se completează din proiect");
  await expect(
    page.getByTestId("field-pickup-date"),
    "calea proiectului nu a capatat nicio data de ridicare",
  ).toHaveCount(0);

  // ACEEASI VALIDARE, cu chiar propozitia de dinainte: fara proiect nu se poate.
  await fillFirstLine(page, "3");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-problems")).toContainText("Alege proiectul.");
  await expect(page.getByTestId("issue-created")).toHaveCount(0);

  // ACELASI COMPORTAMENT: clientul apare de pe proiect, pe amandoua drumurile pe
  // care le afirma si cazul din outbound.spec.ts, textul si atributul data-client.
  await comboPick(page, "field-project", TEST_PROJECT);
  await expect(page.getByTestId("field-client")).toHaveAttribute("data-client", /.+/);

  // ACELASI EFECT PE STOC, masurat pe acelasi produs si prin acelasi
  // product_available_stock: exact cat s-a eliberat si nimic mai mult.
  const before = await availableStock();
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  const reference = (await page.getByTestId("issue-reference").innerText()).trim();
  expect(reference, "referinta are forma de dintotdeauna").toMatch(/^IES-\d{4}-\d{4}$/);
  expect(
    before - (await availableStock()),
    "stocul a scazut cu exact cantitatea eliberata",
  ).toBe(3);

  // SI CONFIRMAREA MODULUI PROIECT ISI PASTREAZA BUTONUL DE FACTURA. Poziția este
  // netarifata, deci butonul este dezactivat si spune de ce, care este hotararea
  // cardului P3-110 si nu se atinge. Afirmatia exista ca sa se vada ca absenta
  // cerută de clauza 7 este a MODULUI si nu a fost aplicata peste tot.
  await expect(
    page.getByTestId("issue-create-invoice"),
    "modul proiect isi pastreaza butonul",
  ).toHaveCount(1);

  // SI RANDUL SCRIS ESTE UN RAND DE MOD "project", din implicitul migratiei 0067.
  const issue = await storedIssue(reference);
  expect(issue.issue_mode, "modul scris este project").toBe("project");
  expect(issue.pickup_date, "o iesire pe proiect nu are data de ridicare").toBeNull();
  expect(issue.client_id, "o iesire pe proiect nu are client propriu").toBeNull();
});

/* ------------------------------------------------------------------ (e) -- */

test("iesire client direct: nu apare niciun buton de factura", async ({ page }) => {
  test.setTimeout(120_000);

  // CLAUZA 7. O ABSENTA VIZIBILA SI NU UN BUTON STRICA: obiceiul acestui proiect
  // este ca ce nu se poate folosi nu apare. Se masoara in AMANDOUA locurile in care
  // butonul poate sta: confirmarea formularului si fisa iesirii de pe /comenzi.
  //
  // CU PRET PE POZIȚIE, DELIBERAT. O iesire fara pret este deja nefacturabila
  // pentru ALT motiv, deci ea ar face cazul sa treaca fara sa dovedeasca nimic
  // despre mod. Acelasi raționament pe care il scrie cazul lui P3-118 de mai sus.
  await signIn(page, ownerAccount());
  await chooseDirectClient(page);

  await comboPick(page, "field-client", CLIENT_NAME);
  await page.getByTestId("issue-pickup-date").fill("03.12.2026");
  await fillFirstLine(page, "1");
  await page.getByTestId("issue-price-0").fill("25");
  await page.getByTestId("issue-submit").click();

  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  const reference = (await page.getByTestId("issue-reference").innerText()).trim();

  // 1. PE CONFIRMARE: niciun buton, si motivul este chiar propozitia lui P3-118.
  await expect(
    page.getByTestId("issue-create-invoice"),
    "niciun buton de factura pe confirmare",
  ).toHaveCount(0);
  await expect(page.getByTestId("issue-invoice-reason")).toHaveText(DIRECT_CLIENT_NOT_INVOICEABLE);

  // 2. PE FISA IESIRII: tot niciun buton, si aceeasi propozitie, nu una scrisa a
  //    doua oara.
  await openIssuePanel(page, reference);
  await expect(
    page.getByTestId("issue-create-invoice"),
    "niciun buton de factura pe fisa iesirii",
  ).toHaveCount(0);
  await expect(page.getByTestId("issue-invoice-reason")).toHaveText(DIRECT_CLIENT_NOT_INVOICEABLE);
  await expect(
    page.getByTestId("issue-invoice-existing"),
    "si nicio legatura catre vreo factura",
  ).toHaveCount(0);

  // SI POZIȚIA AVEA CHIAR PRET, deci refuzul nu vine de acolo.
  const issue = await storedIssue(reference);
  const lines = await asService(
    `outbound_lines?select=sale_price_mdl&outbound_issue_id=eq.${String(issue.id ?? "")}`,
  );
  expect(Number(lines.rows[0]?.sale_price_mdl ?? 0), "poziția are pret").toBe(25);
});

/* =======================================================================
   CARDUL P3-120, ACCEPTANTA (a) LA (d)
   =======================================================================

   PARTEA A TREIA A ITEMULUI 2: modul se vede oriunde este listata o iesire.
   Cazurile lui P3-118 de mai sus dovedesc DATELE, cele ale lui P3-119 dovedesc
   FORMULARUL, iar acestea dovedesc CE CITESTE cineva care deschide ecranele.
   Niciun caz de mai sus nu se atinge, si cel numit `iesire pe proiect: nimic nu s-a
   schimbat` este chiar garda care spune ca nu s-a atins.

   "RAPOARTE" NU ESTE O RUTA A ACESTEI APLICATII, aceeasi constatare ca deviatia D2
   a cardului P3-117, si valoarea implicita a cardului P3-120 o spune pe fata. Cele
   trei locuri in care o iesire este listata azi sunt lista de pe /comenzi, fisa
   iesirii si istoricul miscarilor unui produs, si acelea sunt cele trei pe care le
   masoara cazurile de mai jos. Nu se creeaza nicio ruta Rapoarte.

   NUMELE CAZURILOR SUNT CELE PE CARE LE SCRIE CARDUL, CUVANT CU CUVANT, fara
   diacritice, pentru acelasi motiv scris in antetul acestui fisier.

   FIECARE CAZ ISI SEAMANA PROPRIA PERECHE DE IESIRI, prin seedModePair si cu
   referinte ale lui. Un caz care s-ar sprijini pe iesirile scrise de un alt caz este
   un caz care cade cand cineva ruleaza unul singur cu --grep, si beforeAll scrie deja
   asta in atatea cuvinte. */

/** Ziua de ridicare a iesirilor semanate de cazurile cardului P3-120, ca sir
 *  `YYYY-MM-DD` exact cum o cere coloana `date`. Una singura si scrisa o data: cele
 *  trei cazuri care o verifica pe ecran o compara cu acelasi formatDate. */
const PICKUP_DAY = "2026-11-05";

/** O iesire pe proiect si una catre client direct, ambele pe produsul de test, cu
 *  referinte care poarta eticheta cazului. Intoarce cele doua referinte. */
async function seedModePair(label: string): Promise<{ project: string; direct: string }> {
  const project = `${TAG}-${label}-P`;
  const direct = `${TAG}-${label}-D`;

  const onProject = await createProjectIssue(
    ownerToken,
    project,
    [{ product_id: productId, quantity: 1 }],
    projectId,
  );
  expect(onProject.ok, `iesirea pe proiect ${project} a raspuns ${onProject.status}: ${onProject.text}`).toBe(
    true,
  );

  const onDirect = await createDirectIssue(
    ownerToken,
    direct,
    [{ product_id: productId, quantity: 1 }],
    clientId,
    PICKUP_DAY,
  );
  expect(onDirect.ok, `iesirea catre client direct ${direct} a raspuns ${onDirect.status}: ${onDirect.text}`).toBe(
    true,
  );

  return { project, direct };
}

/** Randul unei iesiri de pe lista de pe /comenzi, cautat pe referinta. Pe
 *  INREGISTRARE si niciodata pe textul vizibil, aceeasi regula pe care o scrie
 *  OrdersScreen.tsx despre filtrarea lui. */
function outboundRow(page: Page, reference: string) {
  return page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`);
}

/* ------------------------------------------------------------------ (a) -- */

test("lista iesirilor: fiecare rand arata modul in romana", async ({ page }) => {
  test.setTimeout(120_000);

  // CLAUZA 1. Un rand care spune ca materialul a plecat din depozit si nu poate
  // spune catre ce raspunde la jumatate de intrebare.
  const { project, direct } = await seedModePair("C1");
  await signIn(page, ownerAccount());
  await page.goto("/comenzi");

  const list = page.getByTestId("outbound-list");
  await expect(outboundRow(page, project), `iesirea pe proiect ${project} este pe lista`).toHaveCount(1, {
    timeout: 25_000,
  });
  await expect(outboundRow(page, direct), `iesirea directa ${direct} este pe lista`).toHaveCount(1, {
    timeout: 25_000,
  });

  // FIECARE RAND ISI SPUNE MODUL, si cuvantul se compara cu OUTBOUND_MODE_LABEL si
  // nu cu un sir scris in acest caz: o eticheta schimbata in component fara ca
  // constanta sa se schimbe trebuie sa inroseasca, nu sa treaca pe un text copiat.
  await expect(
    outboundRow(page, project).getByTestId("outbound-item-mode"),
    "randul de proiect isi spune modul",
  ).toHaveText(OUTBOUND_MODE_LABEL.project);
  await expect(
    outboundRow(page, direct).getByTestId("outbound-item-mode"),
    "randul de client direct isi spune modul",
  ).toHaveText(OUTBOUND_MODE_LABEL.direct_client);

  // SI AMANDOUA CUVINTELE SUNT PE LISTA, care este cealalta jumatate a acceptantei
  // (a): nu doar ca fiecare rand poarta ceva, ci ca lista arata chiar cele doua
  // cuvinte romanesti.
  await expect(list).toContainText(OUTBOUND_MODE_LABEL.project);
  await expect(list).toContainText(OUTBOUND_MODE_LABEL.direct_client);

  // SI NICIUNUL DIN CELE DOUA TOKENURI STOCATE NU AJUNGE PE LISTA, P2-01: valoarea
  // unui enum nu este text de interfata. Tokenurile vin din ALL_OUTBOUND_MODES si nu
  // sunt scrise aici, deci un al treilea mod adaugat mai tarziu este verificat fara
  // ca acest caz sa fie editat.
  //
  // DE DOUA ORI, PE TEXT SI PE MARCAJ, fiindca sunt doua afirmatii diferite. Textul
  // spune ce CITESTE operatorul; marcajul spune ca tokenul nu a fost strecurat intr-un
  // atribut "doar pentru test", care ar fi tot un token in pagina.
  //
  // INSTRUMENTUL SE DOVEDESTE CA GASESTE INAINTE SA FIE CREZUT CAND NU GASESTE NIMIC:
  // o cautare care nu potriveste nimic trece la infinit.
  const tokenIn = (haystack: string) =>
    ALL_OUTBOUND_MODES.filter((token) => new RegExp(`\\b${token}\\b`).test(haystack));
  expect(tokenIn("mode is direct_client here"), "instrumentul gaseste un token").toEqual([
    "direct_client",
  ]);
  expect(tokenIn("Proiect si Client direct"), "si nu confunda cuvantul romanesc cu tokenul").toEqual(
    [],
  );

  const listText = await list.innerText();
  expect(tokenIn(listText), `un token stocat este scris pe lista: ${listText}`).toEqual([]);
  const listMarkup = await list.innerHTML();
  expect(tokenIn(listMarkup), "un token stocat este in marcajul listei").toEqual([]);
});

/* ------------------------------------------------------------------ (b) -- */

test("detaliu iesire client direct: clientul este o legatura catre fisa lui si data de ridicare se vede", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // CLAUZA 2. Trei afirmatii despre fisa unei iesiri catre client direct: ea isi
  // numeste modul, clientul ei este o LEGATURA care duce la fisa lui, si ziua
  // ridicarii se vede.
  const { direct } = await seedModePair("C2");
  await signIn(page, ownerAccount());
  await openIssuePanel(page, direct);

  await expect(page.getByTestId("issue-mode"), "fisa isi numeste modul").toContainText(
    OUTBOUND_MODE_LABEL.direct_client,
  );

  // ZIUA RIDICARII, prin acelasi formatDate cu care este scrisa ziua emiterii: se
  // compara cu functia si nu cu "05.11.2026" scris de mana, ca o schimbare de format
  // sa nu poata trece pe langa acest caz.
  await expect(
    page.getByTestId("issue-pickup-date-shown"),
    "ziua ridicarii se vede pe fisa",
  ).toContainText(formatDate(PICKUP_DAY));

  // SI NU EXISTA NICIO LEGATURA CATRE UN PROIECT, fiindca nu exista proiect: randul
  // are project_id null prin outbound_issues_direct_client_mode_shape. O rezerva
  // "Proiect neasociat" ar fi o propozitie despre o lipsa care nu exista.
  await expect(
    page.getByTestId("issue-project-link"),
    "o iesire catre client direct nu are legatura catre proiect",
  ).toHaveCount(0);

  // CLIENTUL ESTE O LEGATURA ADEVARATA, si se merge pe ea: data-linked="true" spune
  // ca RecordLink a desenat un <a> si nu text simplu.
  const clientLink = page.getByTestId("issue-client-link");
  await expect(clientLink, "clientul este o legatura si nu text simplu").toHaveAttribute(
    "data-linked",
    "true",
  );
  const clientName = (await clientLink.innerText()).trim();
  expect(clientName, "legatura poarta numele clientului de test").toContain(CLIENT_NAME);

  await clientLink.click();
  await expect(page, "legatura duce la fisa chiar acelui client").toHaveURL(
    new RegExp(`/clienti/${clientId}$`),
    { timeout: 25_000 },
  );
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("client-detail"), "fisa deschisa este a lui").toContainText(
    clientName,
  );
});

/* ------------------------------------------------------------------ (c) -- */

test("istoricul stocului: randurile de iesire poarta modul", async ({ page }) => {
  test.setTimeout(120_000);

  // CLAUZA 3. Cine citeste de ce a scazut o cantitate deosebeste un bon catre
  // santier de o vanzare la tejghea fara sa deschida fiecare rand.
  const { project, direct } = await seedModePair("C3");
  await signIn(page, ownerAccount());

  // Panoul produsului se deschide dintr-un parametru de URL, pe sku, exact cum il
  // deschide legatura din linia unei iesiri.
  await page.goto(`/inventar?produs=${encodeURIComponent(`${TAG}-SKU`)}`);
  const panel = page.getByTestId("product-panel");
  await expect(panel).toBeVisible({ timeout: 25_000 });

  const rows = page.getByTestId("product-movements").locator("tr");
  const modes = page.getByTestId("movement-mode");
  await expect
    .poll(() => modes.count(), { timeout: 25_000 })
    .toBeGreaterThanOrEqual(2);

  // AMANDOUA FELURILE SUNT SCRISE, si cuvintele vin din OUTBOUND_MODE_LABEL.
  const written = await modes.allInnerTexts();
  const trimmed = written.map((t) => t.trim());
  expect(trimmed, "randurile de iesire poarta modul proiect").toContain(OUTBOUND_MODE_LABEL.project);
  expect(trimmed, "randurile de iesire poarta modul client direct").toContain(
    OUTBOUND_MODE_LABEL.direct_client,
  );

  // SI RANDURILE DE INTRARE NU AU CAPATAT NICIUNUL. Produsul de test are un lot,
  // scris de seedStock, deci exista cel putin un rand de intrare, iar el nu are fel
  // de eliberare: o recepție de la furnizor nu este nici proiect, nici client direct.
  // Se numara, fiindca aceasta este o afirmatie despre CATE randuri poarta modul.
  const rowCount = await rows.count();
  expect(
    rowCount - trimmed.length,
    `${rowCount} miscari si ${trimmed.length} moduri: randurile de intrare nu poarta mod`,
  ).toBeGreaterThanOrEqual(1);

  // SI CONTEXTUL UNEI IESIRI CATRE CLIENT DIRECT NUMESTE CUMPARATORUL. Pana la acest
  // card el scria doar "Ieșire", adica nicio destinatie pe exact randul care explica
  // de ce a scazut o cantitate.
  await expect(panel, `miscarea ${direct} este pe lista`).toContainText(direct);
  await expect(panel, `miscarea ${project} este pe lista`).toContainText(project);
  await expect(panel, "contextul iesirii directe numeste cumparatorul").toContainText(CLIENT_NAME);
});

/* ------------------------------------------------------------------ (d) -- */

test("lista iesirilor: filtrul pe mod arata numai modul ales", async ({ page }) => {
  test.setTimeout(120_000);

  // CLAUZA 4. O lista care arata o deosebire si nu se poate filtra pe ea il pune pe
  // operator sa citeasca fiecare rand.
  //
  // IN AMANDOUA DIRECTIILE, cum cere acceptanta (d): un filtru care ar arata tot ar
  // trece pe jumatatea "randul ales se vede" si nu ar filtra nimic.
  const { project, direct } = await seedModePair("C4");
  await signIn(page, ownerAccount());
  await page.goto("/comenzi");

  await expect(outboundRow(page, project)).toHaveCount(1, { timeout: 25_000 });
  await expect(outboundRow(page, direct)).toHaveCount(1, { timeout: 25_000 });

  const select = page.getByTestId("outbound-mode-filter-select");
  await expect(select, "filtrul pe mod este pe ecran").toBeVisible();

  // CELE TREI OPTIUNI, si numarul se citeste din ALL_OUTBOUND_MODES plus "Toate":
  // un mod adaugat mai tarziu fara o opțiune in filtru trebuie sa inroseasca.
  await expect(select.locator("option")).toHaveCount(ALL_OUTBOUND_MODES.length + 1);
  await expect(select, "optiunea implicita arata tot").toHaveValue("toate");

  // NUMAI PROIECT: randul de proiect se vede, cel de client direct dispare.
  await select.selectOption("project");
  await expect(outboundRow(page, project), "randul de proiect se vede").toHaveCount(1);
  await expect(outboundRow(page, direct), "randul de client direct este ascuns").toHaveCount(0);

  // NUMAI CLIENT DIRECT: exact pe dos. Aceasta este a doua directie.
  await select.selectOption("direct_client");
  await expect(outboundRow(page, direct), "randul de client direct se vede").toHaveCount(1);
  await expect(outboundRow(page, project), "randul de proiect este ascuns").toHaveCount(0);

  // SI "TOATE" LE ADUCE PE AMANDOUA INAPOI, ca filtrul sa fie o alegere si nu un
  // drum fara intoarcere.
  await select.selectOption("toate");
  await expect(outboundRow(page, project)).toHaveCount(1);
  await expect(outboundRow(page, direct)).toHaveCount(1);

  // SI FILTRUL DE DESTINATIE AL CARDULUI P3-10 SE COMPUNE CU ACESTA, nu este
  // inlocuit de el: pe /comenzi?client=<id> butonul lui de golire este pe ecran, iar
  // alegerea "Proiect" taie din ce a lasat el. Iesirea directa este chiar catre acest
  // client, deci ea trece filtrul de destinatie si cade abia la cel de mod: fara acest
  // amanunt cazul ar trece si daca cele doua filtre s-ar inlocui unul pe altul.
  await page.goto(`/comenzi?client=${clientId}`);
  await expect(page.getByTestId("orders-clear-filter")).toBeVisible({ timeout: 25_000 });
  await expect(outboundRow(page, direct), "iesirea directa trece filtrul de client").toHaveCount(1);

  const composed = page.getByTestId("outbound-mode-filter-select");
  await composed.selectOption("project");
  await expect(
    outboundRow(page, direct),
    "cele doua filtre se aplica impreuna si nu unul in locul celuilalt",
  ).toHaveCount(0);
  await expect(
    page.getByTestId("orders-clear-filter"),
    "filtrul de destinatie nu a fost golit de cel de mod",
  ).toBeVisible();
});

test("lista iesirilor: un filtru fara rezultate arata un mesaj, nu o lista goala", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Un client fara nicio iesire: filtrul de destinatie nu potriveste nimic.
  const empty = await asService("clients?select=id", {
    method: "POST",
    // Numele NU contine `${TAG} client`: cautarile din combo-urile celorlalte cazuri
    // trebuie sa mai dea exact o potrivire.
    body: { name: `${TAG} fara iesiri` },
  });
  expect(empty.ok, `clientul gol nu a putut fi scris: ${empty.text}`).toBe(true);
  const emptyClientId = String(empty.rows[0]!.id);

  await signIn(page, ownerAccount());
  await page.goto(`/comenzi?client=${emptyClientId}`);

  const filtered = page.getByTestId("outbound-empty-filtered");
  await expect(filtered).toBeVisible({ timeout: 25_000 });
  await expect(filtered).toHaveText("Nicio ieșire nu se potrivește cu filtrul ales.");
  await expect(page.getByTestId("outbound-empty")).toHaveCount(0);
});

/* =======================================================================
   CARDUL P3-163, ACCEPTANTA (a) SI (b)
   ======================================================================= */

test("iesire client direct: pret unitar si total se afiseaza cu bani, nu rotunjite", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Preturile fractionate cu bani trebuie sa se afiseze exact: 12,50 MDL si
  // 0,40 MDL, nu 13 MDL si 0 MDL. Aceasta verifica ca formatMoneyExact este
  // folosit in loc de formatMoney pentru unitati si totaluri.
  await signIn(page, ownerAccount());
  await chooseDirectClient(page);
  await comboPick(page, "field-client", CLIENT_NAME);
  await page.getByTestId("issue-pickup-date").fill("05.12.2026");

  // Linia 1: 0,40 MDL
  await fillFirstLine(page, "1");
  await page.getByTestId("issue-price-0").fill("0.40");
  const expectedPrice1 = formatMoneyExact(0.4);
  await expect(
    page.getByTestId("issue-price-0"),
    `pret 0,40 se afiseaza exact: ${expectedPrice1}`,
  ).toHaveValue("0.40");

  // Verifica pe display ca nu e rotunjit
  const line1Total = page.getByTestId("issue-price-0").locator("../..").getByText(expectedPrice1);
  await expect(line1Total).toBeVisible();

  // Linia 2: 12,50 MDL
  await page.getByTestId("issue-add-line").click();
  await comboPick(page, "issue-product-1", PRODUCT_NAME);
  await page.getByTestId("issue-quantity-1").fill("2");
  await page.getByTestId("issue-price-1").fill("12.50");
  const expectedPrice2 = formatMoneyExact(12.5);

  // Total tarifat trebuie sa reflecte suma exacta: 0,40 + 2 x 12,50 = 25,40 MDL
  const expectedTotal = formatMoneyExact(0.4 + 2 * 12.5);
  await expect(
    page.locator("text=" + expectedTotal),
    `total tarifat se afiseaza exact: ${expectedTotal}`,
  ).toBeVisible();

  // Trimite si verifica pe fisa ca preturile raman cu bani
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  const reference = (await page.getByTestId("issue-reference").innerText()).trim();

  await openIssuePanel(page, reference);

  // Verifica pe fisa iesirii ca preturile se afiseaza cu bani
  await expect(
    page.locator("text=" + expectedPrice1),
    `unitatile se afiseaza cu bani pe fisa: ${expectedPrice1}`,
  ).toBeVisible();
  await expect(
    page.locator("text=" + expectedPrice2),
    `unitatile se afiseaza cu bani pe fisa: ${expectedPrice2}`,
  ).toBeVisible();
});

test("iesire client direct: casuta de pret sugereaza valoarea exacta a produsului, 12,50 si nu 13", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);
  await fillFirstLine(page, "1");
  await expect(
    page.getByTestId("issue-price-0"),
    "sugestia de pret este valoarea exacta, nu rotunjita la lei intregi",
  ).toHaveAttribute("placeholder", "12,50");
});

test("iesire client direct P3-209: 12,50 tastat cu virgula intra in total, iar un text care nu e pret se refuza", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);
  await fillFirstLine(page, "2");

  await page.getByTestId("issue-price-0").fill("12,50");
  await expect(page.getByTestId("issue-price-error-0")).toHaveCount(0);
  await expect(
    page.locator("text=" + formatMoneyExact(25)).first(),
    "2 x 12,50 = 25 MDL din textul tastat cu virgula",
  ).toBeVisible();

  await page.getByTestId("issue-price-0").fill("abc");
  await expect(page.getByTestId("issue-price-error-0")).toHaveText("Preț invalid. Exemplu: 12,50");
});

/* ------------------------------------------------------------------ (f) -- */

test("iesire client direct: niciun cuvant englez pe ecran si nicio liniuta lunga in fisierele schimbate", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // ACCEPTANTA (f) CERE UN `npm run check:romanian-ui` SAU "the repository's
  // existing no-English-string check, whichever name it carries at the time".
  // NICIUNUL NU EXISTA: package.json nu are niciun script de felul acesta, si
  // nicio specificatie nu poarta o verificare generala de cuvinte englezesti. Asa
  // ca verificarea este ACEST CAZ, si nu un script nou: un script nou ar fi o
  // poarta noua pentru fiecare card al acestui depozit, adica scop pe care nimeni
  // nu l-a cerut. Raportul cardului spune acelasi lucru pe fata.
  //
  // DOUA PROPRIETATI, SI SUNT DESPRE DOUA LUCRURI DIFERITE, deci se masoara cu
  // doua instrumente. Lectura pe care acest depozit a plata de doua ori intr-o zi:
  // un caz care CITESTE SURSA ca sa afle ce se vede pe ecran citeste intr-o zi un
  // comentariu, sau chiar propozitia romaneasca pe care codul o intoarce.
  //
  //   CUVINTELE DE PE ECRAN sunt despre TEXT, deci se citesc DE PE ECRAN, din DOM.
  //   Comentariile acestui card citeaza cardul in engleza, cuvant cu cuvant, si asa
  //   trebuie: un caz care ar citi fisierele ar raporta chiar citatele.
  //
  //   LINIUTELE EM SI EN sunt despre FISIERE, si acolo comentariile CONTEAZA:
  //   regula este ca nu exista nicio liniuta lunga nicaieri, nici in cod, nici in
  //   comentarii, nici in documente, nici in textul unui commit.

  /* ---- partea intai: ce se vede, in romana, cu diacritice ---- */

  await signIn(page, ownerAccount());
  await chooseDirectClient(page);
  await page.getByTestId("client-create-open").click();
  await expect(page.getByTestId("client-create-form")).toBeVisible();

  // Fiecare lucru pe care clauza 5 il enumera, pe ecran, scris romanesc.
  //
  // toContainText SI NU innerText, deliberat: `Th` din primitives.tsx poarta clasa
  // `uppercase`, iar innerText intoarce textul TRANSFORMAT DE CSS, deci "Cantitate"
  // ar sosi "CANTITATE". Aceea este chiar lectura din KNOWN-FAILURES pe care cardul
  // P3-15 a plata cu o rulare. toContainText citeste textul SCRIS, cu diacritice.
  const form = page.getByTestId("outbound-form");
  for (const romanian of [
    "Tip ieșire",
    OUTBOUND_MODE_LABEL.project,
    OUTBOUND_MODE_LABEL.direct_client,
    "Data ridicării",
    "Client nou",
    "Denumire",
    "Salvează clientul",
    "Renunță",
    "Cantitate",
    "Unitate",
    "Preț unitar",
    "Creează bonul de eliberare",
  ]) {
    await expect(form, `"${romanian}" este pe ecran, scris romanesc`).toContainText(romanian);
  }

  // SI INDICATIILE DIN CASUTE, care sunt si ele pe ecran dar NU sunt in textul lui:
  // un placeholder este un atribut, deci toContainText nu il vede. Un card care ar
  // fi lasat o indicatie englezeasca ar fi trecut pe langa verificarea de mai sus.
  await expect(
    page.getByTestId("field-client").locator("input").first(),
    "indicatia selectorului de client este romaneasca",
  ).toHaveAttribute("placeholder", "Caută clientul după nume");
  await expect(
    page.getByTestId("client-create-name"),
    "indicatia din formularul de client nou este romaneasca",
  ).toHaveAttribute("placeholder", "Numele clientului");

  // SI CASUTA DE DATA ESTE CEA STANDARD, CLAUZA 3: indicatia ei este chiar
  // DATE_PLACEHOLDER al lui DateField, adica zz.ll.aaaa, si nu un al doilea fel de
  // casuta de data scris pe acest ecran.
  await expect(
    page.getByTestId("issue-pickup-date"),
    "data ridicarii este casuta zz.ll.aaaa a cardului P3-49",
  ).toHaveAttribute("placeholder", DATE_PLACEHOLDER);
  // Si campul nativ al ei exista si este ASCUNS, care este regula cardului P3-49:
  // niciun camp de data nativ vizibil nicaieri. Masurat pe nume si nu numarand
  // casute, lectura pe care cardul P3-109 a plata cu o rulare.
  await expect(page.getByTestId("issue-pickup-date-native")).toBeHidden();

  // SI UNITATEA VINE DIN unitLabel, deviatia D3: produsul de test este in bucati,
  // si eticheta de pe ecran este chiar cea pe care o da lib/data/units.ts. Nicio
  // lista de unitati nu este scrisa nici in component, nici in acest caz.
  await fillFirstLine(page, "1");
  await expect(form, "unitatea afisata este cea din units.ts").toContainText(unitLabel("pcs"));

  // SI NICIUN CUVANT ENGLEZ NU AJUNGE PE ECRAN.
  //
  // CUVINTE INTREGI, prin `\b`, ca "Date" sa nu fie gasit in "Datele" si "Name" in
  // "Numele". Fiecare cuvant se caută si cu majuscule, fiindca `Th` transforma
  // antetele din CSS si innerText le intoarce transformate: un antet englezesc ar
  // sosi "PRICE" si o potrivire scrisa numai "Price" ar trece pe langa el.
  //
  // CUVINTELE ALESE SUNT CELE PE CARE UN ECRAN NETRADUS LE-AR PURTA, si niciunul nu
  // este si cuvant romanesc scris la fel: "Total" nu este in lista tocmai fiindca
  // este romanesc. "Optional" este, si nu din greseala: forma romaneasca are ț, deci
  // un "Optional" pe ecran ar fi ori englez, ori romanesc fara diacritice, si
  // clauza 5 le refuza pe amandoua.
  const ENGLISH = [
    "Save",
    "Cancel",
    "Submit",
    "Delete",
    "Remove",
    "Create",
    "Search",
    "Select",
    "Choose",
    "Required",
    "Optional",
    "Quantity",
    "Price",
    "Product",
    "Invoice",
    "Loading",
    "Error",
    "Date",
    "Name",
    "Phone",
    "Company",
    "Individual",
    "Add",
    "Close",
  ];
  const englishIn = (haystack: string) =>
    ENGLISH.filter((word) =>
      new RegExp(`\\b(${word}|${word.toUpperCase()})\\b`).test(haystack),
    );

  // INSTRUMENTUL SE DOVEDESTE CA GASESTE, INAINTE SA FIE CREZUT CAND NU GASESTE
  // NIMIC. O cautare intr-un test care nu potriveste nimic trece la infinit, si
  // aceea este lectura pe care cardul P3-110 a plata cu o rulare intreaga. Se
  // dovedesc amandoua formele, fiindca antetele sosesc cu majuscule.
  expect(englishIn("Save the client"), "instrumentul gaseste un cuvant englez").toEqual(["Save"]);
  expect(englishIn("PRICE"), "si il gaseste si cu majuscule, ca in antetele tabelului").toEqual([
    "Price",
  ]);

  /** Tot ce se vede pe ecran: textul vizibil SI indicatiile din casute, fiindca si
   *  un placeholder este pe ecran, iar innerText nu il contine. */
  async function everythingVisible(): Promise<string> {
    const text = await form.innerText();
    const hints = await form
      .locator("[placeholder]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("placeholder") ?? ""));
    return [text, ...hints].join(" | ");
  }

  const onScreen = await everythingVisible();
  expect(
    englishIn(onScreen),
    `cuvinte englezesti pe ecranul clientului direct: ${onScreen}`,
  ).toEqual([]);

  // Si pe confirmare, care este celalalt ecran al acestui card.
  await page.getByTestId("client-create-cancel").click();
  await comboPick(page, "field-client", CLIENT_NAME);
  await page.getByTestId("issue-pickup-date").fill("04.12.2026");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  const confirmed = await page.getByTestId("issue-created").innerText();
  expect(englishIn(confirmed), `cuvinte englezesti pe confirmare: ${confirmed}`).toEqual([]);

  /* ---- partea a doua: nicio liniuta em sau en in fisierele schimbate ---- */

  // LISTA ESTE SCRISA PE NUME SI FIECARE FISIER TREBUIE SA EXISTE. Un fisier
  // redenumit face cazul sa pice zgomotos in loc sa scaneze in gol, fiindca o
  // cautare care nu gaseste niciun fisier trece pentru totdeauna.
  const CHANGED = [
    "components/outbound/OutboundScreen.tsx",
    "components/outbound/OutboundProjectForm.tsx",
    "components/outbound/OutboundDirectClientForm.tsx",
    "components/outbound/OutboundModeChoice.tsx",
    "components/orders/OutboundPanel.tsx",
    "app/(app)/iesiri/page.tsx",
    "lib/data/outbound-types.ts",
    "lib/data/outbound-mode.ts",
    "lib/data/facturare-create-types.ts",
    "lib/data/facturare-create.ts",
    "tests/e2e/outbound-direct-client.spec.ts",
    // CARDUL P3-120 ISI ADAUGA FISIERELE AICI, SI NU SCRIE O A DOUA VERIFICARE DE
    // LINIUTE: regula este una singura, "nicio liniuta em sau en nicaieri", deci un
    // al doilea caz care o masoara ar fi un al doilea loc de tinut la zi. Acceptanta
    // (f) a cardului P3-120 este chiar randurile de mai jos.
    "lib/data/outbound.ts",
    "lib/data/products.ts",
    "components/orders/OrdersScreen.tsx",
    "components/inventory/ProductPanel.tsx",
    "app/(app)/comenzi/page.tsx",
    // SI CELE DOUA SPECIFICATII PE CARE P3-120 LE-A ATINS, fiecare pentru un motiv
    // scris la locul lui: cross-links.spec cauta acum o iesire care ARE proiect in loc
    // sa presupuna ca prima are unul, si phone-lists.spec masoara ca cele doua coloane
    // se suprapun pe verticala in loc sa ceara ca marginile lor de sus sa coincida la
    // un pixel. Niciuna din cele doua nu este pe lista de cazuri care trebuie sa treaca
    // NEATINSE: aceea este `iesire pe proiect: nimic nu s-a schimbat` si tot
    // tests/e2e/outbound.spec.ts, si amandoua au rămas neatinse.
    "tests/e2e/cross-links.spec.ts",
    "tests/e2e/phone-lists.spec.ts",
    ".gitignore",
    // CARDUL P3-130 ISI ADAUGA FISIERELE AICI, pentru acelasi motiv pe care l-a scris
    // P3-120 doua grupe mai sus: regula este una singura, "nicio liniuta em sau en
    // nicaieri", deci un al doilea caz care o masoara ar fi un al doilea loc de tinut
    // la zi. Acceptanta (g) a cardului P3-130 este chiar randurile de mai jos.
    //
    // docs/LEARNINGS.md SI docs/reports/ NU SUNT PE LISTA, SI GOLUL ESTE EXPLICAT:
    // LEARNINGS.md poarta trei liniute em de pe `main`, scrise de alte carduri inainte
    // ca aceasta regula sa existe, si ele nu sunt ale cardului P3-130. A le pune pe
    // lista ar face cazul sa cada pe o datorie veche in locul in care el masoara munca
    // acestui card; a le "repara" in treacat ar fi o atingere pe care niciun card nu a
    // cerut-o. Randurile adaugate de P3-130 in acel fisier nu poarta niciuna.
    "supabase/migrations/0068_tasks.sql",
    "scripts/poc-free/local-db/assertions/0068_tasks.sql",
    "scripts/poc-free/check-pending-schema-reads.mjs",
    "docs/migrations/APPLY-LOG.md",
    "lib/data/schema-capability.ts",
    "lib/data/tasks-types.ts",
    "lib/data/tasks-shape.ts",
    "lib/data/tasks.ts",
    "lib/data/tasks-actions.ts",
    "tests/e2e/tasks.spec.ts",
    // CARDUL P3-147, acelasi motiv: managerul de cont creeaza clientul de la tejghea.
    "supabase/migrations/0076_walkin_manager_client_insert.sql",
    "scripts/poc-free/local-db/assertions/0076_walkin_manager_client_insert.sql",
    "lib/data/client-actions.ts",
    "components/outbound/OutboundDirectClientForm.tsx",
    "app/(app)/iesiri/page.tsx",
  ];

  // CELE DOUA SEMNE SE CONSTRUIESC DIN CODURILE LOR SI NU SE SCRIU, ca acest
  // fisier sa nu poarte chiar ce interzice: el este in lista de mai sus si se
  // citeste pe sine, deci o liniuta scrisa aici ar face cazul sa se acuze singur.
  // 0x2014 este liniuta em, 0x2013 este liniuta en.
  const EM = String.fromCharCode(0x2014);
  const EN = String.fromCharCode(0x2013);
  const LONG_DASH = new RegExp(`[${EM}${EN}]`);
  expect(LONG_DASH.test(`a ${EM} b`), "instrumentul gaseste o liniuta em").toBe(true);
  expect(LONG_DASH.test(`a ${EN} b`), "instrumentul gaseste o liniuta en").toBe(true);
  expect(LONG_DASH.test("a - b"), "si nu confunda cratima obisnuita cu ele").toBe(false);

  for (const file of CHANGED) {
    const source = readFileSync(file, "utf8");
    expect(source.length, `${file} trebuie sa existe si sa nu fie gol`).toBeGreaterThan(0);
    const offenders = source
      .split("\n")
      .map((line, index) => ({ line, at: index + 1 }))
      .filter((l) => LONG_DASH.test(l.line))
      .map((l) => `${file}:${l.at}: ${l.line.trim()}`);
    expect(offenders, `${file} poarta o liniuta em sau en`).toEqual([]);
  }
});
