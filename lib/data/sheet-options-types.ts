// P3-57. Tabla cutata si tigla metalica, alese din lista Dasterum verificata.
//
// Fisierul este comun browserului si serverului: formularul construieste din el
// listele si denumirea, iar serverul verifica forma alegerii. Lista insasi vine din
// baza, din public.sheet_options (migratia 0046), si nu este copiata aici: o a doua
// copie ar fi o lista care poate sa nu mai spuna acelasi lucru.
//
// FARA PRETURI. Coloana de lei a listei este pentru alt card.

import type { UnitCode } from "./units";

/** O combinatie din lista: model, serie, grosime si finisaj. */
export type SheetOption = {
  model: string;
  series: string;
  /** Grosimea in milimetri, cu doua zecimale si punct, ca in baza: "0.45". */
  thicknessMm: string;
  /** Finisajul, sau sirul gol cand lista nu numeste unul. */
  finish: string;
  /** Unitatea cu care se completeaza produsul: m2, sau pcs pentru Dastera. */
  unit: UnitCode;
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
