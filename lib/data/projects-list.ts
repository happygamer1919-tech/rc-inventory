import "server-only";

// Citirile listei de proiecte, cardul P3-07.
//
// Aceleasi motive ca la clienti: filtrarea si paginarea se fac pe server, prin
// public.search_projects din migratia 0021, pentru ca plierea fara diacritice nu
// se poate exprima ca filtru PostgREST si pentru ca un ecran care aduce toata
// tabela merge pana in ziua in care nu mai merge.

import { createClient } from "@/lib/supabase/server";
import {
  ALL_STATUSES,
  LIVE_STATUSES,
  PROJECTS_PAGE_SIZE,
  type ProjectDetail,
  type ProjectListQuery,
  type ProjectRow,
  type StatusEvent,
} from "./projects-list-types";
import type { ProjectStatus } from "./projects-types";

export type ProjectListResult = {
  rows: ProjectRow[];
  total: number;
  page: number;
  pageCount: number;
};

function isStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (ALL_STATUSES as string[]).includes(value);
}

/** Filtrele din sirul de interogare, cu implicite sigure.
 *
 *  IMPLICITUL ESTE CELE PATRU STARI VII, nu toate sase. Un parametru necunoscut
 *  nu este o eroare de ecran: cineva a trimis o legatura veche, si ecranul revine
 *  la implicit in loc sa arate o pagina de eroare. */
export function parseProjectQuery(params: {
  q?: string;
  stare?: string;
  client?: string;
  pagina?: string;
}): ProjectListQuery {
  const page = Number(params.pagina);
  const raw = params.stare ?? "";

  let statuses: ProjectStatus[] = LIVE_STATUSES;
  let allStatuses = false;
  if (raw === "toate") {
    statuses = ALL_STATUSES;
    allStatuses = true;
  } else if (isStatus(raw)) {
    statuses = [raw];
  }

  return {
    q: (params.q ?? "").trim(),
    statuses,
    allStatuses,
    clientId: (params.client ?? "").trim(),
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

export async function listProjects(query: ProjectListQuery): Promise<ProjectListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_projects", {
    p_q: query.q,
    p_statuses: query.statuses,
    p_client_id: query.clientId === "" ? null : query.clientId,
    p_limit: PROJECTS_PAGE_SIZE,
    p_offset: (query.page - 1) * PROJECTS_PAGE_SIZE,
  });

  if (error) throw new Error(`Nu s-au putut citi proiectele: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    name: string;
    address: string | null;
    status: string;
    planned_end_date: string | null;
    budget_mdl: number | string | null;
    client_id: string;
    client_name: string;
    total_count: number | string;
  }[];

  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      status: isStatus(r.status) ? r.status : "lead",
      plannedEndDate: r.planned_end_date,
      // NULL SI ZERO SUNT DOUA FAPTE DIFERITE si ecranul spune care. Un buget
      // lipsa se randeaza "fara buget", nu 0.
      budgetMdl: r.budget_mdl === null ? null : Number(r.budget_mdl),
      clientId: r.client_id,
      clientName: r.client_name,
    })),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PROJECTS_PAGE_SIZE)),
  };
}

export async function getProject(id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select(
      "id, name, address, status, start_date, planned_end_date, budget_mdl, notes, active, created_at, client_id, clients ( id, name )",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const clientRaw = (data as { clients?: unknown }).clients;
  const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;

  return {
    id: data.id as string,
    name: data.name as string,
    address: (data.address as string | null) ?? null,
    status: isStatus(data.status) ? data.status : "lead",
    startDate: (data.start_date as string | null) ?? null,
    plannedEndDate: (data.planned_end_date as string | null) ?? null,
    budgetMdl: data.budget_mdl === null ? null : Number(data.budget_mdl),
    notes: (data.notes as string | null) ?? null,
    active: Boolean(data.active),
    createdAt: data.created_at as string,
    clientId: data.client_id as string,
    clientName: (client as { name?: string } | undefined)?.name ?? "",
  };
}

/** Istoricul de stari al unui proiect, cel mai nou primul. */
export async function getProjectHistory(id: string): Promise<StatusEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("project_status_history", { p_project_id: id });
  return ((data ?? []) as {
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
  }[]).map((r) => ({
    fromStatus: r.from_status,
    toStatus: r.to_status,
    note: r.note,
    createdAt: r.created_at,
  }));
}

/** Clientii, pentru filtrul si pentru selectorul din formular. */
export async function listClientOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name").eq("active", true);
  return (data ?? [])
    .map((r) => ({ id: r.id as string, name: r.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

export type ProjectIssueRow = {
  issueId: string | null;
  reference: string | null;
  issuedAt: string | null;
  status: string | null;
  lineCount: number;
  quantity: number;
  valueMdl: number;
};

export type ProjectMaterials = {
  rows: ProjectIssueRow[];
  total: ProjectIssueRow | null;
};

/** Consumul unui proiect: cele mai recente iesiri, cele mai noi primele.
 *
 *  FORMA DIFERA DELIBERAT DE CEA DE PE FISA CLIENTULUI. Fila clientului
 *  raspunde "ce foloseste beneficiarul acesta" si claseaza PRODUSE dupa
 *  cantitate; fila proiectului raspunde "ce a plecat catre santierul acesta si
 *  cand", deci listeaza IESIRI in ordinea timpului. Doua intrebari, doua forme;
 *  o singura forma nu ar raspunde bine la niciuna. */
export async function getProjectMaterials(projectId: string): Promise<ProjectMaterials> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("project_material_summary", {
    p_project_id: projectId,
    p_limit: 5,
  });

  const raw = (data ?? []) as {
    issue_id: string | null;
    reference: string | null;
    issued_at: string | null;
    status: string | null;
    line_count: number | string;
    quantity: number | string;
    value_mdl: number | string;
    row_kind: string;
  }[];

  const map = (r: (typeof raw)[number]): ProjectIssueRow => ({
    issueId: r.issue_id,
    reference: r.reference,
    issuedAt: r.issued_at,
    status: r.status,
    lineCount: Number(r.line_count) || 0,
    quantity: Number(r.quantity) || 0,
    valueMdl: Number(r.value_mdl) || 0,
  });

  const totalRow = raw.find((r) => r.row_kind === "total");
  return {
    rows: raw.filter((r) => r.row_kind === "row").map(map),
    total: totalRow ? map(totalRow) : null,
  };
}
