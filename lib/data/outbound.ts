import "server-only";

// Citirile iesirilor catre proiecte.
//
// Iesire catre santier, nu vanzare cu amanuntul: client, proiect, si materialele
// care pleaca acolo. Regula este a fazei 1 si nu se schimba.

import { createClient } from "@/lib/supabase/server";
import { isUnitCode, type UnitCode } from "./units";
import type { StatusEvent } from "./inbound-types";
import type { OutboundIssue, OutboundStatus } from "./outbound-types";

export type { OutboundIssue, OutboundLine, OutboundStatus } from "./outbound-types";
export { OUTBOUND_STATUS_LABEL } from "./outbound-types";

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

const SELECT = `
  id, reference, client_name, project_name, issued_at, shipped_at, status,
  outbound_lines (
    id, product_id, quantity, sale_price_mdl,
    products ( sku, name, unit )
  )
`;

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
  client_name: string;
  project_name: string;
  issued_at: string;
  shipped_at: string | null;
  status: string;
  outbound_lines: LineRow[] | null;
};

function toIssue(row: IssueRow, history: StatusEvent[] = []): OutboundIssue {
  return {
    id: row.id,
    reference: row.reference,
    clientName: row.client_name,
    projectName: row.project_name,
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
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Nu s-au putut citi ieșirile: ${error.message}`);
  return ((data ?? []) as unknown as IssueRow[]).map((row) => toIssue(row));
}

export async function getOutboundIssue(id: string): Promise<OutboundIssue | null> {
  const supabase = await createClient();
  const [{ data, error }, { data: history }] = await Promise.all([
    supabase.from("outbound_issues").select(SELECT).eq("id", id).maybeSingle(),
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

/** Numele de clienti si proiecte deja folosite, pentru alegerile din formular. */
export async function listClientsAndProjects(): Promise<{
  clients: string[];
  projects: string[];
}> {
  const supabase = await createClient();
  const { data } = await supabase.from("outbound_issues").select("client_name, project_name");
  const clients = new Set<string>();
  const projects = new Set<string>();
  for (const row of data ?? []) {
    const c = (row.client_name as string | null)?.trim();
    const p = (row.project_name as string | null)?.trim();
    if (c) clients.add(c);
    if (p) projects.add(p);
  }
  return {
    clients: [...clients].sort((a, b) => a.localeCompare(b, "ro")),
    projects: [...projects].sort((a, b) => a.localeCompare(b, "ro")),
  };
}
