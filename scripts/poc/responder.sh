#!/bin/bash
#
# AUT-6. The conversational responder.
#
# A Claude brain behind the same bot, answering Ivan's questions in plain
# language. It runs on its own launchd schedule every 60 seconds, holds its own
# lock, writes its own log, and shares nothing with the work harness except the
# repository it reads.
#
# WHY IT IS A SEPARATE AGENT AND NOT A STEP IN run.sh: the work harness runs on
# a three hour cycle and can hold its lock for 45 minutes. A question asked at
# 22:05 must not wait until 01:00 for an answer, and a question must never be
# able to delay the build. Two schedules, two locks, no shared state.
#
# THE HARD BOUNDARY IS STRUCTURAL, NOT INSTRUCTED.
#
#   - The responder reads a DEDICATED WORKTREE that is chmod'd read-only and
#     pinned to origin/main. It cannot write the board, open a PR, merge, or
#     author a migration, because the files refuse the write.
#   - claude is invoked with --disallowedTools so Write, Edit, Bash and the rest
#     are not merely discouraged, they are absent.
#   - The secrets file is never sourced in the process that runs claude. The
#     token needed to talk to Telegram lives in THIS script's environment and is
#     stripped before the model is invoked, so /Users/ivan/rc-secrets is
#     unreachable from inside the answer, not merely forbidden.
#
# A prompt that says "do not write" is a request. A read-only filesystem and an
# absent tool are a property.
#
set -u -o pipefail

POC_REPO_MAIN=/Users/ivan/rc-inventory
POC_CHAT_WORKTREE=/Users/ivan/rc-inventory-poc-chat
POC_LOG_DIR=/Users/ivan/rc-poc-logs
POC_CHAT_LOG_DIR=/Users/ivan/rc-poc-logs/chat
POC_CHAT_LOCK=/Users/ivan/rc-poc-logs/chat.lock
POC_SECRETS_FILE=/Users/ivan/rc-secrets/phase2.env
POC_OFFSET_FILE=/Users/ivan/rc-poc-logs/chat/offset

# Per message, so one long question cannot stall the poller.
POC_CHAT_TIMEOUT_SECONDS=120
# Rate limit: most messages answered per single poll.
POC_CHAT_MAX_PER_POLL=3
# Floor between two answers, so a burst cannot spend the account.
POC_CHAT_MIN_GAP_SECONDS=5

PATH=/Users/ivan/.local/bin:/Users/ivan/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

RUN_ID=$(date +%Y%m%d-%H%M%S)
LOCK_HELD=no

mkdir -p "$POC_CHAT_LOG_DIR"
CHAT_LOG=$POC_CHAT_LOG_DIR/$RUN_ID.log

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$CHAT_LOG"
}

release_lock() {
  if [ "$LOCK_HELD" = yes ]; then
    rm -f "$POC_CHAT_LOCK"
    LOCK_HELD=no
  fi
}
trap 'release_lock' EXIT INT TERM

# Its own lock. Deliberately NOT the work harness lock: a chat answer and a
# build run are allowed to happen at the same time, and must be.
if [ -e "$POC_CHAT_LOCK" ]; then
  # Stale lock recovery: a poller that died holding it must not mute the bot
  # forever. The poll interval is 60s, so anything older than 10 minutes is dead.
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$POC_CHAT_LOCK" 2>/dev/null || date +%s) ))
  if [ "$LOCK_AGE" -lt 600 ]; then
    exit 0
  fi
  log "stale chat lock, ${LOCK_AGE}s old, taking it"
  rm -f "$POC_CHAT_LOCK"
fi
printf 'run_id=%s\npid=%s\n' "$RUN_ID" "$$" > "$POC_CHAT_LOCK"
LOCK_HELD=yes

# ---------------------------------------------------------------------------
# Secrets, for Telegram only. Sourced here, and stripped before claude is
# invoked further down.
# ---------------------------------------------------------------------------
if [ ! -r "$POC_SECRETS_FILE" ]; then
  log "FATAL: secrets file unreadable"
  exit 1
fi
set -o allexport
# shellcheck disable=SC1090
. "$POC_SECRETS_FILE"
set +o allexport

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_OWNER_ID:-}" ]; then
  log "FATAL: TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_ID is not set"
  exit 1
fi

# ---------------------------------------------------------------------------
# The read-only worktree. Recreated if absent, refreshed to origin/main, then
# made read-only. Every refresh restores write permission first, does the git
# work, and clamps it again.
# ---------------------------------------------------------------------------
if [ ! -e "$POC_CHAT_WORKTREE/.git" ]; then
  git -C "$POC_REPO_MAIN" fetch origin --prune --quiet 2>/dev/null
  git -C "$POC_REPO_MAIN" worktree add --detach "$POC_CHAT_WORKTREE" origin/main >/dev/null 2>&1 || {
    log "FATAL: could not create the chat worktree"
    exit 1
  }
  log "chat worktree created"
fi

chmod -R u+w "$POC_CHAT_WORKTREE" 2>/dev/null
git -C "$POC_CHAT_WORKTREE" fetch origin --prune --quiet 2>/dev/null
git -C "$POC_CHAT_WORKTREE" checkout --detach --force origin/main --quiet 2>/dev/null
git -C "$POC_CHAT_WORKTREE" reset --hard origin/main --quiet 2>/dev/null

