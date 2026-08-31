"use client";

// Formularul de proiect, cardul P3-07. Acelasi panou lateral ca la client si la
// produs: limbajul vizual existent se reutilizeaza, nu se inlocuieste.
//
// STAREA NU SE EDITEAZA DE AICI CAND SE MODIFICA UN PROIECT. Ea are propriul
// control pe fisa, care trece prin set_project_status si scrie randul de
// istoric. Un camp de stare in acest formular ar fi a doua cale catre aceeasi
// coloana, si a doua cale este cea care uita sa scrie istoricul.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { createProjectRecord, updateProjectRecord } from "@/lib/data/project-actions";
import { PROJECT_STATUS_LABEL } from "@/lib/data/projects-types";
import { ALL_STATUSES, type ProjectDetail } from "@/lib/data/projects-list-types";

export function ProjectForm({
  project,
  clients,
  onClose,
  onSaved,
}: {
  project?: ProjectDetail;
  clients: { id: string; name: string }[];
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const editing = project !== undefined;

  const [clientId, setClientId] = React.useState(project?.clientId ?? clients[0]?.id ?? "");
  const [name, setName] = React.useState(project?.name ?? "");
  const [address, setAddress] = React.useState(project?.address ?? "");
  const [status, setStatus] = React.useState<string>(project?.status ?? "lead");
  const [startDate, setStartDate] = React.useState(project?.startDate ?? "");
  const [plannedEndDate, setPlannedEndDate] = React.useState(project?.plannedEndDate ?? "");
  const [budgetMdl, setBudgetMdl] = React.useState(
    project?.budgetMdl === null || project?.budgetMdl === undefined ? "" : String(project.budgetMdl),
  );
  const [notes, setNotes] = React.useState(project?.notes ?? "");
  const [active, setActive] = React.useState(project?.active ?? true);

  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | undefined>(undefined);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const noClients = clients.length === 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(undefined);
    setPending(true);

    const input = {
      clientId,
      name,
      address,
      status,
      startDate,
      plannedEndDate,
      budgetMdl,
      notes,
      active,
    };
    const result = editing
      ? await updateProjectRecord(project!.id, input)
      : await createProjectRecord(input);

    if (!result.ok) {
      setError(result.message);
      setErrorField(result.field);
      setPending(false);
      return;
    }

    router.refresh();
    if (onSaved) onSaved(result.value.id);
    else onClose();
  }

  const fieldClass = (field: string) =>
    errorField === field ? "border-rc-danger" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className="relative w-[560px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl"
        data-testid="project-form"
      >
        <div className="sticky top-0 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">
              {editing ? "Modifică proiectul" : "Proiect nou"}
            </h2>
            <p className="text-[12.5px] text-rc-muted mt-1">
              {editing
                ? "Starea se schimbă de pe fișă, ca mișcarea să rămână în istoric."
                : "Un proiect aparține unui client și denumirea este unică per client."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="shrink-0 w-8 h-8 rounded-[9px] text-rc-muted hover:bg-rc-paper hover:text-rc-black transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="px-6 py-5 space-y-4">
          {noClients ? (
            <p className="rounded-[10px] border border-rc-warn bg-rc-warn-soft px-3.5 py-2.5 text-[12.5px] text-rc-black">
              Nu există niciun client. Adaugă unul în Clienți înainte de a crea un proiect.
            </p>
          ) : null}

          <Field label="Client" required>
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={fieldClass("clientId")}
              data-testid="field-project-client"
              disabled={editing}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Denumire" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass("name")}
              data-testid="field-project-name"
            />
          </Field>

          <Field label="Adresă">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="field-project-address"
            />
          </Field>

          {!editing ? (
            <Field label="Stare" required>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldClass("status")}
                data-testid="field-project-status"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Data început">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="field-project-start"
              />
            </Field>
            <Field label="Termen estimat">
              <Input
                type="date"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                className={fieldClass("plannedEndDate")}
                data-testid="field-project-end"
              />
            </Field>
          </div>

          <Field label="Buget (MDL)" hint="Gol înseamnă fără buget, nu buget zero.">
            <Input
              value={budgetMdl}
              onChange={(e) => setBudgetMdl(e.target.value)}
              inputMode="decimal"
              className={fieldClass("budgetMdl")}
              data-testid="field-project-budget"
            />
          </Field>

          <Field label="Note">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="field-project-notes"
            />
          </Field>

          {editing ? (
            <label className="flex items-center gap-2.5 text-[13.5px] text-rc-black">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                data-testid="field-project-active"
                className="w-4 h-4 accent-rc-orange"
              />
              Activ, adică apare în liste și în selectoare
            </label>
          ) : null}

          {error ? (
            <p
              role="alert"
              data-testid="form-error"
              className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending || noClients} data-testid="project-submit">
              {pending ? "Se salvează..." : "Salvează"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
