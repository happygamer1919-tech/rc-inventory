import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";

// p3-201-datefield-red-after-blur.spec - acceptanta cardului P3-201.
//
// EROAREA. P3-158 a facut rosul sa apara de la prima cifra in TOATE casutele de
// data, desi cardul cerea acest lucru numai in formularul de sarcina. Acum rosul
// merge cu o proprietate, `markWhileTyping`, pusa numai pe formularul de sarcina.
//
// DATELE DE TEST NU SE STERG NICIODATA. Randul poarta prefixul TEST si un sufix
// unic pe rulare.

const RUN = process.env.PLAYWRIGHT_RUN_ID ?? Date.now().toString(36);

test.describe("Casutele de data nu se rosesc de la prima cifra (P3-201)", () => {
  test.describe.configure({ timeout: 120_000 });

  // P3-219. Initial acest test cerea ca o cifra tastata sa NU se roseasca pe
  // formularul de client. Asta lasa Enter sa trimita o data pe jumatate scrisa ca
  // sir gol si sa stearga data salvata, deci testul codifica eroarea. Acum rosul
  // apare de la prima cifra si pe formularul de client.
  test("(a, c) pe formularul de client, o cifra tastata se roseste pe loc si opreste Salvează (P3-219)", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await createClientAndEdit(page, `TEST P3-201 Beneficiar ${RUN}`);

    const field = page.getByTestId("field-client-next-action-at");
    const error = page.getByTestId("field-client-next-action-at-error");

    await field.click();
    await field.pressSequentially("1");
    await expect(error).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("client-submit")).toBeDisabled();
  });

  test("(a) pe formularul de client, opt cifre care nu sunt o zi reala se rosesc fara sa se paraseasca casuta", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await createClientAndEdit(page, `TEST P3-201 Opt cifre ${RUN}`);

    const field = page.getByTestId("field-client-next-action-at");
    await field.click();
    await field.pressSequentially("31022027");
    await expect(page.getByTestId("field-client-next-action-at-error")).toBeVisible();
    await expect(page.getByTestId("client-submit")).toBeDisabled();
  });

  test("(b) pe formularul de sarcina, o data scrisa pe jumatate se roseste pe loc", async ({
    page,
  }) => {
    await signIn(page, ownerAccount());
    await page.goto("/sarcini");
    await page.getByTestId("task-new").click();
    await expect(page.getByTestId("task-form")).toBeVisible();

    const field = page.getByTestId("field-task-due-date");
    await field.click();
    await field.pressSequentially("10.10.20");
    await expect(page.getByTestId("field-task-due-date-error")).toBeVisible();
    await expect(page.getByTestId("task-save")).toBeDisabled();
  });
});

async function createClientAndEdit(page: Page, name: string) {
  await page.goto("/clienti");
  await page.getByTestId("client-new").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
  await page.getByTestId("field-client-name").fill(name);
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("client-detail")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("client-edit").click();
  await expect(page.getByTestId("client-form")).toBeVisible();
}
