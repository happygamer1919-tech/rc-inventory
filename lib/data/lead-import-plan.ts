// P3-101, goal G58. CE SE VA INTAMPLA CU FIECARE RAND, INAINTE SA SE SCRIE CEVA.
//
// Pasul "Verifică" trebuie sa spuna cate randuri sunt noi, cate sunt dublate si
// cate au o eroare, FARA sa fi scris nimic. Fisierul acesta calculeaza exact asta
// si nu scrie nimic el insusi: primeste randurile pregatite si lista clientilor
// deja stocati, si intoarce planul.
//
// DUBLATUL SE CAUTA IN DOUA LOCURI SI AMANDOUA CONTEAZA: printre clientii deja
// stocati, si printre randurile de mai sus DIN ACELASI FISIER. Al doilea caz este
// cel pe care un import naiv il rateaza: acelasi om scris de doua ori in aceeasi
// foaie ar intra de doua ori, si nimeni nu ar sti de unde a aparut al doilea.
//
// NIMIC NU SE SUPRASCRIE. Un dublat are doua raspunsuri si atat: se sare peste el
// (implicit), sau i se completeaza NUMAI campurile goale. Nu exista un al treilea
// raspuns care sa inlocuiasca o valoare scrisa de cineva, fiindca G58 spune ca nu
// trebuie sa existe.

import type { ClientSource } from "./clients-types";
import {
  IMPORT_FIELD_LABEL,
  type ColumnMapping,
  type OwnerIndex,
  type PreparedLead,
  type PreparedRow,
  prepareRow,
} from "./lead-import-types";

/** Campurile pe care completarea le poate scrie. Denumirea, etapa si data de
 *  reluare NU sunt aici, si lipsa lor este regula: un camp gol este o lipsa, iar
 *  o etapa este o judecata pe care a facut-o cineva. */
export const FILL_FIELDS = [
  "phone",
  "email",
  "contactName",
  "interest",
  "source",
  "ownerId",
  "nextAction",
  "notes",
  "address",
  "fiscalCode",
] as const;

export type FillField = (typeof FILL_FIELDS)[number];

/** Un client deja stocat, redus la ce trebuie ca sa se recunoasca un dublat. */
export type ExistingClient = {
  id: string;
  name: string;
  /** Telefonul stocat, trecut prin aceeasi normalizare ca randul din fisier. */
  phoneKey: string | null;
  emailKey: string | null;
  /** Campurile care sunt GOALE azi, deci singurele pe care completarea le atinge. */
  empty: FillField[];
};

/** Cu cine s-a potrivit un rand dublat. */
export type DuplicateTarget =
  | { kind: "stored"; id: string; name: string }
  | { kind: "file"; line: number; name: string };

export type PlanEntry =
  | { kind: "new"; line: number; name: string }
  | {
      kind: "duplicate";
      line: number;
      name: string;
      matchedOn: "phone" | "email";
      against: DuplicateTarget;
      /** Campurile care s-ar completa daca operatorul alege completarea. Lista
       *  goala inseamna ca nu este nimic de completat, si ecranul o spune. */
      fillable: FillField[];
    }
  | { kind: "error"; line: number; reason: string; raw: string[] };

export type LeadImportPlan = {
  entries: PlanEntry[];
  counts: { fresh: number; duplicate: number; error: number };
};

/** Ce a ales operatorul pentru fiecare rand dublat. Lipsa inseamna "Sari peste". */
export type DuplicateChoice = "skip" | "fill";
export type DuplicateChoices = Record<number, DuplicateChoice>;

/** Propozitia romaneasca a unui dublat sarit, pentru fisierul randurilor nepreluate. */
export function duplicateReason(entry: Extract<PlanEntry, { kind: "duplicate" }>): string {
  const how = entry.matchedOn === "phone" ? "telefon" : "email";
  return entry.against.kind === "stored"
    ? `Dublat după ${how} cu "${entry.against.name}", care există deja.`
    : `Dublat după ${how} cu rândul ${entry.against.line} din același fișier.`;
}

/** Eticheta romaneasca a fiecarui camp completabil, pentru ecran. Se ia din
 *  etichetele coloanelor, cu o singura nepotrivire de nume: coloana din fisier
 *  poarta NUMELE responsabilului, iar campul completabil poarta id-ul lui. */
export function fillFieldLabel(field: FillField): string {
  return field === "ownerId" ? IMPORT_FIELD_LABEL.ownerName : IMPORT_FIELD_LABEL[field];
}

/** Ce are randul din fisier de oferit: campurile pe care le-a completat. */
function filledFields(lead: PreparedLead): Set<FillField> {
  const given = new Set<FillField>();
  for (const field of FILL_FIELDS) if ((lead[field] ?? "") !== "") given.add(field);
  return given;
}

/** Campurile goale ale unui rand din fisier, in aceeasi vocabular ca `empty`. */
function emptyFields(lead: PreparedLead): FillField[] {
  return FILL_FIELDS.filter((field) => (lead[field] ?? "") === "");
}

/**
 * Pregateste fiecare rand si spune ce s-ar intampla cu el.
 *
 * ORDINEA RANDURILOR ESTE ORDINEA DIN FISIER si nu se schimba: "dublat cu randul
 * de mai sus" nu ar avea niciun inteles altfel, iar operatorul cauta randul dupa
 * numarul pe care il vede in Excel.
 */
