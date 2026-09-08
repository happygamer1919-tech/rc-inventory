#!/usr/bin/env node
//
// GATE-01. Phase 3 launch gate G1, clause 3:
//
//   "a write from a role without permission is refused AT THE DATABASE"
//
// The 2026-08-31 gate audit recorded that clause as NEVER ATTEMPTED. Every anon
// request it made was a READ. This file is the same call with a different verb.
//
// WHAT IT DOES. It issues an INSERT against public.clients, public.contacts and
// public.suppliers on the PRODUCTION project, over PostgREST, carrying the
// PUBLIC anon key and NO user session, and asserts that PostgreSQL refuses each
// one. Exit 0 only when all three are refused. Anything else exits non-zero.
//
// THE ANON KEY IS PUBLIC AND THIS SCRIPT NEVER PRINTS IT. It is compiled into
// the browser bundle by design, which is the whole reason this card needed no
// new credential and no owner action. CLAUDE.md section 7 still binds: the key
// itself, its signature, and every other value under /Users/ivan/rc-secrets are
// never echoed. What IS printed from it is the two unsigned JWT claims that make
// the proof mean something, `role` and `ref`, because a refusal is only evidence
// about the anon role once you have shown the request carried the anon role.
//
// HOW TO RUN IT, and a stranger can re-run it with nothing but this block:
//
//   set -o allexport; source /Users/ivan/rc-secrets/phase2.env; set +o allexport
//   node scripts/prove-anon-write-refused.mjs
//
// It is NOT in the `quality` workflow and must never be added to it. The runner
// holds no Supabase credential and pointing it at production is exactly what
// scripts/poc-free/check-no-prod-target.mjs exists to refuse.
//
// THREE OUTCOMES, AND ONLY THE FIRST IS A PASS.
//
//   REFUSED   PostgreSQL answered 42501 insufficient_privilege, or the
//             equivalent row level security refusal, also 42501, "new row
//             violates row-level security policy". The privilege gate held.
//   REACHED   the request got PAST the privilege gate and failed on something
//             else: a foreign key, a not-null, an unknown column. The gate is
//             open. This is a FAILURE and it is reported as one.
//   WROTE     the insert succeeded. The gate is open and there is now a row on
//             production. This is a FAILURE, an incident, and the returned row
//             is printed so it can be found and removed.
//
// The card's defaults say it in one line: "A REFUSAL IS THE PASS. If any of the
// three writes SUCCEEDS, the card does not fail quietly and does not fix it in
// passing: it reports, opens an incident, and the gate stays failed." Nothing
// here repairs anything. It measures.
//
// WHY IT ASSERTS THE TARGET IS PRODUCTION, which is the inverse of every other
// guard in this repository. scripts/assert-not-prod.mjs refuses to let the test
// suite run against a production ref. This script refuses to run against
// anything else, because a green run against a local stack would look identical
// in a report and would be evidence for a claim nobody made. The clause says
// "on production" and so does the check.
//
import { PRODUCTION_REFS } from "./production-refs.mjs";

const TABLES = ["clients", "contacts", "suppliers"];

// A marker that is findable. If a write ever lands, somebody has to be able to
// select it back out by name without guessing.
const STAMP = new Date().toISOString();
const MARKER = `GATE-01 anon write probe ${STAMP}`;

// The payloads are VALID for their table wherever a valid value can be built
// without reading the database, because "it would have been written if the gate
// were open" is the claim being tested.
//
// contacts.client_id IS THE ONE EXCEPTION AND IT IS STATED RATHER THAN HIDDEN.
// It is NOT NULL and references public.clients, and anon cannot read a client id
// to put there, so the probe sends a synthetic uuid. That does not weaken the
// proof: PostgreSQL checks table privileges before it checks a foreign key, so a
// closed gate still answers 42501. An OPEN gate would answer 23503
// foreign_key_violation instead, which this script classifies as REACHED and
// fails on. Either way the gate is what is being measured.
const PAYLOADS = {
  clients: { name: MARKER, type: "company", notes: MARKER },
  contacts: {
    client_id: "00000000-0000-4000-8000-000000000001",
    name: MARKER,
    notes: MARKER,
  },
  suppliers: { name: MARKER, type: "company", notes: MARKER },
};

const line = (s = "") => console.log(s);

function refuseToClaim(code, message) {
  line("");
  line(`REFUSING TO CLAIM ANYTHING: ${message}`);
  process.exit(code);
}

// --- 1. the environment ------------------------------------------------------
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

if (!url || !anonKey) {
  refuseToClaim(
    3,
    "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is absent. " +
      "Nothing was sent, so nothing may be assumed proven. Source the phase 2 " +
      "environment first:\n" +
      "  set -o allexport; source /Users/ivan/rc-secrets/phase2.env; set +o allexport",
  );
}

