"use server";

// P3-123, Item 3 al lui Ivan. VERIFICAREA SI SCRIEREA IMPORTULUI DE CLIENTI.
//
// ACELASI TIPAR CA lib/data/lead-import-actions.ts, cardul P3-101: DOUA ACTIUNI,
// `planClientImport` care spune ce s-ar intampla si nu scrie nimic, si
// `runClientImport` care scrie. Previzualizarea INAINTE de scriere este clauza
// (3) a cardului si nu este optionala.
//
// PLANUL SE RECALCULEAZA PE SERVER LA SCRIERE, nu se ia de la browser, din
// acelasi motiv ca la leaduri: ecranul trimite ce a citit si ce a ales
// operatorul, iar dublatul se decide dupa randurile din baza, chiar aici.
//
// NUMAI ADMINISTRATORUL, exact ca la crearea unui singur client si ca la
// importul de leaduri: createClientRecord insusi raspunde OWNER_ONLY oricui nu
// este owner.
//
// NIMIC NU SE STERGE SI NIMIC NU SE SUPRASCRIE. Singura scriere pe un client
// care exista deja este `fillEmpty` de mai jos, care CITESTE randul, calculeaza
// numai coloanele goale si scrie numai pe acelea.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientLeaduri, hasClientNextAction } from "./schema-capability";
import { addClientNote, createClientRecord } from "./client-actions";
import { listClientOwnerChoices } from "./clients";
import { loadOrRefuse, readAllClients } from "./import-clients-read";
import { rawRowAt } from "./import-shared";
import type { ActionResult } from "./inbound-types";
import {
  buildOwnerIndex,
  importNoteBody,
  normaliseEmail,
  CLIENT_IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  type ClientImportColumnMapping,
  type ClientImportField,
  type OwnerIndex,
} from "./client-import-types";
import {
  buildClientPlan,
  duplicateReason,
  mergeClientsWithinFile,
  type ClientFillField,
  type ClientImportPlan,
  type DuplicateChoices,
  type ExistingClient,
  CLIENT_FILL_FIELDS,
} from "./client-import-plan";

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate importa clienți.",
};

const TOO_MANY: ActionResult<never> = {
  ok: false,
  message: `Fișierul are prea multe rânduri. Maximul este ${IMPORT_MAX_ROWS}.`,
};

/** Ce trimite ecranul: randurile citite din fisier si potrivirea coloanelor. */
export type ClientImportRequest = {
  rows: string[][];
  /** Linia din Excel a fiecarui rand de date (liniile goale se numara), ca "Rândul N"
   *  sa fie cel pe care operatorul il vede in foaie. Lipsa inseamna randuri una dupa alta. */
  lines?: number[];
  mapping: (ClientImportField | null)[];
};

export type ClientImportOutcome = {
  created: number;
  filled: number;
  skipped: number;
  skippedRows: { line: number; reason: string; raw: string[] }[];
  warnings: { line: number; reason: string }[];
};

function readMapping(raw: (ClientImportField | null)[]): ClientImportColumnMapping {
  const known = new Set<string>(CLIENT_IMPORT_FIELDS);
  const seen = new Set<string>();
  return raw.map((field) => {
    if (field === null || !known.has(field) || seen.has(field)) return null;
    seen.add(field);
    return field;
  });
}

/**
 * Clientii deja stocati, redusi la ce trebuie pentru a recunoaste un dublat.
 *
 * CHEIA DE DUBLARE ESTE EMAILUL SINGUR (clauza 5 a cardului), deci numai coloana
 * email se citeste pentru potrivire; restul coloanelor citite sunt pentru
 * `empty`, adica ce se poate completa.
 */
