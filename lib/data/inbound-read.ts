// P3-178. Citirea comenzilor de intrare, pe pagini.
//
// FISIER SEPARAT DE inbound.ts, FARA "server-only" SI FARA createClient: clientul
// vine ca argument, ca un test sa-i poata da unul fals si sa dovedeasca citirea pe
// pagini fara baza de date. Aceeasi forma ca stock-read.ts.
//
// INAINTE, listInboundOrders citea intr-o singura cerere, fara pagini. PostgREST
// taie orice lista la `max_rows` randuri si nu spune, deci peste 1000 de comenzi
// cele mai vechi dispareau de pe Comenzi si din sosirile asteptate de pe ecranul
// principal, fara niciun mesaj. Acum citirea merge pana la capat prin
// readAllPages, care cere si totalul si face din orice nepotrivire un esec vizibil.

import { dedupeById, readAllPages, type CountedPage } from "./id-list";

/** Forma minima a clientului pe care o foloseste citirea de mai jos. */
export type InboundQuery<T> = PromiseLike<CountedPage<T>> & {
  order(column: string, options: { ascending: boolean }): InboundQuery<T>;
  range(from: number, to: number): InboundQuery<T>;
};

export type InboundClient<T> = {
  from(table: "inbound_orders"): {
    select(columns: string, options: { count: "exact" }): InboundQuery<T>;
  };
};

/**
 * Toate comenzile de intrare, cele mai noi intai, pe pagini.
 *
 * Ordinea este cea de dinainte (created_at descrescator), cu id ca departajare,
 * ca doua comenzi create in aceeasi clipa sa nu-si schimbe locul intre doua
 * pagini. Un rand citit de doua ori (vezi dedupeById) nu ajunge de doua ori pe
 * ecran.
 */
export async function readInboundOrderRows<T extends { id: string }>(
  client: InboundClient<T>,
  columns: string,
  pageSize?: number,
): Promise<T[]> {
  const rows = await readAllPages<T>(
    "comenzile de intrare",
    (from, to) =>
      client
        .from("inbound_orders")
        .select(columns, { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    pageSize,
  );
  return dedupeById(rows);
}
