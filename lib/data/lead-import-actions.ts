"use server";

// P3-101, goal G58. VERIFICAREA SI SCRIEREA IMPORTULUI DE LEADURI.
//
// DOUA ACTIUNI SI NU UNA: `planLeadImport` spune ce s-ar intampla si nu scrie
// nimic, `runLeadImport` scrie. Pasul "Verifică" din G58 cere exact separarea
// aceasta: numerele se vad INAINTE ca ceva sa ajunga in baza.
//
// PLANUL SE RECALCULEAZA PE SERVER LA SCRIERE, si nu se ia de la browser. Un
// plan trimis de client este o afirmatie a clientului despre ce este dublat, si
// dublatul se decide dupa randurile din baza. Ecranul trimite ce a citit din
// fisier si ce a ales operatorul; restul se recalculeaza aici.
//
// NUMAI ADMINISTRATORUL, exact ca la crearea unui singur lead. createClientRecord
// raspunde OWNER_ONLY oricui nu este owner, deci un import deschis operatorilor ar
// largi cine poate scrie date de client, cu cinci mii de randuri deodata. Intrebarea
// a plecat la proprietar (mailbox q085) si pana la raspuns se aplica implicitul
// recomandat: numai administratorul.
//
// NIMIC NU SE STERGE SI NIMIC NU SE SUPRASCRIE. Singura scriere pe un client care
// exista deja este `fillEmpty` de mai jos, care CITESTE randul, calculeaza numai
// coloanele goale si scrie numai pe acelea. Denumirea, etapa si data de reluare nu
// sunt in lista deloc.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientLeaduri, hasClientNextAction } from "./schema-capability";
import { addClientNote, createClientRecord } from "./client-actions";
import { createContact } from "./contact-actions";
import { listClientOwnerChoices } from "./clients";
import type { ActionResult } from "./inbound-types";
import { isClientSource, type ClientSource } from "./clients-types";
import {
  buildOwnerIndex,
  normaliseEmail,
  normalisePhone,
  type ColumnMapping,
  type ImportField,
  type PreparedLead,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  importNoteBody,
} from "./lead-import-types";
import {
  buildPlan,
  duplicateReason,
  mergeWithinFile,
  type DuplicateChoices,
  type ExistingClient,
  type FillField,
  type LeadImportPlan,
  FILL_FIELDS,
} from "./lead-import-plan";

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate importa leaduri.",
};

const TOO_MANY: ActionResult<never> = {
  ok: false,
  message: `Fișierul are prea multe rânduri. Maximul este ${IMPORT_MAX_ROWS}.`,
};

/** Ce trimite ecranul: randurile citite din fisier si potrivirea coloanelor. */
export type LeadImportRequest = {
  rows: string[][];
  /** Cate un camp sau null pentru fiecare coloana, in ordinea coloanelor. */
  mapping: (ImportField | null)[];
  /** Sursa scrisa o singura data si pusa pe randurile care nu au una a lor. */
  fallbackSource: string;
};

/** Rezultatul scrierii, exact numerele din rezumatul cerut de G58. */
export type LeadImportOutcome = {
  created: number;
  filled: number;
  skipped: number;
  /** Randurile nepreluate, cu motivul lor, pentru fisierul descarcabil. */
  skippedRows: { line: number; reason: string; raw: string[] }[];
};

function readMapping(raw: (ImportField | null)[]): ColumnMapping {
  // Un camp care nu este in lista noastra nu exista, si un client care trimite
  // altceva primeste "nu importa coloana asta" in loc sa scrie intr-o coloana
  // pe care nimeni nu a numit-o.
  const known = new Set<string>(IMPORT_FIELDS);
  const seen = new Set<string>();
  return raw.map((field) => {
    if (field === null || !known.has(field) || seen.has(field)) return null;
    seen.add(field);
    return field;
  });
}

function readFallbackSource(raw: string): ClientSource | "" {
  const value = raw.trim();
  return value !== "" && isClientSource(value) ? value : "";
}