async function loadExisting(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ExistingClient[]> {
  const leaduri = await hasClientLeaduri(supabase);
  const next = await hasClientNextAction(supabase);

  const columns = [
    "id",
    "name",
    "phone",
    "email",
    "address",
    "fiscal_code",
    "notes",
    ...(leaduri ? ["interest", "source", "owner_id"] : []),
    ...(next ? ["next_action"] : []),
  ].join(",");

  const rows = await readAllClients(supabase, columns);

  return rows.map((row) => {
    const value = (column: string): string => (row[column] ?? "").trim();
    const empty: ClientFillField[] = [];
    const check: [ClientFillField, string][] = [
      ["phone", "phone"],
      ["email", "email"],
      ["address", "address"],
      ["fiscalCode", "fiscal_code"],
      ["notes", "notes"],
      ...(leaduri
        ? ([
            ["interest", "interest"],
            ["source", "source"],
            ["ownerId", "owner_id"],
          ] as [ClientFillField, string][])
        : []),
      ...(next ? ([["nextAction", "next_action"]] as [ClientFillField, string][]) : []),
    ];
    for (const [field, column] of check) if (value(column) === "") empty.push(field);

    return {
      id: row.id as string,
      name: row.name ?? "",
      emailKey: normaliseEmail(value("email")),
      empty,
    };
  });
}

/** Planul, calculat pe server, fara nicio scriere. */
export async function planClientImport(
  request: ClientImportRequest,
): Promise<ActionResult<ClientImportPlan>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const ownerChoices = await listClientOwnerChoices();
  const owners: OwnerIndex = buildOwnerIndex(ownerChoices);
  const ownerNames = new Map(ownerChoices.map((o) => [o.id, o.fullName]));
  const existing = await loadOrRefuse(() => loadExisting(supabase));
  if (!existing.ok) return existing;
  const { plan } = buildClientPlan({
    rows: request.rows,
    lines: request.lines,
    mapping: readMapping(request.mapping),
    owners,
    ownerNames,
    existing: existing.value,
  });

  return { ok: true, value: plan };
}

/** Coloana din baza a fiecarui camp completabil. */
const FILL_COLUMN: Record<ClientFillField, string> = {
  phone: "phone",
  email: "email",
  interest: "interest",
  source: "source",
  ownerId: "owner_id",
  nextAction: "next_action",
  notes: "notes",
  address: "address",
  fiscalCode: "fiscal_code",
};

/**
 * Completeaza NUMAI campurile goale ale unui client care exista deja.
 *
 * RANDUL SE CITESTE INAINTE DE SCRIERE, chiar aici, si nu se scrie nicio coloana
 * pe care citirea nu a gasit-o goala.
 */
async function fillEmpty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  client: Record<ClientFillField, string>,
  wanted: ClientFillField[],
): Promise<{ filled: boolean; message?: string }> {
  const leaduri = await hasClientLeaduri(supabase);
  const next = await hasClientNextAction(supabase);

  const readable = CLIENT_FILL_FIELDS.filter((field) => {
    if (["interest", "source", "ownerId"].includes(field)) return leaduri;
    if (field === "nextAction") return next;
    return true;
  });

  const { data, error } = await supabase
    .from("clients")
    .select(["id", ...readable.map((f) => FILL_COLUMN[f])].join(","))
    .eq("id", clientId)
    .single();
  if (error || !data) return { filled: false, message: "Clientul nu mai există." };

  const stored = data as unknown as Record<string, string | null>;
  const patch: Record<string, string> = {};
  for (const field of readable) {
    if (!wanted.includes(field)) continue;
    const value = (client[field] ?? "").trim();
    if (value === "") continue;
    if ((stored[FILL_COLUMN[field]] ?? "").trim() !== "") continue;
    patch[FILL_COLUMN[field]] = value;
  }

  if (Object.keys(patch).length === 0) return { filled: false };
  const { error: writeError } = await supabase.from("clients").update(patch).eq("id", clientId);
  if (writeError) return { filled: false, message: writeError.message };
  return { filled: true };
}

/**
 * Scrie importul si intoarce numerele rezumatului.
 *
 * O EROARE PE UN RAND NU OPRESTE RESTUL: randul intra in lista celor nepreluate
 * cu motivul lui si fisierul merge mai departe.
 */
