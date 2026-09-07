import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// deviz-comparison.spec - linia de acceptanta a cardului P3-13c.
//
// Acopera exact ce numeste cardul: comparatia arata, pe produs, Estimat si Emis
// si Diferenta in CANTITATE si in MDL, sase valori pe rand; un produs estimat si
// neemis apare cu emis zero si nu se omite; un produs emis si neestimat apare ca
// Neprevazut si nu se omite; un rand in care Emis depaseste Estimat este
// SEMNALAT, iar semnul se vede fara sa fie deschis randul; subsolul poarta patru
// totaluri, totalul devizului in MDL, totalul emis in MDL, abaterea in MDL si
// abaterea procentuala, si fiecare se potriveste cu numarul calculat de mana; un
// deviz pe un proiect fara nicio iesire arata fiecare linie cu emis zero si o
// abatere egala cu minus totalul devizului; un proiect ale carui singure iesiri
// sunt de produse neestimate arata fiecare rand ca Neprevazut si un total emis
// corect; coloana de bani Estimat foloseste pretul INGHETAT de pe linie iar
// coloana Emis foloseste valoarea din catalogul de azi, si schimbarea pretului
// din catalog o misca pe a doua si nu pe prima; fiecare sir vizibil este
// romanesc.
//
// DATELE VIN DIN scripts/seed-test-deviz-comparison.mjs SI SUNT FIXE.
// Aritmetica este scrisa in capul acelui fisier si repetata aici, ca amandoua sa
// poata fi verificate de mana fara sa fie deschis celalalt.

const PROJECT_MAIN = "7e57c051-0000-4000-8000-0000000005c1";
const PROJECT_NO_ISSUES = "7e57c051-0000-4000-8000-0000000005c2";
const PROJECT_ONLY_UNPLANNED = "7e57c051-0000-4000-8000-0000000005c3";

// Proiectul 1, calculat de mana. Vezi capul scriptului de seed.
const EST_QTY = { "TEST-CMP-01": 10, "TEST-CMP-02": 5, "TEST-CMP-03": 3, "TEST-CMP-04": 0 };
const EMIS_QTY = { "TEST-CMP-01": 4, "TEST-CMP-02": 0, "TEST-CMP-03": 8, "TEST-CMP-04": 6 };
const DIF_QTY = { "TEST-CMP-01": -6, "TEST-CMP-02": -5, "TEST-CMP-03": 5, "TEST-CMP-04": 6 };
const EST_MDL = { "TEST-CMP-01": 1000, "TEST-CMP-02": 250, "TEST-CMP-03": 60, "TEST-CMP-04": 0 };
const EMIS_MDL = { "TEST-CMP-01": 480, "TEST-CMP-02": 0, "TEST-CMP-03": 200, "TEST-CMP-04": 180 };
const DIF_MDL = { "TEST-CMP-01": -520, "TEST-CMP-02": -250, "TEST-CMP-03": 140, "TEST-CMP-04": 180 };

const TOTAL_DEVIZ = 1310; // 1000 + 250 + 60, adaosul in afara
const TOTAL_EMIS = 860; // 480 + 200 + 180
const ABATERE = -450; // 860 - 1310
const ABATERE_PCT = -34.35; // -450 / 1310 * 100 = -34.351145..., la ban

const SKUS = ["TEST-CMP-01", "TEST-CMP-02", "TEST-CMP-03", "TEST-CMP-04"] as const;

async function comparisonTab(page: Page, projectId: string) {
  await page.goto(`/proiecte/${projectId}?fila=comparatie`);
  await expect(page.getByTestId("panel-comparatie")).toBeVisible({ timeout: 25_000 });
}

/** Valoarea afisata, citita din atributul de date si nu din textul formatat.
 *
 *  Textul trece prin Intl si contine spatii insecabile, deci o comparatie pe
 *  sirul afisat ar cadea pe formatare in loc sa cada pe aritmetica. Acelasi
 *  tipar ca in deviz.spec si in project-cost.spec. */
async function attr(page: Page, testId: string, name: string): Promise<number> {
  const raw = await page.getByTestId(testId).getAttribute(name);
  return Number(raw);
}

