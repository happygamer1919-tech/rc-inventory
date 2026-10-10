import { test, expect } from "@playwright/test";
import { parsePriceText } from "../../lib/data/price-input";

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
  for (const bad of ["abc", "12,5,0", "1,200.50", "-3", "12,", ",5", "1e3", "12 MDL"]) {
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
  for (const bad of ["1.20.0", "1.2000,50", "1.200,", "1.200.", "1,200.50", "12.500,5,0", "1.2a0"]) {
    expect(parsePriceText(bad), bad).toEqual({ kind: "invalid" });
  }
});

test("P3-209: an empty box keeps meaning no price", () => {
  expect(parsePriceText("")).toEqual({ kind: "empty" });
  expect(parsePriceText("   ")).toEqual({ kind: "empty" });
});
