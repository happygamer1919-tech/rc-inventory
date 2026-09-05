#!/bin/bash
#
# P3-11b. The installer, proved by INSTALLING and then INVOKING.
#
# WHY THIS FILE IS NOT A UNIT TEST, AND THE CARD SAYS SO IN TERMS.
#
# DIGEST-01 shipped digest.sh, its plist, and the lines in install.sh that
# deploy both. Every one of them was proved by tests that ran the SOURCE. Nobody
# ran the installer. On 2026-09-02, a day after it merged,
# `bash /Users/ivan/rc-poc-bin/digest.sh --force` still answered
# "No such file or directory": the 08:00 and 19:00 agent did not exist on the
# machine, and the code to create it had been on main the whole time.
#
# A TEST THAT RUNS THE SOURCE PROVES THE SOURCE. It says nothing about whether
# the file reached the place the scheduler looks. That gap is the whole card, and
# it is the same class as a migration that is merged and never applied.
#
# So this file installs into a TEMPORARY PREFIX and then runs what it installed,
# at its installed path. It never touches /Users/ivan/rc-poc-bin: a check that
# overwrites the thing it is checking is not a check.
#
# NO NETWORK, NO CREDENTIALS, NO launchctl. The digest's one HTTPS call is
# redirected through the documented POC_DIGEST_OUTBOX seam, the same seam
# test-ask-digest.sh uses, and the secrets file is a temporary one holding two
# fake values that open nothing.
#
set -u -o pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$HERE/../.." && pwd)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; FAILURES=$(( FAILURES + 1 )); }

echo "installer under test: $HERE/install.sh"
echo "temporary prefix:     $WORK/prefix"
echo

# ===========================================================================
# 1. THE INSTALL
# ===========================================================================
PREFIX=$WORK/prefix
mkdir -p "$PREFIX"

if POC_INSTALL_ROOT="$PREFIX" bash "$HERE/install.sh" > "$WORK/install.log" 2>&1; then
  pass "install.sh exits 0 into a temporary prefix"
else
  fail "install.sh failed into a temporary prefix: $(tail -5 "$WORK/install.log")"
fi

# The count the installer asserts about itself. If the manifest loop ever reads
# zero rows it installs nothing and reports every step it did not take as a step
# that did not fail, which is the defect class docs/LEARNINGS.md names.
if grep -q "installed 6 of 6 manifest row(s)" "$WORK/install.log"; then
  pass "every manifest row was installed, and the installer counted them itself"
else
  fail "the installer did not report a full manifest install: $(grep -c installed "$WORK/install.log") lines"
fi

for ARTEFACT in \
  "$PREFIX/rc-poc-bin/run.sh" \
  "$PREFIX/rc-poc-bin/responder.sh" \
  "$PREFIX/rc-poc-bin/digest.sh" \
  "$PREFIX/Library/LaunchAgents/com.ai.rc-poc.plist" \
  "$PREFIX/Library/LaunchAgents/com.ai.rc-poc-chat.plist" \
  "$PREFIX/Library/LaunchAgents/com.ai.rc-poc-digest.plist"; do
  if [ -f "$ARTEFACT" ]; then
    pass "installed $(basename "$ARTEFACT")"
  else
    fail "NOT installed: $ARTEFACT"
  fi
done

if [ -x "$PREFIX/rc-poc-bin/digest.sh" ]; then
  pass "the installed digest is executable"
else
  fail "the installed digest is not executable, so launchd could not run it"
fi

# THE SPOOL DIRECTORIES. rulings/ is the one P3-11a's module was creating on
# first write, which is the race the installer exists to prevent.
for SPOOL in asks/open asks/answers asks/answered rulings/pending rulings/consumed chat; do
  if [ -d "$PREFIX/rc-poc-logs/$SPOOL" ]; then
    pass "spool directory rc-poc-logs/$SPOOL exists after the install"
  else
    fail "spool directory rc-poc-logs/$SPOOL was NOT created by the installer"
  fi
done

# ===========================================================================
# 2. THE PLIST NAMES THE INSTALLED DIGEST, AND ITS TWO HOURS
# ===========================================================================
DIGEST_PLIST=$PREFIX/Library/LaunchAgents/com.ai.rc-poc-digest.plist
if grep -q "/rc-poc-bin/digest.sh" "$DIGEST_PLIST"; then
  pass "the digest plist names the installed digest path"
