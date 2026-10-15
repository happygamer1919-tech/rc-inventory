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
// lor: nu se creeaza niciodata doi clienti din acelasi email.
//
// LA VERIFICARE NU SE SCRIE NIMIC, asa ca P3-301 trece intre apeluri cheile de dublare
// ale randurilor noi (lib/data/import-file-anchors.ts): fiecare plan intoarce `anchors`,
// runImportBatches le aduna si le da lotului urmator ca `earlier`. Un telefon scris la
// randul 10 si la randul 260 se vede acum ca dublat in previzualizare, nu abia la scriere.
// Regulile de dublare raman cele din planuri; ce se trece este doar harta pe care fiecare
// plan o tinea deja pentru randurile de mai sus din lotul lui.
//
// Pur, fara React si fara server: se poate proba fara baza de date.

import { addAnchors, type FileAnchor } from "./import-file-anchors";
import { PREVIEW_ROW_LIMIT, type ImportPreviewTable } from "./import-preview-rows";

/** Cate randuri pleaca intr-un apel. 200 de randuri raman mult sub 1 MB si sub
 *  limita de timp a unei functii. */
export const IMPORT_BATCH_SIZE = 200;

/** Cati octeti de randuri (JSON) are un lot, cel mult: sub limita de 1 MB a cadrului,
 *  cu loc pentru potrivirea coloanelor, alegerile operatorului si ancorele de dublare
 *  (IMPORT_ANCHOR_BYTES, P3-301). */
export const IMPORT_BATCH_BYTES = 150_000;

export type ImportBatch = { rows: string[][]; lines: number[] };

export type BatchStep = "check" | "import";

/** `anchorsCapped` (P3-307): ancorele de dublare au depasit pragul, deci verificarea nu a
 *  comparat toate loturile intre ele; ecranul spune asta pe pasul "Verifică". */
export type BatchSuccess<T> = { ok: true; parts: T[]; anchorsCapped: boolean };
export type BatchFailure<T> = {
  ok: false;
  /** Rezultatele loturilor terminate inainte de cea care a esuat. */
  parts: T[];
  /** Cate randuri din fisier au fost prelucrate de loturile terminate. */
  rowsDone: number;
  message: string;
};

export const CHECK_FAILED = "Verificarea nu a putut fi finalizată. Încercați din nou.";

/** Cate linii fara cheie se numesc in mesaj; restul se numara. */
const KEYLESS_LISTED = 8;

/**
 * P3-301. CE SPUNE UN IMPORT OPRIT LA JUMATATE. Serverul scrie rand cu rand, deci un lot
 * care esueaza (retea, timp depasit) poate fi scris in parte. Mesajul spune asta pe fata,
 * spune ca acelasi fisier se poate incarca din nou fara risc (un rand care exista deja se
 * recunoaste si se sare) si numeste singura exceptie: un rand fara cheie de dublare, care
 * s-ar crea a doua oara (`keylessLines`, goala la importurile care au mereu o cheie).
 *
 * `reason` este motivul oprii; `failed` este lotul care a esuat, ca operatorul sa stie de
 * unde se poate sa lipseasca ceva.
 */
