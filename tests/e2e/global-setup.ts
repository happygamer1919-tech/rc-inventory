// Paza care ruleaza inaintea intregii suite.
//
// CRIT-11. globalSetup, nu un fixture si nu o linie in fiecare spec: un test nou
// este pazit pentru ca este nou, nu pentru ca cineva si-a amintit sa adauge
// verificarea. Daca scriptul iese cu cod diferit de zero, Playwright opreste
// rularea.
//
// FARA import.meta AICI. Playwright incarca acest fisier ca modul CommonJS, iar
// `import.meta.url` arunca "Cannot use 'import.meta' outside a module" inainte
// sa apuce sa cheme paza. Rularea pica oricum, deci trece drept refuz, si asta
// este exact felul de verde fals pe care cardul acesta il repara: iese cu cod
// diferit de zero din motivul gresit. Calea se compune din process.cwd(), care
// este radacina proiectului, la fel ca in loadEnvConfig din playwright.config.ts.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export default function assertNotProduction() {
  const script = resolve(process.cwd(), "scripts/assert-not-prod.mjs");

  const run = spawnSync(process.execPath, [script], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  if (run.status !== 0) {
    throw new Error(
      `Suita a fost oprita de scripts/assert-not-prod.mjs (cod ${run.status}). Vezi mesajul de mai sus.`,
    );
  }
}
