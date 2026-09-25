"use client";

// P3-101, goal G58. IMPORTA LEADURI, IN PATRU PASI, IN ROMANA.
//
// PENTRU UN INCEPATOR. Fiecare pas are un titlu, o propozitie care spune ce se
// intampla acolo si un singur buton care duce mai departe. Numerele se vad la
// pasul trei, INAINTE ca ceva sa fie scris, fiindca un import care scrie si apoi
// raporteaza este un import pe care nu il poti opri.
//
// NIMIC NU SE STERGE SI NIMIC NU SE SUPRASCRIE. Un rand dublat are exact doua
// raspunsuri: "Sari peste", care este implicitul, si "Completează câmpurile
// goale", care scrie numai unde nu era nimic. Ecranul nu ofera un al treilea.
//
// ACELASI PANOU LATERAL CA FORMULARUL DE LEAD, din motivul pe care P3-06 il da
// acolo: un al doilea fel de panou ar fi o a doua conventie de invatat.
//
// CLASELE DE TELEFON SE IMPORTA din components/ui/phone.ts, niciodata scrise aici:
// G56 tocmai le-a adunat pe toate intr-un singur fisier si o copie noua ar desface
// exact ce a facut el. PHONE_TAP apare O SINGURA DATA, pe cipul unui pas, fiindca
// acela este scris de mana; Button, Input si Select din primitives poarta deja
// max-md:min-h-11 si max-md:text-base in clasa lor de baza, deci a le mai da o data
// aceleasi clase ar fi zgomot, nu 44px in plus.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Select } from "@/components/ui/primitives";
import { FilePicker } from "@/components/ui/FilePicker";
import {
  PHONE_CLOSE,
  PHONE_SHEET,
  PHONE_STACK,
  PHONE_TAP,
} from "@/components/ui/phone";
import {
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGE_LABEL,
} from "@/lib/data/clients-types";
import {
  autoMatchColumns,
  parseCsv,
  skippedCsv,
  templateCsv,
  IMPORT_FIELDS,
  IMPORT_FIELD_LABEL,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SAMPLE_COUNT,
  IMPORT_SKIP,
  IMPORT_SKIP_LABEL,
  SKIPPED_FILE_NAME,
  TEMPLATE_FILE_NAME,
  type ColumnMapping,
  type ImportField,
} from "@/lib/data/lead-import-types";
import {
  duplicateReason,
  fillFieldLabel,
  type DuplicateChoices,
  type LeadImportPlan,
  type PlanEntry,
} from "@/lib/data/lead-import-plan";
import {
  planLeadImport,
  runLeadImport,
  type LeadImportOutcome,
} from "@/lib/data/lead-import-actions";

/** Cei patru pasi, cu titlurile din goal G58. */
const STEPS = [
  "Încarcă fișierul",
  "Potrivește coloanele",
  "Verifică",
  "Importă",
] as const;

/** Propozitia pe care o vede cineva care alege un XLSX.
 *
 *  Citirea unui .xlsx cere o biblioteca noua, fiindca fisierul este o arhiva zip
 *  cu XML inauntru. Intrebarea sta la proprietar (mailbox q084) si pana la raspuns
 *  ecranul spune ce are de facut operatorul, in loc sa taca. */
export const XLSX_NOT_YET =
  "Fișierele Excel (.xlsx) nu pot fi citite încă. Deschide fișierul în Excel, alege " +
  "Salvare ca și tipul CSV, apoi încarcă fișierul CSV. Șablonul de mai jos este deja CSV.";

