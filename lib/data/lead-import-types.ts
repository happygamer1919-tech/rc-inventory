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
// CARDUL P3-121 A MUTAT CITITORUL SI SCRIITORUL DE CSV, NESCHIMBATE, IN
// lib/data/import-shared.ts, ca cele trei entitati noi ale Item 3 (clienti,
// proiecte, materiale) sa le refoloseasca in loc sa isi scrie fiecare propriul
// cititor. Acest fisier le re-exporta sub ACELASI NUME, ca niciun apelant de aici
// (lead-import-plan.ts, lead-import-actions.ts, LeadImportSheet.tsx, spec-ul) sa
// nu aiba nevoie de nicio schimbare. Ce ramane AICI este cunoastere DESPRE LEAD:
// campurile lui, sinonimele lor, si cititoarele de etapa/sursa/tip/data/telefon
// care nu au sens pentru o alta entitate.

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
  buildModelCsv,
  buildSynonymIndex,
  normaliseKey,
  parseCsv,
  sniffDelimiter,
  BROKEN_LETTERS_ROW_REASON,
  rowHasBrokenLetters,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SAMPLE_COUNT,
  IMPORT_SKIP,
  IMPORT_SKIP_LABEL,
  type ColumnMapping as GenericColumnMapping,
  type RowNumber,
} from "./import-shared";

// RE-EXPORTATE SUB ACELASI NUME, CARDUL P3-121 CLAUZA 2 SI 3: fisierul acesta
// nu mai DEFINESTE cititorul, scriitorul sau limitele, le PRIMESTE de la
// import-shared.ts, ca sa existe un singur cititor si un singur scriitor de CSV
// in tot depozitul (acceptanta (g) a cardului P3-121).
export { buildCsv, normaliseKey, parseCsv, sniffDelimiter, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_SAMPLE_COUNT, IMPORT_SKIP, IMPORT_SKIP_LABEL };
export type { RowNumber };

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

/** O potrivire este `null` cand coloana nu intra nicaieri. */
export type ColumnMapping = GenericColumnMapping<ImportField>;

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

/** Indexul de sinonime al leadurilor, construit cu functia comuna din
 *  import-shared.ts in loc de una scrisa a doua oara aici. */
const SYNONYM_INDEX = buildSynonymIndex(
  IMPORT_FIELDS.map((field) => ({
    field,
    label: IMPORT_FIELD_LABEL[field],
    synonyms: FIELD_SYNONYMS[field],
  })),
);

/**
 * Potriveste automat fiecare antet cu un camp RC.
 *
 * UN CAMP SE IA O SINGURA DATA. Doua coloane numite "Telefon" si "Telefon 2" ar
 * cadea amandoua pe `phone`, iar a doua ar suprascrie tacut prima la scriere. A
 * doua ramane pe "Nu importa" si operatorul decide.
 *
 * SUBTIRE PESTE autoMatchColumns DIN import-shared.ts, cardul P3-121: potrivirea
 * insasi este comuna, numai indexul de sinonime de mai sus este al leadurilor.
 */
export function autoMatchColumns(headers: string[]): ColumnMapping {
  return autoMatchColumnsGeneric(headers, SYNONYM_INDEX);
}

/**
 * Un rand exemplu, plauzibil si romanesc, care s-ar importa el insusi curat:
 * cardul P3-122 clauza 2, "un exemplu care s-ar refuza ar invata lucrul gresit".
 * `ownerName` si `followUpDate` raman goale dinadins, fiindca un responsabil
 * inventat ar fi refuzat (`IMPORT_REASON.unknownOwner`) si "Lead rece" nu cere o
 * data de reluare.
 */
const IMPORT_FIELD_EXAMPLE: Record<ImportField, string> = {
  name: "Popescu Construct SRL",
  type: CLIENT_TYPE_LABEL.company,
  phone: "069000001",
  email: "contact@exemplu.md",
  contactName: "Ion Popescu",
  interest: "Montaj acoperiș metalic",
  source: CLIENT_SOURCE_LABEL.recomandare,
  ownerName: "",
  stage: CLIENT_STAGE_LABEL.cold,
  followUpDate: "",
  nextAction: "Trimite ofertă",
  notes: "Interesat de acoperiș nou",
  address: "Chișinău, str. Exemplu 1",
  fiscalCode: "",
};

