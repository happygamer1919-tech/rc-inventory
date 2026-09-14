#!/usr/bin/env node
// EXT-30. Trei legaturi de test pentru cealalta parte, una pe cod, prin RUTA REALA
// si pe ORIGINEA REALA.
//
//   EXPIRED_TOKEN     400
//   INVALID_TOKEN     401
//   OBJECT_NOT_FOUND  404
//
// Contractul este docs/contracts/document-url.md. Fiecare legatura trece prin
// https://app.rapidconstruct.md/api/documents/..., adica exact calea si originea pe
// care le poarta un `document_url` real, si fiecare este VERIFICATA dupa ce este
// produsa: statusul, content-type-ul si `code` trebuie sa fie cele din contract, sau
// scriptul iese cu 1 si nu scrie nimic.
//
// DOUA MODURI, FIINDCA NUMAI UNUL CERE UN CREDENTIAL.
//
//   (implicit)           EXPIRED_TOKEN si INVALID_TOKEN. Fara niciun credential.
//                        Ruta hotaraste EXPIRED din claim-ul `exp`, citit fara a
//                        verifica semnatura (lib/data/document-url-contract.mjs), dupa
//                        ce Storage a refuzat jetonul. Un jeton cu `exp` in trecut si
//                        fara semnatura valida primeste deci exact raspunsul unui
//                        jeton expirat, iar legatura nu se schimba niciodata.
//                        INVALID_TOKEN este un jeton care nu este un JWT.
//
//   --object-not-found   OBJECT_NOT_FOUND. CERE SUPABASE_SERVICE_ROLE_KEY SI
//                        NEXT_PUBLIC_SUPABASE_URL IN MEDIU, deci il ruleaza
//                        proprietarul, nu un terminal (CLAUDE.md 7). Singura cale
//                        prin care Storage raspunde NoSuchKey pe o legatura semnata
//                        este un jeton VALID peste un obiect care nu mai exista, deci
//                        scriptul urca un PDF de proba sub _samples/andre/, il
//                        semneaza, il STERGE si verifica. Este o scriere in productie
//                        (o incarcare si o stergere a obiectului pe care tocmai l-a
//                        urcat) si se jurnalizeaza in docs/PRODUCTION-WRITES.md de
//                        cine o ruleaza, per CLAUDE.md 8.8.
//
// TTL-UL NU SE SCHIMBA. Legatura OBJECT_NOT_FOUND foloseste valoarea setului de
// proba, douazeci si patru de ore, pe care ruling R-096 o fixeaza pentru obiectele de
// sub _samples/andre si pe care scripts/ext/serve-sample-documents.mjs o poarta deja.
// Dupa expirare aceeasi legatura raspunde EXPIRED_TOKEN, si fisierul de iesire o
// spune. Productia ramane la cincisprezece minute.
//
// NICIO LEGATURA SI NICIUN JETON NU AJUNG LA IESIREA STANDARD. Legaturile se scriu in
// fisierul dat prin --out, implicit /Users/ivan/rc-samples/EXT-30-TEST-LINKS.md, cu
// drepturi 600. La iesire se tiparesc numai codul, statusul si content-type-ul.

import { chmodSync, writeFileSync } from "node:fs";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// Aceeasi gazda ca garda de commit (scripts/poc-free/check-deployed-commit.mjs) si
// ca documentul contractului. check-document-url-contract.mjs refuza daca ele
// ajung sa difere.
const ORIGIN = arg("origin", "https://app.rapidconstruct.md").replace(/\/+$/, "");
const OUT = arg("out", "/Users/ivan/rc-samples/EXT-30-TEST-LINKS.md");
const OBJECT_NOT_FOUND_MODE = process.argv.includes("--object-not-found");

const BUCKET = "rc-docs";
const PREFIX = "_samples/andre";
// R-096. Numai pentru obiectele de sub _samples/andre. Vezi antetul.
const SAMPLE_TTL_SECONDS = 24 * 60 * 60;

const EXPECT = {
  EXPIRED_TOKEN: 400,
  INVALID_TOKEN: 401,
  OBJECT_NOT_FOUND: 404,
};

function routeUrl(objectPath, token) {
  return `${ORIGIN}/api/documents/${BUCKET}/${objectPath}?token=${encodeURIComponent(token)}`;
}

/** Un jeton de forma JWT cu `exp` in trecut. Semnatura nu este valida pentru nimic. */
function expiredShapedToken(objectPath) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ url: `${BUCKET}/${objectPath}`, iat: now - 7200, exp: now - 3600 });
  return `${head}.${body}.${Buffer.from("ext-30-not-signed").toString("base64url")}`;
}