const TOO_BIG = "Fișierul este mai mare de 5 MB. Încarcă un fișier mai mic.";
const WRONG_KIND = "Se acceptă doar fișiere CSV. Alege un fișier cu extensia .csv.";
const EMPTY_FILE = "Fișierul nu are niciun rând cu date, doar antetul sau nimic.";
const TOO_MANY_ROWS = `Fișierul are mai mult de ${IMPORT_MAX_ROWS} de rânduri. Împarte-l în fișiere mai mici.`;
const NEED_NAME = "Alege ce coloană este Denumire: fără ea un lead nu poate fi salvat.";
const NEED_CONTACT = "Alege ce coloană este Telefon sau ce coloană este Email. Cel puțin una din două.";

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Ziua de azi in Chisinau, `YYYY-MM-DD`, la fel ca peste tot in aplicatie. */
function chisinauToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function LeadImportSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping>([]);

  const [plan, setPlan] = React.useState<LeadImportPlan | null>(null);
  const [choices, setChoices] = React.useState<DuplicateChoices>({});
  const [source, setSource] = React.useState("");
  const [outcome, setOutcome] = React.useState<LeadImportOutcome | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      setHeaders([]);
      setRows([]);
      return;
    }
    if (!lower.endsWith(".csv")) {
      setError(WRONG_KIND);
      setHeaders([]);
      setRows([]);
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError(TOO_BIG);
      setHeaders([]);
      setRows([]);
      return;
    }

    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setError(EMPTY_FILE);
      setHeaders([]);
      setRows([]);
      return;
    }
    const head = parsed[0] ?? [];
    const body = parsed.slice(1);
    if (body.length > IMPORT_MAX_ROWS) {
      setError(TOO_MANY_ROWS);
      setHeaders([]);
      setRows([]);
      return;
    }

    setHeaders(head);
    setRows(body);
    setMapping(autoMatchColumns(head));
  }

  /** Primele valori scrise din fiecare coloana, ca operatorul sa vada ce potriveste. */
  function samples(column: number): string[] {
    const found: string[] = [];
    for (const row of rows) {
      const value = (row[column] ?? "").trim();
      if (value !== "") found.push(value);
      if (found.length === IMPORT_SAMPLE_COUNT) break;
    }
    return found;
  }

  function setColumn(column: number, field: ImportField | null) {
    setMapping((current) =>
      current.map((existing, i) => {
        // UN CAMP SE IA O SINGURA DATA: coloana care il tinea pana acum se
        // elibereaza singura, in loc sa scrie amandoua in acelasi loc.
        if (i === column) return field;
        return field !== null && existing === field ? null : existing;
      }),
    );
  }

  function toMatching() {
    setError(null);
    setStep(1);
  }

  async function toVerify() {
    if (!mapping.includes("name")) {
      setError(NEED_NAME);
      return;
    }
    if (!mapping.includes("phone") && !mapping.includes("email")) {
      setError(NEED_CONTACT);
      return;
    }
    setError(null);
    setPending(true);
    const result = await planLeadImport({ rows, mapping, fallbackSource: "" });
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
    const result = await runLeadImport({
      rows,
      mapping,
      fallbackSource: source,
      choices,
      fileName: fileName ?? "fișier",
      day: chisinauToday(),
    });
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
        data-testid="lead-import"
      >
        <div className="sticky top-0 z-10 bg-rc-white text-rc-black border-b border-rc-line px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-rc-black leading-snug">Importă leaduri</h2>
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

        <ol
          className="px-6 pt-4 flex flex-wrap gap-2 text-[12px] font-semibold"
          data-testid="import-steps"
        >
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
                Alege un fișier CSV cu leadurile tale. Cel mult 5 MB și {IMPORT_MAX_ROWS} de
                rânduri. Dacă nu ai un fișier, pornește de la șablonul de mai jos.
              </p>

              <FilePicker
                inputRef={inputRef}
                accept=".csv,.xlsx,.xls"
                onChange={onFile}
                fileName={fileName}
                inputTestId="import-file"
                chooseTestId="import-choose"
                nameTestId="import-file-name"
                ariaLabel="Alege fișierul cu leaduri"
              />

              <Button
                type="button"
                variant="secondary"
                onClick={() => download(templateCsv(), TEMPLATE_FILE_NAME)}
                data-testid="import-template"
              >
                Descarcă șablonul gol
              </Button>

              {ready ? (
                <p className="text-[13px] text-rc-black" data-testid="import-read">
                  Am citit {rows.length}{" "}
                  {rows.length === 1 ? "rând" : "de rânduri"} și {headers.length}{" "}
                  {headers.length === 1 ? "coloană" : "coloane"}.
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4" data-testid="import-step-2">
              <p className="text-[13px] text-rc-muted">
                Pentru fiecare coloană din fișier alege câmpul în care intră. Coloanele pe care
                nu le recunoaștem rămân pe {IMPORT_SKIP_LABEL}. Denumire este obligatorie, iar
                Telefon sau Email, cel puțin una din două.
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
                        setColumn(i, e.target.value === IMPORT_SKIP ? null : (e.target.value as ImportField))
                      }
                      data-testid="import-column-select"
                      aria-label={`Câmpul pentru coloana ${header.trim() || i + 1}`}
                    >
                      <option value={IMPORT_SKIP}>{IMPORT_SKIP_LABEL}</option>
                      {IMPORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {IMPORT_FIELD_LABEL[field]}
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
                      onClick={() =>
                        download(skippedCsv(headers, outcome.skippedRows), SKIPPED_FILE_NAME)
                      }
                      data-testid="import-download-skipped"
                    >
                      Descarcă rândurile nepreluate
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-rc-muted">
                    Leadurile fără etapă în fișier intră la {CLIENT_STAGE_LABEL.cold}. Fiecare
                    lead creat primește o notă care spune din ce fișier a venit și în ce zi.
                  </p>

                  <Field
                    label="Sursă pentru tot importul"
                    hint="Se pune doar pe rândurile care nu au deja o sursă a lor. Poți lăsa gol."
                  >
                    <Select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      data-testid="import-source"
                    >
                      <option value="">Nespecificată</option>
                      {CLIENT_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {CLIENT_SOURCE_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
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
                onClick={toMatching}
                data-testid="import-next"
              >
                Continuă
              </Button>
            ) : step === 1 ? (
              <Button
                type="button"
                disabled={pending}
                onClick={toVerify}
                data-testid="import-next"
              >
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
              <Button
                type="button"
                disabled={pending}
                onClick={onRun}
                data-testid="import-run"
              >
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

/** Exportat pentru testul care citeste acelasi text ca ecranul. */
export const IMPORT_MESSAGES = {
  tooBig: TOO_BIG,
  wrongKind: WRONG_KIND,
  emptyFile: EMPTY_FILE,
  tooManyRows: TOO_MANY_ROWS,
  needName: NEED_NAME,
  needContact: NEED_CONTACT,
  xlsx: XLSX_NOT_YET,
} as const;
