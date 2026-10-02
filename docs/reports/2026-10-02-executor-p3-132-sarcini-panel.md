# EXECUTOR, card P3-132: the Sarcini panel on the record's own detail page

Role **EXECUTOR**. Goal G73, Item 4 part three, the third of Item 4's four cards. Branch
`card/p3-132`, cut from `origin/main` at `5601a1e`, the merge of PR #389. Card P3-132 on
`docs/board/rc-board-phase3.json` is the specification; where this report and the card disagree, the
card wins.

Date 2026-10-02. **No migration.** Both dependencies were shipped and applied before any code was
written here: P3-130 (PR #388, migration 0068) and P3-131 (PR #389), live at `5601a1e` with
`ledger_version` `0068`.

This run **resumed a worktree that already carried three commits** from an earlier run that died on
infrastructure. The implementation was in place and complete; what was missing was two of the five
test cases, the board edit, the learnings and this report.

---

## In plain words, for the owner

Open a customer, a lead or a site and the jobs attached to that record are now **on the page**, under
the notes and above the tabs, without going to the jobs list and filtering it. The panel says how many
there are, marks anything late as **Întârziată** exactly as the main list does, and lets you write a
new job right there: the job is **already attached to the record you were looking at** and you never
have to say so. Jobs can be edited and called off from the same place. **There is no way to delete a
job from the panel** of any kind: calling one off marks it `Anulată` and it stays on the record.

**The single "next step" reminder on a customer has not moved and has not changed.** It is still in the
same card at the top of the sheet, with the same date and the same text, and the new panel sits below
it. Nothing about the Azi screen changed. The live database did not move: `ledger_version` is still
`0068`.

---

## The two drafter's decisions: both kept

### Decision A, two detail screens serving three pages. KEPT.

Clause 1 asks for the panel on a lead, a client and a project. This application has **two** detail
screens: `components/clients/ClientDetailScreen.tsx`, which serves **both a lead and a client**, and
`components/projects/ProjectDetailScreen.tsx`. A lead **is** a row of `public.clients` carrying a
stage. `CONTEXT.md` lists under decided and not to be reopened, "A lead is a client row with a stage.
No leads table, no second detail page", and there is no `public.leads` table in any of the sixty eight
migrations. Card P3-130 wrote the same fact into its notes when it gave `public.task_entity` **two**
values, `client` and `project`, and no lead token.

So a task on a lead carries `entityType: "client"` with the client row's own id, and the client detail
screen renders it. Acceptance (a) is still asserted **three ways**, because that is what the acceptance
says and because a lead reaching the same screen is the thing worth proving: a client row seeded at a
lead stage, a client row at stage `client`, and a project.

### Decision B, acceptance (e) satisfied both ways. KEPT.

Acceptance (e) names a case `fisa clientului: pasul urmator este neschimbat` and calls it "the EXISTING
next-step test, re-run unmodified". **No case of that name existed.** The real existing guard is
`tests/e2e/lead-next-action.spec.ts`, card P3-89, six cases inside
`test.describe("Leaduri, următorul pas (P3-89)")`.

Both halves are honoured. Those six run **unmodified, not one character**, and that file does not
appear in `git diff --name-only origin/main...HEAD` at all. `tests/e2e/azi-screen.spec.ts` is likewise
untouched. And a new case was written under the acceptance's exact name.

**What the new case adds**, so it is not a second copy of the six: that the next-step block still
renders on the client detail page **with the new panel beside it**, read on the same `data-testid` the
existing case 1 reads, `client-next-action`, with its date in `zz.ll.aaaa` and its text; that the panel
sits **below** it geometrically, so a panel that had replaced, hidden or pushed above it would fail;
that the next-step block is **not inside** the panel and the step's text is not rendered by the panel
at all; and the half that actually catches a write, that a task **created**, then **edited**, then
**cancelled** from the panel leaves `next_action_at`, `next_action`, `follow_up_date` and `stage` byte
identical, read from the database after each of the three. The task's own due date is set to the very
day the step carries, so a write that confused the two could not hide behind a different date.

---

## Clause 5: the row renderer was extracted, not copied

`components/tasks/SarciniScreen.tsx` exported only `SarciniScreen`, with the row renderer, the group
headings and the overdue mark inside it. The table was **extracted into
`components/tasks/TaskTable.tsx`**, which the tab and the panel both import; `SarciniScreen` lost 226
lines to it.

Every `data-testid` came across unchanged (`task-row`, `task-title`, `task-status`, `task-priority`,
`task-due-date`, `task-overdue`, `task-edit`, `tasks-group-label`) and so did every data attribute the
cases read (`data-id`, `data-group`, `data-overdue`). **That is why P3-131's eight cases and P3-130's
six needed no edit.** The task file offered the option of stopping and writing a mailbox question if the
extraction risked those eight; it did not, because the extraction was a move and not a rewrite, so no
question was written.

`TaskTable` takes **one** shape parameter, `showEntity`, false in the panel because every row there
carries the page's own record, so the column would write the same word on every row and its link would
lead where the operator already is. One boolean on one renderer is not a second implementation.

`TaskForm` gained **one** parameter, `fixedEntity`; when it arrives the two linked-record selectors are
**not rendered** and the record stands in their place as text, with its Romanian kind word and its
name. That is why acceptance (b) can prove the stored link **by the absence of the control** rather
than by the test not having touched one.

---

## Clause 4: the agreement is structural, not merely tested

The panel and the tab render **the same component**, which calls `isTaskOverdue()` from
`lib/data/tasks-shape.ts`, whose entire body is `return taskBucket(task, today) === "restante"`.
Derivation is what makes the two screens unable to disagree; case (d) is what catches the day somebody
undoes it.

No second day comparison was written. Nothing in this card's diff constructs a `Date`, and `today` is
found **once per render** by `chisinauToday()` in the page and passed down whole, so a render at
23:59:59 cannot find one day for the grouping and another for the mark.

Case (d) seeds a set spanning the boundary (the four statuses on a past day, plus today, plus tomorrow,
plus no due date), reads **group and overdue** off both screens, and asserts them equal row by row,
after first asserting both sets are non-empty so that "all false equals all false" cannot pass for a
proof.

---

## Where the panel sits, and why there

Chosen, not taken. On the client sheet it is **below the notes and above the tab strip**: above the
notes would have pushed down the "Ce s-a discutat" box that card P3-99 deliberately raised, and below
the tab strip would have put the jobs after five tabs, the very defect P3-99 repaired. The
**Următorul pas** block inside the identification card does not move. On the project sheet, the same
place, between the three numbers and the tab strip.

The panel **does not render at all** when the table is not visible. `tasksVisible()` rides in the same
`Promise.all` as the sheet's other reads rather than in series after them, because card P3-40 measured
about 32 database round trips on an authenticated render. When it answers no, `tasks` is null and
nothing is drawn: "the table does not exist yet" and "no jobs" are two different things and are not
said with the same words.

**Both roles write tasks**, so `canWriteTasks` is `user !== null` and not `role === "owner"`, which is
the right to edit the client sheet. The `tasks_insert` and `tasks_update` policies of migration 0068
require a non-null `public.current_app_role()`, and both roles carry operations rights (ruling of
migration 0001 section 9). `app/(app)/sarcini/page.tsx` makes the same computation, and two screens
showing the same table may not hold two ideas about who can write it.

The revalidation path is **deduced** from the pair the written row carries, read back from the insert
and the update rather than taken as an argument, so no caller can ask for the refresh of a page
unrelated to what was written. An unknown token refreshes nothing and throws nothing, because a path
built from a token that file does not know would be a guessed path.

---

## Where the card and the task file disagreed

**Nowhere on substance.** The task file was written from the card and restated its eight clauses
faithfully; the two places it went beyond the card were the two drafter's decisions above, and both
were named as decisions and both were kept.

One wording point, recorded because the next reader will hit it: the task file says the new D7 case
should assert "the next-step block still renders on the client detail page with the new panel beside
it", which is the lighter half of what was written. The case also proves the three writes leave the
stored columns untouched, which the task file did not ask for. That is additive and was kept because
it is the only half that can catch a write, and clause 6's own wording is "does not replace it, hide
it, read it or write it".

---

## One mistake, and what it cost

**A formatter that this repository does not use was run on `tests/e2e/tasks.spec.ts`.** Out of habit the
run called `npx prettier --check` and then `--write`. Both succeeded. The result was a file whose diff
against `origin/main` carried about forty hunks spread through the P3-130 and P3-131 cases, 1708
insertions and **180 deletions**, where the real work was a pure append. Nothing failed: `tsc` passed,
`npm run build` passed, every assertion still held.

The cause: **this repository has no prettier at all.** No `prettier` in `devDependencies`, no
`prettier` key in `package.json`, no `.prettierrc`, and no format or lint step in the workflow (the lint
step is absent on purpose, with a comment explaining that `eslint-config-next@16` hard-throws against
this repo's `typescript@^7`). So `npx` fetched prettier 10.x and formatted at its default `printWidth`
of 80, while this codebase is hand-wrapped near 96. Checking `--print-width 100` against three
untouched files showed they fail that too: the code is not prettier-shaped at any width, so no width
would have been safe.

**Repaired** by rebuilding the file from `git show origin/main:tests/e2e/tasks.spec.ts` plus the new
section sliced out of the staged blob, and then proving it:
`git diff origin/main -- tests/e2e/tasks.spec.ts | grep '^@@'` returns **one** hunk,
`@@ -1655,3 +1655,1159 @@`, a pure append. Everything above line 1655 is byte-identical to `main`.

**One consequence is honest to state:** the new section's code lines are wrapped nearer 80 than the
file's usual 96, because the prettier pass is what the new section was recovered from and the earlier
run's hand-wrapping of cases (a) to (c) could not be retrieved (it was never committed). The comments,
which carry the reasoning, are intact: prettier does not rewrap comments. No gate is affected and no
existing case is touched; it is a cosmetic difference confined to this card's own additions.

Both the formatter class and the derived-`lane` class are written into `docs/LEARNINGS.md`.

---

## Gates

From the worktree, each exiting 0:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0, acceptance (h) |
| `npm run build` | 0, acceptance (h) |
| `node docs/board/validate-board.mjs` over all three boards | 0 violations |
| `npm run check:card-ids` | 292 card ids resolved |
| `npm run check:board-edit` | satisfied once P3-132 was flipped |
| the remaining eleven `check:` scripts of the close-out block | see the pull request body |

`git diff --name-only origin/main...HEAD` contains **no path under `supabase/migrations/`**, acceptance
(g). A grep of the changed files finds no em dash, no en dash, and no rename of any `lead=` PageHeader
prop (acceptance (f) is also asserted by the existing case
`sarcini: niciun cuvant englez pe ecran si nicio liniuta lunga in fisierele schimbate`, which covers the
new files unchanged).

**This machine has no Docker and no Supabase CLI**, so the end to end suite runs only in CI, which is
where the five cases are green.

---

## For card P3-133, the Azi section

Three facts, also written into the card's `notes` so they are not rediscovered.

1. **The shared row renderer is `components/tasks/TaskTable.tsx`**, with its one `showEntity` boolean.
   Import it and choose that boolean rather than draw a third table.
2. **The day function is `isTaskOverdue(task, today)`** in `lib/data/tasks-shape.ts`, derived from
   `taskBucket`, with `today` from `chisinauToday()` found once per render in the page. Days are
   compared as strings. Case (d) of this card is the shape of the agreement case to copy.
3. **The care point.** The Azi screen is the *other* consumer of the client next-step field
   (`lib/data/azi.ts`, card P3-91). On the detail sheets D7 was easy, because the two sit side by side.
   On Azi both kinds of thing land on **one** screen, so P3-133 has to decide how a single next-step
   promise and a queue of jobs share a page without either becoming the other. **That decision belongs
   to that card and this one did not make it.** Note also that the D7 source check inside
   `fisa clientului: pasul urmator este neschimbat` forbids the nine task files from naming
   `next_action_at`, `next_action`, `search_clients_next_action`, `hasClientNextAction`,
   `nextActionAvailable` or `lib/data/azi` **in code**. P3-133 will add a file that necessarily names
   the Azi module: when it does, that file belongs on the Azi screen's side of the boundary and not in
   the `TASK_FILES` list. The check is not a ban on P3-133's own work.
