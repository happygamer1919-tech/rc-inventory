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
// TABELUL S-A MUTAT IN components/tasks/TaskTable.tsx, CARDUL P3-132. Antetele,
// capetele de grup, randul si marcajul erau scrise aici si nu erau exportate, deci
// panoul de pe fisa unei inregistrari nu avea cum sa le foloseasca, iar clauza 5 a
// acelui card interzice un al doilea randator. Ele s-au mutat NEATINSE, cu fiecare
// data-testid neschimbat, si acum fila si panoul le importa din acelasi loc. Cele
// trei propozitii de mai sus rămân adevarate: ele descriu ce face acum TaskTable, si
// gruparea de care vorbesc este chiar acolo.
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
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import { PHONE_CONTROL, PHONE_TABLE } from "@/components/ui/phone";
import { plural } from "@/lib/data/format";
import {
  ALL_TASK_ENTITY_TYPES,
  ALL_TASK_PRIORITIES,
  ALL_TASK_STATUSES,
  taskLinkKey,
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
  TASK_PRIORITY_LABEL,
  TASK_SORT_DIRECTION_LABEL,
  TASK_SORT_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskListQuery,
} from "@/lib/data/tasks-types";
import { TaskForm, type TaskAssignee, type TaskLinkChoice } from "./TaskForm";
import { TaskTable } from "./TaskTable";

export function SarciniScreen({
  rows,
  query,
  assignees,
  today,
  canWrite,
  clients = [],
  projects = [],
  closedLinks = {},
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
  /** Inregistrarile legate care nu sunt in liste (proiect inchis, client inactiv),
   *  dupa taskLinkKey(fel, id). Se adauga numai la modificarea sarcinii lor. */
  closedLinks?: Record<string, TaskLinkChoice>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [creating, setCreating] = React.useState(false);
  // P3-133: o legatura de pe Azi (`?sarcina=<id>`) deschide direct sarcina, in acelasi
  // panou ca butonul Modifică. Un id care nu este pe lista nu deschide nimic.
  const [editingId, setEditingId] = React.useState<string | null>(() => {
    const wanted = params.get("sarcina");
    return wanted !== null && rows.some((r) => r.id === wanted) ? wanted : null;
  });
  const editing = rows.find((r) => r.id === editingId);

  React.useEffect(() => {
    // Drop assigneeId if it doesn't match any active profile
    const assigneeId = params.get("responsabil");
    if (
      assigneeId &&
      !assignees.some((a) => a.id === assigneeId)
    ) {
      const next = new URLSearchParams(params.toString());
      next.delete("responsabil");
      router.replace(`${pathname}?${next.toString()}`);
    }
  }, [assignees, params, pathname, router]);

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function closeForm() {
    const next = new URLSearchParams(params.toString());
    next.delete("sarcina");
    router.replace(`${pathname}?${next.toString()}`);
  }

  const filtered = taskFilterActive(query);

  // UN RESPONSABIL DEZACTIVAT RAMANE O OPTIUNE CAT TIMP ESTE FILTRUL PUS, altfel
  // selectorul ar arata "Toți responsabilii" pe o lista care este filtrata pe el.
  const assigneeOptions =
    query.assigneeId !== "" && !assignees.some((a) => a.id === query.assigneeId)
      ? [...assignees, { id: query.assigneeId, fullName: "Responsabil inactiv" }]
      : assignees;

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
            completeOnly
            testId="tasks-due-from"
          />
          <DateField
            value={query.dueTo}
            onChange={(value) => push({ [TASK_PARAM.dueTo]: value })}
            completeOnly
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
          // ACELASI TABEL CA AL PANOULUI DE PE FISA UNEI INREGISTRARI, cardul
          // P3-132 clauza 5: un singur randator, un singur set de data-testid si o
          // singura definitie a zilei. Coloana Înregistrare legată se deseneaza AICI
          // fiindca randurile acestei file vin de la inregistrari amestecate.
          <TaskTable
            rows={rows}
            today={today}
            canWrite={canWrite}
            onEdit={setEditingId}
          />
        )}
      </Card>

      {creating ? (
        <TaskForm
          assignees={assignees}
          clients={clients}
          projects={projects}
          onClose={() => {
            setCreating(false);
            closeForm();
          }}
        />
      ) : null}
      {editing ? (
        <TaskForm
          task={editing}
          assignees={assignees}
          clients={clients}
          projects={projects}
          currentLink={
            editing.entityType && editing.entityId
              ? closedLinks[taskLinkKey(editing.entityType, editing.entityId)]
              : undefined
          }
          onClose={() => {
            setEditingId(null);
            closeForm();
          }}
        />
      ) : null}
    </>
  );
}
