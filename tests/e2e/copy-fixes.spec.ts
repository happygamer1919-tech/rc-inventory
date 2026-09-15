import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// copy-fixes.spec - linia de acceptanta a cardului P3-51.
//
// Acopera exact ce numeste cardul, gasit in revizuirea aplicatiei live din
// 2026-09-14 (F6 si F7): numaratorii de produse de pe tabloul de bord, din
// Inventar si din Memento stoc se acorda cu numarul lor; fila Contacte nu mai
// spune o propozitie fara sens; Necesar nu mai spune "Toate cele 0 santiere";
// iar doua note scrise pentru cei care construiesc sistemul nu mai apar pe
// /comenzi si pe /incarca-comanda.
//
// TEXTELE VECHI SE CAUTA LITERAL, exact cum stateau in sursa, cu diacritice. O
// schimbare de sinonim care pastreaza propozitia pica tot.
//
// NICIO TABELA NU SE GOLESTE CA SA SE AJUNGA LA UN NUMAR. Singularul se
// dovedeste pe cautarea din Inventar, cu un produs creat aici sub un SKU unic;
// ceilalti numaratori se verifica pe numarul pe care il are baza in clipa aceea,
// cu regula pe care dashboard.spec o aplica numaratorului de categorii.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07.

const TEST_CATEGORY = "TEST-Categorie";
const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

const NF = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 });

/** Regula romaneasca, scrisa aici din nou si nu importata din aplicatie, ca
 *  testul sa nu verifice aplicatia cu propria ei functie: 1 cere singularul, un
 *  numar al carui rest la 100 este intre 1 si 19 (si zero) cere pluralul simplu,
 *  restul cer "de" plus plural. */
function counted(n: number, one: string, many: string): string {
  const shown = NF.format(n);
  if (n === 1) return `${shown} ${one}`;
  const lastTwo = n % 100;
  if (n === 0 || (lastTwo >= 1 && lastTwo <= 19)) return `${shown} ${many}`;
  return `${shown} de ${many}`;
}

async function ensureTestCategory(page: Page) {
  await page.goto("/setari");
  const existing = page.locator(`[data-testid="category-row"][data-name="${TEST_CATEGORY}"]`);
  if ((await existing.count()) > 0) return;
  await page.getByTestId("category-name").fill(TEST_CATEGORY);
  await page.getByTestId("category-add").click();
  await expect(existing).toHaveCount(1, { timeout: 15_000 });
}

test.describe("Texte românești corecte", () => {
  test.describe.configure({ timeout: 90_000 });

  test("un singur produs găsit se numără la singular", async ({ page }) => {
    await signIn(page, ownerAccount());
    await ensureTestCategory(page);

    const sku = `TEST-P351-${RUN}`;
    await page.goto("/inventar");
    await page.getByTestId("product-new").click();
    await page.getByTestId("field-sku").fill(sku);
    await page.getByTestId("field-name").fill(`Produs numărat ${RUN}`);
    await page.getByTestId("field-category").selectOption({ label: TEST_CATEGORY });
    await page.getByTestId("field-unit").selectOption("pcs");
    await page.getByTestId("form-submit").click();
    await expect(page.locator(`[data-testid="product-row"][data-sku="${sku}"]`)).toHaveCount(1, {
      timeout: 20_000,
    });

    // Cautarea dupa SKU-ul unic lasa exact un rand.
    await page.getByTestId("product-search").fill(sku);
    await expect(page.getByTestId("product-row")).toHaveCount(1);

    const counter = page.getByTestId("product-count");
    await expect(counter).toContainText("1 produs");
    await expect(counter).not.toContainText("1 produse");
  });

  test("Inventar fără filtru numără rândurile după regulă", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/inventar");

    const counter = page.getByTestId("product-count");
    await expect(counter).toBeVisible();
    const rows = await page.getByTestId("product-row").count();
    expect((await counter.innerText()).trim()).toBe(counted(rows, "produs", "produse"));
  });

  test("tabloul de bord numără produsele din catalog după regulă", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/");

    // Randul de sub valoarea stocului, in primul bloc.
    const first = page.getByTestId("dashboard-stats").locator("> *").first();
    const text = (await first.locator("p").last().innerText()).trim();
    const match = text.match(/^([\d.\s]+?)\s(?:de\s)?produse?\sîn catalog$/);
    expect(match, `rând neașteptat: ${text}`).not.toBeNull();
    const n = Number(match![1]!.replace(/\D/g, ""));
    expect(text).toBe(`${counted(n, "produs", "produse")} în catalog`);
  });

  test("Memento stoc numără produsele după regulă", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/memento");

    const counter = page.getByTestId("threshold-count");
    await expect(counter).toBeVisible();
    const rows = await page.getByTestId("threshold-row").count();
    expect((await counter.innerText()).trim()).toBe(counted(rows, "produs", "produse"));
  });

  test("fila Contacte are o explicație care se înțelege", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-name").fill(`TEST Contacte ${RUN}`);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

    const panel = page.getByTestId("panel-contacte");
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("Un client este mai multe numere de telefon");

    // Explicatia este paragraful de sub titlul cardului.
    const hint = panel.locator("h2", { hasText: "Contacte" }).locator("xpath=following-sibling::p");
    await expect(hint).toHaveCount(1);
    expect((await hint.innerText()).trim().length).toBeGreaterThan(0);
    await expect(hint).toHaveText("Un client poate avea mai multe persoane de contact.");
  });

  test("Necesar nu mai spune „Toate cele 0 șantiere”", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/necesar");

    const block = page.getByTestId("need-excluse");
    await expect(block).toBeVisible({ timeout: 25_000 });

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Toate cele 0 șantiere vii au deviz acceptat");
    expect(body).not.toContain("Toate cele 1 șantiere");

    // Cand niciun proiect nu este exclus, fraza numara santierele cuprinse dupa
    // regula, iar la zero este o stare goala simpla. Stack-ul din CI seamana
    // proiecte excluse, deci ramura aceasta ruleaza doar pe o baza fara ele.
    const excluded = Number(await block.getAttribute("data-count"));
    const included = Number(await block.getAttribute("data-included"));
    if (excluded === 0) {
      if (included === 0) {
        await expect(block).toHaveText("Niciun șantier activ nu are încă un deviz acceptat.");
      } else {
        await expect(block).toContainText(counted(included, "șantier activ", "șantiere active"));
      }
    }
  });

  test("/comenzi nu mai vorbește despre faze", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/comenzi");
    await expect(page.getByTestId("inbound-count")).toBeVisible({ timeout: 25_000 });

    const body = await page.locator("body").innerText();
    expect(body).not.toContain(
      "Recepțiile parțiale și expedierile parțiale sunt în afara domeniului fazei 2",
    );
    expect(body).not.toContain("fazei");
  });

  test("explicația de pe /incarca-comanda este scrisă pentru operator", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/incarca-comanda");

    const explainer = page.getByTestId("upload-explainer");
    await expect(explainer).toBeVisible({ timeout: 25_000 });
    await expect(explainer).not.toContainText("Documentul se salvează real");
    await expect(explainer).not.toContainText("Aici comanda se tastează întâi");

    // Legatura catre adaugarea manuala ramane.
    await expect(explainer.getByRole("link", { name: "adăugarea manuală" })).toHaveAttribute(
      "href",
      "/adauga-manual",
    );
  });
});
