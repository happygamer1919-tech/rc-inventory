// P3-124, Item 3 al lui Ivan. IMPORTUL DE PROIECTE DIN CSV.
//
// ACELASI TIPAR CA lib/data/client-import-types.ts, cardul P3-123: previzualizarea
// vine din buildImportPreview din import-shared.ts, cu un descriptor de campuri
// construit aici. NU EXISTA UN AL DOILEA CITITOR DE CSV (D5).
//
// TREI LUCRURI DIFERA DE CLIENTI:
//
// 1. COLOANA Client TREBUIE SA CADA PE UN CLIENT CARE EXISTA (clauza 5 a cardului).
//    Validarea campului primeste un index al clientilor din baza, citit chiar
//    inainte de previzualizare, si un nume necunoscut este o EROARE DE RAND cu
//    un motiv care numeste clientul si spune sa se importe intai clientii.
//    NICIUN CLIENT NU SE CREEAZA DIN ACEST IMPORT, niciodata: o greseala de
//    tastare ar deveni o fisa de client pe care nu a cerut-o nimeni.
//
// 2. MONEDA. Proiectul poarta bani (budget_mdl), deci o coloana "Monedă" are aici
//    pe ce sa cada: campul se citeste cu validateCurrency din import-shared.ts
//    (deviatia D8), EUR si RON sunt refuzate in previzualizare cu un motiv care
//    numeste MDL, iar valoarea NU se scrie nicaieri, fiindca nu exista nicio
//    coloana de moneda pe public.projects (0016_projects.sql). Campul exista
//    numai ca sa poata fi refuzat, si nu este in sablon.
//
// 3. NICIO UNITATE. public.projects nu are nicio coloana de unitate de masura
//    (verificat in 0016 si in migratiile de dupa ea), deci o coloana "Unitate"
//    dintr-un fisier nu are pe ce camp sa cada si ramane pe "Nu importa". Cardul
//    cerea acceptarea celor noua unitati din ALL_UNITS, o premisa falsa pe care
//    sentinta q114 a corectat-o deja pentru clienti: ALL_UNITS este dovedit pe
//    P3-125 (b), nu numarat de pe un card de proiecte.
//
// DEPENDENTA DINTRE Data început SI Termen estimat RAMANE INTRE CAMPURI: un
// `validate` de camp nu vede alt camp, deci regula "termenul nu este inaintea
// inceputului" se aplica DUPA buildImportPreview, mutand randul din valid in
// invalid, exact ca Etapă si Data de reluare la clienti.

