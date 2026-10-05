"use client";

// Formularul unei sarcini, cardul P3-131 clauza 7: o sarcina se CREEAZA, se
// MODIFICA si se ANULEAZA de pe acest ecran.
//
// ACELASI PANOU LATERAL CA LA CLIENT SI LA PRODUS, deliberat, din motivul scris in
// antetul lui components/clients/ClientForm.tsx: "un al doilea fel de formular ar fi
// o a doua convenție de invatat, pentru acelasi lucru".
//
// NU EXISTA NICIUN CONTROL DE STERGERE IN ACEST FISIER SI NU POATE EXISTA UNUL.
// Clauza 7 si propozitia proprietarului: anularea este o schimbare de STARE catre
// `cancelled`, iar sarcina rămâne pe inregistrare. Migratia 0068 nu da tabelei nici
// politica, nici drept de stergere, si lib/data/tasks-actions.ts nu are nicio
// functie de stergere, deci un buton de stergere nu ar fi doar nedorit: ar fi un
// buton pe care baza il refuza, care este chiar defectul numit de cardul P3-06.
//
// "Anulează sarcina" SI "Renunță" SUNT DOUA LUCRURI DIFERITE, si de aceea nu poarta
// acelasi cuvant. "Anulează sarcina" scrie starea `cancelled` pe rand si este munca
// pe care o cere clauza 7. "Renunță" inchide panoul fara sa scrie nimic, si este
// cuvantul pe care il folosesc deja celelalte formulare ale acestei aplicatii.
//
// ZIUA SE SCRIE IN SINGURA CASUTA zz.ll.aaaa, components/ui/DateField.tsx, pe care
// cardul P3-49 si constatarea F4 au facut-o standard. NICIUN AL DOILEA FEL DE CASUTA
// DE DATA, si asta este regula si nu o alegere a acestui ecran.
//
// `fixedEntity` ESTE CLAUZA 2 A CARDULUI P3-132 SI NU UN AL DOILEA FORMULAR. Panoul
// de pe fisa unei inregistrari deschide ACEST formular, iar cuvintele cardului sunt:
// "A TASK IS CREATED FROM THE PANEL, already attached to the record whose page it is.
// That is the whole convenience: the operator is looking at the customer, so the task
// they are about to write belongs to that customer and they should not have to say
// so." Cand parametrul soseste, cele doua selectoare ale inregistrarii legate NU SE
// DESENEAZA si in locul lor sta numele inregistrarii, ca text: asa operatorul nu o
// alege, nu o poate schimba si nu o poate desface din panoul fisei ei. Cand
// parametrul lipseste, ceea ce este cazul filei /sarcini, acest fisier se poarta exact
// ca inainte, si cele opt cazuri ale cardului P3-131 il citesc asa.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { DateField, useInvalidDates } from "@/components/ui/DateField";
import { PHONE_CLOSE, PHONE_SHEET, PHONE_STACK } from "@/components/ui/phone";
import { createTask, updateTask } from "@/lib/data/tasks-actions";
import {
  ALL_TASK_ENTITY_TYPES,
  ALL_TASK_PRIORITIES,
  ALL_TASK_STATUSES,
  cancelTaskPatch,
  changedTaskFields,
  linkChoicesWithCurrent,
  type TaskFormValues,
} from "@/lib/data/tasks-shape";
import {
  TASK_ENTITY_TYPE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  type Task,
  type TaskEntityType,
  type TaskPatch,
} from "@/lib/data/tasks-types";

export type TaskAssignee = { id: string; fullName: string };
export type TaskLinkChoice = { id: string; label: string; hint?: string };

/** Inregistrarea de care sarcina este legata din start, fara ca operatorul sa o
 *  aleaga: cardul P3-132 clauza 2. `label` este numele ei pe ecran, adica denumirea
 *  clientului sau a proiectului, si este DATA si nu text de interfata. */
export type TaskFixedEntity = { type: TaskEntityType; id: string; label: string };

