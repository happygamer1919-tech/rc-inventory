// Importul de leaduri dintr-un fisier, cardul P3-101, goal G58.
//
// NIMIC DE SERVER AICI, acelasi motiv ca la clients-types: ecranul de import
// citeste fisierul in browser, iar actiunea de server verifica aceleasi randuri
// cu exact acelasi cod. Doua copii ale regulii "ce este un rand valid" ar fi doua
// raspunsuri diferite la aceeasi intrebare, unul pe ecran si altul in baza.
//
// NIMIC NU SE STERGE SI NIMIC NU SE SUPRASCRIE. Fisierul nu are nicio cale prin
// care sa schimbe o valoare pe care a scris-o un om: un dublat ori se sare peste
// el, ori i se completeaza NUMAI campurile goale. De aceea tipul de mai jos
// numeste campurile pe care le poate ADAUGA si nu are niciun camp de stergere.
//
// CSV FARA NICIO BIBLIOTECA NOUA. Depozitul are sase dependinte de executie si
// un cititor de CSV incape in fisierul acesta. XLSX nu incape: este o arhiva zip
// cu XML inauntru, deci cere o biblioteca, si intrebarea aceea sta la proprietar
// (mailbox q084). Pana la raspuns ecranul spune operatorului sa salveze fisierul
// ca CSV, in romana, si atat.

import {
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGES,
  CLIENT_STAGE_LABEL,
  FOLLOW_UP_DATE_REQUIRED,
  type ClientSource,
  type ClientStage,
  type ClientType,
} from "./clients-types";

/** Cat de mare poate fi fisierul, din goal G58. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Cate randuri de date, fara antet, din goal G58. */
export const IMPORT_MAX_ROWS = 5000;

/** Cate valori din fisier se arata langa fiecare coloana, la potrivire. */
export const IMPORT_SAMPLE_COUNT = 3;

/** Campurile RC in care poate intra o coloana din fisier, IN ORDINEA din goal G58. */
export const IMPORT_FIELDS = [
  "name",
  "type",
  "phone",
  "email",
  "contactName",
  "interest",
  "source",
  "ownerName",
  "stage",
  "followUpDate",
  "nextAction",
  "notes",
  "address",
  "fiscalCode",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Eticheta romaneasca a fiecarui camp, cu diacritice. Tot ce se vede pe ecran. */
export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  name: "Denumire",
  type: "Tip",
  phone: "Telefon",
  email: "Email",
  contactName: "Persoană de contact",
  interest: "Interes",
  source: "Sursă",
  ownerName: "Responsabil",
  stage: "Etapă",
  followUpDate: "Data de reluare",
  nextAction: "Următorul pas",
  notes: "Note",
  address: "Adresă",
  fiscalCode: "IDNO",
};

/** Alegerea "nu lua coloana asta", si valoarea ei in selector. */
export const IMPORT_SKIP = "";
export const IMPORT_SKIP_LABEL = "Nu importa";

/** O potrivire este `null` cand coloana nu intra nicaieri. */
export type ColumnMapping = (ImportField | null)[];

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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Sinonimele fiecarui camp, romanesti si englezesti, scrise deja normalizat de
 *  normaliseKey la citire. Eticheta campului se adauga automat mai jos, deci nu
 *  se repeta aici. */
const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  name: ["nume", "denumire", "companie", "firma", "client", "lead", "name", "company", "denumirea"],
  type: ["tip", "tipul", "type", "tipclient"],
  phone: ["telefon", "tel", "mobil", "phone", "mobile", "nrtelefon", "numartelefon", "telefonul"],
  email: ["email", "mail", "eposta", "adresaemail", "emailul"],
  contactName: [
    "persoanadecontact",
    "contact",
    "persoanacontact",
    "contactperson",
    "persoana",
    "reprezentant",
  ],
  interest: ["interes", "interesul", "cevrea", "interest", "cerere", "solicitare"],
  source: ["sursa", "source", "deunde", "provenienta", "canal"],
  ownerName: ["responsabil", "responsabilul", "owner", "agent", "alocat", "asignat"],
  stage: ["etapa", "stadiu", "stage", "status", "statut"],
  followUpDate: [
    "datadereluare",
    "reluare",
    "datareluare",
    "followup",
    "followupdate",
    "dedatade",
    "datarevenire",
    "revenire",
  ],
  nextAction: ["urmatorulpas", "pasulurmator", "nextstep", "nextaction", "urmatorul", "actiune"],
  notes: ["note", "notite", "observatii", "notes", "comentarii", "mentiuni"],
  address: ["adresa", "address", "adresal", "localitate", "adresaclient"],
  fiscalCode: ["idno", "cui", "codfiscal", "fiscalcode", "idnocui", "cod"],
};