export function importStopped(
  reason: string,
  saved: number,
  failed?: { from: number; to: number },
  keylessLines: number[] = [],
): string {
  const trimmed = reason.trim();
  const parts = [/[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`];
  if (saved > 0)
    parts.push(`Rândurile din loturile terminate au fost salvate: ${formatCount(saved)}.`);
  parts.push(
    failed
      ? `Din lotul care a eșuat (rândurile ${failed.from} până la ${failed.to}) se poate să fi fost salvate câteva rânduri.`
      : "Se poate să fi fost salvate câteva rânduri.",
  );
  parts.push(
    "Puteți încărca din nou același fișier fără risc: rândurile care există deja sunt recunoscute și sărite.",
  );
  if (keylessLines.length > 0) {
    const listed = keylessLines.slice(0, KEYLESS_LISTED).join(", ");
    const more = keylessLines.length - KEYLESS_LISTED;
    parts.push(
      `Atenție: rândurile fără email și fără telefon (${listed}${more > 0 ? ` și încă ${formatCount(more)}` : ""}) ` +
        "nu pot fi recunoscute la o nouă încărcare și s-ar crea a doua oară. " +
        "Scoateți-le din fișier înainte să-l încărcați din nou.",
    );
  }
  return parts.join(" ");
}

export const IMPORT_FAILED = "Importul nu a putut fi finalizat.";

export function importFailed(
  saved: number,
  failed?: { from: number; to: number },
  keylessLines: number[] = [],
): string {
  return importStopped(IMPORT_FAILED, saved, failed, keylessLines);
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
  /** `earlier` poarta ancorele de dublare ale loturilor terminate (P3-301); gol la scriere. */
  call: (
    batch: ImportBatch,
    earlier: FileAnchor[],
  ) => Promise<{ ok: true; value: T } | { ok: false; message: string }>;
  /** Cheile de dublare pe care le poarta un rezultat; date numai la verificare. */
  anchorsOf?: (part: T) => FileAnchor[] | undefined;
  /** Adevarat pentru un rand care nu se poate recunoaste ca dublat la o a doua incarcare. */
  keyless?: (row: string[]) => boolean;
  /** Cate randuri a salvat un rezultat; implicit, toate randurile lotului. */
  saved?: (part: T) => number;
  onProgress?: (done: number, total: number) => void;
  size?: number;
}): Promise<BatchSuccess<T> | BatchFailure<T>> {
  const batches = splitIntoBatches(input.rows, input.lines, input.size);
  const total = input.rows.length;
  const parts: T[] = [];
  const earlier = { anchors: [] as FileAnchor[], bytes: 0 };
  const keylessLines: number[] = [];
  let rowsDone = 0;
  let savedRows = 0;
  let anchorsCapped = false;

  const noteKeyless = (batch: ImportBatch) => {
    if (!input.keyless) return;
    batch.rows.forEach((row, i) => {
      if (input.keyless?.(row)) keylessLines.push(batch.lines[i] ?? 0);
    });
  };

  // P3-301. Mesajul unui import oprit: ce s-a salvat, ce s-ar putea sa fi fost scris din
  // lotul care a esuat si ce nu se recunoaste la o a doua incarcare. Randurile fara cheie
  // din lotul esuat conteaza si ele: nu se stie care din ele au apucat sa fie scrise.
  const stopped = (reason: string, batch: ImportBatch): string => {
    noteKeyless(batch);
    return importStopped(
      reason,
      savedRows,
      { from: batch.lines[0] ?? 0, to: batch.lines[batch.lines.length - 1] ?? 0 },
      keylessLines,
    );
  };

  for (const batch of batches) {
    input.onProgress?.(rowsDone, total);
    let result: { ok: true; value: T } | { ok: false; message: string };
    try {
      result = await input.call(batch, [...earlier.anchors]);
    } catch {
      return {
        ok: false,
        parts,
        rowsDone,
        message: input.step === "check" ? CHECK_FAILED : stopped(IMPORT_FAILED, batch),
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        parts,
        rowsDone,
        message: input.step === "check" ? result.message : stopped(result.message, batch),
      };
    }
    parts.push(result.value);
    rowsDone += batch.rows.length;
    savedRows += input.saved ? input.saved(result.value) : batch.rows.length;
    // Dupa prima depasire nu se mai adauga nimic: ancorele trebuie sa fie un prefix al fisierului,
    // nu o alegere cu goluri.
    if (!anchorsCapped) anchorsCapped = addAnchors(earlier, input.anchorsOf?.(result.value));
    noteKeyless(batch);
  }
  input.onProgress?.(rowsDone, total);
  return { ok: true, parts, anchorsCapped };
}

type PlanLike = {
  entries: { line: number }[];
  counts: { fresh: number; duplicate: number; error: number };
  preview: ImportPreviewTable;
  anchors?: FileAnchor[];
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
    // Ancorele au slujit numai la verificare; planul unit nu mai pleaca spre server.
    anchors: undefined,
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
