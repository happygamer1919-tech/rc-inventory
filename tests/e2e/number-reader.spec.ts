import { test, expect } from "@playwright/test";
import { parseImportNumber } from "../../lib/data/import-number";
import { parsePriceText, parseQuantityText, priceAmount, priceReadLabel, quantityAmount } from "../../lib/data/price-input";
import { processIssueLines } from "../../lib/data/outbound-lines";

// P3-311. Un singur cititor de numere: ce se tasteaza la tejghea si pe iesirea pe proiect
// (price-input.ts, ecran si server) se citeste cu acelasi cod ca in fisierul de import
// (import-number.ts). Fiecare caz trece prin ambele intrari.
//
// P3-314 a schimbat o singura regula: o virgula singura urmata de exact trei cifre. Pe ecran
// virgula este mereu zecimala ("2,500" este 2,50); in fisier forma este neclara si se
// refuza. Regula veche (P3-286/P3-310/P3-311), care citea "1,200" ca 1200 in ambele locuri,
// codifica defectul si a fost corectata mai jos, nu stearsa.

// [text, pret pe ecran (null = refuzat), pret in fisier (null = refuzat sau neclar),
//  cantitate (null = refuzat sau neclar, ecran si fisier)]
const CASES: Array<[string, string | null, string | null, string | null]> = [
  ["1,200", "1.200", null, null],
  ["2,500", "2.500", null, null],
  ["1,250", "1.250", null, null],
  ["1.200", "1200", "1200", null],
  ["2.500", "2500", "2500", null],
  ["1.250", "1250", "1250", null],
  ["1 250", "1250", "1250", "1250"],
  ["1.200.000", "1200000", "1200000", "1200000"],
  ["1,200,000", "1200000", "1200000", "1200000"],
  ["1.200,50", "1200.50", "1200.50", "1200.50"],
  ["1.250,50", "1250.50", "1250.50", "1250.50"],
  ["1,200.50", "1200.50", "1200.50", "1200.50"],
  ["1 200,5", "1200.5", "1200.5", "1200.5"],
  ["1,25", "1.25", "1.25", "1.25"],
  ["1.25", "1.25", "1.25", "1.25"],
  ["12,50", "12.50", "12.50", "12.50"],
  ["0,125", "0.125", "0.125", "0.125"],
  ["0.500", "0.500", "0.500", "0.500"],
  ["2500", "2500", "2500", "2500"],
  ["abc", null, null, null],
  ["-3", null, null, null],
  ["12,", null, null, null],
  ["1.20.0", null, null, null],
  ["12,5,0", null, null, null],
];

// P3-314, constatarea 5. Pe ecran virgula este mereu zecimala, valoarea citita se vede.
test("P3-314: on screen the comma is always the decimal mark", () => {
  expect(parsePriceText("2,500")).toEqual({ kind: "ok", value: 2.5, text: "2.500" });
  expect(parsePriceText("1,250")).toEqual({ kind: "ok", value: 1.25, text: "1.250" });
  expect(parsePriceText("1,200")).toEqual({ kind: "ok", value: 1.2, text: "1.200" });
  expect(parsePriceText("1.250")).toEqual({ kind: "ok", value: 1250, text: "1250" });
  expect(parsePriceText("1 250")).toEqual({ kind: "ok", value: 1250, text: "1250" });
  expect(parsePriceText("1.250,50")).toEqual({ kind: "ok", value: 1250.5, text: "1250.50" });
  expect(priceAmount("1,250")).toBe(1.25);
  expect(priceReadLabel("2,500")).toBe("Citit: 2,50 lei");
  expect(priceReadLabel("1,250")).toBe("Citit: 1,25 lei");
  expect(priceReadLabel("1.250")).toBe("Citit: 1.250,00 lei");
  expect(priceReadLabel("12,5")).toBe("Citit: 12,50 lei");
  // P3-332: mai mult de 2 zecimale nu se citesc deloc. Inainte aici scria "Citit: 1,255 lei",
  // iar baza (numeric(14,2)) salva 1,26: ecranul si baza spuneau doua numere.
  expect(priceReadLabel("1,255")).toBeNull();
  expect(parsePriceText("1,255")).toEqual({ kind: "tooManyDecimals" });
  expect(priceReadLabel("")).toBeNull();
  expect(priceReadLabel("abc")).toBeNull();
});

test("P3-314: in a file, a lone comma plus three digits is unclear, with the value as written", () => {
  expect(parseImportNumber("1,200", 12, "money")).toBeNull();
  expect(parseImportNumber("2,500", 12, "money")).toBeNull();
  expect(parseImportNumber("1.200", 12, "money")).toBe("1200");
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
  for (const [raw, screen, money, quantity] of CASES) {
    expect(parseImportNumber(raw, 12, "screenMoney"), `import screenMoney ${raw}`).toBe(screen);
    expect(parseImportNumber(raw, 12, "money"), `import money ${raw}`).toBe(money);
    expect(parseImportNumber(raw, 11, "quantity"), `import quantity ${raw}`).toBe(quantity);

    const price = parsePriceText(raw);
    // P3-332: a price with a third real decimal ("0,125") is refused, not rounded by the database.
    const priceDecimals = (screen?.split(".")[1] ?? "").replace(/0+$/, "").length;
    if (screen === null) expect(price, `price ${raw}`).toEqual({ kind: "invalid" });
    else if (priceDecimals > 2) expect(price, `price ${raw}`).toEqual({ kind: "tooManyDecimals" });
    else expect(price, `price ${raw}`).toEqual({ kind: "ok", value: Number(screen), text: screen });
    expect(priceAmount(raw), `priceAmount ${raw}`).toBe(
      screen === null || priceDecimals > 2 ? 0 : Number(screen),
    );

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