else
  fail "the digest plist does not name /rc-poc-bin/digest.sh"
fi
for HOUR in 8 19; do
  if grep -A2 "<key>Hour</key>" "$DIGEST_PLIST" | grep -q "<integer>$HOUR</integer>"; then
    pass "the digest agent is scheduled at $HOUR:00"
  else
    fail "the digest agent is NOT scheduled at $HOUR:00"
  fi
done

# ===========================================================================
# 3. THE INVOCATION. This is the half a unit test cannot reach.
# ===========================================================================
FAKE_SECRETS=$WORK/fake-secrets.env
cat > "$FAKE_SECRETS" <<ENV
TELEGRAM_BOT_TOKEN=not-a-token-and-opens-nothing
TELEGRAM_OWNER_ID=111222333
TELEGRAM_CHAT_ID=111222333
ENV

OUTBOX=$WORK/digest-outbox.txt
DIGEST_LOGS=$WORK/logs
mkdir -p "$DIGEST_LOGS"

# The installed digest, at its INSTALLED path, with --force. Every path it reads
# is redirected into the temporary tree; the one HTTPS call goes to the outbox.
if POC_DIGEST_REPO_MAIN="$REPO_ROOT" \
   POC_DIGEST_WORKTREE="$WORK/digest-worktree" \
   POC_DIGEST_LOG_DIR="$DIGEST_LOGS" \
   POC_DIGEST_SECRETS_FILE="$FAKE_SECRETS" \
   POC_DIGEST_STATE="$WORK/digest-state.json" \
   POC_DIGEST_OUTBOX="$OUTBOX" \
   bash "$PREFIX/rc-poc-bin/digest.sh" --force > "$WORK/digest.log" 2>&1; then
  pass "the INSTALLED digest runs from its installed path and exits 0"
else
  fail "the installed digest failed: $(tail -20 "$DIGEST_LOGS/digest.log" 2>/dev/null || tail -10 "$WORK/digest.log")"
fi

if [ -s "$OUTBOX" ]; then
  pass "the installed digest PRODUCED a digest, $(wc -c < "$OUTBOX" | tr -d ' ') bytes"
else
  fail "the installed digest produced nothing. Log: $(tail -20 "$DIGEST_LOGS/digest.log" 2>/dev/null)"
fi

