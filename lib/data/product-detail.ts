"use server";

// Detaliul unui produs, incarcat la deschiderea panoului lateral.
//
// Se incarca la cerere, nu odata cu tot catalogul: loturile si miscarile tuturor
// produselor ar fi o interogare care creste cu depozitul, ca sa umple un panou
// pe care operatorul il deschide pentru un singur rand.

import { listProductBatches, listProductMovements } from "./products";
import type { ProductBatch, ProductMovement } from "./products";
import { getSessionUser } from "@/lib/supabase/server";

export type ProductDetail = {
  batches: ProductBatch[];
  movements: ProductMovement[];
};

export async function loadProductDetail(productId: string): Promise<ProductDetail> {
  // Sesiunea este ceruta si aici: o server action este un capat de retea, nu o
  // functie interna, si poate fi apelata direct.
  const user = await getSessionUser();
  if (!user) return { batches: [], movements: [] };

  const [batches, movements] = await Promise.all([
    listProductBatches(productId),
    listProductMovements(productId),
  ]);
  return { batches, movements };
}
