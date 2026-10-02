// P3-121, Item 3 al lui Ivan. CITITORUL, SCRIITORUL SI PREVIZUALIZAREA COMUNA DE CSV.
//
// EXTRAS DIN lead-import-types.ts, CARDUL P3-101, SI NU REINVENTAT: parseCsv,
// buildCsv, sniffDelimiter si normaliseKey sunt mutate aici fara nicio schimbare
// de comportament, fiindca P3-101 a platit deja corectitudinea lor (RFC 4180,
// marca de ordine a octetilor, randul gol de la finalul fisierului Excel). Un
// cititor rescris ar insemna sa se castige din nou acelasi lucru.
//
// CE ESTE AICI SI CE NU. Acest fisier nu stie nimic despre lead, client,
// proiect sau material: citirea fisierului, scrierea lui, potrivirea unei
// coloane cu un camp, modelul de previzualizare (randuri citite, eroare pe rand
// cu motiv, numere valide si invalide) si fisierul de erori descarcabil. Ce
// campuri exista, care sunt obligatorii, care este cheia de dublare si ce este o
// valoare acceptata vine DINAFARA, ca un descriptor: lib/data/lead-import-types.ts
// il da pentru leaduri, iar cardurile P3-123 la P3-125 il vor da pentru clienti,
// proiecte si materiale.
//
// CSV FARA NICIO BIBLIOTECA NOUA, acelasi motiv ca la P3-101: depozitul are sase
// dependinte de executie si un cititor de CSV incape intr-un fisier.

// ---------------------------------------------------------------------------
// Limitele, o singura data
// ---------------------------------------------------------------------------

/** Cat de mare poate fi fisierul, din goal G58 si din Item 3. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Cate randuri de date, fara antet, din goal G58 si din Item 3. */
export const IMPORT_MAX_ROWS = 5000;

/** Cate valori din fisier se arata langa fiecare coloana, la potrivire. */
export const IMPORT_SAMPLE_COUNT = 3;

/** Alegerea "nu lua coloana asta", si valoarea ei in selector. */
export const IMPORT_SKIP = "";
export const IMPORT_SKIP_LABEL = "Nu importa";

/** Numarul randului asa cum il vede operatorul in Excel: antetul este randul 1. */
export type RowNumber = number;

/**
 * Fisierul este peste limita de octeti sau de randuri? Un singur loc, ca orice
 * ecran de import sa arate aceeasi propozitie si aceleasi doua numere: limita si
 * marimea reala.
 */
export function checkByteLimit(byteLength: number): { ok: true } | { ok: false; reason: string } {
  if (byteLength <= IMPORT_MAX_BYTES) return { ok: true };
  const actualMb = (byteLength / (1024 * 1024)).toFixed(1);
  const limitMb = (IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0);
  return {
    ok: false,
    reason: `Fișierul are ${actualMb} MB, peste limita de ${limitMb} MB.`,
  };
}

export function checkRowLimit(dataRowCount: number): { ok: true } | { ok: false; reason: string } {
  if (dataRowCount <= IMPORT_MAX_ROWS) return { ok: true };
  return {
    ok: false,
    reason: `Fișierul are ${dataRowCount} de rânduri, peste limita de ${IMPORT_MAX_ROWS}.`,
  };
}

/** Amandoua verificarile, octeti intai: un fisier prea mare se refuza inainte sa
 *  se numere randurile lui. */
export function checkFileLimits(
  byteLength: number,
  dataRowCount: number,
): { ok: true } | { ok: false; reason: string } {
  const bytes = checkByteLimit(byteLength);
  if (!bytes.ok) return bytes;
  return checkRowLimit(dataRowCount);
}

// ---------------------------------------------------------------------------
// Normalizarea textului, pentru potriviri
// ---------------------------------------------------------------------------

/** Litere mici, fara diacritice, fara nimic in afara de litere si cifre.
 *
 *  Antetele vin scrise de oameni: "Telefon", "telefon ", "TELEFON:", "Nr. telefon".
 *  Potrivirea se face pe forma aceasta, deci toate cad pe acelasi sir. */
export function normaliseKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Un camp al oricarei entitati: eticheta lui romaneasca si sinonimele pe care
 *  potrivirea automata le recunoaste. Eticheta se adauga automat la sinonime, deci
 *  nu se repeta in lista. */
export type SynonymField<F extends string> = {
  field: F;
  label: string;
  synonyms?: string[];
};

/** Sinonim normalizat -> camp. Primul castigator ramane castigator: un sinonim
 *  scris la doua campuri ar fi o ambiguitate tacuta, si asa este macar stabila. */
