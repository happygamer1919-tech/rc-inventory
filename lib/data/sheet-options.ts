// P3-57. Lista combinatiilor de tabla si tigla metalica, citita pe server.
//
// CITESTE NUMAI DUPA CE MIGRATIA 0046 ESTE APLICATA. Pana atunci hasSheetOptions
// raspunde nu, lista este goala, iar formularul arata exact ca astazi.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSheetOptions } from "./schema-capability";
import { isUnitCode } from "./units";
import { normalizeThickness, type SheetOption } from "./sheet-options-types";

/** Toate combinatiile, in ordinea listei Dasterum. Goala cat timp 0046 lipseste. */
export async function listSheetOptions(): Promise<SheetOption[]> {
  const supabase = await createClient();
  if (!(await hasSheetOptions(supabase))) return [];

  const { data, error } = await supabase
    .from("sheet_options")
    .select("model, series, thickness_mm, finish, unit")
    .order("sort_order", { ascending: true });
  // O lista care nu se poate citi ascunde alegerea, nu prabuseste inventarul:
  // produsul se poate adauga in continuare de mana.
  if (error || !data) return [];

  const options: SheetOption[] = [];
  for (const row of data) {
    const thicknessMm = normalizeThickness(row.thickness_mm);
    const unit = row.unit as unknown;
    if (!thicknessMm || !isUnitCode(unit)) continue;
    options.push({
      model: row.model as string,
      series: row.series as string,
      thicknessMm,
      finish: (row.finish as string | null) ?? "",
      unit,
    });
  }
  return options;
}
