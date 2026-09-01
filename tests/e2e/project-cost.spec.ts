import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// project-cost.spec - linia de acceptanta a cardului P3-11.
//
// Acopera exact ce numeste cardul: un proiect cu trei iesiri in doua luni si
// patru produse raporteaza un total egal cu suma calculata de mana, afirmata la
// leu; defalcarea pe produs da acelasi total; defalcarea pe luna da acelasi
// total; un proiect fara iesiri raporteaza zero si o stare goala romaneasca, nu
// o pagina alba; o iesire a ALTUI proiect este exclusa din orice total pe acest
// proiect, ceea ce inainte de P3-04b era dovedit cu o iesire fara niciun proiect,
// stare care nu mai poate exista; produsele dezactivate raman in istoric.
//
// DATELE VIN DIN scripts/seed-test-cost.mjs SI SUNT FIXE. Aritmetica este scrisa
// in capul acelui fisier si repetata aici, ca amandoua sa poata fi verificate de
// mana fara sa fie deschis celalalt. Formularul de iesire nu are camp de data,
// deci a doua luna nu poate fi construita prin ecran.

const PROJECT_ID = "7e57c051-0000-4000-8000-000000000002";
const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

// Suma calculata de mana, in lei.
const TOTAL_MDL = 1850;
const TOTAL_SHIPPED_MDL = 1400;
const BY_PRODUCT = {
  "TEST-COST-01": 600,
  "TEST-COST-02": 500,
  "TEST-COST-03": 400,
  "TEST-COST-04": 350,
};
const BY_MONTH = {
  "2026-06-01": 1400,
  "2026-07-01": 400,
  "2026-08-01": 50,
};

async function costTab(page: Page, id: string, shippedOnly = false) {
  await page.goto(`/proiecte/${id}?fila=cost${shippedOnly ? "&doar-expediate=1" : ""}`);
  await expect(page.getByTestId("panel-cost")).toBeVisible({ timeout: 25_000 });
}

/** Valoarea afisata, citita din atributul de date si nu din textul formatat.
 *
 *  Textul trece prin Intl si contine spatii insecabile, deci o comparatie pe
 *  sirul afisat ar cadea pe formatare in loc sa cada pe aritmetica, care este ce
 *  verifica acest fisier. */
async function valueOf(page: Page, testId: string): Promise<number> {
  const raw = await page.getByTestId(testId).getAttribute("data-value-mdl");
  return Number(raw);
}

