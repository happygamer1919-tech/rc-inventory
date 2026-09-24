# EXECUTOR: P3-100, the phone classes read from one file (goal G56, finding F14)

Role AUTHOR, then EXECUTOR, in one pull request, which is what the goal asked for.
Branch `card/p3-100`, worktree
`/Users/sm33xy/Projects/rc-inventory-worktrees/g56-phone-classes-one-source`, cut from
`origin/main` at `90e60e7`, after P3-97, P3-98 and P3-99 merged.

**What it is for, in one sentence.** The rules that say how a screen looks on a phone lived in
fifty seven copies across eleven files instead of in the one shared file that exists for them, and
several copies had quietly stopped agreeing with each other; the Proiecte list in particular had
drifted in exactly the two ways the critic report named on the Clienti list, and nobody had
reported that half.

---

## 1. Boot

Role stated: AUTHOR, then EXECUTOR. Both phase boards read, `docs/board/rc-board-phase2.json` and
`docs/board/rc-board-phase3.json` (known defect RULE-05: repo CLAUDE.md section 1 names only phase
2, and the next eligible cards sit on phase 3). Repo `CLAUDE.md` sections 1, 2, 3, 3.1, 5b, 6, 8.0,
8b, 9, 9b, 10 and 11 read in full. `KNOWN-FAILURES.md` in the operator factory read before anything
was diagnosed.

| Board | Cards | todo | in_flight | blocked | halted | shipped | Launch gate |
|---|---|---|---|---|---|---|---|
| `rc-board-phase2.json` | 102 | 32 | 0 | 2 | 0 | 68 | 6/9 |
| `rc-board-phase3.json` | 148 | 32 | 0 | 1 | 0 | 115 | 0/9 |

Next eligible card by the tuple sort in `scripts/poc/card-order.mjs`: **P3-14**, Retur de
materiale. This card is a new one, authored here from goal G56, not a pick off that queue.

Card id allocated with `npm run id:free -- P3-100`, which answered `P3-100 is FREE` and reported
**0 open pull requests** from the GitHub API, so no ORANGE branch was in flight while this ran.

---

## 2. Step 0: the grep, re-run rather than trusted

The task's own instruction, and the right one: the count in the finding was measured before P3-97,
P3-98 and P3-99 merged. Measured here on 2026-09-24 against `90e60e7`:

```
grep -rn "^const PHONE_" components/ app/     ->  57 lines, 11 files
grep -rn "^export const PHONE_" components/ui/phone.ts  ->  17 exports
```

**Eleven files, not ten**, and the difference is explained rather than treated as a discrepancy.
The P3-97 report counted "10 files, 53 copies, 8 drifted", and that count is confirmed EXACTLY: it
was counting only declarations that repeat a name the shared file exports. The eleventh file,
`components/orders/OrdersScreen.tsx`, declares nothing but `PHONE_WRAP`, which the shared file does
not export, and the four extra declarations are that `PHONE_WRAP` twice plus the `PHONE_SUM` pair.

| | count |
|---|---|
| local `const PHONE_*` declarations | 57, in 11 files |
| of those, repeating a name `components/ui/phone.ts` exports | 53, in 10 files |
| of those 53, drifted from the shared value | 8, in 5 files |
| declaring a name the shared file does not export | 4, in 3 files |

The seventeen exports of `components/ui/phone.ts`: `PHONE_SHEET`, `PHONE_CLOSE`, `PHONE_STACK`,
`PHONE_TAP`, `PHONE_CONTROL`, `PHONE_LINK`, `PHONE_CHECK`, `PHONE_TABS`, `PHONE_TAB`,
`PHONE_ROW_PAIR`, `PHONE_ROW_LABEL`, `PHONE_ROW_VALUE`, `PHONE_TABLE`, `PHONE_ROW`, `PHONE_CELL`,
`PHONE_WIDE`, `PHONE_ACTIONS_CELL`.

---

## 3. Every file swept, every difference found, and the decision taken on each

Files are listed in the order the grep returns them. "identical" means compared character by
character with the shared value, with template literals resolved first, so a copy written
`` `${PHONE_TAP} max-md:text-base` `` and one written out in full count as the same.

### 3.1 `components/projects/ProjectsScreen.tsx` - the two named drifts

Six local names. Four identical: `PHONE_ROW`, `PHONE_CELL`, `PHONE_WIDE`, `PHONE_CONTROL`. Two
drifted, and they are **exactly** the pair F14 named on the Clienti list:

| Name | `ProjectsScreen.tsx` before | `components/ui/phone.ts` |
|---|---|---|
| `PHONE_TABLE` padding | `max-md:[&_tbody:not(:empty)]:px-5 max-md:[&_tbody:not(:empty)]:pb-5` | `max-md:[&_tbody:not(:empty)]:p-4` |
| `PHONE_LINK` display | `max-md:flex max-md:min-h-11 max-md:items-center` | `max-md:inline-flex max-md:min-h-11 max-md:items-center` |

