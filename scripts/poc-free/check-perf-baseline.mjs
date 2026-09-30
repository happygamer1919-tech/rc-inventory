#!/usr/bin/env node
// check-perf-baseline.mjs - P3-117 acceptance (e), made machine-checkable.
//
// THE CARD SAYS IT IN ITS OWN WORDS: "A card set shipped with an empty baseline
// has not met (e)." That sentence was, until this file, a promise. On this board
// a card is written `shipped` BEFORE its quality run concludes, because
// check-board-edit refuses a pull request carrying a card's code while the card
// is short of a terminal status; and the owner's auto-merger lands a branch on
// its FIRST green. Put those two together and the baseline card had exactly one
// way to go wrong, and it was the likely way: ship green with the six numbers
// still missing, merge in seconds, and leave the epic with a card that says
// "measured" and a notes field that measured nothing.
//
// So the six numbers are a CHECK, not a habit. A green run now requires them.
//
// WHERE IT SITS IN THE JOB, and this is deliberate: LAST, after the step that
// actually produces the baseline. The numbers are read out of that step's log
// and written into the card, so a run has to get far enough to print them
// before this refuses for their absence. Put earlier, it would refuse before
// producing the thing it demands, and the card could never be finished.
//
// IT READS THE BOARD AND NOTHING ELSE. No credential, no connection, no
// database, so it runs on every push including a documentation-only diff: that
// is exactly the diff which could quietly blank the notes later.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BOARD = join(ROOT, "docs/board/rc-board-phase3.json");

const CARD_ID = "P3-117";

// The six sections, in the order the report prints them. Rapoarte is NOT here
// and must not be: there is no such route, and a line for it would be a number
// about a page that does not exist.
const SECTIUNI = [
  "Tablou de bord",
  "Inventar",
  "Iesiri materiale",
  "CRM",
  "Facturi",
  "Setari",
];

// The same shape the card's acceptance (a) fixes for a report line.
const LINIE = /^(Tablou de bord|Inventar|Iesiri materiale|CRM|Facturi|Setari) p75=(\d+)ms n=(\d+)$/;

// What must sit beside the numbers so a later reader knows what they are.
// FELUL RULARII is not decoration: a number measured on a seeded CI stack and a
// number measured on production are different numbers, and a baseline that does
// not say which one it is cannot be compared against anything honestly.
const ETICHETE = ["FELUL RULARII", "RULARE", "SAMANTA", "DATA"];

const failures = [];
const fail = (m) => failures.push(m);

const board = JSON.parse(readFileSync(BOARD, "utf8"));
const card = (board.cards ?? []).find((c) => c && c.id === CARD_ID);

if (!card) {
  console.error(`check-perf-baseline: ${CARD_ID} is not on docs/board/rc-board-phase3.json.`);
  process.exit(1);
}

// --- 1. nothing to enforce until the card claims to be finished -------------
if (card.status !== "shipped") {
  console.log(
    `CHECK 1 ${CARD_ID}: status is "${card.status}", not "shipped". The baseline is required at shipped, so there is nothing to enforce yet.`,
  );
  console.log("");
  console.log("check-perf-baseline: card not shipped, nothing to check.");
  process.exit(0);
}
console.log(`CHECK 1 ${CARD_ID}: status is "shipped", so acceptance (e) applies.`);

const notes = typeof card.notes === "string" ? card.notes : "";
const lines = notes.split(/\r?\n/).map((l) => l.trim());

// --- 2. exactly six report lines, one per section, in order -----------------
const raport = lines.filter((l) => LINIE.test(l));

if (raport.length !== 6) {
  fail(
    `CHECK 2 six numbers: the notes carry ${raport.length} report line(s) of the form "<sectiune> p75=<ms>ms n=<count>", and acceptance (e) requires six. A card set shipped with an empty baseline has not met (e).`,
  );
} else {
  const nume = raport.map((l) => LINIE.exec(l)[1]);
  const asteptate = SECTIUNI.join(", ");
  if (nume.join(", ") !== asteptate) {
    fail(
      `CHECK 2 six numbers: the notes name "${nume.join(", ")}" and the six sections in report order are "${asteptate}".`,
    );
  } else {
    console.log(`CHECK 2 six numbers: OK, six report lines, one per section, in order.`);
  }
}

// --- 3. the numbers are measurements and not placeholders -------------------
// A zero is not a transition time; it is a line someone typed to satisfy the
// shape of the check. Same for a run of zero navigations.
for (const l of raport) {
  const [, sectiune, ms, n] = LINIE.exec(l);
  if (Number(ms) < 1) {
    fail(`CHECK 3 real numbers: "${sectiune}" records p75=${ms}ms. Zero is not a measured route transition.`);
  }
  if (Number(n) < 1) {
    fail(`CHECK 3 real numbers: "${sectiune}" records n=${n}. A percentile of nothing is not a percentile.`);
  }
}
if (!failures.some((m) => m.startsWith("CHECK 3"))) {
  console.log("CHECK 3 real numbers: OK, every p75 and every count is at least one.");
}

// --- 4. no Rapoarte line ----------------------------------------------------
if (/Rapoarte\s+p75=/.test(notes)) {
  fail(
    "CHECK 4 no Rapoarte: the notes carry a Rapoarte report line. There is no Rapoarte route, so any number for it was measured against a page that does not exist.",
  );
} else {
  console.log("CHECK 4 no Rapoarte: OK, no number is recorded for a route that does not exist.");
}

// --- 5. the provenance sits beside the numbers ------------------------------
for (const eticheta of ETICHETE) {
  const linie = lines.find((l) => l.startsWith(`${eticheta}:`));
  const continut = linie ? linie.slice(eticheta.length + 1).trim() : "";
  if (continut.length < 3) {
    fail(
      `CHECK 5 provenance: the notes carry no "${eticheta}: <value>" line with content. Acceptance (e) requires the run identifier, the fixture seed and the run date beside the six numbers, and the kind of run that produced them.`,
    );
  }
}
if (!failures.some((m) => m.startsWith("CHECK 5"))) {
  console.log(`CHECK 5 provenance: OK, ${ETICHETE.join(", ")} are all present with content.`);
}

// --- 6. the date is a date --------------------------------------------------
const dataLinie = lines.find((l) => l.startsWith("DATA:")) ?? "";
if (!/\b\d{4}-\d{2}-\d{2}\b/.test(dataLinie)) {
  fail('CHECK 6 run date: the "DATA:" line carries no YYYY-MM-DD date.');
} else {
  console.log("CHECK 6 run date: OK, the run date is written as YYYY-MM-DD.");
}

console.log("");
if (failures.length > 0) {
  console.error(`check-perf-baseline: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error("");
  console.error(
    `Read the six lines out of the "${"-".repeat(5)} P3-117 BASELINE ${"-".repeat(5)}" block in this job's own log, written by the step that ran npm run perf:sections, and put them in ${CARD_ID}'s notes with FELUL RULARII, RULARE, SAMANTA and DATA beside them.`,
  );
  process.exit(1);
}
console.log(`check-perf-baseline: 6 checks passed. ${CARD_ID} carries a recorded baseline.`);
process.exit(0);
