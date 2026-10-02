# EXECUTOR, card P3-131: the Sarcini tab in CRM

Role **EXECUTOR**. Goal G73, Item 4 part two, the fifth of G73's fifteen cards and the second of
Item 4. Branch `card/p3-131`, cut from `origin/main` at `e608b6c`. Card P3-131 on
`docs/board/rc-board-phase3.json` is the specification; where this report and the card disagree, the
card wins.

Date 2026-10-02. No migration. The dependency, P3-130 (PR #388, migration 0068), was shipped and
applied before any code was written here: `https://app.rapidconstruct.md/api/health` reported commit
`e608b6c` with `ledger_version` `0068` at 12:22 UTC, which is the proof the table exists in
production.

---

## In plain words, for the owner

The customer section gains a fourth card, **Sarcini**, and behind it a full job list. The list shows
every job with its title, state, urgency, due date, who it belongs to and which customer or site it
is attached to, and that last one is a link you can click to open that record. You can narrow the
list five ways (state, urgency, person, a due-date range, and what kind of record it is attached to)
and order it three ways (by due date, by urgency, by when it was written), each in either direction.
Anything past its due date and not yet finished is marked **Întârziată** on the row. The list groups
itself the way a sales team expects: overdue first, then today, then this week, then everything else.
Jobs are created, edited and called off from this screen. **There is no way to delete a job anywhere
on it:** calling one off marks it `Anulată` and it stays on the record, so in a month anyone can see
what was dropped and when.

Nothing about the existing "next step" on a customer changed, and the Azi screen is untouched. The
live database did not move: `ledger_version` is still `0068`.

---

## Drafter's decisions: all five kept

### Decision A, one function and the overdue flag derived from the bucket. KEPT, exactly.

`taskBucket(task, today)` in `lib/data/tasks-shape.ts` is the only definition of "late" on the
screen. `isTaskOverdue(task, today)` is literally `taskBucket(task, today) === "restante"` and that
is the whole body of the function. `taskGroup(task, today)` calls `taskBucket` too. Nothing else on
the screen compares a day: `lib/data/tasks.ts` passes the due-date range to PostgREST as two strings
and compares nothing itself, and `components/tasks/SarciniScreen.tsx` receives `today` from the page
and never computes it.

The reason the drafter gave is the reason: acceptance (d) demands the set of tasks in `Restante`
equal the set carrying the flag, and derivation makes them unable to disagree, where a second
predicate would only make them equal today. The card's own notes say this is the clause to get right.

### Decision B, the three bucket definitions. KEPT, exactly as drafted.

All comparisons on `yyyy-mm-dd` strings against `chisinauToday()`:

- **Restante**: `dueDate < today` AND status is neither `done` nor `cancelled`. The status exclusion
  is clause 5's own wording and it lives inside the one function, so the flag and the bucket carry it
  identically.
- **Azi**: `dueDate === today`. A task due today is **not** overdue.
- **Această săptămână**: `dueDate > today` and on or before the end of the current week, where the
  week ends **Sunday**, computed by `endOfChisinauWeek(today)`.

Days are compared as strings, which is what the load-bearing comment on `chisinauToday()` in
`lib/data/format.ts` requires. It was not "fixed" into a `Date` comparison. The one place calendar
arithmetic happens is `endOfChisinauWeek`, which **counts days between two calendar dates** rather
than comparing a day with a moment: it builds UTC midnight from the digits of the day it was given
and reads back only UTC parts, so construction and reading cancel and no zone can move the day. The
result leaves as a string and is compared as a string. That distinction is written into the function's
own comment so the next reader does not "correct" it into the forbidden shape.

### Decision C, the `Fără termen` container. KEPT, and WIDENED, and this is the one place where I went past the brief.

The drafter named one case the card does not cover, a task with no due date, and asked for a trailing
`Fără termen` group that is a presentation container and not a fourth bucket. That is kept, under
exactly that heading.

**There is a second case the brief did not name, and it needed the same treatment.** A task with a
due date that falls outside all three buckets is also in none of them, and there are two ways to get
there: a due date beyond this Sunday, and a due date in the past on a task that is already finished
or cancelled, which clause 5 excludes from `Restante` deliberately. Written as three groups plus
`Fără termen`, those tasks would have been returned by the read, counted in the list header, and
displayed **nowhere**. A row that is counted and invisible is the defect the drafter was guarding
against one paragraph earlier.

So there are **two** presentation containers, not one:

- `fara_termen`, heading **Fără termen**: no due date. Never overdue.
- `altele`, heading **Alte sarcini**: has a due date, in none of the three buckets.

The second is called `Alte sarcini` and not `Mai târziu` on purpose: a time word would be false for
half of what lands in it. Both are derived inside `taskGroup` from `taskBucket`, splitting the
remainder on `dueDate === null`, which is not a question about a day at all, so **there is still
exactly one day comparison**. `ALL_TASK_BUCKETS` holds exactly three and `TaskGroup`'s own comment in
`lib/data/tasks-types.ts` states at length that the two containers are not buckets and why. Ivan's
buckets stay exactly the three he named.

I did not write a mailbox question for this. The brief told me to stop and ask only "if you read the
card as forbidding even that", and the card does not forbid it: clause 6 requires the buckets to
group the same list, which is the sentence that makes the containers necessary rather than optional.
The brief's own reasoning ("a task that exists and appears nowhere is the worse outcome") applies
identically to the case it did not name, so applying it was following the instruction, not departing
from it. The class is written into `docs/LEARNINGS.md`.

### Decision D, a fourth card on `/crm` plus `/sarcini` in `CRM_SCREENS`. KEPT.

The CRM section has no tab bar, so "a new tab" became a fourth card on `/crm` and a new route
`/sarcini` registered in `CRM_SCREENS` in `lib/nav.ts`, not in `NAV`. The reasons are the ones the
brief took from `lib/nav.ts` itself: `CRM_SCREENS` is read by `labelForPath`, which gives the top bar
title, and by `ALL_ROUTES`, which `tests/e2e/headers.spec.ts` walks, and a screen in neither list
loses both with no signal. `/clienti` and `/proiecte` have no menu entry either, so Sarcini does not
get one. The `activeFor` on the CRM menu entry is `CRM_SCREENS.map((s) => s.href)`, so `/sarcini`
keeps CRM marked in the menu without any further edit.

`/crm` still reads **nothing** from the database and the new card carries no counts, which the brief
required and the file's own header explains (card P3-40 measured about 32 round trips on an
authenticated render).

