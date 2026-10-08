# owner-approval.sh - sourced by auto-merge.sh. A1 of the 2026-10-07 bug check.
# A PR whose diff touches supabase/migrations/ merges only when an approval file
# mailbox/answers/q-owner-approve-*.md names THAT PR number as "#<n>". An approval
# for another number does not count: a replaced or renumbered PR needs a fresh OK.
# owner_approved <pr> [answers_dir] -> exit 0 when approved, 1 otherwise.
owner_approved() {
  local pr=$1 dir=${2:-$HOME/Projects/prompt-factory-rc-inventory/mailbox/answers} f
  [[ "$pr" == <-> ]] || return 1
  for f in "$dir"/q-owner-approve-*.md(N); do
    grep -qE "#${pr}([^0-9]|\$)" "$f" && return 0
  done
  return 1
}
