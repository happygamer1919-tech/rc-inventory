import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// product-sheet-edit.spec - linia de acceptanta a cardului P3-59.
//
// Defectul raportat de Max pe 2026-09-16: pe un produs deja existent Model, Serie si
// Grosime nu se puteau modifica, fiindca formularul de modificare nu arata listele.
// Cele patru cazuri ale cardului, in ordinea lui:
//   1. formularul de modificare arata cele trei liste, precompletate cu combinatia
//      salvata, si nu rescrie denumirea sau pretul la deschidere;
//   2. o alta grosime a aceleiasi serii se alege, sugereaza pretul liniei ei ca la
//      adaugare, se salveaza si se regaseste la redeschidere;
//   3. Fără model goleste toate patru coloanele, iar formularul redeschis arata
//      Fără model, nu combinatia veche;
//   4. modificarea denumirii si a pretului lasa combinatia neschimbata.
//
// CE SE CITESTE DIN BAZA SE CITESTE CU CHEIA service_role a stivei LOCALE, ca in
// roofing-product-picker.spec: coloanele combinatiei nu se vad pe ecran.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07. Fiecare produs
// creat aici poarta prefixul TEST- in SKU.
//
// VALORILE ASTEPTATE SUNT SCRISE DE MANA, DIN LISTA VERIFICATA: C-10 Standart Zn are
// 0,40 mm la 126 lei si 0,45 mm la 144 lei.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "product-sheet-edit.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service };
}

type ProductDbRow = {
  id: string;
  sku: string;
  name: string;
  unit_value_mdl: number | string;
  sheet_model: string | null;
  sheet_series: string | null;
  sheet_thickness_mm: number | string | null;
  sheet_finish: string | null;
};

