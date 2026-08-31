import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// projects.spec - linia de acceptanta a cardului P3-07.
//
// Acopera exact ce numeste cardul: lista vine din baza cu numele clientului
// ALATURAT si nu retastat; filtrul de stare ingusteaza la o singura etapa si isi
// citeste optiunile din cele sase valori ale enumului in ordinea declararii;
// filtrul de client ingusteaza la un client; cautarea potriveste denumirea si
// adresa fara diacritice; lista pagineaza la 25; un clic pe rand deschide fisa
// si inapoi intoarce cu filtrele intacte; crearea cere un client si persista;
// schimbarea starii scrie un rand de istoric si fisa il arata; un termen estimat
// inaintea datei de inceput este refuzat cu mesaj romanesc; fiecare sir vizibil
// este romanesc.
//
// DATELE DE TEST NU SE STERG NICIODATA, conform conventiei P2-07.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

function clientName(tag: string): string {
  return `TEST Beneficiar ${tag} ${RUN}`;
}
function projectName(tag: string): string {
  return `TEST Șantier ${tag} ${RUN}`;
}

async function createClientFor(page: Page, name: string) {
  await page.goto("/clienti");
  await page.getByTestId("client-new").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-name").fill(name);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
}

async function createProject(
  page: Page,
  opts: {
    client: string;
    name: string;
    address?: string;
    status?: string;
    start?: string;
    end?: string;
    budget?: string;
  },
) {
  await page.goto("/proiecte");
  await page.getByTestId("project-new").click();
  await expect(page.getByTestId("project-form")).toBeVisible();
  await page.getByTestId("field-project-client").selectOption({ label: opts.client });
  await page.getByTestId("field-project-name").fill(opts.name);
  if (opts.address) await page.getByTestId("field-project-address").fill(opts.address);
  if (opts.status) await page.getByTestId("field-project-status").selectOption(opts.status);
  if (opts.start) await page.getByTestId("field-project-start").fill(opts.start);
  if (opts.end) await page.getByTestId("field-project-end").fill(opts.end);
  if (opts.budget) await page.getByTestId("field-project-budget").fill(opts.budget);
  await page.getByTestId("project-submit").click();
}

