// P3-125, Item 3 al lui Ivan. IMPORTUL DE MATERIALE (CATALOGUL DE PRODUSE) DIN CSV.
//
// ACELASI TIPAR CA lib/data/project-import-types.ts, cardul P3-124: previzualizarea
// vine din buildImportPreview din import-shared.ts, cu un descriptor de campuri
// construit aici. NU EXISTA UN AL DOILEA CITITOR DE CSV (D5).
//
// PATRU LUCRURI DIFERA DE PROIECTE, si fiecare este o hotarare a redactorului,
// scrisa si in raportul cardului:
//
// 1. UNITATEA ESTE COLOANA PERICULOASA. Se citeste NUMAI din ALL_UNITS din
//    lib/data/units.ts, prin cod (m2, pcs) sau prin eticheta de pe ecran (m², buc):
//    NICIO LISTA DE UNITATI NU SE SCRIE AICI. Eticheta ambalajului (set, cutie,
//    palet, bax) este refuzata PE NUME, cu un motiv care spune ca este un ambalaj,
//    nu o unitate (EXT-10, P3-102). NICIO CONVERSIE: o tona nu devine o mie de kg.
//
// 2. SKU ESTE NOT NULL SI UNIC IN BAZA. "Nume plus unitate cand nu exista SKU" este
//    deci o regula de POTRIVIRE, nu un fel de a crea un produs fara SKU. Un rand
//    fara SKU care nu se potriveste cu niciun produs este o EROARE DE RAND (planul,
//    project-import-plan.ts are corespondentul). NICIUN SKU NU SE INVENTEAZA.
//
// 3. CATEGORIA ESTE NOT NULL. Coloana Categorie trebuie sa cada pe o categorie care
//    EXISTA; una necunoscuta este o eroare de rand care o numeste, niciodata o
//    categorie creata tacut (acelasi principiu ca la clientul necunoscut din P3-124).
//
// 4. MONEDA. Produsul nu are coloana de moneda (pretul este in MDL). Coloana
//    "Monedă" se citeste cu validateCurrency (D8): EUR si RON sunt refuzate in
//    previzualizare cu un motiv care numeste MDL, iar valoarea nu se scrie nicaieri.
//
// FURNIZORUL SI AMBALAJUL NU SUNT IN SABLON. Furnizorul ar crea tacut o inregistrare
// dintr-o greseala de tastare (resolveSupplier), iar ambalajul cere o pereche
// completa (0035). Amandoua raman pe formularul de produs.

import {
  autoMatchColumns as autoMatchColumnsGeneric,
  buildCsv,
  buildErrorCsv,
  buildImportPreview,
  buildModelCsv,
  buildSynonymIndex,
  normaliseKey,
  parseCsv,
  parseCsvWithLines,
  sniffDelimiter,
  validateCurrency,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SAMPLE_COUNT,
  IMPORT_SKIP,
  IMPORT_SKIP_LABEL,
  type ColumnMapping as GenericColumnMapping,
  type ImportFieldDescriptor,
  type ImportPreview,
  type RowNumber,
} from "./import-shared";
import { parseImportNumber } from "./import-number";
import { ALL_UNITS, unitLabel, type UnitCode } from "./units";

export { buildCsv, normaliseKey, parseCsv, parseCsvWithLines, sniffDelimiter, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_SAMPLE_COUNT, IMPORT_SKIP, IMPORT_SKIP_LABEL };
export type { RowNumber };

/** Campurile in care poate intra o coloana din fisierul de materiale. Primele sase
 *  sunt cele ale formularului de produs (ProductForm.tsx); `currency` exista
 *  numai ca sa poata fi refuzata. */
export const MATERIAL_IMPORT_FIELDS = [
  "sku",
  "name",
  "category",
  "unit",
  "threshold",
  "unitValueMdl",
  "currency",
] as const;

export type MaterialImportField = (typeof MATERIAL_IMPORT_FIELDS)[number];

/** Campurile din sablon: cele ale formularului, fara moneda. */
export const MATERIAL_TEMPLATE_FIELDS = MATERIAL_IMPORT_FIELDS.filter(
  (f): f is Exclude<MaterialImportField, "currency"> => f !== "currency",
);