export function buildPlan(input: {
  rows: string[][];
  mapping: ColumnMapping;
  owners: OwnerIndex;
  fallbackSource: ClientSource | "";
  existing: ExistingClient[];
  /** Numarul randului de antet, ca numerotarea sa fie cea din Excel. */
  headerLine?: number;
}): { plan: LeadImportPlan; prepared: Map<number, PreparedLead> } {
  const headerLine = input.headerLine ?? 1;

  const storedByPhone = new Map<string, ExistingClient>();
  const storedByEmail = new Map<string, ExistingClient>();
  for (const client of input.existing) {
    if (client.phoneKey && !storedByPhone.has(client.phoneKey))
      storedByPhone.set(client.phoneKey, client);
    if (client.emailKey && !storedByEmail.has(client.emailKey))
      storedByEmail.set(client.emailKey, client);
  }

  // Randurile bune de mai sus, ca un al doilea rand al aceluiasi om sa il
  // gaseasca pe primul. Se umple pe masura ce se citeste, deci un rand nu se
  // poate potrivi cu unul de mai jos: asa "primul castiga" este mereu adevarat.
  const fileByPhone = new Map<string, { line: number; name: string }>();
  const fileByEmail = new Map<string, { line: number; name: string }>();

  const entries: PlanEntry[] = [];
  const prepared = new Map<number, PreparedLead>();
  const counts = { fresh: 0, duplicate: 0, error: 0 };

  for (let i = 0; i < input.rows.length; i += 1) {
    const line = headerLine + 1 + i;
    const row: PreparedRow = prepareRow(
      input.rows[i] ?? [],
      input.mapping,
      line,
      input.owners,
      input.fallbackSource,
    );

    if (!row.ok) {
      entries.push({ kind: "error", line, reason: row.reason, raw: row.raw });
      counts.error += 1;
      continue;
    }

    prepared.set(line, row.lead);
    const given = filledFields(row.lead);

    // FISIERUL INAINTEA BAZEI. Un rand care se potriveste si cu un rand de mai
    // sus si cu un client stocat apartine randului de mai sus: acela decide ce
    // ajunge in baza, iar o scriere dubla in aceeasi rulare este defectul mai
    // apropiat.
    const fileMatch =
      (row.phoneKey ? fileByPhone.get(row.phoneKey) : undefined) ??
      (row.emailKey ? fileByEmail.get(row.emailKey) : undefined);
    const fileMatchedOn =
      row.phoneKey && fileByPhone.has(row.phoneKey) ? ("phone" as const) : ("email" as const);

    if (fileMatch) {
      const earlier = prepared.get(fileMatch.line);
      const fillable = earlier
        ? emptyFields(earlier).filter((field) => given.has(field))
        : [];
      entries.push({
        kind: "duplicate",
        line,
        name: row.lead.name,
        matchedOn: fileMatchedOn,
        against: { kind: "file", line: fileMatch.line, name: fileMatch.name },
        fillable,
      });
      counts.duplicate += 1;
      continue;
    }

    const storedMatch =
      (row.phoneKey ? storedByPhone.get(row.phoneKey) : undefined) ??
      (row.emailKey ? storedByEmail.get(row.emailKey) : undefined);
    const storedMatchedOn =
      row.phoneKey && storedByPhone.has(row.phoneKey) ? ("phone" as const) : ("email" as const);

    if (storedMatch) {
      entries.push({
        kind: "duplicate",
        line,
        name: row.lead.name,
        matchedOn: storedMatchedOn,
        against: { kind: "stored", id: storedMatch.id, name: storedMatch.name },
        fillable: storedMatch.empty.filter((field) => given.has(field)),
      });
      counts.duplicate += 1;
      // UN DUBLAT NU DEVINE O ANCORA IN FISIER. Randul nu se va crea, deci un al
      // treilea rand al aceluiasi om trebuie sa gaseasca tot clientul stocat, nu
      // acest rand care nu ajunge nicaieri.
      continue;
    }

    if (row.phoneKey) fileByPhone.set(row.phoneKey, { line, name: row.lead.name });
    if (row.emailKey) fileByEmail.set(row.emailKey, { line, name: row.lead.name });
    entries.push({ kind: "new", line, name: row.lead.name });
    counts.fresh += 1;
  }

  return { plan: { entries, counts }, prepared };
}

/**
 * Aplica alegerile "Completează câmpurile goale" care privesc randuri DIN ACELASI
 * FISIER, inainte ca vreun rand sa fie scris.
 *
 * Randul de mai sus nu exista inca in baza, deci nu are ce sa i se completeze
 * acolo: se completeaza randul pregatit, si abia apoi se creeaza. Intoarce cate
 * randuri au fost chiar completate, adica cele care au schimbat ceva.
 */
export function mergeWithinFile(
  plan: LeadImportPlan,
  prepared: Map<number, PreparedLead>,
  choices: DuplicateChoices,
): number {
  let filled = 0;
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
      // TypeScript nu poate lega cheia de tipul valorii aici, iar fiecare camp
      // completabil este un `string` sau `ClientSource | ""`, deci atribuirea
      // este sigura si scrisa o singura data.
      (target as Record<FillField, string>)[field] = value;
      changed = true;
    }
    if (changed) filled += 1;
  }
  return filled;
}
