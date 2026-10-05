// P3-123, Item 3 al lui Ivan. CE SE VA INTAMPLA CU FIECARE RAND DE CLIENT,
// INAINTE SA SE SCRIE CEVA.
//
// ACELASI TIPAR CA lib/data/lead-import-plan.ts, cardul P3-101, cu O SINGURA
// DIFERENTA DE REGULA: CHEIA DE DUBLARE ESTE EMAILUL SINGUR (clauza 5 a cardului
// P3-123), nu telefon-sau-email ca la leaduri. Un rand fara email nu se poate
// dubla cu nimic si intra mereu ca nou.
//
// DUBLATUL SE CAUTA IN DOUA LOCURI SI AMANDOUA CONTEAZA: printre clientii deja
// stocati, si printre randurile de mai sus DIN ACELASI FISIER, cu fisierul
// inaintea bazei.
//
// NIMIC NU SE SUPRASCRIE. Un dublat are doua raspunsuri: se sare peste el
// (implicit), sau i se completeaza NUMAI campurile goale.

import {
  CLIENT_IMPORT_FIELD_LABEL,
  buildClientImportPreview,
  type ClientImportColumnMapping,
  type ClientImportField,
  type OwnerIndex,
  type PreparedClient,
} from "./client-import-types";
import { personPreviewTable, type ImportPreviewTable } from "./import-preview-rows";

/** Campurile pe care completarea le poate scrie. Denumirea, etapa si data de
 *  reluare nu sunt aici: un camp gol este o lipsa, iar o etapa este o judecata
 *  pe care a facut-o cineva. */
export const CLIENT_FILL_FIELDS = [
  "phone",
  "email",
  "interest",
  "source",
  "ownerId",
  "nextAction",
  "nextActionDate",
  "notes",
  "address",
  "fiscalCode",
] as const;

export type ClientFillField = (typeof CLIENT_FILL_FIELDS)[number];

/** Un client deja stocat, redus la ce trebuie ca sa se recunoasca un dublat. */
export type ExistingClient = {
  id: string;
  name: string;
  emailKey: string | null;
  /** Campurile care sunt GOALE azi, deci singurele pe care completarea le atinge. */
  empty: ClientFillField[];
};

export type DuplicateTarget =
  | { kind: "stored"; id: string; name: string }
  | { kind: "file"; line: number; name: string };

export type PlanEntry =
  | { kind: "new"; line: number; name: string }
  | {
      kind: "duplicate";
      line: number;
      name: string;
      against: DuplicateTarget;
      fillable: ClientFillField[];
    }
  | { kind: "error"; line: number; reason: string; raw: string[] };

export type ClientImportPlan = {
  entries: PlanEntry[];
  counts: { fresh: number; duplicate: number; error: number };
  /** P3-141: randurile noi, cu valorile cum vor fi salvate. */
  preview: ImportPreviewTable;
};

export type DuplicateChoice = "skip" | "fill";
export type DuplicateChoices = Record<number, DuplicateChoice>;

export function duplicateReason(entry: Extract<PlanEntry, { kind: "duplicate" }>): string {
  return entry.against.kind === "stored"
    ? `Dublat după email cu "${entry.against.name}", care există deja.`
    : `Dublat după email cu rândul ${entry.against.line} din același fișier.`;
}

const FILL_FIELD_LABEL: Record<ClientFillField, string> = {
  phone: CLIENT_IMPORT_FIELD_LABEL.phone,
  email: CLIENT_IMPORT_FIELD_LABEL.email,
  interest: CLIENT_IMPORT_FIELD_LABEL.interest,
  source: CLIENT_IMPORT_FIELD_LABEL.source,
  ownerId: CLIENT_IMPORT_FIELD_LABEL.ownerName,
  nextAction: CLIENT_IMPORT_FIELD_LABEL.nextAction,
  nextActionDate: CLIENT_IMPORT_FIELD_LABEL.nextActionDate,
  notes: CLIENT_IMPORT_FIELD_LABEL.notes,
  address: CLIENT_IMPORT_FIELD_LABEL.address,
  fiscalCode: CLIENT_IMPORT_FIELD_LABEL.fiscalCode,
};

export function fillFieldLabel(field: ClientFillField): string {
  return FILL_FIELD_LABEL[field];
}

/** Randul pregatit, cu `ownerId` in locul `ownerName`-ului din fisier, ca
 *  rezultatul validarii Responsabilului sa poarte direct id-ul lui. */
type PreparedWithOwnerId = Omit<PreparedClient, "ownerName"> & { ownerId: string };

function toFillShape(record: Record<ClientImportField, string>): PreparedWithOwnerId {
  const { ownerName, ...rest } = record;
  return { ...rest, ownerId: ownerName };
}

function filledFields(client: PreparedWithOwnerId): Set<ClientFillField> {
  const given = new Set<ClientFillField>();
  for (const field of CLIENT_FILL_FIELDS) if ((client[field] ?? "") !== "") given.add(field);
  return given;
}

