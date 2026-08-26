#!/usr/bin/env node
// assert-not-prod.mjs - refuza sa lase suita de teste sa porneasca impotriva
// proiectului Supabase de productie.
//
// CRIT-11. Suita ruleaza verde in CI impotriva unui stack local, si asta este
// corect. Defectul era ca ACEEASI suita, rulata local, citeste .env.local, care
// arata catre proiectul de productie: fiecare rulare locala scria randuri reale
// in baza pe care o serveste clientul. Rezultatul se vedea pe ecran: /inventar
// raporta 128 de produse active, aproape toate resturi de la teste.
//
// TREI REGULI, si fiecare exista pentru un mod de esec anume:
//
//   1. ESTE UN REFUZ, NU UN AVERTISMENT. Iese cu cod diferit de zero si opreste
//      intreaga rulare. O suita sarita se citeste ca o suita trecuta.
//
//   2. LISTA ESTE IN COD, NU IN MEDIU. Refurile de proiect sunt deja publice:
//      NEXT_PUBLIC_SUPABASE_URL ajunge in pachetul trimis fiecarui browser care
//      deschide aplicatia, deci nu se scurge nimic scriindu-le aici. Daca lista
//      ar veni din mediu, un mediu gol ar dezactiva paza exact in situatia in
//      care paza conteaza.
//
//   3. O LISTA GOALA ARUNCA. O paza care lasa totul sa treaca cand lista ei este
//      goala este mai rea decat lipsa ei, pentru ca se citeste ca protectie.

import { PRODUCTION_REFS } from "./production-refs.mjs";

/** Refurile citite din adresa proiectului. Numai forma canonica Supabase. */
function refFrom(url) {
  if (typeof url !== "string" || url.trim().length === 0) return null;
  try {
    const host = new URL(url.trim()).hostname;
    const match = /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Amandoua, nu doar prima: scripturile de server citesc SUPABASE_URL, iar
// aplicatia citeste NEXT_PUBLIC_SUPABASE_URL. O paza care verifica una singura
// se ocoleste setand-o pe cealalta.
const CHECKED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"];

if (!Array.isArray(PRODUCTION_REFS) || PRODUCTION_REFS.length === 0) {
  console.error(
    "assert-not-prod: lista de proiecte de productie este goala. O paza cu lista goala lasa totul sa treaca, deci se opreste aici in loc sa dea impresia ca a verificat ceva.",
  );
  process.exit(3);
}

// "Este setata vreo adresa", nu "se poate citi un ref din ea". Stackul local
// raspunde pe http://127.0.0.1:54321, care NU are forma <ref>.supabase.co, deci
// o verificare de prezenta bazata pe ref ar opri exact rularea din CI. Ce nu are
// voie sa treaca tacit este mediul complet gol.
const anyUrlSet = CHECKED.some(
  (name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0,
);
if (!anyUrlSet) {
  console.error(
    `assert-not-prod: niciuna dintre ${CHECKED.join(" si ")} nu este setata. Un mediu gol nu inseamna "nu este productie", inseamna ca nu se poate sti, deci se opreste.`,
  );
  process.exit(4);
}

const hits = CHECKED.filter((name) => {
  const ref = refFrom(process.env[name]);
  return ref !== null && PRODUCTION_REFS.includes(ref);
});

if (hits.length > 0) {
  console.error(
    `assert-not-prod: ${hits.join(" si ")} arata catre proiectul Supabase de PRODUCTIE. Suita de teste scrie date, deci refuza sa porneasca. Porneste stackul local cu "supabase start" si scrie .env.local catre el, asa cum face si CI.`,
  );
  process.exit(2);
}

process.exit(0);
