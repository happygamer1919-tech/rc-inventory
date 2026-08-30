# EXECUTOR: phase 3 CRM dispatch, preflight. No card was started, and why.

**Date:** 2026-08-28 (UTC)
**Role:** EXECUTOR
**Base:** `origin/main` at `6a3d23c`
**Outcome:** **halted before claiming a card.** Four of the dispatch's premises
are not in shared state, and two of them are halt conditions the dispatch itself
names: an absent tool, and a false premise.

**Nothing was written to the phase 3 board, no branch was cut from it, and no
card was claimed.** This report is the only artefact.

---

## 0. Boot

Phase 2 board, `origin/main`: 41 cards, 33 shipped, 1 blocked, 6 todo, 1
in_flight. Launch gate 6 of 9. Next eligible by lexical id: AUT-10.

The dispatch said to read the board directory rather than assume a filename. I
did. `docs/board/` on `origin/main` contains `rc-board.json` (phase 1, closed),
`rc-board-phase2.json`, the template, the validator and the renderer. **There is
no CRM or phase 3 board there.**

---

## 1. The four blockers, each verified rather than inferred

### 1.1 The phase 3 board is not in shared state

It exists. It is good. It is **not reachable by any other session.**

```
git ls-tree origin/main docs/board/           -> no phase 3 board
every remote branch, searched for one         -> none
local branch board/p3-01-phase3-board         -> docs/board/rc-board-phase3.json
  commit 8a271aa "P3-BOARD: author the phase 3 CRM and density board,
                  28 cards, validator green"
  upstream tracking                           -> NONE. Never pushed.
  checked out in                              -> /Users/ivan/rc-inventory,
                                                  the PRIMARY worktree
```

**That last line is the one that decides it.** The branch is not merely unpushed;
it is checked out in the primary clone, which means AUTHOR is sitting on it right
now. `CLAUDE.md` 13 is explicit that coordination between terminals is "through
committed files only, never directly", and pushing another terminal's unpushed
branch, or building a PR that carries its 28-card board file as though I had
authored it, is the opposite of that. If they amend or rebase, which is the
normal thing to do on an unpushed branch, we collide in the one file neither of
us can afford to lose.

**And there is no way to work a card without it.** `CLAUDE.md` 2: the board is
the work queue, nothing is worked that is not a card, and **the PR that carries a
card's code also carries that card's board edit.** A PR of mine would have to
introduce the entire phase 3 board to edit one card on it.

### 1.2 R-049 is not on `main`

The dispatch says "Self-merge under R-049 where the grant covers the paths
touched." `decisions/inbox.md` on `main` ends at **R-048**. R-049 is real and
authored, on PR #94's branch, **open and unmerged**. This is the second dispatch
in a row to cite it; the previous one was handled by self-merging under
`CLAUDE.md` 5b instead, which needs no new ruling. That workaround does not
extend here, because 5b grants `green_self_merge` on a card, and there is no
board to carry a card.

### 1.3 R-050 is not on `main`

"Everything else is TRIAGE's under R-050." Same PR #94, same state. The
escalation routing the dispatch depends on does not exist in the shared record.

### 1.4 The AUT-14 Docker shim is not committed. This is the absent tool.

The dispatch, on wave 1 migrations: "Author it, prove it against the Docker
`postgres:16` shim from AUT-14, commit the proof in the report."

```
scripts/poc-free/local-db/  on origin/main   -> does not exist
npm run check:migrations                      -> not in package.json
```

**I know exactly why, because I am the reason.** I built that shim ad hoc during
RST-01 on this same day, proved all twelve migrations apply unmodified onto stock
`postgres:16` with it, and **deliberately did not commit it**, because committing
it was scope RST-01 did not carry. I said so in that report and flagged it for
the owner. AUT-14 is the card that authorises committing it, and AUT-14 is on
PR #94.

So the tool the dispatch names as the proof mechanism for every wave 1 migration
is, right now, a file in a scratch directory from a session that has ended.

### 1.5 A fifth, minor: the "RC section 2 list" does not exist

"Escalate to Ivan only on the RC section 2 list." No document in the repository
defines one. Searched `docs/` and `CLAUDE.md`. It may be a document AUTHOR has
not pushed either, or it may be shorthand for something in the chat.

---

## 2. The STOP condition was checked and is NOT triggered

The dispatch: "if wave 1 schema cards conflict with anything still open on the
phase 2 board, work the phase 2 item first and report the collision."

**There is no collision.** All eight open phase 2 cards, checked against the
tables wave 1 touches (`outbound_issues`, `products`, `order_lines`,
`inbound_orders`):

| card | status | blocked on | touches a wave 1 table |
|---|---|---|---|
| AUT-3 | in_flight | - | no |
| AUT-8, AUT-9, AUT-10, AUT-11 | todo | - | no, harness only |
| P2-08b | blocked | andre | no |
| P2-13 | todo | - | no, credential rotation |
| P2-14 | todo | client | no, acceptance |

