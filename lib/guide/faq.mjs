// P3-323. Intrebarile frecvente ale ghidului: content/guide/faq.md, un singur fisier cu antet.
//
// Fiecare intrare este un rand "id-lectie | Intrebarea? | Raspunsul", in aceeasi sursa ca
// lectiile, deci nimic nu se scrie de doua ori: titlul si adresa lectiei se iau din lectie.
// Regulile (7 pana la 10 intrari, raspuns scurt, etichete exacte) sunt in validateFaq,
// lib/guide/source.mjs.
//
// Importa numai parse.mjs, din acelasi motiv ca read.ts: pagina /ajutor nu trebuie sa traga
// dupa ea cititorul de cod din source.mjs.

import { existsSync, readFileSync } from "node:fs";
import { parseFrontMatter } from "./parse.mjs";

/** Imparte un rand "lectie | intrebare | raspuns". Null daca nu are exact trei parti nevide. */
export function parseFaqEntry(raw) {
  const parts = String(raw ?? "").split(" | ");
  if (parts.length !== 3) return null;
  const [lesson, question, answer] = parts.map((p) => p.trim());
  if (lesson === "" || question === "" || answer === "") return null;
  return { lesson, question, answer };
}

/** Citeste faq.md. Nu valideaza nimic; ce nu se poate citi ajunge in `problems`. */
export function loadFaq(file) {
  if (!existsSync(file)) return { id: null, title: null, entries: [], problems: [`${file}: fisierul nu exista`] };
  const problems = [];
  let data;
  try {
    data = parseFrontMatter(readFileSync(file, "utf8"), "faq.md").data;
  } catch (e) {
    return { id: null, title: null, entries: [], problems: [e.message] };
  }
  const raw = Array.isArray(data.entries) ? data.entries : [];
  const entries = [];
  for (const [i, r] of raw.entries()) {
    const entry = parseFaqEntry(r);
    if (entry) entries.push(entry);
    else problems.push(`faq.md: intrarea ${i + 1} nu are forma "lectie | intrebare | raspuns"`);
  }
  return { id: data.id ?? null, title: data.title ?? null, entries, problems };
}

/**
 * Intrebarile asa cum le vede un rol: numai cele a caror lectie o vede si el, in ordinea din
 * fisier, fiecare cu titlul lectiei. O intrare spre o lectie pe care rolul nu o vede nu apare,
 * ca nicio legatura sa nu dea "nu există". `flat` vine din guideForRole (view.mjs).
 */
export function faqForRole(faq, flat) {
  const titleById = new Map(flat.map((e) => [e.lesson.id, e.lesson.title]));
  return faq.entries
    .filter((e) => titleById.has(e.lesson))
    .map((e) => ({ ...e, lessonTitle: titleById.get(e.lesson) }));
}
