#!/bin/bash
#
# THE STRIP LIST. ONE FILE, SOURCED BY EVERY SCRIPT THAT INVOKES A MODEL.
#
# Card AUT-8. The scheduled run sources /Users/ivan/rc-secrets/phase2.env into
# its own process, because it genuinely needs the Telegram names to send a digest
# and read the inbox. Every child it then spawns inherited all of it, including
# `claude -p`, on every run, whether or not that run went anywhere near a
# database. This file names what a model process does not need.
#
# IT IS DATA AND NOTHING ELSE. No command runs when this file is sourced, so
# sourcing it can have no effect beyond defining the two things below.
#
# WHY ONE FILE RATHER THAN A LIST AT EACH CALL SITE. scripts/poc/responder.sh
# already solved this problem with `env -u` at its own invocation and carried its
# own copy of the list. A second copy in run.sh would have been two lists that
# agree today, and the failure mode of them drifting apart is a credential
# quietly surviving in one process and nobody noticing, which is exactly the
# defect this card removes. AUT-16 removed three copies of a path list for the
# same reason. The card's defaults require this in terms: "put the strip list in
# one sourced place so the two cannot drift apart".
#
# WHEN IN DOUBT A NAME IS STRIPPED, and the two failure modes are not comparable.
# The failure mode of stripping is a run that reports a missing variable on its
# next pass. The failure mode of keeping is a credential sitting in a process that
# had no reason to hold it, four times a night.
#
# CLAUDE.md 8.3 IS NOT NARROWED BY THIS FILE. A step that genuinely needs a
# credential re-sources /Users/ivan/rc-secrets/phase2.env under `set -o
# allexport`, exactly as that section authorises. The FILE is still readable; what
# is removed is the credential sitting in the model process REGARDLESS of whether
# it has anything to use it for, which 8.2 never granted.
#
# NAMES ONLY. No value appears in this file, may ever appear in it, or appears in
# anything that reads it. CLAUDE.md section 7.

# ---------------------------------------------------------------------------
# The names stripped from any model child process.
#
# NEXT_PUBLIC_SUPABASE_URL IS ON THIS LIST AND IT IS NOT A SECRET, which is the
# one entry that needs its reason written down. It is public by construction:
# `scripts/production-refs.mjs` says so, because the URL carries the project ref
# into the JavaScript bundle sent to every browser that opens the application.
# It is stripped because it is not NEEDED, and the card required that to be
# MEASURED rather than assumed: `npm run build` was run with the variable absent
# and exited 0, so nothing in the build depends on it.
#
# NEXT_PUBLIC_SUPABASE_ANON_KEY is on the list for the same measured reason and
# is named in the card's own clause (a).
# ---------------------------------------------------------------------------
POC_SECRET_STRIP_NAMES="\
SUPABASE_SERVICE_ROLE_KEY \
SUPABASE_DB_PASSWORD \
SUPABASE_DB_URL \
SUPABASE_URL \
RESEND_API_KEY \
TELEGRAM_BOT_TOKEN \
TELEGRAM_CHAT_ID \
MAKE_WEBHOOK_URL \
MAKE_WEBHOOK_SECRET \
MAKE_CALLBACK_SECRET \
VERCEL_TOKEN \
NEXT_PUBLIC_SUPABASE_URL \
NEXT_PUBLIC_SUPABASE_ANON_KEY"

# The `-u NAME` arguments for env(1), derived from the list above so no call site
# writes a second copy of it. Printed one per line so a caller can read them into
# an array without word splitting surprises.
poc_secret_strip_args() {
  for POC_SN in $POC_SECRET_STRIP_NAMES; do
    printf -- '-u\n%s\n' "$POC_SN"
  done
}
