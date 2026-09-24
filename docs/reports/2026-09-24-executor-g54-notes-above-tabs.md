# Executor report, 2026-09-24, card P3-99, goal G54

Role: **AUTHOR**, then **EXECUTOR**, in one pull request.
Branch `card/p3-99`, cut from `origin/main` at `2e3d6ff`.
Worktree `/Users/sm33xy/Projects/rc-inventory-worktrees/g54-notes-above-tabs`.

---

## What changed for Rapid Construct

The box for writing down what was discussed on a call, and the list of past notes, now sit on the
client's own page in plain view, just under the identification details, instead of being hidden
inside the fifth and last tab. Writing down a call is one action rather than scrolling past the
whole detail card and then hunting for the right tab.

Leads and clients share one page, so this puts it right for both at once. Any link somebody already
sent around that pointed at the old tab still opens the page normally instead of showing an error.

Nothing else on the page moved, nothing was removed from what the notes panel does, and no change
reaches the database.

---

## Boot, per repo CLAUDE.md section 1

Role stated: AUTHOR, then EXECUTOR. Both boards read, phase 2 and phase 3, because the next eligible
cards sit on phase 3 (known defect RULE-05).

**`docs/board/rc-board-phase2.json`**, `as_of` 2026-09-12T22:55:06Z: 102 cards, 68 `shipped`,
32 `todo`, 2 `blocked`, 0 `in_flight`, 0 `halted`. Launch gate 0/0 conditions on this board.
Next eligible card: `AUT-3`, "Add the TRIAGE role to the POC chain".

**`docs/board/rc-board-phase3.json`**, `as_of` 2026-09-24T17:51:40Z at boot: 147 cards, 114
`shipped`, 32 `todo`, 1 `blocked`, 0 `in_flight`, 0 `halted`. Launch gate 0/0 conditions carried on
this board object. Next eligible card: `P3-14`, "Retur de materiale".

The card worked here is neither of those. It is authored new, from the operator factory's task for
goal G54, which is the platform owner's own instruction and outranks the board pick for this
terminal's queue.

Read in full before any edit: repo `CLAUDE.md` sections 1, 2, 3, 3.1, 5b, 6, 8.0, 8b, 9, 9b, 10 and
11; the factory's `KNOWN-FAILURES.md`; finding B2 of `docs/reports/2026-09-22-critic-bug-sweep.md`;
`components/clients/ClientDetailScreen.tsx`, `components/clients/ClientTabs.tsx`,
`components/clients/ClientNotesPanel.tsx`, `components/clients/ClientNoteForm.tsx`,
`components/ui/phone.ts`, the relevant part of `components/ui/primitives.tsx`,
`app/(app)/clienti/[id]/page.tsx`, and the two named specs `tests/e2e/client-detail.spec.ts` and
`tests/e2e/client-notes.spec.ts`.

Id allocated as AUTHOR before anything else: `npm run id:free -- P3-99` answered **FREE**, lane
highest `P3-98`, zero open pull requests read from the GitHub API, two board sources read and zero
refused.

---

## The finding, and what it asked for

Finding **B2** of the 2026-09-22 critic sweep, confirmed there and quoted in the task:

> `ClientDetailScreen` renders the whole "Date de identificare" card first, sixteen label and value
> rows plus the header and the Dezactiveaza button, and only then, in a `div` with `mt-5`, the tab
> strip. `TABS` lists Note fifth and last, and the default tab when no `?fila=` is present is
> `contacte`. So reaching the box to write what was discussed costs one scroll past the
> identification card and one click on the fifth tab. Inside the tab the layout is right:
> `ClientNotesPanel` puts the form above the history, which is what its own header comment promises.

Goal G54, the owner's words: *"B2, notes at the top. On the lead and client page the 'Ce s-a
discutat' box and the timeline move above the tabs, so nobody has to find the Note tab."*

**One screen serves both, and nothing is built twice.** A lead is a client row with a stage. There
is no leads table and no second detail route: `app/(app)/clienti/[id]/page.tsx` is the only client
detail page, and `ClientDetailScreen` is the only screen it renders. Fixing that one screen fixes
the lead page and the client page together. The acceptance still opens one of each, because the
claim is worth proving rather than asserting.

---

## What was built

### 1. The panel moved, unchanged, onto the page

`components/clients/ClientDetailScreen.tsx` renders `ClientNotesPanel` in a `div` carrying
`className="mt-5"` and `data-testid="client-notes"`, placed **between** the "Date de identificare"
card and the `div` that holds `ClientTabs`. It receives exactly the five props it received inside
the tab: `clientId`, `timeline`, `stage`, `nextActionAvailable`, `canWrite`.