import {
  autoMatchColumns as autoMatchColumnsGeneric,
  buildCsv,
  buildErrorCsv,
  buildImportPreview,
  buildModelCsv,
  buildSynonymIndex,
  normaliseKey,
  parseCsv,
  readImportDate,
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
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "./projects-types";
import { ALL_STATUSES } from "./projects-list-types";

export { buildCsv, normaliseKey, parseCsv, sniffDelimiter, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_SAMPLE_COUNT, IMPORT_SKIP, IMPORT_SKIP_LABEL };
export type { RowNumber };

/** Campurile in care poate intra o coloana din fisierul de proiecte. Primele opt
 *  sunt cele ale formularului de proiect (ProjectForm.tsx); `currency` este
 *  noua, si exista numai ca sa poata fi validata (vezi antetul). */
export const PROJECT_IMPORT_FIELDS = [
  "client",
  "name",
  "address",
  "status",
  "startDate",
  "plannedEndDate",
  "budgetMdl",
  "currency",
  "notes",
] as const;

export type ProjectImportField = (typeof PROJECT_IMPORT_FIELDS)[number];

/** Campurile din sablon: cele ale formularului, fara moneda. */
export const PROJECT_TEMPLATE_FIELDS = PROJECT_IMPORT_FIELDS.filter(
  (f): f is Exclude<ProjectImportField, "currency"> => f !== "currency",
);

/** Eticheta romaneasca a fiecarui camp. IDENTICA CU ETICHETELE DIN ProjectForm.tsx
 *  (clauza 2 a cardului): Denumire, Adresă, Stare, Data început, Termen estimat,
 *  Buget (MDL), Note. */
export const PROJECT_IMPORT_FIELD_LABEL: Record<ProjectImportField, string> = {
  client: "Client",
  name: "Denumire",
  address: "Adresă",
  status: "Stare",
  startDate: "Data început",
  plannedEndDate: "Termen estimat",
  budgetMdl: "Buget (MDL)",
  currency: "Monedă",
  notes: "Note",
};

export type ProjectImportColumnMapping = GenericColumnMapping<ProjectImportField>;

const FIELD_SYNONYMS: Record<ProjectImportField, string[]> = {
  client: ["clientul", "beneficiar", "beneficiarul", "companie", "firma", "customer"],
  name: ["nume", "proiect", "proiectul", "numeproiect", "denumireaproiectului", "name", "project"],
  address: ["adresa", "address", "locatie", "adresaproiect"],
  status: ["etapa", "stadiu", "stage", "status", "statut", "starea"],
  startDate: ["datainceput", "inceput", "start", "startdate", "datastart", "datastarii"],
  plannedEndDate: [
    "termen",
    "termenul",
    "termenlimita",
    "sfarsit",
    "datasfarsit",
    "finalizare",
    "datafinalizare",
    "enddate",
    "plannedend",
  ],
  budgetMdl: ["buget", "bugetul", "budget", "valoare", "suma"],
  currency: ["valuta", "currency", "monedaproiect"],
  notes: ["notite", "observatii", "notes", "comentarii", "mentiuni"],
};

const SYNONYM_INDEX = buildSynonymIndex(
  PROJECT_IMPORT_FIELDS.map((field) => ({
    field,
    label: PROJECT_IMPORT_FIELD_LABEL[field],
    synonyms: FIELD_SYNONYMS[field],
  })),
);

export function autoMatchProjectColumns(headers: string[]): ProjectImportColumnMapping {
  return autoMatchColumnsGeneric(headers, SYNONYM_INDEX);
}

// ---------------------------------------------------------------------------
// Propozitiile romanesti ale refuzurilor, o singura data
// ---------------------------------------------------------------------------

export const PROJECT_IMPORT_REASON = {
  /** Clauza 5: numeste clientul si trimite la importul de clienti. */
  unknownClient: (value: string) =>
    `Clientul "${value}" nu există. Importă mai întâi clienții, apoi proiectele lor.`,
  ambiguousClient: (value: string) =>
    `Există mai mulți clienți cu denumirea "${value}". Redenumește unul dintre ei, apoi încearcă din nou.`,
  inactiveClient: (value: string) =>
    `Clientul "${value}" este dezactivat. Reactivează-l în Clienți înainte de a-i importa proiecte.`,
  badDate: (value: string) => `Data "${value}" nu este o dată validă.`,
  unknownStatus: (value: string) => `Starea "${value}" nu este una dintre stările cunoscute.`,
  badBudget: (value: string) => `Bugetul "${value}" nu este un număr pozitiv.`,
  endBeforeStart: "Termenul estimat nu poate fi înaintea datei de început.",
} as const;

// ---------------------------------------------------------------------------
// Clientii, stare, buget: citite aici
// ---------------------------------------------------------------------------

/** Un client din baza, redus la ce trebuie ca sa fie gasit dupa nume. */
export type ClientChoice = { id: string; name: string; active: boolean };

/** Numele clientului, normalizat, catre clientii cu acel nume. Mai multi sub
 *  aceeasi cheie inseamna o potrivire ambigua, care este o eroare, nu o alegere. */
export type ClientLookup = Map<string, ClientChoice[]>;

/** Litere mici, spatii colapsate. Diacriticele RAMAN: "Șantier" si "Santier"
 *  sunt doua nume pentru baza de date, deci si pentru aceasta potrivire. */
export function clientNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildClientLookup(clients: ClientChoice[]): ClientLookup {
  const lookup: ClientLookup = new Map();
  for (const client of clients) {
    const key = clientNameKey(client.name);
    if (key === "") continue;
    lookup.set(key, [...(lookup.get(key) ?? []), client]);
  }
  return lookup;
}

function readStatus(raw: string): ProjectStatus | null {
  const key = normaliseKey(raw);
  if (key === "") return null;
  for (const status of ALL_STATUSES) {
    if (normaliseKey(status) === key) return status;
    if (normaliseKey(PROJECT_STATUS_LABEL[status]) === key) return status;
  }
  return null;
}

/** Bugetul ca text pentru scriere, sau null. Se citesc spatiile din mijloc
 *  ("12 500,50"), virgula zecimala si punctul la mii ("250.000"), vezi
 *  parseImportNumber; numeric(14,2) tine 12 cifre intregi. */
function readBudget(raw: string): string | null {
  return parseImportNumber(raw, 12);
}

// ---------------------------------------------------------------------------
// Descriptorul de camp si previzualizarea
// ---------------------------------------------------------------------------

/** Ce se poate scrie dintr-un rand de fisier. `client` poarta id-ul clientului,
 *  nu numele, dupa validare. */
export type PreparedProject = Record<ProjectImportField, string>;

/** STAREA UNUI RAND GOL DE STARE ESTE "lead" (Prospect), implicitul din
 *  ProjectForm.tsx (useState "lead"): un proiect fara stare in fisier incepe
 *  conducta, ca si cel creat de mana. */
export const DEFAULT_PROJECT_STATUS: ProjectStatus = "lead";

function projectImportFields(clients: ClientLookup): ImportFieldDescriptor<ProjectImportField>[] {
  const field = (
    f: ProjectImportField,
    required: boolean,
    example: string,
    validate: (raw: string) => { ok: true; value: string } | { ok: false; reason: string },
  ): ImportFieldDescriptor<ProjectImportField> => ({
    field: f,
    label: PROJECT_IMPORT_FIELD_LABEL[f],
    required,
    example,
    validate,
  });

  const date = (raw: string) => {
    if (raw === "") return { ok: true as const, value: "" };
    const read = readImportDate(raw);
    return read
      ? { ok: true as const, value: read }
      : { ok: false as const, reason: PROJECT_IMPORT_REASON.badDate(raw) };
  };

  return [
    field("client", true, "Popescu Construct SRL", (raw) => {
      const hits = clients.get(clientNameKey(raw)) ?? [];
      if (hits.length === 0) return { ok: false, reason: PROJECT_IMPORT_REASON.unknownClient(raw) };
      if (hits.length > 1) return { ok: false, reason: PROJECT_IMPORT_REASON.ambiguousClient(raw) };
      const hit = hits[0]!;
      if (!hit.active) return { ok: false, reason: PROJECT_IMPORT_REASON.inactiveClient(raw) };
      return { ok: true, value: hit.id };
    }),
    field("name", true, "Bloc A, Chișinău", (raw) => ({ ok: true, value: raw })),
    field("address", false, "Chișinău, str. Exemplu 1", (raw) => ({ ok: true, value: raw })),
    field("status", false, PROJECT_STATUS_LABEL[DEFAULT_PROJECT_STATUS], (raw) => {
      if (raw === "") return { ok: true, value: DEFAULT_PROJECT_STATUS };
      const status = readStatus(raw);
      return status
        ? { ok: true, value: status }
        : { ok: false, reason: PROJECT_IMPORT_REASON.unknownStatus(raw) };
    }),
    field("startDate", false, "2026-11-01", date),
    field("plannedEndDate", false, "2027-03-31", date),
    field("budgetMdl", false, "250000", (raw) => {
      if (raw === "") return { ok: true, value: "" };
      const budget = readBudget(raw);
      return budget === null
        ? { ok: false, reason: PROJECT_IMPORT_REASON.badBudget(raw) }
        : { ok: true, value: budget };
    }),
    // MONEDA SE VALIDEAZA SI SE ARUNCA: validateCurrency (D8) refuza EUR si RON cu
    // un motiv care numeste MDL; un camp gol sau MDL trece, iar valoarea nu are
    // coloana pe care sa fie scrisa.
    field("currency", false, "", (raw) => validateCurrency(raw)),
    field("notes", false, "", (raw) => ({ ok: true, value: raw })),
  ];
}

/**
 * Previzualizarea unui fisier de proiecte deja citit. SUBTIRE PESTE
 * buildImportPreview: validarea fiecarui camp in parte este cea comuna, iar aici
 * se adauga numai regula care leaga doua campuri, Termen estimat de Data
 * inceput. NU SCRIE NIMIC.
 *
 * DUBLAREA (nume plus client) NU ESTE AICI: ea cere proiectele deja stocate, pe
 * care previzualizarea de camp nu le are. Acel pas este in project-import-plan.ts.
 */
export function buildProjectImportPreview(
  rows: string[][],
  mapping: ProjectImportColumnMapping,
  clients: ClientLookup,
  headerLine = 1,
): ImportPreview<ProjectImportField> {
  const preview = buildImportPreview(rows, mapping, projectImportFields(clients), headerLine);

  const valid: ImportPreview<ProjectImportField>["valid"] = [];
  const invalid: ImportPreview<ProjectImportField>["invalid"] = [...preview.invalid];

  for (const entry of preview.valid) {
    const { startDate, plannedEndDate } = entry.record;
    if (startDate !== "" && plannedEndDate !== "" && plannedEndDate < startDate) {
      const index = entry.line - headerLine - 1;
      invalid.push({
        line: entry.line,
        reason: PROJECT_IMPORT_REASON.endBeforeStart,
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
 * Modelul de import: antetele (cele ale formularului de proiect, Client si
 * Denumire marcate obligatorii) si un rand exemplu care s-ar importa curat DACA
 * clientul din exemplu exista. NU HAI SA INVENTAM UN CLIENT: operatorul pune
 * numele unui client al lui in prima celula.
 */
export function templateCsv(): string {
  const fields = projectImportFields(new Map()).filter((f) => f.field !== "currency");
  return buildModelCsv(fields.map((f) => ({ label: f.label, required: f.required, example: f.example })));
}

export const TEMPLATE_FILE_NAME = "sablon-proiecte.csv";
export const SKIPPED_FILE_NAME = "randuri-nepreluate-proiecte.csv";

/** Fisierul randurilor nepreluate: motivul, apoi randul cum a venit. Subtire
 *  peste buildErrorCsv, cardul P3-121 clauza 5. */
export function skippedCsv(headers: string[], rows: { line: number; reason: string; raw: string[] }[]): string {
  return buildErrorCsv(headers, rows);
}

/**
 * Instructiunile romanesti aratate PE ECRAN, clauza 8 a cardului. Fiecare
 * propozitie citeste constantele si listele campurilor, ca ecranul sa nu poata
 * spune un numar sau o lista diferita de cea pe care importul o aplica de fapt.
 */
export function projectImportInstructions(): string[] {
  const limitMb = (IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const label = PROJECT_IMPORT_FIELD_LABEL;
  return [
    "Procesul are patru pași: încarcă fișierul CSV, potrivește coloanele cu câmpurile de mai " +
      "jos, verifică rândurile înainte să se scrie ceva, apoi importă.",
    "Clienții trebuie să existe înainte. Importă mai întâi clienții, apoi proiectele lor: un " +
      "rând cu un client care nu există se respinge, iar importul nu creează niciodată un client.",
    `${label.client} și ${label.name} sunt obligatorii. Restul coloanelor sunt opționale.`,
    `Valori acceptate: ${label.client} este denumirea unui client care există; ${label.status} este ` +
      `una dintre ${ALL_STATUSES.map((s) => PROJECT_STATUS_LABEL[s]).join(", ")}, implicit ` +
      `${PROJECT_STATUS_LABEL[DEFAULT_PROJECT_STATUS]} pe un rând fără stare; ${label.startDate} și ` +
      `${label.plannedEndDate} sunt AAAA-LL-ZZ sau ZZ.LL.AAAA, iar termenul nu poate fi înaintea ` +
      `începutului; ${label.budgetMdl} este un număr, în MDL. Platforma ține evidența numai în MDL, ` +
      "deci o coloană de monedă cu EUR sau RON respinge rândul.",
    `Un rând se consideră dublat după ${label.name} împreună cu ${label.client}: același nume la ` +
      "doi clienți diferiți înseamnă două proiecte. Un dublat nu se șterge și nu se suprascrie " +
      "niciodată: ori se sare peste el, ori i se completează numai câmpurile goale.",
    `Fișierul poate avea cel mult ${IMPORT_MAX_ROWS} de rânduri și ${limitMb} MB, în format CSV, ` +
      "UTF-8 cu BOM, separat prin virgulă.",
  ];
}
