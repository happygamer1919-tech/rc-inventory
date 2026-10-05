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
import { ID_LIST_BATCH_SIZE, readAllPages, type CountedPage } from "./id-list";
import { readQuantityRows, type StockClient } from "./stock-read";
import { clampPage, LIST_PAGE_SIZE } from "./list-paging";
import {
  applyQueryFilter,
  readProductPage,
  type ProductPageClient,
  type QueryFilter,
} from "./product-page-read";
import { filterByRest, filterByVisibility, type ProductFilter } from "./product-filter";
import {
  hasOutboundIssueMode,
  hasPhase3Schema,
  hasProductPackaging,
  hasProductSourceNote,
  hasSheetOptions,
} from "./schema-capability";
import { normalizeThickness, type SheetChoice } from "./sheet-options-types";
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
  /** EXT-10: ce factureaza FURNIZORUL, cand nu factureaza in unitatea de stoc.
   *  Null pentru produsul obisnuit, care nu are ambalaj. */
  packageUnit: string | null;
  /** EXT-10: cate unitati de stoc incap intr-un ambalaj. Prezent exact cand
   *  packageUnit este prezent, impus de constrangerea din 0035. */
  packageFactor: number | null;
  /** P3-59: combinatia de tabla Dasterum salvata pe produs, ca formularul de
   *  modificare sa porneasca de la ea. Null pentru un produs obisnuit, si null cat
   *  timp migratia 0046 nu este aplicata. */
  sheet: SheetChoice | null;
  /** P3-69: de unde a fost incarcat produsul (nota listei, apoi "Sursă: " si lista).
   *  Null pentru un produs adaugat de mana, si null cat timp 0049 nu este aplicata. */
  sourceNote: string | null;
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
  /** P3-120 clauza 3, hotararea R-215. Ce fel de eliberare a scazut cantitatea.
   *
   *  NULABIL AICI, SPRE DEOSEBIRE DE OutboundIssue.mode, SI DIN DOUA MOTIVE CARE
   *  SUNT AMANDOUA ADEVARATE:
   *
   *    O INTRARE NU ARE MOD. Clauza 3 vorbeste despre randurile de IESIRE, si o
   *    recepție de la furnizor nu este nici proiect, nici client direct: "project"
   *    pe un rand de intrare ar fi un raspuns inventat la o intrebare care nu se
   *    pune. Null spune ca intrebarea nu se aplica.
   *
   *    CAT TIMP 0067 NU ESTE APLICATA nu se poate citi coloana, deci nu se stie, si
   *    atunci panoul nu scrie niciun mod: decizia B a instructiunii cardului. Un rand
   *    de iesire cu mod null este exact fereastra aceea, si componentul nu are nevoie
   *    de niciun al doilea semnal ca sa o recunoasca. */
  mode: import("./outbound-types").OutboundMode | null;
};

