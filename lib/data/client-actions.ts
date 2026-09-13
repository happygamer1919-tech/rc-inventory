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
//
// P3-45. FORMULARUL DE LEAD NU ARE O CALE A LUI. Creeaza clientul prin
// createClientRecord, largit cu sursa, interesul si responsabilul, iar persoana de
// contact prin createContact, care exista deja. O a doua actiune care insereaza in
// public.clients este exact ce cardul refuza.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasClientLeaduri, hasClientStage } from "./schema-capability";
import { createContact } from "./contact-actions";
import {
  FOLLOW_UP_DATE_REQUIRED,
  isClientSource,
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
  /** `YYYY-MM-DD` sau sirul vid. Obligatorie la etapa De reluat. */
  followUpDate?: string;
  /** P3-45. Campurile formularului de lead. Lipsa inseamna "formularul nu le
   *  trimite", ca la etapa, si nu "sterge-le". */
  source?: string;
  interest?: string;
  ownerId?: string;
  /** Persoana de contact. Devine un rand in public.contacts, nu o coloana. */
  contactName?: string;
  /** P3-45. Etapa aleasa se inregistreaza ca PRIMA, de la nicio etapa, chiar si
   *  cand este `cold`. Numai formularul de lead il trimite: formularul de client
   *  nu scrie istoric la creare, si cazurile P3-43 afirma asta. */
  firstStage?: boolean;
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
  if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, message: "Data de reluare nu este o dată validă.", field: "followUpDate" };

  // ACEEASI PROPOZITIE CA LA CONSTRANGERE. clients_follow_up_date_required din
  // 0039 este garantia; aceasta este propozitia romaneasca, spusa inainte ca
  // baza sa aiba ce refuza.
  if (input.stage === "follow_up" && date === "")
    return { ok: false, message: FOLLOW_UP_DATE_REQUIRED, field: "followUpDate" };

  // P3-45. O DATA SCRISA SE PASTREAZA LA ORICE ETAPA. Formularul de lead cere data
  // de reluare la orice etapa, iar lista Leaduri sorteaza dupa ea, fiindca o data
  // pusa de cineva este tot o promisiune. O data lipsa se trimite null, iar functia
  // pastreaza data stocata: parasirea etapei De reluat nu sterge ce a scris cineva.
  return { ok: true, value: { stage: input.stage, followUpDate: date === "" ? null : date } };
}

/** P3-45. Sursa, interesul si responsabilul, numai cele pe care formularul le-a trimis. */
function validateLeaduri(
  input: ClientInput,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string; field: string } {
  const value: Record<string, unknown> = {};

  if (input.source !== undefined) {
    const source = input.source.trim();
    if (source !== "" && !isClientSource(source))
      return { ok: false, message: "Alege sursa din listă.", field: "source" };
    value.source = source === "" ? null : source;
  }

  if (input.interest !== undefined) value.interest = input.interest.trim() || null;

  if (input.ownerId !== undefined) {
    const ownerId = input.ownerId.trim();
    if (ownerId !== "" && !/^[0-9a-f-]{36}$/i.test(ownerId))
      return { ok: false, message: "Alege responsabilul din listă.", field: "ownerId" };
    value.owner_id = ownerId === "" ? null : ownerId;
  }

  return { ok: true, value };
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

/** Etapa si data, prin functia din migratia 0039, cu randul de istoric.
 *
 *  P3-45. `first` cere forma cu patru parametri din 0040, care inregistreaza etapa
 *  de la nicio etapa. Fara el se trimit exact cei trei parametri de pana acum: cele
 *  doua forme nu pot fi confundate, fiindca a patra nu are valoare implicita. */
async function writeStage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  choice: StageChoice,
  first = false,
): Promise<{ ok: true } | Refusal> {
  const { error } = await supabase.rpc("set_client_stage", {
    p_client_id: id,
    p_stage: choice.stage,
    p_follow_up_date: choice.followUpDate,
    ...(first ? { p_first: true } : {}),
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
  const leaduri = validateLeaduri(input);
  if (!leaduri.ok) return leaduri;

  const supabase = await createClient();

  // P3-45. COLOANELE DIN 0040 SE SCRIU NUMAI DACA EXISTA. In cele doua minute
  // dintre livrarea codului si aplicarea migratiei, un insert care le numeste ar
  // primi 42703 si niciun client nu s-ar mai putea crea.
  const leaduriAvailable =
    Object.keys(leaduri.value).length > 0 || input.firstStage === true
      ? await hasClientLeaduri(supabase)
      : false;

  const { data, error } = await supabase
    .from("clients")
    .insert(leaduriAvailable ? { ...checked.value, ...leaduri.value } : checked.value)
    .select("id")
    .single();

  if (error || !data) return translateWriteError(error?.code, error?.message ?? "");
  const id = data.id as string;

  // P3-43. RANDUL SE CREEAZA FARA ETAPA, deci `cold` din implicitul coloanei, iar
  // o alta etapa aleasa se pune prin functie, ca mutarea sa aiba randul ei de
  // istoric. `cold` ales nu este o mutare si nu scrie nimic.
  //
  // P3-45. FORMULARUL DE LEAD CERE PRIMA ETAPA, si atunci se scrie mereu, `cold`
  // inclus: randul de istoric spune ca leadul a intrat in lista, nu ca s-a mutat.
  if (stage.value && (await hasClientStage(supabase))) {
    const first = input.firstStage === true && leaduriAvailable;
    if (first || stage.value.stage !== "cold") {
      const moved = await writeStage(supabase, id, stage.value, first);
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
  }

  // P3-45. PERSOANA DE CONTACT ESTE UN RAND IN public.contacts, prin actiunea care
  // exista deja pe fila Contacte, si nu o coloana noua: un al doilea loc in care
  // sta numele unui contact este un al doilea loc de tinut la zi. Este contactul
  // principal, fiindca pe un client abia creat este singurul.
  const contactName = (input.contactName ?? "").trim();
  if (contactName !== "") {
    const contact = await createContact({
      clientId: id,
      name: contactName,
      role: "",
      phone: "",
      email: "",
      isPrimary: true,
      notes: "",
      active: true,
    });
    if (!contact.ok) {
      revalidatePath("/clienti");
      return {
        ok: false,
        message: `Clientul a fost creat, dar persoana de contact nu s-a salvat. Deschide-l din listă și adaug-o din fila Contacte. ${contact.message}`,
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
