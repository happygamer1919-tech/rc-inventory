"use server";

// Detaliul unei comenzi de intrare, incarcat la deschiderea panoului: pozitiile,
// istoricul stărilor si loturile create la receptie.

import { getInboundOrder } from "./inbound";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import type { InboundBatch, InboundDetail } from "./inbound-types";

export async function loadInboundDetail(orderId: string): Promise<InboundDetail> {
  // O server action este un capat de retea, nu o functie interna.
  const user = await getSessionUser();
  if (!user) return { order: null, batches: [] };

  const supabase = await createClient();
  const [order, { data }] = await Promise.all([
    getInboundOrder(orderId),
    supabase
      .from("batches")
      .select("id, quantity, arrived_at, products(sku, name)")
      .eq("inbound_order_id", orderId)
      .order("arrived_at", { ascending: false }),
  ]);

  const batches: InboundBatch[] = (data ?? []).map((row) => {
    const product = row.products as unknown as { sku: string; name: string } | null;
    return {
      id: row.id as string,
      productSku: product?.sku ?? "-",
      productName: product?.name ?? "Produs necunoscut",
      quantity: Number(row.quantity) || 0,
      arrivedAt: row.arrived_at as string,
    };
  });

  return { order, batches };
}