function toNumber(value: unknown): number {
  // numeric() vine din PostgREST ca string, ca sa nu piarda precizie.
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** P3-136. Cate randuri se cer intr-o pagina la citirile de stoc si de catalog.
 *  Egal cu limita implicita a PostgREST (1000), ca un tabel sub limita sa se
 *  citeasca intr-o singura cerere, ca pana acum. Peste limita, citirea continua pe
 *  pagini in loc sa se opreasca tacut la 1000. */
export const STOCK_PAGE_SIZE = 1000;

/**
 * Stocul curent per produs: suma loturilor minus suma liniilor de iesire.
 *
 * Iesirile scad stocul in momentul emiterii, nu al expedierii, pentru ca
 * materialul a plecat din depozit fizic chiar daca statusul comenzii inca este
 * "in asteptare expediere". P2-05 detine regula si o va confirma prin testul lui.
 *
 * P3-136. `productIds` restrange citirea la produsele cerute, cu `.in`, cand
 * lista incape intr-o singura cerere (ID_LIST_BATCH_SIZE); peste ea, sau fara ea,
 * se citesc toate randurile. Citirea merge pe pagini pana la capat: inainte, un
 * tabel cu peste 1000 de randuri dadea un stoc calculat pe primele 1000.
 */
export async function stockByProduct(
  productIds?: readonly string[],
  pageSize: number = STOCK_PAGE_SIZE,
): Promise<Map<string, number>> {
  const stock = new Map<string, number>();
  if (productIds && productIds.length === 0) return stock;

  const supabase = await createClient();
  const scope = productIds && productIds.length <= ID_LIST_BATCH_SIZE ? [...productIds] : null;

  const client = supabase as unknown as StockClient;
  const [batches, issued] = await Promise.all([
    readQuantityRows(client, "batches", "loturile", scope, pageSize),
    readQuantityRows(client, "outbound_lines", "liniile de iesire", scope, pageSize),
  ]);

  for (const row of batches) {
    stock.set(row.product_id, (stock.get(row.product_id) ?? 0) + toNumber(row.quantity));
  }
  for (const row of issued) {
    stock.set(row.product_id, (stock.get(row.product_id) ?? 0) - toNumber(row.quantity));
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
  package_unit?: string | null;
  package_factor?: unknown;
  sheet_model?: string | null;
  sheet_series?: string | null;
  sheet_thickness_mm?: unknown;
  sheet_finish?: string | null;
  source_note?: string | null;
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
    // EXT-10. NULL SI 0 NU SUNT ACELASI LUCRU AICI, deci nu se trece prin
    // toNumber, care raspunde 0 pentru absent. Un produs fara ambalaj nu are un
    // factor de zero: nu are factor deloc, iar zero este chiar valoarea pe care
    // constrangerea din 0035 o refuza.
    packageUnit: row.package_unit ?? null,
    packageFactor:
      row.package_factor === null || row.package_factor === undefined
        ? null
        : toNumber(row.package_factor),
    sheet: toSheetChoice(row),
    sourceNote: row.source_note ?? null,
    needsReview: row.needs_review,
    active: row.active,
    stock: stock.get(row.id) ?? 0,
  };
}

/** P3-59. Combinatia salvata, sau null. Constrangerea din 0046 cere toate patru
 *  coloanele sau niciuna, deci un model lipsa inseamna un produs obisnuit. Grosimea
 *  vine ca "0.45", forma din lista de combinatii, ca alegerea sa se regaseasca. */
function toSheetChoice(row: ProductRow): SheetChoice | null {
  const model = row.sheet_model ?? null;
  const thicknessMm = normalizeThickness(row.sheet_thickness_mm);
  if (!model || !row.sheet_series || !thicknessMm) return null;
  return { model, series: row.sheet_series, thicknessMm, finish: row.sheet_finish ?? "" };
}

/** Lista de coloane a catalogului, cu coloanele facute de migratii numai cand migratiile
 *  sunt aplicate. O singura lista, pentru citirea intreaga, pe pagini si dupa SKU. */
async function productColumns(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  // P3-05b: ONE COLUMN LIST. The pre-phase-3 fallback named supplier_name, which
  // 0027 drops, and it was only ever reached when hasPhase3Schema() said no. The
  // wave 1 migrations are applied, so that branch is unreachable AND unsafe.
  const base =
    "id, sku, name, category_id, unit, threshold, unit_value_mdl, supplier_id, needs_review, active, categories(name), suppliers(name)";

  // EXT-10. COLOANELE DE AMBALAJ SE CER DOAR CAND EXISTA. Migratia 0035 ajunge
  // in productie pe fuziune, iar livrarea codului pleaca din acelasi push si nu
  // se termina in aceeasi secunda. Un select care numeste o coloana neaplicata
  // primeste 42703, iar aceasta functie este chemata de tabloul de bord, de
  // inventar si de fiecare formular care alege un produs: exact forma lui INC-05.
  const packaging = (await hasProductPackaging(supabase))
    ? `${base}, package_unit, package_factor`
    : base;
  // P3-59. COLOANELE COMBINATIEI, CU ACEEASI GRIJA: numai cand 0046 este aplicata.
  const sheet = (await hasSheetOptions(supabase))
    ? `${packaging}, sheet_model, sheet_series, sheet_thickness_mm, sheet_finish`
    : packaging;
  // P3-69. SURSA PRODUSULUI, CU ACEEASI GRIJA: numai cand 0049 este aplicata.
  return (await hasProductSourceNote(supabase)) ? `${sheet}, source_note` : sheet;
}

/**
 * Tot catalogul, produsele inactive incluse.
 *
 * Ecranul de inventar le arata pe toate, cu cele inactive marcate, pentru ca un
 * produs dezactivat trebuie sa ramana citibil in istoric. Alegerile din
 * formulare folosesc listActiveProducts, nu aceasta.
 *
 * P3-142. CITIREA INTREAGA RAMANE PENTRU CE AFLA TOTALURI PE TOT CATALOGUL: tabloul de
 * bord, memento-ul de stoc, necesarul, exportul si alegerile din formulare. Lista de pe
 * ecranul Inventar foloseste listProductsPage, mai jos.
 */
export async function listProducts(options: { activeOnly?: boolean } = {}): Promise<CatalogProduct[]> {
  const activeOnly = options.activeOnly === true;
  const supabase = await createClient();
  const columns = await productColumns(supabase);

  // P3-136. CATALOGUL SE CITESTE PE PAGINI, in ordinea cunoscuta (sku, apoi id ca
  // departajare stabila): peste 1000 de produse, lista se oprea tacut la 1000.
  const rows = await readAllPages<ProductRow>(
    "catalogul",
    (from, to) => {
      const query = supabase.from("products").select(columns, { count: "exact" });
      return (activeOnly ? query.eq("active", true) : query)
        .order("sku", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<CountedPage<ProductRow>>;
    },
    STOCK_PAGE_SIZE,
  );

  // Alegerile din formulare cer doar produsele active, deci si stocul se citeste
  // numai pentru ele (cand lista incape intr-o cerere), nu pentru tot istoricul.
  const stock = await stockByProduct(activeOnly ? rows.map((r) => r.id) : undefined);
  return rows.map((row) => toCatalogProduct(row, stock));
}

export type ProductPage = {
  products: CatalogProduct[];
  /** Randurile listei cu toate filtrele ecranului, nu ale paginii. */
  total: number;
  /** Randurile dupa filtrul activ/inactiv singur: "din" cat se arata cifra de mai sus. */
  visibleTotal: number;
  /** Tot catalogul, activ si inactiv. Spune daca "Catalogul este gol". */
  catalogTotal: number;
  /** Pagina adusa de fapt (ultima, daca cea ceruta era dincolo de capat). */
  page: number;
};

type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }> & {
  eq(column: string, value: string | boolean): CountQuery;
};

async function countProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filter: QueryFilter,
): Promise<number> {
  const query = supabase.from("products").select("id", { count: "exact", head: true }) as unknown as CountQuery;
  const { count, error } = await applyQueryFilter(query, filter);
  if (error) throw new Error(`Nu s-au putut număra produsele: ${error.message}`);
  return count ?? 0;
}

