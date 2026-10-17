import { test, expect } from "@playwright/test";
import { formatTimestampDate } from "../lib/data/format";

test("P3-316: 2026-12-31T22:30Z shows 01.01.2027 (Chisinau day, not UTC day)", () => {
  expect(formatTimestampDate("2026-12-31T22:30:00Z")).toBe("01.01.2027");
});

test("P3-316: 2026-12-31T21:59Z still shows 31.12.2026", () => {
  expect(formatTimestampDate("2026-12-31T21:59:00Z")).toBe("31.12.2026");
});

test("P3-316: a Postgres timestamptz string with offset is read as a moment", () => {
  expect(formatTimestampDate("2026-12-31 22:30:00+00")).toBe("01.01.2027");
});

test("P3-316: empty value shows a dash", () => {
  expect(formatTimestampDate(null)).toBe("-");
});
