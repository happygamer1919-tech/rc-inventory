import "server-only";

// Citirile sarcinilor. Cardul P3-130, goal G73, Item 4 al lui Ivan.
//
// INTAI SE INTREABA DACA TABELA EXISTA, si asta nu este optional. Migratia 0068
// ajunge in productie pe fuziune, in aproximativ doua minute, iar codul acesta
// pleaca din acelasi push si se desfasoara pe programul lui, deci cateva minute
// din build-ul NOU pot vorbi cu schema VECHE. Fara hasTasks, un select pe o tabela
// inexistenta primeste un refuz de la PostgREST si ecranul raspunde 500: aceea este
// chiar forma incidentului INC-05 din 2026-08-31, cand fiecare ecran al platformei
// a raspuns 500 fiindca niste migratii erau fuzionate si neaplicate.
//
// COMPORTAMENTUL INAINTE DE APLICARE ESTE CEL DE ASTAZI. Fara tabela nu exista
// nicio sarcina, deci fiecare citire de aici raspunde GOL, nu arunca si nu
// raporteaza o eroare: "nu exista inca tabela" si "nu exista nicio sarcina" se vad
// la fel pe un ecran, si acest card nu construieste niciun ecran, clauza 7.
// Cardurile care le construiesc, P3-131, P3-132 si P3-133, au tasksVisible() mai
// jos cand vor avea nevoie sa spuna altceva.
//
// CE NU ESTE AICI, SI UNDE ESTE. PANA LA CARDUL P3-131 ACEST ANTET SPUNEA, SI
// AVEA DREPTATE LA DATA LUI:
//
//   "NICIUN FILTRU, NICIO SORTARE SI NICIO GALEATA. Cele cinci filtre, cele trei
//   sortari si cele trei galeti Azi, Aceasta saptamana si Restante sunt clauzele 3,
//   4 si 6 ale cardului P3-131, iar ele au nevoie de o singura definitie a zilei,
//   chisinauToday(), pe care acel card o citeste din locul in care o citeste si
//   ecranul Azi. Scrise aici, in cardul care nu are ecran, ar fi o a doua definitie
//   a lui 'intarziat', scrisa de cineva care nu vede ecranul."
//
// CARDUL P3-131 ESTE ACUM SCRIS, si a despartit propozitia in doua jumatati care nu
// erau aceeasi:
//
//   CELE CINCI FILTRE SI CELE TREI SORTARI SUNT AICI, in listTasks() mai jos,
//   fiindca ele nu sunt o definitie a zilei: sunt un `eq` si un `order` pe care baza
//   le face mai bine decat memoria, pe indexul tasks_status_due_date_idx scris
//   pentru ele. Capetele intervalului de termen sosesc deja curatate de
//   parseTaskQuery, in lib/data/tasks-query.ts, care nu are server.
//
//   GALETILE SI MARCAJUL DE INTARZIERE NU SUNT AICI SI NU AJUNG NICIODATA AICI.
//   Ele sunt o singura functie pura, taskBucket() in lib/data/tasks-shape.ts, din
//   care marcajul se DEDUCE. Grija antetului de mai sus era aceea si rămâne
//   intemeiata: o a doua definitie a lui "intarziat" scrisa intr-o interogare ar fi
//   exact defectul pe care clauza 6 este scrisa ca sa il previna. NICIO ZI NU SE
//   COMPARA IN ACEST FISIER.
//
// NICIO STERGERE NU EXISTA PE ACEST DRUM SI PE NICIUNUL. Anularea este o schimbare
// de stare catre 'cancelled', propozitia lui Ivan si clauza 4, iar migratia 0068 nu
// da tabelei nici politica, nici drept de stergere. O sarcina anulata se citeste
// prin exact functiile de mai jos, ca oricare alta: ea rămâne pe inregistrare, se
// citeste si se numara, care este cererea proprietarului cuvant cu cuvant.

import { createClient } from "@/lib/supabase/server";
import { hasTasks } from "./schema-capability";
import { listClientOwnerChoices } from "./clients";
import {
  assigneeChoices,
  teamNameLookup,
  toTask,
  type AssigneeChoice,
  type TaskRow,
  type TeamMember,
} from "./tasks-map";
import { taskLinkKey, type TaskLinkChoiceLike } from "./tasks-shape";
import type { Task, TaskEntityType, TaskListQuery } from "./tasks-types";