Three things this broke, all fixed on purpose:

1. `tests/e2e/crm-landing.spec.ts`, detailed below.
2. The grid went from `grid-cols-3` to `grid-cols-4`, keeping `max-md:grid-cols-1` untouched, so the
   phone layout does not regress. The shell guarantees 1100px from 768px up
   (`.rc-shell` in `app/globals.css`), so four cards fit.
3. The fourth colour is `bg-rc-orange`, named `orange`, with the colour beside the label and never
   instead of it and `data-colour` as an attribute. It is an existing token, so no new colour was
   added, and it is visually distinct from the amber already in use (`#f47c1f` against `#b7791f`).
   Red (`bg-rc-danger`) was the other candidate and was rejected: a job list is not an error.

One thing I added that the brief left open. `IconName` in `lib/nav.ts` is a closed union and the
brief said to reuse a name "unless you also add it to the union and the `Icon` component". I added
`tasks`, a checklist shape, and did the second half: none of the eleven existing names draws a list
of jobs (`bell` is the stock reminder and the Azi screen, `orders` is two order documents, `invoice`
is an invoice), and a glyph that says something other than the label beside it is worse than none.
Eight lines in `components/ui/Icon.tsx` and the compiler refuses a name without a glyph.

### Decision E, filters and sort in the URL. KEPT for everything that has state, with one documented gap.

