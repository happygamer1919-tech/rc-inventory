"use server";

// P3-125, Item 3 al lui Ivan. VERIFICAREA SI SCRIEREA IMPORTULUI DE MATERIALE.
//
// ACELASI TIPAR CA lib/data/project-import-actions.ts, cardul P3-124: DOUA ACTIUNI,
// `planMaterialImport` care spune ce s-ar intampla si nu scrie nimic, si
// `runMaterialImport` care scrie. Previzualizarea INAINTE de scriere este clauza
// (3) a cardului si nu este optionala.
//
// PLANUL SE RECALCULEAZA PE SERVER LA SCRIERE, nu se ia de la browser.
//
// NICIO CATEGORIE, NICIUN FURNIZOR SI NICIUN SKU NU SE CREEAZA. Acest fisier citeste
// din `categories` si nu scrie in ea.
//
// NUMAI ADMINISTRATORUL: createProduct insusi raspunde OWNER_ONLY oricui nu este owner.
//
// UN PRODUS NOU SE SCRIE PRIN createProduct, adica prin ACEEASI cale ca formularul:
// aceeasi validare, aceeasi traducere a erorii products_sku_unique. UN RAND = UN
// INSERT, deci nu exista scriere pe jumatate in interiorul unui rand.
//
// UNITATEA UNUI PRODUS EXISTENT NU SE SCRIE NICIODATA. Singura scriere pe un produs
// care exista deja este `fillEmpty`, care nu atinge unitatea.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { createProduct } from "./product-actions";
import { productHasMovements } from "./product-movement";
import { loadOrRefuse, readAllRows, readFailedMessage } from "./import-clients-read";
import type { ActionResult } from "./inbound-types";
import {
  MATERIAL_IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  type CategoryChoice,
  type MaterialImportColumnMapping,
  type MaterialImportField,
} from "./material-import-types";
import {
  buildMaterialPlan,
  duplicateReason,
  MATERIAL_FILL_FIELDS,
  type DuplicateChoices,
  type ExistingMaterial,
  type MaterialFillField,
  type MaterialImportPlan,
} from "./material-import-plan";
import { isUnitCode } from "./units";

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate importa produse.",
};

const TOO_MANY: ActionResult<never> = {
  ok: false,
  message: `Fișierul are prea multe rânduri. Maximul este ${IMPORT_MAX_ROWS}.`,
};

/** Ce trimite ecranul: randurile citite din fisier si potrivirea coloanelor. */
export type MaterialImportRequest = {
  rows: string[][];
  mapping: (MaterialImportField | null)[];
};

export type MaterialImportOutcome = {
  created: number;
  filled: number;
  skipped: number;
  skippedRows: { line: number; reason: string; raw: string[] }[];
  warnings: { line: number; reason: string }[];
};

function readMapping(raw: (MaterialImportField | null)[]): MaterialImportColumnMapping {
  const known = new Set<string>(MATERIAL_IMPORT_FIELDS);
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
  categories: readFailedMessage("categoriile"),
  products: readFailedMessage("produsele existente"),
};

async function readAll(
  supabase: Supabase,
  table: "categories" | "products",
  columns: string,
): Promise<Record<string, unknown>[]> {
  return readAllRows(supabase, table, columns, READ_FAILED[table]);
}

async function loadCategories(supabase: Supabase): Promise<CategoryChoice[]> {
  const rows = await readAll(supabase, "categories", "id,name");
  return rows.map((row) => ({ id: row.id as string, name: (row.name as string | null) ?? "" }));
}

/** Coloana din baza a fiecarui camp completabil. */
const FILL_COLUMN: Record<MaterialFillField, string> = {
  threshold: "threshold",
  unitValueMdl: "unit_value_mdl",
};

function isZero(value: unknown): boolean {
  return value === null || value === undefined || Number(value) === 0;
}

async function loadExisting(supabase: Supabase): Promise<ExistingMaterial[]> {
  const rows = await readAll(
    supabase,
    "products",
    ["id", "sku", "name", "unit", ...MATERIAL_FILL_FIELDS.map((f) => FILL_COLUMN[f])].join(","),
  );
  return rows
    .filter((row) => isUnitCode(row.unit))
    .map((row) => ({
      id: row.id as string,
      sku: (row.sku as string | null) ?? "",
      name: (row.name as string | null) ?? "",
      unit: row.unit as ExistingMaterial["unit"],
      empty: MATERIAL_FILL_FIELDS.filter((f) => isZero(row[FILL_COLUMN[f]])),
    }));
}

/** Planul, cu "s-a miscat" rezolvat NUMAI pentru produsele care conteaza: cele al
 *  caror SKU vine in fisier cu o alta unitate. Doua treceri peste aceeasi functie
 *  pura: prima afla care sunt, a doua le aplica. */
