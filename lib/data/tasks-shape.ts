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
  TaskBucket,
  TaskEntityType,
  TaskGroup,
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

/** Inregistrarea legata a unei sarcini, asa cum o arata caseta "Înregistrare" cand
 *  inregistrarea nu mai este in lista de alegere (proiect inchis, client inactiv).
 *  Cheia hartii este `<fel>:<id>`, ca o singura harta sa serveasca ambele feluri. */
export type TaskLinkChoiceLike = { id: string; label: string; hint?: string };

export function taskLinkKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/** Lista de alegere pentru o sarcina care exista: cea obisnuita, plus inregistrarea
 *  ei curenta daca lipseste din lista. O sarcina noua nu are `current`, deci primeste
 *  lista neschimbata: proiectele inchise si clientii inactivi nu se ofera la legare. */
export function linkChoicesWithCurrent<T extends TaskLinkChoiceLike>(
  options: T[],
  current: T | undefined,
): T[] {
  if (current === undefined || options.some((o) => o.id === current.id)) return options;
  return [...options, current];
}

export function isTaskEntityType(value: unknown): value is TaskEntityType {
  return typeof value === "string" && (ALL_TASK_ENTITY_TYPES as string[]).includes(value);
}

/** Forma pe care o da si o primeste components/ui/DateField.tsx: yyyy-mm-dd.
 *
 *  Forma si existenta zilei in calendar: 2026-02-31 nu trece. In adresa o data
 *  imposibila inseamna "fara filtru", ca orice valoare necunoscuta. */
export function isDayString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/* =======================================================================
   O SINGURA DEFINITIE A ZILEI, CLAUZA 6 A CARDULUI P3-131
   ======================================================================= */
//
// NOTELE CARDULUI SPUN CA ASTA ESTE PARTEA DE NIMERIT: "CLAUSE 6 IS THE ONE TO GET
// RIGHT. Two definitions of 'late' on one screen is a defect that looks like a data
// problem for weeks." Ce urmeaza este scris ca acel defect sa nu poata exista.
//
// O FUNCTIE, SI MARCAJUL DE INTARZIERE SE DEDUCE DIN GALEATA. `isTaskOverdue` este
// literal `taskBucket(...) === "restante"`, iar `taskGroup` cheama tot `taskBucket`.
// Acceptanta (d) cere ca MULTIMEA sarcinilor din Restante sa fie EGALA cu multimea
// celor care poarta marcajul, iar doua predicate care trebuie sa fie de acord pentru
// totdeauna este defectul pe care acest depozit l-a plata de mai multe ori: antetele
// lui lib/data/outbound-mode.ts si lib/data/outbound.ts il scriu amandoua. Deducerea
// le face incapabile sa nu fie de acord; un al doilea predicat le-ar face doar
// egale astazi.
//
// ZILELE SE COMPARA CA SIRURI, SI ASA TREBUIE SA RAMANA. Comentariul lui
// chisinauToday() din lib/data/format.ts este cel care conteaza si este purtator de
// sens: "2026-09-22" <= "2026-09-22" este exact comparatia pe care o face baza cu
// `(now() at time zone 'Europe/Chisinau')::date`, in timp ce `new Date("2026-09-22")`
// este miezul noptii UTC, adica ora 3 in Chisinau, si ar muta ziua pentru o parte din
// fiecare zi. NU SE "REPARA" INTR-O COMPARATIE DE Date. `due_date` este o coloana
// `date` din migratia 0068 si soseste in aceeasi forma `yyyy-mm-dd`.
//
// SINGURUL LOC IN CARE SE FACE ARITMETICA DE CALENDAR este marginea de duminica de
// mai jos, si acolo nu se compara nimic: se NUMARA zile intre doua date de calendar,
// plecand de la ziua Chisinauului deja aflata si citind inapoi tot parti de
// calendar. Niciun moment si niciun fus nu intra in socoteala, iar rezultatul se
// intoarce ca sir si se compara ca sir, ca tot restul.

/** Cele trei galeti, in ordinea in care ecranul le deseneaza. */
export const ALL_TASK_BUCKETS: TaskBucket[] = ["restante", "azi", "saptamana"];

/** Cele cinci capete de grup, in ordinea in care ecranul le deseneaza: cele trei
 *  galeti, apoi cele doua recipiente de afisare. Vezi TaskGroup. */
export const ALL_TASK_GROUPS: TaskGroup[] = [...ALL_TASK_BUCKETS, "altele", "fara_termen"];

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Ultima zi a saptamanii in care cade ziua primita, ca sir `yyyy-mm-dd`.
 *
 * SAPTAMANA SE TERMINA DUMINICA, fiindca lunea este prima zi a saptamanii in uzul
 * romanesc si moldovenesc, iar interfata este romaneasca. Duminica insasi este
 * ultima zi a propriei saptamani, nu prima zi a celei urmatoare.
 *
 * ARITMETICA PE ZILE DE CALENDAR SI NU PE MOMENTE. Se construieste miezul noptii
 * UTC din chiar cifrele zilei primite si se citesc inapoi numai parti UTC, deci
 * construirea si citirea se anuleaza una pe alta si niciun fus nu are cum sa mute
 * ziua. Asta NU este comparatia pe care comentariul lui chisinauToday() o interzice:
 * aceea era despre a COMPARA un `new Date(zi)` cu un moment, iar aici nu se compara
 * nimic si nu exista niciun moment. Rezultatul pleaca de aici ca sir si se compara
 * ca sir.
 */
