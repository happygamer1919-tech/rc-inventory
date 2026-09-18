# P3-79: zsh exit-code rule (F15) and one rule for what green authorises (F19)

Role: AUTHOR. Date: 2026-09-18. Branch: `card/p3-79`. Source: the operator
factory's goals G30 and G35, Ivan's findings F15 and F19, bundled into one pull
request as G35 requires.

## In plain words

Two of the project's written rules were tidied. One explains how to read whether
a check passed or failed on this computer's terminal, because a common shortcut
silently gives the wrong answer here. The other removes a contradiction: the
rules gave two different answers to "when may a finished change go live", and
now there is one answer, written once. Nothing in the application changed.

## Boot status report

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in flight, 0 halted. Launch
  gate 0/9. Next eligible: AUT-3.
- Phase 3 board: 94 shipped, 32 todo, 1 blocked (before this card). Launch gate
  0/9. Next eligible: P3-14.
- This session worked an owner-directed documentation card, not the board pick.

## Card

`P3-79`, allocated with `npm run id:free -- P3-79` (FREE, lane highest P3-78,
zero open pull requests at that moment). Authored `in_flight` in its own commit,
then flipped to `shipped` with evidence.

## F15: where the shell rule went, and why

**Section 6, the Evidence rule**, as a new closing paragraph "READING AN EXIT
CODE: THE TERMINAL SHELL IS `zsh`, NOT `bash`". CLAUDE.md has no shell rules
section. Section 6 is where acceptance is defined as "a command with an expected
exit code", so the rule on reading that exit code correctly belongs next to it.
The rule: run the command alone, no pipe, output to a file, `$?` captured on the
very next line; a pipe reports the last command's status; `${PIPESTATUS[0]}` is
bash only and expands to nothing in zsh; any command in between replaces `$?`.

`grep -rn PIPESTATUS scripts/` returns nothing (also nothing under `.github/`).
No script uses it, so the second clause of F15 was already true and no script
changed.

## F19: what was corrected

P3-73 corrected the first copy of the "every step runs on every pull request"
claim and missed the others. Three sentences in section 3.1 are now quoted, kept
and marked corrected under section 9c:

1. **Item 1 of the list under R-084** ("the full, unfiltered suite green ... the
   only green that authorises a merge"). Replaced by the surviving rule, stated
   once: `quality` concluded success on the head sha, with the steps the workflow
   itself decided to run for that diff; the typecheck and every Refuse and Prove
   step outside the two filters always run; a code pull request additionally
   needs Build, the migration apply and End to end run and passed; a
   documentation-only pull request does not; applier proofs per item 2. It points
   to the P3-73 subsection for what `docs_scope` counts and gates, rather than
   repeating it.
2. **The last sentence after PROVE-01** ("The rest of the job is unfiltered ...
   that is still the green this section means"). Not named in the task, but it is
   the same false claim in other words; it now points to item 1.
3. **Item 1 of the P3-73 restated list** ("The unfiltered suite green ... the only
   green this section has ever meant"). It now points to item 1 under R-084 and
   says items 2 to 4 spell out that one rule rather than being a second rule.

No workflow, application code, migration or other card changed.

## `grep -n "only green" CLAUDE.md`, after the edit

```
322:   itself decided to run for that diff. This is the only green that authorises a
339:   > always meant and it is still the only green that authorises a merge."*
476:1. **The only green that authorises a merge is item 1 of the restated list under
485:   > only green this section has ever meant."*
```

Line 322 is the one rule. Line 476 is the P3-73 pointer to it. Lines 339 and 485
are the old sentences, kept in quotes and marked corrected, as section 9c
requires; they are not claims. No line states a second, different rule.

## Acceptance, run locally on the branch

1. `grep -cF 'THE TERMINAL SHELL IS' CLAUDE.md` printed 1;
   `grep -cF 'PIPESTATUS[0]' CLAUDE.md` printed 1.
2. `grep -rn PIPESTATUS scripts/` printed nothing.
3. `grep -c 'only green' CLAUDE.md` printed 4;
   `grep -c 'This is the only green that authorises a' CLAUDE.md` printed 1;
   `grep -c 'The only green that authorises a merge is item 1' CLAUDE.md` printed 1.
4. `grep -c 'SAID SOMETHING ELSE UNTIL CARD P3-79' CLAUDE.md` printed 3.
5. Each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all
   three boards, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
   `check:no-destructive-migration`, `check:conflict-residue`,
   `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
   `check:pending-schema-reads`, `check:removal-safety`,
   `check:assertion-register`. `check:board-edit` run after the shipped flip.

`quality` on the pull request head is the remaining half and is recorded in the
pull request.

## Learnings

One entry appended to `docs/LEARNINGS.md`: a doctrine correction that fixes one
copy of a claim leaves the other copies standing; grep for the phrase and its
paraphrases and correct every hit in the same pull request.

## Noticed, not touched

`docs/LEARNINGS.md` lines 1186, 1187 and 3652 carry em dashes. They predate this
card and belong to card LEARN-01.

## Merge

No self-merge: real client data is in production since 2026-09-14. The merge is
held for the owner.
