// P3-205. Cautarea inregistrarilor inchise din Sarcini si cautarea clientilor din importul
// de leaduri taie lista de id-uri in loturi de cel mult 100 si nu inghit o eroare de citire.
// Nu atinge nici browserul, nici baza: clientul Supabase este fals.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ID_LIST_BATCH_SIZE, readInBatches } from "@/lib/data/id-list";

type Row = { id: string };

/** Un client fals cu forma `.from(t).select(c).in(col, ids)`; `failAt` strica cererea cu numarul acela. */
function fakeSupabase(table: string, all: Row[], failAt?: number) {
  const batches: string[][] = [];
  const client = {
    from: (name: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          batches.push(ids);
          if (failAt === batches.length) return { data: null, error: { message: "414 URI Too Long" } };
          const wanted = new Set(ids);
          return { data: all.filter((r) => wanted.has(r.id)), error: null, table: name };
        },
      }),
    }),
  };
  expect(table).toBeTruthy();
  return { client, batches };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

for (const table of ["clients", "projects", "contacts"]) {
  test(`P3-205: ${table}: 250 de id-uri pleaca in 3 cereri de cel mult 100 si vin toate, unite`, async () => {
    const all = ids(250).map((id) => ({ id }));
    const { client, batches } = fakeSupabase(table, all);
    const rows = await readInBatches<Row>("test", all.map((r) => r.id), (b) =>
      client.from(table).select().in("id", b),
    );
    expect(batches).toHaveLength(3);
    expect(Math.max(...batches.map((b) => b.length))).toBeLessThanOrEqual(ID_LIST_BATCH_SIZE);
    expect(rows.map((r) => r.id)).toEqual(all.map((r) => r.id));
  });
}

test("P3-205: o eroare pe un singur lot este raportata, nu devine o lista goala", async () => {
  const all = ids(250).map((id) => ({ id }));
  const { client } = fakeSupabase("clients", all, 2);
  await expect(
    readInBatches<Row>("clientii sarcinilor", ids(250), (b) => client.from("clients").select().in("id", b)),
  ).rejects.toThrow("Nu s-au putut citi clientii sarcinilor: 414 URI Too Long");
});

test("P3-205: nicio cerere pentru o lista goala", async () => {
  const { client, batches } = fakeSupabase("clients", []);
  const rows = await readInBatches<Row>("x", [], (b) => client.from("clients").select().in("id", b));
  expect(rows).toEqual([]);
  expect(batches).toHaveLength(0);
});

test("P3-205: ambele apeluri trec prin readInBatches, iar importul se refuza prin loadOrRefuse", () => {
  const tasks = readFileSync("lib/data/tasks.ts", "utf8");
  expect(tasks).toContain("readInBatches");
  expect(tasks).not.toMatch(/\.in\("id", \[\.\.\.(clientIds|projectIds)\]\)/);
  expect(tasks).not.toContain("clients.data ?? []");

  const lead = readFileSync("lib/data/lead-import-actions.ts", "utf8");
  expect(lead).toContain("readInBatches");
  expect(lead).not.toMatch(/\.in\("client_id", ids\)/);
  expect(lead.match(/loadOrRefuse\(\(\) => addContactNameFillable/g)).toHaveLength(2);
});
