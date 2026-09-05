#!/bin/bash
#
# POC unattended run harness. See docs/poc/DESIGN.md for the design of record
# and CLAUDE.md section 13 for the caps this script enforces.
#
# Invoked by launchd four times a day. Safe to invoke by hand.
#
# Conventions this file holds to, deliberately:
#   - absolute paths only, never a tilde, because launchd does not expand one
#   - $(...) for substitution, never a backtick
#   - no value from the secrets file is ever echoed, logged or committed
#
set -u -o pipefail

# ---------------------------------------------------------------------------
# Paths and caps. One source of truth; the plist carries none of these.
# ---------------------------------------------------------------------------
POC_REPO_MAIN=/Users/ivan/rc-inventory
POC_RUN_WORKTREE=/Users/ivan/rc-inventory-poc-run
POC_LOG_DIR=/Users/ivan/rc-poc-logs
POC_LOCK_FILE=/Users/ivan/rc-poc-logs/run.lock
POC_SECRETS_FILE=/Users/ivan/rc-secrets/phase2.env
# AUT-16. THE BOARD SET, READ FROM THE ONE PLACE THAT DEFINES IT.
#
# This was a single path to the phase 2 board while every run since 2026-08-30
# worked the phase 3 board. The eligible-card line, the CLAIM_SKIPPED set put in
# the prompt, the claim written at the end of a run and the silence rule were
# all computed against a board nobody was working: docs/poc/state.json carries a
# claim on AUT-10 written at the end of a run that spent its time on P3-11.
#
# POC_BOARDS is a space separated list, phase 3 first. It is filled after the
# worktree is prepared, from scripts/poc/boards.mjs, because that file is the
# single definition and a fourth board must be a one-line change there.
POC_BOARDS=""
POC_STATE=docs/poc/state.json

POC_MAX_CARDS=2
POC_MAX_SECONDS=2700          # 45 minutes, hard, wall clock
POC_MERGE_WAIT_SECONDS=900    # wall clock a run will wait on a quality check
POC_GH_TIMEOUT_SECONDS=45     # per gh call, so one hung API call cannot eat a run
POC_CLAIM_TTL_SECONDS=21600   # 6 hours, how long another actor's claim is honoured

# TRIAGE's cap lives here with the others rather than beside its invocation,
# because the lock's staleness threshold below is computed from it and a
# constant that two places need cannot be defined at the second one.
#
# RAISED from 900 to 1800 on 2026-08-28. 900 was not enough: on run
# 20260827-220052 TRIAGE opened PR #83 at 10:57:07Z, fourteen and a half minutes
# in, and the watchdog killed it 27 seconds later, before it could write the
# report that carried its eight rulings. The PR survived, the reasoning did not.
# 1800 is twice what that run needed to reach PR creation, and the worst case
# run still fits the three hour gap between windows: see POC_RUN_TOTAL_CAP_SECONDS.
POC_TRIAGE_MAX_SECONDS=${POC_TRIAGE_MAX_SECONDS:-1800}

# How often a watchdog re-reads the clock. Short enough that an overrun is cut
# within half a minute of the deadline, long enough to cost nothing.
POC_WATCHDOG_POLL_SECONDS=15
# Grace between TERM and KILL, for the model process and for a stale lock holder.
POC_KILL_GRACE_SECONDS=20

# The whole run's declared cap, which is what the lock advertises to the next
# run and what that run measures staleness against. Every bounded step this
# script can spend wall clock in, added up: the executor, TRIAGE, and two merge
# waits, one for the leftover sweep and one for this run's own state PR.
POC_RUN_TOTAL_CAP_SECONDS=$(( POC_MAX_SECONDS + POC_TRIAGE_MAX_SECONDS + POC_MERGE_WAIT_SECONDS * 2 ))
# Added to that cap before a lock counts as abandoned. The sum is 7200s, two
# hours, which is inside the three hour gap between windows: a run that dies
# holding the lock costs at most the one window it died in.
POC_LOCK_STALE_MARGIN_SECONDS=900

# launchd hands over a minimal PATH. node lives under mise, gh and git under
# homebrew, claude under a user-local bin. All four are named explicitly so the
# scheduled run behaves exactly like the manual one.
PATH=/Users/ivan/.local/bin:/Users/ivan/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

RUN_ID=$(date +%Y%m%d-%H%M%S)
RUN_STARTED_AT=$(date +%s)
LOG_FILE=$POC_LOG_DIR/$RUN_ID.log
EXIT_CODE=0
LOCK_HELD=no

mkdir -p "$POC_LOG_DIR"

# Everything from here is both on screen and in the log.
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

# ---------------------------------------------------------------------------
# Deadlines, not countdowns. Read this before touching any timing in this file.
#
# `sleep N` on macOS is nanosleep, which is backed by mach_absolute_time, and
# mach_absolute_time DOES NOT ADVANCE WHILE THE SYSTEM IS SUSPENDED. So a
# background `sleep 2700` does not measure 45 minutes of wall clock on a laptop
# that suspends. It measures 45 minutes of AWAKE time, and on a machine that
# spends the night asleep those are different numbers by an order of magnitude.
#
# Run 20260827-220052 is the proof. The executor was invoked at 02:00:52Z with
# `cap 2700s` and returned at 10:42:32Z, 31300 seconds of wall clock later,
# having reported `capped no`, with its `sleep 2700` watchdog still resident and
# most of its countdown still to go. `pmset -g log` over that window accounts
# for 29853 seconds asleep against roughly 664 seconds awake. The watchdog was
# not broken and it was not slow; it had been given about eleven minutes of the
# forty five it was waiting for. The run held the lock for nine hours and the
# 01:00, 04:00 and 07:00 windows never happened.
#
# `date +%s` is CLOCK_REALTIME and does advance across a suspend. So every
# bounded wait in this file now stores a deadline and polls the clock against
# it. A suspend simply makes one poll interval long; the poll after it reads the
# real time, finds the deadline already passed, and acts.
#
# RULE, from docs/LEARNINGS.md: any timeout that must hold across a
# suspend/resume boundary is a deadline comparison, never a sleep.
# ---------------------------------------------------------------------------

# EXTRACT-BEGIN deadline-helpers
# Everything between this marker and EXTRACT-END is lifted verbatim by
# scripts/poc/test-harness-caps.sh and exercised there. Keep it free of anything
# that depends on the rest of this file.
#
# Poll until PID exits or the deadline passes. 0 means the process is gone,
# 1 means the deadline came first.
wait_for_exit() {
  WFE_PID=$1
  WFE_DEADLINE=$2
  while kill -0 "$WFE_PID" 2>/dev/null; do
    [ "$(date +%s)" -ge "$WFE_DEADLINE" ] && return 1
    sleep "$POC_WATCHDOG_POLL_SECONDS"
  done
  return 0
}

# TERM, then KILL if it lingers. The grace is a deadline for the same reason
# everything else here is.
stop_pid() {
  SP_PID=$1
  kill -TERM "$SP_PID" 2>/dev/null
  if ! wait_for_exit "$SP_PID" "$(( $(date +%s) + POC_KILL_GRACE_SECONDS ))"; then
    kill -KILL "$SP_PID" 2>/dev/null
  fi
}

# The watchdog body, run in the background beside a model process. Writes its
# own line into that process's log so the fact of the cap survives in the file
# the run prints, and not only in this script's memory.
watchdog() {
  WD_PID=$1
  WD_DEADLINE=$2
  WD_LOG=$3
  WD_LABEL=$4
  if wait_for_exit "$WD_PID" "$WD_DEADLINE"; then
    return 0
  fi
  echo "[watchdog] $WD_LABEL cap reached, stopping" >> "$WD_LOG"
  stop_pid "$WD_PID"
}
# EXTRACT-END deadline-helpers

# ---------------------------------------------------------------------------
# THE DEPLOYED-COPY DRIFT CHECK. Card AUT-21.
#
# WHAT IT IS FOR. Three scripts run from copies under /Users/ivan/rc-poc-bin,
# installed by scripts/poc/install.sh. The .mjs modules beside them are read out
# of a worktree pinned at origin/main and upgrade with every merge; the three
# deployed copies upgrade only when a human re-runs the installer. So the two
# halves of this harness do not move together, and NOTHING NOTICED.
#
# R-120 is the instance. Merging a fix to the selector did not fix the selector,
# because run.sh is a deployed copy, and the run that discovered it discovered it
# from its own dispatch rather than from anything in its log.
#
# IT REPORTS, IT NEVER RE-INSTALLS. A run that reinstalled its own harness would
# be rewriting the script it is currently executing, and bash reads a script
# incrementally from disk by byte offset, so the failure mode is a run that
# changes behaviour halfway through with nothing in the log to say so.
# install.sh stays a human-invoked command and CLAUDE.md 15 stays as written.
#
# A DRIFT IS AN ESCALATION, NOT A REFUSAL. The run continues. A stale run that
# says it is stale is strictly better than no run, and refusing to start would
# turn a reporting gap into an outage the first time somebody edited a script and
# forgot the reinstall, which is the exact situation this card was written about.
#
# THE LIST IS DERIVED, NOT TYPED. `install.sh --manifest` prints the pairs with
# absolute paths already resolved. A fourth agent added to that manifest joins
# this check with no second edit. AUT-16 removed three copies of a path list for
# this reason and a hardcoded list here would re-create the same defect smaller.
#
# BYTES, NOT MTIMES. install.sh gives every file it copies a new mtime and
# identical content, and a file that was edited and copied has both, so mtime
# answers a different question than the one being asked.
#
# HOW IT IS TESTED. The four `drift_*` seams below are the only place the
# manifest, the hasher or the clock is reached. scripts/poc/test-install.sh lifts
# this block verbatim by its fences and drives it against a CONSTRUCTED install
# root, never /Users/ivan/rc-poc-bin.
# ---------------------------------------------------------------------------

# EXTRACT-BEGIN drift-check

# Seam 1. The manifest, from install.sh itself. One row per deployed artefact,
# `LABEL|SOURCE|DESTINATION|MODE|DESCRIPTION`, absolute paths, nothing written.
drift_manifest() {
  bash "$1" --manifest 2>/dev/null
}

# Seam 2. The sha256 of a file, or nothing when it cannot be read.
#
# TWO BINARIES BECAUSE TWO OPERATING SYSTEMS. macOS ships `shasum` and no
# `sha256sum`; ubuntu-latest ships both. Picked once, per call, rather than
# assumed, because a missing hasher must read as "cannot tell" and not as "the
# files match".
drift_sha256() {
  [ -f "$1" ] || return 1
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  else
    return 1
  fi
}

