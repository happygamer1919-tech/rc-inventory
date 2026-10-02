import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  TASK_ENTITY_TYPE_LABEL,
  TASK_GROUP_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_SORT_DIRECTION_LABEL,
  TASK_SORT_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/data/tasks-types";
import {
  ALL_TASK_ENTITY_TYPES,
  ALL_TASK_PRIORITIES,
  ALL_TASK_STATUSES,
} from "@/lib/data/tasks-shape";
import { DATE_PLACEHOLDER } from "@/components/ui/DateField";
import { chisinauToday } from "@/lib/data/format";
import { managerAccount, ownerAccount, type TestAccount } from "./support/accounts";
import { signIn } from "./support/auth";

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
// NICIUN ECRAN NU ESTE DESCHIS DE NICIUNUL DIN PRIMELE SASE CAZURI, si asta este
// clauza 7 a cardului P3-130 si nu o lipsa: acel card nu a construit nicio fila si
// niciun panou, deci nu exista nimic de deschis. Antetul acesta spunea, pana la
// cardul P3-131:
//
//   "NICIUN ECRAN NU ESTE DESCHIS DE NICIUN CAZ DE AICI... Filele si panourile se
//   dovedesc in cazurile cardurilor P3-131, P3-132 si P3-133, in acest acelasi
//   fisier."
//
// CARDUL P3-131 ESTE ACUM SCRIS si face exact ce i s-a spus sa faca: cele opt cazuri
// noi de la coada acestui fisier deschid fila /sarcini. CELE SASE CAZURI ALE LUI
// P3-130 SUNT NEATINSE, nici un caracter, si asta este jumatate din dovada ca stratul
// de date nu s-a schimbat sub ele.

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

/* =======================================================================
   CARDUL P3-131: FILA Sarcini, LISTA, CELE CINCI FILTRE, CELE TREI SORTARI
   SI CELE TREI GALETI
   ======================================================================= */
//
// CELE SASE CAZURI DE DEASUPRA SUNT ALE CARDULUI P3-130 SI NU SE ATING. Ele dovedesc
// stratul de date si regulile de acces; ce urmeaza dovedeste ecranul care le imbraca.
//
// NUMELE CAZURILOR SUNT CELE PE CARE LE SCRIE ACCEPTANTA CARDULUI, CUVANT CU CUVANT,
// fara diacritice, din acelasi motiv scris in antetul acestui fisier: un nume de caz
// este un identificator pe care acceptanta il citeaza.
//
// ZILELE SE SEMANA RELATIV LA chisinauToday(), NICIODATA CA LITERALI. O margine
// scrisa "2026-10-01" este o margine care putrezeste in ziua in care calendarul trece
// de ea, si cazurile care masoara chiar marginea ar inceta sa o masoare fara sa o
// spuna. Cazurile care NU au nevoie de margine folosesc ferestre de ani indepartati,
// una per caz, ca filtrul de interval al unui caz sa nu intalneasca randurile altuia.
//
// FIECARE CAZ ISI MASOARA PROPRIILE ID-URI SI NU NUMARA RANDURI. Datele de test nu se
// sterg niciodata in acest depozit, conventia P2-07, deci fiecare rulare lasa randuri
// in urma si orice "lista are N randuri" ar fi un caz care cade de la a doua rulare.
// Aceasta este lectura pe care cardul P3-101 a plata cu doua cazuri roșii.
//
// O SINGURA EXCEPTIE, SI ESTE ANUME: cazul de acord al clauzei 6 masoara TOATA lista,
// fiindca acceptanta (d) cere egalitatea celor doua MULTIMI si ea este mai tare
// dovedita peste tot ce exista decat peste sapte randuri semanate.

const SARCINI = "/sarcini";
const P131 = `TEST-P3131-${RUN}`;

/** Ziua de azi in Chisinau, aflata o singura data pentru tot fisierul.
 *
 *  CITITA DIN ACEEASI FUNCTIE PE CARE O CITESTE ECRANUL, chisinauToday() din
 *  lib/data/format.ts, si nu rescrisa aici: o a doua definitie a zilei intr-un test
 *  care tocmai dovedeste ca exista una singura ar fi exact gluma pe care clauza 6
 *  incearca sa o previna. */
const TODAY = chisinauToday();

/** O zi de calendar mutata cu n zile, ca sir `yyyy-mm-dd`.
 *
 *  ARITMETICA PE ZILE DE CALENDAR, nu pe momente: miezul noptii UTC se construieste
 *  din chiar cifrele zilei si se citesc inapoi numai parti UTC, deci construirea si
 *  citirea se anuleaza una pe alta. Acelasi tipar si acelasi motiv ca
 *  endOfChisinauWeek din lib/data/tasks-shape.ts. */
