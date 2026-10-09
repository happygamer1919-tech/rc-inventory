import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { formatDate } from "../../lib/data/format";

// P3-204: the exported next-step date and the follow-up date are plain calendar days,
// written as ZZ.LL.AAAA on every server. They never go through a Date object, so a
// process west of UTC cannot move them back one day.

test("a plain date keeps its day under a zone west of UTC", () => {
  const before = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    expect(formatDate("2026-10-15")).toBe("15.10.2026");
    expect(formatDate("2027-01-01")).toBe("01.01.2027");
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

const EXPORTS = ["lib/data/client-export-actions.ts", "lib/data/lead-export-actions.ts"];

for (const file of EXPORTS) {
  test(`${file} writes both dates without a Date object`, () => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toContain("toLocaleDateString");
    expect(src).not.toMatch(/new Date\(r\.next_action_at/);
    expect(src).toContain("formatDate(r.next_action_at)");
    expect(src).toContain("formatDate(r.follow_up_date)");
  });
}
