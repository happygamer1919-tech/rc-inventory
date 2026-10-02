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
  expect(englishIn("Save the task"), "instrumentul gaseste un cuvant englez").toEqual([
    "Save",
    "Task",
  ]);
  expect(englishIn("PRIORITY"), "si il gaseste si cu majuscule, ca in antetele tabelului").toEqual([
    "Priority",
  ]);
  expect(englishIn("Urgență Ridicată Întârziată"), "si nu confunda romana cu engleza").toEqual([]);

  /** Tot ce se citeste intr-o zona: TEXTUL SCRIS plus indicatiile din casute.
   *
   *  textContent SI NU innerText, deliberat, din doua motive. `Th` poarta clasa
   *  `uppercase` si innerText intoarce textul TRANSFORMAT DE CSS, deci "Termen" ar sosi
   *  "TERMEN": aceea este lectura pe care cardul P3-15 a plata cu o rulare. Si
   *  optiunile unui `<select>` nu sunt randate in flux, deci innerText nu le vede, iar
   *  valorile filtrelor pe care clauza 3 le cere romanesti SUNT chiar optiuni. */
  async function written(where: Locator): Promise<string> {
    const text = await where.evaluate((e) => e.textContent ?? "");
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
    const text = await written(where);
    expect(englishIn(text), `cuvinte englezesti in ${label}: ${text}`).toEqual([]);
  }

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
  const panel = await written(page.getByTestId("task-form"));
  expect(englishIn(panel), `cuvinte englezesti in panou: ${panel}`).toEqual([]);
  await expect(page.getByTestId("field-task-due-date")).toHaveAttribute(
    "placeholder",
    DATE_PLACEHOLDER,
  );
  await expect(page.getByTestId("field-task-due-date-native")).toBeHidden();
  await page.getByTestId("task-form-close").click();

  /* ---- zona a treia: starea goala, care este o propozitie si nu o zona alba ---- */

  await openSarcini(page, { de_la: "2039-01-01", pana_la: "2039-01-02" });
  await expect(page.getByTestId("task-row")).toHaveCount(0);
  const empty = await written(page.locator("main").first());
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
