# TRIAGE, run 20260907-010004

**Role:** TRIAGE, per `CLAUDE.md` section 1 and `docs/DOCTRINE-TRIAGE.md`.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branch `triage/20260907-010004`,
cut from `main` at `6dc2293`.
**Input, and the only dispatch:**
`docs/reports/2026-09-07-executor-ext-11-before-half.md`.

---

## Boot status report

| | |
|---|---|
| phase 2 board | shipped 64, todo 13, blocked 3, in_flight 1, halted 0 |
| phase 3 board | shipped 40, todo 32 |
| phase 2 launch gate | **6 of 9** (G4, G7, G9 at `fail`) |
| phase 3 launch gate | **0 of 9** |
| next eligible card | **EXT-11**, "order_ref carries the supplier's document series, not only its number, because two suppliers can both issue 0009312." |

Blocked, phase 2: `P2-08b` on `andre`, `P2-14` on `client`, `MIG-01` on `ivan`.
In flight, phase 2: `AUT-3`.

---

## The headline, in one paragraph

The report's central finding is correct and better than it knew: `order_ref` is
in no migration in this repository, and two cards were each written as though the
other had created it. The report's second finding, that the before-and-after
proof does not fit a harness window, is right about the window and wrong about
the reason, and the run it left behind is the proof. **The `quality` run on
`0211239` failed after 29 seconds at the board-edit check, not at the tests.** The
three cases the whole two-push strategy existed to show failing were never
executed. Five rulings, one card authored, no gate flipped.

---

## 1. Deviations, with the test that decided each

`DOCTRINE-TRIAGE` section 1, four tests, first to fire.

### D1. EXT-11 creates a column its own acceptance said already existed

**RATIFIED, on test 4.** Tests 1 and 2 pass (nothing irrecoverable; PR #240,
commit `0211239` and three repeatable greps). Test 3 is **applying**, not
widening: EXT-11's `defaults` says "This card touches the SUPPLIER's identifier
only", and `CLAUDE.md` section 5 makes that binding without anybody being asked.

**Test 4, the alternative named concretely:** blocking the highest-id eligible
card on the board at 01:00 to ask `ivan` which of two cards creates a column,
when the card's own defaults field answers it. That parks the lane for a digest
cycle to obtain an answer already committed.

**Verified before ratifying, at `6dc2293`:** `grep -rn "order_ref"
supabase/migrations/` returns **zero lines**. Twenty tables are created across
the migration set and none carries the column. `client_ref` is the same.
`docs/contracts/extraction-v2.md` line 186 says it in terms.

Ruling **R-149**.

### D2. The two-push before-half, and the run that refutes it

**OVERTURNED, on test 4**, and section 5's card is not needed because the card
that undoes it is EXT-11 itself, whose acceptance is corrected in the same
commit.

The report's premise is true. `.github/workflows/quality.yml` lines 8 to 10 set
`group: quality-${{ github.ref }}` and `cancel-in-progress: true`, exactly as
quoted. What the reasoning did not reach is that the first push never had to
survive the second, because it did not survive itself:

```
card id      board                             status at base -> at head   verdict
EXT-11       rc-board-phase3.json     todo         -> in_flight    not-terminal

satisfied 0 of 1 card id(s)
REFUSED. This pull request carries code under a card whose board edit is missing.
  EXT-11: status is "in_flight" at the head, which means the work is still in hand.
```

29 seconds, at step "Refuse a code pull request whose board edit is missing",
which sits near the top of a job whose Playwright step is near the bottom. **The
end to end suite never ran.**

This is structural, not an accident of this pull request.
`scripts/poc-free/check-board-edit.mjs` classifies `tests/**` as CODE and refuses
`not-terminal` for any card at `todo` or `in_flight` at the head. A tests-only
"before" push is by construction a pull request carrying a card's code with the
card unfinished. **Every such push is refused before any test runs**, and the
concurrency setting is the second reason rather than the first.

**The plan the report left for the next run is built on the false half and is
overturned.** It says to read the red on `0211239` as the acceptance's before
half. It is red for a different reason, and a run that recorded it as the
before-half would be recording something that did not happen.

**Twelve shipped cards satisfied this clause in one push and nobody wrote that
down.** Eighteen cards across both boards carry a "failing before the change"
clause; twelve are shipped, and not one has evidence naming a red CI run. The
strict reading is novel and it is the first to collide with the mechanism.

