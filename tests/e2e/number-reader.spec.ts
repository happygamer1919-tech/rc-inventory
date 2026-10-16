import { test, expect } from "@playwright/test";
import { parseImportNumber } from "../../lib/data/import-number";
import { parsePriceText, parseQuantityText, priceAmount, quantityAmount } from "../../lib/data/price-input";
import { processIssueLines } from "../../lib/data/outbound-lines";

// P3-311. Un singur cititor de numere: ce se tasteaza la tejghea si pe iesirea pe proiect
// (price-input.ts, ecran si server) se citeste exact ca in fisierul de import
// (import-number.ts). Fiecare caz trece prin ambele intrari si trebuie sa dea acelasi raspuns.

// [text, pret ca in import (null = refuzat), cantitate ca in import (null = refuzat sau neclar)]
const CASES: Array<[string, string | null, string | null]> = [
  ["1,200", "1200", null],
  ["2,500", "2500", null],
  ["1.200", "1200", null],
  ["2.500", "2500", null],
  ["1.200.000", "1200000", "1200000"],
  ["1,200,000", "1200000", "1200000"],
  ["1.200,50", "1200.50", "1200.50"],
  ["1,200.50", "1200.50", "1200.50"],
  ["1 200,5", "1200.5", "1200.5"],
  ["1,25", "1.25", "1.25"],
  ["1.25", "1.25", "1.25"],
  ["12,50", "12.50", "12.50"],
  ["0,125", "0.125", "0.125"],
  ["0.500", "0.500", "0.500"],
  ["2500", "2500", "2500"],
  ["abc", null, null],
  ["-3", null, null],
  ["12,", null, null],
  ["1.20.0", null, null],
  ["12,5,0", null, null],
];

// Cazurile numite in constatarea 3: aceeasi valoare la tejghea si in fisier.
test("P3-311: 1,200 is 1200 as a price at the counter, as in a file; 2,500 is read the same", () => {
  expect(parsePriceText("1,200")).toEqual({ kind: "ok", value: 1200, text: "1200" });
  expect(parseImportNumber("1,200", 12, "money")).toBe("1200");
  expect(parsePriceText("2,500")).toEqual({ kind: "ok", value: 2500, text: "2500" });
  expect(parseImportNumber("2,500", 12, "money")).toBe("2500");
});

test("P3-311: a single separator plus three digits is unclear as a quantity, at the counter and in a file", () => {
  for (const text of ["1,200", "2,500", "1.200", "2.500"]) {
    expect(parseQuantityText(text), text).toEqual({ kind: "ambiguous" });
    expect(parseImportNumber(text, 11, "quantity"), text).toBeNull();
  }
});

test("P3-311: 1.200.000 is 1200000 as a quantity at the counter, as in a file", () => {
  expect(parseQuantityText("1.200.000")).toEqual({ kind: "ok", value: 1200000, text: "1200000" });
  expect(parseImportNumber("1.200.000", 11, "quantity")).toBe("1200000");
  expect(quantityAmount("1.200.000")).toBe(1200000);
});

test("P3-311: every case reads the same through both entry points", () => {
  for (const [raw, money, quantity] of CASES) {
    expect(parseImportNumber(raw, 12, "money"), `import money ${raw}`).toBe(money);
    expect(parseImportNumber(raw, 11, "quantity"), `import quantity ${raw}`).toBe(quantity);

    const price = parsePriceText(raw);
    if (money === null) expect(price, `price ${raw}`).toEqual({ kind: "invalid" });
    else expect(price, `price ${raw}`).toEqual({ kind: "ok", value: Number(money), text: money });
    expect(priceAmount(raw), `priceAmount ${raw}`).toBe(money === null ? 0 : Number(money));

    const qty = parseQuantityText(raw);
    if (quantity !== null) {
      expect(qty, `quantity ${raw}`).toEqual({ kind: "ok", value: Number(quantity), text: quantity });
      expect(quantityAmount(raw), `quantityAmount ${raw}`).toBe(Number(quantity));
    } else {
      // Refuzat in import: neclar sau invalid pe ecran, niciodata citit ca numar.
      expect(["ambiguous", "invalid"], `quantity ${raw}`).toContain(qty.kind);
      expect(quantityAmount(raw), `quantityAmount ${raw}`).toBe(0);
    }
  }
});

test("P3-311: the server and the screen total read a project sale line the same way", () => {
  // Cantitatea 1,25 se salveaza 1,25 (nu 125, nu 1,2, nu refuzata), pretul 1.250 este 1250.
  const read = processIssueLines([{ productId: "p1", quantity: "1,25", salePriceMdl: "1.250" }]);
  expect(read).toEqual({ ok: true, lines: [{ product_id: "p1", quantity: 1.25, sale_price_mdl: 1250 }] });
  expect(quantityAmount("1,25") * priceAmount("1.250")).toBe(1562.5);
  // O cantitate neclara este refuzata pe server cu acelasi mesaj ca pe ecran.
  expect(processIssueLines([{ productId: "p1", quantity: "2,500", salePriceMdl: "" }])).toEqual({
    ok: false,
    message: "Cantitate neclară: scrieți 2,5 pentru zecimale sau 2500 fără punct.",
  });
  // O cantitate de mii cu doua grupe se citeste, ca in fisier.
  expect(processIssueLines([{ productId: "p1", quantity: "1.200.000", salePriceMdl: "" }])).toEqual({
    ok: true,
    lines: [{ product_id: "p1", quantity: 1200000, sale_price_mdl: null }],
  });
});

test("P3-311: a number past the column size is refused, not rounded by the database", () => {
  expect(parsePriceText("1234567890123")).toEqual({ kind: "invalid" });
  expect(parseQuantityText("123456789012")).toEqual({ kind: "invalid" });
  expect(parsePriceText("123456789012")).toMatchObject({ kind: "ok", value: 123456789012 });
  expect(parseQuantityText("12345678901")).toMatchObject({ kind: "ok", value: 12345678901 });
});
