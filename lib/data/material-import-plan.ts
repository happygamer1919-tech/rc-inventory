// P3-125, Item 3 al lui Ivan. CE SE VA INTAMPLA CU FIECARE RAND DE MATERIAL,
// INAINTE SA SE SCRIE CEVA.
//
// ACELASI TIPAR CA lib/data/project-import-plan.ts, cardul P3-124, cu CHEIA DE
// DUBLARE SKU, sau NUME PLUS UNITATE cand randul nu are SKU (clauza 4 a cardului).
// Doua produse cu aceeasi denumire si SKU-uri diferite sunt doua produse; baza
// impune oricum products_sku_unique, iar planul o spune inainte, cu un motiv
// romanesc, in loc sa lase operatorul sa citeasca un cod 23505.
//
// UNITATEA ESTE FIXATA DUPA PRIMA MISCARE. Un rand al carui SKU exista deja si a
// carui unitate difera de cea stocata este:
//   - EROARE DE RAND, cand produsul s-a miscat (clauza 6 a cardului): unitatea
//     stocata ramane, randul intra in fisierul de erori;
//   - un DUBLAT obisnuit, cand nu s-a miscat. Unitatea NU se scrie niciodata dintr-un
//     import, nici macar atunci: a o schimba ar fi o suprascriere a ce a ales un om.
//     Dublatul spune ca unitatea din fisier diferea si a ramas neschimbata.
//
// DUBLATUL SE CAUTA IN DOUA LOCURI, ca la proiecte: printre produsele stocate si
// printre randurile de mai sus din ACELASI fisier. Fata de un rand al fisierului se
// sare intotdeauna; fata de un produs STOCAT se sare (implicit) sau i se completeaza
// NUMAI campurile goale.
//
// "GOL" LA UN PRODUS INSEAMNA ZERO pe prag si pe valoarea unitara: ambele sunt NOT
// NULL cu implicit 0, deci un produs fara pret are 0, iar 0 este cel mai apropiat
// lucru de "necompletat" pe care baza il poate spune. Denumirea, categoria si
// unitatea nu se completeaza niciodata: sunt identitatea produsului.

import {
  MATERIAL_IMPORT_FIELD_LABEL,
  MATERIAL_IMPORT_REASON,
  buildCategoryLookup,
  buildMaterialImportPreview,
  nameKey,
  type CategoryChoice,
  type MaterialImportColumnMapping,
  type MaterialImportField,
} from "./material-import-types";
import { rawRowAt } from "./import-shared";
import { unitLabel, type UnitCode } from "./units";
import { materialPreviewTable, type ImportPreviewTable } from "./import-preview-rows";

/** Campurile pe care completarea le poate scrie. */
export const MATERIAL_FILL_FIELDS = ["threshold", "unitValueMdl"] as const;

export type MaterialFillField = (typeof MATERIAL_FILL_FIELDS)[number];

/** Un produs deja stocat, redus la ce trebuie ca sa se recunoasca un dublat. */
export type ExistingMaterial = {
  id: string;
  sku: string;
  name: string;
  unit: UnitCode;
  /** Campurile care sunt GOALE azi (zero), deci singurele pe care completarea le atinge. */
  empty: MaterialFillField[];
};

export type DuplicateTarget =
  | { kind: "stored"; id: string; sku: string; name: string; by: "sku" | "name" }
  | { kind: "file"; line: number; name: string };

export type PlanEntry =
  | { kind: "new"; line: number; sku: string; name: string }
  | {
      kind: "duplicate";
      line: number;
      sku: string;
      name: string;
      against: DuplicateTarget;
      fillable: MaterialFillField[];
      /** Unitatea din fisier, cand difera de cea stocata si produsul nu s-a miscat. */
      unitDiffers: { stored: UnitCode; given: UnitCode } | null;
    }
  | { kind: "error"; line: number; reason: string; raw: string[] };

