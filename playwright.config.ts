import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Next incarca .env.local pentru aplicatie, dar procesul in care ruleaza
// Playwright nu il vede: variabilele NEXT_PUBLIC_ ajung in bundle la compilare,
// iar TEST_OWNER_EMAIL si celelalte nu ajung nicaieri. Se incarca aici explicit,
// cu acelasi cititor pe care il foloseste Next, ca fisierul citit de teste sa
// fie exact fisierul citit de aplicatie.
//
// @next/env este dependinta directa a lui next, deci nu se adauga nimic nou.
loadEnvConfig(process.cwd());

// Configuratia Playwright.
//
// CHROMIUM, HEADLESS, ATAT. Firefox si WebKit ar tripla minutele de CI ca sa
// redemonstreze aceeasi logica de aplicatie pe un instrument intern folosit
// numai pe desktop.
//
// FARA REINCERCARI. O reincercare ascunde o competitie intre cereri, iar o
// competitie intr-un sistem de stocuri este un numar gresit intr-un depozit. Un
// test instabil se repara sau se sterge, niciodata nu se reincearca.
//
// Serverul de dezvoltare este pornit de Playwright si citeste .env.local, unde
// stau adresa proiectului, cheia anonima si datele celor doua conturi de test.

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

// "localhost", NU "127.0.0.1", si diferenta nu este cosmetica.
//
// Next 16 blocheaza implicit cererile cross-origin catre resursele de
// dezvoltare. Serverul se considera "localhost", asa ca un browser care cere
// paginile de la 127.0.0.1 primeste 403 pe fiecare fisier din /_next/static.
// Pagina se randeaza de la server si arata perfect, dar React nu se hidrateaza
// niciodata, deci niciun buton nu are handler: formularul de autentificare pare
// sa nu faca nimic, fara nicio eroare pe ecran.
//
// Alternativa ar fi allowedDevOrigins in next.config.ts, dar aceea adauga
// configuratie in aplicatie ca sa repare o alegere a testelor. Testele cer de la
// aceeasi origine de la care serverul raspunde.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ro-RO",
    // Desktop-first, ca tot restul aplicatiei.
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
