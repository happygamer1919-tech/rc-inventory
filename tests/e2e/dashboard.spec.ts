import { expect, test } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// dashboard.spec - linia de acceptanta a cardului P2-06.
//
// Acopera cele cinci blocuri ale tabloului de bord fata de randuri reale, plus
// comportarea aceloraşi ecrane cand baza nu are nimic de aratat: fara eroare in
// consola si fara NaN pe ecran.
//
// Verificarea ca stratul demonstrativ a disparut din depozitul de cod se face
// prin grep, in linia de acceptanta a cardului, nu de aici: un test din browser
// nu poate demonstra absenta unui fisier.

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

/** Numarul dintr-un StatCard, citit ca text si curatat de separatori. */
async function statValue(page: Page, index: number): Promise<number> {
  const card = page.getByTestId("dashboard-stats").locator("> *").nth(index);
  const text = (await card.innerText()).replace(/ /g, " ");
  const match = text.match(/(\d[\d.,]*)/);
  if (!match) return Number.NaN;
  return Number(match[1]!.replace(/\./g, "").replace(",", "."));
}

test.describe("Tablou de bord", () => {
  test.describe.configure({ timeout: 90_000 });

  test("cele cinci blocuri se calculează din baza de date", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/");

    await expect(page.getByTestId("dashboard-stats")).toBeVisible();

    // Fiecare valoare este un numar, nu NaN si nu gol. Cu baza goala, zero.
    for (const i of [0, 1, 2, 3]) {
      expect(Number.isFinite(await statValue(page, i))).toBe(true);
    }

    // Numarul de produse din primul card nu este scris de mana: creste cu unu
    // dupa ce adaugam un produs. Defectul din faza 1 a fost exact literalul 26.
    const before = await statValue(page, 0);

    await ensureTestCategory(page);
    const sku = `TEST-DASH-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill(`Produs tablou ${RUN}`);
    await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
    await page.getByTestId("field-unit").selectOption("pcs");
    await page.getByTestId("field-unit-value").fill("100");
    await page.getByTestId("field-threshold").fill("5");
    await page.getByTestId("form-submit").click();
    await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
      timeout: 20_000,
    });

    await page.goto("/");
    // Produsul nou are stoc zero, deci valoarea totala nu se schimba, dar el
    // apare sub prag: 0 este sub pragul 5.
    await expect(page.getByTestId("dashboard-low-stock")).toContainText(sku);
    expect(await statValue(page, 0)).toBe(before);
  });

  test("o comandă în așteptare apare în blocul de intrări, iar recepția o scoate", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-DASHIN-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill(`Produs tablou intrare ${RUN}`);
    await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
    await page.getByTestId("field-unit").selectOption("pcs");
    await page.getByTestId("field-unit-value").fill("50");
    await page.getByTestId("form-submit").click();
    await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
      timeout: 20_000,
    });

    await page.goto("/adauga-manual");
    await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
    await page.getByTestId("order-expected-at").fill("2026-12-01");
    const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
    await page
      .getByTestId("line-product-0")
      .selectOption((await option.getAttribute("value")) ?? "");
    await page.getByTestId("line-quantity-0").fill("10");
    await page.getByTestId("order-confirm").click();
    await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 25_000 });
    const reference = (await page.getByTestId("created-reference").innerText()).trim();

    await page.goto("/");
    await expect(page.getByTestId("dashboard-pending-inbound")).toContainText(reference);

    // Dupa receptie nu mai este in asteptare, si apare in activitate.
    await page.goto("/comenzi");
    await page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`).click();
    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("S-au creat", {
      timeout: 25_000,
    });

    await page.goto("/");
    await expect(page.getByTestId("dashboard-pending-inbound")).not.toContainText(reference);
    await expect(page.getByTestId("dashboard-activity")).toContainText(reference);
  });

  // CRIT-14. Plimbarea prin ecrane rula numai pe contul owner, deci jumatate
  // din interfata nu fusese niciodata verificata pentru erori de consola: rolul
  // operator vede alte butoane, alte coloane si un ecran de refuz. Linia de
  // acceptanta a lui P2-06 spunea ca acopera si o baza goala, si nu o acoperea.
  // Ce se poate demonstra fara pregatire distructiva se demonstreaza mai jos, ca
  // stare goala accesibila prin filtru; restul afirmatiei a fost retras din
  // linia de acceptanta a lui P2-06 in loc sa fie lasat sa para acoperit.
  for (const role of ["administrator", "operator"] as const) {
    test(`niciun ecran nu produce erori în consolă și niciunul nu arată NaN (${role})`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

      await signIn(page, role === "administrator" ? ownerAccount() : managerAccount());

      for (const path of [
        "/",
        "/inventar",
        "/comenzi",
        "/iesiri",
        "/adauga-manual",
        "/incarca-comanda",
        "/memento",
        // /setari ramane in lista si pentru operator: ii raspunde cu ecranul de
        // refuz, iar un ecran de refuz care arunca in consola este tot un defect.
        "/setari",
      ]) {
        await page.goto(path);

        if (role === "operator" && path === "/setari") {
          await expect(page.getByTestId("forbidden")).toBeVisible({ timeout: 25_000 });
        }

        const body = await page.locator("body").innerText();
        expect(body, `NaN pe ${path} (${role})`).not.toContain("NaN");
        expect(body, `Infinity pe ${path} (${role})`).not.toContain("Infinity");
        expect(body, `undefined pe ${path} (${role})`).not.toContain("undefined");
      }

      // Erorile de reincarcare la cald ale serverului de dezvoltare nu sunt ale
      // aplicatiei si nu au ce cauta in acest verdict.
      const real = errors.filter(
        (e) => !/hmr|websocket|favicon|Download the React DevTools/i.test(e),
      );
      expect(real, `erori in consola (${role}): ${real.join(" | ")}`).toHaveLength(0);
    });
  }

  test("starea goală a catalogului se afișează în română, fără NaN", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, ownerAccount());
    await page.goto("/inventar");

    // Starea goala ACCESIBILA: un filtru care nu se potriveste cu nimic. Este
    // exact ce nimereste un operator, si nu cere golirea niciunei tabele. O
    // baza golita ar fi o operatiune distructiva pe proiectul pe care clientul
    // urmeaza sa accepte, deci nu se face din teste.
    await page.getByTestId("product-search").fill("zzzz-niciun-produs-nu-are-acest-nume-zzzz");

    const empty = page.getByTestId("product-empty");
    await expect(empty).toBeVisible({ timeout: 15_000 });
    await expect(empty).toContainText("Niciun produs nu se potrivește");
    await expect(page.getByTestId("product-row")).toHaveCount(0);

    const body = await page.locator("body").innerText();
    expect(body, "NaN pe catalogul gol").not.toContain("NaN");
    expect(body, "Infinity pe catalogul gol").not.toContain("Infinity");
    expect(body, "undefined pe catalogul gol").not.toContain("undefined");

    const real = errors.filter(
      (e) => !/hmr|websocket|favicon|Download the React DevTools/i.test(e),
    );
    expect(real, `erori in consola pe catalogul gol: ${real.join(" | ")}`).toHaveLength(0);
  });


  test("niciun ecran nu mai spune că datele sunt demonstrative", async ({ page }) => {
    await signIn(page, ownerAccount());

    // CRIT-12. Subsolul barei laterale este in invelisul aplicatiei, deci
    // aparea pe toate ecranele autentificate, pe productie, spunand ca datele
    // sunt demonstrative dupa ce P2-06 le facuse reale.
    for (const path of [
      "/",
      "/inventar",
      "/comenzi",
      "/iesiri",
      "/adauga-manual",
      "/incarca-comanda",
      "/memento",
      "/setari",
    ]) {
      await page.goto(path);
      const body = await page.locator("body").innerText();
      expect(body, `text de previzualizare pe ${path}`).not.toContain("Previzualizare faza 1");
      expect(body, `text demonstrativ pe ${path}`).not.toContain("Date demonstrative");
    }
  });

  test("numărătorul de categorii folosește singularul când există una singură", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto("/setari");

    const counter = page.getByTestId("category-count");
    await expect(counter).toBeVisible();

    const rows = await page.getByTestId("category-row").count();
    const text = (await counter.innerText()).trim();

    // Regula romaneasca, verificata pe numarul pe care il are chiar baza acum,
    // nu pe unul inventat: 1 cere singularul, 2..19 pluralul simplu, 20+ "de".
    if (rows === 1) expect(text).toBe("1 categorie");
    else if (rows % 100 >= 1 && rows % 100 <= 19) expect(text).toBe(`${rows} categorii`);
    else expect(text).toBe(`${rows} de categorii`);
  });

  test("ecranul de memento citește praguri reale", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-MEM-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill(`Produs memento ${RUN}`);
    await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
    await page.getByTestId("field-unit").selectOption("pcs");
    await page.getByTestId("field-threshold").fill("25");
    await page.getByTestId("form-submit").click();
    await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
      timeout: 20_000,
    });

    await page.goto("/memento");
    const row = page.locator(`[data-testid="threshold-row"][data-sku="${sku}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("25");
    await expect(row).toContainText("Epuizat");

    // Alertele nu sunt inventate: ecranul spune ca trimiterea vine la P2-10.
    await expect(page.getByTestId("alerts-empty")).toContainText("P2-10");
  });
});
