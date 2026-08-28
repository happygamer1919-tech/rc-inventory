# AUTHOR: the three authorization grants, and four sweep cards

**Date:** 2026-08-28 (UTC)
**Role:** AUTHOR
**Cards:** AUT-12, AUT-13 shipped. AUT-14, RST-02, BOARD-01, CLAIM-01, LEARN-01
authored.
**Base:** `origin/main` at `07b44db`
**Scope:** board and documents only. No application code, no migration, and no
database connection was opened at any point.

---

## 0. Boot

39 cards before this pull request, 46 after: 31 shipped, 9 todo, 3 blocked,
1 in_flight, 0 halted. Launch gate 6 of 9, untouched. Next eligible card by
lexical id remains AUT-10. This was a dispatch, not a card taken off the queue.

---

## 1. What was asked, and what happened

| Step | Outcome |
|---|---|
| AUT-12, self-merge authorization, amend `CLAUDE.md` | DONE, shipped, as section 3.1 and R-049 |
| AUT-13, TRIAGE ratifies deviations, record in LEARNINGS | DONE, shipped, as R-050, with **three premise corrections** |
| AUT-14, commit the Docker Supabase shim | AUTHORED as `todo`. Committing a script is EXECUTOR work |
| RST-02, BOARD-01, CLAIM-01, LEARN-01 | AUTHORED, unscheduled. See section 6 |
| This report | DONE |

**Nothing was refused and nothing halted.** Three premises in the dispatch did
not survive contact with the repository. All three are corrected in the rulings
rather than transcribed, and none of the three changed what was granted.

---

## 2. AUT-12, and the one check that decided whether the grant was worth anything

The grant is in `CLAUDE.md` as section 3.1 and in `decisions/inbox.md` as R-049.
POC-BUILDER merges its own pull request when every changed path is under
`scripts/poc/`, or is `CLAUDE.md`, or is `docs/poc/DESIGN.md`. EXECUTOR merges
its own when every changed path is under `docs/` or `decisions/`.

**What it actually changes is narrower than it reads.** Application code already
self-merges: section 5b has said since R-002 that cards ship on green
`quality` **plus** the card's named acceptance spec passing. The gap this closes
is the pull request that has **no card and therefore no acceptance line**: a
report, a ruling commit, a board edit, a dispatch output. Three of those landed
on 2026-08-28 and not one had a rule saying who could merge it.

**The check that nearly made this worthless.** A self-merge grant conditioned on
a green check is worth exactly what the check is worth. On a repository whose
workflow carries a `paths:` filter, a documentation-only pull request is
**skipped** and reports success in seconds, so "merge when quality is green"
would mean "merge whenever the checks did not run". That was verified rather
than assumed:

```
grep -c '^[[:space:]]*paths:' .github/workflows/quality.yml
0
```

`quality.yml` triggers on `pull_request` with no filter of any kind, so a
docs-only pull request runs all thirteen steps: typecheck, build, both board
validators, the reset SQL parser, the category vocabulary check, the ledger row
check, the production-target check, the harness cap proof, the production guard
refusal, and the end to end suite against a local Supabase stack. The grep is in
the acceptance line permanently, and section 3.1 says the clause dies in the
same pull request that ever adds a path filter.

**Two paths in the dispatch were redundant and were resolved, not copied.**
`git ls-files` shows `run.sh` is the single file `scripts/poc/run.sh`, already
inside `scripts/poc/`; `docs/board/` is inside `docs/`; `DESIGN.md` is the
single file `docs/poc/DESIGN.md`.

### 2.1 What is NOT granted, and it is worth a decision

The dispatch names POC-BUILDER and EXECUTOR. **It does not name AUTHOR**, and
TRIAGE's authority is unchanged: `docs/DOCTRINE-TRIAGE.md` lets it merge its own
rulings pull request and no other.

**So this pull request cannot be self-merged.** It is an AUTHOR pull request and
it goes to Ivan. Widening a grant to a role the owner did not name is escalation
item 5, so the gap is recorded rather than filled by inference. It is worth
knowing that AUTHOR is the role that writes most of the documentation-shaped
work the grant was aimed at, and the grant does not currently reach it.

---

## 3. AUT-13, and three premises that did not survive

The grant itself is intact: TRIAGE ratifies and overturns with no human input,
and **a ratification is not a ratification until it is a committed line with an
id**. Both are now headings in `docs/DOCTRINE-TRIAGE.md` rather than
implications of a list.

### 3.1 The escalation list was never narrowed, because it was already closed

