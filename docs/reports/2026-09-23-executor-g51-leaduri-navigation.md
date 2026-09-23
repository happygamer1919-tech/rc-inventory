# EXECUTOR, 2026-09-23. G51: Leaduri navigation keeps the view and the search box in step

**Role:** AUTHOR, then EXECUTOR, in one pull request, on branch `card/p3-96`.
**Card:** P3-96, authored here, `todo` never existed for it: it went straight to `in_flight` in the
first commit and to `shipped` in the last one, both on this branch.
**Source:** the operator factory's goal G51, which quotes the platform owner: *"F6 + F7, Leaduri
navigation. 'Șterge filtrele' keeps the Leaduri view; browser Back keeps the search box in step
with the list."* Both findings come from `docs/reports/2026-09-22-critic-bug-sweep.md`.

## What changes for Rapid Construct

Two things on the clients list, in plain words.

Pressing **Șterge filtrele** on the Leaduri list now clears the filters it names and leaves you on
the Leaduri list. Before this, it threw you onto a different list: the heading changed from Leaduri
to Clienți, the subtitle changed, the main button changed from Lead nou to Client nou, and the
table went from six columns to five. The operator had asked to remove a stage filter, not to change
screens.

And the **search box now always shows what the list is actually filtered by**. Before this, typing
a name and then pressing the browser's Back button left the typed name sitting in the box while the
list below it went back to showing everybody, with no control on screen to explain the mismatch.

## The two findings, as read from the code

Both live in `components/clients/ClientsScreen.tsx`, twelve lines apart, and both break the same
sentence of that file's own header comment, written when the screen was built: *"FIECARE FILTRU
ESTE IN URL, deci o lista filtrata se poate trimite cuiva ca legatura si butonul de inapoi o reface
intocmai."*

**F6.** The `push(patch)` helper reads the current query string, applies only the keys named in the
patch and navigates, so every parameter NOT named survives. Every other control on the screen uses
it: the stage chips push `{ vedere, etapa, pagina }`, the selects push `{ tip }` or `{ stare }`, the
pagination pushes `{ pagina }`. Șterge filtrele alone did `onClick={() => router.push(pathname)}`, a
bare navigation to `/clienti` with no query string at all, which drops `vedere` with everything
else. `filtered` is computed from the search text, the type, the status and the stage, and
deliberately not from the view, so on the Leaduri view the button appears as soon as a stage chip or
the search box is used, and pressing it landed the operator on the "Toți" view.

**F7.** The search box is `React.useState(query.q)`, seeded once, and synced ONE WAY: a 300ms
debounced effect keyed on `[q]` pushes local state to the URL, and nothing pushed the URL back to
local state. `app/(app)/clienti/page.tsx` renders `<ClientsScreen ...>` with no `key`, so the
component instance is never remounted across a navigation and its local `q` survives whatever
`query.q` becomes. After typing a term (`router.push`, so a new history entry) and pressing Back,
the URL's `q` reverts, the server re-renders, the list follows correctly, and the box does not.
`filtered` reads the URL, so Șterge filtrele vanished at that same moment, which was the one visible
tell that something was out of step.

## The fixes

**F6, one control brought into line with every other one.** The handler now goes through the same
`push()` helper, patching exactly the fields `filtered` reads, plus the page:

    push({ q: "", tip: "", stare: "active", etapa: "", pagina: "1" })

`vedere` is deliberately absent from that patch, so it survives, which is the whole fix. `stare`
returns to `"active"` and not to the empty string, because `filtered`'s own definition of "not
filtered" for that field is `query.status !== "active"`, and the empty string is not one of that
field's values (`parseClientQuery` in `lib/data/clients.ts` maps anything that is not `inactive` or
`toate` to `active`, so `stare=active` in the URL and no `stare` at all mean the same thing).

**F7, the screen learns to tell its own pushes from an outside change.** The pattern is already in
this codebase, in `components/ui/DateField.tsx`, as the `seen` ref, and its comment says exactly why
it exists: *"Cand valoarea vine din afara ... scrisul din camp o urmeaza. Cand ea vine chiar din
scrisul de aici, nu se atinge, altfel o data pe jumatate tastata ar fi stearsa la fiecare tasta."*
Adapted here, during render, in the same inline style:

    const urlQ = React.useRef(query.q);
    const sent = React.useRef<string[]>([]);
    if (urlQ.current !== query.q) {
      urlQ.current = query.q;
      const mine = sent.current.indexOf(query.q);
      if (mine >= 0) sent.current = sent.current.slice(mine + 1);
      else { sent.current = []; if (q !== query.q) setQ(query.q); }
    }

