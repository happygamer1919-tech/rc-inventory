import { defineConfig } from "@playwright/test";

// P3-335. Testele de unitate de sub tests/*.test.ts.
//
// Sapte fisiere de acolo (price-input, outbound-slip-year, import-batches,
// combobox-commit, import-sheet-close, client-import-instructions,
// parse-project-query) nu rulau nicaieri: playwright.config.ts citeste doar
// ./tests/e2e, iar `npm test` rula un singur fisier. Un test care nu ruleaza
// este verde pentru totdeauna.
//
// UN AL DOILEA FISIER, NU UN PROIECT IN playwright.config.ts, din motivul
// scris in playwright.perf.config.ts: un proiect adaugat acolo ar mosteni
// globalSetup-ul si cele cinci webServer-e ale suitei de end to end, adica un
// stack local si cateva minute de CI pentru teste care nu ating reteaua.
//
// FARA webServer, FARA globalSetup, FARA browser. Testele de aici importa
// functii pure din lib/ si nu deschid nicio pagina. Daca un test are nevoie de
// browser sau de baza de date, locul lui este tests/e2e.
//
// FARA REINCERCARI, ca in suita principala: un test instabil se repara.
//
// `npm test` ruleaza aceasta suita. Inainte de P3-335 rula doar
// tests/format.test.ts, printr un incarcator ts-node care nu este instalat,
// deci comanda iesea cu eroare.

// "server-only" arunca la import in afara unui randari de server. Conditia
// "react-server" o muta pe varianta goala a pachetului, exact ce face Next cand
// randeaza pe server, asa ca un test de unitate poate importa un modul din
// lib/data fara sa-l copieze. Se da prin NODE_OPTIONS in scriptul `npm test`,
// nu aici: fisierele de test se incarca in procesul principal, inainte ca
// acest fisier sa mai poata schimba ceva.

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.test.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 15_000,
  projects: [{ name: "unit" }],
});
