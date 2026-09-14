#!/usr/bin/env node
// EXT-08. Clasificatorul, verificat pe corpurile REALE ale amandurora
// versiunilor de Supabase Storage.
//
// DE CE EXISTA PE LANGA tests/e2e/document-url.spec.ts. Suita end to end ruleaza
// pe stiva Supabase LOCALA, si serverul de stocare de acolo nu trimite acelasi
// corp ca proiectul gazduit: campul `code` lipseste cu totul la el.
//
//   gazduit  {"statusCode":"400","error":"InvalidJWT","message":"...","code":"InvalidJWT"}
//   local    {"statusCode":"400","error":"InvalidJWT","message":"..."}
//
// Prima versiune a clasificatorului comuta pe `code`, deci trecea pe gazduit si
// raspundea 502 in loc de 400 si 401 pe local. Testul end to end a prins-o
// fiindca CI ruleaza local. INVERSUL NU AR FI FOST PRINS DE NIMIC: o schimbare
// care merge local si cade pe gazduit nu are niciun verde care sa se faca rosu,
// fiindca CI nu are acces la proiectul gazduit si nu trebuie sa aiba.
//
// Corpurile de mai jos sunt COPIATE VERBATIM din capturi, nu scrise din memorie.
// Gazduit: proiectul real, 2026-09-02, in raportul cardului. Local: stiva
// supabase locala, aceeasi zi.
//
// Nu atinge nicio retea, nicio baza de date si niciun secret.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_ERROR,
  DOCUMENT_STATUS,
  classifyStorageFailure,
  tokenExpiry,
} from "../../lib/data/document-url-contract.mjs";
import { resolveSiteOrigin } from "../../lib/data/site-origin.mjs";

// Un jeton de forma reala: trei segmente, payload citibil, semnatura care nu
// este verificata de nimeni aici. Nu deschide nimic, nicaieri.
function token(expSeconds) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ url: "rc-docs/x.pdf", iat: 1, exp: expSeconds }),
  ).toString("base64url");
  return `${head}.${body}.bm90LWEtc2lnbmF0dXJl`;
}

const NOW = 1_800_000_000;
const FRESH = token(NOW + 3600);
const STALE = token(NOW - 1);

