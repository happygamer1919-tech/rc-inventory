import { expect, test } from "@playwright/test";
import {
  readQuantityRows,
  type QuantityRow,
  type StockClient,
  type StockQuery,
} from "@/lib/data/stock-read";

// P3-136. Citirea pe pagini a loturilor si a liniilor de iesire, fara baza de
// date si fara browser, impotriva unui client fals.
//
// CLIENTUL FALS SE COMPORTA CA POSTGREST: taie orice raspuns la `cap` randuri, nu
// spune ca a taiat, si aduce totalul cerut cu { count: "exact" }. Fara paginare,
// un tabel de 2500 de randuri ar da 1000, adica un stoc gresit, fara nicio eroare.

type Call = { table: string; scope: string[] | null; from: number; to: number };

function fakeClient(tables: Record<string, QuantityRow[]>, cap: number, calls: Call[]): StockClient {
  return {
    from(table) {
      return {
        select() {
          let scope: string[] | null = null;
          let from = 0;
          let to = 0;
          const query: StockQuery = {
            in(_column, values) {
              scope = values;
              return query;
            },
            order() {
              return query;
            },
            range(f, t) {
              from = f;
              to = t;
              return query;
            },
            then(resolve, reject) {
              calls.push({ table, scope, from, to });
              const all = tables[table]!.filter((r) => !scope || scope.includes(r.product_id));
              const data = all.slice(from, Math.min(to + 1, from + cap));
              return Promise.resolve({ data, count: all.length, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
}

function rows(n: number, productOf: (i: number) => string = () => "p1"): QuantityRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${String(i).padStart(5, "0")}`,
    product_id: productOf(i),
    quantity: "1",
  }));
}

test("P3-136: o citire de 2500 de randuri sub o limita de 1000 vine toata, in 3 cereri", async () => {
  const calls: Call[] = [];
  const client = fakeClient({ batches: rows(2500) }, 1000, calls);

  const got = await readQuantityRows(client, "batches", "loturile", null, 1000);

  expect(got).toHaveLength(2500);
  expect(new Set(got.map((r) => r.id)).size).toBe(2500);
  expect(calls.map((c) => [c.from, c.to])).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("P3-136: un tabel sub limita se citeste intr-o singura cerere, ca inainte", async () => {
  const calls: Call[] = [];
  const client = fakeClient({ outbound_lines: rows(400) }, 1000, calls);

  const got = await readQuantityRows(client, "outbound_lines", "liniile", null, 1000);

  expect(got).toHaveLength(400);
  expect(calls).toHaveLength(1);
});

test("P3-136: citirea restransa la produse cere doar randurile lor", async () => {
  const calls: Call[] = [];
  const all = rows(1500, (i) => (i % 3 === 0 ? "wanted" : "other"));
  const client = fakeClient({ batches: all }, 1000, calls);

  const got = await readQuantityRows(client, "batches", "loturile", ["wanted"], 1000);

  expect(got).toHaveLength(500);
  expect(got.every((r) => r.product_id === "wanted")).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.scope).toEqual(["wanted"]);
});

test("P3-136: un server care taie sub marimea paginii nu pierde randuri", async () => {
  const calls: Call[] = [];
  const client = fakeClient({ batches: rows(2500) }, 400, calls);

  const got = await readQuantityRows(client, "batches", "loturile", null, 1000);

  expect(got).toHaveLength(2500);
});
