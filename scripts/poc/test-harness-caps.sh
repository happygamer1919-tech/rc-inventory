#!/bin/bash
#
# Proves the three harness guarantees added on 2026-08-28, by running the real
# text of scripts/poc/run.sh rather than a copy of it.
#
# WHY IT EXTRACTS INSTEAD OF RE-IMPLEMENTING. run.sh takes a lock, sources a
# secrets file and invokes a model. None of that can run in CI, and a test that
# re-states the logic proves only that the test agrees with itself. The blocks
# under test are fenced in run.sh with EXTRACT-BEGIN/EXTRACT-END and lifted
# verbatim here, so an edit that breaks a guarantee breaks this file, and an
# edit that deletes a fence fails it outright.
#
# WHAT IT PROVES, and each one is a defect that actually happened on run
# 20260827-220052:
#
#   1. A watchdog fires on wall clock and not on elapsed sleep. The old
#      `sleep $CAP` watchdog is run under the identical conditions and is
#      required to FAIL, because a guard nobody has watched fail is a guard
#      nobody has tested.
#   2. A run that outruns its cap reports `capped yes` even when no watchdog
#      line was ever written. That is the exact line run 20260827-220052 got
#      wrong: 31300 seconds against a 2700 second cap, reported `capped no`.
#   3. A lock inside its declared cap is honoured; a lock past it is reclaimed,
#      loudly; and a reclaim never signals a pid that has been recycled onto
#      something that is not this harness.
#   4. A PR is checkpointed from what GitHub answers, once, to two places.
#
# Runs on macOS and on ubuntu-latest. Needs no network, no gh, no credentials.
#
set -u -o pipefail

RUN_SH=$(cd "$(dirname "$0")" && pwd)/run.sh
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; FAILURES=$(( FAILURES + 1 )); }

# The fenced block, verbatim, fences excluded. A missing fence is a hard failure
# rather than an empty extraction that would quietly pass every assertion.
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
    exit 1
  fi
  echo "$EX_OUT"
}

echo "run.sh under test: $RUN_SH"

# ---------------------------------------------------------------------------
# 1. The watchdog measures wall clock.
#
# A suspend is a wall clock that jumps forward while `sleep` does not advance.
# That is reproduced exactly: `date` is shadowed by a function that adds an
# offset, and the offset is jumped forward once. Nothing here sleeps for the
# length of a cap, so the whole case costs a few seconds.
# ---------------------------------------------------------------------------
echo
echo "1. a watchdog fires on wall clock, not on elapsed sleep"

cat > "$WORK/watchdog-case.sh" <<'CASE'
set -u -o pipefail
POC_WATCHDOG_POLL_SECONDS=1
POC_KILL_GRACE_SECONDS=2
CLOCK_OFFSET_FILE=$1
HELPERS=$2
VICTIM_LOG=$3
STYLE=$4

# The wall clock the code under test sees. A real suspend moves this and does
# not move `sleep`; so does this file.
date() {
  if [ "${1:-}" = "+%s" ]; then
    echo $(( $(command date +%s) + $(cat "$CLOCK_OFFSET_FILE") ))
  else
    command date "$@"
  fi
}

# shellcheck disable=SC1090
. "$HELPERS"

sleep 120 &
VICTIM=$!

CAP=60
DEADLINE=$(( $(date +%s) + CAP ))

if [ "$STYLE" = new ]; then
  watchdog "$VICTIM" "$DEADLINE" "$VICTIM_LOG" "executor ${CAP}s" &
else
  # The 2026-08-27 watchdog, verbatim in shape: count down to the deadline
  # instead of comparing against it.
  (
    sleep "$CAP"
    if kill -0 "$VICTIM" 2>/dev/null; then
      echo "[watchdog] executor ${CAP}s cap reached, stopping" >> "$VICTIM_LOG"
      kill -TERM "$VICTIM" 2>/dev/null
    fi
  ) &
fi
WD=$!

# The machine suspends for an hour and comes back.
echo 3600 > "$CLOCK_OFFSET_FILE"

# Long enough for several polls of the new watchdog, far short of the 60s the
# old one is counting down.
command sleep 6

if kill -0 "$VICTIM" 2>/dev/null; then
  echo ALIVE
else
  echo DEAD
fi
kill "$WD" "$VICTIM" 2>/dev/null
wait 2>/dev/null
CASE

HELPERS=$(extract deadline-helpers)

# Captured to a FILE and not through $(...). The old-style case deliberately
# leaves a `sleep 60` running, and a command substitution would block on the
# pipe that sleep still holds, turning a six second case into a minute.
echo 0 > "$WORK/offset-new"
: > "$WORK/vlog-new"
bash "$WORK/watchdog-case.sh" "$WORK/offset-new" "$HELPERS" "$WORK/vlog-new" new \
  > "$WORK/case-new" 2>/dev/null
