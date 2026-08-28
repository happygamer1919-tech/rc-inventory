import { expect, test } from "@playwright/test";
import { managerAccount, noProfileAccount, ownerAccount } from "./support/accounts";
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

/* ------------------------------------------------------------- CRIT-10 -- */

// CRIT-10. Formularul de autentificare nu mai poate trimite acreditarile prin
// bara de adresa.
//
// DEFECTUL, gasit pe productie: <form onSubmit={...}> nu avea `action`, iar
// ambele campuri aveau `name`. Pana cand React se hidrateaza, butonul este un
// control nativ `type="submit"`, deci un clic facea trimiterea implicita a
// browserului: GET catre aceeasi adresa, cu fiecare camp cu `name` serializat in
// sirul de interogare. Parola ajungea in bara de adresa, in istoricul
// navigatorului de pe un calculator din depozit, in jurnalul de acces al
// serverului si in antetul Referer al urmatoarei cereri.
//
// Doua verificari, pentru ca defectul are doua jumatati.

test.describe("CRIT-10 acreditarile nu ajung niciodata in adresa", () => {
  test("campurile de autentificare nu au atributul name, deci o trimitere nativa nu poarta nimic", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH);
    await expect(page.getByTestId("login-form")).toBeVisible();

    // Fara `name` nu exista ce serializa. Aceasta este apararea structurala:
    // nu depinde de momentul hidratarii si nu se poate pierde intr-o cursa.
    await expect(page.locator("#email")).not.toHaveAttribute("name", /.*/);
    await expect(page.locator("#password")).not.toHaveAttribute("name", /.*/);
  });

  test("o trimitere nativa fortata nu pune parola in sirul de interogare", async ({ page }) => {
    const navigated: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigated.push(frame.url());
    });

    // waitUntil "commit" intoarce controlul de indata ce raspunsul a inceput,
    // deci codul de mai jos ruleaza inainte ca React sa se hidrateze. Aceasta
    // este exact fereastra in care defectul a fost reprodus pe productie.
    await page.goto(LOGIN_PATH, { waitUntil: "commit" });

    await page.locator("#email").fill("cineva@rc-inventory.local");
    await page.locator("#password").fill("parola-care-nu-are-voie-in-adresa");

    // `force` trece peste asteptarea de actionabilitate: butonul este dezactivat
    // pana la hidratare, iar un clic pe el trebuie sa nu faca nimic. Fara force
    // testul ar astepta pana cand butonul se activeaza si ar verifica drumul
    // hidratat, adica exact drumul care nu a fost niciodata defect.
    await page
      .getByTestId("login-submit")
      .click({ force: true, noWaitAfter: true, timeout: 5_000 })
      .catch(() => {});

    // Si trimiterea nativa ceruta direct, care ocoleste complet onSubmit. Daca
    // vreun `name` se intoarce vreodata in formular, acesta este testul care
    // cade, indiferent de starea hidratarii.
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('[data-testid="login-form"]');
      form?.submit();
    });
    await page.waitForTimeout(2_000);

    navigated.push(page.url());

    for (const url of navigated) {
      const params = new URL(url).searchParams;
      expect(params.has("password"), `parola in adresa: ${new URL(url).pathname}`).toBe(false);
      expect(params.has("email"), `emailul in adresa: ${new URL(url).pathname}`).toBe(false);
    }
  });
});

/* ------------------------------------------------------------- CRIT-13 -- */

// CRIT-13. Cookie-ul de sesiune poarta atributul Secure.
//
// Cookie-ul tine tokenul de acces si pe cel de reimprospatare. Fara Secure,
// browserul l-ar trimite pe o cerere http simpla catre acelasi host.

test("cookie-ul de sesiune este scris cu Secure si SameSite Lax", async ({ page, context }) => {
  await signIn(page, ownerAccount());

  const cookies = await context.cookies();
  const session = cookies.find((c) => /^sb-.*-auth-token/.test(c.name));

  expect(session, "cookie-ul de sesiune nu a fost gasit dupa autentificare").toBeDefined();
  expect(session!.secure, "cookie-ul de sesiune nu are atributul Secure").toBe(true);
  expect(session!.sameSite).toBe("Lax");
});

// ---------------------------------------------------------------------------
// CRIT-17. Un cont autentificat fara rand activ in profiles.
//
// DEFECTUL, ASA CUM L-A INTALNIT PROPRIETARUL: autentificarea reusea, browserul
// primea /  ->  /autentificare  ->  /  ->  /autentificare la nesfarsit si se
// oprea cu ERR_TOO_MANY_REDIRECTS. Cauza era ordinea din proxy: ramura
// "esti autentificat pe pagina de autentificare, mergi la /" se evalua INAINTEA
// ramurii "nu ai profil activ, mergi la pagina de autentificare", deci cele doua
// se aratau una spre cealalta.
//
// De ce testul se uita la NUMARUL de raspunsuri si nu doar la ecranul final:
// un ecran corect afisat dupa cincizeci de redirectari este tot un defect, iar
// o asertiune numai pe ecran ar fi trecut si inainte de reparatie dacă browserul
// s-ar fi oprit intamplator pe partea buna a buclei.
// ---------------------------------------------------------------------------
test.describe("Cont fara profil activ", () => {
  test("nu intra in bucla de redirectari si vede un ecran romanesc", async ({ page }) => {
    const redirects: string[] = [];
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 300 && status < 400) redirects.push(`${status} ${new URL(response.url()).pathname}`);
    });

    await submitLogin(page, noProfileAccount());

    // Ecranul dedicat, randat prin rewrite, deci adresa ramane cea ceruta.
    const screen = page.getByTestId("no-profile");
    await expect(screen).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Contul nu are acces" })).toBeVisible();

    // Nicio bucla. Doua redirectari sunt normale la o autentificare reusita;
    // bucla producea zeci inainte ca browserul sa renunte.
    expect(redirects.length, `redirectari observate: ${redirects.join(", ")}`).toBeLessThan(5);

    // Invelisul aplicatiei nu se randeaza: un cont fara rol nu vede navigatia.
    await expect(page.getByTestId("topbar-role")).toHaveCount(0);
    // Bara laterala nu poarta un testid, dar este singurul <nav> din aplicatie,
    // iar ecranul acestui card nu randeaza niciunul.
    await expect(page.locator("nav")).toHaveCount(0);
  });

  test("orice ruta protejata da acelasi ecran, nu o redirectare", async ({ page }) => {
    await submitLogin(page, noProfileAccount());
    await expect(page.getByTestId("no-profile")).toBeVisible({ timeout: 30_000 });

    // Rewrite si nu redirect: adresa ramane exact cea ceruta, pe fiecare ruta.
    for (const path of ["/inventar", "/comenzi", "/setari"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByTestId("no-profile")).toBeVisible();
    }
  });

  test("poate iesi din cont, deci sesiunea nu il tine captiv", async ({ page }) => {
    await submitLogin(page, noProfileAccount());
    await expect(page.getByTestId("no-profile")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("sign-out").click();
    await page.waitForURL((url) => new URL(url).pathname === LOGIN_PATH, { timeout: 30_000 });
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("un cont cu profil activ nu este atins de reparatie", async ({ page }) => {
    // Aceeasi reordonare nu are voie sa schimbe drumul normal: owner-ul
    // aterizeaza tot pe tabloul de bord, iar pagina de autentificare tot il
    // trimite la / cat timp are profil.
    await signIn(page, ownerAccount());
    await page.goto(LOGIN_PATH);
    await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 30_000 });
    await expect(page.getByTestId("topbar-role")).toBeVisible();
    await signOut(page);
  });
});
