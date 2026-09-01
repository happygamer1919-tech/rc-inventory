// Citirile catalogului, pe server, din Supabase.
//
// STOCUL ESTE O SUMA, NU O COLOANA. Migratia 0001 nu creeaza products.stock
// deliberat: stocul curent este suma loturilor produsului minus ce a iesit. Se
// calculeaza aici, la citire. Cat timp tabelele batches si outbound_lines sunt
// goale, stocul este zero pentru tot catalogul, ceea ce este raspunsul corect
// pentru un sistem in care nu a intrat inca nimic.
//
// Vederea SQL care va face agregarea in baza apartine lui P2-04, care detine
// regulile de stoc. Pana atunci agregarea se face in doua interogari mici si se
// combina aici, ceea ce este suficient pentru un catalog de ordinul sutelor de
// randuri si nu inventeaza schema pe care alt card o va autoriza.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasPhase3Schema } from "./schema-capability";
import type { SupplierOption } from "./suppliers-types";
import { isUnitCode, type UnitCode } from "./units";

export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  category: string;
  unit: UnitCode;
  threshold: number;
  unitValueMdl: number;
  supplierName: string | null;
  /** P3-05: furnizorul ca inregistrare. Null cat timp randul nu a fost inca
   *  reconciliat, sau daca produsul chiar nu are furnizor. */
  supplierId: string | null;
  needsReview: boolean;
  active: boolean;
  /** Suma loturilor minus iesirile. Zero cat timp nu a intrat nimic. */
  stock: number;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  /** Cate produse o folosesc. O categorie folosita nu poate fi stearsa. */
  productCount: number;
};

export type ProductBatch = {
  id: string;
  quantity: number;
  arrivedAt: string;
  orderReference: string | null;
};

export type ProductMovement = {
  id: string;
  direction: "in" | "out";
  quantity: number;
  at: string;
  reference: string;
  context: string;
};

function toNumber(value: unknown): number {
  // numeric() vine din PostgREST ca string, ca sa nu piarda precizie.
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stocul curent per produs: suma loturilor minus suma liniilor de iesire.
 *
 * Iesirile scad stocul in momentul emiterii, nu al expedierii, pentru ca
 * materialul a plecat din depozit fizic chiar daca statusul comenzii inca este
 * "in asteptare expediere". P2-05 detine regula si o va confirma prin testul lui.
 */
async function stockByProduct(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const stock = new Map<string, number>();

  const { data: batches } = await supabase.from("batches").select("product_id, quantity");
  for (const row of batches ?? []) {
    const id = row.product_id as string;
    stock.set(id, (stock.get(id) ?? 0) + toNumber(row.quantity));
  }

  const { data: issued } = await supabase.from("outbound_lines").select("product_id, quantity");
  for (const row of issued ?? []) {
    const id = row.product_id as string;
    stock.set(id, (stock.get(id) ?? 0) - toNumber(row.quantity));
  }

  return stock;
}

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  unit: string;
  threshold: unknown;
  unit_value_mdl: unknown;
  supplier_id: string | null;
  suppliers: { name: string } | { name: string }[] | null;
  needs_review: boolean;
  active: boolean;
  categories: { name: string } | null;
};

function toCatalogProduct(row: ProductRow, stock: Map<string, number>): CatalogProduct {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryId: row.category_id,
    category: row.categories?.name ?? "Fără categorie",
    unit: isUnitCode(row.unit) ? row.unit : "pcs",
    threshold: toNumber(row.threshold),
    unitValueMdl: toNumber(row.unit_value_mdl),
    // P3-05b: THE NAME COMES FROM THE JOINED SUPPLIER RECORD. products.supplier_name
    // is dropped by 0027, so there is no second spelling left to disagree with it.
    // Still nullable: a product may genuinely have no supplier.
    supplierName: (Array.isArray(row.suppliers) ? row.suppliers[0]?.name : row.suppliers?.name) ?? null,
    supplierId: row.supplier_id ?? null,
    needsReview: row.needs_review,
    active: row.active,
    stock: stock.get(row.id) ?? 0,
  };
}

/**
 * Tot catalogul, produsele inactive incluse.
 *
 * Ecranul de inventar le arata pe toate, cu cele inactive marcate, pentru ca un
 * produs dezactivat trebuie sa ramana citibil in istoric. Alegerile din
 * formulare folosesc listActiveProducts, nu aceasta.
 */
export async function listProducts(): Promise<CatalogProduct[]> {
  const supabase = await createClient();

  // P3-05b: ONE COLUMN LIST. The pre-phase-3 fallback named supplier_name, which
  // 0027 drops, and it was only ever reached when hasPhase3Schema() said no. The
  // wave 1 migrations are applied, so that branch is unreachable AND unsafe.
  const columns =
    "id, sku, name, category_id, unit, threshold, unit_value_mdl, supplier_id, needs_review, active, categories(name), suppliers(name)";

  const [{ data, error }, stock] = await Promise.all([
    supabase.from("products").select(columns).order("sku", { ascending: true }),
    stockByProduct(),
  ]);

  if (error) throw new Error(`Nu s-a putut citi catalogul: ${error.message}`);
  return ((data ?? []) as unknown as ProductRow[]).map((row) => toCatalogProduct(row, stock));
}

