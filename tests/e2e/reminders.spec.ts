import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { signIn, signOut } from "./support/auth";
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

// P3-42. PRAGUL SE AJUNGE DIN RANDUL CARE IL ARATA.
//
// CAPACITATEA EXISTA DEJA si cardul nu o adauga: pragul se editeaza in fisa
// produsului din Inventar, prin updateProduct din lib/data/product-actions.ts.
// Ce lipsea era drumul pana la ea de pe ecranul de memento, unde se vede ca
// pragul este gresit. Cardul adauga o LEGATURA, nu un al doilea formular.
//
// PATRU CAZURI, cate unul pe clauza din acceptanta:
//
//   1. pornind din memento, pragul se schimba si se citeste din RANDUL STOCAT,
//      prin PostgREST, nu din formular si nici din ecran;
//   2. fisa produsului din Inventar editeaza in continuare acelasi camp;
//   3. UN SINGUR DRUM DE SCRIERE: amandoua scriu prin aceeasi server action,
//      dovedit prin antetul Next-Action pe care Next il pune pe cererea POST.
//      Doua actiuni diferite ar avea doua id-uri diferite;
//   4. operatorul, care nu putea schimba pragul, tot nu poate.

type OwnerRest = { api: APIRequestContext; headers: Record<string, string> };

/** O legatura directa la PostgREST, ca administratorul, fara ecran. */
async function ownerRest(): Promise<OwnerRest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  expect(url, "P3-42 are nevoie de NEXT_PUBLIC_SUPABASE_URL").not.toBe("");
  expect(anonKey, "P3-42 are nevoie de NEXT_PUBLIC_SUPABASE_ANON_KEY").not.toBe("");

  const api = await playwrightRequest.newContext({ baseURL: url });
  const owner = ownerAccount();
  const token = await api.post("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: owner.email, password: owner.password },
  });
  expect(token.ok()).toBe(true);
  const body = (await token.json()) as { access_token: string };

  return {
    api,
    headers: { apikey: anonKey, Authorization: `Bearer ${body.access_token}` },
  };
}

/** Pragul din randul stocat in products, pentru SKU-ul dat. */
async function storedThreshold(sku: string): Promise<number> {
  const rest = await ownerRest();
  const response = await rest.api.get(
    `/rest/v1/products?sku=eq.${encodeURIComponent(sku)}&select=threshold`,
    { headers: rest.headers },
  );
  expect(response.status(), await response.text()).toBe(200);
  const rows = (await response.json()) as Array<{ threshold: number | string }>;
  await rest.api.dispose();
  expect(rows).toHaveLength(1);
  return Number(rows[0]!.threshold);
}

/** Drumul care exista de la P2-03: randul din Inventar, panoul, Modifica. */
async function openSheetFromInventory(page: Page, sku: string) {
  await page.goto("/inventar");
  await page.getByTestId("product-search").fill(sku);
  await page.locator(`[data-testid="product-row"][data-sku="${sku}"]`).click();
  await expect(page.getByTestId("product-panel")).toBeVisible();
  await page.getByTestId("panel-edit").click();
  await expect(page.getByTestId("product-form")).toBeVisible();
}

/** Drumul nou: legatura de pe pragul din randul de memento. */
async function openSheetFromReminders(page: Page, sku: string) {
  await page.goto("/memento");
  const row = page.locator(`[data-testid="threshold-row"][data-sku="${sku}"]`);
  await expect(row).toHaveCount(1);
  await row.getByTestId("threshold-edit-link").click();
  await page.waitForURL((url) => new URL(url).pathname === "/inventar", { timeout: 20_000 });
  await expect(page.getByTestId("product-form")).toBeVisible({ timeout: 20_000 });
}

/** Scrie pragul in formularul deschis, salveaza, si intoarce id-ul server
 *  action-ului care a primit scrierea, citit din antetul Next-Action. */
