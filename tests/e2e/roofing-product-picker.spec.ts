import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// roofing-product-picker.spec - linia de acceptanta a cardului P3-57.
//
// Cele trei cazuri ale cardului, in ordinea lui:
//   1. un produs ales din Model, Serie si Grosime are denumirea, unitatea si
//      categoria completate inainte de salvare; denumirea se modifica si se
//      salveaza, iar randul poarta furnizorul Dasterum si combinatia aleasa; pe
//      formularul de modificare denumirea se schimba din nou, iar combinatia ramane;
//   2. lista de grosimi arata numai grosimile seriei alese, exact ca lista
//      Dasterum verificata, si lista de serii numai seriile modelului;
//   3. doua grosimi ale aceleiasi serii devin doua produse, cu doua SKU-uri.
//
// CE SE CITESTE DIN BAZA SE CITESTE CU CHEIA service_role a stivei LOCALE, ca in
// product-image.spec: furnizorul si coloanele combinatiei nu se vad pe ecran.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07. Fiecare produs
// creat aici poarta prefixul TEST- in SKU, ca in products.spec.
//
// LISTELE ASTEPTATE SUNT SCRISE DE MANA, DIN LISTA VERIFICATA, si nu citite din
// baza: un test care isi ia asteptarea din acelasi loc din care ecranul isi ia
// lista ar trece si pe o lista gresita.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const CATEGORY = "Acoperișuri și tablă";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "roofing-product-picker.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service };
}

type ProductDbRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sheet_model: string | null;
  sheet_series: string | null;
  sheet_thickness_mm: number | string | null;
  sheet_finish: string | null;
  categories: { name: string } | null;
  suppliers: { name: string } | null;
};