// --- 2. the target is production, or this proves nothing about the gate ------
let ref;
try {
  ref = new URL(url).hostname.split(".")[0];
} catch {
  refuseToClaim(3, "NEXT_PUBLIC_SUPABASE_URL is not a URL, so no project ref could be derived.");
}

if (!PRODUCTION_REFS.includes(ref)) {
  refuseToClaim(
    3,
    `the target project ref is ${ref}, which is not in scripts/production-refs.mjs. ` +
      "Gate G1 clause 3 says ON PRODUCTION. A pass obtained anywhere else would " +
      "be evidence for a claim nobody made.",
  );
}

// --- 3. the request carries the anon role, and that is shown -----------------
// The JWT is public and readable without its signature. Only `role` and `ref`
// are printed. The token, its signature and every other claim are not.
let claims;
try {
  const payload = anonKey.split(".")[1];
  claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
} catch {
  refuseToClaim(
    3,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY is not a readable JWT, so the role it carries could not be shown.",
  );
}

if (claims.role !== "anon") {
  refuseToClaim(
    3,
    `the key in NEXT_PUBLIC_SUPABASE_ANON_KEY carries role "${claims.role}", not "anon". ` +
      "A refusal from some other role is not evidence about the anon role, and a " +
      "SUCCESS from some other role would write a real row to production.",
  );
}

if (claims.ref && claims.ref !== ref) {
  refuseToClaim(
    3,
    `the key names project ref ${claims.ref} and the URL names ${ref}. They must be the same project.`,
  );
}

line("=".repeat(78));
line("GATE-01: anon WRITE refusal on production");
line("=".repeat(78));
line(`project ref     ${ref}   (public: it is in the browser bundle)`);
line(`key role claim  ${claims.role}`);
line("session         none. apikey and Authorization both carry the anon key.");
line(`marker          ${MARKER}`);
line(`tables          ${TABLES.join(", ")}`);
line("");

// --- 4. the three writes -----------------------------------------------------
// 42501 is insufficient_privilege AND is also the code PostgREST returns for a
// row level security refusal ("new row violates row-level security policy"),
// which is the "equivalent RLS refusal" the acceptance line allows. Both are a
// refusal BY POSTGRES and both are a pass.
const REFUSAL_CODES = new Set(["42501"]);

const results = [];

for (const table of TABLES) {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/${table}`;
  const body = JSON.stringify(PAYLOADS[table]);

  line("-".repeat(78));
  line(`POST ${endpoint}`);
  line(`body ${body}`);

  let res;
  let text;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        // return=representation so that a write which SUCCEEDS hands back the
        // row it created. An incident needs the id, not the news that there is
        // one.
        Prefer: "return=representation",
      },
      body,
    });
    text = await res.text();
  } catch (err) {
    results.push({ table, status: null, code: null, outcome: "ERROR", body: String(err && err.message) });
    line(`TRANSPORT ERROR: ${err && err.message}`);
    line("OUTCOME ERROR");
    line("");
    continue;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const code = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.code : undefined;

  line(`HTTP ${res.status} ${res.statusText}`);
  line(`RESPONSE ${text}`);

  let outcome;
  if (res.ok) {
    outcome = "WROTE";
  } else if (code && REFUSAL_CODES.has(String(code))) {
    outcome = "REFUSED";
  } else if (code) {
    // A postgres error code that is not 42501 means the statement was planned
    // and executed. The privilege gate did not stop it.
    outcome = "REACHED";
  } else {
    // No postgres code at all: a gateway, an auth layer, a 404. Not a database
    // refusal, so not the thing the clause asks for.
    outcome = "UNCLEAR";
  }

  results.push({ table, status: res.status, code: code ?? null, outcome, body: text });
  line(`OUTCOME ${outcome}`);
  line("");
}

// --- 5. the verdict, which the script decides and the terminal reports -------
line("=".repeat(78));
line("VERDICT");
line("=".repeat(78));
line("  table      http  code   outcome");
for (const r of results) {
  line(
    `  ${r.table.padEnd(10)} ${String(r.status ?? "-").padEnd(5)} ` +
      `${String(r.code ?? "-").padEnd(6)} ${r.outcome}`,
  );
}
line("");

const refused = results.filter((r) => r.outcome === "REFUSED");
const wrote = results.filter((r) => r.outcome === "WROTE");

if (refused.length === TABLES.length) {
  line(`PASS: ${refused.length} of ${TABLES.length} writes refused by PostgreSQL with 42501.`);
  line("Gate G1 clause 3 is MET: a role without permission is stopped at the database.");
  process.exit(0);
}

line(`FAIL: ${refused.length} of ${TABLES.length} writes were refused.`);
if (wrote.length > 0) {
  line("");
  line("INCIDENT. The following writes SUCCEEDED against production and the rows");
  line("printed above exist. Nothing here removes them: report, open an incident,");
  line("and the gate stays failed.");
  for (const r of wrote) line(`  ${r.table}: HTTP ${r.status}`);
}
line("");
line("Gate G1 clause 3 is NOT met.");
process.exit(1);