/** Eticheta romaneasca a fiecarui camp. IDENTICA CU ETICHETELE DIN ProductForm.tsx:
 *  Cod SKU, Denumire, Categorie, Unitate de măsură, Prag recomandă, Valoare
 *  unitară (MDL). */
export const MATERIAL_IMPORT_FIELD_LABEL: Record<MaterialImportField, string> = {
  sku: "Cod SKU",
  name: "Denumire",
  category: "Categorie",
  unit: "Unitate de măsură",
  threshold: "Prag recomandă",
  unitValueMdl: "Valoare unitară (MDL)",
  currency: "Monedă",
};

export type MaterialImportColumnMapping = GenericColumnMapping<MaterialImportField>;

const FIELD_SYNONYMS: Record<MaterialImportField, string[]> = {
  sku: ["sku", "cod", "codsku", "codprodus", "codul", "codarticol", "articol"],
  name: ["nume", "produs", "produsul", "material", "materialul", "name", "product", "descriere"],
  category: ["categoria", "grupa", "grupa de produse", "category"],
  unit: ["unitate", "um", "unitatea", "unitatedemasura", "unit", "unitatemasura"],
  threshold: ["prag", "pragul", "stocminim", "stoc minim", "threshold", "minim"],
  unitValueMdl: ["valoare", "pret", "pretul", "pretunitar", "valoareunitara", "price", "unitprice"],
  currency: ["valuta", "currency", "monedaproduse"],
};

const SYNONYM_INDEX = buildSynonymIndex(
  MATERIAL_IMPORT_FIELDS.map((field) => ({
    field,
    label: MATERIAL_IMPORT_FIELD_LABEL[field],
    synonyms: FIELD_SYNONYMS[field],
  })),
);

export function autoMatchMaterialColumns(headers: string[]): MaterialImportColumnMapping {
  return autoMatchColumnsGeneric(headers, SYNONYM_INDEX);
}

// ---------------------------------------------------------------------------
// Unitatile: citite din ALL_UNITS, niciodata dintr-o lista de aici
// ---------------------------------------------------------------------------

/** Cheia unei unitati scrise de om. NFKD, nu NFD ca in normaliseKey: "m²" si "m³"
 *  trebuie sa devina "m2" si "m3", altfel ar cadea amandoua pe "m". */
