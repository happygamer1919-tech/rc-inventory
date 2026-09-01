#!/bin/bash
#
# ASK-01. The blocking question channel.
#
# A role that hits a decision it may not make calls this, and BLOCKS until Ivan
# answers or the deadline passes. It replaces the failure this card was written
# for: a foreground executor printed its question to a terminal nobody was
# watching and stopped, and the run was lost to a question that would have taken
# ten seconds to answer.
#
# PRINTING A QUESTION AND STOPPING IS NOW A DEFECT. See CLAUDE.md section 12.
#
# Usage:
#   scripts/poc/ask.sh <card-id> \
#       --question       "one line, plain language, no jargon" \
#       --recommendation "one line, what I would do" \
#       --if-silent      "what happens if you say nothing" \
#       [--deadline-seconds 21600] [--role executor] [--run-id 20260901-070544]
#
# EXIT CODES ARE THE INTERFACE. They are chosen so that the LAZY reading is the
# SAFE one: a caller that writes `if ask.sh ...; then take_recommendation; fi`
# takes it only on a real go.
#
#    0  go           the owner accepted the recommendation
#   10  stop         the owner said no; halt the card
#   11  instruction  the owner said something else; it is on stdout, verbatim,
#                    from the second line
#   12  expired      nobody answered. The question is on the card as
#                    blocked_on: ivan with the full payload, committed on the
#                    current branch. Move to another card. THE RECOMMENDATION
#                    WAS NOT TAKEN.
#    2  usage        the payload is incomplete or not in the plain register
#    3  infrastructure  the question could not be sent, so nothing was asked
#
# Exit 12 is deliberately not 0. "Exits clean" means it terminates promptly with
# the board committed and the harness free to move on; it does not mean it
# reports success, because a run that cannot tell an expiry from an approval is
# the exact failure the deadline exists to prevent.
#
# THE DEADLINE IS A WALL CLOCK, NOT A SLEEP COUNTER, AND THAT IS THE WHOLE
# POINT. nanosleep does not advance while the machine is suspended. On
# 2026-08-27 that let a run outrun a 2700 second cap by 28600 seconds with the
# guard sitting inside a `sleep`. Every wait in this file compares `date +%s`
# against a deadline computed once. scripts/poc/test-ask-digest.sh reproduces a
# suspend and requires the sleep-counter version to FAIL on the same input.
#
set -u -o pipefail

ASK_REPO_ROOT=${POC_ASK_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}
ASK_SECRETS_FILE=${POC_ASK_SECRETS_FILE:-/Users/ivan/rc-secrets/phase2.env}
ASK_LOG_DIR=${POC_ASK_LOG_DIR:-/Users/ivan/rc-poc-logs}
ASK_NODE=${POC_ASK_NODE:-node}
ASK_MJS=$ASK_REPO_ROOT/scripts/poc/ask.mjs

# Six hours, per the card. Overridable for a question whose answer is worth
# waiting longer for, and by the test suite, which cannot wait six hours.
ASK_DEADLINE_SECONDS=${POC_ASK_DEADLINE_SECONDS:-21600}
# How often the spool is looked at. Cheap: one stat of one file.
ASK_POLL_SECONDS=${POC_ASK_POLL_SECONDS:-20}

ASK_BOARDS=${POC_ASK_BOARDS:-$ASK_REPO_ROOT/docs/board/rc-board-phase2.json $ASK_REPO_ROOT/docs/board/rc-board-phase3.json}

