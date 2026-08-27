import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ownerAccount } from "./support/accounts";
import { signIn } from "./support/auth";
import { ALL_ROUTES } from "@/lib/nav";

// headers.spec - linia de acceptanta a cardului P2-11.
//
// RULEAZA PE SERVERUL IN MOD PRODUCTIE, nu pe cel de dezvoltare, si asta este
// jumatate din valoarea fisierului. Proiectul "productie" din
// playwright.config.ts porneste `next build` urmat de `next start` intr-un dosar
// de build separat, si baseURL-ul acestui spec arata catre el. Un verde obtinut
// pe serverul de dezvoltare ar fi despre alt program: acolo exista overlay-ul de
// erori, avertismentele de dezvoltare ale lui React si recompilarea la cerere,
// deci nici antetele nici consola nu sunt cele pe care le vede clientul.

/** Antetele cerute de card, cu ce trebuie sa contina fiecare. */
const REQUIRED_HEADERS: { name: string; contains: string }[] = [
  { name: "strict-transport-security", contains: "max-age=" },
  { name: "x-content-type-options", contains: "nosniff" },
  { name: "x-frame-options", contains: "DENY" },
  { name: "content-security-policy", contains: "frame-ancestors" },
  { name: "referrer-policy", contains: "strict-origin" },
  { name: "permissions-policy", contains: "camera=()" },
];

/** Colecteaza erorile de consola si exceptiile necapturate ale unei pagini. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  // O exceptie necapturata nu trece intotdeauna prin consola, si este cel putin
  // la fel de grava. Un avertisment se triaza; o eroare se repara.
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test.describe("Intarire pentru productie", () => {
  test.describe.configure({ timeout: 180_000 });

  test("1. fiecare antet de securitate este prezent pe un raspuns de productie", async ({
    page,
    request,
  }) => {
    // TREI FELURI DE RASPUNS, fiindca ele sunt produse de doua straturi diferite
    // si a verifica doar unul lasa celalalt nedovedit.
    //
    //   /autentificare  o pagina publica, randata: antetele vin din next.config.
    //   /               fara sesiune, proxy-ul REDIRECTEAZA: raspunsul nu ajunge
    //                   niciodata la randare, deci antetele vin din proxy.ts. Si
    //                   tocmai acesta este PRIMUL raspuns pe care il primeste un
    //                   vizitator, adica primul contact al browserului cu
    //                   domeniul, exact ce HSTS exista sa acopere.
    //   /inventar       cu sesiune, un ecran adevarat al aplicatiei.
    const check = (headers: Record<string, string>, where: string) => {
      for (const h of REQUIRED_HEADERS) {
        expect(headers[h.name], `${h.name} pe ${where}`).toBeDefined();
        expect(headers[h.name], `${h.name} pe ${where}`).toContain(h.contains);
      }
    };

    for (const path of ["/autentificare", "/"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      check(response.headers(), path);
    }
    // Redirectarea chiar este o redirectare, altfel randul de mai sus ar fi
    // verificat din greseala o pagina.
    const redirect = await request.get("/", { maxRedirects: 0 });
    expect(redirect.status(), "radacina fara sesiune redirecteaza").toBeGreaterThanOrEqual(300);
    expect(redirect.status()).toBeLessThan(400);

    await signIn(page, ownerAccount());
    const authed = await page.goto("/inventar");
    expect(authed).not.toBeNull();
    check(authed!.headers(), "/inventar");
  });

  test("2. o adresa inexistenta randeaza pagina romaneasca de 404", async ({ page }) => {
    // Autentificat intai: proxy-ul refuza implicit, deci un vizitator fara
    // sesiune este redirectat catre autentificare si nu ajunge niciodata la 404.
    await signIn(page, ownerAccount());

    const response = await page.goto("/o-pagina-care-nu-exista");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
    await expect(page.getByTestId("not-found")).toHaveText("Pagina nu există");
    await expect(page.getByTestId("not-found-code")).toHaveText("404");
    // Si are drum inapoi. Un 404 fara iesire lasa butonul browserului ca
    // singura optiune, iar acela duce inapoi tot aici.
    await page.getByTestId("not-found-home").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("3. o eroare de server randeaza pagina romaneasca de 500", async ({ page }) => {
    await signIn(page, ownerAccount());

    const response = await page.goto("/diagnostic-eroare");
    expect(response?.status()).toBe(500);
    await expect(page.getByTestId("error-screen")).toBeVisible();
    await expect(page.getByTestId("error-screen")).toHaveText("Ceva nu a mers");
    await expect(page.getByTestId("error-code")).toHaveText("500");
    // TEXTUL ERORII NU AJUNGE PE ECRAN. Ce se afiseaza este digestul, care este
    // exact ce cauta cineva in jurnalul serverului; un mesaj de la baza de date
    // poarta nume de tabele si bucati de interogare.
    await expect(page.locator("body")).not.toContainText("Eroare deliberată");
    await expect(page.getByTestId("error-digest")).toBeVisible();
    await expect(page.getByTestId("error-home")).toBeVisible();
  });

  test("4. nicio eroare de consola pe niciun ecran autentificat", async ({ page }) => {
    const errors = watchConsole(page);
    await signIn(page, ownerAccount());

    // Lista vine din lib/nav.ts, deci un ecran nou este maturat fiindca este in
    // meniu, nu fiindca si-a amintit cineva sa il adauge aici.
    expect(ALL_ROUTES.length).toBeGreaterThan(0);
    for (const route of ALL_ROUTES) {
      await page.goto(route);
      // Randarea trebuie sa se aseze inainte de a citi consola: o eroare de
      // hidratare apare dupa ce documentul a sosit.
      await page.waitForLoadState("networkidle");
      expect(errors, `erori de consola dupa ${route}`).toEqual([]);
    }
  });

  test("5. jurnalul de aplicare are o intrare pentru fiecare migratie", async () => {
    // Cerinta adaugata de hotararea R-013, dupa ce migratia 0006 a fost gasita
    // aplicata si nimeni nu a putut spune de cine sau cand:
    // supabase_migrations.schema_migrations nu are coloana de actor si nici de
    // timp, deci intrebarea nu este de raspuns din baza de date deloc.
    const root = resolve(process.cwd());
    const logPath = resolve(root, "docs/migrations/APPLY-LOG.md");
    const log = readFileSync(logPath, "utf8");

    const files = readdirSync(resolve(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const headings = log
      .split("\n")
      .filter((l) => l.startsWith("## "))
      .map((l) => l.slice(3).trim());

    for (const file of files) {
      const version = file.slice(0, 4);
      const entry = headings.find((h) => h.startsWith(version));
      expect(entry, `migratia ${file} nu are intrare in APPLY-LOG.md`).toBeDefined();
    }

    // Fiecare intrare numeste actorul si momentul. O cale de aplicare pe care
    // nimeni nu o poate audita este un defect de intarire, ceea ce este chiar
    // motivul pentru care cerinta sta pe acest card.
    const sections = log.split(/^## /m).slice(1);
    const versioned = sections.filter((s) => /^\d{4}/.test(s));
    expect(versioned.length).toBeGreaterThanOrEqual(files.length);
    for (const section of versioned) {
      const title = section.split("\n")[0]!.trim();
      expect(section, `intrarea ${title} nu numeste actorul`).toContain("**Actor:**");
      expect(section, `intrarea ${title} nu spune cand`).toContain("**Applied at:**");
    }
  });
});