Nothing open on phase 2 touches `outbound_issues` or `products` schema. **Wave 1
is clear to proceed the moment its own blockers lift.** Next free migration
number is **0013**.

---

## 3. What the board already gets right, so nobody redoes it

Read for preflight only, not edited. 28 cards, all `todo`, validator green per
its own commit message.

**The drop-after-backfill rule the dispatch mandates is already implemented as
card structure**, which was the thing most likely to be got wrong:

```
P3-04   outbound_issues gains project_id, backfilled from the free text
P3-04b  drop outbound_issues.client_name and project_name, in their own
        migration        depends_on [P3-04, P3-10]
P3-05   suppliers authored, products.supplier_name backfilled
P3-05b  drop products.supplier_name in its own migration, only after
                         depends_on [P3-05, P3-10]
```

Separate cards, separate migrations, the drop gated behind both the backfill and
the cross-linking card. That is exactly the "never both at once" rule.

---

## 4. The deviz addendum against the authored card: the delta, so it is not re-derived

The dispatch says to expand P3-13 if it does not carry the addendum's spec.
**It does not, and the gap is substantial.** Recording it here rather than
editing a board I cannot reach. Twelve differences, in the order they matter.

**Two of them are contradictions, not omissions**, and they are listed first
because an executor who works the authored card will produce something that
directly conflicts with the addendum.

1. **P3-18's status set is contradicted.** The addendum says aggregate for
   projects in "lead, offer, contract **or active**". The authored P3-18
   acceptance says "only projects whose status is prospect, oferta or contract",
   and it **tests that a project `in lucru` is excluded even with a deviz**. Both
   cannot be true. The addendum is later and binding, so the authored test
   asserts the opposite of the spec.

2. **P3-18's input is contradicted.** The addendum: "aggregate accepted deviz
   lines **minus already-issued quantity**". The authored card: "the required
   quantity per product is the sum of current-deviz line quantities", with no
   subtraction. The addendum's version is procurement; the authored version
   double-counts material already delivered.

3. **The price snapshot is not specified as a snapshot.** The authored acceptance
   says a line defaults "the price from the catalogue and allowing an override".
   That is a default-and-override, which is not the same thing and degrades
   silently into a live join. The addendum is explicit: store it, never join to
   the live price, and show current-versus-quoted as a computed delta. It also
   names this as one of the two paths that "silently degrade to something
   plausible and wrong", so it needs its own named test: **a deviz quoted in
   March still shows March prices in June.**

4. **The status pipeline is absent.** `draft, emis, acceptat, respins, expirat`,
   and **only `acceptat` feeds P3-18**. The authored P3-18 says "carry a current
   deviz", which would include a draft.

5. **Versioning is absent.** A new version supersedes rather than edits, because
   the prior version is evidence in a renegotiation.

6. **The `devize` field list is absent** from the acceptance: `name, version,
   status, currency, margin_percent, valid_until, notes, created_at,
   approved_at`. `margin_percent`, `valid_until` and `approved_at` appear
   nowhere.

7. **The `deviz_lines` field list is absent**: `product_id, quantity, unit
   (inherited, not re-entered), unit_price, line_note, sort_order`.
   `line_note` and `sort_order` appear nowhere.

8. **The comparison is quantity-only.** Authored: "estimated quantity, issued
   quantity and the difference". Addendum: **estimat, emis, diferenta in both
   quantity and MDL.**

9. **Over-issue flagging is absent.** Rows where `emis` exceeds `estimat` flag.

10. **Foot totals are absent**: deviz total, issued total, variance in MDL and
    percent. Only the deviz total is in the authored card.

11. **`neprevazut` is present in substance but unnamed.** The authored card has
    "a product issued but not estimated appears as an unplanned line and is not
    omitted", which is the behaviour. The addendum names it, in Romanian, and
    calls it "the single most useful number on the screen because it is the leak
    nobody currently sees". The Romanian vocabulary the addendum fixes is
    `Devize, Deviz nou, Linii deviz, Estimat, Emis, Diferenta, Neprevazut,
    Necesar de materiale`.

12. **P3-12 must carry three numbers, not two.** The addendum: `budget_mdl`,
    accepted deviz total, and actual issued cost are three different numbers and
    all three belong on project detail, uncollapsed. The authored P3-12 is budget
    versus actual only; the accepted deviz total is absent.

**And a thirteenth that is not a spec delta but will mislead the next reader.**
Both P3-13 and P3-18 open their notes with `INVENTED, NOT REQUESTED`, and P3-13's
notes instruct the executor to **halt and block on Ivan** if the versioning or
price model turns out to contradict how Mihai works. The addendum settles both:
"Both previously marked INVENTED. Both now IN." Those notes are now stale in a
way that would cause a future executor to halt on a question that has been
answered.

**Splitting.** The addendum fixes a build order inside the spec: schema, then the
line editor, then the comparison view, then P3-18, and states that the comparison
view is shippable and valuable before P3-18 exists. P3-13 as authored is one
card, already described in its own notes as "the largest single card on the
board". Three sub-cards along the addendum's own seams is the obvious split.