**Above the tab strip, below the identification card.** That is what the goal's words say, and the
task is explicit that moving it above the identification card would be a decision this card is not
authorised to take. The acceptance measures both edges, so the placement is pinned from both sides:
a later drift in either direction fails a case rather than passing quietly.

### 2. The Note tab removed

`components/clients/ClientTabs.tsx` loses the `{ id: "note", label: "Note" }` entry from `TABS`, the
`active === "note"` render branch, the `ClientNotesPanel` import and the
`import type { ClientStage, ClientTimelineEntry }` line that only that branch needed.

**The three props go with it.** `timeline`, `stage` and `nextActionAvailable` were read inside
`ClientTabs` by the Note branch and by nothing else. That was checked by reading every use in the
file rather than inferred from the import list. All three leave the component's signature and leave
the call site in `ClientDetailScreen`, which now passes them to the panel instead.

**The tab was removed rather than left beside the panel.** Leaving it would render the same panel
twice on one page: two copies of a form that writes the same row, and two elements carrying
`data-testid="timeline"`, which breaks every locator in the spec and invites the operator to save a
note in the copy nobody is looking at.

### 3. Old links still resolve

`/clienti/<id>?fila=note` was a real, sendable address for as long as Note was the fifth tab.
`ClientTabs` already documents the behaviour at the `active` line: *"O fila necunoscuta din URL
revine la prima, nu da eroare"*, so with `note` gone the address simply becomes an unknown `fila`
and lands on Contacte. **No redirect was added.** A redirect would rewrite the address in somebody's
history for no gain: the panel they were looking for is on the page they land on, above the strip.

That behaviour is correct by construction rather than by repair, which is exactly why it now carries
a case of its own. The case registers a `pageerror` listener as well, because a blank panel region
and a thrown error look alike in a screenshot.

### 4. What was deliberately NOT touched

- **`ClientNotesPanel`'s insides.** The sweep is explicit that the layout inside the tab was already
  right, form above history. Its Romanian strings, its "Nicio nota" empty state, its
  `data-testid="timeline"` list and the stage entries mixed into the same timeline are moved and not
  rewritten. The only edit to that file is its header comment, which said "Fila Note de pe fisa
  clientului" and would otherwise have become a false statement about where the panel lives; the old
  placement is recorded there rather than erased.
- **The other four tabs**, their order, their `contacte` default and every `data-testid` on them.
- **Saving a note**: the same server action, the same "may also set the next step in the same form,
  one save" behaviour from G44, the same author and date rendering.
- **`components/projects/ProjectTabs.tsx`** and the project page.
- **`components/ui/phone.ts`.** The moved panel needs no class those constants do not already
  export, and no local copy of one was written. That file is absent from the diff, which is the
  proof of acceptance clause (h). Cleaning up the phone class copies that already exist is goal G56,
  deliberately ordered after this card.

---

## The specs

**Nothing was deleted, skipped or weakened to make a run green.** Three cases were added; none was
removed.

### `tests/e2e/client-detail.spec.ts`

- `TABS` drops `note`, so the strip loop, the empty state map and the URL assertions cover four.
- The reload and back-button assertions follow the new last tab: the loop now ends on Documente, so
  the reload expects `panel-documente` and the back button expects `panel-consum`. They prove the
  same two things they proved before, that the active tab lives in the URL and survives both.
- The tab case additionally asserts `tab-note` has count 0.
- The empty client case keeps every one of its assertions and gains one: the "Nicio nota" empty
  state, which used to be asserted on `panel-note`, is asserted on `client-notes` in its new place.
  The behaviour is not lost with the tab.
- **New case**, `o legatura veche cu fila Note deschide pagina pe Contacte, fara eroare`.

### `tests/e2e/client-notes.spec.ts`

- `openNotes` navigates to `/clienti/<id>` with **no** `fila` parameter and waits for
  `client-notes`. Every existing case therefore now exercises the new position, and each one asserts
  exactly what it asserted before: a note stored once with the right author, first in the list with
  today's Chisinau date; a stage move in the same list in a lighter colour; a note and a next step in
  one save reaching both columns and showing on the sheet without a reload; an empty note refused in
  Romanian and refused again directly by the database constraint; the account manager seeing the
  history without the form while the database refuses their note with 403 and refuses every edit and
  delete; and the 390px case that the form and the list stack.
- **New case**, `P3-99: pe pagina leadului si pe a clientului, casuta si istoria se vad fara nicio
  fila, deasupra benzii`. It opens a lead (stage `nurture`) and a client (stage `client`), clicks no
  tab at all, and compares bounding boxes the way the phone specs do: the whole notes panel, the
  form and the timeline all end above the top edge of `client-tabs` and all begin below the bottom
  edge of `client-detail`, with the form still above the timeline inside the panel. If the panel were
  still in the fifth tab, every assertion in it would fail.
