import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// cross-links.spec - linia de acceptanta a cardului P3-10.
//
// Merge fiecare directie si verifica de fiecare data ca PAGINA DE DESTINATIE
// identifica inregistrarea corecta, nu doar ca navigarea nu a aruncat. O
// afirmatie care verifica numai ca URL-ul s-a schimbat trece si atunci cand
// legatura duce la randul gresit.
//
// Randurile de test sunt cele semanate de scripts/seed-test-crm.mjs, plus ce
// construieste testul. Nimic nu se sterge.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const SEED_PROJECT = "TEST Șantier E2E";
const SEED_CLIENT = "TEST Beneficiar E2E";

async function firstOutboundIssue(page: Page): Promise<string | null> {
  await page.goto("/comenzi");
  const items = page.getByTestId("outbound-item");
  if ((await items.count()) === 0) return null;
  await items.first().click();
  await expect(page.getByTestId("outbound-panel")).toBeVisible({ timeout: 20_000 });
  return "ok";
}

test.describe("Legături între înregistrări", () => {
  test.describe.configure({ timeout: 120_000 });

  test("proiectul duce la clientul lui și la ieșirile lui, filtrate", async ({ page }) => {
    await signIn(page, ownerAccount());

    // Proiectul semanat apartine clientului semanat.
    await page.goto(`/proiecte?q=${encodeURIComponent(SEED_PROJECT)}&stare=toate`);
    const row = page.locator(`[data-testid="project-row"][data-name="${SEED_PROJECT}"]`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.getByTestId("project-link").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 20_000 });

    // PROIECT CATRE CLIENT. Pagina de destinatie trebuie sa arate NUMELE
    // clientului, nu doar sa se fi incarcat.
    await page.getByTestId("project-detail").getByRole("link", { name: SEED_CLIENT }).click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("client-detail")).toContainText(SEED_CLIENT);

    // CLIENT CATRE PROIECTELE LUI. Fila listeaza proiectul si leaga inapoi.
    await page.getByTestId("tab-proiecte").click();
    const projRow = page.locator(`[data-testid="client-project-row"][data-name="${SEED_PROJECT}"]`);
    await expect(projRow).toHaveCount(1, { timeout: 15_000 });
    await projRow.getByTestId("client-project-link").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("project-detail")).toContainText(SEED_PROJECT);

    // PROIECT CATRE IESIRILE LUI, FILTRATE. Legatura foloseste filtrul din URL
    // pe care ecranul de comenzi il cunoaste; nu se inventeaza un mecanism nou.
    await page.getByTestId("tab-consum").click();
    const link = page.getByTestId("issue-full-history");
    if (await link.isVisible()) {
      await link.click();
      await expect(page).toHaveURL(/\/comenzi\?proiect=[0-9a-f-]{36}/);
      // ANTETUL NUMESTE PROIECTUL, si numele vine de pe inregistrare si nu din
      // bara de adrese: un ecran care ar afisa ce i s-a dat in URL ar afisa
      // orice.
      await expect(page.locator("main")).toContainText(SEED_PROJECT);
      await expect(page.getByTestId("orders-clear-filter")).toBeVisible();
    }
  });

  test("clientul duce la ieșirile lui, filtrate, și antetul îl numește", async ({ page }) => {
    await signIn(page, ownerAccount());

    await page.goto(`/clienti?q=${encodeURIComponent(SEED_CLIENT)}&stare=toate`);
    const row = page.locator(`[data-testid="client-row"][data-name="${SEED_CLIENT}"]`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.getByTestId("client-link").click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("tab-consum").click();
    const link = page.getByTestId("material-full-history");
    if (await link.isVisible()) {
      await link.click();
      await expect(page).toHaveURL(/\/comenzi\?client=[0-9a-f-]{36}/);
      await expect(page.locator("main")).toContainText(SEED_CLIENT);
    }
  });

  test("ieșirea duce la proiectul și la clientul ei, iar linia duce la produs", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    if (!(await firstOutboundIssue(page))) {
      // Nicio iesire in baza: nimic de mers pe jos, si asta nu este un esec al
      // cardului. Suita creeaza iesiri in alte fisiere si ordinea nu este
      // garantata, deci testul spune ce a gasit in loc sa presupuna.
      test.skip(true, "Nicio ieșire în baza de test");
      return;
    }

    const projectLink = page.getByTestId("issue-project-link");
    await expect(projectLink).toBeVisible();

    // O IESIRE FARA PROIECT ESTE TEXT SIMPLU, NU O LEGATURA MOARTA. Randurile
    // istorice nereconciliate sunt exact cazul, si ecranul scrie explicatia.
    const linked = await projectLink.getAttribute("data-linked");
    if (linked === "false") {
      await expect(projectLink).toContainText("neasociat");
      return;
    }

    const projectName = (await projectLink.innerText()).trim();
    await projectLink.click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main")).toContainText(projectName);

    // IESIRE CATRE CLIENT.
    await firstOutboundIssue(page);
    const clientLink = page.getByTestId("issue-client-link");
    const clientName = (await clientLink.innerText()).trim();
    if ((await clientLink.getAttribute("data-linked")) === "true") {
      await clientLink.click();
      await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("main")).toContainText(clientName);
    }

    // LINIA DE COMANDA CATRE PRODUS. Deschide inventarul cu panoul produsului
    // deja deschis, dintr-un parametru de URL, deci legatura este partajabila.
    await firstOutboundIssue(page);
    const lineLink = page.getByTestId("line-product-link").first();
    if (await lineLink.isVisible()) {
      const productName = (await lineLink.innerText()).trim();
      await lineLink.click();
      await expect(page).toHaveURL(/\/inventar\?produs=/);
      await expect(page.getByTestId("product-panel")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("product-panel")).toContainText(productName);
    }
  });

  test("produsul duce la furnizorul lui, adică la produsele aceluiași furnizor", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    // Un produs cu furnizor, creat aici ca testul sa nu depinda de ce a lasat
    // alt fisier in urma.
    await page.goto("/setari");
    const category = "TEST-Categorie";
    const existing = page.locator(`[data-testid="category-row"][data-name="${category}"]`);
    if ((await existing.count()) === 0) {
      await page.getByTestId("category-name").fill(category);
      await page.getByTestId("category-add").click();
      await expect(existing).toHaveCount(1, { timeout: 15_000 });
    }

    const supplier = `TEST Furnizor Link ${RUN}`;
    const sku = `TEST-LINK-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await expect(page.getByTestId("product-form")).toBeVisible();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill(`Produs legatura ${RUN}`);
    await page.getByTestId("field-category").selectOption({ label: category });
    await page.getByTestId("field-unit").selectOption("pcs");
    const supplierInput = page.getByTestId("field-supplier").locator("input");
    await supplierInput.click();
    await supplierInput.fill(supplier);
    await supplierInput.press("Enter");
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("product-form")).toHaveCount(0, { timeout: 25_000 });

    await page.goto("/inventar");
    await page.getByTestId("product-search").fill(sku);
    const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.click();
    await expect(page.getByTestId("product-panel")).toBeVisible({ timeout: 20_000 });

    // PRODUS CATRE FURNIZOR, care este aceeasi legatura cu FURNIZOR CATRE
    // PRODUSELE LUI: nu exista o fisa de furnizor, si "produsele acestui
    // furnizor" este ce vrea sa vada cine apasa pe un nume de furnizor.
    const supplierLink = page.getByTestId("product-supplier-link");
    await expect(supplierLink).toHaveAttribute("data-linked", "true");
    await supplierLink.click();
    await expect(page).toHaveURL(/\/inventar\?furnizor=[0-9a-f-]{36}/);

    // Si destinatia arata produsul acestui furnizor, nu tot catalogul.
    await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
      timeout: 15_000,
    });
  });
});