function unitKey(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Cuvintele de ambalaj, refuzate PE NUME ca unitate. Aceleasi patru pe care le
 *  refuza si aserttiunea 0035_products_package.sql si pe care P3-102 le-a scris in
 *  lib/data/units.ts. NU sunt unitati si nu devin vreodata unitati aici. */
export const PACKAGING_LABELS = ["set", "cutie", "palet", "bax"] as const;

/** Unitatea scrisa, ca cod, sau null. Accepta codul stocat (pcs) si eticheta de pe
 *  ecran (buc), pe amandoua le ia din ALL_UNITS. */
export function readUnit(raw: string): UnitCode | null {
  const key = unitKey(raw);
  if (key === "") return null;
  for (const unit of ALL_UNITS) {
    if (unitKey(unit) === key || unitKey(unitLabel(unit)) === key) return unit;
  }
  return null;
}

/** Cuvantul de ambalaj din celula, sau null. */
export function packagingWord(raw: string): (typeof PACKAGING_LABELS)[number] | null {
  const key = unitKey(raw);
  return PACKAGING_LABELS.find((word) => word === key) ?? null;
}

/** Unitatile acceptate, dupa eticheta de pe ecran, in ordinea din ALL_UNITS. */
export function acceptedUnitLabels(): string {
  return ALL_UNITS.map(unitLabel).join(", ");
}

// ---------------------------------------------------------------------------
// Propozitiile romanesti ale refuzurilor, o singura data
// ---------------------------------------------------------------------------

export const MATERIAL_IMPORT_REASON = {
  unknownUnit: (value: string) =>
    `Unitatea "${value}" nu este acceptată. Unitățile acceptate sunt: ${acceptedUnitLabels()}.`,
  packagingUnit: (value: string) =>
    `"${value}" este un ambalaj, nu o unitate de măsură. Alege una dintre: ${acceptedUnitLabels()}. ` +
    "Ambalajul furnizorului se trece pe produs, în formularul de produs.",
  unknownCategory: (value: string) =>
    `Categoria "${value}" nu există. Adaug-o în Setări sau scrie una dintre cele existente.`,
  ambiguousCategory: (value: string) =>
    `Există mai multe categorii cu denumirea "${value}". Redenumește una dintre ele, apoi încearcă din nou.`,
  badNumber: (label: string, value: string) => `${label} "${value}" nu este un număr pozitiv.`,
  noSkuNoMatch:
    "Codul SKU lipsește și niciun produs existent nu are aceeași denumire și aceeași unitate. " +
    "Scrie codul SKU: importul nu inventează coduri.",
  unitFixed: (stored: string, given: string) =>
    `Unitatea nu se poate schimba: produsul are deja mișcări în ${stored}, iar fișierul cere ${given}. ` +
    "Unitatea rămâne cea stocată.",
} as const;

// ---------------------------------------------------------------------------
// Categoriile, numerele: citite aici
// ---------------------------------------------------------------------------

/** O categorie din baza, redusa la ce trebuie ca sa fie gasita dupa nume. */
export type CategoryChoice = { id: string; name: string };

export type CategoryLookup = Map<string, CategoryChoice[]>;

/** Litere mici, spatii colapsate. Diacriticele RAMAN, ca la clienti. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildCategoryLookup(categories: CategoryChoice[]): CategoryLookup {
  const lookup: CategoryLookup = new Map();
  for (const category of categories) {
    const key = nameKey(category.name);
    if (key === "") continue;
    lookup.set(key, [...(lookup.get(key) ?? []), category]);
  }
  return lookup;
}

/** Numarul ca text pentru scriere, sau null. Se citesc spatiile din mijloc
 *  ("12 500,50"), virgula zecimala si punctul la mii ("1.250"), vezi
 *  parseImportNumber; numeric(14,x) tine 11 cifre intregi. */
function readNumber(raw: string): string | null {
  return parseImportNumber(raw, 11);
}

// ---------------------------------------------------------------------------
// Descriptorul de camp si previzualizarea
// ---------------------------------------------------------------------------

/** Ce se poate scrie dintr-un rand de fisier. `category` poarta id-ul categoriei si
 *  `unit` codul stocat, dupa validare. */
export type PreparedMaterial = Record<MaterialImportField, string>;

function materialImportFields(categories: CategoryLookup): ImportFieldDescriptor<MaterialImportField>[] {
  const field = (
    f: MaterialImportField,
    required: boolean,
    example: string,
    validate: ImportFieldDescriptor<MaterialImportField>["validate"],
  ): ImportFieldDescriptor<MaterialImportField> => ({
    field: f,
    label: MATERIAL_IMPORT_FIELD_LABEL[f],
    required,
    example,
    validate,
  });

  const amount = (f: "threshold" | "unitValueMdl") => (raw: string) => {
    if (raw === "") return { ok: true as const, value: "" };
    const read = readNumber(raw);
    return read === null
      ? { ok: false as const, reason: MATERIAL_IMPORT_REASON.badNumber(MATERIAL_IMPORT_FIELD_LABEL[f], raw) }
      : { ok: true as const, value: read };
  };

  return [
    // SKU NU ESTE OBLIGATORIU AICI: un rand fara SKU se potriveste dupa nume plus
    // unitate cu un produs existent. Daca nu se potriveste cu nimic, planul il
    // refuza cu noSkuNoMatch. Sablonul il marcheaza totusi obligatoriu.
    field("sku", false, "ACOP-001", (raw) => ({ ok: true, value: raw })),
    field("name", true, "Șurub autoforant 4,8x19", (raw) => ({ ok: true, value: raw })),
    field("category", true, "Fixare", (raw) => {
      const hits = categories.get(nameKey(raw)) ?? [];
      if (hits.length === 0) return { ok: false, reason: MATERIAL_IMPORT_REASON.unknownCategory(raw) };
      if (hits.length > 1) return { ok: false, reason: MATERIAL_IMPORT_REASON.ambiguousCategory(raw) };
      return { ok: true, value: hits[0]!.id };
    }),
    field("unit", true, unitLabel("pcs"), (raw) => {
      const packaging = packagingWord(raw);
      if (packaging) return { ok: false, reason: MATERIAL_IMPORT_REASON.packagingUnit(raw) };
      const unit = readUnit(raw);
      return unit
        ? { ok: true, value: unit }
        : { ok: false, reason: MATERIAL_IMPORT_REASON.unknownUnit(raw) };
    }),
    field("threshold", false, "100", amount("threshold")),
    field("unitValueMdl", false, "0,35", amount("unitValueMdl")),
    // MONEDA SE VALIDEAZA SI SE ARUNCA (D8).
    field("currency", false, "", (raw) => validateCurrency(raw)),
  ];
}

/**
 * Previzualizarea unui fisier de materiale deja citit. SUBTIRE PESTE
 * buildImportPreview. NU SCRIE NIMIC. Dublarea si regula unitatii fixate cer
 * produsele stocate, deci sunt in material-import-plan.ts.
 */
export function buildMaterialImportPreview(
  rows: string[][],
  mapping: MaterialImportColumnMapping,
  categories: CategoryLookup,
  headerLine = 1,
  lines?: number[],
): ImportPreview<MaterialImportField> {
  return buildImportPreview(rows, mapping, materialImportFields(categories), headerLine, lines);
}

/**
 * Modelul de import: antetele (cele ale formularului de produs, cu Cod SKU,
 * Denumire, Categorie si Unitate de măsură marcate obligatorii) si un rand exemplu.
 * Categoria din exemplu trebuie inlocuita cu una a operatorului: NU INVENTAM O
 * CATEGORIE.
 */
export function templateCsv(): string {
  const fields = materialImportFields(new Map()).filter((f) => f.field !== "currency");
  return buildModelCsv(
    fields.map((f) => ({ label: f.label, required: f.required || f.field === "sku", example: f.example })),
  );
}

export const TEMPLATE_FILE_NAME = "sablon-materiale.csv";
export const SKIPPED_FILE_NAME = "randuri-nepreluate-materiale.csv";

/** Fisierul randurilor nepreluate: motivul, apoi randul cum a venit. */
export function skippedCsv(headers: string[], rows: { line: number; reason: string; raw: string[] }[]): string {
  return buildErrorCsv(headers, rows);
}

/**
 * Instructiunile romanesti aratate PE ECRAN. Fiecare propozitie citeste constantele
 * si listele campurilor, ca ecranul sa nu poata spune un numar sau o lista diferita
 * de cea pe care importul o aplica de fapt. LISTA UNITATILOR VINE DIN ALL_UNITS.
 */
export function materialImportInstructions(): string[] {
  const limitMb = (IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const label = MATERIAL_IMPORT_FIELD_LABEL;
  return [
    "Procesul are patru pași: încarcă fișierul CSV, potrivește coloanele cu câmpurile de mai " +
      "jos, verifică rândurile înainte să se scrie ceva, apoi importă.",
    `${label.name}, ${label.category} și ${label.unit} sunt obligatorii, iar ${label.sku} este ` +
      `necesar la un produs nou. ${label.threshold} și ${label.unitValueMdl} sunt opționale.`,
    `${label.unit} este una dintre cele ${ALL_UNITS.length} unități: ${acceptedUnitLabels()}. ` +
      "Cuvintele set, cutie, palet și bax sunt ambalaje, nu unități, și un rând care le folosește " +
      "ca unitate se respinge. Platforma nu convertește între unități.",
    `${label.category} este denumirea unei categorii care există deja; importul nu creează ` +
      `categorii. ${label.unitValueMdl} este în MDL: platforma ține evidența numai în MDL, deci ` +
      "o coloană de monedă cu EUR sau RON respinge rândul.",
    `Un rând se consideră dublat după ${label.sku}, iar când rândul nu are ${label.sku}, după ` +
      `${label.name} împreună cu ${label.unit}. Un dublat nu se șterge și nu se suprascrie ` +
      "niciodată: ori se sare peste el, ori i se completează numai câmpurile goale. Un rând fără " +
      `${label.sku} care nu se potrivește cu niciun produs existent se respinge.`,
    "Unitatea unui produs este fixă după prima lui mișcare. Importul nu schimbă niciodată " +
      "unitatea unui produs care s-a mișcat: rândul se respinge, iar unitatea stocată rămâne.",
    `Fișierul poate avea cel mult ${IMPORT_MAX_ROWS} de rânduri și ${limitMb} MB, în format CSV, ` +
      "UTF-8 cu BOM, separat prin punct și virgulă.",
  ];
}
