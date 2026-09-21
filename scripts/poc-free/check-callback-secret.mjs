#!/usr/bin/env node
// check-callback-secret.mjs
// Card P3-86, constatarea F22 a lui Ivan. SECRETUL CALLBACK-ULUI SE COMPARA
// DUPA CE SE TAIE SPATIILE DIN JUR, IN TIMP CONSTANT, SI ORICE SECRET GRESIT
// ESTE REFUZAT CA PANA ACUM.
//
// CE DOVEDESTE:
//
//   1. secretul exact se potriveste
//   2. defectul numit de F22: o copie stocata cu spatii sau rand nou in jur se
//      potriveste acum cu un antet curat, si invers
//   3. secretele gresite raman refuzate: alt secret, un caracter diferit, un
//      prefix, unul mai lung, alte litere mari sau mici
//   4. spatiul DIN INTERIOR nu se ignora
//   5. un secret stocat lipsa, gol sau numai din spatii nu se potriveste cu
//      nimic, nici cu un antet gol
//   6. un antet lipsa (null sau undefined) este refuzat
//   7. MARTORUL: comparatia veche, rulata pe cazul cu spatii, il refuza, ca sa
//      se vada in iesire ca defectul exista
//   8. ruta foloseste regula in AMBELE locuri, POST si GET, iar comparatia
//      veche nu mai apare in fisier
//
// Toate valorile sunt literali evident falsi. Nu citeste mediul, nu atinge
// nicio retea, nicio baza de date si niciun secret adevarat.

import { readFileSync } from "node:fs";
import { secretMatches } from "../../lib/data/callback-secret.mjs";

let failures = 0;
let total = 0;
function check(label, got, expected) {
  total += 1;
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${label}: asteptat ${expected}, primit ${got}`);
}

const FAKE = "fals-secret-de-test-123";

console.log("check-callback-secret: comparatia secretului callback-ului de extragere\n");

console.log("1. secretul exact");
check("acelasi secret se potriveste", secretMatches(FAKE, FAKE), true);

console.log("\n2. F22: spatiile din jur nu mai strica potrivirea");
check("stocat cu spatiu la capat", secretMatches(FAKE + " ", FAKE), true);
check("stocat cu rand nou la capat", secretMatches(FAKE + "\n", FAKE), true);
check("stocat cu spatiu la inceput", secretMatches(" " + FAKE, FAKE), true);
check("stocat cu \\r\\n la capat", secretMatches(FAKE + "\r\n", FAKE), true);
check("stocat curat, antet cu spatii in jur", secretMatches(FAKE, "  " + FAKE + " "), true);

console.log("\n3. secretele gresite raman refuzate");
check("alt secret", secretMatches(FAKE, "cu-totul-altceva"), false);
check("un caracter diferit", secretMatches(FAKE, "fals-secret-de-test-124"), false);
check("un prefix al secretului", secretMatches(FAKE, "fals-secret-de-test"), false);
check("un secret mai lung", secretMatches(FAKE, FAKE + "4"), false);
check("alte litere mari", secretMatches(FAKE, FAKE.toUpperCase()), false);
check("gresit si cu spatii in jur", secretMatches(FAKE + " ", " altceva "), false);

console.log("\n4. spatiul din interior conteaza");
check('"ab cd" nu se potriveste cu "abcd"', secretMatches("ab cd", "abcd"), false);
check('"abcd" nu se potriveste cu "ab cd"', secretMatches("abcd", "ab cd"), false);

console.log("\n5. secret stocat lipsa, gol sau numai din spatii: nimic nu se potriveste");
for (const [name, exp] of [
  ["undefined", undefined],
  ["gol", ""],
  ["numai spatii", "   "],
]) {
  for (const [pname, prov] of [
    ["un secret", FAKE],
    ["un antet gol", ""],
    ["un antet numai din spatii", "  "],
    ["null", null],
  ]) {
    check(`stocat ${name}, primit ${pname}`, secretMatches(exp, prov), false);
  }
}

console.log("\n6. antet lipsa");
check("provided null", secretMatches(FAKE, null), false);
check("provided undefined", secretMatches(FAKE, undefined), false);

console.log("\n7. martorul: comparatia veche pe cazul cu spatii");
{
  const expected = FAKE + "\n";
  const provided = FAKE;
  const oldRefused =
    typeof expected !== "string" ||
    expected.trim().length === 0 ||
    provided === null ||
    provided !== expected;
  total += 1;
  console.log(`  martor  vechea regula refuza copia cu rand nou: ${oldRefused}; acum se potriveste`);
  if (!oldRefused) {
    failures += 1;
    console.log("  FAIL    martorul nu mai arata defectul");
  }
}

console.log("\n8. ruta foloseste regula in ambele locuri");
const src = readFileSync(new URL("../../app/api/extraction/callback/route.ts", import.meta.url), "utf8");
function body(marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const next = src.indexOf("\nexport ", start + marker.length);
  return src.slice(start, next < 0 ? src.length : next);
}
for (const marker of ["export async function POST", "export async function GET"]) {
  const b = body(marker);
  check(`${marker} exista`, b !== null, true);
  check(`${marker} cheama secretMatches(`, b !== null && b.includes("secretMatches("), true);
}
check("textul `provided !== expected` nu mai apare in ruta", src.includes("provided !== expected"), false);

console.log("");
if (failures > 0) {
  console.error(`check-callback-secret: ${failures} din ${total} cazuri au cazut.`);
  process.exit(1);
}
console.log(`check-callback-secret: ${total} cazuri, toate trec.`);