async function productsWithSku(sku: string): Promise<ProductDbRow[]> {
  const { origin, service } = env();
  const select =
    "id,sku,name,unit,sheet_model,sheet_series,sheet_thickness_mm,sheet_finish,categories(name),suppliers(name)";
  const response = await fetch(
    `${origin}/rest/v1/products?select=${encodeURIComponent(select)}&sku=eq.${encodeURIComponent(sku)}`,
    { headers: { apikey: service, Authorization: `Bearer ${service}` } },
  );
  if (!response.ok) {
    throw new Error(`rest products a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as ProductDbRow[];
}

/* ---------------------------------------------------------------- ecrane -- */

async function openNewProductForm(page: Page) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
  await expect(page.getByTestId("field-sheet")).toBeVisible();
}

async function pickSheet(page: Page, model: string, series: string, thickness: string) {
  await page.getByTestId("field-sheet-model").selectOption({ label: model });
  await page.getByTestId("field-sheet-series").selectOption({ label: series });
  await page.getByTestId("field-sheet-thickness").selectOption({ label: thickness });
}

/** Etichetele oferite de o lista, fara prima, care este indemnul. */
async function offered(page: Page, testId: string, prompt: string): Promise<string[]> {
  const labels = (await page.locator(`[data-testid="${testId}"] option`).allTextContents()).map((l) =>
    l.trim(),
  );
  expect(labels[0], `prima optiune din ${testId}`).toBe(prompt);
  return labels.slice(1);
}

function selectedLabel(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? "");
}

/** Trimite formularul si asteapta sa se inchida: salvarea s-a terminat. */
async function submitAndWaitClosed(page: Page) {
  await page.getByTestId("form-submit").click();
  await expect(async () => {
    const error = page.getByTestId("form-error");
    if ((await error.count()) > 0) {
      throw new Error(`formularul a raspuns cu eroare: ${await error.innerText()}`);
    }
    expect(await page.getByTestId("product-form").count()).toBe(0);
  }).toPass({ timeout: 60_000 });
}

async function openPanel(page: Page, sku: string) {
  await page.goto("/inventar");
  await page.locator(`[data-testid="product-row"][data-sku="${sku}"]`).click();
  await expect(page.getByTestId("product-panel")).toBeVisible();
}

function expectSheet(row: ProductDbRow, model: string, series: string, thicknessMm: number, finish: string) {
  expect(row.sheet_model, "sheet_model").toBe(model);
  expect(row.sheet_series, "sheet_series").toBe(series);
  expect(Number(row.sheet_thickness_mm), "sheet_thickness_mm").toBe(thicknessMm);
  expect(row.sheet_finish, "sheet_finish").toBe(finish);
}

test.describe("Tablă și țiglă metalică din lista Dasterum", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. modelul, seria și grosimea completează denumirea, unitatea, categoria și furnizorul", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const sku = `TEST-TABLA-CREARE-${RUN}`;
    await openNewProductForm(page);
    await expect(page.getByTestId("field-sheet")).toContainText("Tablă și țiglă metalică Dasterum");
    await pickSheet(page, "C-10", "Standart Zn", "0,45 mm");

    // INAINTE DE SALVARE: campurile completate de alegere.
    await expect(page.getByTestId("field-name")).toHaveValue("Tablă cutată C-10 Standart Zn 0,45 mm");
    await expect(page.getByTestId("field-unit")).toHaveValue("m2");
    await expect.poll(() => selectedLabel(page, "field-category")).toBe(CATEGORY);

    // DENUMIREA RAMANE A OPERATORULUI.
    const edited = `Tablă cutată C-10 Standart Zn 0,45 mm, lot ${RUN}`;
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill(edited);
    await submitAndWaitClosed(page);

    const [row] = await productsWithSku(sku);
    expect(row, "produsul creat").toBeTruthy();
    expect(row!.name).toBe(edited);
    expect(row!.unit).toBe("m2");
    expect(row!.categories?.name).toBe(CATEGORY);
    expect(row!.suppliers?.name).toBe("Dasterum");
    expectSheet(row!, "C-10", "Standart Zn", 0.45, "");

    // SI DUPA SALVARE: formularul de modificare schimba denumirea, nu combinatia.
    // P3-59: listele se vad si pe formularul de modificare, cu combinatia salvata.
    // Pana atunci linia de aici astepta ca ele sa lipseasca, adica exact defectul
    // raportat de Max pe 2026-09-16.
    await openPanel(page, sku);
    await page.getByTestId("panel-edit").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await expect(page.getByTestId("field-sheet")).toBeVisible();
    await expect.poll(() => selectedLabel(page, "field-sheet-thickness")).toBe("0,45 mm");
    const renamed = `Tablă C-10 redenumită ${RUN}`;
    await page.getByTestId("field-name").fill(renamed);
    await submitAndWaitClosed(page);

    const [after] = await productsWithSku(sku);
    expect(after!.id).toBe(row!.id);
    expect(after!.name).toBe(renamed);
    expectSheet(after!, "C-10", "Standart Zn", 0.45, "");
  });

  test("2. o grosime pe care seria nu o are nu este oferită", async ({ page }) => {
    await signIn(page, ownerAccount());
    await openNewProductForm(page);

    // Cele saisprezece modele, in ordinea listei.
    expect(await offered(page, "field-sheet-model", "Fără model")).toEqual([
      "PS-8", "C-10", "T-12", "C-15", "PK/PS-20", "VP-20", "HC-35", "C-44",
      "H-57", "H-60", "Monterrey", "Valencia", "Kascad", "Dastera", "Tablă netedă", "Foaie în folie",
    ]);
    await expect(page.getByTestId("field-sheet-series")).toBeDisabled();
    await expect(page.getByTestId("field-sheet-thickness")).toBeDisabled();

    // C-10, Econom: numai 0,30 si 0,40, cu finisajele lor. Nici 0,45, nici 0,50.
    await page.getByTestId("field-sheet-model").selectOption({ label: "C-10" });
    await page.getByTestId("field-sheet-series").selectOption({ label: "Econom" });
    expect(await offered(page, "field-sheet-thickness", "Alege grosimea")).toEqual([
      "0,30 mm",
      "0,40 mm",
      "0,40 mm, matt",
      "0,40 mm, W matt",
    ]);

    // T-12 nu are seria Econom; schimbarea modelului goleste seria si grosimea.
    await page.getByTestId("field-sheet-model").selectOption({ label: "T-12" });
    await expect(page.getByTestId("field-sheet-thickness")).toBeDisabled();
    expect(await offered(page, "field-sheet-series", "Alege seria")).toEqual([
      "AlZn Premium",
      "Standart Zn",
      "Premium Zn",
      "Printek Premium",
    ]);
    await page.getByTestId("field-sheet-series").selectOption({ label: "Standart Zn" });
    expect(await offered(page, "field-sheet-thickness", "Alege grosimea")).toEqual([
      "0,45 mm",
      "0,45 mm, Cr matt",
      "0,45 mm, W",
    ]);

    // H-57: o singura serie, o singura grosime.
    await page.getByTestId("field-sheet-model").selectOption({ label: "H-57" });
    expect(await offered(page, "field-sheet-series", "Alege seria")).toEqual(["Zinc (România/Turcia)"]);
    await page.getByTestId("field-sheet-series").selectOption({ label: "Zinc (România/Turcia)" });
    expect(await offered(page, "field-sheet-thickness", "Alege grosimea")).toEqual(["0,70 mm"]);
  });

  test("3. fiecare combinație aleasă este un produs al ei, cu SKU-ul lui", async ({ page }) => {
    await signIn(page, ownerAccount());

    const picks = [
      { sku: `TEST-TABLA-040-${RUN}`, label: "0,40 mm", mm: 0.4 },
      { sku: `TEST-TABLA-045-${RUN}`, label: "0,45 mm", mm: 0.45 },
    ];
    for (const pick of picks) {
      await openNewProductForm(page);
      await pickSheet(page, "C-10", "Standart Zn", pick.label);
      await expect(page.getByTestId("field-name")).toHaveValue(`Tablă cutată C-10 Standart Zn ${pick.label}`);
      await page.getByTestId("field-sku").fill(pick.sku);
      await submitAndWaitClosed(page);
    }

    const rows = [];
    for (const pick of picks) {
      const found = await productsWithSku(pick.sku);
      expect(found, `un singur produs pentru ${pick.sku}`).toHaveLength(1);
      expectSheet(found[0]!, "C-10", "Standart Zn", pick.mm, "");
      rows.push(found[0]!);
    }
    expect(rows[0]!.id).not.toBe(rows[1]!.id);
    expect(rows[0]!.sku).not.toBe(rows[1]!.sku);

    // Doua randuri in inventar, fiecare cu SKU-ul lui.
    await page.goto("/inventar");
    for (const pick of picks) {
      await expect(page.locator(`[data-testid="product-row"][data-sku="${pick.sku}"]`)).toHaveCount(1);
    }
  });
});
