#!/bin/bash
#
# DIGEST-01. The scheduled digest job.
#
# A third launchd agent, on its own clock, with its own lock and its own
# worktree. It shares nothing with the work harness or the responder except the
# repository it reads and the bot it sends through.
#
# WHY A THIRD AGENT. The work harness runs four times a day on a cycle chosen
# for building, and can hold its lock for forty five minutes. The responder runs
# every sixty seconds and answers what it is asked. Neither of them is a report
# that arrives when Ivan wakes up and when he stops working, which is when a
# report is worth reading. And a digest attached to the build cycle goes silent
# on exactly the night the build did not run, which is the night he most needs
# to hear something.
#
# IT IS USUALLY SILENT AND THAT IS THE FEATURE. See the header of digest.mjs.
#
# Its worktree is DETACHED AT origin/main and refreshed at the top of every run.
# It is not the responder's worktree: that one is hard reset every sixty seconds
# and chmod'd read-only mid-answer, so borrowing it would mean reading a tree
# that is being rewritten under the read.
#
set -u -o pipefail

DIGEST_REPO_MAIN=${POC_DIGEST_REPO_MAIN:-/Users/ivan/rc-inventory}
DIGEST_WORKTREE=${POC_DIGEST_WORKTREE:-/Users/ivan/rc-inventory-poc-digest}
DIGEST_LOG_DIR=${POC_DIGEST_LOG_DIR:-/Users/ivan/rc-poc-logs}
DIGEST_LOCK=$DIGEST_LOG_DIR/digest.lock
DIGEST_SECRETS_FILE=${POC_DIGEST_SECRETS_FILE:-/Users/ivan/rc-secrets/phase2.env}
DIGEST_STATE=${POC_DIGEST_STATE:-$DIGEST_LOG_DIR/digest-state.json}

# A render plus one HTTPS call. Anything holding the lock longer than this is
# dead rather than busy. Derived, not guessed, and generous: a cold node start
# on a machine that just woke up is slow.
DIGEST_STALE_LOCK_SECONDS=${POC_DIGEST_STALE_LOCK_SECONDS:-600}

# P3-11b. THE OWNER'S DIRECTORIES ARE PREPENDED, NOT SUBSTITUTED.
#
# launchd hands a job a minimal PATH that has neither node nor git in it, which
# is why these directories are named literally: on the Mac they are still what
# wins, in the order they are written, exactly as before.
#
# What changed is the `:$PATH` at the end. Replacing PATH outright meant this
# script could only ever run on one machine, so the install-then-invoke
# acceptance this card requires could not run anywhere else: on a Linux runner
# node is under /opt/hostedtoolcache and none of the paths above contain it, so
# the digest died at `node` with the installer reported as fine. An installer
# proved only by an invocation that cannot run is the same gap one level up.
PATH=/Users/ivan/.local/bin:/Users/ivan/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}
export PATH

DIGEST_FORCE=no
for DIGEST_ARG in "$@"; do
  case "$DIGEST_ARG" in
    --force) DIGEST_FORCE=yes ;;
    *) echo "unknown argument $DIGEST_ARG" >&2; exit 2 ;;
  esac
done

mkdir -p "$DIGEST_LOG_DIR"
DIGEST_LOG=$DIGEST_LOG_DIR/digest.log

dlog() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$DIGEST_LOG"
}

DIGEST_LOCK_HELD=no
release_digest_lock() {
  if [ "$DIGEST_LOCK_HELD" = yes ]; then
    rm -f "$DIGEST_LOCK"
    DIGEST_LOCK_HELD=no
  fi
}
trap 'release_digest_lock' EXIT INT TERM

