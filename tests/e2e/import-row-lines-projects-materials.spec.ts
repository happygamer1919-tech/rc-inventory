import { expect, test } from "@playwright/test";
import { parseCsvWithLines } from "@/lib/data/import-shared";
import { buildProjectPlan } from "@/lib/data/project-import-plan";
import { buildMaterialPlan } from "@/lib/data/material-import-plan";

// import-row-lines-projects-materials.spec - cardul P3-191.
//
// Module pure, fara pagina si fara baza de date, ca import-error-file-rows.spec.ts (P3-155).
// Dovedeste ca la proiecte si la materiale "Rândul N" din fisierul de erori este linia pe care o
// arata Excel, cand fisierul are o linie goala si o celula cu rand nou inauntru.

// Linia 1 antet, 2 rand bun, 3 goala, 4 si 5 un rand bun cu celula pe doua linii,
// 6 randul gresit: cel pe care Excel il arata ca 6.
const PROJECTS_CSV = [
  "Client;Denumire;Note",
  "Acme;Primul;x",
  "",
  'Acme;Al doilea;"linia unu',
  'linia doi"',
  "Necunoscut;Al treilea;y",
].join("\r\n");

const MATERIALS_CSV = [
  "Cod SKU;Denumire;Categorie;Unitate",
  "A1;Ciment;Fixare;buc",
  "",
  'A2;"Var',
  'alb";Fixare;buc',
  "A3;;Fixare;buc",
].join("\r\n");

test("import proiecte: un rand gresit dupa linie goala si celula pe doua linii are linia din Excel si celulele lui", () => {
  const { rows, lines } = parseCsvWithLines(PROJECTS_CSV);
  const body = rows.slice(1);
  const bodyLines = lines.slice(1);
  expect(bodyLines).toEqual([2, 4, 6]);

  const { plan } = buildProjectPlan({
    rows: body,
    lines: bodyLines,
    mapping: ["client", "name", "notes"],
    clients: [{ id: "c1", name: "Acme", active: true }],
    existing: [],
  });

  const error = plan.entries.find((e) => e.kind === "error");
  expect(error?.line).toBe(6);
  expect(error && "raw" in error ? error.raw : []).toEqual(["Necunoscut", "Al treilea", "y"]);
  expect(plan.entries.filter((e) => e.kind === "new").map((e) => e.line)).toEqual([2, 4]);
});

test("import proiecte: un client dezactivat dupa linie goala poarta linia din Excel si celulele lui", () => {
  const { rows, lines } = parseCsvWithLines(PROJECTS_CSV);
  const { plan } = buildProjectPlan({
    rows: rows.slice(1),
    lines: lines.slice(1),
    mapping: ["client", "name", "notes"],
    clients: [
      { id: "c1", name: "Acme", active: true },
      { id: "c2", name: "Necunoscut", active: false },
    ],
    existing: [],
  });

  const error = plan.entries.find((e) => e.kind === "error");
  expect(error?.line).toBe(6);
  expect(error && "raw" in error ? error.raw : []).toEqual(["Necunoscut", "Al treilea", "y"]);
});

test("import materiale: un rand gresit dupa linie goala si celula pe doua linii are linia din Excel si celulele lui", () => {
  const { rows, lines } = parseCsvWithLines(MATERIALS_CSV);
  const body = rows.slice(1);
  const bodyLines = lines.slice(1);
  expect(bodyLines).toEqual([2, 4, 6]);

  const { plan } = buildMaterialPlan({
    rows: body,
    lines: bodyLines,
    mapping: ["sku", "name", "category", "unit"],
    categories: [{ id: "k1", name: "Fixare" }],
    existing: [],
  });

  const error = plan.entries.find((e) => e.kind === "error");
  expect(error?.line).toBe(6);
  expect(error && "raw" in error ? error.raw : []).toEqual(["A3", "", "Fixare", "buc"]);
  expect(plan.entries.filter((e) => e.kind === "new").map((e) => e.line)).toEqual([2, 4]);
});

test("import materiale: un dublat dupa linie goala are linia din Excel, nu cea din ordine", () => {
  const text = [
    "Cod SKU;Denumire;Categorie;Unitate",
    "A1;Ciment;Fixare;buc",
    "",
    "",
    "A1;Ciment;Fixare;buc",
  ].join("\r\n");
  const { rows, lines } = parseCsvWithLines(text);
  const { plan } = buildMaterialPlan({
    rows: rows.slice(1),
    lines: lines.slice(1),
    mapping: ["sku", "name", "category", "unit"],
    categories: [{ id: "k1", name: "Fixare" }],
    existing: [],
  });
  const duplicate = plan.entries.find((e) => e.kind === "duplicate");
  expect(duplicate?.line).toBe(5);
});