**Decision: adopt the shared values.** Neither the critic report nor this card found any reason the
projects list needs a different padding or a different display from every other list, and the
report's own recommendation is to import the shared constants. This is the same resolution P3-97
made on the Clienti list. The whole file's six names become one import.

**What changes on screen, measured and not estimated** (section 5 has the numbers and the pictures):
on a phone a Proiecte row card sat in 20px of side padding, 20px at the bottom and **nothing at the
top**; it now sits in 16px all round. The project name link was a block; it is now an inline box.
Above 768px nothing moves at all.

### 3.2 `components/outbound/OutboundScreen.tsx` - identical

Six local names, all six identical to the shared ones. Deleted, imported, no rendering change.

### 3.3 `components/settings/UnitSettings.tsx` - identical

Four local names, all four identical. Deleted, imported, no rendering change.

### 3.4 `components/projects/DevizComparisonPanel.tsx` - one difference, and it is not drift

Five local names. Four identical. `PHONE_TABLE` has **no padding clause at all**, and the comment
above it says why in the file's own words: *"Tabelul sta deja intr-un chenar cu margini, deci corpul
lui nu mai primeste altele."* The call site is
`<div className={`px-5 py-4 ${PHONE_TABLE}`}>`: the wrapper pads, so the table body does not.

**Decision: import the shared constant, and move the wrapper's padding above the breakpoint.**
Importing it unchanged would have stacked the shared 16px on top of the wrapper's 20px and given
this panel 36px of side padding on a phone, which is a regression dressed as a fix. The wrapper
becomes `md:px-5 md:py-4`. Above 768px it is what it was; below it the shared 16px is the only
padding. **`max-md:p-0` on the wrapper was considered and refused**: it collides with `px-5` at
equal specificity, so the winner is decided by the order Tailwind emits the two rules in, which is
not something a layout should rest on. The built stylesheet confirms `md:px-5` and `md:py-4` land
inside `@media (min-width:48rem)`.

**What changes on screen:** on a phone the comparison rows go from 20px at the sides and 16px top
and bottom to 16px all round. Desktop unchanged.

### 3.5 `components/inventory/ProcurementScreen.tsx` - two differences, of two different kinds

Five local names. Three identical. Two differ, and they are resolved differently because the
differences are not the same shape:

1. `PHONE_TABLE`, **no padding clause**, same wrapper, same comment. Same decision as 3.4:
   `md:px-5 md:py-4` on the wrapper, shared constant imported.
2. `PHONE_LINK` carried **one class more** than the shared value,
   `max-md:[overflow-wrap:anywhere]`, so long product and project names break instead of being
   held on a line. **Decision: keep it, at the call site**, which is the critic report's own
   instruction. The class is written out at each of its **four** call sites (lines 80, 178, 187 and
   236) rather than given a new name. **Nothing changes on screen**: the rendered class set is
   identical.

### 3.6 `app/(app)/memento/page.tsx` - identical

Five local names, all five identical. Deleted, imported, no rendering change.

### 3.7 `components/settings/CategorySettings.tsx` - identical

Six local names, all six identical. Deleted, imported, no rendering change.

### 3.8 `components/inventory/InventoryScreen.tsx` - two differences, of two different kinds

Four local names. Two identical. Two differ:

1. `PHONE_TABLE` had `max-md:[&_tbody:not(:empty)]:p-3` where the shared value has `p-4`, on an
   ordinary `<Card className={PHONE_TABLE}>` call site with nothing else padding it. No reason is
   written anywhere. **Decision: drift, adopt the shared value.** On a phone an Inventar row card
   goes from 12px of padding to 16px, the same as every other list.
2. `PHONE_CELL` carried **one class more**, `max-md:[&>span]:whitespace-normal`, so the label span
   inside a stock cell wraps. **Decision: keep it, at the call site**, written out at each of its
   **seven** call sites. **Nothing changes on screen.**

### 3.9 `components/orders/OrdersScreen.tsx` - a name with no shared twin, used by two files

One local name, `PHONE_WRAP`, which `components/ui/phone.ts` does not export. `app/(app)/page.tsx`
declares the same name, with a **different** value:

| file | value |
|---|---|
| `app/(app)/page.tsx` | `max-md:whitespace-normal max-md:[overflow-wrap:anywhere]` |
| `components/orders/OrdersScreen.tsx` | `max-md:overflow-visible max-md:whitespace-normal max-md:[overflow-wrap:anywhere]` |