function shiftDay(day: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  expect(m, `ziua ${day} are forma yyyy-mm-dd`).not.toBeNull();
  const at = new Date(Date.UTC(Number(m![1]), Number(m![2]) - 1, Number(m![3])));
  at.setUTCDate(at.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/** Id-ul profilului unui cont de test. Filtrul de responsabil filtreaza pe PROFIL,
 *  deviatia D4: nu exista niciun model de organizatie si niciunul nu se inventeaza. */
async function profileIdOf(email: string): Promise<string> {
  const r = await asService(`profiles?select=id&email=eq.${encodeURIComponent(email)}`);
  expect(r.rows, `profilul ${email} se citeste`).toHaveLength(1);
  return String(r.rows[0]!.id);
}

/** O sarcina semanata prin tabela, cu jetonul administratorului, care este calea
 *  aplicatiei. Intoarce id-ul. Aceeasi cale de semanat ca a celor sase cazuri de mai
 *  sus, nu o a doua. */
async function seed(row: Record<string, unknown>): Promise<string> {
  const written = await createTask(ownerToken, row);
  expect(
    written.ok,
    `sarcina de test nu a putut fi scrisa: ${written.status} ${written.text}`,
  ).toBe(true);
  return String(written.rows[0]!.id);
}

/** Un client nou, semanat ca serviciu. Un LEAD este un rand de client care poarta o
 *  etapa de lead, deci acelasi drum il scrie pe amandoua. */
async function seedClient(name: string): Promise<string> {
  const r = await asService("clients?select=id", { method: "POST", body: { name, active: true } });
  expect(r.ok, `clientul de test nu a putut fi scris: ${r.text}`).toBe(true);
  return String(r.rows[0]!.id);
}

/** Muta etapa unui rand de client prin chiar functia pe care o foloseste aplicatia,
 *  public.set_client_stage, ca in crm-landing.spec. */
async function setStage(clientRowId: string, stage: string): Promise<void> {
  const r = await asUser(ownerToken, "rpc/set_client_stage", {
    method: "POST",
    body: { p_client_id: clientRowId, p_stage: stage, p_follow_up_date: null },
  });
  expect(r.ok, `etapa ${stage} nu a putut fi scrisa: ${r.status} ${r.text}`).toBe(true);
}

type ScreenRow = { id: string; group: string; overdue: boolean };

/** Randurile de pe ecran, IN ORDINEA DIN DOM, fiecare cu capul de grup sub care sta
 *  si cu marcajul de intarziere pe care il poarta.
 *
 *  SE CITESC ATRIBUTE SI NU TEXT, fiindca grupul si marcajul sunt fapte despre rand
 *  si nu cuvinte: un cip citit ca text ar fi masurat si traducerea, care este alt
 *  lucru si are deja cazul ei. */
async function screenRows(page: Page): Promise<ScreenRow[]> {
  return page.getByTestId("task-row").evaluateAll((els) =>
    els.map((e) => ({
      id: e.getAttribute("data-id") ?? "",
      group: e.getAttribute("data-group") ?? "",
      overdue: e.getAttribute("data-overdue") === "true",
    })),
  );
}

/** Numai id-urile semanate de cazul care intreaba, in ordinea din DOM. Celelalte
 *  randuri ale bazei nu conteaza: vezi antetul despre datele care nu se sterg. */
function mineInOrder(rows: ScreenRow[], mine: string[]): string[] {
  return rows.map((r) => r.id).filter((id) => mine.includes(id));
}

/** Randul unei sarcini anume, pe id. */
function rowById(page: Page, id: string): Locator {
  return page.locator(`[data-testid="task-row"][data-id="${id}"]`);
}

/** Deschide fila cu filtrele date scrise direct in adresa.
 *
 *  PRIN ADRESA SI NU PRIN CONTROALE, fiindca adresa este adevarul: ea este ce ecranul
 *  citeste si ce un operator trimite cuiva ca legatura. Ca si CONTROALELE conduc
 *  adresa se dovedeste separat, in cazurile filtrelor si sortarilor. */
async function openSarcini(page: Page, params: Record<string, string> = {}): Promise<void> {
  const search = new URLSearchParams(params).toString();
  await page.goto(search === "" ? SARCINI : `${SARCINI}?${search}`);
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
}

/* ------------------------------------------------- (a) cele cinci filtre -- */

test("sarcini: fiecare dintre cele cinci filtre restrange lista", async ({ page }) => {
  test.setTimeout(300_000);

  const ownerProfile = await profileIdOf(ownerAccount().email);
  const managerProfile = await profileIdOf(managerAccount().email);
  expect(ownerProfile, "cele doua conturi de test au profiluri diferite").not.toBe(managerProfile);

  // SASE SARCINI: UN MARTOR SI CINCI VARIANTE, fiecare varianta diferita de martor in
  // EXACT O DIMENSIUNE. Asa fiecare filtru se dovedeste SINGUR: pus pe valoarea
  // variantei, ecranul trebuie sa arate varianta si sa ascunda martorul SI celelalte
  // patru variante. Un set in care doua randuri difera in doua dimensiuni ar trece si
  // pe un filtru care filtreaza altceva decat scrie pe el.
  const base = {
    status: "todo",
    priority: "low",
    assignee_id: ownerProfile,
    due_date: "2033-03-01",
    entity_type: "client",
    entity_id: clientId,
  };

  const witness = await seed({ ...base, title: `${P131} filtre martor` });
  const byStatus = await seed({ ...base, title: `${P131} filtre stare`, status: "in_progress" });
  const byPriority = await seed({ ...base, title: `${P131} filtre urgenta`, priority: "high" });
  const byAssignee = await seed({
    ...base,
    title: `${P131} filtre responsabil`,
    assignee_id: managerProfile,
  });
  const byDue = await seed({ ...base, title: `${P131} filtre termen`, due_date: "2033-03-20" });
  const byEntity = await seed({
    ...base,
    title: `${P131} filtre fel`,
    entity_type: "project",
    entity_id: projectId,
  });

  const all = [witness, byStatus, byPriority, byAssignee, byDue, byEntity];

  await signIn(page, ownerAccount());

  // MARTORUL INTREGULUI CAZ: fara niciun filtru, toate sase sunt pe ecran. Fara el,
  // fiecare asertiune de mai jos ar trece si pe un ecran care nu arata nimic.
  await openSarcini(page);
  expect(
    mineInOrder(await screenRows(page), all).sort(),
    "fara filtru, toate cele sase sarcini semanate sunt pe lista",
  ).toEqual([...all].sort());

  /** Pune filtrele date si cere ca EXACT sarcinile asteptate dintre ale mele sa
   *  rămână pe ecran. */
  async function narrows(
    label: string,
    params: Record<string, string>,
    expected: string[],
  ): Promise<void> {
    await openSarcini(page, params);
    const shown = mineInOrder(await screenRows(page), all);
    expect([...shown].sort(), `filtrul ${label}`).toEqual([...expected].sort());
  }

  // 1. STARE. Valorile sunt TOKENURI ENGLEZESTI in adresa si CUVINTE ROMANESTI pe
  //    ecran, P2-01: ce se stocheaza si ce se citeste sunt doua lucruri.
  await narrows("stare", { stare: "in_progress" }, [byStatus]);
  // 2. URGENTA.
  await narrows("urgenta", { urgenta: "high" }, [byPriority]);
  // 3. RESPONSABIL, pe profil, deviatia D4.
  await narrows("responsabil", { responsabil: managerProfile }, [byAssignee]);
  // 4. INTERVAL DE TERMEN, cu AMANDOUA capetele: un singur capat ar fi trecut si pe
  //    un filtru care compara in alta parte, fiindca restul semanaturii este in
  //    2033-03-01 si ea cade sub oricare din cele doua margini.
  await narrows("interval de termen", { de_la: "2033-03-10", pana_la: "2033-03-31" }, [byDue]);
  // 5. FELUL INREGISTRARII LEGATE.
  await narrows("fel inregistrare", { fel: "project" }, [byEntity]);

  // SI CELE CINCI SUNT CHIAR CELE CINCI, nici un control in plus pe randul de filtre:
  // clauza 3 spune "Do not add a sixth filter because it seemed useful". Se numara PE
  // NUME si nu pe forma, fiindca DateField randeaza DOUA campuri per casuta, cel
  // vizibil zz.ll.aaaa si cel nativ ascuns pentru calendar: aceea este lectura pe care
  // cardul P3-109 a plata cu o rulare intreaga pe un `input[data-testid]`.
  await openSarcini(page);
  for (const control of [
    "tasks-status",
    "tasks-priority",
    "tasks-assignee",
    "tasks-due-from",
    "tasks-due-to",
    "tasks-entity-type",
  ]) {
    await expect(
      page.getByTestId(control),
      `controlul ${control} este pe randul de filtre`,
    ).toBeVisible();
  }
  // Si niciun al saselea filtru: randul nu poarta nicio casuta de cautare, deci
  // singurele campuri de text de pe el sunt cele doua casute de termen.
  await expect(
    page.getByTestId("tasks-filters").locator('input[type="text"]'),
    "pe randul de filtre sunt numai cele doua casute de termen",
  ).toHaveCount(2);
  // Si niciun camp nativ de data VIZIBIL, care este regula cardului P3-49.
  await expect(page.getByTestId("tasks-due-from-native")).toBeHidden();
  await expect(page.getByTestId("tasks-due-to-native")).toBeHidden();

  // SI CONTROLUL CONDUCE ADRESA, nu doar adresa controlul. Casuta standard zz.ll.aaaa
  // scrie capatul in adresa si lista se restrange pe el.
  await page.getByTestId("tasks-due-from").fill("10.03.2033");
  await page.waitForURL(/de_la=2033-03-10/, { timeout: 30_000 });
  await page.getByTestId("tasks-due-to").fill("31.03.2033");
  await page.waitForURL(/pana_la=2033-03-31/, { timeout: 30_000 });
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  expect(
    mineInOrder(await screenRows(page), all),
    "intervalul scris in casuta restrange aceeasi lista",
  ).toEqual([byDue]);

  // SI Șterge filtrele APARE NUMAI CAND ESTE CEVA DE STERS, si sterge exact filtrele.
  await expect(page.getByTestId("tasks-clear")).toBeVisible();
  await page.getByTestId("tasks-clear").click();
  await expect(page.getByTestId("tasks-clear")).toHaveCount(0, { timeout: 30_000 });
  expect(
    mineInOrder(await screenRows(page), all).sort(),
    "dupa Șterge filtrele lista este iar intreaga",
  ).toEqual([...all].sort());
});

/* ------------------------------------------------- (b) cele trei sortari -- */

test("sarcini: fiecare dintre cele trei sortari ordoneaza lista", async ({ page }) => {
  test.setTimeout(300_000);

  // TREI SARCINI A CAROR ORDINE ESTE ALTA PE FIECARE DIN CELE TREI SORTARI, si asta
  // este singura forma de semanat care dovedeste ceva. Cu un set in care doua sortari
  // dau aceeasi ordine, o sortare care citeste coloana greșită ar trece.
  //
  //   termen crescator   A, B, C
  //   urgenta crescator  B, C, A   (low, medium, high: ordinea enumerarii din 0068)
  //   creare crescator   C, A, B
  //
  // Cele trei sunt rotatii diferite, deci si cele trei descrescatoare sunt diferite:
  // sase ordini distincte pentru sase asertiuni.
  //
  // created_at SE SCRIE ANUME si nu se lasa pe implicitul coloanei: trei inserari una
  // dupa alta primesc trei clipe apropiate, si o ordine care atarna de microsecunde
  // este o ordine pe care un test nu o poate numi. Momentele sunt in trecut si
  // distincte. Dreptul de a le scrie vine din migratia 0068 secțiunea 7, care da
  // rolului authenticated insert pe TABELA, deci pe fiecare coloana a ei.
  const fereastra = { de_la: "2034-05-01", pana_la: "2034-05-31" };
  const C = await seed({
    title: `${P131} sortare C`,
    due_date: "2034-05-30",
    priority: "medium",
    created_at: "2026-02-01T08:00:00Z",
  });
  const A = await seed({
    title: `${P131} sortare A`,
    due_date: "2034-05-10",
    priority: "high",
    created_at: "2026-02-01T09:00:00Z",
  });
  const B = await seed({
    title: `${P131} sortare B`,
    due_date: "2034-05-20",
    priority: "low",
    created_at: "2026-02-01T10:00:00Z",
  });
  const mine = [A, B, C];

  await signIn(page, ownerAccount());

  /** Cere o sortare si o directie si citeste ordinea mea de pe ecran. */
  async function order(sortare: string, ordine: string): Promise<string[]> {
    await openSarcini(page, { ...fereastra, sortare, ordine });
    return mineInOrder(await screenRows(page), mine);
  }

  // SI TOATE TREI STAU SUB ACELASI CAP DE GRUP, altfel ordinea citita din DOM ar fi
  // ordinea GRUPURILOR si nu a sortarii: o lista grupata are o ordine inauntrul
  // grupurilor, nu peste ele. Cele trei termene sunt in 2034, deci cad toate in
  // acelasi recipient.
  await openSarcini(page, fereastra);
  const groups = (await screenRows(page)).filter((r) => mine.includes(r.id)).map((r) => r.group);
  expect(groups, "toate trei sunt pe ecran").toHaveLength(3);
  expect(new Set(groups).size, "si toate trei stau sub acelasi cap de grup").toBe(1);

  // 1. TERMEN, amandoua directiile.
  expect(await order("termen", "crescator"), "termen crescator").toEqual([A, B, C]);
  expect(await order("termen", "descrescator"), "termen descrescator").toEqual([C, B, A]);

  // 2. URGENTA, amandoua directiile. Crescator inseamna Scăzută intai, fiindca
  //    PostgreSQL ordoneaza o enumerare dupa ordinea in care etichetele sunt
  //    DECLARATE, iar migratia 0068 le declara low, medium, high.
  expect(await order("urgenta", "crescator"), "urgenta crescator").toEqual([B, C, A]);
  expect(await order("urgenta", "descrescator"), "urgenta descrescator").toEqual([A, C, B]);

  // 3. DATA CREARII, amandoua directiile.
  expect(await order("creare", "crescator"), "creare crescator").toEqual([C, A, B]);
  expect(await order("creare", "descrescator"), "creare descrescator").toEqual([B, A, C]);

  // SI CELE TREI SUNT CHIAR CELE TREI, nici una a patra: selectorul poarta exact
  // optiunile pe care le numeste clauza 4, in cuvintele lor romanesti.
  await openSarcini(page, fereastra);
  await expect(page.getByTestId("tasks-sort").locator("option")).toHaveText([
    TASK_SORT_LABEL.termen,
    TASK_SORT_LABEL.urgenta,
    TASK_SORT_LABEL.creare,
  ]);
  await expect(page.getByTestId("tasks-direction").locator("option")).toHaveText([
    TASK_SORT_DIRECTION_LABEL.crescator,
    TASK_SORT_DIRECTION_LABEL.descrescator,
  ]);

  // SI CONTROLUL CONDUCE ADRESA si aici, nu doar adresa controlul.
  await page.getByTestId("tasks-sort").selectOption("urgenta");
  await page.waitForURL(/sortare=urgenta/, { timeout: 30_000 });
  await page.getByTestId("tasks-direction").selectOption("descrescator");
  await page.waitForURL(/ordine=descrescator/, { timeout: 30_000 });
  await expect(page.getByTestId("tasks-filters")).toBeVisible({ timeout: 30_000 });
  expect(
    mineInOrder(await screenRows(page), mine),
    "sortarea aleasa din selectoare ordoneaza aceeasi lista",
  ).toEqual([A, C, B]);
});

/* --------------------------- (c) marcajul de intarziere, pe margine -- */

test("sarcini: o sarcina trecuta de termen este marcata, iar una cu termen azi nu este", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // MARGINEA ESTE CHIAR CE MASOARA ACEST CAZ, deci cele doua zile se semana RELATIV la
  // chisinauToday() si niciodata ca literali: un literal ar inceta sa fie o margine in
  // ziua in care calendarul trece de el, si cazul ar continua sa treaca.
  const late = await seed({
    title: `${P131} margine ieri`,
    due_date: shiftDay(TODAY, -1),
    status: "todo",
  });
  const dueToday = await seed({ title: `${P131} margine azi`, due_date: TODAY, status: "todo" });

  await signIn(page, ownerAccount());
  await openSarcini(page);

  const rows = await screenRows(page);
  const read = (id: string) => rows.find((r) => r.id === id);

  expect(read(late), "sarcina de ieri este pe ecran").toBeDefined();
  expect(read(dueToday), "sarcina de azi este pe ecran").toBeDefined();

  expect(read(late)!.overdue, "o sarcina trecuta de termen este marcata").toBe(true);
  expect(read(late)!.group, "si sta in galeata Restante").toBe("restante");

  // O SARCINA CU TERMEN AZI NU ESTE INTARZIATA, ceea ce cardul spune de doua ori.
  expect(read(dueToday)!.overdue, "o sarcina cu termen azi NU este marcata").toBe(false);
  expect(read(dueToday)!.group, "si sta in galeata Azi").toBe("azi");

  // SI MARCAJUL ESTE CHIAR VIZIBIL PE RAND, clauza 5 ("OVERDUE IS FLAGGED, visibly, on
  // the row"), cu CUVANTUL langa el si nu numai o culoare. Un atribut citit mai sus
  // este un fapt despre rand; aceasta este jumatatea pe care o vede operatorul.
  await expect(rowById(page, late).getByTestId("task-overdue")).toBeVisible();
  await expect(rowById(page, late).getByTestId("task-overdue")).toHaveText("Întârziată");
  await expect(rowById(page, dueToday).getByTestId("task-overdue")).toHaveCount(0);
});

/* -------------------- (d) GALETILE SI MARCAJUL FOLOSESC ACEEASI ZI -- */

test("sarcini: galetile Azi, Aceasta saptamana si Restante folosesc aceeasi definitie a zilei ca marcajul de intarziere", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // ACESTA ESTE CAZUL PE CARE NOTELE CARDULUI IL NUMESC PARTEA DE NIMERIT: "CLAUSE 6
  // IS THE ONE TO GET RIGHT. Two definitions of 'late' on one screen is a defect that
  // looks like a data problem for weeks."
  //
  // SE SEMANA UN SET CARE TRECE PESTE MARGINE, si nu numai doua randuri: cele patru
  // stari pe o zi trecuta, apoi azi, apoi mai departe, apoi FARA TERMEN. Daca
  // excluderea de stare a clauzei 5 ar trai in marcaj si nu in galeata, cele doua
  // multimi s-ar departa exact pe randurile finalizat si anulat de mai jos.
  const yesterday = shiftDay(TODAY, -1);
  const open = await seed({
    title: `${P131} acord ieri de facut`,
    due_date: yesterday,
    status: "todo",
  });
  const working = await seed({
    title: `${P131} acord ieri in lucru`,
    due_date: yesterday,
    status: "in_progress",
  });
  const done = await seed({
    title: `${P131} acord ieri finalizata`,
    due_date: yesterday,
    status: "done",
  });
  const cancelled = await seed({
    title: `${P131} acord ieri anulata`,
    due_date: yesterday,
    status: "cancelled",
  });
  const today = await seed({ title: `${P131} acord azi`, due_date: TODAY, status: "todo" });
  const soon = await seed({
    title: `${P131} acord maine`,
    due_date: shiftDay(TODAY, 1),
    status: "todo",
  });
  const noDate = await seed({ title: `${P131} acord fara termen`, status: "todo" });

  await signIn(page, ownerAccount());
  await openSarcini(page);

  const rows = await screenRows(page);
  expect(rows.length, "ecranul are randuri").toBeGreaterThan(0);

  // ACEASTA ESTE ACCEPTANTA (d), CUVANT CU CUVANT: multimea sarcinilor din Restante
  // ESTE EGALA cu multimea celor care poarta marcajul. Citita peste TOATA lista si nu
  // numai peste randurile semanate, fiindca egalitatea a doua multimi este mai tare
  // dovedita peste tot ce exista.
  const inRestante = rows
    .filter((r) => r.group === "restante")
    .map((r) => r.id)
    .sort();
  const flagged = rows
    .filter((r) => r.overdue)
    .map((r) => r.id)
    .sort();
  expect(
    flagged,
    `galeata Restante si marcajul de intarziere nu sunt de acord: ${inRestante.length} in galeata, ${flagged.length} marcate`,
  ).toEqual(inRestante);

  // SI MULTIMEA NU ESTE GOALA, altfel egalitatea de deasupra ar fi trecut pe un ecran
  // care nu marcheaza nimic si nu grupeaza nimic.
  expect(
    inRestante.length,
    "exista randuri in Restante, deci egalitatea spune ceva",
  ).toBeGreaterThan(0);

  const read = (id: string) => {
    const row = rows.find((r) => r.id === id);
    expect(row, `randul ${id} este pe ecran`).toBeDefined();
    return row!;
  };

  expect(read(open).group, "de facut, trecuta de termen: Restante").toBe("restante");
  expect(read(working).group, "in lucru, trecuta de termen: Restante").toBe("restante");
  // CLAUZA 5 SCOATE ANUME FINALIZATA SI ANULATA: "past its due date and not finished
  // or cancelled". Excluderea trebuie sa fie identica in galeata si in marcaj, iar
  // singurul fel in care poate fi este sa fie scrisa o singura data.
  expect(read(done).group, "finalizata, trecuta de termen: NU in Restante").not.toBe("restante");
  expect(read(done).overdue, "si nici marcata").toBe(false);
  expect(read(cancelled).group, "anulata, trecuta de termen: NU in Restante").not.toBe("restante");
  expect(read(cancelled).overdue, "si nici marcata").toBe(false);

  expect(read(today).group, "cu termen azi: galeata Azi").toBe("azi");
  expect(read(today).overdue, "si nu este intarziata").toBe(false);

  // MAINE NU PRIMESTE UN GRUP ANUME IN ACEST CAZ, SI GOLUL ESTE ANUME: cand azi este
  // duminica, maine este luni, adica SAPTAMANA VIITOARE, deci grupul lui atarna de
  // ziua in care ruleaza suita. Ce se cere este singurul lucru adevarat in fiecare zi:
  // o sarcina cu termen in viitor nu este intarziata.
  expect(read(soon).overdue, "cu termen in viitor: nu este intarziata").toBe(false);

  // SI O SARCINA FARA TERMEN APARE PE LISTA, SUB CAPUL EI DE GRUP, si nu este
  // niciodata intarziata. Clauza 6 cere ca galetile sa fie o GRUPARE a aceleiasi
  // liste: o sarcina care exista si nu se vede nicaieri este mai rau decat orice
  // grupare. Termenul lipsa este o stare adevarata si nu o lipsa de date.
  expect(read(noDate).group, "fara termen: recipientul Fără termen").toBe("fara_termen");
  expect(read(noDate).overdue, "si niciodata intarziata").toBe(false);
  await expect(rowById(page, noDate).getByTestId("task-due-date")).toHaveText("Fără termen");

  // SI CAPETELE DE GRUP SUNT CELE CINCI CUNOSCUTE, in cuvintele lor romanesti: niciun
  // cap nu poarta un cuvant pe care lib/data/tasks-types.ts nu il scrie, si cele doua
  // galeti pe care setul semanat le umple au fiecare capul ei.
  const heads = (await page.getByTestId("tasks-group-label").allTextContents()).map((h) =>
    h.trim(),
  );
  for (const head of heads) {
    expect(
      Object.values(TASK_GROUP_LABEL),
      `capul de grup "${head}" este unul din cele cinci cunoscute`,
    ).toContain(head);
  }
  expect(heads, "galeata Restante are capul ei").toContain(TASK_GROUP_LABEL.restante);
  expect(heads, "galeata Azi are capul ei").toContain(TASK_GROUP_LABEL.azi);
  expect(heads, "si recipientul Fără termen are capul lui").toContain(
    TASK_GROUP_LABEL.fara_termen,
  );
});

