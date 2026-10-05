import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// P3-142. Inventar arata o pagina de 50 de produse o data, cu butoane de pagina.
//
// CATALOGUL DE PE STIVA DE TEST ARE PESTE 50 DE PRODUSE: cele 80 de materiale incarcate de
// migratia 0049 (vezi load-80-materials.spec.ts), plus produsele de test ale celorlalte
// spec-uri. Nimic nu se creeaza si nu se sterge aici.

test.describe("P3-142: Inventar pe pagini", () => {
  test.describe.configure({ timeout: 90_000 });

  test("peste 50 de produse: Pagina 1 din N, Înainte duce la pagina 2 si adresa poarta pagina=2", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto("/inventar");

    const label = page.getByTestId("pager-label");
    await expect(label).toContainText("Pagina 1 din", { timeout: 20_000 });
    await expect(page.getByTestId("product-row")).toHaveCount(50);
    await expect(page.getByTestId("pager-range")).toContainText("Afișate 1-50 din");
    // Pe prima pagina nu exista "Înapoi" de apasat.
    await expect(page.getByTestId("pager-prev")).toBeDisabled();

    const firstOnPage1 = await page.getByTestId("product-row").first().getAttribute("data-sku");

    await page.getByTestId("pager-next").click();
    await expect(label).toContainText("Pagina 2 din", { timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]pagina=2(&|$)/);
    await expect(page.getByTestId("pager-range")).toContainText("Afișate 51-");
    const firstOnPage2 = await page.getByTestId("product-row").first().getAttribute("data-sku");
    expect(firstOnPage2, "pagina 2 are alte produse decat pagina 1").not.toBe(firstOnPage1);
    expect((firstOnPage2 ?? "") > (firstOnPage1 ?? ""), "ordinea este dupa SKU").toBe(true);

    // Reincarcarea pastreaza pagina: ea sta in adresa.
    await page.reload();
    await expect(label).toContainText("Pagina 2 din", { timeout: 20_000 });
    expect(await page.getByTestId("product-row").first().getAttribute("data-sku")).toBe(firstOnPage2);

    // "Înapoi" al aplicatiei si "Înapoi" al browserului duc la pagina 1.
    await page.getByTestId("pager-prev").click();
    await expect(label).toContainText("Pagina 1 din", { timeout: 20_000 });
    expect(await page.getByTestId("product-row").first().getAttribute("data-sku")).toBe(firstOnPage1);

    // Textele nu au nicio linie lunga (en dash sau em dash).
    const body = await page.getByTestId("list-pager").innerText();
    expect(body).not.toContain(String.fromCharCode(0x2013));
    expect(body).not.toContain(String.fromCharCode(0x2014));
  });

  test("schimbarea unui filtru intoarce lista la pagina 1, iar o pagina dincolo de capat arata ultima", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    await page.goto("/inventar?pagina=2");
    const label = page.getByTestId("pager-label");
    await expect(label).toContainText("Pagina 2 din", { timeout: 20_000 });

    // Un filtru nou sterge pagina din adresa. "toate" aduce si produsele inactive.
    await page.getByTestId("filter-visibility").selectOption("toate");
    await expect(page).not.toHaveURL(/pagina=/, { timeout: 20_000 });
    await expect(label).toContainText("Pagina 1 din", { timeout: 20_000 });

    // O adresa veche, cu o pagina care nu mai exista, arata ultima pagina, nu o lista goala.
    await page.goto("/inventar?pagina=9999");
    await expect(page.getByTestId("product-row").first()).toBeVisible({ timeout: 20_000 });
    const text = await label.innerText();
    const match = text.match(/^Pagina (\d+) din (\d+)$/);
    expect(match, `eticheta neasteptata: ${text}`).not.toBeNull();
    expect(match![1]).toBe(match![2]);
    await expect(page.getByTestId("pager-next")).toBeDisabled();
  });

  test("cautarea merge pe tot catalogul, nu doar pe pagina deschisa, si ascunde butoanele cand lista incape", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto("/inventar?pagina=2");
    await expect(page.getByTestId("pager-label")).toContainText("Pagina 2 din", { timeout: 20_000 });

    // Un produs din materialele incarcate (vezi load-80-materials.spec.ts). Sta pe pagina 1 sau
    // pe oricare alta; cautarea il gaseste oricum, iar lista scurta nu mai are pagini.
    await page.getByTestId("product-search").fill("BARCELONA ECO");
    await expect(page.getByTestId("list-pager")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId("product-row").first()).toBeVisible();
    await expect(page).not.toHaveURL(/pagina=/);
    await expect(page).toHaveURL(/[?&]q=BARCELONA/);
  });
});
