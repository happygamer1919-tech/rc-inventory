import { test, expect } from "@playwright/test";
import { parsePriceText, parseQuantityText } from "../lib/data/price-input";

test("P3-209: parsePriceText accepts Romanian comma decimal", () => {
  const result = parsePriceText("12,50");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(12.5);
    expect(result.text).toBe("12.5");
  }
});

test("P3-209: parsePriceText accepts dot decimal", () => {
  const result = parsePriceText("12.50");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(12.5);
    expect(result.text).toBe("12.5");
  }
});

test("P3-209: parsePriceText treats 1.200 as thousands separator", () => {
  const result = parsePriceText("1.200");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(1200);
    expect(result.text).toBe("1200");
  }
});

test("P3-209: parsePriceText treats 1.200,50 as thousands and decimal", () => {
  const result = parsePriceText("1.200,50");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(1200.5);
    expect(result.text).toBe("1200.5");
  }
});

test("P3-209: parsePriceText accepts empty string", () => {
  const result = parsePriceText("");
  expect(result.kind).toBe("empty");
});

test("P3-209: parsePriceText rejects invalid input", () => {
  expect(parsePriceText("abc").kind).toBe("invalid");
  expect(parsePriceText("12,50,50").kind).toBe("invalid");
  expect(parsePriceText("-12,50").kind).toBe("invalid");
});

test("P3-258: parseQuantityText accepts Romanian comma decimal", () => {
  const result = parseQuantityText("2,5");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(2.5);
    expect(result.text).toBe("2.5");
  }
});

test("P3-258: parseQuantityText accepts dot decimal", () => {
  const result = parseQuantityText("2.5");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(2.5);
    expect(result.text).toBe("2.5");
  }
});

test("P3-258: parseQuantityText accepts integer", () => {
  const result = parseQuantityText("3");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(3);
    expect(result.text).toBe("3");
  }
});

test("P3-258: parseQuantityText accepts empty string", () => {
  const result = parseQuantityText("");
  expect(result.kind).toBe("empty");
});

test("P3-258: parseQuantityText rejects zero", () => {
  const result = parseQuantityText("0");
  expect(result.kind).toBe("invalid");
});

test("P3-258: parseQuantityText rejects negative numbers", () => {
  expect(parseQuantityText("-2.5").kind).toBe("invalid");
});

test("P3-258: parseQuantityText rejects letters", () => {
  expect(parseQuantityText("abc").kind).toBe("invalid");
});

test("P3-258: parseQuantityText rejects multiple separators", () => {
  expect(parseQuantityText("2,5,5").kind).toBe("invalid");
});

test("P3-258: parseQuantityText ignores whitespace", () => {
  const result = parseQuantityText(" 2,5 ");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(2.5);
  }
});