drift_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# THE COMPARISON.
#
# Sets DRIFT_REPORT to one line per drifted file, empty when nothing drifted, and
# DRIFT_COUNT to the number of files compared. Both are read by drift_escalate.
#
# ONLY THE SCRIPTS ARE COMPARED, WHICH IS THE CARD'S OWN LIST OF THREE, and the
# manifest's 644 rows are the plists. They are selected by MODE rather than by
# name so a fourth script joins automatically. The plists are deployed copies too
# and can drift in exactly the same way; that is recorded on the card as a finding
# rather than built here, because the card names three files.
#
# A FILE THAT CANNOT BE HASHED IS REPORTED, NOT SKIPPED. A missing deployed copy
# means the installer never ran for it, which is a louder version of the same
# fault, and docs/LEARNINGS.md already names the class: a matcher whose empty
# result means "nothing to do" has to assert its input count against its match
# count. This one does, below.
drift_detect() {
  DD_INSTALL_SH=$1
  DRIFT_REPORT=""
  DRIFT_COUNT=0
  DD_ROWS=0

  DD_MANIFEST=$(drift_manifest "$DD_INSTALL_SH")
  if [ -z "$DD_MANIFEST" ]; then
    log "drift check: install.sh printed no manifest, so nothing could be compared"
    return 0
  fi

  while IFS='|' read -r DD_LABEL DD_SRC DD_DEST DD_MODE DD_DESC; do
    [ -z "${DD_MODE:-}" ] && continue
    DD_ROWS=$(( DD_ROWS + 1 ))
    [ "$DD_MODE" = 755 ] || continue

    DD_A=$(drift_sha256 "$DD_SRC" || true)
    DD_B=$(drift_sha256 "$DD_DEST" || true)
    DRIFT_COUNT=$(( DRIFT_COUNT + 1 ))

    if [ -z "$DD_A" ]; then
      log "drift check: DRIFT $DD_DEST repo=unreadable deployed=${DD_B:0:12}"
      DRIFT_REPORT="$DRIFT_REPORT$DD_DEST repo=unreadable deployed=${DD_B:0:12}; "
      continue
    fi
    if [ -z "$DD_B" ]; then
      log "drift check: DRIFT $DD_DEST repo=${DD_A:0:12} deployed=absent"
      DRIFT_REPORT="$DRIFT_REPORT$DD_DEST repo=${DD_A:0:12} deployed=absent; "
      continue
    fi
    if [ "$DD_A" != "$DD_B" ]; then
      log "drift check: DRIFT $DD_DEST repo=${DD_A:0:12} deployed=${DD_B:0:12}"
      DRIFT_REPORT="$DRIFT_REPORT$DD_DEST repo=${DD_A:0:12} deployed=${DD_B:0:12}; "
    fi
  done <<< "$DD_MANIFEST"

  # THE COUNT ASSERTION. A manifest that parsed to zero comparable rows would
  # report "no drift" about work it never did, which is indistinguishable in
  # every log from a clean installation.
  if [ "$DRIFT_COUNT" -eq 0 ]; then
    log "drift check: the manifest has $DD_ROWS row(s) and NONE were comparable, so nothing was checked"
    return 0
  fi

  if [ -z "$DRIFT_REPORT" ]; then
    log "drift check: $DRIFT_COUNT deployed script(s) match the repository byte for byte"
  else
    log "drift check: the deployed harness DIFFERS from the repository. Re-run scripts/poc/install.sh."
  fi
  return 0
}

# THE ESCALATION, WRITTEN INTO state.json.
#
# SEPARATE FROM THE DETECTION, AND THE REASON IS THE RUN ORDER. The comparison has
# to happen while the worktree is at origin/main, early, so the run log carries it
# even if the run is killed later. state.json is edited much later, on the state
# branch, and step 3 hard resets the worktree in between: an escalation written
# early would be discarded by that reset without a word.
drift_escalate() {
  DE_STATE=$1
  [ -n "${DRIFT_REPORT:-}" ] || return 0
  [ -f "$DE_STATE" ] || { log "drift check: $DE_STATE is not there, escalation not written"; return 0; }

  node -e '
    const fs = require("fs");
    const [path, report, runId, at] = process.argv.slice(1);
    const state = JSON.parse(fs.readFileSync(path, "utf8"));
    state.escalations = (state.escalations || []).concat([{
      card_id: "AUT-21",
      question: "The harness copies installed on this machine differ from the ones in the repository: "
        + report.replace(/;\s*$/, "") + ". This run followed the installed copies.",
      recommendation: "Re-run scripts/poc/install.sh on the machine. Nothing here re-installs itself, "
        + "on purpose: a run that rewrote the script it is executing would change behaviour halfway through.",
      raised_at: at,
      run_id: runId,
    }]);
    fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  ' "$DE_STATE" "$DRIFT_REPORT" "${RUN_ID:-unknown}" "$(drift_now)"

  log "drift check: escalation appended to $DE_STATE"
  return 0
}
# EXTRACT-END drift-check

# ---------------------------------------------------------------------------
# The lock. A run never starts while another holds it, unless the lock is stale.
# CLAUDE.md section 13.
# ---------------------------------------------------------------------------
release_lock() {
  if [ "$LOCK_HELD" = yes ]; then
    rm -f "$POC_LOCK_FILE"
    LOCK_HELD=no
    log "lock released"
  fi
}
trap 'release_lock' EXIT INT TERM

# EXTRACT-BEGIN lock
# Lifted verbatim by scripts/poc/test-harness-caps.sh. The only things it reads
# from outside this block are POC_LOCK_FILE, RUN_ID, RUN_STARTED_AT,
# POC_RUN_TOTAL_CAP_SECONDS, POC_LOCK_STALE_MARGIN_SECONDS, POC_KILL_GRACE_SECONDS
# and the deadline helpers above, all of which the test supplies.
#
# One key=value per line, so the next run can read a field rather than a blob.
lock_field() {
  sed -n "s/^$1=//p" "$POC_LOCK_FILE" 2>/dev/null | head -1
}

# Empty or non-numeric falls back to the second argument. A lock written by an
# older run.sh has no started_epoch and no cap_seconds, and must still be
# readable rather than treated as fresh forever.
lock_number() {
  LN_VALUE=$(lock_field "$1")
  case "$LN_VALUE" in
    ''|*[!0-9]*) echo "$2" ;;
    *) echo "$LN_VALUE" ;;
  esac
}

LOCK_RECLAIMED=no

if [ -e "$POC_LOCK_FILE" ]; then
  LOCK_RUN=$(lock_field run_id)
  LOCK_PID=$(lock_field pid)
  LOCK_PGID=$(lock_field pgid)
  # started_epoch is what this run.sh writes. The file's mtime is the fallback
  # for a lock written before that field existed, and is the same instant
  # anyway because the file is written once and never touched again.
  LOCK_STARTED=$(lock_number started_epoch "")
  # Validated again after every fallback rather than once at the end, because
  # the wrong answer here is not an error, it is the number zero seconds of age.
  # `stat -f %m` is the BSD spelling this machine uses; on GNU coreutils `-f`
  # means the FILE SYSTEM and `%m` its mount point, so it succeeds and answers
  # "/". Both spellings are tried and each result is checked for being a number,
  # so a lock in the pre-2026-08-28 format is aged correctly rather than looking
  # brand new forever, which is the one failure mode this whole block exists to
  # remove. Proved on ubuntu in scripts/poc/test-harness-caps.sh, case 3d.
  case "$LOCK_STARTED" in
    ''|*[!0-9]*) LOCK_STARTED=$(stat -f %m "$POC_LOCK_FILE" 2>/dev/null) ;;
  esac
  case "$LOCK_STARTED" in
    ''|*[!0-9]*) LOCK_STARTED=$(stat -c %Y "$POC_LOCK_FILE" 2>/dev/null) ;;
  esac
  case "$LOCK_STARTED" in
    ''|*[!0-9]*) LOCK_STARTED=$RUN_STARTED_AT ;;
  esac
  # THE HOLDER'S OWN DECLARED CAP, not this run's. A lock is judged against the
  # budget the run that took it advertised, so raising a cap here can never
  # retroactively make a live run look abandoned.
  LOCK_CAP=$(lock_number cap_seconds "$POC_RUN_TOTAL_CAP_SECONDS")
  LOCK_AGE=$(( RUN_STARTED_AT - LOCK_STARTED ))
  LOCK_STALE_AT=$(( LOCK_CAP + POC_LOCK_STALE_MARGIN_SECONDS ))

  if [ "$LOCK_AGE" -lt "$LOCK_STALE_AT" ]; then
    log "run $RUN_ID refused: lock held by run ${LOCK_RUN:-unknown}, pid ${LOCK_PID:-unknown}"
    log "lock age ${LOCK_AGE}s against a declared cap of ${LOCK_CAP}s plus a ${POC_LOCK_STALE_MARGIN_SECONDS}s margin, stale in $(( LOCK_STALE_AT - LOCK_AGE ))s"
    log "exit 0, this is a refusal and not a failure"
    exit 0
  fi

  # -------------------------------------------------------------------------
  # Stale lock reclaim. A refusal is only correct while the holder is inside the
  # budget it declared. Past that it is not a running peer, it is wreckage, and
  # honouring it costs a window every three hours for as long as it lasts.
  #
  # Reclaiming is LOUD. Three windows were lost on 2026-08-28 and produced no
  # error output anywhere, which is the part that made it expensive: the lock
  # was held for nine hours and the only trace was a gap.
  # -------------------------------------------------------------------------
  log "STALE LOCK: run ${LOCK_RUN:-unknown} has held $POC_LOCK_FILE for ${LOCK_AGE}s, past its declared ${LOCK_CAP}s plus a ${POC_LOCK_STALE_MARGIN_SECONDS}s margin"

  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    # IDENTITY IS CHECKED BEFORE ANYTHING IS SIGNALLED. A pid recorded hours ago
    # may since have been recycled onto something entirely unrelated, and
    # killing whatever now happens to hold that number would be a far worse
    # fault than the one being repaired.
    LOCK_ARGS=$(ps -o args= -p "$LOCK_PID" 2>/dev/null)
    LOCK_LIVE_PGID=$(ps -o pgid= -p "$LOCK_PID" 2>/dev/null | tr -d ' ')
    case "$LOCK_ARGS" in
      *run.sh*)
        # The process group, not the pid, when the recorded pgid still matches
        # what the kernel reports. TERMing run.sh alone would leave the model
        # process it started running unsupervised, which is most of what was
        # actually consuming the machine.
        # Never our own group. launchd gives each instance of a label its own,
        # so this cannot normally match, and a signal that reached this run
        # would kill the reclaim halfway through.
        RECLAIM_SELF_PGID=$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')
        if [ -n "$LOCK_PGID" ] && [ "$LOCK_PGID" = "$LOCK_LIVE_PGID" ] \
           && [ "$LOCK_PGID" != "1" ] && [ "$LOCK_PGID" != "$RECLAIM_SELF_PGID" ]; then
          log "STALE LOCK: pid $LOCK_PID is this harness and still alive, stopping process group $LOCK_PGID"
          kill -TERM -"$LOCK_PGID" 2>/dev/null
          if ! wait_for_exit "$LOCK_PID" "$(( $(date +%s) + POC_KILL_GRACE_SECONDS ))"; then
            log "STALE LOCK: process group $LOCK_PGID ignored TERM, sending KILL"
            kill -KILL -"$LOCK_PGID" 2>/dev/null
          fi
        else
          log "STALE LOCK: pid $LOCK_PID is this harness and still alive, stopping it"
          stop_pid "$LOCK_PID"
        fi
        # Its EXIT trap runs release_lock on the way out, so by the time the pid
        # is gone the file is usually already gone. Waiting for the pid before
        # touching the file is what stops that trap from deleting the lock this
        # run is about to write.
        wait_for_exit "$LOCK_PID" "$(( $(date +%s) + POC_KILL_GRACE_SECONDS ))" || \
          log "STALE LOCK: pid $LOCK_PID is still alive after KILL, taking the lock anyway"
        ;;
      '')
        log "STALE LOCK: pid $LOCK_PID answers to signal 0 but has no readable command line, not touching it"
        ;;
      *)
        log "STALE LOCK: pid $LOCK_PID is alive but is NOT this harness, not touching it"
        log "STALE LOCK: that pid now runs: $LOCK_ARGS"
        ;;
    esac
  else
    log "STALE LOCK: pid ${LOCK_PID:-unknown} is gone, the lock is an orphan of a run that died without releasing it"
  fi

  rm -f "$POC_LOCK_FILE"
  LOCK_RECLAIMED=yes
  log "STALE LOCK RECLAIMED by run $RUN_ID"
