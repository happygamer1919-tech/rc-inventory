// P3-211. IMPORTUL SE TRIMITE PE LOTURI, nu dintr-o data.
//
// Fiecare ecran de import trimitea TOATE randurile intr-un singur apel catre server,
// la verificare si la scriere. Cadrul refuza un corp mai mare de 1 MB, iar un fisier
// de 5 MB este permis, deci butonul ramanea pe "Se verifică..." sau "Se importă..."
// fara niciun mesaj. Limita NU se ridica (next.config.ts nu poarta marcaje
// experimentale pe sistemul acestui client): ecranul trimite loturi de cel mult
// IMPORT_BATCH_SIZE randuri, unul dupa altul, si le uneste.
//
// DUBLATELE DIN ACELASI FISIER. Serverul recalculeaza planul la fiecare apel, deci
// la SCRIERE un rand dintr-un lot mai tarziu vede in baza randurile scrise de loturile
// de dinainte (loturile merg pe rand, nu in paralel) si se recunoaste ca dublat al
// lor: nu se creeaza niciodata doi clienti din acelasi email. La VERIFICARE nu se
// scrie nimic, deci un dublat intre doua loturi diferite nu se vede inainte de scriere;
// se vede la scriere, unde ramane pe "Sari peste" daca operatorul nu a ales altfel.
// Am ales asta in locul unei chei de dublare trecute intre apeluri: cele patru
// importuri au patru reguli de dublare, iar a le schimba pe toate ar fi atins regulile
// de dublare, pe care cardul le opreste.
//
// Pur, fara React si fara server: se poate proba fara baza de date.

import { PREVIEW_ROW_LIMIT, type ImportPreviewTable } from "./import-preview-rows";

/** Cate randuri pleaca intr-un apel. 200 de randuri raman mult sub 1 MB si sub
 *  limita de timp a unei functii. */
export const IMPORT_BATCH_SIZE = 200;

/** Cati octeti de randuri (JSON) are un lot, cel mult: sub limita de 1 MB a cadrului,
 *  cu loc pentru potrivirea coloanelor si alegerile operatorului. */
export const IMPORT_BATCH_BYTES = 700_000;

export type ImportBatch = { rows: string[][]; lines: number[] };

export type BatchStep = "check" | "import";

export type BatchSuccess<T> = { ok: true; parts: T[] };
export type BatchFailure<T> = {
  ok: false;
  /** Rezultatele loturilor terminate inainte de cea care a esuat. */
  parts: T[];
  /** Cate randuri din fisier au fost prelucrate de loturile terminate. */
  rowsDone: number;
  message: string;
};

export const CHECK_FAILED = "Verificarea nu a putut fi finalizată. Încercați din nou.";

export function importFailed(saved: number): string {
  return `Importul nu a putut fi finalizat. Rândurile importate până acum au fost salvate: ${saved}. Încercați din nou cu restul fișierului.`;
}

/** 1200 -> "1.200", cum se scrie in romana. */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function progressText(step: BatchStep, done: number, total: number): string {
  return `${step === "check" ? "Se verifică..." : "Se importă..."} ${formatCount(done)} din ${formatCount(total)}`;
}

/** Textul de progres al butonului, sau null cand fisierul incape intr-un singur lot. */
export function batchProgress(step: BatchStep, done: number, total: number): string | null {
  return total > IMPORT_BATCH_SIZE ? progressText(step, done, total) : null;
}

/**
 * Imparte randurile in loturi. `lines` poarta linia ORIGINALA din fisier a fiecarui
 * rand, deci "Rândul N" ramane cel din foaia operatorului, nu cel din lot. Cand
 * ecranul nu a trimis `lines`, se numara de la 2 (antetul este linia 1).
 */
export function splitIntoBatches(
  rows: string[][],
  lines: number[] | undefined,
  size: number = IMPORT_BATCH_SIZE,
): ImportBatch[] {
  const batches: ImportBatch[] = [];
  const encoder = new TextEncoder();
  let current: ImportBatch = { rows: [], lines: [] };
  let bytes = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    // 200 de randuri cu celule foarte lungi pot depasi 1 MB: lotul se inchide si dupa octeti.
    const rowBytes = encoder.encode(JSON.stringify(row)).length;
    if (current.rows.length > 0 && (current.rows.length >= size || bytes + rowBytes > IMPORT_BATCH_BYTES)) {
      batches.push(current);
      current = { rows: [], lines: [] };
      bytes = 0;
    }
    current.rows.push(row);
    current.lines.push(lines?.[i] ?? i + 2);
    bytes += rowBytes;
  }
  if (current.rows.length > 0) batches.push(current);
  return batches;
}

