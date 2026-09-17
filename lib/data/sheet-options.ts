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

// P3-68. COMBINATIILE RETRASE VIN SI ELE, MARCATE, si nu sunt filtrate aici. Motivul
// este formularul de modificare: un produs care poarta deja o combinatie retrasa
// trebuie sa se deschida cu ea aleasa, deci formularul are nevoie de rand. Ce se
// OFERA se hotaraste in ProductForm, iar serverul refuza o combinatie retrasa pe un
// produs nou (product-actions.ts). Pana cand 0048 este aplicata nimic nu este retras.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSheetOptionRetirement, hasSheetOptions, hasSheetPrices } from "./schema-capability";
import { isUnitCode } from "./units";
import {
  normalizePrice,
  normalizeThickness,
  type SheetOption,
  type SheetOptionAdminRow,
} from "./sheet-options-types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Cheia unei linii de pret: textul de model al listei, seria, grosimea si finisajul. */
function priceLineKey(priceGroup: string, series: string, thicknessMm: string, finish: string): string {
  return `${priceGroup}|${series}|${thicknessMm}|${finish}`;
}

/** Toate combinatiile, in ordinea listei, cu pretul si starea lor. Goala cat timp 0046 lipseste. */
export async function listSheetOptions(): Promise<SheetOption[]> {
  const supabase = await createClient();
  const rows = await readSheetOptions(supabase);
  return rows.map(({ priceGroup: _priceGroup, priceLineShares: _shares, ...option }) => option);
}

/**
 * P3-68. Lista pentru ecranul din Setari: fiecare combinatie, cu linia ei de pret si
 * cu numarul de combinatii care impart acea linie, plus ce se poate face pe baza de
 * acum. `writable` este fals pana cand 0048 este aplicata, iar ecranul ascunde atunci
 * butoanele de scriere, fiindca politicile care le-ar lasa sa treaca nu exista inca.
 */
export async function listSheetOptionsForAdmin(): Promise<{
  active: boolean;
  writable: boolean;
  rows: SheetOptionAdminRow[];
}> {
  const supabase = await createClient();
  const active = await hasSheetOptions(supabase);
  if (!active) return { active: false, writable: false, rows: [] };
  const [writable, rows] = await Promise.all([
    hasSheetOptionRetirement(supabase),
    readSheetOptions(supabase),
  ]);
  return { active, writable, rows };
}

async function readSheetOptions(supabase: Supabase): Promise<SheetOptionAdminRow[]> {
  if (!(await hasSheetOptions(supabase))) return [];
  const retirement = await hasSheetOptionRetirement(supabase);

  const { data, error } = await supabase
    .from("sheet_options")
    .select(
      retirement
        ? "model, series, thickness_mm, finish, unit, price_group, retired_at"
        : "model, series, thickness_mm, finish, unit, price_group",
    )
    .order("sort_order", { ascending: true });
  // O lista care nu se poate citi ascunde alegerea, nu prabuseste inventarul:
  // produsul se poate adauga in continuare de mana.
  if (error || !data) return [];

  const prices = await listSheetPrices(supabase);

  const rows: SheetOptionAdminRow[] = [];
  const shares = new Map<string, number>();
  for (const raw of data as unknown as Record<string, unknown>[]) {
    const thicknessMm = normalizeThickness(raw.thickness_mm);
    const unit = raw.unit;
    if (!thicknessMm || !isUnitCode(unit)) continue;
    const series = raw.series as string;
    const finish = (raw.finish as string | null) ?? "";
    const priceGroup = (raw.price_group as string | null) ?? "";
    const key = priceLineKey(priceGroup, series, thicknessMm, finish);
    shares.set(key, (shares.get(key) ?? 0) + 1);
    rows.push({
      model: raw.model as string,
      series,
      thicknessMm,
      finish,
      unit,
      priceLei: prices.get(key) ?? null,
      retired: retirement ? raw.retired_at !== null && raw.retired_at !== undefined : false,
      priceGroup,
      priceLineShares: 0,
    });
  }
  for (const row of rows) {
    row.priceLineShares = shares.get(priceLineKey(row.priceGroup, row.series, row.thicknessMm, row.finish)) ?? 1;
  }
  return rows;
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
