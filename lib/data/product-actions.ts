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

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { isUnitCode } from "./units";
import { looksLikeUuid } from "./suppliers-types";
import { resolveSupplier } from "./suppliers";
import {
  hasProductImage,
  hasProductPackaging,
  hasSheetOptionRetirement,
  hasSheetOptions,
} from "./schema-capability";
import { normalizeThickness, type SheetChoice } from "./sheet-options-types";
import { DOCS_BUCKET, type ActionResult as ValueResult } from "./inbound-types";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_MESSAGES,
  PRODUCT_IMAGE_TYPES,
  SNIFF_BYTES,
  contentMatchesType,
  productImageExtension,
  productImageProblem,
  type ProductImageChoice,
} from "./product-image-types";

type Failure = { ok: false; message: string; field?: string };

export type ActionResult = { ok: true } | Failure;

/** P3-56: salvarea intoarce id-ul produsului, ca imaginea sa se poata atasa dupa ea. */
export type ProductSaveResult = { ok: true; id: string } | Failure;

const OWNER_ONLY = {
  ok: false,
  message: "Doar administratorul poate modifica catalogul.",
} as const;

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
  /** P3-56: imaginea aleasa, daca s-a ales una: numele si marimea, nu fisierul.
   *  Se verifica aici INAINTE de orice scriere; fisierul vine dupa salvare, prin
   *  prepareProductImageUpload si confirmProductImage. */
  image?: ProductImageChoice | null;
  /** P3-57: combinatia de tabla aleasa din lista Dasterum. Null pentru un produs
   *  obisnuit. P3-59: si la modificare, unde null inseamna "Fără model", deci
   *  combinatia se goleste, iar ABSENTA (undefined) inseamna ca formularul nu a
   *  aratat listele, deci combinatia salvata nu se atinge. Pana la P3-59 comentariul
   *  spunea ca updateProduct nu o citeste si nu o scrie niciodata. */
  sheet?: SheetChoice | null;
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

/** P3-57. Coloanele combinatiei, cu numele din migratia 0046. */
type SheetColumns = {
  sheet_model: string;
  sheet_series: string;
  sheet_thickness_mm: string;
  sheet_finish: string;
};

/** P3-57. Forma combinatiei alese, curatata, sau ce lipseste din ea.
 *
 *  SEPARAT DE validate(), DELIBERAT. validate() intoarce valorile pe care le scriu
 *  si adaugarea si modificarea. Daca le-ar purta si pe acestea, fiecare modificare
 *  a unui produs ar goli combinatia aleasa la adaugare, fiindca formularul de
 *  modificare nu o trimite. P3-59: formularul de modificare o trimite acum, cu
 *  listele precompletate, dar numai cand le arata; cand nu le arata nu trimite
 *  nimic, iar updateProduct lasa coloanele cum sunt (vezi sheetUpdateColumns).
 *
 *  UN MODEL FARA SERIE SAU FARA GROSIME ESTE REFUZAT, nu salvat ca produs obisnuit:
 *  operatorul a inceput o alegere, iar a o pierde tacut ar fi un produs altfel decat
 *  cel pe care ecranul l-a aratat. */
function validateSheet(input: ProductInput):
  | { ok: true; value: SheetColumns | null }
  | { ok: false; message: string; field: string } {
  const choice = input.sheet;
  const model = String(choice?.model ?? "").trim();
  if (!choice || model.length === 0) return { ok: true, value: null };

  const series = String(choice.series ?? "").trim();
  const thickness = normalizeThickness(choice.thicknessMm);
  if (series.length === 0 || thickness === null) {
    return {
      ok: false,
      field: "sheet",
      message: "Alege seria și grosimea pentru modelul ales, sau alege Fără model.",
    };
  }
  return {
    ok: true,
    value: {
      sheet_model: model,
      sheet_series: series,
      sheet_thickness_mm: thickness,
      sheet_finish: String(choice.finish ?? "").trim(),
    },
  };
}

/**
 * P3-57. Combinatia aleasa exista in lista? Se intreaba INAINTE de resolveSupplier,
 * care poate crea furnizorul Dasterum: o combinatie refuzata nu lasa in urma nici
 * produsul, nici furnizorul.
 *
 * Cheia straina din 0046 ar refuza oricum o combinatie din afara listei, dar cu
 * 23503, pe care translateWriteError il citeste ca "categoria nu mai exista".
 * Intrebarea de aici da mesajul adevarat.
 */
