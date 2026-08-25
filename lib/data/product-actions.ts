"use server";

// Scrierile catalogului. Server actions, deci codul nu ajunge niciodata in
// browser si nu poate fi ocolit dintr-o consola.
//
// APARARE PE DOUA NIVELURI. Verificarea de rol de aici este a doua, nu prima:
// politicile RLS din migratia 0001 refuza deja o scriere venita de la
// account_manager, la nivel de baza de date. Verificarea din cod exista ca sa
// intoarca un mesaj romanesc inteligibil in loc de o eroare Postgres, nu ca sa
// tina locul politicii.
//
// ERORILE SUNT ROMANESTI SI LEGATE DE CAMP. Un mesaj brut de Postgres pe ecran
// este un defect, nu un detaliu.

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { isUnitCode } from "./units";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; field?: string };

const OWNER_ONLY: ActionResult = {
  ok: false,
  message: "Doar administratorul poate modifica catalogul.",
};

type ProductInput = {
  sku: string;
  name: string;
  categoryId: string;
  unit: string;
  threshold: string;
  unitValueMdl: string;
  supplierName: string;
};

/** Validare comuna. Intoarce fie valorile curate, fie primul camp gresit. */
function validate(input: ProductInput):
  | { ok: true; value: {
      sku: string;
      name: string;
      category_id: string;
      unit: string;
      threshold: number;
      unit_value_mdl: number;
      supplier_name: string | null;
    } }
  | { ok: false; message: string; field: string } {
  const sku = input.sku.trim();
  if (sku.length === 0) return { ok: false, message: "Codul SKU este obligatoriu.", field: "sku" };
  if (sku.length > 64) return { ok: false, message: "Codul SKU este prea lung.", field: "sku" };

  const name = input.name.trim();
  if (name.length === 0) return { ok: false, message: "Denumirea este obligatorie.", field: "name" };

  const categoryId = input.categoryId.trim();
  if (categoryId.length === 0)
    return { ok: false, message: "Alege o categorie.", field: "categoryId" };

  if (!isUnitCode(input.unit))
    return { ok: false, message: "Alege o unitate de măsură.", field: "unit" };

  const threshold = input.threshold.trim() === "" ? 0 : Number(input.threshold.replace(",", "."));
  if (!Number.isFinite(threshold) || threshold < 0)
    return { ok: false, message: "Pragul trebuie să fie un număr pozitiv.", field: "threshold" };

  const value =
    input.unitValueMdl.trim() === "" ? 0 : Number(input.unitValueMdl.replace(",", "."));
  if (!Number.isFinite(value) || value < 0)
    return { ok: false, message: "Valoarea unitară trebuie să fie un număr pozitiv.", field: "unitValueMdl" };

  const supplier = input.supplierName.trim();

  return {
    ok: true,
    value: {
      sku,
      name,
      category_id: categoryId,
      unit: input.unit,
      threshold,
      unit_value_mdl: value,
      supplier_name: supplier.length > 0 ? supplier : null,
    },
  };
}

/** Codul 23505 este incalcarea unei constrangeri unice. Aici, SKU-ul. */
function translateWriteError(code: string | undefined, message: string): ActionResult {
  if (code === "23505") {
    return { ok: false, message: "Există deja un produs cu acest cod SKU.", field: "sku" };
  }
  if (code === "23503") {
    return { ok: false, message: "Categoria aleasă nu mai există.", field: "categoryId" };
  }
  if (code === "42501") {
    return { ok: false, message: "Doar administratorul poate modifica catalogul." };
  }
  return { ok: false, message: `Salvarea a eșuat. ${message}` };
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert(checked.value);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/inventar");
  revalidatePath("/setari");
  return { ok: true };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();

  // UNITATEA ESTE FIXATA DE PRODUS. Odata ce exista un lot sau o linie care il
  // refera, schimbarea unitatii ar reinterpreta tacit fiecare cantitate stocata:
  // 40 de m2 ar deveni 40 de bucati fara ca nimic sa se schimbe pe ecran.
  const [{ count: batchCount }, { count: orderLineCount }, { count: outboundCount }] =
    await Promise.all([
      supabase.from("batches").select("id", { count: "exact", head: true }).eq("product_id", id),
      supabase.from("order_lines").select("id", { count: "exact", head: true }).eq("product_id", id),
      supabase
        .from("outbound_lines")
        .select("id", { count: "exact", head: true })
        .eq("product_id", id),
    ]);

  const referenced = (batchCount ?? 0) + (orderLineCount ?? 0) + (outboundCount ?? 0) > 0;

  if (referenced) {
    const { data: current } = await supabase
      .from("products")
      .select("unit")
      .eq("id", id)
      .single();
    if (current && current.unit !== checked.value.unit) {
      return {
        ok: false,
        field: "unit",
        message:
          "Unitatea nu mai poate fi schimbată: produsul are deja mișcări înregistrate în această unitate.",
      };
    }
  }

  const { error } = await supabase.from("products").update(checked.value).eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/inventar");
  revalidatePath("/setari");
  return { ok: true };
}

/**
 * Dezactivare si reactivare. NU EXISTA STERGERE.
 *
 * Migratia 0001 nu are politica de delete pe products, pentru niciun rol, iar
 * cheile straine sunt on delete restrict. Un produs referit de un lot istoric nu
 * poate dispărea fara sa faca istoricul de necitit.
 */
export async function setProductActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ active }).eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/inventar");
  return { ok: true };
}

/* ------------------------------------------------------------ categorii -- */

export async function createCategory(name: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const clean = name.trim();
  if (clean.length === 0)
    return { ok: false, message: "Denumirea categoriei este obligatorie.", field: "name" };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({ name: clean });
  if (error) {
    if (error.code === "23505")
      return { ok: false, message: "Există deja o categorie cu această denumire.", field: "name" };
    return translateWriteError(error.code, error.message);
  }

  revalidatePath("/setari");
  revalidatePath("/inventar");
  return { ok: true };
}

export async function renameCategory(id: string, name: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const clean = name.trim();
  if (clean.length === 0)
    return { ok: false, message: "Denumirea categoriei este obligatorie.", field: "name" };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ name: clean }).eq("id", id);
  if (error) {
    if (error.code === "23505")
      return { ok: false, message: "Există deja o categorie cu această denumire.", field: "name" };
    return translateWriteError(error.code, error.message);
  }

  revalidatePath("/setari");
  revalidatePath("/inventar");
  return { ok: true };
}