- **New case**, `P3-99: pe telefon, la 390x844, pagina leadului nu deruleaza lateral si casuta se
  poate atinge`. It reads the page in one pass, in the style of `readPhone` in
  `phone-forms.spec.ts`: the document, `<main>` and the notes panel each have
  `scrollWidth <= clientWidth`; every input, select, textarea, button and visible link inside the
  panel is at least 44px tall; every input, select and textarea inside it renders at least 16px; and
  then a note is actually typed and saved from that position and read back out of the timeline. The
  overflow assertion carries the list of elements that pass the panel's content edge in its own
  message, which is the P3-97 lesson in `KNOWN-FAILURES.md`: a pair of numbers alone sends the next
  reader back to the start of the investigation.

### `tests/e2e/client-project-tabs.spec.ts`

Not named by the task, and it had to move. It keeps its own hand written copy of the client tab list
and clicks every entry to measure contrast, so a tab removed in the component fails a file that has
nothing to do with this card. Its list drops `note`; nothing else in the file changes. It was found
by grepping for the component and panel NAMES and for the `tab-` and `panel-` test id prefixes, not
only for the three strings the task named, none of which appear in it. That is one of the learnings
below.

`npx playwright test --list` collects **420 tests in 59 files**, three more than before this branch.

---

## Commands run locally, each alone, each exit 0

Per repo CLAUDE.md section 6: each command run on its own line, no pipe, exit code read from that
command and nothing else.

    npx tsc --noEmit
    npm run build
    node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
    npm run check:card-ids
    npm run check:board-edit
    npm run check:board-clock
    npm run check:unique-ids
    npm run check:open-branch-ids
    npm run check:no-destructive-migration
    npm run check:conflict-residue      (run AFTER git add, per KNOWN-FAILURES)
    npm run check:categories
    npm run check:ledger-rows
    npm run check:no-prod-target
    npm run check:pending-schema-reads
    npm run check:removal-safety
    npm run check:assertion-register
    npx playwright test --list

**The end to end suite runs only in CI.** This machine has no Docker and no Supabase CLI, so the
Playwright suite, the migration apply against a bare postgres and the applier proofs are left to the
`quality` workflow, as every card from this terminal records.

---

## Migrations

**None.** No file under `supabase/migrations/` is added, changed or removed by this pull request.
The card changes where a panel is rendered. `Refuse a migration that removes rows` therefore parses
zero files and passes, and both applier proof steps are correctly skipped by `applier_scope`.

---

## Defects met while working the card

Two, both caught before CI rather than by it, and both appended to `docs/LEARNINGS.md`:

1. **A tab list lives in the component and in a second spec that names the same tabs.**
   `tests/e2e/client-project-tabs.spec.ts` holds its own copy of the client tab list and contains
   none of the three strings the task named. The rule taken from it: before removing an entry from a
   list a component renders by iteration, grep for the component's own name and for the test id
   prefix, not only for the entry being removed.
2. **Moving a panel out of a tab is not finished until the old tab address is proved.**
   `?fila=note` was correct by construction, not by repair, and no existing case asked for it. The
   rule taken from it: when a URL addressable surface is removed, the acceptance names the dead URL
   and asserts what it does now.

No fix attempt failed. The section 10 ceiling was not approached.

---

## Coordination

Ivan's ORANGE terminal works this repository too. `git fetch origin` then `git merge origin/main`
was run before every push. At the time of the first push there were zero open pull requests and
`origin/main` was at `2e3d6ff`. No board conflict arose; had one arisen, both sides would have been
kept, never one picked.

No file under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*` or
`docs/contracts/extraction*` is touched.

---

## Merge

**This terminal never runs `gh pr merge`.** Real client data has been in production since
2026-09-14, so the close-out block's step 8 revokes the section 3.1 grant on every path, whatever
the pull request touches. The task instructs that the owner's auto-merger lands the branch once
`quality` is green.

The pull request is opened as a **DRAFT** and marked ready only once the board flip and this report
are on the head. That is the P3-97 lesson in `KNOWN-FAILURES.md`: the auto-merger merges on the
first green, so a task that needs the session to act after green must not present it a mergeable
pull request before the work is actually finished.

---

## Anything left for the owner

Nothing blocking. Two notes:

- **Goal G56** (the phone class duplication clean-up) is untouched here on purpose, per the task and
  per the answer recorded in `mailbox/answers/q079-phone-class-drift-goal-not-in-goals-md.md`.
- The Azi screen's one click route to the same form (`AziScreen.tsx`) is unchanged. It was always
  the fast path for the common case; this card fixes the other common case, writing the note from
  the lead's own page.
