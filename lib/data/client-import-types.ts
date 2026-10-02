// P3-123, Item 3 al lui Ivan. IMPORTUL DE CLIENTI DIN CSV.
//
// CARDUL P3-121 A MUTAT CITITORUL, SCRIITORUL SI PREVIZUALIZAREA COMUNA in
// lib/data/import-shared.ts. Fisierul acesta NU LE REINVENTEAZA: foloseste
// buildImportPreview direct, cu un descriptor de campuri construit aici, in loc
// sa scrie un al doilea prepareRow ca la leaduri.
//
// DE CE AICI buildImportPreview AJUNGE, SI LA LEADURI NU. Raportul P3-122
// (lead-import-types.ts, deasupra PreparedRow) inregistreaza patru lucruri pe
// care descriptorul comun nu le exprima pentru leaduri: (1) telefon sau email,
// o cerinta pe doua campuri; (2) etapa si sursa cu un implicit care depinde de
// un parametru al rularii (sursa aleasa de operator pentru tot fisierul); (3)
// dublatul cautat in fisier si in baza deodata; (4) persoana de contact, cerută
// numai pe un client cu care fisierul s-a potrivit. Cardul acesta nu are niciuna
// din (1) si (4): cheia de dublare este emailul singur (clauza 5) si nu exista
// camp de persoana de contact pe formularul de client. (2) nu se aplica nici ea
// la fel: implicitul etapei este o constanta fixa ("client", decizia E a
// cardului), nu un parametru al rularii, deci un `validate` care intoarce acel
// implicit pe rand gol este suficient. Ramane (3), dublarea dupa baza, care SE
// FACE separat, in client-import-plan.ts, exact ca la leaduri.
//
// DEPENDENTA DE Etapă SI Data de reluare RAMANE INTRE CAMPURI: De reluat fara
// dată este o eroare (FOLLOW_UP_DATE_REQUIRED), iar un `validate` de camp nu
// vede alt camp. buildClientImportPreview mai jos face trecerea asta DUPA
// buildImportPreview, mutand randul din valid in invalid cand este cazul, fara
// sa schimbe cum se valideaza fiecare camp in parte.
//
// NIMIC DESPRE MONEDA SI NICIO UNITATE AICI, dinadins (deciziile A ale cardului
// P3-123): public.clients nu are nicio coloana de genul acesta si cardul nu
// adaugă una. O coloana "Monedă" sau "Unitate" dintr-un fisier nu are pe ce
// camp sa cada, deci ramane pe "Nu importa".
//
// FUNCTIILE DE CITIRE A VALORILOR (telefon, email, dată, etapă, sursă, tip) SUNT
// SCRISE DIN NOU AICI, NU IMPORTATE din lead-import-types.ts: cardul P3-123
// interzice orice editare a acelui fisier si orice drum care l-ar transforma
// intr-un modul comun. O a doua copie mica a unor functii pure este prețul ales
// in schimb, nu o cuplare intre cele doua module de import.