fi

# cap_seconds is written so the NEXT run judges this one against the budget this
# one actually declared. pgid is written so a reclaim can stop the model process
# too and not just the shell that started it.
printf 'run_id=%s\npid=%s\npgid=%s\nstarted_at=%s\nstarted_epoch=%s\ncap_seconds=%s\n' \
  "$RUN_ID" "$$" "$(ps -o pgid= -p $$ | tr -d ' ')" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RUN_STARTED_AT" "$POC_RUN_TOTAL_CAP_SECONDS" > "$POC_LOCK_FILE"
LOCK_HELD=yes
log "run $RUN_ID started, lock taken, pid $$, declared cap ${POC_RUN_TOTAL_CAP_SECONDS}s"
# EXTRACT-END lock

# ---------------------------------------------------------------------------
# Secrets. The one permitted contact with that directory.
#
# TRACING IS SUPPRESSED ACROSS THIS ENTIRE BLOCK, and that is not belt and
# braces, it is the actual protection. Sourcing a secrets file under `set -x`
# traces every assignment in it, so one debug flag dumps the whole file: on
# 2026-08-27 a `bash -x` of this script printed TELEGRAM_BOT_TOKEN in full. The
# presence check below is inside the suppression for the same reason, because
# `[ -n "$SECRET" ]` expands the value into the traced command word.
# ---------------------------------------------------------------------------
case "$-" in
  *x*) SECRETS_WAS_X=yes; set +x ;;
  *)   SECRETS_WAS_X=no ;;
esac

if [ ! -r "$POC_SECRETS_FILE" ]; then
  [ "$SECRETS_WAS_X" = yes ] && set -x
  log "FATAL: secrets file is not readable, cannot run"
  exit 1
fi

set -o allexport
# shellcheck disable=SC1090
. "$POC_SECRETS_FILE"
set +o allexport

# Presence recorded as a yes or no per NAME. The value never reaches a variable
# that is later expanded in a traced command.
SECRET_REPORT=""
for VAR_NAME in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID TELEGRAM_OWNER_ID; do
  if [ -n "${!VAR_NAME:-}" ]; then
    SECRET_REPORT="$SECRET_REPORT $VAR_NAME=set"
  else
    SECRET_REPORT="$SECRET_REPORT $VAR_NAME=UNSET"
  fi
done

[ "$SECRETS_WAS_X" = yes ] && set -x

log "secrets sourced, values not displayed"
for ENTRY in $SECRET_REPORT; do log "env $ENTRY"; done

# ---------------------------------------------------------------------------
# The run worktree. Separate from the interactive clone on purpose: a scheduled
# run must never change the branch under a terminal somebody is using.
# ---------------------------------------------------------------------------
if [ ! -e "$POC_RUN_WORKTREE/.git" ]; then
  log "run worktree absent, creating $POC_RUN_WORKTREE"
  git -C "$POC_REPO_MAIN" fetch origin --prune --quiet
  if ! git -C "$POC_REPO_MAIN" worktree add --detach "$POC_RUN_WORKTREE" origin/main >/dev/null 2>&1; then
    log "FATAL: could not create the run worktree"
    exit 1
  fi
fi

cd "$POC_RUN_WORKTREE" || { log "FATAL: cannot enter $POC_RUN_WORKTREE"; exit 1; }

log "refreshing run worktree to origin/main"
git fetch origin --prune --quiet
# Detached on purpose: nothing here owns a branch name, so nothing here can
# collide with a branch another worktree has checked out.
git checkout --detach --force origin/main --quiet
git reset --hard origin/main --quiet
# -fd and not -fdx: ignored files such as node_modules and .env.local survive,
# so the run does not pay for a reinstall it does not need.
git clean -fd --quiet
log "run worktree at $(git rev-parse --short HEAD) detached from origin/main"

# AUT-21. THE DRIFT CHECK RUNS HERE, AS EARLY AS IT CAN.
#
# The worktree is at origin/main and nothing else has happened yet, so the log
# carries the comparison even if this run is killed before it reaches the state
# pull request. The escalation is appended much later, at step 5, because step 3
# hard resets this worktree and would discard anything written to state.json now.
#
# THE BLOCK ITSELF IS DEFINED ABOVE, WITH THE DEADLINE HELPERS, and not next to
# this call. bash resolves a function from what it has already read, so a block
# defined further down the file is a command not found here.
if [ -f "$POC_RUN_WORKTREE/scripts/poc/install.sh" ]; then
  drift_detect "$POC_RUN_WORKTREE/scripts/poc/install.sh"
else
  log "drift check: the checked out commit has no scripts/poc/install.sh, nothing compared"
fi

# AUT-16. Fill the board set now that the worktree holds the commit this run
# works from, so the list comes from that commit's boards.mjs rather than from a
# constant written here. A set that cannot be read is fatal: working a subset of
# the boards in silence is the exact defect this card removed.
POC_BOARDS=$(node "$POC_RUN_WORKTREE/scripts/poc/boards.mjs" --paths 2>/dev/null | tr '\n' ' ')
POC_BOARDS=${POC_BOARDS% }

# BOOTSTRAP, AND ONLY BOOTSTRAP. This file is a deployed copy under
# /Users/ivan/rc-poc-bin and the worktree is checked out at origin/main, so for
# one merge window a new run.sh meets a main that has no boards.mjs. Dying there
# would cost every scheduled window until the merge landed. It falls back to the
# phase boards present in that commit, newest phase first, and SAYS SO. The path
# stops firing the moment boards.mjs is on main.
if [ -z "$POC_BOARDS" ]; then
  log "the checked out commit predates scripts/poc/boards.mjs, falling back to the phase boards present in it"
  POC_BOARDS=$(cd "$POC_RUN_WORKTREE" && ls -1 docs/board/rc-board-phase*.json 2>/dev/null | sort -r | tr '\n' ' ')
  POC_BOARDS=${POC_BOARDS% }
fi

if [ -z "$POC_BOARDS" ]; then
  log "FATAL: no board set and no board file, refusing to run against nothing"
  EXIT_CODE=1
  exit 1
fi
log "board set: $POC_BOARDS"

# ---------------------------------------------------------------------------
# Merge helper. Waits, bounded, for the quality check on a head sha, then
# merges. Never merges on a check that is pending, failed, skipped or absent.
#
# --delete-branch is deliberately NOT used: it checks out the default branch in
# whichever working copy runs it, which would fight every other worktree on this
# machine. The remote branch is deleted explicitly instead.
# ---------------------------------------------------------------------------

# Every gh call in the wait loop is wrapped, because a hanging API call is what
# turned a 15 minute budget into 68 minutes of wall clock on 2026-08-27. bash
# has no per-command timeout and macOS ships no timeout(1), so the call runs in
# the background and is killed if it overruns.
gh_bounded() {
  GHB_OUT=$(mktemp)
  gh "$@" > "$GHB_OUT" 2>/dev/null &
  GHB_PID=$!
  # A deadline, not a countdown, for the reason given above the helpers. The old
  # `sleep 45` killer here had the same defect as the executor watchdog: a gh
  # call that hung across a suspend would not be killed for 45 AWAKE seconds,
  # and `wait` below would block the whole run for as long as that took. This
  # loop is inside merge_when_green, which is inside the lock, so a hang here is
  # exactly how a run ends up holding the lock overnight.
  ( wait_for_exit "$GHB_PID" "$(( $(date +%s) + POC_GH_TIMEOUT_SECONDS ))" || \
      kill -KILL "$GHB_PID" 2>/dev/null ) &
  GHB_KILLER=$!
  wait "$GHB_PID" 2>/dev/null
  kill "$GHB_KILLER" 2>/dev/null
  wait "$GHB_KILLER" 2>/dev/null
  cat "$GHB_OUT"
  rm -f "$GHB_OUT"
}

# The PR number on a branch, open or closed, empty when there is none or when
# the answer is not a number. Read from GitHub, never from what a model said it
# did: a session that intended to open a PR and a session that opened one look
# identical from inside this script.
# EXTRACT-BEGIN checkpoint
pr_for_branch() {
  PFB_NUMBER=$(gh_bounded pr list --head "$1" --state all --json number -q '.[0].number' \
    | tr -d '[:space:]')
  case "$PFB_NUMBER" in
    ''|*[!0-9]*) echo "" ;;
    *) echo "$PFB_NUMBER" ;;
  esac
}

# One checkpoint line, written at most once, to the run log AND to a file of its
# own. The run log is where a human looks; the separate file is what survives if
# this script is killed before it can finish writing anything else. Both are
# written the moment the fact is known, which is the entire point: a fact held
# until the end of a run is a fact lost whenever the run does not reach its end.
checkpoint_pr() {
  CKP_LINE="checkpoint run=$1 role=$2 pr=$3 branch=$4 report=$5"
  if ! grep -qF "$CKP_LINE" "$6" 2>/dev/null; then
    echo "$CKP_LINE" >> "$6"
    log "$CKP_LINE"
  fi
}
# EXTRACT-END checkpoint

