// P3-141. RANDURILE NOI, CU VALORILE CUM VOR FI SALVATE, in pasul "Verifică" al
// celor patru importuri (clienti, leaduri, proiecte, materiale).
//
// Pur: primeste randurile deja pregatite de planul fiecarui import (dupa citirea
// numerelor, normalizarea telefonului si a emailului, potrivirea etapei) si
// intoarce un tabel de texte gata de afisat. Nu citeste fisierul din nou, nu
// scrie nimic. Un camp optional gol ramane o celula goala.

import { formatMoney, formatMoneyExact, formatQty } from "./format";
import {
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGE_LABEL,
  CLIENT_TYPE_LABEL,
  type ClientSource,
  type ClientStage,
  type ClientType,
} from "./clients-types";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "./projects-types";
import { unitLabel, type UnitCode } from "./units";

/** Cate randuri noi arata ecranul. Restul se numara intr-o linie. */
export const PREVIEW_ROW_LIMIT = 50;

export type ImportPreviewRow = { line: number; cells: string[] };

/** Tabelul "Rânduri noi". `rows` are cel mult PREVIEW_ROW_LIMIT randuri, iar
 *  `more` este numarul celor care nu incap. */
export type ImportPreviewTable = {
  columns: string[];
  rows: ImportPreviewRow[];
  more: number;
};

/** "și încă 10 rânduri". Romana cere "de" de la 20 in sus. */
export function morePreviewRowsText(more: number): string {
  const word = more === 1 ? "rând" : more % 100 >= 1 && more % 100 <= 19 ? "rânduri" : "de rânduri";
  return more === 1 ? "și încă 1 rând" : `și încă ${more} ${word}`;
}

function build(
  columns: string[],
  all: ImportPreviewRow[],
): ImportPreviewTable {
  return {
    columns: ["Rândul", ...columns],
    rows: all.slice(0, PREVIEW_ROW_LIMIT),
    more: Math.max(0, all.length - PREVIEW_ROW_LIMIT),
  };
}

/** Bani cum ii arata aplicatia: lei intregi, sau cu doi bani cand valoarea ii are. */
function money(raw: string): string {
  if (raw.trim() === "") return "";
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return Number.isInteger(value) ? formatMoney(value) : formatMoneyExact(value);
}

/** Data salvata (AAAA-LL-ZZ) cum se scrie pe ecran (ZZ.LL.AAAA). */
function date(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : raw;
}

// ---------------------------------------------------------------------------
// Clienti si leaduri: acelasi rand, aceleasi etichete
// ---------------------------------------------------------------------------

type PersonRecord = {
  name: string;
  type: string;
  phone: string;
  email: string;
  contactName?: string;
  interest: string;
  source: string;
  ownerId: string;
  stage: string;
  followUpDate: string;
  nextAction: string;
  nextActionDate: string;
  notes: string;
  address: string;
  fiscalCode: string;
};

const PERSON_COLUMNS: [string, (r: PersonRecord, owners: ReadonlyMap<string, string>) => string][] = [
  ["Denumire", (r) => r.name],
  ["Tip", (r) => CLIENT_TYPE_LABEL[r.type as ClientType] ?? r.type],
  ["Telefon", (r) => r.phone],
  ["Email", (r) => r.email],
  ["Persoană de contact", (r) => r.contactName ?? ""],
  ["Interes", (r) => r.interest],
  ["Sursă", (r) => (r.source === "" ? "" : (CLIENT_SOURCE_LABEL[r.source as ClientSource] ?? r.source))],
  ["Responsabil", (r, owners) => (r.ownerId === "" ? "" : (owners.get(r.ownerId) ?? ""))],
  ["Etapă", (r) => CLIENT_STAGE_LABEL[r.stage as ClientStage] ?? r.stage],
  ["Data de reluare", (r) => date(r.followUpDate)],
  ["Următorul pas", (r) => r.nextAction],
  ["Data pasului următor", (r) => date(r.nextActionDate)],
  ["Note", (r) => r.notes],
  ["Adresă", (r) => r.address],
  ["IDNO", (r) => r.fiscalCode],
];

/**
 * `withContact` este adevarat pentru leaduri, care au Persoana de contact; un
 * client nu o are (clauza 2 a cardului P3-123), deci coloana lipseste de acolo.
 */
export function personPreviewTable(
  newLines: number[],
  prepared: ReadonlyMap<number, PersonRecord>,
  ownerNames: ReadonlyMap<string, string>,
  withContact: boolean,
): ImportPreviewTable {
  const columns = PERSON_COLUMNS.filter(([label]) => withContact || label !== "Persoană de contact");
  const rows: ImportPreviewRow[] = [];
  for (const line of newLines) {
    const record = prepared.get(line);
    if (!record) continue;
    rows.push({ line, cells: columns.map(([, cell]) => cell(record, ownerNames)) });
  }
  return build(
    columns.map(([label]) => label),
    rows,
  );
}

// ---------------------------------------------------------------------------
// Proiecte
// ---------------------------------------------------------------------------

type ProjectRecord = {
  client: string;
  name: string;
  address: string;
  status: string;
  startDate: string;
  plannedEndDate: string;
  budgetMdl: string;
  notes: string;
};

export function projectPreviewTable(
  newLines: number[],
  prepared: ReadonlyMap<number, ProjectRecord>,
  clientNames: ReadonlyMap<string, string>,
): ImportPreviewTable {
  const rows: ImportPreviewRow[] = [];
  for (const line of newLines) {
    const r = prepared.get(line);
    if (!r) continue;
    rows.push({
      line,
      cells: [
        clientNames.get(r.client) ?? "",
        r.name,
        r.address,
        PROJECT_STATUS_LABEL[r.status as ProjectStatus] ?? r.status,
        date(r.startDate),
        date(r.plannedEndDate),
        money(r.budgetMdl),
        r.notes,
      ],
    });
  }
  return build(
    ["Client", "Denumire", "Adresă", "Stare", "Data început", "Termen estimat", "Buget (MDL)", "Note"],
    rows,
  );
}

// ---------------------------------------------------------------------------
// Materiale
// ---------------------------------------------------------------------------

type MaterialRecord = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  threshold: string;
  unitValueMdl: string;
};

export function materialPreviewTable(
  newLines: number[],
  prepared: ReadonlyMap<number, MaterialRecord>,
  categoryNames: ReadonlyMap<string, string>,
): ImportPreviewTable {
  const rows: ImportPreviewRow[] = [];
  for (const line of newLines) {
    const r = prepared.get(line);
    if (!r) continue;
    const unit = r.unit as UnitCode;
    const threshold = r.threshold.trim() === "" ? "" : formatQty(Number(r.threshold), unit);
    rows.push({
      line,
      cells: [
        r.sku,
        r.name,
        categoryNames.get(r.category) ?? r.category,
        unitLabel(unit),
        threshold,
        money(r.unitValueMdl),
      ],
    });
  }
  return build(
    ["Cod SKU", "Denumire", "Categorie", "Unitate de măsură", "Prag recomandă", "Valoare unitară (MDL)"],
    rows,
  );
}