import {
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGES,
  CLIENT_STAGE_LABEL,
  CLIENT_TYPE_LABEL,
  FOLLOW_UP_DATE_REQUIRED,
  type ClientSource,
  type ClientStage,
  type ClientType,
} from "./clients-types";
import {
  autoMatchColumns as autoMatchColumnsGeneric,
  buildCsv,
  buildErrorCsv,
  buildImportPreview,
  buildModelCsv,
  buildSynonymIndex,
  normaliseKey,
  parseCsv,
  sniffDelimiter,
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

export { buildCsv, normaliseKey, parseCsv, sniffDelimiter, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_SAMPLE_COUNT, IMPORT_SKIP, IMPORT_SKIP_LABEL };
export type { RowNumber };

/** Campurile RC in care poate intra o coloana din fisierul de clienti. Aceleasi
 *  campuri ca pe formularul de client (ClientForm.tsx), fara persoana de
 *  contact, care nu exista pe formularul acela. */
export const CLIENT_IMPORT_FIELDS = [
  "name",
  "type",
  "phone",
  "email",
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

export type ClientImportField = (typeof CLIENT_IMPORT_FIELDS)[number];

/** Eticheta romaneasca a fiecarui camp, ACEEASI CA LA LEADURI pentru campurile
 *  comune (clauza 2 a cardului): un client si un lead sunt acelasi rand, deci
 *  acelasi cuvant trebuie sa insemne acelasi lucru pe amandoua ecranele. */
export const CLIENT_IMPORT_FIELD_LABEL: Record<ClientImportField, string> = {
  name: "Denumire",
  type: "Tip",
  phone: "Telefon",
  email: "Email",
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

export type ClientImportColumnMapping = GenericColumnMapping<ClientImportField>;

const FIELD_SYNONYMS: Record<ClientImportField, string[]> = {
  name: ["nume", "denumire", "companie", "firma", "client", "name", "company", "denumirea"],
  type: ["tip", "tipul", "type", "tipclient"],
  phone: ["telefon", "tel", "mobil", "phone", "mobile", "nrtelefon", "numartelefon", "telefonul"],
  email: ["email", "mail", "eposta", "adresaemail", "emailul"],
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

const SYNONYM_INDEX = buildSynonymIndex(
  CLIENT_IMPORT_FIELDS.map((field) => ({
    field,
    label: CLIENT_IMPORT_FIELD_LABEL[field],
    synonyms: FIELD_SYNONYMS[field],
  })),
);

export function autoMatchClientColumns(headers: string[]): ClientImportColumnMapping {
  return autoMatchColumnsGeneric(headers, SYNONYM_INDEX);
}

// ---------------------------------------------------------------------------
// Propozitiile romanesti ale refuzurilor, o singura data
// ---------------------------------------------------------------------------

export const CLIENT_IMPORT_REASON = {
  badDate: (value: string) => `Data "${value}" nu este o dată validă.`,
  unknownStage: (value: string) => `Etapa "${value}" nu este una dintre etapele cunoscute.`,
  unknownSource: (value: string) => `Sursa "${value}" nu este una dintre sursele cunoscute.`,
  unknownType: (value: string) => `Tipul "${value}" nu este nici Companie, nici Persoană fizică.`,
  unknownOwner: (value: string) => `Responsabilul "${value}" nu este în echipă.`,
  followUpNeedsDate: FOLLOW_UP_DATE_REQUIRED,
} as const;

// ---------------------------------------------------------------------------
// Telefon, email, dată, etapă, sursă, tip: citite din nou aici (vezi antetul)
// ---------------------------------------------------------------------------

export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (digits === "") return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!hasPlus && digits.startsWith("0")) {
    const local = digits.slice(1);
    if (local.length === 8) return `+373${local}`;
  }

  if (digits.startsWith("373")) {
    const local = digits.slice(3);
    return local.length === 8 ? `+373${local}` : null;
  }

  if (!hasPlus && digits.length === 8) return `+373${digits}`;

  return digits.length >= 7 ? `+${digits}` : null;
}

export function normaliseEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "") return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function readDate(raw: string): string | null {
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

function readStage(raw: string): ClientStage | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  for (const stage of CLIENT_STAGES) {
    if (normaliseKey(stage) === key) return stage;
    if (normaliseKey(CLIENT_STAGE_LABEL[stage]) === key) return stage;
  }
  return null;
}

function readSource(raw: string): ClientSource | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  for (const source of CLIENT_SOURCES) {
    if (normaliseKey(source) === key) return source;
    if (normaliseKey(CLIENT_SOURCE_LABEL[source]) === key) return source;
  }
  return null;
}

function readType(raw: string): ClientType | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  if (["company", "companie", "firma", "juridica", "persoanajuridica", "srl"].includes(key))
    return "company";
  if (["individual", "persoanafizica", "fizica", "persoana", "pf"].includes(key))
    return "individual";
  return null;
}

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

// ---------------------------------------------------------------------------
// Descriptorul de camp si previzualizarea
// ---------------------------------------------------------------------------

/** Ce se poate scrie dintr-un rand de fisier. Fiecare camp optional lipsa
 *  inseamna "fisierul nu spune nimic despre el", nu "goleste-l". */
export type PreparedClient = Record<ClientImportField, string>;

/**
 * Descriptorul campurilor de client, pentru buildImportPreview din
 * import-shared.ts. Construit pe cerere si nu o data la nivel de modul, fiindca
 * validarea Responsabilului are nevoie de indexul responsabililor din baza
 * (owners), citit chiar inainte de previzualizare.
 */