/** Cere legatura si verifica perechea status/cod. Nu tipareste legatura. */
async function verify(code, url) {
  const res = await fetch(url, { redirect: "manual" });
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let got = null;
  try {
    got = JSON.parse(text).code ?? null;
  } catch {
    got = null;
  }
  const ok = res.status === EXPECT[code] && got === code && type.includes("application/json");
  console.log(`  ${ok ? "ok   " : "FAIL "} ${code}: status ${res.status}, content-type ${type}, code ${got}`);
  return { code, url, ok, status: res.status, type, at: new Date().toISOString() };
}

const results = [];

if (!OBJECT_NOT_FOUND_MODE) {
  console.log(`document-url-test-links: EXPIRED_TOKEN si INVALID_TOKEN pe ${ORIGIN}, fara credential\n`);
  const expiredPath = `${PREFIX}/ext-30-expired-token.pdf`;
  results.push(await verify("EXPIRED_TOKEN", routeUrl(expiredPath, expiredShapedToken(expiredPath))));
  results.push(await verify("INVALID_TOKEN", routeUrl(`${PREFIX}/ext-30-invalid-token.pdf`, "ext-30-not-a-token")));
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Lipsesc NEXT_PUBLIC_SUPABASE_URL si/sau SUPABASE_SERVICE_ROLE_KEY din mediu. Numai numele sunt tiparite.");
    process.exit(2);
  }
  const project = new URL(url).origin;
  const auth = { Authorization: `Bearer ${key}`, apikey: key };
  const objectPath = `${PREFIX}/ext-30-object-not-found.pdf`;
  console.log(`document-url-test-links: OBJECT_NOT_FOUND pe ${ORIGIN}\n`);

  const must = async (label, response) => {
    if (!response.ok) {
      console.error(`${label} a raspuns ${response.status}. Nimic nu a fost scris in ${OUT}.`);
      process.exit(1);
    }
    return response;
  };

  // 1. Obiectul de proba. Un PDF minim; nu contine nimic al clientului.
  await must(
    "incarcarea",
    await fetch(`${project}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/pdf", "x-upsert": "true" },
      body: Buffer.from("%PDF-1.4\n% EXT-30 object-not-found placeholder\n%%EOF\n"),
    }),
  );
  // 2. Semnat, cu TTL-ul setului de proba.
  const signed = await must(
    "semnarea",
    await fetch(`${project}/storage/v1/object/sign/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: SAMPLE_TTL_SECONDS }),
    }),
  );
  const { signedURL } = await signed.json();
  const token = new URL(`${project}/storage/v1${signedURL}`).searchParams.get("token") ?? "";
  // 3. Obiectul dispare de sub jeton.
  await must(
    "stergerea",
    await fetch(`${project}/storage/v1/object/${BUCKET}/${objectPath}`, { method: "DELETE", headers: auth }),
  );
  results.push(await verify("OBJECT_NOT_FOUND", routeUrl(objectPath, token)));
  results[0].expiresAt = new Date(Date.now() + SAMPLE_TTL_SECONDS * 1000).toISOString();
}

if (results.some((r) => !r.ok)) {
  console.error(`\ndocument-url-test-links: cel putin o legatura NU respecta contractul. Nimic nu a fost scris in ${OUT}.`);
  process.exit(1);
}

const lines = [
  "# EXT-30 test links for the extraction counterparty",
  "",
  "Produced by `scripts/ext/document-url-test-links.mjs`. Each link goes through the",
  `real route on ${ORIGIN}, and each was requested once and answered as below`,
  "before this file was written. Contract: `docs/contracts/document-url.md`.",
  "",
];
for (const r of results) {
  lines.push(`## ${r.code}, HTTP ${EXPECT[r.code]}`);
  lines.push("");
  lines.push(`Verified ${r.at}: status ${r.status}, content-type \`${r.type}\`.`);
  if (r.expiresAt) {
    lines.push(`Answers OBJECT_NOT_FOUND until ${r.expiresAt}; after that the same link answers EXPIRED_TOKEN.`);
  }
  lines.push("");
  lines.push("```");
  lines.push(r.url);
  lines.push("```");
  lines.push("");
}
// Fisierul se completeaza, nu se inlocuieste: modul implicit si modul proprietarului
// scriu in acelasi fisier, in doua rulari.
writeFileSync(OUT, `${lines.join("\n")}\n`, { flag: "a", mode: 0o600 });
chmodSync(OUT, 0o600);
console.log(`\ndocument-url-test-links: ${results.length} legatura(i) verificate si adaugate in ${OUT}. Nicio legatura nu a fost tiparita.`);
