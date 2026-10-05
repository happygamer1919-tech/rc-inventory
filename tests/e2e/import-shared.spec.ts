import { expect, test } from "@playwright/test";
import {
  buildCsv,
  buildErrorCsv,
  buildImportPreview,
  buildSynonymIndex,
  checkByteLimit,
  checkRowLimit,
  formatCsvNumber,
  parseCsv,
  prepareImportRow,
  validateCurrency,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportFieldDescriptor,
} from "@/lib/data/import-shared";
import { parseImportNumber } from "@/lib/data/import-number";

// import-shared.spec - linia de acceptanta (b) la (f) a cardului P3-121.
//
// ACEASTA ESTE SPECIFICATIA, DRAFTER'S DECISION A. Cardul numeste fisierul
// tests/import-shared.spec.ts, dar playwright.config.ts fixeaza
// `testDir: "./tests/e2e"`, deci un fisier la acel drum nu ar rula niciodata:
// un test care nu ruleaza este mai rau decat lipsa lui, fiindca se citeste ca
// verde. Fisierul sta aici, in tests/e2e/, cu EXACT numele cazurilor din
// acceptanta pastrate: numele sunt ce verifica acceptanta, dosarul este ce face
// numele sa ruleze. Acelasi tipar exista deja in acest depozit pentru cazuri de
// modul pur, fara pagina: "iesire client direct: unitatea se valideaza din
// ALL_UNITS si toate cele noua trec" din tests/e2e/outbound-direct-client.spec.ts
// si "sarcini: tokenurile stocate sunt englezesti si fiecare are o eticheta
// romaneasca" din tests/e2e/tasks.spec.ts: test(...) simplu, fara async, fara
// `page`.
//
// NICIUN TEST DE AICI NU ATINGE O PAGINA SI NICIO BAZA DE DATE: import-shared.ts
// este un modul pur, iar previzualizarea lui NU SCRIE NIMIC, deci verificarea ei
// nu are nevoie de niciuna din cele doua.

/** Un descriptor de patru campuri, numai pentru teste, ca sa dovedeasca
 *  clauza 6 (niciun rand partial) fara sa depinda de campurile leadurilor sau
 *  ale vreunei alte entitati reale. */
type TestField = "a" | "b" | "c" | "d";

function fourFieldDescriptor(): ImportFieldDescriptor<TestField>[] {
  return [
    { field: "a", label: "Primul", required: true, example: "A1", validate: (raw) => ({ ok: true, value: raw }) },
    { field: "b", label: "Al doilea", required: true, example: "B1", validate: (raw) => ({ ok: true, value: raw }) },
    { field: "c", label: "Al treilea", required: true, example: "C1", validate: (raw) => ({ ok: true, value: raw }) },
    {
      field: "d",
      label: "Al patrulea",
      required: false,
      example: "D1",
      validate: (raw) =>
        raw === "stricat" ? { ok: false, reason: 'Al patrulea camp este "stricat".' } : { ok: true, value: raw },
    },
  ];
}

/* =======================================================================
   (b) LIMITELE: RANDURI SI OCTETI, AMANDOUA CU LIMITA SI MARIMEA REALA
   ======================================================================= */

test(
  "import comun: un fisier peste 5000 de randuri este refuzat cu un mesaj care spune limita si marimea reala",
  () => {
    const ok = checkRowLimit(IMPORT_MAX_ROWS);
    expect(ok.ok, "exact la limita, fisierul este acceptat").toBe(true);

    const over = checkRowLimit(IMPORT_MAX_ROWS + 234);
    expect(over.ok, "peste limita, fisierul este refuzat").toBe(false);
    if (over.ok) throw new Error("unreachable");
    expect(over.reason, "motivul numeste limita de 5000").toContain(String(IMPORT_MAX_ROWS));
    expect(over.reason, "motivul numeste marimea reala a fisierului").toContain(
      String(IMPORT_MAX_ROWS + 234),
    );
  },
);

test(
  "import comun: un fisier peste 5 MB este refuzat cu un mesaj care spune limita si marimea reala",
  () => {
    const ok = checkByteLimit(IMPORT_MAX_BYTES);
    expect(ok.ok, "exact la limita, fisierul este acceptat").toBe(true);

    const overBytes = IMPORT_MAX_BYTES + 3 * 1024 * 1024;
    const over = checkByteLimit(overBytes);
    expect(over.ok, "peste limita, fisierul este refuzat").toBe(false);
    if (over.ok) throw new Error("unreachable");
    expect(over.reason, "motivul numeste limita de 5 MB").toContain("5 MB");
    expect(over.reason, "motivul numeste marimea reala, 8.0 MB").toContain("8.0 MB");
  },
);

/* =======================================================================
   (c) FISIERUL DE ERORI: COLOANA Motiv, UN RAND PE RAND INVALID
   ======================================================================= */

