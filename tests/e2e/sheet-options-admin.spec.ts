import { expect, request, test, type Page } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// sheet-options-admin.spec - linia de acceptanta a cardului P3-68.
//
// Cele cinci cazuri ale cardului, in ordinea lui:
//   1. proprietarul adauga o combinatie din /setari/tabla, iar formularul de produs
//      nou o ofera;
//   2. proprietarul schimba pretul ei, iar formularul completeaza noul pret;
//   3. proprietarul o retrage, formularul nu o mai ofera, iar randul ramane in
//      public.sheet_options cu retired_at completat;
//   4. un produs salvat cu o combinatie, combinatia apoi retrasa, se deschide in
//      formularul de modificare cu modelul, seria si grosimea lui si se salveaza;
//   5. operatorul primeste ecranul 403 pe /setari/tabla, iar cu propriul jeton nu
//      poate scrie direct in cele doua tabele.
//
// FIECARE CAZ ISI ADAUGA COMBINATIA LUI, cu un model TEST- propriu, ca un caz sa nu
// depinda de ordinea sau de reusita altuia.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07, si nici nu s-ar
// putea: nu exista drept de stergere pe aceste tabele. Fiecare combinatie creata aici
// are modelul si grupul de pret cu prefixul TEST-, iar roofing-product-prices.spec
// numara lista verificata fara ele.
//
// CE SE CITESTE DIN BAZA SE CITESTE CU CHEIA service_role a stivei LOCALE, ca in
// roofing-product-prices.spec: retired_at si coloanele produsului nu se vad pe ecran.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !service || !anon) {
    throw new Error(
      "sheet-options-admin.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service, anon };
}

