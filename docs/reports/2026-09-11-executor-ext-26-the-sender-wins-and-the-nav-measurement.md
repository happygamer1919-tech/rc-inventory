# EXECUTOR, 2026-09-11: EXT-26, the nav measurement, and a premise that was the opposite of the code

**Role:** EXECUTOR. **Date:** 2026-09-11 UTC. **Input:** an owner dispatch of six
numbered steps, plus three owner decisions delivered mid-session.

**Branch:** `card/ext-26`, cut from `origin/main` at `6ca0ded`.
**Cards:** `EXT-26` shipped. `EXT-24` closed. `P3-40`, `P3-41`, `P3-42`, `P3-43`
authored and not worked.
**Rulings:** `R-189` to `R-192`. `decisions/NEXT-RULING-ID` advanced to `R-193`.
**Migration:** `supabase/migrations/0037_extraction_platform_verdict.sql`.

No credential was read. No signed URL or token was generated, printed or echoed.
`P2-13`, `P2-14` and `GATE-01` were not worked and `CI-04` was not touched.

---

## 1. STEP 0. Verification

| | |
|---|---|
| `origin/main` | `6ca0ded3703608176dcd470e8db5fa8d9dbeb7ee` |
| open pull requests | **0** |

### Can `errorCodeRaw` still reach the persisted `error_code`? YES, on every payload where it is non-null.

**EXT-23 never overwrote a sender-supplied code.** `route.ts:359`:

    const effectiveErrorCode = refusalCode !== null ? refusalCode : errorCodeRaw;

`refusalCode` is non-null only when `scanVerdict` is, and `scanVerdict` was
computed at `:315` only when `documentSource === "scan" && status ===
"extracted"`. And `:139` refuses any `extracted` payload carrying an
`error_code`, while `:136` requires one on `failed` and `partial`. **So
`errorCodeRaw` is non-null exactly when the status is `failed` or `partial`, and
the classifier ran only on `extracted`. Disjoint.** Migration `0008`'s
`extraction_drafts_error_code_matches_status` enforces the same shape in the
database.

| payload | sender's code | persisted |
|---|---|---|
| `failed` or `partial`, scan or digital | non-null, required | **the sender's, always** |
| `extracted`, digital | null, forbidden | null |
| `extracted`, scan, reconciles | null, forbidden | null |
| `extracted`, scan, refused | null, forbidden | **ours** |
| `extracted`, scan, refused, `0034` gate shut | null | null, stored as sent |

**This contradicts the dispatch's own rationale**, *"our looser answer was
overwriting their stricter one silently"*. `R-190` records the correction and
names what is probably the real complaint: **Andre has no way to report a concern
on a payload he considers `extracted`.** The contract forbids an `error_code`
there, so his stricter reading is refused with a `400` before it is stored. Not
overwritten. Refused.

### The sixteen keys, verbatim

    order_id  status  error_code  reason  supplier_name  order_ref  client_ref
    order_date  currency  currency_raw  prices_include_vat  vat_rate
    subtotal  vat_amount  document_total  document_source

No `lines`, no `_meta`, no `order_ref_series`, no `page_count`.

---

## 2. STEP 2. EXT-26

**Four clauses, three of them new behaviour and one of them today's behaviour
made explicit.**

1. **The sender's code is authoritative.** True today by accident, as a
   consequence of a `400` on a neighbouring rule. It is now one expression, so a
   future change to `:139` cannot silently reverse it.
2. **Our classification runs anyway.** New. `classifyScan` now runs on **every
   scan-sourced payload**, whatever the status.
3. **It is recorded.** New. `platform_error_code` and `platform_arm`, migration
   `0037`. The arm matters because five of the six arms carry the same code.
4. **Disagreement is data.** Reachable only because of 2.

**THE SURFACE WIDENS FOR RECORDING, NEVER FOR DECIDING.** Behaviour on every
previously reachable input is byte-identical. `effectiveStatus` still only moves
when the sender sent no code; `dropLines` is untouched; the digital path is
untouched.

**WHERE A DISAGREEMENT CAN ACTUALLY ARISE**, so the acceptance is not a fiction:
on a scan-sourced **`partial`**. EXT-20 narrows only `scan` plus `failed`, so a
`partial` keeps its read lines, the sender sends his code with them, and our
arithmetic can reach a different conclusion.

**NEITHER `route.ts:139` NOR MIGRATION `0008`'s CONSTRAINT WAS TOUCHED.**
Letting a sender send a code on an `extracted` payload is a contract change that
reaches Andre, item 6 of the closed escalation list. `R-190` names the gap and
deliberately leaves it.

---

## 3. STEP 4. The nav measurement. MEASURED, NOT FIXED.

### The headline: this machine does not reproduce 2 to 4 seconds

| measurement | result |
|---|---|
| **Click to content, production build, local DB** | **45 to 113 ms** across all eleven sidebar routes |
| **Server render, full document, warm, local DB** | **0.10 to 0.41 s** per route |
| **Dev mode, warm** | 63 to 241 ms |
| **Dev mode, cold** | 190 to 1061 ms, **except `/inventar`'s first compile at 33 989 ms**, of which only 707 ms was server render |

