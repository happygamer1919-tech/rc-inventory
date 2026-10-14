import { expect, test } from "@playwright/test";
import { buildClientPlan, clientRowHasNoKey } from "@/lib/data/client-import-plan";
import { CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";
import {
  addAnchors,
  IMPORT_ANCHOR_BYTES,
  readAnchors,
  type FileAnchor,
} from "@/lib/data/import-file-anchors";
import { IMPORT_BATCH_SIZE, mergePlans, runImportBatches } from "@/lib/data/import-batches";
import { buildPlan } from "@/lib/data/lead-import-plan";
import { buildMaterialPlan } from "@/lib/data/material-import-plan";
import { buildProjectPlan } from "@/lib/data/project-import-plan";

// import-batch-anchors.spec - cardul P3-301.
//
// Module pure, fara pagina si fara baza de date. Dovedeste ca un fisier trimis pe loturi
// (P3-211) da ACELASI plan ca acelasi fisier trimis dintr-o data: dublatele din acelasi
// fisier se vad si cand cele doua randuri sunt in loturi diferite, la toate cele patru importuri.

/** Planul unui fisier trecut prin loturi, exact cum il cheama ecranul la "Verifică". */
async function batched<P extends { anchors?: FileAnchor[] }>(
  rows: string[][],
  plan: (rows: string[][], lines: number[], earlier: FileAnchor[]) => P,
): Promise<P[]> {
  const result = await runImportBatches<P>({
    step: "check",
    rows,
    call: async (batch, earlier) => ({ ok: true as const, value: plan(batch.rows, batch.lines, earlier) }),
    anchorsOf: (part) => part.anchors,
  });
  if (!result.ok) throw new Error(result.message);
  return result.parts;
}

function kinds(plan: { entries: { line: number; kind: string }[] }): string[] {
  return plan.entries.map((e) => `${e.line}:${e.kind}`);
}

const LEAD_MAPPING = ["name", "phone", "email"] as const;

function leadPlan(rows: string[][], lines: number[] | undefined, earlier?: [string, number][]) {
  return buildPlan({
    rows,
    lines,
    mapping: [...LEAD_MAPPING],
    owners: new Map(),
    fallbackSource: "",
    existing: [],
    earlier,
  }).plan;
}

/** 300 de leaduri cu telefoane diferite, cu acelasi telefon la randul 10 si la randul 260. */
function leadRows(): string[][] {
  const rows = Array.from({ length: 300 }, (_, i) => [
    `Lead ${i + 1}`,
    `069${String(100000 + i)}`,
    "",
  ]);
  rows[259] = ["Lead 260", rows[9]![1]!, ""];
  return rows;
}

test("P3-301: leaduri, acelasi telefon la randurile 10 si 260 este dublat si cand sunt in loturi diferite", async () => {
  const rows = leadRows();
  const whole = leadPlan(rows, undefined);
  expect(whole.counts).toEqual({ fresh: 299, duplicate: 1, error: 0 });

  // Fara ancore, ca pana la P3-301: cele doua randuri sunt in loturi diferite si ambele par noi.
  const blind = mergePlans(await batched(rows, (r, l) => leadPlan(r, l)));
  expect(blind.counts.duplicate).toBe(0);

  const parts = await batched(rows, (r, l, earlier) => leadPlan(r, l, earlier));
  expect(parts.length).toBe(2);
  const merged = mergePlans(parts);
  expect(merged.counts).toEqual(whole.counts);
  expect(kinds(merged)).toEqual(kinds(whole));

  const duplicate = merged.entries.find((e) => e.kind === "duplicate");
  expect(duplicate?.line).toBe(261);
  expect(duplicate && "against" in duplicate ? duplicate.against : null).toMatchObject({
    kind: "file",
    line: 11,
  });
  // Planul unit nu mai poarta ancorele: nu pleaca spre server.
  expect(merged.anchors).toBeUndefined();
});

test("P3-301: leaduri, un rand cu eroare nu devine ancora si un rand al carui email se potriveste este dublat", async () => {
  // Randul 1 nu are nume (eroare), deci telefonul lui nu poate face dublat din randul 250.
  const rows = Array.from({ length: 300 }, (_, i) => [`Lead ${i + 1}`, `069${String(200000 + i)}`, `l${i}@example.test`]);
  rows[0] = ["", "069999111", ""];
  rows[249] = ["Lead 250", "069999111", ""];
  // Email in loturi diferite, cu telefoane diferite.
  rows[260] = ["Lead 261", "069888222", rows[20]![2]!];

  const whole = leadPlan(rows, undefined);
  const merged = mergePlans(await batched(rows, (r, l, earlier) => leadPlan(r, l, earlier)));
  expect(merged.counts).toEqual(whole.counts);
  expect(merged.counts.error).toBe(1);
  expect(merged.counts.duplicate).toBe(1);
  expect(kinds(merged)).toEqual(kinds(whole));
});

test("P3-301: clienti, acelasi email si acelasi nume cu telefon in loturi diferite sunt dublate", async () => {
  const mapping = ["name", "email", "phone", ...CLIENT_IMPORT_FIELDS.slice(3).map(() => null)] as never;
  const plan = (rows: string[][], lines: number[] | undefined, earlier?: [string, number][]) =>
    buildClientPlan({ rows, lines, mapping, owners: new Map(), existing: [], earlier }).plan;

  const rows = Array.from({ length: 450 }, (_, i) => [`Client ${i + 1}`, `c${i}@example.test`, `069${300000 + i}`]);
  rows[30] = ["Acelasi Nume", "", "069777000"];
  rows[420] = ["  acelasi   nume ", "", "+373 69 777 000"];
  rows[40] = ["Alt client", "x@example.test", ""];
  rows[210] = ["Alt client 2", "x@example.test", ""];

  const whole = plan(rows, undefined);
  expect(whole.counts.duplicate).toBe(2);
  const parts = await batched(rows, (r, l, earlier) => plan(r, l, earlier));
  expect(parts.length).toBe(3);
  const merged = mergePlans(parts);
  expect(merged.counts).toEqual(whole.counts);
  expect(kinds(merged)).toEqual(kinds(whole));
});

test("P3-301: proiecte, acelasi client si acelasi nume in loturi diferite sunt dublate", async () => {
  const clients = [
    { id: "c1", name: "Acme", active: true },
    { id: "c2", name: "Beta", active: true },
  ];
  const plan = (rows: string[][], lines: number[] | undefined, earlier?: [string, number][]) =>
    buildProjectPlan({ rows, lines, mapping: ["client", "name"], clients, existing: [], earlier }).plan;

  const rows = Array.from({ length: 450 }, (_, i) => ["Acme", `Proiect ${i + 1}`]);
  rows[5] = ["Acme", "Bloc A"];
  rows[300] = ["acme", "bloc  a"];
  // Acelasi nume la alt client este alt proiect.
  rows[310] = ["Beta", "Bloc A"];

  const whole = plan(rows, undefined);
  expect(whole.counts.duplicate).toBe(1);
  const merged = mergePlans(await batched(rows, (r, l, earlier) => plan(r, l, earlier)));
  expect(merged.counts).toEqual(whole.counts);
  expect(kinds(merged)).toEqual(kinds(whole));
});

test("P3-301: materiale, acelasi SKU si aceeasi denumire fara SKU in loturi diferite sunt dublate", async () => {
  const categories = [{ id: "k1", name: "Fixare" }];
  const plan = (rows: string[][], lines: number[] | undefined, earlier?: [string, number][]) =>
    buildMaterialPlan({
      rows,
      lines,
      mapping: ["sku", "name", "category", "unit"],
      categories,
      existing: [],
      earlier,
    }).plan;

  const rows = Array.from({ length: 450 }, (_, i) => [`S${i + 1}`, `Material ${i + 1}`, "Fixare", "buc"]);
  rows[10] = ["AB-1", "Ciment", "Fixare", "buc"];
  rows[330] = ["ab-1", "Ciment 2", "Fixare", "buc"];
  // Fara SKU, aceeasi denumire si unitate ca randul 11 (nou, cu SKU): dublat al lui.
  rows[400] = ["", "Ciment", "Fixare", "buc"];

  const whole = plan(rows, undefined);
  expect(whole.counts.duplicate).toBe(2);
  const merged = mergePlans(await batched(rows, (r, l, earlier) => plan(r, l, earlier)));
  expect(merged.counts).toEqual(whole.counts);
  expect(kinds(merged)).toEqual(kinds(whole));
});

test("P3-301: ancorele primite de la ecran sunt curatate si limitate", () => {
  expect(readAnchors("nu e lista")).toEqual([]);
  expect(readAnchors([["phone:1", 3], ["phone:2"], "x", [4, 5], ["phone:3", 1.5], ["phone:4", -1], ["email:a", 7]])).toEqual([
    ["phone:1", 3],
    ["email:a", 7],
  ]);

  // Peste prag se trimit doar primele ancore, nu se strica nimic.
  const into = { anchors: [] as [string, number][], bytes: 0 };
  const big = Array.from({ length: 20_000 }, (_, i): [string, number] => [`phone:${"7".repeat(40)}${i}`, i + 2]);
  addAnchors(into, big);
  expect(into.anchors.length).toBeGreaterThan(0);
  expect(into.anchors.length).toBeLessThan(big.length);
  expect(JSON.stringify(into.anchors).length).toBeLessThanOrEqual(IMPORT_ANCHOR_BYTES);
  expect(into.anchors[0]).toEqual(big[0]);
});

test("P3-301: un rand de client fara email si fara telefon nu are cheie de dublare", () => {
  const mapping = ["name", "email", "phone", ...CLIENT_IMPORT_FIELDS.slice(3).map(() => null)] as never;
  expect(clientRowHasNoKey(["Fara cheie", "", ""], mapping)).toBe(true);
  expect(clientRowHasNoKey(["Fara cheie", "  ", "fara cifre"], mapping)).toBe(true);
  expect(clientRowHasNoKey(["Cu email", "a@b.md", ""], mapping)).toBe(false);
  expect(clientRowHasNoKey(["Cu telefon", "", "069 123 456"], mapping)).toBe(false);
  // Un rand fara nume este refuzat oricum: nu se numara.
  expect(clientRowHasNoKey(["", "", ""], mapping)).toBe(false);
  expect(IMPORT_BATCH_SIZE).toBe(200);
});
