import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { parseCsv, templateCsv, MATERIAL_TEMPLATE_FIELDS } from "@/lib/data/material-import-types";

// materials-export.spec - linia de acceptanta a cardului P3-129, goal G71.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA. In productie exista date reale de client, deci
// nicio denumire reala de produs, categorie sau furnizor nu ajunge in acest fisier. Fiecare
// produs poarta un SKU cu prefixul T129 si un sufix unic pe rulare, iar cautarea listei pe
// acel sufix este FILTRUL fiecarui caz: baza nu este goala, deci "exportul tuturor" ar scoate
// si produsele altor rulari.
//
// DATELE DE TEST NU SE STERG NICIODATA, ca peste tot in aceasta suita.
//
// REIMPORTUL SE FACE PRIN SKU NOU, nu prin stergere: importul de materiale recunoaste un
// dublat dupa SKU, deci aceleasi randuri nu s-ar crea a doua oara. Fisierul exportat se
// reimporta mai intai NEATINS (trebuie sa dea numai dublate), apoi cu seria mutata pe B, in
// SKU si in denumire, COLOANELE CATEGORIE SI UNITATE NEATINSE: ele sunt cele care trebuie sa
// se potriveasca. Toate campurile se compara una cate una cu originalul.
//
// LISTA CELOR NOUA UNITATI ESTE SCRISA CU MANA AICI, NU CITITA DIN units.ts: un test care
// citeste lista pe care o verifica dovedeste doar ca aceasta este egala cu ea insasi.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const skuTagOf = (label: string): string => `T129-${RUN}-${label}`;
const nameTagOf = (label: string): string => `TEST ${RUN} mexp ${label}`;