// status, corp, jeton, codul asteptat
const CASES = [
  // --- proiectul gazduit, 2026-09-02 ---------------------------------------
  [
    "gazduit: jeton expirat",
    400,
    { statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed', code: "InvalidJWT" },
    STALE,
    DOCUMENT_ERROR.expired,
  ],
  [
    "gazduit: semnatura falsificata",
    400,
    { statusCode: "400", error: "InvalidJWT", message: "signature verification failed", code: "InvalidJWT" },
    FRESH,
    DOCUMENT_ERROR.invalid,
  ],
  [
    "gazduit: jeton care nu este JWT",
    400,
    { statusCode: "400", error: "InvalidJWT", message: "Invalid Compact JWS", code: "InvalidJWT" },
    "not-a-jwt",
    DOCUMENT_ERROR.invalid,
  ],
  [
    "gazduit: semnatura buna pe alta cale",
    400,
    { statusCode: "400", error: "InvalidSignature", message: "Invalid signature", code: "InvalidSignature" },
    FRESH,
    DOCUMENT_ERROR.invalid,
  ],
  [
    "gazduit: obiect inexistent",
    400,
    { statusCode: "404", error: "not_found", message: "Object not found", code: "NoSuchKey" },
    FRESH,
    DOCUMENT_ERROR.notFound,
  ],
  [
    "gazduit: jeton absent din querystring",
    400,
    { statusCode: "400", error: "Error", message: "querystring must have required property 'token'", code: "InvalidRequest" },
    FRESH,
    DOCUMENT_ERROR.invalid,
  ],
  // --- stiva locala, aceeasi zi, FARA campul code ---------------------------
  [
    "local: jeton expirat, fara campul code",
    400,
    { statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed' },
    STALE,
    DOCUMENT_ERROR.expired,
  ],
  [
    "local: semnatura falsificata, fara campul code",
    400,
    { statusCode: "400", error: "InvalidJWT", message: "signature verification failed" },
    FRESH,
    DOCUMENT_ERROR.invalid,
  ],
  [
    "local: obiect inexistent, fara campul code",
    400,
    { statusCode: "404", error: "not_found", message: "Object not found" },
    FRESH,
    DOCUMENT_ERROR.notFound,
  ],
  // --- ce NU se ghiceste ----------------------------------------------------
  [
    "un corp necunoscut NU devine unul dintre cele trei",
    400,
    { statusCode: "400", error: "SomethingNew", message: "o versiune viitoare" },
    FRESH,
    DOCUMENT_ERROR.upstream,
  ],
  [
    "un 5xx la ei nu este niciunul dintre cele trei",
    503,
    { statusCode: "503", error: "InvalidJWT" },
    STALE,
    DOCUMENT_ERROR.upstream,
  ],
  [
    "un corp care nu este JSON deloc",
    400,
    null,
    FRESH,
    DOCUMENT_ERROR.upstream,
  ],
  [
    "expirat SI obiect lipsa: obiectul lipsa castiga, fiindca el este ce a raspuns",
    400,
    { statusCode: "404", error: "not_found" },
    STALE,
    DOCUMENT_ERROR.notFound,
  ],
];

let failures = 0;
console.log("check-document-url-contract: clasificatorul pe corpuri capturate\n");
for (const [label, status, body, tok, expected] of CASES) {
  const got = classifyStorageFailure(status, body, tok, NOW);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${label}: asteptat ${expected}, primit ${got}`);
}

// Perechea cod/status ESTE contractul. O schimbare de status fara un card se
// vede aici, nu la Andre.
const PAIRS = [
  [DOCUMENT_ERROR.expired, 400],
  [DOCUMENT_ERROR.invalid, 401],
  [DOCUMENT_ERROR.notFound, 404],
  [DOCUMENT_ERROR.upstream, 502],
  [DOCUMENT_ERROR.method, 405],
];
console.log("");
for (const [code, status] of PAIRS) {
  const ok = DOCUMENT_STATUS[code] === status;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${code} -> ${status} (este ${DOCUMENT_STATUS[code]})`);
}

// tokenExpiry citeste payload-ul si nu se prabuseste pe gunoi.
console.log("");
const EXPIRY = [
  ["un jeton bine format", FRESH, NOW + 3600],
  ["un jeton expirat", STALE, NOW - 1],
  ["nu este un JWT", "abc", null],
  ["trei segmente, payload care nu este JSON", "a.bm90LWpzb24.c", null],
];
for (const [label, tok, expected] of EXPIRY) {
  const got = tokenExpiry(tok);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} tokenExpiry, ${label}: asteptat ${expected}, primit ${got}`);
}

// EXT-30. ORIGINEA LEGATURII, FARA ADRESA DE REZERVA.
//
// resolveSiteOrigin intoarce originea sau null. null inseamna ca nu pleaca nimic:
// lib/data/extraction-fire.ts refuza trimiterea si scrie motivul pe ciorna. Pana la
// EXT-30 o valoare lipsa cadea in tacere pe site-ul de marketing.
console.log("");
const ORIGINS = [
  ["variabila absenta", undefined, null],
  ["sir gol", "", null],
  ["numai spatii", "   ", null],
  ["fara schema, ar produce o legatura relativa", "app.rapidconstruct.md", null],
  ["alta schema", "ftp://app.rapidconstruct.md", null],
  ["cu o cale, ar fi lipita in fata lui /api/documents", "https://app.rapidconstruct.md/aplicatie", null],
  ["cu interogare", "https://app.rapidconstruct.md/?x=1", null],
  ["gazda de productie, cu slash final", "https://app.rapidconstruct.md/", "https://app.rapidconstruct.md"],
  ["gazda de productie, cu spatii", "  https://app.rapidconstruct.md  ", "https://app.rapidconstruct.md"],
  ["serverul local al suitei", "http://localhost:3100", "http://localhost:3100"],
];
for (const [label, raw, expected] of ORIGINS) {
  const got = resolveSiteOrigin(raw);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} resolveSiteOrigin, ${label}: asteptat ${expected}, primit ${got}`);
}

