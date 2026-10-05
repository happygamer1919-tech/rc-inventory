// P3-141. Randurile noi din pasul "Verifică" al importurilor. Nu atinge nici
// browserul, nici baza: planurile sunt functii pure, iar tabelul vine din ele.
import { expect, test } from "@playwright/test";
import { formatMoney } from "@/lib/data/format";
import { PREVIEW_ROW_LIMIT, morePreviewRowsText } from "@/lib/data/import-preview-rows";
import { buildClientPlan } from "@/lib/data/client-import-plan";
import { buildPlan as buildLeadPlan } from "@/lib/data/lead-import-plan";
import { buildMaterialPlan } from "@/lib/data/material-import-plan";
import { buildProjectPlan } from "@/lib/data/project-import-plan";
import { MATERIAL_IMPORT_FIELDS } from "@/lib/data/material-import-types";
import { CLIENT_IMPORT_FIELDS } from "@/lib/data/client-import-types";

const CLIENTS = [{ id: "c1", name: "Popescu Construct SRL", active: true }];

test("previzualizare proiecte: bugetul 250.000 apare ca 250000, scris ca banii aplicatiei", () => {
  const { plan } = buildProjectPlan({
    rows: [["Popescu Construct SRL", "Bloc A", "250.000"]],
    mapping: ["client", "name", "budgetMdl"],
    clients: CLIENTS,
    existing: [],
  });
  const { columns, rows } = plan.preview;
  expect(rows).toHaveLength(1);
  expect(rows[0]!.line).toBe(2);
  const budget = rows[0]!.cells[columns.indexOf("Buget (MDL)") - 1];
  expect(budget).toBe(formatMoney(250000));
  expect(rows[0]!.cells[columns.indexOf("Client") - 1]).toBe("Popescu Construct SRL");
  // Un camp optional gol este o celula goala, fara liniuta.
  expect(rows[0]!.cells[columns.indexOf("Adresă") - 1]).toBe("");
});

test("previzualizare clienti: emailul si telefonul apar normalizate", () => {
  const { plan } = buildClientPlan({
    rows: [["Ana SRL", " Ana@Example.MD ", "069 123 456"]],
    mapping: ["name", "email", "phone", ...CLIENT_IMPORT_FIELDS.slice(3).map(() => null)],
    owners: new Map(),
    existing: [],
  });
  const { columns, rows } = plan.preview;
  expect(rows).toHaveLength(1);
  expect(rows[0]!.cells[columns.indexOf("Email") - 1]).toBe("ana@example.md");
  expect(rows[0]!.cells[columns.indexOf("Telefon") - 1]).not.toBe("");
  expect(columns).not.toContain("Persoană de contact");
});

test("previzualizare leaduri: are coloana Persoană de contact", () => {
  const { plan } = buildLeadPlan({
    rows: [["Ion SRL", "ion@example.md", "Ion Popa"]],
    mapping: ["name", "email", "contactName"],
    owners: new Map(),
    fallbackSource: "",
    existing: [],
  });
  const { columns, rows } = plan.preview;
  expect(columns).toContain("Persoană de contact");
  expect(rows).toHaveLength(1);
});

test("previzualizare materiale: pretul 1.250 apare ca 1250", () => {
  const { plan } = buildMaterialPlan({
    rows: [["SKU-1", "Dibluri", "Fixare", "buc", "1.000", "1.250"]],
    mapping: [...MATERIAL_IMPORT_FIELDS.slice(0, 6)],
    categories: [{ id: "k1", name: "Fixare" }],
    existing: [],
  });
  const { columns, rows } = plan.preview;
  expect(rows).toHaveLength(1);
  expect(rows[0]!.cells[columns.indexOf("Valoare unitară (MDL)") - 1]).toBe(formatMoney(1250));
  expect(rows[0]!.cells[columns.indexOf("Categorie") - 1]).toBe("Fixare");
});

test("previzualizare: 60 de randuri noi arata 50 si 'și încă 10 rânduri'", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ["Popescu Construct SRL", `Proiect ${i + 1}`]);
  const { plan } = buildProjectPlan({
    rows,
    mapping: ["client", "name"],
    clients: CLIENTS,
    existing: [],
  });
  expect(plan.counts.fresh).toBe(60);
  expect(plan.preview.rows).toHaveLength(PREVIEW_ROW_LIMIT);
  expect(plan.preview.more).toBe(10);
  expect(morePreviewRowsText(plan.preview.more)).toBe("și încă 10 rânduri");
  expect(morePreviewRowsText(1)).toBe("și încă 1 rând");
  expect(morePreviewRowsText(20)).toBe("și încă 20 de rânduri");
});