/** Sinonim normalizat -> camp. Primul castigator ramane castigator: un sinonim
 *  scris la doua campuri ar fi o ambiguitate tacuta, si asa este macar stabila. */
const SYNONYM_INDEX: Map<string, ImportField> = (() => {
  const index = new Map<string, ImportField>();
  for (const field of IMPORT_FIELDS) {
    const keys = [IMPORT_FIELD_LABEL[field], ...FIELD_SYNONYMS[field]];
    for (const key of keys) {
      const normalised = normaliseKey(key);
      if (normalised !== "" && !index.has(normalised)) index.set(normalised, field);
    }
  }
  return index;
})();

/**
 * Potriveste automat fiecare antet cu un camp RC.
 *
 * UN CAMP SE IA O SINGURA DATA. Doua coloane numite "Telefon" si "Telefon 2" ar
 * cadea amandoua pe `phone`, iar a doua ar suprascrie tacut prima la scriere. A
 * doua ramane pe "Nu importa" si operatorul decide.
 */
export function autoMatchColumns(headers: string[]): ColumnMapping {
  const taken = new Set<ImportField>();
  return headers.map((header) => {
    const field = SYNONYM_INDEX.get(normaliseKey(header));
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
 * taie, altfel primul antet ar fi "\uFEFFDenumire" si nu s-ar potrivi cu nimic.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
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

/** Scrie randuri ca CSV, cu virgula, pentru sablon si pentru fisierul randurilor
 *  sarite. BOM in fata, ca Excel sa deschida diacriticele corect. */
export function buildCsv(rows: string[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(","),
    )
    .join("\r\n");
  return `\uFEFF${body}\r\n`;
}

/** Sablonul gol: exact antetele pe care ecranul le stie sa potriveasca. */
export function templateCsv(): string {
  return buildCsv([IMPORT_FIELDS.map((f) => IMPORT_FIELD_LABEL[f])]);
}

export const TEMPLATE_FILE_NAME = "sablon-leaduri.csv";
export const SKIPPED_FILE_NAME = "randuri-nepreluate.csv";

// ---------------------------------------------------------------------------
// Telefon: forma canonica +373
// ---------------------------------------------------------------------------

/**
 * Numarul in forma cu care se compara doua randuri, sau null cand nu este un
 * numar.
 *
 * Republica Moldova are prefixul +373 si opt cifre dupa el. Operatorul scrie
 * "069123456", "0 69 12 34 56", "+373 69 123 456" si "00373691234 56" pentru
 * acelasi om, deci toate trebuie sa cada pe acelasi sir, altfel dublatul nu se
 * vede. Un numar strain se pastreaza cu prefixul lui: se normalizeaza, nu se
 * moldovenizeaza.
 */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (digits === "") return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!hasPlus && digits.startsWith("0")) {
    // Forma locala: 0 urmat de opt cifre.
    const local = digits.slice(1);
    if (local.length === 8) return `+373${local}`;
  }

  if (digits.startsWith("373")) {
    const local = digits.slice(3);
    return local.length === 8 ? `+373${local}` : null;
  }

  // Opt cifre fara niciun prefix este un numar moldovenesc scris scurt.
  if (!hasPlus && digits.length === 8) return `+373${digits}`;

  // Orice altceva: un numar international, pastrat cum este. Sub sapte cifre nu
  // este un numar de telefon, este o greseala de tastare.
  return digits.length >= 7 ? `+${digits}` : null;
}

/** Emailul in forma cu care se compara doua randuri, sau null cand nu arata a
 *  email. Litere mici: doua adrese care difera doar prin majuscule sunt aceeasi
 *  casuta. */
export function normaliseEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Valorile cu lista fixa: tip, etapa, sursa, data
// ---------------------------------------------------------------------------

/** Tokenul englezesc sau eticheta romaneasca, amandoua acceptate. */
export function readStage(raw: string): ClientStage | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  for (const stage of CLIENT_STAGES) {
    if (normaliseKey(stage) === key) return stage;
    if (normaliseKey(CLIENT_STAGE_LABEL[stage]) === key) return stage;
  }
  return null;
}

