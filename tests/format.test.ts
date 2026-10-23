import assert from "assert";
import { test } from "@playwright/test";
import { formatQty, formatQtyNumber } from "../lib/data/format";

const tests = [
  {
    name: "shows integers without decimals",
    run: () => {
      assert.strictEqual(formatQtyNumber(5), "5");
      assert.strictEqual(formatQty(5, "pcs"), "5 buc");
    },
  },
  {
    name: "shows one decimal place",
    run: () => {
      assert.strictEqual(formatQtyNumber(2.5), "2,5");
      assert.strictEqual(formatQty(2.5, "kg"), "2,5 kg");
    },
  },
  {
    name: "shows two decimal places",
    run: () => {
      assert.strictEqual(formatQtyNumber(2.75), "2,75");
      assert.strictEqual(formatQty(2.75, "m2"), "2,75 m²");
    },
  },
  {
    name: "shows three decimal places when needed",
    run: () => {
      assert.strictEqual(formatQtyNumber(0.125), "0,125");
      assert.strictEqual(formatQty(0.125, "m3"), "0,125 m³");
    },
  },
  {
    name: "trims trailing zeros",
    run: () => {
      assert.strictEqual(formatQtyNumber(2.5), "2,5");
      assert.strictEqual(formatQtyNumber(2.5), "2,5");
      assert.strictEqual(formatQtyNumber(1.1), "1,1");
      assert.strictEqual(formatQtyNumber(1.1), "1,1");
    },
  },
  {
    name: "handles zero",
    run: () => {
      assert.strictEqual(formatQtyNumber(0), "0");
      assert.strictEqual(formatQtyNumber(0), "0");
      assert.strictEqual(formatQty(0, "lm"), "0 ml");
    },
  },
  {
    name: "handles Romanian locale decimal separator",
    run: () => {
      const result = formatQtyNumber(1.5);
      assert(result.includes(","), "Result should contain comma");
    },
  },
  {
    name: "handles various units",
    run: () => {
      assert.strictEqual(formatQty(1.25, "m2"), "1,25 m²");
      assert.strictEqual(formatQty(1.25, "lm"), "1,25 ml");
      assert.strictEqual(formatQty(1.25, "pcs"), "1,25 buc");
      assert.strictEqual(formatQty(1.25, "bag"), "1,25 sac");
      assert.strictEqual(formatQty(1.25, "kg"), "1,25 kg");
      assert.strictEqual(formatQty(1.25, "roll"), "1,25 rolă");
      assert.strictEqual(formatQty(1.25, "m3"), "1,25 m³");
    },
  },
  {
    name: "rounds to three decimals maximum",
    run: () => {
      assert.strictEqual(formatQtyNumber(0.1234), "0,123");
      assert.strictEqual(formatQtyNumber(0.1235), "0,124");
      assert.strictEqual(formatQtyNumber(0.9999), "1");
    },
  },
  {
    name: "handles negative numbers",
    run: () => {
      assert.strictEqual(formatQtyNumber(-2.5), "-2,5");
      assert.strictEqual(formatQty(-2.5, "kg"), "-2,5 kg");
    },
  },
  {
    name: "handles large numbers",
    run: () => {
      assert.strictEqual(formatQtyNumber(1000.125), "1.000,125");
      assert.strictEqual(formatQty(1000.125, "m2"), "1.000,125 m²");
    },
  },
];

for (const t of tests) {
  test(t.name, t.run);
}
