"use client";

// Tabelul de sarcini: capetele de grup, randul unei sarcini si marcajul de
// intarziere. Cardul P3-132, goal G73, Item 4 al lui Ivan, partea a treia.
//
// DE CE EXISTA ACEST FISIER. Clauza 5 a cardului P3-132: "IT REUSES THE SARCINI
// TAB'S COMPONENTS AND ITS READ PATH. A second list implementation, a second row
// renderer or a second query would be a second set of rules about what a task looks
// like, drifting from the first." Pana la acest card randul si capul de grup erau
// scrise INAUNTRUL lui components/tasks/SarciniScreen.tsx si nu erau exportate, deci
// panoul de pe fisa unei inregistrari nu avea cum sa le foloseasca. Ele s-au MUTAT
// aici, neatinse, si acum fila si panoul le importa pe amandoua din acelasi loc.
// Copiate in panou ar fi fost chiar al doilea set de reguli pe care clauza il
// interzice.
//
// CE S-A MUTAT SI CE A RAMAS. Aici au venit: antetele coloanelor, tonurile cipurilor
// de stare si de urgenta, gruparea randurilor pe capete de grup, randul de cap de
// grup cu numaratoarea lui, si randul unei sarcini cu toate celulele si cu marcajul.
// In SarciniScreen au rămas lucrurile care sunt ALE FILEI si nu ale tabelului: cele
// cinci filtre, cele trei sortari, antetul paginii si starea goala a listei. NICIUN
// data-testid NU S-A SCHIMBAT, fiindca cele opt cazuri ale cardului P3-131 le citesc
// si ele trebuie sa treaca neatinse.
//
// O SINGURA DEFINITIE A ZILEI, SI EA NU ESTE AICI. Gruparea cheama taskGroup() si
// marcajul cheama isTaskOverdue(), amandoua din lib/data/tasks-shape.ts, si cea de a
// doua este literal `taskBucket(...) === "restante"`. Clauza 4 a cardului P3-132 cere
// ca fila si panoul sa fie de acord despre aceeasi sarcina, iar acceptanta (d) o
// verifica: faptul ca ele randeaza ACELASI component, care cheama ACEEASI functie,
// este ce le face incapabile sa nu fie de acord. Un al doilea fel de a afla ce este
// intarziat le-ar face doar egale astazi.
//
// ZIUA VINE DE SUS, O SINGURA DATA PE RANDARE, si nu se citeste in acest fisier: o
// randare de la 23:59:59 ar putea afla o zi pentru grupare si alta pentru marcaj.
// Pagina o afla prin chisinauToday() si o trimite in jos, pe amandoua drumurile.
//
// NU EXISTA NICIUN CONTROL DE STERGERE PE RAND SI NU POATE EXISTA UNUL: nici aici,
// nici intr-un meniu de rand, nici in spatele unei confirmari. Anularea este o
// schimbare de STARE catre `cancelled` si sta in panoul formularului, langa celelalte
// campuri pe care le schimba. Migratia 0068 nu da tabelei nici politica, nici drept
// de stergere, deci un buton de stergere ar fi un buton pe care baza il refuza.