The five filters and the sort both live in the URL query, parsed by the single clean module
`parseTaskQuery` in `lib/data/tasks-query.ts`, following `components/clients/ClientsScreen.tsx` and
the finding F7 / card P3-96 repair its comment records. Parameter names are Romanian like the rest of
the application: `stare`, `urgenta`, `responsabil`, `de_la`, `pana_la`, `fel`, `sortare`, `ordine`. A
value the parser does not recognise becomes "no filter" rather than an empty screen, the pattern
`app/(app)/azi/page.tsx` already states. The filter row copies `ClientsScreen`'s shape: an explicit
grid, `w-full` controls, and a **Șterge filtrele** control at the end that appears only when
something is actually filtered, under `data-testid="tasks-filters"`.

**The gap: the bucket grouping keeps no URL state, because it has none.** Decision E named "the
bucket grouping" alongside the filters and the sort. The list is **always** grouped, since that is
how it renders, so there is nothing about the grouping to hold anywhere, in state or in the URL. A
parameter that showed one bucket only would be a **sixth filter**, and clause 3 says "Do not add a
sixth filter because it seemed useful; that is a new card." The card wins over the brief here, and
the gap is written into the header of `lib/data/tasks-query.ts` so nobody later reads it as an
oversight. Decision E is kept in full for everything that actually carries state.

I also kept the sort **out** of `Șterge filtrele`, on the finding F6 reasoning: clearing a filter
must not move the operator into a differently ordered list.

---

## Which lines of `crm-landing.spec.ts` I changed, and why

Four changes, all required by acceptance and by ruling q027, which already settled that a card may
change a row of that spec when its own acceptance needs it. Clause 1 of P3-131 asks for a new tab
"alongside the tabs that are already there. Not a replacement for one", so the three existing cards
are untouched, in the same order, with the same colours.

1. **The `CARDS` list** gained a fourth entry, `{ label: "Sarcini", colour: "orange" }`. That list is
   the spec's own expected value for the labels (`toHaveText(CARDS.map((c) => c.label))`) and for the
   per-card colour loop, so this one edit carries the label assertion and the colour assertion with
   it. A comment above it records that this is the only row the card changes and why it is
   legitimate.
2. **Case P3-46 (1), `toHaveCount(3)` became `toHaveCount(CARDS.length)`.** I did not write `4`: a
   hand-written count beside a list is a second place to keep current, and the next card to add a
   card would hit the same red for the same reason.
3. **Case P3-46 (1), the distinct-colour assertion** `toBe(3)` became `toBe(CARDS.length)`, same
   reason. The clause that no two cards share a colour is still asserted, now over four.
4. **Case P3-46 (6), `toHaveCount(3)` became `toHaveCount(CARDS.length)`,** same reason.

One assertion was **added** rather than changed: case P3-46 (5) now also requires `ALL_ROUTES` to
contain `/sarcini`. That case exists precisely because the top bar title and
`tests/e2e/headers.spec.ts` both read the real navigation list, and a screen left out of it loses
both silently. Adding the line is what makes decision D machine-checked.

---

## Where the card and the brief disagreed

Three places, all small, all resolved in the card's favour.

1. **Decision E and the bucket grouping in the URL.** The brief asked for the grouping to live in the
   URL; the card's clause 3 allows exactly five filters. There is nothing to store, and anything
   storable would be a sixth filter. See decision E above.
2. **Decision C and the unnamed second remainder case.** The brief named one case the card does not
   cover; there are two. Clause 6's "grouping the same list" decided it. See decision C above.
3. **The display order of the groups.** Clause 6 enumerates the buckets as "Azi, Aceasta saptamana,
   Restante". I render **Restante first**, then Azi, then Această săptămână, then Alte sarcini, then
   Fără termen. I read clause 6's list as naming *which* three buckets exist rather than the order
   they are drawn in, and clause 5 decides the order: an overdue task "is the whole reason somebody
   opens this screen". The Azi screen (card P3-91) already orders the same way, and its menu
   description says so in as many words, "cei întârziați primii". This is a judgment call and it is
   flagged as one; the reasoning is written into `TASK_GROUP_LABEL`'s comment. If the owner wants
   Ivan's literal order, it is one line in `ALL_TASK_BUCKETS`.