**WHY A LIST AND NOT A SINGLE VALUE, WHICH IS THE ONE PLACE THIS IS MORE THAN A COPY OF
DateField.** DateField reads a prop its parent sets synchronously; this screen reads a value that
comes back from a server round trip, and those can land out of order. With a 300ms debounce and a
page that queries the database, the render for "abc" can arrive AFTER the screen has already sent
"abcd". One remembered value would read that late render as an outside change and resynchronise the
box backwards, eating the last keystrokes, which is precisely the failure the mechanism exists to
prevent. Finding a sent value discards everything sent before it, so the list cannot grow when an
intermediate render is superseded and never arrives. This is the entry appended to
`docs/LEARNINGS.md` for this card.

**WHERE THE TWO FINDINGS MEET, AND IT IS NOT OPTIONAL.** The clear button also calls `setQ("")`
directly, and the task asked for this to be proved rather than assumed. It is needed, and the case
is concrete: with a stage chip applied, the button is visible while typed text has NOT yet reached
the URL. In that state the URL's `q` does not change when the button is pressed, so the
resynchronisation above cannot fire, the box would keep the stale term, and the pending 300ms
debounce would have pushed the term straight back 300ms after the filters were cleared. Both halves
go through a small `pushQ` helper, so the cleared value is recorded as one the screen sent, which is
what stops a redundant second navigation from the pending debounce.

## Options considered and rejected

- **Resynchronising the box on every render where it differs from the URL.** This is the failure
  `DateField`'s comment warns about; it fights the operator mid-debounce. The third test case exists
  to keep it rejected.
- **Listening to `popstate` only.** Covers Back and Forward, misses a received link and a
  client-side navigation to the same route, which is the same defect through a different door.
- **Giving `<ClientsScreen>` a `key` in `page.tsx` so it remounts on every navigation.** Throws away
  the two creation dialogs' state and re-runs every effect on a page of filters, to fix one input.

## The tests, and which file each went to

Three new cases, all named starting `G51:`.

- **F6**, in `tests/e2e/leaduri.spec.ts`: `G51: Șterge filtrele pe vederea Leaduri șterge exact
  filtrele și rămâne în Leaduri`. It went here because what it proves is that the Leaduri VIEW
  survives the button, and everything that describes that view is read with this file's own helpers:
  `topbarTitle`, `pageHeader`, `listUrl`, `createFixture`, `rowIds`, `sorted`. It applies a search
  term and a stage chip, presses the button, and asserts `vedere=leaduri` is still in the URL, the
  `view-leaduri` chip still reads `aria-pressed=true`, the top bar still says Leaduri, `leaduri-new`
  still reads Lead nou, `etapa`, `q` and `tip` are gone, `stage-chip-all` is pressed, the
  `clients-search` box reads empty ON SCREEN, `clients-clear` is gone, and none of that changes
  700ms later.
- **F7**, in `tests/e2e/clients.spec.ts`: `G51: butonul înapoi aduce căsuța de căutare la termenul
  din URL`. It went here because the defect is this screen's search box in both views, and
  `createClient` and `clientName` are already in this file, beside P3-06's own continuity case.
- **The regression guard**, in `tests/e2e/clients.spec.ts`: `G51: scrisul normal ajunge întreg în
  URL, fără resincronizare care fură taste`.

**THE F7 CASE IS NOT THE ONE THAT ALREADY EXISTS, AND THE TASK WAS RIGHT TO SAY SO.**
`clients.spec.ts`'s "un clic pe rând deschide fișa, iar butonul înapoi întoarce la listă cu căutarea
intactă" drives list to detail to Back AT THE SAME `q` the list already had: it proves that an
UNCHANGED value survives a navigation. F7 is the return to a DIFFERENT, earlier value, which nothing
covered. The new case also checks Forward, because the URL is the truth in both directions.

**WHAT THE GUARD CAN AND CANNOT PROVE, said plainly.** It types letter by letter with 60ms between
keys, so every pause is under the 300ms debounce, and asserts that both the URL's `q` and the
visible box carry the FULL typed value, twice in a row, never a truncated one. That is the case the
task specified and it is the case a wrong resynchronisation breaks. It does NOT force the
out-of-order render described above: that needs a server render to land after a later push was
issued, which a test cannot schedule deterministically. That half is handled by design, by the list
of sent values, and is argued in the card's `defaults` rather than asserted by a spec.

