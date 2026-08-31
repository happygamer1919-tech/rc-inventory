"use server";

// Scrierile devizului, cardul P3-13b.
//
// PRETUL SE INGHEATA AICI SI NICAIERI ALTUNDEVA. addDevizLine citeste
// products.unit_value_mdl in momentul in care linia se creeaza si il SCRIE in
// deviz_lines.unit_price_mdl. Nu exista camp de pret in formular si nu exista
// cale prin care un pret ofertat sa fie retastat: o valoare pe care ecranul o
// poate suprascrie este o valoare implicita, nu un instantaneu, iar cele doua
// arata identic in ziua in care sunt scrise si diverg in tacere trei luni mai
// tarziu. Aceasta este exact distinctia pe care addendumul o numeste cu mana.
//
// APARARE PE DOUA NIVELURI, ca la proiecte si la clienti. Declansatoarele din
// migratia 0025 refuza orice scriere pe un deviz care nu mai este ciorna, si ele
// sunt garantia. Verificarile de aici exista ca sa intoarca o propozitie
// romaneasca in loc de un mesaj Postgres, si pentru ca o server action este
// accesibila si fara ecran.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./inbound-types";
import { DEVIZ_STATUS_LABEL, isDevizStatus, type DevizStatus } from "./deviz-types";

const OWNER_ONLY: ActionResult<never> = {
  ok: false,
  message: "Doar administratorul poate modifica devizele.",
};

const EXPIRED_SESSION: ActionResult<never> = {
  ok: false,
  message: "Sesiune expirată. Autentifică-te din nou.",
};

/** Refuzul care vine din baza de date, tradus.
 *
 *  restrict_violation este codul pe care il ridica deviz_lines_require_draft si
 *  devize_require_draft_to_edit din migratia 0025. Textul lor este englezesc si
 *  contine identificatori: nu ajunge pe ecran. */
function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505")
    return {
      ok: false,
      message: "Produsul este deja pe acest deviz. Modifică linia existentă în loc să adaugi una nouă.",
      field: "productId",
    };
  if (code === "23514")
    return { ok: false, message: "Cantitatea trebuie să fie mai mare decât zero.", field: "quantity" };
  if (code === "23503")
    return { ok: false, message: "Produsul sau devizul ales nu mai există.", field: "productId" };
  if (code === "2F003" || code === "P0001" || code?.toUpperCase() === "23P01")
    return { ok: false, message: "Devizul nu mai este ciornă. Creează o versiune nouă." };
  if (code === "42501") return OWNER_ONLY;
  if (message.includes("no longer a draft"))
    return { ok: false, message: "Devizul nu mai este ciornă. Creează o versiune nouă." };
  return { ok: false, message: `Salvarea a eșuat. ${message}` };
}

async function requireOwner(): Promise<ActionResult<never> | null> {
  const user = await getSessionUser();
  if (!user) return EXPIRED_SESSION;
  if (user.role !== "owner") return OWNER_ONLY;
  return null;
}

