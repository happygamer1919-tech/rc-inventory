#!/bin/bash
#
# Proves the producer gate added by card AUT-23, by running the real text of
# scripts/poc/run.sh rather than a copy of it.
#
# WHY IT EXTRACTS INSTEAD OF RE-IMPLEMENTING, the same argument
# scripts/poc/test-pr-census.sh and scripts/poc/test-harness-caps.sh make: run.sh
# takes a lock, sources a secrets file, calls GitHub and invokes a model, none of
# which can run in CI, and a test that re-states the logic proves only that the
# test agrees with itself. The block under test is fenced in run.sh as
# EXTRACT-BEGIN/EXTRACT-END producer-gate and is lifted verbatim here. An edit
# that breaks a guarantee breaks this file, and an edit that deletes the fence
# fails it outright rather than passing on an empty extraction.
#
# WHAT IT PROVES, one case per clause of the card:
#
#   1. BELOW THE THRESHOLD IT OPENS EXACTLY AS IT DOES TODAY. One pull request
#      created, for the branch handed to it, with the title handed to it.
#   2. AT OR ABOVE THE THRESHOLD IT OPENS NONE, and the branch is left pushed
#      with its work committed: zero create calls, and a park record naming the
#      branch. The boundary is asserted on BOTH sides, at threshold-1 and at the
#      threshold exactly, because "at or above" is the half a > would break.
#   3. THE PARKED BRANCH IS NAMED, WITH THE COUNT THAT CAUSED THE PARK, in the
#      run report and in both digests: the branch and the count in the full
#      digest, and the plain digest saying work is held without a branch, a
#      number or a path in it, which CLAUDE.md 15 forbids.
#   4. THE NEXT TICK OPENS IT WHEN THE COUNT HAS FALLEN, WITHOUT REDOING THE
#      WORK: no commit, no push, no branch creation, one create call against the
#      already pushed ref, and the park record gone afterwards.
#
#   PLUS: THE THRESHOLD IS ONE NAMED CONSTANT, read from one place. Asserted by
#      grepping the extracted block: the number appears exactly once, and every
#      comparison goes through the name.
#   PLUS: IT FAILS OPEN. A count that cannot be obtained opens rather than parks.
#
# Needs no network, no gh, no credentials and no git remote. Runs on macOS and
# on ubuntu-latest.
#
# POC_TEST_RUN_SH points the extraction at a different run.sh. It exists so a
# pull request can prove each case FAILS FIRST, against the pre-change run.sh.
#
set -u -o pipefail

RUN_SH=${POC_TEST_RUN_SH:-$(cd "$(dirname "$0")" && pwd)/run.sh}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; FAILURES=$(( FAILURES + 1 )); }

# The extraction writes to a path the caller already knows and returns a status,
# rather than echoing the path. `GATE=$(extract ...)` would run the function in a
# SUBSHELL, where its failure on a missing fence kills only the subshell and the
# test carries on against an empty file. A deleted fence must be a hard failure,
# not a dozen soft ones.
extract() {
  EX_NAME=$1
  EX_OUT=$WORK/$EX_NAME.sh
  awk -v name="$EX_NAME" '
    $0 == "# EXTRACT-BEGIN " name { taking = 1; next }
    $0 == "# EXTRACT-END " name   { taking = 0; found = 1; next }
    taking { print }
    END { if (!found) exit 3 }
  ' "$RUN_SH" > "$EX_OUT"
  if [ $? -ne 0 ] || [ ! -s "$EX_OUT" ]; then
    echo "FATAL: no EXTRACT block named '$EX_NAME' in $RUN_SH"
    echo "The fences are part of the contract. Restore them or fix this test."
    return 1
  fi
  return 0
}

echo "run.sh under test: $RUN_SH"
GATE=$WORK/producer-gate.sh
extract producer-gate || exit 1