function emptyFields(client: PreparedWithOwnerId): ClientFillField[] {
  return CLIENT_FILL_FIELDS.filter((field) => (client[field] ?? "") === "");
}

/**
 * Pregateste fiecare rand si spune ce s-ar intampla cu el.
 *
 * ORDINEA RANDURILOR ESTE ORDINEA DIN FISIER si nu se schimba, exact ca la
 * leaduri.
 */
export function buildClientPlan(input: {
  rows: string[][];
  mapping: ClientImportColumnMapping;
  owners: OwnerIndex;
  existing: ExistingClient[];
  /** id responsabil -> nume, pentru coloana Responsabil din previzualizare. */
  ownerNames?: ReadonlyMap<string, string>;
  headerLine?: number;
  /** Linia din Excel a fiecarui rand de date, cand fisierul are linii goale. */
  lines?: number[];
}): { plan: ClientImportPlan; prepared: Map<number, PreparedWithOwnerId> } {
  const headerLine = input.headerLine ?? 1;
  const preview = buildClientImportPreview(
    input.rows,
    input.mapping,
    input.owners,
    headerLine,
    input.lines,
  );

  const storedByEmail = new Map<string, ExistingClient>();
  for (const client of input.existing) {
    if (client.emailKey && !storedByEmail.has(client.emailKey)) storedByEmail.set(client.emailKey, client);
  }

  const fileByEmail = new Map<string, { line: number; name: string }>();

  const entries: PlanEntry[] = [];
  const prepared = new Map<number, PreparedWithOwnerId>();
  const counts = { fresh: 0, duplicate: 0, error: 0 };

  for (const bad of preview.invalid) {
    entries.push({ kind: "error", line: bad.line, reason: bad.reason, raw: bad.raw });
    counts.error += 1;
  }

  for (const row of preview.valid) {
    const client = toFillShape(row.record);
    prepared.set(row.line, client);
    const given = filledFields(client);
    const emailKey = client.email || null;

    const fileMatch = emailKey ? fileByEmail.get(emailKey) : undefined;
    if (fileMatch) {
      const earlier = prepared.get(fileMatch.line);
      const fillable = earlier ? emptyFields(earlier).filter((field) => given.has(field)) : [];
      entries.push({
        kind: "duplicate",
        line: row.line,
        name: client.name,
        against: { kind: "file", line: fileMatch.line, name: fileMatch.name },
        fillable,
      });
      counts.duplicate += 1;
      continue;
    }

    const storedMatch = emailKey ? storedByEmail.get(emailKey) : undefined;
    if (storedMatch) {
      entries.push({
        kind: "duplicate",
        line: row.line,
        name: client.name,
        against: { kind: "stored", id: storedMatch.id, name: storedMatch.name },
        fillable: storedMatch.empty.filter((field) => given.has(field)),
      });
      counts.duplicate += 1;
      continue;
    }

    if (emailKey) fileByEmail.set(emailKey, { line: row.line, name: client.name });
    entries.push({ kind: "new", line: row.line, name: client.name });
    counts.fresh += 1;
  }

  // ORDINEA FISIERULUI, NU ORDINEA IN CARE AU FOST IMPINSE MAI SUS: erorile sunt
  // puse inaintea randurilor bune, deci se sorteaza dupa linie ca ecranul si
  // fisierul de erori sa arate fisierul asa cum a fost citit.
  entries.sort((a, b) => a.line - b.line);

  const newRows = personPreviewTable(
    entries.filter((e) => e.kind === "new").map((e) => e.line),
    prepared,
    input.ownerNames ?? new Map(),
    false,
  );

  return { plan: { entries, counts, preview: newRows }, prepared };
}

/**
 * Aplica alegerile "Completează câmpurile goale" care privesc randuri DIN ACELASI
 * FISIER, inainte ca vreun rand sa fie scris. Acelasi tipar ca mergeWithinFile
 * din lead-import-plan.ts, intoarce CARE randuri au fost chiar completate.
 */
export function mergeClientsWithinFile(
  plan: ClientImportPlan,
  prepared: Map<number, PreparedWithOwnerId>,
  choices: DuplicateChoices,
): Set<number> {
  const filled = new Set<number>();
  for (const entry of plan.entries) {
    if (entry.kind !== "duplicate") continue;
    if (entry.against.kind !== "file") continue;
    if ((choices[entry.line] ?? "skip") !== "fill") continue;

    const target = prepared.get(entry.against.line);
    const source = prepared.get(entry.line);
    if (!target || !source) continue;

    let changed = false;
    for (const field of entry.fillable) {
      if ((target[field] ?? "") !== "") continue;
      const value = source[field] ?? "";
      if (value === "") continue;
      (target as Record<ClientFillField, string>)[field] = value;
      changed = true;
    }
    if (changed) filled.add(entry.line);
  }
  return filled;
}

export type { PreparedWithOwnerId };