RESULT_NEW=$(tail -1 "$WORK/case-new")
if [ "$RESULT_NEW" = DEAD ]; then
  pass "the shipped watchdog stopped the process after the clock jumped past the deadline"
else
  fail "the shipped watchdog left the process running after the clock passed its deadline"
fi
if grep -q '^\[watchdog\] executor .* cap reached, stopping$' "$WORK/vlog-new"; then
  pass "it wrote its cap line into the process log"
else
  fail "no watchdog line was written into the process log"
fi

echo 0 > "$WORK/offset-old"
: > "$WORK/vlog-old"
bash "$WORK/watchdog-case.sh" "$WORK/offset-old" "$HELPERS" "$WORK/vlog-old" old \
  > "$WORK/case-old" 2>/dev/null
RESULT_OLD=$(tail -1 "$WORK/case-old")
if [ "$RESULT_OLD" = ALIVE ]; then
  pass "the 2026-08-27 sleep-based watchdog does NOT fire on the same input, which is the defect"
else
  fail "the old watchdog fired, so this case no longer reproduces the defect and proves nothing"
fi

# ---------------------------------------------------------------------------
# 2. capped is decided by the clock.
# ---------------------------------------------------------------------------
echo
echo "2. an overrun reports capped yes even with no watchdog line"

CAPPED_BLOCK=$(extract capped-decision)

run_capped_case() {
  RCC_ELAPSED=$1
  RCC_CAP=$2
  RCC_LOGLINE=$3
  : > "$WORK/exec.log"
  [ -n "$RCC_LOGLINE" ] && echo "$RCC_LOGLINE" >> "$WORK/exec.log"
  EXECUTOR_ELAPSED=$RCC_ELAPSED POC_MAX_SECONDS=$RCC_CAP \
  EXECUTOR_LOG=$WORK/exec.log EXECUTOR_EXIT=0 \
  bash -c '
    set -u
    log() { echo "$*"; }
    . "$1"
    echo "CAPPED=$CAPPED WATCHDOG_FIRED=$WATCHDOG_FIRED"
  ' _ "$CAPPED_BLOCK"
}

# The exact shape of run 20260827-220052: hours over the cap, no watchdog line.
OUT=$(run_capped_case 31300 2700 "")
case "$OUT" in
  *"CAPPED=yes"*"WATCHDOG_FIRED=no"*)
    pass "31300s against a 2700s cap with no watchdog line reports capped yes" ;;
  *) fail "expected CAPPED=yes WATCHDOG_FIRED=no, got: $OUT" ;;
esac
case "$OUT" in
  *"HARNESS DEFECT"*)
    pass "it names the disagreement between the clock and the watchdog as a harness defect" ;;
  *) fail "an overrun the watchdog missed was not called out: $OUT" ;;
esac

OUT=$(run_capped_case 2701 2700 "[watchdog] executor 2700s cap reached, stopping")
case "$OUT" in
  *"CAPPED=yes"*"WATCHDOG_FIRED=yes"*)
    pass "a watchdog-stopped run reports capped yes and watchdog fired yes" ;;
  *) fail "expected CAPPED=yes WATCHDOG_FIRED=yes, got: $OUT" ;;
esac

OUT=$(run_capped_case 600 2700 "")
case "$OUT" in
  *"CAPPED=no"*) pass "a run inside its cap reports capped no" ;;
  *) fail "expected CAPPED=no, got: $OUT" ;;
esac

# ---------------------------------------------------------------------------
# 3. The lock: honoured inside the cap, reclaimed past it, never mis-aimed.
# ---------------------------------------------------------------------------
echo
echo "3. a stale lock is reclaimed and a fresh one is honoured"

LOCK_BLOCK=$(extract lock)

# The lock block is run in its own shell with the paths pointed at the temp dir.
# `exit 0` inside it is the refusal path, so the exit code is part of the result.
run_lock_case() {
  RLC_NOW=$1
  bash -c '
    set -u -o pipefail
    POC_LOCK_FILE=$1
    RUN_ID=test-run
    RUN_STARTED_AT=$2
    POC_RUN_TOTAL_CAP_SECONDS=7200
    POC_LOCK_STALE_MARGIN_SECONDS=900
    POC_KILL_GRACE_SECONDS=2
    POC_WATCHDOG_POLL_SECONDS=1
    log() { echo "[log] $*"; }
    . "$3"
    . "$4"
    echo "RECLAIMED=$LOCK_RECLAIMED"
  ' _ "$WORK/run.lock" "$RLC_NOW" "$HELPERS" "$LOCK_BLOCK"
}

NOW=$(date +%s)

# 3a. A live run inside its declared cap is left alone.
printf 'run_id=live\npid=%s\npgid=%s\nstarted_epoch=%s\ncap_seconds=7200\n' \
  "$$" "$$" "$(( NOW - 600 ))" > "$WORK/run.lock"
