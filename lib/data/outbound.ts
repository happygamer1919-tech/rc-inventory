import "server-only";

// Citirile iesirilor catre proiecte.
//
// Iesire catre santier, nu vanzare cu amanuntul: client, proiect, si materialele
// care pleaca acolo. Regula este a fazei 1 si nu se schimba.

import { createClient } from "@/lib/supabase/server";
import { isUnitCode, type UnitCode } from "./units";
import type { StatusEvent } from "./inbound-types";
import type { OutboundIssue, OutboundStatus } from "./outbound-types";
import { one } from "./row";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// project_id si relatia catre projects sunt adaugate de migratia 0017. Cat timp
// ea nu este aplicata, coloana nu exista, un select care o numeste intoarce
// 42703 si ecranul de comenzi cade cu 500, ceea ce s-a si intamplat pe
// 2026-08-31. Se cere doar ce exista.
// P3-04b: ONE SELECT LIST, because there is no longer a schema in which the old
// one would work. SELECT_BASE named client_name and project_name, which 0026
// drops, and it was only ever reached when hasPhase3Schema() said no. The wave 1
// migrations are applied, so that branch is unreachable AND unsafe: a select
// naming a dropped column returns 42703 and the screen answers 500, which is
// exactly the INC-05 shape.
const SELECT_ISSUE = `
  id, reference, issued_at, shipped_at, status,
  project_id,
  projects ( id, name, client_id, clients ( id, name ) ),
  outbound_lines (
    id, product_id, quantity, sale_price_mdl,
    products ( sku, name, unit )
  )
`;

async function issueSelect(): Promise<string> {
  return SELECT_ISSUE;
}

type LineRow = {
  id: string;
  product_id: string;
  quantity: unknown;
  sale_price_mdl: unknown;
  products: { sku: string; name: string; unit: string } | null;
};

type IssueRow = {
  id: string;
  reference: string;
  issued_at: string;
  shipped_at: string | null;
  status: string;
  project_id: string;
  projects?:
    | { id: string; name: string; client_id: string; clients: { id: string; name: string } | { id: string; name: string }[] | null }
    | { id: string; name: string; client_id: string; clients: { id: string; name: string } | { id: string; name: string }[] | null }[]
    | null;
  outbound_lines: LineRow[] | null;
};

/** Supabase tipizeaza o relatie ca obiect sau ca tablou dupa forma cheii
 *  straine, asa ca amandoua formele sunt acceptate in loc sa fie presupusa una. */
function toIssue(row: IssueRow, history: StatusEvent[] = []): OutboundIssue {
  const project = one(row.projects);
  const client = one(project?.clients ?? null);
  return {
    id: row.id,
    reference: row.reference,
    // P3-10: destinatia ca INREGISTRARE, ca sa se poata lega.
    //
    // P3-04b: THE NAMES COME FROM THE JOINED RECORDS AND NOWHERE ELSE. The text
    // columns are dropped, so there is no second representation left that could
    // disagree with the project. project_id is NOT NULL as of 0026, so the join
    // resolves for every row; the fallbacks below are for a project or client
    // row deleted out from under an issue, which the foreign keys refuse anyway.
    projectId: row.project_id,
    clientId: client?.id ?? null,
    clientName: client?.name ?? "Client necunoscut",
    projectName: project?.name ?? "Proiect necunoscut",
    issuedAt: row.issued_at,
    shippedAt: row.shipped_at,
    status: (row.status as OutboundStatus) ?? "awaiting_shipment",
    lines: (row.outbound_lines ?? []).map((l) => ({
      id: l.id,
      productId: l.product_id,
      productSku: l.products?.sku ?? "-",
      productName: l.products?.name ?? "Produs necunoscut",
      unit: isUnitCode(l.products?.unit) ? (l.products!.unit as UnitCode) : "pcs",
      quantity: toNumber(l.quantity),
      salePriceMdl: toNullableNumber(l.sale_price_mdl),
    })),
    history,
  };
}

export async function listOutboundIssues(): Promise<OutboundIssue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outbound_issues")
    .select(await issueSelect())
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Nu s-au putut citi ieșirile: ${error.message}`);
  return ((data ?? []) as unknown as IssueRow[]).map((row) => toIssue(row));
}

export async function getOutboundIssue(id: string): Promise<OutboundIssue | null> {
  const supabase = await createClient();
  const [{ data, error }, { data: history }] = await Promise.all([
    supabase.from("outbound_issues").select(await issueSelect()).eq("id", id).maybeSingle(),
    supabase
      .from("status_history")
      .select("id, from_status, to_status, note, created_at")
      .eq("entity_type", "outbound_issue")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (error) throw new Error(`Nu s-a putut citi ieșirea: ${error.message}`);
  if (!data) return null;

  const events: StatusEvent[] = (history ?? []).map((h) => ({
    id: h.id as string,
    fromStatus: (h.from_status as string | null) ?? null,
    toStatus: h.to_status as string,
    note: (h.note as string | null) ?? null,
    at: h.created_at as string,
  }));

  return toIssue(data as unknown as IssueRow, events);
}

/** Urmatoarea referinta de iesire, in formatul din faza 1: IES-AAAA-NNNN. */
export async function nextOutboundReference(): Promise<string> {
  const supabase = await createClient();
  const year = new Date().getUTCFullYear();
  const prefix = `IES-${year}-`;

  const { data } = await supabase
    .from("outbound_issues")
    .select("reference")
    .like("reference", `${prefix}%`)
    .order("reference", { ascending: false })
    .limit(1);

  const last = data?.[0]?.reference as string | undefined;
  const n = last ? Number(last.slice(prefix.length)) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

