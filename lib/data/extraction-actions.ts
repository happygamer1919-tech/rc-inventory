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
import { EXTRACTION_NOT_STARTED, effectiveSource } from "./extraction-types";
import { countPages } from "./page-count.mjs";
import {
  hasExtractionCancel,
  hasExtractionDocumentSource,
  hasExtractionUploadPageCount,
  hasSupplierDocumentRef,
} from "./schema-capability";
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
  /** EXT-11. Referinta documentului FURNIZORULUI, asa cum a corectat-o
   *  operatorul pe ecran. Amandoua sunt siruri, si un sir gol inseamna "nu are",
   *  fiindca asta trimite un `input` necompletat. */
  orderRef: string;
  orderRefSeries: string;
  lines: ReviewedLine[];
};

function translate(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505") return { ok: false, message: "Există deja o comandă cu această referință. Încearcă din nou." };
  if (code === "42501") return { ok: false, message: "Nu ai dreptul să faci această operațiune." };
  if (code === "P0001" || code === "P0002") return { ok: false, message };
  return { ok: false, message: `Operațiunea a eșuat. ${message}` };
}

/** P3-84. Refuzul confirmarii si al retrimiterii pentru un document la care s-a
 *  renuntat. O singura propozitie, folosita de amandoua pazele. */
const CANCELLED_REFUSAL = "S-a renunțat la acest document. Nu mai poate fi confirmat sau retrimis.";

/** P3-84. Cat poate avea motivul scris la renuntare. */
const CANCEL_REASON_MAX = 200;

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

  // EXT-28. PAGINILE SE NUMARA AICI, DIN BYTES-II PE CARE II TINEM DEJA. Acesta
  // este singurul moment in care aplicatia are fisierul in mana: retrimiterea
  // citeste numai randul, deci numarul ajunge pe rand prin fireExtraction.
  const pageCount = countPages(await file.arrayBuffer(), file.type);

  // Trimiterea nu poate rasturna incarcarea. Motivul unui esec ajunge pe randul
  // de ciorna si se vede pe ecran, care este exact ce cere clauza 4.
  //
  // P3-85, constatarea F21. Dar un esec NU mai intoarce ok: pana la acest card
  // omul vedea o incarcare reusita si nu afla ca nu s-a citit nimic. Documentul
  // ramane pastrat si randul ramane scris; rezultatul spune asta prin `saved`.
  const fired = await fireExtraction({
    orderId,
    documentPath: path,
    documentFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    pageCount,
  });

  if (!fired.ok) {
    // EXT-28. Codul refuzului nostru vine din rezultat. Orice alt esec ramane
    // download_failed, exact ca pana la acest card.
    await supabase
      .from("extraction_drafts")
      .update({
        status: "failed",
        error_code: fired.errorCode ?? "download_failed",
        reason: fired.reason,
      })
      .eq("order_id", orderId);
    revalidatePath("/incarca-comanda");
    return { ok: false, message: `${EXTRACTION_NOT_STARTED}${fired.reason}`, saved: { orderId } };
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
  // EXT-28. NUMARUL NOSTRU DE PAGINI SE CITESTE DE PE RAND, fiindca retrimiterea
  // nu tine bytes-ii documentului. Coloana se cere numai daca exista, din motivul
  // lui hasExtractionUploadPageCount; fara ea numarul este null, adica
  // necunoscut, iar un numar necunoscut nu refuza nimic.
  //
  // UN `string` LARG SI NU UN LITERAL CONDITIONAL, din motivul scris la
  // draftColumnsFor in lib/data/extraction.ts: parserul de tipuri al lui
  // supabase-js renunta pe o uniune de literale.
  const baseColumns: string = (await hasExtractionUploadPageCount(supabase))
    ? "order_id, document_path, document_filename, mime_type, size_bytes, confirmed_at, upload_page_count"
    : "order_id, document_path, document_filename, mime_type, size_bytes, confirmed_at";
  // P3-84. cancelled_at se cere numai daca exista, din motivul lui
  // hasExtractionCancel. Fara coloana nicio ciorna nu poate fi renuntata.
  const columns: string = (await hasExtractionCancel(supabase)) ? `${baseColumns}, cancelled_at` : baseColumns;
  const { data } = await supabase
    .from("extraction_drafts")
    .select(columns)
    .eq("order_id", orderId)
    .maybeSingle();
  const draft = data as Record<string, unknown> | null;

  if (!draft) return { ok: false, message: "Documentul nu mai există." };
  // confirmed_at, NU cheia straina catre comanda: aceea poarta on delete set
  // null si poate redeveni null, iar o ciorna consumata ar redeveni retrimisa.
  // Antetul migratiei 0011 poarta motivul intreg.
  if (draft.confirmed_at) return { ok: false, message: "Ciorna a fost deja confirmată." };
  // P3-84, constatarea F20. UN DOCUMENT LA CARE S-A RENUNTAT NU SE MAI TRIMITE.
  // Ecranul nu ofera butonul, dar o actiune de server este o cale de executie de
  // sine statatoare, deci paza este aici, citita din baza.
  if (draft.cancelled_at) return { ok: false, message: CANCELLED_REFUSAL };

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

  const storedPages = draft.upload_page_count;
  const fired = await fireExtraction({
    orderId,
    documentPath: String(draft.document_path),
    documentFilename: String(draft.document_filename),
    mimeType: String(draft.mime_type),
    sizeBytes: Number(draft.size_bytes),
    // EXT-28. Numarul stocat la incarcare, sau null. Refuzul de la 100 de pagini
    // se reaplica inauntrul fireExtraction, deci butonul de retrimitere nu il
    // poate ocoli.
    pageCount: Number.isInteger(storedPages) && (storedPages as number) >= 1 ? (storedPages as number) : null,
  });

  if (!fired.ok) {
    await supabase
      .from("extraction_drafts")
      .update({
        status: "failed",
        error_code: fired.errorCode ?? "download_failed",
        reason: fired.reason,
      })
      .eq("order_id", orderId);
    revalidatePath("/incarca-comanda");
    return { ok: false, message: fired.reason };
  }

  revalidatePath("/incarca-comanda");
  return { ok: true, value: { orderId } };
}