import * as React from "react";
import { Button, Chip, Table, Td, Th, type ChipTone } from "@/components/ui/primitives";
import { RecordLink } from "@/components/ui/RecordLink";
import {
  PHONE_ACTIONS_CELL,
  PHONE_CELL,
  PHONE_ROW,
  PHONE_WIDE,
} from "@/components/ui/phone";
import { formatDate } from "@/lib/data/format";
import { ALL_TASK_GROUPS, isTaskOverdue, taskGroup } from "@/lib/data/tasks-shape";
import {
  TASK_ENTITY_TYPE_LABEL,
  TASK_GROUP_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskGroup,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/data/tasks-types";

/** Tonul cipului fiecarei stari. Culoarea sta LANGA cuvant si niciodata in locul
 *  lui, regula acestui depozit: cine nu deosebeste culorile citeste tot eticheta. */
const STATUS_TONE: Record<TaskStatus, ChipTone> = {
  todo: "neutral",
  in_progress: "info",
  done: "ok",
  cancelled: "warn",
};

/** Tonul cipului fiecarei urgente. Rosul este al marcajului de intarziere, nu al
 *  urgentei: o sarcina urgenta si la timp nu este o eroare. */
const PRIORITY_TONE: Record<TaskPriority, ChipTone> = {
  low: "neutral",
  medium: "info",
  high: "orange",
};

/** Cele sase antete ale clauzei 2 a cardului P3-131, in ordinea de pe ecran.
 *
 *  EXPORTATE, fiindca ele sunt acum ale tabelului si nu ale unui ecran, iar un test
 *  care vrea sa stie ce scrie in antet trebuie sa citeasca lista si nu o copie a ei:
 *  o copie scrisa de mana este ce cardul P3-116 a plata cu o rulare intreaga. */
export const TASK_HEADERS = [
  "Titlu",
  "Stare",
  "Urgență",
  "Termen",
  "Responsabil",
  "Înregistrare legată",
] as const;

/** Antetul coloanei pe care panoul de pe fisa unei inregistrari NU il deseneaza. */
const ENTITY_HEADER = TASK_HEADERS[5];

/**
 * Lista de sarcini, grupata, cu marcajul de intarziere pe fiecare rand.
 *
 * `showEntity` ESTE SINGURUL PARAMETRU DE FORMA, SI NU ESTE O A DOUA IMPLEMENTARE.
 * Pe fila /sarcini coloana "Înregistrare legată" este chiar munca clauzei 2 a
 * cardului P3-131: acolo randurile vin de la trei feluri de inregistrare amestecate,
 * deci coloana spune de care. In panoul de pe fisa unei inregistrari fiecare rand
 * poarta ACEEASI inregistrare, adica pe cea a paginii deschise, deci coloana ar scrie
 * acelasi cuvant pe fiecare rand si legatura ei ar duce la pagina pe care operatorul
 * se afla deja. Un singur boolean care ASCUNDE o coloana lasa un singur randator, o
 * singura definitie a zilei si un singur set de data-testid; o a doua copie a
 * randului ar fi fost exact ce clauza 5 numeste "a second set of rules about what a
 * task looks like".
 */
export function TaskTable({
  rows,
  today,
  canWrite,
  onEdit,
  showEntity = true,
}: {
  rows: Task[];
  /** Ziua calendaristica din Chisinau, yyyy-mm-dd, aflata o singura data de pagina
   *  prin chisinauToday(). Vezi antetul. */
  today: string;
  canWrite: boolean;
  onEdit: (taskId: string) => void;
  showEntity?: boolean;
}) {
  const headers = showEntity
    ? [...TASK_HEADERS]
    : TASK_HEADERS.filter((h) => h !== ENTITY_HEADER);

  // CAPUL DE GRUP AL FIECARUI RAND, O SINGURA DATA PER RAND. Ordinea randurilor
  // dinauntrul fiecarui grup este ordinea in care au sosit de la baza, adica
  // sortarea ceruta: un `filter` pastreaza ordinea.
  const grouped: { group: TaskGroup; rows: Task[] }[] = ALL_TASK_GROUPS.map((group) => ({
    group,
    rows: rows.filter((r) => taskGroup(r, today) === group),
  })).filter((g) => g.rows.length > 0);

  return (
    <Table>
      <thead>
        <tr>
          {headers.map((h) => (
            <Th key={h}>{h}</Th>
          ))}
          {canWrite ? <Th aria-label="Acțiuni" /> : null}
        </tr>
      </thead>
      <tbody>
        {grouped.map((g) => (
          <React.Fragment key={g.group}>
            {/* CAPUL DE GRUP. Cele trei galeti ale clauzei 6, apoi cele doua
                recipiente de afisare pentru restul listei, ca nicio sarcina sa
                nu existe si sa nu se vada nicaieri. Vezi TaskGroup in
                lib/data/tasks-types.ts. Numarul este langa cuvant, ca pe
                cipurile de etapa de pe Clienți. */}
            <tr data-testid="tasks-group-head" data-group={g.group}>
              <th
                scope="colgroup"
                colSpan={headers.length + (canWrite ? 1 : 0)}
                className="bg-rc-paper px-4 py-2 text-left text-[12.5px] font-bold text-rc-black border-b border-rc-line max-md:col-span-2"
              >
                <span data-testid="tasks-group-label">{TASK_GROUP_LABEL[g.group]}</span>
                <span
                  className="ml-2 font-semibold tabular-nums text-rc-muted"
                  data-testid="tasks-group-count"
                >
                  {g.rows.length}
                </span>
              </th>
            </tr>

            {g.rows.map((task) => {
              // MARCAJUL SE DEDUCE DIN GALEATA, nu se calculeaza langa ea.
              const overdue = isTaskOverdue(task, today);
              const href =
                task.entityType === null || task.entityId === null
                  ? null
                  : task.entityType === "project"
                    ? `/proiecte/${task.entityId}`
                    : `/clienti/${task.entityId}`;

              return (
                <tr
                  key={task.id}
                  data-testid="task-row"
                  data-id={task.id}
                  data-group={g.group}
                  data-overdue={overdue ? "true" : "false"}
                  className={PHONE_ROW}
                >
                  {/* TITLUL ESTE TEXT SI NU UN CONTROL, deliberat: modificarea
                      are butonul ei pe rand. Un titlu apasabil ar fi facut din
                      fiecare titlu de sarcina numele unui control, iar un titlu
                      scris de operator ar fi devenit text de interfata. */}
                  <Td data-label={TASK_HEADERS[0]} className={PHONE_WIDE}>
                    <span className="font-semibold" data-testid="task-title">
                      {task.title}
                    </span>
                  </Td>

                  <Td data-label={TASK_HEADERS[1]} className={PHONE_CELL}>
                    <Chip tone={STATUS_TONE[task.status]}>
                      <span data-testid="task-status">{TASK_STATUS_LABEL[task.status]}</span>
                    </Chip>
                  </Td>

                  <Td data-label={TASK_HEADERS[2]} className={PHONE_CELL}>
                    <Chip tone={PRIORITY_TONE[task.priority]}>
                      <span data-testid="task-priority">
                        {TASK_PRIORITY_LABEL[task.priority]}
                      </span>
                    </Chip>
                  </Td>

                  {/* CLAUZA 5 A CARDULUI P3-131: INTARZIEREA ESTE MARCATA VIZIBIL
                      PE RAND, langa termenul despre care vorbeste. Cuvantul este
                      langa cip, nu inlocuit de o culoare. Clauza 4 a cardului
                      P3-132 cere ca acelasi rand sa poarte acelasi marcaj si in
                      panou, si il poarta fiindca este acelasi randator. */}
                  <Td data-label={TASK_HEADERS[3]} className={PHONE_CELL}>
                    <span className="inline-flex items-center gap-2">
                      <span className="tabular-nums" data-testid="task-due-date">
                        {task.dueDate === null ? "Fără termen" : formatDate(task.dueDate)}
                      </span>
                      {overdue ? (
                        <Chip tone="danger">
                          <span data-testid="task-overdue">Întârziată</span>
                        </Chip>
                      ) : null}
                    </span>
                  </Td>

                  <Td data-label={TASK_HEADERS[4]} className={PHONE_CELL}>
                    <span data-testid="task-assignee">{task.assigneeName ?? "Nealocată"}</span>
                  </Td>

                  {/* CLAUZA 2 A CARDULUI P3-131: INREGISTRAREA LEGATA ESTE O
                      LEGATURA catre acel lead, client sau proiect. Trei pagini,
                      DOUA TOKENURI: un lead este un rand din public.clients care
                      poarta o etapa, deci fisa lui este /clienti/<id>, exact
                      randul pe care sarcina il poarta. Motivul intreg este scris
                      la TaskEntityType in lib/data/tasks-types.ts (randul de mai
                      sus nu se rupe anume: o cale singura pe un rand este ce
                      devine un marcaj de conflict caruia i s-au sters semnele, si
                      check:conflict-residue o refuza, pe bune).
                      RecordLink, si nu un <Link> scris aici: o destinatie absenta
                      nu este niciodata o legatura moarta, ci text cu o explicatie
                      romaneasca. */}
                  {showEntity ? (
                    <Td data-label={ENTITY_HEADER} className={PHONE_CELL}>
                      <RecordLink href={href} fallback="Fără înregistrare" testId="task-entity">
                        {task.entityType === null ? "" : TASK_ENTITY_TYPE_LABEL[task.entityType]}
                      </RecordLink>
                    </Td>
                  ) : null}

                  {canWrite ? (
                    // O SINGURA ACTIUNE PE RAND, SI EA DESCHIDE PANOUL. Nu
                    // exista meniu de rand si nu exista nicio stergere: nici
                    // aici, nici in panou, nici in spatele unei confirmari.
                    // Anularea este o schimbare de stare si sta in panou, langa
                    // celelalte campuri pe care le schimba.
                    <Td data-label="Acțiuni" className={PHONE_ACTIONS_CELL}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onEdit(task.id)}
                        data-testid="task-edit"
                      >
                        Modifică
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </React.Fragment>
        ))}
      </tbody>
    </Table>
  );
}
