import { test, expect } from "@playwright/test";
import { parsePriceText } from "../lib/data/price-input";

test("P3-209: a comma price and a dot price read the same", () => {
  expect(parsePriceText("12,50")).toEqual({ kind: "ok", value: 12.5, text: "12.50" });
  expect(parsePriceText("12.50")).toEqual({ kind: "ok", value: 12.5, text: "12.50" });
  expect(parsePriceText("0,40")).toMatchObject({ kind: "ok", value: 0.4 });
});

test("P3-209: spaces are ignored, including inside the number", () => {
  expect(parsePriceText("  1 200,5  ")).toMatchObject({ kind: "ok", value: 1200.5 });
  expect(parsePriceText("1 200")).toMatchObject({ kind: "ok", value: 1200 });
});

test("P3-209: text that is not a price is invalid, never silently empty", () => {
  for (const bad of ["abc", "12,5,0", "1,200.50", "-3", "12,", ",5", "1e3", "12 MDL"]) {
    expect(parsePriceText(bad), bad).toEqual({ kind: "invalid" });
  }
});

test("P3-209: an empty box keeps meaning no price", () => {
  expect(parsePriceText("")).toEqual({ kind: "empty" });
  expect(parsePriceText("   ")).toEqual({ kind: "empty" });
});