/* ---------------------------- (e) creare, modificare si anulare -- */

test("sarcini: se poate crea, modifica si anula o sarcina din ecran", async ({ page }) => {
  test.setTimeout(300_000);

  const fereastra = { de_la: "2035-06-01", pana_la: "2035-06-30" };
  const created = `${P131} creata din ecran`;
  const changed = `${P131} modificata din ecran`;

  await signIn(page, ownerAccount());
  // FEREASTRA SE PUNE INAINTE DE CREARE, ca randul nou sa apara pe o lista scurta:
  // termenul pe care formularul il scrie cade in ea. Nu este un ocol, este chiar
  // filtrul clauzei 3 folosit pentru ce exista.
  await openSarcini(page, fereastra);

  /* ---- creare ---- */

  await page.getByTestId("task-new").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await page.getByTestId("field-task-title").fill(created);
  await page.getByTestId("field-task-due-date").fill("15.06.2035");
  await page.getByTestId("field-task-priority").selectOption("high");
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  const row = page
    .getByTestId("task-row")
    .filter({ has: page.getByTestId("task-title").getByText(created, { exact: true }) });
  await expect(row, "sarcina creata din ecran este pe lista").toHaveCount(1, { timeout: 30_000 });
  await expect(row.getByTestId("task-status")).toHaveText(TASK_STATUS_LABEL.todo);
  await expect(row.getByTestId("task-priority")).toHaveText(TASK_PRIORITY_LABEL.high);
  await expect(row.getByTestId("task-due-date")).toHaveText("15.06.2035");

  // SI RANDUL DIN BAZA POARTA TOKENURILE SI NU ETICHETELE, P2-01: ecranul a aratat
  // "Ridicată" si baza trebuie sa fi primit "high".
  const id = (await row.getAttribute("data-id")) ?? "";
  expect(id, "randul creat are id").not.toBe("");
  const stored = await asUser(
    ownerToken,
    `tasks?select=title,status,priority,due_date&id=eq.${id}`,
  );
  expect(stored.rows, "sarcina creata se citeste din baza").toHaveLength(1);
  expect(stored.rows[0]!.status, "starea stocata este un token englezesc").toBe("todo");
  expect(stored.rows[0]!.priority, "urgenta stocata este un token englezesc").toBe("high");
  expect(stored.rows[0]!.due_date, "termenul stocat este ziua scrisa in casuta").toBe("2035-06-15");

  /* ---- modificare ---- */

  await row.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await expect(page.getByTestId("field-task-title")).toHaveValue(created);
  await page.getByTestId("field-task-title").fill(changed);
  await page.getByTestId("field-task-status").selectOption("in_progress");
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  const edited = rowById(page, id);
  await expect(edited.getByTestId("task-title")).toHaveText(changed, { timeout: 30_000 });
  await expect(edited.getByTestId("task-status")).toHaveText(TASK_STATUS_LABEL.in_progress);

  /* ---- anulare, CARE ESTE O SCHIMBARE DE STARE SI NU O STERGERE ---- */

  await edited.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await page.getByTestId("task-cancel-task").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });

  // SARCINA ESTE TOT ACOLO, si asta este jumatatea care conteaza: propozitia
  // proprietarului este "a job that is called off is marked cancelled and stays on the
  // record".
  await expect(edited, "sarcina anulata este TOT pe lista").toHaveCount(1, { timeout: 30_000 });
  await expect(edited.getByTestId("task-status")).toHaveText(TASK_STATUS_LABEL.cancelled, {
    timeout: 30_000,
  });
  await expect(edited.getByTestId("task-title")).toHaveText(changed);

  const after = await asUser(ownerToken, `tasks?select=id,status,title&id=eq.${id}`);
  expect(after.rows, "randul exista in baza dupa anulare").toHaveLength(1);
  expect(after.rows[0]!.status, "si poarta starea anulata").toBe("cancelled");

  // SI BUTONUL DE ANULARE NU MAI ESTE OFERIT pe o sarcina deja anulata: un buton care
  // scrie starea pe care randul o are deja nu face nimic si nu spune nimic.
  await edited.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await expect(page.getByTestId("task-cancel-task")).toHaveCount(0);
  await page.getByTestId("task-form-close").click();
});

/* ------------------------ (f) niciun control de stergere pe ecran -- */

test("sarcini: nu exista niciun control de stergere pe ecran", async ({ page }) => {
  test.setTimeout(300_000);

  const fereastra = { de_la: "2036-07-01", pana_la: "2036-07-31" };
  const id = await seed({
    title: `${P131} fara stergere`,
    due_date: "2036-07-15",
    status: "todo",
    entity_type: "client",
    entity_id: clientId,
  });

  /* ---- partea intai: ce se poate APASA, pe rand si in panou ---- */

  // SE MASOARA CONTROALELE SI NU TEXTUL, deliberat, si acesta este chiar ocolul pe
  // care cardul P3-110 l-a plata cu o rulare: un caz care citeste text gaseste intr-o
  // zi un comentariu care CITEAZA regula, sau propozitia romaneasca pe care codul o
  // intoarce. Aici capcana este si mai aproape: una din sarcinile semanate de cazurile
  // cardului P3-130 se numeste chiar "nu se sterge", deci un caz care ar citi textul
  // ecranului s-ar fi acuzat pe sine. Un titlu scris de operator NU este un control:
  // de aceea titlul este text pe rand si Modifică are butonul lui.
  const DELETE_WORDS = ["sterge", "șterge", "elimin", "delete", "remove"];
  const looksLikeDeleting = (label: string) =>
    DELETE_WORDS.some((w) => label.toLocaleLowerCase("ro").includes(w));

  // INSTRUMENTUL SE DOVEDESTE CA GASESTE INAINTE DE A FI CREZUT CAND NU GASESTE NIMIC:
  // o cautare intr-un test care nu potriveste nimic trece la infinit.
  expect(looksLikeDeleting("Șterge sarcina"), "instrumentul gaseste un control de stergere").toBe(
    true,
  );
  expect(looksLikeDeleting("Elimină sarcina"), "si pe celalalt cuvant romanesc").toBe(true);
  expect(looksLikeDeleting("Delete task"), "si pe cel englezesc").toBe(true);
  expect(looksLikeDeleting("Modifică"), "si nu confunda modificarea cu stergerea").toBe(false);
  expect(looksLikeDeleting("Anulează sarcina"), "si nici anularea, care este o stare").toBe(false);

  await signIn(page, ownerAccount());
  await openSarcini(page, fereastra);

  const row = rowById(page, id);
  await expect(row).toHaveCount(1, { timeout: 30_000 });

  /** Numele fiecarui lucru apasabil dintr-o zona: butoane si legaturi. Se citeste
   *  aria-label cand exista, altfel textul scris. */
  async function controls(where: Locator): Promise<string[]> {
    return where
      .locator("button, a")
      .evaluateAll((els) =>
        els.map((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim()),
      );
  }

  // PE RAND: DOUA LUCRURI APASABILE SI NICI UNUL IN PLUS, scrise ca multime exacta.
  // Legatura catre inregistrarea atasata, pe care o cere clauza 2, si butonul care
  // deschide panoul. NICIUN MENIU DE RAND, ceea ce aceeasi asertiune spune: un meniu
  // ar fi un al treilea lucru apasabil aici.
  const onRow = await controls(row);
  expect(onRow, "pe rand sunt legatura si butonul de modificare, nimic altceva").toEqual([
    TASK_ENTITY_TYPE_LABEL.client,
    "Modifică",
  ]);
  expect(onRow.filter(looksLikeDeleting), "si niciunul nu sterge").toEqual([]);

  // IN PANOU: exact controalele pe care le are formularul, si niciunul nu sterge.
  // Scris ca MULTIME EXACTA si nu ca "niciunul nu seamana cu stergerea": un control
  // nou aparut in panou trebuie sa treaca pe sub ochii cuiva, fiindca clauza 7 cere ca
  // pe acest ecran sa nu existe nicio cale de stergere, "not in a row menu, not in a
  // detail panel, not behind a confirmation".
  await row.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  const inPanel = await controls(page.getByTestId("task-form"));
  expect([...inPanel].sort(), "controalele panoului").toEqual(
    ["Închide", "Deschide calendarul", "Anulează sarcina", "Renunță", "Salvează"].sort(),
  );
  expect(inPanel.filter(looksLikeDeleting), "si niciunul nu sterge").toEqual([]);

  // SI NICIO CONFIRMARE NU ASCUNDE UNA: apasarea celui mai apropiat de stergere,
  // "Anulează sarcina", nu deschide nicio a doua intrebare cu un buton de stergere.
  // Dupa ea randul este TOT ACOLO si poarta starea anulata.
  await page.getByTestId("task-cancel-task").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, { timeout: 30_000 });
  await expect(row, "sarcina anulata de pe ecran este TOT pe lista").toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(row.getByTestId("task-status")).toHaveText(TASK_STATUS_LABEL.cancelled, {
    timeout: 30_000,
  });
  const still = await asUser(ownerToken, `tasks?select=id&id=eq.${id}`);
  expect(still.rows, "si randul este in baza").toHaveLength(1);

  /* ---- partea a doua: nicio CALE de stergere in codul ecranului ---- */

  // SE CAUTA FORMA FAPTULUI INTERZIS, NU NUMELE LUI, care este exact lectura scrisa de
  // cardul P3-110: `.delete(` singur ar fi gasit `next.delete(k)` din `push`, care
  // scoate un PARAMETRU din adresa si nu un rand din baza. Clientul Supabase scrie
  // intotdeauna `.delete()` fara argument, iar URLSearchParams scrie intotdeauna o
  // cheie, deci forma le deosebeste.
  const SHAPES = [
    /\.delete\(\s*\)/,
    /\.remove\(/,
    /\bdelete\s+from\b/i,
    /method:\s*["']DELETE["']/i,
    /\b(delete|remove)Task\b/i,
  ];
  const offendingLines = (source: string) =>
    source
      .split("\n")
      .map((line, i) => ({ line, at: i + 1 }))
      .filter((l) => SHAPES.some((s) => s.test(l.line)))
      .map((l) => `${l.at}: ${l.line.trim()}`);

  // SI INSTRUMENTUL ACESTA SE DOVEDESTE SI EL, pe randuri scrise aici cum ar arata un
  // adevarat vinovat, si pe randuri care NU sunt vinovate.
  expect(offendingLines('await supabase.from("tasks").delete().eq("id", id);')).toHaveLength(1);
  expect(offendingLines('await supabase.storage.from("x").remove([p]);')).toHaveLength(1);
  expect(offendingLines("delete from public.tasks where id = $1;")).toHaveLength(1);
  expect(offendingLines('fetch(u, { method: "DELETE" })')).toHaveLength(1);
  expect(offendingLines("export async function deleteTask(taskId: string) {")).toHaveLength(1);
  expect(
    offendingLines("next.delete(key);"),
    "un parametru scos din adresa nu este un vinovat",
  ).toEqual([]);
  expect(
    offendingLines("// anularea este o stare si nu o stergere, nimic nu se sterge"),
    "un comentariu care citeaza regula nu este un vinovat",
  ).toEqual([]);

  const SOURCES = [
    "lib/data/tasks.ts",
    "lib/data/tasks-actions.ts",
    "lib/data/tasks-shape.ts",
    "lib/data/tasks-types.ts",
    "lib/data/tasks-query.ts",
    "components/tasks/SarciniScreen.tsx",
    "components/tasks/TaskForm.tsx",
    "app/(app)/sarcini/page.tsx",
  ];
  for (const file of SOURCES) {
    const source = readFileSync(file, "utf8");
    expect(source.length, `${file} trebuie sa existe si sa nu fie gol`).toBeGreaterThan(0);
    expect(offendingLines(source), `${file} poarta o cale de stergere`).toEqual([]);
  }
});

/* --------- (g) legatura catre inregistrarea atasata o deschide -- */

test("sarcini: legatura catre inregistrarea atasata deschide acea inregistrare", async ({
  page,
}) => {
  test.setTimeout(360_000);

  // TREI PAGINI, DOUA TOKENURI, si acesta este chiar faptul pe care cardul P3-130 l-a
  // scris in notele lui ca sa nu fie redescoperit: in aceasta platforma UN LEAD ESTE
  // UN RAND DIN public.clients CARE POARTA O ETAPA. Nu exista nicio tabela
  // public.leads in niciuna din cele saizeci si opt de migratii, deci o sarcina legata
  // de un lead poarta tokenul `client`, cu id-ul randului de client, si fisa leadului
  // este chiar /clienti/<id>. Cazul cere toate trei drumurile.
  const leadName = `${P131} legatura lead`;
  const clientName = `${P131} legatura client`;
  const projectName = `${P131} legatura proiect`;

  // Un rand nou este `cold`, adica O ETAPA DE LEAD: vederea Leaduri a ecranului
  // /clienti arata fiecare rand care NU este la etapa Client.
  const leadId = await seedClient(leadName);
  const clientRowId = await seedClient(clientName);
  await setStage(clientRowId, "client");

  const project = await asService("projects?select=id", {
    method: "POST",
    body: { client_id: clientRowId, name: projectName },
  });
  expect(project.ok, `proiectul de test nu a putut fi scris: ${project.text}`).toBe(true);
  const projectRowId = String(project.rows[0]!.id);

  const fereastra = { de_la: "2037-08-01", pana_la: "2037-08-31" };
  const onLead = await seed({
    title: `${P131} sarcina pe lead`,
    due_date: "2037-08-01",
    entity_type: "client",
    entity_id: leadId,
  });
  const onClient = await seed({
    title: `${P131} sarcina pe client`,
    due_date: "2037-08-02",
    entity_type: "client",
    entity_id: clientRowId,
  });
  const onProject = await seed({
    title: `${P131} sarcina pe proiect`,
    due_date: "2037-08-03",
    entity_type: "project",
    entity_id: projectRowId,
  });

  await signIn(page, ownerAccount());

  const cases: { label: string; task: string; href: string; heading: string; word: string }[] = [
    {
      label: "lead",
      task: onLead,
      href: `/clienti/${leadId}`,
      heading: leadName,
      word: TASK_ENTITY_TYPE_LABEL.client,
    },
    {
      label: "client",
      task: onClient,
      href: `/clienti/${clientRowId}`,
      heading: clientName,
      word: TASK_ENTITY_TYPE_LABEL.client,
    },
    {
      label: "proiect",
      task: onProject,
      href: `/proiecte/${projectRowId}`,
      heading: projectName,
      word: TASK_ENTITY_TYPE_LABEL.project,
    },
  ];

  for (const c of cases) {
    await openSarcini(page, fereastra);
    const link = rowById(page, c.task).getByTestId("task-entity");
    await expect(link, `legatura pe ${c.label}`).toHaveCount(1, { timeout: 30_000 });
    // CHIAR O LEGATURA, nu text cu explicatie: RecordLink randeaza text simplu cand
    // destinatia lipseste, si `data-linked` spune care din cele doua a randat.
    await expect(link).toHaveAttribute("data-linked", "true");
    await expect(link).toHaveAttribute("href", c.href);
    await expect(link, `cuvantul romanesc al felului, pe ${c.label}`).toHaveText(c.word);

    await link.click();
    await expect(page, `legatura pe ${c.label} a aterizat`).toHaveURL(
      new RegExp(`${c.href.replace(/\//g, "\\/")}$`),
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1, name: c.heading, exact: true }),
      `fisa deschisa pe ${c.label} este chiar a acelei inregistrari`,
    ).toBeVisible({ timeout: 30_000 });
  }

  // SI O SARCINA FARA INREGISTRARE LEGATA NU ESTE O LEGATURA MOARTA: RecordLink
  // randeaza text cu explicatie romaneasca, care este regula lui si starea adevarata a
  // unei sarcini pe care nimeni nu a atasat-o de nimic.
  const loose = await seed({ title: `${P131} sarcina fara legatura`, due_date: "2037-08-04" });
  await openSarcini(page, fereastra);
  const plain = rowById(page, loose).getByTestId("task-entity");
  await expect(plain).toHaveAttribute("data-linked", "false");
  await expect(plain).toHaveText("Fără înregistrare");
});

