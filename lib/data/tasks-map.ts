// Randul unei sarcini, redus la forma aplicatiei, si lista echipei din care vine
// numele responsabilului. Cardul P3-157.
//
// FISIERUL ACESTA NU IMPORTA NIMIC DE SERVER, deliberat, ca specificatia lui sa il
// poata citi fara baza de date (aceeasi regula ca lib/data/row.ts si
// lib/data/tasks-shape.ts). Citirea din baza ramane in lib/data/tasks.ts.
//
// DE UNDE VINE NUMELE RESPONSABILULUI. Politica profiles_select (0001) lasa un cont
// de manager sa citeasca un singur profil, pe al lui, deci imbinarea `assignee:profiles`
// din citirea sarcinilor intorcea null pentru orice coleg, iar ecranul scria
// "Nealocată" pentru o sarcina care are responsabil. Numele vine acum din functia
// list_team_members() (migratia 0072): id, nume si starea activ, nimic altceva.
// Imbinarea ramane ca REZERVA, pentru cele cateva minute in care codul nou ruleaza pe
// schema veche.

import { isTaskEntityType, isTaskPriority, isTaskStatus } from "./tasks-shape";
import type { Task, TaskEntityType } from "./tasks-types";
import { one } from "./row";

/** Un coleg, asa cum il intoarce list_team_members(). `displayName` poate fi gol. */
export type TeamMember = { id: string; displayName: string | null; active: boolean };

/** O optiune din lista Responsabil. */
export type AssigneeChoice = { id: string; fullName: string };

type EmbeddedProfile = { id: string; full_name: string | null; email?: string | null };

export type TaskRow = {
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
  assignee?: EmbeddedProfile | EmbeddedProfile[] | null;
};

/** id -> nume, numai pentru colegii care au un nume. Activi si dezactivati: un
 *  responsabil dezactivat ramane responsabilul sarcinii si se arata cu numele lui. */
export function teamNameLookup(members: readonly TeamMember[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const m of members) {
    const name = m.displayName?.trim();
    if (name) names.set(m.id, name);
  }
  return names;
}

/** Optiunile selectorului Responsabil: NUMAI colegii activi, in ordinea alfabetica
 *  romaneasca. Un coleg fara nume se arata "Fără nume", ca optiunea sa nu fie goala. */
export function assigneeChoices(members: readonly TeamMember[]): AssigneeChoice[] {
  return members
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, fullName: m.displayName?.trim() || "Fără nume" }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ro"));
}

/** Ce scrie ecranul la Responsabil. "Nealocată" NUMAI cand nu raspunde nimeni de
 *  sarcina; un responsabil al carui nume nu se cunoaste se scrie "Fără nume", nu
 *  "Nealocată", ca sa nu para ca nimeni nu raspunde. */
export function assigneeLabel(task: { assigneeId: string | null; assigneeName: string | null }): string {
  if (task.assigneeId === null) return "Nealocată";
  return task.assigneeName ?? "Fără nume";
}

/**
 * Randul, redus la forma pe care o citeste aplicatia.
 *
 * Numele responsabilului se cauta INTAI in lista echipei si numai apoi in imbinarea
 * din rand. `assigneeName` este null NUMAI cand sarcina nu are responsabil sau cand
 * niciuna dintre cele doua surse nu il cunoaste.
 *
 * TOKENURILE NECUNOSCUTE CAD PE IMPLICITUL COLOANEI si nu arunca: cele trei
 * enumerari sunt inchise in baza, iar ce se apara este o eticheta adaugata intr-o
 * migratie viitoare si desfasurata inainte ca TASK_STATUS_LABEL sa o cunoasca.
 */
export function toTask(row: TaskRow, names: ReadonlyMap<string, string>): Task {
  const embedded = one(row.assignee ?? null);
  const assigneeId = row.assignee_id ?? null;
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
    assigneeId,
    assigneeName:
      assigneeId === null
        ? null
        : (names.get(assigneeId) ??
          (embedded?.full_name?.trim() || embedded?.email?.trim() || null)),
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
