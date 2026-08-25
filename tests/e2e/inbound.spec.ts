import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// inbound.spec - linia de acceptanta a cardului P2-04.
//
// Acopera exact ce numeste cardul: o comanda introdusa manual persista cu
// pozitiile ei; un document se incarca si se poate citi DOAR prin URL semnat;
// receptia creeaza cate un lot pe pozitie si ridica stocul calculat exact cu
// cantitatile receptionate; al doilea clic pe receptie nu creeaza al doilea lot;
// fiecare tranzitie a scris un rand de istoric.
//
// DATELE DE TEST NU SE STERG. Produsele poarta prefixul TEST- si raman in baza;
// comenzile raman si ele, pentru ca o comanda receptionata este istoricul unui
// lot si nu poate disparea fara sa faca stocul de necitit.

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

/** Creeaza un produs si intoarce SKU-ul. Stocul lui porneste de la zero. */
async function makeProduct(page: Page, tag: string): Promise<string> {
  const sku = `TEST-IN-${tag}-${RUN}`;
  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(`Produs intrare ${tag}`);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });
  return sku;
}

/** Stocul afisat pentru un SKU, ca numar. "Epuizat" inseamna zero. */
async function stockFor(page: Page, sku: string): Promise<number> {
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1);
  const text = (await row.innerText()).replace(/ /g, " ");
  if (text.includes("Epuizat")) return 0;
  // Coloana de stoc este a cincea: "123,00 buc".
  const match = text.match(/(\d[\d.,]*)\s*buc/);
  if (!match) return Number.NaN;
  return Number(match[1]!.replace(/\./g, "").replace(",", "."));
}

/** Introduce o comanda manuala cu o singura pozitie. Intoarce referinta. */
async function createOrder(page: Page, productLabelSku: string, quantity: string) {
  await page.goto("/adauga-manual");
  await expect(page.getByTestId("inbound-form")).toBeVisible();
  await page.getByTestId("order-supplier").fill(`TEST Furnizor ${RUN}`);
  await page.getByTestId("order-expected-at").fill("2026-12-01");
  const option = page
    .getByTestId("line-product-0")
    .locator("option")
    .filter({ hasText: productLabelSku });
  await page.getByTestId("line-product-0").selectOption(await option.getAttribute("value") ?? "");
  await page.getByTestId("line-quantity-0").fill(quantity);
  await page.getByTestId("line-price-0").fill("5");
  await page.getByTestId("order-confirm").click();
  await expect(page.getByTestId("order-created")).toBeVisible({ timeout: 20_000 });
  return (await page.getByTestId("created-reference").innerText()).trim();
}

function orderItem(page: Page, reference: string) {
  return page.locator(`[data-testid="inbound-item"][data-reference="${reference}"]`);
}

