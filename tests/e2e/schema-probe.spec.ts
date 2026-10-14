import { test, expect } from "@playwright/test";
import { isMissingSchemaError, settleProbe } from "../../lib/data/schema-probe";

const TTL_MS = 60_000;
// Aceeasi verificare pe care o fac portile din schema-capability.ts.
const cachedAt = (slot: { at: number }, now: number) => now - slot.at < TTL_MS;

test("P3-276: a clean probe answers yes and is remembered", () => {
  const slot = settleProbe(1_000_000, null);
  expect(slot.value).toBe(true);
  expect(cachedAt(slot, 1_000_001)).toBe(true);
});

test("P3-276: a table that really is missing answers no and is remembered", () => {
  for (const error of [
    { code: "PGRST205", message: "Could not find the table 'public.tasks' in the schema cache" },
    { code: "42P01", message: 'relation "public.tasks" does not exist' },
    { message: 'relation "public.tasks" does not exist' },
  ]) {
    const slot = settleProbe(1_000_000, error);
    expect(slot.value).toBe(false);
    expect(cachedAt(slot, 1_000_001)).toBe(true);
  }
});

test("P3-276: a missing column answers no and is remembered", () => {
  const slot = settleProbe(1_000_000, { code: "42703", message: "column x does not exist" });
  expect(slot.value).toBe(false);
  expect(cachedAt(slot, 1_000_001)).toBe(true);
});

test("P3-276: a timeout or network error answers yes and is NOT remembered", () => {
  for (const error of [
    { code: "57014", message: "canceling statement due to statement timeout" },
    new TypeError("fetch failed"),
    { message: "FetchError: network down" },
    "boom",
  ]) {
    const slot = settleProbe(1_000_000, error);
    expect(slot.value).toBe(true);
    expect(cachedAt(slot, 1_000_001)).toBe(false);
  }
});

test("P3-276: with two probes, a missing-object error wins over a transient one", () => {
  const missing = { code: "42703", message: "column y does not exist" };
  const transient = new TypeError("fetch failed");
  expect(settleProbe(5, transient, missing).value).toBe(false);
  expect(settleProbe(5, missing, null).value).toBe(false);
  expect(settleProbe(5, null, transient)).toEqual({ value: true, at: 0 });
  expect(settleProbe(5, null, null)).toEqual({ value: true, at: 5 });
});

test("P3-276: isMissingSchemaError ignores empty and non-object values", () => {
  expect(isMissingSchemaError(null)).toBe(false);
  expect(isMissingSchemaError(undefined)).toBe(false);
  expect(isMissingSchemaError("does not exist")).toBe(false);
});
