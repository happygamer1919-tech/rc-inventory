"use server";

// P3-124, Item 3 al lui Ivan. VERIFICAREA SI SCRIEREA IMPORTULUI DE PROIECTE.
//
// ACELASI TIPAR CA lib/data/client-import-actions.ts, cardul P3-123: DOUA ACTIUNI,
// `planProjectImport` care spune ce s-ar intampla si nu scrie nimic, si
// `runProjectImport` care scrie. Previzualizarea INAINTE de scriere este clauza
// (3) a cardului si nu este optionala.
//
// PLANUL SE RECALCULEAZA PE SERVER LA SCRIERE, nu se ia de la browser: ecranul
// trimite ce a citit si ce a ales operatorul, iar clientul si dublatul se decid
// dupa randurile din baza, chiar aici.
//
// NICIUN CLIENT NU SE CREEAZA. Acest fisier citeste din `clients` si nu scrie
// niciodata in ea (clauza 5): un client necunoscut este o eroare de rand.
//
// NUMAI ADMINISTRATORUL, exact ca la crearea unui singur proiect:
// createProjectRecord insusi raspunde OWNER_ONLY oricui nu este owner.
//
// NIMIC NU SE STERGE SI NIMIC NU SE SUPRASCRIE. Singura scriere pe un proiect
// care exista deja este `fillEmpty` de mai jos, care CITESTE randul, calculeaza
// numai coloanele goale si scrie numai pe acelea.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { createProjectRecord } from "./project-actions";
import { loadOrRefuse, readAllRows, readFailedMessage } from "./import-clients-read";
import type { ActionResult } from "./inbound-types";
import {
  PROJECT_IMPORT_FIELDS,
  PROJECT_IMPORT_REASON,
  IMPORT_MAX_ROWS,
  type ClientChoice,
  type ProjectImportColumnMapping,
  type ProjectImportField,
} from "./project-import-types";
import {
  buildProjectPlan,
  duplicateReason,
  PROJECT_FILL_FIELDS,
  type DuplicateChoices,
  type ExistingProject,
  type ProjectFillField,
  type ProjectImportPlan,
} from "./project-import-plan";

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate importa proiecte.",
};

const TOO_MANY: ActionResult<never> = {
  ok: false,
  message: `Fișierul are prea multe rânduri. Maximul este ${IMPORT_MAX_ROWS}.`,
};

/** Ce trimite ecranul: randurile citite din fisier si potrivirea coloanelor. */
export type ProjectImportRequest = {
  rows: string[][];
  mapping: (ProjectImportField | null)[];
};

export type ProjectImportOutcome = {
  created: number;
  filled: number;
  skipped: number;
  skippedRows: { line: number; reason: string; raw: string[] }[];
  warnings: { line: number; reason: string }[];
};

function readMapping(raw: (ProjectImportField | null)[]): ProjectImportColumnMapping {
  const known = new Set<string>(PROJECT_IMPORT_FIELDS);
  const seen = new Set<string>();
  return raw.map((field) => {
    if (field === null || !known.has(field) || seen.has(field)) return null;
    seen.add(field);
    return field;
  });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Tabelele se citesc pe pagini (PostgREST taie la 1000 de randuri). O citire
 *  care esueaza arunca ImportReadError, nu intoarce o lista pe jumatate citita. */
const READ_FAILED = {
  clients: readFailedMessage("clienții"),
  projects: readFailedMessage("proiectele existente"),
};

async function readAll(
  supabase: Supabase,
  table: "clients" | "projects",
  columns: string,
): Promise<Record<string, unknown>[]> {
  return readAllRows(supabase, table, columns, READ_FAILED[table]);
}

async function loadClients(supabase: Supabase): Promise<ClientChoice[]> {
  const rows = await readAll(supabase, "clients", "id,name,active");
  return rows.map((row) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? "",
    active: row.active !== false,
  }));
}

/** Coloana din baza a fiecarui camp completabil. */
const FILL_COLUMN: Record<ProjectFillField, string> = {
  address: "address",
  startDate: "start_date",
  plannedEndDate: "planned_end_date",
  budgetMdl: "budget_mdl",
  notes: "notes",
};

async function loadExisting(supabase: Supabase): Promise<ExistingProject[]> {
  const rows = await readAll(
    supabase,
    "projects",
    ["id", "client_id", "name", ...PROJECT_FILL_FIELDS.map((f) => FILL_COLUMN[f])].join(","),
  );
  return rows.map((row) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    name: (row.name as string | null) ?? "",
    empty: PROJECT_FILL_FIELDS.filter((f) => {
      const value = row[FILL_COLUMN[f]];
      return value === null || value === undefined || String(value).trim() === "";
    }),
  }));
}

/** Planul, calculat pe server, fara nicio scriere. */
export async function planProjectImport(
  request: ProjectImportRequest,
): Promise<ActionResult<ProjectImportPlan>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const loaded = await loadOrRefuse(async () => ({
    clients: await loadClients(supabase),
    existing: await loadExisting(supabase),
  }));
  if (!loaded.ok) return { ok: false, message: loaded.message };
  const { plan } = buildProjectPlan({
    rows: request.rows,
    mapping: readMapping(request.mapping),
    ...loaded.value,
  });

  return { ok: true, value: plan };
}

