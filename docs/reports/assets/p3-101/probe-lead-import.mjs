// P3-101, goal G58. PROBA LOCALA A PARTII PURE, care nu are nevoie de nicio baza
// de date si de niciun browser.
//
// Masina aceasta nu are nici Docker nici Supabase CLI, deci suita end to end
// ruleaza numai in CI, si CI ia aproximativ douazeci de minute. Cititorul de CSV,
// normalizarea telefonului la +373 si calculul dublatelor sunt partile in care o
// greseala este cel mai ieftin de gasit inainte de a impinge. Proba le compileaza
// intr-un dosar temporar si le pune la incercare.
//
// SE RULEAZA DIN RADACINA DEPOZITULUI:
//   node docs/reports/assets/p3-101/probe-lead-import.mjs
//
// NU ESTE O VERIFICARE DIN quality si nu inlocuieste nimic din suita: cazurile de
// acceptanta ale cardului sunt in tests/e2e/lead-import.spec.ts si trec prin
// aplicatia adevarata si prin baza adevarata. Aceasta este numai dovada ca partea
// care nu are nevoie de ele a fost pusa la incercare inainte de prima impingere.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const out = ".probe-out";
fs.rmSync(out, { recursive: true, force: true });
execFileSync(
  "npx",
  [
    "tsc",
    "lib/data/lead-import-types.ts",
    "lib/data/lead-import-plan.ts",
    "--outDir",
    out,
    "--module",
    "esnext",
    "--target",
    "es2022",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "--ignoreConfig",
  ],
  { stdio: "inherit" },
);
for (const name of ["lead-import-types", "lead-import-plan", "clients-types"]) {
  fs.renameSync(`${out}/${name}.js`, `${out}/${name}.mjs`);
}
for (const name of ["lead-import-types", "lead-import-plan"]) {
  const p = `${out}/${name}.mjs`;
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/(from ")(\.\/[\w-]+)(")/g, "$1$2.mjs$3"));
}

// Calea este fata de RADACINA DEPOZITULUI, nu fata de fisierul acesta: un import
// dinamic relativ s-ar uita langa proba, unde nu se compileaza nimic.
const T = await import(pathToFileURL(`${process.cwd()}/${out}/lead-import-types.mjs`).href);
const P = await import(pathToFileURL(`${process.cwd()}/${out}/lead-import-plan.mjs`).href);

// --- telefonul ---
const canonical = "+37369123456";
for (const written of [
  "069123456",
  "0 69 12 34 56",
  "+373 69 123 456",
  "00373691234 56",
  "373-69-123-456",
  "69123456",
]) {
  assert.equal(T.normalisePhone(written), canonical, `telefon: ${written}`);
}
assert.equal(T.normalisePhone(""), null);
assert.equal(T.normalisePhone("12345"), null);
assert.equal(T.normalisePhone("+44 20 7946 0000"), "+442079460000");

// --- emailul ---
assert.equal(T.normaliseEmail("  Ion@Example.TEST "), "ion@example.test");
assert.equal(T.normaliseEmail("nu-este-email"), null);

// --- data ---
assert.equal(T.readDate("2027-03-14"), "2027-03-14");
assert.equal(T.readDate("14.03.2027"), "2027-03-14");
assert.equal(T.readDate("14/03/2027"), "2027-03-14");
assert.equal(T.readDate("32.13.2027"), null);
assert.equal(T.readDate("29.02.2027"), null);

// --- CSV: virgula, punct si virgula, ghilimele, CRLF, BOM ---
const withSemicolons = "Denumire;Telefon\r\nTEST unu;069123456\r\n";
assert.deepEqual(T.parseCsv(withSemicolons), [
  ["Denumire", "Telefon"],
  ["TEST unu", "069123456"],
]);
const quoted = 'Denumire,Note\r\n"Popescu, Ion","a zis ""da"""\r\n\r\n';
assert.deepEqual(T.parseCsv(quoted), [
  ["Denumire", "Note"],
  ["Popescu, Ion", 'a zis "da"'],
]);
const bom = "﻿Denumire,Telefon\nTEST doi,069123457\n";
assert.deepEqual(T.parseCsv(bom)[0], ["Denumire", "Telefon"]);

