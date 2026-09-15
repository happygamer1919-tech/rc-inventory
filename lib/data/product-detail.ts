"use server";

// Detaliul unui produs, incarcat la deschiderea panoului lateral.
//
// Se incarca la cerere, nu odata cu tot catalogul: loturile si miscarile tuturor
// produselor ar fi o interogare care creste cu depozitul, ca sa umple un panou
// pe care operatorul il deschide pentru un singur rand.

import { listProductBatches, listProductMovements } from "./products";
import type { ProductBatch, ProductMovement } from "./products";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hasProductImage } from "./schema-capability";
import { DOCS_BUCKET } from "./inbound-types";
import { toDocumentUrl } from "./document-url";

/**
 * P3-56. Imaginea produsului, asa cum o arata panoul.
 *
 *   inactive  migratia 0045 nu este aplicata: panoul nu arata blocul deloc
 *   none      produsul nu are imagine
 *   ready     legatura catre imagine
 *   failed    produsul are imagine, dar legatura nu s-a putut face
 */
export type ProductImageView =
  | { state: "inactive" }
  | { state: "none" }
  | { state: "ready"; url: string }
  | { state: "failed" };

export type ProductDetail = {
  batches: ProductBatch[];
  movements: ProductMovement[];
  image: ProductImageView;
};

/** Cat traieste legatura catre imagine, in secunde. Ca descarcarea documentelor. */
const IMAGE_LINK_SECONDS = 60 * 15;

/**
 * LEGATURA TRECE PRIN RUTA NOASTRA, /api/documents, nu direct la Supabase:
 * toDocumentUrl din document-url.ts rescrie legatura semnata, iar ruta serveste
 * orice obiect din rc-docs pe jetonul lui. Legatura este RELATIVA, fara origine,
 * fiindca imaginea se cere din aceeasi pagina a aplicatiei.
 */
async function productImage(productId: string): Promise<ProductImageView> {
  const supabase = await createClient();
  if (!(await hasProductImage(supabase))) return { state: "inactive" };

  const { data } = await supabase
    .from("products")
    .select("image_path")
    .eq("id", productId)
    .maybeSingle();
  const path = (data?.image_path as string | null | undefined) ?? null;
  if (!path) return { state: "none" };

  const { data: signed } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(path, IMAGE_LINK_SECONDS);
  const url = signed?.signedUrl ? toDocumentUrl(signed.signedUrl, "") : null;
  return url ? { state: "ready", url } : { state: "failed" };
}

export async function loadProductDetail(productId: string): Promise<ProductDetail> {
  // Sesiunea este ceruta si aici: o server action este un capat de retea, nu o
  // functie interna, si poate fi apelata direct.
  const user = await getSessionUser();
  if (!user) return { batches: [], movements: [], image: { state: "inactive" } };

  const [batches, movements, image] = await Promise.all([
    listProductBatches(productId),
    listProductMovements(productId),
    productImage(productId),
  ]);
  return { batches, movements, image };
}