`docs/DOCTRINE-TRIAGE.md` section 6 has carried a **CLOSED list of nine** since
AUT-2, opening with "The list is CLOSED. Everything on it goes to Ivan.
Everything not on it, TRIAGE decides and records."

Nine of the dispatch's ten items were already on it, item for item: money,
pricing, legal, vendor, credential grants, anything touching Mihai or Andre,
panel actions, production DELETE-class execution, acceptance sign-off.

**The dispatch therefore widens the list by exactly one and narrows nothing.**
The one addition is **launch timing**, which is genuinely absent and genuinely
the owner's, and is now item 10. The list stays closed. The escalation template
said "which of the nine, by number" and now says "the ten", because a document
that contradicts its own list is a document a stateless role has to guess at.

Recording this as a narrowing would have left a future reader believing TRIAGE's
authority grew on this date. It did not.

### 3.2 The cited authority does not resolve to anything a terminal can read

"RC-PROJECT-RULES section 2" cannot be followed. The file is **not tracked in
this repository at any commit**; it is at `/Users/ivan/Downloads/RC-PROJECT-RULES.md`.
Its headings are **not numbered**, so section 2 by position is COMMUNICATION
FORMAT rather than any list of owner decisions. The matching content is under
its OWNER VS DELEGATED heading, the seventh, and reads "money, pricing, launch
timing, legal, vendor agreements, credential grants, anything touching the
client relationship".

That document's own first rule is that **ground truth is committed repository
files only**, so citing it as the boundary of a terminal's authority would break
the rule it states. The list is written out in `docs/DOCTRINE-TRIAGE.md` and no
terminal is required to open an untracked file to learn what it may decide.

### 3.3 It was three dispatches with absent premises and one refused step

The dispatch says "two refused dispatches". The committed count is in
`docs/reports/2026-08-28-executor-rec-01-record-repair.md` section 6:

| dispatch | premise | reality |
|---|---|---|
| land #83 | CONFLICTING, 7 behind | already merged into by a broken resolution nobody validated |
| RST-01 | P2-15 ran, grids on the board, a ledger execution ruling authorises it | P2-15 `blocked`, `evidence: null`, inbox ended at R-046 |
| REC-01 | #83 is open, `c97e48e` bypassed it | #83 MERGED, `c97e48e` is its own squash-merge commit |

**Exactly one action was refused**, RST-01's step 4, correctly. One further step,
REC-01's step 5, was inapplicable rather than refused. The card and the LEARNINGS
entry carry the accurate count, because a card describing this failure while
miscounting it would be the failure.

### 3.4 Item 8 keeps its wording and gains a pointer

R-047 lets a terminal **perform** a DELETE-class run when the script proves its
own outcome. It gave no role authority to **decide** such a run should happen,
which is what item 8 withholds from TRIAGE. Without the pointer the next reader
finds two rules that look opposed and has to guess.

---

## 4. AUT-14, and what "closes escalation E3" is actually worth

**The owner decision underneath it is now committed, and that was the real
blocker.** E3 escalated under item 1, money, and item 4, a third-party
dependency. R-051 records the answer: **Docker Desktop is accepted on the build
machine.** It is installed and running there, server 29.4.2, with `postgres:16`
already pulled. That answer was given in a session and never written down, which
is R-050's failure exactly.

**This closes half of E3.** E3's text is "install Docker on the build machine so
unattended runs can start a local database **and run the automated screen
tests**". A bare `postgres:16` serves no PostgREST, no GoTrue and no storage
API, so the Playwright suite cannot talk to it at all. That half needs
`supabase start`, which needed Docker and now has it, and which is a separate
wiring job in `run.sh`. It is not authored as a card, because the dispatch did
not ask for one.

**What the shim is actually worth, said plainly so the card is not oversold.**
Migrations are **already** verified on every pull request: `quality.yml` runs
`supabase start` and `supabase db reset` against a real stack. The shim does not
make migrations verified. It makes them verifiable **locally, offline, with no
credentials, in one container instead of ten**. That is the capability that let
a file containing eleven DELETE statements aimed at the client's database be
proven, four mutated copies and all, before the owner ran it. Today it exists
only as prose in a report, which means it exists for one session and nobody else.

**The object count is deliberately not in the acceptance line.** The repository
states it three ways: the `docs/LEARNINGS.md` entry is titled "five-object shim",
the RST-01 report says nine, and enumerating either list gives ten. The committed
file becomes the authority.

**The one constraint that cannot be rediscovered cheaply is in the defaults.**
`docker cp` kills Docker Desktop on this machine. The failure is a dead daemon,
not an error message.

---

## 5. The four sweep cards, and what was found while authoring them

Every premise was checked. Three of the four needed correcting or widening.

