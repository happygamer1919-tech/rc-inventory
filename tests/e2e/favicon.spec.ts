import { expect, test, type Page } from "@playwright/test";
import { ownerAccount } from "./support/accounts";
import { LOGIN_PATH, signIn } from "./support/auth";

// favicon.spec - linia de acceptanta a cardului P3-54.
//
// Recenzia aplicatiei live din 2026-09-14, constatarea F10: /favicon.ico
// raspundea 404, deci tabul browserului arata simbolul de pagina goala. Iconita
// vine din app/favicon.ico si app/icon.png, iar Next scrie singur etichetele
// `link` in antet.
//
// DOUA JUMATATI, fiindca un fisier servit si o pagina care il anunta sunt doua
// lucruri diferite: browserul cere /favicon.ico si singur, dar iconita PNG o
// gaseste numai prin eticheta din pagina.

/** Fiecare `link` de iconita din pagina raspunde 200 cu o imagine. */
async function expectIconLinks(page: Page, where: string): Promise<void> {
  const links = page.locator('link[rel*="icon"]');
  // Metadatele pot sosi dupa documentul initial; se asteapta prima eticheta
  // inainte de a le numara, altfel un zero ar fi despre moment, nu despre pagina.
  await expect(links.first(), `niciun link de iconita pe ${where}`).toBeAttached();

  const hrefs = await links.evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
  expect(hrefs.length, `niciun link de iconita pe ${where}`).toBeGreaterThan(0);

  for (const href of hrefs) {
    // maxRedirects 0: o redirectare catre autentificare urmata pana la capat ar
    // raspunde 200 cu text/html, deci ar trece testul de cod si ar pica abia la
    // tipul de continut, din motivul care nu se vede in mesaj.
    const response = await page.request.get(href, { maxRedirects: 0 });
    expect(response.status(), `${href} pe ${where}`).toBe(200);
    expect(response.headers()["content-type"] ?? "", `tipul lui ${href} pe ${where}`).toMatch(
      /^image\//,
    );
  }
}

test.describe("Iconita aplicatiei", () => {
  test("1. /favicon.ico raspunde cu o imagine unui vizitator fara sesiune", async ({ request }) => {
    // Contextul `request` nu poarta niciun cookie, deci aceasta este exact cererea
    // pe care o face un browser inainte de autentificare.
    const response = await request.get("/favicon.ico", { maxRedirects: 0 });

    expect(response.status(), "/favicon.ico fara sesiune").toBe(200);
    expect(response.headers()["location"], "/favicon.ico nu redirecteaza").toBeUndefined();
    expect(response.headers()["content-type"] ?? "").toMatch(/^image\//);
  });

  test("2. pagina de autentificare anunta o iconita care se incarca", async ({ page }) => {
    await page.goto(LOGIN_PATH);
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expectIconLinks(page, LOGIN_PATH);
  });

  test("3. tabloul de bord, cu sesiune, anunta o iconita care se incarca", async ({ page }) => {
    await signIn(page, ownerAccount());
    await expectIconLinks(page, "/");
  });
});
