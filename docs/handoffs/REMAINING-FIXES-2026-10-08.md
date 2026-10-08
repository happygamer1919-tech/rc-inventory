# Remaining fixes, 2026-10-08

Written by the RC brain for the cloud session. Plain hyphens only.

## Read this first

All 42 entries in PLAN.md's "Bug check fixes" track (43 were added on 2026-10-06; PLAN.md now holds 42) are MERGED and live (table in section B). The walk-in
buyer leads regression from the 2026-10-07 check is fixed in PR #470 (P3-196, merged 2026-10-08).
**What is actually open: the 6 remaining findings of the 2026-10-07 Fable bug check (section A).**
Source: docs/handoffs/files/projects/rc-inventory/checks/build-20261007T184116904Z.json.

Repos: **rc-inventory** = this repo. **prompt-factory** = the local factory ~/Projects/prompt-factory-rc-inventory
(no GitHub remote; copies of its files are under docs/handoffs/files/). **claude-toolkit** = ~/Projects/claude-toolkit.
All 6 open fixes live in prompt-factory; none touches app code. A cloud session can prepare the change as a
patch against the copies here; the brain applies it on the Mac.

## A. Open fixes (6)

### A1. HIGH: database changes do not wait for the owner's OK

- Repo: prompt-factory. Files: bin/auto-merge.sh (copy: files/bin/auto-merge.sh); its test tests/auto-merge-destructive.sh (factory only, not copied).
- Problem: the auto-merger merges every green non-draft PR, migrations included. Migration PRs were held only because the running process (started 2026-10-02) still used an old whole-diff 'drop table' scan; the newer code (2a59f8a, real SQL only) would merge them unasked once restarted.
- Fix: refuse to merge any PR whose diff touches supabase/migrations/ unless an approval file mailbox/answers/q-owner-approve-*.md names THAT PR number; log the refusal.
- Acceptance: tests/auto-merge-destructive.sh (or a new selftest) proves (1) a migration PR without an approval file is not merged, (2) with a matching approval it is merged, (3) an approval for a different PR number does not count; prints failed: 0.

### A2. MEDIUM: worker allowlist too wide, two deny rules never fire