async function sheetColumns(
  client: Supabase,
  value: SheetColumns | null,
  saved: SheetColumns | null = null,
): Promise<{ ok: true; value: SheetColumns | Record<string, never> } | Failure> {
  if (value === null) return { ok: true, value: {} };
  if (!(await hasSheetOptions(client))) {
    return {
      ok: false,
      field: "sheet",
      message: "Alegerea din lista Dasterum nu este încă activă. Încearcă din nou peste câteva minute.",
    };
  }

  const retirement = await hasSheetOptionRetirement(client);
  const { data, error } = await client
    .from("sheet_options")
    .select(retirement ? "model, retired_at" : "model")
    .eq("model", value.sheet_model)
    .eq("series", value.sheet_series)
    .eq("thickness_mm", value.sheet_thickness_mm)
    .eq("finish", value.sheet_finish)
    .maybeSingle();
  if (error) {
    return { ok: false, field: "sheet", message: "Lista Dasterum nu a putut fi citită. Încearcă din nou." };
  }
  if (!data) {
    return { ok: false, field: "sheet", message: "Combinația aleasă nu există în lista Dasterum." };
  }
  // P3-68. O COMBINATIE RETRASA NU SE MAI ALEGE, dar un produs care o poarta deja o
  // pastreaza: modificarea lui se salveaza cat timp combinatia ramane cea salvata.
  const retiredAt = (data as { retired_at?: string | null }).retired_at ?? null;
  if (retiredAt !== null && !sameSheet(value, saved)) {
    return {
      ok: false,
      field: "sheet",
      message: "Combinația aleasă a fost retrasă din listă. Alege alta sau Fără model.",
    };
  }
  return { ok: true, value };
}

/** P3-68: aceeasi combinatie, cu grosimea comparata ca numar ("0.45" si 0.45). */
function sameSheet(a: SheetColumns, b: SheetColumns | null): boolean {
  return (
    b !== null &&
    a.sheet_model === b.sheet_model &&
    a.sheet_series === b.sheet_series &&
    normalizeThickness(a.sheet_thickness_mm) === normalizeThickness(b.sheet_thickness_mm) &&
    a.sheet_finish === b.sheet_finish
  );
}

/** P3-68: combinatia pe care produsul o poarta acum, sau null. */
async function savedSheetColumns(client: Supabase, id: string): Promise<SheetColumns | null> {
  if (!(await hasSheetOptions(client))) return null;
  const { data } = await client
    .from("products")
    .select("sheet_model, sheet_series, sheet_thickness_mm, sheet_finish")
    .eq("id", id)
    .maybeSingle();
  if (!data || !data.sheet_model) return null;
  return {
    sheet_model: data.sheet_model as string,
    sheet_series: (data.sheet_series as string | null) ?? "",
    sheet_thickness_mm: normalizeThickness(data.sheet_thickness_mm) ?? "",
    sheet_finish: (data.sheet_finish as string | null) ?? "",
  };
}

/**
 * P3-59. Ce scrie modificarea in coloanele combinatiei.
 *
 * sheetColumns NU GOLESTE NIMIC: pentru "Fără model" intoarce un obiect gol, care la
 * adaugare inseamna coloane nule, dar la modificare ar lasa combinatia veche pe
 * loc. Deci aici "Fără model" se scrie explicit ca patru valori nule, ceea ce
 * respecta products_sheet_complete, si numai cat timp coloanele exista.
 *
 * FORMULARUL CARE NU A ARATAT LISTELE NU TRIMITE COMBINATIA, iar atunci nu se scrie
 * nimic: a goli o combinatie pe care operatorul nu a vazut-o ar fi o pierdere tacuta.
 */