OUT=$(run_lock_case "$NOW"); CODE=$?
if [ "$CODE" -eq 0 ] && echo "$OUT" | grep -q 'refused: lock held by run live'; then
  pass "a lock 600s into a 7200s cap is refused, not stolen"
else
  fail "a fresh lock was not honoured (exit $CODE): $OUT"
fi
if echo "$OUT" | grep -q 'stale in [0-9]*s'; then
  pass "the refusal says how old the lock is and when it goes stale"
else
  fail "the refusal did not report the age and the staleness deadline: $OUT"
fi
[ -f "$WORK/run.lock" ] && grep -q '^run_id=live$' "$WORK/run.lock" \
  && pass "the honoured lock file is untouched" \
  || fail "the honoured lock file was modified"

# 3b. A lock past cap plus margin, holder long gone. The orphan case.
printf 'run_id=orphan\npid=999999\npgid=999999\nstarted_epoch=%s\ncap_seconds=7200\n' \
  "$(( NOW - 30000 ))" > "$WORK/run.lock"
OUT=$(run_lock_case "$NOW")
if echo "$OUT" | grep -q 'STALE LOCK RECLAIMED by run test-run'; then
  pass "a 30000s old lock is reclaimed"
else
  fail "an abandoned lock was not reclaimed: $OUT"
fi
if echo "$OUT" | grep -q 'is gone, the lock is an orphan'; then
  pass "it says the holder was already dead"
else
  fail "the reclaim did not name why it was safe: $OUT"
fi
if echo "$OUT" | grep -q 'RECLAIMED=yes' && grep -q '^run_id=test-run$' "$WORK/run.lock"; then
  pass "the new run took the lock and recorded the reclaim"
else
  fail "the lock was not retaken: $OUT"
fi
grep -q '^cap_seconds=7200$' "$WORK/run.lock" \
  && pass "the new lock advertises its own declared cap to the next run" \
  || fail "the new lock does not carry cap_seconds"

# 3c. THE ONE THAT MATTERS. Stale lock, but the pid has been recycled onto
# something that is not this harness. Killing it would be a worse fault than the
# one being repaired.
command sleep 300 &
BYSTANDER=$!
printf 'run_id=recycled\npid=%s\npgid=%s\nstarted_epoch=%s\ncap_seconds=7200\n' \
  "$BYSTANDER" "$BYSTANDER" "$(( NOW - 30000 ))" > "$WORK/run.lock"
OUT=$(run_lock_case "$NOW")
if kill -0 "$BYSTANDER" 2>/dev/null; then
  pass "a pid that is not this harness was not signalled"
else
  fail "the reclaim killed an unrelated process holding a recycled pid"
fi
if echo "$OUT" | grep -q 'is alive but is NOT this harness'; then
  pass "it says why it did not signal"
else
  fail "the reclaim did not explain the pid it left alone: $OUT"
fi
echo "$OUT" | grep -q 'STALE LOCK RECLAIMED' \
  && pass "the lock was still reclaimed" \
  || fail "a stale lock with a recycled pid was not reclaimed: $OUT"
kill "$BYSTANDER" 2>/dev/null; wait "$BYSTANDER" 2>/dev/null

# 3d. A lock written by an older run.sh, with no started_epoch and no
# cap_seconds. It must still be readable rather than immortal.
printf 'run_id=oldformat\npid=999999\nstarted_at=2026-08-27T22:00:52Z\n' > "$WORK/run.lock"
touch -t 202001010000 "$WORK/run.lock" 2>/dev/null
OUT=$(run_lock_case "$NOW")
if echo "$OUT" | grep -q 'STALE LOCK RECLAIMED'; then
  pass "a lock in the pre-2026-08-28 format is still judged and reclaimed"
else
  fail "an old-format lock could not be aged: $OUT"
fi

# ---------------------------------------------------------------------------
# 4. The checkpoint.
# ---------------------------------------------------------------------------
echo
echo "4. a PR is checkpointed from what GitHub answers"

CHECKPOINT_BLOCK=$(extract checkpoint)

run_checkpoint_case() {
  bash -c '
    set -u -o pipefail
    GH_ANSWER=$1
    LOGGED=$4
    log() { echo "[log] $*" | tee -a "$LOGGED" >/dev/null; }
    # gh_bounded is stubbed to whatever GitHub is pretending to answer. The gh
    # arguments are taken and ignored, exactly as a stub should.
    gh_bounded() { cat "$GH_ANSWER"; }
    . "$2"
    PR=$(pr_for_branch triage/test-run)
    echo "PR=[$PR]"
    if [ -n "$PR" ]; then
      checkpoint_pr test-run triage "$PR" triage/test-run docs/reports/r.md "$3"
      checkpoint_pr test-run triage "$PR" triage/test-run docs/reports/r.md "$3"
    fi
  ' _ "$1" "$CHECKPOINT_BLOCK" "$2" "$3"
}