export type MaterialImportPlan = {
  entries: PlanEntry[];
  counts: { fresh: number; duplicate: number; error: number };
  /** P3-141: randurile noi, cu valorile cum vor fi salvate. */
  preview: ImportPreviewTable;
};

export type DuplicateChoice = "skip" | "fill";
export type DuplicateChoices = Record<number, DuplicateChoice>;

export function duplicateReason(entry: Extract<PlanEntry, { kind: "duplicate" }>): string {
  const base =
    entry.against.kind === "file"
      ? `Dublat: același produs ca la rândul ${entry.against.line} din același fișier.`
      : entry.against.by === "sku"
        ? `Dublat: există deja produsul "${entry.against.name}" cu codul SKU "${entry.against.sku}".`
        : `Dublat: există deja produsul "${entry.against.name}" cu aceeași denumire și aceeași unitate.`;
  return entry.unitDiffers
    ? `${base} Unitatea din fișier (${unitLabel(entry.unitDiffers.given)}) diferă de cea stocată ` +
        `(${unitLabel(entry.unitDiffers.stored)}) și rămâne neschimbată.`
    : base;
}

export function fillFieldLabel(field: MaterialFillField): string {
  return MATERIAL_IMPORT_FIELD_LABEL[field];
}

/** Cheia de dublare dupa SKU: taiat si cu litere mici, ca "ab-1" si "AB-1" sa nu
 *  treaca drept doua produse intr-un fisier scris de mana. */
export function skuKey(sku: string): string {
  return sku.trim().toLowerCase();
}

/** Cheia de dublare fara SKU: denumirea si unitatea. */
export function nameUnitKey(name: string, unit: string): string {
  return `${nameKey(name)}\u0000${unit}`;
}

/** Campurile goale ale produsului pe care fisierul le completeaza cu o valoare
 *  peste zero: a "completa" un zero peste un zero nu schimba nimic. */
function fillableFrom(
  stored: ExistingMaterial,
  material: Record<MaterialImportField, string>,
): MaterialFillField[] {
  return stored.empty.filter((field) => Number(material[field] || 0) > 0);
}

/**
 * Pregateste fiecare rand si spune ce s-ar intampla cu el. ORDINEA RANDURILOR
 * ESTE ORDINEA DIN FISIER.
 *
 * `moved` sunt id-urile produselor care s-au miscat; apelantul le calculeaza numai
 * pentru produsele din `unitChecks` (vezi mai jos), cu productHasMovements.
 * `unitChecks` intoarce id-urile produselor al caror SKU apare in fisier cu o
 * unitate diferita, adica singurele pentru care intrebarea "s-a miscat?" conteaza.
 */