**Decision: two files share the name, so it moves into the shared file**, per the task. The value
that moves is the dashboard's, unchanged, and the extra `max-md:overflow-visible` goes on
OrdersScreen's **two** call sites. **This is not an invention**: `app/(app)/page.tsx:143` already
wrote `truncate max-md:overflow-visible ${PHONE_WRAP}` at one of its own call sites, so the split
between a shared base and a call-site addition is the shape this repository had already chosen for
this exact class. **Nothing changes on screen** in either file.

### 3.10 `components/projects/DevizPanel.tsx` - one drift, and the two names that stay local

Nine local names. Six repeat shared names; five of those are identical and one drifted:

| Name | `DevizPanel.tsx` before | `components/ui/phone.ts` |
|---|---|---|
| `PHONE_ACTIONS_CELL` | `max-md:col-span-2 max-md:block max-md:border-b-0 max-md:p-0` | the same, plus `max-md:text-left` |

**Decision: drift, adopt the shared value.** Without `max-md:text-left` that cell inherits the
right alignment of its `Td align="right"`, so on a phone the actions of a deviz line sat against
the right edge of the card while every other cell started at the left. It now starts at the left.

`PHONE_SUM_ROW` and `PHONE_SUM_CELL` have no shared twin and **one file uses them**, so under the
task's rule they may stay local. **They stay**, each with a comment saying it is deliberately local
and why: they describe the Subtotal, Adaos and Total rows of a deviz, which no other screen has.
They are the only two declarations the acceptance grep is allowed to return.

### 3.11 `app/(app)/page.tsx` - identical, plus the source of `PHONE_WRAP`

Six local names. Five identical and deleted. `PHONE_WRAP` moves into the shared file with its value
unchanged, as 3.9 explains.

### 3.12 The shared file

`components/ui/phone.ts` is **only added to**. One export, `PHONE_WRAP`, with the same one line
Romanian comment style the file already uses and written without diacritics in source, as the file
does. **No exported value changes**, because eleven screens plus everything P3-60, P3-64, P3-65 and
P3-97 shipped read those strings and they are the values already proven green.

---

## 4. What the sweep produced

```
grep -rn "^const PHONE_" components/ app/
components/projects/DevizPanel.tsx:79:const PHONE_SUM_ROW = ...
components/projects/DevizPanel.tsx:80:const PHONE_SUM_CELL = ...
```

Two declarations, both named by the card's own notes as deliberately local with the reason, and
listed in section 3.10. Everything else imports.

Thirteen files changed: eleven screens, the shared file, and one spec. **No DOM node is added or
removed anywhere**, and no wording changes: every edit is a `className` string, a constant, an
import or a comment. That is why no assertion at the suite's default 1440x900 could shift and none
was changed.

---

## 5. The proof, and what this machine could and could not run

### 5.1 The acceptance case

`tests/e2e/phone-lists.spec.ts` gains one case,
**`G56: (F14) randul de pe Proiecte are marginea si afisarea din fisierul comun`**, modelled line
for line on the P3-97 case it is the twin of. It reads the computed padding of the row card's
`tbody` and the computed display of the project link **in the page**, with `getComputedStyle`, not
from a class string, because a test that counts classes passes for a second definition that writes
them all the same today and drifts next week. It also re-runs the suite's own `expectFitsPhone`
reading on the list with the new padding, and then asserts at 1440x900 that neither value applies.

`npx playwright test --list tests/e2e/phone-lists.spec.ts` collects **7 cases**, six of them
pre-existing and unchanged.

### 5.2 Coverage: no screen in the sweep needed a new case

The task asks for the phone specs to be extended to any screen the sweep touches that no phone spec
reaches today. **There is none**, checked route by route before deciding:

| screen swept | route | spec that opens it at 390x844 |
|---|---|---|
| `ProjectsScreen.tsx` | `/proiecte` | `phone-lists.spec.ts` case 3, `phone-forms.spec.ts` |
| `InventoryScreen.tsx` | `/inventar` | `phone-lists.spec.ts` case 1, `phone-forms.spec.ts` |
| `OrdersScreen.tsx` | `/comenzi` | `phone-lists.spec.ts` case 4, `phone-forms.spec.ts` |
| `app/(app)/page.tsx` | `/` | `phone-remainder.spec.ts`, `phone-shell.spec.ts` |
| `app/(app)/memento/page.tsx` | `/memento` | `phone-remainder.spec.ts` |
| `ProcurementScreen.tsx` | `/necesar` | `phone-remainder.spec.ts`, `phone-shell.spec.ts` |
| `OutboundScreen.tsx` | `/iesiri` | `phone-remainder.spec.ts` |
| `UnitSettings.tsx`, `CategorySettings.tsx` | `/setari` | `phone-remainder.spec.ts` |
| `DevizPanel.tsx` | `/proiecte/<id>?fila=deviz` | `phone-remainder.spec.ts` |
| `DevizComparisonPanel.tsx` | `/proiecte/<id>?fila=comparatie` | `phone-remainder.spec.ts` |