/**
 * Clientii deja stocati, redusi la ce trebuie pentru a recunoaste un dublat.
 *
 * SE CITESC TOTI, si asta este o alegere si nu o scapare: dublatul se cauta dupa
 * telefon normalizat, iar normalizarea se face in cod, nu in baza. O interogare
 * care ar cauta numarul asa cum este scris in fisier ar rata exact cazul pentru
 * care normalizarea exista. Lista este de ordinul sutelor de randuri si se citesc
 * patru coloane plus cele completabile, nu randul intreg.
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

  const { data, error } = await supabase.from("clients").select(columns);
  if (error || !data) return [];

  const rows = data as unknown as Record<string, string | null>[];
  const ids = rows.map((r) => r.id as string);

  // Persoana de contact se completeaza numai pe un client care NU ARE NICIUNA.
  // Un client cu contacte are deja pe cineva scris acolo, si a adauga inca unul
  // dintr-un fisier nu este completarea unui gol.
  const withContact = new Set<string>();
  if (ids.length > 0) {
    const { data: contacts } = await supabase.from("contacts").select("client_id");
    for (const row of (contacts ?? []) as { client_id: string }[]) withContact.add(row.client_id);
  }

  return rows.map((row) => {
    const value = (column: string): string => (row[column] ?? "").trim();
    const empty: FillField[] = [];
    const check: [FillField, string][] = [
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
          ] as [FillField, string][])
        : []),
      ...(next ? ([["nextAction", "next_action"]] as [FillField, string][]) : []),
    ];
    for (const [field, column] of check) if (value(column) === "") empty.push(field);
    if (!withContact.has(row.id as string)) empty.push("contactName");

    return {
      id: row.id as string,
      name: row.name ?? "",
      phoneKey: normalisePhone(value("phone")),
      emailKey: normaliseEmail(value("email")),
      empty,
    };
  });
}

/** Planul, calculat pe server, fara nicio scriere. */
export async function planLeadImport(
  request: LeadImportRequest,
): Promise<ActionResult<LeadImportPlan>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const { plan } = buildPlan({
    rows: request.rows,
    mapping: readMapping(request.mapping),
    owners: buildOwnerIndex(await listClientOwnerChoices()),
    fallbackSource: readFallbackSource(request.fallbackSource),
    existing: await loadExisting(supabase),
  });

  return { ok: true, value: plan };
}

/** Coloana din baza a fiecarui camp completabil. `contactName` lipseste: el nu
 *  este o coloana, ci un rand in public.contacts. */
const FILL_COLUMN: Record<Exclude<FillField, "contactName">, string> = {
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
 * pe care citirea nu a gasit-o goala. Lista campurilor venita de la ecran este o
 * cerere, nu o permisiune: daca intre pasul "Verifică" si apasarea butonului
 * cineva a completat un camp, camera aceea nu se mai atinge.
 *
 * Denumirea, etapa si data de reluare nu pot fi atinse de aici deloc: nu sunt in
 * FILL_COLUMN, deci nu exista niciun drum catre ele.
 */
async function fillEmpty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  lead: PreparedLead,
  wanted: FillField[],
): Promise<{ filled: boolean; message?: string }> {
  const leaduri = await hasClientLeaduri(supabase);
  const next = await hasClientNextAction(supabase);

  const readable = FILL_FIELDS.filter((field) => {
    if (field === "contactName") return false;
    if (["interest", "source", "ownerId"].includes(field)) return leaduri;
    if (field === "nextAction") return next;
    return true;
  }) as Exclude<FillField, "contactName">[];

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
    const value = (lead[field] ?? "").trim();
    if (value === "") continue;
    if ((stored[FILL_COLUMN[field]] ?? "").trim() !== "") continue;
    patch[FILL_COLUMN[field]] = value;
  }

  let filled = false;
  if (Object.keys(patch).length > 0) {
    const { error: writeError } = await supabase.from("clients").update(patch).eq("id", clientId);
    if (writeError) return { filled: false, message: writeError.message };
    filled = true;
  }

  // Persoana de contact, numai cand clientul nu are niciuna. Prin actiunea care
  // exista deja, nu printr-o a doua cale de scriere in public.contacts.
  const contactName = (lead.contactName ?? "").trim();
  if (wanted.includes("contactName") && contactName !== "") {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id")
      .eq("client_id", clientId)
      .limit(1);
    if ((contacts ?? []).length === 0) {
      const created = await createContact({
        clientId,
        name: contactName,
        role: "",
        phone: "",
        email: "",
        isPrimary: true,
        notes: "",
        active: true,
      });
      if (created.ok) filled = true;
    }
  }

  return { filled };
}