**Most clicks issue ZERO requests**, because Next prefetches the RSC payload
before the click. In a production build the user pays nothing at click time on a
warm page.

### What IS wrong, and it is wrong on every route

**About 32 database round trips per authenticated render, independent of what
the page shows.** `select xact_commit+xact_rollback from pg_stat_database`
sampled either side of one request, three samples per route:

    /                       40   32   32
    /incarca-comanda        32   32   75
    /adauga-manual          32   32   32
    /clienti                32   46   48
    /proiecte               32   32   32
    /inventar               38   49   32
    /iesiri                 55   32   32
    /comenzi                32   46   40
    /necesar                32   32   32
    /memento                32  110   72
    /setari                 32   32   32

**A floor of exactly 32 on every route is the tell.** `/setari`, which displays
almost nothing, costs the same as `/inventar`.

**The control isolates it to authentication:**

    /api/health   (anonymous)    3   3   3
    /autentificare (anonymous)   2   2   2      <- idle noise is 2 to 3
    /setari       (authenticated)  37  34  47

**So the fixed cost is in the authenticated app shell**: the session read, the
profile and role lookup, the proxy, and the **six** schema-capability probes in
`lib/data/schema-capability.ts`, each its own PostgREST call behind a 60-second
cache that every new server instance starts cold.

**And every sidebar route is `ƒ` dynamic**, server-rendered on demand, from the
build output. None is prerendered, none is cached.

### The arithmetic that explains the owner's number without proving it

On loopback a round trip is 1 to 3 ms, so 32 of them is the measured 0.10 to
0.41 s. **Against a database in eu-west-1 at a 40 ms round trip, 32 sequential
round trips is 1.3 seconds and 65 is 2.6.** That lands inside 2 to 4 seconds.
**It is a projection, not a measurement**, which is why `P3-40`'s first
acceptance clause is reproduction and every optimisation clause is conditional
on it.

### Why the owner's own environment was not measured, AND THE CORRECTION

**Both hosts this repository knows answered 404**, consistent with ruling R-176:

    https://www.rapidconstructmd.com/api/health      404
    https://rc-inventory.vercel.app/api/health       404

**THE SENTENCE THAT FOLLOWED THIS WAS FALSE AND IS CORRECTED RATHER THAN
DELETED**, per CLAUDE.md section 9c. It read:

> *"There is no deployed instance this session could reach, and signing in to one
> would need a production credential this session may not read."*

**The first clause is false and the second is true.** There IS a deployed
instance: **`app.rapidconstruct.md`**, which the owner named later the same day
and which card `GATE-07` repointed `check:deployed-commit` at. The error was not
that the two hosts answered 404; it was concluding from two hosts that the world
had none.

**Measured against the live host on 2026-09-11, read-only, no sign-in:**

    GET https://app.rapidconstruct.md/api/health      0.38 to 0.69s TTFB, ten samples
    GET https://app.rapidconstruct.md/autentificare   0.16 to 0.47s TTFB, five samples

`/autentificare` is a static prerender and touches no database; `/api/health`
reads `applied_ledger_version()`, which is **one** round trip. The client-to-edge
leg is common to both and subtracts out, leaving **roughly 0.25s** for that round
trip plus the endpoint's own work. **It confirms the direction of the local
finding and does not license multiplying 32 by 0.25**: round trips inside one
invocation do not each pay a fresh connection and some may overlap. The
authenticated measurement is still owed and `P3-40`'s first acceptance clause is
still reproduction.

**The measurement tool is not committed**, deliberately: `scripts/` is a CODE
path under `check-board-edit`, so a tool there needs a card whose status moves.
The numbers are committed here and in `P3-40`'s `defaults`, and the method is
written out so it can be re-run.

---

## 4. STEPS 3 and 5, and the mid-session decisions

**`EXT-24` closed** on Andre's evidence, `R-191`. Contract section 4.1a returns
to **sixteen** fields, `order_ref_series` leaves that list, the superseded text
is quoted and marked. **Card EXT-11 and migration `0036` are untouched**: what
was wrong was the claim that this one narrowed shape carries the field
separately. **The page-count half of EXT-24 is NOT answered**, and closing the
card would have silenced it, so it is written into the card's notes, into R-191
and here. No card was authored for it: the dispatch named three cards and none
was this one.

**`P3-41`, `P3-42`, `P3-43` authored** from step 5 and not worked. `P3-42`
records in terms that the threshold capability **already exists** and that this
is about reachability. `P3-43` carries the owner's exclusion list verbatim in
`defaults` rather than only in notes, because a scope boundary that lives only in
the history gets crossed.

**`R-192` records the three owner decisions** delivered mid-session. Four
currencies, one currency per document with no FX anywhere, and the CRM phase
opening while `P2-13` stays parked. Contract section 4.2d is the doctrine half.
**The currency enum in the database is NOT edited**: `0001` is applied and a
migration is never edited afterwards, so `USD` needs its own card. It was not
authored, and that is flagged below.

---

## 5. The acceptance, run

**Stack:** a scratch workdir with this repository's `config.toml` on ports 54820
to 54822, `supabase db reset` replaying all 37 migrations, then the six CI seeds.

