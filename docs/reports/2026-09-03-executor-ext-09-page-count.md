# EXT-09, EXECUTOR, 2026-09-03

Card **EXT-09**: drop `_meta.characters_extracted` from the extraction contract
and put a model-reported page count in its place.

Branch `card/ext-09`, cut from `main` at `31a817d`. Pull request **#180**.
Claim landed through **#178**.

The session's state report, which the dispatch asked for first and which answers
eight questions about the repository and production, is
`docs/reports/STATE-2026-09-03.md` and is not repeated here.

---

## The card was not the dispatched one, and why

**EXT-16 was dispatched and is not claimable.** It fails two of CLAUDE.md section
2's three eligibility conditions on `main` (`status: blocked`,
`blocked_on: "andre"`) and fails the third even if the pull request that clears
those is merged, because `depends_on` names **EXT-15** and EXT-15 is `todo`.

The chain behind it, read from the API:

1. **#176** clears the block. It is `MERGEABLE` and `BLOCKED`, because **no
   `quality` run of any kind exists against its head sha `678e31e`**. The only
   run on that branch is against `7706def`, an earlier commit.
2. **#177** ships EXT-15. Its base is **`board/andre-reconciliation`**, not
   `main`, so it is stacked on #176 and cannot merge before it.

So a missing CI run was holding two cards. That is not a decision anybody owes an
answer to, so it is not an `ask.sh` item, and per the dispatch the next eligible
card in board order was claimed instead: **EXT-09**, the lowest-id eligible card
on the phase 3 board that no open pull request already carries.

**#176 was closed and immediately reopened**, which fires a `pull_request`
`reopened` event and started a `quality` run on `678e31e` at 20:10:37Z. Nothing
in that branch was touched. It is recorded here because it is a change to
somebody else's pull request, made because the alternative was the EXT lane
staying frozen on a CI event that never arrived.

---

## What the card is actually about, which is not the field name

`page_count` was **already a key in `_meta`**, and `_meta` is stored verbatim, so
nothing had to be built for the value to arrive. That is the point rather than a
reason to do nothing: `_meta` is unvalidated `jsonb`, documented in the contract
as **stored and never shown to the operator**, and nothing in the platform can
ask it a question.

The signal the field exists for is that **a model reporting one page on a
three-page document has silently read a third of it** and returned a result
consistent with itself. Nothing else in the chain catches that, and a totals
check specifically does not: the totals of page one reconcile against the lines
of page one, and every number on the screen looks right.

**So the value became a column.** A signal no query can reach is not a signal,
and the follow-up the card explicitly defers, comparing the reported count
against the real page count of the stored file, needs something it can select.

That reading is also what makes the card's own acceptance satisfiable. The
acceptance says the first case **must fail before the change**. Against a
verbatim `jsonb` passthrough it cannot fail: `d.meta.page_count` reads back
whatever was posted. Against a column it fails for the obvious reason, which is
that the column does not exist.

### `characters_extracted`

Removed from the contract. It was specified when the plan involved extracting
text on our side; we hand the file to the model, so no character count exists
anywhere in the chain and the field **could only ever have been null**.

**Removed from what we EXPECT, not from what we TOLERATE**, per the card's
defaults. A callback still carrying it is accepted and the field ignored. It is
**not stripped from storage** either: `_meta` is the diagnostic block, and
throwing away what the sender chose to send loses exactly what the block is for.
"Ignored" is implemented as nothing reads it and nothing requires it.

The tolerance is not politeness. The two sides do not deploy in the same second,
and **Make retries on 5xx**, so a contract change that invalidated the previous
version's payload would be a loop rather than a single failure.

---

## What landed

| file | what changed |
|---|---|
| `supabase/migrations/0032_extraction_draft_page_count.sql` | the column, nullable, no default, `>= 1` check; the `meta` comment corrected |
| `scripts/poc-free/local-db/assertions/0032_...sql` | four properties, asserted by writing rather than by reading definitions |
| `lib/data/schema-capability.ts` | `hasExtractionPageCount`, probing on the caller's connection |
| `app/api/extraction/callback/route.ts` | `pageCount()` normaliser; the column written only behind the gate |
| `scripts/poc-free/check-pending-schema-reads.mjs` | two defects fixed, below |
| `docs/contracts/extraction-v2.md` | section 4.3 rewritten, new 4.3a |
| `docs/migrations/APPLY-LOG.md` | `0032` added to the pending register |
| `tests/e2e/extraction.spec.ts` | cases 9, 10 and 11 |

### Three decisions taken on the card's defaults, logged per section 5