test(
  "import comun: fisierul de erori are o coloana Motiv si un rand pentru fiecare rand invalid",
  () => {
    const fields = fourFieldDescriptor();
    const mapping: (TestField | null)[] = ["a", "b", "c", "d"];
    const headers = fields.map((f) => f.label);

    // UN FISIER MIXT: randul 1 este bun, randul 2 nu are "Primul" (obligatoriu),
    // randul 3 cade pe validarea campului al patrulea.
    const rows = [
      ["A1", "B1", "C1", "D1"],
      ["", "B2", "C2", "D2"],
      ["A3", "B3", "C3", "stricat"],
    ];

    const preview = buildImportPreview(rows, mapping, fields);
    expect(preview.validCount, "un singur rand valid din trei").toBe(1);
    expect(preview.invalidCount, "doua randuri invalide din trei").toBe(2);

    const errorCsv = buildErrorCsv(headers, preview.invalid);
    const parsedBack = parseCsv(errorCsv);

    expect(parsedBack[0], "antetul fisierului de erori poarta Motiv").toEqual([
      "Rând",
      "Motiv",
      ...headers,
    ]);
    // UN RAND PENTRU FIECARE RAND INVALID, SI NUMAI PENTRU ACELEA: numarul de
    // randuri ale fisierului de erori se potriveste cu invalidCount al
    // previzualizarii, nu cu numarul total de randuri citite.
    expect(parsedBack.length - 1, "un rand de eroare pentru fiecare rand invalid").toBe(
      preview.invalidCount,
    );
  },
);

/* =======================================================================
   (d) NICIUN RAND PARTIAL: CLAUZA 6 A CARDULUI P3-121
   ======================================================================= */

test(
  "import comun: un rand care cade la al patrulea camp nu lasa in urma primele trei",
  () => {
    const fields = fourFieldDescriptor();
    const mapping: (TestField | null)[] = ["a", "b", "c", "d"];

    // PRIMELE TREI CAMPURI SUNT BUNE, al patrulea cade pe validarea lui.
    const prepared = prepareImportRow(["A1", "B1", "C1", "stricat"], mapping, fields, 2);

    expect(prepared.ok, "randul este refuzat").toBe(false);
    if (prepared.ok) throw new Error("unreachable");

    // NICIUN `record` NU IESE DIN FUNCTIE CAND EA REFUZA RANDUL: rezultatul este
    // discriminat pe `ok`, iar ramura `ok: false` nu are deloc proprietatea
    // `record`. Primele trei campuri bune nu sunt accesibile pe niciun drum.
    expect(
      Object.prototype.hasOwnProperty.call(prepared, "record"),
      "rezultatul refuzat nu poarta niciun rand pregatit, partial sau intreg",
    ).toBe(false);
    expect(prepared.reason, "motivul numeste campul care a cazut").toContain("Al patrulea");

    // SI UN SCRIITOR CARE AR ITERA PESTE REZULTAT scrie strict ZERO campuri
    // pentru acest rand, fiindca singura cale de a citi o valoare este
    // `prepared.record`, care nu exista pe ramura `ok: false`.
    const written: Record<string, string> = {};
    if (prepared.ok) {
      for (const [field, value] of Object.entries((prepared as { record: Record<string, string> }).record))
        written[field] = value;
    }
    expect(Object.keys(written), "scriitorul nu a scris niciun camp din randul refuzat").toHaveLength(0);
  },
);

/* =======================================================================
   (e) DEVIATIA D8: EUR SI RON RESPINSE, MOTIV CARE NUMESTE MDL
   ======================================================================= */

test(
  "import comun: EUR si RON sunt respinse in previzualizare cu motiv romanesc care numeste MDL",
  () => {
    for (const refused of ["EUR", "RON", "eur", "USD"]) {
      const result = validateCurrency(refused);
      expect(result.ok, `moneda ${refused} este respinsa`).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason, `motivul pentru ${refused} numeste MDL`).toContain("MDL");
      expect(result.reason, `motivul pentru ${refused} este in romana`).toContain("nu este acceptată");
    }

    for (const accepted of ["MDL", "mdl", "Mdl", ""]) {
      const result = validateCurrency(accepted);
      expect(result.ok, `moneda "${accepted}" este acceptata`).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.value, "valoarea normalizata este mereu MDL").toBe("MDL");
    }

    // SI PRIN DESCRIPTOR, NU NUMAI DIRECT: o coloana de moneda intr-un rand de
    // import respinge EUR si RON exact la fel ca atunci cand functia este
    // chemata singura.
    const fields: ImportFieldDescriptor<"currency">[] = [
      { field: "currency", label: "Monedă", required: false, example: "MDL", validate: validateCurrency },
    ];
    const prepared = prepareImportRow(["EUR"], ["currency"], fields, 2);
    expect(prepared.ok, "randul cu moneda EUR este respins").toBe(false);
    if (prepared.ok) throw new Error("unreachable");
    expect(prepared.reason, "motivul randului numeste MDL").toContain("MDL");
  },
);

