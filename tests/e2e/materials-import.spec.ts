import { readFile } from "node:fs/promises";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { parseCsv, templateCsv, MATERIAL_IMPORT_FIELDS } from "@/lib/data/material-import-types";

// materials-import.spec - linia de acceptanta a cardului P3-125, Item 3 al lui Ivan.
//
// COPIAT DIN tests/e2e/projects-import.spec.ts CA FORMA, nu ca fisier: cardul nu
// editeaza spec-urile celorlalte importuri, deci ajutoarele de mai jos (csv, contul
// REST, numele unice pe rulare) sunt scrise din nou aici. Fixturile sunt CORPURI DE
// CSV construite in test, nu fisiere noi.
//
// FIXTURILE SUNT INVENTATE AICI, CU MANA: exista date reale de client in productie
// de pe 2026-09-14, deci nicio denumire reala de produs sau de furnizor nu ajunge in
// acest fisier. Fiecare caz isi creeaza propriile produse, cu un SKU unic pe
// rulare, ca doua cazuri sa nu se vada intre ele.
//
// LISTA CELOR NOUA UNITATI ESTE SCRISA CU MANA AICI, NU CITITA DIN units.ts: un test
// care citeste lista pe care o verifica dovedeste doar ca aceasta este egala cu ea
// insasi. Daca cineva adauga o a zecea unitate, acest test trebuie sa ceara un card.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const SKU_PREFIX = `T125-${RUN}`;

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

function skuFor(label: string): string {
  return `${SKU_PREFIX}-${label}`;
}

function nameFor(label: string): string {
  return `TEST ${RUN} materiale ${label}`;
}

// ---------------------------------------------------------------------------
// Legatura directa la baza, ca administratorul
// ---------------------------------------------------------------------------

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-125 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-125 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

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

async function restInsert(rest: OwnerRest, table: string, row: Record<string, unknown>): Promise<string> {
  const created = await rest.api.post(`/rest/v1/${table}`, {
    headers: { ...rest.headers, Prefer: "return=representation" },
    data: [row],
  });
  expect(created.status(), await created.text()).toBe(201);
  const stored = (await created.json()) as { id: string }[];
  return stored[0]!.id;
}

/** O categorie a spec-ului, cu nume unic pe rulare si pe caz. */
async function seedCategory(rest: OwnerRest, label: string): Promise<{ id: string; name: string }> {
  const name = `TEST ${RUN} categorie ${label}`;
  return { id: await restInsert(rest, "categories", { name }), name };
}

async function seedProduct(
  rest: OwnerRest,
  categoryId: string,
  fields: { sku: string; name: string; unit: string; unit_value_mdl?: number; threshold?: number },
): Promise<string> {
  return restInsert(rest, "products", { category_id: categoryId, ...fields });
}

/** UN PRODUS CARE S-A MISCAT: o comanda de intrare cu o linie pe produs. Aceeasi
 *  definitie ca lib/data/product-movement.ts (lot, linie de comanda sau de iesire). */
async function moveProduct(rest: OwnerRest, productId: string, label: string): Promise<void> {
  const orderId = await restInsert(rest, "inbound_orders", {
    reference: `${SKU_PREFIX}-IN-${label}`,
    supplier_name: `TEST ${RUN} furnizor`,
  });
  await restInsert(rest, "order_lines", { inbound_order_id: orderId, product_id: productId, quantity: 5 });
}

type StoredProduct = {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  unit: string;
  threshold: number | string;
  unit_value_mdl: number | string;
};

const STORED_COLUMNS = "id,sku,name,category_id,unit,threshold,unit_value_mdl";

async function storedByPrefix(rest: OwnerRest, prefix: string): Promise<StoredProduct[]> {
  return restGet(
    rest,
    `/rest/v1/products?select=${STORED_COLUMNS}&sku=like.${encodeURIComponent(`${prefix}*`)}&order=sku.asc`,
  );
}

