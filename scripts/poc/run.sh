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
POC_MERGE_WAIT_SECONDS=900    # wall clock a run will wait on a quality check
POC_GH_TIMEOUT_SECONDS=45     # per gh call, so one hung API call cannot eat a run
POC_CLAIM_TTL_SECONDS=21600   # 6 hours, how long another actor's claim is honoured

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

# Every gh call in the wait loop is wrapped, because a hanging API call is what
# turned a 15 minute budget into 68 minutes of wall clock on 2026-08-27. bash
# has no per-command timeout and macOS ships no timeout(1), so the call runs in
# the background and is killed if it overruns.
gh_bounded() {
  GHB_OUT=$(mktemp)
  gh "$@" > "$GHB_OUT" 2>/dev/null &
  GHB_PID=$!
  ( sleep "$POC_GH_TIMEOUT_SECONDS"; kill -KILL "$GHB_PID" 2>/dev/null ) &
  GHB_KILLER=$!
  wait "$GHB_PID" 2>/dev/null
  kill "$GHB_KILLER" 2>/dev/null
  wait "$GHB_KILLER" 2>/dev/null
  cat "$GHB_OUT"
  rm -f "$GHB_OUT"
}

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

# What was eligible when the run started, so silence on an eligible card can be
# detected afterwards rather than taken on trust.
ELIGIBLE_AT_START=$(node "$POC_RUN_WORKTREE/scripts/poc/eligible.mjs" --board "$POC_BOARD" --ids 2>/dev/null)
log "eligible at start: ${ELIGIBLE_AT_START:-none}"

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
#
# And not against origin/main alone. On 2026-08-26 and 2026-08-27, three runs in
# a row built a migration, a seven case spec and a draft PR for P2-09 and every
# one of them reported "cards touched: none", because the work sat on an
# unmerged branch and main never moved. A run that wrote code must never look
# identical to a run that idled. Card branches are read too, and work that is on
# a branch is reported as such rather than dropped.
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
  CARD_STATUS=$(git show "$CARD_REF:$POC_BOARD" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const b = JSON.parse(s);
        const c = (b.cards || []).find((x) => x.id === process.argv[1]);
        console.log(c ? c.status : "unknown");
      } catch { console.log("unknown"); }
    });
  ' "$CARD_ID")
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
if [ -n "$ELIGIBLE_AT_START" ]; then
  SHIPPED_THIS_RUN=$(echo "$CARDS_TOUCHED" | tr ',' '\n' | grep -c ':shipped$' || true)
  if [ "${SHIPPED_THIS_RUN:-0}" -eq 0 ]; then
    # Distinguish worked-but-unmerged from nothing-happened. They are very
    # different failures and must never share a message.
    if [ -n "$CARDS_ON_BRANCH" ]; then
      SILENCE_REASON="work is on a branch and was not merged: $CARDS_ON_BRANCH. Most likely the acceptance had not passed, which is correct behaviour under CLAUDE.md section 6, but the card is not shipped and the run must say so."
    elif [ "$CAPPED" = yes ]; then
      SILENCE_REASON="the run was stopped by the 45 minute wall clock cap before it could ship."
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
log "writing $POC_STATE on $STATE_BRANCH"

git checkout -b "$STATE_BRANCH" origin/main --quiet

node -e '
  const fs = require("fs");
  const [path, runId, finishedAt, touchedRaw, digestAt, capped, silence, logFile] = process.argv.slice(1);
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
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
' "$POC_STATE" "$RUN_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CARDS_TOUCHED" "$DIGEST_SENT_AT" "$CAPPED" "$SILENCE_ESCALATION" "$LOG_FILE"

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
