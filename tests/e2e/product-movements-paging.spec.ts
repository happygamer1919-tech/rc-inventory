import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  readProductBatches,
  readProductMovements,
  type MovementClient,
  type MovementQuery,
} from "@/lib/data/movements-read";

// P3-181. Fara baza de date si fara browser, impotriva unui client fals.
//
// (1) Miscarile unui produs se citesc pe pagini, pana la capat: peste 1000 de linii
//     de iesire, istoricul pierdea randuri fara niciun mesaj.
// (2) Loturile unui produs se citesc la fel, in ordinea datei, cu id ca ultim
//     criteriu, iar un rand citit de doua ori intre pagini nu apare de doua ori.
// (3) Sub 1000 de randuri ecranul arata aceleasi randuri si aceleasi texte.

type Row = { id: string; [column: string]: unknown };
type Call = { table: string; select: string; eq: Array<[string, string]>; order: string[]; from: number; to: number };

/** Server fals. Respecta filtrul, ordinea si intervalul cerute, taie la `cap`
 *  randuri ca PostgREST, fara sa spuna, si ruleaza `between` inainte de orice
 *  pagina care nu este prima: acolo un coleg salveaza sub citire. */
function fakeClient(
  tables: Record<string, Row[]>,
  calls: Call[],
  cap = 1000,
  between?: (table: string) => void,
): MovementClient {
  return {
    from(table) {
      return {
        select(columns) {
          const call: Call = { table, select: columns, eq: [], order: [], from: 0, to: 0 };
          const sorts: Array<{ column: string; ascending: boolean }> = [];
          const query: MovementQuery<{ id: string }> = {
            eq(column, value) {
              call.eq.push([column, value]);
              return query;
            },
            order(column, options) {
              call.order.push(`${column} ${options.ascending ? "asc" : "desc"}`);
              sorts.push({ column, ascending: options.ascending });
              return query;
            },
            range(f, t) {
              call.from = f;
              call.to = t;
              return query;
            },
            then(resolve, reject) {
              if (call.from > 0 && between) between(table);
              calls.push(call);
              const rows = (tables[table] ?? [])
                .filter((r) => call.eq.every(([c, v]) => r[c] === v))
                .sort((a, b) => {
                  for (const s of sorts) {
                    const x = String(a[s.column]);
                    const y = String(b[s.column]);
                    if (x !== y) return (x < y ? -1 : 1) * (s.ascending ? 1 : -1);
                  }
                  return 0;
                });
              const data = rows.slice(call.from, Math.min(call.to + 1, call.from + cap));
              return Promise.resolve({ data, count: rows.length, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
}

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1) + minute * 60_000).toISOString();

function batchRows(n: number, productId = "p1"): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${String(i).padStart(5, "0")}`,
    product_id: productId,
    quantity: "5",
    arrived_at: at(i * 7 + 3),
    inbound_orders: { reference: `IN-${i}`, supplier_name: "Furnizor" },
  }));
}

function lineRows(n: number, productId = "p1"): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${String(i).padStart(5, "0")}`,
    product_id: productId,
    quantity: "1",
    created_at: at(i),
    outbound_issues: {
      reference: `OUT-${i}`,
      issued_at: at(i),
      projects: { name: "Santier", clients: { name: "Client" } },
    },
  }));
}

const ISSUE_SELECT = "id, quantity, outbound_issues(reference, issued_at, projects(name, clients(name)))";

test("P3-181: 1200 de linii de iesire in doua pagini dau toate 1200 plus loturile, cele mai noi primele", async () => {
  const calls: Call[] = [];
  const lines = lineRows(1200);
  const batches = batchRows(3);
  // Linii si loturi ale altui produs, care nu trebuie sa apara.
  const other = [...lineRows(4, "p2"), ...batchRows(2, "p2")].map((r) => ({ ...r, id: `x${r.id}` }));
  const client = fakeClient(
    { outbound_lines: [...lines, ...other], batches: [...batches, ...other] },
    calls,
  );

  const got = await readProductMovements(client, "p1", ISSUE_SELECT, false, 1000);

  expect(got).toHaveLength(1203);
  expect(got.filter((m) => m.direction === "out")).toHaveLength(1200);
  expect(got.filter((m) => m.direction === "in")).toHaveLength(3);
  expect(new Set(got.map((m) => m.id))).toEqual(new Set([...lines, ...batches].map((r) => r.id)));
  // Cele mai noi primele: cea mai noua linie (minutul 1199) este prima.
  expect(got[0]!.id).toBe("l01199");
  for (let i = 1; i < got.length; i++) {
    expect(got[i - 1]!.at >= got[i]!.at).toBe(true);
  }

  const lineCalls = calls.filter((c) => c.table === "outbound_lines");
  expect(lineCalls.map((c) => [c.from, c.to])).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  for (const c of lineCalls) {
    expect(c.eq).toEqual([["product_id", "p1"]]);
    expect(c.order).toEqual(["created_at desc", "id desc"]);
    expect(c.select).toBe(ISSUE_SELECT);
  }
  for (const c of calls.filter((c) => c.table === "batches")) {
    expect(c.order).toEqual(["arrived_at desc", "id desc"]);
  }
});

test("P3-181: serverul care taie sub marimea paginii nu pierde randuri", async () => {
  const calls: Call[] = [];
  const got = await readProductMovements(
    fakeClient({ outbound_lines: lineRows(1200), batches: batchRows(2) }, calls, 300),
    "p1",
    ISSUE_SELECT,
    false,
    1000,
  );
  expect(got).toHaveLength(1202);
});

test("P3-181: loturile se citesc pe pagini, in ordinea datei cu id ultimul", async () => {
  const calls: Call[] = [];
  const all = batchRows(25);
  const got = await readProductBatches(fakeClient({ batches: all }, calls), "p1", 10);

  expect(got).toHaveLength(25);
  expect(calls.map((c) => [c.from, c.to])).toEqual([
    [0, 9],
    [10, 19],
    [20, 29],
  ]);
  for (const c of calls) {
    expect(c.select).toBe("id, quantity, arrived_at, inbound_orders(reference)");
    expect(c.eq).toEqual([["product_id", "p1"]]);
    expect(c.order).toEqual(["arrived_at desc", "id desc"]);
  }
  expect(got[0]!.id).toBe("b00024");
  expect(got[0]!.orderReference).toBe("IN-24");
  expect(got[0]!.quantity).toBe(5);
});

test("P3-181: un rand salvat si unul sters intre doua pagini nu dubleaza un lot", async () => {
  const rows = batchRows(20);
  let changed = false;
  const calls: Call[] = [];
  // Intre pagini un coleg salveaza un lot mai nou decat tot ce exista (cade
  // INAINTEA pozitiei citite) si altul sterge cel mai vechi lot: totalul ramane
  // 20, iar ultimul rand al primei pagini revine la inceputul celei de a doua.
  const client = fakeClient({ batches: rows }, calls, 1000, () => {
    if (changed) return;
    changed = true;
    rows.splice(0, 1);
    rows.push({ ...batchRows(1)[0]!, id: "bnew", arrived_at: at(100_000) });
  });

  const got = await readProductBatches(client, "p1", 10);

  const ids = got.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  // Randul de la marginea primei pagini (al zecelea cel mai nou) a venit de doua ori.
  expect(ids.filter((id) => id === "b00010")).toHaveLength(1);
});

test("P3-181: la aceeasi data ordinea este fixa, dupa id", async () => {
  const same = at(5);
  const lines = lineRows(3).map((r) => ({
    ...r,
    outbound_issues: { ...(r.outbound_issues as object), issued_at: same },
  }));
  const batches = batchRows(2).map((r) => ({ ...r, arrived_at: same }));
  const got = await readProductMovements(
    fakeClient({ outbound_lines: lines, batches }, []),
    "p1",
    ISSUE_SELECT,
    false,
  );
  expect(got.map((m) => m.id)).toEqual(["l00002", "l00001", "l00000", "b00001", "b00000"]);
});

test("P3-181: sub 1000 de randuri textele raman aceleasi", async () => {
  const lines: Row[] = [
    {
      id: "l1",
      product_id: "p1",
      quantity: "2.5",
      created_at: at(1),
      outbound_issues: {
        reference: "OUT-1",
        issued_at: at(1),
        issue_mode: "project",
        projects: { name: "Santier", clients: { name: "Ion" } },
        direct_client: null,
      },
    },
    {
      id: "l2",
      product_id: "p1",
      quantity: "1",
      created_at: at(2),
      outbound_issues: {
        reference: "OUT-2",
        issued_at: at(2),
        issue_mode: "direct_client",
        projects: null,
        direct_client: { name: "Maria" },
      },
    },
    {
      id: "l3",
      product_id: "p1",
      quantity: "1",
      created_at: at(3),
      outbound_issues: { reference: "OUT-3", issued_at: at(3), issue_mode: "project", projects: null },
    },
  ];
  const batches: Row[] = [
    { id: "b1", product_id: "p1", quantity: "4", arrived_at: at(0), inbound_orders: null },
  ];

  const got = await readProductMovements(fakeClient({ outbound_lines: lines, batches }, []), "p1", "x", true);

  expect(got).toEqual([
    { id: "l3", direction: "out", quantity: 1, at: at(3), reference: "OUT-3", context: "Ieșire", mode: "project" },
    { id: "l2", direction: "out", quantity: 1, at: at(2), reference: "OUT-2", context: "Maria", mode: "direct_client" },
    { id: "l1", direction: "out", quantity: 2.5, at: at(1), reference: "OUT-1", context: "Ion · Santier", mode: "project" },
    { id: "b1", direction: "in", quantity: 4, at: at(0), reference: "-", context: "Recepție", mode: null },
  ]);

  // Fara poarta lui 0067 nu se scrie niciun mod.
  const without = await readProductMovements(fakeClient({ outbound_lines: lines, batches }, []), "p1", "x", false);
  expect(without.map((m) => m.mode)).toEqual([null, null, null, null]);
});

test("P3-181: listProductBatches si listProductMovements trec prin citirea pe pagini", async () => {
  const source = readFileSync(path.join(process.cwd(), "lib/data/products.ts"), "utf8");
  for (const [name, reader] of [
    ["listProductBatches", "readProductBatches"],
    ["listProductMovements", "readProductMovements"],
  ] as const) {
    const body = source.slice(source.indexOf(`export async function ${name}`));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toContain(reader);
    expect(fn).not.toContain('.from("batches")');
    expect(fn).not.toContain('.from("outbound_lines")');
  }
});