// NUMELE COLOANELOR SE SCRIU AICI, intr-un fisier care trece pe langa poarta, si
// nu in lib/data/tasks-types.ts, care nu are ce sa apere cu una.
//
// `assignee:profiles!tasks_assignee_id_fkey` CU NUMELE RESTRICTIEI SCRIS, pe modelul
// lui lib/data/outbound.ts: `assignee` este un ALIAS si nu un token stocat, iar numele
// restrictiei este cel pe care PostgreSQL il da singur unei chei straine scrise inline,
// `<tabela>_<coloana>_fkey`, si migratia 0068 o scrie chiar inline. Scris pe nume, un
// al doilea drum intre tasks si profiles adaugat mai tarziu de alt card nu transforma
// aceasta citire intr-o eroare de relatie ambigua.
const SELECT_TASK = `
  id, title, description, status, priority, due_date,
  assignee_id, entity_type, entity_id, created_by, created_at, updated_at,
  assignee:profiles!tasks_assignee_id_fkey ( id, full_name, email )
`;

/**
 * Lista echipei, din list_team_members() (migratia 0072), sau null cand functia nu
 * exista inca pe baza sau raspunde cu eroare.
 *
 * NULL INSEAMNA "NU STIU", NU "NIMENI". Migratia ajunge in productie pe fuziune, in
 * aproximativ doua minute, iar codul nou poate vorbi cateva minute cu schema veche:
 * atunci o eroare nu are voie sa faca ecranul 500, ci sa lase citirea cum era (numele
 * din imbinarea cu profilul, lista de responsabili din profiluri).
 */
async function readTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<TeamMember[] | null> {
  const { data, error } = await supabase.rpc("list_team_members");
  if (error || !Array.isArray(data)) return null;
  return (data as { id: string; display_name: string | null; active: boolean }[]).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    active: m.active,
  }));
}

/** Numele responsabililor pentru o citire de sarcini; gol cand lista nu se poate citi. */
async function readNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ReadonlyMap<string, string>> {
  return teamNameLookup((await readTeam(supabase)) ?? []);
}

/**
 * Optiunile selectorului Responsabil: colegii ACTIVI, vazuti de orice cont activ, nu
 * numai de administrator (cardul P3-157). Cand functia nu exista inca pe baza, cade pe
 * citirea de pana acum, listClientOwnerChoices.
 */
export async function listTaskAssigneeChoices(): Promise<AssigneeChoice[]> {
  const supabase = await createClient();
  const team = await readTeam(supabase);
  if (team === null) return listClientOwnerChoices();
  return assigneeChoices(team);
}

/**
 * Tabela sarcinilor exista pe baza catre care arata aplicatia?
 *
 * ECRANELE O INTREABA PE EA, pe modelul lui outboundModeVisible din
 * lib/data/outbound.ts, si nu deduc raspunsul dintr-o lista goala: "nu este inca
 * aplicata migratia" si "nu exista nicio sarcina" sunt doua lucruri diferite, iar
 * obiceiul acestui proiect este ca ce nu se poate folosi nu apare pe ecran.
 *
 * POARTA CHEMATA DE DOUA ORI PE O PAGINA NU COSTA UN AL DOILEA DRUM LA BAZA:
 * hasTasks isi tine minte raspunsul un minut, in lib/data/schema-capability.ts.
 */
export async function tasksVisible(): Promise<boolean> {
  const supabase = await createClient();
  return hasTasks(supabase);
}

/** Toate sarcinile, cele anulate incluse, cele mai noi intai.
 *
 *  CELE ANULATE SUNT AICI SI NU SE ASCUND, clauza 4: o sarcina anulata rămâne pe
 *  inregistrare, citibila si numarabila, ca peste o luna sa se poata vedea ce a fost
 *  lasat si cand. Ce se arata pe un ecran anume este alegerea cardului care are
 *  ecranul, prin filtrul de stare al clauzei 3 din P3-131.
 *
 *  FARA ARGUMENTE, RASPUNSUL ESTE EXACT CEL DE DINAINTE DE CARDUL P3-131, ca
 *  singurul apelant care exista sa nu se schimbe: cele cinci filtre si cele trei
 *  sortari sunt optionale si lipsa lor inseamna "tot, cele mai noi intai". */
