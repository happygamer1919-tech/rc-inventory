// P3-123, Item 3 al lui Ivan. CE SE VA INTAMPLA CU FIECARE RAND DE CLIENT,
// INAINTE SA SE SCRIE CEVA.
//
// ACELASI TIPAR CA lib/data/lead-import-plan.ts, cardul P3-101. CHEIA DE DUBLARE
// ESTE EMAILUL (clauza 5 a cardului P3-123); IDNO-ul este a doua cheie (P3-329), fiindca
// indexul unic din migratia 0013 il face unic in baza: un rand cu IDNO-ul unui client
// stocat, sau al unui rand de mai sus din fisier, este dublat chiar daca numele,
// emailul si telefonul difera. Un rand FARA email se potriveste
// dupa nume si telefon impreuna, cu orice client stocat, cu email sau fara
// (P3-197); un rand fara email si fara telefon nu se poate dubla cu nimic si
// intra mereu ca nou. Un rand cu email se potriveste dupa nume si telefon numai
// cu un client (stocat sau din fisier) fara email (P3-307, P3-313).
//
// DUBLATUL SE CAUTA IN DOUA LOCURI SI AMANDOUA CONTEAZA: printre clientii deja
// stocati, si printre randurile de mai sus DIN ACELASI FISIER, cu fisierul
// inaintea bazei.
//
// NIMIC NU SE SUPRASCRIE. Un dublat are doua raspunsuri: se sare peste el
// (implicit), sau i se completeaza NUMAI campurile goale.

import {
  CLIENT_IMPORT_FIELD_LABEL,
  buildClientImportPreview,
  type ClientImportColumnMapping,
  type ClientImportField,
  type OwnerIndex,
  type PreparedClient,
} from "./client-import-types";
import { FileAnchors, type FileAnchor } from "./import-file-anchors";
import { pickActiveMatch, setActiveFirst } from "./import-stored-index";
import { personPreviewTable, type ImportPreviewTable } from "./import-preview-rows";

/** Campurile pe care completarea le poate scrie. Denumirea, etapa si data de
 *  reluare nu sunt aici: un camp gol este o lipsa, iar o etapa este o judecata
 *  pe care a facut-o cineva. */
export const CLIENT_FILL_FIELDS = [
  "phone",
  "email",
  "interest",
  "source",
  "ownerId",
  "nextAction",
  "nextActionDate",
  "notes",
  "address",
  "fiscalCode",
] as const;

export type ClientFillField = (typeof CLIENT_FILL_FIELDS)[number];

/** Un client deja stocat, redus la ce trebuie ca sa se recunoasca un dublat. */
export type ExistingClient = {
  id: string;
  name: string;
  emailKey: string | null;
  /** Telefonul stocat, pentru potrivirea dupa nume si telefon a randurilor fara email. */
  phone?: string;
  /** P3-329: IDNO-ul stocat trecut prin `idnoKey`; lipsa sau null inseamna fara IDNO. */
  idnoKey?: string | null;
  /** Campurile care sunt GOALE azi, deci singurele pe care completarea le atinge. */
  empty: ClientFillField[];
  /** Fals pentru un client dezactivat. Lipsa inseamna activ. */
  active?: boolean;
};

export type DuplicateTarget =
  | { kind: "stored"; id: string; name: string; inactive?: true }
  | { kind: "file"; line: number; name: string; otherBatch?: true };

export type PlanEntry =
  | { kind: "new"; line: number; name: string }
  | {
      kind: "duplicate";
      line: number;
      name: string;
      against: DuplicateTarget;
      fillable: ClientFillField[];
      /** Absent inseamna email. */
      matchedBy?: "namePhone" | "idno";
    }
  | { kind: "error"; line: number; reason: string; raw: string[] };

export type ClientImportPlan = {
  entries: PlanEntry[];
  counts: { fresh: number; duplicate: number; error: number };
  /** P3-141: randurile noi, cu valorile cum vor fi salvate. */
  preview: ImportPreviewTable;
  /** P3-301: cheile de dublare ale randurilor noi din acest lot, pentru lotul urmator. */
  anchors?: FileAnchor[];
};

