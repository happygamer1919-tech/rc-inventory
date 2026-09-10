# EXECUTOR, 2026-09-10: EXT-23. The code that was in the enum, on the screen, and never emitted

**Role:** EXECUTOR. **Date:** 2026-09-10 UTC. **Input:** an owner dispatch of five
numbered steps.

**Branch:** `card/ext-23`, cut from `origin/main` at `18f3cb1`.
**Cards touched:** `EXT-23` shipped, `EXT-25` authored, `EXT-24` question
sharpened and still blocked on **andre**.
**Ruling written:** `R-188`. `decisions/NEXT-RULING-ID` advanced to `R-189`.
**No migration was added.** No credential was read, no signed URL or token was
generated, printed or echoed, and `P2-13`, `P2-14`, `GATE-01` and `CI-04` were
not touched.

---

## 1. STEP 0. Verification

| | |
|---|---|
| `origin/main` | `18f3cb17a5dc839c86212169686cad9911bd8ff3` |
| open pull requests | **0** |
| bucket | **`rc-docs`**, private. `DOCS_BUCKET` at `lib/data/inbound-types.ts:27`, created by `supabase/migrations/0002_rc_docs_bucket.sql` |
| object path | **`_samples/andre/aviz-scan-matnord-0021884.pdf`**. `BUCKET` and `PREFIX` at `scripts/ext/serve-sample-documents.mjs:33-34` |

EXT-23's acceptance as it stood was reported verbatim to the owner and is not
repeated here; the board carries the rewritten one and the reason it changed.

**THE BOOT REPORT SAID `P3-14` AND THE DISPATCH SAID `EXT-23`.** A dispatch
claiming a card by id is the documented remedy for the pick order, and R-183
names it in terms. The card was worked on the owner's instruction rather than on
the board's order, and that is flagged rather than assumed.

---

## 2. STEP 2. What EXT-23 shipped

### The defect, in one line

**The callback emitted `reconciliation_failed` for every refusal it could
produce, on every input.** `unreadable_document` was in the enum since migration
`0008`, had a shipped Romanian sentence, was asserted by two end-to-end cases,
and **was never emitted by us**. Ruling R-187 derived the ruled split arm by arm
and found four of the five arms wrong.

### The branch

`classifyScan` in `lib/data/reconciliation.ts` is the one place the decision is
made. It returns a **named arm** beside the code, so a proof can ask for each arm
by name rather than inferring it from a code two arms share:

| arm | code | |
|---|---|---|
| `header_inconsistent` | `unreadable_document` | **evaluated first, dominates** |
| `no_lines` | `unreadable_document` | includes the printed-total-is-`0` case |
| `line_total_missing` | `unreadable_document` | classified by the owner in this card |
| `target_missing` | `unreadable_document` | |
| `anchor_unknown` | `unreadable_document` | flag null, neither total matches |
| `line_sum_missed` | `reconciliation_failed` | **the only arm that carries it** |

**THE ORDER IS THE ONLY OBSERVABLE PART OF THE DESIGN AND IT IS A DECISION.** A
document whose header does not add up AND whose line sum missed is
`unreadable_document`. Without a fixed order the same document would get
different codes depending on which check happened to run first.

**A `not_run` HEADER CHECK IS NOT A REFUSAL, and that is not invented here.**
EXT-18's own card says a missing figure does not reject on its own and that
EXT-16's target-null rule is what rejects a document that cannot be reconciled at
all. Case 20.2 asserts it and is unchanged.

### The two arms the ruling did not cover, both resolved by the owner

1. **Zero lines whose selected total is itself `0` reconciled and was never
   refused**, because `|0 - 0|` is inside the `0.05` floor. It was stored
   `extracted`, no lines, as a clean read. It is now `no_lines`. **This is the
   one R-187 found and it is now measured**, see section 3.
2. **`line_total_missing` was unclassified.** It is `unreadable_document`: a line
   without a total cannot be reconciled, and the action is a better copy.

### No input reaches the default, and the proof is not this file

The default branch assigns `verdict` to a `const unreachable: never`, which
compiles only while typescript has exhausted the union. **`npx tsc --noEmit` is
what enforces it**, as its own step in `quality`. `check:reconciliation` section
9f asserts the guard is **still present**, because a guard somebody deletes makes
typescript silent and the claim would then be true of nothing.

### The capability gate is narrowed, not removed