export function buildSynonymIndex<F extends string>(fields: SynonymField<F>[]): Map<string, F> {
  const index = new Map<string, F>();
  for (const fd of fields) {
    const keys = [fd.label, ...(fd.synonyms ?? [])];
    for (const key of keys) {
      const normalised = normaliseKey(key);
      if (normalised !== "" && !index.has(normalised)) index.set(normalised, fd.field);
    }
  }
  return index;
}

/** O potrivire este `null` cand coloana nu intra nicaieri. */
export type ColumnMapping<F extends string> = (F | null)[];

/**
 * Potriveste automat fiecare antet cu un camp, dupa indexul de sinonime al
 * entitatii.
 *
 * UN CAMP SE IA O SINGURA DATA. Doua coloane numite "Telefon" si "Telefon 2" ar
 * cadea amandoua pe acelasi camp, iar a doua ar suprascrie tacut prima la
 * scriere. A doua ramane pe "Nu importa" si operatorul decide.
 */
export function autoMatchColumns<F extends string>(
  headers: string[],
  index: Map<string, F>,
): ColumnMapping<F> {
  const taken = new Set<F>();
  return headers.map((header) => {
    const field = index.get(normaliseKey(header));
    if (!field || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
}

// ---------------------------------------------------------------------------
// Citirea unui CSV
// ---------------------------------------------------------------------------

/** Separatorii pe care ii recunoastem. Excel pe o masina romaneasca salveaza cu
 *  punct si virgula, nu cu virgula, deci ordinea aceasta nu este cosmetica. */
const DELIMITERS = [",", ";", "\t"] as const;

/** Ghiceste separatorul numarand aparitiile din AFARA ghilimelelor, pe primul
 *  rand. Un nume ca "Popescu, Ion" intre ghilimele nu trebuie sa faca virgula
 *  sa castige. */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === delimiter) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

/**
 * Citeste un CSV in randuri de celule.
 *
 * Ghilimele dupa RFC 4180: o celula poate fi intre ghilimele, iar o ghilimea
 * inauntru se scrie de doua ori. Randurile se pot termina cu \n sau \r\n.
 * Marca de ordine a octetilor (BOM) pe care Excel o pune in fata fisierului se
 * taie, altfel primul antet ar fi "﻿Denumire" si nu s-ar potrivi cu nimic.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = sniffDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }

    if (char === '"' && cell.trim() === "") {
      // Ghilimelele deschid celula numai cand nu s-a scris nimic in ea inca:
      // asa un apostrof tipografic din mijlocul unui text nu deschide nimic.
      cell = "";
      quoted = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      endCell();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    cell += char;
    i += 1;
  }

  if (cell !== "" || row.length > 0) endRow();

  // Un rand complet gol nu este un rand: fisierele salvate din Excel se termina
  // aproape mereu cu unul, si el ar deveni un rand fara denumire, adica o eroare
  // pe care nu a scris-o nimeni.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Scrie randuri ca CSV, cu virgula, pentru sablon, pentru export si pentru
 *  fisierul randurilor sarite. BOM in fata, ca Excel sa deschida diacriticele
 *  corect. */
export function buildCsv(rows: string[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(","),
    )
    .join("\r\n");
  return `﻿${body}\r\n`;
}

/** Coloanele fisierului de erori: motivul, apoi randul cum a venit. Comun
 *  oricarei entitati, fiindca forma lui este cardul P3-121 clauza 5. */
export function buildErrorCsv(
  headers: string[],
  rows: { line: number; reason: string; raw: string[] }[],
): string {
  return buildCsv([
    ["Rând", "Motiv", ...headers],
    ...rows.map((r) => [String(r.line), r.reason, ...r.raw]),
  ]);
}

/**
 * Sablonul de import: antetele, cu cele obligatorii marcate, si un rand exemplu
 * care ar trebui el insusi sa se importe curat. Folosit de cardurile P3-122 la
 * P3-125; nu schimba sablonul leadurilor, care ramane header-only pana cand
 * P3-122 il extinde.
 */
export function buildModelCsv(
  fields: { label: string; required: boolean; example: string }[],
): string {
  const headerRow = fields.map((f) => (f.required ? `${f.label} *` : f.label));
  const exampleRow = fields.map((f) => f.example);
  return buildCsv([headerRow, exampleRow]);
}

// ---------------------------------------------------------------------------
// Valori comune de cel putin doua entitati: moneda (D8)
// ---------------------------------------------------------------------------

export type FieldValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Deviatia D8. Depozitul stocheaza numai MDL: constrangerile devize_currency_mdl
 * (0025_deviz.sql) si invoices_currency_mdl (0063_invoices.sql) refuza orice alta
 * moneda la scriere. O coloana de moneda lipsa inseamna MDL implicit; o valoare
 * scrisa care nu este MDL (in orice scriere, litere mari sau mici) este o eroare
 * de rand cu un motiv romanesc care numeste MDL, NU o scriere care ar esua abia
 * la baza de date.
 */
export function validateCurrency(raw: string): FieldValidation {
  const value = raw.trim();
  if (value === "" || normaliseKey(value) === "mdl") return { ok: true, value: "MDL" };
  return {
    ok: false,
    reason: `Moneda "${value}" nu este acceptată. Platforma ține evidența numai în MDL.`,
  };
}

// ---------------------------------------------------------------------------
// Descriptorul: ce stie fiecare entitate despre campurile ei
// ---------------------------------------------------------------------------

/**
 * Un camp al unei entitati, asa cum il vede importul comun. `validate` intoarce
 * valoarea normalizata de scris sau motivul romanesc al refuzului; cimpul gol pe
 * un camp obligatoriu este refuzat INAINTE sa fie chemat `validate`, cu un motiv
 * generic care numeste eticheta.
 */
export type ImportFieldDescriptor<F extends string> = SynonymField<F> & {
  required: boolean;
  example: string;
  validate: (raw: string) => FieldValidation;
};

/** Un rand pregatit, sau motivul pentru care nu s-a putut pregati. */
export type PreparedImportRow<F extends string> =
  | { ok: true; line: RowNumber; record: Record<F, string> }
  | { ok: false; line: RowNumber; reason: string; raw: string[] };

/**
 * Verifica un rand si il pregateste pentru scriere, dupa descriptorul entitatii.
 *
 * NICIUN RAND PARTIAL NU IESE DE AICI, CARDUL P3-121 CLAUZA 6. `record` este o
 * variabila LOCALA acestei functii: ea se intoarce numai dupa ce FIECARE camp a
 * trecut validarea lui, iar functia iese pe `return` la primul camp care cade,
 * fara sa expuna nimic din ce a scris pana atunci. Un rand care cade la al
 * patrulea camp nu lasa in urma primele trei: ele nu ajung niciodata intr-o
 * valoare pe care apelantul o poate citi.
 */
export function prepareImportRow<F extends string>(
  cells: string[],
  mapping: ColumnMapping<F>,
  fields: ImportFieldDescriptor<F>[],
  line: RowNumber,
): PreparedImportRow<F> {
  const read = (field: F): string => {
    const at = mapping.indexOf(field);
    return at < 0 ? "" : (cells[at] ?? "").trim();
  };

  const record = {} as Record<F, string>;
  for (const fd of fields) {
    const raw = read(fd.field);
    if (raw === "" && fd.required) {
      return { ok: false, line, reason: `${fd.label} lipsește.`, raw: cells };
    }
    const result = fd.validate(raw);
    if (!result.ok) return { ok: false, line, reason: result.reason, raw: cells };
    record[fd.field] = result.value;
  }
  return { ok: true, line, record };
}

/** Previzualizarea comuna: fiecare rand citit cade in exact una din cele doua
 *  liste, iar numerele se citesc direct din lungimea lor. */
export type ImportPreview<F extends string> = {
  valid: { line: RowNumber; record: Record<F, string> }[];
  invalid: { line: RowNumber; reason: string; raw: string[] }[];
  validCount: number;
  invalidCount: number;
};

/**
 * Previzualizeaza un fisier deja citit (antet separat de randuri) dupa
 * descriptorul entitatii. NU SCRIE NIMIC: pasul "Verifică" din goal G58 si clauza
 * (3) a cardurilor P3-123 la P3-125 cer exact separarea asta, numerele se vad
 * inainte ca ceva sa ajunga in baza.
 */
export function buildImportPreview<F extends string>(
  rows: string[][],
  mapping: ColumnMapping<F>,
  fields: ImportFieldDescriptor<F>[],
  headerLine = 1,
): ImportPreview<F> {
  const valid: ImportPreview<F>["valid"] = [];
  const invalid: ImportPreview<F>["invalid"] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const line = headerLine + 1 + i;
    const prepared = prepareImportRow(rows[i] ?? [], mapping, fields, line);
    if (prepared.ok) valid.push({ line, record: prepared.record });
    else invalid.push({ line, reason: prepared.reason, raw: prepared.raw });
  }

  return { valid, invalid, validCount: valid.length, invalidCount: invalid.length };
}