## Every spec the change could affect, and its state

`git grep -n "clients-clear\|clients-search\|Șterge filtrele" tests/e2e` names four files, and all
four are unchanged by this card. **Not one existing assertion was edited, weakened, skipped or
deleted.**

| spec | why it could be affected | state |
|---|---|---|
| `tests/e2e/clients.spec.ts` | fills `clients-search` in four existing cases and asserts `toHaveValue(name)` after `goBack` in a fifth | unchanged, two cases appended |
| `tests/e2e/leaduri.spec.ts` | fills `clients-search` twice and combines it with a stage chip | unchanged, one case appended |
| `tests/e2e/list-filters-layout.spec.ts` | asserts `clients-clear` is absent with no filter and present with one, and that it does not push the selects onto a second row | unchanged, and the button's markup, variant and text are untouched: only its `onClick` changed |
| `tests/e2e/crm-landing.spec.ts` | navigates to `/clienti?vedere=leaduri` and reads the Leaduri heading | unchanged, and this card makes that heading MORE stable, not less |

The one existing assertion worth naming because it looks like it should break and does not:
`clients.spec.ts:199`, `await expect(page.getByTestId("clients-search")).toHaveValue(name)` after
`page.goBack()`. There the previous history entry carries the SAME `q` the list had, so the
resynchronisation finds `query.q` unchanged and never fires. The box keeps the term, which is what
that case asserts.

## Commands run locally, each exit 0

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
    npx playwright test --list

`check:board-edit` refused on its first run, correctly and by design: it had `P3-96` at
`in_flight`, which is not a terminal status, and it passes only once the card is flipped to
`shipped` in this same branch. That is recorded here rather than hidden, because a reader seeing one
red run in the scrollback should know which one it was and why.

`npx playwright test --list` collects **398 tests in 57 files**, three more than the 395 on `main`,
which is the three cases above and no accidental duplication.

## What is left for CI, and why

**The end to end suite itself.** This machine has no Docker and no Supabase CLI, so the Playwright
run, the local Supabase stack, the migration apply against a bare postgres and the applier proofs
exist only in CI. `npm run check:migrations`, `npm run prove:applier` and `npm run prove:assertions`
were therefore NOT run here and are not claimed. The applier proofs will also SKIP in CI, correctly:
this diff touches none of `scripts/apply-pending-migrations.*`, `supabase/migrations/**` or
`scripts/poc-free/local-db/**`, so `applier_scope` sets `run=false`. This is not a
documentation-only pull request, so `docs_scope` sets `docs_only=false` and `Build`, the migration
apply and the whole End to end block all RUN.

**There is no lint step** in `.github/workflows/quality.yml` and no `lint` script in
`package.json`, so "lint" in the task's local list has nothing to run. Said here rather than left
as a silent gap.

## What this card did not touch

No migration, no file under `supabase/migrations/`, no schema read, and no production database
access of any kind: this is a client-side navigation fix. The 300ms debounce and the
search-as-you-type feel are unchanged. `filtered`'s definition is unchanged. Every other control's
URL patching is unchanged. `PageHeader`'s `lead` prop
(`components/ui/primitives.tsx:259-270`, the `lead=` grep trap) is untouched, and no grep or sweep
on the word lead was run. The known defects in the handoff's Part 6 and the board hygiene in Part 7
are not fixed here. Nothing under `app/api/extraction/**`, `app/api/documents/**`,
`lib/data/extraction*` or `docs/contracts/extraction*` is touched.

## Coordination with Ivan's terminals

`gh pr list --state open` returned nothing at the start of the run, and `gh pr list --state open
--author @me` nothing before `gh pr create`. The branch was cut from `origin/main` explicitly
(`77ff4dc`) after `git fetch origin`, in a worktree at
`/Users/sm33xy/Projects/rc-inventory-worktrees/g51-leaduri-navigation`, never in the primary
checkout. `git fetch origin` and `git merge origin/main` before the push. No rebase, no force push,
no push to `main`. There was no board conflict to resolve; had there been one, both sides would have
been kept.

## Red CI, three runs, two of them mine and one not

**Run 35893179067 failed in 1m39s** at "Refuse a board timestamp from the future", with
`card P3-96.last_checkpoint = 2026-09-23T17:20:00Z, 16 minute(s) ahead` and the same line for
`evidence.at`. Every later step, End to end included, was skipped. The cause was mine and it was a
ROUNDED time typed into the board edit while the commit that carried it was made at `17:03:35Z`. The
signature is in the factory's `KNOWN-FAILURES.md` ("A board time ahead of its commit") and in
`docs/LEARNINGS.md` three times over.

