// Ce cere o sarcina ca sa poata fi scrisa, si propozitiile cu care se refuza.
//
// Cardul P3-130, goal G73, Item 4 al lui Ivan. NIMIC DE SERVER IN ACEST FISIER.
//
// DE CE UN MODUL SEPARAT SI NU CATEVA RANDURI IN tasks-actions.ts. Fisierul acela
// este marcat "use server", deci nu poate exporta decat functii async si nu poate
// fi importat de un test care il cheama direct. Lectia este scrisa in antetul lui
// lib/data/outbound-mode.ts si in docs/LEARNINGS.md: ce trebuie dovedit prin
// citirea lui sta intr-un modul curat. Cele trei uniuni de tokenuri si refuzurile
// de mai jos sunt tocmai asa ceva.
//
// FISIERUL NU NUMESTE NICIO TABELA SI NU FACE NICIO CITIRE. Tabela se cheama in
// lib/data/tasks.ts si lib/data/tasks-actions.ts, amandoua trecute pe langa poarta
// hasTasks, ceea ce check:pending-schema-reads cere cat timp migratia 0068 este in
// registrul de asteptare de la docs/migrations/APPLY-LOG.md.
//
// NU EXISTA AICI NICIO VERIFICARE DE CALENDAR PENTRU ZIUA SCADENTEI, si asta este
// regula si nu o scapare. Singura autoritate asupra faptului ca o zi exista este
// coloana `date` din PostgreSQL, exact cum a hotarat cardul P3-118 pentru data
// ridicarii: o a doua rutina de calendar scrisa in TypeScript ar fi doua rutine
// care trebuie sa fie de acord pentru totdeauna. Ce se cere aici este doar ca
// sirul sa aiba forma pe care o da si o primeste components/ui/DateField.tsx, iar
// refuzul bazei este tradus romaneste in lib/data/tasks-actions.ts.

import type {
  NewTaskInput,
  TaskEntityType,
  TaskPatch,
  TaskPriority,
  TaskStatus,
} from "./tasks-types";

/** Cele patru stari stocate, in ordinea in care le declara migratia 0068, care
 *  este ordinea fluxului si nu una alfabetica. Tokenuri englezesti, P2-01. */
export const ALL_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

/** Cele trei urgente stocate, de la cea mai mica la cea mai mare. */
export const ALL_TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

/** Cele doua feluri de inregistrare de care o sarcina poate fi legata.
 *
 *  DOUA SI NU TREI: un lead este un rand din public.clients care poarta o etapa,
 *  deci se leaga ca un client. Motivul intreg este scris in lib/data/tasks-types.ts
 *  si in secțiunea 3 a migratiei 0068. */
export const ALL_TASK_ENTITY_TYPES: TaskEntityType[] = ["client", "project"];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (ALL_TASK_STATUSES as string[]).includes(value);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (ALL_TASK_PRIORITIES as string[]).includes(value);
}

export function isTaskEntityType(value: unknown): value is TaskEntityType {
  return typeof value === "string" && (ALL_TASK_ENTITY_TYPES as string[]).includes(value);
}

/** Forma pe care o da si o primeste components/ui/DateField.tsx: yyyy-mm-dd.
 *
 *  NUMAI FORMA, nu existenta zilei in calendar. 31.02.2026 trece de aici si este
 *  refuzata de coloana `date`, iar tasks-actions.ts traduce refuzul. Vezi antetul. */
export function isDayString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Un refuz, cu propozitia romaneasca si campul pe care se aseaza pe ecran. */
export type TaskRefusal = { message: string; field?: string };

/**
 * PROPOZITIILE DE REFUZ, O SINGURA COPIE FIECARE, pe modelul lui ISSUE_REFUSAL din
 * lib/data/outbound-mode.ts si pentru acelasi motiv: formularul cardului P3-131 are
 * nevoie de ele pe rand, ca sa poata numi doua lipsuri cand lipsesc amandoua, iar
 * functiile de mai jos intorc numai primul refuz. Scrise de doua ori, o corectare
 * de text ar muta o propozitie si ar lasa-o pe cealalta.
 *
 * ELE NU INLOCUIESC RESTRICTIILE DIN BAZA, si asta este proiectarea si nu o
 * dublare: ecranul spune OPERATORULUI ce lipseste, iar tasks_title_not_blank si
 * tasks_entity_both_or_neither din migratia 0068 apara toti ceilalti apelanti. Un
 * formular este un apelant; baza de date este toti.
 */
