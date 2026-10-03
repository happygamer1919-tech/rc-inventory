"use client";

// P3-124, Item 3 al lui Ivan. IMPORTA PROIECTE, IN PATRU PASI, IN ROMANA.
//
// ACELASI PANOU SI ACEEASI FORMA CA ClientImportSheet.tsx, cardul P3-123, din
// motivul pe care acela il da: un al doilea fel de panou ar fi o a doua
// conventie de invatat. NU SE EDITEAZA ClientImportSheet.tsx. Diferentele sunt
// campurile, cheia de dublare (nume plus client) si faptul ca Client trebuie sa
// fie ales din fisier, obligatoriu, si sa existe deja.
//
// PREVIZUALIZAREA INAINTE DE SCRIERE, clauza (3) a cardului, nu este optionala:
// pasul "Verifică" nu scrie nimic.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui/primitives";
import { FilePicker } from "@/components/ui/FilePicker";
import { PHONE_CLOSE, PHONE_SHEET, PHONE_STACK, PHONE_TAP } from "@/components/ui/phone";
import {
  autoMatchProjectColumns,
  parseCsv,
  projectImportInstructions,
  skippedCsv,
  templateCsv,
  PROJECT_IMPORT_FIELDS,
  PROJECT_IMPORT_FIELD_LABEL,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SAMPLE_COUNT,
  IMPORT_SKIP,
  IMPORT_SKIP_LABEL,
  SKIPPED_FILE_NAME,
  TEMPLATE_FILE_NAME,
  type ProjectImportColumnMapping,
  type ProjectImportField,
} from "@/lib/data/project-import-types";
import {
  duplicateReason,
  fillFieldLabel,
  type DuplicateChoices,
  type PlanEntry,
  type ProjectImportPlan,
} from "@/lib/data/project-import-plan";
import {
  planProjectImport,
  runProjectImport,
  type ProjectImportOutcome,
} from "@/lib/data/project-import-actions";

const STEPS = ["Încarcă fișierul", "Potrivește coloanele", "Verifică", "Importă"] as const;

export const XLSX_NOT_YET =
  "Fișierele Excel (.xlsx) nu pot fi citite încă. Deschide fișierul în Excel, alege " +
  "Salvare ca și tipul CSV, apoi încarcă fișierul CSV. Modelul de mai jos este deja CSV.";

const TOO_BIG = "Fișierul este mai mare de 5 MB. Încarcă un fișier mai mic.";
const WRONG_KIND = "Se acceptă doar fișiere CSV. Alege un fișier cu extensia .csv.";
const EMPTY_FILE = "Fișierul nu are niciun rând cu date, doar antetul sau nimic.";
const TOO_MANY_ROWS = `Fișierul are mai mult de ${IMPORT_MAX_ROWS} de rânduri. Împarte-l în fișiere mai mici.`;
const NEED_COLUMNS =
  "Alege ce coloană este Client și ce coloană este Denumire: fără ele un proiect nu poate fi salvat.";

