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

import {
  DOCUMENT_ERROR,
  DOCUMENT_STATUS,
  classifyStorageFailure,
  tokenExpiry,
} from "../../lib/data/document-url.ts";

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

console.log("");
if (failures > 0) {
  console.error(`check-document-url-contract: ${failures} caz(uri) au cazut.`);
  console.error("docs/contracts/document-url.md este contractul pe care Make il programeaza.");
  process.exit(1);
}
console.log(`check-document-url-contract: ${CASES.length + PAIRS.length + EXPIRY.length} cazuri, toate trec.`);