# The lock age is WALL CLOCK, compared against a threshold, for the same reason
# every other wait in this harness is: a suspend moves the clock and moves no
# counter, so a lock taken before a suspend must look old afterwards.
if [ -e "$DIGEST_LOCK" ]; then
  DIGEST_LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$DIGEST_LOCK" 2>/dev/null || stat -c %Y "$DIGEST_LOCK" 2>/dev/null || date +%s) ))
  if [ "$DIGEST_LOCK_AGE" -lt "$DIGEST_STALE_LOCK_SECONDS" ]; then
    dlog "another digest run holds the lock, ${DIGEST_LOCK_AGE}s old, exiting"
    exit 0
  fi
  dlog "stale digest lock, ${DIGEST_LOCK_AGE}s old, taking it"
  rm -f "$DIGEST_LOCK"
fi
printf 'pid=%s\nat=%s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIGEST_LOCK"
DIGEST_LOCK_HELD=yes

# ---------------------------------------------------------------------------
# Secrets. Tracing suppressed across the whole block: sourcing a secrets file
# under `set -x` traces every assignment in it, which is how the bot token
# leaked on 2026-08-27.
# ---------------------------------------------------------------------------
case "$-" in
  *x*) DIGEST_WAS_X=yes; set +x ;;
  *)   DIGEST_WAS_X=no ;;
esac

if [ ! -r "$DIGEST_SECRETS_FILE" ]; then
  [ "$DIGEST_WAS_X" = yes ] && set -x
  dlog "FATAL: the secrets file is not readable, nothing sent"
  exit 1
fi

set -o allexport
# shellcheck disable=SC1090
. "$DIGEST_SECRETS_FILE"
set +o allexport

DIGEST_SECRET_REPORT=""
for DIGEST_VAR in TELEGRAM_BOT_TOKEN TELEGRAM_OWNER_ID; do
  if [ -n "${!DIGEST_VAR:-}" ]; then
    DIGEST_SECRET_REPORT="$DIGEST_SECRET_REPORT $DIGEST_VAR=set"
  else
    DIGEST_SECRET_REPORT="$DIGEST_SECRET_REPORT $DIGEST_VAR=UNSET"
  fi
done

[ "$DIGEST_WAS_X" = yes ] && set -x

case "$DIGEST_SECRET_REPORT" in
  *=UNSET*)
    dlog "FATAL: a required Telegram variable is not set:$DIGEST_SECRET_REPORT"
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# The worktree. Created if absent, detached at origin/main every run.
# ---------------------------------------------------------------------------
if [ ! -e "$DIGEST_WORKTREE/.git" ]; then
  git -C "$DIGEST_REPO_MAIN" fetch origin --prune --quiet 2>/dev/null
  if ! git -C "$DIGEST_REPO_MAIN" worktree add --detach "$DIGEST_WORKTREE" origin/main >/dev/null 2>&1; then
    dlog "FATAL: could not create the digest worktree"
    exit 1
  fi
  dlog "digest worktree created"
fi

git -C "$DIGEST_WORKTREE" fetch origin --prune --quiet 2>/dev/null
git -C "$DIGEST_WORKTREE" checkout --detach --force origin/main --quiet 2>/dev/null
git -C "$DIGEST_WORKTREE" reset --hard origin/main --quiet 2>/dev/null

DIGEST_BOARD=$DIGEST_WORKTREE/docs/board/rc-board-phase2.json
DIGEST_RUN_STATE=$DIGEST_WORKTREE/docs/poc/state.json

if [ ! -f "$DIGEST_BOARD" ]; then
  dlog "FATAL: no board at $DIGEST_BOARD"
  exit 1
fi

DIGEST_ARGS="run --board $DIGEST_BOARD --state $DIGEST_RUN_STATE --digest-state $DIGEST_STATE"
[ "$DIGEST_FORCE" = yes ] && DIGEST_ARGS="$DIGEST_ARGS --force"

dlog "rendering from $(git -C "$DIGEST_WORKTREE" rev-parse --short HEAD)"

# shellcheck disable=SC2086
node "$DIGEST_WORKTREE/scripts/poc/digest.mjs" $DIGEST_ARGS >> "$DIGEST_LOG" 2>&1
DIGEST_RC=$?
dlog "digest.mjs exit $DIGEST_RC"
exit "$DIGEST_RC"
