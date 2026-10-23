import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDateTime, formatNumberExact, formatQty } from "../../lib/data/format";

// P3-336. Cantitatile si pragurile isi pastreaza zecimalele, preturile arata doi bani,
// iar momentul alertei din Memento este in ora Chisinaului, nu a serverului (UTC).

const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

test("P3-336: a threshold of 0.5 bags shows 0,5 and not a whole number", () => {
  expect(formatQty(0.5, "bag")).toBe("0,5 sac");
  expect(formatQty(12.25, "m2")).toBe("12,25 m²");
});

test("P3-336: a price shows two decimals, round or not", () => {
  expect(formatNumberExact(12.5)).toBe("12,50");
  expect(formatNumberExact(100)).toBe("100,00");
});

test("P3-336: the Memento moment is Chisinau time in summer and in winter", () => {
  expect(formatDateTime("2026-10-22T21:30:00Z")).toBe("23.10.2026, 00:30");
  expect(formatDateTime("2026-12-01T10:05:00Z")).toBe("01.12.2026, 12:05");
});

test("P3-336: the Memento page formats the alert moment with formatDateTime, not server getHours", () => {
  const src = read("app/(app)/memento/page.tsx");
  expect(src).toMatch(/formatDateTime\(a\.firedAt\)/);
  expect(src).not.toMatch(/getHours|getMinutes|getDate\(/);
});

test("P3-336: thresholds, incoming quantities, prices and batch quantities no longer go through formatNumber", () => {
  const spots: Array<[string, RegExp[]]> = [
    ["app/(app)/memento/page.tsx", [/formatNumber\((p\.threshold|a\.thresholdAtFire)\)/]],
    ["app/(app)/page.tsx", [/formatNumber\(p\.threshold\)/]],
    ["components/inventory/InventoryScreen.tsx", [/formatNumber\(p\.threshold\)/]],
    ["components/inventory/ProductPanel.tsx", [/formatNumber\(product\.(threshold|packageFactor)\)/]],
    ["components/orders/InboundPanel.tsx", [/formatNumber\(/]],
    ["components/orders/InboundOrderForm.tsx", [/formatNumber\(/]],
    ["components/projects/DevizPanel.tsx", [/formatNumber\(l\.quantity\)/]],
    ["components/projects/ProjectTabs.tsx", [/formatNumber\(/]],
  ];
  for (const [file, patterns] of spots) {
    const src = read(file);
    for (const pattern of patterns) {
      expect(src, `${file} still matches ${pattern}`).not.toMatch(pattern);
    }
  }
});
