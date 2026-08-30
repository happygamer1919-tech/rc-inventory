import { expect, test } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { RESEND_FAIL_MARKER, refusedFor, sentFor } from "./support/resend";

// reminders.spec - linia de acceptanta a cardului P2-10.
//
// Acopera exact cele patru comportamente pe care le numeste cardul:
//
//   1. o iesire care coboara stocul sub prag trimite EXACT un email;
//   2. o alta iesire, tot sub prag, nu mai trimite nimic;
//   3. o receptie care ridica stocul peste prag REARMEAZA, si urmatoarea
//      traversare trimite din nou;
//   4. un esec de trimitere se inregistreaza si NU anuleaza miscarea de stoc.
//
// RESEND ESTE MOCAT PRINTR-UN SERVER, nu printr-o ramura in aplicatie. Serverul
// fals asculta pe 127.0.0.1 si aplicatia il vede prin RESEND_BASE_URL, setat in
// playwright.config.ts. Nimic nu pleaca de pe masina si nicio adresa reala nu
// primeste nimic: destinatarul este contul de dezvoltare, expeditorul un domeniu
// .local inexistent, si cererea nu iese din bucla locala.
//
// FIECARE TEST ISI FACE PROPRIUL PRODUS, cu SKU si denumire unice pe rulare, si
// isi numara doar propriile mesaje. Datele de test nu se sterg niciodata, deci
// un nume repetat ar face rularea de azi sa lucreze pe produsul rularii de ieri.

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

/** Creeaza un produs cu prag. Intoarce SKU-ul si denumirea. */
async function productWithThreshold(
  page: Page,
  tag: string,
  threshold: string,
  skuOverride?: string,
) {
  const sku = skuOverride ?? `TEST-MEM-${tag}-${RUN}`;
  const productName = `Produs memento ${tag} ${RUN}`;

  await page.goto("/inventar");
  await page.getByTestId("product-new").click();
  await page.getByTestId("field-sku").fill(sku);
  await page.getByTestId("field-name").fill(productName);
  await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
  await page.getByTestId("field-unit").selectOption("pcs");
  await page.getByTestId("field-unit-value").fill("10");
  await page.getByTestId("field-threshold").fill(threshold);
  await page.getByTestId("form-submit").click();
  await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
    timeout: 20_000,
  });

  return { sku, productName };
}

/** Comanda de intrare pentru SKU-ul dat, urmata de receptie. Ridica stocul. */
async function receiveStock(page: Page, sku: string, quantity: string) {
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
}

/** O iesire pentru produsul dat. Scade stocul. */
async function issueStock(page: Page, productName: string, quantity: string) {
  await page.goto("/iesiri");
  await comboPick(page, "field-project", "TEST Șantier E2E");
  await comboPick(page, "issue-product-0", productName);
  await page.getByTestId("issue-quantity-0").fill(quantity);
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
}

/** Scrie in comboboxul de produs si alege optiunea din lista portalata.
 *  Exact o potrivire: cu mai multe, testul ar alege intre produse din rulari
 *  diferite si ar esua mai tarziu, aratand un stoc strain. */
async function comboPick(page: Page, testId: string, query: string) {
  const input = page.getByTestId(testId).locator("input");
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  await expect(list.locator("li")).toHaveCount(1);
  await list.locator("li").first().click();
}

/** Stocul citit de pe ecranul de inventar, pentru SKU-ul dat. */
async function stockFor(page: Page, sku: string): Promise<number> {
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  const row = page.locator(`[data-testid="product-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  const text = (await row.innerText()).replace(/ /g, " ");
  if (text.includes("Epuizat")) return 0;
  const match = text.match(/(\d[\d.,]*)\s*buc/);
  if (!match) return Number.NaN;
  return Number(match[1]!.replace(/\./g, "").replace(",", "."));
}

test.describe("Memento stoc", () => {
  test.describe.configure({ timeout: 120_000 });

  test("o ieșire care coboară sub prag trimite exact un email", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithThreshold(page, "one", "10");

    // 20 in stoc, prag 10: peste prag, deci nimic de trimis inca.
    await receiveStock(page, sku, "20");
    expect(await sentFor(request, sku)).toHaveLength(0);

    // 20 - 12 = 8, sub prag. Exact un email.
    await issueStock(page, productName, "12");
    const sent = await sentFor(request, sku);
    expect(sent).toHaveLength(1);

    // Corpul poarta ce cere cardul: denumire, SKU, stoc curent cu unitate, prag.
    const body = `${sent[0]!.subject}\n${sent[0]!.text}`;
    expect(body).toContain(productName);
    expect(body).toContain(sku);
    expect(body).toContain("8 buc");
    expect(body).toContain("10 buc");

    // Alerta se vede si pe ecran, marcata ca trimisa.
    await page.goto("/memento");
    const row = page.locator(`[data-testid="alert-row"][data-sku="${sku}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Trimis");
  });

  test("o a doua ieșire sub prag nu mai trimite nimic", async ({ page, request }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithThreshold(page, "twice", "10");

    await receiveStock(page, sku, "20");
    await issueStock(page, productName, "12");
    expect(await sentFor(request, sku)).toHaveLength(1);

    // 8 - 2 = 6. Tot sub prag, tot dezarmat: niciun email nou.
    await issueStock(page, productName, "2");
    expect(await stockFor(page, sku)).toBe(6);
    expect(await sentFor(request, sku)).toHaveLength(1);
  });

  test("o recepție peste prag rearmează, iar traversarea următoare trimite din nou", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku, productName } = await productWithThreshold(page, "rearm", "10");

    await receiveStock(page, sku, "20");
    await issueStock(page, productName, "12");
    expect(await sentFor(request, sku)).toHaveLength(1);

    // 8 + 20 = 28, peste prag: rearmeaza, fara sa trimita nimic.
    await receiveStock(page, sku, "20");
    expect(await stockFor(page, sku)).toBe(28);
    expect(await sentFor(request, sku)).toHaveLength(1);

    // 28 - 20 = 8, sub prag din nou. Al doilea email.
    await issueStock(page, productName, "20");
    expect(await sentFor(request, sku)).toHaveLength(2);
  });

  test("un eșec de trimitere se înregistrează și nu anulează mișcarea de stoc", async ({
    page,
    request,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    // SKU-ul poarta marcajul, deci serverul fals raspunde 500 la mesajul care il
    // contine. Aplicatia nu stie nimic despre asta: pentru ea este un raspuns
    // non-2xx de la Resend, exact ca in productie.
    const sku = `TEST-MEM-${RESEND_FAIL_MARKER}-${RUN}`;
    const { productName } = await productWithThreshold(page, "fail", "10", sku);

    await receiveStock(page, sku, "20");
    await issueStock(page, productName, "12");

    // Niciun mesaj acceptat, dar incercarea a existat.
    expect(await sentFor(request, sku)).toHaveLength(0);
    expect(await refusedFor(request, sku)).toHaveLength(1);

    // MISCAREA DE STOC A RAMAS. Aceasta este propozitia intreaga a cazului:
    // trimiterea a picat, comanda nu.
    expect(await stockFor(page, sku)).toBe(8);

    // Esecul se vede pe ecranul de memento, cu motivul lui.
    await page.goto("/memento");
    const row = page.locator(`[data-testid="alert-row"][data-sku="${sku}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Netrimis");
    await expect(row.getByTestId("alert-error")).toContainText("500");
  });
});