# ---------------------------------------------------------------------------
# THE PULL REQUEST CENSUS. Card AUT-18.
#
# WHAT IT IS FOR. Finished work sits in an open pull request that nothing ever
# names again. On 2026-08-31 PR #133 went CONFLICTING with no `quality` run on
# its head sha at all, because a conflicting pull request triggers zero
# workflows, and PR #130 sat red on the End to end step for a whole run. Neither
# was named by anything. On 2026-09-01 a card branch was pushed and no pull
# request was ever opened, so no check ran and no list anywhere contained it.
#
# WHAT IT IS NOT. IT MERGES NOTHING AND MUST NEVER LEARN HOW. RST-02 owns the
# merge selector and its acceptance asserts that a `card/` branch is never
# selected for merging. This block READS every open pull request, card branches
# included, which is only safe because it merges none of them. It also never
# deletes a branch: a sweep that deleted branches could delete work that was
# never published, which is the exact loss this exists to prevent.
#
# THE TWO ESCALATING SHAPES, AND WHY THE AGE CONDITION IS ON ONLY ONE.
#   - CONFLICTING, at any age. A hard stop: no check can run, so nothing may
#     merge, whoever pushed it and whenever.
#   - NOT GREEN on a head commit that PREDATES this run's start. Absent, failed
#     and still pending all count as not green, because no merge may rest on any
#     of them. The age condition is what separates a stuck pull request from a
#     card being actively worked: a card pull request is red for most of its
#     life and escalating that every run trains the reader to skip the list.
#
# CLAUSE 4 STARTS FROM BRANCHES, NOT FROM PULL REQUESTS, and that is the whole
# point of it. Every other sweep here begins with the pull request list, so a
# branch that never got a pull request appears in no input anywhere. This one
# lists remote branches and SUBTRACTS the ones that have a pull request or are
# already in main. MERGED MEANS MERGED BY ANY ROUTE: a squash merge leaves a
# head sha that is absent from main, so the ancestor test alone would report
# every squash-merged branch forever, which is how a report gets ignored.
#
# HOW IT IS TESTED. The five `census_*` seams below are the only place gh or git
# is touched. scripts/poc/test-pr-census.sh lifts this block verbatim by its
# fences, replaces the seams with fixtures, and asserts the census lines and the
# escalations without a network, a gh binary or a remote. It also stubs
# `merge_when_green` and `gh` and asserts neither is called.
#
# It needs `log` and, for the real seams only, `gh_bounded`. Both are defined
# above. No credential is read, printed or logged anywhere in here.
# ---------------------------------------------------------------------------

# EXTRACT-BEGIN pr-census

# Seam 1. One line per open pull request:
#   number <TAB> headRefName <TAB> headRefOid <TAB> mergeStateStatus
census_pr_list() {
  gh_bounded pr list --state open --limit 100 \
    --json number,headRefName,headRefOid,mergeStateStatus \
    -q '.[] | [.number, .headRefName, .headRefOid, .mergeStateStatus] | @tsv'
}

# Seam 2. What `quality` concluded ON THIS EXACT HEAD SHA. Never a pull request
# level summary: `gh pr checks` happily reports a result that belongs to an
# earlier commit, which is CLAUDE.md section 3's stale-green trap.
# One of SUCCESS, FAILURE, PENDING, ABSENT.
census_quality_for_sha() {
  CQS_RAW=$(gh_bounded api "repos/{owner}/{repo}/commits/$1/check-runs" \
    -q '.check_runs[] | select(.name == "quality") | (.conclusion // .status)' \
    2>/dev/null | head -1 | tr -d '[:space:]')
  census_normalise_quality "$CQS_RAW"
}

# The normaliser is separate from the fetch so the mapping is testable on its
# own and so a fixture can feed a raw GitHub word rather than a decision.
census_normalise_quality() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    '')                       echo ABSENT ;;
    success)                  echo SUCCESS ;;
    queued|in_progress|pending|waiting|requested)
                              echo PENDING ;;
    *)                        echo FAILURE ;;
  esac
}

# Seam 3. Committer epoch of a sha, or empty. git first, because after a fetch
# every origin ref is local and that costs no API call.
census_commit_epoch() {
  CCE=$(git show -s --format=%ct "$1" 2>/dev/null | tr -d '[:space:]')
  case "$CCE" in
    ''|*[!0-9]*)
      CCE=$(gh_bounded api "repos/{owner}/{repo}/commits/$1" \
        -q '.commit.committer.date' 2>/dev/null | tr -d '[:space:]')
      [ -n "$CCE" ] && CCE=$(date -j -f %Y-%m-%dT%H:%M:%SZ "$CCE" +%s 2>/dev/null \
        || date -d "$CCE" +%s 2>/dev/null)
      ;;
  esac
  case "$CCE" in
    ''|*[!0-9]*) echo "" ;;
    *) echo "$CCE" ;;
  esac
}

# Seam 4. One line per remote branch: branch <TAB> sha. `main` and the symbolic
# HEAD are dropped here rather than at the call site, so no caller can forget.
census_branch_list() {
  git for-each-ref --format='%(refname:strip=3)%09%(objectname)' refs/remotes/origin 2>/dev/null \
    | awk -F'\t' '$1 != "HEAD" && $1 != "main"'
}

# Seam 5. Is this branch already in main BY ANY ROUTE. Ancestor first; a squash
# merge rewrites the sha, so a merged pull request for the branch counts too.
census_branch_merged() {
  if git merge-base --is-ancestor "$2" origin/main 2>/dev/null; then
    return 0
  fi
  CBM=$(gh_bounded pr list --head "$1" --state merged --limit 1 --json number \
    -q '.[0].number' 2>/dev/null | tr -d '[:space:]')
  case "$CBM" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# One escalation row on docs/poc/state.json. The digest is what carries it to
# Ivan, and section 13's escalation rubric makes the recommendation mandatory.
# The same pull request escalating on consecutive runs is CORRECT and is not
# deduplicated across runs: a stuck pull request that goes quiet after the first
# night is the failure this whole block exists to stop.
census_escalate() {
  node -e '
    const fs = require("fs");
    const [path, cardId, question, recommendation, at, runId] = process.argv.slice(1);
    const state = JSON.parse(fs.readFileSync(path, "utf8"));
    state.escalations = (state.escalations || []).concat([{
      card_id: cardId || null,
      question,
      recommendation,
      raised_at: at,
      run_id: runId,
    }]);
    fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  ' "$1" "$2" "$3" "$4" "$5" "$6"
}

# The census itself.
#   $1 path to state.json   $2 this run's start, epoch seconds
#   $3 run id               $4 ISO timestamp for raised_at
# Always writes census lines, even when nothing escalates: a run that reported
# nothing must never look identical to a run with no open pull requests, which
# is CLAUDE.md section 13's silence rule applied to pull requests.
run_pr_census() {
  RPC_STATE=$1
  RPC_RUN_START=$2
  RPC_RUN_ID=$3
  RPC_AT=$4
  RPC_ESCALATED=0
  RPC_SEEN=0

  RPC_PRS=$(census_pr_list)

  while IFS=$'\t' read -r RPC_NUM RPC_BRANCH RPC_SHA RPC_MERGE; do
    [ -z "${RPC_NUM:-}" ] && continue
    RPC_SEEN=$(( RPC_SEEN + 1 ))
    RPC_Q=$(census_quality_for_sha "$RPC_SHA")
    RPC_EPOCH=$(census_commit_epoch "$RPC_SHA")
    # An unknown commit time is treated as OLD. The alternative silently
    # suppresses an escalation, and a census that fails quiet is the thing
    # being replaced.
    case "$RPC_EPOCH" in ''|*[!0-9]*) RPC_EPOCH=0 ;; esac
    if [ "$RPC_EPOCH" -ge "$RPC_RUN_START" ]; then
      RPC_PUSHED=this-run
    else
      RPC_PUSHED=earlier
    fi

    log "pr census: pr=#$RPC_NUM branch=$RPC_BRANCH head=$RPC_SHA merge_state=$RPC_MERGE quality=$RPC_Q pushed=$RPC_PUSHED"

    RPC_REASON=""
    # GitHub says CONFLICTING on `mergeable` and DIRTY on `mergeStateStatus`
    # for the same condition. Both are accepted so the seam can be fed either.
    case "$RPC_MERGE" in
      CONFLICTING|DIRTY)
        RPC_REASON="it conflicts with main, so no workflow runs on its head sha and nothing may merge on it"
        ;;
      *)
        if [ "$RPC_PUSHED" = earlier ] && [ "$RPC_Q" != SUCCESS ]; then
          RPC_REASON="its head commit predates this run and quality on that head sha is $RPC_Q, so no merge may rest on it"
        fi
        ;;
    esac

    if [ -n "$RPC_REASON" ]; then
      log "pr census: ESCALATING #$RPC_NUM, $RPC_REASON"
      census_escalate "$RPC_STATE" "PR-$RPC_NUM" \
        "Pull request #$RPC_NUM on branch $RPC_BRANCH (head $RPC_SHA) was left open by run $RPC_RUN_ID: $RPC_REASON." \
        "Resolve it locally per CLAUDE.md section 3: a conflicting pull request is rebuilt on a fresh branch by EXECUTOR, and a red or absent quality run is re-run and read on the head sha before anything merges. Doing nothing leaves the work unpublished." \
        "$RPC_AT" "$RPC_RUN_ID"
      RPC_ESCALATED=$(( RPC_ESCALATED + 1 ))
    fi
  done <<RPC_PR_EOF
$RPC_PRS
RPC_PR_EOF

  [ "$RPC_SEEN" -eq 0 ] && log "pr census: no open pull requests"

  # --- clause 4: branches with no pull request at all ---
  RPC_PR_BRANCHES=$(printf '%s\n' "$RPC_PRS" | awk -F'\t' 'NF > 1 { print $2 }')
  RPC_BSEEN=0

  while IFS=$'\t' read -r RPC_B RPC_BSHA; do
    [ -z "${RPC_B:-}" ] && continue
    [ -z "${RPC_BSHA:-}" ] && continue
    printf '%s\n' "$RPC_PR_BRANCHES" | grep -qxF "$RPC_B" && continue
    census_branch_merged "$RPC_B" "$RPC_BSHA" && continue

    RPC_BEPOCH=$(census_commit_epoch "$RPC_BSHA")
    case "$RPC_BEPOCH" in ''|*[!0-9]*) RPC_BEPOCH=0 ;; esac
    if [ "$RPC_BEPOCH" -ge "$RPC_RUN_START" ]; then
      RPC_BPUSHED=this-run
      RPC_BAGE=0
    else
      RPC_BPUSHED=earlier
      RPC_BAGE=$(( (RPC_RUN_START - RPC_BEPOCH) / 86400 ))
    fi
    RPC_BSEEN=$(( RPC_BSEEN + 1 ))

    log "branch census: branch=$RPC_B head=$RPC_BSHA age_days=$RPC_BAGE pr=none pushed=$RPC_BPUSHED"

    if [ "$RPC_BPUSHED" = earlier ]; then
      log "branch census: ESCALATING $RPC_B, pushed with no pull request"
      census_escalate "$RPC_STATE" "BRANCH-$RPC_B" \
        "Branch $RPC_B (head $RPC_BSHA, $RPC_BAGE days old) is pushed to origin, is not merged into main, and has no open pull request, so no check has ever run on it and nothing reports it." \
        "Open a pull request for it, or confirm the work is abandoned and say so in a report. Never delete the branch from a scheduled run: unpublished work is exactly what would be lost." \
        "$RPC_AT" "$RPC_RUN_ID"
      RPC_ESCALATED=$(( RPC_ESCALATED + 1 ))
    fi
  done <<RPC_BR_EOF