export function buildMaterialPlan(input: {
  rows: string[][];
  mapping: MaterialImportColumnMapping;
  categories: CategoryChoice[];
  existing: ExistingMaterial[];
  moved?: ReadonlySet<string>;
  headerLine?: number;
  /** Linia din Excel a fiecarui rand de date, cand fisierul are linii goale. */
  lines?: number[];
}): {
  plan: MaterialImportPlan;
  prepared: Map<number, Record<MaterialImportField, string>>;
  unitChecks: string[];
} {
  const headerLine = input.headerLine ?? 1;
  const moved = input.moved ?? new Set<string>();
  const preview = buildMaterialImportPreview(
    input.rows,
    input.mapping,
    buildCategoryLookup(input.categories),
    headerLine,
    input.lines,
  );

  const storedBySku = new Map<string, ExistingMaterial>();
  const storedByNameUnit = new Map<string, ExistingMaterial[]>();
  for (const product of input.existing) {
    const sku = skuKey(product.sku);
    if (sku !== "" && !storedBySku.has(sku)) storedBySku.set(sku, product);
    const key = nameUnitKey(product.name, product.unit);
    storedByNameUnit.set(key, [...(storedByNameUnit.get(key) ?? []), product]);
  }

  const fileBySku = new Map<string, { line: number; name: string }>();
  const fileByNameUnit = new Map<string, { line: number; name: string }>();

  const entries: PlanEntry[] = [];
  const prepared = new Map<number, Record<MaterialImportField, string>>();
  const unitChecks = new Set<string>();
  const counts = { fresh: 0, duplicate: 0, error: 0 };

  const fail = (line: number, reason: string, raw: string[]) => {
    entries.push({ kind: "error", line, reason, raw });
    counts.error += 1;
  };

  for (const bad of preview.invalid) fail(bad.line, bad.reason, bad.raw);

  for (const row of preview.valid) {
    const material = row.record;
    const raw = rawRowAt(input.rows, input.lines, headerLine, row.line);
    const unit = material.unit as UnitCode;
    const sku = material.sku.trim();
    const byNameUnit = nameUnitKey(material.name, unit);

    prepared.set(row.line, material);

    if (sku !== "") {
      const fileMatch = fileBySku.get(skuKey(sku));
      if (fileMatch) {
        entries.push({
          kind: "duplicate",
          line: row.line,
          sku,
          name: material.name,
          against: { kind: "file", line: fileMatch.line, name: fileMatch.name },
          fillable: [],
          unitDiffers: null,
        });
        counts.duplicate += 1;
        continue;
      }

      const stored = storedBySku.get(skuKey(sku));
      if (stored) {
        const differs = stored.unit !== unit;
        if (differs) unitChecks.add(stored.id);
        if (differs && moved.has(stored.id)) {
          fail(
            row.line,
            MATERIAL_IMPORT_REASON.unitFixed(unitLabel(stored.unit), unitLabel(unit)),
            raw,
          );
          continue;
        }
        entries.push({
          kind: "duplicate",
          line: row.line,
          sku,
          name: material.name,
          against: { kind: "stored", id: stored.id, sku: stored.sku, name: stored.name, by: "sku" },
          fillable: fillableFrom(stored, material),
          unitDiffers: differs ? { stored: stored.unit, given: unit } : null,
        });
        counts.duplicate += 1;
        continue;
      }

      fileBySku.set(skuKey(sku), { line: row.line, name: material.name });
      fileByNameUnit.set(byNameUnit, { line: row.line, name: material.name });
      entries.push({ kind: "new", line: row.line, sku, name: material.name });
      counts.fresh += 1;
      continue;
    }

    // FARA SKU: numai potrivire, niciodata creare.
    const fileMatch = fileByNameUnit.get(byNameUnit);
    if (fileMatch) {
      entries.push({
        kind: "duplicate",
        line: row.line,
        sku: "",
        name: material.name,
        against: { kind: "file", line: fileMatch.line, name: fileMatch.name },
        fillable: [],
        unitDiffers: null,
      });
      counts.duplicate += 1;
      continue;
    }

    const hits = storedByNameUnit.get(byNameUnit) ?? [];
    if (hits.length === 0) {
      fail(row.line, MATERIAL_IMPORT_REASON.noSkuNoMatch, raw);
      continue;
    }
    if (hits.length > 1) {
      fail(
        row.line,
        `Mai multe produse au aceeași denumire și aceeași unitate ("${material.name}"). ` +
          `Scrie codul ${MATERIAL_IMPORT_FIELD_LABEL.sku} al celui pe care îl vrei.`,
        raw,
      );
      continue;
    }
    const hit = hits[0]!;
    entries.push({
      kind: "duplicate",
      line: row.line,
      sku: "",
      name: material.name,
      against: { kind: "stored", id: hit.id, sku: hit.sku, name: hit.name, by: "name" },
      fillable: fillableFrom(hit, material),
      unitDiffers: null,
    });
    counts.duplicate += 1;
  }

  entries.sort((a, b) => a.line - b.line);

  const newRows = materialPreviewTable(
    entries.filter((e) => e.kind === "new").map((e) => e.line),
    prepared,
    new Map(input.categories.map((c) => [c.id, c.name])),
  );

  return { plan: { entries, counts, preview: newRows }, prepared, unitChecks: [...unitChecks] };
}
