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
  return parseCsvWithLines(input).rows;
}

/**
 * La fel ca parseCsv, dar spune si pe ce linie fizica din fisier (antetul este linia 1)
 * incepe fiecare rand intors, ca "Randul N" sa fie randul pe care operatorul il vede in
 * Excel. Liniile goale nu devin randuri, dar se numara: un rand de dupa o linie goala
 * nu mai este randul de dupa antet cu un indice mai sus. O celula intre ghilimele cu
 * rand nou inauntru ocupa mai multe linii, si randul urmator se numara dupa ele.
 */
export function parseCsvWithLines(input: string): { rows: string[][]; lines: number[] } {
  const text = input.replace(/^﻿/, "");
  const delimiter = sniffDelimiter(text);

  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  let lineNo = 1;
  let startLine = 1;

  const endCell = () => {
    row.push(unwrapCsvCell(cell));
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    lines.push(startLine);
    row = [];
    startLine = lineNo;
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
      if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) lineNo += 1;
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
      lineNo += 1;
      endRow();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      lineNo += 1;
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
  const kept = rows.map((_, at) => at).filter((at) => rows[at]!.some((c) => c.trim() !== ""));
  return { rows: kept.map((at) => rows[at]!), lines: kept.map((at) => lines[at]!) };
}

/** Celulele originale ale randului de la linia `line` din Excel, pentru fisierul de erori:
 *  un rand sarit se poate corecta si incarca din nou numai daca isi are toate celulele. */
export function rawRowAt(
  rows: string[][],
  lines: number[] | undefined,
  headerLine: number,
  line: number,
): string[] {
  const index = lines ? lines.indexOf(line) : line - headerLine - 1;
  return rows[index] ?? [];
}

/** Linia din Excel a randului de date `index` (de la 0, fara antet): cea din `lines`
 *  cand ecranul a trimis-o, altfel cea de dupa antet, fara linii goale. */
export function dataRowLine(lines: number[] | undefined, headerLine: number, index: number): number {
  return lines?.[index] ?? headerLine + 1 + index;
}

/** Un numar pentru o celula de export, cu virgula zecimala (12,5), cum il citeste Excel pe un
 *  calculator cu setari romanesti sau ruse. Cu punct (12.5) Excel il citeste ca data.
 *  `parseImportNumber` citeste inapoi virgula zecimala. Fara notatie stiintifica. */
export function formatCsvNumber(value: number | string): string {
  const text = typeof value === "number" ? String(Number(value.toFixed(3))) : value;
  return text.replace(".", ",");
}

/** O celula pe care Excel trebuie sa o pastreze ca text (telefon, IDNO): fara asta, +37369123456
 *  ajunge numarul 37369123456, iar 0123456789012 ajunge 1,23E+11 fara zeroul din fata. */
export type CsvTextCell = { csvText: string };
export type CsvCell = string | CsvTextCell;

export function csvText(value: string): CsvTextCell {
  return { csvText: value };
}

// Un numar negativ scris de formatCsvNumber (-5, -12,5) ramane numar, nu primeste apostrof.
const NEGATIVE_NUMBER = /^-\d+(,\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;
const TEXT_FORMULA = /^="((?:[^"]|"")*)"$/;