$(census_branch_list)
RPC_BR_EOF

  [ "$RPC_BSEEN" -eq 0 ] && log "branch census: every remote branch is merged or has a pull request"

  log "pr census: $RPC_SEEN open pull request(s), $RPC_BSEEN unpublished branch(es), $RPC_ESCALATED escalation(s), 0 merges"
  return 0
}
# EXTRACT-END pr-census

# ---------------------------------------------------------------------------
# WHICH REPORT THE REVIEW STEP IS HANDED. Card AUT-17.
#
# The old selection was `git ls-tree ... | sort | tail -1` and had three defects
# in two lines. It sorted FILENAMES, so two reports written on the same day were
# ordered by their slug and the one committed SECOND could sort first. It read
# origin/main only, so the report riding in an unmerged card pull request was
# invisible, which is exactly the shape a card whose acceptance failed leaves
# behind. And it never asked what the last review had already consumed, so the
# same report could be reviewed twice, producing two sets of ids saying the same
# thing about one file, on a green pull request, with nothing erroring.
#
# NOTHING HERE WEAKENS `NO REPORT MEANS NO TRIAGE`. When every candidate is
# already recorded as consumed the selector returns nothing and the step is
# skipped. A run with nothing to review is a normal outcome; a run that reviews
# the same report twice is not.
# ---------------------------------------------------------------------------
# EXTRACT-BEGIN triage-selector
# Every executor report reachable from a ref, NEWEST FIRST BY COMMIT ORDER.
# $1 is a git revision range or a single ref.
triage_reports_in() {
  git log --format='%H' "$1" -- docs/reports/ 2>/dev/null \
    | while IFS= read -r TRI_SHA; do
        git show --pretty=format: --name-only "$TRI_SHA" -- docs/reports/ 2>/dev/null
      done \
    | grep -E '^docs/reports/[0-9]{4}-[0-9]{2}-[0-9]{2}-executor-[a-z0-9-]+\.md$' \
    | awk 'NF && !seen[$0]++'
}

# The report field and the run id of docs/poc/triage-latest.json, on two lines.
#
# IT FAILS OPEN, DELIBERATELY. An absent or unparseable file means nothing is
# treated as consumed. That costs one duplicate review; failing closed would
# cost every review from then on.
triage_consumed_report() {
  if [ ! -f "$1" ]; then
    log "triage: no $1, treating nothing as already reviewed" >&2
    return 0
  fi
  node -e '
    const fs = require("fs");
    try {
      const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(String(j.report || "") + "\n" + String(j.run_id || "") + "\n");
    } catch (e) {
      process.stderr.write("unparseable\n");
    }
  ' "$1" 2>/dev/null || true
}

# The whole selection.
#   $1  path of docs/poc/triage-latest.json
#   $2  the ref this run's own executor left its work on, usually HEAD
#
# PREFERENCE ORDER: the report this run's own executor committed wins over the
# newest on origin/main, always, even when the branch report is older by commit
# time. The review step exists to read what THIS run produced.
select_triage_report() {
  STR_LATEST=$1
  STR_REF=${2:-HEAD}
  STR_PAIR=$(triage_consumed_report "$STR_LATEST")
  STR_CONSUMED=$(printf '%s\n' "$STR_PAIR" | sed -n 1p)
  STR_CONSUMED_RUN=$(printf '%s\n' "$STR_PAIR" | sed -n 2p)
  STR_PICK=""

  STR_CANDIDATES=$( { triage_reports_in "origin/main..$STR_REF"; \
                      triage_reports_in origin/main; } | awk 'NF && !seen[$0]++' )

  while IFS= read -r STR_C; do
    [ -n "$STR_C" ] || continue
    if [ -n "$STR_CONSUMED" ] && [ "$STR_C" = "$STR_CONSUMED" ]; then
      log "triage: $STR_C was already reviewed by run ${STR_CONSUMED_RUN:-unknown}, refusing to review it twice" >&2
      continue
    fi
    STR_PICK=$STR_C
    break
  done <<STR_EOF
$STR_CANDIDATES
STR_EOF

  printf '%s\n' "$STR_PICK"
}
# EXTRACT-END triage-selector

merge_when_green() {
  MWG_PR=$1
  MWG_BRANCH=$2
  # Wall clock, not a count of sleeps. The old version incremented a counter by
  # 30 per iteration and assumed each iteration cost 30 seconds. When the gh
  # calls inside the loop hung, 30 iterations took 68 minutes against a 900
  # second budget and ate most of a 45 minute run before EXECUTOR had started.
  MWG_DEADLINE=$(( $(date +%s) + POC_MERGE_WAIT_SECONDS ))
  MWG_UPDATED=no

  while [ "$(date +%s)" -lt "$MWG_DEADLINE" ]; do
    MWG_STATE=$(gh_bounded pr view "$MWG_PR" --json mergeStateStatus -q .mergeStateStatus)
    MWG_QUALITY=$(gh_bounded pr checks "$MWG_PR" --json name,state \
      -q '.[] | select(.name == "quality") | .state' | head -1)

    case "$MWG_STATE" in
      DIRTY)
        log "PR #$MWG_PR conflicts with main, leaving it open for a human"
        return 1
        ;;
      BEHIND)
        # Branch protection on main sets required_status_checks.strict, so a
        # branch that is behind cannot merge no matter how green it is. The old
        # version called gh pr merge anyway, got refused, and left the PR open
        # to fail identically on every future run. PR #44 sat stuck for three
        # runs that way and went from BEHIND to conflicting while it waited.
        if [ "$MWG_UPDATED" = yes ]; then
          log "PR #$MWG_PR is BEHIND again after an update, leaving it open"
          return 1
        fi
        log "PR #$MWG_PR is BEHIND main, updating the branch and re-waiting"
        if gh_bounded pr update-branch "$MWG_PR" >/dev/null; then
          MWG_UPDATED=yes
          # The update pushes a new head sha, so the quality run restarts.
          sleep 15
          continue
        fi
        log "PR #$MWG_PR could not be updated, leaving it open for a human"
        return 1
        ;;
    esac

    case "$MWG_QUALITY" in
      SUCCESS)
        log "PR #$MWG_PR quality is green, merging"
        if gh_bounded pr merge "$MWG_PR" --squash >/dev/null; then
          # mergedAt is asserted before the branch is deleted. A merge call that
          # returns without merging must never cost a branch: that mistake
          # closed two PRs on 2026-08-26.
          MWG_MERGED_AT=$(gh_bounded pr view "$MWG_PR" --json mergedAt -q .mergedAt)
          if [ -n "$MWG_MERGED_AT" ] && [ "$MWG_MERGED_AT" != "null" ]; then
            git push origin --delete "$MWG_BRANCH" >/dev/null 2>&1
            log "PR #$MWG_PR merged at $MWG_MERGED_AT, remote branch $MWG_BRANCH deleted"
            return 0
          fi
          log "PR #$MWG_PR reported no mergedAt, branch KEPT"
          return 1
        fi
        log "PR #$MWG_PR merge call failed, leaving it open"
        return 1
        ;;
      FAILURE|ERROR|CANCELLED)
        log "PR #$MWG_PR quality is $MWG_QUALITY, not merging"
        return 1
        ;;
      *)
        # Pending, or absent because Actions has not created the run yet.
        sleep 30
        ;;
    esac
  done

  log "PR #$MWG_PR still not green after ${POC_MERGE_WAIT_SECONDS}s of wall clock, leaving it open"
  return 1
}

# Leftovers first: a state or ruling PR the previous run opened and could not
# wait for is merged now, before this run reads the board.
log "checking for leftover poc PRs from earlier runs"
LEFTOVERS=$(gh pr list --state open --json number,headRefName \
  -q '.[] | select(.headRefName | startswith("poc/state-") or startswith("poc/ruling-")) | "\(.number) \(.headRefName)"' 2>/dev/null)
if [ -n "$LEFTOVERS" ]; then
  while read -r LO_PR LO_BRANCH; do
    [ -z "$LO_PR" ] && continue
    log "leftover PR #$LO_PR on $LO_BRANCH"
    merge_when_green "$LO_PR" "$LO_BRANCH"
  done <<< "$LEFTOVERS"
  git fetch origin --prune --quiet
  git checkout --detach --force origin/main --quiet
  git reset --hard origin/main --quiet
else
  log "no leftover poc PRs"
fi

# ---------------------------------------------------------------------------
# Step 1 of the run: the inbox. Ivan's answers become rulings BEFORE the work
# starts, so a card unblocked at 23:00 is worked at 01:00 and not at 04:00.
# ---------------------------------------------------------------------------
log "reading the Telegram inbox"
if [ -f "$POC_RUN_WORKTREE/scripts/poc/inbox.mjs" ]; then
  node "$POC_RUN_WORKTREE/scripts/poc/inbox.mjs" --run-id "$RUN_ID"
  log "inbox reader exit $?"
  git fetch origin --prune --quiet
  git checkout --detach --force origin/main --quiet
  git reset --hard origin/main --quiet
else
  log "inbox reader not present on this commit, skipping"
fi

# ---------------------------------------------------------------------------
# Step 2 of the run: the board, as EXECUTOR, under a hard wall clock cap.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Claim lease. The harness and a human terminal cannot see each other, so they
# agree through docs/poc/state.json instead. On 2026-08-27 EXECUTOR was working
# P2-09 by hand in the interactive clone while this harness picked up the same
# card in its own worktree, four times a day.
#
# --ids returns only cards nobody else has claimed inside the lease window.
# --ids-all returns every eligible card. The difference between them is exactly
# the set that was skipped because somebody else holds it.
# ---------------------------------------------------------------------------
# One --board flag PER BOARD. Not one packed argument: run.sh is a deployed copy
# and eligible.mjs is read out of the worktree at origin/main, so for one merge
# window a new run.sh meets an old eligible.mjs. An old flag parser keeps the
# LAST --board and computes against that board alone, which is what it did
# before; a packed string would have made it read a path that does not exist and
# report nothing eligible, which looks exactly like a finished board.
POC_BOARD_FLAGS=()
for POC_ONE_BOARD in $POC_BOARDS; do
  POC_BOARD_FLAGS+=(--board "$POC_ONE_BOARD")
done

ELIGIBLE_AT_START=$(node "$POC_RUN_WORKTREE/scripts/poc/eligible.mjs" \
  "${POC_BOARD_FLAGS[@]}" --state "$POC_STATE" --actor harness --ids 2>/dev/null)
ELIGIBLE_ALL=$(node "$POC_RUN_WORKTREE/scripts/poc/eligible.mjs" \
  "${POC_BOARD_FLAGS[@]}" --state "$POC_STATE" --actor harness --ids-all 2>/dev/null)
