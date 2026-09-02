import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// project-budget.spec - linia de acceptanta a cardului P3-12.
//
// TREI NUMERE, NU DOUA, SI NICIUNUL DUPA UN CLIC. R-058 delta 12: bugetul,
// totalul devizului acceptat si costul real sunt trei intrebari diferite, iar
// oricare doua spun o poveste incompleta. Fara totalul devizului nu se poate
// deosebi o lucrare peste buget de una sub-cotata, si aceea este chiar
// deosebirea pe care un om o cauta cand deschide fisa.
//
// UN GOL NU ESTE UN ZERO, si aceea este regula care se incalca cel mai usor. Un
// proiect fara buget nu are buget zero. Fiecare caz de mai jos verifica textul
// romanesc de gol si NU o cifra.
//
// PROIECTUL CU TOATE TREI ESTE CEL SEMANAT, deliberat. Costul real vine din
// randuri de iesire pe care formularul nu le poate construi cu datele lor
// (nu are camp de data), exact motivul pentru care scripts/seed-test-cost.mjs
// exista. I se adauga aici un buget si un deviz acceptat, prin ecran.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

// Proiectul semanat de scripts/seed-test-cost.mjs, cu cost real deja pe el.
// Suma este calculata de mana in capul acelui fisier si repetata in
// project-cost.spec; repetata si aici, ca acest fisier sa poata fi verificat
// fara sa fie deschis celalalt.
const COST_PROJECT_ID = "7e57c051-0000-4000-8000-000000000002";
const COST_TOTAL_MDL = 1850;

// Produsele semanate de scripts/seed-test-deviz.mjs, cu preturi fixe.
const DEVIZ_PRODUCT = "TEST Deviz Ciment";
const DEVIZ_SKU = "TEST-DEVIZ-01";

function projectName(tag: string): string {
  return `TEST Buget ${tag} ${RUN}`;
}

async function detail(page: Page, id: string) {
  await page.goto(`/proiecte/${id}`);
  await expect(page.getByTestId("project-budget-figures")).toBeVisible({ timeout: 25_000 });
}

/** Valoarea bruta, din atributul de date si nu din textul formatat.
 *
 *  Textul trece prin Intl si contine spatii insecabile, iar formatMoney
 *  rotunjeste la leu. Acceptanta cere ca totalul de pe fisa si cel de pe fila de
 *  deviz sa fie aceeasi valoare PANA LA BAN, deci comparatia se face pe numarul
 *  brut. Aceeasi conventie ca in deviz.spec si project-cost.spec. */
async function valueOf(page: Page, testId: string): Promise<number | null> {
  const raw = await page.getByTestId(testId).getAttribute("data-value-mdl");
  return raw === null || raw === "" ? null : Number(raw);
}

/** Un client si un proiect noi, cu sau fara buget. */
async function newProject(page: Page, tag: string, budget?: string): Promise<string> {
  const client = `TEST Beneficiar Buget ${tag} ${RUN}`;
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
  await page.getByTestId("field-project-name").fill(projectName(tag));
  if (budget) await page.getByTestId("field-project-budget").fill(budget);
  await page.getByTestId("project-submit").click();
  await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

  const url = new URL(page.url());
  return url.pathname.split("/").pop() as string;
}

/**
 * Un deviz acceptat pe un proiect, construit prin ecran.
 *
 * ORDINEA ESTE CEA IMPUSA DE BAZA DE DATE. Liniile se scriu cat timp devizul
 * este ciorna, fiindca deviz_lines_require_draft refuza orice altceva; emiterea
 * si acceptarea vin dupa, ca doua treceri de stare separate. Este exact drumul
 * pe care il face si un om.
 *
 * Intoarce totalul brut afisat de fila de deviz, ca proba pentru fisa.
 */