/**
 * Cheama actiunea pe fiecare lot, in ordine, si se opreste la prima esuare.
 *
 * O actiune care ARUNCA (corp refuzat, retea, timp depasit) nu lasa niciodata o
 * promisiune nerezolvata: se intoarce un esec cu mesajul romanesc al pasului. Un
 * esec INTORS de server (`ok: false`) isi pastreaza mesajul lui. In ambele cazuri
 * `parts` poarta ce s-a terminat pana atunci, iar la scriere mesajul spune cate
 * randuri au fost salvate (`saved` numara dintr-un rezultat ce a ajuns in baza).
 */
export async function runImportBatches<T>(input: {
  step: BatchStep;
  rows: string[][];
  lines?: number[];
  call: (batch: ImportBatch) => Promise<{ ok: true; value: T } | { ok: false; message: string }>;
  /** Cate randuri a salvat un rezultat; implicit, toate randurile lotului. */
  saved?: (part: T) => number;
  onProgress?: (done: number, total: number) => void;
  size?: number;
}): Promise<BatchSuccess<T> | BatchFailure<T>> {
  const batches = splitIntoBatches(input.rows, input.lines, input.size);
  const total = input.rows.length;
  const parts: T[] = [];
  let rowsDone = 0;
  let savedRows = 0;

  for (const batch of batches) {
    input.onProgress?.(rowsDone, total);
    let result: { ok: true; value: T } | { ok: false; message: string };
    try {
      result = await input.call(batch);
    } catch {
      return {
        ok: false,
        parts,
        rowsDone,
        message: input.step === "check" ? CHECK_FAILED : importFailed(savedRows),
      };
    }
    if (!result.ok) {
      const suffix =
        input.step === "import" && savedRows > 0
          ? ` Rândurile importate până acum au fost salvate: ${savedRows}.`
          : "";
      return { ok: false, parts, rowsDone, message: `${result.message}${suffix}` };
    }
    parts.push(result.value);
    rowsDone += batch.rows.length;
    savedRows += input.saved ? input.saved(result.value) : batch.rows.length;
  }
  input.onProgress?.(rowsDone, total);
  return { ok: true, parts };
}

type PlanLike = {
  entries: { line: number }[];
  counts: { fresh: number; duplicate: number; error: number };
  preview: ImportPreviewTable;
};

/** Uneste planurile loturilor intr-un singur plan, in ordinea fisierului. */
export function mergePlans<P extends PlanLike>(parts: P[]): P {
  const first = parts[0];
  if (!first) throw new Error("mergePlans: no parts");
  const entries = parts.flatMap((p) => p.entries as P["entries"]);
  entries.sort((a, b) => a.line - b.line);
  const counts = { fresh: 0, duplicate: 0, error: 0 };
  let freshRows = 0;
  const shown: ImportPreviewTable["rows"] = [];
  for (const p of parts) {
    counts.fresh += p.counts.fresh;
    counts.duplicate += p.counts.duplicate;
    counts.error += p.counts.error;
    freshRows += p.preview.rows.length + p.preview.more;
    for (const row of p.preview.rows) if (shown.length < PREVIEW_ROW_LIMIT) shown.push(row);
  }
  return {
    ...first,
    entries,
    counts,
    preview: { columns: first.preview.columns, rows: shown, more: freshRows - shown.length },
  };
}

type OutcomeLike = {
  created: number;
  filled: number;
  skipped: number;
  skippedRows: { line: number; reason: string; raw: string[] }[];
  warnings: { line: number; reason: string }[];
};

/** Uneste rezumatele loturilor. */
export function mergeOutcomes<O extends OutcomeLike>(parts: O[]): O {
  const first = parts[0];
  if (!first) throw new Error("mergeOutcomes: no parts");
  return {
    ...first,
    created: parts.reduce((n, p) => n + p.created, 0),
    filled: parts.reduce((n, p) => n + p.filled, 0),
    skipped: parts.reduce((n, p) => n + p.skipped, 0),
    skippedRows: parts.flatMap((p) => p.skippedRows),
    warnings: parts.flatMap((p) => p.warnings),
  };
}

/** Cate randuri a salvat un rezumat. */
export function savedRows(outcome: { created: number; filled: number }): number {
  return outcome.created + outcome.filled;
}
