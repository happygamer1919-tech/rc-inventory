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
import {
  isTaskEntityType,
  isTaskPriority,
  isTaskStatus,
  taskLinkKey,
  type TaskLinkChoiceLike,
} from "./tasks-shape";
import type { Task, TaskEntityType, TaskListQuery } from "./tasks-types";
import { one } from "./row";
import { readEntityTaskRows, readTaskRows, type TaskReadQuery } from "./tasks-read";

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
  assignee:profiles!tasks_assignee_id_fkey ( id, full_name )
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
  assignee?: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
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
    assigneeName: assignee?.full_name ?? null,
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

/** Porneste o citire a sarcinilor cu totalul cerut in aceeasi cerere, pentru citirile
 *  pe pagini din tasks-read.ts. Tabela se numeste doar aici, dupa poarta hasTasks. */
function startRead(supabase: Awaited<ReturnType<typeof createClient>>): TaskReadQuery<TaskRow> {
  return supabase
    .from("tasks")
    .select(SELECT_TASK, { count: "exact" }) as unknown as TaskReadQuery<TaskRow>;
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

  // Filtrele, sortarea si paginarea stau in tasks-read.ts, fara server-only, ca un
  // test sa le poata rula impotriva unui client fals.
  const rows = await readTaskRows<TaskRow>(() => startRead(supabase), query);
  return rows.map(toTask);
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

  const rows = await readEntityTaskRows<TaskRow>(() => startRead(supabase), entityType, entityId);
  return rows.map(toTask);
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
