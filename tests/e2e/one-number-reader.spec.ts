import { test, expect } from "@playwright/test";
import {
  lowerFirst,
  readBudget,
  readDevizQuantity,
  readInvoiceQuantity,
  readInvoiceUnitPrice,
  readOrderQuantity,
  readOrderUnitPrice,
  readPackageFactor,
  readThreshold,
  readUnitValue,
} from "../../lib/data/form-numbers";
import { realDecimals } from "../../lib/data/import-number";
import {
  parsePriceText,
  parseQuantityText,
  priceProblem,
  priceReadLabel,
  quantityProblem,
  quantityToField,
} from "../../lib/data/price-input";
import { processIssueLines } from "../../lib/data/outbound-lines";
import { parsePriceInput } from "../../lib/data/sheet-options-types";

// P3-332. Un singur cititor de numere pe fiecare formular, ecran si server (findings 2 si 3 ale
// controlului din 2026-10-21). Produsul, bugetul proiectului, comanda de intrare, devizul si
// factura citeau Number(text.replace(",", ".")), deci "1.250" era 1,25 acolo si 1250 la tejghea.
// Si banii (numeric(14,2)) si cantitatile (numeric(14,3)) primeau mai multe zecimale decat tine
// coloana, iar baza le rotunjea in tacere. Fisierul nu are nevoie de baza de date.

const PRICE_DECIMALS = "Prețul are cel mult 2 zecimale.";
const QUANTITY_DECIMALS = "Cantitatea are cel mult 3 zecimale.";
const AMBIGUOUS = "Cantitate neclară: scrieți 2,5 pentru zecimale sau 2500 fără punct.";

/** Ce citeste ecranul pe tejghea. Fiecare formular de mai jos trebuie sa dea acelasi numar. */
const MONEY_TEXTS: Array<[string, number]> = [
  ["1.250", 1250],
  ["1 250", 1250],
  ["1.200,50", 1200.5],
  ["1,250", 1.25],
  ["2,500", 2.5],
  ["12,50", 12.5],
  ["12.50", 12.5],
  ["0,40", 0.4],
  ["2500", 2500],
  ["1.200.000", 1200000],
];

const QUANTITY_TEXTS: Array<[string, number]> = [
  ["1 250", 1250],
  ["1.200,5", 1200.5],
  ["2,5", 2.5],
  ["2.5", 2.5],
  ["0,125", 0.125],
  ["1,2500", 1.25],
  ["1.200.000", 1200000],
  ["2500", 2500],
];

test("P3-332 counter: a price with a third real decimal is refused, not shown one way and saved another", () => {
  // The finding: 1,255 showed "Citit: 1,255 lei" and a line total of 125,50 for 100 pieces,
  // while numeric(14,2) stored 1.26 (126,00). Now the box refuses it, on screen and on the server.
  expect(parsePriceText("1,255")).toEqual({ kind: "tooManyDecimals" });
  expect(priceReadLabel("1,255")).toBeNull();
  expect(priceProblem("1,255")).toBe(PRICE_DECIMALS);
  expect(processIssueLines([{ productId: "p1", quantity: "100", salePriceMdl: "1,255" }])).toEqual({
    ok: false,
    message: PRICE_DECIMALS,
  });
  // Zeros at the tail are not decimals: 2,500 is still 2,50.
  expect(parsePriceText("2,500")).toMatchObject({ kind: "ok", value: 2.5 });
  expect(priceProblem("2,500")).toBeNull();
});

test("P3-332 counter: a quantity with a fourth real decimal is refused on screen and on the server", () => {
  expect(parseQuantityText("1,2345")).toEqual({ kind: "tooManyDecimals" });
  expect(quantityProblem("1,2345")).toBe(QUANTITY_DECIMALS);
  expect(processIssueLines([{ productId: "p1", quantity: "1,2345", salePriceMdl: "" }])).toEqual({
    ok: false,
    message: QUANTITY_DECIMALS,
  });
  // Three decimals fit numeric(14,3), and a fourth zero is not a decimal.
  expect(parseQuantityText("0,125")).toMatchObject({ kind: "ok", value: 0.125 });
  expect(parseQuantityText("1,1250")).toMatchObject({ kind: "ok", value: 1.125 });
});

test("P3-332: the Citit hint names the currency of the row", () => {
  expect(priceReadLabel("1.250")).toBe("Citit: 1.250,00 lei");
  expect(priceReadLabel("1.250", "EUR")).toBe("Citit: 1.250,00 EUR");
  expect(priceReadLabel("12,5", "MDL")).toBe("Citit: 12,50 MDL");
  expect(priceReadLabel("")).toBeNull();
});

test("P3-332: realDecimals ignores the zeros at the tail", () => {
  expect(realDecimals("1250")).toBe(0);
  expect(realDecimals("1250.50")).toBe(1);
  expect(realDecimals("2.500")).toBe(1);
  expect(realDecimals("1.255")).toBe(3);
  expect(realDecimals("0.0001")).toBe(4);
});