async function acceptedDeviz(page: Page, projectId: string, quantity: string): Promise<number> {
  await page.goto(`/proiecte/${projectId}?fila=deviz`);
  await expect(page.getByTestId("deviz-panel")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("deviz-new").click();
  await expect(page.getByTestId("deviz-add-line")).toBeVisible({ timeout: 25_000 });

  const input = page.getByTestId("deviz-add-product").locator("input");
  await input.click();
  await input.fill(DEVIZ_PRODUCT);
  const list = page.locator("[data-rc-combo-list]");
  await expect(list).toBeVisible({ timeout: 10_000 });
  await expect(list.locator("li")).toHaveCount(1);
  await list.locator("li").first().click();
  await page.getByTestId("deviz-add-quantity").fill(quantity);
  await page.getByTestId("deviz-add-submit").click();
  await expect(page.getByTestId(`deviz-line-quoted-${DEVIZ_SKU}`)).toBeVisible({ timeout: 25_000 });

  await page.getByTestId("deviz-status-sent").click();
  await expect(page.getByTestId("deviz-status-accepted")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("deviz-status-accepted").click();

  // NU SE ASTEAPTA deviz-locked AICI, SI ASTA A FOST UN DEFECT AL ACESTUI TEST.
  // Blocarea apare la ORICE stare in afara de ciorna, deci era deja adevarata
  // dupa emitere: asteptarea trecea instantaneu si testul citea fisa inainte ca
  // acceptarea sa fi ajuns in baza. Fisa arata atunci "Fără deviz acceptat" si
  // esecul parea al ecranului.
  //
  // Din accepted nu mai exista nicio tranzitie, deci butoanele de stare DISPAR.
  // Aceea este singura conditie care devine adevarata abia dupa acceptare.
  await expect(page.getByTestId("deviz-status-accepted")).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByTestId("deviz-row").first()).toContainText("Acceptat", { timeout: 25_000 });

  const raw = await page.getByTestId("deviz-total").getAttribute("data-value-mdl");
  return Number(raw);
}

test.describe("Buget, deviz și cost pe proiect", () => {
  test.describe.configure({ timeout: 240_000 });

  test("1. toate trei numerele sunt pe fișă, fără să fie deschis nimic", async ({ page }) => {
    await signIn(page, ownerAccount());

    // Bugetul se pune pe proiectul semanat, prin formularul de modificare.
    await page.goto(`/proiecte/${COST_PROJECT_ID}`);
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("project-edit").click();
    await expect(page.getByTestId("project-form")).toBeVisible();
    await page.getByTestId("field-project-budget").fill("5000");
    await page.getByTestId("project-submit").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    const devizTotal = await acceptedDeviz(page, COST_PROJECT_ID, "3");

    await detail(page, COST_PROJECT_ID);
    expect(await valueOf(page, "project-budget")).toBe(5000);
    expect(await valueOf(page, "project-deviz-total")).toBe(devizTotal);
    expect(await valueOf(page, "project-actual-cost")).toBe(COST_TOTAL_MDL);

    // NICIUNUL DINTRE CELE TREI NU ESTE ASCUNS. Vizibile fara clic, fara fila,
    // fara acordeon, ceea ce este chiar clauza cardului.
    for (const id of ["project-budget", "project-deviz-total", "project-actual-cost"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test("2. abaterea și consumatul sunt față de BUGET și sunt etichetate așa", async ({ page }) => {
    await signIn(page, ownerAccount());

    const id = await newProject(page, "Abatere", "1000");
    await detail(page, id);

    // Fara iesiri, costul real este zero, deci abaterea este bugetul intreg.
    expect(await valueOf(page, "project-actual-cost")).toBe(0);
    expect(await valueOf(page, "project-variance")).toBe(1000);
    expect(await page.getByTestId("project-consumed").getAttribute("data-percent")).toBe("0");

    // ETICHETATE CONTRA BUGETULUI, in cuvinte. Culoarea singura nu spune fata de
    // ce, iar cardul cere ca nimeni sa nu le citeasca drept fata de deviz.
    await expect(page.getByTestId("project-variance")).toContainText("Abatere față de buget");
    await expect(page.getByTestId("project-consumed")).toContainText("Consumat din buget");
  });

  test("3. buget fără deviz acceptat: trei blocuri, unul cu stare goală, nu două blocuri", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const id = await newProject(page, "FaraDeviz", "2500");
    await detail(page, id);

    expect(await valueOf(page, "project-budget")).toBe(2500);
    expect(await valueOf(page, "project-actual-cost")).toBe(0);

    // GOL, NU ZERO. Un proiect fara deviz acceptat nu a fost cotat la zero lei.
    expect(await valueOf(page, "project-deviz-total")).toBeNull();
    await expect(page.getByTestId("project-deviz-total-empty")).toHaveText("Fără deviz acceptat");

    // NU SE PRABUSESTE LA DOUA NUMERE, care este chiar clauza cardului.
    await expect(page.getByTestId("project-budget-figures").locator("> div")).toHaveCount(3);
  });

  test("4. deviz acceptat fără buget: consumatul este o liniuță, nu o împărțire la zero", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const id = await newProject(page, "FaraBuget");
    const devizTotal = await acceptedDeviz(page, id, "2");
    await detail(page, id);

    expect(await valueOf(page, "project-deviz-total")).toBe(devizTotal);
    expect(await valueOf(page, "project-budget")).toBeNull();
    await expect(page.getByTestId("project-budget-empty")).toHaveText("Fără buget");

    // O LINIUTA, NU UN PROCENT. O impartire la un buget absent da Infinity, care
    // pe ecran arata ca un numar enorm si real.
    await expect(page.getByTestId("project-consumed-dash")).toHaveText("-");
    expect(await page.getByTestId("project-consumed").getAttribute("data-percent")).toBe("");
    await expect(page.getByTestId("project-variance-empty")).toHaveText("Fără buget");
  });

  test("5. nici buget nici deviz: costul real și două stări goale", async ({ page }) => {
    await signIn(page, ownerAccount());

    const id = await newProject(page, "Nimic");
    await detail(page, id);

    expect(await valueOf(page, "project-actual-cost")).toBe(0);
    await expect(page.getByTestId("project-budget-empty")).toHaveText("Fără buget");
    await expect(page.getByTestId("project-deviz-total-empty")).toHaveText("Fără deviz acceptat");
    await expect(page.getByTestId("project-consumed-dash")).toHaveText("-");
  });

  test("6. totalul de pe fișă este cel de pe fila de deviz, până la ban", async ({ page }) => {
    await signIn(page, ownerAccount());

    const id = await newProject(page, "Potrivire", "9000");
    // Cantitate care produce un adaos cu bani, ca potrivirea sa fie despre
    // aritmetica si nu despre doua numere rotunde care s-ar potrivi oricum.
    const devizTotal = await acceptedDeviz(page, id, "7");

    await detail(page, id);
    const onDetail = await valueOf(page, "project-deviz-total");

    // ACEEASI VALOARE BRUTA, nu acelasi text. Textul este rotunjit la leu de
    // formatMoney pe amandoua ecranele, deci o comparatie pe text ar trece si
    // atunci cand cele doua numere difera cu bani.
    expect(onDetail).toBe(devizTotal);

    // Si versiunea este numita, ca cititorul sa stie CARE deviz este cel citat.
    await expect(page.getByTestId("project-deviz-total")).toContainText("Versiunea 1");
  });

  test("7. fiecare șir vizibil este românesc", async ({ page }) => {
    await signIn(page, ownerAccount());

    const id = await newProject(page, "Limba");
    await detail(page, id);

    const panel = page.getByTestId("project-budget-figures").locator("xpath=..");
    await expect(panel).toContainText("Buget");
    await expect(panel).toContainText("Total deviz acceptat");
    await expect(panel).toContainText("Cost real");
    await expect(panel).toContainText("Abatere față de buget");
    await expect(panel).toContainText("Consumat din buget");

    // Niciun sir englezesc scapat in blocul acesta.
    const text = (await panel.innerText()).toLowerCase();
    for (const word of ["budget", "total accepted", "actual", "variance", "consumed", "n/a"]) {
      expect(text).not.toContain(word);
    }
  });
});
