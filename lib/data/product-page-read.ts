// P3-142. O PAGINA DIN CATALOG, citita cu filtrele puse in cerere, si stocul numai pentru ea.
//
// FISIER SEPARAT DE products.ts, FARA "server-only" SI FARA createClient, ca stock-read.ts:
// clientul si citirea stocului vin ca argumente, ca un test sa le dea unele false si sa
// dovedeasca, fara baza de date, ca pagina 2 dintr-un catalog de 340 costa o cerere de
// randuri si ca stocul se cere numai pentru cele 50 de id-uri de pe ea.

import type { CountedPage } from "./id-list";
import { LIST_PAGE_SIZE, readPage, type PageRead } from "./list-paging";
import type { Visibility } from "./product-filter";

/** Filtrele pe care baza le poate aplica singura. Cautarea si nivelul de stoc nu sunt aici:
 *  vezi listProductsPage, in products.ts, pentru ce se intampla cu ele. */
export type QueryFilter = {
  category: string;
  supplier: string;
  visibility: Visibility;
};

type Result<T> = Omit<CountedPage<T>, "error"> & { error: { message: string; code?: string } | null };

/** Forma minima a clientului. Clientul supabase-js o satisface; un test o satisface cu un
 *  obiect scris de mana. */
export type ProductQuery<Row> = PromiseLike<Result<Row>> & {
  eq(column: string, value: string | boolean): ProductQuery<Row>;
  order(column: string, options?: { ascending: boolean }): ProductQuery<Row>;
  range(from: number, to: number): ProductQuery<Row>;
};

export type ProductPageClient<Row> = {
  from(table: "products"): {
    select(columns: string, options: { count: "exact" }): ProductQuery<Row>;
  };
};

/** Filtrul pus pe o cerere: activ/inactiv, categorie, furnizor. Acelasi pentru pagina si
 *  pentru numaratorile de langa ea, ca cifrele sa fie ale aceleiasi liste. */
export function applyQueryFilter<Q extends { eq(column: string, value: string | boolean): Q }>(
  query: Q,
  filter: QueryFilter,
): Q {
  let q = query;
  if (filter.visibility === "active") q = q.eq("active", true);
  if (filter.visibility === "inactive") q = q.eq("active", false);
  if (filter.category) q = q.eq("category_id", filter.category);
  // Furnizorul se filtreaza pe id, nu pe nume (P3-05): doua scrieri ale aceluiasi furnizor
  // erau doua optiuni si un filtru gasea doar jumatate.
  if (filter.supplier) q = q.eq("supplier_id", filter.supplier);
  return q;
}

/**
 * Pagina `page` din catalog, in ordinea cunoscuta (sku, apoi id ca departajare stabila),
 * cu totalul listei filtrate, si stocul calculat NUMAI pentru produsele de pe pagina.
 *
 * `stockFor(ids)` primeste exact id-urile de pe pagina: o pagina are cel mult
 * LIST_PAGE_SIZE (50), sub ID_LIST_BATCH_SIZE (100), deci citirea de stoc intra in
 * ramura cu `.in` si nu mai citeste toate loturile si toate liniile de iesire.
 */
export async function readProductPage<Row extends { id: string }>(
  client: ProductPageClient<Row>,
  columns: string,
  filter: QueryFilter,
  page: number,
  stockFor: (ids: string[]) => Promise<Map<string, number>>,
  size: number = LIST_PAGE_SIZE,
): Promise<PageRead<Row> & { stock: Map<string, number> }> {
  const read = await readPage<Row>(
    "catalogul",
    (from, to) =>
      applyQueryFilter(client.from("products").select(columns, { count: "exact" }), filter)
        .order("sku", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    page,
    size,
  );
  const stock = read.rows.length > 0 ? await stockFor(read.rows.map((r) => r.id)) : new Map<string, number>();
  return { ...read, stock };
}
