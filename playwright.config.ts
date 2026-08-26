import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import {
  RESEND_FAIL_MARKER,
  RESEND_MOCK_FROM,
  RESEND_MOCK_KEY,
  RESEND_MOCK_PORT,
  RESEND_MOCK_URL,
} from "./tests/e2e/support/resend";

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

// P2-10. RESEND ESTE MOCAT PRINTR-UN SERVER, NU PRINTR-O RAMURA IN APLICATIE.
//
// Serverul fals din tests/e2e/support/resend-mock.mjs raspunde pe 127.0.0.1 si
// aplicatia il vede prin RESEND_BASE_URL. Asa se exercita calea reala de
// trimitere (fetch, antete, raspuns non-2xx) fara ca vreun email sa plece catre
// o adresa reala, ceea ce cere linia de acceptanta a cardului.
//
// Cheia de mai jos este falsa si deschide exact nimic: serverul fals accepta
// orice antet de autorizare si nu il pastreaza. Este scrisa literal pentru ca
// sendEmail refuza sa trimita cand RESEND_API_KEY lipseste, si atunci testul ar
// verifica refuzul in loc de trimitere.
// Valorile stau in tests/e2e/support/resend.ts, importate si de spec, ca sa nu
// existe doua adevaruri despre acelasi port.

// CRIT-11. PAZA IMPOTRIVA PRODUCTIEI, inainte de orice test.
//
// Suita scrie date. In CI scrie intr-un stack local si asta este corect, dar
// local citeste .env.local, care a aratat catre proiectul de productie: fiecare
// rulare locala a scris randuri reale in baza pe care o vede clientul. Se vedea
// pe ecran, /inventar raporta 128 de produse active aproape toate de la teste.
//
// globalSetup, nu un fixture: un spec nou este pazit fiindca este nou, nu
// fiindca cineva si-a amintit sa adauge o linie in el.

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
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

  // Doua servere: aplicatia si serverul fals de Resend. Playwright le porneste
  // pe amandoua inainte de primul test si le opreste la final.
  webServer: [
    {
      command: `node tests/e2e/support/resend-mock.mjs`,
      url: `${RESEND_MOCK_URL}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        RESEND_MOCK_PORT: String(RESEND_MOCK_PORT),
        RESEND_MOCK_FAIL_MARKER: RESEND_FAIL_MARKER,
      },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npm run dev -- --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        RESEND_API_KEY: RESEND_MOCK_KEY,
        RESEND_BASE_URL: RESEND_MOCK_URL,
        RESEND_FROM: RESEND_MOCK_FROM,
      },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