echo "83" > "$WORK/gh-answer"
: > "$WORK/checkpoint"; : > "$WORK/logged"
OUT=$(run_checkpoint_case "$WORK/gh-answer" "$WORK/checkpoint" "$WORK/logged")
EXPECTED="checkpoint run=test-run role=triage pr=83 branch=triage/test-run report=docs/reports/r.md"
if [ "$(cat "$WORK/checkpoint")" = "$EXPECTED" ]; then
  pass "the checkpoint file carries run id, role, PR, branch and report, once"
else
  fail "checkpoint file wrong: $(cat "$WORK/checkpoint")"
fi
if [ "$(grep -c "$EXPECTED" "$WORK/logged")" -eq 1 ]; then
  pass "the same line reached the run log exactly once"
else
  fail "the run log did not get the line exactly once"
fi

# GitHub answering nothing, or answering something that is not a number, must
# produce no PR and no checkpoint rather than a line that says pr=null.
for ANSWER in "" "null" "not-a-number"; do
  echo "$ANSWER" > "$WORK/gh-answer"
  : > "$WORK/checkpoint"; : > "$WORK/logged"
  OUT=$(run_checkpoint_case "$WORK/gh-answer" "$WORK/checkpoint" "$WORK/logged")
  if [ "$OUT" = "PR=[]" ] && [ ! -s "$WORK/checkpoint" ]; then
    pass "gh answering '${ANSWER:-empty}' produces no PR and no checkpoint"
  else
    fail "gh answering '${ANSWER:-empty}' produced: $OUT / $(cat "$WORK/checkpoint")"
  fi
done

# ---------------------------------------------------------------------------
# 5. The review step is handed the right report. Card AUT-17.
#
# The fixture is CONSTRUCTED and that is the point. No same-day slug inversion
# has occurred in this repository's history yet, which is exactly why the defect
# has never fired and why this test may not be built by replaying real history.
#
# THE OLD SELECTOR IS RUN BESIDE THE NEW ONE ON EVERY CASE AND IS REQUIRED TO
# FAIL, for the same reason case 1 runs the sleep-counting watchdog: a guard
# nobody has watched fail is a guard nobody has tested.
# ---------------------------------------------------------------------------
echo
echo "5. the review step is handed the report its own run just wrote"

SELECTOR_BLOCK=$(extract triage-selector)

# The selector as it stood before AUT-17: filenames sorted, origin/main only,
# nothing asked about what was already reviewed.
old_selector() {
  git ls-tree -r --name-only origin/main -- docs/reports/ 2>/dev/null \
    | grep -E "^docs/reports/[0-9]{4}-[0-9]{2}-[0-9]{2}-executor-[a-z0-9-]+\.md$" \
    | sort | tail -1
}

# A throwaway repository with an origin/main ref and no remote. $1 is the
# directory. Commits are made in the order given so commit order and filename
# order can be made to disagree on purpose.
fixture_repo() {
  FR_DIR=$1
  mkdir -p "$FR_DIR/docs/reports" "$FR_DIR/docs/poc"
  git -C "$FR_DIR" init --quiet -b main
  git -C "$FR_DIR" config user.email t@example.com
  git -C "$FR_DIR" config user.name t
  : > "$FR_DIR/.keep"
  git -C "$FR_DIR" add .keep
  git -C "$FR_DIR" commit --quiet -m base
}

fixture_report() {
  echo "report" > "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" commit --quiet -m "$2"
}

# Runs both selectors inside the fixture. Prints "new=<path>" then "old=<path>".
run_selectors() {
  RS_DIR=$1
  RS_LATEST=$2
  bash -c '
    set -u -o pipefail
    cd "$1" || exit 1
    log() { echo "[log] $*"; }
    . "$2"
    '"$(declare -f old_selector)"'
    echo "new=$(select_triage_report "$3" HEAD 2>"$4")"
    echo "old=$(old_selector)"
  ' _ "$RS_DIR" "$SELECTOR_BLOCK" "$RS_LATEST" "$WORK/selector.stderr"
}

# -- 5a. Ordering is by commit, not by name. -------------------------------
# 2026-09-01-executor-zzz.md is committed FIRST. 2026-09-01-executor-aaa.md is
# committed SECOND and sorts FIRST. The newest report is aaa; `sort | tail -1`
# says zzz.
FX=$WORK/fx-order
fixture_repo "$FX"
fixture_report "$FX" docs/reports/2026-09-01-executor-zzz.md
fixture_report "$FX" docs/reports/2026-09-01-executor-aaa.md
git -C "$FX" update-ref refs/remotes/origin/main HEAD