Ruling **R-150** replaces the clause with a named commit sha on the branch plus
the command a stranger runs at it. That is stricter than what the twelve did and
permanent, where a CI log expires. `cancel-in-progress: false` was considered and
refused: it does not fix the board-edit refusal, and it changes what CI costs,
which is item 1 of the closed escalation list.

**`P2-20`'s wording is the model and is untouched:** "BOTH ARE PROVED TO FAIL
FIRST against the current tree with the failing output quoted in the pull
request." That is R-150 three days early, authored by TRIAGE under R-080.

---

## 2. Findings converted

| finding | disposition |
|---|---|
| `order_ref` is in no migration; two cards each assumed the other | ruling **R-149**, two acceptance rewrites, one dependency edge |
| the before-half cannot be obtained by two pushes | ruling **R-150**, EXT-11 acceptance rewritten |
| board order, not id order, decides which lane advances | ruling **R-151**, card **ORDER-01** authored |
| `MIG-01`'s stated impact is four days stale | ruling **R-153**, `question` corrected, `blocked_on: ivan` retained |
| `EXT-20`'s note "NO CARD CLAIMS client_ref" is false | recorded in R-149 and in P3-31's notes. EXT-20 is shipped and is not rewritten |
| the stale `EXT-10` claim in `state.json` | **no action, and it is not a defect.** A shipped card is not eligible, so it blocked nothing, and `CLAUDE.md` section 13 already documents why `run.sh` still writes there until `install.sh` is re-run. It expires on its own lease |
| the report wrote no escalation for shipping nothing | **no defect.** Section 13's nothing-shipped escalation is written by the harness into `docs/poc/state.json`, not by the report. The report's "none written" refers to section 4 decision escalations, correctly |

Nothing is left as a finding.

---

## 3. Stale `depends_on`, all four checks, all 166 cards on both boards

Section 3 requires the whole board set every time, not only the cards the report
touched.

1. **Dangling:** none. Every id in every `depends_on` resolves.
2. **Satisfied but blocking:** two, both correct and neither cleared. `P2-08b`
   has `P2-08a` shipped and is blocked on `andre`, who genuinely owes a live
   round trip. `MIG-01` has no dependencies and is blocked on `ivan`, who
   genuinely owes the vendor decision in its `question`.
3. **A capability edge missing:** **one added, one recorded on an existing
   card.**
   - **Added:** `P3-31.depends_on` was `[]` and its acceptance names "the
     existing `order_ref`", which only EXT-11 creates. It is now `["EXT-11"]`.
     Id order already produces that sequence; the edge is added so that a halt
     or a split of EXT-11 stops P3-31 being eligible in the same moment, which a
     comparator cannot do.
   - **Recorded, not authored:** `P2-13` revokes the section 3.1 self-merge grant
     that **forty-five unshipped cards** need in order to finish themselves, and
     its `depends_on` is one card. It is not urgent today only by luck: `P2-08b`
     is blocked, so `P2-13` is not eligible. The day `P2-08b` ships, `P2-13`
     sorts ahead of every `P3` card. **Card `GATE-03` already carries this
     mechanism**, and section 5 forbids a second card for one problem, so the
     finding went into its notes.
4. **An edge on a split card:** none stale. `P2-08a`/`P2-08b` is re-derived on
   both dependents, `P3-13b`/`P3-13c` likewise.

---

## 4. Gate audit, both boards, nothing flipped

Ruling **R-152**. Written into the three phase 2 conditions' `notes` and the nine
phase 3 conditions' `evidence.ref`, each board keeping the convention its five
previous audits used.

### Phase 2, stays 6 of 9

**G4, extraction end to end. STAYS `fail`. Three of five clauses.** Measured
against the tree at `6dc2293`, not against the cards. Fixture, auth rejection and
malformed payload are green in `tests/e2e/extraction.spec.ts`. **Redirect is
still absent** (nothing in `lib/data/extraction-fire.ts` sets a redirect policy)
and **oversize is still absent** (`app/api/extraction/callback/route.ts` bounds
no request size). No database read was performed and none is claimed.

**What is new is not about the clauses.** `P2-20` carries exactly those two
cases, has `P2-08a` shipped, and is eligible. **It is thirty-first in the
queue.** This gate has had a closeable card for six days and the queue has not
reached it.