log "eligible at start: ${ELIGIBLE_AT_START:-none}"

CLAIM_SKIPPED=""
if [ "$ELIGIBLE_ALL" != "$ELIGIBLE_AT_START" ]; then
  CLAIM_SKIPPED=$(node "$POC_RUN_WORKTREE/scripts/poc/eligible.mjs" \
    "${POC_BOARD_FLAGS[@]}" --state "$POC_STATE" --actor harness --json 2>/dev/null \
    | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const v = JSON.parse(s);
          console.log(v.eligible.filter((e) => e.skip_reason)
            .map((e) => e.id + " (" + e.skip_reason + ")").join(", "));
        } catch { console.log(""); }
      });')
  log "SKIPPED, CLAIMED BY ANOTHER ACTOR: $CLAIM_SKIPPED"
fi

# The card this run intends to take. The claim itself is written into the state
# PR at the end of the run rather than here, because everything in this worktree
# is discarded by the hard reset that follows EXECUTOR.
#
# KNOWN LIMIT, stated rather than hidden: the harness's own claim becomes visible
# to other actors only when that state PR merges, so it does not protect against
# a human terminal that starts mid-run. It does record who worked the card, and
# the protection that matters in the other direction works fully: a human claims
# through scripts/poc/claim.sh before starting, that claim is on main, and the
# next run reads it and skips the card.
HARNESS_CARD=""
if [ -n "$ELIGIBLE_AT_START" ]; then
  HARNESS_CARD=$(echo "$ELIGIBLE_AT_START" | cut -d, -f1)
  log "intending to work $HARNESS_CARD, claim recorded in the end-of-run state PR"
fi

# The claim lease is computed BEFORE the prompt is written, because the prompt
# interpolates $CLAIM_SKIPPED to tell EXECUTOR which cards are off limits. With
# set -u an unset variable aborts the heredoc, which on 2026-08-27 produced a
# zero byte prompt file and an EXECUTOR invocation with no prompt at all:
# "Error: Input must be provided either through stdin or as a prompt argument".
# The run reported exit 1 having never actually started work.
PROMPT_FILE=$POC_LOG_DIR/$RUN_ID.prompt.txt
cat > "$PROMPT_FILE" <<PROMPT_EOF
You are EXECUTOR. Boot per CLAUDE.md.
Work the board.

This is an unattended scheduled run, run id $RUN_ID. CLAUDE.md section 13 binds
you. Restated so there is no ambiguity:

- Boot exactly as EXECUTOR. Print the status report before any write.
- Work at most $POC_MAX_CARDS cards this run. The third eligible card waits.
- You have 45 minutes of wall clock. The harness enforces it and will stop you
  where you stand. Do not start work you cannot finish and merge.
- If every unblocked card is shipped, do not idle and do not invent work.
  Invoke CRITIC against the acceptance lines instead, and report what it found.
- A card question the card's defaults do not answer: write the structured
  decision-needed text with its mandatory recommendation, set blocked_on to the
  person, set status blocked, commit the board, append the escalation to
  $POC_STATE, and move to the next eligible card. Never wait for an answer.
- Never apply a migration containing DROP TABLE, TRUNCATE or DELETE. Block the
  card on ivan with the offending statement quoted in question.
- Cards claimed by another actor are OFF LIMITS this run: $CLAIM_SKIPPED
  A claim is in docs/poc/state.json and expires after 6 hours. Never take a card
  another actor holds, even if it is the only eligible one. Report it instead.
- Never push to main. Never force push. Merge only on a green quality check
  that exists for the head sha.
- No secret value is ever echoed, logged, committed or put in a board field.

You are in the worktree $POC_RUN_WORKTREE, detached at origin/main. Work here
and nowhere else. Do not touch $POC_REPO_MAIN.

YOUR FINAL ACT IS TO COMMIT YOUR REPORT. CLAUDE.md section 9b: the file is the
original and what you print is a copy. Write the full report to
docs/reports/<YYYY-MM-DD>-executor-<slug>.md, commit it in a PR like everything
else, never straight to main, and only then print it. A report that exists only
in this terminal is a report the next role cannot read, and the digest carries
the path so somebody can open it.

The report says: cards touched and what happened to each, PRs opened or merged
with numbers, anything you escalated, and what the next run should pick up
first.
PROMPT_EOF

# Snapshot the board before the run touches it, so what moved can be worked out
# by comparison rather than inferred from a timestamp.
# One snapshot holding EVERY board in the set, keyed by path, so a card that
# moved on the second board is seen exactly as one that moved on the first.
BOARD_BEFORE=$POC_LOG_DIR/$RUN_ID.board-before.json
# shellcheck disable=SC2086
node -e '
  const fs = require("fs");
  const [target, ...paths] = process.argv.slice(1);
  const out = {};
  for (const p of paths) {
    try { out[p] = JSON.parse(fs.readFileSync(p, "utf8")); } catch { out[p] = { cards: [] }; }
  }
  fs.writeFileSync(target, JSON.stringify(out));
' "$BOARD_BEFORE" $POC_BOARDS

# A prompt that failed to render must never reach claude -p. An unbound variable
# inside the heredoc above truncates the file silently under set -u, and the run
# then reports a non-zero executor exit that looks like a model failure rather
# than a scripting one.
if [ ! -s "$PROMPT_FILE" ]; then
  log "FATAL: the prompt file is empty, refusing to invoke EXECUTOR with no prompt"
  log "this is a defect in run.sh, not a failure of the run"
  EXIT_CODE=1
  exit 1
fi
log "prompt rendered, $(wc -c < "$PROMPT_FILE" | tr -d ' ') bytes"

log "invoking EXECUTOR, cap ${POC_MAX_SECONDS}s, cards $POC_MAX_CARDS"

EXECUTOR_LOG=$POC_LOG_DIR/$RUN_ID.executor.log
EXECUTOR_STARTED_AT=$(date +%s)
claude -p "$(cat "$PROMPT_FILE")" \
  --permission-mode bypassPermissions \
  --add-dir "$POC_RUN_WORKTREE" \
  > "$EXECUTOR_LOG" 2>&1 &
CLAUDE_PID=$!

# macOS ships no timeout(1), so the cap is enforced here. The deadline is
# computed once, now, and the watchdog compares the clock against it.
watchdog "$CLAUDE_PID" "$(( EXECUTOR_STARTED_AT + POC_MAX_SECONDS ))" \
  "$EXECUTOR_LOG" "executor ${POC_MAX_SECONDS}s" &
WATCHDOG_PID=$!

wait "$CLAUDE_PID"
EXECUTOR_EXIT=$?
kill "$WATCHDOG_PID" 2>/dev/null
wait "$WATCHDOG_PID" 2>/dev/null
EXECUTOR_ELAPSED=$(( $(date +%s) - EXECUTOR_STARTED_AT ))

# CAPPED IS DECIDED BY THE CLOCK, NOT BY THE WATCHDOG'S OWN LINE. The two are
# reported separately because when they disagree the disagreement is the news.
# Run 20260827-220052 logged `capped no` after 31300 seconds against a 2700
# second cap, and it was telling the truth about the only thing it measured: no
# watchdog line had been written. Elapsed against the cap cannot be fooled that
# way, so it is what the digest and the state file are told.
# EXTRACT-BEGIN capped-decision
if grep -q '\[watchdog\] executor .* cap reached' "$EXECUTOR_LOG" 2>/dev/null; then
  WATCHDOG_FIRED=yes
else
  WATCHDOG_FIRED=no
fi
if [ "$EXECUTOR_ELAPSED" -ge "$POC_MAX_SECONDS" ]; then
  CAPPED=yes
else
  CAPPED=no
fi
log "EXECUTOR finished, exit $EXECUTOR_EXIT, elapsed ${EXECUTOR_ELAPSED}s of ${POC_MAX_SECONDS}s cap, capped $CAPPED, watchdog fired $WATCHDOG_FIRED"
if [ "$CAPPED" = yes ] && [ "$WATCHDOG_FIRED" = no ]; then
  log "HARNESS DEFECT: the executor outran its cap by $(( EXECUTOR_ELAPSED - POC_MAX_SECONDS ))s and the watchdog did not stop it. Read run.sh before trusting this run."
fi
# EXTRACT-END capped-decision
cat "$EXECUTOR_LOG"

# ---------------------------------------------------------------------------
# Step 2b: TRIAGE, on the report the executor just committed. Card AUT-3.
# ---------------------------------------------------------------------------
#
# TRIAGE IS STATELESS AND FINDS ITS OWN INPUT. It gets no dispatch text, no
# summary and nothing about what the executor did. It reads the newest file in
# docs/reports/ and docs/DOCTRINE-TRIAGE.md, and that is the whole of its
# context. Anything it needs that is not in those two places is a defect in the
# rubric, and saying so is a legitimate output.
#
# IT RUNS AFTER THE EXECUTOR AND BEFORE THE DIGEST, so its outcome can reach the
# message. CRITIC is NOT moved here: it fires at wave boundaries, and making it
# per-run would spend a full review on every increment and train everybody to
# skim it.
#
# NO REPORT MEANS NO TRIAGE. A run where the executor shipped nothing, or was
# stopped by the cap before it could write its report, has nothing to triage,
# and inventing an input is worse than skipping.

TRIAGE_MAX_SECONDS=$POC_TRIAGE_MAX_SECONDS
TRIAGE_EXIT=skipped
TRIAGE_REPORT=""
TRIAGE_PR=""
TRIAGE_CAPPED=no
TRIAGE_ELAPSED=0
# The branch TRIAGE is REQUIRED to use, named here rather than left to the
# model, because the checkpoint below finds the PR by looking for exactly this
# branch on GitHub. A branch this run cannot predict is a PR this run cannot
# record. Run 20260827-220052 happened to pick this same name unprompted; the
# checkpoint does not depend on it happening again.
TRIAGE_BRANCH=triage/$RUN_ID

git fetch origin main --quiet 2>/dev/null || true

# The report THIS run's executor committed, checkpointed the moment it exists so
# a kill of this script does not lose it. The branch is whatever the executor
# left the worktree on; unlike TRIAGE's, it cannot be mandated, because the
# branch name belongs to the card.
EXECUTOR_CHECKPOINT_FILE=$POC_LOG_DIR/$RUN_ID.checkpoint
EXECUTOR_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
EXECUTOR_OWN_REPORT=$(triage_reports_in "origin/main..HEAD" | head -1)
if [ -n "$EXECUTOR_OWN_REPORT" ]; then
  EXECUTOR_PR=$(pr_for_branch "$EXECUTOR_BRANCH")
  checkpoint_pr "$RUN_ID" executor "${EXECUTOR_PR:-none}" "$EXECUTOR_BRANCH" \
    "$EXECUTOR_OWN_REPORT" "$EXECUTOR_CHECKPOINT_FILE"
fi

TRIAGE_REPORT=$(select_triage_report "$POC_RUN_WORKTREE/docs/poc/triage-latest.json" HEAD)

