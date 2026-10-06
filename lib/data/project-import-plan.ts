// P3-124, Item 3 al lui Ivan. CE SE VA INTAMPLA CU FIECARE RAND DE PROIECT,
// INAINTE SA SE SCRIE CEVA.
//
// ACELASI TIPAR CA lib/data/client-import-plan.ts, cardul P3-123, cu CHEIA DE
// DUBLARE NUME PLUS CLIENT (clauza 4 a cardului): doua proiecte numite "Bloc A"
// la doi clienti diferiti sunt doua proiecte, iar acelasi nume la acelasi client
// este acelasi proiect. Baza o impune ea insasi prin projects_name_unique_per_client
// (0016_projects.sql); planul o spune inainte, cu un motiv romanesc, in loc sa
// lase operatorul sa citeasca un cod 23505.
//
// DUBLATUL SE CAUTA IN DOUA LOCURI: printre proiectele deja stocate si printre
// randurile de mai sus din ACELASI fisier. Un dublat fata de un rand al
// fisierului se sare intotdeauna, fara alegere: completarea unui rand care nici
// nu exista inca ar fi o scriere in doi timpi pe care previzualizarea nu o poate
// arata. Un dublat fata de un proiect STOCAT are doua raspunsuri: se sare peste
// el (implicit), sau i se completeaza NUMAI campurile goale.

import {
  PROJECT_IMPORT_FIELD_LABEL,
  PROJECT_IMPORT_REASON,
  buildClientLookup,
  buildProjectImportPreview,
  clientNameKey,
  type ClientChoice,
  type ProjectImportColumnMapping,
  type ProjectImportField,
} from "./project-import-types";
import { projectPreviewTable, type ImportPreviewTable } from "./import-preview-rows";

/** Campurile pe care completarea le poate scrie. Clientul, denumirea si starea nu
 *  sunt aici: ele alcatuiesc identitatea proiectului sau o judecata a cuiva. */
export const PROJECT_FILL_FIELDS = [
  "address",
  "startDate",
  "plannedEndDate",
  "budgetMdl",
  "notes",
] as const;

export type ProjectFillField = (typeof PROJECT_FILL_FIELDS)[number];

/** Un proiect deja stocat, redus la ce trebuie ca sa se recunoasca un dublat. */
export type ExistingProject = {
  id: string;
  clientId: string;
  name: string;
  /** Campurile care sunt GOALE azi, deci singurele pe care completarea le atinge. */
  empty: ProjectFillField[];
};

export type DuplicateTarget =
  | { kind: "stored"; id: string; name: string }
  | { kind: "file"; line: number; name: string };

export type PlanEntry =
  | { kind: "new"; line: number; name: string; clientName: string }
  | {
      kind: "duplicate";
      line: number;
      name: string;
      clientName: string;
      against: DuplicateTarget;
      fillable: ProjectFillField[];
    }
  | { kind: "error"; line: number; reason: string; raw: string[] };

export type ProjectImportPlan = {
  entries: PlanEntry[];
  counts: { fresh: number; duplicate: number; error: number };
  /** P3-141: randurile noi, cu valorile cum vor fi salvate. */
  preview: ImportPreviewTable;
};

export type DuplicateChoice = "skip" | "fill";
export type DuplicateChoices = Record<number, DuplicateChoice>;

export function duplicateReason(entry: Extract<PlanEntry, { kind: "duplicate" }>): string {
  return entry.against.kind === "stored"
    ? `Dublat: clientul "${entry.clientName}" are deja proiectul "${entry.against.name}".`
    : `Dublat: același proiect și același client ca la rândul ${entry.against.line} din același fișier.`;
}

export function fillFieldLabel(field: ProjectFillField): string {
  return PROJECT_IMPORT_FIELD_LABEL[field];
}

/** Cheia de dublare: clientul si numele, amandoua normalizate. */
export function projectKey(clientId: string, name: string): string {
  return `${clientId}\u0000${clientNameKey(name)}`;
}

/**
 * Pregateste fiecare rand si spune ce s-ar intampla cu el. ORDINEA RANDURILOR
 * ESTE ORDINEA DIN FISIER.
 */
export function buildProjectPlan(input: {
  rows: string[][];
  mapping: ProjectImportColumnMapping;
  clients: ClientChoice[];
  existing: ExistingProject[];
  headerLine?: number;
}): { plan: ProjectImportPlan; prepared: Map<number, Record<ProjectImportField, string>> } {
  const headerLine = input.headerLine ?? 1;
  const preview = buildProjectImportPreview(
    input.rows,
    input.mapping,
    buildClientLookup(input.clients),
    headerLine,
  );

  const clientNames = new Map(input.clients.map((c) => [c.id, c.name]));
  const inactiveClients = new Set(input.clients.filter((c) => !c.active).map((c) => c.id));

  const stored = new Map<string, ExistingProject>();
  for (const project of input.existing) {
    const key = projectKey(project.clientId, project.name);
    if (!stored.has(key)) stored.set(key, project);
  }

  const inFile = new Map<string, { line: number; name: string }>();

  const entries: PlanEntry[] = [];
  const prepared = new Map<number, Record<ProjectImportField, string>>();
  const counts = { fresh: 0, duplicate: 0, error: 0 };

  for (const bad of preview.invalid) {
    entries.push({ kind: "error", line: bad.line, reason: bad.reason, raw: bad.raw });
    counts.error += 1;
  }

  for (const row of preview.valid) {
    const project = row.record;
    prepared.set(row.line, project);
    const clientName = clientNames.get(project.client) ?? "";
    const key = projectKey(project.client, project.name);

    const fileMatch = inFile.get(key);
    if (fileMatch) {
      entries.push({
        kind: "duplicate",
        line: row.line,
        name: project.name,
        clientName,
        against: { kind: "file", line: fileMatch.line, name: fileMatch.name },
        fillable: [],
      });
      counts.duplicate += 1;
      continue;
    }

    const storedMatch = stored.get(key);
    if (storedMatch) {
      entries.push({
        kind: "duplicate",
        line: row.line,
        name: project.name,
        clientName,
        against: { kind: "stored", id: storedMatch.id, name: storedMatch.name },
        fillable: storedMatch.empty.filter((field) => (project[field] ?? "") !== ""),
      });
      counts.duplicate += 1;
      continue;
    }

    // UN PROIECT NOU LA UN CLIENT DEZACTIVAT SE REFUZA, ca inainte; unul care exista deja la el
    // a fost raportat mai sus ca dublat, oricare ar fi starea clientului.
    if (inactiveClients.has(project.client)) {
      entries.push({
        kind: "error",
        line: row.line,
        reason: PROJECT_IMPORT_REASON.inactiveClient(clientName),
        raw: input.rows[row.line - headerLine - 1] ?? [],
      });
      counts.error += 1;
      continue;
    }

    inFile.set(key, { line: row.line, name: project.name });
    entries.push({ kind: "new", line: row.line, name: project.name, clientName });
    counts.fresh += 1;
  }

  // ORDINEA FISIERULUI: erorile au fost puse inaintea randurilor bune, deci se
  // sorteaza dupa linie.
  entries.sort((a, b) => a.line - b.line);

  const newRows = projectPreviewTable(
    entries.filter((e) => e.kind === "new").map((e) => e.line),
    prepared,
    clientNames,
  );

  return { plan: { entries, counts, preview: newRows }, prepared };
}