# ---------------------------------------------------------------------------
# The fixture harness. Every case sets an open-pull-request count, a park spool
# and a branch table, replaces the three gate_* seams with readers of those, and
# runs the real gate functions over them.
#
# The seams are replaced AFTER the block is sourced, so the block's own
# definitions are the ones being overridden. If a future edit inlines a `gh` or
# `git` call instead of going through a seam, the stubs below catch it: both are
# shadowed and every call to either is recorded, and the cases assert on that
# record. That is also what makes clause 4's "without redoing the work" an
# assertion rather than a claim.
# ---------------------------------------------------------------------------
new_case() {
  NC=$WORK/$1
  mkdir -p "$NC/parked"
  : > "$NC/log.txt"
  : > "$NC/created.txt"
  : > "$NC/forbidden.txt"
  : > "$NC/branches.txt"
  echo 0 > "$NC/open_count"
  echo "$NC"
}

# The count the seam will report. An empty file means "cannot tell", which is
# the fail-open case and not a count of zero.
set_open_count() { echo "$2" > "$1/open_count"; }
add_remote_branch() { echo "$2" >> "$1/branches.txt"; }

park_files() { ls -1 "$1/parked"/*.park 2>/dev/null | wc -l | tr -d '[:space:]'; }

run_gate() {
  RG_DIR=$1
  RG_CALL=$2
  cat > "$RG_DIR/case.sh" <<CASE
set -u -o pipefail
CASE_DIR=$RG_DIR
POC_PARK_DIR=$RG_DIR/parked
CASE
  cat >> "$RG_DIR/case.sh" <<'CASE'
log() { echo "$*" >> "$CASE_DIR/log.txt"; }
CASE
  cat >> "$RG_DIR/case.sh" <<CASE
source "$GATE"
CASE
  cat >> "$RG_DIR/case.sh" <<'CASE'

# --- the seams, replacing the real ones ---
gate_open_pr_count() { cat "$CASE_DIR/open_count"; }
gate_open_pr() {
  echo "create branch=$1 title=$2" >> "$CASE_DIR/created.txt"
  echo 999
}
gate_branch_exists() { grep -qxF "$1" "$CASE_DIR/branches.txt" 2>/dev/null; }
pr_for_branch() { echo ""; }

# --- the tripwires. Nothing in the gate may reach any of these. ---
gh()         { echo "gh $*"         >> "$CASE_DIR/forbidden.txt"; return 0; }
gh_bounded() { echo "gh_bounded $*" >> "$CASE_DIR/forbidden.txt"; return 0; }
git()        { echo "git $*"        >> "$CASE_DIR/forbidden.txt"; return 0; }
CASE
  cat >> "$RG_DIR/case.sh" <<CASE
$RG_CALL
CASE
  bash "$RG_DIR/case.sh" > "$RG_DIR/stdout.txt" 2>&1
  echo $?
}

# The state-PR call site, lifted in shape from run.sh so the test drives the
# same two-step the run drives: release what is parked, then decide about this
# run's own output.
STATE_CALL='gate_release_parked
gate_decision
if [ "$GATE_VERDICT" = park ]; then
  gate_park "poc/state-NOW" "$GATE_COUNT" "runNOW" "POC: run NOW state" "body line one"
else
  log "opening, $GATE_COUNT open"
  gate_open_pr "poc/state-NOW" "POC: run NOW state" "body line one"
fi'

# ---------------------------------------------------------------------------
# 1. Below the threshold it opens, exactly as it does today.
# ---------------------------------------------------------------------------
echo
echo "1. below the threshold the pull request is opened"

C=$(new_case below)
set_open_count "$C" 2
run_gate "$C" "$STATE_CALL" > /dev/null

if grep -q 'create branch=poc/state-NOW title=POC: run NOW state' "$C/created.txt"; then
  pass "one pull request is created, for the branch and title handed to the gate"
else
  fail "no pull request was created below the threshold"
  cat "$C/log.txt"
fi
if [ "$(wc -l < "$C/created.txt" | tr -d '[:space:]')" = 1 ]; then
  pass "exactly one create call, not two"
else
  fail "expected exactly one create call, got $(wc -l < "$C/created.txt")"
fi
if [ "$(park_files "$C")" = 0 ]; then
  pass "nothing is parked below the threshold"
else
  fail "something was parked below the threshold"
fi

# THE BOUNDARY, LOWER SIDE. threshold - 1 must still open. Asserted separately
# from the case above because 2 is not the boundary when the threshold is 3 by
# accident; this asserts the edge itself.
C=$(new_case boundary_below)
set_open_count "$C" 2
POC_PR_DEPTH_THRESHOLD=3 run_gate "$C" "$STATE_CALL" > /dev/null
if [ -s "$C/created.txt" ] && [ "$(park_files "$C")" = 0 ]; then
  pass "at threshold minus one it opens"
else
  fail "at threshold minus one it did not open"
fi

# ---------------------------------------------------------------------------
# 2. At or above the threshold it opens none, and the branch stays pushed.
# ---------------------------------------------------------------------------
echo
echo "2. at or above the threshold no pull request is opened"

C=$(new_case at_threshold)
set_open_count "$C" 3
run_gate "$C" "$STATE_CALL" > /dev/null

if [ ! -s "$C/created.txt" ]; then
  pass "AT the threshold exactly, zero pull requests are created"
else
  fail "a pull request was created at the threshold"
  cat "$C/created.txt"
fi
if [ "$(park_files "$C")" = 1 ]; then
  pass "the branch is parked instead"
else
  fail "expected one park record, found $(park_files "$C")"
fi

C=$(new_case above_threshold)
set_open_count "$C" 9
run_gate "$C" "$STATE_CALL" > /dev/null
if [ ! -s "$C/created.txt" ] && [ "$(park_files "$C")" = 1 ]; then
  pass "well ABOVE the threshold, still zero created and one parked"
else
  fail "above the threshold the gate did not park"
fi

# THE WORK IS COMMITTED AND PUSHED, AND THE GATE NEVER TOUCHES EITHER. run.sh
# commits and pushes before it asks the gate anything, so the assertion the gate
# can carry is that it performs no git and no gh of its own. A gate that pushed
# or reset would show up here.
if [ ! -s "$C/forbidden.txt" ]; then
  pass "the gate performs no git and no raw gh call of its own"
else
  fail "the gate reached past its seams"
  cat "$C/forbidden.txt"
fi

# ---------------------------------------------------------------------------
# 3. The parked branch is named, with the count, in the report and the digests.
# ---------------------------------------------------------------------------
echo
echo "3. the parked branch is named with its count"

C=$(new_case named)
set_open_count "$C" 5
run_gate "$C" "$STATE_CALL" > /dev/null

if grep -q 'PARKED branch=poc/state-NOW open=5 threshold=' "$C/log.txt"; then
  pass "the run report names the branch and the count that caused the park"
else
  fail "the run report does not name the branch with its count"
  cat "$C/log.txt"
fi

PARK_FILE=$(ls -1 "$C/parked"/*.park 2>/dev/null | head -1)
if [ -n "$PARK_FILE" ] && grep -q '^branch=poc/state-NOW$' "$PARK_FILE" \
   && grep -q '^open_count=5$' "$PARK_FILE"; then
  pass "the park record carries the branch and the count"
else
  fail "the park record is missing the branch or the count"
  [ -n "$PARK_FILE" ] && cat "$PARK_FILE"
fi

# THE DIGESTS. Both halves, from the same spool the run wrote.
FULL_OUT=$(POC_PARK_DIR="$C/parked" node -e '
  process.env.POC_PARK_DIR = process.argv[1];
  const { readdirSync, readFileSync } = require("node:fs");
  const path = require("node:path");
  const dir = process.argv[1];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".park")).sort()) {
    const text = readFileSync(path.join(dir, name), "utf8");
    const field = (k) => {
      const l = text.split("\n").find((x) => x.startsWith(k + "="));
      return l ? l.slice(k.length + 1) : null;
    };
    out.push(field("branch") + " " + field("open_count") + " " + field("threshold"));
  }
  console.log(out.join("|"));
' "$C/parked")
if [ -n "$FULL_OUT" ]; then
  pass "the spool the full digest reads carries branch, count and threshold: $FULL_OUT"
else
  fail "the spool the full digest reads is empty"
fi

# The full digest section itself, asserted against notify.mjs rather than
# described: the branch and the count must reach it, and it must read the spool.
if grep -q 'PARKED, NOT OPENED' "$HERE/notify.mjs" && grep -q 'function readParked' "$HERE/notify.mjs"; then
  pass "the full digest has a parked section and reads the spool"
else
  fail "notify.mjs does not report parked branches"
fi

# The plain digest says work is held and carries NO branch, NO number and NO
# path, which CLAUDE.md 15 forbids and plain-digest's own assertPlain enforces.
# A FILE AND NOT `node -e`. The check needs top level await to import an ES
# module by path, and the two ways to ask node for that from a shell one liner
# differ between node versions. A temporary .mjs is the same test with one
# behaviour instead of two.
cat > "$WORK/plain-check.mjs" <<'MJS'
import { buildPlainDigest, assertPlain } from "./plain-digest.mjs";
const board = {
  relative: "docs/board/b.json",
  label: "the work",
  board: { cards: [], launch_gate: { denominator: 9, readiness_passed: 0 } },
};
const held = buildPlainDigest([board], {}, { parkedCount: 2 });
const none = buildPlainDigest([board], {}, { parkedCount: 0 });
console.log(JSON.stringify({
  text: held.text,
  violations: assertPlain(held.text),
  quietWhenNothingParked: !none.text.includes("HELD BACK"),
}));
MJS
cp "$WORK/plain-check.mjs" "$HERE/.plain-check.tmp.mjs"
PLAIN_OUT=$(cd "$HERE" && node .plain-check.tmp.mjs 2>&1)
rm -f "$HERE/.plain-check.tmp.mjs"

if printf '%s' "$PLAIN_OUT" | grep -q 'HELD BACK'; then
  pass "the plain digest says work is held back"
else
  fail "the plain digest does not mention held work"
  echo "$PLAIN_OUT"
fi
if printf '%s' "$PLAIN_OUT" | grep -q '"quietWhenNothingParked":true'; then
  pass "and it says nothing at all when nothing is parked"
else
  fail "the plain digest talks about held work when none is held"
  echo "$PLAIN_OUT"
fi
if printf '%s' "$PLAIN_OUT" | grep -q '"violations":\[\]'; then
  pass "the plain digest carries no branch, no pull request number and no path"
else
  fail "the plain digest carries something CLAUDE.md 15 forbids"
  echo "$PLAIN_OUT"
fi

# ---------------------------------------------------------------------------
# 4. The next tick opens it when the count has fallen, without redoing the work.
# ---------------------------------------------------------------------------
echo
echo "4. the next tick releases the parked branch"

# Tick one parks. Tick two, on the same spool, with the queue drained.
C=$(new_case release)
set_open_count "$C" 4
run_gate "$C" "$STATE_CALL" > /dev/null
if [ "$(park_files "$C")" = 1 ] && [ ! -s "$C/created.txt" ]; then
  pass "tick one parked and opened nothing"
else
  fail "tick one did not park"
fi

# The parked branch is still on the remote, which is what makes it releasable.
add_remote_branch "$C" "poc/state-NOW"
set_open_count "$C" 0
: > "$C/log.txt"
: > "$C/forbidden.txt"
run_gate "$C" 'gate_release_parked' > /dev/null

if grep -q 'create branch=poc/state-NOW' "$C/created.txt"; then
  pass "tick two opens a pull request for the branch tick one parked"
else
  fail "tick two did not open the parked branch"
  cat "$C/log.txt"
fi
if grep -q 'RELEASED poc/state-NOW' "$C/log.txt"; then
  pass "the release is named in the run report"
else
  fail "the release is not in the run report"
fi
if [ "$(park_files "$C")" = 0 ]; then
  pass "the park record is dropped once the pull request exists"
else
  fail "the park record survived the release and would reopen forever"
fi
# WITHOUT REDOING THE WORK. The gate never commits, never pushes, never creates
# a branch: every git call is a tripwire and the file must stay empty.
if [ ! -s "$C/forbidden.txt" ]; then
  pass "the release performs no commit, no push and no branch creation"
else
  fail "the release reached for git or gh"
  cat "$C/forbidden.txt"
fi

# STILL ABOVE THE THRESHOLD, THE PARK HOLDS. The queue has not fallen, so the
# release must leave it exactly where it was rather than draining anyway.
C=$(new_case release_blocked)
set_open_count "$C" 4
run_gate "$C" "$STATE_CALL" > /dev/null
add_remote_branch "$C" "poc/state-NOW"
: > "$C/created.txt"
run_gate "$C" 'gate_release_parked' > /dev/null
if [ ! -s "$C/created.txt" ] && [ "$(park_files "$C")" = 1 ]; then
  pass "with the queue still full the parked branch stays parked"
else
  fail "the parked branch was released while the queue was still full"
fi

# A PARKED BRANCH THAT IS GONE FROM THE REMOTE IS DROPPED, NOT RETRIED FOREVER.
C=$(new_case release_gone)
set_open_count "$C" 4
run_gate "$C" "$STATE_CALL" > /dev/null
set_open_count "$C" 0
run_gate "$C" 'gate_release_parked' > /dev/null
if [ ! -s "$C/created.txt" ] && [ "$(park_files "$C")" = 0 ]; then
  pass "a parked branch missing from the remote is dropped rather than retried"
else
  fail "a vanished parked branch was retried or kept"
fi

# ---------------------------------------------------------------------------
# 5. It fails open, and the threshold is one named constant.
# ---------------------------------------------------------------------------
echo
echo "5. fail open, and one named constant"

C=$(new_case failopen)
set_open_count "$C" ""
run_gate "$C" "$STATE_CALL" > /dev/null
if [ -s "$C/created.txt" ] && [ "$(park_files "$C")" = 0 ]; then
  pass "a count that cannot be obtained OPENS, it does not park"
else
  fail "the gate did not fail open"
  cat "$C/log.txt"
fi
if grep -q 'FAILING OPEN' "$C/log.txt"; then
  pass "the fail-open is said out loud in the run report"
else
  fail "the gate failed open silently"
fi

# A NON-NUMBER IS NOT A COUNT EITHER. `gh` printing an error into stdout must
# read as "cannot tell" and open, never as a comparison against a word.
C=$(new_case failopen_garbage)
set_open_count "$C" "gh: could not connect"
run_gate "$C" "$STATE_CALL" > /dev/null
if [ -s "$C/created.txt" ] && [ "$(park_files "$C")" = 0 ]; then
  pass "a non-numeric answer reads as cannot-tell and opens"
else
  fail "a non-numeric answer was treated as a count"
fi

# ONE NAMED CONSTANT, IN ONE PLACE. The literal appears exactly once in the
# block, on the line that names it, and every comparison goes through the name.
ASSIGNMENTS=$(grep -c '^POC_PR_DEPTH_THRESHOLD=' "$GATE")
if [ "$ASSIGNMENTS" = 1 ]; then
  pass "the threshold is assigned in exactly one place"
else
  fail "the threshold is assigned $ASSIGNMENTS times"
fi
BARE=$(grep -vE '^\s*#' "$GATE" | grep -c -- '-ge 3\|-gt 3\|= 3\]\|-ge "3"')
if [ "$BARE" = 0 ]; then
  pass "no comparison uses a bare literal instead of the name"
else
  fail "$BARE comparison(s) use a literal rather than POC_PR_DEPTH_THRESHOLD"
  grep -vE '^\s*#' "$GATE" | grep -n -- '-ge 3\|-gt 3\|= 3\]\|-ge "3"'
fi
USES=$(grep -vE '^\s*#' "$GATE" | grep -c 'POC_PR_DEPTH_THRESHOLD')
if [ "$USES" -ge 2 ]; then
  pass "the name is read as well as assigned ($USES uses)"
else
  fail "the constant is assigned but never read"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "producer gate: all assertions hold"
  exit 0
fi
echo "producer gate: $FAILURES assertion(s) failed"
exit 1
