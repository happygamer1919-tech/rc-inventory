// P3-137. Numerele scrise romaneste in fisierele de import. Nu atinge nici
// browserul, nici baza: tabelul de cazuri al lui parseImportNumber.
import { expect, test } from "@playwright/test";
import { parseImportNumber } from "@/lib/data/import-number";
import { exportNumber } from "@/lib/data/material-export-types";

const CASES: [string, string | null][] = [
  ["250.000", "250000"],
  ["1.250", "1250"],
  ["1.000", "1000"],
  ["1.234,56", "1234.56"],
  ["1,234.56", "1234.56"],
  ["12 500,50", "12500.50"],
  ["12\u00A0500,50", "12500.50"],
  ["12\u202F500,50", "12500.50"],
  ["12,5", "12.5"],
  ["99.99", "99.99"],
  ["1.250.000", "1250000"],
  ["1,250,000", "1250000"],
  ["1.23.4", null],
  ["1.2345.678", null],
  ["abc", null],
  ["-5", null],
  ["", null],
  ["12,", null],
];

test("numar de import: tabelul de cazuri romanesti si cele neclare", () => {
  for (const [input, expected] of CASES) {
    expect(parseImportNumber(input, 12), `"${input}"`).toBe(expected);
  }
});

test("numar de import: limita de cifre intregi se pastreaza", () => {
  expect(parseImportNumber("123456789012", 12)).toBe("123456789012");
  expect(parseImportNumber("1234567890123", 12)).toBeNull();
  expect(parseImportNumber("12345678901", 11)).toBe("12345678901");
  expect(parseImportNumber("123456789012", 11)).toBeNull();
});

test("numar de import: exportul de materiale se citeste inapoi la fel", () => {
  expect(exportNumber(1.125)).toBe("1,125");

  const VALUES = [0.001, 1.125, 12.5, 999.999, 1234.567, 1000000, 0];
  for (const v of VALUES) {
    const exported = exportNumber(v);
    const parsed = parseImportNumber(exported, 12);
    expect(parsed, `${v}`).not.toBeNull();
    if (parsed !== null) {
      expect(Number(parsed), `${v}`).toBe(v);
    }
  }
});
