// P3-57. Lista combinatiilor de tabla si tigla metalica, citita pe server.
//
// CITESTE NUMAI DUPA CE MIGRATIA 0046 ESTE APLICATA. Pana atunci hasSheetOptions
// raspunde nu, lista este goala, iar formularul arata exact ca astazi.
//
// P3-58. FIECARE COMBINATIE ISI POARTA PRETUL, si acesta este locul in care cele
// doua tabele se impreuna. Alaturarea se face AICI, pe server, si nu in browser,
// din doua motive: price_group este cheia liniei de pret si nu are ce cauta pe
// ecran, iar formularul primeste asa un singur lucru de inteles, combinatia cu
// pretul ei. Preturile lipsesc pana cand migratia 0047 este aplicata, si atunci
// campul de valoare unitara ramane de scris de mana, ca astazi.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSheetOptions, hasSheetPrices } from "./schema-capability";
import { isUnitCode } from "./units";
import { normalizePrice, normalizeThickness, type SheetOption } from "./sheet-options-types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Cheia unei linii de pret: textul de model al listei, seria, grosimea si finisajul. */
function priceLineKey(priceGroup: string, series: string, thicknessMm: string, finish: string): string {
  return `${priceGroup}|${series}|${thicknessMm}|${finish}`;
}

/** Toate combinatiile, in ordinea listei Dasterum. Goala cat timp 0046 lipseste. */
export async function listSheetOptions(): Promise<SheetOption[]> {
  const supabase = await createClient();
  if (!(await hasSheetOptions(supabase))) return [];

  const { data, error } = await supabase
    .from("sheet_options")
    .select("model, series, thickness_mm, finish, unit, price_group")
    .order("sort_order", { ascending: true });
  // O lista care nu se poate citi ascunde alegerea, nu prabuseste inventarul:
  // produsul se poate adauga in continuare de mana.
  if (error || !data) return [];

  const prices = await listSheetPrices(supabase);

  const options: SheetOption[] = [];
  for (const row of data) {
    const thicknessMm = normalizeThickness(row.thickness_mm);
    const unit = row.unit as unknown;
    if (!thicknessMm || !isUnitCode(unit)) continue;
    const series = row.series as string;
    const finish = (row.finish as string | null) ?? "";
    const priceGroup = (row.price_group as string | null) ?? "";
    options.push({
      model: row.model as string,
      series,
      thicknessMm,
      finish,
      unit,
      priceLei: prices.get(priceLineKey(priceGroup, series, thicknessMm, finish)) ?? null,
    });
  }
  return options;
}

/**
 * P3-58. Pretul fiecarei linii a listei verificate, dupa cheia liniei.
 *
 * GOALA CAT TIMP MIGRATIA 0047 NU ESTE APLICATA, si goala si atunci cand tabela
 * nu se poate citi: un pret care lipseste inseamna un camp de valoare unitara
 * necompletat, adica ecranul de pana acum, si niciodata o alegere ascunsa sau un
 * inventar cazut.
 */
async function listSheetPrices(supabase: Supabase): Promise<Map<string, string>> {
  const prices = new Map<string, string>();
  if (!(await hasSheetPrices(supabase))) return prices;

  const { data, error } = await supabase
    .from("sheet_prices")
    .select("price_group, series, thickness_mm, finish, price_lei");
  if (error || !data) return prices;

  for (const row of data) {
    const thicknessMm = normalizeThickness(row.thickness_mm);
    const price = normalizePrice(row.price_lei);
    if (!thicknessMm || !price) continue;
    prices.set(
      priceLineKey(
        (row.price_group as string | null) ?? "",
        row.series as string,
        thicknessMm,
        (row.finish as string | null) ?? "",
      ),
      price,
    );
  }
  return prices;
}