: > "$WORK/selector.stderr"
OUT=$(run_selectors "$FX" "$WORK/no-such-latest.json")
if [ "$(echo "$OUT" | sed -n 's/^new=//p')" = "docs/reports/2026-09-01-executor-aaa.md" ]; then
  pass "ordering is by commit: the report committed second is selected"
else
  fail "ordering by commit: got $(echo "$OUT" | sed -n 's/^new=//p')"
fi
if [ "$(echo "$OUT" | sed -n 's/^old=//p')" = "docs/reports/2026-09-01-executor-zzz.md" ]; then
  pass "the old filename-sorting selector fails this case, as it must"
else
  fail "the old selector did not fail: $(echo "$OUT" | sed -n 's/^old=//p')"
fi

# -- 5b. An already reviewed report is never reviewed twice. ---------------
# triage-latest.json names exactly the path the selector would otherwise
# return. The legal outcomes are two: select the next unconsumed report, or
# skip. This asserts WHICH happened, and that the refusal named the path and
# the run that consumed it.
cat > "$WORK/latest-consumed.json" <<JSON
{"run_id": "20260901-040003", "report": "docs/reports/2026-09-01-executor-aaa.md"}
JSON
: > "$WORK/selector.stderr"
OUT=$(run_selectors "$FX" "$WORK/latest-consumed.json")
if [ "$(echo "$OUT" | sed -n 's/^new=//p')" = "docs/reports/2026-09-01-executor-zzz.md" ]; then
  pass "a consumed report is skipped and the next unconsumed one is selected"
else
  fail "consumed report: got $(echo "$OUT" | sed -n 's/^new=//p')"
fi
if grep -q "2026-09-01-executor-aaa.md was already reviewed by run 20260901-040003" "$WORK/selector.stderr"; then
  pass "the refusal names the report path and the run id that consumed it"
else
  fail "no refusal line naming path and run id: $(cat "$WORK/selector.stderr")"
fi

# Every candidate consumed means nothing is selected. NO REPORT MEANS NO TRIAGE
# survives this card; inventing an input is worse than skipping.
FX1=$WORK/fx-one
fixture_repo "$FX1"
fixture_report "$FX1" docs/reports/2026-09-01-executor-only.md
git -C "$FX1" update-ref refs/remotes/origin/main HEAD
cat > "$WORK/latest-only.json" <<JSON
{"run_id": "20260901-040003", "report": "docs/reports/2026-09-01-executor-only.md"}
JSON
: > "$WORK/selector.stderr"
OUT=$(run_selectors "$FX1" "$WORK/latest-only.json")
if [ "$(echo "$OUT" | sed -n 's/^new=//p')" = "" ]; then
  pass "every candidate consumed selects nothing, so the step is skipped"
else
  fail "expected no selection, got $(echo "$OUT" | sed -n 's/^new=//p')"
fi
if [ "$(echo "$OUT" | sed -n 's/^old=//p')" = "docs/reports/2026-09-01-executor-only.md" ]; then
  pass "the old selector re-selects the consumed report, as it must"
else
  fail "the old selector did not re-select the consumed report"
fi

# A missing or unparseable triage-latest.json fails OPEN: nothing consumed.
echo 'not json {' > "$WORK/latest-broken.json"
: > "$WORK/selector.stderr"
OUT=$(run_selectors "$FX1" "$WORK/latest-broken.json")
if [ "$(echo "$OUT" | sed -n 's/^new=//p')" = "docs/reports/2026-09-01-executor-only.md" ]; then
  pass "an unparseable triage-latest.json fails open, treating nothing as consumed"
else
  fail "unparseable latest did not fail open: $(echo "$OUT" | sed -n 's/^new=//p')"
fi

# -- 5c. The report this run just wrote, on an unmerged branch. ------------
# origin/main's newest executor report is the OLDER file. The branch carries the
# newer one and is not merged. A card whose acceptance failed leaves its report
# in exactly this state, and it is the run whose report most needs reviewing.
FX2=$WORK/fx-branch
fixture_repo "$FX2"
fixture_report "$FX2" docs/reports/2026-08-31-executor-old.md
git -C "$FX2" update-ref refs/remotes/origin/main HEAD
git -C "$FX2" checkout --quiet -b card/p3-13b
fixture_report "$FX2" docs/reports/2026-09-01-executor-branch.md

: > "$WORK/selector.stderr"
OUT=$(run_selectors "$FX2" "$WORK/no-such-latest.json")
if [ "$(echo "$OUT" | sed -n 's/^new=//p')" = "docs/reports/2026-09-01-executor-branch.md" ]; then
  pass "the report on this run's unmerged branch wins over the newest on main"
else
  fail "branch report: got $(echo "$OUT" | sed -n 's/^new=//p')"
