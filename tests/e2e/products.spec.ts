import { expect, test } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// products.spec - linia de acceptanta a cardului P2-03.
//
// Acopera exact ce numeste cardul: catalogul listeaza randuri din baza; crearea
// persista si supravietuieste unei reincarcari; modificarea persista;
// dezactivarea scoate produsul din lista de selectie si il lasa in istoric; un
// SKU duplicat este refuzat cu mesaj romanesc.
//
// DATELE DE TEST NU SE STERG NICIODATA. Fiecare produs creat aici poarta
// prefixul TEST- in SKU si sfarseste DEZACTIVAT, niciodata sters, exact ca
// randurile marcate cancelled din conventia P2-07. Un DELETE scris pentru o baza
// de test este un DELETE care ajunge intr-o zi pe una reala.

const TEST_CATEGORY = "TEST-Categorie";

/** SKU unic pentru fiecare rulare, ca testele sa nu se incurce intre ele. */
function testSku(tag: string): string {
  return `TEST-${tag}-${process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36)}`;
}

async function ensureTestCategory(page: import("@playwright/test").Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

async function createProduct(
  page: import("@playwright/test").Page,
  opts: { sku: string; name: string; unit?: string; threshold?: string },
) {
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
  await page.getByTestId("field-sku").fill(opts.sku);
  await page.getByTestId("field-name").fill(opts.name);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  if (opts.unit) await page.getByTestId("field-unit").selectOption(opts.unit);
  if (opts.threshold) await page.getByTestId("field-threshold").fill(opts.threshold);
  await page.getByTestId("form-submit").click();
  await settled(page);
}

/**
 * Asteapta ca trimiterea formularului sa se termine, intr-un fel sau altul:
 * fie panoul se inchide (a reusit), fie apare eroarea (a esuat).
 *
 * Fara asta, un test care navigheaza imediat dupa click pleaca de pe pagina in
 * timp ce server action-ul inca ruleaza, iar randul lipseste dintr-un motiv care
 * nu are nimic de-a face cu aplicatia.
 */
async function settled(page: import("@playwright/test").Page) {
  await expect(async () => {
    const formGone = (await page.getByTestId("product-form").count()) === 0;
    const hasError = (await page.getByTestId("form-error").count()) > 0;
    expect(formGone || hasError).toBe(true);
  }).toPass({ timeout: 20_000 });
}

/** Randul catalogului pentru un SKU, indiferent de filtrul de vizibilitate. */
function rowForSku(page: import("@playwright/test").Page, sku: string) {
  return page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
}

test.describe("Catalog de produse", () => {
  test("catalogul listează rânduri din baza de date, nu din stratul demonstrativ", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = testSku("list");
    await createProduct(page, { sku, name: "Produs de listare" });

    await page.goto("/inventar");
    await expect(rowForSku(page, sku)).toHaveCount(1);

    // Stocul unui produs nou este zero, pentru ca stocul este suma loturilor si
    // nu a intrat inca nimic. Cardul P2-04 este cel care il misca.
    await expect(rowForSku(page, sku)).toContainText("Epuizat");
  });

  test("crearea persistă și supraviețuiește unei reîncărcări", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = testSku("persist");
    await createProduct(page, { sku, name: "Produs persistent", threshold: "12" });
    await expect(rowForSku(page, sku)).toHaveCount(1);

    // Reincarcare completa: daca ar fi stat intr-un store de browser, ar dispărea.
    await page.reload();
    await expect(rowForSku(page, sku)).toHaveCount(1);
    await expect(rowForSku(page, sku)).toContainText("Produs persistent");
  });

  test("modificarea persistă", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = testSku("edit");
    await createProduct(page, { sku, name: "Denumire inițială" });
    await expect(rowForSku(page, sku)).toHaveCount(1);

    await rowForSku(page, sku).click();
    await expect(page.getByTestId("product-panel")).toBeVisible();
    await page.getByTestId("panel-edit").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await page.getByTestId("field-name").fill("Denumire modificată");
    await page.getByTestId("form-submit").click();

    await expect(rowForSku(page, sku)).toContainText("Denumire modificată", { timeout: 15_000 });
    await page.reload();
    await expect(rowForSku(page, sku)).toContainText("Denumire modificată");
  });

  test("un SKU duplicat este refuzat cu mesaj românesc", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = testSku("dup");
    await createProduct(page, { sku, name: "Primul cu acest SKU" });
    await expect(rowForSku(page, sku)).toHaveCount(1);

    await createProduct(page, { sku, name: "Al doilea cu acelasi SKU" });

    const error = page.getByTestId("form-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText("Există deja un produs cu acest cod SKU.");
    // Niciun text brut de Postgres pe ecran.
    await expect(error).not.toContainText(/duplicate key|violates|constraint/i);

    // Formularul a ramas deschis, cu datele intacte, ca operatorul sa corecteze.
    await expect(page.getByTestId("product-form")).toBeVisible();
  });

  test("dezactivarea scoate produsul din lista de selecție și îl lasă în istoric", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = testSku("deact");
    await createProduct(page, { sku, name: "Produs de dezactivat" });
    await expect(rowForSku(page, sku)).toHaveCount(1);

    await rowForSku(page, sku).click();
    await page.getByTestId("panel-toggle-active").click();

    // Filtrul implicit arata doar produsele active: a disparut din selectie.
    await expect(rowForSku(page, sku)).toHaveCount(0, { timeout: 15_000 });

    // Dar exista in continuare, marcat inactiv. Nimic nu s-a sters.
    await page.getByTestId("filter-visibility").selectOption("inactive");
    await expect(rowForSku(page, sku)).toHaveCount(1);
    await expect(rowForSku(page, sku)).toContainText("Inactiv");

    await page.reload();
    await page.getByTestId("filter-visibility").selectOption("inactive");
    await expect(rowForSku(page, sku)).toHaveCount(1);
  });

  test("căutarea ignoră diacriticele", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = testSku("diacritic");
    await createProduct(page, { sku, name: "Țiglă metalică TEST" });
    await expect(rowForSku(page, sku)).toHaveCount(1);

    // Operatorul scrie repede si fara diacritice. Defectul din faza 1.
    await page.getByTestId("product-search").fill("tigla metalica");
    await expect(rowForSku(page, sku)).toHaveCount(1);
  });

  test("operatorul vede catalogul dar nu poate scrie", async ({ page }) => {
    await signIn(page, managerAccount());
    await page.goto("/inventar");

    // Citeste catalogul.
    await expect(page.getByTestId("product-count")).toBeVisible();
    // Nu are butonul de adaugare.
    await expect(page.getByTestId("product-new")).toHaveCount(0);
  });

  test("setările sunt refuzate operatorului, deci categoriile nu se pot edita", async ({
    page,
  }) => {
    await signIn(page, managerAccount());
    await page.goto("/setari");
    // Timp explicit, nu cel implicit de 10 secunde. Ruta /acces-interzis este
    // servita prin rewrite din proxy, iar in dezvoltare poate fi compilata la
    // prima cerere: sub incarcarea suitei intregi, compilarea plus interogarea
    // rolului au depasit o data pragul implicit. Nu este o reincercare, este
    // pragul potrivit pentru o ruta compilata la cerere.
    await expect(page.getByTestId("forbidden")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("category-add")).toHaveCount(0);
  });
});

// FARA HOOK DE CURATENIE, si asta este conventia, nu o scapare.
//
// Datele de test se marcheaza LA CREARE si nu se sterg niciodata: fiecare rand
// pe care il creeaza suita poarta prefixul TEST- in SKU, iar ecranul de inventar
// are filtrul de vizibilitate care le tine deoparte. Prefixul ESTE marcajul
// cerut de conventia P2-07.
//
// Prima varianta a acestui fisier avea un afterAll care parcurgea toate
// produsele TEST- si le dezactiva unul cate unul. A picat exact cum trebuia sa
// pice: pe masura ce inbound.spec si outbound.spec au adaugat produsele lor,
// bucla a crescut la nesfarsit si a depasit pragul de 45 de secunde al hookului,
// raportand esecul pe ULTIMUL test din fisier, care nu avea nicio vina. Un pas
// de curatenie al carui cost creste cu istoricul bazei este un test care va pica
// intr-o zi, indiferent cat de corect este codul pe care il verifica.
