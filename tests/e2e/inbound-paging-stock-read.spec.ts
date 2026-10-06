import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { readCatalogWithStock } from "@/lib/data/catalog-read";
import type { CountedPage } from "@/lib/data/id-list";
import { readInboundOrderRows, type InboundClient, type InboundQuery } from "@/lib/data/inbound-read";
import {
  readQuantityRows,
  type QuantityRow,
  type StockClient,
  type StockQuery,
} from "@/lib/data/stock-read";

// P3-178. Fara baza de date si fara browser, impotriva unor clienti falsi.
//
// (1) Comenzile de intrare se citesc pe pagini, pana la capat: peste 1000, lista se
//     oprea tacut la 1000.
// (2) In listProducts, catalogul si stocul pornesc impreuna: stocul nu mai asteapta
//     id-urile catalogului.
// (3) Loturile si liniile de iesire se citesc in ordinea id (unic, deci ultimul
//     criteriu), iar un rand citit de doua ori intre doua pagini nu se numara de
//     doua ori.

type Order = { id: string; created_at: string };

function orders(n: number): Order[] {
  // Cele mai noi intai, cum le cere citirea.
  return Array.from({ length: n }, (_, i) => ({
    id: `o${String(n - i).padStart(5, "0")}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + (n - i) * 60_000).toISOString(),
  }));
}

function fakeInbound(all: Order[], cap: number, calls: Array<{ from: number; to: number; order: string[] }>) {
  const client: InboundClient<Order> = {
    from() {
      return {
        select() {
          const order: string[] = [];
          let from = 0;
          let to = 0;
          const query: InboundQuery<Order> = {
            order(column, options) {
              order.push(`${column} ${options.ascending ? "asc" : "desc"}`);
              return query;
            },
            range(f, t) {
              from = f;
              to = t;
              return query;
            },
            then(resolve, reject) {
              calls.push({ from, to, order });
              const data = all.slice(from, Math.min(to + 1, from + cap));
              return Promise.resolve({ data, count: all.length, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
  return client;
}

test("P3-178: listInboundOrders citeste 1200 de comenzi in trei pagini, nu se opreste la 1000", async () => {
  const calls: Array<{ from: number; to: number; order: string[] }> = [];
  const all = orders(1200);
  // Serverul fals taie la 1000, ca PostgREST, fara sa spuna.
  const got = await readInboundOrderRows(fakeInbound(all, 1000, calls), "id, created_at");

  expect(got).toHaveLength(1200);
  expect(got.map((o) => o.id)).toEqual(all.map((o) => o.id));
  expect(calls.map((c) => [c.from, c.to])).toEqual([
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
  // Aceeasi ordine ca inainte (cele mai noi intai), cu id ca ultima departajare.
  for (const c of calls) expect(c.order).toEqual(["created_at desc", "id desc"]);
});

test("P3-178: listInboundOrders trece prin readInboundOrderRows (citirea pe pagini)", async () => {
  const source = readFileSync(path.join(process.cwd(), "lib/data/inbound.ts"), "utf8");
  const body = source.slice(source.indexOf("export async function listInboundOrders"));
  const fn = body.slice(0, body.indexOf("\n}\n"));
  expect(fn).toContain("readInboundOrderRows");
  expect(fn).not.toContain(".from(\"inbound_orders\")");
});

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("P3-178: catalogul si stocul pornesc amandoua inainte ca vreuna sa raspunda", async () => {
  for (const activeOnly of [true, false]) {
    const events: string[] = [];
    const catalog = deferred<CountedPage<{ id: string }>>();
    const stock = deferred<Map<string, number>>();

    const pending = readCatalogWithStock<{ id: string }>(
      {
        catalogPage: () => {
          events.push("catalog started");
          return catalog.promise;
        },
        stock: (scope) => {
          events.push(`stock started ${scope ?? "all"}`);
          return stock.promise;
        },
      },
      activeOnly,
      1000,
    );

    // Nimic nu a raspuns inca, si amandoua citirile au plecat deja.
    await Promise.resolve();
    expect(events).toEqual(["catalog started", `stock started ${activeOnly ? "active" : "all"}`]);

    stock.resolve(new Map([["p1", 7]]));
    catalog.resolve({ data: [{ id: "p1" }], count: 1, error: null });
    const got = await pending;
    expect(got.rows).toEqual([{ id: "p1" }]);
    expect(got.stock.get("p1")).toBe(7);
  }
});

test("P3-178: listProducts foloseste citirea impreuna, nu stocul dupa catalog", async () => {
  const source = readFileSync(path.join(process.cwd(), "lib/data/products.ts"), "utf8");
  const body = source.slice(source.indexOf("export async function listProducts"));
  const fn = body.slice(0, body.indexOf("\n}\n"));
  expect(fn).toContain("readCatalogWithStock");
  expect(fn).not.toContain("rows.map((r) => r.id)");
});

type StockCall = { table: string; select: string; order: string[]; eq: Array<[string, boolean]>; from: number };

/** Server fals de stoc. `between` ruleaza intre prima si a doua pagina: acolo un
 *  coleg salveaza, iar randurile se schimba sub citire. */
function fakeStock(
  tables: Record<string, QuantityRow[]>,
  calls: StockCall[],
  between?: (table: string) => void,
): StockClient {
  return {
    from(table) {
      return {
        select(columns) {
          const call: StockCall = { table, select: columns, order: [], eq: [], from: 0 };
          let to = 0;
          let scope: string[] | null = null;
          const query: StockQuery = {
            in(_c, values) {
              scope = values;
              return query;
            },
            eq(column, value) {
              call.eq.push([column, value]);
              return query;
            },
            order(column) {
              call.order.push(column);
              return query;
            },
            range(f, t) {
              call.from = f;
              to = t;
              return query;
            },
            then(resolve, reject) {
              if (call.from > 0 && between) between(table);
              calls.push(call);
              const sorted = [...tables[table]!]
                .filter((r) => !scope || scope.includes(r.product_id))
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
              const data = sorted.slice(call.from, to + 1);
              return Promise.resolve({ data, count: sorted.length, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
}

function qty(n: number, prefix: string): QuantityRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(i * 10).padStart(5, "0")}`,
    product_id: "p1",
    quantity: "1",
  }));
}

