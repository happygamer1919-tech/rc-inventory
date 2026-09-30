import { defineConfig, devices } from "@playwright/test";

// P3-117. Configuratie SEPARATA pentru masurarea tranzitiilor intre sectiuni.
//
// DE CE UN AL DOILEA FISIER SI NU UN PROIECT IN playwright.config.ts. Suita de
// end to end isi porneste singura trei servere Next si un stack local, si asta
// este exact ce masurarea NU trebuie sa faca: ea viziteaza o aplicatie DEJA
// DESPLASATA, la adresa din RC_PERF_BASE_URL, fara sa compileze nimic si fara
// sa stie ce baza de date sta in spatele ei. Un proiect adaugat acolo ar mosteni
// webServer-ele si globalSetup-ul aceleia, deci ar schimba felul in care ruleaza
// suita existenta. Asa, `npx playwright test` citeste mai departe numai
// playwright.config.ts, al carui testDir este ./tests/e2e, si nici nu vede acest
// dosar.
//
// FARA webServer AICI, DELIBERAT. Adresa vine din mediu si nu are valoare
// implicita, fiindca tot rostul cardului este sa masoare o desfasurare reala.
// Cine porneste aplicatia o porneste el: in CI, pasul care ruleaza `next start`
// pe build-ul deja facut de suita de end to end.
//
// FARA REINCERCARI, ca si acolo. O reincercare la o masurare de timp inseamna
// ca numarul raportat este cel al incercarii norocoase.

export default defineConfig({
  testDir: "./tests/perf",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Un singur worker: doua browsere care masoara in acelasi timp pe aceeasi
  // masina isi fura unul altuia procesorul, si atunci p75 este despre runner.
  workers: 1,
  reporter: [["list"]],
  timeout: 20 * 60 * 1000,
  expect: { timeout: 15_000 },

  use: {
    // FARA baseURL. Specul compune adrese absolute din configuratia pe care a
    // validat-o el, ca nimic sa nu poata ocoli refuzul gazdelor de productie.
    trace: "off",
    screenshot: "off",
    video: "off",
    locale: "ro-RO",
    viewport: { width: 1440, height: 900 },
  },

  projects: [{ name: "perf", use: { ...devices["Desktop Chrome"] } }],
});