**G7, reminders. STAYS `fail`, `blocked_on: ivan` retained.** The same three
items as the 2026-08-27 audit, none moved in eleven days: `RESEND_API_KEY` in the
production environment, `RESEND_FROM` set, and a recipient not on
`rc-inventory.local`, a domain that does not exist. Two are panel actions,
escalated again below. Not backlog.

**G9, Mihai's cycle. STAYS `fail`.** Needs the client to act himself, on
production. Unflippable by any terminal under section 4's second and third kinds
at once. Downstream of G4, which moved no closer.

### Phase 3, stays 0 of 9, last audited six days ago under R-065

**All nine stay `fail`, and the audit's contribution is that they are one shape
of missing evidence rather than nine.** Every one of the nine deciding clauses
names a **production verification**: RLS proven with a real unauthenticated
request rather than by reading policies, a count taken read-only and pasted, four
deployed screens verified, a nine-direction walk, one project reconciled by hand,
four budget cases demonstrated, a deviz built against a real project, a signed
link proven with a real request, a density sweep with a verdict per screen.

**The tree halves are largely present and close nothing.** `public.clients`,
`public.contacts`, `public.suppliers`, `public.projects`, `public.devize` and
`public.deviz_lines` all exist as migrations; `products.supplier_id` exists with
its foreign key in `0019_suppliers.sql`; `app/(app)/clienti` and
`app/(app)/proiecte` both exist. `CLAUDE.md` 5b already settled that a screen
condition needs the named spec green in CI **plus** EXECUTOR's own deployed-screen
verification recorded as evidence, and no such verification is committed.

**Nothing that shipped since 2026-08-31 touches any clause here.** The window's
shipped cards are EXT-09 through EXT-20 and EXT-10: extraction contract and
product packaging work on phase 2's G4 lane.

**This board is backlog with cards, which 0 of 9 does not say on its own.**
`GATE-01` carries G1's third clause, `GATE-02` its sibling, and `P3-35` the
production read-only verification and the deployed screens. All three are `todo`
and eligible. Thirty-two unbuilt cards, not three conditions waiting on people.

---

## 5. Card authored: ORDER-01

**One card, on the phase 2 board, under ruling R-151.**

**The finding is in the input report's boot section rather than its findings
section.** The eligible list it printed runs `EXT-11` through `P3-39` and only
then reaches `GATE-03`, `LEARN-01`, `MIG-02`, `P2-20` and the rest of the phase 2
tail. `GATE-03` sorts before `P3-13c` under `scripts/poc/card-order.mjs` and
appears thirty places after it.

**It is not a defect in the comparator and not a second sort.** `analyseAll` says
so in its own header under AUT-16: "the eligible list is board one's eligible
cards in id order, then board two's." That reasoning is sound and R-151 does not
disturb it.

**What it costs, counted rather than estimated.** Twelve eligible phase 2 cards
sit behind thirty phase 3 cards. At section 13's two cards per run and four runs
a day, the phase 2 tail is roughly four days from being picked, assuming the
phase 3 lane does not grow, and a lane only ever grows. One of the twelve is
`P2-20`, which its own notes call "THE FIRST CARD G4 HAS EVER HAD".

**The shape is the one `CLAUDE.md` section 2 already paid for once.** BOARD-03
corrected a comparator that queued `AUT-8` behind every `AUT-1x` card authored
days later, and the sentence that made it permanent was "a lane only ever grows,
so nothing would ever have moved them back to the front." One difference matters:
that one was visible in a diff of the sort. This one is visible nowhere at all.

**The card makes the stranding visible and does not decide the priority.**
Reordering the board set trades one starved lane for the other: the phase 3 head
is `EXT-13`, ranked `high`, whose notes place it "AHEAD OF THE EXTRACTION BUILD"
because retention-off has to be a written condition before the first real
supplier document travels the path. R-151 declines to make that call **on a
baseline nobody has ever seen**. ORDER-01 produces the baseline; the choice comes
after, from whoever reads the first digest that carries it. Its `defaults` put
`card-order.mjs`, `CLAUDE.md` section 2, `boards.mjs` and the eligible order
itself out of bounds in terms.

---

## 6. Escalations

