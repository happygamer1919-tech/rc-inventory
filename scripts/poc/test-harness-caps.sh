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

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "all harness cap assertions passed"
  exit 0
fi
echo "$FAILURES assertion(s) failed"
exit 1