/**
 * Scrie importul si intoarce numerele rezumatului.
 *
 * O EROARE PE UN RAND NU OPRESTE RESTUL, care este regula lui G58: randul intra
 * in lista celor nepreluate cu motivul lui si fisierul merge mai departe.
 */
export async function runLeadImport(
  request: LeadImportRequest & {
    choices: DuplicateChoices;
    fileName: string;
    /** Ziua scrisa in nota, `YYYY-MM-DD`, calculata de ecran in fusul lui. */
    day: string;
  },
): Promise<ActionResult<LeadImportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (request.rows.length > IMPORT_MAX_ROWS) return TOO_MANY;

  const supabase = await createClient();
  const { plan, prepared } = buildPlan({
    rows: request.rows,
    mapping: readMapping(request.mapping),
    owners: buildOwnerIndex(await listClientOwnerChoices()),
    fallbackSource: readFallbackSource(request.fallbackSource),
    existing: await loadExisting(supabase),
  });

  // Intai completarile din interiorul fisierului, cat timp niciun rand nu a fost
  // scris: randul de mai sus nu exista in baza, deci se completeaza planul lui.
  let filled = mergeWithinFile(plan, prepared, request.choices);

  let created = 0;
  const skippedRows: { line: number; reason: string; raw: string[] }[] = [];
  const noteBody = importNoteBody(request.fileName, request.day);

  for (const entry of plan.entries) {
    if (entry.kind === "error") {
      skippedRows.push({ line: entry.line, reason: entry.reason, raw: entry.raw });
      continue;
    }

    if (entry.kind === "duplicate") {
      const choice = request.choices[entry.line] ?? "skip";
      if (choice !== "fill" || entry.against.kind === "file") {
        // Un dublat din acelasi fisier a fost deja tratat mai sus, si oricum nu
        // se scrie ca rand propriu: aici este doar contabilizat ca nepreluat.
        if (choice !== "fill")
          skippedRows.push({ line: entry.line, reason: duplicateReason(entry), raw: [] });
        continue;
      }
      const lead = prepared.get(entry.line);
      if (!lead) continue;
      const result = await fillEmpty(supabase, entry.against.id, lead, entry.fillable);
      if (result.filled) filled += 1;
      else
        skippedRows.push({
          line: entry.line,
          reason:
            result.message ??
            `Dublat cu "${entry.against.name}", care are deja completate câmpurile din fișier.`,
          raw: [],
        });
      continue;
    }

    const lead = prepared.get(entry.line);
    if (!lead) continue;

    const result = await createClientRecord({
      name: lead.name,
      type: lead.type,
      fiscalCode: lead.fiscalCode,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
      active: true,
      stage: lead.stage,
      followUpDate: lead.followUpDate,
      source: lead.source,
      interest: lead.interest,
      ownerId: lead.ownerId,
      nextAction: lead.nextAction,
      contactName: lead.contactName,
      firstStage: true,
    });

    if (!result.ok) {
      skippedRows.push({ line: entry.line, reason: result.message, raw: [] });
      continue;
    }
    created += 1;

    // NOTA TRECE PRIN addClientNote, calea care exista deja (G45). O scriere
    // directa in public.client_notes ar fi un al doilea drum catre acelasi tabel.
    // O nota care nu se salveaza NU anuleaza leadul: clientul exista, iar randul
    // apare in lista celor nepreluate ca sa se vada ce lipseste.
    const note = await addClientNote(result.value.id, noteBody);
    if (!note.ok)
      skippedRows.push({
        line: entry.line,
        reason: `Leadul a fost creat, dar nota de import nu s-a salvat. ${note.message}`,
        raw: [],
      });
  }

  revalidatePath("/clienti");
  return {
    ok: true,
    value: { created, filled, skipped: skippedRows.length, skippedRows },
  };
}
