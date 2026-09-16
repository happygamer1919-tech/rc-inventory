// P3-57. Tabla cutata si tigla metalica, alese din lista Dasterum verificata.
//
// Fisierul este comun browserului si serverului: formularul construieste din el
// listele si denumirea, iar serverul verifica forma alegerii. Lista insasi vine din
// baza, din public.sheet_options (migratia 0046), si nu este copiata aici: o a doua
// copie ar fi o lista care poate sa nu mai spuna acelasi lucru.
//
// PRETURILE SUNT ALE CARDULUI P3-58, si sosesc alaturi de combinatie. Antetul
// spunea pana atunci "FARA PRETURI. Coloana de lei a listei este pentru alt card",
// iar acela este acest card: coloana de lei traieste in public.sheet_prices
// (migratia 0047), se citeste pe server si vine aici ca priceLei, ca o SUGESTIE
// pentru campul de valoare unitara. Nimic nu se blocheaza: operatorul scrie peste.

import type { UnitCode } from "./units";

/** O combinatie din lista: model, serie, grosime, finisaj si pretul liniei ei. */
export type SheetOption = {
  model: string;
  series: string;
  /** Grosimea in milimetri, cu doua zecimale si punct, ca in baza: "0.45". */
  thicknessMm: string;
  /** Finisajul, sau sirul gol cand lista nu numeste unul. */
  finish: string;
  /** Unitatea cu care se completeaza produsul: m2, sau pcs pentru Dastera. */
  unit: UnitCode;
  /** P3-58: pretul in lei al liniei, ca text pentru camp ("144"). Null cat timp
   *  migratia 0047 nu este aplicata sau lista de preturi nu se poate citi. */
  priceLei: string | null;
};

/** Ce trimite formularul la salvare: combinatia aleasa, fara unitate. */
export type SheetChoice = Pick<SheetOption, "model" | "series" | "thicknessMm" | "finish">;

/** Furnizorul listei. Campul de furnizor il gaseste sau il creeaza dupa nume. */
export const SHEET_SUPPLIER = "Dasterum";

/** Categoria existenta din migratia 0007, gasita dupa nume. Nu se creeaza alta. */
export const SHEET_CATEGORY = "Acoperișuri și tablă";

// Felul produsului, pus in fata modelului in denumire. Modelele care nu sunt aici
// (Dastera, Tablă netedă, Foaie în folie) isi poarta singure felul in nume.
const PROFILED_SHEET = new Set([
  "PS-8", "C-10", "T-12", "C-15", "PK/PS-20", "VP-20", "HC-35", "C-44", "H-57", "H-60",
]);
const METAL_TILE = new Set(["Monterrey", "Valencia", "Kascad"]);

/** Grosimea din baza, 0.45 sau "0.45", adusa la "0.45". Null daca nu este o grosime. */
export function normalizeThickness(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 10) return null;
  return n.toFixed(2);
}

/** P3-58: pretul din baza, 144 sau "144.00", adus la "144". Null daca nu este un pret. */
export function normalizePrice(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/** P3-58: ce scrie sub valoarea unitara cat timp ea este pretul sugerat. */
export const SHEET_PRICE_NOTE = "Prețul Dasterum din 07.08.2026. Se poate modifica.";

/** "0.45" devine "0,45 mm". */
export function thicknessLabel(thicknessMm: string): string {
  return `${thicknessMm.replace(".", ",")} mm`;
}

/** Eticheta din lista de grosimi: "0,40 mm" sau "0,40 mm, W matt". */
export function thicknessOptionLabel(option: Pick<SheetOption, "thicknessMm" | "finish">): string {
  const label = thicknessLabel(option.thicknessMm);
  return option.finish ? `${label}, ${option.finish}` : label;
}

/** Denumirea propusa: "Tablă cutată C-10 Standart Zn 0,45 mm Cr matt". Se poate modifica. */
export function sheetProductName(choice: SheetChoice): string {
  const kind = PROFILED_SHEET.has(choice.model)
    ? "Tablă cutată "
    : METAL_TILE.has(choice.model)
      ? "Țiglă metalică "
      : "";
  const finish = choice.finish ? ` ${choice.finish}` : "";
  return `${kind}${choice.model} ${choice.series} ${thicknessLabel(choice.thicknessMm)}${finish}`;
}