// EXT-30. TREI LOCURI NUMESC GAZDA DE PRODUCTIE SI NU AU VOIE SA DIFERE: garda de
// commit, contractul pe care il citeste cealalta parte, si scriptul care produce
// legaturile de proba. GATE-07 a mutat garda pe gazda buna si a lasat celelalte
// doua pe cea veche; de aceea se compara aici, nu se presupune.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRODUCTION_HOST = "https://app.rapidconstruct.md";
// ANCORATE LA INCEPUTUL RANDULUI, SI NU E O PRECAUTIE. Doua dintre fisiere pastreaza,
// intr-un comentariu, randul vechi care numea gazda de marketing (CLAUDE.md 9c).
// Prima varianta a acestor tipare nu era ancorata, a gasit intai comentariul si a
// raportat gazda veche drept valoarea in vigoare.
const HOSTS = [
  ["garda de commit", "scripts/poc-free/check-deployed-commit.mjs", /^const ORIGIN = \(args\.origin \|\| process\.env\.RC_HEALTH_ORIGIN \|\| "(https:\/\/[^"]+)"\)/m],
  ["contractul, sectiunea 1", "docs/contracts/document-url.md", /^(https:\/\/[^/\s]+)\/api\/documents\/<bucket>/m],
  ["scriptul setului de proba", "scripts/ext/serve-sample-documents.mjs", /^const ORIGIN = \(arg\("origin", "(https:\/\/[^"]+)"\)\)/m],
  ["scriptul legaturilor de test", "scripts/ext/document-url-test-links.mjs", /^const ORIGIN = arg\("origin", "(https:\/\/[^"]+)"\)/m],
];
console.log("");
for (const [label, rel, pattern] of HOSTS) {
  const found = pattern.exec(readFileSync(join(ROOT, rel), "utf8"))?.[1] ?? null;
  const ok = found === PRODUCTION_HOST;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok   " : "FAIL "} gazda din ${label}: asteptat ${PRODUCTION_HOST}, primit ${found}`);
}

// EXT-30. APLICATIA NU NUMESTE SITE-UL DE MARKETING NICAIERI. Un literal al
// gazdei vechi in lib/, app/, components/ sau proxy.ts este exact forma pe care
// o avea adresa de rezerva. Comentariile care o citeaza stau in fisiere .mjs din
// lib/ si sunt permise numai acolo unde se citeaza textul inlocuit.
const OLD_HOST = "rapidconstructmd.com";
const QUOTING = new Set(["lib/data/site-origin.mjs"]);
function walk(rel) {
  const full = join(ROOT, rel);
  if (statSync(full).isFile()) return [rel];
  return readdirSync(full).flatMap((name) => walk(join(rel, name)));
}
const offenders = ["lib", "app", "components", "proxy.ts"]
  .flatMap((rel) => walk(rel))
  .filter((rel) => /\.(ts|tsx|mjs|js)$/.test(rel) && !QUOTING.has(rel))
  .filter((rel) => {
    const text = readFileSync(join(ROOT, rel), "utf8");
    // Un rand de comentariu care citeaza gazda veche ca istorie este permis; un
    // literal intr-un rand de cod nu este.
    return text
      .split("\n")
      .some((line) => line.includes(OLD_HOST) && !/^\s*(\/\/|\*|\/\*)/.test(line));
  });
{
  const ok = offenders.length === 0;
  if (!ok) failures += 1;
  console.log(
    `\n  ${ok ? "ok   " : "FAIL "} niciun rand de cod din aplicatie nu numeste ${OLD_HOST}` +
      (ok ? "" : `: ${offenders.join(", ")}`),
  );
}

console.log("");
if (failures > 0) {
  console.error(`check-document-url-contract: ${failures} caz(uri) au cazut.`);
  console.error("docs/contracts/document-url.md este contractul pe care Make il programeaza.");
  process.exit(1);
}
console.log(
  `check-document-url-contract: ${CASES.length + PAIRS.length + EXPIRY.length + ORIGINS.length + HOSTS.length + 1} cazuri, toate trec.`,
);
