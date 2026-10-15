import { test, expect } from "@playwright/test";
import { readContactNames } from "../../lib/data/export-contacts";

// P3-306. No database: a fake supabase that, like PostgREST, caps every response at
// MAX_ROWS rows while the count says how many there really are.
const MAX_ROWS = 1000;

type Contact = { id: string; client_id: string; name: string; is_primary: boolean; created_at: string };

function fakeSupabase(all: Contact[]) {
  return {
    from: () => {
      let clientIds: string[] = [];
      let idsOnly = false;
      const q: Record<string, unknown> = {};
      q.select = (cols: string) => {
        idsOnly = cols.trim() === "id";
        return q;
      };
      q.in = (_col: string, ids: string[]) => {
        clientIds = ids;
        return q;
      };
      q.eq = () => q;
      q.order = () => q;
      q.range = (from: number, to: number) => {
        const matching = all.filter((c) => clientIds.includes(c.client_id));
        const page = matching.slice(from, Math.min(to, from + MAX_ROWS - 1) + 1);
        return Promise.resolve({
          data: idsOnly ? page.map((c) => ({ id: c.id })) : page,
          count: matching.length,
          error: null,
        });
      };
      return q;
    },
  } as never;
}

test("P3-306: 2500 contacts for 100 clients are all read, none dropped at the 1000 cap", async () => {
  const clientIds = Array.from({ length: 100 }, (_, i) => `client-${i}`);
  const all: Contact[] = [];
  // 25 contacts per client; the client's primary contact is the LAST one added, so a
  // read cut at 1000 rows would lose it for every client past the first 40.
  for (let n = 0; n < 25; n++) {
    clientIds.forEach((clientId, i) => {
      all.push({
        id: `c-${n}-${i}`,
        client_id: clientId,
        name: n === 24 ? `Primary ${i}` : `Other ${n} of ${i}`,
        is_primary: n === 24,
        created_at: `2026-01-01T00:${String(n).padStart(2, "0")}:00Z`,
      });
    });
  }
  expect(all.length).toBe(2500);

  const names = await readContactNames(fakeSupabase(all), clientIds);
  expect(names.size).toBe(100);
  for (let i = 0; i < 100; i++) expect(names.get(`client-${i}`)).toBe(`Primary ${i}`);
});

test("P3-306: without a primary contact the first one added is used", async () => {
  const all: Contact[] = [
    { id: "a", client_id: "x", name: "First", is_primary: false, created_at: "2026-01-01T00:00:00Z" },
    { id: "b", client_id: "x", name: "Second", is_primary: false, created_at: "2026-01-02T00:00:00Z" },
  ];
  const names = await readContactNames(fakeSupabase(all), ["x", "no-contacts"]);
  expect(names.get("x")).toBe("First");
  expect(names.has("no-contacts")).toBe(false);
});
