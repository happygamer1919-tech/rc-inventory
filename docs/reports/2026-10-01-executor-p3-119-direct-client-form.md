# EXECUTOR report, card P3-119: the "Tip ieșire" choice and the direct client form

**Date:** 2026-10-01
**Card:** P3-119, goal G73, Item 2 of Ivan's four, part two.
**Ruling:** R-215 is the authority.
**Branch:** `card/p3-119`, cut from `origin/main` at `6eded66`.
**Depends on:** P3-118, merged as PR #385 with migration 0067. The schema and the write
path this card calls are live.

## THIS RUN IS A RESUME, AND THE BRIEF'S PREMISE WAS WRONG IN ONE IMPORTANT WAY

The task file for this run said the previous attempt "timed out with nothing committed",
that no branch existed on origin, and that this run should "treat the card as untouched
work" with "nothing from the earlier attempt inherited". **The first half was right and the
second half was not, and the difference is most of the card.**

What was actually true when this run opened the worktree on 2026-10-01:

- the previous run (task `100-g73-p3-119-direct-client-form.md`, now in `queue/failed/`)
  did log exactly one line, "Request timed out";
- **no branch `origin/card/p3-119` existed**, so the brief was right that nothing had been
  pushed;
- but `git branch --show-current` printed `card/p3-119` and **the branch carried three local
  commits** ahead of `origin/main`, holding the whole implementation and the whole test file,
  plus 99 uncommitted lines of `docs/LEARNINGS.md`.

So the previous run did not die early. It died late, after the work was committed locally and
while the learnings were being written, and before anything was pushed. **Nothing was
discarded and nothing was rebuilt.** This run verified the inherited commits against the card
clause by clause, committed the finished learnings, pushed the branch immediately, ran the
full local gate set, wrote this report and flipped the card.

The three inherited commits, kept as they were:

```
f0ccc99  P3-119: cardul trece pe in_flight, lucrul incepe
dbffa0d  P3-119: alegerea Tip iesire, formularul clientului direct, si calea proiectului mutata neschimbata
118592f  P3-119: cele sase cazuri numite ale acceptantei, si un caz al lui P3-118 intarit
```

and the one this run added:

```
1534e70  P3-119: cinci perechi ERROR/SOLUTION din cardul clientului direct
```

**THE BRANCH WAS PUSHED AS SOON AS THE FIRST COMMIT EXISTED IN THIS RUN**, which was
immediately after `1534e70`, and before any gate was run. The brief asked for that in those
words, because a dead run that leaves commits on origin is a resume and a dead run that
leaves none is the same task a third time. The lesson is recorded below and belongs to the
harness, not to the card.

## THE CLAUSE THAT COULD FAIL THIS CARD ON ITS OWN: THE PROJECT PATH IS UNCHANGED

Clause 1 says "Proiect" is the default and is "COMPLETELY UNCHANGED in every respect: same
fields, same validation, same behaviour, same stock effect", and the card adds that a card
which alters the project path "has broken the one thing R-215 promises it will not touch".

**How that was achieved: a MOVE plus a sibling, not a careful edit.** The card's own
`defaults` instruct exactly this ("keep the project path byte-for-byte and add beside it"),
and the previous run followed it:

- the previous body of `components/outbound/OutboundScreen.tsx` was moved whole into
  **`components/outbound/OutboundProjectForm.tsx`**;
- **`components/outbound/OutboundDirectClientForm.tsx`** was written beside it, new;
- `OutboundScreen.tsx` became a shell that holds the chosen mode and nothing else.

**HOW IT WAS PROVED, AND THE PROOF IS SHORT ENOUGH TO READ IN FULL.** Diffing
`origin/main`'s `OutboundScreen.tsx` against the moved `OutboundProjectForm.tsx` produces
**70 lines in total**, and every one of them is in one of five groups:

1. comments, including the header block that says the file is the former body moved unchanged;
2. the function name, `OutboundScreen` to `OutboundProjectForm`;
3. two added props, `mode` and `onModeChange`, plus their two type lines;
4. one added import (`OutboundModeChoice`) and one added line of JSX that renders the choice
   above the form;
5. the empty-catalog branch, which **moved up to the shell** because it refuses both modes
   for the same reason, and which was verified to arrive there **word for word with the same
   `data-testid="outbound-no-products"`**.

No state, no `problems` entry, no validation line and no `submit` line of the project path was
touched. That is why the claim is a diff a reviewer can check rather than a promise about the
author's care.