# EXTRACT-BEGIN credential-shapes
# The credential shapes refused in a staged diff, lifted verbatim by
# scripts/poc/test-ask-digest.sh and exercised there in BOTH directions.
#
# EACH SHAPE IS ANCHORED AT A NON-ALPHANUMERIC BOUNDARY, and the copy in
# inbox.mjs is not. Its bare `sk-[A-Za-z0-9]` matches the middle of
# `test-ask-digest.sh`, and `re_` matches the middle of plenty of ordinary words,
# so the unanchored version refuses to commit a board that merely NAMES a file in
# this directory. That is not a theoretical objection: it fired on the very
# commit that added this script.
#
# A GUARD THAT REFUSES A LEGITIMATE COMMIT GETS SWITCHED OFF, and then it is not
# a guard. The anchor costs nothing: in a diff a real token is preceded by `+`,
# `"`, `=` or a space, all of which match the boundary.
# THE BOUNDARY CLASS EXCLUDES `_` AS WELL AS THE ALPHANUMERICS. Without it,
# `features_are_re_enabled` matches the `re_` alternative, because an underscore
# is not a letter or a digit. The test carries that exact string.
ASK_CREDENTIAL_SHAPES='(^|[^A-Za-z0-9_])(eyJ[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-[A-Za-z0-9]|re_[A-Za-z0-9]|bot[0-9]{8}:)'
# EXTRACT-END credential-shapes

ask_log() {
  echo "[ask] $*" >&2
}

# ---------------------------------------------------------------------------
# EXTRACT-BEGIN ask-deadline
# Everything between this marker and EXTRACT-END is lifted verbatim by
# scripts/poc/test-ask-digest.sh and exercised there against a shadowed clock.
# Keep it free of anything that depends on the rest of this file.
#
# Wait for a card's answer to appear on the spool, or for the deadline to pass.
# Prints nothing. Returns 0 when an answer landed, 1 when the deadline came
# first.
#
# THE CONDITION IS `date +%s` AGAINST A FIXED DEADLINE. It is never a countdown,
# never a decrementing counter, and never `sleep $REMAINING`, because a suspend
# moves the clock and does not move any of those three. The poll interval is a
# sleep, and that is fine: a long sleep across a suspend costs one late poll,
# where a long sleep AS the deadline costs the deadline itself.
wait_for_answer() {
  WFA_CARD=$1
  WFA_DEADLINE=$2
  while :; do
    if "$ASK_NODE" "$ASK_MJS" poll --card "$WFA_CARD" > "$WFA_ANSWER_FILE" 2>/dev/null; then
      return 0
    fi
    if [ "$(date +%s)" -ge "$WFA_DEADLINE" ]; then
      return 1
    fi
    sleep "$ASK_POLL_SECONDS"
  done
}
# EXTRACT-END ask-deadline
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Arguments.
# ---------------------------------------------------------------------------
ASK_CARD=${1:-}
if [ -z "$ASK_CARD" ] || [ "${ASK_CARD#--}" != "$ASK_CARD" ]; then
  ask_log "FATAL: the first argument must be a card id"
  exit 2
fi
shift

ASK_QUESTION=""
ASK_RECOMMENDATION=""
ASK_IF_SILENT=""
ASK_ROLE=${POC_ASK_ROLE:-unknown}
ASK_RUN_ID=${POC_RUN_ID:-manual}

while [ $# -gt 0 ]; do
  case "$1" in
    --question)        ASK_QUESTION=${2:-}; shift 2 ;;
    --recommendation)  ASK_RECOMMENDATION=${2:-}; shift 2 ;;
    --if-silent)       ASK_IF_SILENT=${2:-}; shift 2 ;;
    --deadline-seconds) ASK_DEADLINE_SECONDS=${2:-}; shift 2 ;;
    --role)            ASK_ROLE=${2:-}; shift 2 ;;
    --run-id)          ASK_RUN_ID=${2:-}; shift 2 ;;
    *) ask_log "FATAL: unknown argument $1"; exit 2 ;;
  esac
done