Nothing in the brief contradicted the repository's `CLAUDE.md`, so no mailbox question was written on
that ground. No mailbox question was written at all: nothing was blocked and no decision needed one.

---

## What else is worth knowing

**No second date widget.** The due-date range is two `DateField` boxes, the standard Romanian
`zz.ll.aaaa` control from card P3-49 and finding F4, and so is the due date in the form. The spec
asserts the placeholder is `DATE_PLACEHOLDER` on all three and that every native `<input type="date">`
is hidden, which is the actual P3-49 rule.

**Filtering and sorting happen on the server**, in `listTasks(query)` in `lib/data/tasks.ts`, on the
`tasks_status_due_date_idx` index P3-130 built for exactly this. The component filters and sorts
nothing in memory, following the rule `ClientsScreen`'s header states. `listTasks()` with no argument
answers exactly as it did before this card, so the one existing caller is unchanged. Every ordering
ends on `id` so two equal rows cannot swap between renders. A task with no due date sorts last in
both directions (`nullsFirst: false`): it has no day, so it has no place in an order of days.

**Priority sorts on the enum**, whose labels migration 0068 declares `low`, `medium`, `high`, so
ascending means `Scăzută` first. As text it would have been `high`, `low`, `medium`.

**Two header paragraphs were corrected, not deleted,** under `CLAUDE.md` section 9c. `lib/data/tasks.ts`
said no filter, no sort and no bucket lived there; `lib/data/tasks-actions.ts` said `revalidatePath`
was deliberately absent. Both sentences are kept as quotations with the correction beneath, because
both were true when written and the distinction matters: the filters and sorts moved in (they are an
`eq` and an `order`, not a definition of a day), the buckets and the flag did not and never will, and
`revalidatePath("/sarcini")` is now called because this card finally has a route to revalidate.
P3-132 and P3-133 add their own paths when they have them.

**The linked record is a link,** through `RecordLink`, which renders plain text with a Romanian
explanation rather than a dead link when there is no destination. Three pages over two tokens:
a lead is a row of `public.clients` carrying a stage, so a task on a lead carries `entityType: client`
and its page is `/clienti/<id>`. Acceptance (g) seeds a client row at a lead stage and follows the
link to its page, so the premise is proved and not assumed.

**The form can attach a record,** through a kind selector plus the existing `Combobox`, fed by
`listClientOptions()` and `listSelectableProjects()`. The brief did not require this and I weighed
leaving it out: clause 7 says created and edited, not attached, and P3-132's whole convenience is
attaching from the record's own page. I included it because the owner listed the linked entity as a
field of a task, and a create form that cannot write a field of the thing it creates is incomplete:
without it, anything created on this screen could never be linked to anything, ever. The two reads
are the existing functions, not new queries, and they go out in the same `Promise.all` as the rest.
One consequence worth naming: `listSelectableProjects()` excludes closed projects, by card P3-04's
rule, so a job cannot be attached to a closed site from this screen. Whoever needs that has P3-132's
panel on the project page, and widening it is a card, not a second query written here.

**There is no pagination,** because no clause asks for one. The read returns every task the filters
allow. That is right for today and will want a card eventually; it is not this card's scope and the
grouping is what keeps a long list readable in the meantime.

**The Romanian words for the two linked record kinds** are now in `TASK_ENTITY_TYPE_LABEL`, filling
the gap P3-130 left on purpose, the same way P3-119 filled `OUTBOUND_MODE_LABEL` after P3-118 left it
empty.

**The capability gate is kept honest** even though 0068 is applied: when `tasksVisible()` answers no,
`/sarcini` renders the Romanian `SchemaPending` screen instead of throwing. That is the shape of
incident INC-05.

**One tolerated word was added to `check:pending-schema-reads`** and the check was not weakened.
`components/tasks/TaskForm.tsx` carries the word `description` because a task has one, and the check
searches for a pending column name anywhere in a file under `components/`. The pending column with
that name is `extraction_draft_lines.description` from 0053; `tasks.description` was created inside
`create table` in 0068, which the check does not index as a pending column, and the component names
no table and writes only through `createTask` and `updateTask`, which both pass `hasTasks`.
`SarciniScreen.tsx` needed no entry (the list does not show a description at all) and
`app/(app)/sarcini/page.tsx` needed none (it really reads the table and calls the gate first). An
entry whose file stops carrying the word is itself reported stale, so the list cannot rot. The reason
is written out in the registry, beside P3-130's entry of the same shape.