**RED before**, new cases against the stashed implementation:

    27. EXT-26  Error: verdictul nostru se inregistreaza
                Expected: "reconciliation_failed"   Received: null
    30. EXT-26  Error: si este inregistrat si ca al nostru
                Expected: "reconciliation_failed"   Received: null

**Case 29 and review case 15 PASSED in the red arm, and that is reported rather
than dressed up.** 29 asserts two nulls, which were null before the change, so it
is a control. Review 15 asserts the screen shows the sender's sentence, **which
was already true** and is exactly the STEP 0 finding: the sender's code was never
overwritten. It is a proof of the precedence, not a red-to-green.

**GREEN after:** all five EXT-26 cases pass.

**CI, run 4, `e8b3dae`: 194 passed, 1 failed, 19.7m.** Every EXT-26 case passed,
including case 27. The single failure was `headers.spec` case 5 refusing the
unjournalled migration. `APPLY-LOG.md` now carries the `0037` entry, written
before the merge in the shape `0035` and `0036` use, and `headers.spec` passes
5 of 5 locally against a production build.

**Gates:** `validate-board.mjs` 0 violations on three boards;
`check:no-destructive-migration` 1 file, 10 statements, every kind classified;
`check:unique-ids`, `check:grant-revocation`, `check:conflict-residue`,
`check:board-edit`, `check:board-clock` all exit 0; `npx tsc --noEmit` exit 0.

---

## 6. Deviations, flagged and not self-ratified

1. **The dispatch's rationale for STEP 2 was false about the shipped code**, and
   the card shipped anyway on a corrected premise. `R-190`.
2. **EXECUTOR wrote four rulings**, which is POC's work. Instructed, and the
   third session running in which this happens.
3. **`EXT-24` closed with its own title question unanswered.** Instructed. The
   finding is preserved in three places and no card carries it.
4. **`USD` is ruled and not carded.** `R-192(a)` adds a currency to a set that is
   written out in four places in code and schema, and nothing implements it. A
   card is recommended and was not authored, because the dispatch asked for a
   ruling and named no card.
5. **The local full suite was not usable on this machine, across three runs.**
   They produced **six**, then **eight**, then **thirteen** failures, in
   **different and disjoint sets of SHIPPED cases**, degrading as the machine
   loaded up. The third run took 21.5 minutes against the 2.4 minutes the same
   two specs took earlier in the day, and **none of the thirteen was an EXT-26
   case**. Every one was a UI or timing failure:
   `element(s) not found`, `locator.fill: Test timeout of 120000ms exceeded`,
   `setInputFiles` timeout, and `[WebServer] Error: The destination stream closed
   early`. **Not one was an assertion about `error_code`, `platform_error_code`
   or `platform_arm`.** Load average was 30.7 and then 16 to 18, with five
   Supabase stacks and a stray dev server from another session on the machine.
   **Two runs with disjoint random failure sets is resource starvation, not a
   defect**, and the authority for the suite is the `End to end` step of
   `quality` on a clean runner.
6. **Four CI runs were spent on four defects of mine, and the pattern is the
   finding rather than any one of them.** Each was caught by a gate that exists
   for it, and **each of those gates was one I had skipped locally**:

   | run | gate | what it caught |
   |---|---|---|
   | 1 | `check:board-edit` | the card still `in_flight` while the PR body and this report said `shipped` |
   | 2 | `check:reconciliation` | EXT-23's own surface assertion, firing correctly on this card's deliberate widening |
   | 3 | `check:migrations` | a uuid containing non-hex characters, then an insert missing three of four `not null` columns |
   | 4 | `headers.spec` case 5 | the migration had **no `APPLY-LOG.md` entry at all** |

   **"I ran the gates" meant "I ran the gates that are cheap on this machine."**
   `check:migrations` needs Docker; `headers.spec` needs a production build. Both
   were skipped while the machine was loaded and both held a defect. The fourth
   run's failure is the one that matters on its own terms: an unjournalled
   migration is what ruling R-013 was written for, after `0006` was found applied
   with nobody able to say by whom. Five `LEARNINGS` entries carry the classes.
7. **I pushed a card that the board still called `in_flight`, and said `shipped`
   in the pull request body and in this report before the board said it.**
   `check:board-edit` refused the pull request at step 9 of 56 on run
   `34610075560`. **That is the exact `#195` shape the check was built for**, and
   RULE-06's own header says it was already broken twice by terminals that
   believed they were obeying it. Third time. The mechanism worked; the terminal
   did not.

**Nothing in this section is ratified here.**

---

## 7. State at the end

Phase 2: **6/9**. Phase 3: **0/9**.

**What the next session should know first:**

1. **`EXT-25` is still the highest-value unworked card**: Andre has not been told
   that `unreadable_document` now has two emitters, and `EXT-26` has now added a
   second contract-facing fact he will want.
2. **`USD` has a ruling and no card.** See deviation 4.
3. **`P3-40` must reproduce before it optimises.** Its baseline is committed.
4. **`P2-13`'s parking has a condition nothing enforces:** it holds only while no
   real client data is entered.
