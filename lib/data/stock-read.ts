// P3-136. Citirea loturilor si a liniilor de iesire pentru stoc, pe pagini.
//
// FISIER SEPARAT DE products.ts, FARA "server-only" SI FARA createClient: clientul
// vine ca argument, ca un test sa-i poata da unul fals si sa dovedeasca citirea pe
// pagini fara baza de date.

import { dedupeById, readAllPages, type CountedPage } from "./id-list";

export type QuantityRow = { id: string; product_id: string; quantity: unknown };

/** Forma minima a clientului pe care o folosesc citirile de mai jos. Clientul
 *  supabase-js o satisface; un test o satisface cu un obiect scris de mana. */
export type StockQuery = PromiseLike<CountedPage<QuantityRow>> & {
  in(column: string, values: string[]): StockQuery;
  eq(column: string, value: boolean): StockQuery;
  order(column: string): StockQuery;
  range(from: number, to: number): StockQuery;
};

export type StockClient = {
  from(table: "batches" | "outbound_lines"): {
    select(columns: string, options: { count: "exact" }): StockQuery;
  };
};

/** P3-178. Ce randuri se citesc: ale produselor date (`.in`), ale produselor
 *  active (filtrul catalogului, pus pe produsul legat), sau tot tabelul (null). */
export type StockScope = string[] | "active" | null;

/**
 * Toate randurile de cantitate ale unui tabel, pe pagini, in ordinea id.
 *
 * `scope` restrange citirea la produsele date, cu `.in`, sau la produsele active,
 * cu acelasi filtru ca al catalogului pus pe produsul legat (`products!inner`).
 * Fara el se citeste tot tabelul. Citirea nu se opreste la limita de randuri a
 * serverului: continua pana cand randurile adunate sunt cat totalul (vezi
 * readAllPages).
 *
 * P3-178. FILTRUL "active" EXISTA CA CITIREA STOCULUI SA NU MAI ASTEPTE CATALOGUL.
 * Alegerile din formulare restrangeau stocul la id-urile produselor active, deci
 * stocul pleca abia dupa ce venea catalogul: o cerere in plus la baza, una dupa
 * alta. Cu filtrul pus in cerere, cele doua citiri pleaca impreuna, iar cifrele
 * raman aceleasi.
 *
 * Ordinea este dupa id, care este unic, deci paginile nu se amesteca la valori
 * egale. Un rand citit de doua ori pentru ca un coleg a salvat intre doua pagini
 * se scoate cu dedupeById (id-list.ts); altfel ar fi numarat de doua ori in stoc.
 */
export async function readQuantityRows(
  client: StockClient,
  table: "batches" | "outbound_lines",
  what: string,
  scope: StockScope,
  pageSize: number,
): Promise<QuantityRow[]> {
  const columns =
    scope === "active" ? "id, product_id, quantity, products!inner(active)" : "id, product_id, quantity";
  const rows = await readAllPages<QuantityRow>(
    what,
    (from, to) => {
      const query = client.from(table).select(columns, { count: "exact" });
      const scoped =
        scope === "active" ? query.eq("products.active", true) : scope ? query.in("product_id", scope) : query;
      return scoped.order("id").range(from, to);
    },
    pageSize,
  );
  return dedupeById(rows);
}
