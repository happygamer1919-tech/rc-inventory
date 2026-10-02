import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/data/tasks-types";
import {
  ALL_TASK_ENTITY_TYPES,
  ALL_TASK_PRIORITIES,
  ALL_TASK_STATUSES,
} from "@/lib/data/tasks-shape";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";

// tasks.spec - linia de acceptanta a cardului P3-130, goal G73, Item 4 al lui Ivan,
// partea intai: tabela Sarcini, regulile ei de acces si stratul de date.
//
// CE SE DOVEDESTE AICI SI CE SE DOVEDESTE IN ASERTIUNI. Fisierul
// scripts/poc-free/local-db/assertions/0068_tasks.sql dovedeste tot ce se poate
// dovedi intr-o singura sesiune psql pe un postgres gol: forma coloanelor, cele trei
// enumerari, perechea tip plus id, si faptul ca tabela poarta select, insert si
// update si NICIO politica de stergere. Ce NU poate dovedi acolo este:
//
//   SECURITATEA PE RAND. Un postgres gol ruleaza ca superutilizator si OCOLESTE
//   politicile, deci o asertiune poate arata ca o politica EXISTA si nu poate arata
//   ce lasa sa treaca. Cele trei cazuri de izolare ale deviatiei D4 au nevoie de
//   jetoane adevarate prin PostgREST, si de aici vin.
//
//   CA O SARCINA ANULATA RAMANE CITIBILA SI NUMARABILA. Aceea este cererea
//   proprietarului cuvant cu cuvant, si ea se vede numai citind randul inapoi dupa
//   ce starea s-a schimbat, cu jetonul unui cont adevarat.
//
//   CA NU EXISTA NICIO CALE DE STERGERE. "Nicio politica de stergere" este o
//   proprietate a catalogului; "nimeni nu poate sterge un rand" este un raspuns pe
//   care numai o incercare adevarata il da, si ea trebuie facuta cu jetonul rolului
//   authenticated, fiindca acela este rolul cu care vorbeste aplicatia.
//
// NUMELE CAZURILOR SUNT CELE PE CARE LE SCRIE CARDUL, CUVANT CU CUVANT, fara
// diacritice. Un nume de caz este un identificator pe care acceptanta il citeaza, si
// a-l "corecta" ar rupe legatura dintre card si proba. Restul textului acestei
// specificatii este romanesc ca oriunde.
//
// DATELE DE TEST NU SE STERG NICIODATA, conventia P2-07, si aici nici nu s-ar putea:
// migratia 0068 nu da tabelei nicio politica si niciun drept de stergere. Tot ce se
// scrie este prefixat TEST si rulat pe stiva locala din CI, niciodata pe productie.
//
// NICIUN ECRAN NU ESTE DESCHIS DE NICIUN CAZ DE AICI, si asta este clauza 7 a
// cardului si nu o lipsa: acest card nu construieste nicio fila si niciun panou, deci
// nu exista nimic de deschis. Filele si panourile se dovedesc in cazurile cardurilor
// P3-131, P3-132 si P3-133, in acest acelasi fisier.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3130-${RUN}`;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "tasks.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "si SUPABASE_SERVICE_ROLE_KEY. In CI sunt exportate de pasul 'Export local Supabase " +
        "credentials'. Local: supabase status -o env.",
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

/** RASPUNSUL POARTA SI ANTETUL `content-range`, pe care cazul (d) il citeste ca
 *  numaratoare. "Numarabila" nu este acelasi lucru cu "citibila": un rand pe care
 *  PostgREST il intoarce dar nu il numara ar trece de o jumatate si ar cadea pe
 *  cealalta, iar cardul cere amandoua. */
type Rest = {
  status: number;
  ok: boolean;
  rows: Record<string, unknown>[];
  text: string;
  contentRange: string | null;
};

