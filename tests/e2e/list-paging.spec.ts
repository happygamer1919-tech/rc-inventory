import { expect, test } from "@playwright/test";
import {
  clampPage,
  pageCount,
  pageLabel,
  parsePage,
  rangeLabel,
  readPage,
} from "@/lib/data/list-paging";
import {
  readProductPage,
  type ProductPageClient,
  type ProductQuery,
} from "@/lib/data/product-page-read";
import { readIssuePage, type IssueClient, type IssueQuery } from "@/lib/data/outbound-page-read";
import {
  readQuantityRows,
  type QuantityRow,
  type StockClient,
  type StockQuery,
} from "@/lib/data/stock-read";

// P3-142. O pagina din lista de inventar si din lista de iesiri, fara baza de date si fara
// browser, impotriva unor clienti falsi. Stilul este cel din stock-read-paging.spec.ts.
//
// CLIENTII FALSI SE COMPORTA CA POSTGREST: aplica filtrele `eq`, numara randurile filtrate
// pentru { count: "exact" }, taie dupa `range`, si raspund PGRST103 cand `from` este dincolo
// de ultimul rand. Fiecare cerere se inregistreaza, ca testul sa poata numara cererile.

type ProductRow = { id: string; sku: string; active: boolean; category_id: string };
type IssueRow = { id: string; reference: string; project_id: string; status: string };

type Call = { table: string; head: boolean; eq: Array<[string, unknown]>; from: number; to: number };

