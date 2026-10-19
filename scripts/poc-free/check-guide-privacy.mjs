#!/usr/bin/env node
// check-guide-privacy.mjs
// Card P3-320. Nicio persoana, firma sau adresa reala in pozele ghidului.
//
// Pica daca un rand din docs/guide/real-names.txt apare in datele inventate din care
// se fac pozele (scripts/guide/, scripts/seed-test-*.mjs), in lectii (content/guide/)
// sau in textul care era pe ecran la fiecare poza (docs/guide/screenshots.json), si
// daca un telefon sau un email din scripts/guide/fixtures.mjs nu are forma rezervata.
// Regulile stau in lib/guide/privacy.mjs; testul tests/e2e/guide-privacy.spec.ts
// arata ca fiecare poate pica.
//
// Nu citeste nicio baza de date, nu foloseste reteaua.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPrivacy, parseDenyList } from "../../lib/guide/privacy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIST = join(ROOT, "docs/guide/real-names.txt");

console.log("check-guide-privacy");
if (!existsSync(LIST)) {
  console.error("check-guide-privacy: docs/guide/real-names.txt lipseste. Fara lista nu se poate verifica nimic.");
  process.exit(2);
}
const names = parseDenyList(readFileSync(LIST, "utf8"));
// O verificare care citeste zero nume sau zero fisiere nu gaseste nimic: numerele se afirma.
if (names.length === 0) {
  console.error("check-guide-privacy: lista docs/guide/real-names.txt nu are niciun nume.");
  process.exit(2);
}
const { problems, scanned } = checkPrivacy(ROOT, names);
console.log(`  nume pe lista ${names.length}, fisiere citite ${scanned.length}`);
if (!scanned.some((f) => f.startsWith("scripts/guide/"))) problems.push("niciun fisier citit din scripts/guide/");
if (!scanned.some((f) => f.startsWith("content/guide/"))) problems.push("niciun fisier citit din content/guide/");
if (!scanned.some((f) => f.endsWith("fixtures.mjs"))) problems.push("scripts/guide/fixtures.mjs nu a fost citit");

if (problems.length > 0) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`check-guide-privacy: ${problems.length} probleme`);
  process.exit(1);
}
console.log("check-guide-privacy: ok");