fi
if [ "$(echo "$OUT" | sed -n 's/^old=//p')" = "docs/reports/2026-08-31-executor-old.md" ]; then
  pass "the old origin/main-only selector cannot see the branch report, as it must not"
else
  fail "the old selector saw the branch report"
fi

# The branch report wins even when it is OLDER by commit time than main's
# newest. The review step exists to read what THIS run produced.
FX3=$WORK/fx-prefer
fixture_repo "$FX3"
fixture_report "$FX3" docs/reports/2026-08-31-executor-base.md
BASE_SHA=$(git -C "$FX3" rev-parse HEAD)
git -C "$FX3" checkout --quiet -b card/aut-x
fixture_report "$FX3" docs/reports/2026-09-01-executor-mine.md
git -C "$FX3" checkout --quiet "$BASE_SHA"
git -C "$FX3" checkout --quiet -b mainline
fixture_report "$FX3" docs/reports/2026-09-02-executor-newer-on-main.md
git -C "$FX3" update-ref refs/remotes/origin/main HEAD
git -C "$FX3" checkout --quiet card/aut-x

: > "$WORK/selector.stderr"
OUT=$(run_selectors "$FX3" "$WORK/no-such-latest.json")
if [ "$(echo "$OUT" | sed -n 's/^new=//p')" = "docs/reports/2026-09-01-executor-mine.md" ]; then
  pass "this run's own report wins even when main carries a newer one"
else
  fail "preference order: got $(echo "$OUT" | sed -n 's/^new=//p')"
fi

# -- 5d. The dispatch sentence. --------------------------------------------
# The phrase was on one line of run.sh and the grep printed 1 before AUT-17.
# What must survive is that the review step takes no chat, no summary, no human
# context and no verbal ratification. What had to go is the claim that reading a
# committed repository file is a defect.
if [ "$(grep -c 'you need nothing else' "$RUN_SH")" -eq 0 ]; then
  pass "the dispatch no longer tells the review step it needs nothing else"
else
  fail "'you need nothing else' is still in run.sh"
fi
if grep -q 'verbal ratification' "$RUN_SH"; then
  pass "the R-050 clause survives: no chat, no summary, no verbal ratification"
else
  fail "the R-050 clause was deleted rather than corrected"
fi
if bash -n "$RUN_SH"; then
  pass "bash -n run.sh exits 0"
else
  fail "bash -n run.sh is non-zero"
fi


# ===========================================================================
# 5. AUT-22: A RUN DOES NOT START WORK IT CANNOT FINISH AND MERGE
# ===========================================================================
#
# The required check costs between forty and fifty five percent of the whole
# forty five minute budget: measured runs of 24m48s, 18m09s and 19m43s, and one
# cancelled at 21m. Two consequences follow with no judgement involved, and both
# happened on three consecutive runs: a run that builds a card from scratch
# cannot also merge it, and a run that inherits a pushed branch can.
#
# THE DECISION IS LIFTED FROM run.sh VERBATIM by its EXTRACT fences, the same
# mechanism the blocks above use. The three `work_*` seams are the only place the
# clock, GitHub or the board is reached, and both are stubbed here. `gh`,
# `gh_bounded` and `git` are shadowed as tripwires: this decision must reach none
# of them directly, and the assertions below say so.
#
# NO NETWORK, NO CREDENTIALS, NO CLOCK DEPENDENCE. The clock is a stub, so the
# case that refuses refuses at the same boundary on every machine and in a year.
echo
echo "5. AUT-22: what this run may start"

# THE EXTRACTION IS CHECKED, AND THE REASON IS THAT extract's OWN `exit 1` DOES
# NOT REACH HERE. `$(extract ...)` runs it in a SUBSHELL, so a missing fence kills
# the subshell, leaves SELECTION empty, and every case below fails softly against
# an empty file. That is seventeen confusing failures instead of one clear one,
# and scripts/poc/test-pr-census.sh already carries the same warning in its own
# words. Checked here rather than by rewriting extract, which the blocks above use
# as it is.
SELECTION=$(extract work-selection)
if [ -z "$SELECTION" ] || [ ! -s "$SELECTION" ]; then
  fail "no EXTRACT block named 'work-selection' in $RUN_SH. The fences are part of the contract."
  echo
  echo "$FAILURES assertion(s) failed"
  exit 1
fi

