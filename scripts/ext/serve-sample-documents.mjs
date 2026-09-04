#!/usr/bin/env node
// EXT-08. Cele patru documente de proba, si contractul lor de esec, masurat.
//
// CE FACE, IN ORDINE:
//
//   1. urca cele patru documente din /Users/ivan/rc-samples in bucket-ul rc-docs
//   2. le semneaza prin acelasi createSignedUrl pe care il foloseste aplicatia,
//      cu TTL 86400 de secunde (douazeci si patru de ore, ruling R-096), si le
//      rescrie in forma rutei noastre
//   3. captureaza VERBATIM statusul, antetele si corpul celor trei cai de esec,
//      pe amandoua nivelele: direct pe Supabase Storage, si prin ruta noastra
//
// DE CE CAPTUREAZA AMANDOUA. Nivelul Storage este dovada ca respectarea
// contractului nu putea fi raportata din documentatie: el nu il respecta. Nivelul
// rutei este contractul insusi. Un raport care il arata numai pe al doilea nu
// spune de ce exista ruta.
//
// CE NU TIPARESTE: numarul de linii, totalurile sau numarul de pagini ale
// vreunui document. Rostul setului de proba este ca extractorul lui Andre sa le
// produca singur, si o valoare asteptata trimisa odata cu fisierul nu se mai
// poate lua inapoi.
//
// SECRETE. Cheia se ia din mediu, prin numele ei, si nu ajunge niciodata in
// iesire. Jetoanele semnate se redacteaza in capturi; legaturile de lucru se
// tiparesc o singura data, in sectiunea lor, fiindca acela este produsul.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SAMPLES_DIR = process.env.RC_SAMPLES_DIR ?? "/Users/ivan/rc-samples";
const BUCKET = "rc-docs";
const PREFIX = "_samples/andre";
// R-096, 2026-09-03. Ridicat de la doua ore la douazeci si patru. Domeniul este
// EXCLUSIV setul de proba de sub _samples/andre, care nu contine date de client.
// Caile de semnare ale aplicatiei (lib/data/inbound-actions.ts si
// lib/data/extraction-fire.ts, amandoua 15 minute) NU se schimba.
const TTL_SECONDS = 24 * 60 * 60;

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ORIGIN = (arg("origin", "https://www.rapidconstructmd.com")).replace(/\/+$/, "");
const CAPTURE_ONLY = process.argv.includes("--capture-only");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Lipsesc NEXT_PUBLIC_SUPABASE_URL si/sau SUPABASE_SERVICE_ROLE_KEY din mediu.\n" +
      "CLAUDE.md 8.3: set -o allexport; . /Users/ivan/rc-secrets/phase2.env; set +o allexport",
  );
  process.exit(2);
}
const PROJECT = new URL(SUPABASE_URL).origin;
const sb = createClient(PROJECT, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const redact = (s) =>
  String(s)
    .replaceAll(PROJECT, "<PROJECT>")
    .replace(/token=[A-Za-z0-9._~+/=-]+/g, "token=<JWT>");

/** Statusul, antetele si corpul, in forma in care le vede cealalta parte. */
async function capture(label, url, init = {}) {
  const res = await fetch(url, { redirect: "manual", ...init });
  const body = await res.text();
  const lines = [];
  lines.push(`### ${label}`);
  lines.push("```http");
  lines.push(`${init.method ?? "GET"} ${redact(url)}`);
  lines.push("");
  lines.push(`HTTP/1.1 ${res.status} ${res.statusText}`);
  for (const [k, v] of [...res.headers.entries()].sort()) {
    // Antetele de transport si cookie-urile Cloudflare se schimba la fiecare
    // cerere si nu spun nimic despre contract.
    if (["set-cookie", "cf-ray", "date", "age", "report-to", "nel"].includes(k)) continue;
    lines.push(`${k}: ${redact(v)}`);
  }
  lines.push("");
  lines.push(redact(body).slice(0, 1200));
  lines.push("```");
  return lines.join("\n");
}

function samples() {
  const files = readdirSync(SAMPLES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (files.length === 0) {
    console.error(`Niciun PDF in ${SAMPLES_DIR}.`);
    process.exit(2);
  }
  return files.map((name) => {
    const full = join(SAMPLES_DIR, name);
    const bytes = readFileSync(full);
    return {
      name,
      bytes,
      size: statSync(full).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      // Numele obiectului nu poarta spatii sau paranteze: o cale curata este o
      // cale pe care nimeni nu o codifica gresit la a treia manipulare.
      object: `${PREFIX}/${name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+\./, ".")}`,
    };
  });
}

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const docs = samples();

if (!CAPTURE_ONLY) {
  say("## 1. Incarcare");
  say();
  say("| fisier | octeti | sha256 | obiect |");
  say("|---|---|---|---|");
  for (const d of docs) {
    const up = await sb.storage
      .from(BUCKET)
      .upload(d.object, d.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      console.error(`incarcarea a esuat pentru ${d.name}: ${up.error.message}`);
      process.exit(1);
    }
    say(`| \`${d.name}\` | ${d.size} | \`${d.sha256}\` | \`${d.object}\` |`);
  }
  say();
}

say("## 2. Legaturile, TTL 24 de ore, prin calea reala de semnare");
say();
const issuedAt = new Date();
const expiresAt = new Date(issuedAt.getTime() + TTL_SECONDS * 1000);
say(`Emise \`${issuedAt.toISOString()}\`, expira \`${expiresAt.toISOString()}\`.`);
say();
for (const d of docs) {
  const signed = await sb.storage.from(BUCKET).createSignedUrl(d.object, TTL_SECONDS);
  if (signed.error) {
    console.error(`semnarea a esuat pentru ${d.object}: ${signed.error.message}`);
    process.exit(1);
  }
  const u = new URL(signed.data.signedUrl);
  const rest = u.pathname.replace("/storage/v1/object/sign/", "");
  const token = u.searchParams.get("token");
  say(`- \`${d.name}\``);
  say(`  ${ORIGIN}/api/documents/${rest}?token=${token}`);
}
say();

// --- 3. Cele trei cai de esec, masurate -------------------------------------
//
// Un obiect de unica folosinta, urcat, semnat de doua ori si sters, produce
// toate cele trei stari fara sa atinga niciunul dintre cele patru documente.
const probe = `${PREFIX}/_probe-${Date.now()}.pdf`;
await sb.storage
  .from(BUCKET)
  .upload(probe, Buffer.from("%PDF-1.4\n% probe\n%%EOF\n"), {
    contentType: "application/pdf",
    upsert: true,
  });

const short = await sb.storage.from(BUCKET).createSignedUrl(probe, 1);
const long = await sb.storage.from(BUCKET).createSignedUrl(probe, TTL_SECONDS);
const storageExpired = short.data.signedUrl;
const storageValid = long.data.signedUrl;
const storageInvalid = storageValid.replace(/token=([^&]+)/, (m, t) => `token=${t.slice(0, -6)}AAAAAA`);

const asRoute = (storageUrl) => {
  const u = new URL(storageUrl);
  return `${ORIGIN}/api/documents/${u.pathname.replace("/storage/v1/object/sign/", "")}?token=${u.searchParams.get("token")}`;
};

await new Promise((r) => setTimeout(r, 3000));

say("## 3. Ce raspunde Supabase Storage astazi, direct, fara ruta noastra");
say();
say(await capture("jeton EXPIRAT, direct pe Storage", storageExpired));
say();
say(await capture("jeton INVALID, direct pe Storage", storageInvalid));
say();

// Obiectul dispare de sub un jeton inca valabil: singura cale prin care Storage
// raspunde NoSuchKey pe o legatura semnata.
const routeExpired = asRoute(storageExpired);
const routeInvalid = asRoute(storageInvalid);
const routeMissing = asRoute(storageValid);
const storageMissing = storageValid;
await sb.storage.from(BUCKET).remove([probe]);
await new Promise((r) => setTimeout(r, 2000));

say(await capture("OBIECT INEXISTENT, direct pe Storage", `${storageMissing}&cb=${Date.now()}`));
say();

say("## 4. Ce raspunde ruta noastra, pe aceleasi trei jetoane");
say();
say(await capture("jeton EXPIRAT, prin ruta", routeExpired));
say();
say(await capture("jeton INVALID, prin ruta", routeInvalid));
say();
say(await capture("OBIECT INEXISTENT, prin ruta", routeMissing));
say();
say(await capture("fara jeton, prin ruta", `${ORIGIN}/api/documents/${BUCKET}/${probe}`));
say();

const target = arg("out", "");
if (target) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(target, out.join("\n") + "\n");
  console.error(`scris in ${target}`);
}