- Repo: prompt-factory. File: .claude/settings.json (copy: files/.claude/settings.json).
- Problem: allow rules like Bash(git -C * merge origin/main*), Bash(git -C * pull --ff-only*), Bash(git -C * push origin card/*), Bash(git -C * branch --show-current*) put a wildcard before the subcommand, so git -C <path> -c <alias/exec-path trick> push origin card/x is approved. Deny rules Bash(git push * :*) and Bash(git -C * push * :*) mix * with the :* suffix and match nothing. Careful: Bash(git push * *) would deny every normal push.
- Fix: replace wildcard paths with the three real paths (/Users/sm33xy/Projects/rc-inventory, /Users/sm33xy/Projects/rc-inventory-worktrees/*, the factory); rewrite the two deny rules in valid wildcard form aimed at colon-refspec deletes.
- Acceptance: no permission warnings at the top of a worker log; bin/selftest-gitrules.sh passes (28/0 today) plus new cases: git -C <repo> -c alias.x=!sh push origin card/x refused; git push origin :card/x refused; git push origin card/x and git push origin card/x-r2:card/x allowed.

### A3. MEDIUM: status page says three DB changes wait for Max

- Repo: prompt-factory. File: docs/STATUS.md (copy: files/docs/STATUS.md). Also PLAN.md manual statuses in claude-toolkit projects/rc-inventory/PLAN.md.
- Problem: STATUS.md (2026-10-06) says 'three need your OK' and 'helpers need a restart'; everything is merged (live commit 641d14c, ledger 0076 at the time) and CYAN is off.
- Fix: rewrite the intro and Blocked/In Progress to match gh pr list (no open PRs) and the live /api/health; keep every Done item (never squash Done).
- Acceptance: Blocked lists no DB approval; In Progress matches open PRs and queue holds; Updated line dated the day of the edit; no em or en dash.

### A4. LOW: seven factory selftests never run; untested worker code live

- Repo: prompt-factory. Files: bin/selftest-shipcheck.sh, selftest-routing.sh, selftest-deps.sh, selftest-single-lane.sh, selftest-task-branch.sh, selftest-watchloop.sh, tests/auto-merge-destructive.sh; the single-lane guard in bin/worker.sh (commit 1bee6cd).
- Note: the brain ran selftest-routing (38/0) and selftest-shipcheck (25/0) on 2026-10-05; the others are unrun. Needs the Mac (scripts use zsh and local paths).
- Acceptance: each script run once with its output recorded; all print failed: 0, or the failing part (e.g. the single-lane guard) is reverted from bin/worker.sh.

### A5. LOW: migration PR merged under an approval for a different PR number

- Repo: prompt-factory. File: roles/close-out-block.md (step 8). Context: Max approved #445 and #458; #458 was replaced by #469 (same change, card renumbered to P3-195, migration 0075) and merged under that approval.
- Fix: close-out step 8 states that an approval covers only the PR number it names; a replaced or renumbered PR stops at a fresh OWNER question. A1's approval-file check enforces it in code.
- Acceptance: the rule text is in step 8; A1's test case (3) passes. #469 itself needs Max's after-the-fact OK noted in the brain's report (no code).

### A6. LOW: a task whose After: prerequisite failed waits forever

- Repo: prompt-factory. File: bin/worker.sh, function deps_met (commit de9dd6d).
- Problem: deps_met looks only in queue/done/; a prerequisite in queue/failed/ makes the dependent task skip silently every cycle.
- Fix: when a prerequisite is in queue/failed/, file the dependent task in queue/failed/ with a note naming the prerequisite (or log one line per cycle naming what it waits on).
- Acceptance: a selftest case with the prerequisite in queue/failed/ ends with the dependent in queue/failed/ carrying the note; selftest-routing still 38/0.

## B. The 42 fixes in PLAN.md's "Bug check fixes" track: all merged, no action

Severity was not kept per task in PLAN.md; acceptance for each is on its board card in docs/board/rc-board-phase3.json (field acceptance). All live in rc-inventory.

| Card / PR | Fix | Status |
|---|---|---|
| P3-137 / #406 | Import reads 250.000 as a thousands number | merged |
| P3-138 / #407 | Switched-off staff can't touch sale lines | merged |
| P3-139 / #422 | Exports keep phone numbers and codes exact in Excel | merged |
| P3-140 / #414 | Import shows a badly written email or phone as an error | merged |
| P3-141 / #416 | Import preview shows the rows to be created | merged |
| P3-142 / #408 | Azi stops saying 'nothing to do' when tasks are due | merged |
| P3-143 / #410 | Home screen shows the client name for walk-in sales | merged |
| P3-144 / #427 | Sale type locked while a slip is saving | merged |
| P3-145 / #411 | Excel CSV imports keep Romanian and Russian letters | merged |
| P3-146 / #412 | Decimal quantities show correctly (2,5 m2) | merged |
| P3-148 / #430 | Walk-in line with no quantity is refused, not dropped | merged |
| P3-150 / #415 | Esc closes only the dropdown in the task form | merged |
| P3-151 / #417 | Import finds duplicates among all clients | merged |
| P3-152 / #418 | Walk-in sales stop warnings on every client page | merged |
| P3-153 / #419 | Long product and sales lists show in pages | merged |
| P3-154 / #420 | Exports open correctly in Romanian or Russian Excel | merged |
| P3-155 / #421 | Import error file has the full row and right row number | merged |
| P3-156 / #423 | Exports include the next-step date | merged |
| P3-157 / #425 | Saving a task changes only what you edited | merged |
| P3-158 / #428 | Half-typed task date no longer wipes the due date | merged |
| P3-159 / #429 | Walk-in purchases show on the client's page | merged |
| P3-160 / #431 | Task shows the name of a closed project or inactive client | merged |
| P3-162 / #432 | Task list shows all tasks, not just 1000 | merged |
| P3-163 / #433 | Walk-in prices show exact amounts (12,50 MDL) | merged |
| P3-164 / #435 | Re-importing clients without email makes no duplicates | merged |
| P3-165 / #436 | Task shows a colleague with no full name by email | merged |
| P3-166 / #437 | Every active client can be picked, past 1000 | merged |
| P3-167 / #438 | Test: exported materials re-import exactly | merged |
| P3-168 / #441 | Lead import doesn't overwrite an existing client's source | merged |
| P3-169 / #442 | Sarcini screens: three small faults fixed | merged |
| P3-172 / #446 | A counter buyer is saved as a client | merged |
| P3-173 / #448 | Exported projects re-import without errors | merged |
| P3-176 / #459 | Azi shows 'Nothing to do' only when truly empty | merged |
| P3-178 / #451 | Inbound orders list shows all orders past 1000 | merged |
| P3-181 / #453 | Product history shows every movement past 1000 | merged |
| P3-182 / #454 | CSV with a foreign name keeps all letters right | merged |
| P3-183 / #455 | Import stops with a clear message if the database can't be read | merged |
| P3-170 / #444 | Account manager sees and assigns the real task owner | merged |
| P3-179 / #452 | Switched-off staff can't read stock batches | merged |
| P3-147 / #413 | Account manager adds a new walk-in buyer (merging) | merged |
| P3-171 / #445 | Invoice for a walk-in sale refused on save (merging) | merged |
| P3-177 / #450, regression fixed in P3-196 / #470 | Tell apart two buyers with the same name (merging) | merged |

## C. Copied files (docs/handoffs/files/<original path>)

- bin/auto-merge.sh, .claude/settings.json, docs/STATUS.md: from prompt-factory.
- projects/rc-inventory/checks/build-20261007T184116904Z.json: from claude-toolkit.
Checked for secret values before committing: none present (names only).
