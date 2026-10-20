import { test, expect } from "@playwright/test";
import { parsePriceText, parseQuantityText, priceAmount, priceTextForServer } from "../../lib/data/price-input";
import { processIssueLines } from "../../lib/data/outbound-lines";

test("P3-209: a comma price and a dot price read the same", () => {
  expect(parsePriceText("12,50")).toEqual({ kind: "ok", value: 12.5, text: "12.50" });
  expect(parsePriceText("12.50")).toEqual({ kind: "ok", value: 12.5, text: "12.50" });
  expect(parsePriceText("0,40")).toMatchObject({ kind: "ok", value: 0.4 });
});

test("P3-209: spaces are ignored, including inside the number", () => {
  expect(parsePriceText("  1 200,5  ")).toMatchObject({ kind: "ok", value: 1200.5 });
  expect(parsePriceText("1 200")).toMatchObject({ kind: "ok", value: 1200 });
});

test("P3-209: text that is not a price is invalid, never silently empty", () => {
  for (const bad of ["abc", "12,5,0", "1,200.5,0", "-3", "12,", ",5", "1e3", "12 MDL"]) {
    expect(parsePriceText(bad), bad).toEqual({ kind: "invalid" });
  }
});

test("P3-253: a dot followed by three digits is a thousands separator", () => {
  expect(parsePriceText("1.200")).toEqual({ kind: "ok", value: 1200, text: "1200" });
  expect(parsePriceText("12.500")).toEqual({ kind: "ok", value: 12500, text: "12500" });
  expect(parsePriceText("1.200.000")).toEqual({ kind: "ok", value: 1200000, text: "1200000" });
  expect(parsePriceText("1.200,50")).toEqual({ kind: "ok", value: 1200.5, text: "1200.50" });
  expect(parsePriceText("1 200,50")).toEqual({ kind: "ok", value: 1200.5, text: "1200.50" });
  expect(parsePriceText("12.5")).toMatchObject({ kind: "ok", value: 12.5 });
  expect(parsePriceText("0.500")).toMatchObject({ kind: "ok", value: 0.5 });
});

test("P3-253: malformed thousands notation is refused", () => {
  for (const bad of ["1.20.0", "1.2000,50", "1.200,", "1.200.", "12.500,5,0", "1.2a0"]) {
    expect(parsePriceText(bad), bad).toEqual({ kind: "invalid" });
  }
});

test("P3-275: a quantity with only dot plus three digits is ambiguous, a price is not", () => {
  for (const text of ["1.200", "2.500", "12.500", "1,200", " 2.500 "]) {
    expect(parseQuantityText(text), text).toEqual({ kind: "ambiguous" });
  }
  expect(parsePriceText("1.200")).toEqual({ kind: "ok", value: 1200, text: "1200" });
  expect(parsePriceText("1.200,50")).toEqual({ kind: "ok", value: 1200.5, text: "1200.50" });
});

test("P3-268: a quantity with a thousands dot and a comma decimal is read", () => {
  expect(parseQuantityText("1.200,5")).toEqual({ kind: "ok", value: 1200.5, text: "1200.5" });
  expect(parseQuantityText("0.500")).toMatchObject({ kind: "ok", value: 0.5 });
  expect(parseQuantityText("2,5")).toMatchObject({ kind: "ok", value: 2.5 });
  expect(parseQuantityText("1.20")).toMatchObject({ kind: "ok", value: 1.2 });
  expect(parseQuantityText("abc")).toEqual({ kind: "invalid" });
  expect(parseQuantityText("0")).toEqual({ kind: "invalid" });
  expect(parseQuantityText("")).toEqual({ kind: "empty" });
});

test("P3-275: the server reads price 1.200 as 1200 and refuses quantity 2.500 as unclear", () => {
  const read = processIssueLines([{ productId: " p1 ", quantity: "2500", salePriceMdl: "1.200" }]);
  expect(read).toEqual({ ok: true, lines: [{ product_id: "p1", quantity: 2500, sale_price_mdl: 1200 }] });
  expect(processIssueLines([{ productId: "p1", quantity: "2.500", salePriceMdl: "1.200" }])).toEqual({
    ok: false,
    message: "Cantitate neclară: scrieți 2,5 pentru zecimale sau 2500 fără punct.",
  });
});

test("P3-268: the server refuses an invalid quantity or price with the Romanian messages", () => {
  expect(processIssueLines([{ productId: "p1", quantity: "abc", salePriceMdl: "" }])).toEqual({
    ok: false,
    message: "Cantitate invalidă. Exemplu: 2,5",
  });
  expect(processIssueLines([{ productId: "p1", quantity: "2", salePriceMdl: "x" }])).toEqual({
    ok: false,
    message: "Preț invalid. Exemplu: 12,50",
  });
  expect(processIssueLines([{ productId: "p1", quantity: "", salePriceMdl: "" }])).toEqual({
    ok: true,
    lines: [{ product_id: "p1", quantity: 0, sale_price_mdl: null }],
  });
});