export async function listTasks(query?: TaskListQuery): Promise<Task[]> {
  const supabase = await createClient();
  if (!(await hasTasks(supabase))) return [];

  let request = supabase.from("tasks").select(SELECT_TASK);

  // CELE CINCI FILTRE SE APLICA PE SERVER, nu in memorie, ca pe fiecare alta lista
  // a acestei aplicatii: antetul lui components/clients/ClientsScreen.tsx scrie
  // regula ("FILTRAREA SE FACE PE SERVER... Componentul acesta nu filtreaza nimic in
  // memorie"), iar indexul tasks_status_due_date_idx din migratia 0068 este scris de
  // P3-130 chiar pentru ele.
  //
  // UN CAMP GOL NU SE TRIMITE, deci nu exista "filtrat pe sirul gol": aceea ar fi o
  // lista mereu goala pe o adresa scrisa de mana.
  if (query) {
    if (query.status !== "") request = request.eq("status", query.status);
    if (query.priority !== "") request = request.eq("priority", query.priority);
    if (query.assigneeId !== "") request = request.eq("assignee_id", query.assigneeId);
    if (query.entityType !== "") request = request.eq("entity_type", query.entityType);
    // INTERVALUL DE TERMEN SE COMPARA CA ZI DE CALENDAR, nu ca moment: `due_date`
    // este o coloana `date`, iar capetele sunt siruri `yyyy-mm-dd` curatate de
    // parseTaskQuery. Amandoua capetele sunt INCLUSE, fiindca un operator care scrie
    // acelasi termen in amandoua casutele cere ziua aceea si nu o lista goala.
    if (query.dueFrom !== "") request = request.gte("due_date", query.dueFrom);
    if (query.dueTo !== "") request = request.lte("due_date", query.dueTo);
  }

  for (const { column, ascending } of orderBy(query)) {
    // TERMENUL FARA VALOARE STA LA SFARSIT IN AMANDOUA DIRECTIILE, prin nullsFirst
    // false. O sarcina fara termen nu este nici cea mai apropiata, nici cea mai
    // indepartata: nu are zi, deci nu are loc in ordinea zilelor, iar lista o aseaza
    // sub capul ei de grup "Fără termen" oricum.
    request = request.order(column, { ascending, nullsFirst: false });
  }

  const [{ data, error }, names] = await Promise.all([request, readNames(supabase)]);
  if (error) throw new Error(`Nu s-au putut citi sarcinile: ${error.message}`);
  return ((data ?? []) as unknown as TaskRow[]).map((row) => toTask(row, names));
}

/**
 * Cele trei sortari ale clauzei 4, traduse in coloane.
 *
 * URGENTA SE SORTEAZA PE ENUMERARE SI NU PE CUVANT, si asta nu este o scurtatura:
 * PostgreSQL ordoneaza o enumerare dupa ORDINEA IN CARE ETICHETELE SUNT DECLARATE, iar
 * migratia 0068 le declara `low`, `medium`, `high`, adica de la cea mai mica la cea mai
 * mare. Deci crescator inseamna Scăzută intai, exact ce citeste operatorul. Sortata ca
 * text ar fi dat `high`, `low`, `medium`, adica o ordine care nu inseamna nimic.
 *
 * `id` LA FINAL, MEREU. Doua randuri cu acelasi termen, aceeasi urgenta sau aceeasi
 * clipa de creare pot sosi in orice ordine de la baza, si o ordine care se schimba
 * intre doua randari este o lista pe care un test nu o poate masura si un om nu o
 * poate urmari.
 */
function orderBy(query?: TaskListQuery): { column: string; ascending: boolean }[] {
  const ascending = (query?.direction ?? "crescator") === "crescator";
  const column =
    query === undefined
      ? "created_at"
      : query.sort === "termen"
        ? "due_date"
        : query.sort === "urgenta"
          ? "priority"
          : "created_at";

  // Fara nicio sortare ceruta, raspunsul rămâne cel de dinainte de P3-131: cele mai
  // noi intai.
  if (query === undefined) {
    return [
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ];
  }

  return [
    { column, ascending },
    { column: "id", ascending },
  ];
}