R-187 asks in terms that a fix must not remove it. It is not removed. It is
narrowed to the one code migration `0034` added. `unreadable_document` has been
in the enum since `0008`, so gating it would mean asking the database whether it
knows a label we are not writing. **If the gate were ever shut, a document with
no trustworthy anchor is still refused**, which is strictly better than today.

### The surface is unchanged

Scan-sourced and `extracted` only. The digital path is untouched and cases 14,
20.3 and 15b.2 assert it.

### The copy, and the tension with EXT-19

EXT-19's finding is that each code carries **one** instruction, because telling
the operator the wrong one wastes their time. A code covering two situations with
different actions cannot leave that shape untouched. The card's own `defaults`
pre-authorised the third of three shapes and that is what shipped: **one sentence
that names both situations and conditions each remedy on which one the reader
has.**

    Documentul nu poate fi folosit așa cum a fost citit: fie conținutul nu se
    poate citi, fie cifrele tipărite pe el nu se potrivesc între ele. Verifică
    documentul pe hârtie: dacă textul nu se poate citi, încarcă o scanare mai
    bună; dacă totalurile lui nu se potrivesc între ele, cere furnizorului un
    document corectat.

**The load-bearing assertion is the negative one.** `ACTION_RESCAN`, the
unconditional rescan instruction, is no longer what this code says, and
`review.spec` asserts it is **not** in the sentence. A second assertion proves
the rescan remedy appears **after** the word that conditions it, which is the
machine-checkable form of "nobody is sent to the scanner for a document a scanner
cannot fix."

---

## 3. The acceptance, run

**Every arm carries its own named case.** The rewritten acceptance is on the
board; this is what was run.

### The stack

R-156 ruled that a red-before **cannot** be produced inside `quality`:
`check:board-edit` refuses a tests-only push at step 9 of 56 and `End to end` is
step 55. It moves the red-before to the local stack, with the command and the
failure output quoted. That is what was done.

A scratch workdir carrying this repository's `supabase/config.toml` on ports
**54720 to 54722**, because `54321` and `54322` were held by another project on
this machine. `supabase start`, `supabase db reset` replaying all 36 migrations,
then the six CI seed scripts.

### Baseline first, before anything was judged

`npx playwright test tests/e2e/extraction.spec.ts` on the **unchanged tree**:
**35 passed in 1.5m.** The harness was proved to work before it was used to judge
a change.

### Red before

Both specs against the unchanged router and label: **5 failed, 47 passed.**

```
15.  Expected: "unreadable_document"   Received: "reconciliation_failed"
15b. Expected: "unreadable_document"   Received: "reconciliation_failed"
18.  Expected: "unreadable_document"   Received: "reconciliation_failed"
19.  Expected: "unreadable_document"   Received: "reconciliation_failed"
review 14.
  Expected substring: "Verifică documentul pe hârtie: dacă textul nu se poate
    citi, încarcă o scanare mai bună; dacă totalurile lui nu se potrivesc între
    ele, cere furnizorului un document corectat."
  Received string:    "Documentul este într-un format acceptat, dar conținutul
    nu este lizibil. Încarcă o scanare mai bună."
```

**AND THE ONE THAT MATTERED, RUN IN ISOLATION**, because as a sub-case it never
executed:

```
npx playwright test tests/e2e/extraction.spec.ts -g "15c"
  Error: suma a nimic care este de acord cu zero nu este dovada pentru nimic
  Expected: "failed"
  Received: "extracted"
```

**That is R-187's finding, measured.** The payload was not refused at all.

### Green after

Database reset and reseeded between arms, this branch's arm first.

| | |
|---|---|
| both specs | **53 passed, 2.4m** |
| **the whole suite** | **190 passed, 7.4m, playwright exit 0** |
| `npx tsc --noEmit` | exit 0 |
| `npm run check:reconciliation` | exit 0 |

### The new check was proved to fail, four ways

A check that has never been seen to fail is not a check. Each mutant was applied,
run and reverted:

| mutant | exit |
|---|---|
| `anchor_unknown` carries `reconciliation_failed` | **1** |
| the never-guard replaced by a cast | **1** |
| the `no_lines` arm deleted | **1** |
| the capability gate removed from the route | **1** |
| restored | **0** |

### Every non-docker gate, by exit code

