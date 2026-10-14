// P3-286: Romanian mobile numbers starting with 07 and shared readPhone function.
// Telefoane din fisierele de import: forme locale si internationale de telefoane
// moldovenesti, romanesti si straine.
import { expect, test } from "@playwright/test";
import { readPhone } from "@/lib/data/import-shared";

const CASES: [string, { kind: "ok"; value: string } | { kind: "empty" | "many" | "bad" }][] = [
  // Empty
  ["", { kind: "empty" }],
  ["   ", { kind: "empty" }],

  // Moldovan numbers: +373 with 8 digits
  // Local form: 0 + 8 digits
  ["069123456", { kind: "ok", value: "+37369123456" }],
  ["0 69 12 34 56", { kind: "ok", value: "+37369123456" }],
  // International form: +373 + 8 digits
  ["+373 69 123 456", { kind: "ok", value: "+37369123456" }],
  // With 00 prefix: 00373 + 8 digits
  ["00373691234 56", { kind: "ok", value: "+37369123456" }],
  // Short form: 8 digits without prefix
  ["69123456", { kind: "ok", value: "+37369123456" }],

  // Romanian numbers: +40 with nine digits after it (a mobile starts with 07 locally)
  // Local form: 0 + nine digits starting with 7 (ten digits in all)
  ["0721234567", { kind: "ok", value: "+40721234567" }],
  ["07 21 234 567", { kind: "ok", value: "+40721234567" }],
  // International form: +40 + nine digits
  ["+407 21 234 567", { kind: "ok", value: "+40721234567" }],
  ["+40721234567", { kind: "ok", value: "+40721234567" }],
  // With 00 prefix: 0040 + nine digits
  ["00407 21 234 567", { kind: "ok", value: "+40721234567" }],

  // Romanian invalid: 0 + nine digits NOT starting with 7
  ["0821234567", { kind: "bad" }],
  ["0921234567", { kind: "bad" }],

  // Bad Moldovan forms
  ["069", { kind: "bad" }], // Too short
  ["0691234567", { kind: "bad" }], // 9 digits, not 8
  ["0691234567890", { kind: "bad" }], // Too long

  // Bad Romanian forms
  ["07", { kind: "bad" }], // Too short
  ["0721234", { kind: "bad" }], // 8 digits total, not 10
  ["072123456789", { kind: "bad" }], // 11 digits total, not 10

  // Invalid formats
  ["abc", { kind: "bad" }],
  ["-5", { kind: "bad" }],
  ["1234", { kind: "bad" }], // Too short

  // Many numbers
  ["069123456; 069654321", { kind: "many" }],
  ["0721234567, 0787654321", { kind: "many" }],

  // Foreign numbers with + prefix
  ["+1234567890", { kind: "ok", value: "+1234567890" }],
  ["+441234567890", { kind: "ok", value: "+441234567890" }],
];

test("import-phone: citirea numerelor Moldovenesti, Romanesti si straine", () => {
  for (const [input, expected] of CASES) {
    const result = readPhone(input);
    expect(result, `"${input}"`).toEqual(expected);
  }
});