/**
 * Doar produsele active, pentru alegerile din formulare.
 *
 * Aceasta este "lista de selectie" din care dezactivarea scoate un produs.
 * Faptul ca sunt doua functii, si nu un filtru la apelant, este intentionat: un
 * filtru uitat intr-un formular readuce in lista un produs scos din uz.
 */
export async function listActiveProducts(): Promise<CatalogProduct[]> {
  const all = await listProducts();
  return all.filter((p) => p.active);
}

/** Categoriile, cu numarul de produse care le folosesc. */
export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: products }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order, active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("products").select("category_id"),
  ]);

  if (error) throw new Error(`Nu s-au putut citi categoriile: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of products ?? []) {
    const id = row.category_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: (row.sort_order as number) ?? 0,
    active: (row.active as boolean) ?? true,
    productCount: counts.get(row.id as string) ?? 0,
  }));
}

/** Unitatile in uz, citite din tabela. Enumul le fixeaza, tabela le ordoneaza. */
export async function listUnits(): Promise<UnitCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("code, sort_order, active")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Nu s-au putut citi unitățile: ${error.message}`);
  return (data ?? []).map((r) => r.code as UnitCode).filter(isUnitCode);
}

/** Furnizorii activi, din public.suppliers.
 *
 *  P3-05 a facut din furnizor o inregistrare. Pana atunci lista se deriva din
 *  numele distincte scrise pe produse, ceea ce insemna ca "Bricolaj SRL" si
 *  "BRICOLAJ srl" erau doi furnizori in orice filtru si in orice raport. */
export async function listSuppliers(): Promise<SupplierOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("active", true);
  return (data ?? [])
    .map((r) => ({ id: r.id as string, name: r.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

/** Doar numele, pentru formularele care inca scriu text liber.
 *
 *  Comanda de intrare are propria coloana inbound_orders.supplier_name, pe care
 *  P3-05 nu o atinge: cardul promoveaza furnizorul PRODUSULUI la inregistrare,
 *  nu furnizorul comenzii. Formularul acela primeste in continuare o lista de
 *  nume, dar de acum ea vine din public.suppliers si nu din numele distincte
 *  scrise pe produse, deci sugereaza denumirile reconciliate si nu variantele
 *  de scriere pe care cardul tocmai le-a strans intr-una. */
export async function listSupplierNames(): Promise<string[]> {
  return (await listSuppliers()).map((s) => s.name);
}

/** Loturile unui produs, cele mai noi primele. Goale pana la P2-04. */
export async function listProductBatches(productId: string): Promise<ProductBatch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("batches")
    .select("id, quantity, arrived_at, inbound_orders(reference)")
    .eq("product_id", productId)
    .order("arrived_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    quantity: toNumber(row.quantity),
    arrivedAt: row.arrived_at as string,
    orderReference:
      (row.inbound_orders as unknown as { reference: string } | null)?.reference ?? null,
  }));
}

/**
 * Miscarile unui produs: intrarile din loturi si iesirile din liniile de iesire,
 * imbinate si ordonate descrescator. Goale pana la P2-04 si P2-05.
 */
export async function listProductMovements(productId: string): Promise<ProductMovement[]> {
  const supabase = await createClient();

  const [{ data: batches }, { data: issued }] = await Promise.all([
    supabase
      .from("batches")
      .select("id, quantity, arrived_at, inbound_orders(reference, supplier_name)")
      .eq("product_id", productId),
    supabase
      .from("outbound_lines")
      // P3-04b: the destination comes from the joined records. client_name and
      // project_name were dropped by 0026, and a select naming a dropped column
      // returns 42703 and answers the screen with a 500.
      .select(
        "id, quantity, outbound_issues(reference, issued_at, projects(name, clients(name)))",
      )
      .eq("product_id", productId),
  ]);

  const movements: ProductMovement[] = [];

  for (const row of batches ?? []) {
    const order = row.inbound_orders as unknown as
      | { reference: string; supplier_name: string | null }
      | null;
    movements.push({
      id: row.id as string,
      direction: "in",
      quantity: toNumber(row.quantity),
      at: row.arrived_at as string,
      reference: order?.reference ?? "-",
      context: order?.supplier_name ?? "Recepție",
    });
  }

  for (const row of issued ?? []) {
    type Named = { name: string } | { name: string }[] | null;
    const pickName = (v: Named): string | null =>
      Array.isArray(v) ? (v[0]?.name ?? null) : (v?.name ?? null);
    const issue = row.outbound_issues as unknown as
      | {
          reference: string;
          issued_at: string;
          projects: ({ name: string; clients: Named } | { name: string; clients: Named }[]) | null;
        }
      | null;
    const project = Array.isArray(issue?.projects) ? issue?.projects[0] : issue?.projects;
    const projectName = project?.name ?? null;
    const clientName = pickName(project?.clients ?? null);
    movements.push({
      id: row.id as string,
      direction: "out",
      quantity: toNumber(row.quantity),
      at: issue?.issued_at ?? "",
      reference: issue?.reference ?? "-",
      context:
        clientName && projectName ? `${clientName} · ${projectName}` : (projectName ?? "Ieșire"),
    });
  }

  return movements.sort((a, b) => b.at.localeCompare(a.at));
}
