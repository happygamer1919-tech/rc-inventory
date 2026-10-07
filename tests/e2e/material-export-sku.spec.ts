// P3-190. SKU-ul din exportul de materiale se scrie ca text protejat si se citeste inapoi la fel.

import { expect, test } from "@playwright/test";
import { materialExportCsv, type ExportMaterialRow } from "@/lib/data/material-export-types";
import { MATERIAL_TEMPLATE_FIELDS, parseCsv } from "@/lib/data/material-import-types";

function row(sku: string): ExportMaterialRow {
  const base = Object.fromEntries(MATERIAL_TEMPLATE_FIELDS.map((f) => [f, ""]));
  return { ...base, sku, name: "Ciment" } as ExportMaterialRow;
}

test.describe("P3-190 export SKU ca text", () => {
  test("SKU 000123 si 12-05 se scriu protejat si se citesc inapoi neschimbate", () => {
    const csv = materialExportCsv([row("000123"), row("12-05")]);
    expect(csv).toContain('"=""000123"""');
    expect(csv).toContain('"=""12-05"""');
    const rows = parseCsv(csv);
    const skuIndex = MATERIAL_TEMPLATE_FIELDS.indexOf("sku");
    expect(rows[1]![skuIndex]).toBe("000123");
    expect(rows[2]![skuIndex]).toBe("12-05");
  });

  test("SKU gol ramane celula goala", () => {
    const rows = parseCsv(materialExportCsv([row("")]));
    expect(rows[1]![MATERIAL_TEMPLATE_FIELDS.indexOf("sku")]).toBe("");
  });
});