async function storedById(rest: OwnerRest, id: string): Promise<StoredProduct> {
  const rows = await restGet<StoredProduct[]>(rest, `/rest/v1/products?select=${STORED_COLUMNS}&id=eq.${id}`);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** Cate produse sunt in baza, numarat de server. Un import nu are voie sa creeze un
 *  produs din randurile refuzate, iar numaratoarea dovedeste si asta. */
async function productCount(rest: OwnerRest): Promise<number> {
  const response = await rest.api.get("/rest/v1/products?select=id&limit=1", {
    headers: { ...rest.headers, Prefer: "count=exact" },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  const range = response.headers()["content-range"] ?? "";
  const total = Number(range.split("/")[1]);
  expect(Number.isFinite(total), `content-range ilizibil: ${range}`).toBe(true);
  return total;
}

// ---------------------------------------------------------------------------
// Fisierul si ecranul
// ---------------------------------------------------------------------------

/** Scris cu mana AICI: un test care importa scriitorul pe care il verifica
 *  dovedeste doar ca acela este egal cu el insusi. */
function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\r\n");
}

async function openImport(page: Page): Promise<void> {
  await page.goto("/inventar");
  await expect(page.getByTestId("products-import")).toBeVisible();
  await page.getByTestId("products-import").click();
  await expect(page.getByTestId("material-import")).toBeVisible();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
}

async function chooseFile(page: Page, name: string, body: string): Promise<void> {
  await page.getByTestId("import-file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
}

async function toVerify(page: Page): Promise<void> {
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

const HEADERS = ["Cod SKU", "Denumire", "Categorie", "Unitate de măsură", "Prag recomandă", "Valoare unitară (MDL)"];

/** Fisierul de erori, descarcat de pe ecran si citit. */
async function downloadedSkipped(page: Page): Promise<string[][]> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("import-download-skipped").click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  return parseCsv(await readFile(path!, "utf8"));
}

// ---------------------------------------------------------------------------
// Cazurile
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

test("import materiale: un fisier valid creeaza fiecare rand", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "valid");

  const body = csv([
    HEADERS,
    [skuFor("valid-1"), nameFor("valid unu"), category.name, "buc", "10", "12,50"],
    [skuFor("valid-2"), nameFor("valid doi"), category.name, "kg", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-valid.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(2);
  expect(await countAt(page, "import-skipped")).toBe(0);

  const stored = await storedByPrefix(rest, skuFor("valid-"));
  expect(stored.map((r) => r.sku)).toEqual([skuFor("valid-1"), skuFor("valid-2")]);
  const unu = stored[0]!;
  expect(unu.name).toBe(nameFor("valid unu"));
  expect(unu.category_id).toBe(category.id);
  expect(unu.unit).toBe("pcs");
  expect(Number(unu.threshold)).toBe(10);
  expect(Number(unu.unit_value_mdl)).toBe(12.5);
  const doi = stored[1]!;
  expect(doi.unit).toBe("kg");
  expect(Number(doi.threshold)).toBe(0);
  expect(Number(doi.unit_value_mdl)).toBe(0);
});

test("import materiale: un fisier invalid nu scrie nimic si arata un motiv pe fiecare rand", async ({
  page,
}) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "invalid");

  const body = csv([
    HEADERS,
    [skuFor("inv-1"), "", category.name, "buc", "", ""],
    [skuFor("inv-2"), nameFor("fara categorie"), "", "buc", "", ""],
    [skuFor("inv-3"), nameFor("fara unitate"), category.name, "", "", ""],
    [skuFor("inv-4"), nameFor("unitate rea"), category.name, "galeata", "", ""],
    [skuFor("inv-5"), nameFor("categorie rea"), `${category.name} inexistenta`, "buc", "", ""],
    [skuFor("inv-6"), nameFor("prag rau"), category.name, "buc", "mult", ""],
    [skuFor("inv-7"), nameFor("pret rau"), category.name, "buc", "", "-3"],
    ["", nameFor("fara sku"), category.name, "buc", "", ""],
  ]);

  const before = await productCount(rest);

  await openImport(page);
  await chooseFile(page, "materiale-invalid.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-error")).toBe(8);
  const errorRows = page.getByTestId("import-error-row");
  await expect(errorRows).toHaveCount(8);
  await expect(errorRows.nth(0)).toContainText("Denumire lipsește.");
  await expect(errorRows.nth(1)).toContainText("Categorie lipsește.");
  await expect(errorRows.nth(2)).toContainText("Unitate de măsură lipsește.");
  await expect(errorRows.nth(3)).toContainText('Unitatea "galeata" nu este acceptată');
  await expect(errorRows.nth(4)).toContainText("nu există");
  await expect(errorRows.nth(5)).toContainText("nu este un număr pozitiv");
  await expect(errorRows.nth(6)).toContainText("nu este un număr pozitiv");
  // FARA SKU SI FARA NICIUN PRODUS CU ACEEASI DENUMIRE SI UNITATE: eroare, nu SKU inventat.
  await expect(errorRows.nth(7)).toContainText("Codul SKU lipsește");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(8);

  expect(await storedByPrefix(rest, SKU_PREFIX + "-inv-"), "nimic scris dintr-un fisier invalid").toHaveLength(0);
  expect(await productCount(rest), "niciun produs, nici unul fara SKU").toBe(before);
});

test("import materiale: un fisier mixt scrie numai randurile valide si numara corect", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "mixt");

  const body = csv([
    HEADERS,
    [skuFor("mixt-1"), nameFor("bun unu"), category.name, "m²", "", ""],
    [skuFor("mixt-2"), "", category.name, "buc", "", "fără denumire"],
    [skuFor("mixt-3"), nameFor("bun doi"), category.name, "sac", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-mixt.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(2);
  expect(await countAt(page, "import-count-error")).toBe(1);

  await runImport(page);
  const created = await countAt(page, "import-created");
  const skipped = await countAt(page, "import-skipped");
  expect({ created, skipped }).toEqual({ created: 2, skipped: 1 });

  const stored = await storedByPrefix(rest, skuFor("mixt-"));
  expect(stored.map((r) => r.sku)).toEqual([skuFor("mixt-1"), skuFor("mixt-3")]);
});

test("import materiale: toate cele noua unitati sunt acceptate", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "noua");

  // CATE UN RAND PE UNITATE, cu eticheta de pe ecran, si inca unul pe fiecare cu
  // codul stocat: amandoua scrierile trebuie sa cada pe aceeasi unitate.
  const byLabel = NINE.map(({ code, label }) => [
    skuFor(`u-${code}`),
    nameFor(`unitate ${code}`),
    category.name,
    label,
    "",
    "",
  ]);
  const byCode = NINE.map(({ code }) => [
    skuFor(`c-${code}`),
    nameFor(`cod ${code}`),
    category.name,
    code,
    "",
    "",
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-noua.csv", csv([HEADERS, ...byLabel, ...byCode]));
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(18);
  expect(await countAt(page, "import-count-error")).toBe(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(18);

  for (const { code } of NINE) {
    const [byLabelRow] = await storedByPrefix(rest, skuFor(`u-${code}`));
    expect(byLabelRow?.unit, `eticheta pentru ${code}`).toBe(code);
    const [byCodeRow] = await storedByPrefix(rest, skuFor(`c-${code}`));
    expect(byCodeRow?.unit, `codul ${code}`).toBe(code);
  }
});

test("import materiale: set, cutie, palet si bax sunt respinse ca unitati", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "ambalaj");
  const words = ["set", "cutie", "palet", "bax"];

  const body = csv([
    HEADERS,
    ...words.map((word) => [skuFor(`amb-${word}`), nameFor(`ambalaj ${word}`), category.name, word, "", ""]),
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-ambalaj.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(0);
  expect(await countAt(page, "import-count-error")).toBe(4);
  const errorRows = page.getByTestId("import-error-row");
  await expect(errorRows).toHaveCount(4);
  for (const [i, word] of words.entries()) {
    // REFUZATE PE NUME: motivul spune ca este un ambalaj si numeste cuvantul.
    await expect(errorRows.nth(i)).toContainText(`"${word}" este un ambalaj, nu o unitate de măsură`);
  }

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await storedByPrefix(rest, skuFor("amb-"))).toHaveLength(0);
});

test("import materiale: unitatea unui produs care s-a miscat nu poate fi schimbata dintr-un fisier", async ({
  page,
}) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "miscat");

  const movedId = await seedProduct(rest, category.id, {
    sku: skuFor("mis-1"),
    name: nameFor("miscat"),
    unit: "pcs",
  });
  await moveProduct(rest, movedId, "mis-1");
  const idleId = await seedProduct(rest, category.id, {
    sku: skuFor("mis-2"),
    name: nameFor("nemiscat"),
    unit: "pcs",
  });

  const body = csv([
    HEADERS,
    [skuFor("mis-1"), nameFor("miscat"), category.name, "kg", "", ""],
    [skuFor("mis-2"), nameFor("nemiscat"), category.name, "kg", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-miscat.csv", body);
  await toVerify(page);

  // Produsul miscat: eroare. Cel nemiscat: dublat, a carui unitate tot nu se scrie.
  expect(await countAt(page, "import-count-error")).toBe(1);
  expect(await countAt(page, "import-count-duplicate")).toBe(1);
  await expect(page.getByTestId("import-error-row").first()).toContainText("Unitatea nu se poate schimba");
  await expect(page.getByTestId("import-duplicate").first()).toContainText("rămâne neschimbată");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(2);

  expect((await storedById(rest, movedId)).unit, "unitatea produsului miscat ramane").toBe("pcs");
  expect((await storedById(rest, idleId)).unit, "unitatea nu se scrie nici pe un produs nemiscat").toBe("pcs");

  const skipped = await downloadedSkipped(page);
  const row = skipped.find((r) => r.includes(skuFor("mis-1")));
  expect(row, "randul produsului miscat este in fisierul de erori").toBeTruthy();
  expect(skipped[0]?.slice(0, 2)).toEqual(["Rând", "Motiv"]);
  expect(row![1]).toContain("Unitatea nu se poate schimba");
});

test("import materiale: dublarea se face pe SKU, si pe nume plus unitate cand nu exista SKU", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "dublare");

  const bySku = await seedProduct(rest, category.id, {
    sku: skuFor("dub-1"),
    name: nameFor("dublare sku"),
    unit: "pcs",
  });
  const byName = await seedProduct(rest, category.id, {
    sku: skuFor("dub-2"),
    name: nameFor("dublare nume"),
    unit: "kg",
  });
  const before = await productCount(rest);

  const body = csv([
    HEADERS,
    // 1. Acelasi SKU, alta denumire: dublat pe SKU.
    [skuFor("dub-1"), nameFor("alta denumire"), category.name, "buc", "", ""],
    // 2. Fara SKU, aceeasi denumire si aceeasi unitate: dublat pe nume plus unitate.
    ["", nameFor("dublare nume"), category.name, "kg", "", ""],
    // 3. Fara SKU, aceeasi denumire dar ALTA unitate: nu se potriveste cu nimic, deci eroare.
    ["", nameFor("dublare nume"), category.name, "l", "", ""],
    // 4. SKU nou cu aceeasi denumire ca un produs existent: produs nou, nu dublat.
    [skuFor("dub-3"), nameFor("dublare sku"), category.name, "buc", "", ""],
    // 5. Acelasi SKU nou repetat in fisier: dublat fata de randul 4.
    [skuFor("dub-3"), nameFor("repetat"), category.name, "buc", "", ""],
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-dublare.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await countAt(page, "import-count-duplicate")).toBe(3);
  expect(await countAt(page, "import-count-error")).toBe(1);
  await expect(page.getByTestId("import-error-row").first()).toContainText("Codul SKU lipsește");

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(1);
  expect(await countAt(page, "import-skipped")).toBe(4);

  expect(await productCount(rest)).toBe(before + 1);
  expect((await storedById(rest, bySku)).name, "dublatul nu suprascrie denumirea").toBe(nameFor("dublare sku"));
  expect((await storedById(rest, byName)).unit).toBe("kg");
});

test("import materiale: un dublat completeaza numai campurile goale", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "completare");

  const empty = await seedProduct(rest, category.id, {
    sku: skuFor("cmp-1"),
    name: nameFor("completare goala"),
    unit: "pcs",
  });
  const priced = await seedProduct(rest, category.id, {
    sku: skuFor("cmp-2"),
    name: nameFor("completare cu pret"),
    unit: "pcs",
    unit_value_mdl: 7,
    threshold: 3,
  });

  const body = csv([
    HEADERS,
    [skuFor("cmp-1"), nameFor("completare goala"), category.name, "buc", "20", "4,5"],
    [skuFor("cmp-2"), nameFor("completare cu pret"), category.name, "buc", "99", "99"],
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-completare.csv", body);
  await toVerify(page);

  expect(await countAt(page, "import-count-duplicate")).toBe(2);
  const choices = page.getByTestId("import-duplicate-choice");
  await choices.nth(0).selectOption("fill");
  await expect(choices.nth(1).locator('option[value="fill"]')).toBeDisabled();

  await runImport(page);
  expect(await countAt(page, "import-filled")).toBe(1);

  const filled = await storedById(rest, empty);
  expect(Number(filled.unit_value_mdl)).toBe(4.5);
  expect(Number(filled.threshold)).toBe(20);
  const untouched = await storedById(rest, priced);
  expect(Number(untouched.unit_value_mdl), "un pret scris deja nu se inlocuieste").toBe(7);
  expect(Number(untouched.threshold)).toBe(3);
});

test("import materiale: EUR si RON sunt respinse in previzualizare cu motiv romanesc care numeste MDL", async ({
  page,
}) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "moneda");

  const body = csv([
    [...HEADERS, "Monedă"],
    [skuFor("mon-1"), nameFor("euro"), category.name, "buc", "", "10", "EUR"],
    [skuFor("mon-2"), nameFor("lei"), category.name, "buc", "", "10", "RON"],
    [skuFor("mon-3"), nameFor("mdl"), category.name, "buc", "", "10", "MDL"],
  ]);

  await openImport(page);
  await chooseFile(page, "materiale-moneda.csv", body);
  await toVerify(page);

  // REFUZATE INCA DIN PREVIZUALIZARE, inainte de orice scriere.
  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await countAt(page, "import-count-error")).toBe(2);
  const errorRows = page.getByTestId("import-error-row");
  await expect(errorRows).toHaveCount(2);
  await expect(errorRows.nth(0)).toContainText('Moneda "EUR" nu este acceptată');
  await expect(errorRows.nth(0)).toContainText("MDL");
  await expect(errorRows.nth(1)).toContainText('Moneda "RON" nu este acceptată');
  await expect(errorRows.nth(1)).toContainText("MDL");
  expect(await storedByPrefix(rest, skuFor("mon-")), "nimic scris la previzualizare").toHaveLength(0);

  await runImport(page);
  expect(await countAt(page, "import-created")).toBe(1);
  expect((await storedByPrefix(rest, skuFor("mon-"))).map((r) => r.sku)).toEqual([skuFor("mon-3")]);
});