export function readSource(raw: string): ClientSource | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  for (const source of CLIENT_SOURCES) {
    if (normaliseKey(source) === key) return source;
    if (normaliseKey(CLIENT_SOURCE_LABEL[source]) === key) return source;
  }
  return null;
}

/** Companie sau persoana fizica. Lipsa inseamna companie, ca la formularul de
 *  lead, unde tipul nu este in lista predarii deloc. */
export function readType(raw: string): ClientType | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  if (["company", "companie", "firma", "juridica", "persoanajuridica", "srl"].includes(key))
    return "company";
  if (["individual", "persoanafizica", "fizica", "persoana", "pf"].includes(key))
    return "individual";
  return null;
}

/**
 * Data in `YYYY-MM-DD`, sau null cand nu este o data.
 *
 * Trei scrieri acceptate, fiindca toate trei ies din Excel pe o masina
 * romaneasca: `2026-03-14`, `14.03.2026` si `14/03/2026`. ZIUA ESTE PRIMA la
 * ultimele doua, ceea ce este conventia de aici; o luna peste 12 nu se ghiceste
 * invers, se refuza, fiindca a ghici ar insemna sa scriem in baza o zi pe care
 * nu a spus-o nimeni.
 */
export function readDate(raw: string): string | null {
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

// ---------------------------------------------------------------------------
// Un rand pregatit pentru scriere, sau motivul pentru care nu se poate scrie
// ---------------------------------------------------------------------------

/** Ce se poate scrie dintr-un rand de fisier. Fiecare camp este optional:
 *  lipsa inseamna "fisierul nu spune nimic despre el", nu "goleste-l". */
export type PreparedLead = {
  name: string;
  type: ClientType;
  phone: string;
  email: string;
  contactName: string;
  interest: string;
  source: ClientSource | "";
  ownerId: string;
  stage: ClientStage;
  followUpDate: string;
  nextAction: string;
  notes: string;
  address: string;
  fiscalCode: string;
};

/** Numarul randului asa cum il vede operatorul in Excel: antetul este randul 1. */
export type RowNumber = number;

export type PreparedRow =
  | { ok: true; line: RowNumber; lead: PreparedLead; phoneKey: string | null; emailKey: string | null }
  | { ok: false; line: RowNumber; reason: string; raw: string[] };

/** Propozitiile romanesti ale fiecarui refuz, intr-un singur loc, ca ecranul,
 *  fisierul randurilor sarite si testul sa citeasca acelasi text. */
export const IMPORT_REASON = {
  noName: "Rândul nu are denumire.",
  badDate: (value: string) => `Data "${value}" nu este o dată validă.`,
  badNextDate: (value: string) => `Data următorului pas, "${value}", nu este o dată validă.`,
  unknownStage: (value: string) => `Etapa "${value}" nu este una dintre etapele cunoscute.`,
  unknownSource: (value: string) => `Sursa "${value}" nu este una dintre sursele cunoscute.`,
  unknownType: (value: string) => `Tipul "${value}" nu este nici Companie, nici Persoană fizică.`,
  unknownOwner: (value: string) => `Responsabilul "${value}" nu este în echipă.`,
  followUpNeedsDate: FOLLOW_UP_DATE_REQUIRED,
  noContact: "Rândul nu are nici telefon, nici email.",
} as const;

/** Numele complet al fiecarui responsabil, normalizat, catre id-ul lui. */
export type OwnerIndex = Map<string, string>;

export function buildOwnerIndex(owners: { id: string; fullName: string }[]): OwnerIndex {
  const index: OwnerIndex = new Map();
  for (const owner of owners) {
    const key = normaliseKey(owner.fullName);
    if (key !== "" && !index.has(key)) index.set(key, owner.id);
  }
  return index;
}

/**
 * Verifica un rand si il pregateste pentru scriere.
 *
 * DENUMIREA ESTE OBLIGATORIE, si la fel este cel putin unul dintre telefon si
 * email: fara ele randul nu poate fi nici cautat, nici sunat, si nici nu se poate
 * spune despre el daca este dublat. Ambele sunt cerute de goal G58.
 *
 * O EROARE NU OPRESTE RESTUL FISIERULUI. Randul se intoarce cu motivul lui si
 * ajunge in fisierul randurilor nepreluate, iar celelalte se importa.
 */
export function prepareRow(
  cells: string[],
  mapping: ColumnMapping,
  line: RowNumber,
  owners: OwnerIndex,
  fallbackSource: ClientSource | "",
): PreparedRow {
  const read = (field: ImportField): string => {
    const at = mapping.indexOf(field);
    return at < 0 ? "" : (cells[at] ?? "").trim();
  };
  const refuse = (reason: string): PreparedRow => ({ ok: false, line, reason, raw: cells });

  const name = read("name");
  if (name === "") return refuse(IMPORT_REASON.noName);

  const rawType = read("type");
  const type = rawType === "" ? "company" : readType(rawType);
  if (type === null) return refuse(IMPORT_REASON.unknownType(rawType));

  const rawStage = read("stage");
  // ETAPA LIPSA ESTE Lead rece, din goal G58. Un token pe care nu il stim nu se
  // apropie de nimic: ar muta un om intr-o etapa pe care nu a ales-o nimeni.
  const stage = rawStage === "" ? "cold" : readStage(rawStage);
  if (stage === null) return refuse(IMPORT_REASON.unknownStage(rawStage));

  const rawDate = read("followUpDate");
  const followUpDate = rawDate === "" ? "" : readDate(rawDate);
  if (followUpDate === null) return refuse(IMPORT_REASON.badDate(rawDate));

  // Aceeasi propozitie ca la formular si ca la constrangerea din 0039.
  if (stage === "follow_up" && followUpDate === "")
    return refuse(IMPORT_REASON.followUpNeedsDate);

  const rawSource = read("source");
  const source = rawSource === "" ? fallbackSource : readSource(rawSource);
  if (source === null) return refuse(IMPORT_REASON.unknownSource(rawSource));

  const rawOwner = read("ownerName");
  let ownerId = "";
  if (rawOwner !== "") {
    const found = owners.get(normaliseKey(rawOwner));
    if (!found) return refuse(IMPORT_REASON.unknownOwner(rawOwner));
    ownerId = found;
  }

  const rawPhone = read("phone");
  const rawEmail = read("email");
  const phoneKey = normalisePhone(rawPhone);
  const emailKey = normaliseEmail(rawEmail);
  if (phoneKey === null && emailKey === null) return refuse(IMPORT_REASON.noContact);

  const nextAction = read("nextAction");

  return {
    ok: true,
    line,
    phoneKey,
    emailKey,
    lead: {
      name,
      type,
      // Numarul se STOCHEAZA in forma canonica: asa doua importuri ale aceluiasi
      // om se recunosc intre ele, si cautarea din lista gaseste amandoua scrierile.
      phone: phoneKey ?? "",
      email: emailKey ?? "",
      contactName: read("contactName"),
      interest: read("interest"),
      source,
      ownerId,
      stage,
      followUpDate,
      nextAction,
      notes: read("notes"),
      address: read("address"),
      fiscalCode: read("fiscalCode"),
    },
  };
}

/** Coloanele fisierului de randuri nepreluate: motivul, apoi randul cum a venit. */
export function skippedCsv(headers: string[], rows: { line: number; reason: string; raw: string[] }[]): string {
  return buildCsv([
    ["Rând", "Motiv", ...headers],
    ...rows.map((r) => [String(r.line), r.reason, ...r.raw]),
  ]);
}
