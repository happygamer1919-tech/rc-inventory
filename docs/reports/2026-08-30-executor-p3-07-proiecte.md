# EXECUTOR: P3-07, Proiecte. A debt paid, and an ordering defect production would have hidden for months.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-07-proiecte`, cut from `origin/main` at `f0a99c1`
**Card:** P3-07
**Migration files added:** `supabase/migrations/0021_projects_search_and_status.sql`

---

## 0. Boot

Phase 3 board read at `f0a99c1`. **P3-07** is the lowest-id eligible card,
`depends_on [P3-03]`, shipped. Claimed as `executor` through PR #115 before the
work began.

---

## 1. This card pays a debt P3-03 wrote onto it

P3-03 created `public.projects` and added `project` to `public.status_entity` so
a status change could be recorded, and then **deliberately did not write those
rows**: writing them is a screen concern and P3-03 was a schema card. It wrote
the requirement onto this card instead, with the function to copy and the
warning to carry.

`public.set_project_status` is the third writer of its shape, after
`set_inbound_status` in 0003 and `set_outbound_status` in 0004: **the status
change and its history row in one transaction**, SECURITY INVOKER so RLS still
applies.

**Nothing at the database forces the screen to use it**, which is true of the
other two as well and is why 0001's comment on `status_history` says a status
that changes without a row there is a defect the acceptance lines **check for**.
This card does the same: `projects.spec` asserts the history row exists after a
change rather than assuming the function is the only path.

**And there is only one path, by construction.** `updateProjectRecord` strips
`status` out of its write set, and the form has no status field when editing. A
status field there would be a **second** route to `projects.status`, and the
second route is the one that forgets the history row.

---

## 2. The fixture found an ordering defect production would have hidden

```
ERROR:  P3-07: the newest history entry is active, expected the last move to lead
```

`public.status_history.created_at` defaults to `now()`, and **`now()` returns the
transaction start time, not the current instant.** The fixture moves one project
through five statuses inside a single block, so all five rows landed with the
identical timestamp, the reader fell through to its tiebreaker, and **the
tiebreaker is a random uuid**. The "newest" entry was whichever uuid sorted
highest.

`set_project_status` now writes `created_at = clock_timestamp()` explicitly:
the actual instant, microsecond resolution, and the more truthful value for a row
whose whole job is to record when something happened. The 0003 and 0004 writers
keep the default, because each writes exactly one history row per call and cannot
produce the collision, and editing an applied migration is forbidden anyway.

**In production each change is its own transaction and this never appears.** It
appeared immediately in a fixture that does five things at once, which is the
argument for writing fixtures that way: **a fixture with one action per
transaction is more realistic and proves less.** The collision exists exactly
when two rows are appended together, which is the case a real system reaches
under load rather than never.

---

## 3. Two decisions the card did not make

**The status filter takes an array, not a value.** The default is **four of the
six** stages, because a list that opens showing every closed job from two years
ago is the exact failure the density doctrine exists to stop. A single-value
filter cannot express "the live ones", so the signature is
`p_statuses text[]`.

**The search box matches name and address and deliberately not the client name.**
Folding the client in would make a project called "Client Unu" indistinguishable
from every project **of** Client Unu, and the client filter is a separate
control. The assertion checks it, so nobody adds it later as an improvement.

Two smaller ones, both in the writer:

- **It returns the previous status**, so the caller need not read it first. Read
  then write is a race: two people moving the same project would record a history
  that lies about the order.
- **Setting the same status writes nothing and is not an error.** A double click
  on a dropdown is not an event, and a history full of `contract -> contract` is
  a history nobody reads.

---

## 4. What the two proofs each cover

**The spec proves the screen.** Six cases: creation requires a client and
persists with the client name **joined**; an empty budget renders as "Fără
buget" and not as zero; a planned end before the start is refused in Romanian; a
status change writes history, survives a reload, and **walks backwards** through
suspended and back to lead with all three moves recorded; the status and client
filters narrow and the back button keeps them; and search matches name and
address without diacritics.

**The assertions prove the query and the writer**, including four things a
browser cannot see: that a **deactivated** project never appears under any
filter; that the search box does **not** match a client name; that the history
reader does not pick up **another entity kind** from the polymorphic table; and
that setting the same status twice leaves the history at one row.

**That polymorphic assertion is the one worth keeping.** `status_history` is
shared across entity kinds, and a reader that forgot `entity_type` would work
perfectly until the day a project id and an outbound issue id collide in it. The
fixture inserts exactly that collision.

---

## 4b. The check that turned red, and the two defects behind it

The first push failed one Playwright case:

```
✘ projects.spec.ts:131 > schimbarea stării scrie un rând de istoric, iar fișa îl arată
  Error: expect(locator).toHaveCount(expected) failed
  Expected: 3
  Received: 2
```

Run `33342093533`. **The failing assertion was the row count at the end. The
defective assertions were the three that passed.**

**The panel contains a `<select>`, so containment proved nothing.** The status
panel holds the chip AND a select whose options are all six status labels, so
`expect(panel).toContainText("Contract")` **was already true before the click**.
The spec never waited for a change to land, the three status changes raced each
other and `router.refresh()`, and one of them was lost. The chip now has its own
`data-testid` and the spec asserts `toHaveText` on it: exact rather than
contained, and scoped to the one element that renders the state.

**And the change handler guarded on a stale prop.** It read
`if (next === project.status) return`, and `project.status` is a prop that holds
the OLD value between the write and the refresh, so a second change inside that
window was silently dropped. The guard is gone. `set_project_status` already
returns `changed=false` for a no-op, so the rule lives in one place instead of
two, and the one place is the one that cannot be stale.

**Both are now LEARNINGS entries**, because both are general: a containment
assertion on a container that includes a control asserts about the control's
options, and a write guarded on the prop it is about to change rejects exactly
the second action a user takes in a hurry.

That is one failed attempt on this card, of the three the failure ceiling allows.

---

## 5. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, `/proiecte` and `/proiecte/[id]` present |
| `npm run check:migrations` | exit 0, 21 files, 7 assertion files passed |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 21 files, 9 pending, each in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 6. Production writes

**None.** One new pending line, no apply entry, no row in
`docs/PRODUCTION-WRITES.md`.

---

## 7. Learnings appended

Four entries:

1. **`gh pr checks` reported pass for a sha that was still running**, on P3-06's
   ship commit, and the run that did belong to that sha then failed on an
   infrastructure flake. `CLAUDE.md` section 3 already names the
   conflicting-PR version of this trap; this is the second version, and both look
   identical in a summary view. The rule: poll `gh run list` and require
   `headSha == HEAD` **and** `status == completed`, and treat any check result
   faster than the job takes as evidence it is about something else.
2. **`now()` is the transaction timestamp**, so two rows appended to a log
   together sort at random when the tiebreaker is a uuid. Section 2 above.
3. **A containment assertion on a panel that holds a `<select>` passes for every
   value.** Section 4b.
4. **Never guard a write on a prop the write is about to change.** Section 4b.

---

## 8. Where the board stands

Seven cards shipped: five schema, two screens. **Relații** now holds Clienți and
Proiecte, which together are the client and project management the owner said
the platform did not have.

**Nine migration files pending, none applied.** Everything built since P3-01
exists in the code and not on the live site until P3-27 runs.

Next eligible: **P3-08**, the client detail tabs, `depends_on [P3-06, P3-02,
P3-04]`, all shipped. Next free migration number: **0022**.