# All four payload fields are required. A question with no recommendation is an
# escalation that hands the decision back with no work done on it, which is the
# thing the board contract has refused since it was written.
for ASK_REQUIRED in ASK_QUESTION ASK_RECOMMENDATION ASK_IF_SILENT; do
  if [ -z "${!ASK_REQUIRED}" ]; then
    ask_log "FATAL: --$(echo "${ASK_REQUIRED#ASK_}" | tr 'A-Z_' 'a-z-') is required"
    ask_log "All four are required: card id, question, recommendation, what silence costs."
    exit 2
  fi
done

if ! echo "$ASK_DEADLINE_SECONDS" | grep -qE '^[0-9]+$' || [ "$ASK_DEADLINE_SECONDS" -le 0 ]; then
  ask_log "FATAL: --deadline-seconds must be a positive whole number of seconds"
  exit 2
fi

mkdir -p "$ASK_LOG_DIR"
WFA_ANSWER_FILE=$(mktemp "${TMPDIR:-/tmp}/ask-answer.XXXXXX")
trap 'rm -f "$WFA_ANSWER_FILE"' EXIT INT TERM

# ---------------------------------------------------------------------------
# Secrets. Tracing suppressed across the whole block, for the reason
# responder.sh states at length: sourcing a secrets file under `set -x` traces
# every assignment in it, and one debug flag then dumps the token.
# ---------------------------------------------------------------------------
case "$-" in
  *x*) ASK_WAS_X=yes; set +x ;;
  *)   ASK_WAS_X=no ;;
esac

if [ -r "$ASK_SECRETS_FILE" ]; then
  set -o allexport
  # shellcheck disable=SC1090
  . "$ASK_SECRETS_FILE"
  set +o allexport
  ASK_SECRETS=read
else
  ASK_SECRETS=absent
fi

[ "$ASK_WAS_X" = yes ] && set -x

if [ "$ASK_SECRETS" = absent ]; then
  ask_log "FATAL: the secrets file is not readable, so the question cannot be sent"
  ask_log "Nothing was asked, so nothing may be assumed answered."
  exit 3
fi

# ---------------------------------------------------------------------------
# THE DEADLINE IS COMPUTED ONCE, HERE, AS AN ABSOLUTE WALL CLOCK INSTANT.
# ---------------------------------------------------------------------------
ASK_DEADLINE=$(( $(date +%s) + ASK_DEADLINE_SECONDS ))

# NOT `if ! cmd; then rc=$?`. Inside the then-branch of an inverted test, $? is
# the status of the inversion, which is always 0, so that shape would report a
# refused payload as a clean send.
"$ASK_NODE" "$ASK_MJS" open \
      --card "$ASK_CARD" \
      --question "$ASK_QUESTION" \
      --recommendation "$ASK_RECOMMENDATION" \
      --if-silent "$ASK_IF_SILENT" \
      --deadline-epoch "$ASK_DEADLINE" \
      --role "$ASK_ROLE" \
      --run-id "$ASK_RUN_ID"
ASK_OPEN_RC=$?
if [ "$ASK_OPEN_RC" -ne 0 ]; then
  ask_log "the question was not sent, exit $ASK_OPEN_RC"
  # 2 is a bad payload and 3 is a broken channel. Neither is an answer, and
  # neither is an expiry: nothing reached him, so nothing goes on the card
  # claiming he was asked.
  exit "$ASK_OPEN_RC"
fi

# A zero exit is not proof the question was asked. It says the process ended
# without complaining, and a process that decided it was not the entry point
# also ends without complaining. The RECORD is the proof, so it is checked.
if [ ! -e "${POC_ASK_DIR:-/Users/ivan/rc-poc-logs/asks}/open/$(echo "$ASK_CARD" | tr 'a-z' 'A-Z').json" ]; then
  ask_log "FATAL: the sender reported success but recorded no open question."
  ask_log "Nothing may be assumed asked, so nothing will be waited for."
  exit 3
fi

ask_log "asked, waiting until $(date -r "$ASK_DEADLINE" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$ASK_DEADLINE")"

if wait_for_answer "$ASK_CARD" "$ASK_DEADLINE"; then
  ASK_VERDICT=$(head -1 "$WFA_ANSWER_FILE")
  ASK_TEXT=$(tail -n +2 "$WFA_ANSWER_FILE")

  case "$ASK_VERDICT" in
    go)
      "$ASK_NODE" "$ASK_MJS" confirm --card "$ASK_CARD" --verdict go >/dev/null 2>&1
      ask_log "answered: go, taking the recommendation"
      echo "go"
      exit 0
      ;;
    stop)
      "$ASK_NODE" "$ASK_MJS" confirm --card "$ASK_CARD" --verdict stop >/dev/null 2>&1
      ask_log "answered: stop, halting the card"
      echo "stop"
      exit 10
      ;;
    instruction)
      "$ASK_NODE" "$ASK_MJS" confirm --card "$ASK_CARD" --verdict instruction --text "$ASK_TEXT" >/dev/null 2>&1
      ask_log "answered with an instruction, passed to the caller verbatim"
      echo "instruction"
      printf '%s\n' "$ASK_TEXT"
      exit 11
      ;;
    *)
      # An unrecognised verdict is not consent. Fall through to the expiry path,
      # which is the recoverable outcome.
      ask_log "unrecognised verdict $(printf '%q' "$ASK_VERDICT"), treating it as no answer"
      ;;
  esac