/**
 * P3-142. O PAGINA din lista de inventar, cu filtrele ecranului.
 *
 * CALEA RAPIDA (fara cautare si fara nivel de stoc): activ/inactiv, categoria si
 * furnizorul se pun in cerere, se cere o pagina cu `.range` si totalul exact, iar stocul
 * se aduna numai pentru cele cel mult 50 de produse de pe pagina (stockByProduct cu
 * `.in`). Citirea nu mai trece prin toate loturile si prin toate liniile de iesire.
 *
 * CAND NU SE POATE IN CERERE. Doua filtre nu au un echivalent in cererea de produse fara
 * migratie, iar cardul nu are voie sa adauge una:
 *  - cautarea ignora diacriticele ("tigla" gaseste "Țiglă", P3-129 si faza 1), iar
 *    `ilike` din baza nu le ignora fara extensia unaccent;
 *  - nivelul de stoc (redus, epuizat, suficient) depinde de stocul CALCULAT, care nu este o
 *    coloana (vezi antetul fisierului).
 * Cu unul dintre ele pus, se citeste tot catalogul ca inainte, se alege cu aceeasi functie
 * ca exportul (filterProducts) si apoi se taie pagina. Corect pe toate randurile, cu
 * costul de dinainte, numai cat timp operatorul cauta sau filtreaza dupa stoc.
 */