function clientImportFields(owners: OwnerIndex): ImportFieldDescriptor<ClientImportField>[] {
  const field = (
    f: ClientImportField,
    required: boolean,
    example: string,
    validate: (raw: string) => { ok: true; value: string } | { ok: false; reason: string },
  ): ImportFieldDescriptor<ClientImportField> => ({
    field: f,
    label: CLIENT_IMPORT_FIELD_LABEL[f],
    required,
    example,
    validate,
  });

  return [
    field("name", true, "Popescu Construct SRL", (raw) => ({ ok: true, value: raw })),
    field("type", false, CLIENT_TYPE_LABEL.company, (raw) => {
      if (raw === "") return { ok: true, value: "company" };
      const type = readType(raw);
      return type ? { ok: true, value: type } : { ok: false, reason: CLIENT_IMPORT_REASON.unknownType(raw) };
    }),
    field("phone", false, "069000001", (raw) => ({ ok: true, value: raw === "" ? "" : normalisePhone(raw) ?? "" })),
    field("email", false, "contact@exemplu.md", (raw) => ({
      ok: true,
      value: raw === "" ? "" : normaliseEmail(raw) ?? "",
    })),
    field("interest", false, "", (raw) => ({ ok: true, value: raw })),
    field("source", false, "", (raw) => {
      if (raw === "") return { ok: true, value: "" };
      const source = readSource(raw);
      return source
        ? { ok: true, value: source }
        : { ok: false, reason: CLIENT_IMPORT_REASON.unknownSource(raw) };
    }),
    field("ownerName", false, "", (raw) => {
      if (raw === "") return { ok: true, value: "" };
      const found = owners.get(normaliseKey(raw));
      return found ? { ok: true, value: found } : { ok: false, reason: CLIENT_IMPORT_REASON.unknownOwner(raw) };
    }),
    // ETAPA GOALA DEVINE "Client" (decizia E a cardului), nu "Lead rece" ca la
    // leaduri: acest ecran scrie clienti, iar un client fara etapa in fisier este
    // un client, nu un lead de reluat mai tarziu.
    field("stage", false, CLIENT_STAGE_LABEL.client, (raw) => {
      if (raw === "") return { ok: true, value: "client" };
      const stage = readStage(raw);
      return stage ? { ok: true, value: stage } : { ok: false, reason: CLIENT_IMPORT_REASON.unknownStage(raw) };
    }),
    field("followUpDate", false, "", (raw) => {
      if (raw === "") return { ok: true, value: "" };
      const date = readDate(raw);
      return date ? { ok: true, value: date } : { ok: false, reason: CLIENT_IMPORT_REASON.badDate(raw) };
    }),
    field("nextAction", false, "", (raw) => ({ ok: true, value: raw })),
    field("notes", false, "", (raw) => ({ ok: true, value: raw })),
    field("address", false, "Chișinău, str. Exemplu 1", (raw) => ({ ok: true, value: raw })),
    field("fiscalCode", false, "", (raw) => ({ ok: true, value: raw })),
  ];
}

/**
 * Previzualizarea unui fisier de clienti deja citit. SUBTIRE PESTE
 * buildImportPreview DIN import-shared.ts: validarea fiecarui camp in parte este
 * cea comuna, iar aici se adaugă NUMAI regula care leagă doua campuri intre ele,
 * Etapă si Data de reluare, pe care un descriptor de camp nu o poate exprima
 * (antetul fisierului explică de ce).
 *
 * DUBLAREA DUPA EMAIL, CONTRA BAZEI SI CONTRA FISIERULUI, NU ESTE AICI: ea cere
 * lista clientilor deja stocati, pe care previzualizarea de camp nu o are nevoie
 * sa o vadă. Acel pas este in client-import-plan.ts, dupa acesta.
 */
export function buildClientImportPreview(
  rows: string[][],
  mapping: ClientImportColumnMapping,
  owners: OwnerIndex,
  headerLine = 1,
): ImportPreview<ClientImportField> {
  const fields = clientImportFields(owners);
  const preview = buildImportPreview(rows, mapping, fields, headerLine);

  const valid: ImportPreview<ClientImportField>["valid"] = [];
  const invalid: ImportPreview<ClientImportField>["invalid"] = [...preview.invalid];

  for (const entry of preview.valid) {
    if (entry.record.stage === "follow_up" && entry.record.followUpDate === "") {
      const index = entry.line - headerLine - 1;
      invalid.push({
        line: entry.line,
        reason: CLIENT_IMPORT_REASON.followUpNeedsDate,
        raw: rows[index] ?? [],
      });
      continue;
    }
    valid.push(entry);
  }
  invalid.sort((a, b) => a.line - b.line);

  return { valid, invalid, validCount: valid.length, invalidCount: invalid.length };
}

