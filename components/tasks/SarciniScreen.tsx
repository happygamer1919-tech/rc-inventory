"use client";

// Sarcini, ecranul de lista. Cardul P3-131, goal G73, Item 4 al lui Ivan, partea a
// doua. Fila nouă a secțiunii CRM, clauza 1, la care se ajunge prin al patrulea card
// al ecranului /crm si prin CRM_SCREENS din lib/nav.ts.
//
// SASE COLOANE SI O CELULA DE ACTIUNI, exact cele pe care le enumera clauza 2:
// Titlu, Stare, Urgență, Termen, Responsabil si Înregistrare legată, iar
// inregistrarea legata este o LEGATURA catre acel lead, client sau proiect. Doctrina
// de densitate a acestui depozit cere cel mai mic set de coloane care lasa un om sa
// aleaga un rand, si cardul numeste chiar sase; descrierea sarcinii este detaliu si
// sta in panou.
//
// FIECARE FILTRU SI SORTAREA SUNT IN ADRESA PAGINII, nu in starea componentului,
// deci o lista filtrata se poate trimite cuiva ca legatura si butonul de inapoi o
// reface intocmai. Constatarea F7, cardul P3-96, a reparat chiar divergenta dintre o
// stare locala si adresa, iar motivul intreg este scris in antetul lui
// lib/data/tasks-query.ts.
//
// FILTRAREA SI SORTAREA SE FAC PE SERVER, in lib/data/tasks.ts. Componentul acesta
// NU filtreaza si NU sorteaza nimic in memorie: primeste randurile care i se cuvin,
// in ordinea ceruta, si le deseneaza.
//
// SINGURUL LUCRU PE CARE IL CALCULEAZA ESTE CAPUL DE GRUP AL FIECARUI RAND, prin
// taskGroup() din lib/data/tasks-shape.ts, care cheama taskBucket(), care este
// SINGURA DEFINITIE A ZILEI din tot ecranul. Marcajul de intarziere al clauzei 5 se
// DEDUCE din aceeasi functie, prin isTaskOverdue(), care este literal
// `taskBucket(...) === "restante"`. Acceptanta (d) cere ca multimea celor din
// Restante sa fie egala cu multimea celor marcate, iar notele cardului spun de ce:
// "Two definitions of 'late' on one screen is a defect that looks like a data
// problem for weeks."
//
// ZIUA VINE DE LA PAGINA, O SINGURA DATA PE RANDARE. Citita aici, o randare de la
// 23:59:59 ar putea afla o zi pentru grupare si alta pentru marcaj.
//
// GALETILE SUNT O GRUPARE A ACELEIASI LISTE, clauza 6, si nu trei interogari: lista
// soseste o singura data si se desparte pe capete de grup. Sortarea ordoneaza
// RANDURILE DIN FIECARE GRUP, fiindca o lista grupata are o ordine inauntrul
// grupurilor si nu peste ele.
//
// NU EXISTA NICIUN CONTROL DE STERGERE PE ACEST ECRAN, clauza 7 si propozitia
// proprietarului: nici pe rand, nici intr-un meniu de rand, nici in panou, nici in
// spatele unei confirmari. "Anulează sarcina", din panou, scrie starea `cancelled` si
// sarcina rămâne pe inregistrare. Butonul "Șterge filtrele" de mai jos sterge un
// FILTRU si nu o sarcina, si este controlul pe care il are fiecare lista a acestei
// aplicatii.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  type ChipTone,
} from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import { RecordLink } from "@/components/ui/RecordLink";
import {
  PHONE_ACTIONS_CELL,
  PHONE_CELL,
  PHONE_CONTROL,
  PHONE_ROW,
  PHONE_TABLE,
  PHONE_WIDE,
} from "@/components/ui/phone";
import { formatDate, plural } from "@/lib/data/format";
import {
  ALL_TASK_ENTITY_TYPES,
  ALL_TASK_GROUPS,
  ALL_TASK_PRIORITIES,
  ALL_TASK_STATUSES,
  isTaskOverdue,
  taskGroup,
} from "@/lib/data/tasks-shape";
import {
  ALL_TASK_SORT_DIRECTIONS,
  ALL_TASK_SORT_FIELDS,
  TASK_FILTER_CLEARED,
  TASK_PARAM,
  taskFilterActive,
} from "@/lib/data/tasks-query";
import {
  TASK_ENTITY_TYPE_LABEL,
  TASK_GROUP_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_SORT_DIRECTION_LABEL,
  TASK_SORT_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskGroup,
  type TaskPriority,
  type TaskStatus,
  type TaskListQuery,
} from "@/lib/data/tasks-types";
import { TaskForm, type TaskAssignee, type TaskLinkChoice } from "./TaskForm";

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

