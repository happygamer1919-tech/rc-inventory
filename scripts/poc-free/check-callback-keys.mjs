#!/usr/bin/env node
// check-callback-keys.mjs
// Card P3-76, constatarea F9 a lui Ivan. O CHEIE NECUNOSCUTA IN CALLBACK-UL DE
// EXTRAGERE ESTE SCRISA IN JURNAL SI NICIODATA REFUZATA.
//
// CE DOVEDESTE, cu un jurnal fals si fara baza de date:
//
//   1. o cheie necunoscuta sus si pe o linie produce EXACT UN avertisment, care
//      numeste fiecare cheie, linia ei si order_id-ul
//   2. un payload numai cu chei cunoscute, inclusiv cele cinci ale lui EXT-34,
//      nu produce niciun avertisment
//   3. corpuri care nu sunt obiecte, un `lines` care nu este tablou si o linie
//      care nu este obiect nu produc avertisment si nu arunca
//   4. un jurnal care arunca nu scapa exceptia, fiindca ea ar face din callback
//      un 500
//   5. un sender nu poate umple sau falsifica jurnalul: cel mult MAX_KEYS_NAMED
//      chei numite, fiecare citata si scurtata
//   6. LISTA ESTE CEA A RUTEI. Cheile citite din corp si din linii se scot din
//      sursa lui app/api/extraction/callback/route.ts si trebuie sa fie exact
//      lista rutei; lista cunoscuta este aceea plus exact cele cinci ale lui
//      EXT-34. O citire noua adaugata fara lista cade aici, si nu in productie
//      ca un avertisment pe fiecare callback.
//
// DE CE UN CHECK SI NU NUMAI UN CAZ END TO END. Cazul end to end
// (tests/e2e/extraction-key-allowlist.spec.ts) dovedeste ca raspunsul si ce se
// stocheaza nu se schimba, si are nevoie de baza de date. Nu poate citi
// jurnalul serverului. Acesta dovedeste avertismentul insusi, pe orice masina.
//
// Nu atinge nicio retea, nicio baza de date si niciun secret.

import { readFileSync } from "node:fs";
import {
  EXT34_LINE_KEYS,
  EXT34_TOP_LEVEL_KEYS,
  MAX_KEYS_NAMED,
  ROUTE_LINE_KEYS,
  ROUTE_TOP_LEVEL_KEYS,
  unknownCallbackKeys,
  warnUnknownCallbackKeys,
} from "../../lib/data/callback-keys.mjs";

