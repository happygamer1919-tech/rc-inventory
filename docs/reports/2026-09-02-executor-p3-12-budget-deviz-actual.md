# EXECUTOR, 2026-09-02: P3-12, three numbers on project detail

Card **P3-12**. Branch `card/p3-12`. No migration, no database write, no secret read.

---

## 1. Three numbers, not two, and none behind a click

R-058 delta 12. Budget, accepted estimate total and real cost are **three different questions**, and any two of them tell an incomplete story:

| number | the question it answers |
|---|---|
| `Buget` | what the business decided to spend |
| `Total deviz acceptat` | what the client agreed to pay for |
| `Cost real` | what has left the warehouse |

Without the estimate total there is no way to tell an **over-budget** job from an **under-quoted** one off the screen, and that is precisely the distinction somebody opens the page to make.

Below them, `Abatere față de buget` and `Consumat din buget` - **labelled against the budget in words**, because colour alone does not say what the comparison is against, and the card is explicit that nobody should read them as against the estimate.

## 2. Nothing is recalculated, which is the card's own warning

> READS THE COST MODULE, NEVER REIMPLEMENTS IT. If this card finds itself writing a second sum over `outbound_lines`, that is the defect.

`lib/reporting/project-budget.ts` is a pure function over three inputs the page **already fetches**. The cost comes from `lib/reporting/material-cost.ts`. The accepted total comes from the **same `DevizSummary` list the deviz tab renders**, built by `devizTotals` with the Adaos row included.

So the two screens cannot disagree **by construction** rather than by care. No fourth query was added.

## 3. A gap is not a zero, and that is the rule most easily broken

A project with no budget does not have a budget of **zero** - it has a budget nobody has decided yet. A project with no accepted estimate was not quoted at zero lei. Every absence carries Romanian text and never a figure.

**`Cost real` deliberately has no empty text.** Zero issues really does mean zero lei left the warehouse, which is a fact and not a gap. Giving it an empty state would be code nothing could reach, so the prop is optional and that block does not pass one.

**A zero budget does not divide either.** `budget_mdl` is nullable because a lead has none, but zero is also a value somebody can save, and dividing by it yields `Infinity`, which renders as an enormous and entirely real-looking percentage. Both cases give `null`, and `null` renders as a Romanian dash.

## 4. Acceptance, run

```
$ npx playwright test project-budget.spec.ts --project=chromium
  ✓ 1. toate trei numerele sunt pe fișă, fără să fie deschis nimic
  ✓ 2. abaterea și consumatul sunt față de BUGET și sunt etichetate așa
  ✓ 3. buget fără deviz acceptat: trei blocuri, unul cu stare goală, nu două blocuri
  ✓ 4. deviz acceptat fără buget: consumatul este o liniuță, nu o împărțire la zero
  ✓ 5. nici buget nici deviz: costul real și două stări goale
  ✓ 6. totalul de pe fișă este cel de pe fila de deviz, până la ban
  ✓ 7. fiecare șir vizibil este românesc
  7 passed (29.8s)

$ npx tsc --noEmit    exit 0
$ npm run build       Compiled successfully
```

Seven cases, one per clause of the acceptance line.

**Case 6 compares the raw `data-value-mdl`, not the text.** `formatMoney` rounds to the leu on both screens, so a text comparison would pass even when the two numbers differ by bani - which is exactly what "to the last bani" is asking about. The attribute convention already exists in `DevizPanel` and `project-cost.spec`.

**The project with all three numbers is the seeded one, deliberately.** Its real cost comes from outbound rows whose dates the form cannot produce - there is no date field - which is why `scripts/seed-test-cost.mjs` exists at all. A budget and an accepted estimate are added to it **through the screen**.

## 5. The defect this card found in its own test

The helper accepted an estimate and then waited for `deviz-locked` before reading the detail page. **`deviz-locked` renders for any status other than `draft`, so it was already true after the preceding send.** The wait returned instantly, the detail page was read before the acceptance reached the database, and the screen correctly reported no accepted estimate. Three of seven cases failed, and the failure **looked like a defect in the screen under test**.

From `accepted` there is no onward transition, so the status buttons disappear. That is the only condition which becomes true *only* after acceptance, and it is what the helper waits on now, together with the row chip reading `Acceptat`.

`docs/LEARNINGS.md` carries it: **an await whose condition already holds before the action is a synchronous statement wearing an await.** Before waiting on a selector, ask what it looked like one step earlier; if the answer is "the same", it is the wrong selector.

## 6. Density doctrine

The three figures plus the two derived numbers are the **summary**. The breakdown stays behind the existing drill-in: the Cost tab, the Deviz tab. No table was added to the page, the existing `Card`/`CardHeader` vocabulary is reused, and no new shell component was introduced.