function writeCsvCell(cell: CsvCell): string {
  if (typeof cell !== "string") {
    // Forma ="..." este un sir literal pentru Excel: se afiseaza fara apostrof si nu poate
    // porni nicio formula. parseCsv o desface la citire (unwrapCsvCell).
    if (cell.csvText === "") return "";
    const literal = `="${cell.csvText.replace(/"/g, '""')}"`;
    return `"${literal.replace(/"/g, '""')}"`;
  }
  // OWASP, injectare de formule: o celula care incepe cu = + - @ tab sau CR primeste un
  // apostrof in fata. Numerele negative nu: Excel le citeste ca numere, nu ca formule.
  const safe = FORMULA_START.test(cell) && !NEGATIVE_NUMBER.test(cell) ? `'${cell}` : cell;
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Inversul lui writeCsvCell, la citire: scoate ="..." si apostroful pus in fata unei celule care
 *  incepe cu = + - @ tab sau CR. Alt apostrof de la inceputul unui text ramane cum este. */
function unwrapCsvCell(cell: string): string {
  const literal = TEXT_FORMULA.exec(cell);
  if (literal) return literal[1]!.replace(/""/g, '"');
  if (cell.startsWith("'") && FORMULA_START.test(cell.slice(1))) return cell.slice(1);
  return cell;
}

/** Scrie randuri ca CSV, cu punct si virgula intre coloane (Excel cu setari romanesti sau
 *  ruse nu desparte coloanele la virgula), pentru sablon, pentru export si pentru
 *  fisierul randurilor sarite. BOM in fata, ca Excel sa deschida diacriticele
 *  corect. Celulele de text care ar porni o formula primesc un apostrof; `csvText`
 *  marcheaza telefoanele si codurile fiscale, pastrate ca text de Excel. */
export function buildCsv(rows: CsvCell[][]): string {
  const body = rows.map((row) => row.map(writeCsvCell).join(";")).join("\r\n");
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

  if (rowHasBrokenLetters(cells)) {
    return { ok: false, line, reason: BROKEN_LETTERS_ROW_REASON, raw: cells };
  }

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
  lines?: number[],
): ImportPreview<F> {
  const valid: ImportPreview<F>["valid"] = [];
  const invalid: ImportPreview<F>["invalid"] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const line = dataRowLine(lines, headerLine, i);
    const prepared = prepareImportRow(rows[i] ?? [], mapping, fields, line);
    if (prepared.ok) valid.push({ line, record: prepared.record });
    else invalid.push({ line, reason: prepared.reason, raw: prepared.raw });
  }

  return { valid, invalid, validCount: valid.length, invalidCount: invalid.length };
}

// ---------------------------------------------------------------------------
// Data calendaristica, comuna: P3-124
// ---------------------------------------------------------------------------

/**
 * Citeste o data scrisa AAAA-LL-ZZ sau ZZ.LL.AAAA (punct sau bara) si o
 * intoarce ca AAAA-LL-ZZ, sau `null` cand sirul nu este o zi reala. ADAUGAT de
 * cardul P3-124, FARA sa atinga nimic din ce era aici: importul de proiecte este
 * primul care il ia din fisierul comun, iar copiile mai vechi din importul de
 * leaduri si de clienti raman cum sunt.
 */
export function readImportDate(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;

  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (local) {
    day = Number(local[1]);
    month = Number(local[2]);
    year = Number(local[3]);
  } else return null;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString().slice(0, 10);
}

/** Data pasului urmator trimisa la creare. O celula goala sau o coloana lipsa inseamna
 *  "nicio valoare" (undefined), nu o stergere (""): numai asa createClientRecord aplica
 *  oglindirea "de reluat" ca in formular. */
export function importNextActionAt(date: string): string | undefined {
  return date === "" ? undefined : date;
}

// ---------------------------------------------------------------------------
// Codarea fisierului, P3-145
// ---------------------------------------------------------------------------

export const BROKEN_LETTERS_FILE_ERROR =
  "Fișierul conține caractere care nu pot fi citite. Salvați-l din Excel ca „CSV UTF-8” și încercați din nou.";

export const BROKEN_LETTERS_ROW_REASON =
  "Rândul conține litere stricate (caractere care nu au putut fi citite).";

/** Semnul de inlocuire U+FFFD: apare cand un octet nu se poate decoda. */
export function hasReplacementChar(text: string): boolean {
  return text.includes("�");
}

/** Linia de aparare de pe server: un rand cu orice camp stricat nu ajunge in baza. */
export function rowHasBrokenLetters(cells: string[]): boolean {
  return cells.some(hasReplacementChar);
}

