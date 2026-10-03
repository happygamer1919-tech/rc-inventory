"use server";

// P3-129. EXPORTUL MATERIALELOR: vederea curenta a Inventarului, ca fisier CSV cu antetul
// modelului de import al materialelor.
//
// FILTRUL ESTE AL LISTEI, NU AL EXPORTULUI. Actiunea primeste cele cinci filtre ale ecranului
// (cautare, categorie, furnizor, nivel de stoc, vizibilitate), citeste prin `listProducts`,
// adica prin aceeasi functie ca pagina, si alege randurile prin `filterProducts`, adica prin
// aceeasi functie ca ecranul. NICIO CITIRE NOUA. Se exporta toate randurile filtrului, pana la
// IMPORT_MAX_ROWS, in ordinea listei (dupa SKU).
//
// STOCUL NU INTRA IN FISIER (vezi material-export-types.ts).
//
// NUMAI ADMINISTRATORUL, ca importul si ca celelalte exporturi.

import { getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./inbound-types";
import { listProducts } from "./products";
import {
  STOCK_LEVEL_VALUES,
  VISIBILITY_VALUES,
  filterProducts,
  type ProductFilter,
} from "./product-filter";
import { IMPORT_MAX_ROWS } from "./material-import-types";
import {
  exportNumber,
  materialExportCsv,
  materialExportTruncatedNotice,
  type ExportMaterialRow,
} from "./material-export-types";
import { unitLabel } from "./units";

/** Ce trimite ecranul: filtrele listei, ca text. Valorile necunoscute cad pe implicit. */
export type MaterialExportRequest = {
  q?: string;
  category?: string;
  supplier?: string;
  level?: string;
  visibility?: string;
};

export type MaterialExportOutcome = {
  csv: string;
  /** Randurile din fisier. */
  count: number;
  /** Randurile pe care le are filtrul. */
  total: number;
  truncated: boolean;
  /** Propozitia romaneasca de aratat cand fisierul a fost taiat, altfel null. */
  notice: string | null;
};

export async function exportMaterials(
  request: MaterialExportRequest,
): Promise<ActionResult<MaterialExportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") {
    return { ok: false, message: "Doar administratorul poate exporta materiale." };
  }

  const text = (value: unknown): string => (typeof value === "string" ? value : "");
  const level = STOCK_LEVEL_VALUES.find((v) => v === request.level) ?? "toate";
  const visibility = VISIBILITY_VALUES.find((v) => v === request.visibility) ?? "active";
  const filter: ProductFilter = {
    q: text(request.q),
    category: text(request.category),
    supplier: text(request.supplier),
    level,
    visibility,
  };

  let all: Awaited<ReturnType<typeof listProducts>>;
  try {
    all = await listProducts();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Exportul a eșuat." };
  }

  const chosen = filterProducts(all, filter);
  const kept = chosen.slice(0, IMPORT_MAX_ROWS);

  const materials: ExportMaterialRow[] = kept.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    unit: unitLabel(p.unit),
    threshold: exportNumber(p.threshold),
    unitValueMdl: exportNumber(p.unitValueMdl),
  }));

  const truncated = chosen.length > kept.length;
  return {
    ok: true,
    value: {
      csv: materialExportCsv(materials),
      count: materials.length,
      total: chosen.length,
      truncated,
      notice: truncated ? materialExportTruncatedNotice(chosen.length) : null,
    },
  };
}
