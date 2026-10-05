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
import { isTaskEntityType, isTaskPriority, isTaskStatus } from "./tasks-shape";
import type { Task, TaskEntityType, TaskListQuery } from "./tasks-types";
import { one } from "./row";

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

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; full_name: string | null; email: string | null } | { id: string; full_name: string | null; email: string | null }[] | null;
};

/**
 * Randul, redus la forma pe care o citeste aplicatia.
 *
 * TOKENURILE NECUNOSCUTE CAD PE IMPLICITUL COLOANEI si nu arunca. Cele trei
 * enumerari sunt inchise in baza, deci un sir in afara lor nu poate ajunge aici din
 * PostgreSQL; ce se apara este cazul in care cineva adauga o eticheta de enum intr-o
 * migratie viitoare si desfasoara inainte ca TASK_STATUS_LABEL sa o cunoasca. Atunci
 * o lista care raspunde cu starea cea mai nevinovata este mai buna decat un ecran care
 * cade, iar `npx tsc --noEmit` prinde oricum eticheta fara eticheta, fiindca hartile
 * din tasks-types.ts sunt un `Record` pe uniune si nu un `Partial`.
 */
function toTask(row: TaskRow): Task {
  const assignee = one(row.assignee ?? null);
  const entityType: TaskEntityType | null = isTaskEntityType(row.entity_type)
    ? row.entity_type
    : null;

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: isTaskStatus(row.status) ? row.status : "todo",
    priority: isTaskPriority(row.priority) ? row.priority : "medium",
    dueDate: row.due_date ?? null,
    assigneeId: row.assignee_id ?? null,
    assigneeName: assignee ? (assignee.full_name?.trim() || assignee.email?.trim() || null) : null,
    // PERECHEA SE CITESTE INTREAGA SAU DELOC, exact cum o tine restrictia
    // tasks_entity_both_or_neither: un tip pe care acest fisier nu il cunoaste ar
    // lasa altfel un id care nu poate fi dus la nicio tabela.
    entityType,
    entityId: entityType === null ? null : (row.entity_id ?? null),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

  const { data, error } = await request;
  if (error) throw new Error(`Nu s-au putut citi sarcinile: ${error.message}`);
  return ((data ?? []) as unknown as TaskRow[]).map(toTask);
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

  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT_TASK)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Nu s-a putut citi sarcina: ${error.message}`);
  if (!data) return null;
  return toTask(data as unknown as TaskRow);
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

  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT_TASK)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(`Nu s-au putut citi sarcinile înregistrării: ${error.message}`);
  return ((data ?? []) as unknown as TaskRow[]).map(toTask);
}
