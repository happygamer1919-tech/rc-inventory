import { test, expect } from "@playwright/test";
import { chisinauDateOf } from "../lib/data/format";

test("P3-288: 2026-12-31T22:30Z (UTC) gives 2027 year in Chisinau", () => {
  const utcDate = new Date("2026-12-31T22:30:00Z");
  const chisinauDate = chisinauDateOf(utcDate);
  const year = chisinauDate.split("-")[0];
  expect(year).toBe("2027");
});

test("P3-288: 2026-12-31T23:00Z (UTC) gives 2027 year in Chisinau", () => {
  const utcDate = new Date("2026-12-31T23:00:00Z");
  const chisinauDate = chisinauDateOf(utcDate);
  const year = chisinauDate.split("-")[0];
  expect(year).toBe("2027");
});

test("P3-288: 2026-12-31T21:59Z (UTC) gives 2026 year in Chisinau", () => {
  const utcDate = new Date("2026-12-31T21:59:00Z");
  const chisinauDate = chisinauDateOf(utcDate);
  const year = chisinauDate.split("-")[0];
  expect(year).toBe("2026");
});

test("P3-288: 2026-01-01T00:00Z (UTC) gives 2026 year in Chisinau", () => {
  const utcDate = new Date("2026-01-01T00:00:00Z");
  const chisinauDate = chisinauDateOf(utcDate);
  const year = chisinauDate.split("-")[0];
  expect(year).toBe("2026");
});