# One case: a fixed now, a fixed deadline, a pull request table and an eligible
# list. Prints the chosen kind, the target and the return code, one per line.
selection_case() {
  SC_DIR=$WORK/sel-$1
  mkdir -p "$SC_DIR"
  : > "$SC_DIR/log.txt"
  : > "$SC_DIR/forbidden.txt"
  printf '%s' "$3" > "$SC_DIR/prs.tsv"
  cat > "$SC_DIR/case.sh" <<CASE
set -u -o pipefail
CASE_DIR=$SC_DIR
ELIGIBLE_AT_START="$4"
CASE
  cat >> "$SC_DIR/case.sh" <<'CASE'
log() { echo "$*" >> "$CASE_DIR/log.txt"; }
CASE
  cat >> "$SC_DIR/case.sh" <<CASE
source "$SELECTION"
work_now_seconds() { echo 1000000; }
work_open_prs()    { cat "\$CASE_DIR/prs.tsv"; }
gh()         { echo "gh \$*"         >> "\$CASE_DIR/forbidden.txt"; return 0; }
gh_bounded() { echo "gh_bounded \$*" >> "\$CASE_DIR/forbidden.txt"; return 0; }
git()        { echo "git \$*"        >> "\$CASE_DIR/forbidden.txt"; return 0; }
work_selection $2
SC_CODE=\$?
echo "kind=\$WORK_KIND"
echo "target=\$WORK_TARGET"
echo "code=\$SC_CODE"
echo "reason=\$WORK_REASON"
CASE
  bash "$SC_DIR/case.sh" > "$SC_DIR/out.txt" 2>&1
  echo "$SC_DIR"
}

# now is 1000000. A deadline of 1002000 leaves 2000s; 1001000 leaves 1000s.
# The requirement is 1500 + 300 = 1800s, so 2000 proceeds and 1000 refuses.
PLENTY=1002000
SCARCE=1001000

# --- 5.1 REFUSES ------------------------------------------------------------
S=$(selection_case refuse "$SCARCE" "" "AUT-22,AUT-8")
if grep -q '^kind=none$' "$S/out.txt" && grep -q '^target=$' "$S/out.txt"; then
  pass "with too little clock the decision returns NO card"
else
  fail "a card was chosen with too little clock: $(cat "$S/out.txt")"
fi
if grep -q '^code=3$' "$S/out.txt"; then
  pass "and it returns the documented refuse code 3, which is not 0"
else
  fail "the refuse code is not 3: $(grep '^code=' "$S/out.txt")"
fi
if grep -q 'REFUSING to start a card. remaining 1000s, estimate 1500s, margin 300s, needed 1800s' "$S/log.txt"; then
  pass "the line names the remaining seconds AND the estimate, both"
else
  fail "the refusal line does not name the remaining seconds and the estimate"
  cat "$S/log.txt"
fi
if grep -q '^reason=1000s of wall clock remain' "$S/out.txt"; then
  pass "the reason is carried out for the escalation, so a refusal is not a silent run"
else
  fail "the refusal carries no reason for the escalation: $(grep '^reason=' "$S/out.txt")"
fi

# --- 5.2 PROCEEDS -----------------------------------------------------------
S=$(selection_case proceed "$PLENTY" "" "AUT-22,AUT-8")
if grep -q '^kind=card$' "$S/out.txt" && grep -q '^target=AUT-22$' "$S/out.txt"; then
  pass "with enough clock it returns the LOWEST ID eligible card, unchanged from today"
else
  fail "the wrong thing was chosen with plenty of clock: $(cat "$S/out.txt")"
fi
if grep -q '^code=0$' "$S/out.txt"; then
  pass "and returns 0"
else
  fail "proceeding did not return 0"
fi

# THE BOUNDARY ITSELF, ON BOTH SIDES, because a >= that should be a > is the
# defect this case exists to catch and neither case above sits on the edge.
S=$(selection_case edge_exact "$(( 1000000 + 1800 ))" "" "AUT-22")
if grep -q '^kind=card$' "$S/out.txt"; then
  pass "at EXACTLY the requirement it proceeds"
else
  fail "at exactly 1800s remaining it refused"
fi
S=$(selection_case edge_under "$(( 1000000 + 1799 ))" "" "AUT-22")
if grep -q '^kind=none$' "$S/out.txt"; then
  pass "one second under the requirement it refuses"
else
  fail "at 1799s remaining it started a card"
fi

# --- 5.3 FINISHES BEFORE IT STARTS -----------------------------------------
# An inherited pull request wins over a new card WHATEVER the clock says, so the
# case is run with the SCARCE clock and again with the PLENTY clock and the
# answer must be the same both times. The assertion is on WHICH of the two was
# chosen, not merely that something was.
INHERITED=$(printf '186\tcard/aut-16\tBEHIND\n')
S=$(selection_case inherit_scarce "$SCARCE" "$INHERITED" "AUT-22,AUT-8")
if grep -q '^kind=inherited-pr$' "$S/out.txt" && grep -q '^target=186$' "$S/out.txt"; then
  pass "a BEHIND pull request this harness opened is preferred, on a clock too short for a card"
else
  fail "the inherited pull request was not chosen: $(cat "$S/out.txt")"
