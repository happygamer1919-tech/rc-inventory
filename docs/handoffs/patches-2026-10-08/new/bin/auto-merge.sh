#!/bin/zsh
# auto-merge.sh - squash-merges our open RC PRs once the quality result on the head can be trusted.
# Max, 2026-09-17: "i am fully in charge of the projects so i want to enable automerging".
# Rewritten 2026-10-02 (the scratchpad copy was lost). Rules, same as before:
#   - only PRs authored by sm33xy, not drafts
#   - behind main -> update the branch and wait for a fresh run
#   - `npm run checks:state <pr>` must exit 0 (green result belongs to the head sha)
#   - a migration in the diff must not carry DROP TABLE, TRUNCATE or DELETE FROM
#   - a migration in the diff needs Max's OK: an approval file naming this PR number
#     (owner-approval.sh, bug check 2026-10-07 A1). Merging a migration applies it.
# Start: nohup zsh ~/Projects/prompt-factory-rc-inventory/bin/auto-merge.sh >/dev/null 2>&1 &
REPO_DIR="$HOME/Projects/rc-inventory"
LOG="$HOME/Projects/prompt-factory-rc-inventory/logs/auto-merge.log"
mkdir -p "${LOG:h}"
cd "$REPO_DIR" || exit 1
log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
log "auto-merge started, pid $$"
source "${0:A:h}/destructive-filter.sh"
source "${0:A:h}/owner-approval.sh"

while true; do
  for pr in $(gh pr list --state open --author sm33xy --json number,isDraft --jq '.[] | select(.isDraft==false) | .number' 2>/dev/null); do
    state=$(gh pr view "$pr" --json mergeStateStatus,headRefOid --jq '.mergeStateStatus+" "+.headRefOid' 2>/dev/null) || continue
    mss=${state%% *}; head=${${state#* }[1,7]}
    if [[ "$mss" == "BEHIND" ]]; then
      log "#$pr behind main, updating branch"
      gh pr update-branch "$pr" >> "$LOG" 2>&1
      continue
    fi
    [[ "$mss" == "CLEAN" ]] || continue
    if gh pr diff "$pr" --name-only 2>/dev/null | grep -q '^supabase/migrations/'; then
      if gh pr diff "$pr" 2>/dev/null | migration_destructive; then
        log "#$pr head $head migration has a destructive statement, NOT merging"
        continue
      fi
      if ! owner_approved "$pr"; then
        log "#$pr head $head touches supabase/migrations/ and no q-owner-approve-*.md names #$pr, NOT merging"
        continue
      fi
    fi
    npm run -s checks:state "$pr" > /dev/null 2>&1
    if [[ $? -ne 0 ]]; then continue; fi
    log "#$pr head $head trusted green, merging"
    gh pr merge "$pr" --squash --delete-branch >> "$LOG" 2>&1
    log "  -> $(gh pr view "$pr" --json state,mergeCommit --jq '.state+" "+(.mergeCommit.oid // "null")[0:7]' 2>/dev/null)"
  done
  sleep 60
done