Those pre-existing cases are the real coverage for the six screens whose padding this card changes,
and they are named in the acceptance for that reason. None of them is weakened, deleted or renamed.

### 5.3 The pictures, and what they are and are not

**This machine has no Docker and no Supabase CLI**, so the application cannot be served against a
database here and the end to end suite runs only in CI. What CAN be done locally, and was, is
render the Proiecte list's own markup, byte for byte as `ProjectsScreen.tsx` emits it, against the
stylesheet `npm run build` had just produced, once with the class strings the file carried BEFORE
this card and once with the shared ones. Four screenshots, committed under
`docs/reports/assets/p3-100/`:

| file | width | which classes | `tbody` padding | link `display` | link height | horizontal scroll |
|---|---|---|---|---|---|---|
| `proiecte-390-inainte.png` | 390 | before | `0px 20px 20px 20px` | `flex` | 44px | none, 390 of 390 |
| `proiecte-390-dupa.png` | 390 | shared | `16px 16px 16px 16px` | `inline-flex` | 44px | none, 390 of 390 |
| `proiecte-1440-inainte.png` | 1440 | before | `0px 0px 0px 0px` | `inline` | 16px | none, 1440 of 1440 |
| `proiecte-1440-dupa.png` | 1440 | shared | `0px 0px 0px 0px` | `inline` | 16px | none, 1440 of 1440 |

**The two 1440px files are BYTE IDENTICAL, which is the desktop claim proved rather than asserted.**
Every class in this card carries `max-md:`, so above 768px there is nothing to move, and the two
images come out the same file:

```
b5b66cf068311f87  proiecte-1440-dupa.png
b5b66cf068311f87  proiecte-1440-inainte.png     (sha256, first 16 hex digits)
6727d61457b01782  proiecte-390-dupa.png
d53327a197b0268d  proiecte-390-inainte.png
```

The 390px pair is the change: the row card's top gap appears (the old value had no top padding at
all) and the side gutters narrow from 20px to 16px.

**What these pictures are not.** They are a style probe, not the application. They prove the class
strings produce those computed values against the real built stylesheet; they do not prove the
screen assembles correctly with real data, and nothing here claims they do. That is what the
acceptance case in CI is for, and it reads the same two values out of the real page.

### 5.4 Local gates, each run alone, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`,
`check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (0 files parsed),
`check:conflict-residue` run **after** `git add`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`, `check:board-clock` after the board commit, and
`npx playwright test --list`.

`npm run check:board-edit` was red until the board flip commit, which is that check working as
written (KNOWN-FAILURES.md: a card cannot be pushed as `in_flight` beside its own code).

**No migration.** No file under `supabase/migrations/` is added or changed, so
`check:no-destructive-migration` parses 0 files and both applier proofs are correctly skipped by
`applier_scope`. This is **not** a documentation-only diff, so `Build`, the migration apply against
a bare postgres and the whole End to end block must have RUN and passed in CI.

---

## 6. Two things that nearly went wrong, and are in `docs/LEARNINGS.md`

1. **A tidying constant that matches the card's own acceptance grep.** Moving ProcurementScreen's
   extra wrap class off its local `PHONE_LINK`, the obvious move was to name the leftover
   `const PHONE_WRAP_LINK` so four call sites could share it. That name matches
   `^const PHONE_` exactly, so the card would have shipped an acceptance its own implementation
   fails. The class is written out at each call site instead.
2. **A CSS probe that cannot argue in the direction it was pointed.** A probe on the built
   stylesheet found `px-5`, `pb-5` and `p-3` still emitted after the sweep, which reads as three
   missed files. There are none: Tailwind's content globs include `docs/`, so a class name written
   as TEXT in a report or in a board card's prose is scanned and emitted. Absence from the source
   is the only proof that a class is gone.

A third, not a near miss but the judgement this card turns on, is section 3.4: adopting a shared
padding into a screen whose wrapper already pads doubles the padding, and a sweep that does not
read the call sites reports that as a fix.

---

## 7. What it means for Rapid Construct

The phone layout rules live in one file now instead of in fifty seven copies. On a phone the
Proiecte list matches every other list again: the row cards sit in the same 16px of padding and the
project name behaves like every other name link. The Inventar, Necesar, comparison and deviz
screens are brought into line at the same time. Nothing changes on a computer screen, no wording
changes, and nothing behaves differently. The practical value is the next change: an adjustment to
how a phone row looks is now made once and reaches every screen, instead of being made in one file
and silently missing ten others.

---

Report committed under CLAUDE.md section 9b. `docs/LEARNINGS.md` carries three ERROR and SOLUTION
pairs from this card, per section 9.
