"use server";

// Scrierile contactelor, cardul P3-08.
//
// CREAREA SI MODIFICAREA STAU IN FILA, NU PE UN ECRAN SEPARAT. Un contact are
// cinci campuri si o ruta proprie ar fi ceremonie.
//
// Aceeasi aparare pe doua niveluri: politicile din 0014 sunt owner-only.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./inbound-types";

export type ContactInput = {
  clientId: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notes: string;
  active: boolean;
};

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate modifica contactele.",
};

function validate(
  input: ContactInput,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string; field: string } {
  if (!input.clientId.trim())
    return { ok: false, message: "Contactul trebuie să aparțină unui client.", field: "clientId" };
  const name = input.name.trim();
  if (name.length === 0)
    return { ok: false, message: "Numele este obligatoriu.", field: "name" };

  return {
    ok: true,
    value: {
      client_id: input.clientId,
      name,
      // ROLUL RAMANE TEXT LIBER, cu sugestii in interfata. P3-02 petrece un
      // paragraf pe de ce: un rol este o descriere a unei persoane, nimic nu se
      // leaga de el, si vocabularul real de pe un santier este mai lung decat
      // orice enum scris dinainte.
      role: input.role.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      is_primary: input.isPrimary,
      notes: input.notes.trim() || null,
      active: input.active,
    },
  };
}

function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  // 23505 pe aceasta tabela poate fi UN SINGUR lucru: indexul partial
  // contacts_one_primary_per_client. Nu exista alta constrangere unica pe ea.
  if (code === "23505")
    return {
      ok: false,
      message:
        "Clientul are deja un contact principal. Debifează-l pe cel vechi înainte, sau salvează acesta ca secundar.",
      field: "isPrimary",
    };
  if (code === "42501") return OWNER_ONLY;
  return { ok: false, message: `Salvarea a eșuat. ${message}` };
}

export async function createContact(input: ContactInput): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert(checked.value)
    .select("id")
    .single();
  if (error || !data) return translateWriteError(error?.code, error?.message ?? "");

  revalidatePath(`/clienti/${input.clientId}`);
  return { ok: true, value: { id: data.id as string } };
}

export async function updateContact(
  id: string,
  input: ContactInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { error } = await supabase.from("contacts").update(checked.value).eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath(`/clienti/${input.clientId}`);
  return { ok: true, value: { id } };
}
