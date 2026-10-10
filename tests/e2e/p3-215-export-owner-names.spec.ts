import { test, expect } from "@playwright/test";
import {
  OWNERS_READ_FAILED,
  ImportReadError,
  loadOrRefuse,
  readAllOwnerProfiles,
} from "../../lib/data/import-clients-read";

// P3-215. Exports read the owner names of ALL profiles, active or not, and a failed
// read refuses the export instead of blanking the Responsabil column.

type Row = { id: string; full_name: string | null; email: string | null; active: boolean };

/** A stand-in for the profiles query: records whether `.eq` was used to filter. */
function fakeSupabase(rows: Row[] | null, error: { message: string } | null = null) {
  const calls: string[] = [];
  const query = {
    select() {
      calls.push("select");
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(`eq:${column}=${String(value)}`);
      return query;
    },
    then(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => unknown) {
      return Promise.resolve({ data: rows, error }).then(resolve);
    },
  };
  return { client: { from: () => query } as never, calls };
}

test("an inactive owner is still read, with no active filter", async () => {
  const { client, calls } = fakeSupabase([
    { id: "11111111-1111-4111-8111-111111111111", full_name: "Ana Pop", email: null, active: false },
    { id: "22222222-2222-4222-8222-222222222222", full_name: null, email: "dan@rc.md", active: true },
  ]);
  const profiles = await readAllOwnerProfiles(client);
  expect(profiles.map((p) => p.id)).toEqual([
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
  expect(calls.some((c) => c.startsWith("eq:"))).toBe(false);
});

test("a failed profiles read refuses with the Romanian message", async () => {
  const { client } = fakeSupabase(null, { message: "boom" });
  await expect(readAllOwnerProfiles(client)).rejects.toBeInstanceOf(ImportReadError);

  const outcome = await loadOrRefuse(() => readAllOwnerProfiles(client));
  expect(outcome).toEqual({ ok: false, message: OWNERS_READ_FAILED });
  expect(OWNERS_READ_FAILED).toContain("lista echipei");
});
