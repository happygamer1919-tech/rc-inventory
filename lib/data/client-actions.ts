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
//
// P3-43. ETAPA NU SE SCRIE NICIODATA PE CALEA GENERICA. Update-ul de mai jos nu
// numeste nici `stage` nici `follow_up_date`: o scriere directa ar muta etapa
// fara randul de istoric, exact defectul pe care comentariul din 0001 despre
// status_history il numeste. Etapa si data trec numai prin
// public.set_client_stage din migratia 0039, care le schimba impreuna cu randul
// de istoric intr-o singura tranzactie, la fel cum setProjectStatus trece prin
// set_project_status.
//
// TOTUL SE VERIFICA INAINTE DE PRIMA SCRIERE. Update-ul generic si functia de
// etapa sunt doua cereri, nu o tranzactie. De aceea regula De reluat se verifica
// aici inainte de oricare dintre ele: un formular refuzat lasa randul exact cum
// era, nu pe jumatate salvat.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientStage } from "./schema-capability";
import {
  FOLLOW_UP_DATE_REQUIRED,
  isClientStage,
  isClientType,
  type ClientStage,
} from "./clients-types";
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
  /** P3-43. Lipsa inseamna "nu atinge etapa": formularul nu o trimite cand
   *  coloana nu exista inca. La creare, un client fara etapa este `cold`, din
   *  implicitul coloanei. */
  stage?: string;
  /** `YYYY-MM-DD` sau sirul vid. Citita numai la etapa De reluat. */
  followUpDate?: string;
};

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate modifica clienții.",
};

type Refusal = { ok: false; message: string; field?: string };

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

type StageChoice = { stage: ClientStage; followUpDate: string | null };

/** Etapa aleasa, sau null cand formularul nu a trimis etapa deloc. */
function validateStage(
  input: ClientInput,
): { ok: true; value: StageChoice | null } | { ok: false; message: string; field: string } {
  if (input.stage === undefined) return { ok: true, value: null };
  if (!isClientStage(input.stage))
    return { ok: false, message: "Alege etapa clientului.", field: "stage" };

  const date = (input.followUpDate ?? "").trim();
  if (input.stage === "follow_up") {
    // ACEEASI PROPOZITIE CA LA CONSTRANGERE. clients_follow_up_date_required din
    // 0039 este garantia; aceasta este propozitia romaneasca, spusa inainte ca
    // baza sa aiba ce refuza.
    if (date === "") return { ok: false, message: FOLLOW_UP_DATE_REQUIRED, field: "followUpDate" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return { ok: false, message: "Data de reluare nu este o dată validă.", field: "followUpDate" };
    return { ok: true, value: { stage: input.stage, followUpDate: date } };
  }

  // IN AFARA ETAPEI DE RELUAT SE TRIMITE NULL, iar functia pastreaza data stocata.
  // Parasirea etapei De reluat nu sterge o data pe care a scris-o cineva.
  return { ok: true, value: { stage: input.stage, followUpDate: null } };
}

/** Traduce codul masinal in propozitia romaneasca pe care o vede operatorul. */
function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505")
    return {
      ok: false,
      message: "Există deja un client cu acest IDNO.",
      field: "fiscalCode",
    };
  // Singura constrangere de verificare de pe clients este cea din 0039.
  if (code === "23514")
    return { ok: false, message: FOLLOW_UP_DATE_REQUIRED, field: "followUpDate" };
  if (code === "P0002") return { ok: false, message: "Clientul nu mai există." };
  if (code === "42501") return OWNER_ONLY;
  return { ok: false, message: `Salvarea a eșuat. ${message}` };
}

/** Etapa si data, prin functia din migratia 0039, cu randul de istoric. */
async function writeStage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  choice: StageChoice,
): Promise<{ ok: true } | Refusal> {
  const { error } = await supabase.rpc("set_client_stage", {
    p_client_id: id,
    p_stage: choice.stage,
    p_follow_up_date: choice.followUpDate,
  });
  if (error) {
    const refused = translateWriteError(error.code, error.message);
    return refused.ok ? { ok: false, message: "Salvarea a eșuat." } : refused;
  }
  return { ok: true };
}

export async function createClientRecord(
  input: ClientInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;
  const stage = validateStage(input);
  if (!stage.ok) return stage;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert(checked.value)
    .select("id")
    .single();

  if (error || !data) return translateWriteError(error?.code, error?.message ?? "");
  const id = data.id as string;

  // P3-43. RANDUL SE CREEAZA FARA ETAPA, deci `cold` din implicitul coloanei, iar
  // o alta etapa aleasa se pune prin functie, ca mutarea sa aiba randul ei de
  // istoric. `cold` ales nu este o mutare si nu scrie nimic.
  if (stage.value && stage.value.stage !== "cold" && (await hasClientStage(supabase))) {
    const moved = await writeStage(supabase, id, stage.value);
    if (!moved.ok) {
      // Clientul EXISTA deja. Un mesaj care l-ar lasa pe operator sa apese din
      // nou "Salvează" ar crea un al doilea client, deci i se spune ce s-a
      // intamplat si unde il gaseste.
      revalidatePath("/clienti");
      return {
        ok: false,
        message: `Clientul a fost creat, dar etapa nu s-a salvat. Deschide-l din listă și alege etapa din nou. ${moved.message}`,
      };
    }
  }

  revalidatePath("/clienti");
  return { ok: true, value: { id } };
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
  const stage = validateStage(input);
  if (!stage.ok) return stage;

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(checked.value).eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  // Dupa update-ul generic si nu inainte: cel mai des refuz, IDNO-ul duplicat,
  // vine de acolo, si asa un refuz nu lasa in urma o etapa mutata.
  if (stage.value && (await hasClientStage(supabase))) {
    const moved = await writeStage(supabase, id, stage.value);
    if (!moved.ok) return moved;
  }

  revalidatePath("/clienti");
  revalidatePath(`/clienti/${id}`);
  return { ok: true, value: { id } };
}