test("import materiale: previzualizarea apare inainte de orice scriere", async ({ page }) => {
  const rest = await ownerRest();
  const category = await seedCategory(rest, "preview");

  const body = csv([HEADERS, [skuFor("prv-1"), nameFor("previzualizare"), category.name, "buc", "", ""]]);

  await openImport(page);
  await chooseFile(page, "materiale-preview.csv", body);
  await toVerify(page);

  // AJUNS LA PASUL 3, NIMIC NU S-A SCRIS INCA: regula clauzei (3) a cardului.
  expect(await countAt(page, "import-count-new")).toBe(1);
  expect(await storedByPrefix(rest, skuFor("prv-")), "nimic scris inainte de confirmare").toHaveLength(0);

  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();
  expect(await storedByPrefix(rest, skuFor("prv-")), "nici la pasul 4, inainte de Importă").toHaveLength(0);

  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });
  expect(await storedByPrefix(rest, skuFor("prv-")), "abia dupa Importă apare randul").toHaveLength(1);
});

test("import materiale: modelul si instructiunile de pe ecran", async ({ page }) => {
  // MODELUL: antetele formularului de produs, obligatoriile marcate, un rand exemplu.
  const [header, example] = parseCsv(templateCsv());
  expect(header).toEqual([
    "Cod SKU *",
    "Denumire *",
    "Categorie *",
    "Unitate de măsură *",
    "Prag recomandă",
    "Valoare unitară (MDL)",
  ]);
  expect(example).toHaveLength(header!.length);
  // Moneda exista numai ca sa poata fi refuzata, deci nu este in model.
  expect(header).not.toContain("Monedă");
  expect(MATERIAL_IMPORT_FIELDS).toContain("currency");

  await openImport(page);
  const instructions = page.getByTestId("import-instructions");
  await expect(instructions).toContainText("m², ml, buc, sac, kg, rolă, m³, t, l");
  await expect(instructions).toContainText("set, cutie, palet și bax");
  await expect(instructions).toContainText("Unitatea unui produs este fixă după prima lui mișcare");
  await expect(instructions).toContainText("5000 de rânduri");
  await expect(instructions).toContainText("5 MB");
  await expect(instructions).toContainText("UTF-8 cu BOM");
  await expect(page.getByTestId("import-template")).toBeVisible();
  await expect(page.getByTestId("products-import-template")).toBeVisible();
});