export async function runClientImport(
  request: ClientImportRequest & {
    choices: DuplicateChoices;
    fileName: string;
    day: string;
  },
): Promise<ActionResult<ClientImportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const ownerChoices = await listClientOwnerChoices();
  const owners: OwnerIndex = buildOwnerIndex(ownerChoices);
  const ownerNames = new Map(ownerChoices.map((o) => [o.id, o.fullName]));
  const existing = await loadOrRefuse(() => loadExisting(supabase));
  if (!existing.ok) return existing;
  const { plan, prepared } = buildClientPlan({
    rows: request.rows,
    lines: request.lines,
    mapping: readMapping(request.mapping),
    owners,
    ownerNames,
    existing: existing.value,
  });

  const mergedLines = mergeClientsWithinFile(plan, prepared, request.choices);
  let filled = mergedLines.size;

  let created = 0;
  const skippedRows: { line: number; reason: string; raw: string[] }[] = [];
  const warnings: { line: number; reason: string }[] = [];
  const noteBody = importNoteBody(request.fileName, request.day);
  const rawAt = (line: number) => rawRowAt(request.rows, request.lines, 1, line);

  for (const entry of plan.entries) {
    if (entry.kind === "error") {
      skippedRows.push({ line: entry.line, reason: entry.reason, raw: entry.raw });
      continue;
    }

    if (entry.kind === "duplicate") {
      const choice = request.choices[entry.line] ?? "skip";
      if (choice !== "fill" || entry.against.kind === "file") {
        if (choice !== "fill") {
          skippedRows.push({ line: entry.line, reason: duplicateReason(entry), raw: rawAt(entry.line) });
        } else if (entry.against.kind === "file" && !mergedLines.has(entry.line)) {
          skippedRows.push({
            line: entry.line,
            reason: `Dublat cu rândul ${entry.against.line}, "${entry.against.name}", care are deja completate câmpurile din fișier.`,
            raw: rawAt(entry.line),
          });
        }
        continue;
      }
      const client = prepared.get(entry.line);
      if (!client) {
        skippedRows.push({
          line: entry.line,
          reason: "Rândul nu a putut fi pregătit pentru scriere.",
          raw: rawAt(entry.line),
        });
        continue;
      }
      const result = await fillEmpty(supabase, entry.against.id, client, entry.fillable);
      if (result.filled) filled += 1;
      else
        skippedRows.push({
          line: entry.line,
          reason:
            result.message ??
            `Dublat cu "${entry.against.name}", care are deja completate câmpurile din fișier.`,
          raw: rawAt(entry.line),
        });
      continue;
    }

    const client = prepared.get(entry.line);
    if (!client) {
      skippedRows.push({
        line: entry.line,
        reason: "Rândul nu a putut fi pregătit pentru scriere.",
        raw: rawAt(entry.line),
      });
      continue;
    }

    const result = await createClientRecord({
      name: client.name,
      type: client.type,
      fiscalCode: client.fiscalCode,
      address: client.address,
      phone: client.phone,
      email: client.email,
      notes: client.notes,
      active: true,
      stage: client.stage,
      followUpDate: client.followUpDate,
      source: client.source,
      interest: client.interest,
      ownerId: client.ownerId,
      nextAction: client.nextAction,
      firstStage: true,
    });

    if (!result.ok) {
      // CLIENTUL EXISTA DEJA cand un pas de dupa insert a esuat (etapa, persoana de
      // contact): nu este un rand nepreluat si nu se pune in fisierul de erori, fiindca
      // incarcat din nou ar crea un al doilea client. Se numara ca creat si se spune
      // ce lipseste, cu mesajul pasului.
      if (result.saved?.clientId) {
        created += 1;
        warnings.push({ line: entry.line, reason: result.message });
        const partialNote = await addClientNote(result.saved.clientId, noteBody);
        if (!partialNote.ok)
          warnings.push({
            line: entry.line,
            reason: `Nota de import nu s-a salvat. ${partialNote.message}`,
          });
        continue;
      }
      skippedRows.push({ line: entry.line, reason: result.message, raw: rawAt(entry.line) });
      continue;
    }
    created += 1;

    const note = await addClientNote(result.value.id, noteBody);
    if (!note.ok)
      warnings.push({
        line: entry.line,
        reason: `Clientul a fost creat, dar nota de import nu s-a salvat. ${note.message}`,
      });
  }

  // CELE TREI NUMERE ADUNA FISIERUL, acelasi invariant ca la leaduri, cardul
  // P3-115, constatarea G18 a raportului docs/reports/2026-09-29-critic-bug-sweep-2.md.
  const accounted = created + filled + skippedRows.length;
  if (accounted !== request.rows.length) {
    warnings.push({
      line: 0,
      reason:
        `Rezumatul nu se potrivește cu fișierul: ${request.rows.length} rânduri citite, ` +
        `${created} create plus ${filled} completate plus ${skippedRows.length} nepreluate ` +
        `fac ${accounted}. Numerele de mai sus sunt corecte pentru ce s-a scris; socoteala nu.`,
    });
  }

  revalidatePath("/clienti");
  return {
    ok: true,
    value: { created, filled, skipped: skippedRows.length, skippedRows, warnings },
  };
}