async function sheetUpdateColumns(
  client: Supabase,
  id: string,
  choice: SheetChoice | null | undefined,
  value: SheetColumns | null,
): Promise<{ ok: true; value: Record<string, string | null> } | Failure> {
  if (choice === undefined) return { ok: true, value: {} };
  if (value !== null) return sheetColumns(client, value, await savedSheetColumns(client, id));
  if (!(await hasSheetOptions(client))) return { ok: true, value: {} };
  return {
    ok: true,
    value: { sheet_model: null, sheet_series: null, sheet_thickness_mm: null, sheet_finish: null },
  };
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
function translateWriteError(code: string | undefined, message: string): Failure {
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

/**
 * P3-56. Imaginea aleasa poate fi salvata? Se intreaba INAINTE de orice scriere,
 * inclusiv inainte de resolveSupplier, care poate crea un furnizor: un tip sau o
 * marime refuzata nu lasa in urma nici produsul, nici furnizorul.
 */
async function checkImageChoice(
  client: Parameters<typeof hasProductImage>[0],
  choice: ProductImageChoice | null | undefined,
): Promise<{ ok: true } | Failure> {
  if (!choice) return { ok: true };
  const problem = productImageProblem(choice);
  if (problem) return { ok: false, field: "image", message: problem };
  if (!(await hasProductImage(client))) {
    return { ok: false, field: "image", message: PRODUCT_IMAGE_MESSAGES.notActive };
  }
  return { ok: true };
}

export async function createProduct(input: ProductInput): Promise<ProductSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const pack = validatePackage(input);
  if (!pack.ok) return pack;

  const sheet = validateSheet(input);
  if (!sheet.ok) return sheet;

  const supabase = await createClient();
  const image = await checkImageChoice(supabase, input.image);
  if (!image.ok) return image;

  const sheetCols = await sheetColumns(supabase, sheet.value);
  if (!sheetCols.ok) return sheetCols;

  const supplier = await resolveSupplier(input.supplier);
  if (!supplier.ok) return supplier;

  const packColumns = await packagingColumns(supabase, pack.value);
  if (!packColumns.ok) return packColumns;

  const { data, error } = await supabase
    .from("products")
    .insert({ ...checked.value, ...supplier.value, ...packColumns.value, ...sheetCols.value })
    .select("id")
    .single();
  if (error || !data) return translateWriteError(error?.code, error?.message ?? "");

  revalidatePath("/inventar");
  revalidatePath("/setari");
  return { ok: true, id: data.id as string };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ProductSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;

  const checked = validate(input);
  if (!checked.ok) return checked;

  const pack = validatePackage(input);
  if (!pack.ok) return pack;

  // P3-59: aceeasi verificare a combinatiei ca la adaugare.
  const sheet = validateSheet(input);
  if (!sheet.ok) return sheet;

  const supabase = await createClient();
  const image = await checkImageChoice(supabase, input.image);
  if (!image.ok) return image;

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

  // P3-59: INAINTE de resolveSupplier, din acelasi motiv ca la adaugare.
  const sheetCols = await sheetUpdateColumns(supabase, id, input.sheet, sheet.value);
  if (!sheetCols.ok) return sheetCols;

  const supplier = await resolveSupplier(input.supplier);
  if (!supplier.ok) return supplier;

  const packColumns = await packagingColumns(supabase, pack.value);
  if (!packColumns.ok) return packColumns;

  const { error } = await supabase
    .from("products")
    .update({ ...checked.value, ...supplier.value, ...packColumns.value, ...sheetCols.value })
    .eq("id", id);
  if (error) return translateWriteError(error.code, error.message);

  revalidatePath("/inventar");
  revalidatePath("/setari");
  return { ok: true, id };
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

/* ------------------------------------------------------ imaginea produsului -- */
//
// P3-56. O SINGURA IMAGINE PE PRODUS, in bucketul rc-docs, la
// product/<id produs>/<uuid>.<ext>. Numele original al fisierului nu ajunge
// niciodata in cale.
//
// FISIERUL NU TRECE PRIN SERVERUL APLICATIEI, din motivul scris in
// document-actions.ts: pe Vercel corpul unei cereri are un plafon de aproximativ
// 4,5 MB, iar limita aici este 10 MB. Deci trei pasi, ca la documente:
//
//   1. prepareProductImageUpload verifica rolul, tipul si marimea declarata, alege
//      calea si cere o legatura de incarcare semnata pentru EXACT acea cale;
//   2. browserul trimite fisierul direct in bucket;
//   3. confirmProductImage citeste marimea REALA si primii octeti ai obiectului,
//      si abia apoi scrie products.image_path. Un obiect care nu trece este sters.
//
// LA INLOCUIRE, INTAI RANDUL, APOI OBIECTUL VECHI. Daca stergerea obiectului vechi
// esueaza, ramane un fisier orfan in depozit, niciodata un produs care arata spre
// nimic. Stergerea o permite politica rc_docs_delete, largita de 0045 la product/.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PRODUCT_GONE: Failure = { ok: false, message: "Produsul nu mai există." };
const IMAGE_UNVERIFIED: Failure = {
  ok: false,
  field: "image",
  message: "Nu s-a putut verifica imaginea încărcată. Încearcă din nou.",
};

/** Numai administratorul, si numai dupa ce 0045 este aplicata. */
async function imageGate(): Promise<{ ok: true; supabase: Supabase } | Failure> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sesiune expirată. Autentifică-te din nou." };
  if (user.role !== "owner") return OWNER_ONLY;
  const supabase = await createClient();
  if (!(await hasProductImage(supabase))) return { ok: false, message: PRODUCT_IMAGE_MESSAGES.notActive };
  return { ok: true, supabase };
}

/** Marimea obiectului de la o cale, citita de la Supabase. "error": nu s-a putut afla; null: nu exista. */
async function storedSize(supabase: Supabase, path: string): Promise<number | null | "error"> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 10 });
  if (error || !data) return "error";
  const item = data.find((o) => o.name === path.slice(slash + 1));
  if (!item) return null;
  const size = Number((item.metadata as { size?: unknown } | null)?.size);
  return Number.isFinite(size) ? size : -1;
}