test("P3-332 product form: unit value reads like the counter", () => {
  for (const [typed, want] of MONEY_TEXTS) {
    expect(readUnitValue(typed), typed).toEqual({ ok: true, value: want });
    expect(parsePriceText(typed), typed).toMatchObject({ kind: "ok", value: want });
  }
  // 1.250 used to become 1,25 here (Number("1.250")) and "1 250" or "1.200,50" were refused.
  expect(readUnitValue("1.250")).toEqual({ ok: true, value: 1250 });
  expect(readUnitValue("")).toEqual({ ok: true, value: 0 });
  expect(readUnitValue("1,255")).toEqual({ ok: false, message: "Valoarea unitară are cel mult 2 zecimale." });
  for (const bad of ["abc", "-3", "12,", "1.20.0"]) {
    expect(readUnitValue(bad), bad).toEqual({
      ok: false,
      message: "Valoarea unitară trebuie să fie un număr pozitiv.",
    });
  }
});

test("P3-332 product form: threshold and package factor read like a counter quantity", () => {
  for (const [typed, want] of QUANTITY_TEXTS) {
    expect(readThreshold(typed), typed).toEqual({ ok: true, value: want });
    expect(readPackageFactor(typed), typed).toEqual({ ok: true, value: want });
    expect(parseQuantityText(typed), typed).toMatchObject({ kind: "ok", value: want });
  }
  expect(readThreshold("")).toEqual({ ok: true, value: 0 });
  expect(readThreshold("0")).toEqual({ ok: true, value: 0 });
  // 2,500 is 2,5 or 2500: the threshold does not guess, exactly like a quantity at the counter.
  expect(readThreshold("2,500")).toEqual({ ok: false, message: AMBIGUOUS });
  expect(readThreshold("1.250")).toEqual({ ok: false, message: AMBIGUOUS });
  expect(readThreshold("1,2345")).toEqual({ ok: false, message: "Pragul are cel mult 3 zecimale." });
  expect(readThreshold("abc")).toEqual({ ok: false, message: "Pragul trebuie să fie un număr pozitiv." });
  expect(readPackageFactor("48")).toEqual({ ok: true, value: 48 });
  expect(readPackageFactor("0")).toEqual({
    ok: false,
    message: "Factorul de ambalaj trebuie să fie un număr mai mare decât zero.",
  });
  expect(readPackageFactor("1,2345")).toEqual({
    ok: false,
    message: "Factorul de ambalaj are cel mult 3 zecimale.",
  });
});

test("P3-332 product form: a stored quantity is written back so that it reads the same", () => {
  expect(quantityToField(5)).toBe("5");
  expect(quantityToField(2.5)).toBe("2.5");
  expect(quantityToField(0.125)).toBe("0.125");
  // 1.125 would be unclear (1,125 or 1125); the edit box gets a zero at the tail.
  expect(quantityToField(1.125)).toBe("1.1250");
  for (const stored of [5, 2.5, 0.125, 1.125, 12.345, 250.5, 1000]) {
    expect(readThreshold(quantityToField(stored)), String(stored)).toEqual({ ok: true, value: stored });
  }
});

test("P3-332 project budget: reads like the counter, empty means no budget", () => {
  for (const [typed, want] of MONEY_TEXTS) {
    expect(readBudget(typed), typed).toEqual({ ok: true, value: want });
  }
  expect(readBudget("")).toEqual({ ok: true, value: null });
  expect(readBudget("  ")).toEqual({ ok: true, value: null });
  expect(readBudget("0")).toEqual({ ok: true, value: 0 });
  expect(readBudget("125.000")).toEqual({ ok: true, value: 125000 });
  expect(readBudget("1,255")).toEqual({ ok: false, message: "Bugetul are cel mult 2 zecimale." });
  expect(readBudget("abc")).toEqual({ ok: false, message: "Bugetul trebuie să fie un număr pozitiv." });
});

test("P3-332 reception: quantity and unit price read like the counter", () => {
  for (const [typed, want] of QUANTITY_TEXTS) {
    expect(readOrderQuantity(typed), typed).toEqual({ ok: true, value: want });
  }
  for (const [typed, want] of MONEY_TEXTS) {
    expect(readOrderUnitPrice(typed), typed).toEqual({ ok: true, value: want });
  }
  // Empty stays empty: a line without quantity is left out, a line without price has no price.
  expect(readOrderQuantity("")).toEqual({ ok: true, value: null });
  expect(readOrderUnitPrice("")).toEqual({ ok: true, value: null });
  expect(readOrderUnitPrice("0")).toEqual({ ok: true, value: 0 });
  // The unit price 1.250 used to be saved as 1,25, a thousand times too small.
  expect(readOrderUnitPrice("1.250")).toEqual({ ok: true, value: 1250 });
  expect(readOrderQuantity("2,500")).toEqual({ ok: false, message: AMBIGUOUS });
  expect(readOrderQuantity("1,2345")).toEqual({ ok: false, message: QUANTITY_DECIMALS });
  expect(readOrderUnitPrice("1,255")).toEqual({ ok: false, message: "Prețul unitar are cel mult 2 zecimale." });
  expect(readOrderQuantity("abc")).toEqual({ ok: false, message: "Cantitatea trebuie să fie un număr pozitiv." });
  expect(readOrderUnitPrice("abc")).toEqual({
    ok: false,
    message: "Prețul unitar trebuie să fie un număr pozitiv.",
  });
});