**AND THE EXISTING PROJECT-ISSUE TEST WAS NOT EDITED.** `git diff --name-only
origin/main...HEAD` does not list `tests/e2e/outbound.spec.ts`, the existing project-issue
spec, so CI re-runs it unmodified on this head. Acceptance (d) also names a case
`iesire pe proiect: nimic nu s-a schimbat`, which exists in
`tests/e2e/outbound-direct-client.spec.ts` and asserts the project path on screen; both
readings of (d) are therefore satisfied, the untouched existing spec and the named case.

## THE ONE TEST OF ANOTHER CARD THAT CHANGED, AND WHY IT IS A STRENGTHENING

`tests/e2e/outbound-direct-client.spec.ts` is P3-118's file. One assertion in it changed, and
this is stated plainly because "a later card edited an earlier card's test" is the shape of a
forbidden move:

- it read `await expect(page.getByTestId("issue-create-invoice")).toBeDisabled();`
- it now reads `await expect(page.getByTestId("issue-create-invoice")).toHaveCount(0);`

**Clause 7 of this card requires it:** no invoice button appears on a direct client issue,
"a visible absence and not a broken button". **"Does not exist" implies "cannot be pressed",
so the new assertion is strictly stronger than the one it replaces**, and the Romanian reason
sentence beside it is still asserted. The comment at the line names the clause and shows the
implication. No other assertion in the file was removed, weakened or skipped. The two import
lines that also show as deleted were moved, not dropped.

## WHAT THE CARD ASKED FOR, CLAUSE BY CLAUSE

1. **The choice comes first.** `OutboundModeChoice.tsx`, a field labelled "Tip ieșire" with
   exactly two options, "Proiect" and "Client direct". "Proiect" is the default.
2. **Client direct requires a CRM client, existing or created inline.** A searchable picker
   over the CRM clients, plus inline creation on the same screen. **The inline creation calls
   `createClientRecord` from `lib/data/client-actions.ts`, the existing client create path,
   and adds no endpoint of its own**, which the card's `defaults` demand because a second
   creation path is a second set of validation rules that will drift. A client created inline
   is an ordinary CRM client row afterwards; the named case of acceptance (c) creates one,
   completes the issue, then opens Clienți and finds it as a normal row. A typed name is not
   accepted.
3. **The pickup date is required in this mode**, Romanian label, in the single
   day.month.year box: it imports `DateField` from `components/ui/DateField`, the control
   P3-49 and card F4 made standard. **There is no second date widget**: a grep of the form for
   `type="date"`, `DateInput`, `DateBox` and `datepicker` finds nothing but that one import
   and its single use.
4. **The lines** carry product, quantity and unit, plus an optional unit price shown as
   optional and left blank without complaint. **The unit comes from the product and is read
   through `unitLabel`, so all nine of `ALL_UNITS` appear, and the component writes no unit
   list of its own** (deviation D3): a grep of the three changed components for every unit
   token returns nothing.