async function productWithSku(sku: string): Promise<ProductDbRow> {
  const { origin, service } = env();
  const select = "id,sku,name,unit_value_mdl,sheet_model,sheet_series,sheet_thickness_mm,sheet_finish";
  const response = await fetch(
    `${origin}/rest/v1/products?select=${encodeURIComponent(select)}&sku=eq.${encodeURIComponent(sku)}`,
    { headers: { apikey: service, Authorization: `Bearer ${service}` } },
  );
  if (!response.ok) {
    throw new Error(`rest products a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const rows = (await response.json()) as ProductDbRow[];
  expect(rows, `un singur produs pentru ${sku}`).toHaveLength(1);
  return rows[0]!;
}

function expectSheet(row: ProductDbRow, model: string, series: string, thicknessMm: number, finish: string) {
  expect(row.sheet_model, "sheet_model").toBe(model);
  expect(row.sheet_series, "sheet_series").toBe(series);
  expect(Number(row.sheet_thickness_mm), "sheet_thickness_mm").toBe(thicknessMm);
  expect(row.sheet_finish, "sheet_finish").toBe(finish);
}

/* ---------------------------------------------------------------- ecrane -- */

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

/** Un produs C-10 Standart Zn 0,45 mm, creat prin liste, cu o denumire proprie. */
async function createSheetProduct(page: Page, sku: string, name: string) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("field-sheet")).toBeVisible();
  await page.getByTestId("field-sheet-model").selectOption({ label: "C-10" });
  await page.getByTestId("field-sheet-series").selectOption({ label: "Standart Zn" });
  await page.getByTestId("field-sheet-thickness").selectOption({ label: "0,45 mm" });
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(name);
  await submitAndWaitClosed(page);
  const row = await productWithSku(sku);
  expectSheet(row, "C-10", "Standart Zn", 0.45, "");
  return row;
}

/** Deschide formularul de modificare al produsului, din panoul lui. */
async function openEditForm(page: Page, sku: string) {
  await page.goto("/inventar");
  await page.locator(`[data-testid="product-row"][data-sku="${sku}"]`).click();
  await expect(page.getByTestId("product-panel")).toBeVisible();
  await page.getByTestId("panel-edit").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
}

async function expectSheetLists(page: Page, model: string, series: string, thickness: string) {
  await expect(page.getByTestId("field-sheet")).toBeVisible();
  await expect.poll(() => selectedLabel(page, "field-sheet-model")).toBe(model);
  await expect.poll(() => selectedLabel(page, "field-sheet-series")).toBe(series);
  await expect.poll(() => selectedLabel(page, "field-sheet-thickness")).toBe(thickness);
}

test.describe("Modificarea modelului, seriei și grosimii pe un produs existent", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. formularul de modificare arată listele, precompletate cu combinația salvată", async ({ page }) => {
    await signIn(page, ownerAccount());
    const sku = `TEST-TABLA-EDIT-ARATA-${RUN}`;
    const name = `Tablă C-10 numită de operator ${RUN}`;
    await createSheetProduct(page, sku, name);

    await openEditForm(page, sku);
    await expectSheetLists(page, "C-10", "Standart Zn", "0,45 mm");
    await expect(page.getByTestId("field-sheet-series")).toBeEnabled();
    await expect(page.getByTestId("field-sheet-thickness")).toBeEnabled();

    // DESCHIDEREA NU RESCRIE NIMIC: denumirea operatorului si pretul salvat raman.
    await expect(page.getByTestId("field-name")).toHaveValue(name);
    await expect(page.getByTestId("field-unit-value")).toHaveValue("144");
    await expect(page.getByTestId("field-unit-value-note")).toHaveCount(0);
  });

  test("2. o altă grosime a aceleiași serii se salvează și se regăsește", async ({ page }) => {
    await signIn(page, ownerAccount());
    const sku = `TEST-TABLA-EDIT-GROSIME-${RUN}`;
    const created = await createSheetProduct(page, sku, `Tablă C-10 de schimbat ${RUN}`);

    await openEditForm(page, sku);
    await expectSheetLists(page, "C-10", "Standart Zn", "0,45 mm");
    await page.getByTestId("field-sheet-thickness").selectOption({ label: "0,40 mm" });
    // Alegerea NOUA sugereaza pretul liniei ei, ca la adaugare.
    await expect(page.getByTestId("field-unit-value")).toHaveValue("126");
    await submitAndWaitClosed(page);

    const row = await productWithSku(sku);
    expect(row.id).toBe(created.id);
    expectSheet(row, "C-10", "Standart Zn", 0.4, "");
    expect(Number(row.unit_value_mdl)).toBe(126);

    await openEditForm(page, sku);
    await expectSheetLists(page, "C-10", "Standart Zn", "0,40 mm");
  });

  test("3. Fără model golește combinația, iar formularul redeschis nu o mai arată", async ({ page }) => {
    await signIn(page, ownerAccount());
    const sku = `TEST-TABLA-EDIT-GOLESTE-${RUN}`;
    const name = `Tablă C-10 de golit ${RUN}`;
    const created = await createSheetProduct(page, sku, name);

    await openEditForm(page, sku);
    await expectSheetLists(page, "C-10", "Standart Zn", "0,45 mm");
    await page.getByTestId("field-sheet-model").selectOption({ label: "Fără model" });
    await submitAndWaitClosed(page);

    const row = await productWithSku(sku);
    expect(row.id).toBe(created.id);
    expect(row.sheet_model, "sheet_model").toBeNull();
    expect(row.sheet_series, "sheet_series").toBeNull();
    expect(row.sheet_thickness_mm, "sheet_thickness_mm").toBeNull();
    expect(row.sheet_finish, "sheet_finish").toBeNull();
    // Restul produsului ramane al lui.
    expect(row.name).toBe(name);

    await openEditForm(page, sku);
    await expectSheetLists(page, "Fără model", "Alege seria", "Alege grosimea");
    await expect(page.getByTestId("field-sheet-series")).toBeDisabled();
    await expect(page.getByTestId("field-sheet-thickness")).toBeDisabled();
  });

  test("4. modificarea denumirii și a prețului lasă combinația neschimbată", async ({ page }) => {
    await signIn(page, ownerAccount());
    const sku = `TEST-TABLA-EDIT-ALTCEVA-${RUN}`;
    const created = await createSheetProduct(page, sku, `Tablă C-10 inainte ${RUN}`);

    await openEditForm(page, sku);
    const renamed = `Tablă C-10 redenumită ${RUN}`;
    await page.getByTestId("field-name").fill(renamed);
    await page.getByTestId("field-unit-value").fill("150,50");
    await submitAndWaitClosed(page);

    const row = await productWithSku(sku);
    expect(row.id).toBe(created.id);
    expect(row.name).toBe(renamed);
    expect(Number(row.unit_value_mdl)).toBe(150.5);
    expectSheet(row, "C-10", "Standart Zn", 0.45, "");

    await openEditForm(page, sku);
    await expectSheetLists(page, "C-10", "Standart Zn", "0,45 mm");
  });
});