/** Cod stocat si eticheta de pe ecran, pentru fiecare dintre cele noua. */
const NINE: { code: string; label: string }[] = [
  { code: "m2", label: "m²" },
  { code: "lm", label: "ml" },
  { code: "pcs", label: "buc" },
  { code: "bag", label: "sac" },
  { code: "kg", label: "kg" },
  { code: "roll", label: "rolă" },
  { code: "m3", label: "m³" },
  { code: "t", label: "t" },
  { code: "l", label: "l" },
];

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-129 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-129 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await request.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string };

  return {
    api,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${body.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

async function restGet<T>(rest: OwnerRest, path: string): Promise<T> {
  const response = await rest.api.get(path, { headers: rest.headers });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}

/** Un rand pe cerere: PostgREST cere ca toate obiectele unui lot sa aiba aceleasi chei. */
async function restInsert(rest: OwnerRest, table: string, row: Record<string, unknown>): Promise<string> {
  const created = await rest.api.post(`/rest/v1/${table}`, {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [row],
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }[])[0]!.id;
}

/** O categorie a spec-ului, cu nume unic pe rulare si pe caz. */
async function seedCategory(
  rest: OwnerRest,
  label: string,
  suffix = "",
): Promise<{ id: string; name: string }> {
  const name = `TEST ${RUN} categorie ${label}${suffix}`;
  return { id: await restInsert(rest, "categories", { name }), name };
}

async function seedProduct(
  rest: OwnerRest,
  categoryId: string,
  fields: {
    sku: string;
    name: string;
    unit: string;
    unit_value_mdl?: number;
    threshold?: number;
    active?: boolean;
    supplier_id?: string;
  },
): Promise<string> {
  return restInsert(rest, "products", { category_id: categoryId, ...fields });
}

/** UN LOT DE STOC: comanda de intrare, linia ei si lotul, exact ca la receptia din aplicatie. */
async function seedStock(rest: OwnerRest, productId: string, label: string, quantity: number): Promise<void> {
  const orderId = await restInsert(rest, "inbound_orders", {
    reference: `T129-${RUN}-IN-${label}`,
    supplier_name: `TEST ${RUN} furnizor`,
    status: "arrived",
    arrived_at: new Date().toISOString(),
  });
  const lineId = await restInsert(rest, "order_lines", {
    inbound_order_id: orderId,
    product_id: productId,
    quantity,
  });
  await restInsert(rest, "batches", {
    product_id: productId,
    inbound_order_id: orderId,
    order_line_id: lineId,
    quantity,
  });
}

type StoredProduct = {
  sku: string;
  name: string;
  category_id: string;
  unit: string;
  threshold: number | string;
  unit_value_mdl: number | string;
};

const STORED_COLUMNS = "sku,name,category_id,unit,threshold,unit_value_mdl";

async function storedByPrefix(rest: OwnerRest, prefix: string): Promise<StoredProduct[]> {
  return restGet(
    rest,
    `/rest/v1/products?select=${STORED_COLUMNS}&sku=like.${encodeURIComponent(`${prefix}*`)}&order=sku.asc`,
  );
}

const normal = (p: StoredProduct) => ({
  ...p,
  threshold: Number(p.threshold),
  unit_value_mdl: Number(p.unit_value_mdl),
});

/** Stocul unui produs, calculat ca in aplicatie: suma loturilor minus iesirile. */
async function stockOf(rest: OwnerRest, sku: string): Promise<{ batches: number; issued: number }> {
  const products = await restGet<{ id: string }[]>(rest, `/rest/v1/products?select=id&sku=eq.${encodeURIComponent(sku)}`);
  expect(products).toHaveLength(1);
  const id = products[0]!.id;
  const batches = await restGet<{ quantity: number | string }[]>(
    rest,
    `/rest/v1/batches?select=quantity&product_id=eq.${id}`,
  );
  const issued = await restGet<{ quantity: number | string }[]>(
    rest,
    `/rest/v1/outbound_lines?select=quantity&product_id=eq.${id}`,
  );
  const sum = (rows: { quantity: number | string }[]) => rows.reduce((t, r) => t + Number(r.quantity), 0);
  return { batches: sum(batches), issued: sum(issued) };
}

// ---------------------------------------------------------------------------
// Fisierul si ecranul
// ---------------------------------------------------------------------------

/** Scris cu mana AICI si nu importat din aplicatie: un test care importa scriitorul pe care
 *  il verifica dovedeste doar ca acela este egal cu el insusi. */
function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\r\n");
}

type View = {
  q?: string;
  category?: string;
  supplier?: string;
  level?: string;
  visibility?: string;
};

/** Deschide Inventarul, pune filtrele date pe ecran, apasa Exporta CSV si intoarce fisierul. */
async function exportView(
  page: Page,
  view: View,
): Promise<{ bytes: Buffer; text: string; name: string }> {
  await page.goto("/inventar");
  await expect(page.getByTestId("products-export")).toBeVisible();
  if (view.visibility) await page.getByTestId("filter-visibility").selectOption(view.visibility);
  if (view.category) await page.getByTestId("filter-category").selectOption(view.category);
  if (view.supplier) await page.getByTestId("filter-supplier").selectOption(view.supplier);
  if (view.level) await page.getByTestId("filter-level").selectOption(view.level);
  if (view.q) await page.getByTestId("product-search").fill(view.q);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("products-export").click(),
  ]);
  const bytes = await readFile(await download.path());
  return { bytes, text: bytes.toString("utf8"), name: download.suggestedFilename() };
}

/** Datele fisierului, fara BOM si fara antet. */
function dataRows(text: string): string[][] {
  return parseCsv(text).slice(1);
}

const col = (field: (typeof MATERIAL_TEMPLATE_FIELDS)[number]): number => MATERIAL_TEMPLATE_FIELDS.indexOf(field);