# ---------------------------------------------------------------------------
# Poll. Only messages from the owner are looked at, and identity is checked
# before the text is read.
# ---------------------------------------------------------------------------
OFFSET=$(cat "$POC_OFFSET_FILE" 2>/dev/null || echo 0)
UPDATES_FILE=$POC_CHAT_LOG_DIR/$RUN_ID.updates.json

HTTP=$(curl -s -m 25 -o "$UPDATES_FILE" -w '%{http_code}' \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${OFFSET}&limit=10&timeout=0" 2>/dev/null)
if [ "$HTTP" != "200" ]; then
  log "getUpdates returned HTTP $HTTP, nothing done"
  exit 0
fi

# Classify without the token anywhere near the output. Ruling forms are left for
# inbox.mjs and are not answered here; everything else from the owner is a
# question for the responder; everything from anyone else is logged and ignored.
CLASSIFIED=$(TELEGRAM_OWNER_ID="$TELEGRAM_OWNER_ID" node "$POC_CHAT_WORKTREE/scripts/poc/chat-classify.mjs" \
  --updates "$UPDATES_FILE" --log "$POC_CHAT_LOG_DIR/ignored.log" 2>/dev/null)

if [ -z "$CLASSIFIED" ]; then
  rm -f "$UPDATES_FILE"
  exit 0
fi

HIGHEST=$(echo "$CLASSIFIED" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const rows=s.trim().split("\n").filter(Boolean).map(JSON.parse);console.log(Math.max(...rows.map(r=>r.update_id)));});' 2>/dev/null)

ANSWERED=0
echo "$CLASSIFIED" | while IFS= read -r ROW; do
  [ -z "$ROW" ] && continue
  KIND=$(echo "$ROW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).kind);});')
  UPDATE_ID=$(echo "$ROW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).update_id);});')

  if [ "$KIND" != "question" ]; then
    log "update $UPDATE_ID classified $KIND, not answered here"
    continue
  fi

  if [ "$ANSWERED" -ge "$POC_CHAT_MAX_PER_POLL" ]; then
    log "rate limit reached, $POC_CHAT_MAX_PER_POLL answered this poll, the rest wait"
    break
  fi

  QUESTION_FILE=$POC_CHAT_LOG_DIR/$RUN_ID-$UPDATE_ID.question.txt
  echo "$ROW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).text);});' > "$QUESTION_FILE"

  log "question $UPDATE_ID: $(head -c 200 "$QUESTION_FILE")"

  ANSWER_FILE=$POC_CHAT_LOG_DIR/$RUN_ID-$UPDATE_ID.answer.txt

  # The worktree is clamped read-only for the duration of the answer, and the
  # secrets are stripped from the environment the model runs in. env -u removes
  # them from the child; the model cannot read what the process does not carry
  # and cannot write what the filesystem refuses.
  chmod -R a-w "$POC_CHAT_WORKTREE" 2>/dev/null

  (
    cd "$POC_CHAT_WORKTREE" || exit 1
    env -u TELEGRAM_BOT_TOKEN -u TELEGRAM_CHAT_ID \
        -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_DB_PASSWORD -u SUPABASE_DB_URL \
        -u RESEND_API_KEY -u MAKE_WEBHOOK_URL -u MAKE_CALLBACK_SECRET \
        -u VERCEL_TOKEN -u NEXT_PUBLIC_SUPABASE_ANON_KEY \
      claude -p "$(cat "$POC_CHAT_WORKTREE/scripts/poc/chat-prompt.md")

THE QUESTION:
$(cat "$QUESTION_FILE")" \
      --permission-mode bypassPermissions \
      --disallowedTools "Write,Edit,NotebookEdit,Bash,Agent,Task,WebFetch,WebSearch" \
      > "$ANSWER_FILE" 2>&1
  ) &
  CLAUDE_PID=$!

  ( sleep "$POC_CHAT_TIMEOUT_SECONDS"; kill -KILL "$CLAUDE_PID" 2>/dev/null ) &
  KILLER=$!
  wait "$CLAUDE_PID" 2>/dev/null
  CLAUDE_EXIT=$?
  kill "$KILLER" 2>/dev/null
  wait "$KILLER" 2>/dev/null

  chmod -R u+w "$POC_CHAT_WORKTREE" 2>/dev/null

  if [ "$CLAUDE_EXIT" -ne 0 ] || [ ! -s "$ANSWER_FILE" ]; then
    log "answer failed for $UPDATE_ID, exit $CLAUDE_EXIT"
    printf 'I could not answer that one. Ask me again in a minute.' > "$ANSWER_FILE"
  fi

  TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_OWNER_ID="$TELEGRAM_OWNER_ID" \
    node "$POC_CHAT_WORKTREE/scripts/poc/chat-send.mjs" --answer "$ANSWER_FILE" >> "$CHAT_LOG" 2>&1
  log "answered $UPDATE_ID, $(wc -c < "$ANSWER_FILE" | tr -d ' ') bytes"

  ANSWERED=$((ANSWERED + 1))
  sleep "$POC_CHAT_MIN_GAP_SECONDS"
done

# Acknowledge everything read this poll, including messages that were ignored,
# so an ignored message is not reclassified forever.
if [ -n "$HIGHEST" ] && [ "$HIGHEST" != "-Infinity" ]; then
  echo "$((HIGHEST + 1))" > "$POC_OFFSET_FILE"
  curl -s -m 15 -o /dev/null \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=$((HIGHEST + 1))&limit=1" 2>/dev/null
fi

rm -f "$UPDATES_FILE"
exit 0
