import "server-only";

// Citirea alertelor trimise, pentru ecranul de memento.
//
// Un rand din reminders exista pentru un produs de la prima verificare a lui.
// Alerta este randul care a incercat macar o data sa trimita: last_fired_at nu
// este null. Randurile doar armate nu sunt alerte, sunt starea de asteptare.

import { createClient } from "@/lib/supabase/server";
import { isUnitCode, type UnitCode } from "./units";
import type { FiredAlert } from "@/lib/reminders/types";

type Row = {
  id: string;
  product_id: string;
  last_fired_at: string;
  last_stock_at_fire: number | string | null;
  last_threshold_at_fire: number | string | null;
  last_send_error: string | null;
  products: { sku: string; name: string; unit: string } | null;
};

function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listFiredAlerts(): Promise<FiredAlert[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reminders")
    .select(
      "id, product_id, last_fired_at, last_stock_at_fire, last_threshold_at_fire, last_send_error, products(sku, name, unit)",
    )
    .not("last_fired_at", "is", null)
    .order("last_fired_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as Row[]).map((r) => {
    const unit = r.products?.unit;
    return {
      id: r.id,
      productId: r.product_id,
      sku: r.products?.sku ?? "-",
      name: r.products?.name ?? "-",
      unit: (isUnitCode(unit) ? unit : "pcs") as UnitCode,
      firedAt: r.last_fired_at,
      stockAtFire: toNumber(r.last_stock_at_fire),
      thresholdAtFire: toNumber(r.last_threshold_at_fire),
      sendError: r.last_send_error,
    };
  });
}