1. **A broken page count is `null`, never a 400.** Zero, negative, fractional, a
   string and a boolean all read as null. The defaults say absence is not an
   error and that a missing signal must not reject a document that was read
   correctly; a report that cannot be trusted says exactly what an absent one
   says. Rejecting a whole document over a diagnostic field would cost a manual
   entry and gain nothing.
2. **Zero is refused by the constraint rather than stored.** A document has at
   least one page, so zero is an impossible reading and not a more cautious one,
   and stored it would later be indistinguishable from a real one.
3. **No column default, and the assertion checks for its absence.** A default of
   1 would write a claim no model made onto every pre-existing row. That is the
   exact defect this column exists to catch, installed by the column itself.

### The number: `0033` was taken first, the applier refused it, and it is now `0032`

**This is the one thing in the card that was decided wrong, and the machine
caught it.** The reasoning was written into the migration header and the pull
request before it was tested: `0032` is held by open pull request #177, a
duplicate number is worse than a hole, and CLAUDE.md 8.1 asks for
"monotonically increasing" and not for contiguous.

The first two clauses are true. **The third is true about CLAUDE.md and false
about the thing that runs.**

Everything cheap passed: `tsc`, `check:migrations` with 32 files against a bare
`postgres:16`, the applier's own dry run. `npm run prove:applier` came back
**9 of 16**, and the clean-pass proof rolled the entire batch back:

    ASSERTION FAILED [ledger-no-gaps-ends-at-highest]:
    ledger holds 32 rows, expected 33 with no gaps

The applier asserts in SQL, inside the transaction, that **every integer from 1
to the highest is present exactly once**. A gap is not a cosmetic choice here, it
is a batch that cannot be applied at all. Renumbered to `0032`, `prove:applier`
is **16 of 16**.

**The collision with #177 is real and is stated in the file rather than avoided.**
That branch carries `0032_extraction_document_source.sql`. The two file NAMES
differ, so **git reports no conflict**: both would land, both numbered 0032.
`check:migrations` and `prove:applier` fail loudly on the duplicate so it cannot
ship unnoticed, but nothing warns at merge time. Whichever merges second
renumbers to 0033.

**Six other proofs failed as downstream noise from the one rollback**, which made
one problem look like six. Reading the artifact rather than the summary was what
separated them: `docs/reports/p3-27a-proof-1-clean.txt` names the assertion once,
in one line.

### Destructive-statement declaration, CLAUDE.md 8.6

Parsed before anything ran. **No `DROP TABLE`, no `TRUNCATE`, no `DELETE`.** One
near miss, quoted verbatim:

    alter table public.extraction_drafts
      drop constraint if exists extraction_drafts_page_count_positive;

It removes a rule about rows and no row, and it is there so the constraint can be
replaced rather than edited. **The migration is NOT applied.**

---

## Two defects found in a guard, both fixed, both in LEARNINGS

**1. The gate was named by a literal string.** `check-pending-schema-reads.mjs`
held `const GUARD = 'hasPhase3Schema'` and asked only whether a file contains it.
EXT-09 needs a DIFFERENT gate, because `hasPhase3Schema` answers whether the
phase 3 tables are applied and `0032` adds a column to a phase 2 table that can
be applied before or after them. **The cheapest way to make the check green was
to import the wrong gate**, which would have left the route writing a column
production does not have while the check reported OK. The gate list is now
derived from `lib/data/schema-capability.ts`, and the check exits 2 rather than
reporting when it finds zero gates.

**2. `add column if not exists` made it hunt for a column named `if`.** The
pattern was `add\s+column\s+(\w+)`, `0032` writes
`add column if not exists page_count integer`, so the capture was the word `if`,
and the check reported **52 violations across the whole source tree**. The `document_source` migration on another branch hit the identical defect
independently. A mass refusal
read as a discovery is the worst output a check can produce: either somebody
spends an hour on it, or they stop believing the check, and the second is
permanent.

---

## The acceptance, and the one part that could not run here

Run locally, with exit codes, each also proven able to fail:

| command | result | the failing half |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | |
| `npm run check:migrations` | exit 0, **32 files applied unmodified** to a bare `postgres:16`, **15 assertion files passed** | a mutant `0032` carrying `default 1` exits **1** with `EXT-09: page_count carries a default (1)` |
| `npm run prove:applier` | **16 of 16**, exit 0 | it was **9 of 16** on the numbering gap, above |
| `npm run prove:assertions` | exit 0, 11 assertions each hold and each raise when broken | |
| `node scripts/poc-free/check-pending-schema-reads.mjs` | exit 0 | a mutant route with the gate removed exits **1** with `app/api/extraction/callback/route.ts numeste coloana page_count` |
| `npm run check:conflict-residue` | exit 0 | |
| `npm run check:removal-safety` | exit 0, 5 pending migrations checked | |
| `npm run check:assertion-register` | exit 0 | |
| `node docs/board/validate-board.mjs` on all three boards | PASS, 0 violations | |