function refresh(projectId: string) {
  revalidatePath(`/proiecte/${projectId}`);
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type NewDevizInput = {
  projectId: string;
  name: string;
  marginPercent: string;
  validUntil: string;
  notes: string;
  /** Versiunea de la care se preia continutul, sau sirul gol pentru un deviz gol. */
  copyFromDevizId: string;
};

/**
 * O versiune noua pe un proiect.
 *
 * NUMARUL DE VERSIUNE ESTE max(version) + 1, CALCULAT AICI, pentru ca migratia
 * 0025 spune explicit ca nu are un default care sa il poata calcula. Constrangerea
 * devize_version_unique_per_project este ce transforma un raspuns gresit intr-o
 * eroare zgomotoasa in loc de doua randuri care pretind amandoua versiunea 1.
 *
 * PRELUAREA COPIAZA LINIILE CU PRETURILE LOR INGHETATE si NU reciteste catalogul.
 * O renegociere porneste de la ce a fost ofertat. Reevaluarea tacuta a fiecarei
 * linii pe versiunea 2 ar distruge exact comparatia pentru care exista
 * instantaneul.
 *
 * CREAREA UNEI VERSIUNI NU SCHIMBA STAREA CELEI ANTERIOARE. O versiune 1
 * Acceptat ramane Acceptat, iar "curent" se deduce din numarul de versiune.
 */
export async function createDeviz(input: NewDevizInput): Promise<ActionResult<{ id: string }>> {
  const denied = await requireOwner();
  if (denied) return denied;

  const margin = parseNumber(input.marginPercent) ?? 0;
  if (margin < 0)
    return { ok: false, message: "Adaosul nu poate fi negativ.", field: "marginPercent" };

  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("devize")
    .select("version")
    .eq("project_id", input.projectId)
    .order("version", { ascending: false })
    .limit(1);

  if (readError)
    return { ok: false, message: `Salvarea a eșuat. ${readError.message}` };

  const nextVersion = (existing?.[0]?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("devize")
    .insert({
      project_id: input.projectId,
      name: input.name.trim() || null,
      version: nextVersion,
      status: "draft",
      margin_percent: margin,
      valid_until: input.validUntil.trim() || null,
      notes: input.notes.trim() || null,
    })
    .select("id")
    .single();

  if (error) return translateWriteError(error.code, error.message);

  if (input.copyFromDevizId) {
    const { data: source, error: sourceError } = await supabase
      .from("deviz_lines")
      .select("product_id, quantity, unit_price_mdl, line_note, sort_order")
      .eq("deviz_id", input.copyFromDevizId);

    if (sourceError)
      return { ok: false, message: `Preluarea liniilor a eșuat. ${sourceError.message}` };

    if (source && source.length > 0) {
      const { error: copyError } = await supabase.from("deviz_lines").insert(
        source.map((line) => ({
          deviz_id: data.id,
          product_id: line.product_id,
          quantity: line.quantity,
          // PRETUL INGHETAT SE COPIAZA CA ATARE. Nu se reciteste din catalog.
          unit_price_mdl: line.unit_price_mdl,
          line_note: line.line_note,
          sort_order: line.sort_order,
        })),
      );
      if (copyError) return translateWriteError(copyError.code, copyError.message);
    }
  }

  refresh(input.projectId);
  return { ok: true, value: { id: data.id } };
}

export type NewDevizLineInput = {
  devizId: string;
  projectId: string;
  productId: string;
  quantity: string;
};

/**
 * O linie noua, cu pretul luat din catalog IN ACEST MOMENT si scris pe linie.
 *
 * Nu exista parametru de pret. Apelantul nu poate trimite unul.
 */
export async function addDevizLine(
  input: NewDevizLineInput,
): Promise<ActionResult<{ id: string; unitPriceMdl: number }>> {
  const denied = await requireOwner();
  if (denied) return denied;

  if (!input.productId.trim())
    return { ok: false, message: "Alege produsul.", field: "productId" };

  const quantity = parseNumber(input.quantity);
  if (quantity === null || quantity <= 0)
    return { ok: false, message: "Cantitatea trebuie să fie mai mare decât zero.", field: "quantity" };

  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("unit_value_mdl, active")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError)
    return { ok: false, message: `Salvarea a eșuat. ${productError.message}` };
  if (!product)
    return { ok: false, message: "Produsul ales nu mai există.", field: "productId" };

  const unitPrice = Number(product.unit_value_mdl ?? 0);

  const { data: last } = await supabase
    .from("deviz_lines")
    .select("sort_order")
    .eq("deviz_id", input.devizId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { data, error } = await supabase
    .from("deviz_lines")
    .insert({
      deviz_id: input.devizId,
      product_id: input.productId,
      quantity,
      unit_price_mdl: unitPrice,
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();

  if (error) return translateWriteError(error.code, error.message);

  refresh(input.projectId);
  return { ok: true, value: { id: data.id, unitPriceMdl: unitPrice } };
}

/** Cantitatea unei linii. PRETUL NU ESTE ATINS: nu este un parametru. */
export async function updateDevizLineQuantity(
  lineId: string,
  projectId: string,
  quantityRaw: string,
): Promise<ActionResult<null>> {
  const denied = await requireOwner();
  if (denied) return denied;

  const quantity = parseNumber(quantityRaw);
  if (quantity === null || quantity <= 0)
    return { ok: false, message: "Cantitatea trebuie să fie mai mare decât zero.", field: "quantity" };

  const supabase = await createClient();
  const { error } = await supabase.from("deviz_lines").update({ quantity }).eq("id", lineId);
  if (error) return translateWriteError(error.code, error.message);

  refresh(projectId);
  return { ok: true, value: null };
}

/**
 * Reevaluarea unei linii la pretul de azi.
 *
 * ESTE O ACTIUNE DELIBERATA PE LINIE si nu se intampla niciodata singura. Exista
 * pentru ca altfel un pret ofertat gresit ar fi de necorectat pe o ciorna, si
 * este singurul loc din care unit_price_mdl se rescrie.
 */
export async function repriceDevizLine(
  lineId: string,
  projectId: string,
): Promise<ActionResult<null>> {
  const denied = await requireOwner();
  if (denied) return denied;

  const supabase = await createClient();
  const { data: line, error: readError } = await supabase
    .from("deviz_lines")
    .select("product_id, products(unit_value_mdl)")
    .eq("id", lineId)
    .maybeSingle();

  if (readError) return { ok: false, message: `Salvarea a eșuat. ${readError.message}` };
  if (!line) return { ok: false, message: "Linia nu mai există." };

  const current = (line as unknown as { products: { unit_value_mdl: unknown } | null }).products;
  const { error } = await supabase
    .from("deviz_lines")
    .update({ unit_price_mdl: Number(current?.unit_value_mdl ?? 0) })
    .eq("id", lineId);

  if (error) return translateWriteError(error.code, error.message);

  refresh(projectId);
  return { ok: true, value: null };
}

export async function removeDevizLine(
  lineId: string,
  projectId: string,
): Promise<ActionResult<null>> {
  const denied = await requireOwner();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.from("deviz_lines").delete().eq("id", lineId);
  if (error) return translateWriteError(error.code, error.message);

  refresh(projectId);
  return { ok: true, value: null };
}

/**
 * Mutarea pe conducta.
 *
 * Este singurul lucru care ramane editabil dupa ciorna, si asa spune migratia
 * 0025: un deviz emis trebuie sa poata deveni acceptat, respins sau expirat.
 */
export async function setDevizStatus(
  devizId: string,
  projectId: string,
  status: string,
): Promise<ActionResult<null>> {
  const denied = await requireOwner();
  if (denied) return denied;

  if (!isDevizStatus(status)) return { ok: false, message: "Stare necunoscută.", field: "status" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("devize")
    .update({ status: status as DevizStatus })
    .eq("id", devizId);

  if (error) return translateWriteError(error.code, error.message);

  refresh(projectId);
  return { ok: true, value: null };
}

/** Antetul unei ciorne: denumire, adaos, valabilitate, note. */
export async function updateDevizHeader(
  devizId: string,
  projectId: string,
  input: { name: string; marginPercent: string; validUntil: string; notes: string },
): Promise<ActionResult<null>> {
  const denied = await requireOwner();
  if (denied) return denied;

  const margin = parseNumber(input.marginPercent) ?? 0;
  if (margin < 0)
    return { ok: false, message: "Adaosul nu poate fi negativ.", field: "marginPercent" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("devize")
    .update({
      name: input.name.trim() || null,
      margin_percent: margin,
      valid_until: input.validUntil.trim() || null,
      notes: input.notes.trim() || null,
    })
    .eq("id", devizId);

  if (error) return translateWriteError(error.code, error.message);

  refresh(projectId);
  return { ok: true, value: null };
}

/** Eticheta romaneasca a unei stari, pentru mesajele actiunilor. */
export async function devizStatusLabel(status: DevizStatus): Promise<string> {
  return DEVIZ_STATUS_LABEL[status];
}