async function saveThreshold(page: Page, value: string): Promise<string> {
  await page.getByTestId("field-threshold").fill(value);
  const posted = page.waitForRequest(
    (r) => r.method() === "POST" && r.headers()["next-action"] !== undefined,
    { timeout: 20_000 },
  );
  await page.getByTestId("form-submit").click();
  const actionId = (await posted).headers()["next-action"] ?? "";
  // Formularul se inchide doar la reusita; la esec ramane deschis cu eroarea.
  await expect(page.getByTestId("product-form")).toHaveCount(0, { timeout: 20_000 });
  return actionId;
}

test.describe("Memento stoc: pragul se modifică din rândul lui", () => {
  test.describe.configure({ timeout: 120_000 });

  test("pornind din memento, pragul se schimbă și se citește din rândul stocat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku } = await productWithThreshold(page, "reach", "10");
    expect(await storedThreshold(sku)).toBe(10);

    await openSheetFromReminders(page, sku);

    // Legatura duce la fisa produsului, direct pe campul pragului.
    const url = new URL(page.url());
    expect(url.searchParams.get("produs")).toBe(sku);
    expect(url.searchParams.get("camp")).toBe("prag");
    await expect(page.getByTestId("field-sku")).toHaveValue(sku);
    await expect(page.getByTestId("field-threshold")).toHaveValue("10");
    await expect(page.getByTestId("field-threshold")).toBeFocused();

    await saveThreshold(page, "7");

    // Din baza, nu din formular.
    expect(await storedThreshold(sku)).toBe(7);

    await page.goto("/memento");
    const row = page.locator(`[data-testid="threshold-row"][data-sku="${sku}"]`);
    await expect(row.getByTestId("threshold-edit-link")).toHaveText(/^7\s/);
  });

  test("fișa produsului din Inventar editează în continuare același prag", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku } = await productWithThreshold(page, "sheet", "10");

    await openSheetFromInventory(page, sku);
    await expect(page.getByTestId("field-threshold")).toHaveValue("10");
    await saveThreshold(page, "13");

    expect(await storedThreshold(sku)).toBe(13);
  });

  test("amândouă drumurile scriu pragul prin aceeași acțiune de server", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku } = await productWithThreshold(page, "one-path", "10");

    await openSheetFromInventory(page, sku);
    const fromSheet = await saveThreshold(page, "12");
    expect(await storedThreshold(sku)).toBe(12);

    await openSheetFromReminders(page, sku);
    const fromReminders = await saveThreshold(page, "6");
    expect(await storedThreshold(sku)).toBe(6);

    // Acelasi id inseamna aceeasi functie: updateProduct, din
    // lib/data/product-actions.ts. O a doua actiune care scrie coloana ar
    // purta alt id si ar pica aici.
    expect(fromSheet).not.toBe("");
    expect(fromReminders).toBe(fromSheet);
  });

  test("operatorul nu poate schimba pragul nici pornind din memento", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);
    const { sku } = await productWithThreshold(page, "perm", "10");

    // Produsul il face administratorul; restul cazului este al operatorului.
    await signOut(page);
    await signIn(page, managerAccount());

    // Operatorul vede memento, dar randul nu ii ofera nicio cale de modificare.
    await page.goto("/memento");
    const row = page.locator(`[data-testid="threshold-row"][data-sku="${sku}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("10");
    await expect(row.getByTestId("threshold-edit-link")).toHaveCount(0);

    // Nici adresa legaturii, scrisa de mana, nu deschide formularul: deschide
    // panoul de citire, exact ca legatura simpla catre produs.
    await page.goto(`/inventar?produs=${encodeURIComponent(sku)}&camp=prag`);
    await expect(page.getByTestId("product-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("panel-edit")).toHaveCount(0);
    await expect(page.getByTestId("product-form")).toHaveCount(0);
    await expect(page.getByTestId("field-threshold")).toHaveCount(0);

    expect(await storedThreshold(sku)).toBe(10);
  });
});