### 5.1 RST-02, the sweep: premise correct, and one distinction had to be made

`scripts/poc/run.sh` line 508 selects `poc/state-` and `poc/ruling-` only.
TRIAGE opens on `triage/$RUN_ID` (line 731). `claim.sh` opens on `poc/claim-`.
Neither is swept, which is how PR #83's eight rulings sat until found by hand.

**Why this is not the same card as the checkpoint already merged in #91**, since
DOCTRINE-TRIAGE section 5 forbids two cards for one problem. The checkpoint
fixed the **reporting** failure: the run log now names the branch and pull
request the instant GitHub knows them. This card fixes the **recovery** failure:
the next run still does not merge it. One made the wreckage visible, the other
picks it up.

**The acceptance line's negative half is the load-bearing half.** A `card/`
branch must never be selected: the sweep runs no acceptance, so sweeping card
branches would ship unproven cards at four in the morning for weeks.

### 5.2 BOARD-01: the count is nearly right and the field is on none of them

`grep -c plain docs/board/board-app.js` returns **one** hit, and it is
`dataTransfer.setData("text/plain", ...)` at line 1155. Unrelated.

The card surfaces are the search index (317), the card tile (360), the sort
accessor (537), the All cards table (559), the timeline (589), the detail drawer
(910) and the Markdown export (1027). Seven, or six without the sort accessor.

**The bigger half was not in the dispatch.** Saving a card in the portal
**replaces** it: `board.cards[board.cards.indexOf(card)] = next`, where `next` is
a fresh literal carrying twelve fields. `plain`, `depends_on`, `acceptance`,
`defaults` and `question` are destroyed. **All five are hard requirements of
`docs/board/validate-board.mjs`**, so the exported JSON cannot be committed, and
the owner meets it as five validator errors on a paste-back with the deleted text
recoverable only from git history.

The in-app `validate()` mirrors the repository validator and checks **none** of
the five, so the portal reports a board it has just stripped as clean. Three
layers silent: never shown, deleted on save, passed by the checker.

Adding read paths for a field the same file deletes on save would produce a
portal that shows `plain` right up until somebody clicks Save. That is one
problem with two halves, so both are in the card, with the write half fixed by
**merging onto the existing card** rather than by listing five more fields.

Root cause, and it explains every symptom: **board-app.js predates the current
card contract.** `plain` arrived 2026-08-27 with AUT-7, R-002 retired
`owner_merge` on 2026-08-25, and the planning contract added the other four. The
portal was updated for none of them, which is also why its New card button still
defaults the gate to a retired value the validator hard-fails.

### 5.3 CLAIM-01: the collision was reproduced, and the dispatch's evidence is for the other half

Two branches cut from one base, each adding a different key to the `claims`
object. First merge clean. Second:

```
Auto-merging state.json
CONFLICT (content): Merge conflict in state.json
```

The conflict boundary runs **through** the JSON object: HEAD keeps its claim's
opening brace, the incoming side keeps its claim's closing brace, so a resolution
that deletes only the marker characters yields a syntactically broken claims map,
in the one file the harness reads before it picks a card. That is the same
failure class that stranded PR #83.

**The case that collides is the case the lease exists for**: two different actors
claiming two different cards at once, which is the normal operation of a lease
shared by a headless harness and a human terminal that cannot see each other.

**The dispatch attributes PR #86's closure to the collision. The record says
otherwise.** #86 was closed with the owner's own comment: "CRIT-17 shipped in #87
before this claim could land, so a lease on it would protect nothing... a claim
taken after the work is done protects nothing." That is the **latency** defect,
and it is the third time it happened. Both halves are in the card, with the right
evidence against each.

### 5.4 LEARN-01: the two dashes, and two worse things in the same file

The two em dashes are exactly where the dispatch said, lines 1177 and 1178, one
parenthetical construction. Unchanged and left to the card.

**Two stripped conflict marker tails were found in the same file and are fixed
here, not carded.** Line 1536 carried ` poc/19-harness-caps` sitting between two
unrelated entries, and line 1636 carried ` main` as the last line of the file.
Whoever resolved that conflict deleted the marker characters and left the branch
names behind as ordinary content, so `grep '<<<<<<<'` finds nothing and the file
reads clean to a skim. Fixed in this pull request because this pull request
appends to that same file, and leaving known corruption in a file it edits is not
defensible. A LEARNINGS entry records the pattern and the grep that finds it:
search for the **tails**, anchored to the line start, not the markers.

The acceptance line for LEARN-01 is a node one-liner rather than a grep pattern,
because writing the pattern would put the forbidden characters into the board
JSON, which `CLAUDE.md` section 11 forbids by name.

