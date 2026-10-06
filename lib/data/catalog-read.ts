// P3-178. Catalogul si stocul lui, citite in acelasi timp.
//
// FISIER SEPARAT DE products.ts, FARA "server-only" SI FARA createClient: citirile
// vin ca argumente, ca un test sa dovedeasca fara baza de date ca cele doua cereri
// pleaca impreuna. Aceeasi forma ca stock-read.ts.
//
// P3-136 a facut stocul sa astepte catalogul: alegerile din formulare cereau stocul
// numai pentru id-urile produselor active, iar id-urile veneau din catalog. O cerere
// la baza in plus, una dupa alta, pe Inventar, pe ecranul principal si in fiecare
// formular care alege un produs. Cifrele erau corecte, doar mai incet.

import { readAllPages, type CountedPage } from "./id-list";

export type CatalogReads<R> = {
  /** O pagina din catalog, cu totalul, in ordinea stabila (sku, apoi id). */
  catalogPage: (from: number, to: number) => PromiseLike<CountedPage<R>>;
  /** Stocul: al produselor active ("active") sau al tuturor (undefined). */
  stock: (scope: "active" | undefined) => Promise<Map<string, number>>;
};

/**
 * Tot catalogul (sau numai produsele active) si stocul lui, cu cele doua citiri
 * pornite in acelasi timp. Stocul nu are nevoie de id-urile catalogului: filtrul
 * "numai active" se pune in cererea de stoc (readQuantityRows).
 */
export async function readCatalogWithStock<R>(
  reads: CatalogReads<R>,
  activeOnly: boolean,
  pageSize: number,
): Promise<{ rows: R[]; stock: Map<string, number> }> {
  const [rows, stock] = await Promise.all([
    readAllPages<R>("catalogul", reads.catalogPage, pageSize),
    reads.stock(activeOnly ? "active" : undefined),
  ]);
  return { rows, stock };
}
