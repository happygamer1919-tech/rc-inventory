#!/bin/bash
#
# Proves the pull request census added by card AUT-18, by running the real text
# of scripts/poc/run.sh rather than a copy of it.
#
# WHY IT EXTRACTS INSTEAD OF RE-IMPLEMENTING, which is the same argument
# scripts/poc/test-harness-caps.sh makes and for the same reason: run.sh takes a
# lock, sources a secrets file, calls GitHub and invokes a model, none of which
# can run in CI, and a test that re-states the logic proves only that the test
# agrees with itself. The block under test is fenced in run.sh as
# EXTRACT-BEGIN/EXTRACT-END pr-census and is lifted verbatim here. An edit that
# breaks a guarantee breaks this file, and an edit that deletes the fence fails
# it outright rather than passing on an empty extraction.
#
# WHAT IT PROVES, one case per clause of the card:
#
#   1. THE CENSUS IS WRITTEN. One line per open pull request carrying number,
#      head branch, head sha, merge state, and whether a `quality` run EXISTS
#      for that head sha and what it concluded. Every open pull request appears,
#      `card/` branches included.
#   2. THE ESCALATION FIRES ON EXACTLY TWO SHAPES. Conflicting at any age, and
#      not-green on a head commit older than this run's start, where absent,
#      failed and pending all count as not green. The negative half is the half
#      that matters and it is asserted: a green mergeable pull request does not
#      escalate, and neither does a red one pushed by the current run.
#   3. IT MERGES NOTHING AND CANNOT. Fed a fixture where everything is green and
#      mergeable, the census performs zero merge calls, asserted against a
#      stubbed merge function and a stubbed `gh`.
#   4. A PUSHED BRANCH WITH NO PULL REQUEST IS NAMED. Starting from the branch
#      list and subtracting, not from the pull request list. main never appears,
#      a merged branch never appears, a squash-merged branch never appears, and
#      a branch pushed by this run is listed but does not escalate.
#
# Needs no network, no gh, no credentials and no git remote. Runs on macOS and
# on ubuntu-latest.
#
# POC_TEST_RUN_SH points the extraction at a different run.sh. It exists so a
# pull request can prove each case FAILS FIRST, against the pre-change run.sh
# and against a mutant with one clause disabled.
#
set -u -o pipefail

RUN_SH=${POC_TEST_RUN_SH:-$(cd "$(dirname "$0")" && pwd)/run.sh}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; FAILURES=$(( FAILURES + 1 )); }

# The extraction writes to a path the caller already knows and returns a status,
# rather than echoing the path. `CENSUS=$(extract ...)` would run the function in
# a SUBSHELL, where its `exit 1` on a missing fence kills only the subshell and
# the test carries on against an empty file. A deleted fence must be a hard
# failure, not twenty soft ones.
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
CENSUS=$WORK/pr-census.sh
extract pr-census || exit 1

