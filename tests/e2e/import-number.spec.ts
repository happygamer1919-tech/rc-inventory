// P3-137 si P3-286. Numerele scrise romaneste in fisierele de import. Nu atinge nici
// browserul, nici baza: tabelul de cazuri al lui parseImportNumber.
import { expect, test } from "@playwright/test";
import {
  isUnclearMoney,
  isUnclearQuantity,
  parseImportNumber,
  unclearMoneyHint,
  unclearQuantityHint,
} from "@/lib/data/import-number";
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
  // P3-314: a lone comma followed by exactly 3 digits is unclear in a file and is refused.
  // P3-286 read these as thousands ("1,200" = 1200, "100,000" = 100000, "1,500" = 1500):
  // that encoded the bug, so the expected answers are now null.
  ["1,200", null],
  ["100,000", null],
  ["1,500", null],
  ["1 ,200", null],
  // Not that shape: a leading zero, or four digits before the comma. Still decimals.
  ["0,125", "0.125"],
  ["1234,567", "1234.567"],
  // Commas that are decimals (not followed by exactly 3 digits)
  ["1,5", "1.5"],
  ["1,25", "1.25"],
  ["1,2", "1.2"],
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

// P3-310: coloanele cu 3 zecimale (cantitati) nu ghicesc, ca ecranul de iesire (P3-275).
const QUANTITY_CASES: [string, string | null][] = [
  ["2,5", "2.5"],
  ["2.5", "2.5"],
  ["1000", "1000"],
  ["0,005", "0.005"],
  ["0,125", "0.125"],
  ["0.500", "0.500"],
  ["1234,567", "1234.567"],
  ["1,1250", "1.1250"],
  ["1.250.000", "1250000"],
  ["1.234,567", "1234.567"],
  ["12 500,5", "12500.5"],
  // un separator plus exact trei cifre, si nimic altceva: neclar
  ["2,500", null],
  ["2.500", null],
  ["1,125", null],
  ["1.125", null],
  ["1,200", null],
  ["100,000", null],
  ["2 500", "2500"],
  ["2 ,500", null],
  ["abc", null],
  ["", null],
];

test("numar de import: cantitatea cu trei zecimale refuza ce este neclar", () => {
  for (const [input, expected] of QUANTITY_CASES) {
    expect(parseImportNumber(input, 11, "quantity"), `"${input}"`).toBe(expected);
  }
});

// P3-314 inlocuieste regula P3-286/P3-310: "1,200" la bani NU mai este 1200, este neclar.
test("numar de import: la bani punctul ramane mii, virgula plus trei cifre este neclara", () => {
  expect(parseImportNumber("1,200", 11, "money")).toBeNull();
  expect(parseImportNumber("250.000", 11, "money")).toBe("250000");
  expect(parseImportNumber("1.250", 11, "money")).toBe("1250");
  expect(parseImportNumber("1,200", 11)).toBeNull();
  expect(parseImportNumber("1,200", 11, "quantity")).toBeNull();
  expect(parseImportNumber("1,20", 11, "money")).toBe("1.20");
  expect(parseImportNumber("1.250,50", 11, "money")).toBe("1250.50");
});

test("numar de import: suma neclara se recunoaste si are propozitia ei", () => {
  expect(isUnclearMoney("1,200")).toBe(true);
  expect(isUnclearMoney("2 ,500")).toBe(true);
  expect(isUnclearMoney("1.200")).toBe(false);
  expect(isUnclearMoney("1,20")).toBe(false);
  expect(isUnclearMoney("0,125")).toBe(false);
  expect(isUnclearMoney("1,200,000")).toBe(false);
  expect(unclearMoneyHint("1,200")).toBe("Scrie 1200 sau 1,20, nu 1,200.");
  expect(unclearMoneyHint("2,500")).toBe("Scrie 2500 sau 2,50, nu 2,500.");
  expect(unclearMoneyHint("1,250")).toBe("Scrie 1250 sau 1,25, nu 1,250.");
  expect(unclearMoneyHint("100,000")).toBe("Scrie 100000 sau 100,00, nu 100,000.");
  expect(unclearMoneyHint("1,255")).toBe("Scrie 1255 sau o sumă cu cel mult 2 zecimale, nu 1,255.");
});

// P3-314: pe ecran virgula este mereu zecimala; punctul si spatiul separa miile.
test("numar de pe ecran: virgula este mereu zecimala", () => {
  const SCREEN: [string, string | null][] = [
    ["2,500", "2.500"],
    ["1,250", "1.250"],
    ["1,200", "1.200"],
    ["1.250", "1250"],
    ["1 250", "1250"],
    ["1.250,50", "1250.50"],
    ["1,25", "1.25"],
    ["12,5", "12.5"],
    ["0,125", "0.125"],
    ["1.200.000", "1200000"],
    ["abc", null],
    ["12,", null],
  ];
  for (const [input, expected] of SCREEN) {
    expect(parseImportNumber(input, 12, "screenMoney"), `"${input}"`).toBe(expected);
  }
});

test("numar de import: cantitatea neclara se recunoaste si are propozitia ei", () => {
  expect(isUnclearQuantity("2,500")).toBe(true);
  expect(isUnclearQuantity("2.500")).toBe(true);
  expect(isUnclearQuantity("1.250.000")).toBe(false);
  expect(isUnclearQuantity("0,500")).toBe(false);
  expect(isUnclearQuantity("2,5")).toBe(false);
  expect(unclearQuantityHint("2,500")).toBe("Scrie 2,5 sau 2500, nu 2,500.");
  expect(unclearQuantityHint("2.500")).toBe("Scrie 2,5 sau 2500, nu 2.500.");
  expect(unclearQuantityHint("2,050")).toBe("Scrie 2,05 sau 2050, nu 2,050.");
  expect(unclearQuantityHint("1,125")).toBe("Scrie 1,1250 sau 1125, nu 1,125.");
  expect(unclearQuantityHint("100,000")).toBe("Scrie 100 sau 100000, nu 100,000.");
});

test("numar de import: cantitatile exportate se citesc inapoi la aceeasi valoare", () => {
  for (const v of [2.5, 1.125, 1000, 0.005, 0.125, 12.5, 999.999, 1234.567, 1000000, 0.35]) {
    const exported = exportNumber(v);
    const parsed = parseImportNumber(exported, 11, "quantity");
    expect(parsed, `${v} scris ca "${exported}"`).not.toBeNull();
    expect(Number(parsed), `${v}`).toBe(v);
  }
  // Fara separator de mii, fara zero in plus acolo unde nu trebuie.
  expect(exportNumber(2.5)).toBe("2,5");
  expect(exportNumber(1000)).toBe("1000");
  expect(exportNumber(0.005)).toBe("0,005");
  expect(exportNumber(1.125)).toBe("1,1250");
  expect(exportNumber(2)).toBe("2");
});

test("numar de import: exportul de materiale se citeste inapoi la fel", () => {
  // P3-286/P3-314: "1,125" is unclear to the import, so the export adds a trailing zero.
  expect(exportNumber(1.125)).toBe("1,1250");
  expect(exportNumber(0.125)).toBe("0,125");
  expect(exportNumber(1234.567)).toBe("1234,567");

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
