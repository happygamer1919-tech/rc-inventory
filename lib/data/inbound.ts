import "server-only";

// Citirile comenzilor de intrare.
//
// Statusurile sunt stocate ca tokenuri englezesti (pending_arrival, arrived) si
// afisate romaneste. Aceeasi regula ca la unitati: o valoare de enum nu este
// text de interfata. Etichetele sunt exact sirurile din faza 1.

import { createClient } from "@/lib/supabase/server";
import { isUnitCode, type UnitCode } from "./units";
import type { Currency, InboundOrder, InboundStatus, StatusEvent } from "./inbound-types";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const SELECT = `
  id, reference, supplier_name, currency, total_mdl, ordered_at, expected_at,
  arrived_at, status, document_path, document_uploaded_at,
  order_lines (
    id, product_id, quantity, unit_price,
    products ( sku, name, unit )
  )
`;

type LineRow = {
  id: string;
  product_id: string;
  quantity: unknown;
  unit_price: unknown;
  products: { sku: string; name: string; unit: string } | null;
};

type OrderRow = {
  id: string;
  reference: string;
  supplier_name: string | null;
  currency: string;
  total_mdl: unknown;
  ordered_at: string | null;
  expected_at: string | null;
  arrived_at: string | null;
  status: string;
  document_path: string | null;
  document_uploaded_at: string | null;
  order_lines: LineRow[] | null;
};

function toOrder(row: OrderRow, history: StatusEvent[] = []): InboundOrder {
  return {
    id: row.id,
    reference: row.reference,
    supplierName: row.supplier_name,
    currency: (row.currency as Currency) ?? "EUR",
    totalMdl: toNumber(row.total_mdl),
    orderedAt: row.ordered_at,
    expectedAt: row.expected_at,
    arrivedAt: row.arrived_at,
    status: (row.status as InboundStatus) ?? "pending_arrival",
    documentPath: row.document_path,
    documentUploadedAt: row.document_uploaded_at,
    lines: (row.order_lines ?? []).map((l) => ({
      id: l.id,
      productId: l.product_id,
      productSku: l.products?.sku ?? "-",
      productName: l.products?.name ?? "Produs necunoscut",
      unit: isUnitCode(l.products?.unit) ? (l.products!.unit as UnitCode) : "pcs",
      quantity: toNumber(l.quantity),
      unitPrice: toNullableNumber(l.unit_price),
    })),
    history,
  };
}

export async function listInboundOrders(): Promise<InboundOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_orders")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Nu s-au putut citi comenzile de intrare: ${error.message}`);
  return ((data ?? []) as unknown as OrderRow[]).map((row) => toOrder(row));
}

export async function getInboundOrder(id: string): Promise<InboundOrder | null> {
  const supabase = await createClient();
  const [{ data, error }, { data: history }] = await Promise.all([
    supabase.from("inbound_orders").select(SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("status_history")
      .select("id, from_status, to_status, note, created_at")
      .eq("entity_type", "inbound_order")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (error) throw new Error(`Nu s-a putut citi comanda: ${error.message}`);
  if (!data) return null;

  const events: StatusEvent[] = (history ?? []).map((h) => ({
    id: h.id as string,
    fromStatus: (h.from_status as string | null) ?? null,
    toStatus: h.to_status as string,
    note: (h.note as string | null) ?? null,
    at: h.created_at as string,
  }));

  return toOrder(data as unknown as OrderRow, events);
}

/**
 * Urmatoarea referinta de comanda, in formatul din faza 1: INT-AAAA-NNNN.
 *
 * Se calculeaza din cea mai mare referinta existenta a anului curent. Doi
 * operatori care creeaza o comanda in aceeasi secunda pot primi acelasi numar,
 * iar constrangerea unica de pe reference va respinge pe al doilea cu un mesaj
 * romanesc. Un contor in baza ar fi mai bun si este o carte separata, nu o
 * coloana strecurata aici.
 */
export async function nextInboundReference(): Promise<string> {
  const supabase = await createClient();
  const year = new Date().getUTCFullYear();
  const prefix = `INT-${year}-`;

  const { data } = await supabase
    .from("inbound_orders")
    .select("reference")
    .like("reference", `${prefix}%`)
    .order("reference", { ascending: false })
    .limit(1);

  const last = data?.[0]?.reference as string | undefined;
  const n = last ? Number(last.slice(prefix.length)) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}