test("P3-209: an empty box keeps meaning no price", () => {
  expect(parsePriceText("")).toEqual({ kind: "empty" });
  expect(parsePriceText("   ")).toEqual({ kind: "empty" });
});

test("P3-303: project sale price 1.250 reads the same on screen and on the server", () => {
  // The project form total uses priceAmount, the server uses processIssueLines.
  const cases: Array<[string, number]> = [
    ["1.250", 1250],
    ["1,25", 1.25],
    ["1250", 1250],
    ["1 250", 1250],
  ];
  for (const [typed, want] of cases) {
    expect(priceAmount(typed), typed).toBe(want);
    expect(processIssueLines([{ productId: "p1", quantity: "1", salePriceMdl: typed }]), typed).toEqual({
      ok: true,
      lines: [{ product_id: "p1", quantity: 1, sale_price_mdl: want }],
    });
  }
  expect(priceAmount("")).toBe(0);
  expect(priceAmount("abc")).toBe(0);
  // Walk-in behaviour is unchanged: 1.250 is still 1250 there.
  expect(parsePriceText("1.250")).toEqual({ kind: "ok", value: 1250, text: "1250" });
});

test("P3-314: a price with a comma and three digits is a decimal on screen and on the server", () => {
  // P3-286/P3-311 read "1,250" as 1250, a price a thousand times too large. The comma is the decimal mark.
  const cases: Array<[string, number]> = [
    ["2,500", 2.5],
    ["1,250", 1.25],
    ["1.250", 1250],
    ["1 250", 1250],
    ["1.250,50", 1250.5],
  ];
  for (const [typed, want] of cases) {
    expect(priceAmount(typed), typed).toBe(want);
    expect(processIssueLines([{ productId: "p1", quantity: "1", salePriceMdl: typed }]), typed).toEqual({
      ok: true,
      lines: [{ product_id: "p1", quantity: 1, sale_price_mdl: want }],
    });
  }
});

test("P3-327: the text the walk-in form sends reads on the server as the number the screen read", () => {
  // The form used to send parsePriceText(...).text ("2.500" for typed "2,500"), which the
  // server reads with the screen rule, where a dot plus three digits is thousands: 2500.
  const reread = processIssueLines([{ productId: "p1", quantity: "1", salePriceMdl: "2.500" }]);
  expect(reread, "the re-formatted text is the trap this card closes").toEqual({
    ok: true,
    lines: [{ product_id: "p1", quantity: 1, sale_price_mdl: 2500 }],
  });

  const typedValues = [
    "2,500", "1,250", "1.250", "1 250", "1.250,50", "12,50", "12.50", "0,125", "0,40",
    "999,123", "1,2", " 7,500 ", "1.200", "1.200.000", "12.5", "0.500", "100,000", "12345,678",
  ];
  for (const typed of typedValues) {
    const screen = parsePriceText(typed);
    expect(screen.kind, typed).toBe("ok");
    if (screen.kind !== "ok") continue;
    expect(
      processIssueLines([{ productId: "p1", quantity: "1", salePriceMdl: priceTextForServer(typed) }]),
      typed,
    ).toEqual({ ok: true, lines: [{ product_id: "p1", quantity: 1, sale_price_mdl: screen.value }] });
  }
});

test("P3-327: an empty or unreadable price box sends no price", () => {
  for (const typed of ["", "   ", "abc", "12,5,0"]) {
    expect(priceTextForServer(typed), typed).toBe("");
  }
  expect(processIssueLines([{ productId: "p1", quantity: "1", salePriceMdl: priceTextForServer("") }])).toEqual({
    ok: true,
    lines: [{ product_id: "p1", quantity: 1, sale_price_mdl: null }],
  });
});

test("P3-327: the quantity text the walk-in form sends reads the same on the server", () => {
  // The form sends the normalised quantity text. An unclear separator is refused before it
  // gets there, so the round trip is safe; this test keeps it that way.
  for (const typed of ["2,5", "2.5", "0,125", "1,2500", "1.200,5", "10", "1 200", "0.500", "1.20"]) {
    const screen = parseQuantityText(typed);
    expect(screen.kind, typed).toBe("ok");
    if (screen.kind !== "ok") continue;
    expect(
      processIssueLines([{ productId: "p1", quantity: screen.text, salePriceMdl: "" }]),
      typed,
    ).toEqual({ ok: true, lines: [{ product_id: "p1", quantity: screen.value, sale_price_mdl: null }] });
  }
});
