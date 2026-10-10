import { test, expect } from "@playwright/test";
import {
  CHECK_FAILED,
  IMPORT_BATCH_SIZE,
  importFailed,
  mergeOutcomes,
  mergePlans,
  progressText,
  runImportBatches,
  splitIntoBatches,
  type ImportBatch,
} from "../lib/data/import-batches";
import { IMPORT_MAX_BYTES, parseCsvWithLines } from "../lib/data/import-shared";

function makeRows(count: number): string[][] {
  return Array.from({ length: count }, (_, i) => [`Client ${i + 1}`, `client${i + 1}@example.md`]);
}

type Part = { lines: number[] };

test("P3-211: 1001 rows go out as 6 calls of at most 200", async () => {
  const rows = makeRows(1001);
  const sizes: number[] = [];
  const result = await runImportBatches<Part>({
    step: "check",
    rows,
    call: async (batch) => {
      sizes.push(batch.rows.length);
      return { ok: true, value: { lines: batch.lines } };
    },
  });
  expect(result.ok).toBe(true);
  expect(sizes).toEqual([200, 200, 200, 200, 200, 1]);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(IMPORT_BATCH_SIZE);
});

test("P3-211: merged lines and errors keep the original row numbers", async () => {
  const rows = makeRows(450);
  // A file with blank lines: data row i sits on Excel line i + 2 + (i >= 300 ? 5 : 0).
  const lines = rows.map((_, i) => i + 2 + (i >= 300 ? 5 : 0));
  const result = await runImportBatches({
    step: "check",
    rows,
    lines,
    call: async (batch: ImportBatch) => ({
      ok: true as const,
      value: {
        entries: batch.lines.map((line) => ({ line, kind: line % 100 === 0 ? "error" : "new" })),
        counts: {
          fresh: batch.lines.filter((l) => l % 100 !== 0).length,
          duplicate: 0,
          error: batch.lines.filter((l) => l % 100 === 0).length,
        },
        preview: { columns: ["Rândul"], rows: [], more: 0 },
      },
    }),
  });
  if (!result.ok) throw new Error("expected success");
  const plan = mergePlans(result.parts);
  expect(plan.entries.map((e) => e.line)).toEqual(lines);
  expect(plan.entries.filter((e) => e.kind === "error").map((e) => e.line)).toEqual([
    100, 200, 300, 400,
  ]);
  expect(plan.counts.fresh + plan.counts.error).toBe(450);
  expect(plan.counts.error).toBe(4);
});

test("P3-211: merged outcomes add up and keep skipped rows with their lines", () => {
  const merged = mergeOutcomes([
    { created: 3, filled: 1, skipped: 1, skippedRows: [{ line: 7, reason: "a", raw: ["x"] }], warnings: [] },
    { created: 2, filled: 0, skipped: 1, skippedRows: [{ line: 207, reason: "b", raw: ["y"] }], warnings: [{ line: 0, reason: "w" }] },
  ]);
  expect(merged.created).toBe(5);
  expect(merged.filled).toBe(1);
  expect(merged.skipped).toBe(2);
  expect(merged.skippedRows.map((r) => r.line)).toEqual([7, 207]);
  expect(merged.warnings).toHaveLength(1);
});

test("P3-211: a failure in call 3 stops, keeps the rows done so far and says so", async () => {
  let calls = 0;
  const result = await runImportBatches<{ created: number; filled: number }>({
    step: "import",
    rows: makeRows(1001),
    saved: (p) => p.created + p.filled,
    call: async (batch) => {
      calls += 1;
      if (calls === 3) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
      return { ok: true, value: { created: batch.rows.length, filled: 0 } };
    },
  });
  expect(calls).toBe(3);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.parts).toHaveLength(2);
  expect(result.rowsDone).toBe(400);
  expect(result.message).toContain("Sesiune expirată");
  expect(result.message).toContain("salvate: 400");
});

test("P3-211: a rejected action returns the Romanian message, never hangs", async () => {
  let calls = 0;
  const importing = await runImportBatches<{ created: number; filled: number }>({
    step: "import",
    rows: makeRows(1001),
    saved: (p) => p.created + p.filled,
    call: async (batch) => {
      calls += 1;
      if (calls === 3) throw new Error("Body exceeded 1 MB limit");
      return { ok: true, value: { created: batch.rows.length, filled: 0 } };
    },
  });
  expect(importing.ok).toBe(false);
  if (importing.ok) return;
  expect(importing.message).toBe(importFailed(400));
  expect(importing.message).toBe(
    "Importul nu a putut fi finalizat. Rândurile importate până acum au fost salvate: 400. Încercați din nou cu restul fișierului.",
  );

  const checking = await runImportBatches<Part>({
    step: "check",
    rows: makeRows(10),
    call: async () => {
      throw new Error("network");
    },
  });
  expect(checking.ok).toBe(false);
  if (checking.ok) return;
  expect(checking.message).toBe(CHECK_FAILED);
  expect(checking.message).toBe("Verificarea nu a putut fi finalizată. Încercați din nou.");
});

test("P3-211: progress reads like 'Se importă... 400 din 1.200'", () => {
  expect(progressText("import", 400, 1200)).toBe("Se importă... 400 din 1.200");
  expect(progressText("check", 0, 5000)).toBe("Se verifică... 0 din 5.000");
});

test("P3-211: no batch of a 5 MB CSV is anywhere near the 1 MB server action limit", () => {
  // 5000 rows of about 1 KB each, with Romanian letters (2 bytes each in UTF-8).
  const head = "Denumire;Telefon;Email;Adresa;Note";
  const body: string[] = [];
  const note = "ăâîșț ".repeat(85);
  for (let i = 0; i < 5000; i += 1) {
    body.push(`Client ${i};069${String(100000 + i)};c${i}@example.md;Strada ${i}, Chișinău;${note}`);
  }
  const csv = [head, ...body].join("\n");
  expect(new TextEncoder().encode(csv).length).toBeGreaterThan(IMPORT_MAX_BYTES * 0.9);
  expect(new TextEncoder().encode(csv).length).toBeLessThanOrEqual(IMPORT_MAX_BYTES + 200_000);

  const parsed = parseCsvWithLines(csv);
  const rows = parsed.rows.slice(1);
  const lines = parsed.lines.slice(1);
  const batches = splitIntoBatches(rows, lines);
  expect(batches.length).toBeGreaterThanOrEqual(25);
  for (const batch of batches) {
    const payload = JSON.stringify({
      ...batch,
      mapping: ["name", "phone", "email", "address", "notes"],
      choices: {},
      fileName: "clienti.csv",
      day: "2026-10-10",
    });
    expect(new TextEncoder().encode(payload).length).toBeLessThan(1024 * 1024);
  }
  expect(batches.flatMap((b) => b.lines)).toEqual(lines);
});

test("P3-211: few rows with very long cells are split by size, not only by count", () => {
  const rows = Array.from({ length: 150 }, (_, i) => [`Rând ${i}`, "x".repeat(30_000)]);
  const batches = splitIntoBatches(rows, undefined);
  expect(batches.length).toBeGreaterThan(1);
  for (const batch of batches) {
    expect(new TextEncoder().encode(JSON.stringify(batch)).length).toBeLessThan(1024 * 1024);
  }
  expect(batches.flatMap((b) => b.lines)).toEqual(rows.map((_, i) => i + 2));
});