/**
 * Sablonul de import: antetele, cu Denumire marcata obligatorie, si un rand
 * exemplu care s-ar importa el insusi curat. NICIUN RESPONSABIL INVENTAT in
 * exemplu, din acelasi motiv ca la leaduri: unul inexistent ar fi refuzat.
 */
export function templateCsv(): string {
  const fields = clientImportFields(new Map());
  return buildModelCsv(fields.map((f) => ({ label: f.label, required: f.required, example: f.example })));
}

export const TEMPLATE_FILE_NAME = "sablon-clienti.csv";
export const SKIPPED_FILE_NAME = "randuri-nepreluate-clienti.csv";

/** Coloanele fisierului de randuri nepreluate: motivul, apoi randul cum a venit.
 *  SUBTIRE PESTE buildErrorCsv, cardul P3-121 clauza 5: forma fisierului de erori
 *  este comuna oricarei entitati. */
export function skippedCsv(headers: string[], rows: { line: number; reason: string; raw: string[] }[]): string {
  return buildErrorCsv(headers, rows);
}

/** Nota lasata pe fiecare client creat dintr-un import. */
export function importNoteBody(fileName: string, day: string): string {
  return `Importat din ${fileName}, ${day}`;
}

/**
 * Instructiunile romanesti aratate PE ECRAN, clauza 7 a cardului. Fiecare
 * propozitie citeste constantele si listele campurilor, ca ecranul sa nu poata
 * spune un numar sau o lista diferita de cea pe care importul o aplica de fapt.
 *
 * ULTIMA PROPOZITIE ESTE DECIZIA A A CARDULUI P3-123: acceptanta (d) a cardului
 * cere ca EUR si RON sa fie respinse "cu motiv românesc care numește MDL". Acest
 * ecran nu are deloc un câmp de monedă (public.clients nu are coloana aceea), deci
 * o coloană "Monedă" dintr-un fișier rămâne pe "Nu importa" prin lipsa câmpului
 * din listă, nu printr-o validare. Propoziția de mai jos spune asta pe ecran, cu
 * aceeași formulă pe care validateCurrency din import-shared.ts o scrie pentru
 * deviz și factură, ca cele trei locuri să nu poată spune lucruri diferite.
 */
export function clientImportInstructions(): string[] {
  const limitMb = (IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0);
  return [
    "Procesul are patru pași: încarcă fișierul CSV, potrivește coloanele cu câmpurile de mai " +
      "jos, verifică rândurile înainte să se scrie ceva, apoi importă.",
    `${CLIENT_IMPORT_FIELD_LABEL.name} este obligatorie. Restul coloanelor sunt opționale.`,
    `Valori acceptate: ${CLIENT_IMPORT_FIELD_LABEL.type} este ${CLIENT_TYPE_LABEL.company} sau ` +
      `${CLIENT_TYPE_LABEL.individual}; ${CLIENT_IMPORT_FIELD_LABEL.stage} este una dintre ` +
      `${CLIENT_STAGES.map((s) => CLIENT_STAGE_LABEL[s]).join(", ")}, implicit ` +
      `${CLIENT_STAGE_LABEL.client} pe un rând fără etapă; ${CLIENT_IMPORT_FIELD_LABEL.source} ` +
      `este una dintre ${CLIENT_SOURCES.map((s) => CLIENT_SOURCE_LABEL[s]).join(", ")}; ` +
      `${CLIENT_IMPORT_FIELD_LABEL.followUpDate} este AAAA-LL-ZZ sau ZZ.LL.AAAA.`,
    `Un rând se consideră dublat după ${CLIENT_IMPORT_FIELD_LABEL.email}. Un dublat nu se șterge ` +
      "și nu se suprascrie niciodată: ori se sare peste el, ori i se completează numai câmpurile " +
      "goale.",
    `Fișierul poate avea cel mult ${IMPORT_MAX_ROWS} de rânduri și ${limitMb} MB.`,
    "Importul nu are coloană de monedă sau de unitate de măsură: platforma ține evidența numai " +
      "în MDL, iar o coloană cu acest nume rămâne pe „Nu importa”.",
  ];
}
