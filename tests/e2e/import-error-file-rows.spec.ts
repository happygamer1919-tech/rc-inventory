import { expect, test } from "@playwright/test";
import { parseCsv, parseCsvWithLines, rawRowAt } from "@/lib/data/import-shared";
import { buildClientPlan } from "@/lib/data/client-import-plan";
import { buildPlan } from "@/lib/data/lead-import-plan";

// import-error-file-rows.spec - cardul P3-155.
//
// Module pure, fara pagina si fara baza de date, ca import-shared.spec.ts. Acopera
// ce se poate dovedi fara baza: numerotarea liniilor ca in Excel si faptul ca
// fiecare rand sarit isi poate gasi celulele originale. Scrierea propriu-zisa
// (runClientImport, runLeadImport) are nevoie de baza si ruleaza numai in CI.

const WITH_BLANK_LINE = "Denumire;Email\r\nPrimul;a@example.test\r\n\r\nAl doilea;b@example.test\r\n";

test("import: parseCsv numara linia fizica, deci un rand de dupa o linie goala are linia din Excel", () => {
  const { rows, lines } = parseCsvWithLines(WITH_BLANK_LINE);
  expect(rows).toEqual([
    ["Denumire", "Email"],
    ["Primul", "a@example.test"],
    ["Al doilea", "b@example.test"],
  ]);
  // Antetul este linia 1, linia 3 este goala, deci al doilea rand de date este linia 4.
  expect(lines).toEqual([1, 2, 4]);
  // parseCsv ramane la fel: aceleasi randuri, fara linii goale.
  expect(parseCsv(WITH_BLANK_LINE)).toEqual(rows);
});

test("import: o celula cu rand nou intre ghilimele ocupa mai multe linii, iar randul urmator se numara dupa ele", () => {
  const text = 'Denumire;Note\n"Primul";"linia unu\nlinia doi"\nAl doilea;x\n';
  const { rows, lines } = parseCsvWithLines(text);
  expect(rows).toHaveLength(3);
  expect(lines).toEqual([1, 2, 4]);
});

test("import: randurile sarite isi pastreaza celulele originale, dupa linia din Excel", () => {
  const { rows, lines } = parseCsvWithLines(WITH_BLANK_LINE);
  const body = rows.slice(1);
  const bodyLines = lines.slice(1);
  expect(rawRowAt(body, bodyLines, 1, 4)).toEqual(["Al doilea", "b@example.test"]);
  expect(rawRowAt(body, undefined, 1, 3)).toEqual(["Al doilea", "b@example.test"]);
  expect(rawRowAt(body, bodyLines, 1, 3)).toEqual([]);
});

test("import clienti: un dublat si un rand cu eroare poarta linia din Excel si celulele lui", () => {
  const text = [
    "Denumire;Email",
    "Primul;a@example.test",
    "",
    "Al doilea;a@example.test",
    ";c@example.test",
  ].join("\r\n");
  const { rows, lines } = parseCsvWithLines(text);
  const body = rows.slice(1);
  const bodyLines = lines.slice(1);
  const { plan } = buildClientPlan({
    rows: body,
    lines: bodyLines,
    mapping: ["name", "email"],
    owners: new Map(),
    existing: [],
  });

  const duplicate = plan.entries.find((e) => e.kind === "duplicate");
  expect(duplicate?.line).toBe(4);
  expect(rawRowAt(body, bodyLines, 1, duplicate?.line ?? 0)).toEqual(["Al doilea", "a@example.test"]);

  const error = plan.entries.find((e) => e.kind === "error");
  expect(error?.line).toBe(5);
  expect(error && "raw" in error ? error.raw : []).toEqual(["", "c@example.test"]);
});

test("import leaduri: un dublat dupa linie goala are linia din Excel, nu cea din ordine", () => {
  const text = [
    "Denumire;Telefon",
    "Primul;069111222",
    "",
    "",
    "Al doilea;069111222",
  ].join("\r\n");
  const { rows, lines } = parseCsvWithLines(text);
  const body = rows.slice(1);
  const bodyLines = lines.slice(1);
  const { plan } = buildPlan({
    rows: body,
    lines: bodyLines,
    mapping: ["name", "phone"],
    owners: new Map(),
    fallbackSource: "",
    existing: [],
  });

  const duplicate = plan.entries.find((e) => e.kind === "duplicate");
  expect(duplicate?.line).toBe(5);
  expect(rawRowAt(body, bodyLines, 1, 5)).toEqual(["Al doilea", "069111222"]);
});
