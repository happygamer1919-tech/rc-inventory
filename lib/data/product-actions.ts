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
import { looksLikeUuid } from "./suppliers-types";
import { resolveSupplier } from "./suppliers";
import { hasProductPackaging } from "./schema-capability";

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
  /** P3-05: fie un ID de furnizor, fie un nume nou. Vezi looksLikeUuid. */
  supplier: string;
  /** EXT-10: ce factureaza furnizorul. Gol inseamna "fara ambalaj". */
  packageUnit: string;
  /** EXT-10: cate unitati de stoc incap intr-un ambalaj. */
  packageFactor: string;
};

/** EXT-10. Perechea de ambalaj, curatata, sau primul camp gresit.
 *
 *  AMANDOUA SAU NICIUNA, si asta este si constrangerea din migratia 0035. Un
 *  ambalaj fara factor inseamna un furnizor care factureaza pe palet si nimic cu
 *  ce sa converteasca, iar un factor fara ambalaj este un numar care nu
 *  converteste nimic. Mesajul spune care jumatate lipseste, nu ca "ceva" este
 *  gresit.
 *
 *  UN SIR GOL DEVINE NULL SI NU AJUNGE NICIODATA IN BAZA. Constrangerea intreaba
 *  daca ambalajul este PREZENT, iar un sir gol este prezent pentru SQL si absent
 *  pentru oricine citeste ecranul. Diferenta se rezolva aici, o data. */
function validatePackage(input: ProductInput):
  | { ok: true; value: { package_unit: string | null; package_factor: number | null } }
  | { ok: false; message: string; field: string } {
  const unit = input.packageUnit.trim();
  const rawFactor = input.packageFactor.trim();

  if (unit.length === 0 && rawFactor.length === 0) {
    return { ok: true, value: { package_unit: null, package_factor: null } };
  }

  if (unit.length === 0) {
    return {
      ok: false,
      field: "packageUnit",
      message: "Scrie ambalajul furnizorului sau șterge factorul: un factor fără ambalaj nu convertește nimic.",
    };
  }
  if (unit.length > 32) {
    return { ok: false, field: "packageUnit", message: "Ambalajul este prea lung.", };
  }
  if (rawFactor.length === 0) {
    return {
      ok: false,
      field: "packageFactor",
      message: "Scrie câte unități de stoc încap într-un ambalaj.",
    };
  }

  const factor = Number(rawFactor.replace(",", "."));
  if (!Number.isFinite(factor) || factor <= 0) {
    return {
      ok: false,
      field: "packageFactor",
      message: "Factorul de ambalaj trebuie să fie un număr mai mare decât zero.",
    };
  }

  return { ok: true, value: { package_unit: unit, package_factor: factor } };
}

/** Validare comuna. Intoarce fie valorile curate, fie primul camp gresit. */
function validate(input: ProductInput):
  | { ok: true; value: {
      sku: string;
      name: string;
      category_id: string;
      unit: string;
      threshold: number;
      unit_value_mdl: number;
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

  return {
    ok: true,
    value: {
      sku,
      name,
      category_id: categoryId,
      unit: input.unit,
      threshold,
      unit_value_mdl: value,
      // supplier_id se rezolva separat, in resolveSupplier,
      // pentru ca poate fi nevoie de o SCRIERE (un furnizor nou) si validarea
      // nu are voie sa scrie nimic.
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

/**
 * EXT-10. Ce se scrie in coloanele de ambalaj, si daca se scrie ceva.
 *
 * MIGRATIA 0035 AJUNGE IN PRODUCTIE PE FUZIUNE, iar livrarea codului pleaca din
 * acelasi push si nu se termina in aceeasi secunda. In fereastra dintre ele
 * coloanele nu exista, iar un insert care le numeste primeste 42703 de la
 * PostgREST: catalogul ar refuza ORICE produs nou, nu doar pe cele cu ambalaj.
 *
 * DECI: cand coloanele lipsesc si operatorul nu a cerut ambalaj, se scrie ca
 * pana acum. Cand lipsesc SI a cerut ambalaj, se refuza romaneste, pentru ca a
 * salva produsul fara ambalajul cerut ar fi o pierdere tacuta de date pe un
 * ecran care tocmai a spus ca a salvat.
 */
async function packagingColumns(
  client: Parameters<typeof hasProductPackaging>[0],
  value: { package_unit: string | null; package_factor: number | null },
): Promise<
  | { ok: true; value: Record<string, string | number | null> }
  | { ok: false; message: string; field?: string }
> {
  if (await hasProductPackaging(client)) return { ok: true, value };
  if (value.package_unit === null) return { ok: true, value: {} };
  return {
    ok: false,
    field: "packageUnit",
    message: "Ambalajul furnizorului nu poate fi salvat încă. Încearcă din nou peste câteva minute.",
  };
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const pack = validatePackage(input);
  if (!pack.ok) return pack;

  const supabase = await createClient();
  const supplier = await resolveSupplier(input.supplier);
  if (!supplier.ok) return supplier;

  const packColumns = await packagingColumns(supabase, pack.value);
  if (!packColumns.ok) return packColumns;

  const { error } = await supabase
    .from("products")
    .insert({ ...checked.value, ...supplier.value, ...packColumns.value });
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

  const pack = validatePackage(input);
  if (!pack.ok) return pack;

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

  const supplier = await resolveSupplier(input.supplier);
  if (!supplier.ok) return supplier;

  const packColumns = await packagingColumns(supabase, pack.value);
  if (!packColumns.ok) return packColumns;

  const { error } = await supabase
    .from("products")
    .update({ ...checked.value, ...supplier.value, ...packColumns.value })
    .eq("id", id);
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