**One, and it repeats an unanswered one rather than raising something new.** That
is section 15's deliberate nagging working as designed.

```
ESCALATION: Two settings in the production hosting console are the only things
            left on our side between the low-stock warning emails and working
            for real, and they have not moved since 2026-08-31.
WHY IT IS ESCALATED: item 7, panel actions. No terminal holds a login.
CONTEXT: G7 has been fail since the board opened. The logic is built and proven
         by four green cases in tests/e2e/reminders.spec.ts with Resend mocked
         at the transport. RESEND_API_KEY is not in the production environment
         and RESEND_FROM is unset, so the sender is still the Resend onboarding
         address. Escalated on 2026-08-31 under R-080; nothing moved.
OPTIONS:  (a) set both now, ten minutes, and accept that the gate still does not
              close because the third item lands at P2-13.
          (b) wait for P2-13 and set all three together, which couples a ten
              minute action to a card blocked behind a third party.
RECOMMENDATION: (a). The two settings are independent of P2-13, they are the
          whole remaining gap on our side, and doing them now means that when
          P2-13 creates the real client accounts the gate closes on that alone
          rather than on a fresh round of console work.
IF UNANSWERED: nothing breaks and nothing gets worse, which is the problem.
          Stock can cross a threshold on the live site and no email is sent,
          silently; the screen shows the reminder as Netrimis. That has been the
          state for eleven days and continues indefinitely.
```

**Nothing else on the closed ten fired.** `MIG-01` is already `blocked_on: ivan`
with a full structured question that the digest carries; R-153 corrected its
overstated impact rather than raising it a second time.

---

## 7. What the next EXECUTOR run does first

**EXT-11, on the existing branch `card/ext-11` and the existing PR #240. Do not
open a second branch.**

The plan in the input report is correct from its step 2 onward and its step 1 is
overturned. In one commit: the migration creating `order_ref` and
`order_ref_series` on `public.extraction_drafts` and `public.inbound_orders`, the
assertions file, its own `schema-capability` gate, the callback and confirm paths,
the review form inputs, the contract edit moving both fields out of 4.1a into
4.1, **and the board flip to `shipped`**. Name `0211239` in the pull request body
as the before-half sha with the command to run at it. Merge on one green
`quality` for the head sha, with `npm run checks:state 240` read beside it.

`inbound_orders.reference` is ours and is untouched, unique constraint included.
Merging the migration applies it (`CLAUDE.md` 8.0, R-124), so
`npm run check:no-destructive-migration` must run and pass, not skip.

---

## 8. Doctrine

**`docs/DOCTRINE-TRIAGE.md` needed nothing it did not have.** Section 1's four
tests decided both deviations without improvisation, section 3's four checks
found the P3-31 edge that neither card could see from where it sat, section 5's
"do not author a card for something already covered" is what kept the P2-13
finding out of a second card, and section 6's closed list is what kept this run
to one escalation. No defect in that file is reported.

One observation that is not a defect: section 4 says "write the audit into
`evidence.ref` whether or not it flips", and the phase 2 board's five previous
gate audits are all in `notes`, with `evidence: null` on every failing condition.
This run followed each board's own convention rather than breaking one of them,
and says so here so the next reader knows it was a choice.

---

## Housekeeping

`node docs/board/validate-board.mjs` PASS with 0 violations on all three boards.
`npm run check:unique-ids` OK, 167 card ids and 134 ruling ids unique, 0 redefined
against `main`, five new ruling ids on this branch, counter advanced to `R-154` in
the same commit. `npm run check:conflict-residue` 3 checks passed.
`npm run check:card-ids` OK. `npm run check:board-clock` every timestamp read from
a clock that had already struck.

Ids were allocated per `CLAUDE.md` 8b: `npm run id:free -- R-144` **refused**,
because PR #238 holds `R-144` through `R-149` on an open branch and the counter on
`main` only knows what has merged. It named `R-149` as the lowest free id and
`R-149` through `R-153` and `ORDER-01` were each confirmed free across `main`,
nine open pull requests and this working tree before being written. That is the
fifth time this repository has met that collision and the first time the check
caught it before the write.

No application code, test or migration was written. No card was shipped, no card
PR merged, no migration applied, no existing ruling edited. No secret value was
read, printed, logged or committed. Nothing was pushed to `main` and nothing was
force pushed.