/**
 * Primii octeti ai obiectului, printr-o legatura semnata de un minut. Aceeasi
 * citire ca firstBytes din document-actions.ts, cu termen si fara cititor de flux,
 * din motivul scris acolo (rularea 34909961251).
 */
async function firstBytes(supabase: Supabase, path: string): Promise<Uint8Array | "error"> {
  const { data } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 60);
  if (!data?.signedUrl) return "error";
  try {
    const response = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return "error";
    return new Uint8Array(await response.arrayBuffer()).subarray(0, SNIFF_BYTES);
  } catch {
    return "error";
  }
}

async function removeObject(supabase: Supabase, path: string): Promise<void> {
  await supabase.storage.from(DOCS_BUCKET).remove([path]);
}

export async function prepareProductImageUpload(
  productId: string,
  choice: ProductImageChoice,
): Promise<ValueResult<{ path: string; token: string; contentType: string }>> {
  const gate = await imageGate();
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const id = String(productId ?? "").toLowerCase();
  if (!UUID.test(id)) return PRODUCT_GONE;

  const problem = productImageProblem(choice);
  if (problem) return { ok: false, field: "image", message: problem };
  const ext = productImageExtension(String(choice.fileName))!;

  const { data: product } = await supabase.from("products").select("id").eq("id", id).maybeSingle();
  if (!product) return PRODUCT_GONE;

  const path = `product/${id}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    return {
      ok: false,
      field: "image",
      message: `Încărcarea imaginii nu a putut începe. ${error?.message ?? ""}`.trim(),
    };
  }
  return { ok: true, value: { path, token: data.token, contentType: PRODUCT_IMAGE_TYPES[ext]! } };
}

export async function confirmProductImage(productId: string, path: string): Promise<ActionResult> {
  const gate = await imageGate();
  if (!gate.ok) return gate;
  const { supabase } = gate;

  const id = String(productId ?? "").toLowerCase();
  if (!UUID.test(id)) return PRODUCT_GONE;

  // Calea trebuie sa fie exact forma aleasa la pasul 1, pentru acest produs.
  const objectPath = String(path ?? "");
  const expected = new RegExp(
    `^product/${id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$`,
  );
  if (!expected.test(objectPath)) {
    return { ok: false, field: "image", message: "Imaginea încărcată nu poate fi confirmată." };
  }

  // MARIMEA REALA, nu cea declarata la pasul 1.
  const size = await storedSize(supabase, objectPath);
  if (size === "error") return IMAGE_UNVERIFIED;
  if (size === null) {
    return { ok: false, field: "image", message: "Imaginea nu a ajuns în depozit. Încearcă din nou." };
  }
  if (size <= 0) {
    await removeObject(supabase, objectPath);
    return { ok: false, field: "image", message: PRODUCT_IMAGE_MESSAGES.empty };
  }
  if (size > MAX_PRODUCT_IMAGE_BYTES) {
    await removeObject(supabase, objectPath);
    return { ok: false, field: "image", message: PRODUCT_IMAGE_MESSAGES.tooLarge };
  }

  // CONTINUTUL REAL, nu extensia si nu tipul trimis de browser.
  const ext = objectPath.slice(objectPath.lastIndexOf(".") + 1);
  const head = await firstBytes(supabase, objectPath);
  if (head === "error") {
    await removeObject(supabase, objectPath);
    return IMAGE_UNVERIFIED;
  }
  if (!contentMatchesType(head, PRODUCT_IMAGE_TYPES[ext]!)) {
    await removeObject(supabase, objectPath);
    return { ok: false, field: "image", message: PRODUCT_IMAGE_MESSAGES.contentMismatch };
  }

  const { data: current } = await supabase
    .from("products")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (!current) {
    await removeObject(supabase, objectPath);
    return PRODUCT_GONE;
  }
  const previous = (current.image_path as string | null) ?? null;

  // INTAI RANDUL.
  const { data: updated, error } = await supabase
    .from("products")
    .update({ image_path: objectPath })
    .eq("id", id)
    .select("id");
  if (error || !updated || updated.length === 0) {
    await removeObject(supabase, objectPath);
    if (error) return translateWriteError(error.code, error.message);
    return OWNER_ONLY;
  }

  // APOI OBIECTUL VECHI.
  if (previous && previous !== objectPath) await removeObject(supabase, previous);

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
