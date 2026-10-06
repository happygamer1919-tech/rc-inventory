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

type Page = { data: { id: string }[] | null; error: { message: string } | null };

/** Un client fals care raspunde pagina cu pagina si tine minte ce i s-a cerut. */
function fakeSupabase(pages: Page[]) {
  const ranges: [number, number][] = [];
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            ranges.push([from, to]);
            return pages[ranges.length - 1] ?? { data: [], error: null };
          },
        }),
      }),
    }),
  };
  return { client: client as never, ranges };
}

const rows = (count: number, start: number) =>
  Array.from({ length: count }, (_, i) => ({ id: String(start + i) }));

test("import: 1000, 1000 si 250 de clienti se citesc toti, in trei pagini", async () => {
  const { client, ranges } = fakeSupabase([
    { data: rows(1000, 0), error: null },
    { data: rows(1000, 1000), error: null },
    { data: rows(250, 2000), error: null },
  ]);
  const all = await readAllClients(client, "id");
  expect(all).toHaveLength(2250);
  expect(ranges).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("import: o citire care esueaza opreste importul cu mesaj romanesc, nu da lista goala", async () => {
  const { client } = fakeSupabase([{ data: null, error: { message: "boom" } }]);
  await expect(readAllClients(client, "id")).rejects.toThrow(CLIENTS_READ_FAILED);

  const again = fakeSupabase([{ data: null, error: { message: "boom" } }]);
  const refused = await loadOrRefuse(() => readAllClients(again.client, "id"));
  expect(refused).toEqual({
    ok: false,
    message: "Nu am putut citi clienții existenți. Încercați din nou.",
  });
});

test("import: o pagina care esueaza dupa prima opreste tot importul", async () => {
  const { client } = fakeSupabase([
    { data: rows(1000, 0), error: null },
    { data: null, error: { message: "boom" } },
  ]);
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

    const first = fakeSupabase([{ data: null, error: { message: "boom" } }]);
    await expect(readAllRows(first.client, table, "id", message)).rejects.toThrow(message);

    const later = fakeSupabase([
      { data: rows(1000, 0), error: null },
      { data: null, error: { message: "boom" } },
    ]);
    const refused = await loadOrRefuse(() => readAllRows(later.client, table, "id", message));
    expect(refused).toEqual({ ok: false, message });

    const empty = fakeSupabase([{ data: null, error: null }]);
    const nullData = await loadOrRefuse(() => readAllRows(empty.client, table, "id", message));
    expect(nullData).toEqual({ ok: false, message });
  });
}