test("P3-178: loturile si liniile de iesire se cer in ordinea id, ultimul criteriu", async () => {
  for (const table of ["batches", "outbound_lines"] as const) {
    const calls: StockCall[] = [];
    await readQuantityRows(fakeStock({ [table]: qty(25, "r") }, calls), table, "x", null, 10);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.order).toEqual(["id"]);
  }
});

test("P3-178: un rand salvat si unul sters intre doua pagini nu dubleaza un rand in stoc", async () => {
  for (const table of ["batches", "outbound_lines"] as const) {
    const rows = qty(20, "r");
    let changed = false;
    const calls: StockCall[] = [];
    // Intre pagini, un coleg salveaza un rand care cade INAINTEA pozitiei citite
    // (id mic) si altul sterge un rand de dupa ea: totalul ramane 20, iar ultimul
    // rand al primei pagini revine la inceputul celei de a doua.
    const client = fakeStock({ [table]: rows }, calls, (t) => {
      if (changed) return;
      changed = true;
      const list = rows;
      list.splice(list.length - 1, 1);
      list.push({ id: "a00000", product_id: "p1", quantity: "1" });
      expect(t).toBe(table);
    });

    const got = await readQuantityRows(client, table, "x", null, 10);

    const ids = got.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Randul care a venit de doua ori este numarat o singura data.
    expect(ids.filter((id) => id === "r00090")).toHaveLength(1);
  }
});

test("P3-178: stocul produselor active se cere cu filtrul catalogului, nu cu lista de id-uri", async () => {
  const calls: StockCall[] = [];
  await readQuantityRows(fakeStock({ batches: qty(3, "r") }, calls), "batches", "x", "active", 10);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.select).toContain("products!inner(active)");
  expect(calls[0]!.eq).toEqual([["products.active", true]]);
  expect(calls[0]!.order).toEqual(["id"]);
});