/* ---- (h) niciun cuvant englez pe ecran, nicio liniuta lunga in fisiere -- */

test("sarcini: niciun cuvant englez pe ecran si nicio liniuta lunga in fisierele schimbate", async ({
  page,
}) => {
  test.setTimeout(300_000);

  // ACCEPTANTA (h) CERE "a grep of the changed files finds no English string reaching
  // the screen, no em dash and no en dash". NU EXISTA niciun `npm run check:romanian-ui`
  // in acest depozit si niciun script de felul acesta, deci verificarea este ACEST
  // CAZ, pe forma pe care a scris-o cardul P3-120 in
  // tests/e2e/outbound-direct-client.spec.ts. Un script nou ar fi o poarta noua pentru
  // fiecare card al acestui depozit, adica scop pe care nimeni nu l-a cerut.
  //
  // DOUA PROPRIETATI, DOUA INSTRUMENTE, fiindca sunt despre doua lucruri:
  //
  //   CUVINTELE DE PE ECRAN sunt despre TEXT, deci se citesc DE PE ECRAN. Comentariile
  //   acestui card citeaza cardul in engleza, cuvant cu cuvant, si asa trebuie.
  //
  //   LINIUTELE EM SI EN sunt despre FISIERE, si acolo comentariile CONTEAZA: regula
  //   este ca nu exista nicio liniuta lunga nicaieri, nici in cod, nici in comentarii.
  //
  // SE CITESC ZONELE PE CARE LE SCRIE ACEST CARD, nu tot ecranul, si golul este
  // explicat: randurile listei poarta DENUMIRI DE FIXTURI scrise de alte specificatii
  // ("TEST Șantier E2E", "TEST CRM Destinatii"), fiindca datele de test nu se sterg
  // niciodata in acest depozit. Un caz care le-ar citi ar fi pedepsit acest card pentru
  // numele semanate de alt card, si ar fi devenit rosu intr-o zi in care nimeni nu a
  // atins acest ecran. Zonele de mai jos sunt TOT ce scrie cardul: antetele tabelului,
  // randul de filtre, randul de sortare, capetele de grup, celulele randului, panoul
  // si starea goala.

  const fereastra = { de_la: "2038-09-01", pana_la: "2038-09-30" };
  const id = await seed({
    title: `${P131} sarcina romaneasca`,
    due_date: "2038-09-15",
    status: "todo",
    priority: "high",
    entity_type: "client",
    entity_id: clientId,
  });

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
    // SI CUVINTELE PE CARE UN ECRAN DE SARCINI NETRADUS LE-AR PURTA. Niciunul nu este
    // si cuvant romanesc scris la fel.
    "Task",
    "Tasks",
    "Status",
    "Priority",
    "Overdue",
    "Today",
    "Week",
    "Due",
    "Assignee",
    "Filter",
    "Sort",
  ];
  const englishIn = (haystack: string) =>
    ENGLISH.filter((word) => new RegExp(`\\b(${word}|${word.toUpperCase()})\\b`).test(haystack));

  // INSTRUMENTUL SE DOVEDESTE CA GASESTE, INAINTE SA FIE CREZUT CAND NU GASESTE NIMIC.
  // Amandoua formele, fiindca `Th` din primitives.tsx poarta clasa `uppercase` si un
  // antet englezesc ar sosi cu majuscule.
  //
  // CUVINTELE DE PROBA SE SCRIU CU MAJUSCULA LA INCEPUT, ca pe un ecran, fiindca
  // potrivirea este SENSIBILA LA LITERA MARE: ea cere `Task` sau `TASK` si nu `task`.
  // Prima scriere a acestei linii a fost "Save the task", cu t mic, deci proba a cerut
  // ["Save", "Task"] si a primit ["Save"] si a facut cazul rosu, iar scanarea
  // adevarata de mai jos nici nu a ajuns sa ruleze. INSTRUMENTUL ERA BUN SI PROBA ERA
  // GRESITA, si asta este chiar rostul unei probe de instrument. Litera mica este
  // anume in afara potrivirii: cuvintele romanesti scrise cu litera mica, de la
  // "sarcina" la "stare", nu au ce sa caute intr-o lista de cuvinte ENGLEZESTI DE PE
  // ECRAN, iar o eticheta de interfata este scrisa cu majuscula la inceput in acest
  // depozit. Cazul de mai jos pe care il dovedeste a treia linie este chiar asta.
  expect(englishIn("Save the Task"), "instrumentul gaseste un cuvant englez").toEqual([
    "Save",
    "Task",
  ]);
  expect(englishIn("PRIORITY"), "si il gaseste si cu majuscule, ca in antetele tabelului").toEqual([
    "Priority",
  ]);
  expect(englishIn("Urgență Ridicată Întârziată"), "si nu confunda romana cu engleza").toEqual([]);
  expect(englishIn("o sarcina de facut, cu termen azi"), "si nici romana cu litera mica").toEqual(
    [],
  );

  // NUMELE RESPONSABILILOR SUNT DATE SI NU TEXT DE INTERFATA, DECI NU SE CITESC, si
  // golul este explicat aici fiindca altfel ar fi un gol suspect. Selectorul de
  // responsabil al randului de filtre si cel al panoului poarta cate o optiune pentru
  // FIECARE PROFIL ACTIV, iar numele lor sunt scrise de cine a creat conturile: pe
  // stiva din CI acelea sunt "Owner (test)" si "Account manager (test)", scrise de
  // scripts/seed-test-accounts.mjs. Ele sunt englezesti si NU sunt stringurile acestui
  // card: in producție acolo sta numele unui om. Un caz care le-ar citi ar fi pedepsit
  // acest card pentru numele unor conturi de test, exact capcana pentru care randurile
  // listei nu se citesc nici ele. Ce SCRIE cardul in cele doua selectoare este
  // optiunea fara valoare, "Toți responsabilii" si "Nealocată", si ea se cere pe nume
  // mai jos, deci zona nu rămâne nedovedita.
  const ASSIGNEE_NAMES = '[data-testid$="assignee"] option[value]:not([value=""])';

  /** Tot ce se citeste intr-o zona: TEXTUL SCRIS plus indicatiile din casute, fara
   *  nodurile pe care `exclude` le numeste.
   *
   *  textContent SI NU innerText, deliberat, din doua motive. `Th` poarta clasa
   *  `uppercase` si innerText intoarce textul TRANSFORMAT DE CSS, deci "Termen" ar sosi
   *  "TERMEN": aceea este lectura pe care cardul P3-15 a plata cu o rulare. Si
   *  optiunile unui `<select>` nu sunt randate in flux, deci innerText nu le vede, iar
   *  valorile filtrelor pe care clauza 3 le cere romanesti SUNT chiar optiuni.
   *
   *  SE CITESTE O COPIE, ca scoaterea nodurilor excluse sa nu atinga ecranul: un test
   *  care modifica pagina pe care o masoara masoara altceva decat ce vede operatorul. */
  async function written(where: Locator, exclude = ""): Promise<string> {
    const text = await where.evaluate((e, sel) => {
      const copy = e.cloneNode(true) as HTMLElement;
      if (sel) copy.querySelectorAll(sel).forEach((n) => n.remove());
      return copy.textContent ?? "";
    }, exclude);
    const hints = await where
      .locator("[placeholder]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("placeholder") ?? ""));
    return [text, ...hints].join(" | ");
  }

  await signIn(page, ownerAccount());

  /* ---- zona intai: ecranul cu randuri ---- */

  await openSarcini(page, fereastra);
  const row = rowById(page, id);
  await expect(row).toHaveCount(1, { timeout: 30_000 });

  // ANTETELE TABELULUI, EXACT, cu toHaveText: el citeste textul SCRIS, cu diacriticele
  // lui, si spune CARE antet a plecat si nu doar cati au mai rămas.
  await expect(page.locator("thead th")).toHaveText([
    "Titlu",
    "Stare",
    "Urgență",
    "Termen",
    "Responsabil",
    "Înregistrare legată",
    "",
  ]);

  const regions: [string, Locator][] = [
    ["randul de filtre", page.getByTestId("tasks-filters")],
    ["randul de sortare", page.getByTestId("tasks-sort-row")],
    ["antetul tabelului", page.locator("thead")],
    ["capul de grup", page.getByTestId("tasks-group-head").first()],
    ["celulele randului", row],
  ];
  for (const [label, where] of regions) {
    const text = await written(where, ASSIGNEE_NAMES);
    expect(englishIn(text), `cuvinte englezesti in ${label}: ${text}`).toEqual([]);
  }

  // SI CE SCRIE CARDUL IN SELECTORUL DE RESPONSABIL SE CERE PE NUME, ca zona din care
  // s-au scos numele profilurilor sa nu rămână nedovedita. Tot asa pentru celula
  // randului: sarcina semanata nu are responsabil, deci acolo sta cuvantul cardului.
  await expect(page.getByTestId("tasks-assignee").locator('option[value=""]')).toHaveText(
    "Toți responsabilii",
  );
  await expect(row.getByTestId("task-assignee")).toHaveText("Nealocată");

  // SI INDICATIA CASUTELOR DE TERMEN ESTE CHIAR DATE_PLACEHOLDER al lui DateField,
  // adica zz.ll.aaaa, si nu un al doilea fel de casuta de data scris pe acest ecran.
  await expect(page.getByTestId("tasks-due-from")).toHaveAttribute("placeholder", DATE_PLACEHOLDER);
  await expect(page.getByTestId("tasks-due-to")).toHaveAttribute("placeholder", DATE_PLACEHOLDER);

  /* ---- zona a doua: panoul ---- */

  await row.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  // Felul inregistrarii se pune pe Client, ca si casuta de alegere a inregistrarii sa
  // fie randata: o zona care nu se vede nu se citeste.
  await page.getByTestId("field-task-entity-type").selectOption("client");
  await expect(page.getByTestId("field-task-entity")).toBeVisible();
  const panel = await written(page.getByTestId("task-form"), ASSIGNEE_NAMES);
  expect(englishIn(panel), `cuvinte englezesti in panou: ${panel}`).toEqual([]);
  // SI AICI optiunea fara valoare se cere pe nume, din acelasi motiv.
  await expect(page.getByTestId("field-task-assignee").locator('option[value=""]')).toHaveText(
    "Nealocată",
  );
  await expect(page.getByTestId("field-task-due-date")).toHaveAttribute(
    "placeholder",
    DATE_PLACEHOLDER,
  );
  await expect(page.getByTestId("field-task-due-date-native")).toBeHidden();
  await page.getByTestId("task-form-close").click();

  /* ---- zona a treia: starea goala, care este o propozitie si nu o zona alba ---- */

  await openSarcini(page, { de_la: "2039-01-01", pana_la: "2039-01-02" });
  await expect(page.getByTestId("task-row")).toHaveCount(0);
  // `main` SI NU TOT DOCUMENTUL: invelisul din app/(app)/layout.tsx pune in el numai
  // ce randeaza pagina, deci meniul lateral si bara de sus, care sunt ale altor
  // carduri, rămân in afara. Numele profilurilor se scot si aici, acelasi motiv.
  const empty = await written(page.locator("main").first(), ASSIGNEE_NAMES);
  expect(englishIn(empty), `cuvinte englezesti pe starea goala: ${empty}`).toEqual([]);
  expect(empty, "si starea goala spune ceva, nu este o zona alba").toContain(
    "Nicio sarcină pentru filtrele alese",
  );

  /* ---- partea a doua: nicio liniuta em sau en in fisierele schimbate ---- */

  // LISTA ESTE SCRISA PE NUME SI FIECARE FISIER TREBUIE SA EXISTE: un fisier redenumit
  // face cazul sa pice zgomotos in loc sa scaneze in gol.
  const CHANGED = [
    "lib/data/tasks-types.ts",
    "lib/data/tasks-shape.ts",
    "lib/data/tasks-query.ts",
    "lib/data/tasks.ts",
    "lib/data/tasks-actions.ts",
    "lib/nav.ts",
    "components/ui/Icon.tsx",
    "app/(app)/crm/page.tsx",
    "app/(app)/sarcini/page.tsx",
    "components/tasks/SarciniScreen.tsx",
    "components/tasks/TaskForm.tsx",
    "scripts/poc-free/check-pending-schema-reads.mjs",
    "tests/e2e/tasks.spec.ts",
    "tests/e2e/crm-landing.spec.ts",
    // SI SPECIFICATIA DE TELEFON, care numara si ea cardurile ecranului CRM, in doua
    // locuri: cazul (d) pe telefon si cazul (4) la 1440px. Cardul acesta a plata o
    // rulare ca sa o gaseasca, fiindca brieful numea numai crm-landing.spec.
    "tests/e2e/phone-remainder.spec.ts",
    // docs/LEARNINGS.md SI docs/reports/ NU SUNT PE LISTA, si golul este cel pe care
    // l-a explicat deja cardul P3-130 in tests/e2e/outbound-direct-client.spec.ts:
    // LEARNINGS.md poarta liniute em scrise de alte carduri inainte ca regula sa
    // existe, si ele nu sunt ale acestui card. A le pune pe lista ar face cazul sa cada
    // pe o datorie veche in locul in care el masoara munca acestui card. Randurile
    // adaugate de P3-131 in acel fisier nu poarta niciuna.
  ];

  // CELE DOUA SEMNE SE CONSTRUIESC DIN CODURILE LOR SI NU SE SCRIU, ca acest fisier sa
  // nu poarte chiar ce interzice: el este in lista de mai sus si se citeste pe sine.
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

/* =======================================================================
   CARDUL P3-132: PANOUL SARCINI DE PE FISA INREGISTRARII
   ======================================================================= */
//
// Item 4 al lui Ivan, partea a treia, si propozitia lui este una singura: "Also on
// the linked record's detail page." Cele cinci cazuri de mai jos sunt cele patru pe
// care acceptanta cardului le numeste, de la (a) la (d), plus garda deviatiei D7 pe
// numele cerut de acceptanta (e).
//
// CELE SASE CAZURI ALE CARDULUI P3-130 SI CELE OPT ALE CARDULUI P3-131 SUNT NEATINSE,
// nici un caracter, si asta este jumatate din dovada ca nici stratul de date, nici
// fila nu s-au schimbat sub ele. Tabelul s-a MUTAT din SarciniScreen in TaskTable, cu
// fiecare data-testid neschimbat, tocmai ca ele sa nu aiba nevoie de nicio atingere.
//
// TREI PAGINI, DOUA ECRANE DE DETALIU, SI ACCEPTANTA (a) CERE TOATE TREI. Clauza 1
// numeste fisa unui lead, a unui client si a unui proiect. In aceasta aplicatie
// exista DOUA ecrane de detaliu: cel al clientului serveste si leadul, fiindca un
// lead ESTE un rand din public.clients care poarta o etapa, si nu exista nicio tabela
// public.leads in niciuna din migratii. Cazul (a) deschide totusi toate trei paginile,
// fiindca atat cere acceptanta si fiindca un lead ajuns la aceeasi fisa este chiar
// lucrul care merita dovedit.
//
// ZIUA SE SEMANA RELATIV LA chisinauToday(), NICIODATA CA LITERALI, acelasi motiv
// scris pe cazurile cardului P3-131: o margine scrisa "2026-10-01" este o margine
// care putrezeste in ziua in care calendarul trece de ea.
//
// GARDA LUI D7 ESTE DUBLA, SI ASTA ESTE DELIBERAT. Acceptanta (e) cere cazul
// `fisa clientului: pasul urmator este neschimbat` si il numeste "the EXISTING
// next-step test, re-run unmodified". NICIUN CAZ CU ACEL NUME NU EXISTA: garda
// existenta sunt cele sase cazuri ale lui tests/e2e/lead-next-action.spec.ts, cardul
// P3-89. Amandoua jumatatile se respecta, deci: acele sase cazuri ruleaza NEMODIFICATE,
// nici un caracter, si cel de mai jos se adauga pe numele exact pe care acceptanta il
// cere. Un diff care ar fi trebuit sa atinga unul din cele sase ar fi rupt D7.

const P132 = `TEST-P3132-${RUN}`;

/** Zona panoului de pe fisa unei inregistrari. */
function panel(page: Page): Locator {
  return page.getByTestId("panel-sarcini");
}

/** Randul unei sarcini anume DINAUNTRUL panoului, pe id.
 *
 *  SCOPAT PE PANOU SI NU PE PAGINA, fiindca `task-row` este acelasi data-testid pe
 *  amandoua ecranele, si asta este chiar dovada clauzei 5: un singur randator. O
 *  afirmatie care nu ar scopa ar masura, pe fila, randurile filei. */
function panelRowById(page: Page, id: string): Locator {
  return panel(page).locator(`[data-testid="task-row"][data-id="${id}"]`);
}

/** Randurile din panou, in ordinea din DOM, fiecare cu grupul si marcajul lui.
 *
 *  SE CITESC ATRIBUTE SI NU TEXT, acelasi motiv ca `screenRows` de mai sus: grupul si
 *  marcajul sunt fapte despre rand si nu cuvinte. */
async function panelRows(page: Page): Promise<ScreenRow[]> {
  return panel(page)
    .locator('[data-testid="task-row"]')
    .evaluateAll((els) =>
      els.map((e) => ({
        id: e.getAttribute("data-id") ?? "",
        group: e.getAttribute("data-group") ?? "",
        overdue: e.getAttribute("data-overdue") === "true",
      })),
    );
}

/** Deschide fisa unui client sau a unui lead si asteapta panoul. */
async function openClientSheet(page: Page, id: string): Promise<void> {
  await page.goto(`/clienti/${id}`);
  await expect(page.getByTestId("client-detail")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    panel(page),
    "panoul Sarcini este pe fisa clientului",
  ).toBeVisible({
    timeout: 30_000,
  });
}

/** Deschide fisa unui proiect si asteapta panoul. */
async function openProjectSheet(page: Page, id: string): Promise<void> {
  await page.goto(`/proiecte/${id}`);
  await expect(page.getByTestId("project-detail")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    panel(page),
    "panoul Sarcini este pe fisa proiectului",
  ).toBeVisible({
    timeout: 30_000,
  });
}

/** Un proiect nou pe un client dat, semanat ca serviciu. */
async function seedProject(clientRowId: string, name: string): Promise<string> {
  const r = await asService("projects?select=id", {
    method: "POST",
    body: { client_id: clientRowId, name },
  });
  expect(r.ok, `proiectul de test nu a putut fi scris: ${r.text}`).toBe(true);
  return String(r.rows[0]!.id);
}

/* ------------- (a) panoul arata numai sarcinile inregistrarii deschise -- */

test("sarcini pe fisa: panoul arata numai sarcinile inregistrarii deschise", async ({
  page,
}) => {
  test.setTimeout(360_000);

  // TREI INREGISTRARI TINTA SI DOUA STRAINE, iar cele trei tinte sunt pe rand si
  // straine una altuia: asa fiecare pagina se dovedeste impotriva a PATRU sarcini care
  // nu sunt ale ei, din amandoua tokenurile, si nu doar impotriva uneia.
  const leadName = `${P132} fisa lead`;
  const clientName = `${P132} fisa client`;
  const projectName = `${P132} fisa proiect`;

  // Un rand nou de client este la etapa `cold`, care ESTE o etapa de lead: vederea
  // Leaduri a ecranului /clienti arata fiecare rand care nu este la etapa Client.
  const leadId = await seedClient(leadName);
  const clientRowId = await seedClient(clientName);
  await setStage(clientRowId, "client");
  const projectRowId = await seedProject(clientRowId, projectName);

  const otherClientId = await seedClient(`${P132} fisa alt client`);
  const otherProjectId = await seedProject(
    otherClientId,
    `${P132} fisa alt proiect`,
  );

  const onLead = await seed({
    title: `${P132} a sarcina leadului`,
    due_date: shiftDay(TODAY, 3),
    entity_type: "client",
    entity_id: leadId,
  });
  const onClient = await seed({
    title: `${P132} a sarcina clientului`,
    due_date: shiftDay(TODAY, 4),
    entity_type: "client",
    entity_id: clientRowId,
  });
  const onProject = await seed({
    title: `${P132} a sarcina proiectului`,
    due_date: shiftDay(TODAY, 5),
    entity_type: "project",
    entity_id: projectRowId,
  });
  const onOtherClient = await seed({
    title: `${P132} a sarcina altui client`,
    due_date: shiftDay(TODAY, 6),
    entity_type: "client",
    entity_id: otherClientId,
  });
  const onOtherProject = await seed({
    title: `${P132} a sarcina altui proiect`,
    due_date: shiftDay(TODAY, 7),
    entity_type: "project",
    entity_id: otherProjectId,
  });
  // SI O SARCINA LEGATA DE NIMIC, care nu are ce sa caute pe nicio fisa: ea este
  // starea adevarata a unei treburi pe care nimeni nu a atasat-o de nimic.
  const loose = await seed({ title: `${P132} a sarcina fara legatura` });

  const seeded = [
    onLead,
    onClient,
    onProject,
    onOtherClient,
    onOtherProject,
    loose,
  ];

  await signIn(page, ownerAccount());

  const cases: {
    label: string;
    open: () => Promise<void>;
    heading: string;
    mine: string;
  }[] = [
    {
      label: "lead",
      open: () => openClientSheet(page, leadId),
      heading: leadName,
      mine: onLead,
    },
    {
      label: "client",
      open: () => openClientSheet(page, clientRowId),
      heading: clientName,
      mine: onClient,
    },
    {
      label: "proiect",
      open: () => openProjectSheet(page, projectRowId),
      heading: projectName,
      mine: onProject,
    },
  ];

  for (const c of cases) {
    await c.open();

    // FISA DESCHISA ESTE CHIAR A ACELEI INREGISTRARI, verificat inainte de orice
    // afirmatie despre panou: un panou gol pe pagina greșita ar trece altfel.
    await expect(
      page.getByRole("heading", { level: 1, name: c.heading, exact: true }),
      `fisa deschisa pe ${c.label}`,
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      panelRowById(page, c.mine),
      `sarcina lui ${c.label} este in panou`,
    ).toHaveCount(1, {
      timeout: 30_000,
    });

    // NUMAI ALE EI, SI SE MASOARA DOAR ID-URILE SEMANATE DE ACEST CAZ. Datele de test
    // nu se sterg niciodata in acest depozit, deci randurile lasate de rulari
    // anterioare pe aceleasi inregistrari nu exista: fiecare rulare isi semaneaza
    // proprii clienti si proiecte, deci panoul arata exact una din sarcinile mele.
    // Afirmatia este pe MULTIMEA proprie si nu pe o numaratoare a panoului.
    const inPanel = (await panelRows(page)).map((r) => r.id);
    expect(
      inPanel.filter((id) => seeded.includes(id)),
      `in panoul lui ${c.label} stau numai sarcinile lui`,
    ).toEqual([c.mine]);

    // SI CELE STRAINE SE CER PE NUME SA LIPSEASCA, nu doar prin lipsa din multimea de
    // mai sus: o afirmatie care spune CARE rand a intrat unde nu trebuia este o
    // afirmatie care se poate repara.
    for (const foreign of seeded.filter((id) => id !== c.mine)) {
      await expect(
        panelRowById(page, foreign),
        `o sarcina straina nu intra in panoul lui ${c.label}`,
      ).toHaveCount(0);
    }
  }

  // SI LISTA PANOULUI ESTE CEA A INREGISTRARII, CITITA PRIN listTasksForEntity: randul
  // stocat poarta chiar perechea pe care panoul a filtrat-o, si asta se citeste din
  // baza si nu de pe ecran.
  const stored = await asUser(
    ownerToken,
    `tasks?select=id,entity_type,entity_id&id=in.(${onLead},${onClient},${onProject})`,
  );
  expect(
    stored.rows,
    "cele trei sarcini tinta se citesc din baza",
  ).toHaveLength(3);
  const byId = new Map(stored.rows.map((r) => [String(r.id), r]));
  expect(
    byId.get(onLead)!.entity_type,
    "sarcina leadului poarta tokenul client",
  ).toBe("client");
  expect(
    byId.get(onLead)!.entity_id,
    "si id-ul randului de client al leadului",
  ).toBe(leadId);
  expect(byId.get(onClient)!.entity_type).toBe("client");
  expect(byId.get(onClient)!.entity_id).toBe(clientRowId);
  expect(
    byId.get(onProject)!.entity_type,
    "sarcina proiectului poarta tokenul project",
  ).toBe("project");
  expect(byId.get(onProject)!.entity_id).toBe(projectRowId);
});

/* ---- (b) o sarcina creata din panou este deja legata de acea inregistrare -- */

test("sarcini pe fisa: o sarcina creata din panou este deja legata de acea inregistrare", async ({
  page,
}) => {
  test.setTimeout(360_000);

  // AMANDOUA TOKENURILE, intr-un singur caz: clauza 2 este despre inlesnire si ea
  // trebuie sa fie aceeasi pe fisa unui client si pe fisa unui proiect. Un caz care ar
  // dovedi numai `client` ar lasa ramura `project` nedovedita, si ele sunt doua ramuri
  // de cod diferite in TaskPanel.
  const clientName = `${P132} creare client`;
  const projectName = `${P132} creare proiect`;
  const clientRowId = await seedClient(clientName);
  await setStage(clientRowId, "client");
  const projectRowId = await seedProject(clientRowId, projectName);

  await signIn(page, ownerAccount());

  const cases: {
    label: string;
    open: () => Promise<void>;
    entityType: string;
    entityId: string;
    entityLabel: string;
    title: string;
  }[] = [
    {
      label: "client",
      open: () => openClientSheet(page, clientRowId),
      entityType: "client",
      entityId: clientRowId,
      entityLabel: clientName,
      title: `${P132} b scrisa de pe fisa clientului`,
    },
    {
      label: "proiect",
      open: () => openProjectSheet(page, projectRowId),
      entityType: "project",
      entityId: projectRowId,
      entityLabel: projectName,
      title: `${P132} b scrisa de pe fisa proiectului`,
    },
  ];

  for (const c of cases) {
    await c.open();

    await page.getByTestId("panel-task-new").click();
    await expect(page.getByTestId("task-form")).toBeVisible();

    // OPERATORUL NU O ALEGE, SI ASTA SE DOVEDESTE PRIN ABSENTA CONTROLULUI, nu prin
    // faptul ca testul nu l-a atins. Acceptanta (b) cere legatura stocata "without the
    // operator having selected it": cele doua selectoare ale inregistrarii legate NU
    // EXISTA in panoul deschis de pe fisa, deci nu exista cale prin care sa o fi ales.
    await expect(
      page.getByTestId("field-task-entity-type"),
      `selectorul de fel nu exista in panoul lui ${c.label}`,
    ).toHaveCount(0);
    await expect(
      page.getByTestId("field-task-entity"),
      `casuta de alegere a inregistrarii nu exista in panoul lui ${c.label}`,
    ).toHaveCount(0);

    // IN LOCUL LOR, INREGISTRAREA SCRISA, cu cuvantul romanesc al felului ei si cu
    // numele ei, ca operatorul sa vada de ce se leaga ce scrie.
    const fixed = page.getByTestId("field-task-entity-fixed");
    await expect(
      fixed,
      `inregistrarea fixata se vede in panoul lui ${c.label}`,
    ).toBeVisible();
    await expect(fixed).toHaveAttribute("data-entity-type", c.entityType);
    await expect(fixed).toHaveAttribute("data-entity-id", c.entityId);
    await expect(fixed).toContainText(
      c.entityType === "project"
        ? TASK_ENTITY_TYPE_LABEL.project
        : TASK_ENTITY_TYPE_LABEL.client,
    );
    await expect(fixed, "si numele inregistrarii").toContainText(c.entityLabel);

    // SE SCRIE NUMAI TITLUL. Nimic altceva nu se atinge, si aceea este afirmatia: tot
    // ce tine de legatura vine de la pagina.
    await page.getByTestId("field-task-title").fill(c.title);
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("task-form")).toHaveCount(0, {
      timeout: 30_000,
    });

    // SI RANDUL APARE IN PANOUL DE PE CARE A FOST SCRIS, fara nicio reincarcare de
    // mana: altfel operatorul ar scrie o sarcina si nu ar vedea-o.
    const row = panel(page)
      .locator('[data-testid="task-row"]')
      .filter({
        has: page.getByTestId("task-title").getByText(c.title, { exact: true }),
      });
    await expect(
      row,
      `sarcina scrisa apare in panoul lui ${c.label}`,
    ).toHaveCount(1, {
      timeout: 30_000,
    });

    // LEGATURA STOCATA ESTE CE CERE ACCEPTANTA (b), si se citeste DIN BAZA si nu de pe
    // ecran: ecranul putea sa o deseneze corect si sa fi trimis altceva.
    const id = (await row.getAttribute("data-id")) ?? "";
    expect(id, "randul creat are id").not.toBe("");
    const stored = await asUser(
      ownerToken,
      `tasks?select=id,title,entity_type,entity_id,status,priority&id=eq.${id}`,
    );
    expect(
      stored.rows,
      `sarcina scrisa de pe fisa lui ${c.label} se citeste din baza`,
    ).toHaveLength(1);
    expect(
      stored.rows[0]!.entity_type,
      `felul stocat este tokenul englezesc al lui ${c.label}`,
    ).toBe(c.entityType);
    expect(
      stored.rows[0]!.entity_id,
      `si id-ul este chiar al inregistrarii deschise`,
    ).toBe(c.entityId);
    expect(stored.rows[0]!.title).toBe(c.title);
    // SI IMPLICITELE COLOANELOR SE VAD, fiindca formularul nu a trimis nici stare nici
    // urgenta: ele sunt ale migratiei 0068 si nu ale unui al doilea implicit scris in
    // TypeScript.
    expect(stored.rows[0]!.status, "starea implicita a coloanei").toBe("todo");
    expect(stored.rows[0]!.priority, "urgenta implicita a coloanei").toBe(
      "medium",
    );
  }
});

/* --- (c) se modifica si se anuleaza din panou, si niciun control de stergere -- */

test("sarcini pe fisa: se poate modifica si anula din panou, si nu exista niciun control de stergere", async ({
  page,
}) => {
  test.setTimeout(360_000);

  const clientName = `${P132} modificare client`;
  const clientRowId = await seedClient(clientName);
  await setStage(clientRowId, "client");

  const created = `${P132} c de modificat`;
  const changed = `${P132} c modificata din panou`;
  const id = await seed({
    title: created,
    status: "todo",
    due_date: shiftDay(TODAY, 2),
    entity_type: "client",
    entity_id: clientRowId,
  });

  /* ---- partea intai: ce se poate APASA, pe rand si in formular ---- */

  // SE MASOARA CONTROALELE SI NU TEXTUL, deliberat, si acesta este chiar ocolul pe care
  // cardul P3-110 l-a plata cu o rulare: un caz care citeste text gaseste intr-o zi un
  // comentariu care CITEAZA regula, sau propozitia romaneasca pe care codul o intoarce.
  // Un titlu scris de operator NU este un control: de aceea titlul este text pe rand si
  // Modifică are butonul lui.
  const DELETE_WORDS = ["sterge", "șterge", "elimin", "delete", "remove"];
  const looksLikeDeleting = (label: string) =>
    DELETE_WORDS.some((w) => label.toLocaleLowerCase("ro").includes(w));

  // INSTRUMENTUL SE DOVEDESTE CA GASESTE INAINTE DE A FI CREZUT CAND NU GASESTE NIMIC:
  // o cautare intr-un test care nu potriveste nimic trece la infinit.
  expect(
    looksLikeDeleting("Șterge sarcina"),
    "instrumentul gaseste un control de stergere",
  ).toBe(true);
  expect(
    looksLikeDeleting("Elimină sarcina"),
    "si pe celalalt cuvant romanesc",
  ).toBe(true);
  expect(looksLikeDeleting("Delete task"), "si pe cel englezesc").toBe(true);
  expect(
    looksLikeDeleting("Modifică"),
    "si nu confunda modificarea cu stergerea",
  ).toBe(false);
  expect(
    looksLikeDeleting("Anulează sarcina"),
    "si nici anularea, care este o stare",
  ).toBe(false);

  /** Numele fiecarui lucru apasabil dintr-o zona: butoane si legaturi. Se citeste
   *  aria-label cand exista, altfel textul scris. */
  async function controls(where: Locator): Promise<string[]> {
    return where
      .locator("button, a")
      .evaluateAll((els) =>
        els.map((e) =>
          (e.getAttribute("aria-label") ?? e.textContent ?? "").trim(),
        ),
      );
  }

  await signIn(page, ownerAccount());
  await openClientSheet(page, clientRowId);

  const row = panelRowById(page, id);
  await expect(row).toHaveCount(1, { timeout: 30_000 });

  // PE RANDUL DIN PANOU: UN SINGUR LUCRU APASABIL, scris ca multime exacta. Pe fila
  // randul are doua, fiindca acolo exista si legatura catre inregistrarea atasata;
  // in panou coloana aceea nu se deseneaza, fiindca fiecare rand poarta inregistrarea
  // paginii si legatura ar duce unde operatorul se afla deja. NICIUN MENIU DE RAND,
  // ceea ce aceeasi afirmatie spune: un meniu ar fi un al doilea lucru apasabil aici.
  const onRow = await controls(row);
  expect(onRow, "pe randul din panou este numai butonul de modificare").toEqual(
    ["Modifică"],
  );
  expect(onRow.filter(looksLikeDeleting), "si el nu sterge").toEqual([]);

  // SI PE TOT PANOUL: antetul lui are butonul de sarcina nouă si nimic altceva.
  const onPanel = await controls(panel(page));
  expect([...onPanel].sort(), "controalele panoului").toEqual(
    ["Modifică", "Sarcină nouă"].sort(),
  );
  expect(onPanel.filter(looksLikeDeleting), "si niciunul nu sterge").toEqual(
    [],
  );

  /* ---- partea a doua: SE MODIFICA din panou ---- */

  await row.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await expect(page.getByTestId("field-task-title")).toHaveValue(created);
  // SI INREGISTRAREA LEGATA NU SE POATE DESFACE DIN PANOUL FISEI EI: formularul arata
  // inregistrarea scrisa si nu un selector, la modificare exact ca la creare.
  await expect(page.getByTestId("field-task-entity-fixed")).toBeVisible();
  await expect(page.getByTestId("field-task-entity-type")).toHaveCount(0);

  // IN FORMULAR: exact controalele pe care le are, scrise ca MULTIME EXACTA si nu ca
  // "niciunul nu seamana cu stergerea". Un control nou aparut in formular trebuie sa
  // treaca pe sub ochii cuiva, fiindca clauza 3 cere ca in acest panou sa nu existe
  // nicio cale de stergere, "not in a row, not in a menu, not behind a confirmation".
  // LISTA ESTE ACEEASI PE CARE O CERE SI CAZUL FILEI, si asta nu este o coincidenta: cu
  // `fixedEntity` nu se deseneaza cele doua selectoare ale inregistrarii, iar pe fila
  // ele sunt un `Select` si o casuta care apare abia dupa ce felul este ales, deci
  // niciuna nu aduce un buton. Singurul "Deschide calendarul" este al casutei de
  // termen, care se scrie pe amandoua ecranele.
  const inPanelForm = await controls(page.getByTestId("task-form"));
  expect(
    [...inPanelForm].sort(),
    "controalele formularului deschis din panou",
  ).toEqual(
    [
      "Închide",
      "Deschide calendarul",
      "Anulează sarcina",
      "Renunță",
      "Salvează",
    ].sort(),
  );
  expect(
    inPanelForm.filter(looksLikeDeleting),
    "si niciunul nu sterge",
  ).toEqual([]);

  await page.getByTestId("field-task-title").fill(changed);
  await page.getByTestId("field-task-status").selectOption("in_progress");
  await page.getByTestId("field-task-priority").selectOption("high");
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, {
    timeout: 30_000,
  });

  const edited = panelRowById(page, id);
  await expect(edited.getByTestId("task-title")).toHaveText(changed, {
    timeout: 30_000,
  });
  await expect(edited.getByTestId("task-status")).toHaveText(
    TASK_STATUS_LABEL.in_progress,
  );
  await expect(edited.getByTestId("task-priority")).toHaveText(
    TASK_PRIORITY_LABEL.high,
  );

  // SI LEGATURA A RAMAS EXACT CUM ERA dupa o modificare facuta din panou: o salvare
  // care ar fi rescris perechea ar fi mutat sarcina de pe inregistrare in tacere.
  const afterEdit = await asUser(
    ownerToken,
    `tasks?select=status,priority,entity_type,entity_id&id=eq.${id}`,
  );
  expect(afterEdit.rows, "randul se citeste dupa modificare").toHaveLength(1);
  expect(
    afterEdit.rows[0]!.status,
    "starea stocata este tokenul englezesc",
  ).toBe("in_progress");
  expect(afterEdit.rows[0]!.priority).toBe("high");
  expect(afterEdit.rows[0]!.entity_type, "si legatura a rămas").toBe("client");
  expect(afterEdit.rows[0]!.entity_id).toBe(clientRowId);

  /* ---- partea a treia: SE ANULEAZA, si anularea nu este o stergere ---- */

  await edited.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await page.getByTestId("task-cancel-task").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, {
    timeout: 30_000,
  });

  // SARCINA ESTE TOT ACOLO, si asta este jumatatea care conteaza: propozitia
  // proprietarului este "a job that is called off is marked cancelled and stays on the
  // record". Pe FISA ACELUI RECORD, adica aici.
  await expect(
    edited,
    "sarcina anulata este TOT in panoul inregistrarii",
  ).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(edited.getByTestId("task-status")).toHaveText(
    TASK_STATUS_LABEL.cancelled,
    {
      timeout: 30_000,
    },
  );
  await expect(edited.getByTestId("task-title")).toHaveText(changed);

  const afterCancel = await asUser(
    ownerToken,
    `tasks?select=id,status,title&id=eq.${id}`,
  );
  expect(afterCancel.rows, "randul exista in baza dupa anulare").toHaveLength(
    1,
  );
  expect(afterCancel.rows[0]!.status, "si poarta starea anulata").toBe(
    "cancelled",
  );

  // SI NICIO CONFIRMARE NU ASCUNDE O STERGERE: apasarea celui mai apropiat de stergere
  // nu a deschis nicio a doua intrebare, iar pe o sarcina deja anulata butonul nu mai
  // este oferit.
  await edited.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await expect(page.getByTestId("task-cancel-task")).toHaveCount(0);
  const afterwards = await controls(page.getByTestId("task-form"));
  expect(
    afterwards.filter(looksLikeDeleting),
    "nici dupa anulare nu apare o stergere",
  ).toEqual([]);
  await page.getByTestId("task-form-close").click();

  /* ---- partea a patra: nicio CALE de stergere in codul panoului ---- */

  // SE CAUTA FORMA FAPTULUI INTERZIS, NU NUMELE LUI, lectura cardului P3-110:
  // `.delete(` singur ar fi gasit `next.delete(k)`, care scoate un PARAMETRU din adresa
  // si nu un rand din baza. Clientul Supabase scrie intotdeauna `.delete()` fara
  // argument, iar URLSearchParams scrie intotdeauna o cheie, deci forma le deosebeste.
  const SHAPES = [
    /\.delete\(\s*\)/,
    /\.remove\(/,
    /\bdelete\s+from\b/i,
    /method:\s*["']DELETE["']/i,
    /\b(delete|remove)Task\b/i,
  ];
  const offendingLines = (source: string) =>
    source
      .split("\n")
      .map((line, i) => ({ line, at: i + 1 }))
      .filter((l) => SHAPES.some((s) => s.test(l.line)))
      .map((l) => `${l.at}: ${l.line.trim()}`);

  // SI INSTRUMENTUL ACESTA SE DOVEDESTE SI EL, pe randuri scrise aici cum ar arata un
  // adevarat vinovat, si pe randuri care NU sunt vinovate.
  expect(
    offendingLines('await supabase.from("tasks").delete().eq("id", id);'),
  ).toHaveLength(1);
  expect(
    offendingLines('await supabase.storage.from("x").remove([p]);'),
  ).toHaveLength(1);
  expect(
    offendingLines("delete from public.tasks where id = $1;"),
  ).toHaveLength(1);
  expect(offendingLines('fetch(u, { method: "DELETE" })')).toHaveLength(1);
  expect(
    offendingLines("export async function deleteTask(taskId: string) {"),
  ).toHaveLength(1);
  expect(
    offendingLines("next.delete(key);"),
    "un parametru scos din adresa nu este un vinovat",
  ).toEqual([]);
  expect(
    offendingLines(
      "// anularea este o stare si nu o stergere, nimic nu se sterge",
    ),
    "un comentariu care citeaza regula nu este un vinovat",
  ).toEqual([]);

  // FISIERELE PE CARE LE SCRIE ACEST CARD, plus cele doua ecrane de detaliu care il
  // randeaza. Lista este scrisa pe nume si fiecare fisier trebuie sa existe: un fisier
  // redenumit face cazul sa pice zgomotos in loc sa scaneze in gol.
  const SOURCES = [
    "components/tasks/TaskPanel.tsx",
    "components/tasks/TaskTable.tsx",
    "components/tasks/TaskForm.tsx",
    "components/clients/ClientDetailScreen.tsx",
    "components/projects/ProjectDetailScreen.tsx",
    "app/(app)/clienti/[id]/page.tsx",
    "app/(app)/proiecte/[id]/page.tsx",
  ];
  for (const file of SOURCES) {
    const source = readFileSync(file, "utf8");
    expect(
      source.length,
      `${file} trebuie sa existe si sa nu fie gol`,
    ).toBeGreaterThan(0);
    expect(offendingLines(source), `${file} poarta o cale de stergere`).toEqual(
      [],
    );
  }
});

/* ---- (d) ACORDUL: aceeasi sarcina, acelasi marcaj pe fisa si in fila -------- */

test("sarcini pe fisa: aceeasi sarcina este marcata intarziat la fel pe fisa si in fila Sarcini", async ({
  page,
}) => {
  test.setTimeout(360_000);

  // ACEASTA ESTE ACCEPTANTA (d) SI CLAUZA 4, iar defectul pe care clauza il numeste este
  // chiar acesta: "A row that reads as late on one screen and on time on the other".
  // Doua ecrane care arata aceeasi sarcina nu au voie sa aiba doua idei despre ce este
  // intarziat.
  //
  // CE FACE ACORDUL IMPOSIBIL DE RUPT NU ESTE ACEST CAZ, SI ASTA MERITA SCRIS: panoul si
  // fila randeaza ACELASI component, components/tasks/TaskTable.tsx, care cheama
  // isTaskOverdue() din lib/data/tasks-shape.ts, care este literal
  // `taskBucket(task, today) === "restante"`. Derivarea este ce le face incapabile sa nu
  // fie de acord; cazul de mai jos este ce prinde ziua in care cineva le desface.
  //
  // SETUL TRECE PESTE MARGINE, acelasi set si pentru acelasi motiv ca al cazului filei:
  // cele patru stari pe o zi trecuta, apoi azi, apoi maine, apoi fara termen. Daca
  // excluderea de stare a clauzei 5 ar ajunge sa stea in doua locuri, cele doua ecrane
  // s-ar departa exact pe randurile finalizat si anulat.
  const clientName = `${P132} acord client`;
  const clientRowId = await seedClient(clientName);
  await setStage(clientRowId, "client");

  const yesterday = shiftDay(TODAY, -1);
  const link = { entity_type: "client", entity_id: clientRowId };

  const openTodo = await seed({
    title: `${P132} d ieri de facut`,
    due_date: yesterday,
    status: "todo",
    ...link,
  });
  const working = await seed({
    title: `${P132} d ieri in lucru`,
    due_date: yesterday,
    status: "in_progress",
    ...link,
  });
  const finished = await seed({
    title: `${P132} d ieri finalizata`,
    due_date: yesterday,
    status: "done",
    ...link,
  });
  const cancelled = await seed({
    title: `${P132} d ieri anulata`,
    due_date: yesterday,
    status: "cancelled",
    ...link,
  });
  const dueToday = await seed({
    title: `${P132} d azi`,
    due_date: TODAY,
    status: "todo",
    ...link,
  });
  const tomorrow = await seed({
    title: `${P132} d maine`,
    due_date: shiftDay(TODAY, 1),
    status: "todo",
    ...link,
  });
  const noDate = await seed({
    title: `${P132} d fara termen`,
    status: "todo",
    ...link,
  });

  const mine = [
    openTodo,
    working,
    finished,
    cancelled,
    dueToday,
    tomorrow,
    noDate,
  ];

  await signIn(page, ownerAccount());

  /* ---- ce spune FISA ---- */

  await openClientSheet(page, clientRowId);
  const onSheet = new Map((await panelRows(page)).map((r) => [r.id, r]));

  // TOATE SAPTE SUNT PE FISA, verificat inainte de orice comparatie: doua ecrane care nu
  // arata niciuna din ele ar fi "de acord" si cazul ar trece pe gol.
  for (const id of mine) {
    expect(onSheet.get(id), `sarcina ${id} este in panoul fisei`).toBeDefined();
  }

  /* ---- ce spune FILA ---- */

  await openSarcini(page);
  const onTab = new Map((await screenRows(page)).map((r) => [r.id, r]));
  for (const id of mine) {
    expect(onTab.get(id), `sarcina ${id} este in fila Sarcini`).toBeDefined();
  }

  /* ---- si cele doua sunt de acord, rand cu rand ---- */

  // MARCAJUL SI GRUPUL, AMANDOUA, si nu numai marcajul: grupul poarta aceeasi definitie a
  // zilei, fiindca isTaskOverdue este derivat din taskBucket, iar un acord pe marcaj cu
  // un dezacord pe grup ar fi exact un al doilea fel de a afla ce este intarziat.
  for (const id of mine) {
    expect(
      onSheet.get(id)!.overdue,
      `sarcina ${id}: marcajul de intarziere difera intre fisa si fila`,
    ).toBe(onTab.get(id)!.overdue);
    expect(
      onSheet.get(id)!.group,
      `sarcina ${id}: galeata difera intre fisa si fila`,
    ).toBe(onTab.get(id)!.group);
  }

  // SI AMANDOUA MULTIMILE SUNT NEGOALE, altfel acordul de deasupra ar fi trecut pe un
  // set care nu are nici un rand intarziat si nici unul la timp: "toate false egal toate
  // false" nu dovedeste nimic despre o margine.
  const lateOnSheet = mine.filter((id) => onSheet.get(id)!.overdue);
  const onTimeOnSheet = mine.filter((id) => !onSheet.get(id)!.overdue);
  expect(
    lateOnSheet.length,
    "setul semanat are randuri intarziate",
  ).toBeGreaterThan(0);
  expect(
    onTimeOnSheet.length,
    "si randuri care nu sunt intarziate",
  ).toBeGreaterThan(0);

  // SI CARE ANUME, pe nume, pe amandoua ecranele: un acord intre doua ecrane care AMANDOUA
  // greșesc la fel ar trece de comparatia de mai sus. Acestea sunt faptele clauzei 4 si
  // ale clauzei 5 a cardului P3-131, cerute de data aceasta si de pe fisa.
  for (const [label, screen] of [
    ["fisa", onSheet],
    ["fila", onTab],
  ] as const) {
    expect(
      screen.get(openTodo)!.overdue,
      `${label}: de facut, trecuta de termen: intarziata`,
    ).toBe(true);
    expect(
      screen.get(working)!.overdue,
      `${label}: in lucru, trecuta de termen: intarziata`,
    ).toBe(true);
    // CLAUZA 5 SCOATE ANUME FINALIZATA SI ANULATA din ce este intarziat, si excluderea
    // este scrisa o singura data, deci se vede identic pe amandoua ecranele.
    expect(
      screen.get(finished)!.overdue,
      `${label}: finalizata, trecuta de termen: NU intarziata`,
    ).toBe(false);
    expect(
      screen.get(cancelled)!.overdue,
      `${label}: anulata, trecuta de termen: NU intarziata`,
    ).toBe(false);
    expect(
      screen.get(dueToday)!.overdue,
      `${label}: cu termen azi: NU intarziata`,
    ).toBe(false);
    expect(
      screen.get(tomorrow)!.overdue,
      `${label}: cu termen maine: NU intarziata`,
    ).toBe(false);
    expect(
      screen.get(noDate)!.overdue,
      `${label}: fara termen: niciodata intarziata`,
    ).toBe(false);
    expect(
      screen.get(noDate)!.group,
      `${label}: fara termen: recipientul Fără termen`,
    ).toBe("fara_termen");
  }

  // SI CUVANTUL VIZIBIL ESTE ACELASI CUVANT PE AMANDOUA ECRANELE, nu numai atributul:
  // operatorul citeste eticheta si nu DOM-ul. Pe fila randul a fost deja masurat de
  // cazurile cardului P3-131; aici se cere pe fisa, pe acelasi testid, fiindca este
  // acelasi randator.
  await openClientSheet(page, clientRowId);
  await expect(
    panelRowById(page, openTodo).getByTestId("task-overdue"),
  ).toHaveText("Întârziată");
  await expect(
    panelRowById(page, dueToday).getByTestId("task-overdue"),
  ).toHaveCount(0);
  await expect(
    panelRowById(page, finished).getByTestId("task-overdue"),
  ).toHaveCount(0);
});

/* ---- (e) GARDA DEVIATIEI D7: urmatorul pas al clientului este neschimbat ---- */

test("fisa clientului: pasul urmator este neschimbat", async ({ page }) => {
  test.setTimeout(360_000);

  // ACEASTA ESTE GARDA PE CARE NOTELE CARDULUI O NUMESC RISCUL LUI, cuvant cu cuvant:
  // "ACCEPTANCE (e) IS THE D7 GUARD."
  //
  // DE CE EXISTA ACEST CAZ, CAND ACCEPTANTA CERE UN TEST EXISTENT. Acceptanta (e) cere
  // cazul pe acest nume si il descrie ca "the EXISTING next-step test, re-run
  // unmodified". NICIUN CAZ CU ACEST NUME NU EXISTA IN DEPOZIT: garda existenta sunt cele
  // SASE cazuri ale lui tests/e2e/lead-next-action.spec.ts, cardul P3-89, iar ele ruleaza
  // in aceeasi suita NEMODIFICATE, nici un caracter, ceea ce `git diff` arata. Amandoua
  // jumatatile se respecta: acelea rămân neatinse si acesta se adauga pe numele cerut.
  // Un diff care ar fi trebuit sa atinga unul din cele sase ar fi rupt D7, si nu a atins
  // niciunul.
  //
  // CE AFIRMA ACEST CAZ, si nu este o repetare a celor sase: ca blocul urmatorului pas
  // mai este pe fisa CU PANOUL NOU LANGA EL, ca panoul nu l-a inghitit, si ca o scriere
  // facuta DIN PANOU lasa cele doua coloane ale urmatorului pas exact cum erau. Cele
  // sase cazuri dovedesc ca urmatorul pas functioneaza; acesta dovedeste ca panoul nu il
  // atinge, care este chiar propozitia clauzei 6.
  const leadName = `${P132} D7 lead`;
  const leadId = await seedClient(leadName);

  // UN PAS DEJA SCRIS, pus direct pe coloane: nu scrierea lui este ce se masoara aici,
  // ea are deja cele sase cazuri ale ei. Etapa rămâne `cold`, care NU este De reluat,
  // deci data de reluare nu intra in socoteala, exact ca in cazul 1 al cardului P3-89.
  const stepDay = shiftDay(TODAY, 5);
  const [sy, sm, sd] = stepDay.split("-");
  const onScreenDay = `${sd}.${sm}.${sy}`;
  const stepText = "trimit oferta pentru acoperiș";
  const wrote = await asService(`clients?id=eq.${leadId}`, {
    method: "PATCH",
    body: { next_action_at: stepDay, next_action: stepText },
  });
  expect(
    wrote.ok,
    `pasul urmator de test nu a putut fi scris: ${wrote.status} ${wrote.text}`,
  ).toBe(true);

  /** Cele doua coloane ale urmatorului pas, citite din baza, plus etapa si data de
   *  reluare pe care cardul P3-89 le leaga de ele. Deviatia D7 este despre
   *  public.clients.next_action_at si public.clients.next_action. */
  async function storedStep(): Promise<Record<string, unknown>> {
    const r = await asUser(
      ownerToken,
      `clients?select=next_action_at,next_action,follow_up_date,stage&id=eq.${leadId}`,
    );
    expect(r.rows, "randul leadului se citeste").toHaveLength(1);
    return r.rows[0]!;
  }

  const before = await storedStep();
  expect(before.next_action_at, "pasul de test este in baza").toBe(stepDay);
  expect(before.next_action).toBe(stepText);

  await signIn(page, ownerAccount());
  await openClientSheet(page, leadId);

  /* ---- partea intai: blocul este pe fisa, cu data si textul lui ---- */

  // ACELASI data-testid PE CARE IL CITESTE CAZUL 1 AL CARDULUI P3-89,
  // `client-next-action`: un al doilea nume pentru acelasi bloc ar fi insemnat ca blocul
  // a fost rescris, adica exact ce D7 interzice.
  const step = page.getByTestId("client-next-action");
  await expect(
    step,
    "blocul Următorul pas este pe fisa clientului",
  ).toBeVisible({
    timeout: 30_000,
  });
  // DATA SE CITESTE CUM O ARATA ECRANUL, `zz.ll.aaaa`, aceeasi forma pe care o cere
  // cazul 1 al cardului P3-89.
  await expect(step, "si arata data pasului").toContainText(onScreenDay);
  await expect(step, "si textul pasului").toContainText(stepText);

  /* ---- partea a doua: panoul sta LANGA el si nu in locul lui ---- */

  await expect(panel(page), "panoul Sarcini este si el pe fisa").toBeVisible();

  // LANGA, SI ASTA SE MASOARA GEOMETRIC: blocul urmatorului pas este DEASUPRA panoului,
  // in cardul lui de identificare, acolo unde era si inainte de acest card. Un panou
  // care l-ar fi inlocuit, mutat, sau impins deasupra lui nu ar trece de aceasta
  // afirmatie.
  const stepBox = await step.boundingBox();
  const panelBox = await panel(page).boundingBox();
  expect(stepBox, "blocul pasului are o cutie pe ecran").not.toBeNull();
  expect(panelBox, "panoul are o cutie pe ecran").not.toBeNull();
  expect(
    panelBox!.y > stepBox!.y,
    "panoul Sarcini sta SUB blocul Următorul pas, adica langa el si nu in locul lui",
  ).toBe(true);

  // SI PANOUL NU L-A INGHITIT: blocul pasului NU este inauntrul panoului. Un panou care
  // ar fi "preluat" urmatorul pas ar fi putut trece de amandoua afirmatiile de mai sus.
  await expect(
    panel(page).getByTestId("client-next-action"),
    "blocul Următorul pas nu este inauntrul panoului Sarcini",
  ).toHaveCount(0);

  // SI PANOUL NU DESENEAZA PASUL SUB ALT NUME: textul pasului nu apare in panou. Panoul
  // nu citeste next_action si nu are de unde sa il stie.
  await expect(
    panel(page).getByText(stepText, { exact: false }),
    "textul pasului nu este randat de panou",
  ).toHaveCount(0);

  /* ---- partea a treia: o scriere DIN PANOU nu atinge cele doua coloane ---- */

  // ASTA ESTE JUMATATEA CARE CONTEAZA CEL MAI MULT, fiindca este singura care prinde o
  // scriere: clauza 6 spune ca panoul "does not replace it, hide it, read it or write
  // it". O sarcina scrisa din panou, apoi modificata, apoi anulata, adica fiecare drum de
  // scriere pe care panoul il are, si cele doua coloane citite dupa fiecare.
  const taskTitle = `${P132} e sarcina scrisa langa pas`;
  await page.getByTestId("panel-task-new").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await page.getByTestId("field-task-title").fill(taskTitle);
  // SI TERMENUL ESTE CHIAR ZIUA PASULUI, anume: daca undeva ar exista o scriere care
  // confunda termenul unei sarcini cu data pasului, o zi diferita ar fi ascuns-o. Casuta
  // de termen se scrie in forma pe care operatorul o vede, `zz.ll.aaaa`.
  await page.getByTestId("field-task-due-date").fill(onScreenDay);
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, {
    timeout: 30_000,
  });

  const written = panel(page)
    .locator('[data-testid="task-row"]')
    .filter({
      has: page.getByTestId("task-title").getByText(taskTitle, { exact: true }),
    });
  await expect(written, "sarcina scrisa apare in panou").toHaveCount(1, {
    timeout: 30_000,
  });

  expect(
    await storedStep(),
    "o sarcina scrisa din panou nu atinge pasul urmator",
  ).toEqual(before);

  // MODIFICATA din panou.
  const changedTitle = `${taskTitle} modificata`;
  await written.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await page.getByTestId("field-task-title").fill(changedTitle);
  await page.getByTestId("task-save").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, {
    timeout: 30_000,
  });
  expect(
    await storedStep(),
    "o modificare facuta din panou nu atinge pasul urmator",
  ).toEqual(before);

  // SI ANULATA din panou, care este singura cale prin care o sarcina iese din lucru.
  const changed = panel(page)
    .locator('[data-testid="task-row"]')
    .filter({
      has: page
        .getByTestId("task-title")
        .getByText(changedTitle, { exact: true }),
    });
  await expect(changed).toHaveCount(1, { timeout: 30_000 });
  await changed.getByTestId("task-edit").click();
  await expect(page.getByTestId("task-form")).toBeVisible();
  await page.getByTestId("task-cancel-task").click();
  await expect(page.getByTestId("task-form")).toHaveCount(0, {
    timeout: 30_000,
  });
  expect(
    await storedStep(),
    "o anulare facuta din panou nu atinge pasul urmator",
  ).toEqual(before);

  /* ---- partea a patra: blocul este TOT acolo, dupa toate trei scrierile ---- */

  await page.reload();
  await expect(page.getByTestId("client-detail")).toBeVisible({
    timeout: 30_000,
  });
  const after = page.getByTestId("client-next-action");
  await expect(
    after,
    "blocul Următorul pas este tot pe fisa dupa scrierile din panou",
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(after, "cu data lui neschimbata").toContainText(onScreenDay);
  await expect(after, "si cu textul lui neschimbat").toContainText(stepText);

  /* ---- partea a cincea: niciun fisier al sarcinilor nu numeste pasul urmator ---- */

  // DEVIATIA D7 PE NUME EXACT, citita in SURSA si nu pe ecran: numele coloanelor, al
  // functiei de căutare, al portii si al ecranului Azi. Un fisier al sarcinilor care ar
  // numi unul din ele IN COD ar fi un fisier care citeste sau scrie urmatorul pas, iar
  // clauza 6 spune ca panoul nu face niciuna. `lib/data/azi` este numit aici fiindca
  // ecranul Azi este celalalt consumator al acelui camp, si cardul care il atinge este
  // P3-133, nu acesta.
  const D7_NAMES = [
    "next_action_at",
    "next_action",
    "search_clients_next_action",
    "hasClientNextAction",
    "nextActionAvailable",
    "lib/data/azi",
  ];

  // SE CAUTA IN COD SI NU IN COMENTARII, SI ASTA NU ESTE O SLABIRE A VERIFICARII, este
  // chiar lectia pe care cardul P3-110 a plata cu o rulare si pe care cazul (c) de mai
  // sus o repeta pentru cuvintele stergerii: o cautare pe NUME gaseste intr-o zi
  // comentariul care CITEAZA regula. Antetul lui components/tasks/TaskPanel.tsx scrie
  // negru pe alb care sunt cele cinci lucruri pe care nu le atinge, si acel antet este
  // documentatia deviatiei D7, nu o incalcare a ei. Un rand care este INTREG un
  // comentariu nu poate citi si nu poate scrie nimic; un rand care incepe cu cod nu este
  // sarit, deci o citire adevarata nu se poate ascunde dupa un comentariu de la capatul
  // randului.
  const isComment = (line: string) => {
    const t = line.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
  };
  const namedInCode = (source: string, name: string) =>
    source
      .split("\n")
      .map((line, i) => ({ line, at: i + 1 }))
      .filter((l) => !isComment(l.line) && l.line.includes(name))
      .map((l) => `${l.at}: ${l.line.trim()}`);

  // SI INSTRUMENTUL SE DOVEDESTE CA GASESTE INAINTE DE A FI CREZUT CAND NU GASESTE NIMIC.
  expect(
    namedInCode(
      '  const { data } = await supabase.from("clients").select("next_action");',
      "next_action",
    ),
    "instrumentul gaseste o citire adevarata",
  ).toHaveLength(1);
  expect(
    namedInCode(
      "  if (client.nextActionAvailable) return null;",
      "nextActionAvailable",
    ),
    "si o citire a portii",
  ).toHaveLength(1);
  expect(
    namedInCode(
      "// acest fisier nu citeste next_action_at si nu il scrie",
      "next_action_at",
    ),
    "si un comentariu care citeaza regula nu este un vinovat",
  ).toEqual([]);
  expect(
    namedInCode(" *  nimic din lib/data/azi.ts nu este atins", "lib/data/azi"),
    "nici un comentariu de bloc care o citeaza",
  ).toEqual([]);

  const TASK_FILES = [
    "components/tasks/TaskPanel.tsx",
    "components/tasks/TaskTable.tsx",
    "components/tasks/TaskForm.tsx",
    "components/tasks/SarciniScreen.tsx",
    "lib/data/tasks.ts",
    "lib/data/tasks-actions.ts",
    "lib/data/tasks-shape.ts",
    "lib/data/tasks-types.ts",
    "lib/data/tasks-query.ts",
  ];
  for (const file of TASK_FILES) {
    const source = readFileSync(file, "utf8");
    expect(
      source.length,
      `${file} trebuie sa existe si sa nu fie gol`,
    ).toBeGreaterThan(0);
    for (const name of D7_NAMES) {
      expect(
        namedInCode(source, name),
        `${file} numeste ${name} in cod, ceea ce deviatia D7 interzice`,
      ).toEqual([]);
    }
  }
});
