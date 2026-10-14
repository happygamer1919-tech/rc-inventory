import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { IMPORT_RUNNING_TITLE, guardedClose } from "../lib/import-sheet-close";

const SHEETS = [
  "components/clients/ClientImportSheet.tsx",
  "components/clients/LeadImportSheet.tsx",
  "components/projects/ProjectImportSheet.tsx",
  "components/inventory/MaterialImportSheet.tsx",
];

test("P3-304: close is ignored while an import is pending", () => {
  let closed = 0;
  const close = guardedClose(true, () => {
    closed += 1;
  });
  close();
  close();
  expect(closed).toBe(0);
});

test("P3-304: close works once the import has ended", () => {
  let closed = 0;
  const close = guardedClose(false, () => {
    closed += 1;
  });
  close();
  expect(closed).toBe(1);
});

test("P3-304: the running message is Romanian with diacritics", () => {
  expect(IMPORT_RUNNING_TITLE).toBe("Importul este în curs. Așteptați să se termine.");
});

for (const file of SHEETS) {
  test(`P3-304: ${file} routes Escape, backdrop and X through the guard`, () => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("guardedClose(pending, onClose)");
    expect(src).toContain('if (e.key === "Escape") close();');
    expect(src).toContain('bg-black/55" onClick={close}');
    expect(src).toContain("disabled={pending}\n            title={pending ? IMPORT_RUNNING_TITLE : undefined}");
    // The only raw onClose left is the Done button, shown after the import ended.
    const raw = src.match(/onClick=\{onClose\}/g) ?? [];
    expect(raw.length).toBe(1);
    expect(src).toContain('onClick={onClose} data-testid="import-done"');
  });
}
