#!/bin/bash
#
# AUT-16. THE BOARD SET IS THE UNION OF THE BOARDS, IN EVERY COMPONENT.
#
# Three components each held their own hardcoded path to docs/board/rc-board-phase2.json
# while every run since 2026-08-30 worked the phase 3 board:
#
#   1. the ANSWER CHANNEL. scripts/poc/inbox.mjs built its known-card set from
#      that one path, so `R P3-27 default` came back "no card P3-27 on the
#      board". P3-27 was the oldest unanswered question in the repository. The
#      owner could not have answered it from his phone if he had tried.
#   2. the DIGEST. plain-digest.mjs counted shipped cards and read the launch
#      gate off that one board, so twelve phase 3 cards shipped since
#      2026-08-30 were invisible and one gate figure silently meant the first.
#   3. ELIGIBILITY AND CLAIMS. eligible.mjs, run.sh and claim.sh computed
#      against a board nobody was working, which is how a claim on AUT-10 came
#      to be written at the end of a run that spent its time on P3-11.
#
# Each half below runs the REAL function, never a copy of it, and each has a
# failing case built from the world before this card: one board where there
# should be two. A test that only proves the new behaviour cannot notice a
# repoint back to a single board, which is the regression this file exists for.
#
set -u -o pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
cd "$REPO_ROOT" || { echo "FATAL: cannot enter $REPO_ROOT"; exit 1; }

PASSED=0
FAILED=0