export const TASK_REFUSAL = {
  title: "Scrie un titlu pentru sarcină.",
  status: "Starea sarcinii nu este una dintre cele patru.",
  priority: "Urgența sarcinii nu este una dintre cele trei.",
  entityType: "Felul înregistrării legate nu este nici client, nici proiect.",
  entityPair:
    "Înregistrarea legată se alege întreagă: felul ei și înregistrarea însăși, sau niciuna.",
  dueDate: "Scrie termenul ca zi, lună și an, de exemplu 01.12.2026.",
} as const;

/** Perechea tip plus id, verificata o singura data pentru amandoua drumurile de
 *  scriere. Intoarce null cand perechea este intreaga sau cand lipseste de tot. */
function refusePair(entityType: string, entityId: string): TaskRefusal | null {
  const hasType = entityType !== "";
  const hasId = entityId !== "";

  if (hasType && !isTaskEntityType(entityType))
    return { message: TASK_REFUSAL.entityType, field: "entityType" };
  if (hasType !== hasId) return { message: TASK_REFUSAL.entityPair, field: "entityId" };
  return null;
}

/**
 * Ce cere o sarcina noua, verificat inainte de a se trimite cererea.
 *
 * STAREA SI URGENTA SUNT OPTIONALE PE INTRARE si nu se completeaza aici cu o
 * valoare aleasa de acest fisier: coloanele au implicit 'todo' si 'medium' in
 * migratia 0068, deci un apelant care nu le trimite primeste raspunsul bazei si nu
 * un al doilea implicit scris in TypeScript, care s-ar putea abate de la primul.
 *
 * Intoarce null cand intrarea este intreaga.
 */
export function validateNewTask(input: NewTaskInput): TaskRefusal | null {
  if ((input.title ?? "").trim() === "") return { message: TASK_REFUSAL.title, field: "title" };

  const status = (input.status ?? "").trim();
  if (status !== "" && !isTaskStatus(status))
    return { message: TASK_REFUSAL.status, field: "status" };

  const priority = (input.priority ?? "").trim();
  if (priority !== "" && !isTaskPriority(priority))
    return { message: TASK_REFUSAL.priority, field: "priority" };

  const dueDate = (input.dueDate ?? "").trim();
  if (dueDate !== "" && !isDayString(dueDate))
    return { message: TASK_REFUSAL.dueDate, field: "dueDate" };

  return refusePair((input.entityType ?? "").trim(), (input.entityId ?? "").trim());
}

/**
 * Ce cere o modificare pe o sarcina care exista.
 *
 * UN CAMP ABSENT NU SE ATINGE SI UN CAMP TRIMIS GOL SE GOLESTE, si cele doua sunt
 * lucruri diferite: formularul are nevoie de amandoua, fiindca "nu schimb
 * responsabilul" si "scot responsabilul" sunt doua apasari de buton diferite.
 * Titlul este singura exceptie, fiindca tasks_title_not_blank nu lasa o sarcina
 * fara titlu sa existe: trimis gol, este un refuz si nu o golire.
 *
 * NU EXISTA NICIO STERGERE AICI SI NU EXISTA NICIUNA NICAIERI. Anularea este o
 * modificare de stare catre 'cancelled', propozitia lui Ivan si clauza 4 a
 * cardului, si migratia 0068 nu da tabelei nici politica, nici drept de stergere.
 */
export function validateTaskPatch(patch: TaskPatch): TaskRefusal | null {
  if (patch.title !== undefined && patch.title.trim() === "")
    return { message: TASK_REFUSAL.title, field: "title" };

  if (patch.status !== undefined && !isTaskStatus(patch.status.trim()))
    return { message: TASK_REFUSAL.status, field: "status" };

  if (patch.priority !== undefined && !isTaskPriority(patch.priority.trim()))
    return { message: TASK_REFUSAL.priority, field: "priority" };

  if (patch.dueDate !== undefined && patch.dueDate.trim() !== "" && !isDayString(patch.dueDate.trim()))
    return { message: TASK_REFUSAL.dueDate, field: "dueDate" };

  // PERECHEA SE SCHIMBA INTREAGA SAU NU SE SCHIMBA. Un patch care trimite numai
  // una din cele doua chei ar lasa jumatatea cealalta pe randul vechi, si
  // restrictia bazei ar refuza scrierea cu numele ei; refuzul se spune aici
  // romaneste, inainte de drum.
  const sentType = patch.entityType !== undefined;
  const sentId = patch.entityId !== undefined;
  if (sentType !== sentId) return { message: TASK_REFUSAL.entityPair, field: "entityId" };
  if (!sentType) return null;

  return refusePair((patch.entityType ?? "").trim(), (patch.entityId ?? "").trim());
}
