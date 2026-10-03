// P3-125. O SINGURA DEFINITIE A LUI "UN PRODUS S-A MISCAT".
//
// UNITATEA ESTE FIXATA DE PRODUS dupa prima miscare (CONTEXT.md, hotarat). Definitia
// statea inline in updateProduct din product-actions.ts: un produs s-a miscat cand
// il refera cel putin un lot, o linie de comanda sau o linie de iesire. Importul de
// materiale are nevoie de ACEEASI intrebare, iar o a doua definitie ar fi doua
// moduri de a spune cand o unitate se poate schimba. De aceea ea sta aici, si
// updateProduct o citeste de aici.

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Adevarat cand produsul este referit de un lot, o linie de comanda sau o linie
 *  de iesire. Cele trei numaratori se cer deodata. */
export async function productHasMovements(supabase: Supabase, productId: string): Promise<boolean> {
  const [{ count: batchCount }, { count: orderLineCount }, { count: outboundCount }] =
    await Promise.all([
      supabase.from("batches").select("id", { count: "exact", head: true }).eq("product_id", productId),
      supabase.from("order_lines").select("id", { count: "exact", head: true }).eq("product_id", productId),
      supabase
        .from("outbound_lines")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId),
    ]);
  return (batchCount ?? 0) + (orderLineCount ?? 0) + (outboundCount ?? 0) > 0;
}
