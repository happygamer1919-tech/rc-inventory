"use server";

// P3-127. EXPORTUL CLIENTILOR: vederea curenta a listei, ca fisier CSV cu antetul
// modelului de import al clientilor.
//
// FILTRUL ESTE AL LISTEI, NU AL EXPORTULUI. Actiunea primeste filtrele cu care e desenata
// lista (cautare, tip, stare, vedere, etapa) si le trece prin `listClientRowsForExport`,
// adica prin aceleasi functii din baza ca ecranul. Pagina nu conteaza: se exporta toate
// randurile filtrului, pana la IMPORT_MAX_ROWS.
//
// EXPORTUL NU ARE PARERE DESPRE CEI DEZACTIVATI: `status` vine de pe ecran si ajunge
// neschimbat la lista. Pe Activi fisierul are activi, pe Inactivi si pe Toate are si
// dezactivatii, exact ca lista.
//
// NICIO CITIRE NOUA A LISTEI. Singurele citiri in plus sunt cele pe care ecranul le face
// deja pentru un singur rand (fisa clientului): coloanele pe care lista nu le intoarce
// (email, IDNO, adresa, note, interes, sursa, responsabil), citite pentru ID-urile
// randurilor deja alese de lista. Nu alege nimic, doar completeaza.
//
// NUMAI ADMINISTRATORUL, ca importul: fisierul este toata agenda de clienti dintr-o data.

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
import { IMPORT_MAX_ROWS } from "./client-import-types";
import {
  clientExportCsv,
  clientExportTruncatedNotice,
  type ExportClientRow,
} from "./client-export-types";

/** Ce trimite ecranul: filtrele listei, fara pagina. */
export type ClientExportRequest = Pick<ClientListQuery, "q" | "type" | "status" | "view" | "stage">;

export type ClientExportOutcome = {
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
function readRequest(request: ClientExportRequest): ClientListQuery {
  const status =
    request.status === "inactive" || request.status === "toate" ? request.status : "active";
  return {
    q: typeof request.q === "string" ? request.q.trim() : "",
    type: isClientType(request.type) ? request.type : "",
    status,
    page: 1,
    view: isClientView(request.view) ? request.view : "",
    stage: isClientStage(request.stage) ? request.stage : "",
  };
}

export async function exportClients(
  request: ClientExportRequest,
): Promise<ActionResult<ClientExportOutcome>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") {
    return { ok: false, message: "Doar administratorul poate exporta clienți." };
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
  for (const part of chunks(ids, ID_CHUNK)) {
    const { data, error } = await supabase.from("clients").select(columns).in("id", part);
    if (error) return { ok: false, message: `Nu s-au putut citi clienții: ${error.message}` };
    for (const d of (data ?? []) as unknown as DetailRow[]) details.set(d.id, d);
  }

  const ownerName = new Map((await listClientOwnerChoices()).map((o) => [o.id, o.fullName]));

  const clients: ExportClientRow[] = rows.map((r) => {
    const d = details.get(r.id);
    const type = isClientType(r.type) ? r.type : "company";
    const source = d?.source;
    const nextActionDate = withNextAction && r.next_action_at ? new Date(r.next_action_at).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".") : "";
    return {
      name: r.name,
      type: CLIENT_TYPE_LABEL[type],
      phone: r.phone ?? "",
      email: d?.email ?? "",
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
      csv: clientExportCsv(clients),
      count: clients.length,
      total,
      truncated,
      notice: truncated ? clientExportTruncatedNotice(total) : null,
    },
  };
}
