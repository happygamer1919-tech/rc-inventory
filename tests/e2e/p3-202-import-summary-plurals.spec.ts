import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { plural } from "../../lib/data/format";

// P3-202: the import sheets say "25 de rânduri citite" and "25 de coloane", not "25 rânduri".
// The sheets call plural() with exactly these words, so the counts below are what shows on screen.

const rowsRead = (n: number) => plural(n, "rând citit din fișier", "rânduri citite din fișier");
const columns = (n: number) => plural(n, "coloană", "coloane");

test("rows read use the right Romanian form for 1, 5 and 25", () => {
  expect(rowsRead(1)).toBe("1 rând citit din fișier");
  expect(rowsRead(5)).toBe("5 rânduri citite din fișier");
  expect(rowsRead(25)).toBe("25 de rânduri citite din fișier");
});

test("column counts use the right Romanian form for 1, 5 and 25", () => {
  expect(columns(1)).toBe("1 coloană");
  expect(columns(5)).toBe("5 coloane");
  expect(columns(25)).toBe("25 de coloane");
});

const SHEETS = [
  "components/clients/ClientImportSheet.tsx",
  "components/clients/LeadImportSheet.tsx",
  "components/projects/ProjectImportSheet.tsx",
  "components/inventory/MaterialImportSheet.tsx",
];

for (const sheet of SHEETS) {
  test(`${sheet} sends every count through plural()`, () => {
    const src = readFileSync(sheet, "utf8");
    expect(src).toContain('plural(headers.length, "coloană", "coloane")');
    expect(src).not.toMatch(/headers\.length\}\s*\{?\s*headers\.length === 1/);
    expect(src).not.toMatch(/\} rânduri citite/);
    expect(src).not.toContain('"1 rând citit din fișier."');
  });
}
