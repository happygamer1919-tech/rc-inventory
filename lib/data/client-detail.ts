import "server-only";

// Citirile filelor de pe fisa clientului, cardul P3-08.

import { createClient } from "@/lib/supabase/server";
import type { UnitCode } from "./units";
import { isUnitCode } from "./units";
import type { ProjectStatus } from "./projects-types";

export type ClientContact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  active: boolean;
};

export type ClientProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  plannedEndDate: string | null;
  budgetMdl: number | null;
};

export type MaterialRow = {
  productId: string | null;
  sku: string | null;
  name: string | null;
  unit: UnitCode | null;
  quantity: number;
  valueMdl: number;
};

export type ClientMaterials = {
  rows: MaterialRow[];
  total: MaterialRow | null;
  /** Cate iesiri din sistem nu au inca niciun proiect, deci niciun client.
   *
   *  P3-08: un total care omite randuri in tacere este mai rau decat unul care
   *  recunoaste ca este partial, pentru ca primul este crezut. */
  unassignedIssues: number;
};

export async function listClientContacts(clientId: string): Promise<ClientContact[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, name, role, phone, email, is_primary, notes, active")
    .eq("client_id", clientId);

  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      role: (r.role as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      isPrimary: Boolean(r.is_primary),
      notes: (r.notes as string | null) ?? null,
      active: Boolean(r.active),
    }))
    // CONTACTUL PRINCIPAL PRIMUL, apoi alfabetic. Cine deschide fila cauta pe
    // cine sa sune, iar raspunsul implicit este contactul principal.
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "ro"),
    );
}

export async function listClientProjects(clientId: string): Promise<ClientProject[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, status, planned_end_date, budget_mdl")
    .eq("client_id", clientId)
    .eq("active", true);

  return (data ?? [])
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      status: r.status as ProjectStatus,
      plannedEndDate: (r.planned_end_date as string | null) ?? null,
      budgetMdl: r.budget_mdl === null ? null : Number(r.budget_mdl),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

/** Consumul de materiale al clientului, cel mult 5 randuri plus totalul. */
export async function getClientMaterials(clientId: string): Promise<ClientMaterials> {
  const supabase = await createClient();
  const [summary, unassigned] = await Promise.all([
    supabase.rpc("client_material_summary", { p_client_id: clientId, p_limit: 5 }),
    supabase.rpc("unassigned_issue_count"),
  ]);

  const raw = (summary.data ?? []) as {
    product_id: string | null;
    product_sku: string | null;
    product_name: string | null;
    unit: string | null;
    quantity: number | string;
    value_mdl: number | string;
    row_kind: string;
  }[];

  const map = (r: (typeof raw)[number]): MaterialRow => ({
    productId: r.product_id,
    sku: r.product_sku,
    name: r.product_name,
    unit: isUnitCode(r.unit) ? r.unit : null,
    quantity: Number(r.quantity) || 0,
    valueMdl: Number(r.value_mdl) || 0,
  });

  const totalRow = raw.find((r) => r.row_kind === "total");
  return {
    rows: raw.filter((r) => r.row_kind === "row").map(map),
    total: totalRow ? map(totalRow) : null,
    unassignedIssues: Number(unassigned.data) || 0,
  };
}