async function importFile(page: Page, name: string, body: string): Promise<void> {
  await page.goto("/inventar");
  await expect(page.getByTestId("products-import")).toBeVisible();
  await page.getByTestId("products-import").click();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
  await page.getByTestId("import-file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible();
}

async function runImport(page: Page): Promise<void> {
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
}

async function countAt(page: Page, testId: string): Promise<number> {
  return Number((await page.getByTestId(testId).innerText()).trim());
}

/** Fisierul mutat pe seria B: SKU si denumire, restul neatins. */
function moveSeries(text: string, from: string, to: string): string {
  const moved = dataRows(text).map((row) => {
    const copy = [...row];
    copy[col("sku")] = copy[col("sku")]!.replace(from, to);
    copy[col("name")] = copy[col("name")]!.replace(from, to);
    return copy;
  });
  return csv([parseCsv(text)[0]!, ...moved]);
}

const LABELS = [
  "Cod SKU *",
  "Denumire *",
  "Categorie *",
  "Unitate de măsură *",
  "Prag recomandă",
  "Valoare unitară (MDL)",
];

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test("export materiale: export apoi import produce inregistrari identice", async ({ page }) => {
  const rest = await ownerRest();
  const tagA = skuTagOf("rta");
  const tagB = skuTagOf("rtb");

  // O categorie cu virgula, ghilimele si diacritice in nume.
  const category = await seedCategory(rest, "rt", ` Țiglă, "mare"`);

  // Patru produse care ating fiecare camp: virgula, ghilimele si diacritice in denumire,
  // prag cu zecimale, valoare cu zecimale, zero pe amandoua, trei unitati diferite.
  await seedProduct(rest, category.id, {
    sku: `${tagA}-1`,
    name: `${nameTagOf("rta")} Șurub, "autoforant" 4,8x19`,
    unit: "pcs",
    threshold: 12.5,
    unit_value_mdl: 0.35,
  });
  await seedProduct(rest, category.id, {
    sku: `${tagA}-2`,
    name: `${nameTagOf("rta")} Tablă ondulată`,
    unit: "m2",
    threshold: 100,
    unit_value_mdl: 12500.5,
  });
  await seedProduct(rest, category.id, {
    sku: `${tagA}-3`,
    name: `${nameTagOf("rta")} Adeziv`,
    unit: "bag",
    threshold: 0.125,
    unit_value_mdl: 99,
  });
  await seedProduct(rest, category.id, {
    sku: `${tagA}-4`,
    name: `${nameTagOf("rta")} Fără preț`,
    unit: "kg",
  });

  const original = await storedByPrefix(rest, tagA);
  expect(original).toHaveLength(4);

  // 1. EXPORTUL: numai produsele seriei A, prin cautarea listei.
  const exported = await exportView(page, { q: tagA });
  expect(exported.name).toBe("materiale.csv");
  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(4);

  // 2. FISIERUL NEATINS, REIMPORTAT: fiecare rand este un dublat al celui din baza, nu se
  //    creeaza nimic si nicio unitate sau categorie nu este refuzata.
  await importFile(page, "materiale-export.csv", exported.text);
  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-duplicate")).toBe(4);
  expect(await countAt(page, "import-count-error")).toBe(0);

  // 3. SERIA B: SKU si denumire mutate pe seria B, categoria si unitatea neatinse.
  await importFile(page, "materiale-export-b.csv", moveSeries(exported.text, tagA, tagB));
  expect(await countAt(page, "import-count-new")).toBe(4);
  expect(await countAt(page, "import-count-error")).toBe(0);
  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(4);

  // 4. EGALITATE CAMP CU CAMP, din randurile stocate si nu de pe ecran.
  const reimported = await storedByPrefix(rest, tagB);
  expect(reimported).toHaveLength(4);
  const expected = original.map((p) =>
    normal({ ...p, sku: p.sku.replace(tagA, tagB), name: p.name.replace(tagA, tagB) }),
  );
  expect(reimported.map(normal)).toEqual(expected);
});

test("export materiale: unitatea fiecarui rand se re-importa fara nicio eroare de unitate", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tagA = skuTagOf("una");
  const tagB = skuTagOf("unb");
  const category = await seedCategory(rest, "un");

  for (const [i, unit] of NINE.entries()) {
    await seedProduct(rest, category.id, {
      sku: `${tagA}-${i + 1}`,
      name: `${nameTagOf("una")} unitate ${unit.code}`,
      unit: unit.code,
      threshold: i + 1,
      unit_value_mdl: 1.5,
    });
  }
  const original = await storedByPrefix(rest, tagA);
  expect(original.map((p) => p.unit)).toEqual(NINE.map((u) => u.code));

  const exported = await exportView(page, { q: tagA });
  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(9);

  // Celula Unitate este forma din randul exemplu al modelului: eticheta de pe ecran.
  const bySku = new Map(rows.map((r) => [r[col("sku")]!, r[col("unit")]!]));
  for (const [i, unit] of NINE.entries()) {
    expect(bySku.get(`${tagA}-${i + 1}`), `unitatea ${unit.code}`).toBe(unit.label);
  }

  await importFile(page, "materiale-unitati.csv", moveSeries(exported.text, tagA, tagB));
  expect(await countAt(page, "import-count-new")).toBe(9);
  expect(await countAt(page, "import-count-error"), "zero erori de unitate").toBe(0);
  await expect(page.getByTestId("import-error-row")).toHaveCount(0);
  await expect(page.getByTestId("import-step-3")).not.toContainText("nu este acceptată");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(9);

  const reimported = await storedByPrefix(rest, tagB);
  expect(reimported.map((p) => p.unit)).toEqual(NINE.map((u) => u.code));
});