async function rest(
  path: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown; prefer?: string } = {
    headers: {},
  },
): Promise<Rest> {
  const response = await fetch(`${env().origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      Prefer: init.prefer ?? "return=representation",
    },
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
  return {
    status: response.status,
    ok: response.ok,
    rows,
    text,
    contentRange: response.headers.get("content-range"),
  };
}

const asService = (path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: serviceHeaders() });
const asUser = (token: string, path: string, init: Omit<Parameters<typeof rest>[1], "headers"> = {}) =>
  rest(path, { ...init, headers: userHeaders(token) });

/** Un cont de autentificare nou, cu profil activ, care poate fi dezactivat fara sa
 *  atinga conturile comune de test: alte specificatii se autentifica cu acelea si o
 *  dezactivare le-ar doborî pe toate. Aceeasi forma ca in
 *  outbound-direct-client.spec si in active-profile-table-reads.spec. */
async function newDeactivatableAccount(label: string): Promise<{ id: string; token: string }> {
  const email = `p3-130-${label}-${RUN}-${randomUUID().slice(0, 8)}@rc-inventory.local`;
  const password = `p3-130-${randomUUID()}`;
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
    body: [{ id, email, role: "account_manager", full_name: "Test P3-130", active: true }],
  });
  expect(profile.ok, `profilul contului de test nu a putut fi scris: ${profile.text}`).toBe(true);

  return { id, token: await accessToken({ email, password, label }) };
}

/* ----------------------------------------------------------- fixturi -- */

let clientId = "";
let projectId = "";
let ownerToken = "";
let managerToken = "";
let seededTaskId = "";

/** Un titlu are spatii, si un spatiu netrecut prin encodeURIComponent ajunge in
 *  interogare ca spatiu crud: PostgREST raspunde atunci despre alt filtru decat cel
 *  scris, iar cazul ar trece pe un set gol care nu dovedeste nimic. */
function byTitle(title: string): string {
  return `tasks?select=id&title=eq.${encodeURIComponent(title)}`;
}

/** O sarcina scrisa cu jetonul dat, prin tabela, care este calea aplicatiei.
 *  Intoarce randul intreg. */
async function createTask(token: string, row: Record<string, unknown>): Promise<Rest> {
  return asUser(token, "tasks?select=id,title,status,priority,entity_type,entity_id", {
    method: "POST",
    body: row,
  });
}

test.beforeAll(async () => {
  ownerToken = await accessToken(ownerAccount());
  managerToken = await accessToken(managerAccount());

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

  // SARCINA PE CARE CAZURILE DE ACCES O CAUTA. Scrisa aici si nu luata din alt caz:
  // un caz care depinde de un alt caz este un caz care cade cand cineva ruleaza unul
  // singur cu --grep.
  const seeded = await createTask(ownerToken, {
    title: `${TAG} sarcina de referinta`,
    priority: "high",
    due_date: "2026-10-05",
    entity_type: "client",
    entity_id: clientId,
  });
  expect(seeded.ok, `sarcina de referinta nu a putut fi scrisa: ${seeded.status} ${seeded.text}`).toBe(
    true,
  );
  seededTaskId = String(seeded.rows[0]!.id);
});

/* =======================================================================
   TOKENURILE SI ETICHETELE, CLAUZA 3 SI CARDUL P2-01
   ======================================================================= */

test("sarcini: tokenurile stocate sunt englezesti si fiecare are o eticheta romaneasca", async () => {
  // DE CE ESTE ACEST CAZ AICI SI NU IN ASERTIUNI. Asertiunile citesc etichetele de
  // enum din catalogul PostgreSQL si dovedesc ca stocatul este englezesc. Ce nu pot
  // atinge de acolo este CELALALT CAPAT al cardului P2-01: ca fiecare token stocat are
  // un cuvant romanesc, si ca randul scris pe tabela poarta chiar tokenul si nu
  // eticheta. Dezacordul celor doua capete este un token crud randat operatorului, sau
  // un cuvant romanesc ajuns in schema.
  //
  // `npx tsc --noEmit` prinde deja un token FARA eticheta, fiindca hartile din
  // lib/data/tasks-types.ts sunt un `Record` pe uniune si nu un `Partial`. Ce nu poate
  // prinde este ce ajunge efectiv pe rand, si acela se citeste din baza, mai jos.
  expect(ALL_TASK_STATUSES, "cele patru stari ale clauzei 3").toEqual([
    "todo",
    "in_progress",
    "done",
    "cancelled",
  ]);
  expect(ALL_TASK_PRIORITIES, "cele trei urgente ale clauzei 3").toEqual(["low", "medium", "high"]);
  // DOUA FELURI DE INREGISTRARE SI NU TREI: un lead este un rand din public.clients
  // care poarta o etapa, deci se leaga ca un client. Decizia este scrisa in
  // lib/data/tasks-types.ts, in secțiunea 3 a migratiei 0068 si in notele cardului.
  expect(ALL_TASK_ENTITY_TYPES, "clientul si proiectul, iar leadul este un client").toEqual([
    "client",
    "project",
  ]);

  for (const status of ALL_TASK_STATUSES) {
    expect(TASK_STATUS_LABEL[status]?.trim() ?? "", `starea ${status} are o eticheta`).not.toBe("");
  }
  for (const priority of ALL_TASK_PRIORITIES) {
    expect(TASK_PRIORITY_LABEL[priority]?.trim() ?? "", `urgenta ${priority} are o eticheta`).not.toBe(
      "",
    );
  }

  // SI CELE PATRU CUVINTE SUNT CELE PE CARE LE-A NUMIT PROPRIETARUL, cu diacriticele
  // lor. Scrise aici o singura data ca proba, fiindca "o eticheta nevida" ar trece si
  // pe o eticheta engleza.
  expect(Object.values(TASK_STATUS_LABEL)).toEqual([
    "De făcut",
    "În lucru",
    "Finalizată",
    "Anulată",
  ]);
  expect(Object.values(TASK_PRIORITY_LABEL)).toEqual(["Scăzută", "Medie", "Ridicată"]);

  // SI RANDUL DIN BAZA POARTA TOKENUL, nu eticheta. Sarcina de referinta a fost
  // scrisa cu `priority: "high"`, deci aici se citeste "high" si niciodata "Ridicată".
  const stored = await asUser(ownerToken, `tasks?select=status,priority&id=eq.${seededTaskId}`);
  expect(stored.rows, "sarcina de referinta se citeste").toHaveLength(1);
  expect(stored.rows[0]!.status, "starea stocata este un token englezesc").toBe("todo");
  expect(stored.rows[0]!.priority, "urgenta stocata este un token englezesc").toBe("high");
});

/* =======================================================================
   (c) CELE TREI CAZURI DE IZOLARE, DEVIATIA D4
   ======================================================================= */
//
// NU EXISTA NICIO ORGANIZATIE SI NICIUNA NU SE INVENTEAZA. Cererea lui Ivan cere o
// izolare pe organizatii; platforma aceasta este o singura companie si nu are model
// de chiriasi. Deviatia D4 preschimba propozitia in cele trei cazuri de mai jos, prin
// predicatele pe care depozitul le are: public.current_app_role() si
// public.is_owner(), amandoua security definer, amandoua din migratia 0001.
// Inventarea unui model de chiriasi ca sa se potriveasca un nume de test ar fi cea
// mai mare schimbare de schema de pe acest board, facuta de decizia nimanui.

test("sarcini: o cerere nesemnata nu vede nicio sarcina", async () => {
  const anonRead = await rest("tasks?select=id&limit=1", { headers: { apikey: env().anon } });
  // NICIO SARCINA, si forma refuzului nu conteaza: secțiunea 7 a migratiei 0068
  // revoca totul de la rolul anon, deci raspunsul este un refuz si nu un set gol.
  // Amandoua sunt "nu vede nicio sarcina" si cazul le primeste pe amandoua, ca sa nu
  // cada pe ziua in care revocarea de grant devine o politica sau invers.
  expect(
    !anonRead.ok || anonRead.rows.length === 0,
    `o cerere nesemnata a citit ${anonRead.rows.length} sarcini: ${anonRead.status} ${anonRead.text}`,
  ).toBe(true);

  const anonWrite = await rest("tasks?select=id", {
    method: "POST",
    headers: { apikey: env().anon },
    body: { title: `${TAG} scrisa nesemnat` },
  });
  expect(anonWrite.ok, "o cerere nesemnata a SCRIS o sarcina").toBe(false);

  // SI NU A SCRIS NIMIC, verificat cu un jeton care vede: un refuz raportat care ar
  // fi lasat totusi randul ar fi mai rau decat niciun refuz.
  const found = await asUser(ownerToken, byTitle(`${TAG} scrisa nesemnat`));
  expect(found.rows, "nicio sarcina scrisa de o cerere nesemnata").toEqual([]);
});

test("sarcini: un cont dezactivat nu vede nicio sarcina", async () => {
  // Contul este nou si se dezactiveaza dupa ce primeste jetonul: conturile comune de
  // test nu se dezactiveaza niciodata, fiindca alte specificatii se autentifica cu ele.
  const { id, token } = await newDeactivatableAccount("dezactivat");

  // MARTORUL: cat timp este activ, citeste sarcina. Fara el, cazul ar trece si pe o
  // tabela pe care nimeni nu o citeste.
  const witness = await asUser(token, `tasks?select=id&id=eq.${seededTaskId}`);
  expect(witness.rows, "profil activ: contul citeste sarcina").toHaveLength(1);

  const off = await asService(`profiles?id=eq.${id}`, { method: "PATCH", body: { active: false } });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);

  // UN REFUZ DE CITIRE ESTE UN SET GOL SI NU O EROARE: securitatea pe rand filtreaza
  // randuri. public.current_app_role() filtreaza pe p.active, deci un profil
  // dezactivat citeste null din ea si politica tasks_select nu il lasa sa vada nimic.
  const blind = await asUser(token, `tasks?select=id&id=eq.${seededTaskId}`);
  expect(blind.status, "profil dezactivat: citirea raspunde tot 200").toBe(200);
  expect(blind.rows, "profil dezactivat: nicio sarcina").toEqual([]);

  // SI NICI LISTA INTREAGA, nu doar randul cautat: un filtru care nu se potriveste ar
  // da si el un set gol.
  const blindAll = await asUser(token, "tasks?select=id&limit=5");
  expect(blindAll.rows, "profil dezactivat: nicio sarcina pe lista intreaga").toEqual([]);
});

test("sarcini: un rol fara permisiune nu poate scrie o sarcina", async () => {
  // CE ESTE "UN ROL FARA PERMISIUNE" IN ACEASTA PLATFORMA, spus pe fata fiindca altfel
  // cazul ar arata ca o intrebare la care nu s-a raspuns. Rolurile sunt doua, owner si
  // account_manager, si amandoua au dreptul la operatiuni: asta este chiar hotararea pe
  // care o scrie migratia 0001 in secțiunea 9. Un rol fara permisiune este deci un
  // apelant din care public.current_app_role() citeste null, adica exact ce intoarce ea
  // pentru un profil dezactivat si pentru unul nesemnat. Acela este predicatul pe care
  // il cer cele trei politici ale migratiei 0068, si acesta este cazul care il incearca.
  const { id, token } = await newDeactivatableAccount("fara-rol");

  // MARTORUL: cat timp are rol, scrie.
  const allowed = await createTask(token, { title: `${TAG} scrisa cu rol` });
  expect(allowed.ok, `un cont cu rol nu a putut scrie: ${allowed.status} ${allowed.text}`).toBe(true);
  const writtenId = String(allowed.rows[0]!.id);

  const off = await asService(`profiles?id=eq.${id}`, { method: "PATCH", body: { active: false } });
  expect(off.ok, `profilul nu a putut fi dezactivat: ${off.text}`).toBe(true);

  const refusedInsert = await createTask(token, { title: `${TAG} scrisa fara rol` });
  expect(refusedInsert.ok, "un rol fara permisiune a SCRIS o sarcina").toBe(false);

  // SI NU POATE NICI SA MODIFICE, care este cealalta jumatate a scrierii: anularea
  // este o modificare, deci o politica de update deschisa ar lasa un cont dezactivat
  // sa anuleze sarcinile altcuiva.
  const refusedUpdate = await asUser(token, `tasks?id=eq.${writtenId}&select=id`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  expect(
    !refusedUpdate.ok || refusedUpdate.rows.length === 0,
    `un rol fara permisiune a modificat o sarcina: ${refusedUpdate.status} ${refusedUpdate.text}`,
  ).toBe(true);

  // SI RANDUL A RAMAS CUM ERA, citit cu un jeton care vede.
  const after = await asUser(ownerToken, `tasks?select=status&id=eq.${writtenId}`);
  expect(after.rows[0]?.status, "sarcina a rămas in starea ei").toBe("todo");

  // SI NICIUN RAND NU A APARUT din incercarea refuzata.
  const none = await asUser(ownerToken, byTitle(`${TAG} scrisa fara rol`));
  expect(none.rows, "nicio sarcina scrisa de un rol fara permisiune").toEqual([]);
});

/* =======================================================================
   (d) ANULATA ESTE O STARE SI RAMANE PE INREGISTRARE
   ======================================================================= */

test("sarcini: o sarcina anulata ramane citibila si numarabila", async () => {
  // ACEST CAZ ESTE PROPOZITIA PROPRIETARULUI, cuvant cu cuvant: "A job that is called
  // off is marked cancelled and stays on the record; nothing is ever deleted, so a
  // month later anyone can still see what was dropped and when." Clauza 4 si deciderea
  // de fond a acestui proiect: datele de test se anuleaza, nu se sterg niciodata.
  const created = await createTask(managerToken, {
    title: `${TAG} sarcina anulata`,
    priority: "low",
    due_date: "2026-10-07",
    entity_type: "project",
    entity_id: projectId,
  });
  expect(created.ok, `sarcina nu a putut fi scrisa: ${created.status} ${created.text}`).toBe(true);
  const id = String(created.rows[0]!.id);
  expect(created.rows[0]!.status, "o sarcina noua porneste de la implicitul coloanei").toBe("todo");

  const cancelled = await asUser(managerToken, `tasks?id=eq.${id}&select=id,status,updated_at`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  expect(cancelled.ok, `anularea a raspuns ${cancelled.status}: ${cancelled.text}`).toBe(true);

  // CITIBILA: randul este tot acolo si se citeste in starea anulata, cu tot ce avea pe
  // el. Nu doar id-ul: "rămâne pe inregistrare" inseamna ca se vede CE a fost lasat.
  const read = await asUser(
    managerToken,
    `tasks?select=id,title,status,priority,due_date,entity_type,entity_id,created_at&id=eq.${id}`,
  );
  expect(read.rows, "sarcina anulata se citeste inapoi").toHaveLength(1);
  const row = read.rows[0]!;
  expect(row.status, "si se citeste in starea anulata").toBe("cancelled");
  expect(row.title, "cu titlul ei").toBe(`${TAG} sarcina anulata`);
  expect(row.priority, "cu urgenta ei").toBe("low");
  expect(row.due_date, "cu termenul ei").toBe("2026-10-07");
  expect(row.entity_type, "si tot legata de inregistrarea ei").toBe("project");
  expect(row.entity_id, "de acel proiect").toBe(projectId);

  // NUMARABILA: PostgREST o numara, si numaratoarea este alt drum decat randurile.
  // `count=exact` pune totalul in antetul content-range, iar un rand pe care baza il
  // intoarce dar nu il numara ar trece de jumatatea de deasupra si ar cadea pe asta.
  const counted = await asUser(
    managerToken,
    `tasks?select=id&status=eq.cancelled&entity_id=eq.${projectId}`,
    { prefer: "count=exact" },
  );
  expect(counted.ok, `numaratoarea a raspuns ${counted.status}: ${counted.text}`).toBe(true);
  expect(counted.contentRange, "antetul de numaratoare exista").not.toBeNull();
  const total = Number(String(counted.contentRange ?? "0/0").split("/")[1]);
  expect(total, "sarcina anulata este numarata").toBeGreaterThanOrEqual(1);

  // SI ESTE PE LISTA CARE NU FILTREAZA PE STARE, care este ce vede un ecran care
  // numara ce a fost lasat intr-o luna. Daca anularea ar ascunde randul, aici s-ar
  // vedea.
  const all = await asUser(managerToken, `tasks?select=id,status&entity_id=eq.${projectId}`);
  expect(
    all.rows.some((r) => r.id === id && r.status === "cancelled"),
    "sarcina anulata este pe lista inregistrarii",
  ).toBe(true);
});

/* =======================================================================
   (e) NU EXISTA NICIO CALE DE STERGERE
   ======================================================================= */

test("sarcini: nu exista nicio cale de stergere a unei sarcini", async () => {
  // DOUA JUMATATI, SI AMANDOUA SUNT NECESARE, fiindca fiecare singura ar fi o regula
  // cu usa: migratia 0068 nu da tabelei NICIO politica de stergere, secțiunea 8, SI nu
  // da rolului authenticated dreptul de stergere, secțiunea 7. Asertiunile citesc
  // catalogul si dovedesc ca niciuna nu exista; aici se incearca sa se stearga.
  //
  // SE INCEARCA CU JETONUL UNUI CONT ADEVARAT, adica pe rolul authenticated, fiindca
  // acela este rolul cu care vorbeste aplicatia. Rolul service_role ocoleste
  // securitatea pe rand si isi pastreaza drepturile, deci o incercare cu el nu ar
  // dovedi nimic despre aplicatie SI ar sterge un rand, ceea ce acest proiect nu face.
  const created = await createTask(ownerToken, { title: `${TAG} nu se sterge` });
  expect(created.ok, `sarcina nu a putut fi scrisa: ${created.status} ${created.text}`).toBe(true);
  const id = String(created.rows[0]!.id);

  // PROPRIETARUL, care este rolul cel mai puternic al aplicatiei. Daca cineva poate
  // sterge, el este acela, si nici el nu poate.
  const asOwner = await asUser(ownerToken, `tasks?id=eq.${id}`, { method: "DELETE" });
  expect(
    !asOwner.ok || asOwner.rows.length === 0,
    `proprietarul a STERS o sarcina: ${asOwner.status} ${asOwner.text}`,
  ).toBe(true);

  const asManager = await asUser(managerToken, `tasks?id=eq.${id}`, { method: "DELETE" });
  expect(
    !asManager.ok || asManager.rows.length === 0,
    `operatorul a STERS o sarcina: ${asManager.status} ${asManager.text}`,
  ).toBe(true);

  // O STERGERE FARA FILTRU, care este forma care goleste o tabela intreaga. Refuzata
  // la fel, si cazul o incearca anume: un drept de stergere lipsa se vede la fel pe
  // un rand si pe toate, dar o politica scrisa greu ar putea sa nu.
  const sweep = await asUser(ownerToken, "tasks?title=like.TEST-P3130*", { method: "DELETE" });
  expect(
    !sweep.ok || sweep.rows.length === 0,
    `o stergere in masa a trecut: ${sweep.status} ${sweep.text}`,
  ).toBe(true);

  // SI RANDUL ESTE TOT ACOLO, dupa toate trei. Fara aceasta jumatate, cazul ar trece
  // si pe o stergere care a reusit si a raportat un refuz.
  const still = await asUser(ownerToken, `tasks?select=id,title&id=eq.${id}`);
  expect(still.rows, "sarcina este tot acolo dupa fiecare incercare de stergere").toHaveLength(1);
  expect(still.rows[0]!.title, "si este aceeasi sarcina").toBe(`${TAG} nu se sterge`);

  // SI SARCINA DE REFERINTA, pe care stergerea in masa ar fi prins-o, este si ea tot
  // acolo.
  const seeded = await asUser(ownerToken, `tasks?select=id&id=eq.${seededTaskId}`);
  expect(seeded.rows, "sarcina de referinta este tot acolo").toHaveLength(1);
});