let failures = 0;
let total = 0;
function check(label, ok, detail = "") {
  total += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${label}${detail ? `: ${detail}` : ""}`);
}

/** Ruleaza functia rutei cu un jurnal fals si intoarce ce s-a scris. */
function capture(body) {
  const calls = [];
  const returned = warnUnknownCallbackKeys(body, (m) => calls.push(m));
  return { calls, returned };
}

const ORDER = "11111111-2222-3333-4444-555555555555";

function knownBody(extra = {}, lineExtra = {}) {
  return {
    order_id: ORDER,
    status: "extracted",
    error_code: null,
    document_source: "digital",
    supplier_name: "TEST",
    order_date: "2026-09-18",
    subtotal: 100,
    vat_amount: 20,
    document_total: 120,
    prices_include_vat: false,
    vat_rate: 20,
    currency: "MDL",
    currency_raw: "lei",
    order_ref: "0009312",
    order_ref_series: "TG",
    reason: null,
    _meta: { model: "x", pages: 1, anything: "kept, never checked" },
    ...extra,
    lines: [
      {
        product_name: "Tigla",
        quantity: 1,
        unit: "buc",
        unit_raw: "buc",
        unit_price: 100,
        line_total: 100,
        currency: "MDL",
        currency_raw: "lei",
        category: null,
        category_raw: null,
        ...lineExtra,
      },
      { product_name: "Surub", quantity: 2, unit_price: 1, line_total: 2 },
    ],
  };
}

console.log("check-callback-keys: cheile callback-ului de extragere\n");

console.log("1. o cheie necunoscuta sus si pe o linie: un avertisment, nimic refuzat");
{
  const body = knownBody({ supplier: "Silvamat", pages: 2 }, { furnizor_cod: "A1" });
  const { calls, returned } = capture(body);
  check("exact un avertisment", calls.length === 1, `primit ${calls.length}`);
  const m = calls[0] ?? "";
  check('numeste "supplier"', m.includes('"supplier"'), m);
  check('numeste "pages"', m.includes('"pages"'));
  check('numeste "furnizor_cod" pe linia 1', m.includes('linia 1 "furnizor_cod"'));
  check("numeste order_id-ul", m.includes(`"${ORDER}"`));
  check("intoarce textul scris", returned === m);
  const u = unknownCallbackKeys(body);
  check(
    "unknownCallbackKeys le separa pe niveluri",
    JSON.stringify(u) ===
      JSON.stringify({ topLevel: ["supplier", "pages"], lines: [{ line: 1, keys: ["furnizor_cod"] }] }),
    JSON.stringify(u),
  );
  check("corpul nu este modificat", !("warned" in body) && body.supplier === "Silvamat");
}

console.log("\n2. numai chei cunoscute, cu cele cinci ale lui EXT-34: niciun avertisment");
{
  const { calls, returned } = capture(knownBody());
  check("payload-ul rutei, fara EXT-34", calls.length === 0 && returned === null, `primit ${calls.length}`);
  const ext34 = capture(
    knownBody(
      { document_type: "invoice", client_ref: "C-1" },
      { supplier_code: "S-1", description: "d", line_total_source: "printed" },
    ),
  );
  check("cu document_type, client_ref, supplier_code, description, line_total_source", ext34.calls.length === 0);
  check("interiorul lui _meta nu se verifica", capture(knownBody({ _meta: { zzz: 1 } })).calls.length === 0);
  const failedScan = {
    order_id: ORDER,
    status: "failed",
    error_code: "unreadable_document",
    document_source: "scan",
    reason: "x",
  };
  check("o scanare esuata, fara cheia lines", capture(failedScan).calls.length === 0);
}

console.log("\n3. forme pe care le judeca ruta, nu aceasta functie: tacere, fara exceptie");
for (const [label, body] of [
  ["null", null],
  ["un tablou", [1, 2]],
  ["un numar", 5],
  ["un sir", "x"],
  ["lines este un sir", { order_id: ORDER, lines: "nu" }],
  ["o linie null si o linie numar", { order_id: ORDER, lines: [null, 3] }],
]) {
  let threw = false;
  let calls = [];
  try {
    calls = capture(body).calls;
  } catch {
    threw = true;
  }
  check(label, !threw && calls.length === 0, threw ? "a aruncat" : `avertismente ${calls.length}`);
}
{
  const { calls } = capture({ status: "extracted", ciudat: 1 });
  check("fara order_id, avertismentul spune ?", calls.length === 1 && calls[0].includes("order_id ?"), calls[0]);
}

console.log("\n4. un jurnal care arunca nu scapa exceptia");
{
  let threw = false;
  let returned;
  try {
    returned = warnUnknownCallbackKeys({ ciudat: 1 }, () => {
      throw new Error("jurnal cazut");
    });
  } catch {
    threw = true;
  }
  check("nu arunca, intoarce null", !threw && returned === null);
}

console.log("\n5. un sender nu poate umple sau falsifica jurnalul");
{
  const many = {};
  for (let i = 0; i < 50; i++) many[`k${i}`] = i;
  const { calls } = capture(many);
  check("o singura linie", calls.length === 1);
  const m = calls[0] ?? "";
  check(`cel mult ${MAX_KEYS_NAMED} chei numite`, m.includes('"k19"') && !m.includes('"k20"'));
  check("restul este numarat", m.includes("si inca 30"), m.slice(-40));
  const forged = capture({ ["a\n[extraction-callback] fals" + "x".repeat(200)]: 1 }).calls[0] ?? "";
  check("un rand nou in cheie ramane citat, nu rupe linia", !forged.includes("\n"), forged.slice(0, 120));
  check("o cheie lunga este scurtata", forged.length < 300, `lungime ${forged.length}`);
}

console.log("\n6. lista este cea a rutei, citita din sursa ei");
{
  const src = readFileSync(new URL("../../app/api/extraction/callback/route.ts", import.meta.url), "utf8")
    // Comentariile pomenesc chei in proza; numai codul conteaza.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"])\/\/.*$/gm, "$1");
  const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function GET"));
  const top = new Set();
  for (const m of post.matchAll(/\bbody\.([A-Za-z_][A-Za-z0-9_]*)/g)) top.add(m[1]);
  for (const m of post.matchAll(/hasOwnProperty\.call\(\s*body\s*,\s*"([^"]+)"\s*\)/g)) top.add(m[1]);
  const line = new Set();
  for (const m of post.matchAll(/\((?:l|r|raw) as Record<string, unknown>\)\.([A-Za-z_][A-Za-z0-9_]*)/g))
    line.add(m[1]);
  for (const m of post.matchAll(/(?<![A-Za-z0-9_.])(?:l|r)\.([A-Za-z_][A-Za-z0-9_]*)/g)) line.add(m[1]);
  const sorted = (xs) => JSON.stringify([...xs].sort());
  check(
    "cheile citite din corp sunt exact ROUTE_TOP_LEVEL_KEYS",
    sorted(top) === sorted(ROUTE_TOP_LEVEL_KEYS),
    `ruta ${sorted(top)}`,
  );
  check(
    "cheile citite dintr-o linie sunt exact ROUTE_LINE_KEYS",
    sorted(line) === sorted(ROUTE_LINE_KEYS),
    `ruta ${sorted(line)}`,
  );
  check(
    "EXT-34 adauga exact cele cinci chei ale lui",
    sorted(EXT34_TOP_LEVEL_KEYS) === sorted(["document_type", "client_ref"]) &&
      sorted(EXT34_LINE_KEYS) === sorted(["supplier_code", "description", "line_total_source"]),
  );
  check(
    "nicio cheie EXT-34 nu este deja citita de ruta",
    !EXT34_TOP_LEVEL_KEYS.some((k) => top.has(k)) && !EXT34_LINE_KEYS.some((k) => line.has(k)),
    "daca EXT-34 a livrat, muta cheile in listele rutei",
  );
  check("ruta cheama avertismentul", /warnUnknownCallbackKeys\(body\)/.test(post));
}

console.log("");
if (failures > 0) {
  console.error(`check-callback-keys: ${failures} din ${total} cazuri au cazut.`);
  process.exit(1);
}
console.log(`check-callback-keys: ${total} cazuri, toate trec.`);