async function buildPlan(supabase: Supabase, request: MaterialImportRequest) {
  const categories = await loadCategories(supabase);
  const existing = await loadExisting(supabase);
  const base = {
    rows: request.rows,
    mapping: readMapping(request.mapping),
    categories,
    existing,
  };

  const first = buildMaterialPlan(base);
  if (first.unitChecks.length === 0) return first;

  const moved = new Set<string>();
  for (const id of first.unitChecks) {
    if (await productHasMovements(supabase, id)) moved.add(id);
  }
  return buildMaterialPlan({ ...base, moved });
}

/** Planul, calculat pe server, fara nicio scriere. */
export async function planMaterialImport(
  request: MaterialImportRequest,
): Promise<ActionResult<MaterialImportPlan>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const built = await loadOrRefuse(() => buildPlan(supabase, request));
  if (!built.ok) return { ok: false, message: built.message };
  return { ok: true, value: built.value.plan };
}

/**
 * Completeaza NUMAI campurile goale ale unui produs care exista deja. Randul se
 * citeste inainte de scriere si nu se scrie nicio coloana pe care citirea nu a
 * gasit-o goala. UNITATEA, DENUMIREA SI CATEGORIA NU SUNT IN LISTA.
 */
async function fillEmpty(
  supabase: Supabase,
  productId: string,
  material: Record<MaterialImportField, string>,
  wanted: MaterialFillField[],
): Promise<{ filled: boolean; message?: string }> {
  const { data, error } = await supabase
    .from("products")
    .select(["id", ...MATERIAL_FILL_FIELDS.map((f) => FILL_COLUMN[f])].join(","))
    .eq("id", productId)
    .single();
  if (error || !data) return { filled: false, message: "Produsul nu mai există." };

  const stored = data as unknown as Record<string, string | number | null>;
  const patch: Record<string, number> = {};
  for (const field of MATERIAL_FILL_FIELDS) {
    if (!wanted.includes(field)) continue;
    const value = Number(material[field] || 0);
    if (!(value > 0)) continue;
    if (!isZero(stored[FILL_COLUMN[field]])) continue;
    patch[FILL_COLUMN[field]] = value;
  }

  if (Object.keys(patch).length === 0) return { filled: false };

  const { error: writeError } = await supabase.from("products").update(patch).eq("id", productId);
  if (writeError) return { filled: false, message: "Completarea a eșuat. Încearcă din nou." };
  return { filled: true };
}

/**
 * Scrie importul si intoarce numerele rezumatului. O EROARE PE UN RAND NU OPRESTE
 * RESTUL: randul intra in lista celor nepreluate cu motivul lui.
 */
export async function runMaterialImport(
  request: MaterialImportRequest & { choices: DuplicateChoices },
): Promise<ActionResult<MaterialImportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const built = await loadOrRefuse(() => buildPlan(supabase, request));
  if (!built.ok) return { ok: false, message: built.message };
  const { plan, prepared } = built.value;

  let created = 0;
  let filled = 0;
  const skippedRows: { line: number; reason: string; raw: string[] }[] = [];
  const warnings: { line: number; reason: string }[] = [];

  for (const entry of plan.entries) {
    if (entry.kind === "error") {
      skippedRows.push({ line: entry.line, reason: entry.reason, raw: entry.raw });
      continue;
    }

    const material = prepared.get(entry.line);
    const raw = request.rows[entry.line - 2] ?? [];

    if (!material) {
      skippedRows.push({ line: entry.line, reason: "Rândul nu a putut fi pregătit pentru scriere.", raw });
      continue;
    }

    if (entry.kind === "duplicate") {
      const wantsFill = (request.choices[entry.line] ?? "skip") === "fill";
      if (!wantsFill || entry.against.kind === "file") {
        skippedRows.push({ line: entry.line, reason: duplicateReason(entry), raw });
        continue;
      }
      const result = await fillEmpty(supabase, entry.against.id, material, entry.fillable);
      if (result.filled) filled += 1;
      else
        skippedRows.push({
          line: entry.line,
          reason: result.message ?? `${duplicateReason(entry)} Nu are niciun câmp gol de completat.`,
          raw,
        });
      continue;
    }

    const result = await createProduct({
      sku: material.sku,
      name: material.name,
      categoryId: material.category,
      unit: material.unit,
      threshold: material.threshold,
      unitValueMdl: material.unitValueMdl,
      supplier: "",
      packageUnit: "",
      packageFactor: "",
    });

    if (!result.ok) {
      skippedRows.push({ line: entry.line, reason: result.message, raw });
      continue;
    }
    created += 1;
  }

  // CELE TREI NUMERE ADUNA FISIERUL, acelasi invariant ca la proiecte, clienti si leaduri.
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

  revalidatePath("/inventar");
  return {
    ok: true,
    value: { created, filled, skipped: skippedRows.length, skippedRows, warnings },
  };
}
