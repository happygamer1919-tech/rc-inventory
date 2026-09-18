#!/usr/bin/env node
// check-numeric-field.mjs
// Card P3-74, constatarea F2 a lui Ivan. UN SIR GOL SAU UN BOOLEAN AJUNS IN
// DREPTUL UNUI CAMP NUMERIC SOSESTE CA null, NICIODATA CA 0 SAU 1.
//
// CE DOVEDESTE:
//
//   1. defectul numit de F2, cele trei valori pe care Number() le trecea in
//      zero-uri si unu-uri: "" devenea 0, true devenea 1, false devenea 0
//   2. absenta, care se comporta corect si pana acum si este afirmata aici ca
//      sa nu se strice in timp ce se repara restul
//   3. numerele adevarate, care TREBUIE sa treaca in continuare, numere si
//      siruri numerice deopotriva, fiindca numeric() peste PostgREST vine ca
//      string si o reparatie care ar refuza si asta ar sparge fiecare document
//      care se citeste corect astazi
//   4. sirurile care nu sunt numere, si NaN, Infinity si -Infinity, care erau
//      deja refuzate de Number.isFinite si raman refuzate
//   5. MARTORUL. Fiecare caz de la punctul 1 este rulat si prin Number() direct,
//      ca sa se vada in iesire valoarea GRESITA pe care ruta o stoca pana la
//      acest card. Fara martor, un cititor trebuie sa creada pe cuvant ca
//      defectul exista.
//
// DE CE UN CHECK SI NU NUMAI UN CAZ END TO END. Cazul end to end dovedeste ca
// regula este LEGATA in ruta si are nevoie de baza de date, de storage si de un
// browser, deci ruleaza numai in CI. Acesta dovedeste ca regula este CORECTA, in
// cateva milisecunde, pe orice masina, si cele doua cad pentru motive diferite.
// Acelasi argument pe care il scrie si pasul Check the reconciliation tolerance.
//
// Nu atinge nicio retea, nicio baza de date si niciun secret.

import { numericField } from "../../lib/data/numeric-field.mjs";

let failures = 0;
let total = 0;
function check(label, got, expected) {
  total += 1;
  const ok = Object.is(got, expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${label}: asteptat ${expected}, primit ${got}`);
}

console.log("check-numeric-field: campurile numerice ale callback-ului de extragere\n");

console.log("1. F2: sirul gol si booleanul, cele trei valori din constatare");
check('"" este null, si nu 0', numericField(""), null);
check("true este null, si nu 1", numericField(true), null);
check("false este null, si nu 0", numericField(false), null);
check('"   " numai spatii este null', numericField("   "), null);
check('"\\t\\n" numai spatiu alb este null', numericField("\t\n"), null);

console.log("\n2. absenta, care era deja corecta");
check("null este null", numericField(null), null);
check("undefined este null", numericField(undefined), null);

console.log("\n3. numerele adevarate trec, si asta este jumatatea care conteaza");
check("12.5 ca numar este 12.5", numericField(12.5), 12.5);
check('"12.5" ca sir este 12.5', numericField("12.5"), 12.5);
check("0 trimis ANUME este 0, fiindca un document poate spune zero", numericField(0), 0);
check('"0" trimis ANUME este 0', numericField("0"), 0);
check("un negativ trece", numericField(-2.36), -2.36);
check('"18450.00", forma in care PostgREST da numeric()', numericField("18450.00"), 18450);
check('" 240.5 " cu spatii in jur trece', numericField(" 240.5 "), 240.5);

console.log("\n4. ce nu este un numar, si nu era nici inainte");
check('"MDL" este null', numericField("MDL"), null);
check('"12,5" cu virgula zecimala este null', numericField("12,5"), null);
check("NaN este null", numericField(NaN), null);
check("Infinity este null", numericField(Infinity), null);
check("-Infinity este null", numericField(-Infinity), null);
check('"Infinity" ca sir este null', numericField("Infinity"), null);

console.log("\n4b. un tablou si un obiect, aceeasi clasa de defect ca F2");
// Number([]) este 0 si Number([5]) este 5, amandoua finite, deci si ele se
// stocau drept citiri. JSON poate purta oricare in dreptul unui camp numeric.
check("[] este null, si nu 0", numericField([]), null);
check("[5] este null, si nu 5", numericField([5]), null);
check("{} este null", numericField({}), null);

console.log("\n5. martorul: ce stoca ruta pana la acest card, prin Number()");
for (const v of ["", true, false, [], [5]]) {
  const n = Number(v);
  const shown = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
  console.log(
    `  martor  Number(${shown}) este ${n}, finit=${Number.isFinite(n)}` +
      `, deci se stoca ${Number.isFinite(n) ? n : "null"}; acum este null`,
  );
  total += 1;
  if (!Number.isFinite(n)) {
    failures += 1;
    console.log(`  FAIL    martorul nu mai arata defectul pentru ${shown}`);
  }
}

console.log("");
if (failures > 0) {
  console.error(`check-numeric-field: ${failures} din ${total} cazuri au cazut.`);
  process.exit(1);
}
console.log(`check-numeric-field: ${total} cazuri, toate trec.`);