/**
 * Sablonul de import: antetele, cu Denumire marcata obligatorie, si un rand
 * exemplu. CARDUL P3-122 CLAUZA 2, prin `buildModelCsv` din import-shared.ts, in
 * loc de o a doua versiune scrisa aici.
 *
 * NUMAI DENUMIREA ESTE MARCATA. Telefon si Email cer unul din doua, nu
 * amandoua, iar a marca amandoua obligatorii ar spune o regula mai stricta
 * decat cea pe care `prepareRow` o aplica de fapt; regula exacta este in
 * `leadImportInstructions` de mai jos, in propozitii, nu pe antet.
 */
export function templateCsv(): string {
  return buildModelCsv(
    IMPORT_FIELDS.map((field) => ({
      label: IMPORT_FIELD_LABEL[field],
      required: field === "name",
      example: IMPORT_FIELD_EXAMPLE[field],
    })),
  );
}

export const TEMPLATE_FILE_NAME = "sablon-leaduri.csv";
export const SKIPPED_FILE_NAME = "randuri-nepreluate.csv";
export const EXPORT_FILE_NAME = "leaduri.csv";

/**
 * Antetul sablonului, exact cum il scrie `templateCsv`: aceleasi etichete, aceeasi
 * ordine, Denumire cu asterisc. CARDUL P3-126, clauza 2: exportul de leaduri foloseste
 * ACEST antet si nu o a doua lista, ca un fisier exportat sa se reimporte fara nicio
 * potrivire manuala. Se citeste din `templateCsv` insusi, nu se reconstruieste, deci o
 * schimbare a sablonului muta si exportul.
 */
export function leadModelHeaders(): string[] {
  return parseCsv(templateCsv())[0] ?? [];
}

/** Un lead gata de scris in fisierul exportat: fiecare camp ca text, sub aceleasi
 *  chei ca importul. Tipul, etapa si sursa sunt deja etichetele romanesti. */
export type ExportLeadRow = Record<ImportField, string>;

/**
 * Fisierul exportului: antetul modelului, apoi cate un rand pe lead, coloanele in
 * ordinea `IMPORT_FIELDS`. Prin `buildCsv` din import-shared.ts, deci cu BOM si cu
 * ghilimelele puse de acelasi scriitor ca la sablon.
 */
export function leadExportCsv(leads: ExportLeadRow[]): string {
  return buildCsv([
    leadModelHeaders(),
    ...leads.map((lead) => IMPORT_FIELDS.map((field) => lead[field])),
  ]);
}

/** Propozitia de dupa un export taiat la limita. */
export function exportTruncatedNotice(total: number): string {
  return (
    `Filtrul are ${total} de rânduri, dar fișierul poate avea cel mult ${IMPORT_MAX_ROWS}. ` +
    `Am exportat primele ${IMPORT_MAX_ROWS}. Restrânge filtrul și exportă din nou pentru restul.`
  );
}

/**
 * Instructiunile romanesti aratate PE ECRAN, cardul P3-122 clauza 3, nu numai
 * intr-un fisier descarcat. Fiecare propozitie citeste direct constantele si
 * listele campurilor, ca ecranul sa nu poata spune un numar sau o lista diferita
 * de cea pe care importul o aplica de fapt.
 */
export function leadImportInstructions(): string[] {
  const limitMb = (IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0);
  return [
    "Procesul are patru pași: încarcă fișierul CSV, potrivește coloanele cu câmpurile de mai " +
      "jos, verifică rândurile înainte să se scrie ceva, apoi importă.",
    `${IMPORT_FIELD_LABEL.name} este obligatorie. ${IMPORT_FIELD_LABEL.phone} sau ` +
      `${IMPORT_FIELD_LABEL.email}, cel puțin una din două, ca rândul să poată fi găsit și ` +
      "contactat. Restul coloanelor sunt opționale.",
    `Valori acceptate: ${IMPORT_FIELD_LABEL.type} este ${CLIENT_TYPE_LABEL.company} sau ` +
      `${CLIENT_TYPE_LABEL.individual}; ${IMPORT_FIELD_LABEL.stage} este una dintre ` +
      `${CLIENT_STAGES.map((s) => CLIENT_STAGE_LABEL[s]).join(", ")}; ` +
      `${IMPORT_FIELD_LABEL.source} este una dintre ` +
      `${CLIENT_SOURCES.map((s) => CLIENT_SOURCE_LABEL[s]).join(", ")}; ` +
      `${IMPORT_FIELD_LABEL.followUpDate} este AAAA-LL-ZZ sau ZZ.LL.AAAA.`,
    `Un rând se consideră dublat după ${IMPORT_FIELD_LABEL.email} sau după ` +
      `${IMPORT_FIELD_LABEL.phone}, cu ${IMPORT_FIELD_LABEL.email} drept cheia de dublare ` +
      "numită. Un dublat nu se șterge și nu se suprascrie niciodată: ori se sare peste el, ori " +
      "i se completează numai câmpurile goale.",
    `Fișierul poate avea cel mult ${IMPORT_MAX_ROWS} de rânduri și ${limitMb} MB.`,
  ];
}