/**
 * Completeaza NUMAI campurile goale ale unui proiect care exista deja.
 *
 * RANDUL SE CITESTE INAINTE DE SCRIERE, chiar aici, si nu se scrie nicio coloana
 * pe care citirea nu a gasit-o goala. Cele doua date se potrivesc DUPA
 * completare sau nu se scrie nimic: constrangerea projects_dates_in_order ar
 * refuza altfel un termen mai vechi decat un inceput deja stocat.
 */
async function fillEmpty(
  supabase: Supabase,
  projectId: string,
  project: Record<ProjectImportField, string>,
  wanted: ProjectFillField[],
): Promise<{ filled: boolean; message?: string }> {
  const { data, error } = await supabase
    .from("projects")
    .select(["id", ...PROJECT_FILL_FIELDS.map((f) => FILL_COLUMN[f])].join(","))
    .eq("id", projectId)
    .single();
  if (error || !data) return { filled: false, message: "Proiectul nu mai există." };

  const stored = data as unknown as Record<string, string | number | null>;
  const patch: Record<string, string> = {};
  for (const field of PROJECT_FILL_FIELDS) {
    if (!wanted.includes(field)) continue;
    const value = (project[field] ?? "").trim();
    if (value === "") continue;
    const current = stored[FILL_COLUMN[field]];
    if (current !== null && current !== undefined && String(current).trim() !== "") continue;
    patch[FILL_COLUMN[field]] = value;
  }

  if (Object.keys(patch).length === 0) return { filled: false };

  const start = patch.start_date ?? (stored.start_date as string | null) ?? "";
  const end = patch.planned_end_date ?? (stored.planned_end_date as string | null) ?? "";
  if (start !== "" && end !== "" && end < start)
    return { filled: false, message: PROJECT_IMPORT_REASON.endBeforeStart };

  const { error: writeError } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (writeError) return { filled: false, message: writeError.message };
  return { filled: true };
}

/**
 * Scrie importul si intoarce numerele rezumatului.
 *
 * O EROARE PE UN RAND NU OPRESTE RESTUL: randul intra in lista celor nepreluate
 * cu motivul lui si fisierul merge mai departe. UN RAND SE SCRIE INTR-UN SINGUR
 * INSERT, deci nu exista scriere pe jumatate in interiorul unui rand.
 */
export async function runProjectImport(
  request: ProjectImportRequest & { choices: DuplicateChoices },
): Promise<ActionResult<ProjectImportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const loaded = await loadOrRefuse(async () => ({
    clients: await loadClients(supabase),
    existing: await loadExisting(supabase),
  }));
  if (!loaded.ok) return { ok: false, message: loaded.message };
  const { plan, prepared } = buildProjectPlan({
    rows: request.rows,
    mapping: readMapping(request.mapping),
    ...loaded.value,
  });

  let created = 0;
  let filled = 0;
  const skippedRows: { line: number; reason: string; raw: string[] }[] = [];
  const warnings: { line: number; reason: string }[] = [];

  for (const entry of plan.entries) {
    if (entry.kind === "error") {
      skippedRows.push({ line: entry.line, reason: entry.reason, raw: entry.raw });
      continue;
    }

    const project = prepared.get(entry.line);
    const raw = request.rows[entry.line - 2] ?? [];

    if (!project) {
      skippedRows.push({ line: entry.line, reason: "Rândul nu a putut fi pregătit pentru scriere.", raw });
      continue;
    }

    if (entry.kind === "duplicate") {
      const wantsFill = (request.choices[entry.line] ?? "skip") === "fill";
      if (!wantsFill || entry.against.kind === "file") {
        skippedRows.push({ line: entry.line, reason: duplicateReason(entry), raw });
        continue;
      }
      const result = await fillEmpty(supabase, entry.against.id, project, entry.fillable);
      if (result.filled) filled += 1;
      else
        skippedRows.push({
          line: entry.line,
          reason: result.message ?? `${duplicateReason(entry)} Nu are niciun câmp gol de completat.`,
          raw,
        });
      continue;
    }

    const result = await createProjectRecord({
      clientId: project.client,
      name: project.name,
      address: project.address,
      status: project.status,
      startDate: project.startDate,
      plannedEndDate: project.plannedEndDate,
      budgetMdl: project.budgetMdl,
      notes: project.notes,
      active: true,
    });

    if (!result.ok) {
      skippedRows.push({ line: entry.line, reason: result.message, raw });
      continue;
    }
    created += 1;
  }

  // CELE TREI NUMERE ADUNA FISIERUL, acelasi invariant ca la clienti si la
  // leaduri (P3-115, G18).
  const accounted = created + filled + skippedRows.length;
  if (accounted !== request.rows.length) {
    warnings.push({
      line: 0,
      reason:
        `Rezumatul nu se potrivește cu fișierul: ${request.rows.length} rânduri citite, ` +
        `${created} create plus ${filled} completate plus ${skippedRows.length} nepreluate ` +
        `fac ${accounted}. Numerele de mai sus sunt corecte pentru ce s-a scris; socoteala nu.`,
    });
  }

  revalidatePath("/proiecte");
  return {
    ok: true,
    value: { created, filled, skipped: skippedRows.length, skippedRows, warnings },
  };
}