---

## 5. The unblock, in order

Nothing here is mine to do. All four are another lane's or the owner's.

1. **Push and merge the phase 3 board.** `board/p3-01-phase3-board`, commit
   `8a271aa`, in the primary worktree. Until it is on `main`, no executor can
   claim a phase 3 card, because a card's PR must carry that card's board edit.
2. **Merge PR #94.** It carries R-049 (self-merge), R-050 (TRIAGE routing) and
   AUT-14 (the Docker shim as `scripts/poc-free/local-db/` plus
   `npm run check:migrations`). Three of the five blockers here are that one PR.
   It was open and conflicted earlier today; its head has since moved to
   `a64ea73` and its conflict residue is cleared, so it needs a rebase onto
   `6a3d23c` and a merge.
3. **Apply the deviz addendum to the board**, per section 4. Twelve deltas, two
   of which are contradictions that would otherwise be built.
4. **Define or drop the "RC section 2" reference** in the escalation instruction.

Once 1 and 2 land, wave 1 is clear: no phase 2 collision, migration 0013 free,
and the shim available to prove it.

---

## 6. Why this halted rather than starting somewhere

The dispatch permits picking wave 4 density cards when a wave is blocked, since
they touch presentation only. **That does not survive the board being absent**:
P3-19 through P3-26 are cards on a board no shared branch has, so working one
means introducing the whole board file in my PR and claiming AUTHOR's work.
They are also application code, which the dispatch itself puts outside the
self-merge grant, and the grant does not exist either.

**Committing this report is the deliverable, and that is not a consolation
prize.** This repository has spent the whole of 2026-08-28 paying for decisions
that existed only in a chat window: REC-01 and REC-02 exist for nothing else, and
this is the fifth dispatch in a row written against a record that was not
committed. The pattern is identical every time: **the work had been done, the
record had not been shared.** A phase 3 board that only one worktree can see is
that same failure, caught before it cost anything instead of after.

`CLAUDE.md` 9b requires a terminal's final act to be its committed report. This
is it.

---

## 7. Addendum: three blockers moved while this preflight was in flight

Written against `origin/main` at `6a3d23c`. Before this report could merge, **PR
#94 landed as `0ee9cfb`** and AUTHOR pushed the phase 3 board as **PR #98**. The
sections above are left exactly as written, because they were true of the tree
they were written against and because a report that quietly rewrites itself is
worth less than one that dates its own claims. Here is what changed.

### Resolved

**Blocker 1.2, R-049.** Now on `main`. It grants a terminal self-merge on green
`quality` when **every** changed path is in that role's set, with EXECUTOR's set
being anything under `docs/` plus anything under `decisions/`. This PR changes
one file, `docs/reports/2026-08-28-executor-phase-3-crm-preflight.md`, so it now
merges under the grant the dispatch named rather than under `CLAUDE.md` 5b.

**Blocker 1.3, R-050.** Now on `main`. Escalation routing exists.

### Partly resolved, and the distinction matters

**Blocker 1.1, the board.** It is now on **PR #98**, open, not merged. It is
still not on `main`, so a card's PR still cannot carry its board edit. What
changed is that it is now shared and visible, which was the substance of the
objection: nobody is building on another terminal's unpushed branch any more. It
unblocks when #98 merges.

### NOT resolved, and this is the correction worth reading

**Blocker 1.4, the AUT-14 Docker shim, still stands.** It is easy to read "#94
landed AUT-14" and conclude the tool arrived. It did not.

```
scripts/poc-free/local-db/ on origin/main  -> still does not exist
npm run check:migrations                   -> still absent from package.json
```

What #94 committed is **R-051, the authorisation** to commit the shim, and the
AUT-14 card that carries the work. The shim itself is still uncommitted. So the
named proof mechanism for every wave 1 migration is still a file in a scratch
directory from a session that has ended, and **wave 1 still cannot prove a
migration the way the dispatch requires.**

That is the same shape as everything else this day has cost time on: the decision
is committed, the artefact is not. It is worth stating plainly because "AUT-14
merged" is exactly the sentence that would send the next executor looking for a
tool that is not there.

### One corroboration, unprompted

R-051 independently caught the object-count error flagged in
`docs/reports/2026-08-28-executor-guard-01-rec-02.md` section 6: the
`docs/LEARNINGS.md` entry says "five-object shim", the RST-01 report says nine,
and enumerating either list gives **ten**. Two lanes reached the same finding
from opposite directions on the same day, which is the first time in this
sequence that a defect was caught twice rather than passed on.

### The unblock list, reduced

1. **Merge PR #98**, the phase 3 board. This is now the only thing standing
   between an executor and wave 1's non-migration cards.
2. **Commit the shim** under AUT-14, now authorised by R-051, before any wave 1
   migration card is worked.
3. Apply the deviz addendum deltas in section 4.
4. Define or drop the "RC section 2" reference.

Items 2 and 3 in the original section 5 list are done.