All 32 exit 0: `check:card-ids`, `check:board-edit`, `prove:board-edit`,
`check:state-endpoint`, `prove:state-endpoint`, `check:document-url`,
`check:reconciliation`, `check:no-destructive-migration`,
`prove:no-destructive-migration`, `check:unique-ids`, `check:open-branch-ids`,
`prove:open-branch-ids`, `prove:unique-ids`, `check:reset-sql`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`, `prove:schema-direction`, `check:executor-env`,
`check:board-app`, `check:board-clock`, `check:card-order`,
`check:live-fixtures`, `prove:live-fixtures`, `check:grant-revocation`,
`prove:grant-revocation`, `prove:extraction-budget`, `check:action-pins`, plus
`validate-board.mjs` on all three boards with 0 violations.

---

## 4. Defects found while working the card

Four, all appended to `docs/LEARNINGS.md` with the class each belongs to:

1. **A sub-case that never executes proves nothing**, and the one that mattered
   was second. Split into `15b` and `15c`.
2. **A regex over a source list forgets the last element**, because the last
   member of a TypeScript union carries a `;` the others do not. This card's own
   new check reported a declared arm as undeclared on its first run.
3. **A symlinked `node_modules` makes Turbopack refuse the project**, and
   `config.webServer was not able to start` is not a diagnosis: the dev server
   type-checks the specs, so one spec that does not compile stops every spec.
4. **Next rewrites `tsconfig.json` while the suite runs**, and it landed in a
   commit before it was noticed. Reverted with a commit saying why.

---

## 5. STEPS 3 and 4

**`EXT-25` authored, `todo`, `depends_on: ["EXT-23"]`.** `npm run id:free -- EXT-25`
answered FREE.

**THE DISPATCH CALLED IT THE ROUTER CARD AND THE ROUTER SHIPPED IN EXT-23 UNDER
THE SAME DISPATCH'S STEP 2.** That is flagged in section 6 and written into the
card's own notes rather than resolved quietly. What was authored instead is the
**one item R-187 left open that EXT-23 could not close**: `unreadable_document`
now has two emitters, so the value has two meanings on the wire, and telling
Andre is item 6 of the closed escalation list. Its acceptance has two halves: the
message drafted in the pull request but **not sent**, and a proof that accepting
his own use of the code still works, because section 5.2a says accepting an
unknown code is as much a change as sending one.

**`EXT-24`'s question sharpened, not answered, still blocked on andre.** It now
states plainly that contract section 4.1a says **seventeen** fields including
`order_ref_series` while the shipped fixture carries **sixteen** without it, and
asks which is authoritative. **No recommendation is offered on that half**, per
the dispatch. The page-count half keeps its three options and its recommendation.

---

## 6. Deviations, flagged and not self-ratified

1. **`EXT-23` was worked out of the board's pick order.** The next eligible card
   on either board was `P3-14`. The dispatch named `EXT-23` and called it the
   priority.
2. **The card shipped wider than it was authored.** It said `THIS CARD DOES NOT
   ROUTE ANYTHING` in its own `defaults`. The dispatch overrode that sentence,
   which is kept rather than deleted.
3. **STEP 3 asked for a card whose work STEP 2 had already shipped.** `EXT-25` is
   the remaining open item from R-187 rather than the routing. If the owner meant
   something else by "the router card", `EXT-25` is wrong and is corrected rather
   than worked; nothing depends on it and it costs one board edit.
4. **EXECUTOR wrote a ruling.** `R-188` is POC's work by `CLAUDE.md` section 1.
   The dispatch instructed it, and it is the same role-crossing the owner
   ratified as a defect in his own dispatch one step earlier in the same message.
5. **A contract-semantics change shipped ahead of the counterparty being told.**
   `unreadable_document` now has two emitters. The contract records it in this
   pull request; **Andre has not been told**, that is `EXT-25`, and it is a
   communication item before his next delivery. The dispatch said this card
   blocks him, so the ordering is the owner's call and is recorded as his.

**Nothing in this section is ratified here.**

---

## 7. State at the end

Phase 2: **6/9**, 29 eligible, next **`AUT-3`**. Phase 3: **0/9**, **80 cards**
(79 before), **29 eligible** and the count is unchanged: `EXT-23` left the
eligible set by shipping and `EXT-25` joined it. Next is still **`P3-14`**.

**What the next session should know first:**

1. **`EXT-25` is the only thing left on R-187**, and it is the one that reaches
   Andre. It is eligible the moment `EXT-23` merges.
2. **`EXT-24` is owed by andre**, and it now asks two questions, not one.
3. **`CI-04` was not worked**, by instruction. The two flaky specs passed in this
   session's full-suite run, which proves nothing about a flake and is recorded
   only so the next session does not read one green as a fix.
4. **The local stack recipe is in section 3** and is reusable: ports 54720 to
   54722, a scratch workdir, `npm ci` in the worktree rather than a symlink.
