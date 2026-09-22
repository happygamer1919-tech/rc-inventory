# EXECUTOR report: P3-92, the lead date pair (goal G48, sweep findings F3, F4, F16)

**Role:** AUTHOR, then EXECUTOR, in one pull request.
**Card:** P3-92, allocated with `npm run id:free -- P3-92` (answered FREE, lane highest P3-91,
zero open pull requests).
**Branch:** `card/p3-92`, cut from `origin/main` at `f90ea86`.
**Worktree:** `/Users/sm33xy/Projects/rc-inventory-worktrees/g48-lead-date-pair`.
**Date:** 2026-09-22.

## For the owner, in plain words

Two things were wrong with the dates on a lead, and both are fixed here.

First: when you moved a lead out of "De reluat", only one of its two dates was cleared. The
other one stayed behind, so the lead came straight back onto the Azi list, marked late and drawn
in red, with nothing written next to it. That was the opposite of what you asked for on
2026-09-22. Now both dates end together when the lead leaves De reluat, and a next step you set
yourself on a different day is left alone.

Second: when a date box was showing the red line "Data nu este validă", the Salvează button still
worked, and saving wiped the date that was already stored. Correcting a date and mistyping one
digit lost the date entirely, with no message. Now the save button is switched off while any date
box is red, in every form in the system that has a date box, and the stored date is untouched.

Nothing in the live database is rewritten by this change. Leads that already carry a stale date
keep it until the next time their stage moves, which is deliberate: a migration that quietly
rewrote the data of several hundred real leads is exactly what this project's rules forbid.

## What the card covers

One pull request, three findings of `docs/reports/2026-09-22-critic-bug-sweep.md`, grouped because
they touch the same files and the same "one box, one truth" doctrine, exactly as the owner's own
goal line groups them.

- **F3** (report lines 124 to 173): leaving De reluat clears `follow_up_date` and leaves
  `next_action_at` behind, so the lead returns on `/azi` overdue and in red.
- **F4** (175 to 205): a date field showing `Data nu este validă` does not block Salvează, and the
  save erases the stored date.
- **F16** (470 to 479): the P3-88 specs never read `next_action_at`, which is why F3 shipped.

## F3: which option was taken, and why

The report named three options and explicitly refused to choose between them. **The
database-side option was taken**: `next_action_at` is cleared inside `set_client_stage` itself,
in the same row update that already clears `follow_up_date`, and only while `next_action_at`
still equals the OLD `follow_up_date`, that is, while it is still the mirror the "setting one
sets both" rule of 0058 wrote at De reluat.

**Why that one and not the other two.**