---

## 6. "Do not schedule" is not expressible on this board

The dispatch said to author RST-02, BOARD-01, CLAIM-01 and LEARN-01 and not
schedule them. **There is no mechanism for that**, and rather than pretend a note
enforces it, each card says so.

Eligibility in section 2 is exactly three conditions: `status: todo`, every
`depends_on` shipped, `blocked_on` null. `loose_ends` does not exclude a card:
AUT-10 and AUT-11 sit there today and the REC-01 boot report names AUT-10 as
next eligible. Priority does not affect the pick either, since the rule is
lowest lexical id.

So all four are eligible the moment they land. They sort after the AUT lane
(`AUT-*` before `BOARD-01` before `CLAIM-01` before `LEARN-01`, with `RST-02`
last), so nothing is displaced, but an unattended run will reach them.

**If unscheduled work is a category this board needs, it needs a field, and that
is a card.** Not authored, because the dispatch enumerated the cards to author.

---

## 7. Verification

Every command below was run in this worktree at the head of this branch.

```
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json
  PASS  docs/board/rc-board.json  (0 violations)
  PASS  docs/board/rc-board-phase2.json  (0 violations)   exit 0

npx tsc --noEmit                exit 0
npm run check:reset-sql         exit 0
npm run check:categories        exit 0
npm run check:ledger-rows       exit 0
npm run check:no-prod-target    exit 0
```

**AUT-12's acceptance, five commands:**

```
grep -c '^### 3.1 Self-merge on green' CLAUDE.md                  1
grep -c '^### R-049' decisions/inbox.md                           1
grep -c 'revoking the self-merge grant in section 3.1' CLAUDE.md  1
grep -c '^[[:space:]]*paths:' .github/workflows/quality.yml       0
node docs/board/validate-board.mjs <both boards>                  exit 0
```

**AUT-13's acceptance, six commands:**

```
grep -c '^### TRIAGE ratifies without a human' docs/DOCTRINE-TRIAGE.md            1
grep -c 'ratification is not a ratification until it is a committed line' ...     1
grep -c '^10\. \*\*Launch timing' docs/DOCTRINE-TRIAGE.md                         1
grep -c 'which of the nine, by number' docs/DOCTRINE-TRIAGE.md                    0
grep -c '^### Chat is not authority' docs/LEARNINGS.md                            1
grep -c '^### R-050' decisions/inbox.md                                           1
```

**LEARN-01's acceptance, currently red as it should be**, extracted verbatim from
the card and run:

```
node -e "...filter(ch=>ch==='\u2014'||ch==='\u2013')..."
2
exit 1
```

**No em dash, en dash or curly quote was introduced anywhere.**
`grep -c` over the board JSON, `CLAUDE.md`, `decisions/inbox.md` and
`docs/DOCTRINE-TRIAGE.md` returns 0 for all four. `docs/LEARNINGS.md` returns 2,
which are the two LEARN-01 exists to remove.

**No secret is staged.** `git diff --cached` was read, not assumed. Five files
changed, all under `CLAUDE.md`, `decisions/`, `docs/`. No `.env`, no application
code, no migration.

---

## 8. Loose ends, named rather than left

1. **This pull request cannot self-merge.** R-049 grants POC-BUILDER and
   EXECUTOR. AUTHOR is not named. It goes to Ivan. If the intent was that
   documentation work stops queueing behind him, AUTHOR is the role that writes
   most of it, and extending R-049 is one line of dispatch.
2. **E3 stays open on its screen-test half.** The wiring that lets an unattended
   run start `supabase start` and run a named spec is not authored as a card.
3. **`CLAUDE.md` 9b does not name AUTHOR.** It says it binds every role, then
   lists `executor`, `critic`, `poc-builder` and `triage`. This report is filed
   as `author` anyway, because filing nothing would be worse. Not carded.
4. **A check for em and en dashes would close LEARN-01 permanently.** Nothing
   enforces `CLAUDE.md` section 11 today, which is why the same two characters
   have been flagged three times. The sibling shape is already on the board:
   AUT-11 is exactly this, a guard authored beside the fix.
5. **Three em or en dashes remain outside both cards' scope**, in
   `docs/board/board.css` (two) and `docs/board/render-board.mjs` (one).

---

## 9. Learnings appended

Two entries in `docs/LEARNINGS.md`:

- **Chat is not authority**, with the accurate three-dispatch count and the rule
  that a premise which cannot be verified is treated as absent.
- **A stripped conflict marker leaves its tail behind as file content**, with
  the grep that finds them, since a marker grep cannot.
