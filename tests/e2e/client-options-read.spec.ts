// Selectoarele de clienti citesc toti clientii activi, pe pagini numarate. Nu atinge
// nici browserul, nici baza: clientul Supabase este fals. Bucla de pagini si
// numaratoarea sunt chiar ce se verifica. P3-189: citirea nu mai depinde de
// marimea paginii si nici de limita serverului.
import { expect, test } from "@playwright/test";
import {
  CLIENT_OPTIONS_READ_FAILED,
  readActiveClientOptions,
} from "@/lib/data/client-options-read";

type Row = { id: string; name: string };

/** Un server fals: taie fiecare raspuns la `cap` randuri si spune totalul. */
function fakeSupabase(all: Row[], opts: { cap?: number; failAt?: number } = {}) {
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
      if (opts.failAt === ranges.length) {
        return { data: null, count: null, error: { message: "boom" } };
      }
      const end = Math.min(to, from + (opts.cap ?? Infinity) - 1);
      return { data: all.slice(from, end + 1), count: all.length, error: null };
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

test("P3-166: selector clienti: 2250 de clienti se citesc toti, pe pagini, ordonati", async () => {
  const last: Row = { id: "last", name: "Zz Ultimul client" };
  const { client, ranges, orders } = fakeSupabase([...rows(2249, 0), last]);
  const all = await readActiveClientOptions(client);
  expect(all).toHaveLength(2250);
  expect(all[all.length - 1]).toEqual(last);
  expect(ranges[0]).toEqual([0, 499]);
  expect(ranges.length).toBe(5);
  expect(orders.slice(0, 2)).toEqual(["name", "id"]);
});

test("P3-189: selector clienti: un server care taie la 3 randuri tot da toti cei 7", async () => {
  const { client } = fakeSupabase(rows(7, 0), { cap: 3 });
  expect(await readActiveClientOptions(client)).toHaveLength(7);
});

test("P3-166: selector clienti: o citire care esueaza arunca, nu da lista goala", async () => {
  const first = fakeSupabase(rows(10, 0), { failAt: 1 });
  await expect(readActiveClientOptions(first.client)).rejects.toThrow(CLIENT_OPTIONS_READ_FAILED);

  const later = fakeSupabase(rows(1200, 0), { failAt: 2 });
  await expect(readActiveClientOptions(later.client)).rejects.toThrow(CLIENT_OPTIONS_READ_FAILED);
});
