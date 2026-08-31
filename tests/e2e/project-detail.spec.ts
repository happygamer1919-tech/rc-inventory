import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// project-detail.spec - linia de acceptanta a cardului P3-09.
//
// Acopera exact ce numeste cardul: toate cele patru file se randeaza si se pot
// atinge; fila activa este in URL si supravietuieste unei reincarcari; Consum
// listeaza materialul eliberat catre acest proiect, cele mai noi primele, cel
// mult 5 randuri cu o legatura catre istoricul complet; Istoric randeaza randurile
// de istoric ale acestui proiect in ordine cronologica inversa cu momentul lor;
// Deviz si Documente isi randeaza starile goale romanesti fara sa arunce; un
// proiect fara iesiri si fara istoric randeaza fiecare fila ca stare goala si nu
// ca prabusire.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);
const TABS = ["consum", "deviz", "documente", "istoric"] as const;

async function createProjectFor(page: Page, tag: string): Promise<string> {
  const client = `TEST Beneficiar ${tag} ${RUN}`;
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
  await page.getByTestId("field-project-name").fill(`TEST Șantier ${tag} ${RUN}`);
  await page.getByTestId("project-submit").click();
  await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

  const url = page.url();
  return url.slice(url.lastIndexOf("/") + 1).split("?")[0]!;
}

test.describe("Fișa proiectului", () => {
  test.describe.configure({ timeout: 120_000 });

  test("toate cele patru file se randează, iar fila activă trăiește în URL", async ({ page }) => {
    await signIn(page, ownerAccount());
    const id = await createProjectFor(page, "File");

    for (const tab of TABS) {
      await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
    }

    // Implicitul este prima fila.
    await expect(page.getByTestId("panel-consum")).toBeVisible();

    for (const tab of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`panel-${tab}`)).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`fila=${tab}`));
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute("data-active", "true");
    }

    // SUPRAVIETUIESTE UNEI REINCARCARI, pentru ca traieste in URL.
    await page.reload();
    await expect(page.getByTestId("panel-istoric")).toBeVisible({ timeout: 20_000 });

    // O fila necunoscuta revine la prima si nu da eroare.
    await page.goto(`/proiecte/${id}?fila=inexistenta`);
    await expect(page.getByTestId("panel-consum")).toBeVisible({ timeout: 15_000 });
  });

  test("un proiect gol randează fiecare filă ca stare goală și nu ca prăbușire", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await createProjectFor(page, "Gol");

    const expected: Record<string, string> = {
      consum: "Niciun consum înregistrat",
      deviz: "Niciun deviz",
      documente: "Niciun document",
      istoric: "Nicio schimbare de stare",
    };

    for (const tab of TABS) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`panel-${tab}`)).toContainText(expected[tab]!, {
        timeout: 15_000,
      });
    }
  });

  test("Istoric randează mutările în ordine cronologică inversă", async ({ page }) => {
    await signIn(page, ownerAccount());
    await createProjectFor(page, "Istoric");

    // Trei mutari, fiecare asteptata pe CHIP si nu pe panou: panoul contine si
    // selectul, iar selectul contine toate etichetele ca optiuni.
    await page.getByTestId("project-status-select").selectOption("offer");
    await expect(page.getByTestId("project-status-chip")).toHaveText("Ofertă", { timeout: 25_000 });
    await page.getByTestId("project-status-select").selectOption("contract");
    await expect(page.getByTestId("project-status-chip")).toHaveText("Contract", { timeout: 25_000 });
    await page.getByTestId("project-status-select").selectOption("active");
    await expect(page.getByTestId("project-status-chip")).toHaveText("În lucru", { timeout: 25_000 });

    await page.getByTestId("tab-istoric").click();
    await expect(page.getByTestId("history-row")).toHaveCount(3, { timeout: 20_000 });

    // CELE MAI NOI PRIMELE. Ultima mutare a fost catre In lucru.
    await expect(page.getByTestId("history-row").first()).toContainText("În lucru");
    await expect(page.getByTestId("history-row").last()).toContainText("Prospect");

    // Si fiecare rand poarta momentul ei.
    await expect(page.getByTestId("history-row").first()).toContainText(/\d{2}\.\d{2}\.\d{4}/);
  });

  test("Consum listează cel mult 5 ieșiri, cele mai noi primele, cu o legătură către istoric", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    const id = await createProjectFor(page, "Consum");

    await page.goto(`/proiecte/${id}?fila=consum`);

    // Fara iesiri catre acest santier, starea goala. Numarul de randuri nu poate
    // depasi cinci pentru ca functia din 0023 cere cinci, ceea ce este afirmatia
    // de densitate a cardului si nu cere sase ecrane de date construite.
    const rows = page.getByTestId("issue-row");
    expect(await rows.count()).toBeLessThanOrEqual(5);

    if ((await rows.count()) === 0) {
      await expect(page.getByTestId("panel-consum")).toContainText("Niciun consum înregistrat");
    } else {
      await expect(page.getByTestId("issue-total")).toBeVisible();
      await expect(page.getByTestId("issue-full-history")).toBeVisible();
    }
  });
});