Repaired by re-reading `date -u +%Y-%m-%dT%H:%M:%SZ` and committing the board immediately after,
then running `npm run check:board-clock` locally before the push, which is the step that would have
caught it. That check is NOT in the close-out block's list of local gates, which is why a terminal
that runs that list in full still misses it, and that is the part appended to `docs/LEARNINGS.md`
rather than a fourth copy of the lesson itself. **No test was weakened, skipped or deleted to make
this pass, and nothing about the application code changed in the repair.**

**Run 35893527451 then went 34m58s and failed on ONE case, my own F6 case, with 397 of 398
passed.** The failure was `expect(params.get("etapa")).toBeNull()` receiving `"nurture"`, and it was
a hole in the TEST, not in the fix. The case pressed the button and then waited on
`vedere === "leaduri"`, which was ALREADY true before the click, so the poll returned immediately,
before the button's navigation had landed, and the next line read the URL from before it. The
repair waits on what CHANGES, `etapa` and `q` becoming absent, and only then reads `vedere`, `tip`
and the rest. **Again nothing about the application code changed, and no assertion was removed or
loosened: the case now asserts strictly more than it did, because the two polls are themselves
assertions.** That the other 397 cases passed, the F7 case and the typing guard among them, is what
says the product side of this card was already right.

**Run 35897784133 (sha `373f6ec`) then failed three times without reaching a single test**, at
`Launch database, auth and storage`, with `toomanyrequests: retry-after: ...` on the container
image pull for the local Supabase stack, once on the push and once on each of the two
`gh run rerun --failed` the close-out block allows, the second after a nine-minute wait. **Run
35900378422 (sha `862273c`) then failed the same way a fourth time**, 3m17s, and that one named the
image: `ghcr.io/supabase/storage-api:v1.70.3`. So the registry is **ghcr.io**, not Docker Hub, which
is worth writing down because the first three logs did not say which registry and guessing Docker
Hub would have sent the next reader to the wrong place.

**That is infrastructure and not this diff:** the step pulls images before any code of ours runs, and
nothing in this pull request touches the workflow, the stack, the images or anything under
`scripts/poc-free/local-db/`. It is a new signature and is appended to the factory's
`KNOWN-FAILURES.md`.

The two reruns are spent. What the branch needs is one `quality` run that gets past that pull; the
branch itself needs no change, which is why this is not a fourth attempt at fixing anything.

## Defects found

Three entries appended to `docs/LEARNINGS.md`: *"A URL-as-truth input needs to know which of its own
pushes has landed, not just the last one"*, which is the trap this card's own fix walked up to,
*"The board clock rule is written down three times and was still paid for a fourth"*, which is the
first red run above, and *"A poll on a value that is already correct is not a wait"*, which is the
second one and is the more interesting of the two: the shape is most tempting precisely on a card
about something being PRESERVED. Nothing else broke: the typecheck, the build and every runnable check passed on their
first run, and the only other red was `check:board-edit` before the card flip, which is that check
working exactly as written.

## State at the end

**P3-96 is `blocked` on `infra`, not `shipped`, and that is the honest state.** Every line of the
card is written, committed and pushed; what is missing is a `quality` run that can start. CLAUDE.md
section 6 is explicit: no acceptance, no ship, and a card whose acceptance cannot be run yet is
`blocked`, never `shipped`. The card was briefly `shipped` on this branch, which is how the work was
pushed, and flipping it back rather than leaving it is the point: an `evidence` field asserting a
green run that four jobs could not start would be the one failure this project says it has no
recovery path for.

The card's `evidence` is kept and names **what each run actually proved**, and its `question` carries
the structured decision-needed text with a recommendation: rerun `quality` on #356's head sha once
the registry's window clears. **The flip back to `shipped` is one commit** with that run id.

Pull request **#356** is open, with all the work in it, and it is **not green**. It is not merged, and
the reason is stated plainly rather than guessed at: `quality` has never concluded successfully on
this branch's head, and no merge condition in section 5b is met. No self-merge was available anyway:
real client data has been in production since 2026-09-14. **No self-merge:** real client data has been in production since 2026-09-14, so the
close-out block's step 8 revokes the section 3.1 grant on every path, whatever the pull request
touches. The merge-approval question is in the factory's mailbox for the owner.

The next goal in the sweep-fix batch after this one is whatever `GOALS.md` lists below G51.
