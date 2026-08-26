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
POC_BOARD=docs/board/rc-board-phase2.json
POC_STATE=docs/poc/state.json

POC_MAX_CARDS=2
POC_MAX_SECONDS=2700          # 45 minutes, hard, wall clock
POC_MERGE_WAIT_SECONDS=900    # how long the run will wait on a quality check

# launchd hands over a minimal PATH. node lives under mise, gh and git under
# homebrew, claude under a user-local bin. All four are named explicitly so the
# scheduled run behaves exactly like the manual one.
PATH=/Users/ivan/.local/bin:/Users/ivan/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

RUN_ID=$(date +%Y%m%d-%H%M%S)
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
# The lock. A run never starts while another holds it. CLAUDE.md section 13.
# ---------------------------------------------------------------------------
release_lock() {
  if [ "$LOCK_HELD" = yes ]; then
    rm -f "$POC_LOCK_FILE"
    LOCK_HELD=no
    log "lock released"
  fi
}
trap 'release_lock' EXIT INT TERM

if [ -e "$POC_LOCK_FILE" ]; then
  log "run $RUN_ID refused: lock file present at $POC_LOCK_FILE"
  log "holder: $(tr '\n' ' ' < "$POC_LOCK_FILE" 2>/dev/null)"
  log "exit 0, this is a refusal and not a failure"
  exit 0
fi

printf 'run_id=%s\npid=%s\nstarted_at=%s\n' \
  "$RUN_ID" "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$POC_LOCK_FILE"
LOCK_HELD=yes
log "run $RUN_ID started, lock taken, pid $$"

# ---------------------------------------------------------------------------
# Secrets. The one permitted contact with that directory. Values live in the
# process environment and nowhere else: not echoed, not logged, not committed.
# ---------------------------------------------------------------------------
if [ ! -r "$POC_SECRETS_FILE" ]; then
  log "FATAL: secrets file is not readable, cannot run"
  exit 1
fi
set -o allexport
# shellcheck disable=SC1090
. "$POC_SECRETS_FILE"
set +o allexport
log "secrets sourced, values not displayed"

# A name-only presence check. Prints whether each name is set, never its value.
for VAR_NAME in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID TELEGRAM_OWNER_ID; do
  if [ -n "${!VAR_NAME:-}" ]; then
    log "env $VAR_NAME: set"
  else
    log "env $VAR_NAME: UNSET"
  fi
done

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

# ---------------------------------------------------------------------------
# Merge helper. Waits, bounded, for the quality check on a head sha, then
# merges. Never merges on a check that is pending, failed, skipped or absent.
#
# --delete-branch is deliberately NOT used: it checks out the default branch in
# whichever working copy runs it, which would fight every other worktree on this
# machine. The remote branch is deleted explicitly instead.
# ---------------------------------------------------------------------------
merge_when_green() {
  MWG_PR=$1
  MWG_BRANCH=$2
  MWG_WAITED=0

  while [ "$MWG_WAITED" -lt "$POC_MERGE_WAIT_SECONDS" ]; do
    MWG_STATE=$(gh pr view "$MWG_PR" --json mergeStateStatus -q .mergeStateStatus 2>/dev/null)
    MWG_QUALITY=$(gh pr checks "$MWG_PR" --json name,state \
      -q '.[] | select(.name == "quality") | .state' 2>/dev/null | head -1)

    if [ "$MWG_STATE" = "DIRTY" ]; then
      log "PR #$MWG_PR conflicts with main, leaving it open for a human"
      return 1
    fi

    case "$MWG_QUALITY" in
      SUCCESS)
        log "PR #$MWG_PR quality is green, merging"
        if gh pr merge "$MWG_PR" --squash >/dev/null 2>&1; then
          git push origin --delete "$MWG_BRANCH" >/dev/null 2>&1
          log "PR #$MWG_PR merged, remote branch $MWG_BRANCH deleted"
          return 0
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
        MWG_WAITED=$((MWG_WAITED + 30))
        ;;
    esac
  done

  log "PR #$MWG_PR still not green after ${POC_MERGE_WAIT_SECONDS}s, leaving it open"
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
- Do not touch P2-08 or P2-09 while P2-08 is parked on andre.
- Never push to main. Never force push. Merge only on a green quality check
  that exists for the head sha.
