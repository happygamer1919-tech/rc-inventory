// Sectiunea de sarcini a ecranului Azi. Cardul P3-133, goal G73, Item 4 al lui Ivan,
// partea a patra.
//
// DOUA SECTIUNI, NICIODATA O LISTA AMESTECATA. Lista "De sunat" este despre cine
// trebuie sunat, o promisiune facuta unui client; aceasta este despre ce trebuie
// facut, o treaba de pe o tabla. Fiecare are cardul ei si titlul ei, ca operatorul sa
// poata deosebi un rand de celalalt. Lista de sunat nu se atinge: nu primeste, nu
// pierde si nu citeste altfel niciun rand din cauza acestei sectiuni.
//
// RANDURILE VIN GATA FILTRATE DE PAGINA (azi si deschise, prin taskBucket si
// isTaskOpen din lib/data/tasks-shape.ts), asa ca nicio zi nu se calculeaza aici.
// Sectiunea nu intreaba nimic baza si nu scrie nimic.

import Link from "next/link";
import {
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Table,
  Td,
  Th,
  type ChipTone,
} from "@/components/ui/primitives";
import { RecordLink } from "@/components/ui/RecordLink";
import { assigneeLabel } from "@/lib/data/tasks-map";
import { PHONE_CELL, PHONE_ROW, PHONE_TABLE, PHONE_WIDE } from "@/components/ui/phone";
import {
  TASK_ENTITY_TYPE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/data/tasks-types";

const STATUS_TONE: Record<TaskStatus, ChipTone> = {
  todo: "neutral",
  in_progress: "info",
  done: "ok",
  cancelled: "warn",
};

const PRIORITY_TONE: Record<TaskPriority, ChipTone> = {
  low: "neutral",
  medium: "info",
  high: "orange",
};

export function AziTasksSection({ tasks }: { tasks: Task[] }) {
  return (
    <section className="mt-6" data-testid="azi-tasks" aria-label="Sarcini scadente azi">
      <Card className={PHONE_TABLE}>
        <CardHeader
          title="Sarcini scadente azi"
          hint={tasks.length === 0 ? undefined : `${tasks.length} deschise, cu termenul azi`}
        />

        {tasks.length === 0 ? (
          <div data-testid="azi-tasks-empty">
            <EmptyState title="Nicio sarcină scadentă azi." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Titlu</Th>
                <Th>Stare</Th>
                <Th>Urgență</Th>
                <Th>Responsabil</Th>
                <Th>Înregistrare legată</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const href =
                  t.entityType === null || t.entityId === null
                    ? null
                    : t.entityType === "project"
                      ? `/proiecte/${t.entityId}`
                      : `/clienti/${t.entityId}`;
                return (
                  <tr key={t.id} data-testid="azi-task-row" data-id={t.id} className={PHONE_ROW}>
                    <Td data-label="Titlu" className={PHONE_WIDE}>
                      <Link
                        href={`/sarcini?sarcina=${t.id}`}
                        className="font-semibold text-rc-black hover:underline"
                        data-testid="azi-task-open"
                      >
                        {t.title}
                      </Link>
                    </Td>
                    <Td data-label="Stare" className={PHONE_CELL}>
                      <Chip tone={STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Chip>
                    </Td>
                    <Td data-label="Urgență" className={PHONE_CELL}>
                      <Chip tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Chip>
                    </Td>
                    <Td data-label="Responsabil" className={PHONE_CELL}>
                      {assigneeLabel(t)}
                    </Td>
                    <Td data-label="Înregistrare legată" className={PHONE_CELL}>
                      <RecordLink href={href} fallback="Fără înregistrare" testId="azi-task-entity">
                        {t.entityType === null ? "" : TASK_ENTITY_TYPE_LABEL[t.entityType]}
                      </RecordLink>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </section>
  );
}
