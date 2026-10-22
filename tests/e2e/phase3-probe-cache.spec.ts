import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { settleProbe } from "../../lib/data/schema-probe";

// P3-337. Un test fara baza de date: hasPhase3Schema nu mai tine minte "nu" pentru o
// eroare care nu spune ca tabela lipseste. Fisierul sta in tests/e2e fiindca
// playwright.config.ts fixeaza testDir acolo.

const TTL_MS = 60_000;
const cachedAt = (slot: { at: number }, now: number) => now - slot.at < TTL_MS;

test("P3-337: a probe error that is not 'relation does not exist' is not cached as no", () => {
  for (const error of [new TypeError("fetch failed"), { code: "57014", message: "statement timeout" }]) {
    const slot = settleProbe(2_000_000, error);
    expect(slot.value).toBe(true);
    expect(cachedAt(slot, 2_000_001)).toBe(false);
  }
});

test("P3-337: the real 'relation does not exist' answer is cached as no", () => {
  const slot = settleProbe(2_000_000, { code: "42P01", message: 'relation "public.projects" does not exist' });
  expect(slot.value).toBe(false);
  expect(cachedAt(slot, 2_000_001)).toBe(true);
});

test("P3-337: no gate in schema-capability.ts writes its cache without settleProbe", () => {
  const src = readFileSync("lib/data/schema-capability.ts", "utf8");
  const direct = src.split("\n").filter((l) => /^\s*cached\w*\s*=\s*\{/.test(l));
  expect(direct).toEqual([]);
  expect(src).toMatch(/cached = settleProbe\(now, error\)/);
  expect(src).toMatch(/cached = settleProbe\(now, thrown\)/);
});