test("export materiale: nicio coloana din fisier nu poate schimba un stoc", async ({ page }) => {
  const rest = await ownerRest();
  const tag = skuTagOf("stc");
  const category = await seedCategory(rest, "stc");

  const sku = `${tag}-1`;
  const productId = await seedProduct(rest, category.id, {
    sku,
    name: `${nameTagOf("stc")} cu stoc`,
    unit: "pcs",
    threshold: 5,
    unit_value_mdl: 10,
  });
  expect(productId).toBeTruthy();
  await seedStock(rest, productId, "stc", 10);
  await seedProduct(rest, category.id, {
    sku: `${tag}-2`,
    name: `${nameTagOf("stc")} fara stoc`,
    unit: "kg",
    threshold: 0,
    unit_value_mdl: 0,
  });

  const before = await stockOf(rest, sku);
  expect(before).toEqual({ batches: 10, issued: 0 });

  const exported = await exportView(page, { q: tag });
  const header = parseCsv(exported.text)[0]!;

  // Nicio coloana de stoc sau de cantitate in fisier: numai cele sase ale modelului.
  expect(header.filter((h) => /stoc|cantitate|qty|stock/i.test(h))).toEqual([]);
  expect(header).toHaveLength(MATERIAL_TEMPLATE_FIELDS.length);

  // Se editeaza TOATE coloanele care seamana a cantitate sau a numar: pragul si valoarea.
  const edited = dataRows(exported.text).map((row) => {
    const copy = [...row];
    copy[col("threshold")] = "999";
    copy[col("unitValueMdl")] = "777";
    return copy;
  });
  await importFile(page, "materiale-stoc.csv", csv([header, ...edited]));
  await runImport(page);

  expect(await stockOf(rest, sku), "stocul unic al produsului ramane cel din loturi").toEqual(before);
  expect(await stockOf(rest, `${tag}-2`)).toEqual({ batches: 0, issued: 0 });

  // Ecranul spune acelasi stoc: zece bucati, nu 999 si nu 777.
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("10");
  await expect(row).not.toContainText("999 buc");
});

test("export materiale: exportul respecta filtrele curente", async ({ page }) => {
  const rest = await ownerRest();
  const tag = skuTagOf("fil");

  const catOne = await seedCategory(rest, "fil unu");
  const catTwo = await seedCategory(rest, "fil doi");
  const supplierId = await restInsert(rest, "suppliers", { name: `TEST ${RUN} furnizor filtru` });

  const stockedId = await seedProduct(rest, catOne.id, {
    sku: `${tag}-a`,
    name: `${nameTagOf("fil")} alfa`,
    unit: "pcs",
    supplier_id: supplierId,
  });
  await seedStock(rest, stockedId, "fil", 8);
  await seedProduct(rest, catOne.id, { sku: `${tag}-b`, name: `${nameTagOf("fil")} beta`, unit: "pcs" });
  await seedProduct(rest, catTwo.id, { sku: `${tag}-c`, name: `${nameTagOf("fil")} gama`, unit: "kg" });
  await seedProduct(rest, catTwo.id, {
    sku: `${tag}-d`,
    name: `${nameTagOf("fil")} delta`,
    unit: "kg",
    active: false,
  });
  // Un produs care nu poarta eticheta cautata: nu trebuie sa apara in niciun export de mai jos.
  await seedProduct(rest, catOne.id, {
    sku: `T129-${RUN}-altul`,
    name: `TEST ${RUN} mexp altul`,
    unit: "pcs",
  });

  const skus = (text: string): string[] => dataRows(text).map((r) => r[col("sku")]!).sort();

  // Implicitul listei: numai produsele active.
  const live = await exportView(page, { q: tag });
  expect(skus(live.text)).toEqual([`${tag}-a`, `${tag}-b`, `${tag}-c`]);

  // O categorie aleasa.
  const byCategory = await exportView(page, { q: tag, category: catOne.id });
  expect(skus(byCategory.text)).toEqual([`${tag}-a`, `${tag}-b`]);

  // Active si inactive.
  const all = await exportView(page, { q: tag, visibility: "toate" });
  expect(skus(all.text)).toEqual([`${tag}-a`, `${tag}-b`, `${tag}-c`, `${tag}-d`]);

  // Numai cele inactive.
  const inactive = await exportView(page, { q: tag, visibility: "inactive" });
  expect(skus(inactive.text)).toEqual([`${tag}-d`]);

  // Un furnizor ales.
  const bySupplier = await exportView(page, { q: tag, supplier: supplierId });
  expect(skus(bySupplier.text)).toEqual([`${tag}-a`]);

  // Nivelul de stoc: epuizat, adica stoc zero.
  const empty = await exportView(page, { q: tag, level: "epuizat" });
  expect(skus(empty.text)).toEqual([`${tag}-b`, `${tag}-c`]);

  // Categorie si cautare impreuna.
  const both = await exportView(page, { q: `${tag}-b`, category: catOne.id });
  expect(skus(both.text)).toEqual([`${tag}-b`]);
});

