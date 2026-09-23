# EXECUTOR: P3-94, a half filled manual intake position is refused by name, not dropped

**Role:** AUTHOR first, then EXECUTOR, in one pull request.
**Date:** 2026-09-23 (UTC).
**Card:** P3-94, phase 3 board.
**Branch:** `card/p3-94`, cut from `origin/main` at `4a81cc1` (P3-93, PR #352).
**Goal:** the operator factory's GOALS.md G50, the third of the sweep-fix batch worst first.
**Finding:** F8 of `docs/reports/2026-09-22-critic-bug-sweep.md`.
**Migration:** none. No file under `supabase/migrations/` is added or changed.

---

## In plain words, for the owner

Until this change, the manual order screen threw away any position where the operator had chosen a
product but not typed a quantity, and said nothing about it. An operator who entered four positions
and left one quantity blank pressed "Confirmă comanda" and got the green success screen. The order
that was saved had three positions. The only trace was the sentence "Introdusă manual, cu 3
poziții", a number nobody has a reason to check against one they never counted. The material in
that fourth position was simply not ordered, and nothing on any screen ever said so.

Now the screen refuses to save and names the position: "Poziția 3 nu are cantitate." The operator
fills in the missing field and the same order goes through. Nothing else about the screen changes:
a position that is completely filled behaves exactly as before, and an extra empty row that the
operator added and never used still does not block anything.

---

## The boot report (CLAUDE.md section 1)

Read at the start of the run, before any edit:

| board | shipped | in_flight | blocked | halted | todo | total |
|---|---|---|---|---|---|---|
| `docs/board/rc-board-phase2.json` | 68 | 0 | 2 | 0 | 32 | 102 |
| `docs/board/rc-board-phase3.json` | 110 | 0 | 0 | 0 | 32 | 142 |

Launch gate on the phase 2 board: **6 of 9**. Next eligible card by the section 2 comparator:
**AUT-3**, "Add the TRIAGE role to the POC chain". This card was authored instead, on the owner's
dispatch for G50, which is the standing arrangement for the sweep-fix batch
(`mailbox/answers/q068-poc-sweep-fixes-g48-g54.md`).

Both phase boards were read, per the RULE-05 defect: repo CLAUDE.md section 1 names only the phase
2 board and the eligible work sits on phase 3.

---

## The bug, read from the code

`components/orders/InboundOrderForm.tsx`, before this change, line 146 onward:

```ts
const filledLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
const problems: string[] = [];
if (!supplierName.trim()) problems.push("Completează furnizorul.");
if (!expectedAt) problems.push("Completează data estimată de livrare.");
if (filledLines.length === 0) problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");
```

`filledLines` is the only thing ever sent to `createInboundOrder` (line 168) and the only thing
counted in the success line (line 185). The only complaint about positions fires when
`filledLines.length === 0`, which is to say **only when EVERY row fails**. Three filled rows and one
half filled row gives `filledLines.length === 3`, `problems` stays empty, `confirm()` proceeds, and
the fourth row is gone. There was no message, no highlight and no count for the operator to compare
against.

The mirror case travels in the same expression: `l.productId` falsy with a quantity typed is
dropped by the same filter, for the same reason, with the same silence.

**Both screens the goal names render this one component**, confirmed with
`git grep -n "InboundOrderForm" components app`:

```
components/orders/ManualOrderScreen.tsx:88:      <InboundOrderForm        mode="manual"
components/orders/UploadOrderScreen.tsx:104:      <InboundOrderForm       mode="manual"
```

`ManualOrderScreen` is `/adauga-manual`; `UploadOrderScreen` carries the typed-order path at the
bottom of `/incarca-comanda`. Both pass `mode="manual"`. Fixing the one file fixes both screens.
The extraction review sheet is a different component (`ExtractionReviewPanel`, test ids
`review-line-*`) and is not touched by this card.

---

## The fix

One file, one place: `components/orders/InboundOrderForm.tsx`.

```ts
const filledLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);

const halfFilledProblems = lines
  .map((l, index) => {
    const hasProduct = Boolean(l.productId);
    const hasQuantity = Number(l.quantity) > 0;
    if (hasProduct === hasQuantity) return null;
    return hasProduct
      ? `Poziția ${index + 1} nu are cantitate.`
      : `Poziția ${index + 1} nu are produs ales.`;
  })
  .filter((m): m is string => m !== null);

const problems: string[] = [];
if (!supplierName.trim()) problems.push("Completează furnizorul.");
if (!expectedAt) problems.push("Completează data estimată de livrare.");
if (halfFilledProblems.length > 0) {
  problems.push(...halfFilledProblems);
} else if (filledLines.length === 0) {
  problems.push("Adaugă cel puțin o poziție cu produs și cantitate.");
}
```

Seven decisions are worth naming.

1. **Half filled means EXACTLY ONE of the two present.** `hasProduct === hasQuantity` is the whole
   test: both present is a good row, neither present is an untouched row, and the two remaining
   cases are the defect, one per direction.
2. **"Quantity present" means a positive number**, which is exactly the test `filledLines` already
   applies. A quantity of `0`, a blank and unparseable text are all absent. That is what keeps the
   guard and the send filter from disagreeing: every row the filter drops and no other is either
   named here or is empty.
3. **The position number is the on-screen one.** `lines.map((l, index) => ...)` is the same map the
   table's own `<tbody>` is drawn with (line 294 before this change), so "Poziția 3" is the third
   row counted from the top, after any removals. One indexed, because the operator counts from one.
4. **No visible row-number column was added.** The table renders as a stack of cards under 768px
   (P3-65, `PHONE_TABLE`/`PHONE_ROW`), and a sixth column would disturb that layout and the phone
   screenshots that assert it, for a message that is already locatable by counting three rows. If a
   later card finds operators cannot locate the row, the column is that card's work.
5. **The generic message stays and becomes unreachable when a row can be named.** `Adaugă cel puțin
   o poziție cu produs și cantitate.` still fires when nothing is filled and nothing is half filled,
   which is the case the existing spec asserts. It is not added beside a named position, because
   "Poziția 3 nu are cantitate." says everything it says and more.
6. **No per-field highlight was invented.** This form has no per-field error highlight anywhere: an
   empty supplier produces a line in the `order-problems` list and nothing on the input. The new
   messages match that convention exactly. Inventing a highlight for this one case would have been
   a new mechanism that nothing else on the screen uses.
7. **No new submit guard.** `confirm()` already returns on `problems.length > 0` (line 160), so the
   refusal reaches the button for free. `createInboundOrder` is not touched: its contract and every
   message it can return are unchanged. This is a client-side pre-submit guard of the same category
   as P3-92's date guard.

---

## Scope was widened by one case, deliberately

The goal's words are "a position with a product but no quantity". The same filter also silently
drops **a quantity typed with no product chosen**. That is the identical defect with the two fields
swapped, in the same expression, in the same line of the same file, with the same consequence: a
position the operator entered does not reach the order and nothing says so.

Both directions are fixed in this pass. The report names one direction because that is the one the
CRITIC reproduced, not because the other is acceptable. Leaving the mirror image live in the exact
line being edited would have been a half measure, and this repository's doctrine puts silent value
loss in its most serious category. The card's `defaults` (a) records the widening; the acceptance
line names its test case.

This is the only widening. Nothing else in the file, on either screen, or in `createInboundOrder`
was changed.

---

## The tests

`tests/e2e/inbound.spec.ts` gains one describe, `G50: o poziție umplută pe jumătate`, with four
cases. `npx playwright test tests/e2e/inbound.spec.ts --list` collects **12** cases in the file, the
seven that were there plus these four plus the P3-41 date case:

| case | what it drives | what it asserts |
|---|---|---|
| `G50: o poziție cu produs și fără cantitate este refuzată pe nume` | two complete positions, a third with a product and no quantity | `order-problems` contains `Poziția 3 nu are cantitate.`, holds **exactly one** `<li>`, does NOT contain the generic message, and `order-created` never appears. Then the missing quantity is filled and the same order saves, `cu 3 poziții`. |
| `G50: o cantitate fără produs ales este refuzată pe nume` | the mirror: a quantity typed on the third row, no product chosen | `Poziția 3 nu are produs ales.`, exactly one `<li>`, no generic message, no success screen |
| `G50: un rând complet gol nu oprește salvarea` | three complete positions plus a fourth row added and never touched | the order saves, the success line reads `cu 3 poziții`, and the order panel at `/comenzi` shows `inbound-line` exactly 3 times |
| `G50: fără nicio poziție, mesajul general rămâne` | three rows, all untouched | the generic `Adaugă cel puțin o poziție cu produs și cantitate.` fires, exactly one `<li>`, and NO position is named |

The "exactly one `<li>`" assertion in each refusal case is what proves the generic message is not
added beside a named position, and that no unrelated problem was introduced: the supplier and the
delivery date are filled in every one of them.

**Testing one screen, not both, and why.** The four cases drive `/adauga-manual`. The typed-order
path at the bottom of `/incarca-comanda` renders the same `InboundOrderForm` with the same
`mode="manual"` prop and no wrapper that touches positions, proven by the grep quoted above, so a
second copy of all four cases would assert the same component through a second route and catch
nothing the first does not. The existing suite already drives the `/incarca-comanda` form on its own
account (`tests/e2e/extraction.spec.ts:56-59`,
`tests/e2e/extraction-webhook-missing.spec.ts:273-277`), and both of those still pass unchanged, so
the route itself stays covered. The reason is written into the spec's own header, not only here.

### Every existing spec this change could affect

Found with `git grep -n "line-quantity\|line-product\|order-add-line\|order-confirm\|order-problems" tests/e2e`.
A row that is fully filled or completely empty at the moment of submit is unaffected by this change,
so the question for each is only: does any case submit with a HALF filled row?

| spec | what it submits | verdict |
|---|---|---|
| `tests/e2e/inbound.spec.ts` | `createOrder` fills product, quantity and price on row 0; the "fără poziții" case submits one untouched row | unchanged, both shapes unaffected. Its seven existing cases are unchanged character for character. |
| `tests/e2e/phone-forms.spec.ts:373-405` case (g) | fills row 0 completely, presses `order-add-line`, confirms with row 1 **never touched** | **this is the load-bearing one.** A completely empty row is deliberately not a half filled position, so it still saves. This case is the regression guard the fix was shaped around. |
| `tests/e2e/dashboard.spec.ts:100-105` | one complete row | unchanged |
| `tests/e2e/extraction.spec.ts:56-59` | one complete row, on the `/incarca-comanda` form | unchanged |
| `tests/e2e/extraction-webhook-missing.spec.ts:273-277` | one complete row | unchanged |
| `tests/e2e/reminders.spec.ts:71-74` | one complete row | unchanged |
| `tests/e2e/romanian-file-date.spec.ts:135-137` | one complete row | unchanged |
| `tests/e2e/outbound.spec.ts:56-59` | a DIFFERENT component, `OutboundScreen`, which has its own `filled` filter at line 129 | not touched by this card |
| `tests/e2e/review.spec.ts` | `review-line-*`, the extraction review sheet, a different component | not touched by this card |
| `tests/e2e/copy-fixes.spec.ts` | matched on `adauga-manual` only | unchanged |

**No existing assertion was updated, weakened, deleted or skipped.** No existing case was edited at
all. If that changes in a CI repair it will be named and justified here before anything merges.

`components/outbound/OutboundScreen.tsx:129` carries the identical shape for the issue screen and is
very likely the same defect on the way out of stock. It is **not** fixed here: that is a different
screen, a different card, and repo CLAUDE.md section 3 forbids self-invented scope. It is recorded
in this report so the next sweep finds it.

---

## Commands run, and their results

Run from the worktree `/Users/sm33xy/Projects/rc-inventory-worktrees/g50-intake-half-filled-position`,
each alone with its output to a file and `$?` read next, per CLAUDE.md section 6.

| command | result |
|---|---|
| `npm run id:free -- P3-94` | exit 0, "P3-94 is FREE", lane highest P3-93, 0 open pull requests |
| `node docs/board/validate-board.mjs` on all three boards | exit 0, 0 violations on each |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npx playwright test tests/e2e/inbound.spec.ts --list` | exit 0, 12 cases collected, the four G50 cases named |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | exit 0 once the card is `shipped`; it refused while the card was `in_flight`, which is the check working as written |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, 0 migration files parsed |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `npm run check:card-order` | exit 0 |
| `npm run check:board-clock` | exit 0 on the final board commit |
| `npm run lint` | **there is no `lint` script in this repository.** `npm run` lists 51 scripts and none is `lint`. Not skipped silently: it does not exist. |

### What is left for CI, and why

**The end to end suite.** This machine has no Docker and no Supabase CLI, so
`Start local Supabase`, `Apply migrations to the local stack`, `Seed the three test accounts` and
`End to end` cannot run here at all. The four G50 cases, and every existing case listed in the table
above, are proved by the `quality` run on the pull request's head sha and nowhere else. Locally they
are only collected, not executed.

**The two applier proofs** (`prove:applier`, `prove:assertions`) are path filtered on
`applier_scope` and will show as skipped: this pull request touches no migration, no applier and no
local-db shim. That is correct and is what repo CLAUDE.md 3.1 describes; it is not a migration pull
request, so the rule requiring those two to have RUN does not reach it.

**`docs_scope` will decide this diff is NOT documentation only**, because it changes
`components/orders/InboundOrderForm.tsx` and `tests/e2e/inbound.spec.ts`. `Build`, the migration
apply against a bare postgres and the whole End to end block therefore have to RUN and PASS before
this merges.

**No production database was touched, read or connected to from this machine, at any point.** There
are no credentials here. This card changes client-side form validation and its own tests. Nothing
was verified by opening the live site.

---

## Learnings

One entry appended to `docs/LEARNINGS.md`: *"A new per-position guard on a shared form can be
refused by a spec in a different file"*. The obvious shape of this fix, "complain about any row that
is not fully filled", would have broken `tests/e2e/phone-forms.spec.ts` case (g), which saves an
order with an untouched extra row, and would have refused a share of every order ever entered, since
the form opens with one empty row. Nothing in the file being edited would have shown it.

Nothing else broke. The one local red was `check:board-clock` refusing a card timestamp typed two
minutes ahead of the commit that carried it; that signature is already recorded in
`docs/LEARNINGS.md` four times over (around lines 4156, 4174, 4810, 5398 and 5945) and a fifth copy
would be noise, so it was fixed rather than re-recorded.

---

## What did NOT change

- Every fully filled row: included exactly as today, sent exactly as today, counted exactly as today.
- A completely empty row: never named, never blocks a save by itself.
- `lib/data/inbound-actions.ts` and `createInboundOrder`: untouched. Its own
  `Adaugă cel puțin o poziție cu produs și cantitate.` refusal at line 79 still exists and still
  means what it meant.
- `components/outbound/OutboundScreen.tsx`: untouched, and its probable twin of this defect is
  reported above rather than fixed.
- `PageHeader`'s `lead` prop (`components/ui/primitives.tsx:259-270`): not renamed, not swept.
  Neither the code edit nor the test edit contains the token `lead` at all; the only occurrences in
  this pull request are the two in this paragraph.
- `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*`,
  `docs/contracts/extraction*`: untouched. This card is the manual intake form; nothing in it
  overlapped the extraction track, so no `IVAN:` question was needed.
- The known defects in handoff Part 6 and the board hygiene in Part 7: not fixed here.
- No em dash and no en dash in any file, commit message or line of this report.

---

## Merge

**Not self-merged.** Real client data has been in production since 2026-09-14, which ends the
section 3.1 self-merge grant on every path, board-only and docs-only included. When `quality` is
green on the head sha and `npm run checks:state <pr>` exits 0, an `OWNER:` approval question goes to
the factory mailbox with the pull request number, the head sha and one plain sentence of what
changes for Rapid Construct. Max approves and POC merges.