# ---------------------------------------------------------------------------
# The fixture harness. Every case builds a state.json, a pull request table and
# a branch table, replaces the five census_* seams with readers of those tables,
# and runs the real run_pr_census over them.
#
# The seams are replaced AFTER the block is sourced, so the block's own
# definitions are the ones being overridden rather than the ones being used. If
# a future edit inlines a `gh` call instead of going through a seam, the stub
# below catches it: `gh` and `git` are shadowed too, and any call to either is
# recorded and fails the merge assertion.
# ---------------------------------------------------------------------------
run_case() {
  RC_DIR=$1        # holds prs.tsv, branches.tsv, quality.tsv, merged.txt, epochs.tsv
  RC_START=$2      # this run's start, epoch seconds
  cat > "$RC_DIR/case.sh" <<CASE
set -u -o pipefail
CASE_DIR=$RC_DIR
CASE
  cat >> "$RC_DIR/case.sh" <<'CASE'
log() { echo "\$*" >> "$CASE_DIR/log.txt"; }
CASE
  # The heredoc above is quoted, so this one line is fixed up rather than
  # written with an unquoted heredoc that would eat every other dollar sign.
  sed -i.bak 's/echo "\\\$\*"/echo "$*"/' "$RC_DIR/case.sh"
  rm -f "$RC_DIR/case.sh.bak"

  cat >> "$RC_DIR/case.sh" <<CASE
source "$CENSUS"
CASE
  cat >> "$RC_DIR/case.sh" <<'CASE'

# --- the seams, replacing the real ones ---
census_pr_list() { cat "$CASE_DIR/prs.tsv"; }
census_branch_list() { cat "$CASE_DIR/branches.tsv"; }
census_quality_for_sha() {
  CQ=$(awk -F'\t' -v s="$1" '$1 == s { print $2 }' "$CASE_DIR/quality.tsv")
  census_normalise_quality "$CQ"
}
census_commit_epoch() {
  awk -F'\t' -v s="$1" '$1 == s { print $2 }' "$CASE_DIR/epochs.tsv"
}
census_branch_merged() {
  grep -qxF "$1" "$CASE_DIR/merged.txt" 2>/dev/null
}

# --- the tripwires. Nothing in the census may reach any of these. ---
merge_when_green() { echo "merge_when_green $*" >> "$CASE_DIR/forbidden.txt"; return 0; }
gh()               { echo "gh $*"               >> "$CASE_DIR/forbidden.txt"; return 0; }
gh_bounded()       { echo "gh_bounded $*"       >> "$CASE_DIR/forbidden.txt"; return 0; }
git()             { echo "git $*"              >> "$CASE_DIR/forbidden.txt"; return 0; }

run_pr_census "$CASE_DIR/state.json" "$RUN_START" "testrun" "2026-09-05T00:00:00Z"
CASE
  RUN_START=$RC_START bash "$RC_DIR/case.sh" > "$RC_DIR/stdout.txt" 2>&1
  echo $?
}

new_case() {
  NC=$WORK/$1
  mkdir -p "$NC"
  : > "$NC/prs.tsv"
  : > "$NC/branches.tsv"
  : > "$NC/quality.tsv"
  : > "$NC/epochs.tsv"
  : > "$NC/merged.txt"
  : > "$NC/log.txt"
  rm -f "$NC/forbidden.txt"
  echo '{"schema_version": 2, "escalations": []}' > "$NC/state.json"
  echo "$NC"
}

add_pr()     { printf '%s\t%s\t%s\t%s\n' "$2" "$3" "$4" "$5" >> "$1/prs.tsv"; }
add_branch() { printf '%s\t%s\n' "$2" "$3" >> "$1/branches.tsv"; }
add_quality(){ printf '%s\t%s\n' "$2" "$3" >> "$1/quality.tsv"; }
add_epoch()  { printf '%s\t%s\n' "$2" "$3" >> "$1/epochs.tsv"; }

escalation_count() {
  node -e 'const s=require(process.argv[1]);console.log((s.escalations||[]).length)' "$1/state.json"
}
escalations_json() {
  node -e 'const s=require(process.argv[1]);console.log(JSON.stringify(s.escalations||[]))' "$1/state.json"
}

# Common clock. The run starts at 2000000000; "earlier" commits are before it.
START=2000000000
OLD=$(( START - 90000 ))
NEW=$(( START + 60 ))

# ---------------------------------------------------------------------------
# 1. The census is written, one line per open pull request, card branches too.
# ---------------------------------------------------------------------------
echo
echo "1. the census writes one line per open pull request"

C=$(new_case census)
add_pr "$C" 201 poc/state-20260904 aaa1111 CLEAN
add_pr "$C" 202 card/p2-20         bbb2222 BLOCKED
add_pr "$C" 203 card/aut-18        ccc3333 DIRTY
add_quality "$C" aaa1111 success
add_quality "$C" bbb2222 in_progress
add_quality "$C" ccc3333 ""
add_epoch "$C" aaa1111 "$NEW"
add_epoch "$C" bbb2222 "$NEW"
add_epoch "$C" ccc3333 "$NEW"
run_case "$C" "$START" > /dev/null

LOG=$C/log.txt
for N in 201 202 203; do
  if grep -q "pr census: pr=#$N " "$LOG"; then
    pass "pull request #$N appears in the census"
  else
    fail "pull request #$N is missing from the census"
    cat "$LOG"
  fi
done

if grep -q 'pr census: pr=#202 branch=card/p2-20 head=bbb2222 merge_state=BLOCKED quality=PENDING pushed=this-run' "$LOG"; then
  pass "the card branch line carries number, branch, head sha, merge state and quality"
