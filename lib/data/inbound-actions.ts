"use server";

// Scrierile comenzilor de intrare, plus documentul atasat.
//
// Crearea si receptia trec prin functiile din migratia 0003, ca cele trei
// scrieri ale fiecareia sa fie o singura tranzactie. Peste PostgREST, trei
// apeluri separate inseamna trei tranzactii, iar o cadere intre ele lasa baza
// intr-o stare pe care aplicatia o crede imposibila.
//
// DOCUMENTELE NU SUNT NICIODATA PUBLICE. Se incarca in bucketul privat rc-docs
// si se citesc doar prin URL semnat, generat pe server, cu viata scurta.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { nextInboundReference } from "./inbound";
// Un fisier "use server" are voie sa exporte NUMAI functii async, deci
// constantele si tipurile stau in ./inbound-types si se importa de acolo.
import {
  ACCEPTED_MIME,
  DOCS_BUCKET,
  MAX_DOC_BYTES,
  type ActionResult,
  type NewOrderInput,
} from "./inbound-types";


function translateWriteError(code: string | undefined, message: string): ActionResult<never> {
  if (code === "23505") {
    return {
      ok: false,
      message: "Există deja o comandă cu această referință. Încearcă din nou.",
    };
  }
  if (code === "42501") {
    return { ok: false, message: "Nu ai dreptul să faci această operațiune." };
  }
  if (code === "P0001" || code === "P0002") {
    // Mesajele ridicate de functiile din 0003 sunt deja romanesti.
    return { ok: false, message };
  }
  return { ok: false, message: `Operațiunea a eșuat. ${message}` };
}

/* ------------------------------------------------------- creare comanda -- */

export async function createInboundOrder(
  input: NewOrderInput,
): Promise<ActionResult<{ id: string; reference: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const supplierName = input.supplierName.trim();
  if (supplierName.length === 0)
    return { ok: false, message: "Completează furnizorul.", field: "supplierName" };

  if (!["EUR", "RON", "MDL"].includes(input.currency))
    return { ok: false, message: "Alege moneda comenzii.", field: "currency" };

  if (input.expectedAt.trim().length === 0)
    return { ok: false, message: "Completează data estimată de livrare.", field: "expectedAt" };

  const lines = input.lines
    .map((l) => ({
      product_id: l.productId.trim(),
      quantity: Number(String(l.quantity).replace(",", ".")),
      unit_price:
        String(l.unitPrice).trim() === "" ? null : Number(String(l.unitPrice).replace(",", ".")),
    }))
    .filter((l) => l.product_id.length > 0 && Number.isFinite(l.quantity) && l.quantity > 0);

  if (lines.length === 0)
    return {
      ok: false,
      message: "Adaugă cel puțin o poziție cu produs și cantitate.",
      field: "lines",
    };

  if (lines.some((l) => l.unit_price !== null && (!Number.isFinite(l.unit_price) || l.unit_price < 0)))
    return { ok: false, message: "Prețul unitar trebuie să fie un număr pozitiv.", field: "lines" };

  const supabase = await createClient();

  // Valoarea in MDL nu este o conversie valutara: nu exista sursa de curs.
  // Se insumeaza valorile in MDL deja stocate pe fiecare produs din catalog,
  // exact ca in faza 1.
  const { data: products } = await supabase
    .from("products")
    .select("id, unit_value_mdl")
    .in("id", lines.map((l) => l.product_id));

  const valueById = new Map<string, number>();
  for (const p of products ?? []) valueById.set(p.id as string, Number(p.unit_value_mdl) || 0);
  const totalMdl = lines.reduce((s, l) => s + l.quantity * (valueById.get(l.product_id) ?? 0), 0);

  const reference = await nextInboundReference();

  const { data, error } = await supabase.rpc("create_inbound_order", {
    p_reference: reference,
    p_supplier_name: supplierName,
    p_currency: input.currency,
    p_ordered_at: input.orderedAt.trim() === "" ? null : input.orderedAt,
    p_expected_at: input.expectedAt,
    p_total_mdl: Math.round(totalMdl * 100) / 100,
    p_lines: lines,
  });

  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/comenzi");
  revalidatePath("/inventar");
  return { ok: true, value: { id: data as string, reference } };
}

/* ------------------------------------------------------------- receptie -- */

export async function receiveInboundOrder(
  orderId: string,
): Promise<ActionResult<{ createdBatches: number; alreadyArrived: boolean }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_inbound_order", { p_order_id: orderId });

  if (error) return translateWriteError(error.code, error.message);

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/comenzi");
  revalidatePath("/inventar");
  return {
    ok: true,
    value: {
      createdBatches: Number(row?.created_batches ?? 0),
      alreadyArrived: Boolean(row?.already_arrived),
    },
  };
}

/* ------------------------------------------------------------- document -- */

/**
 * Incarca documentul comenzii in bucketul privat.
 *
 * Calea este inbound/<order_id>/<nume fisier>, conform cardului. Numele este
 * curatat: un nume de fisier venit de la operator poate contine spatii,
 * diacritice si slash-uri, iar un slash ar muta obiectul in alt dosar.
 */
export async function uploadOrderDocument(
  orderId: string,
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: "Alege un fișier." };

  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number]))
    return { ok: false, message: "Se acceptă doar PDF, PNG sau JPG." };

  if (file.size > MAX_DOC_BYTES)
    return { ok: false, message: "Fișierul depășește 10 MB." };

  const safeName = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  const path = `inbound/${orderId}/${safeName || "document"}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError)
    return { ok: false, message: `Încărcarea a eșuat. ${uploadError.message}` };

  const { error } = await supabase
    .from("inbound_orders")
    .update({ document_path: path, document_uploaded_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/comenzi");
  return { ok: true, value: { path } };
}

/**
 * URL semnat, cu viata scurta, pentru un document.
 *
 * 15 minute: destul ca operatorul sa deschida fisierul, prea putin ca legatura
 * copiata dintr-un chat sa mai functioneze maine. Bucketul este privat, deci
 * fara acest URL nu exista alta cale de citire.
 */
export async function signedDocumentUrl(orderId: string): Promise<ActionResult<{ url: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("inbound_orders")
    .select("document_path")
    .eq("id", orderId)
    .maybeSingle();

  const path = order?.document_path as string | null | undefined;
  if (!path) return { ok: false, message: "Comanda nu are document atașat." };

  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(path, 60 * 15);

  if (error || !data?.signedUrl)
    return { ok: false, message: `Nu s-a putut genera legătura. ${error?.message ?? ""}`.trim() };

  return { ok: true, value: { url: data.signedUrl } };
}