5. **Every string on screen is Romanian with proper diacritics.** No `check:romanian-ui`
   script exists in this repository, and acceptance (f) allows for that ("whichever name it
   carries at the time"); the property is proved instead by the named case
   `iesire client direct: niciun cuvant englez pe ecran si nicio liniuta lunga in fisierele
   schimbate`, which reads the rendered DOM rather than the source, because this card's
   comments quote the card in English on purpose. It also gathers placeholders, which are
   attributes and are not in `innerText`, and it accounts for the `uppercase` class turning
   "Cantitate" into "CANTITATE".
6. **The form cannot submit a half-filled mode.** Client direct with no client, or with no
   pickup date, is refused on the screen before the request is sent, with a Romanian message
   naming what is missing. **The sentences are not copied:** they were lifted into an exported
   `ISSUE_REFUSAL` object in `lib/data/outbound-mode.ts`, which carries no `"use server"`
   marking and so can be imported by the browser component, so the screen shows the same
   string the server action returns. P3-118's two check constraints still refuse it in the
   database, and both refusals existing is the design.
7. **No invoice button appears on a direct client issue.** `IssueInvoiceability` gained a
   `neverInvoiceable` flag, set true in exactly one branch, and `OutboundPanel.tsx` renders no
   button for that branch only. **P3-110's opposite-looking rule is intact**: a button that is
   merely temporarily unusable still appears, disabled, with its sentence. The two rules split
   on whether the refusal can ever be undone. The Romanian reason sentence is kept in both
   cases, because an absence with no explanation is a question with no answer; it moved to
   `lib/data/facturare-create-types.ts` as `DIRECT_CLIENT_NOT_INVOICEABLE` so a browser
   component can read it.
8. **Desktop first.** No phone layout work was added and **no new local phone class was
   written**: `grep -rn "^const PHONE_" components/ app/` returns only the two pre-existing
   lines in `components/projects/DevizPanel.tsx`, in a file this card does not touch.

## WHAT WAS NOT DONE, DELIBERATELY

- **No schema change.** `git diff --name-only origin/main...HEAD -- supabase/migrations/`
  returns **zero files**. P3-118 owns the schema and brought the mode column, the pickup date
  and the two constraints. **This pull request therefore changes nothing in the live
  database**, and the owner-approval rule for migration pull requests does not apply to it.
- **No second write path and no second stock arithmetic.** The batch subtraction stays the one
  shared routine P3-118 extracted, `public.outbound_issue_take_stock`. This card fills the
  form that calls the existing door.
- **NO LIST WORK. Showing the mode in lists and filtering by it is card P3-120**, its own card
  and its own pull request. Nothing here touches a list.
- **Nothing off limits was opened.** No path under `app/api/extraction/**`,
  `app/api/documents/**`, `lib/data/extraction*` or `docs/contracts/extraction*` appears in
  the diff, so no `IVAN:` question was needed.
- **The `lead=` trap was respected.** `lead=` survives untouched as the PageHeader prop in the
  moved empty-catalog block; nothing was renamed or swept on the word.

## FILES CHANGED

```
app/(app)/iesiri/page.tsx                          clients passed to the screen
components/orders/OutboundPanel.tsx                no invoice button on the never-invoiceable branch
components/outbound/OutboundDirectClientForm.tsx   NEW, the second mode's form
components/outbound/OutboundModeChoice.tsx         NEW, the "Tip ieșire" field
components/outbound/OutboundProjectForm.tsx        NEW, the former OutboundScreen body, moved unchanged
components/outbound/OutboundScreen.tsx             now a shell holding the chosen mode
docs/board/rc-board-phase3.json                    P3-119 to shipped with evidence
lib/data/facturare-create-types.ts                 NEW, the Romanian reason sentence, importable by the browser
lib/data/facturare-create.ts                       the neverInvoiceable flag
lib/data/outbound-mode.ts                          ISSUE_REFUSAL exported for the screen
lib/data/outbound-types.ts                         the mode types the form needs
tests/e2e/outbound-direct-client.spec.ts           the six named cases, and one P3-118 assertion strengthened
docs/LEARNINGS.md                                  five ERROR/SOLUTION pairs
docs/reports/2026-10-01-executor-p3-119-direct-client-form.md   this report
```

## GATES, EACH COMMAND RUN ALONE SO ITS EXIT CODE IS ITS OWN

All exit 0 on this head:

```
node docs/board/validate-board.mjs (all three boards)   PASS, 0 violations each
npx tsc --noEmit                                        clean
npm run build                                           clean
npm run check:card-ids                                   OK
npm run check:board-edit                                 OK once the card was flipped
npm run check:unique-ids                                 OK, 297 card ids, 215 ruling ids
npm run check:open-branch-ids                            OK
npm run check:no-destructive-migration                   OK, 0 files parsed
npm run check:conflict-residue                           OK, 3 checks
npm run check:categories                                 OK, 8 checks
npm run check:ledger-rows                                PASS
npm run check:no-prod-target                             OK, 5 checks
npm run check:pending-schema-reads                       OK
npm run check:removal-safety                             OK, 24 pending migrations
npm run check:assertion-register                         OK, 18 assertions
```

`check:board-edit` refused while the card was `in_flight`, which is exactly what it is for,
and passes at this head.

**THIS MACHINE HAS NO DOCKER AND NO SUPABASE CLI**, so `check:migrations`, `prove:applier`,
`prove:assertions` and the end to end suite **cannot run here, and nothing in this report
claims otherwise.** The six named cases of acceptance (a) to (e) run against a real local
Supabase stack in CI only. Since this card adds no migration, neither applier proof is
required of it.

## NO PRODUCTION ACCESS

No live site was opened beyond the public `/api/health` endpoint after merge, no production
row was read, no credential was sourced, and environment variable NAMES only appear anywhere
in this work. **REAL CLIENT DATA HAS BEEN IN PRODUCTION SINCE 2026-09-14**, including 380 real
leads. Every fixture is built by hand in `tests/`, prefixed `TEST`, and test data is never
deleted.

The pull request is **NOT a draft**, because the owner's auto-merger cannot merge a draft and
card P3-102 sat stranded overnight for exactly that reason. This run never ran `gh pr merge`.

## WHERE THE CARD AND THE BRIEF DISAGREED

Only in the one place named at the top: the brief said nothing had been committed and that
nothing should be inherited, and three commits existed. **The card won, as the brief itself
instructed**, and the inherited work was verified against the card rather than rebuilt. No
clause of the card was found to be wrong, and the brief was right about everything else.

## DEVIATIONS

**None against the card.** One against the brief, stated above and in the pull request body:
the earlier attempt's commits were inherited rather than discarded, because they existed and
matched the card.