export async function listProductsPage(filter: ProductFilter, page: number): Promise<ProductPage> {
  const needsFullRead = filter.q.trim() !== "" || filter.level !== "toate";

  if (needsFullRead) {
    const all = await listProducts();
    const visible = filterByVisibility(all, filter.visibility);
    const matched = filterByRest(visible, filter);
    const current = clampPage(page, matched.length);
    const start = (current - 1) * LIST_PAGE_SIZE;
    return {
      products: matched.slice(start, start + LIST_PAGE_SIZE),
      total: matched.length,
      visibleTotal: visible.length,
      catalogTotal: all.length,
      page: current,
    };
  }

  const supabase = await createClient();
  const columns = await productColumns(supabase);
  const read = await readProductPage<ProductRow>(
    supabase as unknown as ProductPageClient<ProductRow>,
    columns,
    filter,
    page,
    (ids) => stockByProduct(ids),
  );

  // "din N" apare numai cand alt filtru decat activ/inactiv ingusteaza lista; altfel
  // totalul listei este chiar N si nu mai este nevoie de o a doua numaratoare.
  const visibleTotal =
    filter.category || filter.supplier
      ? await countProducts(supabase, { category: "", supplier: "", visibility: filter.visibility })
      : read.total;
  const catalogTotal =
    read.total > 0
      ? visibleTotal
      : await countProducts(supabase, { category: "", supplier: "", visibility: "toate" });

  return {
    products: read.rows.map((row) => toCatalogProduct(row, read.stock)),
    total: read.total,
    visibleTotal,
    catalogTotal,
    page: read.page,
  };
}

/** Un produs dupa SKU, cu stocul lui, pentru legaturile `?produs=<sku>` din alte ecrane:
 *  produsul deschis nu este neaparat pe pagina de pe ecran. Null daca nu exista. */
