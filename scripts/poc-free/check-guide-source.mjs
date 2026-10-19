#!/usr/bin/env node
// check-guide-source.mjs
// Card P3-319. Verifica sursa ghidului (content/guide) cu aceleasi reguli ca testul
// tests/e2e/guide-source.spec.ts: antet complet, sub 200 de cuvinte, fiecare
// "Vezi și" duce la o lectie care exista, fiecare eticheta dintre ** apare exact in
// aplicatie, ordinea capitolelor urmeaza meniul.
//
// Nu pune nimic pe ecran, nu citeste nicio baza de date, nu foloseste reteaua.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFaq } from "../../lib/guide/faq.mjs";
import { loadGuide, navGroupTitles, readAppSourceText, validateFaq, validateGuide } from "../../lib/guide/source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const guide = loadGuide(join(ROOT, "content/guide"));
const faq = loadFaq(join(ROOT, "content/guide/faq.md"));
const navGroups = navGroupTitles(ROOT);
const sourceText = readAppSourceText(ROOT);

console.log("check-guide-source");
console.log(
  `  capitole ${guide.chapters.length}, lectii ${guide.lessons.length}, intrebari frecvente ${faq.entries.length}, grupuri de meniu ${navGroups.length}`,
);

// Un check care citeste zero lectii gaseste zero greseli. Numarul de intrare este afirmat.
const problems = [...validateGuide(guide, { navGroups, sourceText }), ...validateFaq(faq, guide, { sourceText })];
if (guide.lessons.length === 0) problems.push("nicio lectie citita din content/guide");

if (problems.length > 0) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`check-guide-source: ${problems.length} probleme`);
  process.exit(1);
}
console.log("check-guide-source: ok");
