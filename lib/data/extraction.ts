import "server-only";

// Citirile lanei de extragere: ce asteapta verificare si ce s-a extras.
//
// ECRANUL OPERATORULUI NU TRECE PRIN ENDPOINTUL DE CALLBACK. Acela este drumul
// masinii, cu secret partajat si cheie de service_role. Aici se citeste prin
// sesiunea operatorului, sub RLS, ca orice alt ecran.
//
// CE INSEAMNA "ASTEAPTA VERIFICARE", scris o singura data si folosit peste tot:
// o ciorna neconfirmata al carei order_id NU este id-ul unei comenzi existente.
// Motivul intreg este in antetul migratiei 0010. Pe scurt: o ciorna al carei
// order_id numeste deja o comanda vine din cealalta lane, unde operatorul a
// tastat comanda intai si a atasat documentul la ea. Comanda exista, deci nu
// mai e nimic de confirmat, si a o oferi spre confirmare ar produce un duplicat.

import { createClient } from "@/lib/supabase/server";
import { isDocumentSource } from "./extraction-types";
import type { ExtractionDraft, ExtractionErrorCode, ExtractionStatus } from "./extraction-types";

const DRAFT_COLUMNS =
  "order_id, document_path, document_filename, mime_type, size_bytes, status, error_code, reason, supplier_name, order_date, subtotal, vat_amount, document_total, prices_include_vat, vat_rate, currency, currency_raw, confidence, fired_at, callback_at, confirmed_at, confirmed_inbound_order_id";

const LINE_COLUMNS =
  "order_id, line_no, product_name, quantity, unit, unit_raw, unit_price, line_total, currency, currency_raw, category, category_raw, confidence";

/** numeric() peste PostgREST vine ca sir. null ramane null, mereu: contract 2.1. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type LineRow = Record<string, unknown>;

function mapLine(row: LineRow) {
  return {
    lineNo: Number(row.line_no),
    productName: String(row.product_name),
    quantity: num(row.quantity),
    unit: (row.unit as string | null) ?? null,
    unitRaw: (row.unit_raw as string | null) ?? null,
    unitPrice: num(row.unit_price),
    lineTotal: num(row.line_total),
    currency: (row.currency as string | null) ?? null,
    currencyRaw: (row.currency_raw as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    categoryRaw: (row.category_raw as string | null) ?? null,
    confidence: num(row.confidence),
  };
}

function mapDraft(row: Record<string, unknown>, lines: LineRow[]): ExtractionDraft {
  return {
    orderId: String(row.order_id),
    documentPath: String(row.document_path),
    documentFilename: String(row.document_filename),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    status: (row.status as ExtractionStatus | null) ?? null,
    errorCode: (row.error_code as ExtractionErrorCode | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    supplierName: (row.supplier_name as string | null) ?? null,
    orderDate: (row.order_date as string | null) ?? null,
    subtotal: num(row.subtotal),
    vatAmount: num(row.vat_amount),
    documentTotal: num(row.document_total),
    pricesIncludeVat: (row.prices_include_vat as boolean | null) ?? null,
    vatRate: num(row.vat_rate),
    currency: (row.currency as string | null) ?? null,
    currencyRaw: (row.currency_raw as string | null) ?? null,
    // EXT-15. null aici inseamna "extractorul nu a spus" SI "randul este de
    // dinaintea migratiei 0032". Amandoua se citesc ca `scan` de catre apelant,
    // prin effectiveSource, si niciuna nu este rescrisa aici intr-o afirmatie pe
    // care nimeni nu a facut-o.
    documentSource: isDocumentSource(row.document_source) ? row.document_source : null,
    confidence: num(row.confidence),
    firedAt: (row.fired_at as string | null) ?? null,
    callbackAt: (row.callback_at as string | null) ?? null,
    lines: lines.map(mapLine).sort((a, b) => a.lineNo - b.lineNo),
  };
}

/**
 * Ciornele care asteapta verificare, cea mai noua prima.
 *
 * Include starile failed si partial: exact ele sunt suprafata vizibila a
 * esecului. Un document cazut care nu apare in lista este un document care pare
 * ca se proceseaza la nesfarsit, si operatorul invata sa nu creada ecranul.
 */
export async function listReviewDrafts(): Promise<ExtractionDraft[]> {
  const supabase = await createClient();

  const { data: drafts } = await supabase
    .from("extraction_drafts")
    .select(DRAFT_COLUMNS)
    // confirmed_at, NU cheia straina. Vezi antetul migratiei 0011: pointerul
    // catre comanda poarta on delete set null, deci poate redeveni null, iar o
    // ciorna consumata ar reaparea aici si s-ar putea confirma a doua oara.
    // confirmed_at nu il scrie nimic altceva decat o confirmare.
    .is("confirmed_at", null)
    .order("fired_at", { ascending: false, nullsFirst: false });

  const rows = (drafts ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.order_id));

  // Ciornele din cealalta lane, unde comanda exista deja. Vezi antetul.
  const { data: existingOrders } = await supabase
    .from("inbound_orders")
    .select("id")
    .in("id", ids);
  const taken = new Set((existingOrders ?? []).map((o) => String((o as { id: string }).id)));

  const pending = rows.filter((r) => !taken.has(String(r.order_id)));
  if (pending.length === 0) return [];

  const { data: lines } = await supabase
    .from("extraction_draft_lines")
    .select(LINE_COLUMNS)
    .in("order_id", pending.map((r) => String(r.order_id)));

  const byOrder = new Map<string, LineRow[]>();
  for (const l of (lines ?? []) as LineRow[]) {
    const key = String(l.order_id);
    const bucket = byOrder.get(key);
    if (bucket) bucket.push(l);
    else byOrder.set(key, [l]);
  }

  return pending.map((r) => mapDraft(r, byOrder.get(String(r.order_id)) ?? []));
}