---

## Tests

Eight new cases in `tests/e2e/tasks.spec.ts`, under the exact names the acceptance cites. **The six
cases P3-130 wrote pass unmodified, not one character changed**, which is half the proof the data
layer did not shift under them.

| Case | What it proves |
|---|---|
| `sarcini: fiecare dintre cele cinci filtre restrange lista` | (a). A witness plus five variants, each differing from the witness in exactly one dimension, so each filter is proved alone. Also that there are exactly five controls and no search box, that both native date inputs are hidden, that the box drives the URL and not only the reverse, and that `Șterge filtrele` appears only when something is filtered. |
| `sarcini: fiecare dintre cele trei sortari ordoneaza lista` | (b). Three tasks whose order is a different rotation under each of the three sorts, each sort asserted in both directions, six distinct orders. `created_at` is written explicitly, because three inserts a moment apart give an order that hangs on microseconds. Also that all three sit under the same group heading, since a grouped list has an order inside its groups and not across them. |
| `sarcini: o sarcina trecuta de termen este marcata, iar una cu termen azi nu este` | (c), including the boundary. Days seeded relative to `chisinauToday()`. Asserts the attribute and the visible `Întârziată` chip. |
| `sarcini: galetile Azi, Aceasta saptamana si Restante folosesc aceeasi definitie a zilei ca marcajul de intarziere` | (d), the agreement case. Over the **whole** list: the set in `Restante` equals the set carrying the flag, and the set is not empty so it cannot pass on a screen that marks and groups nothing. Seven seeded rows span the boundary, including a past-due `done` and a past-due `cancelled`, which is exactly where two predicates would have diverged. |
| `sarcini: se poate crea, modifica si anula o sarcina din ecran` | (e). Create, edit and cancel through the UI, with the stored row read back to prove English tokens were written and Romanian labels only rendered, and the cancelled row still present. |
| `sarcini: nu exista niciun control de stergere pe ecran` | (f). The exact control set of the row and of the panel, a delete-shaped detector proved against planted offenders and against the innocent lines, and a source grep for the **shape** of a delete call across all eight modules, also self-proved. |
| `sarcini: legatura catre inregistrarea atasata deschide acea inregistrare` | (g). Green for lead, client and project, each followed to its page and its `h1`. Plus the unlinked case rendering as text, not a dead link. |
| `sarcini: niciun cuvant englez pe ecran si nicio liniuta lunga in fisierele schimbate` | (h), as its own named case, which is what I chose rather than folding it into an existing one. |

Acceptance (h) is a named case of its own because there is **no `npm run check:romanian-ui` script in
this repository** and adding one would be a new gate for every card, which nobody asked for. It
follows the shape card P3-120 wrote in `tests/e2e/outbound-direct-client.spec.ts`, including that
file's em-dash and en-dash grep, over an explicit list of fourteen paths each of which must exist so
a rename fails loudly. Two deliberate differences from that case: it reads `textContent` rather than
`innerText`, because `Th` carries `uppercase` and `innerText` returns CSS-transformed text (the run
card P3-15 paid for) and because a `<select>`'s options are not laid out in flow so `innerText` does
not see them, while the Romanian filter **values** clause 3 requires **are** options; and it reads
the regions this card writes rather than the whole screen, because the data rows carry fixture names
written by other specs (test data is never deleted here) and a check that read them would punish this
card for another card's seeds. Both choices are written into the case.

Seeded days are relative to `chisinauToday()` and never literals. Cases that do not need the boundary
use a far-future year window each, so one case's range filter never meets another's rows, and every
case measures its own ids rather than counting rows, because test data is never deleted and every run
leaves rows behind (the class card P3-101 paid two red cases for).

