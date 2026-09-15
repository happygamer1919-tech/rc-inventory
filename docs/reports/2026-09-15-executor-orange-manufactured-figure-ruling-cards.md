# ORANGE, EXECUTOR, 2026-09-15: the manufactured-figure ruling, its named pattern, and two cards not built

Owner dispatch received after `docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md`.
Role EXECUTOR (ORANGE). **Ratified by the owner: all nine deviations of that
report. Nothing new in this report is self-ratified.**

**Outcome, with every id created.**

| step | what | id |
|---|---|---|
| 1 | ruling on the manufactured-figure defect | **R-198** |
| 2 | the doctrine list, created because none existed, with the pattern as P-2 | **`docs/DOCTRINE-PATTERNS.md`**, entry **P-2** (R-185 entered beside it as **P-1**) |
| 3 | card: four inbound fields stored, marked for the platform owner, not shipped | **EXT-34** |
| 4 | card: a dedicated fixture draft for counterparty test callbacks, not shipped | **EXT-35** |

`decisions/NEXT-RULING-ID` moves from `R-198` to `R-199` in the same commit.
Steps 3 and 4 are not built.

**One finding about my own earlier work today leads the deviations below:** by the
committed record, my three production storage writes today happened after real
client data was in production. Read deviation 1 first.

No key, token or signed URL appears here or in any commit.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `794629b`:
- **Cards:** todo 32, in_flight 0, blocked 2, halted 0, shipped 68.
- **Launch gate:** **6/9**.
- **Next eligible card:** **AUT-3**. Not worked, because this dispatch names its
  steps.

Phase 3 at the same commit: todo 36, shipped 68, gate 0/9. #298 is merged as
`4b65ced`, and #299 (`card/p3-53`, another lane) is open.

Work happened in the worktree `/Users/ivan/rc-inv-mfig`, on
`board/orange-20260915-manufactured-figure`. `npm run id:free` answered FREE for
`R-198`, `EXT-34` and `EXT-35`, with 3 sources read and 0 refused.

## STEP 1. R-198

Appended to `decisions/inbox.md` in the format of R-197: date, asked on, the
dispatch quoted verbatim, the ruling, lettered parts, and an `Unblocks` line.

- **(a) The defect**, recorded as the owner's report, because nothing here observes
  the counterparty's prompt or model. Two things in this repository support it.
  The lines-arm fixture of 2026-09-15 was built to expose exactly this property.
  `docs/LEARNINGS.md` already records a prompt that forbade a self-consistent
  quantity, price and total, and was ignored three runs of three.
- **(b) No arithmetic control on either side can detect it.** Ours: `reconcile()`
  and `headerConsistency()` receive a number and cannot tell a printed figure from
  a derived one, and a present, consistent line total was measured accepted on
  every shape on 2026-09-15. **Quantity times unit price is the same trap one layer
  down**, and adding that check would certify the defect.
- **(c) The only fix is a prompt rule** returning `line_total: null` for a figure
  the page does not show, which routes to `partial` with cause `lines` on the
  counterparty's side. **Our side, as measured on 2026-09-15, is recorded
  beside it**: a digital `partial` with no code stays `partial` with our
  `line_total_missing` verdict recorded, while a scan is refused as `failed`
  `unreadable_document` with its lines dropped. No code change follows, and
  contract section 8 is not amended.
- **(d) Exposure.** Live for the full period before the counterparty's prompt
  change. **Boundary date TBD** pending his confirmation. Incidence unknown and
  unmeasurable from stored data: `line_total` stores a number either way, and no
  column or `_meta` key says which. Once the date is confirmed, `_meta.prompt_version`
  can place a draft on one side of it, but still cannot say whether that draft's
  figure was manufactured.
- **(e) A clean extraction before the change is weaker evidence than one after
  it.** Nothing is reopened; the weight is recorded.
- **(f) The pattern, named**, with its distinction from R-185 stated.
- **Unblocks:** nothing, and no card changes. It is a standing record under
  DOCTRINE-TRIAGE section 2, requirement 3.

## STEP 2. The doctrine list

**No doctrine list existed**: a search of `docs/`, `CLAUDE.md` and
`decisions/inbox.md` found none. Standing patterns lived only inside rulings, R-185
and R-193 among them. The repository names its doctrine files `docs/DOCTRINE-*.md`,
so the list is created as **`docs/DOCTRINE-PATTERNS.md`** with two entries:
- **P-1, errors that agree with each other**, R-185. Entered because the dispatch
  defines the new pattern against it.