if [ -z "$TRIAGE_REPORT" ]; then
  log "no executor report on origin/main, skipping TRIAGE"
else
  log "invoking TRIAGE on $TRIAGE_REPORT, cap ${TRIAGE_MAX_SECONDS}s"

  TRIAGE_PROMPT_FILE=$POC_LOG_DIR/$RUN_ID.triage.prompt.txt
  cat > "$TRIAGE_PROMPT_FILE" <<TRIAGE_EOF
You are TRIAGE. Boot per CLAUDE.md, then read docs/DOCTRINE-TRIAGE.md and apply
it. That file is the whole of your rubric and it binds you the way CLAUDE.md
binds every role.

Your input is the newest report in docs/reports/, which is
$TRIAGE_REPORT. Read it. You get no chat, no summary, no human context and no
verbal ratification: everything you act on is a committed file in this
repository, and this dispatch is not one of them. Reading another committed file
is not a defect, it is how you check what you are told. If the rubric itself is
missing something you need, that is a defect in docs/DOCTRINE-TRIAGE.md and
saying so in your report is a legitimate output.

WHAT YOU MAY DO: write rulings into decisions/inbox.md, edit cards, flip a launch
gate that is fully met on committed evidence, author cards, and write
escalations.

WHAT YOU MAY NOT DO, ever, under any reading: ship a card, merge a card PR, apply
a migration, write application code or a test, or edit an existing ruling. A
changed mind is a new dated ruling that supersedes the old one by id.

Open ONE pull request carrying your rulings and card edits. Never push to main.
The board validator must exit 0 before every commit.

YOUR BRANCH IS EXACTLY $TRIAGE_BRANCH. Not a name like it, that one. The harness
watches GitHub for that branch while you work and writes the PR number into the
run log the moment the PR appears, so that if you are stopped mid-sentence the
run still records what you opened. A different branch name means your PR is
invisible to the run that started you.

ALSO WRITE docs/poc/triage-latest.json, in the same PR, so the digest can carry
your outcome. Exactly this shape, every key present, empty arrays where there is
nothing:

{
  "run_id": "$RUN_ID",
  "report": "$TRIAGE_REPORT",
  "rulings_written": ["R-030"],
  "cards_resequenced": [{"card_id": "P2-15", "change": "depends_on now names P2-09 and P2-11"}],
  "gates_flipped": [{"gate": "G4", "evidence": "PR 61"}],
  "escalations": [{"title": "one line", "recommendation": "the one path"}]
}

EVERY ESCALATION CARRIES A RECOMMENDED DEFAULT. An escalation without one is not
finished and does not satisfy the rubric.

Your final act is your own report, per CLAUDE.md section 9b:
docs/reports/$(date -u +%Y-%m-%d)-triage-<slug>.md, committed in that same PR
before you print it.

No secret value is ever echoed, logged, committed or put in a board field.
You are in the worktree $POC_RUN_WORKTREE. Work here and nowhere else.
TRIAGE_EOF

  TRIAGE_LOG=$POC_LOG_DIR/$RUN_ID.triage.log
  TRIAGE_STARTED_AT=$(date +%s)
  claude -p "$(cat "$TRIAGE_PROMPT_FILE")" \
    --permission-mode bypassPermissions \
    --add-dir "$POC_RUN_WORKTREE" \
    > "$TRIAGE_LOG" 2>&1 &
  TRIAGE_PID=$!

  # Same watchdog as the executor's, and for the same reason: macOS ships no
  # timeout(1).
  watchdog "$TRIAGE_PID" "$(( TRIAGE_STARTED_AT + TRIAGE_MAX_SECONDS ))" \
    "$TRIAGE_LOG" "triage ${TRIAGE_MAX_SECONDS}s" &
  TRIAGE_WATCHDOG_PID=$!

  # -------------------------------------------------------------------------
  # The checkpoint. Written the moment the PR exists, not when TRIAGE finishes.
  #
  # On run 20260827-220052 TRIAGE opened PR #83 on branch triage/20260827-220052
  # at 10:57:07Z and was killed by its own cap 27 seconds later. `claude -p`
  # prints its transcript when it completes, so a session that is stopped prints
  # nothing at all: the run log named neither the PR nor the branch, and the
  # eight rulings sitting in that PR were found days later by hand. Everything a
  # reader needs to reach the work was known to GitHub the instant the PR was
  # created and known to this script never.
  #
  # So this run stops relying on the model to report and asks GitHub instead. It
  # polls for the branch it mandated, and on the first sighting writes one line
  # carrying the run id, the report, the branch and the PR number. Because it
  # writes through this script's stdout, that line is in the run log; because it
  # also writes the checkpoint file, it survives even a kill of this script.
  # -------------------------------------------------------------------------
  TRIAGE_CHECKPOINT_FILE=$POC_LOG_DIR/$RUN_ID.checkpoint
  (
    while kill -0 "$TRIAGE_PID" 2>/dev/null; do
      CP_PR=$(pr_for_branch "$TRIAGE_BRANCH")
      if [ -n "$CP_PR" ]; then
        checkpoint_pr "$RUN_ID" triage "$CP_PR" "$TRIAGE_BRANCH" "$TRIAGE_REPORT" \
          "$TRIAGE_CHECKPOINT_FILE"
        exit 0
      fi
      sleep "$POC_WATCHDOG_POLL_SECONDS"
    done
  ) &
  TRIAGE_CHECKPOINT_PID=$!

  wait "$TRIAGE_PID"
  TRIAGE_EXIT=$?
  kill "$TRIAGE_WATCHDOG_PID" 2>/dev/null
  wait "$TRIAGE_WATCHDOG_PID" 2>/dev/null
  kill "$TRIAGE_CHECKPOINT_PID" 2>/dev/null
  wait "$TRIAGE_CHECKPOINT_PID" 2>/dev/null
  TRIAGE_ELAPSED=$(( $(date +%s) - TRIAGE_STARTED_AT ))

  # The belt to the poller's braces. The poller covers a kill of this script;
  # this covers the ordinary case and the race where the PR appears in the last
  # poll interval. Both read GitHub, so neither can be told a PR exists by a
  # model that only intended to open one.
  TRIAGE_PR=$(pr_for_branch "$TRIAGE_BRANCH")
  if [ -n "$TRIAGE_PR" ]; then
    checkpoint_pr "$RUN_ID" triage "$TRIAGE_PR" "$TRIAGE_BRANCH" "$TRIAGE_REPORT" \
      "$TRIAGE_CHECKPOINT_FILE"
  else
    log "TRIAGE opened no PR on $TRIAGE_BRANCH"
  fi

  if [ "$TRIAGE_ELAPSED" -ge "$TRIAGE_MAX_SECONDS" ]; then
    TRIAGE_CAPPED=yes
  else
    TRIAGE_CAPPED=no
  fi
  log "TRIAGE finished, exit $TRIAGE_EXIT, elapsed ${TRIAGE_ELAPSED}s of ${TRIAGE_MAX_SECONDS}s cap, capped $TRIAGE_CAPPED, pr ${TRIAGE_PR:-none}"
  cat "$TRIAGE_LOG"
fi

# ---------------------------------------------------------------------------
# Step 3: refresh, then work out what the run actually changed.
# ---------------------------------------------------------------------------
git fetch origin --prune --quiet
git checkout --detach --force origin/main --quiet
git reset --hard origin/main --quiet