export type DuplicateChoice= "skip" | "fill";
export type DuplicateChoices = Record<number, DuplicateChoice>;

export function duplicateReason(entry: Extract<PlanEntry, { kind: "duplicate" }>): string {
  // Un client dezactivat nu apare in lista de clienti: se spune ca este dezactivat
  // si ce are de facut operatorul, nu ca "exista deja".
  if (entry.against.kind === "stored" && entry.against.inactive)
    return `Există deja ca client dezactivat: ${entry.against.name}. Reactivați-l din fișa clientului înainte de import.`;
  const by =
    entry.matchedBy === "namePhone"
      ? "Același nume și telefon"
      : entry.matchedBy === "idno"
        ? "Același IDNO"
        : "Dublat după email";
  return entry.against.kind === "stored"
    ? `${by} cu "${entry.against.name}", care există deja.`
    : `${by} cu rândul ${entry.against.line} din același fișier.`;
}

/** Numele fara diferente de spatii sau de litere mari, cu diacriticele pastrate. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ro");
}

/** P3-329. IDNO-ul fara spatii si cu litere mari; gol nu are cheie. Spatiile de pe margini si
 *  dintre cifre nu fac doua coduri diferite. */
export function idnoKey(code: string | null | undefined): string | null {
  const key = (code ?? "").replace(/\s+/g, "").toUpperCase();
  return key === "" ? null : key;
}

/** Ultimele 8 cifre: 069123456 si +373 69 123 456 sunt acelasi numar. */
export function phoneKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits === "" ? null : digits.slice(-8);
}

/** Cheia pentru randurile fara email; fara nume sau fara telefon nu exista cheie. */
export function namePhoneKey(name: string, phone: string): string | null {
  const n = nameKey(name);
  const p = phoneKey(phone);
  return n === "" || p === null ? null : `${n}|${p}`;
}

/**
 * P3-301. UN RAND FARA EMAIL SI FARA TELEFON NU ARE CHEIE DE DUBLARE: planul il numeste
 * mereu "nou" (vezi antetul fisierului), deci daca acelasi fisier se incarca a doua oara
 * dupa un import oprit la jumatate, randul s-ar crea inca o data. Ecranul foloseste
 * intrebarea asta ca sa spuna asta operatorului, pe randuri. Se uita la celulele din fisier,
 * deci poate numara si un rand care va fi oricum refuzat: avertismentul este prea larg, niciodata
 * prea ingust.
 */
export function clientRowHasNoKey(row: string[], mapping: ClientImportColumnMapping): boolean {
  const cell = (field: ClientImportField) => {
    const at = mapping.indexOf(field);
    return at < 0 ? "" : (row[at] ?? "");
  };
  return cell("name").trim() !== "" && cell("email").trim() === "" && phoneKey(cell("phone")) === null;
}

const FILL_FIELD_LABEL: Record<ClientFillField, string> = {
  phone: CLIENT_IMPORT_FIELD_LABEL.phone,
  email: CLIENT_IMPORT_FIELD_LABEL.email,
  interest: CLIENT_IMPORT_FIELD_LABEL.interest,
  source: CLIENT_IMPORT_FIELD_LABEL.source,
  ownerId: CLIENT_IMPORT_FIELD_LABEL.ownerName,
  nextAction: CLIENT_IMPORT_FIELD_LABEL.nextAction,
  nextActionDate: CLIENT_IMPORT_FIELD_LABEL.nextActionDate,
  notes: CLIENT_IMPORT_FIELD_LABEL.notes,
  address: CLIENT_IMPORT_FIELD_LABEL.address,
  fiscalCode: CLIENT_IMPORT_FIELD_LABEL.fiscalCode,
};

export function fillFieldLabel(field: ClientFillField): string {
  return FILL_FIELD_LABEL[field];
}

/** Randul pregatit, cu `ownerId` in locul `ownerName`-ului din fisier, ca
 *  rezultatul validarii Responsabilului sa poarte direct id-ul lui. */