async function rest(path: string): Promise<Record<string, unknown>[]> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!response.ok) {
    throw new Error(`rest ${path} a raspuns ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as Record<string, unknown>[];
}

type Combo = { model: string; series: string; thickness: string; finish: string; price: string };

/** O combinatie TEST- proprie cazului. Grosimea ca pe ecran: "0,55". */
function combo(tag: string, price: string): Combo {
  return { model: `TEST-${tag}-${RUN}`, series: "Econom Test", thickness: "0,55", finish: "matt", price };
}

/* ---------------------------------------------------------------- ecrane -- */

async function openAdmin(page: Page) {
  await page.goto("/setari/tabla");
  await expect(page.getByTestId("sheet-add-form")).toBeVisible({ timeout: 25_000 });
}

function adminRow(page: Page, c: Combo) {
  return page.locator(
    `[data-testid="sheet-option-row"][data-model="${c.model}"][data-series="${c.series}"]`,
  );
}

/** Adauga combinatia din ecranul din Setari si asteapta randul ei in tabel. */
async function addCombination(page: Page, c: Combo) {
  await openAdmin(page);
  await page.getByTestId("sheet-add-model").fill(c.model);
  await page.getByTestId("sheet-add-series").fill(c.series);
  await page.getByTestId("sheet-add-thickness").fill(c.thickness);
  await page.getByTestId("sheet-add-finish").fill(c.finish);
  await page.getByTestId("sheet-add-unit").selectOption("m2");
  await page.getByTestId("sheet-add-price").fill(c.price);
  await page.getByTestId("sheet-add-submit").click();
  await expect(async () => {
    const error = page.getByTestId("sheet-add-error");
    if ((await error.count()) > 0) throw new Error(`adaugarea a raspuns cu eroare: ${await error.innerText()}`);
    await expect(page.getByTestId("sheet-add-done")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await expect(adminRow(page, c)).toHaveCount(1, { timeout: 30_000 });
}

async function retireCombination(page: Page, c: Combo) {
  await openAdmin(page);
  const row = adminRow(page, c);
  await expect(row).toHaveAttribute("data-retired", "false");
  await row.getByTestId("sheet-option-retire").click();
  await expect(row).toHaveAttribute("data-retired", "true", { timeout: 30_000 });
  await expect(page.getByTestId("sheet-admin-error")).toHaveCount(0);
}

async function openNewProductForm(page: Page) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
  await expect(page.getByTestId("field-sheet")).toBeVisible();
}

function optionLabels(page: Page, testId: string): Promise<string[]> {
  return page
    .getByTestId(testId)
    .evaluate((el) => [...(el as HTMLSelectElement).options].map((o) => o.textContent?.trim() ?? ""));
}

function selectedLabel(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? "");
}

async function pickCombination(page: Page, c: Combo) {
  await page.getByTestId("field-sheet-model").selectOption({ label: c.model });
  await page.getByTestId("field-sheet-series").selectOption({ label: c.series });
  await page.getByTestId("field-sheet-thickness").selectOption({ label: `${c.thickness} mm, ${c.finish}` });
}

/** Trimite formularul de produs si asteapta sa se inchida: salvarea s-a terminat. */
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

type ProductDbRow = {
  id: string;
  name: string;
  sheet_model: string | null;
  sheet_series: string | null;
  sheet_thickness_mm: number | string | null;
  sheet_finish: string | null;
};

async function productWithSku(sku: string): Promise<ProductDbRow> {
  const select = "id,name,sheet_model,sheet_series,sheet_thickness_mm,sheet_finish";
  const rows = (await rest(
    `products?select=${encodeURIComponent(select)}&sku=eq.${encodeURIComponent(sku)}`,
  )) as unknown as ProductDbRow[];
  expect(rows, `un singur produs pentru ${sku}`).toHaveLength(1);
  return rows[0]!;
}

async function optionRow(c: Combo): Promise<Record<string, unknown>[]> {
  return rest(
    `sheet_options?select=model,series,thickness_mm,finish,retired_at` +
      `&model=eq.${encodeURIComponent(c.model)}&series=eq.${encodeURIComponent(c.series)}`,
  );
}

test.describe("Lista de modele, serii și grosimi, administrată din Setări", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. o combinație adăugată din Setări este oferită pe formularul de produs", async ({ page }) => {
    await signIn(page, ownerAccount());
    const c = combo("ADAUGA", "211");
    await addCombination(page, c);
    await expect(adminRow(page, c).getByTestId("sheet-option-price")).toHaveText("211 lei");

    // Aceeasi combinatie a doua oara: mesaj romanesc, nu o eroare Postgres.
    await page.getByTestId("sheet-add-model").fill(c.model);
    await page.getByTestId("sheet-add-series").fill(c.series);
    await page.getByTestId("sheet-add-thickness").fill(c.thickness);
    await page.getByTestId("sheet-add-finish").fill(c.finish);
    await page.getByTestId("sheet-add-submit").click();
    await expect(page.getByTestId("sheet-add-error")).toContainText("există deja în listă", {
      timeout: 30_000,
    });
    await expect(adminRow(page, c)).toHaveCount(1);

    await openNewProductForm(page);
    expect(await optionLabels(page, "field-sheet-model")).toContain(c.model);
    await pickCombination(page, c);
    await expect(page.getByTestId("field-unit-value")).toHaveValue("211");
  });

  test("2. prețul schimbat din Setări este cel sugerat pe formularul de produs", async ({ page }) => {
    await signIn(page, ownerAccount());
    const c = combo("PRET", "211");
    await addCombination(page, c);

    const row = adminRow(page, c);
    await row.getByTestId("sheet-option-price-edit").click();
    await row.getByTestId("sheet-option-price-input").fill("233,50");
    await row.getByTestId("sheet-option-price-save").click();
    await expect(row.getByTestId("sheet-option-price")).toHaveText("233,5 lei", { timeout: 30_000 });
    await expect(page.getByTestId("sheet-admin-error")).toHaveCount(0);

    const prices = await rest(
      `sheet_prices?select=price_lei&price_group=eq.${encodeURIComponent(c.model)}` +
        `&series=eq.${encodeURIComponent(c.series)}&thickness_mm=eq.0.55&finish=eq.${encodeURIComponent(c.finish)}`,
    );
    expect(prices).toHaveLength(1);
    expect(Number(prices[0]!.price_lei)).toBe(233.5);

    await openNewProductForm(page);
    await pickCombination(page, c);
    await expect(page.getByTestId("field-unit-value")).toHaveValue("233.5");
    await expect(page.getByTestId("field-unit-value-note")).toContainText("Dasterum");
  });

  test("3. o combinație retrasă nu mai este oferită și nu este ștearsă", async ({ page }) => {
    await signIn(page, ownerAccount());
    const c = combo("RETRAS", "190");
    await addCombination(page, c);

    await openNewProductForm(page);
    expect(await optionLabels(page, "field-sheet-model")).toContain(c.model);

    await retireCombination(page, c);

    await openNewProductForm(page);
    expect(await optionLabels(page, "field-sheet-model")).not.toContain(c.model);

    // Randul este inca in lista, marcat ca retras.
    const rows = await optionRow(c);
    expect(rows, "randul combinatiei retrase").toHaveLength(1);
    expect(rows[0]!.retired_at, "retired_at").not.toBeNull();

    // Si se poate reactiva.
    await openAdmin(page);
    await adminRow(page, c).getByTestId("sheet-option-reactivate").click();
    await expect(adminRow(page, c)).toHaveAttribute("data-retired", "false", { timeout: 30_000 });
    await openNewProductForm(page);
    expect(await optionLabels(page, "field-sheet-model")).toContain(c.model);
  });

  test("4. un produs care poartă o combinație retrasă se deschide și se salvează", async ({ page }) => {
    await signIn(page, ownerAccount());
    const c = combo("PRODUS", "150");
    await addCombination(page, c);

    const sku = `TEST-TABLA-RETRASA-${RUN}`;
    await openNewProductForm(page);
    await pickCombination(page, c);
    await page.getByTestId("field-sku").fill(sku);
    await submitAndWaitClosed(page);
    const before = await productWithSku(sku);
    expect(before.sheet_model).toBe(c.model);

    await retireCombination(page, c);

    // Formularul de modificare se deschide cu combinatia salvata aleasa.
    await page.goto("/inventar");
    await page.locator(`[data-testid="product-row"][data-sku="${sku}"]`).click();
    await expect(page.getByTestId("product-panel")).toBeVisible();
    await page.getByTestId("panel-edit").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await expect(page.getByTestId("field-sheet")).toBeVisible();
    await expect.poll(() => selectedLabel(page, "field-sheet-model")).toBe(c.model);
    await expect.poll(() => selectedLabel(page, "field-sheet-series")).toBe(c.series);
    await expect.poll(() => selectedLabel(page, "field-sheet-thickness")).toBe(`${c.thickness} mm, ${c.finish}`);

    // Si se salveaza, cu combinatia neschimbata.
    const renamed = `Tablă cu combinație retrasă ${RUN}`;
    await page.getByTestId("field-name").fill(renamed);
    await submitAndWaitClosed(page);

    const after = await productWithSku(sku);
    expect(after.name).toBe(renamed);
    expect(after.sheet_model).toBe(c.model);
    expect(after.sheet_series).toBe(c.series);
    expect(Number(after.sheet_thickness_mm)).toBe(0.55);
    expect(after.sheet_finish).toBe(c.finish);

    // Pe un produs NOU combinatia retrasa nu se mai ofera.
    await openNewProductForm(page);
    expect(await optionLabels(page, "field-sheet-model")).not.toContain(c.model);
  });

  test("5. operatorul nu ajunge la ecran și nu poate scrie în listă", async ({ page }) => {
    const manager = managerAccount();
    await signIn(page, manager);
    await page.goto("/setari/tabla");
    await expect(page.getByTestId("forbidden")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("sheet-add-form")).toHaveCount(0);

    // JUMATATEA DE BAZA DE DATE: cu jetonul operatorului, direct la PostgREST.
    const { origin, anon } = env();
    const api = await request.newContext({ baseURL: origin });
    const token = await api.post("/auth/v1/token?grant_type=password", {
      headers: { apikey: anon, "Content-Type": "application/json" },
      data: { email: manager.email, password: manager.password },
    });
    expect(token.ok()).toBe(true);
    const headers = {
      apikey: anon,
      Authorization: `Bearer ${(await token.json()).access_token as string}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const model = `TEST-OPERATOR-${RUN}`;
    const insertOption = await api.post("/rest/v1/sheet_options", {
      headers,
      data: {
        model,
        series: "Econom",
        thickness_mm: 0.45,
        finish: "",
        unit: "m2",
        price_group: model,
        sort_order: 900000,
      },
    });
    expect(insertOption.ok(), "operatorul a adaugat o combinatie").toBe(false);

    const insertPrice = await api.post("/rest/v1/sheet_prices", {
      headers,
      data: { price_group: model, series: "Econom", thickness_mm: 0.45, finish: "", price_lei: 100 },
    });
    expect(insertPrice.ok(), "operatorul a adaugat un pret").toBe(false);

    const retire = await api.patch(
      `/rest/v1/sheet_options?model=eq.C-10&series=eq.${encodeURIComponent("Standart Zn")}&thickness_mm=eq.0.45&finish=eq.`,
      { headers, data: { retired_at: new Date().toISOString() } },
    );
    if (retire.ok()) expect(await retire.json(), "randuri retrase de operator").toEqual([]);

    const reprice = await api.patch(
      `/rest/v1/sheet_prices?price_group=eq.C-10&series=eq.${encodeURIComponent("Standart Zn")}&thickness_mm=eq.0.45&finish=eq.`,
      { headers, data: { price_lei: 1 } },
    );
    if (reprice.ok()) expect(await reprice.json(), "preturi schimbate de operator").toEqual([]);
    await api.dispose();

    // Nimic nu s-a miscat: combinatia este oferita, pretul este cel al listei.
    const [option] = await rest(
      `sheet_options?select=retired_at&model=eq.C-10&series=eq.${encodeURIComponent("Standart Zn")}&thickness_mm=eq.0.45&finish=eq.`,
    );
    expect(option, "C-10 Standart Zn 0,45 mm").toBeTruthy();
    expect(option!.retired_at).toBeNull();
    const [price] = await rest(
      `sheet_prices?select=price_lei&price_group=eq.C-10&series=eq.${encodeURIComponent("Standart Zn")}&thickness_mm=eq.0.45&finish=eq.`,
    );
    expect(Number(price!.price_lei)).toBe(144);
    expect(await rest(`sheet_options?select=model&model=eq.${encodeURIComponent(model)}`)).toHaveLength(0);
  });
});
