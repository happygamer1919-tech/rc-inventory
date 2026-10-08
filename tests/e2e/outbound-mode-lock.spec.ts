import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// outbound-mode-lock.spec - linia de acceptanta a cardului P3-144.
//
// BUGUL: cat timp un bon se salva, alegerea "Tip ieșire" ramanea libera. Cine schimba
// modul inainte sa vina raspunsul demonta formularul care astepta, iesirea era salvata si
// stocul scazut, dar ecranul arata un formular gol si nicio confirmare.
//
// CUM SE PRINDE: cererea de salvare (actiunea de server, un POST cu antetul Next-Action)
// este tinuta doua secunde in browser, deci fereastra "se salveaza" este destul de lunga
// ca sa o masoare Playwright. Datele sunt prefixate TEST si se scriu doar pe stiva locala
// din CI, niciodata pe productie. Nu se sterge nimic (conventia P2-07).

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TAG = `TEST-P3144-${RUN}`;
const PRODUCT_NAME = `${TAG} produs`;
const CLIENT_NAME = `${TAG} client`;
const TEST_PROJECT = "TEST Șantier E2E";
const HOLD_MS = 2_000;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "outbound-mode-lock.spec are nevoie de NEXT_PUBLIC_SUPABASE_URL si SUPABASE_SERVICE_ROLE_KEY. " +
        "In CI sunt exportate de pasul 'Export local Supabase credentials'.",
    );
  }
  return { origin: new URL(url).origin, service };
}

async function asService(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; text: string; rows: Record<string, unknown>[] }> {
  const { origin, service } = env();
  const response = await fetch(`${origin}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text().catch(() => "");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = [];
  }
  return { ok: response.ok, text, rows };
}

let productId = "";

test.beforeAll(async () => {
  const client = await asService("clients?select=id", { method: "POST", body: { name: CLIENT_NAME, stage: "client" } }); // P3-196: un cumparator, nu un lead
  expect(client.ok, `clientul de test nu a putut fi scris: ${client.text}`).toBe(true);

  const category = await asService("categories?select=id&limit=1");
  expect(category.ok && category.rows.length > 0, "exista cel putin o categorie").toBe(true);

  const product = await asService("products?select=id", {
    method: "POST",
    body: {
      sku: `${TAG}-SKU`,
      name: PRODUCT_NAME,
      category_id: String(category.rows[0]!.id),
      unit: "pcs",
      unit_value_mdl: 10,
    },
  });
  expect(product.ok, `produsul de test nu a putut fi scris: ${product.text}`).toBe(true);
  productId = String(product.rows[0]!.id);

  const order = await asService("inbound_orders?select=id", {
    method: "POST",
    body: { reference: `${TAG}-IN`, supplier_name: `${TAG} furnizor` },
  });
  expect(order.ok, `comanda de test nu a putut fi scrisa: ${order.text}`).toBe(true);
  const orderId = String(order.rows[0]!.id);

  const line = await asService("order_lines?select=id", {
    method: "POST",
    body: { inbound_order_id: orderId, product_id: productId, quantity: 100, unit_price: 10 },
  });
  expect(line.ok, `pozitia comenzii nu a putut fi scrisa: ${line.text}`).toBe(true);

  const batch = await asService("batches?select=id", {
    method: "POST",
    body: {
      product_id: productId,
      inbound_order_id: orderId,
      order_line_id: String(line.rows[0]!.id),
      quantity: 100,
    },
  });
  expect(batch.ok, `lotul nu a putut fi scris: ${batch.text}`).toBe(true);
});

async function comboPick(page: Page, testId: string, query: string): Promise<void> {
  const input = page.getByTestId(testId).locator("input").first();
  await input.click();
  await input.fill(query);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  await expect(list.locator("li"), `cautarea "${query}" da exact o potrivire`).toHaveCount(1);
  await list.locator("li").first().click();
}

/** Tine fiecare actiune de server HOLD_MS inainte sa plece spre server. */
async function holdServerActions(page: Page): Promise<void> {
  await page.route("**/iesiri", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    }
    await route.continue();
  });
}

async function fillLine(page: Page): Promise<void> {
  await comboPick(page, "issue-product-0", PRODUCT_NAME);
  await page.getByTestId("issue-quantity-0").fill("3");
}

async function expectBothOptionsDisabled(page: Page): Promise<void> {
  await expect(page.getByTestId("issue-mode-project")).toBeDisabled();
  await expect(page.getByTestId("issue-mode-direct_client")).toBeDisabled();
  await expect(page.getByTestId("issue-mode-group")).toHaveAttribute("aria-disabled", "true");
}

async function issuesOfProduct(): Promise<number> {
  const rows = await asService(`outbound_lines?select=id&product_id=eq.${productId}`);
  expect(rows.ok, `pozitiile iesirilor nu au putut fi citite: ${rows.text}`).toBe(true);
  return rows.rows.length;
}

test("iesire P3-144: pe Client direct, Tip iesire este oprit cat se salveaza, apoi confirmarea apare si exista o singura iesire", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, ownerAccount());
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("issue-mode-direct_client").check();
  await expect(page.getByTestId("field-pickup-date")).toBeVisible({ timeout: 25_000 });

  await comboPick(page, "field-client", CLIENT_NAME);
  await page.getByTestId("issue-pickup-date").fill("02.12.2026");
  await fillLine(page);

  await holdServerActions(page);
  const before = await issuesOfProduct();
  await page.getByTestId("issue-submit").click();

  // IN FEREASTRA DE SALVARE: ambele optiuni oprite, iar o apasare nu schimba modul.
  await expectBothOptionsDisabled(page);
  await page.getByTestId("issue-mode-option-project").click({ force: true });
  await expect(page.getByTestId("issue-mode-direct_client")).toBeChecked();

  // DUPA SALVARE: confirmarea apare, nu un formular gol.
  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-reference")).toHaveText(/^IES-\d{4}-\d{4}$/);
  expect(await issuesOfProduct(), "o singura iesire s-a scris").toBe(before + 1);
});

test("iesire P3-144: pe Proiect, Tip iesire este oprit cat se salveaza, apoi confirmarea apare si exista o singura iesire", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, ownerAccount());
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });

  await comboPick(page, "field-project", TEST_PROJECT);
  await fillLine(page);

  await holdServerActions(page);
  const before = await issuesOfProduct();
  await page.getByTestId("issue-submit").click();

  await expectBothOptionsDisabled(page);
  await page.getByTestId("issue-mode-option-direct_client").click({ force: true });
  await expect(page.getByTestId("issue-mode-project")).toBeChecked();

  await expect(page.getByTestId("issue-created")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("issue-reference")).toHaveText(/^IES-\d{4}-\d{4}$/);
  expect(await issuesOfProduct(), "o singura iesire s-a scris").toBe(before + 1);
});

test("iesire P3-144: dupa salvare, alegerea Tip iesire este din nou libera", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, ownerAccount());
  await page.goto("/iesiri");
  await expect(page.getByTestId("outbound-form")).toBeVisible({ timeout: 25_000 });

  // Inainte de orice salvare, alegerea merge.
  await expect(page.getByTestId("issue-mode-project")).toBeEnabled();
  await expect(page.getByTestId("issue-mode-direct_client")).toBeEnabled();
  await page.getByTestId("issue-mode-direct_client").check();
  await expect(page.getByTestId("field-pickup-date")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("issue-mode-project").check();
  await expect(page.getByTestId("field-project")).toBeVisible();
});
