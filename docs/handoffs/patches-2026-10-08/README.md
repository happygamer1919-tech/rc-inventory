# Factory patches, 2026-10-08 (A1 and A2 of the 2026-10-07 bug check)

Prepared in a cloud session against the copies on branch handoff/2026-10-08. Apply on the Mac,
in ~/Projects/prompt-factory-rc-inventory. Plain hyphens only.

## Apply

    cd ~/Projects/prompt-factory-rc-inventory
    git -C ~/Projects/rc-inventory fetch origin claude/relaxed-hopper-n2u3qd
    git -C ~/Projects/rc-inventory show origin/claude/relaxed-hopper-n2u3qd:docs/handoffs/patches-2026-10-08/factory-a1-a2.patch > /tmp/a1a2.patch
    patch -p1 --dry-run < /tmp/a1a2.patch && patch -p1 < /tmp/a1a2.patch

new/ holds the full result files if the patch does not apply cleanly (the copies may be older than the live files).

## A1 - migration PRs wait for the owner's OK

- New bin/owner-approval.sh: owner_approved <pr> passes only if a mailbox/answers/q-owner-approve-*.md
  file contains "#<pr>" (not followed by a digit). Another PR number never counts, which also closes A5.
- bin/auto-merge.sh sources it and refuses any PR touching supabase/migrations/ without it, with a log line.
- New bin/selftest-owner-approval.sh: 8 cases, run here under zsh 5: passed 8, failed 0.
- Restart the running auto-merge.sh after applying; the old process keeps the old code.
- Approval files must now say "#<pr>" in their text. Check the existing ones (#445, #469) still match.

## A2 - worker git rules

- Every `git -C * ...` allow is replaced by the same rule for the three real paths
  (rc-inventory, rc-inventory-worktrees/*, prompt-factory-rc-inventory).
- The two dead deny rules (`git push * :*`, `git -C * push * :*`) are replaced by colon-refspec deletes of
  card/ and main, plus denies for `git -c`, `git -C <path> -c` and `--exec-path` (the alias/exec trick,
  which the worktrees/* wildcard could otherwise still carry).
- NOT VERIFIED HERE: Claude Code's matcher is not available in the cloud. Run bin/selftest-gitrules.sh
  and add the four cases from REMAINING-FIXES A2 before trusting it. If a deny pattern does not fire,
  fix the pattern, never widen an allow.

## Not prepared here (need the Mac)

- A3 STATUS.md: needs `gh pr list` and the live /api/health. Today: no open PRs; #470 (P3-196) merged as 7f75f44.
- A4 run the seven selftests. A5 close-out step 8 text (roles/close-out-block.md not copied).
- A6 deps_met in bin/worker.sh (not copied).