/* -------------------------------------------------------- renuntarea -- */

/**
 * P3-84, constatarea F20. Documentul iese din coada, iar randul RAMANE.
 *
 * Pana la acest card o ciorna de test sau gresita statea pe ecranul de
 * verificare pana cand cineva ii stergea randul in productie, iar asta este
 * blocat pe proprietar. Conventia pentru inregistrari, anulat si niciodata
 * sters (P2-07, P2-13, hotararea R-009), este forma folosita aici.
 *
 * SE SCRIU NUMAI CELE TREI COLOANE DIN 0056, intr-o singura scriere. Nu se
 * sterge nimic: nici randul, nici liniile, nici fisierul din bucket. status si
 * error_code raman cum erau, ca sa se vada si dupa renuntare ce se citise.
 *
 * NUMAI PROPRIETARUL, ACTIV. getSessionUser intoarce un utilizator numai pentru
 * un profil activ. Politica de scriere de pe extraction_drafts este "to
 * authenticated using (true)", deci regula de rol traieste aici si nu in baza.
 *
 * IDEMPOTENT. O a doua renuntare la acelasi document raspunde ok si NU rescrie
 * cine si cand: prima renuntare este faptul.
 */
export async function cancelExtractionDraft(
  orderId: string,
  reason: string,
): Promise<ActionResult<{ orderId: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return { ok: false, message: "Nu ai dreptul să renunți la un document." };

  const supabase = await createClient();
  if (!(await hasExtractionCancel(supabase)))
    return { ok: false, message: "Renunțarea la documente nu este încă activă." };

  const { data } = await supabase
    .from("extraction_drafts")
    .select("order_id, confirmed_at, cancelled_at")
    .eq("order_id", orderId)
    .maybeSingle();
  const draft = data as { confirmed_at: unknown; cancelled_at: unknown } | null;

  if (!draft) return { ok: false, message: "Documentul nu mai există." };
  if (draft.confirmed_at)
    return { ok: false, message: "Documentul a fost deja confirmat și nu mai poate fi abandonat." };
  if (draft.cancelled_at) return { ok: true, value: { orderId } };

  const trimmed = (typeof reason === "string" ? reason : "").trim().slice(0, CANCEL_REASON_MAX);

  // PAZA ESTE SI IN SCRIERE, NU NUMAI IN CITIREA DE MAI SUS. O confirmare sau o
  // alta renuntare intre citire si scriere face ca scrierea sa nu potriveasca
  // niciun rand, in loc sa suprascrie ce s-a intamplat intre timp.
  const { data: written, error } = await supabase
    .from("extraction_drafts")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancel_reason: trimmed.length === 0 ? null : trimmed,
    })
    .eq("order_id", orderId)
    .is("cancelled_at", null)
    .is("confirmed_at", null)
    .select("order_id");
  if (error) return translate(error.code, error.message);

  if ((written ?? []).length === 0) {
    // Nimic potrivit: intre citire si scriere documentul a fost confirmat sau
    // renuntat de altcineva. Se spune care dintre ele, citit din nou din baza.
    const { data: now } = await supabase
      .from("extraction_drafts")
      .select("confirmed_at, cancelled_at")
      .eq("order_id", orderId)
      .maybeSingle();
    const after = now as { confirmed_at: unknown; cancelled_at: unknown } | null;
    if (after?.cancelled_at) return { ok: true, value: { orderId } };
    if (after?.confirmed_at)
      return { ok: false, message: "Documentul a fost deja confirmat și nu mai poate fi abandonat." };
    return { ok: false, message: "Documentul nu mai există." };
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

  // P3-84, constatarea F20. UN DOCUMENT LA CARE S-A RENUNTAT NU SE CONFIRMA.
  //
  // Aceeasi doctrina ca paza EXT-15 de mai jos: ecranul nu mai arata ciorna in
  // coada, dar actiunea poate fi chemata direct. Starea se citeste din baza, nu
  // din ce a trimis apelantul, si inaintea oricarei validari de camp, ca un
  // formular ramas deschis sa primeasca refuzul adevarat si nu o eroare de camp.
  const supabase = await createClient();
  if (await hasExtractionCancel(supabase)) {
    const { data: row } = await supabase
      .from("extraction_drafts")
      .select("cancelled_at")
      .eq("order_id", orderId)
      .maybeSingle();
    if ((row as { cancelled_at?: unknown } | null)?.cancelled_at) {
      return { ok: false, message: CANCELLED_REFUSAL };
    }
  }

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

  // EXT-11. REFERINTA FURNIZORULUI SE MUTA PE COMANDA CREATA.
  //
  // PRINTR-UN UPDATE SI NU PRIN RPC, deliberat. confirm_extraction_draft este o
  // functie SQL cu semnatura fixa, iar a-i adauga doi parametri inseamna a o
  // inlocui intr-o migratie: o functie nu se modifica, se recreeaza. Cardul cere
  // coloanele, nu o semnatura noua, si o schimbare de semnatura ar fi purtat
  // riscul ei propriu pe calea prin care intra FIECARE document.
  //
  // POARTA ESTE ACEEASI CA PE CALEA DE CALLBACK, si pentru acelasi motiv: cat
  // timp 0036 nu este aplicata, coloanele nu exista si un update care le numeste
  // primeste 42703. Aici insa comanda ESTE DEJA CREATA, deci un esec al acestui
  // update nu are voie sa desfaca confirmarea: referinta furnizorului este o
  // informatie in plus pe o comanda reala, si a refuza comanda fiindca ea nu a
  // putut fi scrisa ar pierde livrarea ca sa salveze eticheta ei.
  const orderRef = input.orderRef.trim();
  const orderRefSeries = input.orderRefSeries.trim();
  if (await hasSupplierDocumentRef(supabase)) {
    await supabase
      .from("inbound_orders")
      .update({
        order_ref: orderRef.length === 0 ? null : orderRef,
        order_ref_series: orderRefSeries.length === 0 ? null : orderRefSeries,
      })
      .eq("id", String(data));
  }

  revalidatePath("/comenzi");
  revalidatePath("/inventar");
  revalidatePath("/incarca-comanda");
  return { ok: true, value: { id: String(data), reference, flagged } };
}
