// P3-142. O PAGINA din lista de iesiri, cu filtrele puse in cerere.
//
// FISIER SEPARAT DE outbound.ts, FARA "server-only" SI FARA createClient, ca stock-read.ts:
// clientul vine ca argument, ca un test sa-i poata da unul fals si sa dovedeasca, fara
// baza de date, ca pagina 2 dintr-o lista de iesiri costa o singura cerere de randuri.

import type { CountedPage } from "./id-list";
import { LIST_PAGE_SIZE, readPage } from "./list-paging";

type Result<T> = Omit<CountedPage<T>, "error"> & { error: { message: string; code?: string } | null };
type CountResult = { count: number | null; error: { message: string } | null };

/** Forma minima a clientului. Clientul supabase-js o satisface; un test o satisface cu un
 *  obiect scris de mana. */
export type IssueQuery<R> = PromiseLike<R> & {
  eq(column: string, value: string): IssueQuery<R>;
  or(filters: string): IssueQuery<R>;
  order(column: string, options?: { ascending?: boolean; referencedTable?: string }): IssueQuery<R>;
  range(from: number, to: number): IssueQuery<R>;
};

export type IssueClient<Row> = {
  from(table: "outbound_issues"): {
    select(columns: string, options: { count: "exact" }): IssueQuery<Result<Row>>;
    select(columns: string, options: { count: "exact"; head: true }): IssueQuery<CountResult>;
  };
};

/** Ce ingusteaza lista, deja tradus in conditii de coloana. Lipsa unui camp inseamna ca nu
 *  se filtreaza dupa el. */
export type IssueScope = {
  projectId?: string;
  /** Conditie `.or(...)` deja scrisa: iesirile pe proiectele clientului sau catre el direct. */
  clientClause?: string | null;
  /** Conditii `coloana = valoare` in plus, puse de apelant. Felul eliberarii vine asa, nu
   *  numit aici: coloana lui exista numai dupa migratia 0067, deci o numeste numai fisierul
   *  care intreaba poarta (lib/data/outbound.ts), iar acest fisier nu citeste schema. */
  equals?: Array<[column: string, value: string]>;
};

/** O ordine de linii imbricate, ca in listOutboundIssues (P3-115). */
type LinesOrder = { readonly referencedTable: string; readonly ascending: boolean };

export type IssuePageRead<Row> = {
  rows: Row[];
  total: number;
  /** Din total, cate sunt de expediat. */
  awaiting: number;
  page: number;
};

function narrow<R>(query: IssueQuery<R>, scope: IssueScope): IssueQuery<R> {
  let q = query;
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  if (scope.clientClause) q = q.or(scope.clientClause);
  for (const [column, value] of scope.equals ?? []) q = q.eq(column, value);
  return q;
}

/**
 * Pagina `page` de iesiri, cea mai noua intai (id ca departajare stabila), cu liniile lor in
 * ordinea ceruta de P3-115, totalul exact si numarul celor de expediat.
 */
export async function readIssuePage<Row>(
  client: IssueClient<Row>,
  select: string,
  scope: IssueScope,
  page: number,
  linesOrder: LinesOrder,
  size: number = LIST_PAGE_SIZE,
): Promise<IssuePageRead<Row>> {
  const read = await readPage<Row>(
    "ieșirile",
    (from, to) =>
      narrow(client.from("outbound_issues").select(select, { count: "exact" }), scope)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .order("created_at", linesOrder)
        .order("id", linesOrder)
        .range(from, to),
    page,
    size,
  );

  const { count, error } = await narrow(
    client.from("outbound_issues").select("id", { count: "exact", head: true }),
    scope,
  ).eq("status", "awaiting_shipment");
  if (error) throw new Error(`Nu s-au putut număra ieșirile de expediat: ${error.message}`);

  return { rows: read.rows, total: read.total, awaiting: count ?? 0, page: read.page };
}
