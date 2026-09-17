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
  /** P3-68: retrasa din lista de proprietar. Nu se mai ofera la un produs nou, dar
   *  un produs care o poarta deja o pastreaza. False cat timp 0048 nu este aplicata. */
  retired: boolean;
};

/** Ce trimite formularul la salvare: combinatia aleasa, fara unitate. */
export type SheetChoice = Pick<SheetOption, "model" | "series" | "thicknessMm" | "finish">;

/** P3-68: un rand al ecranului din Setari. Combinatia, linia ei de pret si starea. */
export type SheetOptionAdminRow = SheetOption & {
  /** Textul de model al liniei de pret, cheia pe care o impart profilele cu acelasi pret. */
  priceGroup: string;
  /** Cate combinatii impart linia de pret a acestui rand, el inclus. */
  priceLineShares: number;
};

/** P3-68: ce trimite formularul de adaugare. Textele asa cum le-a scris proprietarul. */
export type SheetOptionInput = {
  model: string;
  series: string;
  thicknessMm: string;
  finish: string;
  unit: string;
  priceGroup: string;
  priceLei: string;
};

/**
 * P3-68: grosimea scrisa de proprietar, "0,45" sau "0.45", adusa la "0.45".
 *
 * MAI STRICT DECAT normalizeThickness, care citeste ce vine din baza. Aici se refuza
 * o a treia zecimala in loc sa fie rotunjita tacut: numeric(3,2) ar rotunji 0,455
 * la 0,46, iar combinatia salvata nu ar mai fi cea scrisa pe ecran.
 */
export function parseThicknessInput(value: string): string | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/** P3-68: pretul scris de proprietar, "150,50" sau "150.5". Null daca nu este un pret. */
export function parsePriceInput(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

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