test("P3-332 quote (deviz): the line quantity reads like the counter and must be above zero", () => {
  for (const [typed, want] of QUANTITY_TEXTS) {
    expect(readDevizQuantity(typed), typed).toEqual({ ok: true, value: want });
  }
  const mustBePositive = { ok: false, message: "Cantitatea trebuie să fie mai mare decât zero." };
  for (const bad of ["", "0", "abc", "-2", "0,0"]) {
    expect(readDevizQuantity(bad), bad).toEqual(mustBePositive);
  }
  expect(readDevizQuantity("2,500")).toEqual({ ok: false, message: AMBIGUOUS });
  expect(readDevizQuantity("1,2345")).toEqual({ ok: false, message: QUANTITY_DECIMALS });
});

test("P3-332 invoice: quantity and price read like the counter, in the editor and on the server", () => {
  const qtyMsg = "scrie o cantitate mai mare decât zero.";
  const priceMsg = "scrie prețul unitar.";
  for (const [typed, want] of QUANTITY_TEXTS) {
    expect(readInvoiceQuantity(typed, qtyMsg), typed).toEqual({ ok: true, value: want });
  }
  for (const [typed, want] of MONEY_TEXTS) {
    expect(readInvoiceUnitPrice(typed, priceMsg), typed).toEqual({ ok: true, value: want });
  }
  // The editor's own sentences are kept; zero is a price (an offered line), an empty box is not.
  expect(readInvoiceUnitPrice("0", priceMsg)).toEqual({ ok: true, value: 0 });
  expect(readInvoiceUnitPrice("", priceMsg)).toEqual({ ok: false, message: priceMsg });
  expect(readInvoiceQuantity("", qtyMsg)).toEqual({ ok: false, message: qtyMsg });
  expect(readInvoiceQuantity("0", qtyMsg)).toEqual({ ok: false, message: qtyMsg });
  expect(readInvoiceUnitPrice("1,255", priceMsg)).toEqual({
    ok: false,
    message: "Prețul unitar are cel mult 2 zecimale.",
  });
  expect(readInvoiceQuantity("1,2345", qtyMsg)).toEqual({ ok: false, message: QUANTITY_DECIMALS });
  // A line problem reads "Poziția 2: cantitatea are cel mult 3 zecimale."
  expect(lowerFirst(QUANTITY_DECIMALS)).toBe("cantitatea are cel mult 3 zecimale.");
  expect(lowerFirst(qtyMsg)).toBe(qtyMsg);
});

test("P3-332 settings, sheet price: the owner's price reads like the counter", () => {
  expect(parsePriceInput("150,50")).toBe(150.5);
  expect(parsePriceInput("1.250")).toBe(1250);
  expect(parsePriceInput("1 250,5")).toBe(1250.5);
  expect(parsePriceInput("150,555")).toBeNull();
  expect(parsePriceInput("0")).toBeNull();
  expect(parsePriceInput("")).toBeNull();
  expect(parsePriceInput("abc")).toBeNull();
});

test("P3-332: every form reads each typed text as the counter does", () => {
  const texts = [
    "1.250", "1 250", "1.200,50", "1,250", "2,500", "12,50", "0,125", "1,255", "1.255", "abc", "-3",
    "12,", "1.20.0", "999,123", "2500", "1,2345", "", "0",
  ];
  for (const typed of texts) {
    const screen = parsePriceText(typed);
    const money = [readUnitValue(typed), readBudget(typed), readOrderUnitPrice(typed)];
    for (const read of money) {
      if (screen.kind === "ok") expect(read, typed).toMatchObject({ ok: true, value: screen.value });
      else if (screen.kind === "empty") expect(read.ok, typed).toBe(true);
      else expect(read.ok, typed).toBe(false);
    }
  }
  for (const typed of texts) {
    const screen = parseQuantityText(typed);
    // Zero and an empty box are numbers for a threshold (0) but not for a quantity above zero.
    const quantity = [readDevizQuantity(typed), readInvoiceQuantity(typed, "x")];
    for (const read of quantity) {
      if (screen.kind === "ok") expect(read, typed).toMatchObject({ ok: true, value: screen.value });
      else expect(read.ok, typed).toBe(false);
    }
  }
});
