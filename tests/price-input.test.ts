import { test, expect } from "@playwright/test";
import { parsePriceText, parseQuantityText } from "../lib/data/price-input";

test("P3-209: parsePriceText accepts Romanian comma decimal", () => {
  const result = parsePriceText("12,50");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(12.5);
    expect(result.text).toBe("12.50");
  }
});

test("P3-209: parsePriceText accepts dot decimal", () => {
  const result = parsePriceText("12.50");
  expect(result.kind).toBe("ok");
  if (result.kind === "ok") {
    expect(result.value).toBe(12.5);
    expect(result.text).toBe("12.50");
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
    expect(result.text).toBe("1200.50");
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

test("P3-275: parseQuantityText refuses dot plus exactly three digits as ambiguous", () => {
  for (const text of ["1.200", "2.500", "12.500", "1,200"]) {
    expect(parseQuantityText(text).kind, text).toBe("ambiguous");
  }
});

test("P3-275: parseQuantityText still accepts the unambiguous spellings", () => {
  const cases: [string, number][] = [["2,5", 2.5], ["2.5", 2.5], ["0.500", 0.5], ["2500", 2500], ["1.200,5", 1200.5], ["0,125", 0.125]];
  for (const [text, value] of cases) {
    expect(parseQuantityText(text), text).toMatchObject({ kind: "ok", value });
  }
});

test("P3-275: parsePriceText still reads 1.200 as 1200", () => {
  expect(parsePriceText("1.200")).toMatchObject({ kind: "ok", value: 1200 });
  expect(parsePriceText("1.200,50")).toMatchObject({ kind: "ok", value: 1200.5 });
});