pass() { PASSED=$((PASSED + 1)); echo "PASS  $1"; }
fail() { FAILED=$((FAILED + 1)); echo "FAIL  $1"; [ $# -gt 1 ] && echo "      got: $2"; }

WORK=$(mktemp -d /tmp/aut16.XXXXXX)
trap 'rm -rf "$WORK"' EXIT

echo "=== AUT-16: the board set is read from one place and every component resolves against it"
echo

# ---------------------------------------------------------------------------
# 0. THE SET IS DEFINED ONCE.
# ---------------------------------------------------------------------------
SET_PATHS=$(node scripts/poc/boards.mjs --paths)
SET_COUNT=$(echo "$SET_PATHS" | grep -c . )
if [ "$SET_COUNT" -ge 2 ]; then
  pass "the board set names $SET_COUNT boards"
else
  fail "the board set names at least two boards" "$SET_PATHS"
fi

# Phase 3 first, per the card's defaults and R-061's stated priority.
if [ "$(echo "$SET_PATHS" | head -1)" = "docs/board/rc-board-phase3.json" ]; then
  pass "phase 3 is first in the set"
else
  fail "phase 3 is first in the set" "$(echo "$SET_PATHS" | head -1)"
fi

# NO SECOND HARDCODED PATH. The point of the card is that a fourth board is a
# one-line change, which is only true while nothing else names a board file.
STRAY=$(grep -n "rc-board-phase[23]\.json" \
  scripts/poc/run.sh scripts/poc/inbox.mjs scripts/poc/notify.mjs \
  scripts/poc/plain-digest.mjs scripts/poc/digest.mjs scripts/poc/digest.sh \
  scripts/poc/eligible.mjs scripts/poc/claim.sh 2>/dev/null \
  | grep -v "^\S*:[0-9]*:#" | grep -v "^\S*:[0-9]*://" | grep -v "^\S*:[0-9]*: *[*#]")
if [ -z "$STRAY" ]; then
  pass "no live component names a board file outside boards.mjs"
else
  fail "no live component names a board file outside boards.mjs" "$STRAY"
fi

# An id on two boards is a board defect and must fail loudly rather than resolve
# to one of them.
DUPE=$(node -e '
  import("./scripts/poc/boards.mjs").then((m) => {
    const real = m.loadBoards();
    const clone = { relative: "fixture", label: "fixture", board: { cards: [{ id: real[0].board.cards[0].id }] } };
    try {
      m.cardIndex(real.concat([clone]));
      console.log("RESOLVED-ANYWAY");
    } catch (err) {
      console.log("REFUSED: " + err.message);
    }
  });
')
case "$DUPE" in
  REFUSED:*more\ than\ one\ board*) pass "one id on two boards is refused, not silently resolved" ;;
  *) fail "one id on two boards is refused, not silently resolved" "$DUPE" ;;
esac

echo

# ---------------------------------------------------------------------------
# 1. THE ANSWER CHANNEL.
#
# The real classifier in scripts/poc/inbox.mjs, resolving against the real board
# set. --classify-boards builds the world before this card, one board, and that
# is the failing case: the same message, the same code, refused.
# ---------------------------------------------------------------------------
OWNER=424242

classify() {
  node scripts/poc/inbox.mjs --classify "$1" --classify-from "$OWNER" --classify-owner "$OWNER" ${2:+--classify-boards "$2"}
}

V=$(classify "R P3-27 default")
if echo "$V" | grep -q '"accepted":true' && echo "$V" | grep -q '"cardId":"P3-27"'; then
  pass "R P3-27 default is accepted and returns P3-27"
else
  fail "R P3-27 default is accepted and returns P3-27" "$V"
fi

V=$(classify "R P3-27: some text")
if echo "$V" | grep -q '"accepted":true' && echo "$V" | grep -q '"cardId":"P3-27"' && echo "$V" | grep -q '"text":"some text"'; then
  pass "R P3-27: some text is accepted and returns P3-27"
else
  fail "R P3-27: some text is accepted and returns P3-27" "$V"
fi

V=$(classify "R NOPE-99 default")
if echo "$V" | grep -q '"accepted":false' && echo "$V" | grep -q 'NOPE-99'; then
  pass "R NOPE-99 default is still refused, with a reason naming the id"
else
  fail "R NOPE-99 default is still refused, with a reason naming the id" "$V"
fi

# A lower-case suffix, resolved through the ID INDEX rather than through the
# message form. The index is what this card owns, and it folds both sides so a
# lower-cased id typed from a phone lands on the board's own spelling.
#
# NOT ASSERTED HERE, AND DELIBERATELY: `R p3-04b default` is still refused by
# the accepted-form regex at inbox.mjs, which reads [A-Za-z0-9]+-[0-9]+ and
# therefore stops at the digits. That is a defect in how the two accepted forms
# are expressed, it predates this card, and this card's defaults say in terms
# that the reader does not get wider here. It is written up in docs/LEARNINGS.md
# and belongs to a card of its own rather than to a quiet extra commit.
SPELLING=$(node -e '
  import("./scripts/poc/boards.mjs").then((m) => {
    const index = m.cardIndex(m.loadBoards());
    const hit = index.get("P3-04B");
    console.log(hit ? hit.card.id : "NOT-FOUND");
  });
')
if [ "$SPELLING" = "P3-04b" ]; then
  pass "a folded id resolves to the board's own spelling"
else
  fail "a folded id resolves to the board's own spelling" "$SPELLING"
fi

# THE FAILING CASE, RUN AND NOT DESCRIBED.
V=$(classify "R P3-27 default" "docs/board/rc-board-phase2.json")
if echo "$V" | grep -q '"accepted":false' && echo "$V" | grep -q 'no card P3-27 on the board'; then
  pass "with one board the same message is refused: this is the defect, reproduced"
else
  fail "with one board the same message is refused" "$V"
fi

echo

# ---------------------------------------------------------------------------
# 2. THE DIGEST.
#
# A fixture PAIR of boards. The card that shipped exists only on the second, and
# each board reports its own launch gate figure. Two gates are never summed:
# 1 of 9 and 0 of 4 is not 1 of 13.
# ---------------------------------------------------------------------------
cat > "$WORK/board-one.json" <<'JSON'
{
  "board": "fixture one",
  "as_of": "2026-09-04T00:00:00Z",
  "launch_gate": { "readiness_passed": 1, "denominator": 9, "conditions": [] },
  "cards": [
    { "id": "AAA-01", "status": "shipped", "title": "one", "plain": "The first fixture task is finished.", "depends_on": [], "blocked_on": null, "last_checkpoint": "2026-09-01" }
  ]
}
JSON
cat > "$WORK/board-two.json" <<'JSON'
{
  "board": "fixture two",
  "as_of": "2026-09-04T00:00:00Z",
  "launch_gate": { "readiness_passed": 0, "denominator": 4, "conditions": [] },
  "cards": [
    { "id": "ZZZ-09", "status": "shipped", "title": "two", "plain": "The second list's own task is finished.", "depends_on": [], "blocked_on": null, "last_checkpoint": "2026-09-01" },
    { "id": "ZZZ-10", "status": "todo", "title": "three", "plain": "A task on the second list that has not started.", "depends_on": [], "blocked_on": null, "last_checkpoint": "2026-09-01" }
  ]
}
JSON

DIGEST=$(node -e '
  const fs = require("fs");
  const [one, two] = process.argv.slice(1);
  import("./scripts/poc/plain-digest.mjs").then((m) => {
    const set = [
      { relative: one, label: "the first list", board: JSON.parse(fs.readFileSync(one, "utf8")) },
      { relative: two, label: "the second list", board: JSON.parse(fs.readFileSync(two, "utf8")) },
    ];
    // ZZZ-09 exists ONLY on the second board. Before this card the digest could
    // not name it, because byId was built from one board.
    console.log(m.buildPlainDigest(set, {}, { cards: "ZZZ-09:shipped" }).text);
  });
' "$WORK/board-one.json" "$WORK/board-two.json")

if echo "$DIGEST" | grep -q "The second list's own task is finished"; then
  pass "the digest names a shipped card that exists only on the second board"
else
  fail "the digest names a shipped card that exists only on the second board" "$DIGEST"
fi

if echo "$DIGEST" | grep -q "1 of 9 launch conditions met" && echo "$DIGEST" | grep -q "0 of 4 launch conditions met"; then
  pass "each board reports its own launch gate figure"
else
  fail "each board reports its own launch gate figure" "$DIGEST"
fi

if echo "$DIGEST" | grep -q "1 of 13"; then
  fail "the two gates are not summed" "$DIGEST"
else
  pass "the two gates are not summed"
fi

# THE FAILING CASE. One board, the old world: the shipped card on the second
# board cannot be named and only the first gate is reported.
DIGEST_OLD=$(node -e '
  const fs = require("fs");
  const [one] = process.argv.slice(1);
  import("./scripts/poc/plain-digest.mjs").then((m) => {
    const board = JSON.parse(fs.readFileSync(one, "utf8"));
    console.log(m.buildPlainDigest(board, {}, { cards: "ZZZ-09:shipped" }).text);
  });
' "$WORK/board-one.json")
if echo "$DIGEST_OLD" | grep -q "The second list's own task is finished"; then
  fail "with one board the second board's shipped card is invisible" "$DIGEST_OLD"
else
  pass "with one board the second board's shipped card is invisible: the defect, reproduced"
fi
if echo "$DIGEST_OLD" | grep -q "0 of 4 launch conditions met"; then
  fail "with one board only the first gate is reported" "$DIGEST_OLD"
else
  pass "with one board only the first gate is reported: the defect, reproduced"
fi

echo

# ---------------------------------------------------------------------------
# 3. ELIGIBILITY AND CLAIMS.
#
# A fixture where the LOWEST-ID eligible card is on the SECOND board, and the
# selector must still return the first board's cards first: the lowest-id rule
# is within a board, because two id namespaces do not sort against each other.
# ---------------------------------------------------------------------------
cat > "$WORK/elig-one.json" <<'JSON'
{
  "board": "fixture one",
  "as_of": "2026-09-04T00:00:00Z",
  "launch_gate": { "readiness_passed": 0, "denominator": 9, "conditions": [] },
  "cards": [
    { "id": "MMM-05", "status": "todo", "title": "first board card", "plain": "A task on the first list.", "depends_on": [], "blocked_on": null, "last_checkpoint": "2026-09-01" }
  ]
}
JSON
cat > "$WORK/elig-two.json" <<'JSON'
{
  "board": "fixture two",
  "as_of": "2026-09-04T00:00:00Z",
  "launch_gate": { "readiness_passed": 0, "denominator": 9, "conditions": [] },
  "cards": [
    { "id": "AAA-01", "status": "todo", "title": "second board card, lowest id of all", "plain": "A task on the second list.", "depends_on": [], "blocked_on": null, "last_checkpoint": "2026-09-01" },
    { "id": "BBB-02", "status": "todo", "title": "second board, depends on the first board", "plain": "A task that needs the first list's task.", "depends_on": ["MMM-05"], "blocked_on": null, "last_checkpoint": "2026-09-01" }
  ]
}
JSON

IDS=$(node scripts/poc/eligible.mjs --board "$WORK/elig-one.json $WORK/elig-two.json" --actor harness --ids)
if [ "$IDS" = "MMM-05,AAA-01" ]; then
  pass "the selector resolves against both boards, first board first, id order within a board"
else
  fail "the selector resolves against both boards, first board first" "$IDS"
fi

# THE FAILING CASE: one board sees one card and cannot see AAA-01 at all.
IDS_OLD=$(node scripts/poc/eligible.mjs --board "$WORK/elig-one.json" --actor harness --ids)
if [ "$IDS_OLD" = "MMM-05" ]; then
  pass "with one board the second board's eligible card is invisible: the defect, reproduced"
else
  fail "with one board the second board's eligible card is invisible" "$IDS_OLD"
fi

# A dependency that lives on the OTHER board resolves, rather than reading as
# unshipped forever.
cat > "$WORK/elig-one-shipped.json" <<'JSON'
{
  "board": "fixture one",
  "as_of": "2026-09-04T00:00:00Z",
  "launch_gate": { "readiness_passed": 0, "denominator": 9, "conditions": [] },
  "cards": [
    { "id": "MMM-05", "status": "shipped", "title": "first board card", "plain": "A task on the first list.", "depends_on": [], "blocked_on": null, "last_checkpoint": "2026-09-01" }
  ]
}
JSON
IDS_CROSS=$(node scripts/poc/eligible.mjs --board "$WORK/elig-one-shipped.json $WORK/elig-two.json" --actor harness --ids)
if [ "$IDS_CROSS" = "AAA-01,BBB-02" ]; then
  pass "a dependency shipped on the other board unblocks its card"
else
  fail "a dependency shipped on the other board unblocks its card" "$IDS_CROSS"
fi

# A claim on a card on the SECOND board is honoured, and the id is written in
# the board's own spelling rather than folded to upper case.
cat > "$WORK/state.json" <<'JSON'
{ "schema_version": 2, "claims": { "AAA-01": { "claimed_by": "executor", "claimed_at": "REPLACE" } } }
JSON
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sed -i '' "s/REPLACE/$NOW_ISO/" "$WORK/state.json" 2>/dev/null || sed -i "s/REPLACE/$NOW_ISO/" "$WORK/state.json"

IDS_CLAIMED=$(node scripts/poc/eligible.mjs --board "$WORK/elig-one.json $WORK/elig-two.json" --state "$WORK/state.json" --actor harness --ids)
if [ "$IDS_CLAIMED" = "MMM-05" ]; then
  pass "a claim on a card on the second board is honoured by the selector"
else
  fail "a claim on a card on the second board is honoured by the selector" "$IDS_CLAIMED"
fi

# The claim WRITER resolves against the union and refuses an id on no board.
CLAIM_OUT=$(scripts/poc/claim.sh check P3-27 2>&1)
if echo "$CLAIM_OUT" | grep -q "^P3-27 is "; then
  pass "the claim writer resolves a phase 3 card id"
else
  fail "the claim writer resolves a phase 3 card id" "$CLAIM_OUT"
fi

CLAIM_OUT=$(scripts/poc/claim.sh check p3-04b 2>&1)
if echo "$CLAIM_OUT" | grep -q "^P3-04b is "; then
  pass "the claim writer writes the board's own spelling, not a folded id"
else
  fail "the claim writer writes the board's own spelling, not a folded id" "$CLAIM_OUT"
fi

CLAIM_OUT=$(scripts/poc/claim.sh check NOPE-99 2>&1)
CLAIM_RC=$?
if [ "$CLAIM_RC" -ne 0 ] && echo "$CLAIM_OUT" | grep -q "NOPE-99"; then
  pass "the claim writer refuses an id on no board, and names it"
else
  fail "the claim writer refuses an id on no board, and names it" "$CLAIM_OUT (exit $CLAIM_RC)"
fi

# A claim already in the file under the old folded spelling still matches.
cat > "$WORK/state-folded.json" <<'JSON'
{ "schema_version": 2, "claims": { "P3-04B": { "claimed_by": "executor", "claimed_at": "REPLACE" } } }
JSON
sed -i '' "s/REPLACE/$NOW_ISO/" "$WORK/state-folded.json" 2>/dev/null || sed -i "s/REPLACE/$NOW_ISO/" "$WORK/state-folded.json"
FOLDED=$(node -e '
  import("./scripts/poc/eligible.mjs").then((m) => {
    const state = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const claim = m.claimFor("P3-04b", state, Math.floor(Date.now() / 1000));
    console.log(claim ? claim.claimed_by : "NOT-FOUND");
  });
' "$WORK/state-folded.json")
if [ "$FOLDED" = "executor" ]; then
  pass "a claim stored under the old folded spelling is still found"
else
  fail "a claim stored under the old folded spelling is still found" "$FOLDED"
fi

echo

# ---------------------------------------------------------------------------
# 4. THE SHELL STILL PARSES.
# ---------------------------------------------------------------------------
for SCRIPT in scripts/poc/run.sh scripts/poc/digest.sh scripts/poc/claim.sh; do
  if bash -n "$SCRIPT" 2>/dev/null; then
    pass "bash -n $SCRIPT"
  else
    fail "bash -n $SCRIPT"
  fi
done

echo
echo "board set: $PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ] || exit 1
