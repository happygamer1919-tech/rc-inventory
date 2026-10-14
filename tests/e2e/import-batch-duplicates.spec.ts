import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// import-batch-duplicates.spec - cardul P3-301.
//
// DOUA CAZURI PE ECRANUL DE IMPORT AL LEADURILOR, NICIUNUL NU SCRIE NIMIC IN BAZA:
//
//   1. Un fisier de 300 de randuri cu acelasi telefon la randurile 10 si 260. Verificarea il
//      trimite pe loturi de 200, deci cele doua randuri sunt in loturi diferite; inainte de
//      P3-301 ambele erau "Noi". Previzualizarea trebuie sa arate al doilea rand ca dublat al
//      primului. Se opreste la pasul "Verifică", deci nu se scrie nimic.
//
//   2. Un import care cade la jumatate. Primul lot (200 de randuri) are numai randuri FARA
//      telefon si fara email, deci toate sunt refuzate la verificare si nu se scrie nimic din
//      ele; al doilea apel catre server este intrerupt din browser. Ecranul trebuie sa spuna ca
//      se poate sa fi fost salvate randuri, ca fisierul se poate incarca din nou fara risc, si
//      sa arate ce a facut primul lot, cu "Descarcă rândurile nepreluate".
//
// FIXTURILE SUNT INVENTATE AICI (vezi lead-import.spec.ts): fiecare rand poarta TEST si un
// sufix unic pe rulare, nicio persoana reala. Telefoanele sunt unice pe rulare ca sa nu se
// potriveasca cu niciun client stocat.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

/** Doua cifre care fac telefoanele rularii unice; cu patru cifre pentru rand, 9 cifre in total. */
const RUN2 = String(Math.floor(Math.random() * 90) + 10);

function phone(n: number): string {
  return `069${RUN2}${String(n).padStart(4, "0")}`;
}

function csv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\r\n");
}

async function openImport(page: Page): Promise<void> {
  await page.goto("/clienti?vedere=leaduri");
  await expect(page.getByTestId("leaduri-import")).toBeVisible();
  await page.getByTestId("leaduri-import").click();
  await expect(page.getByTestId("lead-import")).toBeVisible();
  await expect(page.getByTestId("import-step-1")).toBeVisible();
}

async function chooseFile(page: Page, body: string): Promise<void> {
  await page.getByTestId("import-file").setInputFiles({
    name: "leaduri-loturi.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body, "utf8"),
  });
  await expect(page.getByTestId("import-read")).toBeVisible();
}

async function countAt(page: Page, testId: string): Promise<number> {
  return Number((await page.getByTestId(testId).innerText()).trim());
}

test.beforeEach(async ({ page }) => {
  await signIn(page, ownerAccount());
});

test("P3-301: un telefon la randurile 10 si 260 al unui fisier de 300 de randuri se vede dublat la verificare", async ({
  page,
}) => {
  const rows: string[][] = [["Denumire", "Telefon"]];
  for (let n = 1; n <= 300; n += 1) rows.push([`TEST ${RUN} lead ${n}`, phone(n)]);
  // Randul de date 260 (linia 261 din foaie) repeta telefonul randului de date 10 (linia 11).
  rows[260] = [`TEST ${RUN} lead 260 dublat`, phone(10)];

  await openImport(page);
  await chooseFile(page, csv(rows));
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible({ timeout: 60_000 });

  expect(await countAt(page, "import-count-new")).toBe(299);
  expect(await countAt(page, "import-count-duplicate")).toBe(1);
  expect(await countAt(page, "import-count-error")).toBe(0);

  const duplicate = page.getByTestId("import-duplicate");
  await expect(duplicate).toHaveCount(1);
  await expect(duplicate).toHaveAttribute("data-line", "261");
  await expect(duplicate).toContainText("rândul 11 din același fișier");
});

test("P3-301: un import intrerupt la jumatate spune ca se poate relua fisierul si arata ce s-a terminat", async ({
  page,
}) => {
  // Randurile 1 pana la 200 nu au nici telefon, nici email: sunt refuzate si nu se scrie nimic.
  // Randurile 201 pana la 450 sunt bune, dar apelul lor catre server este intrerupt mai jos.
  const rows: string[][] = [["Denumire", "Telefon", "Email"]];
  for (let n = 1; n <= 200; n += 1) rows.push([`TEST ${RUN} fara contact ${n}`, "", ""]);
  for (let n = 201; n <= 450; n += 1) rows.push([`TEST ${RUN} lead ${n}`, phone(n), ""]);

  await openImport(page);
  await chooseFile(page, csv(rows));
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-2")).toBeVisible();
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-3")).toBeVisible({ timeout: 60_000 });
  expect(await countAt(page, "import-count-error")).toBe(200);
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("import-step-4")).toBeVisible();

  // De aici, al doilea apel catre server este intrerupt: primul lot trece, al doilea nu.
  let calls = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      calls += 1;
      if (calls === 2) {
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });

  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-summary")).toBeVisible({ timeout: 60_000 });

  // Ce a facut primul lot este pe ecran, cu fisierul randurilor nepreluate.
  expect(await countAt(page, "import-created")).toBe(0);
  expect(await countAt(page, "import-skipped")).toBe(200);
  await expect(page.getByTestId("import-download-skipped")).toBeVisible();

  const message = page.getByTestId("import-error");
  await expect(message).toBeVisible();
  await expect(message).toContainText("Importul nu a putut fi finalizat.");
  await expect(message).toContainText("se poate să fi fost salvate câteva rânduri");
  await expect(message).toContainText("rândurile 202 până la 401");
  await expect(message).toContainText("Puteți încărca din nou același fișier fără risc");
});