/** O sarcina, dupa id, sau null cand nu exista. */
export async function getTask(id: string): Promise<Task | null> {
  const supabase = await createClient();
  if (!(await hasTasks(supabase))) return null;

  const [{ data, error }, names] = await Promise.all([
    supabase.from("tasks").select(SELECT_TASK).eq("id", id).maybeSingle(),
    readNames(supabase),
  ]);

  if (error) throw new Error(`Nu s-a putut citi sarcina: ${error.message}`);
  if (!data) return null;
  return toTask(data as unknown as TaskRow, names);
}

/**
 * Sarcinile legate de o inregistrare anume, cele mai noi intai.
 *
 * ASTA ESTE CITIREA PE CARE PANOUL CARDULUI P3-132 O IMBRACA, si indexul
 * tasks_entity_idx din migratia 0068 este scris exact pentru ea: (entity_type,
 * entity_id, created_at desc), care este indexul lui public.status_history din 0001,
 * literal.
 *
 * UN LEAD SE INTREABA CU TOKENUL 'client' si asta nu este o scurtatura: in aceasta
 * platforma un lead ESTE un rand din public.clients care poarta o etapa, iar fisa
 * leadului citeste chiar acel rand. Motivul intreg este in lib/data/tasks-types.ts.
 */
export async function listTasksForEntity(
  entityType: TaskEntityType,
  entityId: string,
): Promise<Task[]> {
  const supabase = await createClient();
  if (!(await hasTasks(supabase))) return [];

  const [{ data, error }, names] = await Promise.all([
    supabase
      .from("tasks")
      .select(SELECT_TASK)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    readNames(supabase),
  ]);

  if (error) throw new Error(`Nu s-au putut citi sarcinile înregistrării: ${error.message}`);
  return ((data ?? []) as unknown as TaskRow[]).map((row) => toTask(row, names));
}

/**
 * Inregistrarile legate de sarcinile date, DOAR cele care nu sunt in listele de
 * alegere obisnuite: un proiect inchis sau un client inactiv. Formularul de
 * modificare le adauga la lista sarcinii respective, ca sa arate numele lor si nu o
 * casuta goala. Cheia hartii este taskLinkKey(fel, id).
 *
 * Cel mult doua citiri, numai pentru legaturile care lipsesc din liste; nicio citire
 * cand toate sunt in liste. Un rand pe care baza nu il da lipseste din harta, ca
 * inainte.
 */
export async function listClosedLinkChoices(
  rows: Task[],
  selectableClientIds: string[],
  selectableProjectIds: string[],
): Promise<Record<string, TaskLinkChoiceLike>> {
  const clientIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const t of rows) {
    if (t.entityType === null || t.entityId === null) continue;
    if (t.entityType === "project") {
      if (!selectableProjectIds.includes(t.entityId)) projectIds.add(t.entityId);
    } else if (t.entityType === "client") {
      if (!selectableClientIds.includes(t.entityId)) clientIds.add(t.entityId);
    }
  }

  const out: Record<string, TaskLinkChoiceLike> = {};
  if (clientIds.size === 0 && projectIds.size === 0) return out;

  const supabase = await createClient();
  const [clients, projects] = await Promise.all([
    clientIds.size === 0
      ? { data: [] }
      : supabase.from("clients").select("id, name, active").in("id", [...clientIds]),
    projectIds.size === 0
      ? { data: [] }
      : supabase.from("projects").select("id, name, status, active").in("id", [...projectIds]),
  ]);

  for (const c of (clients.data ?? []) as { id: string; name: string; active: boolean }[]) {
    out[taskLinkKey("client", c.id)] = {
      id: c.id,
      label: c.active ? c.name : `${c.name} (inactiv)`,
    };
  }
  for (const p of (projects.data ?? []) as {
    id: string;
    name: string;
    status: string;
    active: boolean;
  }[]) {
    out[taskLinkKey("project", p.id)] = {
      id: p.id,
      label: p.status === "closed" ? `${p.name} (închis)` : `${p.name} (inactiv)`,
    };
  }
  return out;
}