# ===========================================================================
# 4. THE FAILING HALF. Without it, everything above is untested.
# ===========================================================================
#
# A mutant installer with the digest rows struck out of the manifest, which is
# exactly the shape install.sh had before DIGEST-01 added them. Everything else
# is untouched, so a pass here would mean the assertions above are not looking at
# the digest at all.
MUT_DIR=$WORK/mutant
mkdir -p "$MUT_DIR"
cp "$HERE"/*.sh "$HERE"/*.mjs "$HERE"/*.md "$MUT_DIR/" 2>/dev/null

# THE MUTANT IS BUILT BY PARSING, NOT BY grep -v, AND THE FIRST ATTEMPT PROVED
# WHY. A `grep -v` of the two digest rows also removed the LAST line of the
# POC_MANIFEST string, which is where its closing quote lives. The string then
# swallowed everything after it and the mutant died on a syntax error at line
# 112. A mutant that dies on line 112 installs no digest either, so the
# assertion below would have passed while proving nothing.
#
# That is the defect class docs/LEARNINGS.md names as a matcher whose empty or
# partial result reads as success. The rows are therefore removed by rewriting
# the manifest as a whole value, which cannot leave it unbalanced.
node -e '
const fs = require("fs");
const src = fs.readFileSync(process.argv[1], "utf8");
const lines = src.split("\n");
const start = lines.findIndex((l) => l.startsWith("POC_MANIFEST=\""));
if (start < 0) { console.error("no POC_MANIFEST assignment"); process.exit(3); }
let end = start;
while (end < lines.length && !lines[end].endsWith("its agent\"")) end += 1;
if (end >= lines.length) { console.error("POC_MANIFEST is not terminated"); process.exit(3); }
const body = lines.slice(start, end + 1);
const kept = body.filter((l) => !l.includes("digest.sh|") && !l.includes("rc-poc-digest.plist.template"));
if (kept.length !== body.length - 2) { console.error("expected to drop exactly 2 rows, dropped " + (body.length - kept.length)); process.exit(3); }
// Re-terminate: the last surviving row now carries the closing quote.
kept[kept.length - 1] = kept[kept.length - 1].replace(/"$/, "") + "\"";
fs.writeFileSync(process.argv[2], lines.slice(0, start).concat(kept, lines.slice(end + 1)).join("\n"));
' "$HERE/install.sh" "$MUT_DIR/install.sh" || fail "the digest-less mutant could not be built"
chmod 755 "$MUT_DIR/install.sh"

if bash -n "$MUT_DIR/install.sh" 2>/dev/null; then
  pass "the digest-less mutant parses, so it can fail for the reason under test and not for a syntax error"
else
  fail "the mutant does not parse, so it would install nothing for the wrong reason"
fi

MUT_PREFIX=$WORK/mutant-prefix
mkdir -p "$MUT_PREFIX"
POC_INSTALL_ROOT="$MUT_PREFIX" POC_INSTALL_REPO_ROOT="$REPO_ROOT" \
  bash "$MUT_DIR/install.sh" > "$WORK/mutant-install.log" 2>&1
MUT_RC=$?

# The mutant must RUN. A mutant that dies on its first line installs nothing
# either, and would satisfy the assertion below while proving nothing at all.
if grep -q "installed $MUT_PREFIX/rc-poc-bin/run.sh" "$WORK/mutant-install.log"; then
  pass "the digest-less mutant still runs and still installs the work harness, so it is a real control"
else
  fail "the mutant did not run at all, so nothing below it proves anything: $(tail -5 "$WORK/mutant-install.log")"
fi

if [ -f "$MUT_PREFIX/rc-poc-bin/digest.sh" ]; then
  fail "the digest-less mutant installed a digest, so this control tests nothing"
else
  pass "the digest-less mutant installs NO digest, which is the defect"
fi

if [ "$MUT_RC" -ne 0 ]; then
  pass "the mutant's own manifest count catches the missing rows and it exits non-zero"
else
  pass "the mutant exits 0 and the invocation below is what catches it"
fi

if POC_DIGEST_REPO_MAIN="$REPO_ROOT" \
   POC_DIGEST_WORKTREE="$WORK/mutant-worktree" \
   POC_DIGEST_LOG_DIR="$WORK/mutant-logs" \
   POC_DIGEST_SECRETS_FILE="$FAKE_SECRETS" \
   POC_DIGEST_STATE="$WORK/mutant-state.json" \
   POC_DIGEST_OUTBOX="$WORK/mutant-outbox.txt" \
   bash "$MUT_PREFIX/rc-poc-bin/digest.sh" --force > /dev/null 2>&1; then
  fail "the missing digest ran anyway, which means this assertion cannot fail"
else
  pass "invoking the digest the mutant did not install FAILS, which is what this case had to show"
fi

# ===========================================================================
# 5. NOTHING TOUCHED THE REAL INSTALLATION
# ===========================================================================
if [ -e /Users/ivan/rc-poc-bin ] || [ ! -e /Users/ivan ]; then
  # On the owner's Mac the directory exists and this file must not have written
  # into it; on a CI runner /Users/ivan does not exist at all and there is
  # nothing to protect. Either way the prefix is what was written.
  if grep -q "^installed /Users/ivan" "$WORK/install.log"; then
    fail "the test install wrote into the REAL /Users/ivan tree"
  else
    pass "every installed path is under the temporary prefix, none under /Users/ivan"
  fi
fi


# ===========================================================================
# 6. AUT-21: THE DEPLOYED COPIES ARE COMPARED WITH THE REPOSITORY
# ===========================================================================
#
# The three scripts under rc-poc-bin are installed copies and the .mjs modules
# beside them are read from a worktree at origin/main, so the two halves do not
# upgrade together. R-120 is the instance: merging a fix to the selector did not
# fix the selector, because run.sh is a deployed copy.
#
# THE BLOCK IS LIFTED FROM run.sh VERBATIM, by its EXTRACT fences, the same
# mechanism test-pr-census.sh uses. A test that re-stated the comparison would
# prove only that the test agrees with itself.
#
# EVERY PATH BELOW IS UNDER THE TEMPORARY PREFIX SECTION 1 ALREADY BUILT AND
# SECTION 5 ALREADY ASSERTED IS NOT /Users/ivan. Nothing here reads
# /Users/ivan/rc-poc-bin, /Users/ivan/rc-poc-logs or /Users/ivan/rc-secrets, and
# no credential value is read, printed or logged.
echo
echo "6. AUT-21: deployed-copy drift"

DRIFT_BLOCK=$WORK/drift-check.sh
awk '
  $0 == "# EXTRACT-BEGIN drift-check" { taking = 1; next }
  $0 == "# EXTRACT-END drift-check"   { taking = 0; found = 1; next }
  taking { print }
  END { if (!found) exit 3 }
' "$HERE/run.sh" > "$DRIFT_BLOCK"
if [ $? -ne 0 ] || [ ! -s "$DRIFT_BLOCK" ]; then
  fail "no EXTRACT block named 'drift-check' in $HERE/run.sh. The fences are part of the contract."
  echo
  echo "$FAILURES assertion(s) failed"
  exit 1
fi
pass "the drift-check block is fenced in run.sh and was lifted verbatim"

# The harness for one case: a state.json, a log, and the real block sourced over
# them. install.sh is invoked for its manifest only, with the prefix as its root,
# so the destinations it prints are the ones section 1 installed.
drift_case() {
  DC_DIR=$WORK/drift-$1
  mkdir -p "$DC_DIR"
  : > "$DC_DIR/log.txt"
  echo '{"schema_version": 2, "escalations": []}' > "$DC_DIR/state.json"
  cat > "$DC_DIR/case.sh" <<CASE
set -u -o pipefail
CASE_DIR=$DC_DIR
RUN_ID=testrun
POC_INSTALL_ROOT=$PREFIX
export POC_INSTALL_ROOT
CASE
  cat >> "$DC_DIR/case.sh" <<'CASE'
log() { echo "$*" >> "$CASE_DIR/log.txt"; }
CASE
  cat >> "$DC_DIR/case.sh" <<CASE
source "$DRIFT_BLOCK"
drift_detect "$HERE/install.sh"
drift_escalate "\$CASE_DIR/state.json"
CASE
  bash "$DC_DIR/case.sh" > "$DC_DIR/stdout.txt" 2>&1
  echo "$DC_DIR"
}

escalation_count() {
  node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((s.escalations||[]).length)' "$1/state.json"
}

# --- 6b. NO DRIFT IS SILENT ------------------------------------------------
# Section 1 installed from this very repository moments ago, so the copies are
# byte identical and this case must produce nothing.
D=$(drift_case quiet)
if grep -q "DRIFT " "$D/log.txt"; then
  fail "a byte-identical installation reported drift"
  cat "$D/log.txt"
else
  pass "byte-identical copies write no drift line"
fi
if [ "$(escalation_count "$D")" = 0 ]; then
  pass "byte-identical copies append no escalation"
else
  fail "a byte-identical installation appended an escalation"
fi
if grep -q "deployed script(s) match the repository byte for byte" "$D/log.txt"; then
  pass "and it says so out loud, so a check that ran cannot look like one that did not"
else
  fail "the quiet case wrote nothing at all, which is indistinguishable from not running"
  cat "$D/log.txt"
fi

# --- 6a. DRIFT IS REPORTED -------------------------------------------------
# ONE BYTE. Not a rewrite: the check must not need a large difference to see one,
# and a comment line is what a real drift usually looks like.
echo "# one byte of drift, added by test-install.sh" >> "$PREFIX/rc-poc-bin/run.sh"

D=$(drift_case noisy)
if grep -q "DRIFT $PREFIX/rc-poc-bin/run.sh " "$D/log.txt"; then
  pass "a one-byte difference is reported, and the line names the file"
else
  fail "a one-byte difference was not reported"
  cat "$D/log.txt"
fi

# THE TWELVE CHARACTERS OF BOTH SUMS, and they must be DIFFERENT from each other,
# which is what makes the line evidence rather than decoration.
DRIFT_LINE=$(grep "DRIFT $PREFIX/rc-poc-bin/run.sh " "$D/log.txt" | head -1)
D_REPO=$(printf '%s' "$DRIFT_LINE" | sed -n 's/.*repo=\([0-9a-f]*\).*/\1/p')
D_DEPL=$(printf '%s' "$DRIFT_LINE" | sed -n 's/.*deployed=\([0-9a-f]*\).*/\1/p')
if [ ${#D_REPO} = 12 ] && [ ${#D_DEPL} = 12 ] && [ "$D_REPO" != "$D_DEPL" ]; then
  pass "the line carries twelve characters of each sha256 and they differ: $D_REPO vs $D_DEPL"
else
  fail "the drift line does not carry two different twelve-character sums: '$DRIFT_LINE'"
fi

if [ "$(escalation_count "$D")" = 1 ]; then
  pass "exactly one escalation is appended to state.json"
else
  fail "expected one escalation, found $(escalation_count "$D")"
fi

ESC=$(node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const e = (s.escalations || [])[0] || {};
  console.log(JSON.stringify({ card: e.card_id, q: e.question || "", r: e.recommendation || "" }));
' "$D/state.json")
if printf '%s' "$ESC" | grep -q '"card":"AUT-21"'; then
  pass "the escalation names the card"
else
  fail "the escalation does not name AUT-21: $ESC"
fi
if printf '%s' "$ESC" | grep -q "rc-poc-bin/run.sh"; then
  pass "the escalation names the file that drifted"
else
  fail "the escalation does not name the drifted file: $ESC"
fi
if printf '%s' "$ESC" | grep -q "install.sh"; then
  pass "the recommendation says to re-run the installer"
else
  fail "the recommendation does not name install.sh: $ESC"
fi

# IT REPORTS, IT NEVER RE-INSTALLS. The drifted copy is still drifted afterwards.
# A check that quietly healed what it found would make the next run look clean and
# would be rewriting a script something may be executing.
if [ "$(tail -1 "$PREFIX/rc-poc-bin/run.sh")" = "# one byte of drift, added by test-install.sh" ]; then
  pass "the check reported and did not re-install: the drifted copy is untouched"
else
  fail "the drift check modified the deployed copy"
fi

# THE LIST IS DERIVED FROM install.sh AND NOT TYPED. Proved by asking install.sh
# for its manifest and requiring the three 755 rows to be exactly the files the
# check compares, so a fourth agent added to that manifest joins this check with
# no second edit anywhere.
MANIFEST_SCRIPTS=$(POC_INSTALL_ROOT="$PREFIX" bash "$HERE/install.sh" --manifest 2>/dev/null \
  | awk -F'|' '$4 == "755" { print $3 }' | sort)
CHECKED=$(grep -oE "DRIFT [^ ]+|match the repository" "$D/log.txt" >/dev/null 2>&1; \
  POC_INSTALL_ROOT="$PREFIX" bash "$HERE/install.sh" --manifest 2>/dev/null | awk -F'|' '$4 == "755"' | wc -l | tr -d '[:space:]')
if [ "$CHECKED" = 3 ] && printf '%s\n' "$MANIFEST_SCRIPTS" | grep -q "rc-poc-bin/run.sh"; then
  pass "the manifest itself yields the three deployed scripts, so the list is derived"
else
  fail "install.sh --manifest did not yield three 755 rows (got $CHECKED)"
fi

# --manifest INSTALLS NOTHING. It is the seam this check reads and it must not be
# able to write, or a check would become a writer to the thing it checks.
MANIFEST_PROBE=$WORK/manifest-probe
POC_INSTALL_ROOT="$MANIFEST_PROBE" bash "$HERE/install.sh" --manifest > /dev/null 2>&1
if [ ! -e "$MANIFEST_PROBE" ]; then
  pass "install.sh --manifest creates nothing at all"
else
  fail "install.sh --manifest wrote into $MANIFEST_PROBE"
fi

# A DEPLOYED COPY THAT IS ABSENT IS REPORTED, NOT SKIPPED. An installer that never
# ran for a file is a louder version of the same fault, and a missing file that
# read as "no drift" would be the exact silence this card removes.
rm -f "$PREFIX/rc-poc-bin/digest.sh"
D=$(drift_case absent)
if grep -q "DRIFT $PREFIX/rc-poc-bin/digest.sh repo=.* deployed=absent" "$D/log.txt"; then
  pass "a deployed copy that is missing entirely is reported as drift"
else
  fail "a missing deployed copy was skipped instead of reported"
  cat "$D/log.txt"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "all installer assertions passed"
  exit 0
fi
echo "$FAILURES assertion(s) failed"
exit 1