fi
S=$(selection_case inherit_plenty "$PLENTY" "$INHERITED" "AUT-22,AUT-8")
if grep -q '^kind=inherited-pr$' "$S/out.txt" && grep -q '^target=186$' "$S/out.txt"; then
  pass "and preferred over an eligible card on a clock long enough for one, which is the clause"
else
  fail "with plenty of clock a new card beat the inherited branch: $(cat "$S/out.txt")"
fi

CONFLICTING=$(printf '190\tcard/aut-17\tCONFLICTING\n')
S=$(selection_case inherit_conflicting "$PLENTY" "$CONFLICTING" "AUT-22")
if grep -q '^kind=inherited-pr$' "$S/out.txt" && grep -q '^target=190$' "$S/out.txt"; then
  pass "CONFLICTING is preferred too, not only BEHIND"
else
  fail "a conflicting inherited branch was not preferred: $(cat "$S/out.txt")"
fi

# DIRTY is what the GitHub API actually answers for a conflicting pull request,
# and CONFLICTING is what the field is called in the documentation. Both are
# accepted, because accepting only the name in the docs would have made this
# clause never fire against the real API.
DIRTY=$(printf '191\tpoc/state-20260904\tDIRTY\n')
S=$(selection_case inherit_dirty "$PLENTY" "$DIRTY" "AUT-22")
if grep -q '^kind=inherited-pr$' "$S/out.txt"; then
  pass "DIRTY, which is what the API actually returns for a conflict, is preferred too"
else
  fail "a DIRTY inherited branch was not preferred: $(cat "$S/out.txt")"
fi

# THE NEGATIVE HALF, WHICH IS THE HALF THAT MATTERS. A clean mergeable pull
# request needs no terminal, and a branch this harness did not open is somebody
# else's work. Neither may divert the run.
CLEAN=$(printf '200\tcard/aut-99\tCLEAN\n')
S=$(selection_case inherit_clean "$PLENTY" "$CLEAN" "AUT-22")
if grep -q '^kind=card$' "$S/out.txt" && grep -q '^target=AUT-22$' "$S/out.txt"; then
  pass "a CLEAN pull request does not divert the run"
else
  fail "a clean pull request was treated as inherited work: $(cat "$S/out.txt")"
fi
FOREIGN=$(printf '201\tsomebody/else\tBEHIND\n')
S=$(selection_case inherit_foreign "$PLENTY" "$FOREIGN" "AUT-22")
if grep -q '^kind=card$' "$S/out.txt"; then
  pass "a BEHIND branch this harness did not open is left alone"
else
  fail "the run diverted onto a branch it does not own: $(cat "$S/out.txt")"
fi

# NOTHING ELIGIBLE AND NOTHING INHERITED IS NOT A REFUSAL. A dry board is a
# normal outcome with its own handling in section 13, and reporting it as "no
# clock" would be a false reason in the digest.
S=$(selection_case dry "$SCARCE" "" "")
if grep -q '^kind=none$' "$S/out.txt" && grep -q '^code=0$' "$S/out.txt"; then
  pass "a dry board returns none with code 0, not the refuse code"
else
  fail "a dry board was reported as a clock refusal: $(cat "$S/out.txt")"
fi

# THE CONSTANTS ARE NAMED, AND WRITTEN ONCE EACH. A second copy at another call
# site is how a threshold becomes two different numbers.
for CONST in POC_CARD_ESTIMATE_SECONDS POC_CARD_MARGIN_SECONDS; do
  ASSIGNED=$(grep -c "^$CONST=" "$SELECTION")
  if [ "$ASSIGNED" = 1 ]; then
    pass "$CONST is assigned exactly once"
  else
    fail "$CONST is assigned $ASSIGNED times"
  fi
done
if grep -vE '^\s*#' "$SELECTION" | grep -qE '(-lt|-ge|-gt) 1[58]00'; then
  fail "a comparison uses a bare literal instead of the named constant"
else
  pass "no comparison uses a bare 1500 or 1800 instead of the names"
fi

# THE CAP IS NOT TOUCHED BY THIS CARD AND MAY NOT BE. Forty five minutes is the
# owner's number in CLAUDE.md section 13.
if grep -q '^POC_MAX_SECONDS=2700' "$RUN_SH"; then
  pass "the 45 minute cap is unchanged, which this card is forbidden to touch"
else
  fail "POC_MAX_SECONDS is no longer 2700"
fi

# THE DECISION REACHES NO SEAM IT DOES NOT OWN. Every case above shadows gh,
# gh_bounded and git as tripwires; none of them may have been called.
for D in "$WORK"/sel-*; do
  if [ -s "$D/forbidden.txt" ]; then
    fail "the decision called gh or git directly in $(basename "$D")"
    cat "$D/forbidden.txt"
  fi
done
pass "no case reached gh, gh_bounded or git outside the seams"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "all harness cap assertions passed"
  exit 0
fi
echo "$FAILURES assertion(s) failed"
exit 1