test.describe("Cost material pe proiect", () => {
  test.describe.configure({ timeout: 90_000 });

  test("totalul este suma calculată de mână, la leu", async ({ page }) => {
    await signIn(page, ownerAccount());
    await costTab(page, PROJECT_ID);

    expect(await valueOf(page, "cost-total")).toBe(TOTAL_MDL);
    await expect(page.getByTestId("cost-total")).toContainText("MDL");

    // Nota despre pretul curent din catalog este pe ecran si nu intr-un raport.
    await expect(page.getByTestId("cost-footnote")).toContainText("prețul curent din catalog");
  });

  test("defalcarea pe produs însumează exact același total", async ({ page }) => {
    await signIn(page, ownerAccount());
    await costTab(page, PROJECT_ID);

    const rows = page.getByTestId("cost-product-row");
    await expect(rows).toHaveCount(4);

    let sum = 0;
    for (const [sku, expected] of Object.entries(BY_PRODUCT)) {
      const row = page.locator(`[data-testid="cost-product-row"][data-sku="${sku}"]`);
      await expect(row).toHaveCount(1);
      const value = Number(await row.getAttribute("data-value-mdl"));
      expect(value).toBe(expected);
      sum += value;
    }
    expect(sum).toBe(TOTAL_MDL);
  });

  test("defalcarea pe lună însumează același total, iar lunile sunt cele locale", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await costTab(page, PROJECT_ID);

    const rows = page.getByTestId("cost-month-row");
    await expect(rows).toHaveCount(3);

    let sum = 0;
    for (const [month, expected] of Object.entries(BY_MONTH)) {
      const row = page.locator(`[data-testid="cost-month-row"][data-month^="${month}"]`);
      await expect(row).toHaveCount(1);
      const value = Number(await row.getAttribute("data-value-mdl"));
      expect(value).toBe(expected);
      sum += value;
    }
    expect(sum).toBe(TOTAL_MDL);

    // FUSUL ORAR ESTE CE SEPARA CELE DOUA REGULI. Bonul de la 2026-07-31T21:30Z
    // este 1 august 00:30 la Chisinau. Gruparea in UTC l-ar pune in iulie, si
    // atunci august nu ar exista deloc si iulie ar arata 450.
    await expect(page.locator('[data-testid="cost-month-row"][data-month^="2026-08-01"]')).toContainText(
      "august 2026",
    );

    // Etichetele de luna sunt romanesti si intregi, nu numerice.
    await expect(page.locator('[data-testid="cost-month-row"][data-month^="2026-06-01"]')).toContainText(
      "iunie 2026",
    );
  });

  test("ieșirile fără proiect sunt excluse din total și numărate separat", async ({ page }) => {
    await signIn(page, ownerAccount());
    await costTab(page, PROJECT_ID);

    // Bonul fara proiect are 100 de bucati din produsul de 100 de lei, adica
    // 10000 MDL. Daca ar fi fost inclus undeva, totalul nu ar fi 1850.
    expect(await valueOf(page, "cost-total")).toBe(TOTAL_MDL);

    // P3-04b: NU MAI POATE EXISTA O IESIRE FARA PROIECT, deci numaratorul de
    // neasociate nu mai poate fi diferit de zero si notificarea nu se mai
    // randeaza. outbound_issues.project_id este NOT NULL de la migratia 0026.
    //
    // IES-TEST-C005 nu a disparut din fixture: apartine acum unui AL DOILEA
    // proiect al aceluiasi client, deci cele 10000 MDL ale lui sunt in
    // continuare excluse din totalul acestui proiect, prin mecanismul care a
    // ramas. Afirmatia de mai sus, ca totalul este 1850, este cea care o
    // dovedeste, si ea nu s-a schimbat.
    // Randul se randeaza INTOTDEAUNA, inclusiv la zero, si atunci spune ca totalul
    // NU este partial. Un total partial care nu spune ca este partial ar fi mai
    // rau decat lipsa lui, si acum raspunsul este zero pentru totdeauna.
    const unassigned = page.getByTestId("cost-unassigned");
    await expect(unassigned).toBeVisible();
    expect(Number(await unassigned.getAttribute("data-count"))).toBe(0);
    await expect(unassigned).toContainText("Toate ieșirile au un proiect asociat");
  });

  test("produsele dezactivate rămân în istoric", async ({ page }) => {
    await signIn(page, ownerAccount());
    await costTab(page, PROJECT_ID);

    // TEST-COST-03 este dezactivat in seed si valoreaza 400 din total. Un raport
    // care ar filtra pe active ar pierde exact acei 400 de lei si ar raporta
    // 1450, ceea ce este o cifra plauzibila si gresita.
    const row = page.locator('[data-testid="cost-product-row"][data-sku="TEST-COST-03"]');
    await expect(row).toHaveCount(1);
    expect(Number(await row.getAttribute("data-value-mdl"))).toBe(400);
  });

  test("filtrul doar expediate îngustează totalul, iar implicitul sunt toate ieșirile", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    await costTab(page, PROJECT_ID);
    await expect(page.getByTestId("cost-filter-toate")).toHaveAttribute("data-active", "true");
    expect(await valueOf(page, "cost-total")).toBe(TOTAL_MDL);

    await costTab(page, PROJECT_ID, true);
    await expect(page.getByTestId("cost-filter-expediate")).toHaveAttribute("data-active", "true");
    expect(await valueOf(page, "cost-total")).toBe(TOTAL_SHIPPED_MDL);
  });

  test("un proiect fără ieșiri raportează zero și o stare goală românească", async ({ page }) => {
    await signIn(page, ownerAccount());

    // Un proiect proaspat, creat prin ecran, deci garantat fara nicio iesire.
    const client = `TEST Beneficiar Cost Gol ${RUN}`;
    await page.goto("/clienti");
    await page.getByTestId("client-new").click();
    await expect(page.getByTestId("client-form")).toBeVisible();
    await page.getByTestId("field-client-name").fill(client);
    await page.getByTestId("client-submit").click();
    await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });

    await page.goto("/proiecte");
    await page.getByTestId("project-new").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    await page.getByTestId("field-project-client").selectOption({ label: client });
    await page.getByTestId("field-project-name").fill(`TEST Șantier Cost Gol ${RUN}`);
    await page.getByTestId("project-submit").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    const url = page.url();
    const id = url.slice(url.lastIndexOf("/") + 1).split("?")[0]!;

    await costTab(page, id);
    expect(await valueOf(page, "cost-total")).toBe(0);
    await expect(page.getByTestId("cost-total")).toContainText("0");
    await expect(page.getByText("Niciun cost înregistrat")).toBeVisible();
    await expect(page.getByTestId("cost-product-row")).toHaveCount(0);
  });
});
