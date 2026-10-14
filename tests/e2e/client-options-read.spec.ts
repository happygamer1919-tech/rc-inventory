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
function fakeSupabase(
  all: Row[],
  opts: { cap?: number; failAt?: number; afterRange?: (n: number) => void } = {},
) {
  const ranges: [number, number][] = [];
  const orders: string[] = [];
  const selects: string[] = [];
  let select = "";
  const query = {
    eq: () => query,
    order: (column: string) => {
      orders.push(column);
      return query;
    },
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      selects.push(select);
      if (opts.failAt === ranges.length) {
        return { data: null, count: null, error: { message: "boom" } };
      }
      const end = Math.min(to, from + (opts.cap ?? Infinity) - 1);
      const page = { data: all.slice(from, end + 1), count: all.length, error: null };
      opts.afterRange?.(ranges.length);
      return page;
    },
  };
  const client = {
    from: () => ({
      select: (columns: string) => {
        select = columns;
        return query;
      },
    }),
  };
  return { client: client as never, ranges, orders, selects };
}

const rows = (count: number, start: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(start + i),
    name: `Client ${String(start + i).padStart(5, "0")}`,
  }));

test("P3-166: selector clienti: 2250 de clienti se citesc toti, pe pagini, ordonati", async () => {
  const last: Row = { id: "last", name: "Zz Ultimul client" };
  const { client, ranges, orders, selects } = fakeSupabase([...rows(2249, 0), last]);
  const all = await readActiveClientOptions(client);
  expect(all).toHaveLength(2250);
  expect(all[all.length - 1]).toEqual(last);
  expect(ranges[0]).toEqual([0, 499]);
  // P3-287. Cinci pagini de randuri, apoi aceleasi cinci numai cu id-uri (citirea de control).
  expect(ranges.length).toBe(10);
  expect(ranges.slice(5)).toEqual(ranges.slice(0, 5));
  expect(selects.slice(5)).toEqual(Array(5).fill("id"));
  expect(selects[0]).toContain("name");
  expect(orders.slice(0, 2)).toEqual(["name", "id"]);
});

test("P3-287: selector clienti: un client redenumit dupa prima pagina trece dincolo de cursor, iar un client viu nu este sarit", async () => {
  const all = rows(1200, 0);
  const { client } = fakeSupabase(all, {
    afterRange: (n) => {
      // Primul client, deja citit, este redenumit si trece la sfarsitul listei ordonate dupa nume.
      if (n === 1) all.push({ ...all.splice(0, 1)[0], name: "Zz Redenumit" });
    },
  });
  const got = await readActiveClientOptions(client);
  expect(got).toHaveLength(1200);
  expect(new Set(got.map((c) => c.id)).size, "fiecare client o singura data").toBe(1200);
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