test.describe("Comenzi de intrare", () => {
  test("o comandă introdusă manual persistă cu pozițiile ei", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "persist");

    const reference = await createOrder(page, sku, "40");
    expect(reference).toMatch(/^INT-\d{4}-\d{4}$/);

    await page.goto("/comenzi");
    await expect(orderItem(page, reference)).toHaveCount(1);
    await expect(orderItem(page, reference)).toContainText("În așteptare");

    // Reincarcare completa: daca ar fi stat in memoria browserului, ar dispărea.
    await page.reload();
    await orderItem(page, reference).click();
    await expect(page.getByTestId("inbound-panel")).toBeVisible();
    await expect(page.getByTestId("inbound-line")).toHaveCount(1);
    await expect(page.getByTestId("inbound-lines")).toContainText(sku);
  });

  test("recepția creează câte un lot pe poziție și ridică stocul exact cu cantitatea", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "stock");

    const before = await stockFor(page, sku);
    expect(before).toBe(0);

    const reference = await createOrder(page, sku, "40");

    // Comanda in asteptare nu misca stocul: lotul se creeaza la receptie.
    expect(await stockFor(page, sku)).toBe(0);

    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await expect(page.getByTestId("inbound-panel")).toBeVisible();
    // Nu se verifica vizibilitatea lui <tbody>: un tbody gol are inaltime zero,
    // deci Playwright il considera ascuns. Se numara randurile.
    await expect(page.getByTestId("inbound-batch")).toHaveCount(0);

    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("S-au creat 1 lot", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("inbound-batch")).toHaveCount(1);

    expect(await stockFor(page, sku)).toBe(before + 40);
  });

  test("un al doilea clic pe recepție nu creează al doilea lot", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "idem");
    const reference = await createOrder(page, sku, "25");

    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("S-au creat 1 lot", {
      timeout: 20_000,
    });
    const afterFirst = await stockFor(page, sku);
    expect(afterFirst).toBe(25);

    // Al doilea clic. Idempotenta este garantata de blocajul de rand plus
    // constrangerea unica pe batches.order_line_id din migratia 0001.
    await page.goto("/comenzi");
    await orderItem(page, reference).click();
    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toContainText("era deja recepționată", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("inbound-batch")).toHaveCount(1);

    expect(await stockFor(page, sku)).toBe(afterFirst);
  });

  test("fiecare tranziție a scris un rând de istoric", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "hist");
    const reference = await createOrder(page, sku, "7");

    await page.goto("/comenzi");
    await orderItem(page, reference).click();

    // Crearea scrie deja primul rand: o comanda al carei istoric incepe la a
    // doua stare nu poate fi auditata inapoi pana la creare.
    await expect(page.getByTestId("history-event")).toHaveCount(1);
    await expect(page.getByTestId("inbound-history")).toContainText("În așteptare");

    await page.getByTestId("receive-order").click();
    await expect(page.getByTestId("receive-notice")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId("history-event")).toHaveCount(2);
    await expect(page.getByTestId("inbound-history")).toContainText("Recepționată");
  });

  test("documentul se încarcă și se citește doar prin legătură semnată", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "doc");
    const reference = await createOrder(page, sku, "3");

    // Un PDF minimal, valid cat sa aiba tipul corect.
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    await page.getByTestId("doc-input").setInputFiles({
      name: `confirmare-${RUN}.pdf`,
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByTestId("doc-done")).toBeVisible({ timeout: 30_000 });

    await page.goto("/comenzi");
    await expect(orderItem(page, reference)).toContainText("document atașat");
    await orderItem(page, reference).click();

    // Legatura semnata se genereaza pe server, la cerere, si apare ca <a href>.
    await page.getByTestId("doc-open").click();
    const link = page.getByTestId("doc-link");
    await expect(link).toBeVisible({ timeout: 30_000 });
    const signed = (await link.getAttribute("href")) ?? "";

    expect(signed).toContain("/storage/v1/object/sign/rc-docs/");
    expect(signed).toContain("token=");

    // BUCKETUL ESTE PRIVAT: aceeasi cale fara semnatura nu returneaza fisierul.
    const unsigned = signed.split("?")[0]!.replace("/object/sign/", "/object/public/");
    const bare = await page.request.get(unsigned);
    expect(bare.ok()).toBe(false);
  });

  test("o comandă fără poziții este refuzată în română", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    await makeProduct(page, "empty");

    await page.goto("/adauga-manual");
    await page.getByTestId("order-supplier").fill("TEST Furnizor");
    await page.getByTestId("order-expected-at").fill("2026-12-01");
    await page.getByTestId("order-confirm").click();

    await expect(page.getByTestId("order-problems")).toContainText(
      "Adaugă cel puțin o poziție cu produs și cantitate.",
    );
    await expect(page.getByTestId("order-created")).toHaveCount(0);
  });

  test("un fișier de tip greșit este refuzat înainte de încărcare", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const sku = await makeProduct(page, "badtype");
    await createOrder(page, sku, "2");

    await page.getByTestId("doc-input").setInputFiles({
      name: "note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("nu este un document acceptat"),
    });

    await expect(page.getByTestId("doc-error")).toHaveText("Se acceptă doar PDF, PNG sau JPG.");
    await expect(page.getByTestId("doc-done")).toHaveCount(0);
  });
});
