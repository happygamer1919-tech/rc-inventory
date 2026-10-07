import { test, expect } from "@playwright/test";
import { readActiveClientOptions } from "../../lib/data/client-options-read";
import { readAllClients } from "../../lib/data/import-clients-read";

// Fake supabase: the server returns at most 3 rows per request while the count says 7.
const ROWS = Array.from({ length: 7 }, (_, i) => ({ id: `id-${i}`, name: `Client ${i}` }));

function fakeSupabase() {
  return {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.range = (from: number, to: number) =>
        Promise.resolve({
          data: ROWS.slice(from, Math.min(to, from + 2) + 1),
          count: ROWS.length,
          error: null,
        });
      return q;
    },
  } as never;
}

test("client picker reads all 7 rows when the server caps pages at 3", async () => {
  const out = await readActiveClientOptions(fakeSupabase());
  expect(out).toHaveLength(7);
});

test("client import reads all 7 rows when the server caps pages at 3", async () => {
  const out = await readAllClients(fakeSupabase(), "id, name");
  expect(out).toHaveLength(7);
});
