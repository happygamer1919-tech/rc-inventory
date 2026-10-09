# RC handoff, 2026-10-08 (cloud session, role POC)

Cloud session on claude.ai/code, working the rc-inventory repo only. It cannot reach the Mac, so
claude-toolkit and prompt-factory-rc-inventory are out of its reach. Plain hyphens only.

## Done
- **High #1 fixed and merged: the walk-in buyer list no longer offers leads.** Card P3-196, PR #470,
  squash commit 7f75f44 on main. The Iesiri page now reads active clients at stage `client` only
  (new `listBuyerOptions`); every other picker is unchanged. No migration.
  - Acceptance: new e2e case "P3-196: un lead si un client inactiv nu apar in lista de cumparatori";
    `quality` green on head 5cb5b60 (35 min run).
  - Two CI rounds on the way: (1) check:board-edit wants the card `shipped` in the same PR; (2) five
    outbound specs inserted their buyer with no stage, so it defaulted to `cold` and was hidden. The
    fixtures now set stage `client`. A LEARNINGS.md entry was added.
- **A1 and A2 prepared as patches, NOT applied** (the factory files live on the Mac):
  `docs/handoffs/patches-2026-10-08/` on branch `claude/relaxed-hopper-n2u3qd` (commit 29ad907).
  README.md there has the apply commands.
  - A1: new bin/owner-approval.sh. auto-merge.sh refuses a PR touching supabase/migrations/ unless a
    `q-owner-approve-*.md` file names that exact `#<pr>`. selftest-owner-approval.sh: 8 passed, 0 failed
    under zsh. This also enforces A5 in code.
  - A2: the `git -C *` allows now name the three real paths; the two dead deny rules are replaced, and
    `git -c`, `-C <path> -c` and `--exec-path` are denied. NOT verified, because Claude Code's matcher only runs on the Mac.

## Open, all on the Mac or Max
1. Apply A1 and A2, run selftest-owner-approval.sh and selftest-gitrules.sh plus the 4 new A2 cases,
   check that the approval files contain "#445" and "#469", then restart auto-merge.sh.
2. A3 STATUS.md, A4 run the 7 selftests, A5 close-out step 8 text, A6 deps_met. Details are in
   docs/handoffs/REMAINING-FIXES-2026-10-08.md on branch handoff/2026-10-08.
3. Max presses "Check for bugs" once 1 and 2 are merged. A clean result moves the project to Review.
4. Max: rotate the Resend key (it is in plain text in ~/.claude/settings.json). Ivan: DB timezone,
   Supabase max-rows, P2-13 rotation.
5. Check production for real customers still at a lead stage. Since P3-196 they no longer appear as
   walk-in buyers.

## Notes for the next session
- This branch's PR (#470) is merged. New work goes on a fresh branch from main; never force-push.
- `npm run id:free`, `check:migrations` and `check:open-branch-ids` cannot run in the cloud (no gh CLI, no Docker).
- Credit cap: the session cannot read its own spend. Max watches the meter and says stop near $240.
