// Citirea clientilor existenti la import, pe pagini. Nu atinge nici browserul,
// nici baza: clientul Supabase este fals.
import { expect, test } from "@playwright/test";
import {
  CLIENTS_READ_FAILED,
  loadOrRefuse,
  readAllClients,
  readAllRows,
  readFailedMessage,
} from "@/lib/data/import-clients-read";

type Page = {
  data: { id: string }[] | null;
  count?: number | null;
  error: { message: string } | null;
};

/** Un server fals: raspunde din lista data, taie la `cap` randuri si spune totalul.
 *  `failAt` da o eroare la cererea cu numarul acela; `broken` da un raspuns fara total. */
function fakeSupabase(
  all: { id: string }[],
  opts: { cap?: number; failAt?: number; broken?: boolean } = {},
) {
  const ranges: [number, number][] = [];
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number): Promise<Page> => {
            ranges.push([from, to]);
            if (opts.broken) return { data: null, count: null, error: null };
            if (opts.failAt === ranges.length) {
              return { data: null, count: null, error: { message: "boom" } };
            }
            const end = Math.min(to, from + (opts.cap ?? Infinity) - 1);
            return { data: all.slice(from, end + 1), count: all.length, error: null };
          },
        }),
      }),
    }),
  };
  return { client: client as never, ranges };
}

const rows = (count: number, start: number) =>
  Array.from({ length: count }, (_, i) => ({ id: String(start + i) }));

test("import: 2250 de clienti se citesc toti, pe pagini numarate", async () => {
  const { client, ranges } = fakeSupabase(rows(2250, 0));
  const all = await readAllClients(client, "id");
  expect(all).toHaveLength(2250);
  expect(ranges[0]).toEqual([0, 499]);
  expect(ranges.length).toBe(5);
});

test("P3-189: import: un server care taie la 3 randuri tot da toti cei 7", async () => {
  const { client } = fakeSupabase(rows(7, 0), { cap: 3 });
  expect(await readAllClients(client, "id")).toHaveLength(7);
});

test("import: o citire care esueaza opreste importul cu mesaj romanesc, nu da lista goala", async () => {
  const { client } = fakeSupabase(rows(10, 0), { failAt: 1 });
  await expect(readAllClients(client, "id")).rejects.toThrow(CLIENTS_READ_FAILED);

  const again = fakeSupabase(rows(10, 0), { failAt: 1 });
  const refused = await loadOrRefuse(() => readAllClients(again.client, "id"));
  expect(refused).toEqual({
    ok: false,
    message: "Nu am putut citi clienții existenți. Încercați din nou.",
  });
});

test("import: o pagina care esueaza dupa prima opreste tot importul", async () => {
  const { client } = fakeSupabase(rows(1200, 0), { failAt: 2 });
  const refused = await loadOrRefuse(() => readAllClients(client, "id"));
  expect(refused.ok).toBe(false);
});

// P3-183: the same rule for the projects and materials imports.
const OTHER_TABLES = [
  ["projects", "proiectele existente"],
  ["clients", "clienții"],
  ["products", "produsele existente"],
  ["categories", "categoriile"],
] as const;

for (const [table, what] of OTHER_TABLES) {
  test(`import: citirea esuata a tabelei ${table} refuza importul, nu da lista pe jumatate`, async () => {
    const message = readFailedMessage(what);
    expect(message).toMatch(/^Nu am putut citi /);

    const first = fakeSupabase(rows(10, 0), { failAt: 1 });
    await expect(readAllRows(first.client, table, "id", message)).rejects.toThrow(message);

    const later = fakeSupabase(rows(1200, 0), { failAt: 2 });
    const refused = await loadOrRefuse(() => readAllRows(later.client, table, "id", message));
    expect(refused).toEqual({ ok: false, message });

    const empty = fakeSupabase([], { broken: true });
    const nullData = await loadOrRefuse(() => readAllRows(empty.client, table, "id", message));
    expect(nullData).toEqual({ ok: false, message });
  });
}
