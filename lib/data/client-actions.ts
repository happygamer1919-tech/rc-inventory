"use server";

// Scrierile clientilor, cardul P3-06.
//
// APARARE PE DOUA NIVELURI, ca la catalog. Verificarea de rol de aici este a
// doua, nu prima: politicile din migratia 0013 refuza deja o scriere venita de
// la account_manager, la nivel de baza de date. Verificarea din cod exista ca sa
// intoarca un mesaj romanesc inteligibil in loc de o eroare Postgres.
//
// P3-06 spune ca ecranul nu are voie sa ofere un buton pe care baza il va
// refuza: un formular care nu salveaza nimic este defectul, nu politica. De
// aceea managerul de cont nu vede formularul deloc, si aceste functii sunt a
// doua plasa de siguranta si nu prima.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { isClientType } from "./clients-types";
import type { ActionResult } from "./inbound-types";

export type ClientInput = {
  name: string;
  type: string;
  fiscalCode: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
};

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate modifica clienții.",
};

function validate(
  input: ClientInput,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string; field: string } {
  const name = input.name.trim();
  if (name.length === 0)
    return { ok: false, message: "Denumirea este obligatorie.", field: "name" };

  if (!isClientType(input.type))
    return { ok: false, message: "Alege tipul clientului.", field: "type" };

  // IDNO GOL INSEAMNA NULL, NU SIRUL VID, si asta nu este cosmetica. Indexul
  // unic din migratia 0013 este PARTIAL, pe randurile cu fiscal_code not null.
  // Doua persoane fizice salvate cu "" ar fi doua randuri cu aceeasi valoare si
  // s-ar ciocni; salvate cu null nu se ciocnesc, ceea ce este intreg motivul
  // pentru care indexul este partial.
  const fiscalCode = input.fiscalCode.trim();

  return {
    ok: true,
    value: {
      name,
      type: input.type,
      fiscal_code: fiscalCode.length > 0 ? fiscalCode : null,
      address: input.address.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      notes: input.notes.trim() || null,
      active: input.active,
    },
  };
}

/** Traduce codul masinal in propozitia romaneasca pe care o vede operatorul. */
function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505")
    return {
      ok: false,
      message: "Există deja un client cu acest IDNO.",
      field: "fiscalCode",
    };
  if (code === "42501") return OWNER_ONLY;
  return { ok: false, message: `Salvarea a eșuat. ${message}` };
}

export async function createClientRecord(
  input: ClientInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert(checked.value)
    .select("id")
    .single();

  if (error || !data) return translateWriteError(error?.code, error?.message ?? "");

  revalidatePath("/clienti");
  return { ok: true, value: { id: data.id as string } };
}

export async function updateClientRecord(
  id: string,
  input: ClientInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(checked.value).eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/clienti");
  revalidatePath(`/clienti/${id}`);
  return { ok: true, value: { id } };
}
