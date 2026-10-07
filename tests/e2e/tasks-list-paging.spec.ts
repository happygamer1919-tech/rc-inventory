import { expect, test } from "@playwright/test";
import {
  readEntityTaskRows,
  readTaskRows,
  type TaskReadQuery,
  type TaskReadStart,
} from "@/lib/data/tasks-read";
import { LIST_CHANGED_MESSAGE, READ_ATTEMPTS, readAllPages } from "@/lib/data/id-list";
import type { TaskListQuery } from "@/lib/data/tasks-types";

// P3-162. Citirea pe pagini a sarcinilor, fara baza de date si fara browser,
// impotriva unui client fals.
//
// CLIENTUL FALS SE COMPORTA CA POSTGREST: aplica filtrele si ordinea, taie orice
// raspuns la `cap` randuri fara sa spuna ca a taiat si aduce totalul cerut cu
// { count: "exact" }. Fara paginare, 2500 de sarcini ar da 1000, cele mai vechi,
// fara nicio eroare.

type Row = {
  id: string;
  status: string;
  due_date: string | null;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
};

type Call = { from: number; to: number };

type TaskReadClient<T> = { from(): { select(): TaskReadQuery<T> } };

/** Cum porneste tasks.ts o cerere noua: aici, pe clientul fals. */
const startOf =
  (client: TaskReadClient<Row>): TaskReadStart<Row> =>
  () =>
    client.from().select();