export function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ProjectImportSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<ProjectImportColumnMapping>([]);

  const [plan, setPlan] = React.useState<ProjectImportPlan | null>(null);
  const [choices, setChoices] = React.useState<DuplicateChoices>({});
  const [outcome, setOutcome] = React.useState<ProjectImportOutcome | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function clearFile() {
    setHeaders([]);
    setRows([]);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setPlan(null);
    setOutcome(null);
    setFileName(file.name);

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setError(XLSX_NOT_YET);
      clearFile();
      return;
    }
    if (!lower.endsWith(".csv")) {
      setError(WRONG_KIND);
      clearFile();
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError(TOO_BIG);
      clearFile();
      return;
    }

    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setError(EMPTY_FILE);
      clearFile();
      return;
    }
    const head = parsed[0] ?? [];
    const body = parsed.slice(1);
    if (body.length > IMPORT_MAX_ROWS) {
      setError(TOO_MANY_ROWS);
      clearFile();
      return;
    }

    setHeaders(head);
    setRows(body);
    setMapping(autoMatchProjectColumns(head));
  }

  function samples(column: number): string[] {
    const found: string[] = [];
    for (const row of rows) {
      const value = (row[column] ?? "").trim();
      if (value !== "") found.push(value);
      if (found.length === IMPORT_SAMPLE_COUNT) break;
    }
    return found;
  }

  function setColumn(column: number, field: ProjectImportField | null) {
    setMapping((current) =>
      current.map((existing, i) => {
        if (i === column) return field;
        return field !== null && existing === field ? null : existing;
      }),
    );
  }

  async function toVerify() {
    if (!mapping.includes("client") || !mapping.includes("name")) {
      setError(NEED_COLUMNS);
      return;
    }
    setError(null);
    setPending(true);
    const result = await planProjectImport({ rows, mapping });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPlan(result.value);
    setChoices({});
    setStep(2);
  }

  async function onRun() {
    setError(null);
    setPending(true);
    const result = await runProjectImport({ rows, mapping, choices });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOutcome(result.value);
    router.refresh();
  }

  const duplicates = (plan?.entries ?? []).filter(
    (e): e is Extract<PlanEntry, { kind: "duplicate" }> => e.kind === "duplicate",
  );
  const errors = (plan?.entries ?? []).filter(
    (e): e is Extract<PlanEntry, { kind: "error" }> => e.kind === "error",
  );
  const ready = rows.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside
        className={`relative w-[640px] h-full bg-rc-white text-rc-black overflow-y-auto shadow-2xl ${PHONE_SHEET}`}
        data-testid="project-import"
      >
        <div className="sticky top-0 z-10 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">Importă proiecte</h2>
            <p className="text-[12.5px] text-rc-muted mt-1" data-testid="import-step-title">
              Pasul {step + 1} din 4: {STEPS[step]}
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

        <ol className="px-6 pt-4 flex flex-wrap gap-2 text-[12px] font-semibold" data-testid="import-steps">
          {STEPS.map((title, i) => (
            <li
              key={title}
              data-testid="import-step"
              data-active={i === step ? "true" : "false"}
              className={[
                "inline-flex items-center rounded-full border px-3 py-1.5 leading-none",
                PHONE_TAP,
                i === step
                  ? "bg-rc-white text-rc-black border-rc-orange"
                  : "bg-rc-paper text-rc-muted border-rc-line-strong",
              ].join(" ")}
            >
              {i + 1}. {title}
            </li>
          ))}
        </ol>

        <div className="px-6 py-5 space-y-4">
          {step === 0 ? (
            <section className="space-y-4" data-testid="import-step-1">
              <p className="text-[13px] text-rc-muted">
                Alege un fișier CSV cu proiectele tale. Cel mult 5 MB și {IMPORT_MAX_ROWS} de rânduri.
                Clienții trebuie să existe deja. Dacă nu ai un fișier, pornește de la modelul de mai jos.
              </p>

              <FilePicker
                inputRef={inputRef}
                accept=".csv,.xlsx,.xls"
                onChange={onFile}
                fileName={fileName}
                inputTestId="import-file"
                chooseTestId="import-choose"
                nameTestId="import-file-name"
                ariaLabel="Alege fișierul cu proiecte"
              />

              <Button
                type="button"
                variant="secondary"
                onClick={() => download(templateCsv(), TEMPLATE_FILE_NAME)}
                data-testid="import-template"
              >
                Descarcă modelul de import
              </Button>

              {ready ? (
                <p className="text-[13px] text-rc-black" data-testid="import-read">
                  Am citit {rows.length} {rows.length === 1 ? "rând" : "de rânduri"} și{" "}
                  {headers.length} {headers.length === 1 ? "coloană" : "coloane"}.
                </p>
              ) : null}

              <div
                className="space-y-1.5 rounded-[12px] border border-rc-line bg-rc-paper p-4"
                data-testid="import-instructions"
              >
                <h3 className="text-[13px] font-semibold text-rc-black">Cum funcționează importul</h3>
                {projectImportInstructions().map((line, i) => (
                  <p key={i} className="text-[12px] text-rc-muted [overflow-wrap:anywhere]">
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4" data-testid="import-step-2">
              <p className="text-[13px] text-rc-muted">
                Pentru fiecare coloană din fișier alege câmpul în care intră. Coloanele pe care nu
                le recunoaștem rămân pe {IMPORT_SKIP_LABEL}. Client și Denumire sunt obligatorii.
              </p>

              <div className="space-y-3" data-testid="import-columns">
                {headers.map((header, i) => (
                  <div
                    key={`${header}-${i}`}
                    data-testid="import-column"
                    data-header={header}
                    className={`grid grid-cols-2 gap-4 rounded-[12px] border border-rc-line p-4 ${PHONE_STACK}`}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-rc-black [overflow-wrap:anywhere]">
                        {header.trim() || `Coloana ${i + 1}`}
                      </p>
                      <p
                        className="text-[12px] text-rc-muted mt-1 [overflow-wrap:anywhere]"
                        data-testid="import-column-samples"
                      >
                        {samples(i).join(" · ") || "Coloană goală"}
                      </p>
                    </div>
                    <Select
                      value={mapping[i] ?? IMPORT_SKIP}
                      onChange={(e) =>
                        setColumn(
                          i,
                          e.target.value === IMPORT_SKIP ? null : (e.target.value as ProjectImportField),
                        )
                      }
                      data-testid="import-column-select"
                      aria-label={`Câmpul pentru coloana ${header.trim() || i + 1}`}
                    >
                      <option value={IMPORT_SKIP}>{IMPORT_SKIP_LABEL}</option>
                      {PROJECT_IMPORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {PROJECT_IMPORT_FIELD_LABEL[field]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {step === 2 && plan ? (
            <section className="space-y-4" data-testid="import-step-3">
              <p className="text-[13px] text-rc-muted">
                Nimic nu este scris încă. Verifică numerele, apoi treci la ultimul pas.
              </p>

              <div className={`grid grid-cols-3 gap-3 ${PHONE_STACK}`} data-testid="import-counts">
                <Count label="Noi" value={plan.counts.fresh} testId="import-count-new" />
                <Count label="Dublate" value={plan.counts.duplicate} testId="import-count-duplicate" />
                <Count label="Cu erori" value={plan.counts.error} testId="import-count-error" />
              </div>

              {duplicates.length > 0 ? (
                <div className="space-y-2" data-testid="import-duplicates">
                  <h3 className="text-[13px] font-semibold text-rc-black">Rânduri dublate</h3>
                  <p className="text-[12px] text-rc-muted">
                    Completarea scrie numai în câmpurile goale. O valoare scrisă deja nu este
                    niciodată înlocuită.
                  </p>
                  {duplicates.map((entry) => (
                    <div
                      key={entry.line}
                      data-testid="import-duplicate"
                      data-line={entry.line}
                      className="rounded-[12px] border border-rc-line p-4 space-y-2"
                    >
                      <p className="text-[13px] text-rc-black [overflow-wrap:anywhere]">
                        Rândul {entry.line}, {entry.name}. {duplicateReason(entry)}
                      </p>
                      <Select
                        value={choices[entry.line] ?? "skip"}
                        onChange={(e) =>
                          setChoices((c) => ({
                            ...c,
                            [entry.line]: e.target.value === "fill" ? "fill" : "skip",
                          }))
                        }
                        data-testid="import-duplicate-choice"
                        aria-label={`Ce se face cu rândul ${entry.line}`}
                      >
                        <option value="skip">Sari peste</option>
                        <option value="fill" disabled={entry.fillable.length === 0}>
                          Completează câmpurile goale
                        </option>
                      </Select>
                      <p className="text-[12px] text-rc-muted" data-testid="import-duplicate-fillable">
                        {entry.fillable.length === 0
                          ? "Nu are niciun câmp gol de completat."
                          : `Se pot completa: ${entry.fillable.map(fillFieldLabel).join(", ")}.`}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {errors.length > 0 ? (
                <div className="space-y-2" data-testid="import-errors">
                  <h3 className="text-[13px] font-semibold text-rc-black">Rânduri cu erori</h3>
                  <p className="text-[12px] text-rc-muted">
                    Acestea se sar. Restul fișierului se importă oricum, iar la final le poți
                    descărca într-un fișier ca să le repari.
                  </p>
                  {errors.map((entry) => (
                    <p
                      key={entry.line}
                      data-testid="import-error-row"
                      data-line={entry.line}
                      className="text-[13px] text-rc-black rounded-[12px] border border-rc-line p-4 [overflow-wrap:anywhere]"
                    >
                      Rândul {entry.line}: {entry.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-4" data-testid="import-step-4">
              {outcome ? (
                <div className="space-y-3" data-testid="import-summary">
                  <p className="text-[13px] text-rc-black">Gata. Iată ce s-a întâmplat:</p>
                  <div className={`grid grid-cols-3 gap-3 ${PHONE_STACK}`}>
                    <Count label="Create" value={outcome.created} testId="import-created" />
                    <Count label="Completate" value={outcome.filled} testId="import-filled" />
                    <Count label="Nepreluate" value={outcome.skipped} testId="import-skipped" />
                  </div>
                  {outcome.skipped > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => download(skippedCsv(headers, outcome.skippedRows), SKIPPED_FILE_NAME)}
                      data-testid="import-download-skipped"
                    >
                      Descarcă rândurile nepreluate
                    </Button>
                  ) : null}

                  <p className="text-[12px] text-rc-muted" data-testid="import-total">
                    {outcome.created + outcome.filled + outcome.skipped === 1
                      ? "1 rând citit din fișier."
                      : `${outcome.created + outcome.filled + outcome.skipped} rânduri citite din fișier.`}
                  </p>

                  {outcome.warnings.length > 0 ? (
                    <div className="space-y-1" data-testid="import-warnings">
                      <h3 className="text-[13px] font-semibold text-rc-black">De reținut</h3>
                      {outcome.warnings.map((warning, index) => (
                        <p
                          key={`${warning.line}-${index}`}
                          className="text-[12px] text-rc-warn [overflow-wrap:anywhere]"
                          data-testid="import-warning"
                        >
                          {warning.line > 0 ? `Rândul ${warning.line}: ` : ""}
                          {warning.reason}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[13px] text-rc-muted">
                  Proiectele fără stare în fișier intră la Prospect. Nu se creează niciun client: un
                  rând cu un client necunoscut se sare.
                </p>
              )}
            </section>
          ) : null}

          {error ? (
            <p
              role="alert"
              data-testid="import-error"
              className="rounded-[10px] border border-rc-danger bg-rc-danger-soft px-3.5 py-2.5 text-[12.5px] text-rc-black"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {step > 0 && !outcome ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setStep(step - 1);
                }}
                data-testid="import-back"
              >
                Înapoi
              </Button>
            ) : null}

            {outcome ? (
              <Button type="button" onClick={onClose} data-testid="import-done">
                Închide
              </Button>
            ) : step === 0 ? (
              <Button
                type="button"
                disabled={!ready}
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                data-testid="import-next"
              >
                Continuă
              </Button>
            ) : step === 1 ? (
              <Button type="button" disabled={pending} onClick={toVerify} data-testid="import-next">
                {pending ? "Se verifică..." : "Verifică"}
              </Button>
            ) : step === 2 ? (
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
                data-testid="import-next"
              >
                Continuă
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={onRun} data-testid="import-run">
                {pending ? "Se importă..." : "Importă"}
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-[12px] border border-rc-line p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-rc-muted">{label}</p>
      <p className="text-[22px] font-bold tabular-nums text-rc-black" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** Descarcarea modelului, folosita si de legatura de pe ecranul Proiecte. */
export function downloadProjectTemplate(): void {
  download(templateCsv(), TEMPLATE_FILE_NAME);
}
