import { expect, test } from "@playwright/test";
import { managerAccount, ownerAccount } from "./support/accounts";
import { LOGIN_PATH, signIn, signOut, submitLogin } from "./support/auth";

// auth.spec - linia de acceptanta a cardului P2-02.
//
// Acopera exact cele patru lucruri pe care le numeste cardul:
//   1. autentificarea cu contul owner reuseste
//   2. o parola gresita arata eroarea romaneasca
//   3. o cerere neautentificata catre o ruta protejata redirectioneaza la login
//   4. contul account_manager este refuzat la ruta de setari

test.describe("Autentificare", () => {
  test("o cerere neautentificată către o rută protejată redirecționează la autentificare", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
    await expect(page.getByTestId("login-form")).toBeVisible();

    // Invelisul aplicatiei nu trebuie sa se randeze pentru un vizitator
    // neautentificat: un meniu cu zero date citeste ca sistem stricat.
    await expect(page.getByTestId("topbar-role")).toHaveCount(0);
  });

  test("fiecare rută protejată redirecționează, nu doar rădăcina", async ({ page }) => {
    // Refuzul este implicit, deci se verifica pe mai multe rute, nu pe una.
    for (const path of ["/inventar", "/comenzi", "/iesiri", "/setari", "/memento"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
    }
  });

  test("parolă greșită arată eroarea în română, fără să divulge dacă emailul există", async ({
    page,
  }) => {
    const owner = ownerAccount();
    await submitLogin(page, { ...owner, password: "parola-gresita-in-mod-deliberat" });

    const error = page.getByTestId("login-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText("Email sau parolă incorectă.");

    // Nu a plecat de pe ecranul de autentificare.
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));

    // Niciun text englezesc scapat din Supabase.
    await expect(error).not.toContainText(/invalid|credentials/i);
  });

  test("un email necunoscut dă exact aceeași eroare ca o parolă greșită", async ({ page }) => {
    await submitLogin(page, {
      email: "nimeni@rc-inventory.local",
      password: "orice-parola",
      label: "necunoscut",
    });
    const error = page.getByTestId("login-error");
    await expect(error).toBeVisible();
    // Acelasi mesaj: altfel ecranul confirma unui strain ce adrese exista.
    await expect(error).toHaveText("Email sau parolă incorectă.");
  });

  test("contul owner se autentifică și vede rolul Administrator", async ({ page }) => {
    await signIn(page, ownerAccount());
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("topbar-role")).toHaveText("Administrator");
  });

  test("contul owner poate deschide setările", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto("/setari");
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
  });

  test("contul account_manager se autentifică și vede rolul Operator", async ({ page }) => {
    await signIn(page, managerAccount());
    await expect(page.getByTestId("topbar-role")).toHaveText("Operator");
  });

  test("contul account_manager este refuzat la setări, cu ecran 403 românesc", async ({
    page,
  }) => {
    await signIn(page, managerAccount());
    await page.goto("/setari");

    const forbidden = page.getByTestId("forbidden");
    // Vezi nota din products.spec: ruta este servita prin rewrite si poate fi
    // compilata la prima cerere in dezvoltare.
    await expect(forbidden).toBeVisible({ timeout: 25_000 });
    await expect(forbidden).toContainText("Acces interzis");

    // Rewrite, nu redirect: adresa ramane cea ceruta, deci nu exista bucla.
    await expect(page).toHaveURL(/\/setari$/);
  });

  test("ieșirea din cont readuce refuzul implicit", async ({ page }) => {
    await signIn(page, ownerAccount());
    await signOut(page);
    await page.goto("/inventar");
    await expect(page).toHaveURL(new RegExp(`${LOGIN_PATH}$`));
  });

  test("un utilizator autentificat nu rămâne pe ecranul de autentificare", async ({ page }) => {
    await signIn(page, ownerAccount());
    await page.goto(LOGIN_PATH);
    await expect(page).toHaveURL(/\/$/);
  });
});