function fakeClient(table: Row[], cap: number, calls: Call[]): TaskReadClient<Row> {
  return {
    from() {
      return {
        select() {
          const filters: ((r: Row) => boolean)[] = [];
          const orders: { column: keyof Row; ascending: boolean }[] = [];
          let from = 0;
          let to = 0;
          const query: TaskReadQuery<Row> = {
            eq(column, value) {
              filters.push((r) => r[column as keyof Row] === value);
              return query;
            },
            gte(column, value) {
              filters.push((r) => {
                const v = r[column as keyof Row];
                return v !== null && v >= value;
              });
              return query;
            },
            lte(column, value) {
              filters.push((r) => {
                const v = r[column as keyof Row];
                return v !== null && v <= value;
              });
              return query;
            },
            order(column, options) {
              orders.push({ column: column as keyof Row, ascending: options.ascending });
              return query;
            },
            range(f, t) {
              from = f;
              to = t;
              return query;
            },
            then(resolve, reject) {
              calls.push({ from, to });
              const all = table.filter((r) => filters.every((f) => f(r)));
              all.sort((a, b) => {
                for (const { column, ascending } of orders) {
                  const x = a[column];
                  const y = b[column];
                  if (x === y) continue;
                  // nullsFirst false: fara valoare, la sfarsit in ambele directii.
                  if (x === null) return 1;
                  if (y === null) return -1;
                  return (x < y ? -1 : 1) * (ascending ? 1 : -1);
                }
                return 0;
              });
              const data = all.slice(from, Math.min(to + 1, from + cap));
              return Promise.resolve({ data, count: all.length, error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
}

function tasks(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${String(i).padStart(5, "0")}`,
    status: i % 3 === 0 ? "done" : "todo",
    // Fiecare a patra sarcina nu are termen; restul au termene care se repeta.
    due_date: i % 4 === 0 ? null : `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
    // Doar 50 de momente distincte, ca departajarea dupa id sa conteze.
    created_at: `2026-01-01T00:${String(i % 50).padStart(2, "0")}:00Z`,
    entity_type: i % 5 === 0 ? "client" : null,
    entity_id: i % 5 === 0 ? (i % 10 === 0 ? "c1" : "c2") : null,
  }));
}

const EMPTY_QUERY: TaskListQuery = {
  status: "",
  priority: "",
  assigneeId: "",
  entityType: "",
  dueFrom: "",
  dueTo: "",
  sort: "termen",
  direction: "crescator",
};

test("P3-162: listTasks fara argumente aduce 2500 de sarcini, complete, in ordine, fara dubluri", async () => {
  const calls: Call[] = [];
  const table = tasks(2500);
  const got = await readTaskRows(startOf(fakeClient(table, 1000, calls)), undefined, 1000);

  expect(got).toHaveLength(2500);
  expect(new Set(got.map((r) => r.id)).size).toBe(2500);
  // Cele mai noi intai, apoi dupa id descrescator: aceeasi ordine ca inainte.
  const expected = [...table].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1,
  );
  expect(got.map((r) => r.id)).toEqual(expected.map((r) => r.id));
  expect(calls.map((c) => [c.from, c.to])).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("P3-162: listTasks dupa termen aduce toate sarcinile, cele fara termen la sfarsit", async () => {
  const calls: Call[] = [];
  const table = tasks(2500);
  const got = await readTaskRows(startOf(fakeClient(table, 1000, calls)), EMPTY_QUERY, 1000);

  expect(got).toHaveLength(2500);
  expect(new Set(got.map((r) => r.id)).size).toBe(2500);
  const byId = new Map(table.map((r) => [r.id, r]));
  const dues = got.map((r) => byId.get(r.id)!.due_date);
  const firstNull = dues.indexOf(null);
  expect(firstNull).toBe(2500 - 625);
  expect(dues.slice(firstNull).every((d) => d === null)).toBe(true);
  expect(dues.slice(0, firstNull).every((d, i, a) => i === 0 || a[i - 1]! <= d!)).toBe(true);
  // Aceasta saptamana si cele fara termen nu cad: fiecare sarcina este in lista.
  expect(new Set(got.map((r) => r.id))).toEqual(new Set(table.map((r) => r.id)));
});

test("P3-162: filtrele raman pe server si se pagineaza si ele", async () => {
  const calls: Call[] = [];
  const table = tasks(2500);
  const got = await readTaskRows(
    startOf(fakeClient(table, 100, calls)),
    { ...EMPTY_QUERY, status: "todo", dueFrom: "2026-03-01", dueTo: "2026-06-30" },
    100,
  );
  const want = table.filter(
    (r) => r.status === "todo" && r.due_date !== null && r.due_date >= "2026-03-01" && r.due_date <= "2026-06-30",
  );
  // Mai multe decat limita de 100 a serverului fals, deci filtrul se citeste pe pagini.
  expect(want.length).toBeGreaterThan(100);
  expect(got).toHaveLength(want.length);
  expect(new Set(got.map((r) => r.id))).toEqual(new Set(want.map((r) => r.id)));
});

test("P3-162: listTasksForEntity aduce 2500 de sarcini ale unei inregistrari, complete, in ordine, fara dubluri", async () => {
  const calls: Call[] = [];
  const table: Row[] = Array.from({ length: 2500 }, (_, i) => ({
    id: `e${String(i).padStart(5, "0")}`,
    status: "todo",
    due_date: null,
    created_at: `2026-01-01T00:${String(i % 50).padStart(2, "0")}:00Z`,
    entity_type: "client",
    entity_id: i < 2500 ? "c1" : "c2",
  }));
  table.push({ ...table[0]!, id: "other", entity_id: "c2" });

  const got = await readEntityTaskRows(
    startOf(fakeClient(table, 1000, calls)),
    "client",
    "c1",
    1000,
  );

  expect(got).toHaveLength(2500);
  expect(new Set(got.map((r) => r.id)).size).toBe(2500);
  expect(got.some((r) => r.id === "other")).toBe(false);
  const expected = table
    .filter((r) => r.entity_id === "c1")
    .sort((a, b) =>
      a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1,
    );
  expect(got.map((r) => r.id)).toEqual(expected.map((r) => r.id));
  expect(calls.map((c) => [c.from, c.to])).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("P3-162: o lista scurta fata de total este esec vizibil, nu o lista mai scurta", async () => {
  const table = tasks(30);
  // Serverul declara 30 si da numai primele 10, apoi o pagina goala: ESEC.
  const short: TaskReadClient<Row> = {
    from() {
      return {
        select() {
          let from = 0;
          const query: TaskReadQuery<Row> = {
            eq: () => query,
            gte: () => query,
            lte: () => query,
            order: () => query,
            range(f) {
              from = f;
              return query;
            },
            then: (resolve, reject) =>
              Promise.resolve({
                data: from === 0 ? table.slice(0, 10) : [],
                count: 30,
                error: null,
              }).then(resolve, reject),
          };
          return query;
        },
      };
    },
  };
  await expect(readTaskRows(startOf(short), undefined, 10)).rejects.toThrow("10 din 30");

  // O eroare a bazei arunca, nu da o lista goala.
  const failing: TaskReadClient<Row> = {
    from() {
      return {
        select() {
          const query: TaskReadQuery<Row> = {
            eq: () => query,
            gte: () => query,
            lte: () => query,
            order: () => query,
            range: () => query,
            then: (resolve, reject) =>
              Promise.resolve({ data: null, count: null, error: { message: "boom" } }).then(
                resolve,
                reject,
              ),
          };
          return query;
        },
      };
    },
  };
  await expect(readTaskRows(startOf(failing))).rejects.toThrow("sarcinile");
});

test("P3-193: un rand mutat peste marginea paginii de un coleg vine o singura data", async () => {
  // Un coleg schimba termenul lui t3 intre cele doua pagini: t3 ramane ultimul rand
  // al paginii 1 si revine primul al paginii 2. Totalul ramane 6.
  const ids = ["t0", "t1", "t2", "t2", "t4", "t5"];
  const pages: Record<number, string[]> = { 0: ids.slice(0, 3), 3: ids.slice(3) };
  const client: TaskReadClient<Row> = {
    from() {
      return {
        select() {
          let from = 0;
          const query: TaskReadQuery<Row> = {
            eq: () => query,
            gte: () => query,
            lte: () => query,
            order: () => query,
            range(f) {
              from = f;
              return query;
            },
            then: (resolve, reject) =>
              Promise.resolve({
                data: (pages[from] ?? []).map((id) => ({
                  id,
                  status: "todo",
                  due_date: null,
                  created_at: "2026-01-01T00:00:00Z",
                  entity_type: null,
                  entity_id: null,
                })),
                count: 6,
                error: null,
              }).then(resolve, reject),
          };
          return query;
        },
      };
    },
  };

  const got = await readTaskRows(startOf(client), undefined, 3);
  expect(got.map((r) => r.id)).toEqual(["t0", "t1", "t2", "t4", "t5"]);
  const entity = await readEntityTaskRows(startOf(client), "client", "c1", 3);
  expect(entity.map((r) => r.id)).toEqual(["t0", "t1", "t2", "t4", "t5"]);
});

test("P3-193: totalul se schimba la prima incercare, apoi sta: lista vine intreaga, fara eroare", async () => {
  const all = Array.from({ length: 23 }, (_, i) => i);
  let calls = 0;
  const got = await readAllPages<number>(
    "randurile de proba",
    async (from, to) => ({
      data: all.slice(from, to + 1),
      // Un coleg adauga un rand dupa prima pagina a primei citiri; apoi sta.
      count: calls++ === 1 ? all.length + 1 : all.length,
      error: null,
    }),
    10,
  );
  expect(got).toEqual(all);
});

test("P3-193: totalul se schimba la fiecare incercare: mesaj in romana, dupa trei citiri", async () => {
  const all = Array.from({ length: 23 }, (_, i) => i);
  let calls = 0;
  await expect(
    readAllPages<number>(
      "randurile de proba",
      async (from, to) => ({ data: all.slice(from, to + 1), count: all.length + calls++, error: null }),
      10,
    ),
  ).rejects.toThrow(LIST_CHANGED_MESSAGE);
  expect(LIST_CHANGED_MESSAGE).toBe("Lista s-a schimbat în timpul citirii. Încercați din nou.");
  // Trei incercari, fiecare oprita la a doua pagina.
  expect(calls).toBe(READ_ATTEMPTS * 2);
});