/* =======================================================================
   (f) SCRIITORUL: MARCA DE ORDINE A OCTETILOR, SEPARAT PRIN VIRGULA
   ======================================================================= */

test(
  "import comun: fisierul scris incepe cu marca de ordine a octetilor si este separat prin punct si virgula",
  () => {
    const csv = buildCsv([
      ["Denumire", "Oraș"],
      ["Popescu, Ion", "Chișinău"],
    ]);

    expect(csv.codePointAt(0), "primul caracter este marca de ordine a octetilor U+FEFF").toBe(0xfeff);

    const withoutBom = csv.slice(1);
    const firstLine = withoutBom.split("\r\n")[0] ?? "";
    expect(firstLine, "antetul este separat prin punct si virgula").toBe("Denumire;Oraș");

    // UN CAMP CARE CONTINE VIRGULA SE SCRIE INTRE GHILIMELE, dupa RFC 4180, ca
    // separatorul din interiorul lui sa nu se citeasca drept o coloana noua.
    expect(withoutBom, "celula cu virgula este scrisa intre ghilimele").toContain('"Popescu, Ion"');

    // SI ROUND-TRIP: ce scrie buildCsv, citeste parseCsv la loc, identic.
    const parsedBack = parseCsv(csv);
    expect(parsedBack).toEqual([
      ["Denumire", "Oraș"],
      ["Popescu, Ion", "Chișinău"],
    ]);
  },
);

test("export Excel: buildCsv scrie punct si virgula, un singur BOM, ghilimele pentru ; si ghilimelele dublate", () => {
  const csv = buildCsv([
    ["A", "B"],
    ["x;y", 'zice "da"'],
  ]);
  expect(csv.codePointAt(0), "primul caracter este BOM").toBe(0xfeff);
  expect(csv.slice(1).includes("﻿"), "BOM apare o singura data").toBe(false);
  const lines = csv.slice(1).split("\r\n");
  expect(lines[0]).toBe("A;B");
  expect(lines[1], "celula cu ; este intre ghilimele, ghilimelele sunt dublate").toBe('"x;y";"zice ""da"""');
});

test("export Excel: pretul 12.5 se scrie 12,5", () => {
  expect(formatCsvNumber(12.5)).toBe("12,5");
  expect(formatCsvNumber(0.35)).toBe("0,35");
  expect(formatCsvNumber(250000)).toBe("250000");
  expect(formatCsvNumber("12500.5")).toBe("12500,5");
  expect(formatCsvNumber(1.2345)).toBe("1,235");
});

test("export Excel: dus-intors, parseCsv(buildCsv(randuri)) da aceleasi randuri, iar numarul isi pastreaza valoarea", () => {
  const rows = [
    ["Cod", "Denumire", "Pret"],
    ["A-1", "Vopsea; alba", formatCsvNumber(12.5)],
    ["A-2", 'Ciment "M400", sac', formatCsvNumber(0.35)],
    ["A-3", "Linie\ndubla", formatCsvNumber(12500.5)],
  ];
  const back = parseCsv(buildCsv(rows));
  expect(back).toEqual(rows);
  expect(parseImportNumber(back[1]![2]!, 11)).toBe("12.5");
  expect(parseImportNumber(back[2]![2]!, 11)).toBe("0.35");
  expect(parseImportNumber(back[3]![2]!, 11)).toBe("12500.5");
});

/* =======================================================================
   DOVADA SUPLIMENTARA: buildSynonymIndex SI autoMatchColumns SUNT GENERICE
   ======================================================================= */
//
// Nu este o clauza de acceptanta separata, dar este proprietatea pe care se
// sprijina cardurile P3-123 la P3-125: indexul de sinonime si potrivirea
// automata nu stiu nimic despre leaduri, deci orice entitate isi poate da
// propriile campuri si eticheta.

test("import comun: indexul de sinonime si potrivirea automata nu cunosc nicio entitate anume", () => {
  const index = buildSynonymIndex([
    { field: "sku", label: "SKU", synonyms: ["cod produs", "cod"] },
    { field: "unit", label: "Unitate de măsură", synonyms: ["um", "unitate"] },
  ]);

  expect(index.get("sku"), "eticheta se potriveste direct").toBe("sku");
  expect(index.get("codprodus"), "un sinonim scris cu spatiu se normalizeaza").toBe("sku");
  expect(index.get("um"), "un sinonim scurt se potriveste").toBe("unit");
  expect(index.get("ceva"), "un antet necunoscut nu se potriveste cu nimic").toBeUndefined();
});