/**
 * Citeste octetii unui CSV. REGULA, simpla:
 *  1. UTF-8 strict (marca BOM taiata). Daca merge, este UTF-8.
 *  2. Altfel, se incearca windows-1250 (Excel pe Windows romanesc) si
 *     windows-1251 (Excel pe Windows rusesc). Se decide prin majoritate, in
 *     citirea 1250: se numara literele romanesti (ă â î ș ț) si literele
 *     straine (ü ä é È à í etc.). Se alege 1251 doar cand literele straine sunt
 *     mai multe decat cele romanesti (un fisier rusesc citit ca 1250 arata ca
 *     "Èâàí" pentru "Иван") SI citirea 1251 are litere chirilice. Un fisier
 *     romanesc cu cateva litere straine (Würth, Kärcher, André) ramane 1250,
 *     cu ş ţ cu sedila (cum scrie Excel) aduse la ș ț cu virgula.
 *  3. Inainte de revenirea la o codare pe un octet, verificare de plauzibilitate
 *     (P3-194): se refuza daca fisierul are octeti 0x00, daca textul are
 *     caractere de control (altele decat tab, CR, LF), sau daca fisierul este
 *     UTF-8 aproape curat cu cateva secvente gresite (cel putin 2 caractere UTF-8
 *     valide si cel putin dublul numarului de secvente gresite): acela este un
 *     UTF-8 stricat, nu windows-1250.
 *  4. Daca textul ales tot are U+FFFD, se intoarce eroare, nu text.
 *  Inaintea tuturor: UTF-16 (export "Unicode Text" din Excel) se detecteaza dupa
 *  marca BOM FF FE / FE FF sau, fara marca, dupa cel putin o treime octeti 0x00,
 *  si se citeste ca UTF-16; ce nu se poate citi curat se refuza.
 */
const ROMANIAN_LETTERS = "ăâîșțşţĂÂÎȘȚŞŢ";

/** Control C0 fara tab (09), LF (0A), CR (0D). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

/** Cel putin o treime din octeti 0x00: aproape sigur UTF-16 fara marca BOM. */
const UTF16_ZERO_SHARE = 1 / 3;

function detectUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes.length < 4) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) even++;
    else odd++;
  }
  if ((even + odd) / bytes.length < UTF16_ZERO_SHARE) return null;
  return odd >= even ? "utf-16le" : "utf-16be";
}

/** Numara caracterele UTF-8 valide (peste ASCII) si secventele gresite. */
function countUtf8Sequences(bytes: Uint8Array): { valid: number; invalid: number } {
  let valid = 0;
  let invalid = 0;
  for (const ch of new TextDecoder("utf-8").decode(bytes)) {
    if (ch === "�") invalid++;
    else if (ch.charCodeAt(0) > 127) valid++;
  }
  return { valid, invalid };
}

export function decodeCsvFile(
  buf: ArrayBuffer,
): { text: string; encoding: string } | { error: string } {
  let bytes = new Uint8Array(buf);

  const utf16 = detectUtf16(bytes);
  if (utf16) {
    try {
      const decoded = new TextDecoder(utf16, { fatal: true }).decode(bytes);
      const text = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
      if (hasReplacementChar(text) || CONTROL_CHARS.test(text)) {
        return { error: BROKEN_LETTERS_FILE_ERROR };
      }
      return { text, encoding: utf16 };
    } catch {
      return { error: BROKEN_LETTERS_FILE_ERROR };
    }
  }

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);

  let text: string;
  let encoding: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    encoding = "utf-8";
  } catch {
    if (bytes.includes(0)) return { error: BROKEN_LETTERS_FILE_ERROR };
    const seq = countUtf8Sequences(bytes);
    if (seq.valid >= 2 && seq.valid >= 2 * seq.invalid) return { error: BROKEN_LETTERS_FILE_ERROR };
    const t1250 = new TextDecoder("windows-1250").decode(bytes);
    const t1251 = new TextDecoder("windows-1251").decode(bytes);
    const cyrillic = /[Ѐ-ӿ]/.test(t1251);
    let ro = 0;
    let foreign = 0;
    for (const ch of t1250) {
      if (ROMANIAN_LETTERS.includes(ch)) ro++;
      else if (ch.charCodeAt(0) > 127 && /\p{L}/u.test(ch)) foreign++;
    }
    if (cyrillic && foreign > ro) {
      text = t1251;
      encoding = "windows-1251";
    } else {
      text = t1250
        .replace(/Ş/g, "Ș")
        .replace(/ş/g, "ș")
        .replace(/Ţ/g, "Ț")
        .replace(/ţ/g, "ț");
      encoding = "windows-1250";
    }
    if (CONTROL_CHARS.test(text)) return { error: BROKEN_LETTERS_FILE_ERROR };
  }

  if (hasReplacementChar(text)) return { error: BROKEN_LETTERS_FILE_ERROR };
  return { text, encoding };
}
