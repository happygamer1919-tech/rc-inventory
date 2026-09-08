# EXECUTOR, unattended run 20260908-010002

**Role:** EXECUTOR. **Date (UTC):** 2026-09-08. **Run id:** 20260908-010002.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` at boot
(`4a0963c`). **Cap:** 45 minutes of wall clock.

---

## Status at boot

| Board | shipped | in_flight | blocked | halted | todo | launch gate |
|---|---|---|---|---|---|---|
| phase 2 | 65 | 1 | 3 | 0 | 16 | 6/9 |
| phase 3 | 46 | 0 | 0 | 0 | 27 | 0/9 |

**Next eligible card: `EXT-11`.** The eligible set was 41 ids across both boards,
beginning `EXT-11, GATE-01, GATE-02, P3-14, ...`.

**The claim, and why it was not a skip.** `EXT-11` was held in `docs/poc/state.json`
by actor `harness` since `2026-09-08T03:13:01Z`, inside the six hour lease. That is
the SAME actor this run boots as, not another one, so section 13's "never take a card
another actor holds" does not apply: the previous scheduled run left its own unfinished
work on the branch and this run is the next instalment of it. `eligible.mjs --actor
harness` agrees and lists the card.

---

## Cards touched

| Card | At boot | At end | What happened |
|---|---|---|---|
| `EXT-11` | `shipped` on branch, PR #240 **red** | `shipped`, **PR #240 merged** | The red was the new test, not the feature. One line fixed it. |

**One card, not two.** The `quality` check takes about 22 minutes and the remaining
budget could not have carried a second card through a check of its own. Section 13
allows two cards; it does not ask for work that cannot be finished and merged.

---

## EXT-11: what was actually wrong

**This card took five runs. Four of them failed on the acceptance clause `THAT CASE
FAILING BEFORE THE CHANGE AND THE PR SHOWING BOTH RESULTS`. The fifth failed on
something else entirely**, and the distinction matters because the two are
indistinguishable in `gh pr checks`.

**The state at boot.** PR #240, head `1b4d726`, `quality` run `34179242898`:
**failure**, `mergeStateStatus` **BEHIND**. Reading the step list rather than the
summary: exactly one step failed, `End to end`, and inside it exactly **one case out
of 188**.

That case was `tests/e2e/review.spec.ts:1181`,
`EXT-11: seria furnizorului se vede in fisa si valoarea editata este cea salvata`.

**Cases 25 and 26 in `extraction.spec.ts` PASSED on that head.** Those are the two
cases the acceptance names for the before-and-after clause, and they are exactly the
ones the before-result (`34115053214` on `93fe03c`) had turned red with the
implementation reverted. So the feature was already proven in both directions on the
head that reported failure.

**Where the review case died, and it was not on the series.** It failed at its LAST
step:

```
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('review-created')
Timeout: 30000ms
Error: element(s) not found
```

Its first clause, the one that proves the series reaches the screen in two separate
fields, had already passed on that same run.

**Cause.** `confirmExtractionDraft` in `lib/data/extraction-actions.ts` refuses:

```
if (input.expectedAt.trim().length === 0)
  return { ok: false, message: "Completează data estimată de livrare.", field: "expectedAt" };
