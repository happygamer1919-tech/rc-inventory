import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// outbound.spec - linia de acceptanta a cardului P2-05.
//
// Acopera exact ce numeste cardul: combobox-ul filtreaza produse reale din baza
// si potriveste fara diacritice; o iesire valida persista si SCADE stocul
// calculat exact cu cantitatea eliberata; o cantitate peste stocul disponibil
// este refuzata cu mesajul romanesc; marcarea ca Expediată scrie un rand de
// istoric.
//
// Fiecare test isi pregateste propriul stoc: creeaza un produs, o comanda de
// intrare si o receptie. Asa cantitatile sunt cunoscute exact si niciun test nu
// depinde de ce a lasat altul in urma.

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

/** Creeaza un produs cu stoc receptionat. Intoarce SKU-ul si denumirea. */
async function productWithStock(page: Page, tag: string, quantity: string, name?: string) {
  const sku = `TEST-OUT-${tag}-${RUN}`;
  // Numele trebuie sa fie unic pe rulare, nu doar SKU-ul. Comboboxul cauta dupa
  // DENUMIRE, iar datele de test nu se sterg niciodata: un nume repetat face ca
  // rularea de azi sa aleaga produsul rularii de ieri, deja golit de stoc, si
  // testul pica aratand un stoc care nu are legatura cu ce a creat el.
  const productName = name ?? `Produs ieșire ${tag} ${RUN}`;

  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(productName);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });

  // Comanda de intrare, apoi receptie: asa apare stocul.
  await page.goto("/adauga-manual");
  await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  const option = page.getByTestId("line-product-0").locator("option").filter({ hasText: sku });
  await page.getByTestId("line-product-0").selectOption((await option.getAttribute("value")) ?? "");
  await page.getByTestId("line-quantity-0").fill(quantity);
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
  const reference = (await page.getByTestId("created-reference").innerText()).trim();

  await page.goto("/comenzi");
  await page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`).click();
  await page.getByTestId("receive-order").click();
  await expect(page.getByTestId("receive-notice")).toContainText("S-au creat", { timeout: 25_000 });

  return { sku, productName };
}

/** Stocul afisat pentru un SKU. "Epuizat" inseamna zero. */
async function stockFor(page: Page, sku: string): Promise<number> {
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1);
  const text = (await row.innerText()).replace(/ /g, " ");
  if (text.includes("Epuizat")) return 0;
  const match = text.match(/(\d[\d.,]*)\s*buc/);
  if (!match) return Number.NaN;
  return Number(match[1]!.replace(/\./g, "").replace(",", "."));
}

/** Scrie in comboboxul unei zone si alege prima optiune din lista portalata. */
async function comboPick(page: Page, testId: string, query: string) {
  const input = page.getByTestId(testId).locator("input");
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  // Exact o potrivire. Daca sunt mai multe, testul alege la intamplare intre
  // produse din rulari diferite si esueaza mai tarziu, aratand un stoc strain.
  await expect(list.locator("li")).toHaveCount(1);
  await list.locator("li").first().click();
}


// P3-04: destinatia nu mai este text liber. Randul vine din
// scripts/seed-test-crm.mjs, cu id fix, si este singurul proiect deschis din
// baza de test, deci comboPick gaseste exact o potrivire.
const TEST_PROJECT = "TEST Șantier E2E";
const TEST_CLIENT = "TEST Beneficiar E2E";

test.describe("Ieșiri materiale", () => {
  // Fiecare test isi construieste propriul stoc de la zero: produs, comanda de
  // intrare, receptie, apoi iesirea verificata. Sase navigari si patru scrieri
  // inainte de prima afirmatie, deci pragul implicit de 45 de secunde este
  // stramt pentru fisierul acesta.
  test.describe.configure({ timeout: 90_000 });

  test("comboboxul filtrează produse reale și potrivește fără diacritice", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku } = await productWithStock(page, "combo", "50", `Țiglă ieșire ${RUN}`);

    await page.goto("/iesiri");
    await expect(page.getByTestId("outbound-form")).toBeVisible();

    // Operatorul scrie fara diacritice. Defectul din faza 1, acum pe date reale.
    const input = page.getByTestId("issue-product-0").locator("input");
    await input.click();
    await input.fill("tigla iesire");
    const list = page.locator("[data-rc-combo-list]");
    await expect(list).toBeVisible({ timeout: 10_000 });
    await expect(list).toContainText(sku);
  });

  test("o ieșire validă persistă și scade stocul exact cu cantitatea eliberată", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithStock(page, "lower", "60");

    const before = await stockFor(page, sku);
    expect(before).toBe(60);

    await page.goto("/iesiri");
    await comboPick(page, "field-project", TEST_PROJECT);
    await comboPick(page, "issue-product-0", productName);
    await page.getByTestId("issue-quantity-0").fill("18");
    await page.getByTestId("issue-submit").click();

    await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
    const reference = (await page.getByTestId("issue-reference").innerText()).trim();
    expect(reference).toMatch(/^IES-\d{4}-\d{4}$/);

    // Stocul scade la CREARE, nu la expediere: materialul a plecat din depozit.
    expect(await stockFor(page, sku)).toBe(before - 18);

    // Si persista peste o reincarcare completa.
    await page.goto("/comenzi");
    await expect(
      page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`),
    ).toHaveCount(1);
  });

  // P3-04. Destinatia a incetat sa mai fie text liber.
  test("destinația este un proiect real, clientul se citește de pe el, iar fără proiect nu se poate crea", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithStock(page, "p304", "25");

    await page.goto("/iesiri");

    // 1. FARA PROIECT NU SE POATE. Asa se opreste multimea de iesiri fara
    //    destinatie din a mai creste, cat timp cele istorice sunt reconciliate.
    await comboPick(page, "issue-product-0", productName);
    await page.getByTestId("issue-quantity-0").fill("1");
    await page.getByTestId("issue-submit").click();
    await expect(page.getByTestId("issue-problems")).toContainText("Alege proiectul.");
    await expect(page.getByTestId("issue-created")).toHaveCount(0);

    // 2. CLIENTUL NU SE ALEGE, SE CITESTE DE PE PROIECT. Doua intrebari cu un
    //    singur raspuns ar fi doua feluri de a gresi.
    await expect(page.getByTestId("field-client")).toContainText("Se completează din proiect");
    await comboPick(page, "field-project", TEST_PROJECT);
    await expect(page.getByTestId("field-client")).toContainText(TEST_CLIENT);
    await expect(page.getByTestId("field-client")).toHaveAttribute("data-client", TEST_CLIENT);

    // 3. Si acum trece, iar confirmarea arata aceeasi pereche.
    await page.getByTestId("issue-submit").click();
    await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("issue-created")).toContainText(TEST_PROJECT);
    await expect(page.getByTestId("issue-created")).toContainText(TEST_CLIENT);
    expect(sku).toMatch(/^TEST-/);
  });

  test("o cantitate peste stocul disponibil este refuzată cu mesajul românesc", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithStock(page, "over", "12");

    await page.goto("/iesiri");
    await comboPick(page, "field-project", TEST_PROJECT);
    await comboPick(page, "issue-product-0", productName);
    await page.getByTestId("issue-quantity-0").fill("999");

    // Indiciul de sub linie avertizeaza imediat.
    await expect(page.getByTestId("issue-stock-hint-0")).toContainText("Stoc insuficient");

    await page.getByTestId("issue-submit").click();

    // Si crearea este REFUZATA, nu doar avertizata.
    await expect(page.getByTestId("issue-problems")).toContainText("Stoc insuficient");
    await expect(page.getByTestId("issue-created")).toHaveCount(0);

    // Stocul nu s-a clintit.
    expect(await stockFor(page, sku)).toBe(12);
  });

  test("suma pe produs este verificată, nu fiecare linie separat", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithStock(page, "split", "30");

    await page.goto("/iesiri");
    await comboPick(page, "field-project", TEST_PROJECT);
    await comboPick(page, "issue-product-0", productName);
    await page.getByTestId("issue-quantity-0").fill("20");

    // A doua linie, acelasi produs: 20 + 20 depaseste 30 desi fiecare linie
    // singura ar trece. Impartirea pe linii nu este o portita.
    await page.getByTestId("issue-add-line").click();
    await comboPick(page, "issue-product-1", productName);
    await page.getByTestId("issue-quantity-1").fill("20");

    await page.getByTestId("issue-submit").click();
    await expect(page.getByTestId("issue-problems")).toContainText("Stoc insuficient");
    await expect(page.getByTestId("issue-created")).toHaveCount(0);
    expect(await stockFor(page, sku)).toBe(30);
  });

  test("marcarea ca Expediată scrie un rând de istoric", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { productName } = await productWithStock(page, "ship", "15");

    await page.goto("/iesiri");
    await comboPick(page, "field-project", TEST_PROJECT);
    await comboPick(page, "issue-product-0", productName);
    await page.getByTestId("issue-quantity-0").fill("5");
    await page.getByTestId("issue-submit").click();
    await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
    const reference = (await page.getByTestId("issue-reference").innerText()).trim();

    await page.goto("/comenzi");
    await page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`).click();
    await expect(page.getByTestId("outbound-panel")).toBeVisible();

    // Crearea a scris deja primul rand.
    await expect(page.getByTestId("outbound-history-event")).toHaveCount(1);

    await page.getByTestId("ship-issue").click();
    await expect(page.getByTestId("ship-notice")).toContainText("Expediere confirmată", {
      timeout: 25_000,
    });
    await expect(page.getByTestId("outbound-history-event")).toHaveCount(2);
    await expect(page.getByTestId("outbound-history")).toContainText("Expediată");
  });

  test("prețul este opțional și lipsa lui se afișează ca fără preț", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { productName } = await productWithStock(page, "noprice", "9");

    await page.goto("/iesiri");
    await comboPick(page, "field-project", TEST_PROJECT);
    await comboPick(page, "issue-product-0", productName);
    await page.getByTestId("issue-quantity-0").fill("2");
    // Pretul ramane gol deliberat: eliberare netarifata catre santier propriu.
    await page.getByTestId("issue-submit").click();
    await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
    const reference = (await page.getByTestId("issue-reference").innerText()).trim();

    await page.goto("/comenzi");
    await page.locator(`[data-testid="outbound-item"][data-reference="${reference}"]`).click();
    await expect(page.getByTestId("outbound-lines")).toContainText("fără preț");
  });
});