**One exposure, stated rather than hidden:** cases (c) and (d) compute `chisinauToday()` in the test
process and the screen computes it on the server. A run that straddles midnight in Chisinau could see
the two disagree by a day and go red on correct code. The window is seconds wide per run; the
alternative, reading the day off the screen, would have meant trusting the thing under test to report
the boundary it is being measured against. The same exposure exists for the Azi screen's own specs.

---

## Gates

Run from the worktree, each command alone so its exit code is its own.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, `/sarcini` listed in the route table |
| `node docs/board/validate-board.mjs` over all three board files | exit 0, before every commit |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | exit 0 |
| `npm run check:unique-ids` | exit 0 |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0 |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0 |
| `npm run check:board-clock` | exit 0 |

**This machine has no Docker and no Supabase CLI**, so `check:migrations`, `prove:applier`,
`prove:assertions` and the end-to-end suite run **only in CI**, and nothing here claims otherwise.
No new assertion file was written, because this card carries no migration.

---

## What must not change, confirmed

- **No migration.** `git diff --name-only origin/main...HEAD` lists no path under
  `supabase/migrations/`, and `/api/health` reports `ledger_version` still `0068` after the merge.
- **D7, the existing next-step field is untouched.** No changed file names
  `public.clients.next_action_at`, `public.clients.next_action`,
  `public.search_clients_next_action` or `hasClientNextAction`; `0058_client_next_action.sql` is not
  in the diff; `app/(app)/azi/page.tsx`, `lib/data/azi.ts` and `components/clients/AziScreen.tsx` were
  not touched. Azi gaining a tasks section is card P3-133.
- **`Anulată` is a status and never a deletion**, and no delete control exists anywhere on the screen.
- **P2-01**: English tokens stored, Romanian labels with diacritics rendered, both directions proved.
- **No em dash and no en dash** in any changed file, including the board JSON, the commit messages and
  the pull request body.
- **The `lead=` grep trap**: nothing was renamed or swept on the word `lead`. The word appears in this
  card only as the Romanian-free token `client`, as `PageHeader`'s existing `lead` prop on the two
  pages this card edits, and in prose.
- **Off limits**: no file under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*`
  or `docs/contracts/extraction*` was touched, so there is nothing to tell Andre.
- **No production access**: nothing beyond the public `/api/health` endpoint was read, no production
  row was read, no credential was sourced, and only environment variable names appear in this work.
- **No real client data was seen.** Every row this card's tests write is `TEST` prefixed and lands on
  the local stack in CI.
- **The known defects of handoff Part 6 and the board hygiene of Part 7** were not touched.

---

## Learnings

Two appended to `docs/LEARNINGS.md`:

1. **Three buckets that group a list hide every row that falls in none of them.** A grouping is a
   partition or it is a filter, and a filter that calls itself a grouping loses rows. This is what
   widened decision C.
2. **A "no delete control" assertion over a table row counts the record link too.** The exact-set
   assertion for acceptance (f) would have gone red in CI on correct code, because clause 2 requires
   the linked record to be a link and a link is a control. Read what each primitive renders before
   asserting a set.

One signature appended to the factory's `KNOWN-FAILURES.md`:

3. **Appending a long block to a file with a heredoc is refused before it runs.** `cat >> file <<'EOF'`
   is rejected with "Contains brace with quote character". Use the Edit tool to append, in chunks if
   the block is large. The wider rule: the write tools are not subject to the shell gate, so anything
   that is "produce this text in this file" belongs to Write or Edit.

---

## Left for the owner

Nothing is blocked and nothing needs a decision. Two things worth knowing:

- **The group order is a judgment call.** I draw `Restante` first because clause 5 says an overdue job
  is why somebody opens the screen and the Azi screen already orders that way. Ivan's clause lists
  the buckets as "Azi, Aceasta saptamana, Restante". If he wants that literal order on screen, it is
  one line.
- **A job created from the Sarcini tab can be attached to a customer or a site, but not to a closed
  site**, because the project chooser reuses the existing list that hides closed sites. Attaching from
  a site's own page is card P3-132.