type PreparedWithOwnerId = Omit<PreparedClient, "ownerName"> & { ownerId: string };

function toFillShape(record: Record<ClientImportField, string>): PreparedWithOwnerId {
  const { ownerName, ...rest } = record;
  return { ...rest, ownerId: ownerName };
}

function filledFields(client: PreparedWithOwnerId): Set<ClientFillField> {
  const given = new Set<ClientFillField>();
  for (const field of CLIENT_FILL_FIELDS) if ((client[field] ?? "") !== "") given.add(field);
  return given;
}

function emptyFields(client: PreparedWithOwnerId): ClientFillField[] {
  return CLIENT_FILL_FIELDS.filter((field) => (client[field] ?? "") === "");
}

/**
 * Pregateste fiecare rand si spune ce s-ar intampla cu el.
 *
 * ORDINEA RANDURILOR ESTE ORDINEA DIN FISIER si nu se schimba, exact ca la
 * leaduri.
 */
export function buildClientPlan(input: {
  rows: string[][];
  mapping: ClientImportColumnMapping;
  owners: OwnerIndex;
  existing: ExistingClient[];
  /** id responsabil -> nume, pentru coloana Responsabil din previzualizare. */
  ownerNames?: ReadonlyMap<string, string>;
  headerLine?: number;
  /** Linia din Excel a fiecarui rand de date, cand fisierul are linii goale. */
  lines?: number[];
  /** P3-301: ancorele loturilor de dinainte, ca un dublat din alt lot sa se vada. */
  earlier?: FileAnchor[];
}): { plan: ClientImportPlan; prepared: Map<number, PreparedWithOwnerId> } {
  const headerLine = input.headerLine ?? 1;
  const preview = buildClientImportPreview(
    input.rows,
    input.mapping,
    input.owners,
    headerLine,
    input.lines,
  );

  // P3-307: un client activ castiga mereu in fata unuia dezactivat cu aceeasi cheie.
  const storedByEmail = new Map<string, ExistingClient>();
  for (const client of input.existing) {
    if (client.emailKey) setActiveFirst(storedByEmail, client.emailKey, client);
  }

  // Un rand FARA email se potriveste dupa nume si telefon cu orice client stocat.
  const storedByNamePhone = new Map<string, ExistingClient>();
  // P3-307: un rand CU email se potriveste dupa nume si telefon numai cu un client stocat
  // care NU are email. Altfel o lista incarcata din nou, cu o coloana de email adaugata intre
  // timp, ar crea din nou fiecare client care fusese salvat fara email.
  const storedNoEmailByNamePhone = new Map<string, ExistingClient>();
  for (const client of input.existing) {
    const key = namePhoneKey(client.name, client.phone ?? "");
    if (!key) continue;
    setActiveFirst(storedByNamePhone, key, client);
    if (!client.emailKey) setActiveFirst(storedNoEmailByNamePhone, key, client);
  }

  // P3-329: IDNO-ul este unic in baza (0013), deci este cheie de dublare ca emailul.
  const storedByIdno = new Map<string, ExistingClient>();
  for (const client of input.existing) {
    if (client.idnoKey) setActiveFirst(storedByIdno, client.idnoKey, client);
  }

  const fileByEmail = new FileAnchors(input.earlier, "email");
  const fileByIdno = new FileAnchors(input.earlier, "idno");
  // P3-313: aceeasi regula ca la clientii stocati, in interiorul fisierului. Fiecare rand nou
  // se ancoreaza sub email SI sub nume + telefon. `fileByNamePhone` are toate randurile (il
  // cauta un rand fara email); `fileNoEmailByNamePhone` numai pe cele fara email (il cauta un
  // rand cu email, ca doua adrese diferite cu acelasi nume si telefon sa ramana clienti diferiti).
  const fileByNamePhone = new FileAnchors(input.earlier, "namePhone");
  const fileNoEmailByNamePhone = new FileAnchors(input.earlier, "namePhoneNoEmail");

  const entries: PlanEntry[] = [];
  const prepared = new Map<number, PreparedWithOwnerId>();
  const counts = { fresh: 0, duplicate: 0, error: 0 };

  for (const bad of preview.invalid) {
    entries.push({ kind: "error", line: bad.line, reason: bad.reason, raw: bad.raw });
    counts.error += 1;
  }

  for (const row of preview.valid) {
    const client = toFillShape(row.record);
    prepared.set(row.line, client);
    const given = filledFields(client);
    const emailKey = client.email || null;
    const anyNpKey = namePhoneKey(client.name, client.phone);
    const rowIdno = idnoKey(client.fiscalCode);
    const fileNamePhoneMatch = { matchedBy: "namePhone" } as const;
    const idnoMatch = { matchedBy: "idno" } as const;

    // P3-329. Completarea nu scrie niciodata un IDNO pe care il tine alt client: nici unul
    // stocat (altul decat cel completat), nici unul dintr-un rand de mai sus din fisier (altul
    // decat randul cu care acesta s-a potrivit). Restul campurilor se completeaza ca inainte.
    const withoutHeldIdno = (
      fields: ClientFillField[],
      target: { storedId?: string; fileLine?: number },
    ): ClientFillField[] => {
      if (!rowIdno) return fields;
      const storedHolder = storedByIdno.get(rowIdno);
      const fileHolder = fileByIdno.get(rowIdno);
      const heldByOther =
        (storedHolder !== undefined && storedHolder.id !== target.storedId) ||
        (fileHolder !== undefined && fileHolder.line !== target.fileLine);
      return heldByOther ? fields.filter((field) => field !== "fiscalCode") : fields;
    };

    // Un rand cu email se potriveste intai dupa email, apoi dupa nume si telefon cu un rand
    // dinainte FARA email; un rand fara email, dupa nume si telefon cu orice rand dinainte.
    const fileByEmailMatch = emailKey ? fileByEmail.get(emailKey) : undefined;
    const fileByIdnoMatch = fileByEmailMatch || !rowIdno ? undefined : fileByIdno.get(rowIdno);
    const fileByNpMatch =
      fileByEmailMatch || fileByIdnoMatch || !anyNpKey
        ? undefined
        : (emailKey ? fileNoEmailByNamePhone : fileByNamePhone).get(anyNpKey);
    const fileMatch = fileByEmailMatch ?? fileByIdnoMatch ?? fileByNpMatch;
    if (fileMatch) {
      // P3-307: primul rand este intr-un lot de dinainte, deci nu se stie ce are gol. Se ofera
      // ce a adus acest rand, iar scrierea (unde primul rand este deja in baza) completeaza
      // numai ce este chiar gol. Inainte lista era goala si ecranul spunea, fals, ca nu are
      // niciun camp gol de completat.
      const earlier = prepared.get(fileMatch.line);
      // Campul dupa care s-au potrivit nu este gol la primul rand, deci nu se ofera.
      const keyField: ClientFillField = fileByEmailMatch
        ? "email"
        : fileByIdnoMatch
          ? "fiscalCode"
          : "phone";
      const fillable = withoutHeldIdno(
        earlier
          ? emptyFields(earlier).filter((field) => given.has(field))
          : CLIENT_FILL_FIELDS.filter((field) => given.has(field) && field !== keyField),
        { fileLine: fileMatch.line },
      );
      entries.push({
        kind: "duplicate",
        line: row.line,
        name: client.name,
        against: {
          kind: "file",
          line: fileMatch.line,
          name: fileMatch.name,
          ...(earlier ? {} : { otherBatch: true as const }),
        },
        fillable,
        ...(fileByIdnoMatch ? idnoMatch : fileByNpMatch ? fileNamePhoneMatch : {}),
      });
      counts.duplicate += 1;
      continue;
    }

    // Un rand cu email se potriveste dupa email, apoi (P3-307) dupa nume si telefon cu un client
    // stocat fara email; un rand fara email, dupa nume si telefon cu orice client stocat. Intre
    // doua potriviri, clientul activ castiga.
    const byEmail = emailKey ? storedByEmail.get(emailKey) : undefined;
    const byIdno = rowIdno ? storedByIdno.get(rowIdno) : undefined;
    const byNamePhone = anyNpKey
      ? (emailKey ? storedNoEmailByNamePhone : storedByNamePhone).get(anyNpKey)
      : undefined;
    const storedMatch = pickActiveMatch([byEmail, byIdno, byNamePhone]);
    const matchedBy =
      storedMatch !== undefined && storedMatch !== byEmail
        ? storedMatch === byIdno
          ? idnoMatch
          : fileNamePhoneMatch
        : {};
    if (storedMatch) {
      // UN CLIENT DEZACTIVAT NU SE COMPLETEAZA SI NU SE DUBLEAZA: nimic de completat,
      // randul se sare, iar mesajul spune sa fie reactivat intai (ca la P3-173).
      const inactive = storedMatch.active === false;
      entries.push({
        kind: "duplicate",
        line: row.line,
        name: client.name,
        against: {
          kind: "stored",
          id: storedMatch.id,
          name: storedMatch.name,
          ...(inactive ? { inactive: true as const } : {}),
        },
        fillable: inactive
          ? []
          : withoutHeldIdno(
              storedMatch.empty.filter((field) => given.has(field)),
              { storedId: storedMatch.id },
            ),
        ...matchedBy,
      });
      counts.duplicate += 1;
      continue;
    }

    const anchor = { line: row.line, name: client.name };
    if (emailKey) fileByEmail.set(emailKey, anchor);
    if (rowIdno) fileByIdno.set(rowIdno, anchor);
    if (anyNpKey) {
      fileByNamePhone.set(anyNpKey, anchor);
      if (!emailKey) fileNoEmailByNamePhone.set(anyNpKey, anchor);
    }
    entries.push({ kind: "new", line: row.line, name: client.name });
    counts.fresh += 1;
  }

  // ORDINEA FISIERULUI, NU ORDINEA IN CARE AU FOST IMPINSE MAI SUS: erorile sunt
  // puse inaintea randurilor bune, deci se sorteaza dupa linie ca ecranul si
  // fisierul de erori sa arate fisierul asa cum a fost citit.
  entries.sort((a, b) => a.line - b.line);

  const newRows = personPreviewTable(
    entries.filter((e) => e.kind === "new").map((e) => e.line),
    prepared,
    input.ownerNames ?? new Map(),
    false,
  );

  const anchors = [
    ...fileByEmail.newAnchors(),
    ...fileByIdno.newAnchors(),
    ...fileByNamePhone.newAnchors(),
    ...fileNoEmailByNamePhone.newAnchors(),
  ];
  return { plan: { entries, counts, preview: newRows, anchors }, prepared };
}

/**
 * Aplica alegerile "Completează câmpurile goale" care privesc randuri DIN ACELASI
 * FISIER, inainte ca vreun rand sa fie scris. Acelasi tipar ca mergeWithinFile
 * din lead-import-plan.ts, intoarce CARE randuri au fost chiar completate.
 */
export function mergeClientsWithinFile(
  plan: ClientImportPlan,
  prepared: Map<number, PreparedWithOwnerId>,
  choices: DuplicateChoices,
): Set<number> {
  const filled = new Set<number>();
  for (const entry of plan.entries) {
    if (entry.kind !== "duplicate") continue;
    if (entry.against.kind !== "file") continue;
    if ((choices[entry.line] ?? "skip") !== "fill") continue;

    const target = prepared.get(entry.against.line);
    const source = prepared.get(entry.line);
    if (!target || !source) continue;

    let changed = false;
    for (const field of entry.fillable) {
      if ((target[field] ?? "") !== "") continue;
      const value = source[field] ?? "";
      if (value === "") continue;
      (target as Record<ClientFillField, string>)[field] = value;
      changed = true;
    }
    if (changed) filled.add(entry.line);
  }
  return filled;
}

export type { PreparedWithOwnerId };
