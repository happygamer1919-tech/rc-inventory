import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// product-sheet-locked-hint.spec - linia de acceptanta a cardului P3-61.
//
// Defectul raportat de Max pe 2026-09-16: "cand incerc sa selectez dintre serie si
// grosime apas si nu se intampla nimic". Blocarea este voita (Serie asteapta
// modelul, Grosime asteapta seria), dar ecranul nu spunea nici ca lista e blocata,
// nici de ce. Cele cinci cazuri ale cardului, in ordinea lui:
//   1. fara model, Serie arata "Alege întâi modelul" si lista arata blocata;
//   2. dupa model, Serie se deblocheaza si indemnul dispare;
//   3. cu model si fara serie, Grosime arata "Alege întâi seria" si arata blocata;
//   4. dupa serie, Grosime se deblocheaza si indemnul dispare;
//   5. alegerea unei combinatii si salvarea merg ca inainte, iar stilul de blocare
//      nu ajunge pe Model sau pe o lista din afara alegerii.
//
// "ARATA BLOCATA" SE VERIFICA PE STIL, NU NUMAI PE ATRIBUT: atributul disabled
// exista si inainte de P3-61, si tocmai de aceea lista parea stricata.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07. Produsul creat
// aici poarta prefixul TEST- in SKU.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const LOCKED_CLASS = /(^|\s)disabled:opacity-50(\s|$)/;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "product-sheet-locked-hint.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'. Local: supabase status -o env.",
    );
  }
  return { origin: new URL(url).origin, service };
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
  const { origin, service } = env();
  const select = "id,name,sheet_model,sheet_series,sheet_thickness_mm,sheet_finish";
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

/* ---------------------------------------------------------------- ecrane -- */

async function openNewProductForm(page: Page) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
  await expect(page.getByTestId("field-sheet")).toBeVisible();
}

/** Campul (eticheta Field) care tine lista cu acest data-testid. */
function fieldOf(page: Page, testId: string): Locator {
  return page.locator("label", { has: page.getByTestId(testId) });
}

function style(select: Locator, property: "opacity" | "cursor"): Promise<string> {
  return select.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
}

/** Blocata SI vazut blocata: atributul, clasa si stilul calculat. */
async function expectLocked(page: Page, testId: string, hint: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeDisabled();
  await expect(select).toHaveClass(LOCKED_CLASS);
  await expect.poll(() => style(select, "opacity")).toBe("0.5");
  await expect.poll(() => style(select, "cursor")).toBe("not-allowed");
  await expect(fieldOf(page, testId)).toContainText(hint);
}

/** Deblocata: indemnul a disparut si campul arata ca vecinul lui, Model, fara rand sub lista. */
async function expectUnlocked(page: Page, testId: string, hint: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeEnabled();
  await expect.poll(() => style(select, "opacity")).toBe("1");
  await expect(fieldOf(page, testId)).not.toContainText(hint);
  await expect(fieldOf(page, testId).locator(":scope > span")).toHaveCount(1);
}

test.describe("Serie și Grosime spun de ce sunt blocate", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. fără model, Serie arată Alege întâi modelul și arată blocată", async ({ page }) => {
    await signIn(page, ownerAccount());
    await openNewProductForm(page);

    await expect(page.getByTestId("field-sheet-model")).toHaveValue("");
    await expectLocked(page, "field-sheet-series", "Alege întâi modelul");
  });

  test("2. după model, Serie se deblochează și îndemnul dispare", async ({ page }) => {
    await signIn(page, ownerAccount());
    await openNewProductForm(page);

    await page.getByTestId("field-sheet-model").selectOption({ label: "C-10" });
    await expectUnlocked(page, "field-sheet-series", "Alege întâi modelul");

    // Inapoi la Fără model: blocarea si explicatia revin.
    await page.getByTestId("field-sheet-model").selectOption({ label: "Fără model" });
    await expectLocked(page, "field-sheet-series", "Alege întâi modelul");
  });

  test("3. cu model și fără serie, Grosime arată Alege întâi seria și arată blocată", async ({ page }) => {
    await signIn(page, ownerAccount());
    await openNewProductForm(page);

    // Si fara model Grosime este blocata si spune ce lipseste imediat deasupra ei.
    await expectLocked(page, "field-sheet-thickness", "Alege întâi seria");

    await page.getByTestId("field-sheet-model").selectOption({ label: "C-10" });
    await expect(page.getByTestId("field-sheet-series")).toHaveValue("");
    await expectLocked(page, "field-sheet-thickness", "Alege întâi seria");
  });

  test("4. după serie, Grosime se deblochează și îndemnul dispare", async ({ page }) => {
    await signIn(page, ownerAccount());
    await openNewProductForm(page);

    await page.getByTestId("field-sheet-model").selectOption({ label: "C-10" });
    await page.getByTestId("field-sheet-series").selectOption({ label: "Standart Zn" });
    await expectUnlocked(page, "field-sheet-thickness", "Alege întâi seria");
  });

  test("5. alegerea și salvarea merg ca înainte, iar stilul de blocare rămâne numai pe Serie și Grosime", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await openNewProductForm(page);

    await expect(page.getByTestId("field-sheet-model")).not.toHaveClass(LOCKED_CLASS);
    await expect(page.getByTestId("field-category")).not.toHaveClass(LOCKED_CLASS);

    const sku = `TEST-TABLA-BLOCARE-${RUN}`;
    await page.getByTestId("field-sheet-model").selectOption({ label: "C-10" });
    await page.getByTestId("field-sheet-series").selectOption({ label: "Standart Zn" });
    await page.getByTestId("field-sheet-thickness").selectOption({ label: "0,45 mm" });
    await expect(page.getByTestId("field-name")).toHaveValue("Tablă cutată C-10 Standart Zn 0,45 mm");
    await page.getByTestId("field-sku").fill(sku);

    await page.getByTestId("form-submit").click();
    await expect(async () => {
      const error = page.getByTestId("form-error");
      if ((await error.count()) > 0) {
        throw new Error(`formularul a raspuns cu eroare: ${await error.innerText()}`);
      }
      expect(await page.getByTestId("product-form").count()).toBe(0);
    }).toPass({ timeout: 60_000 });

    const row = await productWithSku(sku);
    expect(row.name).toBe("Tablă cutată C-10 Standart Zn 0,45 mm");
    expect(row.sheet_model, "sheet_model").toBe("C-10");
    expect(row.sheet_series, "sheet_series").toBe("Standart Zn");
    expect(Number(row.sheet_thickness_mm), "sheet_thickness_mm").toBe(0.45);
    expect(row.sheet_finish, "sheet_finish").toBe("");
  });
});
