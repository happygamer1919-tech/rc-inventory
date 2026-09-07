"use server";

// Scrierile lanei de extragere: pornirea, retrimiterea si confirmarea.
//
// TREI REGULI DIN CARD, APLICATE AICI SI NU LASATE IN GRIJA ECRANULUI:
//
//   EDITAREA OPERATORULUI CASTIGA. Valoarea extrasa este o sugestie. Ce se
//   salveaza este ce este pe ecran la confirmare. O extragere care suprascrie
//   in tacere o corectura este mai rea decat lipsa extragerii.
//
//   UN NUME NEPOTRIVIT CREEAZA UN PRODUS MARCAT, cu needs_review, si NICIODATA
//   nu se lipeste pe un SKU asemanator. Comentariul coloanei din migratia 0001
//   spune exact asta.
//
//   CONFIRMAREA ESTE O SINGURA TRANZACTIE. Comanda, liniile, randul de istoric
//   si consumarea ciornei se intampla impreuna sau deloc, prin functia din
//   migratia 0010.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { fireExtraction } from "./extraction-fire";
import { nextInboundReference } from "./inbound";
import { ALL_UNITS } from "./units";
import { effectiveSource } from "./extraction-types";
import { hasExtractionDocumentSource } from "./schema-capability";
import { safeFileName } from "./row";
import { resolveSupplier } from "./suppliers";
import {
  ACCEPTED_MIME,
  DOCS_BUCKET,
  MAX_DOC_BYTES,
  type ActionResult,
} from "./inbound-types";

export type ReviewedLine = {
  /** Produsul ales de operator din catalog. Gol inseamna "nu exista inca". */
  productId: string;
  /** Numele de pe document, editabil. Devine produsul marcat cand nu s-a ales. */
  productName: string;
  quantity: string;
  unitPrice: string;
  unit: string;
  categoryId: string;
};

export type ReviewedDraft = {
  supplierName: string;
  currency: string;
  orderedAt: string;
  expectedAt: string;
  lines: ReviewedLine[];
};

function translate(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505") return { ok: false, message: "Există deja o comandă cu această referință. Încearcă din nou." };
  if (code === "42501") return { ok: false, message: "Nu ai dreptul să faci această operațiune." };
  if (code === "P0001" || code === "P0002") return { ok: false, message };
  return { ok: false, message: `Operațiunea a eșuat. ${message}` };
}

/* --------------------------------------------------------- pornirea -- */

/**
 * Un document intra in lane fara sa existe o comanda.
 *
 * order_id se bate AICI si este cheia de idempotenta a contractului, nu id-ul
 * unei comenzi: comanda se naste abia la confirmare. Vezi antetul migratiei
 * 0010, care asaza ambiguitatea lasata deschisa de 0008.
 */