```

The expected delivery date does not come from extraction; the operator types it. The
refusal lands in `review-error` and `review-created` is never rendered. The new case
was **the only case on the confirmation path that did not fill `review-expected-at`**.
Every green case on that path fills it.

**Fix.** One line, with the reason written beside it in Romanian:

```ts
await page.getByTestId("review-expected-at").fill("2026-12-05");
```

**No application code was touched.** The implementation restored by the previous run
is unchanged, byte for byte.

**Also in the push:** `origin/main` merged into the branch to clear `BEHIND` (one file,
`docs/poc/state.json`, merged by ort, no conflict, `npm run check:conflict-residue`
run before the commit), the `docs/LEARNINGS.md` entry, and the board edit recording
what the red actually was.

---

## The acceptance, clause by clause, and what proved each

| # | Clause | Proof |
|---|---|---|
| 1 | MIGRATION adds the series wherever `order_ref` is stored | `supabase/migrations/0036_supplier_document_series.sql`, `order_ref` and `order_ref_series` on `inbound_orders` and `extraction_drafts`, all four nullable |
| 2 | `npm run check:migrations` exits 0 with an assertions file | step **Apply every migration to a bare postgres, unmodified**: success. `scripts/poc-free/local-db/assertions/0036_supplier_document_series.sql` inserts a row with a series and a row without and reads both back |
| 3 | The case FAILING BEFORE the change, both results shown | **RED:** run `34115053214` on `93fe03c`, failed AT `End to end`, cases 25 and 26 red with the implementation reverted. **GREEN:** run `34189279235` on `ac5f573`, `End to end` ran and passed |
| 4 | The review form shows and edits the series | the named case in `tests/e2e/review.spec.ts`, green on `ac5f573` |
| 5 | `docs/contracts/extraction-v2.md` updated in the same PR | in PR #240 |
| 6 | `npx tsc --noEmit` exits 0 | run locally before the commit, exits 0; the `Typecheck` step is green in `quality` |

**The merge was made on a green that belongs to the head sha, and the two
path-filtered steps RAN.** `npm run checks:state 240` printed
`mergeStateStatus CLEAN` and `quality SUCCESS` and said "the quality result belongs to
head ac5f573 and can be trusted". Because the pull request touches
`supabase/migrations/**`, CLAUDE.md 3.1 additionally requires both filtered steps to
have run rather than skipped, and both did:

```
success  Decide whether the applier proof must run
success  Prove the migration applier against the Docker shim
success  Prove every applier assertion can fail
success  Refuse an assertion with no failing case
success  Refuse a migration that removes rows
success  Prove the destructive-migration check refuses
success  End to end
```

---

## PRs

| PR | What | Outcome |
|---|---|---|
| **#240** `card/ext-11` | EXT-11, the supplier's document series and number stored as two facts | **MERGED** 2026-09-08T05:29:39Z, squash, merge commit `8011696` |
| **#261** `report/20260908-010002` | this report | opened by this run, left open for the next run to merge |

**Merging #240 applied migration `0036` to production**, per CLAUDE.md 8.0 and ruling
R-124: the Supabase GitHub integration applies a merged migration within about two
minutes with no terminal involved. The `docs/migrations/APPLY-LOG.md` row for 0036 was
written by the previous run BEFORE the merge, which is what 8.8 requires, and
`npm run check:no-destructive-migration` passed on it inside `quality`. The file
contains no `DROP TABLE`, no `TRUNCATE` and no `DELETE`.

---

## Defects found

One, appended to `docs/LEARNINGS.md` in this run:

**"Un caz nou de confirmare care nu completeaza data estimata pica pe alt motiv decat
cel testat."** The rule it leaves behind: **the expected delivery date is required and
does not come from extraction, so any new case that presses `review-confirm` fills it,
whatever field that case is proving.** More generally: when writing a new case on a
path that already has green cases, read one of them to the end and copy the steps the
final action depends on. A case that dies on somebody else's last `expect` says
nothing about what it was written to test.

**The meta-defect, which is the expensive one, and it is a reporting gap rather than a
rule gap.** Across five runs this card's `quality: failure` was misread twice in
opposite directions. First a job that stopped at the board-edit refusal was taken for a
before-result, when `End to end` had been SKIPPED. Then a red head was taken for a
broken feature, when one test of 188 had failed on its own setup. `npm run
checks:state` prints the merge state beside the check result, which closes the stale
green trap; **nothing prints the STEP that failed**, which is the trap that actually
caught this card four times. Reading the step list is currently a habit, not a check.
It is reported here rather than raised as a block, per section 4b.

---

## Escalations

**None raised this run.** No card question was hit that its defaults did not answer,
and no decision on the R-057 list arose.

The 60 escalations already in `docs/poc/state.json` are unchanged. The three most
recent still want an answer and are repeated here because nothing else repeats them:
`poc/state-20260901-011629`, `poc/state-20260904-040001` and `triage/20260901-070544`
are pushed to origin, unmerged, with no open pull request, so no check has ever run on
them and nothing reports them.

---

## State at the end

| Board | shipped | todo | gate |
|---|---|---|---|
| phase 2 | 65 | 16 | 6/9 |
| phase 3 | **47** | **26** | 0/9 |

**What the next run picks up first: `GATE-01`**, now the lowest-id eligible card.
*"Phase 3 gate G1 clause 3: a write from a role without permission is refused AT THE
DATABASE, proven on production, which has never been attempted."* Then `GATE-02`, then
the `P3-1x` run.

**Two things to know before starting.**

1. **The phase 3 launch gate reads 0/9, and that is a stale record rather than nine
   failing conditions.** `GATE-02` exists to re-run the audit against the premise
   `P3-27` discharged. A run that takes `GATE-01` first proves one clause of a gate
   whose other eight have not been re-read. Both are eligible and `GATE-01` is the
   lower id, so the board loop takes it; that is noted, not overridden.
2. **The open pull request backlog is 14 and at least two are `DIRTY`.** #249 and #223
   are POC state pull requests conflicting with `main`. Per CLAUDE.md section 3 a
   conflicting pull request triggers ZERO workflows, so any green shown against them
   belongs to an older head sha. They are resolved locally by EXECUTOR against the full
   tree, never in the web editor, or they sit there indefinitely.