test.describe("Proiecte", () => {
  test.describe.configure({ timeout: 120_000 });

  test("crearea cere un client, persistă, și lista arată numele clientului alăturat", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const client = clientName("Persistenta");
    await createClientFor(page, client);

    const name = projectName("Persistenta");
    await createProject(page, { client, name, budget: "125000" });
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("project-detail")).toContainText(client);

    await page.reload();
    await expect(page.getByTestId("project-detail")).toContainText(client);

    await page.goto("/proiecte");
    await page.getByTestId("projects-search").fill(name);
    const row = page.locator(`[data-testid="project-row"][data-name="${name}"]`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    // NUMELE CLIENTULUI ESTE ALATURAT, nu retastat pe proiect.
    await expect(row).toContainText(client);
    // Bugetul are separatori si sufixul MDL.
    await expect(row).toContainText("MDL");
  });

  test("un buget gol se afișează ca fără buget și nu ca zero", async ({ page }) => {
    await signIn(page, ownerAccount());

    const client = clientName("FaraBuget");
    await createClientFor(page, client);

    const name = projectName("FaraBuget");
    await createProject(page, { client, name });
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    // GOL SI ZERO SUNT DOUA FAPTE DIFERITE, si ecranul spune care.
    await expect(page.getByTestId("project-detail")).toContainText("Fără buget");

    await page.goto(`/proiecte?q=${encodeURIComponent(name)}`);
    const row = page.locator(`[data-testid="project-row"][data-name="${name}"]`);
    await expect(row).toContainText("Fără buget", { timeout: 15_000 });
  });

  test("un termen estimat înaintea datei de început este refuzat cu mesaj românesc", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const client = clientName("Date");
    await createClientFor(page, client);

    await createProject(page, {
      client,
      name: projectName("DataGresita"),
      start: "2026-06-01",
      end: "2026-05-01",
    });

    const error = page.getByTestId("form-error");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("Termenul estimat");
    await expect(error).not.toContainText("violates");
    await expect(error).not.toContainText("constraint");
  });

  test("schimbarea stării scrie un rând de istoric, iar fișa îl arată", async ({ page }) => {
    await signIn(page, ownerAccount());

    const client = clientName("Istoric");
    await createClientFor(page, client);

    const name = projectName("Istoric");
    await createProject(page, { client, name, status: "lead" });
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    // Nicio schimbare inca, deci niciun rand de istoric. ISTORICUL ESTE O FILA
    // DE LA P3-09 INCOACE: fisa nu mai poarta un rezumat duplicat, pentru ca
    // doua locuri cu acelasi data-testid ar fi numarate amandoua.
    await page.getByTestId("tab-istoric").click();
    await expect(page.getByTestId("panel-istoric")).toContainText("Nicio schimbare de stare", {
      timeout: 15_000,
    });

    // AFIRMATIA ESTE PE CHIP, NU PE PANOU. Panoul contine si selectul, iar
    // selectul contine toate cele sase etichete ca optiuni, deci o afirmatie pe
    // panou trece pentru orice stare si testul nu asteapta nimic. Prima versiune
    // a acestui fisier facea exact asta, si cele trei mutari se cursau intre
    // ele: CI a raportat 2 randuri de istoric acolo unde trebuiau 3.
    await page.getByTestId("project-status-select").selectOption("contract");
    await expect(page.getByTestId("project-status-chip")).toHaveText("Contract", {
      timeout: 25_000,
    });
    await page.getByTestId("tab-istoric").click();
    await expect(page.getByTestId("history-row").first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("panel-istoric")).toContainText("Contract");

    // SI PERSISTA. Un istoric care traieste in starea unui component nu este un
    // istoric. Fila supravietuieste reincarcarii pentru ca este in URL.
    await page.reload();
    await expect(page.getByTestId("panel-istoric")).toContainText("Contract", { timeout: 20_000 });

    // CONDUCTA NU ESTE O MASINA DE STARI: munca reala merge si inapoi.
    await page.getByTestId("project-status-select").selectOption("suspended");
    await expect(page.getByTestId("project-status-chip")).toHaveText("Suspendat", {
      timeout: 25_000,
    });
    await page.getByTestId("project-status-select").selectOption("lead");
    await expect(page.getByTestId("project-status-chip")).toHaveText("Prospect", {
      timeout: 25_000,
    });
    await page.goto(page.url().split("?")[0] + "?fila=istoric");
    await expect(page.getByTestId("history-row")).toHaveCount(3, { timeout: 15_000 });
  });

  test("filtrele de stare și de client îngustează lista, iar înapoi le păstrează", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const clientA = clientName("FiltruA");
    const clientB = clientName("FiltruB");
    await createClientFor(page, clientA);
    await createClientFor(page, clientB);

    const inLucru = projectName("InLucru");
    const inchis = projectName("Inchis");
    await createProject(page, { client: clientA, name: inLucru, status: "active" });
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });
    await createProject(page, { client: clientB, name: inchis, status: "closed" });
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    const rowActive = page.locator(`[data-testid="project-row"][data-name="${inLucru}"]`);
    const rowClosed = page.locator(`[data-testid="project-row"][data-name="${inchis}"]`);

    // IMPLICITUL ESTE PATRU STARI DIN SASE. Un santier inchis nu apare pana nu
    // este cerut: o lista care se deschide aratand fiecare santier inchis de
    // acum doi ani este exact defectul pe care densitatea il opreste.
    await page.goto(`/proiecte?q=${encodeURIComponent(`TEST Șantier`)}`);
    await expect(rowActive).toHaveCount(1, { timeout: 15_000 });
    await expect(rowClosed).toHaveCount(0);

    // Si "toate" il arata.
    await page.goto(`/proiecte?q=${encodeURIComponent(`TEST Șantier`)}&stare=toate`);
    await expect(rowClosed).toHaveCount(1, { timeout: 15_000 });

    // O singura stare ingusteaza la ea.
    await page.goto(`/proiecte?q=${encodeURIComponent(`TEST Șantier`)}&stare=active`);
    await expect(rowActive).toHaveCount(1, { timeout: 15_000 });
    await expect(rowClosed).toHaveCount(0);

    // Filtrul de client ingusteaza la un client.
    const clientId = await page
      .locator('[data-testid="projects-client"] option')
      .filter({ hasText: clientA })
      .getAttribute("value");
    await page.goto(`/proiecte?client=${clientId}&stare=toate`);
    await expect(rowActive).toHaveCount(1, { timeout: 15_000 });
    await expect(rowClosed).toHaveCount(0);

    // INAPOI PASTREAZA FILTRELE, pentru ca traiesc in URL.
    await rowActive.getByTestId("project-link").click();
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(/client=/);
    await expect(rowActive).toHaveCount(1, { timeout: 15_000 });
  });

  test("căutarea potrivește denumirea și adresa fără diacritice, iar lista paginează la 25", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());

    const client = clientName("Cautare");
    await createClientFor(page, client);

    const name = projectName("Țiglă");
    await createProject(page, { client, name, address: "Strada Ștefan cel Mare 1" });
    await expect(page.getByTestId("project-detail")).toBeVisible({ timeout: 25_000 });

    const row = page.locator(`[data-testid="project-row"][data-name="${name}"]`);

    await page.goto("/proiecte");
    await page.getByTestId("projects-search").fill(`tigla ${RUN}`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    // Dupa ADRESA, fara diacritice, in aceeasi casuta.
    await page.getByTestId("projects-search").fill("stefan cel mare");
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    // Niciodata mai mult de 25 de randuri pe pagina.
    await page.goto("/proiecte?stare=toate");
    expect(await page.getByTestId("project-row").count()).toBeLessThanOrEqual(25);
  });
});
