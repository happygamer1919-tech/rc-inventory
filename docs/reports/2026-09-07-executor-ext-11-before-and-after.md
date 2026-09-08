# EXECUTOR - run 20260907-220001 - EXT-11, the before-result and the after-result

**Role:** EXECUTOR. Unattended scheduled run, cap 45 minutes, at most 2 cards.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, started detached at `origin/main` `4171144`.

---

## Status report at boot

| board | shipped | in_flight | blocked | todo | launch gate |
|---|---|---|---|---|---|
| phase 2 | 65 | 1 (AUT-3) | 3 | 16 | 6/9 |
| phase 3 | 46 | 0 | 0 | 27 | 0/9 |

Blocked: `MIG-01` on ivan and answerable, `P2-08b` on andre, `P2-14` unreachable
because its dependencies have not shipped. No card was held by another actor:
the only claim in `docs/poc/state.json` is `EXT-11` by `harness` at
`2026-09-07T08:50:36Z`, which is about seventeen hours old and therefore expired
under the six hour lease.

Next eligible card, from `scripts/poc/eligible.mjs` over both boards:
**`EXT-11`**.

---

## The card

**EXT-11** - the supplier's document series, because two suppliers can both
issue number 0009312.

Its acceptance has six clauses. Five are ordinary. The sixth is a fact about
history:

> *THAT CASE FAILING BEFORE THE CHANGE AND THE PR SHOWING BOTH RESULTS.*

**That clause is the whole story of this card.** It has now taken four runs and
every one of the first three died on it.

---

## What I found before writing anything

`card/ext-11` and PR **#240** already existed, open, with the implementation
written by earlier runs. The state was:

    head              93fe03c
    mergeable         CONFLICTING
    quality           FAILURE

So this run's work was not to author EXT-11. It was to finish it.

Reading the branch back, `93fe03c` is a **deliberate revert**. An earlier run had
discovered that the two runs previously cited as the card's before-result were
not before-results at all:

| run | sha | what actually failed | did `End to end` run? |
|---|---|---|---|
| 34085557075 | 0211239 | the board-edit refusal | **skipped** |
| (run on 4e23829) | 4e23829 | `check-board-clock` | **skipped** |
| **34115053214** | **93fe03c** | **`End to end`** | **yes, and it failed** |

A `quality` job that stops early concludes `failure` in exactly the same way as
one whose test failed, and `gh pr checks` cannot tell the two apart. Both of the
first two runs recorded a red they had not actually earned.

`93fe03c` fixed that by reverting `app/`, `components/`, `lib/`, migration
`0036` and its assertions file to `origin/main` while keeping the new test
cases, and letting `quality` run against that. Run **34115053214 failed at the
`End to end` step**. That is the first genuine before-result this card has ever
had.

---

## What this run did

1. **Corrected my own mistake first.** My initial two commits were built on a
   detached HEAD at `origin/main` rather than on the branch, so they carried the
   implementation and the board edit but none of the tests, the contract change
   or the learnings entry. I noticed on `git push` reporting `Everything
   up-to-date`, checked out the real branch, and rebuilt both steps there. The
   orphaned commits were never pushed.

2. **Resolved the conflict locally, against the full tree** (R-052, CLAUDE.md
   section 3). `main` had moved four commits. Two files conflicted and both were
   pure appends:
   - `docs/LEARNINGS.md`: **both sides kept**, branch entries then main entries.
   - `docs/board/rc-board-phase3.json`: `as_of` only. Every card on both sides
     was byte-identical apart from that one line.

   `npm run check:conflict-residue` and the board validator were run **before**
   the commit, not after.

3. **Restored the implementation verbatim from `3ffaeb5`**, the parent of the
   revert. Eight paths. I checked with `git log --oneline origin/main --not
   3ffaeb5 -- <those paths>` that no commit on `main` has touched any of them
   since, so the restore overwrites nothing of main's.

4. **Wrote the board edit**: `EXT-11` `todo` -> `shipped`, with `evidence`
   naming what proves each of the six acceptance clauses, and `as_of` and
   `last_checkpoint` stamped from the clock rather than from an intention.

---

## A second defect this run found and fixed: the APPLY-LOG row was missing

**The branch carried migration `0036` and no entry in
`docs/migrations/APPLY-LOG.md`.**

CLAUDE.md 8.8: *"The row goes in BEFORE the PR that performs the write is
merged. Not after, not in a follow-up card."* And under 8.0 **the merge IS the
write**: the Supabase GitHub app applies a merged migration to production within
about two minutes, with no terminal involved. So merging #240 without that row
would have been a production write with no journal, which section 8.8 calls a
violation in those words.

