import "server-only";

// Citirile iesirilor catre proiecte.
//
// Iesire catre santier, nu vanzare cu amanuntul: client, proiect, si materialele
// care pleaca acolo. Regula este a fazei 1 si nu se schimba.

import { createClient } from "@/lib/supabase/server";
import { hasPhase3Schema } from "./schema-capability";
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
const SELECT_BASE = `
  id, reference, client_name, project_name, issued_at, shipped_at, status,
  outbound_lines (
    id, product_id, quantity, sale_price_mdl,
    products ( sku, name, unit )
  )
`;

const SELECT_WITH_PROJECT = `
  id, reference, client_name, project_name, issued_at, shipped_at, status,
  project_id,
  projects ( id, name, client_id, clients ( id, name ) ),
  outbound_lines (
    id, product_id, quantity, sale_price_mdl,
    products ( sku, name, unit )
  )
`;

async function issueSelect(): Promise<string> {
  return (await hasPhase3Schema()) ? SELECT_WITH_PROJECT : SELECT_BASE;
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
  client_name: string;
  project_name: string;
  issued_at: string;
  shipped_at: string | null;
  status: string;
  project_id?: string | null;
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
    // P3-10: destinatia ca INREGISTRARE, ca sa se poata lega. Null cat timp
    // randul istoric nu a fost inca reconciliat, si ecranul scrie atunci
    // "Proiect neasociat" ca text simplu si nu ca legatura moarta.
    projectId: row.project_id ?? null,
    clientId: client?.id ?? null,
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

/** Numele de clienti si proiecte deja folosite, pentru destinatia LIBERA.
 *
 *  STEARSA DE P3-04 SI READUSA PE 2026-08-31, si ambele decizii sunt corecte.
 *  P3-04 a inlocuit destinatia text cu un selector de proiect si a sters aceasta
 *  functie pentru ca nu mai avea apelant. Migratiile fazei 3 nu au fost insa
 *  aplicate, deci pe productie NU EXISTA niciun proiect din care sa se aleaga,
 *  si ecranul de iesiri a ramas fara nicio cale de a crea un bon.
 *
 *  Aceasta este calea de rezerva si NUMAI atat: se foloseste doar cand
 *  hasPhase3Schema() spune nu. Din clipa aplicarii, selectorul de proiect este
 *  singura cale, iar functia aceasta nu mai are apelant din nou. */
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