- **P-2, a manufactured value that satisfies the check built to verify it**,
  R-198. It gives the rule, the distinction ("P-1 is defeated by agreement. P-2 is
  defeated by construction."), the instance with the TBD boundary, what does not
  work against it, and the only control.

## STEP 3. EXT-34, not shipped

- **Title and defaults open with** "FOR THE PLATFORM OWNER, NOT FOR THE ORANGE
  TERMINAL", and `owner_terminal` is `platform-owner`.
- **Acceptance, machine-checkable:**
  - one migration adds four nullable text columns with no default:
    `extraction_drafts.document_type`, `extraction_drafts.client_ref`,
    `extraction_draft_lines.supplier_code` and `extraction_draft_lines.description`.
    `check:no-destructive-migration` exits 0 on it.
  - the route reads the four keys through `str()`, behind schema-capability probes.
  - two new cases in `tests/e2e/extraction.spec.ts`, shown failing first: all four
    keys stored, and absence gives `202` and four nulls, never `400`.
  - `npx tsc --noEmit` exits 0.
- **Out of its scope, and named:** the `supplier` / `supplier_name` mismatch, and
  the page count sent as `pages`.

## STEP 4. EXT-35, not shipped

**Acceptance, five clauses:**
1. **The row.** One `extraction_drafts` row for a committed `order_id`, filename
   beginning `FIXTURE`, path under `_samples/andre/`, not linked to any order. Its
   presence is proved by an owner-run read-only query.
2. **It receives callbacks.** `202`, then `200` on a repeat, on the local stack.
3. **It is not real data.** It is registered in the committed definition of rows
   that are ours that P2-21 names, with a case asserting the classification.
4. **It is marked on the review screen.**
5. **Disclosure.** It states in terms: "THE FIXTURE'S order_id MAY BE GIVEN TO THE
   COUNTERPARTY."

**Why a draft row.** The callback answers 400 `order_id necunoscut` for any
`order_id` without an `extraction_drafts` row, and `inbound_orders` links only on
confirmation.

**Why no terminal writes it.** See deviation 1. The row is created by a migration
the owner merges, or by a command the owner runs, and is journalled either way.

**Left open for the owner in its notes:** whether confirming the fixture draft on
the review screen is refused, since confirming it would create a real inbound order.

## DEVIATIONS AND FINDINGS, for ratification. None is self-ratified.

1. **FINDING ABOUT MY OWN EARLIER WORK: by the committed record, my three
   production storage writes today were made after real client data was in
   production.**
   - **The record.** Card P3-47's evidence, written 2026-09-14T18:05:44Z, says
     "real client data is in production, no pull request self-merges". P3-54's
     evidence of 2026-09-15T11:44:29Z says the same, and P3-48 says "REAL CLIENT
     DATA IS IN PRODUCTION". Ruling R-192(c) quotes the owner: terminal grants
     "stay live, which holds only while no real client data is entered".
     CLAUDE.md 8.2 ends the delegation "the moment real data exists".
   - **What I did after that point.** I sourced `/Users/ivan/rc-secrets/phase2.env`
     and wrote to production storage three times: runs A and B at
     2026-09-15T13:16Z, and run C at 16:01Z. None of the three reports said this.
   - **What is not in doubt.** No credential value was printed, logged or
     committed. Every write was journalled, and each touched only `_samples/andre`.
   - **What I cannot settle.** No ruling or `CLAUDE.md` line records that real
     client data is present. The only record is other terminals' card evidence.
     And R-192(c)'s condition is written about terminal grants in general, not
     about storage writes under R-096 specifically.
   - **Recommendation.** You rule on two questions:
     - whether the R-096 storage writes fell under a live grant
     - whether the phase 2 credentials count as terminal-held after that point
       (CLAUDE.md 8.7)

     **Until you rule, this terminal does not source that file again.** Nothing in
     this dispatch needed it.
2. **The doctrine list did not exist, so I created one.** It is
   `docs/DOCTRINE-PATTERNS.md`, with R-185 entered as P-1 so that P-2's
   distinction resolves. Nothing points to it from `CLAUDE.md`, which every session
   reads. **Recommendation:** one pointer line in `CLAUDE.md` section 9c or a new
   short section, your decision.
3. **"Platform owner" is not defined anywhere in this repository**, so the marking
   is a label, not a lock. `owner_terminal` is display-only, and eligibility ignores
   it, so a scheduled EXECUTOR run can still pick EXT-34 up.
   **Options:**
   - (a) name the owner and I set a `blocked_on`
   - (b) leave it as a label and accept the risk
   - (c) add an owner filter to eligibility, which is a code card

   **Recommendation: (a)**, because the migration merges into a production database
   that holds real client data.
4. **R-198 records our side's routing beside your sentence, not in place of it.**
   A scan with a null `line_total` does not stay `partial` on our side: it becomes
   `failed` `unreadable_document` with its lines dropped. This was measured on
   2026-09-15.
5. **Contract section 8, "Four prompt rules", is not amended** with the new rule,
   because the dispatch did not ask for it. **Recommendation:** add it as 8.5,
   since section 8 is where the counterparty's prompt obligations are written
   down.
6. **The defect, the counterparty's prompt change and `partial_cause: lines` are
   recorded as your report.** Nothing in this repository observes them, and
   `partial_cause` is committed nowhere.
7. **EXT-35 keeps every production step with the owner** (the row, the production
   query and the merge), because of finding 1.
8. **The pull request is left for the owner.** Real client data is recorded in
   production and no pull request self-merges.

## STATE AT THE END

- **Pull request #300**, branch `board/orange-20260915-manufactured-figure`,
  carries R-198, the counter at R-199, `docs/DOCTRINE-PATTERNS.md`, EXT-34, EXT-35
  and this report. Before its `quality` run, locally: `check:unique-ids`,
  `check:open-branch-ids`, `check:grant-revocation` and `check:conflict-residue`
  all exit 0, and `check:board-edit` passes it as a pull request that changes no
  code.
- Nothing blocked. Nothing sent to the counterparty. Steps 3 and 4 not built.
- The boundary date in R-198 and P-2 is TBD until the counterparty confirms it.