/** Numarul de coloane ale tabelului, pentru randul de cap de grup. Scris ca lungime
 *  a listei de antete si nu ca cifra, ca un antet adaugat mai tarziu sa nu lase
 *  randul de grup mai scurt decat tabelul. */
const HEADERS = [
  "Titlu",
  "Stare",
  "Urgență",
  "Termen",
  "Responsabil",
  "Înregistrare legată",
] as const;

export function SarciniScreen({
  rows,
  query,
  assignees,
  today,
  canWrite,
  clients = [],
  projects = [],
}: {
  rows: Task[];
  query: TaskListQuery;
  assignees: TaskAssignee[];
  /** Ziua calendaristica din Chisinau, yyyy-mm-dd, aflata o singura data de pagina
   *  prin chisinauToday(). Vezi antetul. */
  today: string;
  canWrite: boolean;
  clients?: TaskLinkChoice[];
  projects?: TaskLinkChoice[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const editing = rows.find((r) => r.id === editingId);

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  const filtered = taskFilterActive(query);

  // UN RESPONSABIL DEZACTIVAT RAMANE O OPTIUNE CAT TIMP ESTE FILTRUL PUS, altfel
  // selectorul ar arata "Toți responsabilii" pe o lista care este filtrata pe el.
  const assigneeOptions =
    query.assigneeId !== "" && !assignees.some((a) => a.id === query.assigneeId)
      ? [...assignees, { id: query.assigneeId, fullName: "Responsabil inactiv" }]
      : assignees;

  // CAPUL DE GRUP AL FIECARUI RAND, O SINGURA DATA PER RAND. Ordinea randurilor
  // dinauntrul fiecarui grup este ordinea in care au sosit de la baza, adica
  // sortarea ceruta: un `filter` pastreaza ordinea.
  const grouped: { group: TaskGroup; rows: Task[] }[] = ALL_TASK_GROUPS.map((group) => ({
    group,
    rows: rows.filter((r) => taskGroup(r, today) === group),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageHeader
        title="Sarcini"
        lead="Treburile de făcut, grupate în restante, azi și această săptămână. O sarcină anulată rămâne pe înregistrare."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating(true)} data-testid="task-new">
              Sarcină nouă
            </Button>
          ) : null
        }
      />

      <Card className={PHONE_TABLE}>
        <CardHeader title="Listă" hint={plural(rows.length, "sarcină", "sarcini")} />

        {/* P3-52. Grila explicita, ca pe Clienți si pe Facturi: Input, Select si
            DateField poarta toate w-full, deci intr-un rand flex-wrap fiecare cerea
            tot randul. Coloana auto de la final tine Șterge filtrele, ca selectoarele
            sa nu treaca dedesubt cand butonul apare. Sub 768px raman una sub alta.
            CELE CINCI FILTRE ALE CLAUZEI 3 SI NICI UNUL AL SASELEA: stare, urgenta,
            responsabil, interval de termen si felul inregistrarii legate. Nu exista
            casuta de cautare si nu se adauga una: ar fi al sasele filtru, iar cardul
            spune "Do not add a sixth filter because it seemed useful; that is a new
            card." */}
        <div
          className="p-5 grid items-center gap-3 max-md:grid-cols-1 grid-cols-[1fr_1fr_1.2fr_1fr_1fr_1fr_auto]"
          data-testid="tasks-filters"
        >
          <Select
            value={query.status}
            onChange={(e) => push({ [TASK_PARAM.status]: e.target.value })}
            aria-label="Stare"
            data-testid="tasks-status"
            className={PHONE_CONTROL}
          >
            <option value="">Toate stările</option>
            {ALL_TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>

          <Select
            value={query.priority}
            onChange={(e) => push({ [TASK_PARAM.priority]: e.target.value })}
            aria-label="Urgență"
            data-testid="tasks-priority"
            className={PHONE_CONTROL}
          >
            <option value="">Toate urgențele</option>
            {ALL_TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>

          {/* DEVIATIA D4: SE FILTREAZA PE PROFIL. Nu exista niciun model de
              organizatie in aceasta platforma si niciunul nu se inventeaza. */}
          <Select
            value={query.assigneeId}
            onChange={(e) => push({ [TASK_PARAM.assignee]: e.target.value })}
            aria-label="Responsabil"
            data-testid="tasks-assignee"
            className={PHONE_CONTROL}
          >
            <option value="">Toți responsabilii</option>
            {assigneeOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </Select>

          {/* INTERVALUL DE TERMEN ESTE DOUA CASUTE zz.ll.aaaa, cele standard ale
              cardului P3-49 si ale constatarii F4. NICIUN AL DOILEA FEL DE CASUTA DE
              DATA pe acest ecran, si de aceea nici aici nu se scrie una de mana. */}
          <DateField
            value={query.dueFrom}
            onChange={(value) => push({ [TASK_PARAM.dueFrom]: value })}
            testId="tasks-due-from"
          />
          <DateField
            value={query.dueTo}
            onChange={(value) => push({ [TASK_PARAM.dueTo]: value })}
            testId="tasks-due-to"
          />

          <Select
            value={query.entityType}
            onChange={(e) => push({ [TASK_PARAM.entityType]: e.target.value })}
            aria-label="Fel înregistrare"
            data-testid="tasks-entity-type"
            className={PHONE_CONTROL}
          >
            <option value="">Toate felurile</option>
            {ALL_TASK_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TASK_ENTITY_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>

          {filtered ? (
            // STERGE EXACT CELE CINCI CAMPURI PE CARE `taskFilterActive` LE CITESTE,
            // si nici unul in plus: `router.push(pathname)` ar arunca si sortarea,
            // deci operatorul care voia sa scoata un filtru ar fi primit si alta
            // ordine. Aceea este constatarea F6, reparata de cardul P3-96 pe /clienti.
            <Button
              variant="secondary"
              onClick={() => push(TASK_FILTER_CLEARED)}
              data-testid="tasks-clear"
            >
              Șterge filtrele
            </Button>
          ) : null}
        </div>

        {/* CELE TREI SORTARI ALE CLAUZEI 4 SI INCOTRO, pe un rand al lor si nu intre
            filtre: o sortare nu ascunde niciun rand, deci nu intra nici in socoteala
            lui Șterge filtrele. Acceptanta (b) cere fiecare sortare in amandoua
            directiile, deci directia este un control si nu o presupunere. */}
        <div
          className="px-5 pb-5 grid items-center gap-3 max-md:grid-cols-1 grid-cols-[1fr_1fr_3fr]"
          data-testid="tasks-sort-row"
        >
          <Select
            value={query.sort}
            onChange={(e) => push({ [TASK_PARAM.sort]: e.target.value })}
            aria-label="Sortare"
            data-testid="tasks-sort"
            className={PHONE_CONTROL}
          >
            {ALL_TASK_SORT_FIELDS.map((s) => (
              <option key={s} value={s}>
                {TASK_SORT_LABEL[s]}
              </option>
            ))}
          </Select>

          <Select
            value={query.direction}
            onChange={(e) => push({ [TASK_PARAM.direction]: e.target.value })}
            aria-label="Ordine"
            data-testid="tasks-direction"
            className={PHONE_CONTROL}
          >
            {ALL_TASK_SORT_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {TASK_SORT_DIRECTION_LABEL[d]}
              </option>
            ))}
          </Select>

          <span />
        </div>

        {rows.length === 0 ? (
          // GOLUL ESTE O PROPOZITIE SI NU O ZONA ALBA, ca peste tot in aceasta
          // aplicatie: o zona goala se citeste ca ceva stricat, nu ca ceva terminat.
          <EmptyState
            title={filtered ? "Nicio sarcină pentru filtrele alese" : "Nicio sarcină încă"}
            hint={
              filtered
                ? "Schimbă filtrele sau șterge-le."
                : canWrite
                  ? "Prima sarcină se adaugă din butonul de sus."
                  : "Sarcinile apar aici imediat ce cineva scrie una."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                {HEADERS.map((h) => (
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
                      colSpan={HEADERS.length + (canWrite ? 1 : 0)}
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
                        <Td data-label={HEADERS[0]} className={PHONE_WIDE}>
                          <span className="font-semibold" data-testid="task-title">
                            {task.title}
                          </span>
                        </Td>

                        <Td data-label={HEADERS[1]} className={PHONE_CELL}>
                          <Chip tone={STATUS_TONE[task.status]}>
                            <span data-testid="task-status">{TASK_STATUS_LABEL[task.status]}</span>
                          </Chip>
                        </Td>

                        <Td data-label={HEADERS[2]} className={PHONE_CELL}>
                          <Chip tone={PRIORITY_TONE[task.priority]}>
                            <span data-testid="task-priority">
                              {TASK_PRIORITY_LABEL[task.priority]}
                            </span>
                          </Chip>
                        </Td>

                        {/* CLAUZA 5: INTARZIEREA ESTE MARCATA VIZIBIL PE RAND, langa
                            termenul despre care vorbeste. Cuvantul este langa cip, nu
                            inlocuit de o culoare. */}
                        <Td data-label={HEADERS[3]} className={PHONE_CELL}>
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

                        <Td data-label={HEADERS[4]} className={PHONE_CELL}>
                          <span data-testid="task-assignee">
                            {task.assigneeName ?? "Nealocată"}
                          </span>
                        </Td>

                        {/* CLAUZA 2: INREGISTRAREA LEGATA ESTE O LEGATURA catre acel
                            lead, client sau proiect. Trei pagini, DOUA TOKENURI: un
                            lead este un rand din public.clients care poarta o etapa,
                            deci fisa lui este /clienti/<id>, exact randul pe care
                            sarcina il poarta. Motivul intreg este scris la
                            TaskEntityType in lib/data/tasks-types.ts (randul de mai
                            sus nu se rupe anume: o cale singura pe un rand este ce
                            devine un marcaj de conflict caruia i s-au sters semnele,
                            si check:conflict-residue o refuza, pe bune).
                            RecordLink, si nu un <Link> scris aici: o destinatie
                            absenta nu este niciodata o legatura moarta, ci text cu o
                            explicatie romaneasca. */}
                        <Td data-label={HEADERS[5]} className={PHONE_CELL}>
                          <RecordLink
                            href={href}
                            fallback="Fără înregistrare"
                            testId="task-entity"
                          >
                            {task.entityType === null
                              ? ""
                              : TASK_ENTITY_TYPE_LABEL[task.entityType]}
                          </RecordLink>
                        </Td>

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
                              onClick={() => setEditingId(task.id)}
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
        )}
      </Card>

      {creating ? (
        <TaskForm
          assignees={assignees}
          clients={clients}
          projects={projects}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TaskForm
          task={editing}
          assignees={assignees}
          clients={clients}
          projects={projects}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </>
  );
}