test.describe("Deviz față de realitate", () => {
  test.describe.configure({ timeout: 120_000 });

  test("șase valori pe rând, în cantitate și în MDL, calculate de mână", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    for (const sku of SKUS) {
      await expect(page.getByTestId(`comparison-row-${sku}`)).toBeVisible();
      expect(await attr(page, `comparison-est-qty-${sku}`, "data-qty")).toBe(EST_QTY[sku]);
      expect(await attr(page, `comparison-emis-qty-${sku}`, "data-qty")).toBe(EMIS_QTY[sku]);
      expect(await attr(page, `comparison-dif-qty-${sku}`, "data-qty")).toBe(DIF_QTY[sku]);
      expect(await attr(page, `comparison-est-mdl-${sku}`, "data-value-mdl")).toBe(EST_MDL[sku]);
      expect(await attr(page, `comparison-emis-mdl-${sku}`, "data-value-mdl")).toBe(EMIS_MDL[sku]);
      expect(await attr(page, `comparison-dif-mdl-${sku}`, "data-value-mdl")).toBe(DIF_MDL[sku]);
    }
  });

  test("un produs estimat și neemis apare cu emis zero și NU se omite", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    const row = page.getByTestId("comparison-row-TEST-CMP-02");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-kind", "estimated_only");
    expect(await attr(page, "comparison-emis-qty-TEST-CMP-02", "data-qty")).toBe(0);
    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-02", "data-value-mdl")).toBe(0);
    // Estimatul lui este intreg, deci randul chiar poarta informatie.
    expect(await attr(page, "comparison-est-qty-TEST-CMP-02", "data-qty")).toBe(5);
  });

  test("un produs emis și neestimat apare ca Neprevăzut și NU se omite", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    const row = page.getByTestId("comparison-row-TEST-CMP-04");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-kind", "unplanned");
    await expect(page.getByTestId("comparison-neprevazut-TEST-CMP-04")).toContainText("Neprevăzut");
    expect(await attr(page, "comparison-est-qty-TEST-CMP-04", "data-qty")).toBe(0);
    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-04", "data-value-mdl")).toBe(180);
  });

  test("Emis peste Estimat este semnalat, și semnul se vede fără să fie deschis rândul", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    // FARA NICIUN CLIC: semnul este vizibil pe rand asa cum vine pagina.
    await expect(page.getByTestId("comparison-depasire-TEST-CMP-03")).toBeVisible();
    await expect(page.getByTestId("comparison-depasire-TEST-CMP-03")).toContainText("Depășire");

    // Si randul care NU depaseste nu poarta semnul.
    await expect(page.getByTestId("comparison-depasire-TEST-CMP-01")).toHaveCount(0);
  });

  test("subsolul poartă patru totaluri, fiecare egal cu numărul calculat de mână", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    expect(await attr(page, "comparison-total-deviz", "data-value-mdl")).toBe(TOTAL_DEVIZ);
    expect(await attr(page, "comparison-total-emis", "data-value-mdl")).toBe(TOTAL_EMIS);
    expect(await attr(page, "comparison-abatere", "data-value-mdl")).toBe(ABATERE);
    expect(await attr(page, "comparison-abatere-pct", "data-percent")).toBe(ABATERE_PCT);

    // ADAOSUL ESTE IN AFARA COMPARATIEI SI ECRANUL O SPUNE, ca subsolul de aici
    // si totalul de pe fila Deviz sa poata fi reconciliate in loc sa para ca se
    // contrazic.
    expect(await attr(page, "comparison-adaos", "data-value-mdl")).toBe(131);
    await expect(page.getByTestId("comparison-adaos-note")).toContainText("fără adaos");
  });

  test("un deviz pe un proiect fără nicio ieșire: totul zero emis, abaterea minus totalul", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_NO_ISSUES);

    expect(await attr(page, "comparison-est-qty-TEST-CMP-01", "data-qty")).toBe(2);
    expect(await attr(page, "comparison-emis-qty-TEST-CMP-01", "data-qty")).toBe(0);
    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-01", "data-value-mdl")).toBe(0);

    expect(await attr(page, "comparison-total-deviz", "data-value-mdl")).toBe(200);
    expect(await attr(page, "comparison-total-emis", "data-value-mdl")).toBe(0);
    expect(await attr(page, "comparison-abatere", "data-value-mdl")).toBe(-200);
    expect(await attr(page, "comparison-abatere-pct", "data-percent")).toBe(-100);
  });

  test("un proiect ale cărui singure ieșiri sunt neestimate: fiecare rând Neprevăzut", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_ONLY_UNPLANNED);

    const rows = page.locator('[data-testid^="comparison-row-"]');
    await expect(rows).toHaveCount(2);
    // FIECARE rand, nu doar unul.
    await expect(page.locator('[data-testid^="comparison-row-"][data-kind="unplanned"]')).toHaveCount(2);

    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-05", "data-value-mdl")).toBe(70);
    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-06", "data-value-mdl")).toBe(120);
    expect(await attr(page, "comparison-total-emis", "data-value-mdl")).toBe(190);
    expect(await attr(page, "comparison-total-deviz", "data-value-mdl")).toBe(0);

    // UN DEVIZ DE ZERO ARATA O LINIUTA, NU O IMPARTIRE LA ZERO.
    await expect(page.getByTestId("comparison-abatere-pct")).toHaveText("-");
  });

  test("Estimat folosește prețul înghețat, Emis folosește catalogul de azi", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    // Inainte: 4 bucati la 120.00 din catalog.
    expect(await attr(page, "comparison-est-mdl-TEST-CMP-01", "data-value-mdl")).toBe(1000);
    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-01", "data-value-mdl")).toBe(480);

    // Catalogul se schimba PRIN ECRAN, 120.00 -> 150.00.
    await page.goto("/inventar");
    const row = page.locator('[data-testid="product-row"][data-sku="TEST-CMP-01"]');
    await expect(row).toBeVisible({ timeout: 25_000 });
    await row.click();
    await expect(page.getByTestId("product-panel")).toBeVisible();
    await page.getByTestId("panel-edit").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await page.getByTestId("field-unit-value").fill("150");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("product-form")).toHaveCount(0, { timeout: 25_000 });

    await comparisonTab(page, PROJECT_MAIN);

    // EMIS S-A MISCAT: 4 ori 150.00.
    expect(await attr(page, "comparison-emis-mdl-TEST-CMP-01", "data-value-mdl")).toBe(600);
    // ESTIMATUL NU: pretul de pe linie este inghetat la ofertare.
    expect(await attr(page, "comparison-est-mdl-TEST-CMP-01", "data-value-mdl")).toBe(1000);

    // Si catalogul se pune la loc, ca celelalte cazuri sa nu depinda de ordinea
    // in care ruleaza. Un test care lasa baza schimbata este un test care trece
    // o singura data.
    await page.goto("/inventar");
    const again = page.locator('[data-testid="product-row"][data-sku="TEST-CMP-01"]');
    await expect(again).toBeVisible({ timeout: 25_000 });
    await again.click();
    await page.getByTestId("panel-edit").click();
    await page.getByTestId("field-unit-value").fill("120");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("product-form")).toHaveCount(0, { timeout: 25_000 });
  });

  test("care versiune se compară este spus pe față, și fiecare șir este românesc", async ({ page }) => {
    await signIn(page, ownerAccount());
    await comparisonTab(page, PROJECT_MAIN);

    await expect(page.getByTestId("comparison-versiune")).toContainText("Versiunea comparată");
    await expect(page.getByTestId("comparison-versiune")).toContainText("Versiunea 1");

    // Antetele de coloana, in romana cu diacritice.
    const panel = page.getByTestId("panel-comparatie");
    for (const label of [
      "Deviz față de realitate",
      "Estimat, cantitate",
      "Emis, cantitate",
      "Diferență, cantitate",
      "Estimat, valoare",
      "Emis, valoare",
      "Diferență, valoare",
      "Total materiale estimate",
      "Total emis",
      "Abatere",
      "Abatere procentuală",
    ]) {
      await expect(panel).toContainText(label);
    }

    // P3-13d. NUMELE VECHI NU SE MAI POATE INTOARCE NEOBSERVAT.
    //
    // Subsolul aduna coloana Estimat, care este materialul la pretul ofertat,
    // FARA adaos. Se numea "Total deviz", exact ca totalul de pe fila Deviz,
    // care INCLUDE adaosul. O redenumire care lasa testul verificand sirul vechi
    // este o redenumire care nu s-a intamplat, deci se cere si absenta lui.
    await expect(panel).not.toContainText("Total deviz");

    // NICIUN SIR ENGLEZESC PE ECRAN. Cuvintele cautate sunt cele pe care le-ar
    // produce o traducere uitata in exact acest ecran.
    const text = (await panel.innerText()).toLowerCase();
    for (const english of ["estimated", "issued", "variance", "difference", "unplanned", "total deviation"]) {
      expect(text).not.toContain(english);
    }
  });
});