export async function startExtraction(formData: FormData): Promise<ActionResult<{ orderId: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Alege un fișier." };
  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number]))
    return { ok: false, message: "Se acceptă doar PDF, PNG sau JPG." };
  if (file.size > MAX_DOC_BYTES) return { ok: false, message: "Fișierul depășește 10 MB." };

  const orderId = randomUUID();
  const path = `extractions/${orderId}/${safeFileName(file.name)}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { ok: false, message: `Încărcarea a eșuat. ${uploadError.message}` };

  // Trimiterea nu poate rasturna incarcarea. Motivul unui esec ajunge pe randul
  // de ciorna si se vede pe ecran, care este exact ce cere clauza 4.
  const fired = await fireExtraction({
    orderId,
    documentPath: path,
    documentFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (!fired.ok) {
    await supabase
      .from("extraction_drafts")
      .update({ status: "failed", error_code: "download_failed", reason: fired.reason })
      .eq("order_id", orderId);
  }

  revalidatePath("/incarca-comanda");
  return { ok: true, value: { orderId } };
}

/* ------------------------------------------------------ retrimiterea -- */

/**
 * Retrimite ACELASI document cu ACELASI order_id.
 *
 * Asta este ce face retrimiterea sigura: prin regula de idempotenta a
 * contractului (sectiunea 2.2) rezultatul INLOCUIESTE extragerea precedenta in
 * loc sa adauge a doua ciorna. Un order_id nou ar produce exact duplicatul pe
 * care cheia de idempotenta exista sa il previna.
 */
export async function refireExtraction(orderId: string): Promise<ActionResult<{ orderId: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("extraction_drafts")
    .select("order_id, document_path, document_filename, mime_type, size_bytes, confirmed_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!draft) return { ok: false, message: "Documentul nu mai există." };
  // confirmed_at, NU cheia straina catre comanda: aceea poarta on delete set
  // null si poate redeveni null, iar o ciorna consumata ar redeveni retrimisa.
  // Antetul migratiei 0011 poarta motivul intreg.
  if (draft.confirmed_at) return { ok: false, message: "Ciorna a fost deja confirmată." };

  // Starea se sterge inaintea retrimiterii, ca ecranul sa arate "in lucru" si
  // nu motivul vechi al unui esec pe care tocmai l-am reincercat.
  //
  // callback_at NU SE STERGE, si asta nu este o scapare.
  //
  // Ecranul citeste "in lucru" din status null, deci stergerea statusului este
  // tot ce ii trebuie. callback_at raspunde la cu totul alta intrebare: a mai
  // raspuns cineva vreodata pentru acest order_id? Receptorul din
  // app/api/extraction/callback/route.ts citeste exact acel camp ca sa aleaga
  // intre 202 acceptat si 200 duplicat, iar contractul defineste duplicatul pe
  // order_id, nu pe numarul de trimiteri.
  //
  // Sters aici, campul ar face receptorul sa raspunda 202 la a doua extragere a
  // aceluiasi document, adica sa spuna "prima data" despre o ciorna pe care o
  // INLOCUIESTE. Retrimiterea ar deveni singura cale prin care contorul de
  // idempotenta al contractului se poate reseta, si ar reseta-o tacut.
  await supabase
    .from("extraction_drafts")
    .update({ status: null, error_code: null, reason: null })
    .eq("order_id", orderId);

  const fired = await fireExtraction({
    orderId,
    documentPath: String(draft.document_path),
    documentFilename: String(draft.document_filename),
    mimeType: String(draft.mime_type),
    sizeBytes: Number(draft.size_bytes),
  });

  if (!fired.ok) {
    await supabase
      .from("extraction_drafts")
      .update({ status: "failed", error_code: "download_failed", reason: fired.reason })
      .eq("order_id", orderId);
    revalidatePath("/incarca-comanda");
    return { ok: false, message: fired.reason };
  }

  revalidatePath("/incarca-comanda");
  return { ok: true, value: { orderId } };
}

/* ------------------------------------------------------ confirmarea -- */

/** SKU pentru un produs marcat. Prefixul spune de unde a venit. */
function flaggedSku(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `EXT-${base || "PRODUS"}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function confirmExtractionDraft(
  orderId: string,
  input: ReviewedDraft,
): Promise<ActionResult<{ id: string; reference: string; flagged: number }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const supplierName = input.supplierName.trim();
  // undefined pana la prima folosire, ca un document fara produse noi sa nu creeze
  // un furnizor de care nu are nimeni nevoie.
  let supplierId: string | null | undefined = undefined;
  if (supplierName.length === 0)
    return { ok: false, message: "Completează furnizorul.", field: "supplierName" };
  if (!["EUR", "RON", "MDL"].includes(input.currency))
    return { ok: false, message: "Alege moneda comenzii.", field: "currency" };
  if (input.expectedAt.trim().length === 0)
    return { ok: false, message: "Completează data estimată de livrare.", field: "expectedAt" };

  const supabase = await createClient();

  // EXT-15. O SCANARE AL CAREI CONTINUT NU A FOST CITIT NU SE POATE INREGISTRA,
  // SI REFUZUL ESTE AICI SI NU NUMAI PE ECRAN.
  //
  // ExtractionReviewPanel se intoarce inainte de a randa formularul pentru o
  // astfel de ciorna, deci ecranul nu ofera calea. Dar o actiune de server este o
  // cale de executie de sine statatoare: oricine o poate chema, iar o paza
  // dovedita pe o singura cale de executie nu este o paza. Aceeasi doctrina pe
  // care o poarta EXT-16 despre reconciliere, aplicata unei margini in loc de
  // unui numar.
  //
  // SE CITESTE STAREA DIN BAZA, NU DIN CE A TRIMIS APELANTUL. Apelantul este
  // exact lucrul de care ne aparam aici.
  if (await hasExtractionDocumentSource(supabase)) {
    const { data: source } = await supabase
      .from("extraction_drafts")
      .select("status, document_source")
      .eq("order_id", orderId)
      .maybeSingle();
    const row = (source ?? {}) as { status?: unknown; document_source?: unknown };
    if (row.status === "failed" && effectiveSource(row.document_source) === "scan") {
      return {
        ok: false,
        message:
          "Conținutul acestui document nu a fost citit. Este o scanare fără linii verificate și nu poate fi înregistrată.",
      };
    }
  }

  const resolved: { product_id: string; quantity: number; unit_price: number | null }[] = [];
  let flagged = 0;

  for (const raw of input.lines) {
    const quantity = Number(String(raw.quantity).replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const unitPrice =
      String(raw.unitPrice).trim() === "" ? null : Number(String(raw.unitPrice).replace(",", "."));
    if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0))
      return { ok: false, message: "Prețul unitar trebuie să fie un număr pozitiv.", field: "lines" };

    let productId = raw.productId.trim();

    if (productId.length === 0) {
      // Nimic ales din catalog: se creeaza un produs MARCAT, cu numele de pe
      // document, verbatim. Nu se cauta un SKU asemanator si nu se lipeste pe
      // el, fiindca o potrivire aproximativa gresita mut stoc pe produsul
      // altcuiva si nimeni nu o observa.
      const name = raw.productName.trim();
      if (name.length === 0) continue;

      // CATEGORIA SI UNITATEA SE ALEG, NU SE GHICESC.
      //
      // Amandoua sunt NOT NULL pe products, deci ceva trebuie sa ajunga acolo,
      // si "ceva" era prima categorie activa si "pcs". Un produs asezat tacut
      // intr-o categorie reala arata exact ca unul asezat corect, iar o unitate
      // gresita reinterpreteaza fiecare cantitate stocata pe el pentru
      // totdeauna: coloana este fixata la prima referinta, prin P2-03.
      //
      // Contractul, sectiunea 4.4, spune acelasi lucru despre maparea
      // categoriei: se valideaza fata de randurile din categories prezente la
      // momentul extragerii, iar ce nu se mapeaza ramane null. category_raw si
      // unit_raw poarta oricum cuvintele documentului, deci nimic nu se pierde
      // cand maparea nu gaseste nimic; ce lipseste il alege operatorul, pe
      // ecran, o data.
      const categoryId = raw.categoryId.trim();
      if (!categoryId)
        return {
          ok: false,
          message: `Alege categoria pentru produsul nou "${name}".`,
          field: "lines",
        };

      const unit = raw.unit.trim();
      if (!ALL_UNITS.includes(unit as (typeof ALL_UNITS)[number]))
        return {
          ok: false,
          message: `Alege unitatea de măsură pentru produsul nou "${name}".`,
          field: "lines",
        };

      // Rezolvat o singura data pentru tot documentul: toate produsele noi dintr-o
      // confirmare vin de la acelasi furnizor, cel de pe ciorna.
      if (supplierId === undefined) {
        const resolved = await resolveSupplier(supplierName);
        if (!resolved.ok)
          return { ok: false, message: resolved.message, field: "supplierName" };
        supplierId = resolved.value.supplier_id;
      }

      const { data: created, error: createError } = await supabase
        .from("products")
        .insert({
          sku: flaggedSku(name),
          name,
          category_id: categoryId,
          unit,
          threshold: 0,
          unit_value_mdl: 0,
          // P3-05b: products.supplier_name nu mai exista. Furnizorul documentului
          // se rezolva la o INREGISTRARE, prin acelasi resolveSupplier pe care il
          // foloseste si formularul de catalog, ca doua cai care creeaza produse
          // sa nu ajunga la doi furnizori diferiti pentru acelasi nume.
          supplier_id: supplierId,
          needs_review: true,
        })
        .select("id")
        .single();

      if (createError) return translate(createError.code, createError.message);
      productId = String(created.id);
      flagged += 1;
    }

    resolved.push({ product_id: productId, quantity, unit_price: unitPrice });
  }

  if (resolved.length === 0)
    return { ok: false, message: "Adaugă cel puțin o poziție cu produs și cantitate.", field: "lines" };

  // Valoarea in MDL, la fel ca la comanda manuala: suma valorilor unitare deja
  // stocate pe produse. Nu exista sursa de curs valutar, deci nu se converteste.
  const { data: products } = await supabase
    .from("products")
    .select("id, unit_value_mdl")
    .in("id", resolved.map((l) => l.product_id));
  const valueById = new Map<string, number>();
  for (const p of products ?? []) valueById.set(String(p.id), Number(p.unit_value_mdl) || 0);
  const totalMdl = resolved.reduce((s, l) => s + l.quantity * (valueById.get(l.product_id) ?? 0), 0);

  const reference = await nextInboundReference();

  const { data, error } = await supabase.rpc("confirm_extraction_draft", {
    p_order_id: orderId,
    p_reference: reference,
    p_supplier_name: supplierName,
    p_currency: input.currency,
    p_ordered_at: input.orderedAt.trim() === "" ? null : input.orderedAt,
    p_expected_at: input.expectedAt,
    p_total_mdl: Math.round(totalMdl * 100) / 100,
    p_lines: resolved,
  });

  if (error) return translate(error.code, error.message);

  revalidatePath("/comenzi");
  revalidatePath("/inventar");
  revalidatePath("/incarca-comanda");
  return { ok: true, value: { id: String(data), reference, flagged } };
}