// --- potrivirea automata ---
const headers = ["Nume", "tel", "E-Mail", "Etapa", "ceva ce nu stim", "Telefon 2"];
const mapping = T.autoMatchColumns(headers);
assert.deepEqual(mapping, ["name", "phone", "email", "stage", null, null], String(mapping));

// --- un rand pregatit ---
const owners = T.buildOwnerIndex([{ id: "owner-1", fullName: "Ion Popescu" }]);
const rowMapping = ["name", "phone", "stage", "followUpDate", "ownerName"];
const good = T.prepareRow(
  ["TEST bun", "069123456", "De reluat", "14.03.2027", "ion popescu"],
  rowMapping,
  2,
  owners,
  "",
);
assert.equal(good.ok, true);
assert.equal(good.lead.stage, "follow_up");
assert.equal(good.lead.followUpDate, "2027-03-14");
assert.equal(good.lead.ownerId, "owner-1");
assert.equal(good.lead.phone, canonical);

const noName = T.prepareRow(["", "069123456"], rowMapping, 3, owners, "");
assert.equal(noName.ok, false);
assert.equal(noName.reason, "Rândul nu are denumire.");

const followUpNoDate = T.prepareRow(["TEST x", "069123456", "De reluat", ""], rowMapping, 4, owners, "");
assert.equal(followUpNoDate.ok, false);
assert.equal(followUpNoDate.reason, "Pentru etapa De reluat trebuie completată data de reluare.");

const noContact = T.prepareRow(["TEST y", "", ""], rowMapping, 5, owners, "");
assert.equal(noContact.ok, false);
assert.equal(noContact.reason, "Rândul nu are nici telefon, nici email.");

const blankStage = T.prepareRow(["TEST z", "069123456", ""], rowMapping, 6, owners, "");
assert.equal(blankStage.ok, true);
assert.equal(blankStage.lead.stage, "cold");

// --- planul: dublat fata de baza si fata de randul de mai sus ---
const planMapping = ["name", "phone", "email", "interest"];
const { plan, prepared } = P.buildPlan({
  rows: [
    ["TEST A", "+373 69 123 456", "", "interes nou"],
    ["TEST B", "069000002", "", ""],
    ["TEST B bis", "0 69 00 00 02", "", "interes bis"],
    ["TEST C", "", "ION@example.test", ""],
  ],
  mapping: planMapping,
  owners,
  fallbackSource: "",
  existing: [
    { id: "stocat-1", name: "TEST stocat", phoneKey: canonical, emailKey: null, empty: ["interest", "email"] },
    { id: "stocat-2", name: "TEST stocat 2", phoneKey: null, emailKey: "ion@example.test", empty: [] },
  ],
});
assert.deepEqual(plan.counts, { fresh: 1, duplicate: 3, error: 0 }, JSON.stringify(plan.counts));
const [a, b, bBis, c] = plan.entries;
assert.equal(a.kind, "duplicate");
assert.equal(a.against.kind, "stored");
assert.equal(a.matchedOn, "phone");
assert.deepEqual(a.fillable, ["interest"]);
assert.equal(b.kind, "new");
assert.equal(bBis.kind, "duplicate");
assert.equal(bBis.against.kind, "file");
assert.equal(bBis.against.line, 3);
assert.deepEqual(bBis.fillable, ["interest"]);
assert.equal(c.kind, "duplicate");
assert.equal(c.against.kind, "stored");
assert.equal(c.matchedOn, "email");
assert.deepEqual(c.fillable, []);

// --- completarea din interiorul fisierului umple golul si nu atinge restul ---
const filled = P.mergeWithinFile(plan, prepared, { 4: "fill" });
assert.equal(filled, 1);
assert.equal(prepared.get(3).interest, "interes bis");
assert.equal(prepared.get(3).name, "TEST B");
assert.equal(prepared.get(3).phone, "+37369000002");

// Sarind peste, nu se schimba nimic.
const { plan: p2, prepared: pr2 } = P.buildPlan({
  rows: [
    ["TEST B", "069000002", "", ""],
    ["TEST B bis", "069000002", "", "interes bis"],
  ],
  mapping: planMapping,
  owners,
  fallbackSource: "",
  existing: [],
});
assert.equal(P.mergeWithinFile(p2, pr2, {}), 0);
assert.equal(pr2.get(2).interest, "");

fs.rmSync(out, { recursive: true, force: true });
console.log("PROBA LOCALA: toate afirmatiile au trecut.");