export function TaskForm({
  task,
  assignees,
  clients = [],
  projects = [],
  fixedEntity,
  currentLink,
  onClose,
}: {
  /** Lipsa inseamna o sarcina nouă. */
  task?: Task;
  assignees: TaskAssignee[];
  /** Clientii activi, LEADURILE INCLUSE: un lead este un rand din public.clients
   *  care poarta o etapa, deci se leaga pe tokenul `client`.
   *
   *  OPTIONALE DE LA CARDUL P3-132: cand `fixedEntity` soseste, cele doua selectoare
   *  nu se deseneaza, deci cele doua liste nu au pe ce sa fie desenate si pagina care
   *  deschide panoul nu are de ce sa le citeasca. */
  clients?: TaskLinkChoice[];
  projects?: TaskLinkChoice[];
  /** Cand soseste, inregistrarea legata este ACEASTA si nu se alege. Vezi antetul. */
  fixedEntity?: TaskFixedEntity;
  /** Inregistrarea curenta a sarcinii cand nu este in liste (proiect inchis, client
   *  inactiv): se adauga la lista, ca sa i se vada numele. Sarcinile noi nu o au. */
  currentLink?: TaskLinkChoice;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = task !== undefined;

  // VALORILE CU CARE S-A DESCHIS FORMULARUL, tinute neschimbate cat traieste panoul:
  // la salvare se trimite numai ce difera de ele, cardul P3-157. Starea de mai jos
  // pleaca din ACELEASI valori, deci un camp neatins este egal cu ele prin constructie.
  //
  // PERECHEA PLEACA DE LA INREGISTRAREA FIXATA CAND EXISTA UNA, si pentru o sarcina
  // care exista pleaca de la ce poarta randul: cele doua sunt aceeasi inregistrare
  // cand panoul este cel al fisei ei, fiindca panoul citeste numai sarcinile legate de
  // acea inregistrare. Randul are prioritate, ca o modificare sa nu poata rescrie in
  // tacere o legatura care exista deja.
  const [loaded] = React.useState<TaskFormValues>(() => ({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    dueDate: task?.dueDate ?? "",
    assigneeId: task?.assigneeId ?? "",
    entityType: task?.entityType ?? fixedEntity?.type ?? "",
    entityId: task?.entityId ?? fixedEntity?.id ?? "",
  }));

  const [title, setTitle] = React.useState(loaded.title);
  const [description, setDescription] = React.useState(loaded.description);
  const [status, setStatus] = React.useState<string>(loaded.status);
  const [priority, setPriority] = React.useState<string>(loaded.priority);
  const [dueDate, setDueDate] = React.useState(loaded.dueDate);
  const [assigneeId, setAssigneeId] = React.useState(loaded.assigneeId);
  const [entityType, setEntityType] = React.useState<string>(loaded.entityType);
  const [entityId, setEntityId] = React.useState(loaded.entityId);

  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  // P3-92, constatarea F4. Cat timp casuta de data arata mesajul rosu, Salvează este
  // oprit: altfel o zi tastata pe jumatate pleaca spre server ca sir gol si STERGE
  // termenul stocat fara niciun mesaj.
  const { anyInvalid: dateInvalid, mark } = useInvalidDates();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // UN RESPONSABIL DEZACTIVAT RAMANE RESPONSABILUL SARCINII, chiar daca nu mai este
  // in lista: optiunea lui se pastreaza, altfel selectorul ar arata Nealocat pentru o
  // sarcina care are responsabil, iar o salvare fara legatura cu el l-ar scoate in
  // tacere. Exact ce face ClientForm cu responsabilul clientului.
  const assigneeOptions =
    task?.assigneeId && !assignees.some((a) => a.id === task.assigneeId)
      ? [
          ...assignees,
          { id: task.assigneeId, fullName: task.assigneeName ?? "Responsabil inactiv" },
        ]
      : assignees;

  // Numai cat timp felul ales este cel al legaturii salvate: daca operatorul trece pe
  // alt fel, inregistrarea inchisa nu are ce cauta in lista noului fel.
  const currentForType = entityType === task?.entityType ? currentLink : undefined;
  const linkOptions: ComboOption[] = linkChoicesWithCurrent(
    entityType === "project" ? projects : clients,
    currentForType,
  ).map((o) => ({
    value: o.id,
    label: o.label,
    hint: o.hint,
  }));

  /** Perechea se schimba intreaga sau nu se schimba: felul fara inregistrare arata
   *  spre nimic, iar inregistrarea fara fel este un id pe care nimeni nu il poate
   *  duce la o tabela. Restrictia tasks_entity_both_or_neither din migratia 0068 o
   *  tine asa oricum, si validateTaskPatch o refuza romanesc inainte de drum. */
  function changeEntityType(next: string) {
    setEntityType(next);
    setEntityId("");
  }

  /** `cancel` este butonul "Anulează sarcina": el trimite NUMAI starea anulata. */
  async function save(cancel = false) {
    if (dateInvalid && !cancel) return;
    setError(null);
    setErrorField(undefined);

    const input = { title, description, status, priority, dueDate, assigneeId, entityType, entityId };

    // O MODIFICARE TRIMITE NUMAI CE A SCHIMBAT OPERATORUL, cardul P3-157: un camp
    // netrimis nu se scrie, deci schimbarea unui coleg facuta intre timp pe alt camp
    // rămâne. Nimic schimbat inseamna nicio scriere, iar panoul se inchide ca pana acum.
    let patch: TaskPatch = {};
    if (editing) {
      patch = cancel ? cancelTaskPatch() : changedTaskFields(loaded, input);
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
    }

    setPending(true);
    const result = editing ? await updateTask(task!.id, patch) : await createTask(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }

    router.refresh();
    onClose();
  }

  const fieldClass = (field: string) => (errorField === field ? "border-rc-danger" : undefined);

  // ANULAREA SE OFERA NUMAI PE O SARCINA CARE EXISTA SI NU ESTE DEJA ANULATA. Un
  // buton care scrie starea pe care randul o are deja nu face nimic si nu spune
  // nimic.
  const canCancel = editing && task!.status !== "cancelled";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className={`relative w-[520px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl ${PHONE_SHEET}`}
        data-testid="task-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">
              {editing ? "Modifică sarcina" : "Sarcină nouă"}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              O sarcină anulată rămâne pe înregistrare și se poate citi oricând.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className={`shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors ${PHONE_CLOSE}`}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
          className="px-6 py-5 space-y-4"
        >
          <Field label="Titlu" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass("title")}
              data-testid="field-task-title"
            />
          </Field>

          <Field label="Descriere">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass("description")}
              data-testid="field-task-description"
            />
          </Field>

          <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
            {/* OPTIUNILE VIN DIN LISTELE DE TOKENURI, deci ordinea de aici este
                ordinea pe care o declara migratia 0068, si niciun cuvant romanesc nu
                este scris in acest fisier: etichetele sunt cele din
                lib/data/tasks-types.ts, P2-01. */}
            <Field label="Stare" required>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldClass("status")}
                data-testid="field-task-status"
              >
                {ALL_TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Urgență" required>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={fieldClass("priority")}
                data-testid="field-task-priority"
              >
                {ALL_TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
            <Field label="Termen" hint="Lasă gol pentru o sarcină fără termen.">
              <DateField
                value={dueDate}
                onChange={setDueDate}
                onValidityChange={mark("dueDate")}
                className={fieldClass("dueDate")}
                testId="field-task-due-date"
              />
            </Field>

            <Field label="Responsabil">
              <Select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={fieldClass("assigneeId")}
                data-testid="field-task-assignee"
              >
                <option value="">Nealocată</option>
                {assigneeOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* INREGISTRAREA LEGATA ESTE OPTIONALA, cuvantul proprietarului: "linked
              entity (lead, client or project, optional)". Felul si inregistrarea se
              aleg impreuna, iar un LEAD se alege din lista de clienti, fiindca in
              aceasta platforma un lead ESTE un rand din public.clients care poarta o
              etapa. Motivul intreg este in lib/data/tasks-types.ts.

              DIN PANOUL FISEI NU SE ALEGE NIMIC, cardul P3-132 clauza 2:
              inregistrarea este cea a paginii deschise, deci se SCRIE, nu se cere.
              Cele doua selectoare nu se deseneaza acolo, si asta este si cum
              acceptanta (b) a acelui card poate cere legatura stocata "without the
              operator having selected it": nu exista control prin care sa o fi
              ales. */}
          {fixedEntity ? (
            <Field label="Înregistrare legată" hint="Sarcina rămâne pe această înregistrare.">
              <p
                className="rounded-[10px] border border-rc-line bg-rc-paper px-3.5 py-2.5 text-[13.5px] text-rc-black"
                data-testid="field-task-entity-fixed"
                data-entity-type={fixedEntity.type}
                data-entity-id={fixedEntity.id}
              >
                <span className="font-semibold">{TASK_ENTITY_TYPE_LABEL[fixedEntity.type]}</span>
                {": "}
                {fixedEntity.label}
              </p>
            </Field>
          ) : (
            <div className={`grid grid-cols-2 gap-4 ${PHONE_STACK}`}>
              <Field label="Fel înregistrare">
                <Select
                  value={entityType}
                  onChange={(e) => changeEntityType(e.target.value)}
                  className={fieldClass("entityType")}
                  data-testid="field-task-entity-type"
                >
                  <option value="">Fără înregistrare</option>
                  {ALL_TASK_ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TASK_ENTITY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>

              {entityType === "" ? null : (
                <Field label="Înregistrare" required>
                  <span className="block" data-testid="field-task-entity">
                    <Combobox
                      options={linkOptions}
                      value={entityId}
                      onChange={setEntityId}
                      placeholder={
                        entityType === "project"
                          ? "Caută proiectul după nume"
                          : "Caută clientul după nume"
                      }
                      emptyLabel="Niciun rezultat"
                    />
                  </span>
                </Field>
              )}
            </div>
          )}

          {error ? (
            <p
              role="alert"
              data-testid="task-form-error"
              className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-2">
            {/* ANULEAZA SARCINA ESTE O SCHIMBARE DE STARE, NU O STERGERE, si scrie
                exact `cancelled` prin updateTask, care este singura cale. Sta pe
                stanga si este secundar: nu este actiunea obisnuita a panoului. */}
            {canCancel ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => void save(true)}
                data-testid="task-cancel-task"
              >
                Anulează sarcina
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2.5">
              <Button type="button" variant="ghost" onClick={onClose} data-testid="task-form-close">
                Renunță
              </Button>
              <Button type="submit" disabled={pending || dateInvalid} data-testid="task-save">
                Salvează
              </Button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