export function endOfChisinauWeek(today: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  // O zi nerecunoscuta se intoarce neatinsa: atunci marginea este ziua insasi, deci
  // galeata "Această săptămână" se goleste in loc sa inghita toata lista.
  if (!parts) return today;

  const at = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])),
  );
  // getUTCDay: 0 este duminica, 1 este luni. Cate zile mai sunt pana duminica.
  const weekday = at.getUTCDay();
  at.setUTCDate(at.getUTCDate() + (weekday === 0 ? 0 : 7 - weekday));

  return `${at.getUTCFullYear()}-${twoDigits(at.getUTCMonth() + 1)}-${twoDigits(at.getUTCDate())}`;
}

/** Cat ii trebuie lui `taskBucket` ca sa raspunda: termenul si starea, nimic
 *  altceva. Scris ca forma si nu ca `Task` intreg, ca sa poata fi chemat si pe un
 *  rand pe jumatate citit si ca un test sa nu aiba de construit un `Task` complet. */
export type TaskDay = { dueDate: string | null; status: TaskStatus };

/**
 * In care din cele trei galeti cade sarcina, sau null cand in niciuna.
 *
 * ACEASTA ESTE SINGURA DEFINITIE A LUI "INTARZIAT" DIN TOT ECRANUL. Clauza 6:
 * "one definition, used three times".
 *
 * RESTANTE: termenul este INAINTEA zilei de azi SI starea nu este nici finalizata,
 * nici anulata. Excluderea de stare este formularea clauzei 5 cuvant cu cuvant,
 * "past its due date and not finished or cancelled", si sta AICI, in singura
 * functie, exact ca marcajul sa o poarte identic.
 *
 * AZI: termenul este chiar ziua de azi. O SARCINA CU TERMEN AZI NU ESTE
 * INTARZIATA, ceea ce cardul spune de doua ori si acceptanta (c) verifica pe
 * margine. Galeata Azi NU scoate starile finalizata si anulata, si nici asta nu
 * este o scapare: galeata lui Ivan este "ce are termen astazi", iar excluderea de
 * stare este scrisa de clauza 5 numai despre intarziere.
 *
 * ACEASTA SAPTAMANA: termenul este DUPA azi si cel mai tarziu duminica aceasta.
 *
 * FARA TERMEN: nicio galeata, si niciodata intarziata.
 */
export function taskBucket(task: TaskDay, today: string): TaskBucket | null {
  const due = task.dueDate ?? "";
  if (due === "") return null;

  if (due < today) {
    return task.status === "done" || task.status === "cancelled" ? null : "restante";
  }
  if (due === today) return "azi";
  return due <= endOfChisinauWeek(today) ? "saptamana" : null;
}

/**
 * Poarta sarcina marcajul de intarziere, clauza 5?
 *
 * DEDUS DIN GALEATA SI NU CALCULAT LANGA EA. Acesta este tot corpul functiei, si
 * atat trebuie sa fie: acceptanta (d) cere ca cele doua sa fie de acord pentru
 * totdeauna, si singurul fel in care doua raspunsuri nu pot sa se abata unul de
 * altul este sa fie acelasi raspuns.
 */
export function isTaskOverdue(task: TaskDay, today: string): boolean {
  return taskBucket(task, today) === "restante";
}

/**
 * Este sarcina deschisa, adica nici finalizata, nici anulata?
 *
 * ECRANUL AZI O FOLOSESTE PESTE GALEATA AZI, nu in locul ei. taskBucket() raspunde
 * singura la intrebarea "ce zi", iar galeata Azi nu scoate nicio stare (vezi mai sus),
 * fiindca galeata filei este "ce are termen astazi". Sectiunea de pe Azi este "ce de
 * facut acum", deci scoate cele doua stari inchise. Excluderea sta aici, o singura
 * data, ca pagina si orice alt cititor sa nu scrie a doua oara lista starilor.
 */
export function isTaskOpen(task: { status: TaskStatus }): boolean {
  return task.status !== "done" && task.status !== "cancelled";
}

/**
 * Sub ce cap de grup se deseneaza sarcina. Cele trei galeti, apoi cele doua
 * recipiente de afisare pentru restul, ca nicio sarcina sa nu existe si sa nu se
 * vada nicaieri. Vezi TaskGroup in lib/data/tasks-types.ts pentru de ce cele doua
 * recipiente NU sunt galeti.
 *
 * SI AICI GALEATA ESTE CEA CARE RASPUNDE PRIMA, deci nu exista nicio a doua
 * comparatie de zi: ce rămâne se desparte pe `dueDate === null`, care nu este o
 * intrebare despre zi, ci despre existenta termenului.
 */
export function taskGroup(task: TaskDay, today: string): TaskGroup {
  const bucket = taskBucket(task, today);
  if (bucket !== null) return bucket;
  return (task.dueDate ?? "") === "" ? "fara_termen" : "altele";
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