fi

# ---------------------------------------------------------------------------
# Expiry. THE RECOMMENDATION IS NOT TAKEN.
# ---------------------------------------------------------------------------
ask_log "deadline passed with no answer, writing the question onto the card"

# shellcheck disable=SC2086
ASK_BOARD_ARGS=""
for ASK_BOARD in $ASK_BOARDS; do
  [ -f "$ASK_BOARD" ] && ASK_BOARD_ARGS="$ASK_BOARD_ARGS --board $ASK_BOARD"
done

# shellcheck disable=SC2086
ASK_EDITED=$("$ASK_NODE" "$ASK_MJS" expire --card "$ASK_CARD" $ASK_BOARD_ARGS)
ASK_EXPIRE_RC=$?
if [ "$ASK_EXPIRE_RC" -ne 0 ] || [ -z "$ASK_EDITED" ]; then
  ask_log "FATAL: the question could not be written onto the card, exit $ASK_EXPIRE_RC"
  ask_log "Nothing was committed. This is a defect and the card is still unblocked on the board."
  exit 3
fi

# The validator gate, before the commit and not before the pull request.
# CLAUDE.md section 2: a commit made while the validator is red is reverted,
# not patched forward, so it is never made.
# STDOUT OF THIS SCRIPT IS A MACHINE INTERFACE and carries the verdict and, for
# an instruction, the owner's words. Every diagnostic in here goes to stderr,
# the validator's PASS lines included, or a caller parsing the first line reads
# a validator banner as a verdict.
if ! "$ASK_NODE" "$ASK_REPO_ROOT/docs/board/validate-board.mjs" \
      "$ASK_REPO_ROOT/docs/board/rc-board.json" \
      "$ASK_REPO_ROOT/docs/board/rc-board-phase2.json" \
      "$ASK_REPO_ROOT/docs/board/rc-board-phase3.json" >&2; then
  ask_log "FATAL: the board validator is red after writing the question. Not committing."
  exit 3
fi

git -C "$ASK_REPO_ROOT" add "$ASK_EDITED"

# The credential shape check inbox.mjs runs before its commit, anchored. A board
# edit should never carry a credential, which is exactly why the day it does must
# not be the day nobody looked. See the fenced block at the top for why the
# anchors are there.
ASK_STAGED=$(git -C "$ASK_REPO_ROOT" diff --cached)
if echo "$ASK_STAGED" | grep -qE "$ASK_CREDENTIAL_SHAPES"; then
  ask_log "FATAL: the staged diff looks like it carries a credential. Refusing to commit."
  exit 3
fi

git -C "$ASK_REPO_ROOT" \
  -c user.name=POC -c user.email=happygamer1919@gmail.com \
  commit -q -m "$ASK_CARD: blocked on ivan, a question went unanswered past its deadline

Asked on Telegram by the $ASK_ROLE role in run $ASK_RUN_ID and unanswered
after ${ASK_DEADLINE_SECONDS}s of wall clock.

THE RECOMMENDATION WAS NOT TAKEN. Silence is not consent: an owner who never
saw the message and an owner who read it and approved it produce the same
empty inbox, and the channel cannot tell them apart.

Acceptance: node docs/board/validate-board.mjs on all three boards, exit 0.
Migrations added: none." || {
  ask_log "nothing to commit, the board was already in this state"
}

ask_log "committed on $(git -C "$ASK_REPO_ROOT" rev-parse --abbrev-ref HEAD). Not pushed: the caller's own pull request carries it."
echo "expired"
exit 12