/** Nota lasata pe fiecare lead creat, exact formula ceruta de goal G58. Sta aici
 *  si nu in fisierul de actiuni, fiindca un fisier "use server" nu poate exporta
 *  decat functii asincrone, iar testul citeste acelasi text. */
export function importNoteBody(fileName: string, day: string): string {
  return `Importat din ${fileName}, ${day}`;
}

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

// RowNumber vine din import-shared.ts, re-exportat mai sus: "numarul randului
// asa cum il vede operatorul in Excel, antetul este randul 1" este o notiune
// comuna oricarei entitati, nu numai leadurilor.

// CARDUL P3-122, DRAFTER'S DECISION A: RAMANE AICI, NU SE MUTA PE
// buildImportPreview/prepareImportRow DIN import-shared.ts. Verificat contra
// celor opt cazuri din tests/e2e/lead-import.spec.ts inainte sa se scrie o
// singura linie: previzualizarea comuna nu poate exprima, fara sa schimbe
// comportamentul:
//   1. TELEFON SAU EMAIL, CEL PUTIN UNUL (IMPORT_REASON.noContact mai sus) este
//      o cerinta pe DOUA campuri la un loc. `ImportFieldDescriptor.required` din
//      import-shared.ts este o cerinta pe UN SINGUR camp; nu exista o forma "cel
//      putin unul din acesti doi" in descriptor.
//   2. STAGE SI SOURCE AU UN IMPLICIT, NU O VALIDARE CARE REFUZA GOLUL: o etapa
//      goala devine "cold", o sursa goala devine `fallbackSource`. Descriptorul
//      comun are `required` (refuza golul) sau `validate` (verifica ce este
//      scris); nu are "lipsa inseamna X".
//   3. DUBLATUL SE CAUTA IN FISIER SI IN BAZA, cu "fisierul inaintea bazei" ca
//      regula de ordine (buildPlan mai sus). Asta cere sa vada TOATE randurile
//      si lista clientilor existenti deodata; buildImportPreview valideaza UN
//      RAND, independent de celelalte si fara nicio citire din baza.
//   4. G70 (G17): PERSOANA DE CONTACT SE CERE NUMAI PE UN CLIENT STOCAT CU CARE
//      FISIERUL S-A POTRIVIT (addContactNameFillable in lead-import-actions.ts).
//      Aceasta este o intrebare despre REZULTATUL dublarii, care nu exista inca
//      cand s-ar valida un rand izolat.
// CLAUZA 1 A CARDULUI P3-121 CERE "un singur cititor, o singura previzualizare
// si un singur fisier de erori". Cititorul si fisierul de erori sunt deja unul
// (parseCsv, buildErrorCsv). Previzualizarea ramane a doua, pe aceasta parte a
// liniei, fiindca a o muta ar insemna sa i se scoata una din cele patru reguli
// de mai sus sau sa se largeasca descriptorul comun pana cand ar purta cunostinta
// despre lead care nu are ce sa caute intr-un modul pe care P3-123 la P3-125 il
// vor refolosi pentru clienti, proiecte si materiale. Inregistrat si in `notes`
// pe cardul P3-122, pentru cardurile acelea.
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

  if (rowHasBrokenLetters(cells)) return refuse(BROKEN_LETTERS_ROW_REASON);

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

/** Coloanele fisierului de randuri nepreluate: motivul, apoi randul cum a venit.
 *
 *  SUBTIRE PESTE buildErrorCsv DIN import-shared.ts, cardul P3-121 clauza 5: forma
 *  fisierului de erori este comuna oricarei entitati, nu numai leadurilor. */
export function skippedCsv(headers: string[], rows: { line: number; reason: string; raw: string[] }[]): string {
  return buildErrorCsv(headers, rows);
}
