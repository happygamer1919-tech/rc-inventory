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

# Per message. Measured, not guessed: a real question against this repository
# took 158 seconds end to end on 2026-08-27, and the first draft of this file
# capped it at 120, which would have killed every honest answer and sent the
# fallback apology instead. 300 leaves room for a question that needs several
# files without letting one hang the poller forever.
POC_CHAT_TIMEOUT_SECONDS=300
# Rate limit: most messages answered per single poll.
POC_CHAT_MAX_PER_POLL=2
# Floor between two answers, so a burst cannot spend the account.
POC_CHAT_MIN_GAP_SECONDS=5

# The longest a healthy poll can legitimately run, plus a buffer. Anything
# holding the lock longer than this is dead rather than busy. Derived rather
# than hardcoded, because the first draft hardcoded 600 while the worst case was
# already 900, so a slow but healthy poll would have had its lock stolen out
# from under it by the next one.
POC_CHAT_STALE_LOCK_SECONDS=$(( POC_CHAT_TIMEOUT_SECONDS * POC_CHAT_MAX_PER_POLL + 300 ))

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
  # forever. The threshold must exceed the worst case healthy poll, or a slow
  # but working answer gets its lock stolen by the next poll and both run.
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$POC_CHAT_LOCK" 2>/dev/null || date +%s) ))
  if [ "$LOCK_AGE" -lt "$POC_CHAT_STALE_LOCK_SECONDS" ]; then
    exit 0
  fi
  log "stale chat lock, ${LOCK_AGE}s old, taking it"
  rm -f "$POC_CHAT_LOCK"
fi
printf 'run_id=%s\npid=%s\n' "$RUN_ID" "$$" > "$POC_CHAT_LOCK"
LOCK_HELD=yes

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
for VAR_NAME in TELEGRAM_BOT_TOKEN TELEGRAM_OWNER_ID; do
  if [ -n "${!VAR_NAME:-}" ]; then
    SECRET_REPORT="$SECRET_REPORT $VAR_NAME=set"
  else
    SECRET_REPORT="$SECRET_REPORT $VAR_NAME=UNSET"
  fi
done

[ "$SECRETS_WAS_X" = yes ] && set -x

log "secrets sourced, values not displayed"
for ENTRY in $SECRET_REPORT; do log "env $ENTRY"; done

# Derived from the report rather than from the values, so the fatal check is not
# itself a place where a secret gets expanded into a traced command word.
case "$SECRET_REPORT" in
  *=UNSET*)
    log "FATAL: a required Telegram variable is not set:$SECRET_REPORT"
    exit 1
    ;;
esac

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
# Telegram calls, with the token kept out of the argument list.
#
# The Telegram API puts the token in the URL PATH, so any curl invocation that
# takes the URL as an argument publishes the token twice over: once in `ps aux`,
# readable by every process on this machine for as long as the call runs, and
# once in any `set -x` trace, which is how it leaked on 2026-08-27. A script
# that carefully never echoes a value does not help, because neither exposure
# goes through the script's own output.
#
# curl --config - reads its options from stdin. The URL travels through a pipe,
# so it is in no argv and in no trace, and the here-doc is fed by the shell
# without ever becoming a command word.
# ---------------------------------------------------------------------------
tg_get() {
  # $1 method and query, for example "getUpdates?offset=5&limit=10"
  # $2 optional output file, defaults to discarding the body
  TG_OUT=${2:-/dev/null}

  # Suppress tracing across the call. A here-doc body is not traced by set -x,
  # but suppressing it explicitly means the protection does not depend on that
  # remaining true of every shell and every future edit. Restored immediately.
  case "$-" in
    *x*) TG_WAS_X=yes; set +x ;;
    *)   TG_WAS_X=no ;;
  esac

  # The URL reaches curl on stdin, so it is in no argv, no process table entry
  # and no trace. curl --config - reads options from stdin exactly as if they
  # came from a file.
  curl -s -m 25 -o "$TG_OUT" -w '%{http_code}' --config - <<TGCFG 2>/dev/null
url = "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${1}"
TGCFG
  TG_RC=$?

  [ "$TG_WAS_X" = yes ] && set -x
  return $TG_RC
}

# ---------------------------------------------------------------------------
# Poll. Only messages from the owner are looked at, and identity is checked
# before the text is read.
# ---------------------------------------------------------------------------
OFFSET=$(cat "$POC_OFFSET_FILE" 2>/dev/null || echo 0)
UPDATES_FILE=$POC_CHAT_LOG_DIR/$RUN_ID.updates.json

HTTP=$(tg_get "getUpdates?offset=${OFFSET}&limit=10&timeout=0" "$UPDATES_FILE")
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
  tg_get "getUpdates?offset=$((HIGHEST + 1))&limit=1" >/dev/null
fi

rm -f "$UPDATES_FILE"
exit 0
