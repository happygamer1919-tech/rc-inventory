import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatTimestampDate } from "../../lib/data/format";

test("P3-318: 2026-10-31T23:30Z shows the Chisinau day 01.11.2026", () => {
  expect(formatTimestampDate("2026-10-31T23:30:00Z")).toBe("01.11.2026");
});

test("P3-318: client, project and document screens read timestamps with formatTimestampDate", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
  const spots: Array<[string, RegExp]> = [
    ["components/clients/ClientDetailScreen.tsx", /formatTimestampDate\(client\.createdAt\)/],
    ["components/projects/ProjectDetailScreen.tsx", /formatTimestampDate\(project\.createdAt\)/],
    ["components/documents/DocumentsPanel.tsx", /formatTimestampDate\(d\.createdAt\)/],
    ["components/projects/ProjectTabs.tsx", /formatTimestampDate\(h\.createdAt\)/],
    ["components/projects/ProjectTabs.tsx", /formatTimestampDate\(r\.issuedAt\)/],
  ];
  for (const [file, re] of spots) {
    const src = read(file);
    expect(src, file).toMatch(re);
    expect(src, file).not.toMatch(/formatDate\([^)]*(createdAt|updatedAt|uploadedAt|issuedAt)\)/);
  }
});

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
