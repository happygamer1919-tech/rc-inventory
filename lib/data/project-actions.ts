"use server";

// Scrierile proiectelor, cardul P3-07.
//
// Aceeasi aparare pe doua niveluri ca la clienti: politicile din migratia 0016
// sunt owner-only si refuza scrierea la nivel de baza. Verificarea de aici
// intoarce un mesaj romanesc in loc de o eroare Postgres, si exista si pentru ca
// o server action este accesibila fara ecran.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { ALL_STATUSES } from "./projects-list-types";
import type { ProjectStatus } from "./projects-types";
import type { ActionResult } from "./inbound-types";
import { one } from "./row";

export type ProjectInput = {
  clientId: string;
  name: string;
  address: string;
  status: string;
  startDate: string;
  plannedEndDate: string;
  budgetMdl: string;
  notes: string;
  active: boolean;
};

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate modifica proiectele.",
};

function isStatus(v: string): v is ProjectStatus {
  return (ALL_STATUSES as string[]).includes(v);
}

function validate(
  input: ProjectInput,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string; field: string } {
  if (!input.clientId.trim())
    return { ok: false, message: "Alege clientul.", field: "clientId" };

  const name = input.name.trim();
  if (name.length === 0)
    return { ok: false, message: "Denumirea este obligatorie.", field: "name" };

  if (!isStatus(input.status))
    return { ok: false, message: "Alege starea proiectului.", field: "status" };

  const start = input.startDate.trim() || null;
  const end = input.plannedEndDate.trim() || null;

  // VERIFICAT SI AICI, NU DOAR IN BAZA. Constrangerea projects_dates_in_order
  // din 0016 este garantia; aceasta este propozitia romaneasca. Fara ea
  // operatorul ar vedea numele unei constrangeri pe ecran.
  if (start && end && end < start)
    return {
      ok: false,
      message: "Termenul estimat nu poate fi înaintea datei de început.",
      field: "plannedEndDate",
    };

  const budgetRaw = input.budgetMdl.trim().replace(",", ".");
  const budget = budgetRaw === "" ? null : Number(budgetRaw);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0))
    return { ok: false, message: "Bugetul trebuie să fie un număr pozitiv.", field: "budgetMdl" };

  return {
    ok: true,
    value: {
      client_id: input.clientId,
      name,
      address: input.address.trim() || null,
      status: input.status,
      start_date: start,
      planned_end_date: end,
      budget_mdl: budget,
      notes: input.notes.trim() || null,
      active: input.active,
    },
  };
}

function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505")
    return {
      ok: false,
      message: "Clientul are deja un proiect cu această denumire.",
      field: "name",
    };
  if (code === "23514")
    return {
      ok: false,
      message: "Termenul estimat nu poate fi înaintea datei de început.",
      field: "plannedEndDate",
    };
  if (code === "23503")
    return { ok: false, message: "Clientul ales nu mai există.", field: "clientId" };
  if (code === "42501") return OWNER_ONLY;
  return { ok: false, message: `Salvarea a eșuat. ${message}` };
}

export async function createProjectRecord(
  input: ProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert(checked.value)
    .select("id")
    .single();

  if (error || !data) return translateWriteError(error?.code, error?.message ?? "");

  revalidatePath("/proiecte");
  return { ok: true, value: { id: data.id as string } };
}

export async function updateProjectRecord(
  id: string,
  input: ProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  // STAREA NU SE SCHIMBA PE ACEASTA CALE. Un update direct ar muta coloana fara
  // sa scrie randul de istoric, ceea ce este exact defectul pe care comentariul
  // din 0001 il numeste. Formularul trimite starea curenta si aceasta o scoate
  // din setul de scriere; schimbarea de stare are propria actiune de mai jos.
  const { status: _status, ...withoutStatus } = checked.value as Record<string, unknown>;
  void _status;

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(withoutStatus).eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/proiecte");
  revalidatePath(`/proiecte/${id}`);
  return { ok: true, value: { id } };
}

/**
 * Schimbarea de stare, prin functia din migratia 0021.
 *
 * SCHIMBAREA SI RANDUL DE ISTORIC SUNT O SINGURA TRANZACTIE. Nu exista alta cale
 * din interfata catre projects.status, tocmai ca o stare care s-a mutat fara sa
 * lase urma sa fie imposibila de aici.
 */
export async function setProjectStatus(
  id: string,
  status: string,
  note: string,
): Promise<ActionResult<{ changed: boolean }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  if (!isStatus(status))
    return { ok: false, message: "Starea aleasă nu există.", field: "status" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_project_status", {
    p_project_id: id,
    p_status: status,
    p_note: note.trim() || null,
  });

  if (error) return translateWriteError(error.code, error.message);

  const row = one(data);
  revalidatePath("/proiecte");
  revalidatePath(`/proiecte/${id}`);
  return { ok: true, value: { changed: Boolean(row?.changed) } };
}