export async function getProductBySku(sku: string): Promise<CatalogProduct | null> {
  const supabase = await createClient();
  const columns = await productColumns(supabase);
  const { data, error } = await supabase.from("products").select(columns).eq("sku", sku).maybeSingle();
  if (error) throw new Error(`Nu s-a putut citi produsul: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ProductRow;
  return toCatalogProduct(row, await stockByProduct([row.id]));
}

/**
 * Doar produsele active, pentru alegerile din formulare.
 *
 * Aceasta este "lista de selectie" din care dezactivarea scoate un produs.
 * Faptul ca sunt doua functii, si nu un filtru la apelant, este intentionat: un
 * filtru uitat intr-un formular readuce in lista un produs scos din uz.
 */
export async function listActiveProducts(): Promise<CatalogProduct[]> {
  return listProducts({ activeOnly: true });
}

/** Categoriile, cu numarul de produse care le folosesc. */
export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient();
  // P3-136. NUMARUL DE PRODUSE VINE DE LA BAZA, ca agregat al relatiei
  // (`products(count)`), nu din citirea tuturor produselor ca sa fie numarate aici.
  // O cerere, zero randuri de produs aduse, si nu mai exista taietura la 1000.
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order, active, products(count)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`Nu s-au putut citi categoriile: ${error.message}`);

  return (data ?? []).map((row) => {
    const counted = row.products as unknown as { count: number }[] | { count: number } | null;
    const productCount = Array.isArray(counted) ? (counted[0]?.count ?? 0) : (counted?.count ?? 0);
    return {
      id: row.id as string,
      name: row.name as string,
      sortOrder: (row.sort_order as number) ?? 0,
      active: (row.active as boolean) ?? true,
      productCount,
    };
  });
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

  // P3-120 clauza 3. POARTA SE INTREABA INAINTE, iar lista de select a iesirilor
  // depinde de raspunsul ei: `issue_mode` si clientul propriu al iesirii exista doar
  // de la migratia 0067 incoace, iar 0067 este in registrul de asteptare de la
  // docs/migrations/APPLY-LOG.md. Un select care numeste o coloana neaplicata
  // primeste 42703, listProductMovements arunca, si panoul produsului nu se mai
  // deschide: forma incidentului INC-05 din 2026-08-31.
  //
  // POARTA ESTE hasOutboundIssueMode SI NU UNA DINTRE CELE DE PRODUS pe care acest
  // fisier le importa deja. hasProductPackaging ar fi trecut de verificarea
  // check:pending-schema-reads fara sa fie editata nicio linie, si ar fi fost o
  // poarta care raspunde la intrebarea greșită: ea spune daca 0046 este aplicata,
  // nu daca 0067 este, iar cele doua migratii se aplica fiecare in ziua ei.
  const withMode = await hasOutboundIssueMode(supabase);

  // `direct_client:clients!outbound_issues_client_id_fkey(name)` CU NUMELE
  // RESTRICTIEI SCRIS: de la 0067 incoace exista doua drumuri de la outbound_issues
  // la clients, cel direct prin client_id si cel prin projects, iar PostgREST
  // raspunde cu o eroare de relatie ambigua cand i se cere sa aleaga singur. Numele
  // este cel pe care PostgreSQL il da unei restrictii scrise inline, si 0067 o scrie
  // chiar inline. Acelasi lucru, pe larg, in lib/data/outbound.ts.
  const issueSelect = withMode
    ? "id, quantity, outbound_issues(reference, issued_at, issue_mode, projects(name, clients(name)), direct_client:clients!outbound_issues_client_id_fkey(name))"
    : "id, quantity, outbound_issues(reference, issued_at, projects(name, clients(name)))";

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
      .select(issueSelect)
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
      // P3-120. RANDURILE DE INTRARE NU SE ATING, si clauza 3 cere exact atat: ea
      // vorbeste despre randurile de iesire. O recepție de la furnizor nu are un fel
      // de eliberare, deci nu i se inventeaza unul.
      mode: null,
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
          /** P3-120: absent cat timp poarta a raspuns nu, fiindca atunci lista de
           *  select nu l-a cerut. */
          issue_mode?: string | null;
          projects: ({ name: string; clients: Named } | { name: string; clients: Named }[]) | null;
          /** Clientul PROPRIU al iesirii, al modului direct. */
          direct_client?: Named;
        }
      | null;
    const project = Array.isArray(issue?.projects) ? issue?.projects[0] : issue?.projects;
    const projectName = project?.name ?? null;

    // P3-120 clauza 3. MODUL, CITIT NUMAI CAND POARTA L-A LASAT SA FIE CITIT: null
    // cand 0067 nu este aplicata, si atunci panoul nu scrie nimic despre fel.
    const mode = withMode
      ? issue?.issue_mode === "direct_client"
        ? ("direct_client" as const)
        : ("project" as const)
      : null;

    // CUMPARATORUL VINE DE PE DRUMUL MODULUI. Pe o iesire pe proiect clientul se
    // citeste de pe proiect, cum il citeste de la P3-04b incoace; pe una catre client
    // direct nu exista proiect de citit, deci se citeste de pe coloana client_id a
    // iesirii.
    const clientName =
      mode === "direct_client"
        ? pickName(issue?.direct_client ?? null)
        : pickName(project?.clients ?? null);

    // P3-120 clauza 3. CONTEXTUL SPUNE CUI A PLECAT MATERIALUL, pe amandoua felurile.
    // Pana la acest card un rand de client direct scria doar "Ieșire": nicio
    // destinatie, pe exact randul care explica de ce a scazut o cantitate. Pe modul
    // direct cumparatorul ESTE destinatia intreaga, fiindca nu exista santier in
    // spatele lui, deci numele lui singur este raspunsul complet. Felul eliberarii nu
    // se repeta in acest sir: el are coloana lui pe ecran.
    // Rezerva este "Client necunoscut" si NU cuvantul modului: un rand de mod direct
    // ARE un client, prin outbound_issues_direct_client_mode_shape, deci singurul fel
    // in care numele poate lipsi este sa nu fi putut fi citit. Si eticheta modului nu
    // se scrie de mana nici aici: ea are un singur loc, OUTBOUND_MODE_LABEL.
    const context =
      mode === "direct_client"
        ? (clientName ?? "Client necunoscut")
        : clientName && projectName
          ? `${clientName} · ${projectName}`
          : (projectName ?? "Ieșire");

    movements.push({
      id: row.id as string,
      direction: "out",
      quantity: toNumber(row.quantity),
      at: issue?.issued_at ?? "",
      reference: issue?.reference ?? "-",
      context,
      mode,
    });
  }

  return movements.sort((a, b) => b.at.localeCompare(a.at));
}
