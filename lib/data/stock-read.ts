// P3-136. Citirea loturilor si a liniilor de iesire pentru stoc, pe pagini.
//
// FISIER SEPARAT DE products.ts, FARA "server-only" SI FARA createClient: clientul
// vine ca argument, ca un test sa-i poata da unul fals si sa dovedeasca citirea pe
// pagini fara baza de date.

import { readAllPages, type CountedPage } from "./id-list";

export type QuantityRow = { id: string; product_id: string; quantity: unknown };

/** Forma minima a clientului pe care o folosesc citirile de mai jos. Clientul
 *  supabase-js o satisface; un test o satisface cu un obiect scris de mana. */
export type StockQuery = PromiseLike<CountedPage<QuantityRow>> & {
  in(column: string, values: string[]): StockQuery;
  order(column: string): StockQuery;
  range(from: number, to: number): StockQuery;
};

export type StockClient = {
  from(table: "batches" | "outbound_lines"): {
    select(columns: string, options: { count: "exact" }): StockQuery;
  };
};

/**
 * Toate randurile de cantitate ale unui tabel, pe pagini, in ordinea id.
 *
 * `scope` restrange citirea la produsele date, cu `.in`. Fara el se citeste tot
 * tabelul. Citirea nu se opreste la limita de randuri a serverului: continua pana
 * cand randurile adunate sunt cat totalul (vezi readAllPages).
 */
export function readQuantityRows(
  client: StockClient,
  table: "batches" | "outbound_lines",
  what: string,
  scope: string[] | null,
  pageSize: number,
): Promise<QuantityRow[]> {
  return readAllPages<QuantityRow>(
    what,
    (from, to) => {
      const query = client.from(table).select("id, product_id, quantity", { count: "exact" });
      return (scope ? query.in("product_id", scope) : query).order("id").range(from, to);
    },
    pageSize,
  );
}
