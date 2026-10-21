import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-332. Un singur cititor de numere pe formularele produsului si receptiei (comanda de
// intrare), pe ecran si pe server. Aceleasi texte ca la tejghea: "1.250" este 1250, "1 250" se
// citeste, valoarea citita se vede ("Citit: ..."), iar mai mult de 2 zecimale la bani se refuza
// in romana, pe ecran si de catre server. Cazurile pe functii, pentru fiecare formular, sunt in
// tests/e2e/one-number-reader.spec.ts.
//
// DATELE DE TEST NU SE STERG. Produsele poarta prefixul TEST- si raman in baza.

const TEST_CATEGORY = "TEST-Categorie";
const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

type Page = import("@playwright/test").Page;

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

function rowForSku(page: Page, sku: string) {
  return page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
}

test.describe("P3-332: un singur cititor de numere pe formulare", () => {
  test("formularul de produs citeste valoarea unitara si pragul ca la tejghea si refuza zecimalele in plus", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-ONR-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill("Produs un singur cititor");
    await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });

    // 1.250 este 1250 (nu 1,25), iar ecranul spune ce a citit.
    await page.getByTestId("field-unit-value").fill("1.250");
    await expect(page.getByTestId("field-unit-value-read")).toHaveText("Citit: 1.250,00 MDL");
    await page.getByTestId("field-unit-value").fill("1,25");
    await expect(page.getByTestId("field-unit-value-read")).toHaveText("Citit: 1,25 MDL");

    // A treia zecimala la bani: refuzata pe ecran, iar serverul spune acelasi lucru.
    await page.getByTestId("field-unit-value").fill("1,255");
    await expect(page.getByTestId("field-unit-value-error")).toHaveText(
      "Valoarea unitară are cel mult 2 zecimale.",
    );
    await expect(page.getByTestId("field-unit-value-read")).toHaveCount(0);
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("form-error")).toContainText(
      "Valoarea unitară are cel mult 2 zecimale.",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("product-form")).toBeVisible();

    // Pragul nu ghiceste: 1.250 poate fi 1,25 sau 1250, deci se refuza; "1 250" se citeste.
    await page.getByTestId("field-unit-value").fill("1 250");
    await page.getByTestId("field-threshold").fill("1.250");
    await expect(page.getByTestId("field-threshold-error")).toContainText("Cantitate neclară");
    await page.getByTestId("field-threshold").fill("1,2345");
    await expect(page.getByTestId("field-threshold-error")).toHaveText(
      "Pragul are cel mult 3 zecimale.",
    );
    await page.getByTestId("field-threshold").fill("2 000");
    await expect(page.getByTestId("field-threshold-error")).toHaveCount(0);

    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("product-form")).toHaveCount(0, { timeout: 20_000 });

    // Ce s-a salvat este ce a citit ecranul: 1250 si 2000, nu 1,25.
    await page.getByTestId("product-search").fill(sku);
    await expect(rowForSku(page, sku)).toHaveCount(1, { timeout: 20_000 });
    await rowForSku(page, sku).click();
    await expect(page.getByTestId("product-panel")).toBeVisible();
    await page.getByTestId("panel-edit").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await expect(page.getByTestId("field-unit-value")).toHaveValue("1250");
    await expect(page.getByTestId("field-threshold")).toHaveValue("2000");
  });

  test("receptia citeste cantitatea si pretul ca la tejghea si refuza zecimalele in plus", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    // Un produs de recepționat.
    const sku = `TEST-ONR-IN-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill("Produs receptie un singur cititor");
    await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
    await page.getByTestId("field-unit").selectOption("pcs");
    await page.getByTestId("field-unit-value").fill("10");
    await page.getByTestId("form-submit").click();
    await page.getByTestId("product-search").fill(sku);
    await expect(rowForSku(page, sku)).toHaveCount(1, { timeout: 20_000 });

    await page.goto("/adauga-manual");
    await expect(page.getByTestId("inbound-form")).toBeVisible();
    await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
    await page.getByTestId("order-expected-at").fill("2026-12-01");
    const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
    await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");

    // Pretul 1.250 este 1250 EUR (moneda comenzii), nu 1,25; cantitatea 1 250 este 1250.
    await page.getByTestId("line-quantity-0").fill("1 250");
    await page.getByTestId("line-price-0").fill("1.250");
    await expect(page.getByTestId("line-price-0-read")).toHaveText("Citit: 1.250,00 EUR");
    await expect(page.getByTestId("line-quantity-0-error")).toHaveCount(0);

    // Un pret cu trei zecimale opreste comanda, cu propozitia din romana.
    await page.getByTestId("line-price-0").fill("1,255");
    await expect(page.getByTestId("line-price-0-error")).toHaveText("Prețul are cel mult 2 zecimale.");
    await page.getByTestId("order-confirm").click();
    await expect(page.getByTestId("order-problems")).toContainText(
      "Poziția 1: Prețul are cel mult 2 zecimale.",
    );
    await expect(page.getByTestId("order-created")).toHaveCount(0);

    // O cantitate cu patru zecimale la fel.
    await page.getByTestId("line-price-0").fill("1.250");
    await page.getByTestId("line-quantity-0").fill("1,2345");
    await expect(page.getByTestId("line-quantity-0-error")).toHaveText(
      "Cantitatea are cel mult 3 zecimale.",
    );

    // Citite bine, se salveaza: 2,5 bucati la 1250 EUR.
    await page.getByTestId("line-quantity-0").fill("2,5");
    await page.getByTestId("order-confirm").click();
    await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
    const reference = (await page.getByTestId("created-reference").innerText()).trim();

    await page.goto("/comenzi");
    await page
      .locator(`[data-testid="inbound-item"][data-reference="${reference}"]`)
      .click();
    await expect(page.getByTestId("inbound-panel")).toBeVisible();
    await expect(page.getByTestId("inbound-lines")).toContainText("1.250");
  });
});
