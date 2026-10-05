// Selectoarele de clienti citesc toti clientii activi, pe pagini. Nu atinge nici
// browserul, nici baza: clientul Supabase este fals. Peste 1000 de randuri in baza
// ar fi lent in CI, iar bucla de pagini este chiar ce se verifica.
import { expect, test } from "@playwright/test";
import {
  CLIENT_OPTIONS_READ_FAILED,
  readActiveClientOptions,
} from "@/lib/data/client-options-read";

type Row = { id: string; name: string };
type Page = { data: Row[] | null; error: { message: string } | null };

function fakeSupabase(pages: Page[]) {
  const ranges: [number, number][] = [];
  const orders: string[] = [];
  const query = {
    eq: () => query,
    order: (column: string) => {
      orders.push(column);
      return query;
    },
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return pages[ranges.length - 1] ?? { data: [], error: null };
    },
  };
  const client = { from: () => ({ select: () => query }) };
  return { client: client as never, ranges, orders };
}

const rows = (count: number, start: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(start + i),
    name: `Client ${String(start + i).padStart(5, "0")}`,
  }));

test("P3-166: selector clienti: 1000, 1000 si 250 de clienti se citesc toti, in trei pagini, ordonati", async () => {
  const last: Row = { id: "last", name: "Zz Ultimul client" };
  const { client, ranges, orders } = fakeSupabase([
    { data: rows(1000, 0), error: null },
    { data: rows(1000, 1000), error: null },
    { data: [...rows(249, 2000), last], error: null },
  ]);
  const all = await readActiveClientOptions(client);
  expect(all).toHaveLength(2250);
  expect(all[all.length - 1]).toEqual(last);
  expect(ranges).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  expect(orders.slice(0, 2)).toEqual(["name", "id"]);
});

test("P3-166: selector clienti: exact 1000 de clienti cere si o a doua pagina, goala", async () => {
  const { client, ranges } = fakeSupabase([{ data: rows(1000, 0), error: null }]);
  expect(await readActiveClientOptions(client)).toHaveLength(1000);
  expect(ranges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
});

test("P3-166: selector clienti: o citire care esueaza arunca, nu da lista goala", async () => {
  const first = fakeSupabase([{ data: null, error: { message: "boom" } }]);
  await expect(readActiveClientOptions(first.client)).rejects.toThrow(CLIENT_OPTIONS_READ_FAILED);

  const later = fakeSupabase([
    { data: rows(1000, 0), error: null },
    { data: null, error: { message: "boom" } },
  ]);
  await expect(readActiveClientOptions(later.client)).rejects.toThrow(CLIENT_OPTIONS_READ_FAILED);
});
