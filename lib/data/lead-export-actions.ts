"use server";

// P3-126. EXPORTUL LEADURILOR: vederea curenta a listei, ca fisier CSV cu antetul
// modelului de import.
//
// FILTRUL ESTE AL LISTEI, NU AL EXPORTULUI. Actiunea primeste filtrele cu care e
// desenata lista (cautare, tip, stare, vedere, etapa) si le trece prin
// `listClientRowsForExport`, adica prin aceleasi functii din baza ca ecranul. Pagina nu
// conteaza: se exporta toate randurile filtrului, pana la IMPORT_MAX_ROWS.
//
// NICIO CITIRE NOUA A LISTEI. Singurele citiri in plus sunt cele pe care ecranul le face
// deja pentru un singur rand (fisa clientului): coloanele pe care lista nu le intoarce
// (email, IDNO, adresa, note, interes, sursa, responsabil) si persoana de contact, citite
// pentru ID-urile randurilor deja alese de lista. Nu alege nimic, doar completeaza.
//
// NUMAI ADMINISTRATORUL, ca importul: fisierul este toata agenda de leaduri dintr-o data.

import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./inbound-types";
import { listClientOwnerChoices, listClientRowsForExport } from "./clients";
import { hasClientNextAction } from "./schema-capability";
import {
  CLIENT_SOURCE_LABEL,
  CLIENT_STAGE_LABEL,
  CLIENT_TYPE_LABEL,
  isClientSource,
  isClientStage,
  isClientType,
  isClientView,
  type ClientListQuery,
} from "./clients-types";
import {
  IMPORT_MAX_ROWS,
  exportTruncatedNotice,
  leadExportCsv,
  type ExportLeadRow,
} from "./lead-import-types";

/** Ce trimite ecranul: filtrele listei, fara pagina. */
export type LeadExportRequest = Pick<ClientListQuery, "q" | "type" | "status" | "view" | "stage">;

export type LeadExportOutcome = {
  csv: string;
  /** Randurile din fisier. */
  count: number;
  /** Randurile pe care le are filtrul. */
  total: number;
  truncated: boolean;
  /** Propozitia romaneasca de aratat cand fisierul a fost taiat, altfel null. */
  notice: string | null;
};

/** Cate id-uri intra intr-o cerere `in (...)`: adresa cererii are o limita. */
const ID_CHUNK = 100;

type DetailRow = {
  id: string;
  email: string | null;
  fiscal_code: string | null;
  address: string | null;
  notes: string | null;
  interest?: string | null;
  source?: string | null;
  owner_id?: string | null;
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Filtrele venite de la browser, reduse la valori pe care le cunoastem. Un filtru
 *  necunoscut nu extinde exportul, il lasa la implicit. */
function readRequest(request: LeadExportRequest): ClientListQuery {
  const status =
    request.status === "inactive" || request.status === "toate" ? request.status : "active";
  const stage = isClientStage(request.stage) ? request.stage : "";
  return {
    q: typeof request.q === "string" ? request.q.trim() : "",
    type: isClientType(request.type) ? request.type : "",
    status,
    page: 1,
    view: isClientView(request.view) ? request.view : "",
    stage,
  };
}

export async function exportLeads(request: LeadExportRequest): Promise<ActionResult<LeadExportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") {
    return { ok: false, message: "Doar administratorul poate exporta leaduri." };
  }

  const query = readRequest(request);

  let listed: Awaited<ReturnType<typeof listClientRowsForExport>>;
  try {
    listed = await listClientRowsForExport(query, IMPORT_MAX_ROWS);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Exportul a eșuat." };
  }
  const { rows, total, withLeaduri } = listed;

  const supabase = await createClient();
  const withNextAction = await hasClientNextAction(supabase);
  const ids = rows.map((r) => r.id);

  const columns = [
    "id",
    "email",
    "fiscal_code",
    "address",
    "notes",
    ...(withLeaduri ? ["interest", "source", "owner_id"] : []),
  ].join(",");

  const details = new Map<string, DetailRow>();
  const contactOf = new Map<string, { name: string; primary: boolean }>();

  for (const part of chunks(ids, ID_CHUNK)) {
    const { data, error } = await supabase.from("clients").select(columns).in("id", part);
    if (error) return { ok: false, message: `Nu s-au putut citi leadurile: ${error.message}` };
    for (const d of (data ?? []) as unknown as DetailRow[]) details.set(d.id, d);

    // PERSOANA DE CONTACT: cea principala, altfel prima adaugata. Importul creeaza
    // persoana principala, deci asta este ce se intoarce la reimport.
    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .select("client_id, name, is_primary, created_at")
      .in("client_id", part)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (contactError) {
      return { ok: false, message: `Nu s-au putut citi persoanele de contact: ${contactError.message}` };
    }
    for (const c of (contacts ?? []) as { client_id: string; name: string; is_primary: boolean }[]) {
      const had = contactOf.get(c.client_id);
      if (!had || (c.is_primary && !had.primary)) {
        contactOf.set(c.client_id, { name: c.name, primary: c.is_primary });
      }
    }
  }

  const ownerName = new Map((await listClientOwnerChoices()).map((o) => [o.id, o.fullName]));

  const leads: ExportLeadRow[] = rows.map((r) => {
    const d = details.get(r.id);
    const type = isClientType(r.type) ? r.type : "company";
    const source = d?.source;
    const nextActionDate = withNextAction && r.next_action_at ? new Date(r.next_action_at).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".") : "";
    return {
      name: r.name,
      type: CLIENT_TYPE_LABEL[type],
      phone: r.phone ?? "",
      email: d?.email ?? "",
      contactName: contactOf.get(r.id)?.name ?? "",
      interest: d?.interest ?? "",
      source: isClientSource(source) ? CLIENT_SOURCE_LABEL[source] : "",
      ownerName: d?.owner_id ? (ownerName.get(d.owner_id) ?? "") : "",
      stage: isClientStage(r.stage) ? CLIENT_STAGE_LABEL[r.stage] : "",
      followUpDate: r.follow_up_date ?? "",
      nextAction: withNextAction ? (r.next_action ?? "") : "",
      nextActionDate,
      notes: d?.notes ?? "",
      address: d?.address ?? "",
      fiscalCode: d?.fiscal_code ?? "",
    };
  });

  const truncated = total > rows.length;
  return {
    ok: true,
    value: {
      csv: leadExportCsv(leads),
      count: leads.length,
      total,
      truncated,
      notice: truncated ? exportTruncatedNotice(total) : null,
    },
  };
}