# What moved is decided by comparing the board this run started from against the
# board it ended with. Not by a timestamp: last_checkpoint is date-only on some
# cards and a full ISO stamp on others, so any lexical compare against "now"
# silently misses the date-only ones, which are exactly the cards worked today.
#
# And not against origin/main alone. On 2026-08-26 and 2026-08-27, three runs in
# a row built a migration, a seven case spec and a draft PR for P2-09 and every
# one of them reported "cards touched: none", because the work sat on an
# unmerged branch and main never moved. A run that wrote code must never look
# identical to a run that idled. Card branches are read too, and work that is on
# a branch is reported as such rather than dropped.
# shellcheck disable=SC2086
CARDS_TOUCHED=$(node -e '
  const fs = require("fs");
  const [snapshotPath, ...paths] = process.argv.slice(1);
  const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const was = new Map();
  for (const board of Object.values(before)) {
    for (const c of board.cards || []) was.set(c.id, c.status);
  }
  const moved = [];
  for (const p of paths) {
    let after;
    try { after = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    for (const card of after.cards || []) {
      const previous = was.get(card.id);
      if (previous === undefined) moved.push(card.id + ":new:" + card.status);
      else if (previous !== card.status) moved.push(card.id + ":" + card.status);
    }
  }
  console.log(moved.join(","));
' "$BOARD_BEFORE" $POC_BOARDS 2>/dev/null)

# Branch-side work: any card/* branch that is ahead of main and moved during
# this run. Reported as <id>:branch:<status> so the digest can say "worked, not
# merged" instead of silence.
CARDS_ON_BRANCH=""
for CARD_REF in $(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/card/*'); do
  CARD_BRANCH=${CARD_REF#origin/}
  CARD_ID=$(echo "${CARD_BRANCH#card/}" | tr '[:lower:]' '[:upper:]')
  # Only branches this run actually pushed to.
  CARD_AHEAD=$(git rev-list --count "origin/main..$CARD_REF" 2>/dev/null)
  [ "${CARD_AHEAD:-0}" -eq 0 ] && continue
  CARD_LAST=$(git log -1 --format=%ct "$CARD_REF" 2>/dev/null)
  [ -z "$CARD_LAST" ] && continue
  [ "$CARD_LAST" -lt "$RUN_STARTED_AT" ] && continue
  # The card can be on any board in the set, so every board on that branch is
  # read until one names it. Reading a single board reported "unknown" for every
  # phase 3 card worked on a branch, which is silence wearing a status.
  CARD_STATUS=unknown
  for CARD_BOARD in $POC_BOARDS; do
    CARD_FOUND=$(git show "$CARD_REF:$CARD_BOARD" 2>/dev/null | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const b = JSON.parse(s);
          const c = (b.cards || []).find(
            (x) => String(x.id).toUpperCase() === String(process.argv[1]).toUpperCase(),
          );
          console.log(c ? c.status : "");
        } catch { console.log(""); }
      });
    ' "$CARD_ID")
    if [ -n "$CARD_FOUND" ]; then
      CARD_STATUS=$CARD_FOUND
      break
    fi
  done
  CARDS_ON_BRANCH="$CARDS_ON_BRANCH,$CARD_ID:branch:${CARD_STATUS:-unknown}"
  log "branch work: $CARD_BRANCH is $CARD_AHEAD commits ahead of main, card $CARD_ID is ${CARD_STATUS:-unknown}"
done
CARDS_ON_BRANCH=${CARDS_ON_BRANCH#,}

if [ -n "$CARDS_TOUCHED" ] && [ -n "$CARDS_ON_BRANCH" ]; then
  CARDS_TOUCHED="$CARDS_TOUCHED,$CARDS_ON_BRANCH"
elif [ -n "$CARDS_ON_BRANCH" ]; then
  CARDS_TOUCHED="$CARDS_ON_BRANCH"
fi
log "cards touched this run: ${CARDS_TOUCHED:-none}"

# ---------------------------------------------------------------------------
# The silence rule. A run that had an eligible card and shipped nothing must say
# why, in writing, every time.
#
# Three runs on 2026-08-26 and 2026-08-27 each named P2-09 as next eligible and
# each reported nothing, and nobody could tell from the digest whether the
# harness was working hard or broken. Silence on an eligible card is a defect,
# never a normal outcome, so the run escalates it rather than leaving it to be
# noticed.
# ---------------------------------------------------------------------------
SILENCE_ESCALATION=""
# A card the harness could not take because somebody else holds it is escalated
# in its own right. Skipping is correct; skipping quietly is not.
if [ -n "$CLAIM_SKIPPED" ]; then
  SILENCE_ESCALATION="$CLAIM_SKIPPED|skipped because another actor holds the claim. This is the lease working, not a fault. The card is worked when the claim is released or expires after 6 hours."
  log "ESCALATING CLAIM SKIP: $CLAIM_SKIPPED"
fi
if [ -n "$ELIGIBLE_AT_START" ]; then
  SHIPPED_THIS_RUN=$(echo "$CARDS_TOUCHED" | tr ',' '\n' | grep -c ':shipped$' || true)
  if [ "${SHIPPED_THIS_RUN:-0}" -eq 0 ]; then
    # Distinguish worked-but-unmerged from nothing-happened. They are very
    # different failures and must never share a message.
    if [ -n "$CARDS_ON_BRANCH" ]; then
      SILENCE_REASON="work is on a branch and was not merged: $CARDS_ON_BRANCH. Most likely the acceptance had not passed, which is correct behaviour under CLAUDE.md section 6, but the card is not shipped and the run must say so."
    elif [ "$CAPPED" = yes ]; then
      SILENCE_REASON="the executor ran ${EXECUTOR_ELAPSED}s against a ${POC_MAX_SECONDS}s cap and was stopped before it could ship."
    elif [ "$EXECUTOR_EXIT" != "0" ]; then
      SILENCE_REASON="the executor exited $EXECUTOR_EXIT."
    else
      SILENCE_REASON="the executor finished cleanly and shipped nothing, with no branch work to show for it. This is the case that needs a human eye."
    fi
    SILENCE_ESCALATION="$ELIGIBLE_AT_START|$SILENCE_REASON"
    log "SILENCE ON AN ELIGIBLE CARD: $ELIGIBLE_AT_START, reason: $SILENCE_REASON"
  fi
fi

# ---------------------------------------------------------------------------
# Step 4: the digest, on every run, including a run that did nothing. A silent
# night is indistinguishable from a broken scheduler.
# ---------------------------------------------------------------------------
DIGEST_SENT_AT=""
if [ -f "$POC_RUN_WORKTREE/scripts/poc/notify.mjs" ]; then
  log "sending the digest"
  node "$POC_RUN_WORKTREE/scripts/poc/notify.mjs" \
    --run-id "$RUN_ID" \
    --capped "$CAPPED" \
    --executor-exit "$EXECUTOR_EXIT" \
    --cards "${CARDS_TOUCHED:-}" \
    --silence "${SILENCE_ESCALATION:-}"
  NOTIFY_EXIT=$?
  log "digest exit $NOTIFY_EXIT"
  if [ "$NOTIFY_EXIT" -eq 0 ]; then
    DIGEST_SENT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  fi
else
  log "notifier not present on this commit, skipping"
fi

# ---------------------------------------------------------------------------
# Step 5: state, through a PR. Never a direct push to main.
# ---------------------------------------------------------------------------
STATE_BRANCH=poc/state-$RUN_ID

# AUT-1. The report this run committed, found on origin/main by its dated name.
# Resolved from the repository rather than from anything the run said about
# itself: a run that claims a report it did not commit records nothing here.
git fetch origin main --quiet 2>/dev/null || true
REPORT_PATH=$(git ls-tree -r --name-only origin/main -- docs/reports/ 2>/dev/null \
  | grep -E "^docs/reports/$(date -u +%Y-%m-%d)-[a-z0-9-]+\.md$" | sort | tail -1)
if [ -n "$REPORT_PATH" ]; then
  log "report committed this run: $REPORT_PATH"
else
  log "no report committed for today on origin/main"
fi

log "writing $POC_STATE on $STATE_BRANCH"

git checkout -b "$STATE_BRANCH" origin/main --quiet

# AUT-21. The escalation lands HERE, on the state branch, so it rides to main in
# the state pull request like every other escalation. drift_detect ran at the top
# of this run and already put the comparison in the log; this writes it where the
# digest and the owner will see it.
drift_escalate "$POC_STATE"

# ---------------------------------------------------------------------------
# The pull request census, card AUT-18. It runs HERE, after every merge this run
# was going to make and on the state branch, so what it writes to state.json is
# carried by the state pull request like every other escalation. It merges
# nothing and deletes nothing; see the block above pr-census for why.
# ---------------------------------------------------------------------------
log "taking the pull request census"
run_pr_census "$POC_STATE" "$RUN_STARTED_AT" "$RUN_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  || log "WARNING: the pull request census exited non-zero"

node -e '
  const fs = require("fs");
  const [path, runId, finishedAt, touchedRaw, digestAt, capped, silence, logFile, claimedCard,
         reportPath, elapsed, capSeconds] = process.argv.slice(1);
  const state = JSON.parse(fs.readFileSync(path, "utf8"));
  state.last_run = finishedAt;
  state.run_id = runId;
  state.cards_touched = touchedRaw
    ? touchedRaw.split(",").filter(Boolean).map((entry) => {
        const [id, status] = entry.split(":");
        return { card_id: id, status, run_id: runId };
      })
    : [];
  if (capped === "yes") {
    state.escalations = (state.escalations || []).concat([{
      card_id: null,
      question: "The executor ran " + elapsed + "s against its " + capSeconds
        + "s wall clock cap and was stopped there.",
      recommendation: "Read the run log before assuming the work is complete.",
      raised_at: finishedAt,
      run_id: runId,
    }]);
  }
  // The silence rule. An eligible card that shipped nothing is escalated every
  // time, so a run that looks idle can never be mistaken for one that was.
  if (silence) {
    const [cardIds, reason] = silence.split("|");
    state.escalations = (state.escalations || []).concat([{
      card_id: cardIds,
      question: "Eligible card(s) " + cardIds + " were not shipped by this run. " + reason,
      recommendation: "Read " + logFile + ". Silence on an eligible card is a defect, not a normal outcome.",
      raised_at: finishedAt,
      run_id: runId,
    }]);
  }
  if (digestAt) state.digest_last_sent = digestAt;

  // Claim lease. Record what this run took, and drop every claim that has aged
  // out, so a lease left behind by a run that died cannot park a card forever.
  state.claims = state.claims || {};
  const TTL_SECONDS = 21600;
  const nowMs = Date.parse(finishedAt);
  for (const [id, claim] of Object.entries(state.claims)) {
    const at = Date.parse(claim && claim.claimed_at ? claim.claimed_at : "");
    if (Number.isNaN(at) || (nowMs - at) / 1000 > TTL_SECONDS) delete state.claims[id];
  }
  if (claimedCard) {
    state.claims[claimedCard] = { claimed_by: "harness", claimed_at: finishedAt };
  }

  // AUT-1. The report this run committed, by path. The digest reads the
  // directory directly, because it is sent before this file is written; this
  // field is the record, so a later reader can tell which report belonged to
  // which run without matching dates by eye.
  if (reportPath) state.report_path = reportPath;
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
' "$POC_STATE" "$RUN_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CARDS_TOUCHED" "$DIGEST_SENT_AT" "$CAPPED" "$SILENCE_ESCALATION" "$LOG_FILE" "$HARNESS_CARD" "$REPORT_PATH" "$EXECUTOR_ELAPSED" "$POC_MAX_SECONDS"

git add "$POC_STATE"

# Nothing staged means nothing to say. Do not open an empty PR.
if git diff --cached --quiet; then
  log "state unchanged, no PR opened"
  git checkout --detach --force origin/main --quiet
  git branch -D "$STATE_BRANCH" --quiet 2>/dev/null
else
  # Section 7: the staged diff is read before every commit, not assumed.
  if git diff --cached | grep -qEi 'eyJ[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-[A-Za-z0-9]|re_[A-Za-z0-9]|bot[0-9]{8}:'; then
    log "FATAL: staged diff looks like it carries a credential, refusing to commit"
    EXIT_CODE=1
  else
    git -c user.name="POC" -c user.email="happygamer1919@gmail.com" \
      commit -q -m "POC: run $RUN_ID state

Cards touched: ${CARDS_TOUCHED:-none}
Executor: exit $EXECUTOR_EXIT, ${EXECUTOR_ELAPSED}s of ${POC_MAX_SECONDS}s, capped $CAPPED
Triage: exit $TRIAGE_EXIT, ${TRIAGE_ELAPSED}s of ${TRIAGE_MAX_SECONDS}s, capped $TRIAGE_CAPPED, PR ${TRIAGE_PR:-none}
Stale lock reclaimed at start: $LOCK_RECLAIMED
Log: $LOG_FILE

Harness bookkeeping only. No board file and no application code is touched."
    git push -q -u origin "$STATE_BRANCH"
    STATE_PR=$(gh pr create --base main --head "$STATE_BRANCH" \
      --title "POC: run $RUN_ID state" \
      --body "Unattended run $RUN_ID.

Cards touched: ${CARDS_TOUCHED:-none}
Executor: exit $EXECUTOR_EXIT, ${EXECUTOR_ELAPSED}s of ${POC_MAX_SECONDS}s, capped $CAPPED
Triage: exit $TRIAGE_EXIT, ${TRIAGE_ELAPSED}s of ${TRIAGE_MAX_SECONDS}s, capped $TRIAGE_CAPPED, PR ${TRIAGE_PR:-none}
Stale lock reclaimed at start: $LOCK_RECLAIMED
Log: $LOG_FILE

Harness bookkeeping only. docs/poc/state.json and nothing else. No board file,
no application code, no migration.

Acceptance: the file parses and keeps its five fields.
Migration files added: none." 2>/dev/null | tail -1 | grep -oE '[0-9]+$')

    if [ -n "$STATE_PR" ]; then
      log "state PR #$STATE_PR opened"
      merge_when_green "$STATE_PR" "$STATE_BRANCH" || \
        log "state PR #$STATE_PR left open, the next run will merge it"
    else
      log "WARNING: state PR was not created"
    fi
  fi
  git checkout --detach --force origin/main --quiet 2>/dev/null
fi

log "run $RUN_ID finished, exit $EXIT_CODE"
exit "$EXIT_CODE"