/** Un tabel fals, deja in ordinea in care o cere cititorul (sku, respectiv cel mai nou intai). */
function fakeTable<Row extends Record<string, unknown>>(table: string, all: Row[], calls: Call[]) {
  return (head: boolean) => {
    const eq: Array<[string, unknown]> = [];
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;
    const query = {
      eq(column: string, value: unknown) {
        eq.push([column, value]);
        return query;
      },
      or() {
        return query;
      },
      order() {
        return query;
      },
      range(f: number, t: number) {
        from = f;
        to = t;
        return query;
      },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        calls.push({ table, head, eq: [...eq], from, to });
        const filtered = all.filter((r) => eq.every(([column, value]) => r[column] === value));
        if (head) return Promise.resolve({ count: filtered.length, error: null }).then(resolve, reject);
        const outOfRange = from >= filtered.length && filtered.length > 0;
        const result = outOfRange
          ? { data: null, count: null, error: { message: "Requested range not satisfiable", code: "PGRST103" } }
          : { data: filtered.slice(from, to + 1), count: filtered.length, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  };
}

function catalog(n: number): ProductRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i + 1).padStart(4, "0")}`,
    sku: `SKU-${String(i + 1).padStart(4, "0")}`,
    active: true,
    category_id: i % 2 === 0 ? "even" : "odd",
  }));
}

function productClient(all: ProductRow[], calls: Call[]): ProductPageClient<ProductRow> {
  const make = fakeTable("products", all, calls);
  return {
    from: () => ({ select: () => make(false) as unknown as ProductQuery<ProductRow> }),
  } as ProductPageClient<ProductRow>;
}

const ALL_ACTIVE = { category: "", supplier: "", visibility: "active" as const };

test("P3-142: pagina 2 dintr-un catalog de 340 de produse are randurile 51 pana la 100, totalul 340, intr-o cerere", async () => {
  const calls: Call[] = [];
  const client = productClient(catalog(340), calls);
  const stockAsks: string[][] = [];

  const got = await readProductPage(client, "id, sku", ALL_ACTIVE, 2, async (ids) => {
    stockAsks.push(ids);
    return new Map(ids.map((id) => [id, 1]));
  });

  expect(got.rows).toHaveLength(50);
  expect(got.rows[0]!.sku).toBe("SKU-0051");
  expect(got.rows[49]!.sku).toBe("SKU-0100");
  expect(got.total).toBe(340);
  expect(got.page).toBe(2);
  // O singura cerere de randuri, cu intervalul 50..99.
  expect(calls).toHaveLength(1);
  expect([calls[0]!.from, calls[0]!.to]).toEqual([50, 99]);
  // Filtrul de activ este in cerere, nu aplicat pe pagina.
  expect(calls[0]!.eq).toEqual([["active", true]]);
  // Stocul se cere o singura data, numai pentru cele 50 de id-uri de pe pagina.
  expect(stockAsks).toHaveLength(1);
  expect(stockAsks[0]).toEqual(got.rows.map((r) => r.id));
  expect(stockAsks[0]).toHaveLength(50);
});

test("P3-142: citirea de stoc a paginii cere cu `.in` numai cele 50 de id-uri, nu tot tabelul", async () => {
  const productCalls: Call[] = [];
  const stockCalls: Array<{ table: string; scope: string[] | null }> = [];
  const batches: QuantityRow[] = catalog(340).map((p) => ({ id: `b-${p.id}`, product_id: p.id, quantity: "2" }));

  // Clientul de stoc fals, ca in stock-read-paging.spec.ts.
  const stockClient: StockClient = {
    from(table) {
      return {
        select() {
          let scope: string[] | null = null;
          const query: StockQuery = {
            in(_c, values) {
              scope = values;
              return query;
            },
            order: () => query,
            range: () => query,
            then(resolve, reject) {
              stockCalls.push({ table, scope });
              const data = (table === "batches" ? batches : []).filter((r) => !scope || scope.includes(r.product_id));
              return Promise.resolve({ data, count: data.length, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };

  const got = await readProductPage(
    productClient(catalog(340), productCalls),
    "id, sku",
    ALL_ACTIVE,
    2,
    async (ids) => {
      const rows = await readQuantityRows(stockClient, "batches", "loturile", ids, 1000);
      return new Map(rows.map((r) => [r.product_id, Number(r.quantity)]));
    },
  );

  expect(got.stock.size).toBe(50);
  const ids = new Set(got.rows.map((r) => r.id));
  expect(stockCalls.length).toBeGreaterThan(0);
  for (const call of stockCalls) {
    expect(call.scope, "fiecare citire de stoc este restransa la produsele paginii").not.toBeNull();
    expect(new Set(call.scope)).toEqual(ids);
  }
});

test("P3-142: categoria si furnizorul se pun in cerere, iar o pagina dincolo de capat aduce ultima", async () => {
  const calls: Call[] = [];
  const client = productClient(catalog(340), calls);

  const got = await readProductPage(
    client,
    "id, sku",
    { category: "even", supplier: "", visibility: "toate" },
    99,
    async () => new Map(),
  );

  // 170 de produse pe categorie "even": 4 pagini, ultima are 20.
  expect(got.total).toBe(170);
  expect(got.page).toBe(4);
  expect(got.rows).toHaveLength(20);
  expect(calls.every((c) => c.eq.some(([column, value]) => column === "category_id" && value === "even"))).toBe(true);
  // Vizibilitatea "toate" nu pune niciun filtru pe `active`.
  expect(calls.every((c) => !c.eq.some(([column]) => column === "active"))).toBe(true);
});

function issues(n: number): IssueRow[] {
  // Cea mai noua intai: IES-0340 ... IES-0001.
  return Array.from({ length: n }, (_, i) => ({
    id: `i${String(n - i).padStart(4, "0")}`,
    reference: `IES-${String(n - i).padStart(4, "0")}`,
    project_id: i % 2 === 0 ? "proj-a" : "proj-b",
    status: i % 4 === 0 ? "awaiting_shipment" : "shipped",
  }));
}

function issueClient(all: IssueRow[], calls: Call[]): IssueClient<IssueRow> {
  const make = fakeTable("outbound_issues", all, calls);
  return {
    from: () => ({
      select: (_columns: string, options: { count: "exact"; head?: true }) =>
        make(options.head === true) as unknown as IssueQuery<never>,
    }),
  } as unknown as IssueClient<IssueRow>;
}

const LINES_ORDER = { referencedTable: "outbound_lines", ascending: true } as const;

test("P3-142: pagina 2 din 340 de iesiri are randurile 51 pana la 100, totalul 340, intr-o cerere de randuri", async () => {
  const calls: Call[] = [];
  const got = await readIssuePage(issueClient(issues(340), calls), "id", {}, 2, LINES_ORDER);

  expect(got.rows).toHaveLength(50);
  expect(got.rows[0]!.reference).toBe("IES-0290");
  expect(got.rows[49]!.reference).toBe("IES-0241");
  expect(got.total).toBe(340);
  expect(got.page).toBe(2);

  const rowCalls = calls.filter((c) => !c.head);
  expect(rowCalls).toHaveLength(1);
  expect([rowCalls[0]!.from, rowCalls[0]!.to]).toEqual([50, 99]);
  // Numarul celor de expediat vine din baza, ca numaratoare, nu din pagina: 340 / 4 = 85.
  expect(got.awaiting).toBe(85);
  expect(calls.filter((c) => c.head)).toHaveLength(1);
});

test("P3-142: filtrul de proiect si cel de fel se pun in cererea iesirilor", async () => {
  const calls: Call[] = [];
  const got = await readIssuePage(
    issueClient(issues(340), calls),
    "id",
    { projectId: "proj-a" },
    1,
    LINES_ORDER,
  );
  expect(got.total).toBe(170);
  expect(got.rows).toHaveLength(50);
  expect(calls.every((c) => c.eq.some(([column, value]) => column === "project_id" && value === "proj-a"))).toBe(true);
});

test("P3-142: ajutoarele de pagina: numarul din adresa, numarul de pagini, textele", () => {
  expect(parsePage(undefined)).toBe(1);
  expect(parsePage("")).toBe(1);
  expect(parsePage("0")).toBe(1);
  expect(parsePage("-3")).toBe(1);
  expect(parsePage("abc")).toBe(1);
  expect(parsePage("2")).toBe(2);
  expect(parsePage("12")).toBe(12);

  expect(pageCount(0)).toBe(1);
  expect(pageCount(50)).toBe(1);
  expect(pageCount(51)).toBe(2);
  expect(pageCount(340)).toBe(7);
  expect(clampPage(99, 340)).toBe(7);
  expect(clampPage(0, 340)).toBe(1);

  expect(pageLabel(2, 340)).toBe("Pagina 2 din 7");
  expect(rangeLabel(2, 340)).toBe("Afișate 51-100 din 340");
  expect(rangeLabel(7, 340)).toBe("Afișate 301-340 din 340");
  // Cratima simpla, nu linie lunga (nici en dash, nici em dash).
  expect(rangeLabel(2, 340)).not.toContain(String.fromCharCode(0x2013));
  expect(rangeLabel(2, 340)).not.toContain(String.fromCharCode(0x2014));
});

test("P3-142: un total lipsa sau o eroare de la server este un esec vizibil, nu o pagina goala", async () => {
  await expect(
    readPage("lista", async () => ({ data: [], count: null, error: null }), 1),
  ).rejects.toThrow(/numarul total/);
  await expect(
    readPage("lista", async () => ({ data: null, count: null, error: { message: "boom" } }), 1),
  ).rejects.toThrow(/boom/);
});