The entry directly above it in that file, for `0035` under EXT-10, exists for
exactly this reason and was the template. The new one names the actor as the
integration rather than a terminal, quotes the
`check:no-destructive-migration` output verbatim as the control that precedes
the apply, and says plainly that the apply is **predicted and not yet observed**,
because this run's wall clock cap ends before it would land.

**It cost a second `quality` cycle**, deliberately. The alternative was merging
first and journalling after, which is the thing the rule forbids by name.

---

## What the card actually lands

Migration `0036_supplier_document_series.sql` adds **four** columns, all
nullable, none with a default:

    public.inbound_orders      order_ref, order_ref_series
    public.extraction_drafts   order_ref, order_ref_series

**It creates `order_ref` as well as the series, and the card did not ask for that
in those words.** The acceptance says "wherever `order_ref` is stored", and the
answer, checked rather than assumed, is **nowhere**: no migration mentions it,
`inbound_orders.reference` is *our* reference under its own unique constraint,
and contract section 4.1a says `order_ref` arrives from Andre, is accepted and
is **ignored**. P3-31 assumes the column exists too and has not shipped either.
Two cards each built on a field the other was assumed to have landed.

A series with nothing to qualify is not an identifier, so the pair lands
together. `order_ref` is untouched in **meaning**, which is what the acceptance
protects: it is still the supplier document reference as the document prints it.
`client_ref` is not touched and stays with P3-31.

Two columns and not one concatenated string: `TG 0009312` written into one
column is two facts glued at write time and nothing can pull them apart
afterwards.

**Defaults applied and logged, per CLAUDE.md section 5:** the series is nullable
and its absence is not an error; a callback omitting it is still accepted; our
validator accepts the field before Andre emits it; `client_ref` is unchanged.

---

## Evidence

Commands run in this worktree, all exit 0:

    npx tsc --noEmit
    node docs/board/validate-board.mjs docs/board/rc-board-phase3.json
    npm run check:conflict-residue
    npm run check:unique-ids
    npm run check:card-order
    npm run check:board-edit
    npm run check:board-clock
    npm run check:pending-schema-reads
    npm run check:no-destructive-migration

`check:no-destructive-migration` on the branch, verbatim, because it is the
control that stands in front of a production apply:

    check-no-destructive-migration: 1 file(s), added or modified against origin/main (4171144)
    check-no-destructive-migration: OK. 1 file(s) parsed, 12 statement(s), no DROP TABLE, no TRUNCATE, no DELETE, and every statement kind classified.

**`npm run check:migrations` and the end to end suite could not be run here, and
that is a property of this machine and not a gap in the card.** `docker` is not
on this worktree's PATH at all, so the throwaway postgres container and the local
Supabase stack are both unreachable. Both run in `quality` on the head sha, and
that run is the after-result the acceptance names.

---

## Cards touched

| card | before | after |
|---|---|---|
| `EXT-11` | `todo` | `shipped` on the green, PR #240 |

**Pull requests:** #240 (the card, five commits added by this run), **#259** (this
report). #240 was already open from earlier runs; this run made it mergeable,
restored what the before-result had removed, added the missing APPLY-LOG row and
wrote the board edit.

One card, not two. The second card was not started: with a `quality` cycle
measured at 19 to 23 minutes on this repository and a 45 minute cap, there was
no room to finish and merge another one.

---

## Escalations

**None.** Nothing on this run hit the R-057 escalation list, nothing needed a
decision outside the card's defaults, and no card was blocked on a person.

---

## What the next run should pick up first

1. **Check PR #240 first.** If it merged, `EXT-11` is done and the next eligible
   card is `GATE-01`. If it did not merge, the branch is up to date with main,
   mergeable, and carries everything; it needs a green `quality` and a merge and
   nothing else.
2. **`docs/poc/claims/` still holds no claims and `docs/poc/state.json` still
   holds two expired ones**, `EXT-10` and `EXT-11`, both from 2026-09-07 and both
   long past the six hour lease. They are inert but they are also the legacy
   store CLAIM-01 replaced, and clearing them is a one-line change somebody could
   fold into any card that touches that file.
3. **The lesson this card paid four runs for is worth reading before trusting any
   cited red**, and it is now in `docs/LEARNINGS.md`: a run concluding `failure`
   proves only that *something* failed. Before naming a run as a before-result,
   read its step list and confirm the step that was supposed to fail has
   conclusion `failure` and not `skipped`.