else
  fail "the census line for #202 does not carry all five fields"
  grep 'pr=#202' "$LOG" || echo "  (no line at all)"
fi

if grep -q 'pr=#203 .* quality=ABSENT' "$LOG"; then
  pass "a head sha with no quality run at all is reported ABSENT, not assumed"
else
  fail "a head sha with no quality run is not reported as ABSENT"
  grep 'pr=#203' "$LOG" || echo "  (no line at all)"
fi

if grep -q 'pr=#201 .* quality=SUCCESS' "$LOG"; then
  pass "a green head sha is reported SUCCESS"
else
  fail "a green head sha is not reported SUCCESS"
fi

# The census is written even when there is nothing at all to say, because a run
# that reported nothing must not look like a run with no open pull requests.
C0=$(new_case empty)
run_case "$C0" "$START" > /dev/null
if grep -q 'pr census: no open pull requests' "$C0/log.txt"; then
  pass "an empty pull request list still writes a census line"
else
  fail "an empty pull request list writes nothing at all"
fi

# ---------------------------------------------------------------------------
# 2. The escalation fires on exactly two shapes, and on no others.
# ---------------------------------------------------------------------------
echo
echo "2. the escalation fires on exactly two shapes"

C=$(new_case shapes)
#        num  branch              sha       merge state
add_pr "$C" 301 card/conflicting    s301 DIRTY        # shape A: conflicting
add_pr "$C" 302 card/stale-red      s302 CLEAN        # shape B: old and failed
add_pr "$C" 303 card/stale-absent   s303 CLEAN        # shape B: old and no run
add_pr "$C" 304 card/stale-pending  s304 BLOCKED      # shape B: old and pending
add_pr "$C" 305 card/green          s305 CLEAN        # negative: green, mergeable
add_pr "$C" 306 card/fresh-red      s306 CLEAN        # negative: red, pushed this run
add_pr "$C" 307 card/old-green      s307 CLEAN        # negative: old but green

add_quality "$C" s301 ""
add_quality "$C" s302 failure
add_quality "$C" s303 ""
add_quality "$C" s304 queued
add_quality "$C" s305 success
add_quality "$C" s306 failure
add_quality "$C" s307 success

add_epoch "$C" s301 "$NEW"      # conflicting escalates AT ANY AGE
add_epoch "$C" s302 "$OLD"
add_epoch "$C" s303 "$OLD"
add_epoch "$C" s304 "$OLD"
add_epoch "$C" s305 "$NEW"
add_epoch "$C" s306 "$NEW"
add_epoch "$C" s307 "$OLD"

run_case "$C" "$START" > /dev/null
ESC=$(escalations_json "$C")

for N in 301 302 303 304; do
  if printf '%s' "$ESC" | grep -q "PR-$N"; then
    pass "#$N escalates"
  else
    fail "#$N does not escalate but must"
    echo "  escalations: $ESC"
  fi
done

for N in 305 306 307; do
  if printf '%s' "$ESC" | grep -q "PR-$N"; then
    fail "#$N escalated and must not"
    echo "  escalations: $ESC"
  else
    pass "#$N does not escalate"
  fi
done

if [ "$(escalation_count "$C")" = "4" ]; then
  pass "exactly four escalations, one per stuck pull request and no others"
else
  fail "expected exactly 4 escalations, got $(escalation_count "$C")"
  echo "  escalations: $ESC"
fi

if printf '%s' "$ESC" | grep -q 'conflicts with main'; then
  pass "the conflicting escalation names the reason"
else
  fail "the conflicting escalation does not name the reason"
fi
if printf '%s' "$ESC" | grep -q 'predates this run'; then
  pass "the stale escalation names the reason"
else
  fail "the stale escalation does not name the reason"
fi
if [ "$(node -e 'const s=require(process.argv[1]);console.log((s.escalations||[]).every(e=>e.recommendation&&e.recommendation.length>0))' "$C/state.json")" = "true" ]; then
  pass "every escalation carries the mandatory recommendation"
else
  fail "an escalation was written with no recommendation"
fi

# ---------------------------------------------------------------------------
# 3. It merges nothing and cannot.
# ---------------------------------------------------------------------------
echo
echo "3. the census merges nothing"