- No secret value is ever echoed, logged, committed or put in a board field.

You are in the worktree $POC_RUN_WORKTREE, detached at origin/main. Work here
and nowhere else. Do not touch $POC_REPO_MAIN.

When you are done, write a plain summary of what you did as your final message:
cards touched and what happened to each, PRs opened or merged with numbers, and
anything you escalated.
PROMPT_EOF

# Snapshot the board before the run touches it, so what moved can be worked out
# by comparison rather than inferred from a timestamp.
BOARD_BEFORE=$POC_LOG_DIR/$RUN_ID.board-before.json
cp "$POC_BOARD" "$BOARD_BEFORE"

log "invoking EXECUTOR, cap ${POC_MAX_SECONDS}s, cards $POC_MAX_CARDS"

EXECUTOR_LOG=$POC_LOG_DIR/$RUN_ID.executor.log
claude -p "$(cat "$PROMPT_FILE")" \
  --permission-mode bypassPermissions \
  --add-dir "$POC_RUN_WORKTREE" \
  > "$EXECUTOR_LOG" 2>&1 &
CLAUDE_PID=$!

# The watchdog. macOS ships no timeout(1), so the cap is a background sleeper
# that stops the run. TERM first, KILL if it lingers.
(
  sleep "$POC_MAX_SECONDS"
  if kill -0 "$CLAUDE_PID" 2>/dev/null; then
    echo "[watchdog] 45 minute cap reached, stopping the run" >> "$EXECUTOR_LOG"
    kill -TERM "$CLAUDE_PID" 2>/dev/null
    sleep 20
    kill -KILL "$CLAUDE_PID" 2>/dev/null
  fi
) &
WATCHDOG_PID=$!

wait "$CLAUDE_PID"
EXECUTOR_EXIT=$?
kill "$WATCHDOG_PID" 2>/dev/null
wait "$WATCHDOG_PID" 2>/dev/null

if grep -q 'watchdog. 45 minute cap reached' "$EXECUTOR_LOG" 2>/dev/null; then
  log "EXECUTOR was stopped by the 45 minute cap"
  CAPPED=yes
else
  CAPPED=no
fi
log "EXECUTOR finished, exit $EXECUTOR_EXIT, capped $CAPPED"
cat "$EXECUTOR_LOG"

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
CARDS_TOUCHED=$(node -e '
  const fs = require("fs");
  const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const was = new Map((before.cards || []).map((c) => [c.id, c.status]));
  const moved = [];
  for (const card of after.cards || []) {
    const previous = was.get(card.id);
    if (previous === undefined) moved.push(card.id + ":new:" + card.status);
    else if (previous !== card.status) moved.push(card.id + ":" + card.status);
  }
  console.log(moved.join(","));
' "$BOARD_BEFORE" "$POC_BOARD" 2>/dev/null)
log "cards touched this run: ${CARDS_TOUCHED:-none}"

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
    --cards "${CARDS_TOUCHED:-}"
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
log "writing $POC_STATE on $STATE_BRANCH"

git checkout -b "$STATE_BRANCH" origin/main --quiet

node -e '
  const fs = require("fs");
  const [path, runId, finishedAt, touchedRaw, digestAt, capped] = process.argv.slice(1);
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
      question: "The run was stopped by the 45 minute wall clock cap.",
      recommendation: "Read the run log before assuming the work is complete.",
      raised_at: finishedAt,
      run_id: runId,
    }]);
  }
  if (digestAt) state.digest_last_sent = digestAt;
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
' "$POC_STATE" "$RUN_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CARDS_TOUCHED" "$DIGEST_SENT_AT" "$CAPPED"

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
Capped at 45 minutes: $CAPPED
Executor exit: $EXECUTOR_EXIT
Log: $LOG_FILE

Harness bookkeeping only. No board file and no application code is touched."
    git push -q -u origin "$STATE_BRANCH"
    STATE_PR=$(gh pr create --base main --head "$STATE_BRANCH" \
      --title "POC: run $RUN_ID state" \
      --body "Unattended run $RUN_ID.

Cards touched: ${CARDS_TOUCHED:-none}
Capped at 45 minutes: $CAPPED
Executor exit: $EXECUTOR_EXIT
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
