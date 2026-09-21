// P3-86, constatarea F22 a lui Ivan. SECRETUL CALLBACK-ULUI DE EXTRAGERE,
// COMPARAT DUPA CE SE TAIE SPATIILE DIN JUR, SI IN TIMP CONSTANT.
//
// DEFECTUL. Ruta testa golul secretului stocat cu .trim(), dar compara apoi
// sirurile BRUTE cu `provided !== expected`. O copie stocata cu un spatiu sau un
// rand nou la capat (lipita asa in panoul de variabile) nu se potrivea deci
// NICIODATA, iar fiecare apel legitim primea 401.
//
// A DOUA JUMATATE, GASITA LA CITIRE. Constatarea vorbea de "comparatia in timp
// constant", dar `!==` nu este in timp constant: se opreste la primul caracter
// diferit. Aici se compara amprentele SHA-256 ale celor doua siruri taiate, cu
// timingSafeEqual. Amprentele au mereu 32 de octeti, deci timingSafeEqual nu
// arunca niciodata pentru lungimi diferite, iar lungimea secretului nu se scurge.
//
// CE SE IGNORA SI CE NU. Numai spatiul alb din jur. Un spatiu IN interiorul
// secretului conteaza, iar comparatia ramane sensibila la litere mari si mici.
// Un secret stocat gol (sau numai din spatii) nu se potriveste cu nimic, nici cu
// un antet gol.
//
// DE CE .mjs SI NU .ts: acelasi motiv ca numeric-field.mjs.
// scripts/poc-free/check-callback-secret.mjs il importa sub node 20 in
// `quality`, iar node 20 nu dezbraca adnotarile de tip.
//
// NU ARUNCA, NU CITESTE RETEAUA SI NU CITESTE MEDIUL: ruta ii da ambele valori.

import { createHash, timingSafeEqual } from "node:crypto";

function digest(s) {
  return createHash("sha256").update(s, "utf8").digest();
}

/**
 * true numai cand ambele valori sunt siruri, secretul stocat nu este gol dupa
 * trim, iar cele doua siruri taiate sunt identice.
 */
export function secretMatches(expected, provided) {
  if (typeof expected !== "string") return false;
  const want = expected.trim();
  if (want.length === 0) return false;
  // null inseamna ca antetul lipseste; orice alt non-sir este refuzat la fel.
  if (typeof provided !== "string") return false;
  return timingSafeEqual(digest(want), digest(provided.trim()));
}