test("export materiale: fisierul incepe cu marca de ordine a octetilor si diacriticele supravietuiesc", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = skuTagOf("bom");
  const category = await seedCategory(rest, "bom", " Șură Ținută");
  const name = `${nameTagOf("bom")} Țiglă înlocuită la șură, ăâîșț ĂÂÎȘȚ`;

  await seedProduct(rest, category.id, { sku: `${tag}-1`, name, unit: "roll", threshold: 3, unit_value_mdl: 4.5 });

  const exported = await exportView(page, { q: tag });
  expect([...exported.bytes.subarray(0, 3)], "EF BB BF").toEqual([0xef, 0xbb, 0xbf]);
  expect(exported.text.startsWith("﻿Cod SKU"), "un singur BOM, apoi antetul").toBe(true);
  expect(exported.text.indexOf("﻿", 1), "niciun al doilea BOM").toBe(-1);

  const rows = dataRows(exported.text);
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row[col("name")]).toBe(name);
  expect(row[col("category")]).toBe(category.name);
  expect(row[col("unit")]).toBe("rolă");
  expect(exported.text).not.toContain("�");
});

test("export materiale: antetele exportului sunt identice cu antetele modelului de import", async ({
  page,
}) => {
  const rest = await ownerRest();
  const tag = skuTagOf("ant");
  const category = await seedCategory(rest, "ant");
  await seedProduct(rest, category.id, { sku: `${tag}-1`, name: `${nameTagOf("ant")} unu`, unit: "pcs" });

  const exported = await exportView(page, { q: tag });
  const header = parseCsv(exported.text)[0];
  const model = parseCsv(templateCsv())[0];

  expect(header, "antetul exportului, ca lista").toEqual(model);
  expect(header, "si ca lista scrisa cu mana").toEqual(LABELS);
});

test("export materiale: se exporta toate randurile filtrului, nu doar ce arata ecranul", async ({ page }) => {
  const rest = await ownerRest();
  const tag = skuTagOf("pag");
  const category = await seedCategory(rest, "pag");

  const count = 30;
  for (let i = 1; i <= count; i += 1) {
    await seedProduct(rest, category.id, {
      sku: `${tag}-${String(i).padStart(2, "0")}`,
      name: `${nameTagOf("pag")} ${String(i).padStart(2, "0")}`,
      unit: "pcs",
    });
  }

  const exported = await exportView(page, { q: tag });
  const rows = dataRows(exported.text);
  expect(rows, "toate cele 30").toHaveLength(count);
  expect(new Set(rows.map((r) => r[col("sku")])).size, "fara randuri repetate").toBe(count);
  await expect(page.getByTestId("products-export-notice")).toContainText(`Am exportat ${count} rânduri.`);
});