- `set_client_stage` is the single writer of `clients.stage`, which is the reason 0039 created it
  and the reason 0057 put the follow-up clearing there rather than in the application. A rule
  that lives there is obeyed by every caller by construction: the two forms, a spec that posts to
  the RPC (this card's own F3 case does exactly that), and any bulk-action screen written later.
- **Clearing from `ClientForm` alone** fixes the operator path and leaves the stored row wrong for
  every other caller. It also cannot be tested from outside the browser.
- **Gating `/azi`'s overdue computation the way the two list functions gate theirs** fixes one
  screen and leaves the row carrying a date that reads, on the Leaduri list, as a next step
  nobody ever wrote (the report's own observation at its line 152). It treats the symptom on the
  read side while the write side keeps producing it.

**The guard, and its stated cost.** `next_action_at` is the general next-step date and is valid at
any stage (0058's own header). A blind clear on every departure from De reluat would erase a next
step somebody deliberately set at another stage, so the clear fires only when
`next_action_at` still equals the follow-up date being left. The cost, written into the migration
header rather than hidden: a next step deliberately set to the same day as the De reluat date is
indistinguishable from the mirror and is cleared with it. No row is destroyed, the operator
retypes one date, and the alternative was a fifth parameter, that is a third overload of this
name, with the PGRST203 care 0040 took for `p_first` and a two-minute window in which the
application calls a signature that does not exist (CLAUDE.md 8.0).

**The next-step TEXT is never cleared.** Only the mirrored date was ever written by the mirror.
`clients.next_action` is a sentence the operator typed and it survives the move. The assertion
file proves it.

**One application-side change went with it, and it is not an alternative to the above.** With the
database fix alone, `ClientForm` at a stage other than De reluat shows "Data următorului pas"
prefilled with the mirror the save is about to delete: a value on screen that the operator cannot
keep. That is the same silent-value class F4 is about, created by this card's own fix, so it is
fixed here rather than filed. Once the chosen stage leaves De reluat, the next-step box empties
in the same moment, and the form then sends the cleared value explicitly. The stored truth is
still decided in `set_client_stage`; the form only stops showing something different from what it
will save.

**The migration.** `supabase/migrations/0060_lead_next_action_cleared_with_follow_up.sql`.
`create or replace function` on `set_client_stage(uuid, client_stage, date, boolean)`, same
signature, same return type, same grant, so no new overload and no PostgREST churn. Confirmed
before writing it that no new output column was needed: only an extra read inside the body. The
three-parameter form is not touched and still delegates, so it clears in the same case; only its
comment is brought up to date, exactly as 0057 did. **No ALTER, no new column, no UPDATE, no
DELETE, no DROP, no TRUNCATE.** Next free number checked against `origin/main`
(`git ls-tree --name-only origin/main supabase/migrations/` ended at 0059) and re-checked before
the final commit. `Refuse a migration that removes rows` passes locally on it (1 file, 8
statements, every kind classified).

Assertion file added beside it:
`scripts/poc-free/local-db/assertions/0060_lead_next_action_cleared_with_follow_up.sql`. It
asserts the shape (still two forms, still no default on `p_first`, `next_action_at` still a plain
date column), the mirror cleared, an independently set step surviving, a move between two stages
that are not De reluat touching nothing, a date passed in the same call clearing nothing, the
same stage not being a departure, a lead with no next step leaving cleanly, and `p_first` never
reaching the clearing arm. 0057's own assertion file is untouched and runs again after 0060,
which is what proves the follow-up rules still hold.

## F4: which callers were covered

`DateField` gains an optional `onValidityChange(invalid: boolean)` and an exported
`useInvalidDates()` hook. The callback is held in a ref so the effect depends on `invalid` alone,
because every caller writes the callback inline in JSX and an effect depending on it would fire
on every keystroke. The effect's cleanup reports `false`, which matters: `ClientForm` unmounts its
follow-up date box when the stage leaves De reluat, and a field that disappeared while red would
otherwise have left Salvează disabled forever.

**All six callers, none skipped:**

| File | Date fields | Submit button, before -> after |
|---|---|---|
| `components/clients/ClientForm.tsx` | 2 | `pending` -> `pending \|\| dateInvalid` |
| `components/clients/ClientNoteForm.tsx` | 1 | `pending` -> `pending \|\| dateInvalid` |
| `components/clients/LeaduriForm.tsx` | 1 | `pending` -> `pending \|\| dateInvalid` |
| `components/projects/ProjectForm.tsx` | 2 | `pending \|\| noClients` -> `pending \|\| noClients \|\| dateInvalid` |
| `components/orders/InboundOrderForm.tsx` | 2 | `pending` -> `pending \|\| dateInvalid` |
| `components/orders/ExtractionReviewPanel.tsx` (`ReviewForm`) | 2 | `pending` -> `pending \|\| dateInvalid` |

Every existing condition was EXTENDED, never replaced; `ProjectForm`'s `noClients` is the case
that proves it and the F4b test case is written on that form for exactly that reason. Each
handler also returns early on `dateInvalid`, as a second net under the disabled button, because
Enter in a text input submits a form.

**No migration and no server change.** An invalid date still never reaches a server action,
exactly as before; it simply cannot be submitted now. No Romanian message, no refusal and no
field name changed. `InboundOrderForm` keeps its `problems` list untouched: the red line the date
field draws itself is the message, so a second one would say the same thing twice.

`ExtractionReviewPanel.tsx` lives under `components/orders/`, not under any of the paths reserved
for Ivan's ORANGE terminal (`app/api/extraction/**`, `app/api/documents/**`,
`lib/data/extraction*`, `docs/contracts/extraction*`). None of those was opened or edited.

## F16: the coverage gap

`tests/e2e/lead-follow-up-date-cleared.spec.ts`: the `stored()` helper now selects
`stage,follow_up_date,next_action_at` and every one of the five existing cases asserts all three.
Nothing was removed and no assertion was loosened; only what is READ was widened, and every
existing case's expectation on `stage` and `follow_up_date` is character for character what it
was. The leads in those cases are created through REST, so `next_action_at` is null throughout,
which is itself the fact the file could not see before.

## Tests added

In `tests/e2e/lead-follow-up-date-cleared.spec.ts`:

- **G48 F3, the operator path.** A lead created at De reluat **through the Lead nou form**, so the
  mirror is actually written (a REST-created lead never has it, which is F16's whole point), with
  a date four days in the past. The premise is asserted first: both columns hold that date and
  the lead is on `/azi` carrying "Întârziat". Then Modifică moves it to În cultivare with no date
  typed. Both columns read back null and the row is gone from `/azi`.
- **G48 F3, the independence guard.** A lead at În cultivare with `next_action_at` set on its own
  day, moved to Ofertat: the next step is unchanged.
- **G48 F3, the backstop.** The same departure driven through the RPC directly rather than through
  a form: the mirror is cleared, and a step set on another day is kept. This is the case only the
  database-side fix can pass.

In the new `tests/e2e/date-invalid-blocks-save.spec.ts`:

- **G48 F4a, Modifică on a lead.** The box starts on the stored date and Salvează is enabled;
  `31.02.2027` is typed; the red `Data nu este validă...` line is visible, Salvează is disabled,
  Enter does not submit, and the stored date is unchanged. Then the date is corrected, Salvează
  comes back, the save goes through and the new date is stored: the block is a door a real date
  opens, not a lock.
- **G48 F4b, Modifică on a project, "Termen estimat".** Chosen as the second caller because its
  submit button already carried a second condition (`noClients`), so if that condition had been
  replaced instead of extended, this case fails. Same three assertions plus the stored term read
  back off the project sheet after a reload.

Every test datum carries the `TEST` prefix and a per-run suffix, and nothing is deleted.

## Specs whose behaviour this change could touch

`git grep -l "set_client_stage\|DateField\|next_action_at" -- tests/e2e` names nine besides this
card's own two: `azi-screen.spec.ts`, `client-notes.spec.ts`, `clients.spec.ts`,
`crm-landing.spec.ts`, `lead-next-action.spec.ts`, `leaduri.spec.ts`, `phone-lists.spec.ts`,
`reactivate-lead.spec.ts`, `romanian-file-date.spec.ts`. Four more drive a date field or a submit
button this card touched without naming any of those three strings, so they are read the same way:
`projects.spec.ts`, `project-budget.spec.ts`, `inbound.spec.ts` and `phone-forms.spec.ts`.

**No assertion in any of them was changed.** The reasoning, by group:

- Specs that type a VALID date and save are unaffected: the button is disabled only while the red
  line shows, and a valid date never shows it.
- Specs that move a stage on a lead with no `next_action_at`, or with one that never equalled the
  follow-up date, see no change: the clearing arm needs the two dates to be equal.
- `lead-next-action.spec.ts` covers the "setting one sets both" rule AT De reluat and the explicit
  clearing of both fields. Neither is a departure from De reluat, so neither arm changed.
- `azi-screen.spec.ts` reads `/azi`; the read side (`overdue` in both list functions and
  `getAziList`) is untouched by this card.

They are asserted rather than assumed by the `quality` run: the whole end to end suite runs there,
and the result is recorded in the pull request. **This machine has no Docker and no Supabase CLI**,
so the end to end suite, `npm run check:migrations` (which applies every migration to a bare
postgres and runs every assertion file, 0060's included) and both applier proof steps run only in
CI.

## Commands run locally, each exit 0

```
npx tsc --noEmit
npm run build
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
npm run check:card-ids
npm run check:board-edit
npm run check:unique-ids
npm run check:open-branch-ids
npm run check:no-destructive-migration
npm run check:conflict-residue
npm run check:categories
npm run check:ledger-rows
npm run check:no-prod-target
npm run check:pending-schema-reads
npm run check:removal-safety
npm run check:assertion-register
npm run check:board-clock
```

`npm run check:board-edit` refused once, on purpose and exactly as designed, while the card was
still `in_flight`; it passes once the card is flipped to `shipped` in this same pull request.

**Left to CI, named rather than skipped silently:** the end to end suite
(`tests/e2e/**`, Playwright), `Apply every migration to a bare postgres, unmodified`,
`Refuse a migration that removes rows` on the pull request's own diff,
`Prove the migration applier against the Docker shim` and `Prove every applier assertion can
fail`. The last two are gated on a diff touching `supabase/migrations/**` or
`scripts/poc-free/local-db/**`; this diff touches both, so both RUN rather than skip.

## What was deliberately not changed

- `clients.next_action`, the next-step text.
- Every other arm of `set_client_stage`: the same-stage no-op, `p_first`, a date passed at any
  stage, the `follow_up` requires-a-date constraint.
- The `overdue` expression in `search_clients_by_stage` and `search_clients_next_action`.
- Every server action's Romanian messages and field names for valid input.
- `PageHeader`'s `lead` prop (`components/ui/primitives.tsx`), the grep trap: nothing was renamed
  or swept on the word lead.
- The known defects in handoff Part 6 and the board hygiene in Part 7.
- No row is UPDATEd or DELETEd by any migration in this card.

## Production safety

No production database was opened, and no credential was read or needed; this machine has none.
The card touches the `clients` table where real leads live, and the migration changes one function
body and no row. Nothing in the work suggested that a real client record was at risk, so no
`OWNER + IVAN:` question was raised. **The pull request is NOT self-merged**: real client data has
been in production since 2026-09-14, and this pull request adds a migration, so it is held for the
owner's approval per the close-out block.

## Learnings

Two entries appended to `docs/LEARNINGS.md`: "A mirrored column is unmirrored by the same single
writer that owns the original" and "A field that reports invalid and cleared as the same value
must tell its parent which one it is". Nothing broke during the work: type check and build passed
on the first run, and the only local refusal was `check:board-edit` behaving correctly on an
`in_flight` card.