**`npx playwright test tests/e2e/extraction.spec.ts` could not run on this
machine**, for three separate reasons and none of them the card's:

1. `supabase db reset` fails with
   `Bind for 0.0.0.0:54322 failed: port is already allocated`. The **OsteoJP**
   local stack holds that port. Stopping another project's stack is not this
   card's to do.
2. `supabase/config.toml` on `main` names 54321 and 54322 while the working
   `.env.local` names **54421**. The rc-inventory stack that is up is half up:
   kong on 54421 and **no database container at all**.
3. `.env.local` carries eight variables and `SUPABASE_SERVICE_ROLE_KEY` is not
   one of them. The callback route returns 500 without it, so every case in the
   spec would have failed for a reason unrelated to the card.

**The proof was moved onto the runner rather than weakened to fit the machine.**
The branch is split so the three cases land in one commit and the implementation
in the next, which makes **the two `quality` runs on #180 the before and after
results**, produced by the acceptance command itself against a real stack. The
first commit is expected to be red and says so in its own message.

### The BEFORE result, run 33800619982, head `272b2a7`

`quality` concluded **failure**. `npx playwright test`: **134 passed, 3 failed**,
12.7 minutes. The three are exactly the three new cases, and cases 1 to 8 of the
same spec all passed, so nothing was broken on the way:

    ✓  68  extraction.spec.ts:341  8. absent este null, niciodata sir gol si niciodata zero
    ✘  69  extraction.spec.ts:440  9. _meta.page_count fara characters_extracted ...
    ✘  70  extraction.spec.ts:475  10. un callback care inca poarta characters_extracted ...
    ✘  71  extraction.spec.ts:502  11. un numar de pagini absent sau stricat este null ...

**All three fail on the same fact, which is the one the card is about:** the
value is not on the row.

    9)  > 467 |  expect(d.page_count).toBe(3);
        Expected: 3          Received: undefined

    10) > 499 |  expect(d.page_count).toBe(2);
        Expected: 2          Received: undefined

    11) > 520 |  expect((await draftState(request, orderId)).page_count).toBeNull();
        Received: undefined

**`undefined` and not `null` is the whole point.** `null` would mean the column
exists and holds nothing. `undefined` means `extraction_drafts` has no such
column, which is exactly what the card changes, and it is why a case asserting
`d.meta.page_count` instead could not have failed here: `_meta` is stored
verbatim and reads back whatever was posted.

---

## Findings carried forward

1. **#176 had no `quality` run** and two cards were behind it. Reopened at
   20:10Z, a run started on `678e31e`, and it concluded **success**. The cause of
   the original missing run was not determined.

   **It is now `BEHIND` rather than `CLEAN`, and that is this session's own
   doing.** Merging the claim pull request #178 moved `main` to `b17f066` under
   it, so `npm run checks:state 176` exits non-zero with
   `The quality check reads SUCCESS while this pull request is BEHIND`. The
   overlap is nil in fact: `b17f066` touches only `docs/poc/state.json` and #176
   touches only board JSON. **That is an argument for updating the branch, not
   for merging past the tool P3-11d built to stop exactly this**, so it is left
   for whoever owns that pull request. What was fixed here was the mechanical
   blocker, that no run existed at all; it now has a green one and needs a
   refresh against current `main`.

   **The chain is otherwise unchanged.** #177 is still based on
   `board/andre-reconciliation`, EXT-15 is still `todo`, and EXT-16 therefore
   still fails its `depends_on` condition.
2. **Production's applied ledger is at 0031 while the repository's pending
   register lists 0028 to 0031 as unapplied**, with no `APPLY-LOG` entry for any
   of them on `main` or on any of the 48 remote branches. Full detail in
   `docs/reports/STATE-2026-09-03.md` item 4. `0032` joins that register today,
   so if the register is wrong it is wrong about five files now.
3. **`_meta` has never been validated in any way.** This card reads one key out
   of it and validates that key. The rest of the block is still stored verbatim
   with no shape enforced, which is defensible for a diagnostic blob and is worth
   saying out loud rather than leaving as an assumption.