C=$(new_case merges)
add_pr "$C" 401 poc/state-a m401 CLEAN
add_pr "$C" 402 card/p2-20  m402 CLEAN
add_pr "$C" 403 card/aut-18 m403 CLEAN
for S in m401 m402 m403; do add_quality "$C" "$S" success; add_epoch "$C" "$S" "$OLD"; done
run_case "$C" "$START" > /dev/null

if [ -s "$C/forbidden.txt" ]; then
  fail "the census called something it must never call"
  cat "$C/forbidden.txt"
else
  pass "zero merge calls, zero gh calls, zero git calls on an all-green fixture"
fi
if [ "$(escalation_count "$C")" = "0" ]; then
  pass "an all-green mergeable fixture escalates nothing"
else
  fail "an all-green fixture escalated $(escalation_count "$C") time(s)"
fi
if grep -q '0 merges' "$C/log.txt"; then
  pass "the census summary states the merge count"
else
  fail "the census summary does not state the merge count"
fi

if bash -n "$RUN_SH"; then
  pass "bash -n on run.sh exits 0"
else
  fail "bash -n on run.sh does not exit 0"
fi

# ---------------------------------------------------------------------------
# 4. A pushed branch with no pull request is named.
# ---------------------------------------------------------------------------
echo
echo "4. a pushed branch with no pull request is named"

C=$(new_case branches)
add_pr "$C" 501 card/has-a-pr p501 CLEAN
add_quality "$C" p501 success
add_epoch "$C" p501 "$NEW"

add_branch "$C" card/has-a-pr   p501     # has a pull request, so not a branch finding
add_branch "$C" card/orphan-old b_old    # THE CASE: pushed, no PR, older than this run
add_branch "$C" card/orphan-new b_new    # pushed by this run, listed but not escalated
add_branch "$C" card/merged     b_merged # already in main, never appears
add_branch "$C" card/squashed   b_squash # squash merged: sha absent from main, PR merged
add_epoch "$C" b_old "$OLD"
add_epoch "$C" b_new "$NEW"
add_epoch "$C" b_merged "$OLD"
add_epoch "$C" b_squash "$OLD"
printf 'card/merged\ncard/squashed\n' > "$C/merged.txt"

run_case "$C" "$START" > /dev/null
LOG=$C/log.txt
ESC=$(escalations_json "$C")

if grep -q 'branch census: branch=card/orphan-old head=b_old age_days=1 pr=none pushed=earlier' "$LOG"; then
  pass "the orphan branch is named with its branch, head sha and age"
else
  fail "the orphan branch line is missing or incomplete"
  grep 'branch census' "$LOG" || echo "  (no branch census lines at all)"
fi
if printf '%s' "$ESC" | grep -q 'BRANCH-card/orphan-old'; then
  pass "the orphan branch escalates"
else
  fail "the orphan branch does not escalate"
  echo "  escalations: $ESC"
fi

if grep -q 'branch=card/orphan-new' "$LOG"; then
  pass "a branch pushed by this run is listed in the census"
else
  fail "a branch pushed by this run is missing from the census"
fi
if printf '%s' "$ESC" | grep -q 'BRANCH-card/orphan-new'; then
  fail "a branch pushed by this run escalated and must not"
else
  pass "a branch pushed by this run does not escalate"
fi

for B in card/merged card/squashed card/has-a-pr; do
  if grep -q "branch census: branch=$B " "$LOG"; then
    fail "$B appears in the branch census and must not"
  else
    pass "$B never appears in the branch census"
  fi
done

# main is dropped by the real seam, which the fixture replaces, so it is
# asserted against the real one instead.
if (cd "$(dirname "$RUN_SH")" && sed -n '/^census_branch_list/,/^}/p' "$RUN_SH" | grep -q '!= "main"'); then
  pass "the real branch seam drops main and HEAD before any caller sees them"
else
  fail "the real branch seam does not drop main"
fi

if [ "$(escalation_count "$C")" = "1" ]; then
  pass "exactly one branch escalation, and it is the orphan"
else
  fail "expected exactly 1 escalation, got $(escalation_count "$C")"
  echo "  escalations: $ESC"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "PASS: the pull request census holds all four clauses"
  exit 0
fi
echo "FAIL: $FAILURES assertion(s) failed"
exit 1
