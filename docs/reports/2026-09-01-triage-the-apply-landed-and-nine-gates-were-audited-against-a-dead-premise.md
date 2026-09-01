# TRIAGE, run 20260901-070544: the apply landed four hours before this session booted, the dispatch pointed at the report that predates it, and nine gate conditions were still carrying a premise that had stopped being true

**Role:** TRIAGE. **Run:** `20260901-070544`, unattended, scheduled 07:00 local.
**Worktree:** `/Users/ivan/rc-inventory-poc-run`. **Branch:**
`triage/20260901-070544`, cut from `origin/main` = `96a49cf`.
**Rubric:** `docs/DOCTRINE-TRIAGE.md`, read in full before any write.
**Rulings:** R-083 to R-089. **Cards authored:** P3-29, P3-30, AUT-19.
**Gates flipped:** none. **Escalations:** three, each with a recommended default.

---

## 0. Boot

The status report was printed before any write, per `CLAUDE.md` section 1.

**The worktree was checked out at `card/aut-10` when this session booted**, which
is this run's own EXECUTOR branch, so the first counts read there. They differ
from `main` and both are recorded, because a boot report that quietly reads a
branch is a boot report about work that has not landed.

| board | shipped | in_flight | todo | blocked | launch gate |
|---|---|---|---|---|---|
| phase 2 at `card/aut-10` | 39 | 1 | 15 | 2 | 6/9 |
| phase 2 at `origin/main` | 36 | 1 | 16 | 2 | 6/9 |
| phase 3 at `origin/main` | 15 | 0 | 16 | 2 | 0/9 |

The difference is three cards shipped and two cards authored, AUT-5 and AUT-6, on
an open branch. Next eligible card at `main`: **AUT-10** on the phase 2 board,
**P3-12** on the phase 3 board. TRIAGE takes neither; section 1 asks for them.

---

## 1. The input, which was again not the newest, and this time in a new way

**The dispatch named `docs/reports/2026-08-31-executor-p3-27a-applier.md`**,
committed in `f420d02` at `2026-09-01T01:56:36+03:00`. **The newest committed
executor report is `docs/reports/2026-08-31-executor-p3-27-apply.md`**, committed
in `db88f80` seventy-eight minutes later. **Both are triaged here**, and R-083
records why: unlike the last occurrence, the named report was genuinely
untriaged, so this is not a repeat of the fault AUT-17 was authored for. It is a
second fault of the same organ.

**What the omitted report says, in one line: the thirteen migrations were applied
to the production database on 2026-08-31T23:27:25Z.** The report the dispatch
named ends with "P3-27 is not unblocked by this card", which read alone describes
a tool that has never been used.

**Following the dispatch literally would have produced nine false gate audits.**
Every phase 3 gate condition carried the sentence "no phase 3 migration has been
applied to the RC Supabase project", and every one of them would have been
re-audited against it. AUT-17 keeps its acceptance; this instance is written into
its `notes`.

---

## 2. Deviations, ratified individually, with the test that cleared each

Four, under **R-084**. Three ratified, one escalated. `DOCTRINE-TRIAGE` section 1
says a set ratified as a block is a set nobody read, so each carries its test.

| # | deviation | test | verdict |
|---|---|---|---|
| 1 | the enum pre-phase, a second transaction where 8.5 says one | 3 | **RATIFIED**, R-082 authorises it by name and bounds it four ways |
| 2 | the 60-second memoisation window accepted rather than gated | 4 | **RATIFIED**, the alternative makes P3-27 impossible forever |
| 3 | the harness classifier refused the run and the owner was asked | 2 | **RATIFIED**, and it is the behaviour the rubric wants |
| 4 | EXECUTOR wrote the ruling that authorised its own grant | 3 | **ESCALATED**, and R-082 stays in force meanwhile |

**On deviation 1**, the mechanism is not a preference: a `language sql` function
body is validated at CREATE time, so `0021` uses the enum label `0015` added and
PostgreSQL refuses. The alternative was a batch that rolls back at `0021` against
production. What can outlive a rollback is one unused idempotent enum label.

**On deviation 4**, which is the one worth reading twice. R-082 widens who may
write to the production database, which is item 5 of the closed escalation list,
where the rubric says narrowing is a terminal's to rule and widening is not. Test
3 clears a widening only when a ruling **already** authorised it, and the only
ruling authorising R-082 is R-082. **Nothing is unwound**: R-082 is a committed
entry with an id, the rubric says a committed line is what ratifies, and the
apply it governed is done, journalled, and asserted eleven ways. The escalation
asks the owner to confirm a grant, not to undo a night.

---

## 3. R-082 names Ivan as its decider and records none of his words

**R-085**, and it is a correction forward, never an edit.

R-082 says "Decided by: the owner, in that dispatch, in his own words" and
contains no `Answer, verbatim` field at all. `decisions/inbox.md` opens with
"Verbatim first, interpretation second", its entry format makes that field
required, and the dispatch cited is not a tracked file at any commit here. R-082
also has no `Unblocks` line, though it plainly unblocked P3-27.

**The substance is not in question and the ruling is not touched.** Its bounds
are tight, and the run it governed passed 11 of 11 assertions with zero rows
deleted on any table. What is defective is the provenance record, and the fix for
that is a later entry plus a confirmation from the person named. **That is
escalation 1**, with `IF UNANSWERED: R-082 stands`.

**The standing rule R-085 writes down:** a ruling that names Ivan as its decider
carries his words or does not name him. DOCTRINE-TRIAGE already binds TRIAGE this
way. The failure is not specific to TRIAGE and neither is the rule.

---

## 4. The phase 3 gate audit, re-run against a live premise

**R-086. Phase 3 stays at 0 of 9. Nothing flipped.** All nine were audited clause
by clause and each audit is written into its own `evidence.ref`.

**The blocker all nine shared is discharged.** Thirteen migrations, 202
statements, one transaction, 11 of 11 assertions, ledger at 25 rows with no gaps,
zero rows deleted. **A gate audit that repeats a discharged blocker is worse than
no audit**, because it sends the next session to do something already done.

**One blocker became three, and they are not interchangeable:**

1. **No terminal can see a signed-in production screen.** G3 clause 4, G4, G5
   clause 1. The four CRM routes return 200 and the result is vacuous: they are
   auth-gated and unauthenticated they redirect to `/autentificare`, which is
   what returned the 200. **The executor recorded this as outstanding rather than
   reporting a pass on a 200 that only proves the login page renders**, which is
   why this audit could be honest. **Escalation 2.**
2. **No real data exists.** G2 clause 3, G5 clause 2. Zero products, zero
   outbound issues, zero inbound orders, zero batches. G5 clause 2 is the
   client-acts kind of gate and **must not be read as backlog**.
3. **The card is simply not built.** G6, G8, G9 and half of G7. Sessions, nothing
   else.

### The test this audit had to write down, because G2 would otherwise have flipped

**A clause whose only evidence is the subject of an open escalation does not
close a gate.** G2 clause 3 wants a count of outbound issues with no project,
zero, taken read-only and pasted. It was taken, it is zero, it is pasted, and it
is zero over an empty table. Whether such a zero satisfies an acceptance is the
exact question P3-04b is asking Ivan right now. Flipping G2 on it would answer
his question for him and make his ruling retroactive. Stated as a test rather
than decided as an instance, because two TRIAGE runs must reach the same answer.

### G1 is three clauses done and one command short, and nobody had recorded it

| clause | state | evidence |
|---|---|---|
| 1. client, contact, supplier tables on production | **MET** | post-check grid, RLS on, 3 policies each, fresh connection after commit |
| 2. unauthenticated request returns zero rows | **MET, STRONGER THAN ASKED** | anon key answered `42501 insufficient_privilege`, which also proves PostgREST reloaded its schema cache |
| 3. a write from a role without permission refused at the database | **NEVER ATTEMPTED** | every anon request that night was a read |
| 4. products carry a supplier foreign key | **MET** | `products.supplier_id` present |

Clause 3 is the same call with a different verb and the same public key. **P3-30**
is authored for it, needs no new credential and no owner action, and is the
cheapest gate work on either board.

**This is the second time a gate has turned out to be closeable with no card
behind it.** R-080 found the same shape on the phase 2 G4 yesterday and authored
P2-20. Both times the audit correctly recorded what was missing and nobody
converted the cheap half into work.

---

## 5. The phase 2 gate audit, and a correction of form

**R-087. Phase 2 stays at 6 of 9. Nothing flipped.**

**All three failing conditions carried `evidence: null` while their audits sat in
`notes`.** The rubric names `evidence.ref` and the phase 3 board does it
correctly. An audit filed where the rubric does not say to look is an audit the
next session finds by luck. The new audits are written to `evidence.ref` and the
existing `notes` are left exactly as they are.

**G7 moved and nothing announced it.** Its second precondition, migration
`0006_reminder_recipients` applied to production, is discharged by last night's
ledger reconciliation. The gate still fails on `RESEND_API_KEY` in the production
environment, a panel action unanswered since 2026-08-26, and on one real email
from a real threshold crossing, which is client use. **The gate is unchanged and
the reason it fails is one clause shorter.**

**G4** is re-stated rather than re-derived: R-053 replaced its deciding clause,
R-080 found three of five clauses already green, P2-20 covers the other two, and
the sentence "no terminal can close this gate" is superseded and not repeated.
**G9** cannot be flipped by any terminal ever: it needs Mihai himself. There is
no card that closes it and there should not be one.

---

## 6. The finding neither report contained: the only lawful path to production refuses the board

**R-088**, and it came from reading the applier rather than the report's account
of it.

`scripts/apply-pending-migrations.mjs` carries an assertion whose failure message
is, verbatim:

```
ASSERTION FAILED [free-text-columns-untouched]: a column this batch must NOT drop
is gone: %. The drops are P3-04b and P3-05b.
```

**It is unconditional.** It raises whenever `outbound_issues.client_name`,
`outbound_issues.project_name` or `products.supplier_name` is absent after a
batch, on every future run, and **it names the two cards it will refuse**. The
author saw the collision and left no off-ramp.

**Why this is a stop and not a nuisance.** R-082 makes this one script the only
lawful route from a merged migration to the production database. A batch
containing either drop rolls back **whole**, taking down every unrelated
migration alongside it. Neither card's acceptance requires an apply, so the file
would merge green and the wall would be hit by whoever ran the next batch, on a
card with nothing to do with either.

**Two more assertions have the same shape.**
`one-create-outbound-issue-five-args` pins `create_outbound_issue` to exactly
`(text, text, text, jsonb, uuid)` and would refuse any later migration that
legitimately changes it. `ledger-0010-0011-0012-present` asserts a one-time
repair forever and **stays as it is**, because it is now permanently true.

**P3-29** is authored to turn the batch-specific assertions into declared intent.
Its `defaults` forbid the shortcut: the declaration lives in the migration file
and is parsed, never passed at the prompt, because both R-047 and R-082 rest on
the script deciding rather than the terminal choosing. **The absolute exclusion is
untouched: `DROP TABLE`, `TRUNCATE` and `DELETE` stay refused with nothing
executed, and no declaration reaches them.**

P3-04b and P3-05b each gain the edge. Neither is unblocked and neither question
is touched.

---

## 7. The board sweep, all four checks, both boards

**R-089**, run mechanically rather than by eye.

- **Dangling: none.** Every `depends_on` id on both boards resolves.
- **Satisfied but blocking: three, all correct.** P2-08b on `andre`, who owes the
  webhook contract. P3-04b and P3-05b on `ivan`, who owes the vacuous-zero
  ruling. Nothing cleared.
- **The capability edge, and it has now gone unauthorable twice.** P2-13 takes
  away the migration-apply grant. **R-082 created a new grant of that class after
  R-072 wrote P2-13's capability clause**, so the clause could not have known
  about it. `CLAUDE.md` 8.7 covers R-082 only by the blanket "reverting section
  8", and a checklist that names two grants by id and leaves the third to a
  blanket is a checklist that will revoke two. P2-13's acceptance now names R-082
  explicitly. No `depends_on` edge is added: the dependent cards are on the other
  board and the validator requires same-board ids.
- **Edges on split cards: eleven, all correct as they stand**, re-derived rather
  than declared unchanged. P3-08, P3-09, P3-11, P3-13c and P3-14 need P3-04's
  foreign key and not P3-04b's drop; P3-10 the same on P3-05; P3-04b and P3-05b
  depend on P3-27, the apply, not on P3-27a, the applier.

**A stale acceptance line is corrected in the same sweep.** P2-13's capability
clause ended "THIRTEEN FILES ARE PENDING TODAY". None are. The box is kept and
deliberately not converted into a statement of fact: it is a precondition to be
re-checked on rotation day against whatever the highest migration number is then.

---

## 8. The three escalations, each with its recommended default

Full text in `docs/poc/triage-latest.json`. Summarised here with the item of the
closed list that put each one there.

1. **Confirm the R-082 grant.** Item 5, widening access to an environment.
   Recommended: confirm it stands as written; the substance was proven against a
   throwaway database five ways before it was used, and what is defective is the
   paperwork. `IF UNANSWERED: R-082 stands`, because a committed ruling is what
   counts here.
2. **A live-site sign-in, by name only.** Items 5 and 7. Recommended: reuse the
   existing test owner account that rotation day retires anyway. The same
   terminal already holds the database password and the master key, both strictly
   more powerful than a login box. It buys four readiness conditions moving from
   never checkable to checkable tonight. `IF UNANSWERED`: those four stay
   unproven whatever ships.
3. **The empty-table zero, third night.** Item 9. Recommended: yes, delete now,
   and record on both cards that they went ahead on a vacuous zero. `IF
   UNANSWERED`: nothing breaks, and the same fact keeps living in two places that
   can disagree the moment real work arrives.

---

## 9. One learning, and the card deliberately not authored for it

`docs/LEARNINGS.md` gains an entry: **`scripts/poc/notify.mjs` truncates every
escalation recommendation to 160 characters**, which is the one field the rubric
calls mandatory, and the cut is silent. The three escalations here were rewritten
to carry the action in their first 160 characters.

**No card is authored, on purpose.** AUT-5 and AUT-6 shipped a second digest
path, `scripts/poc/plain-digest.mjs`, on an open branch the same night. A card
written against `notify.mjs` from `main` would be a card against a renderer that
may be on its way out, which is section 5's rule against two cards for one
problem applied to a moving target. The next TRIAGE that still sees the
truncation on `main` should author it.

---

## 10. What this run did not do

- **Shipped nothing, merged no card pull request, applied no migration, wrote no
  application code and no test, edited no existing ruling.** The whole output is
  text in `decisions/inbox.md`, two board files, one learning and this report.
- **Flipped no gate.** Two boards, twelve failing conditions, all audited, none
  met in full.
- **Did not re-audit the six passing phase 2 conditions.** The rubric's section 4
  is written for gates at `fail`, and nothing in either report bears on a passing
  one.
- **Did not touch P3-04b or P3-05b's `blocked_on`, `status` or `question`.** The
  question was rewritten by last night's run and it is still Ivan's.

**One thing the next session should expect:** this pull request appends to the
`cards` array of `docs/board/rc-board-phase2.json`, and so does the open
`card/aut-10` branch. A conflict there is likely and it belongs to EXECUTOR under
R-052, resolved locally against the full tree with the validator run before the
commit, never in the web editor.

---

## 11. Commands run, all read-only except the writes named above

```
node docs/board/validate-board.mjs docs/board/rc-board.json \
  docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
  PASS  docs/board/rc-board.json  (0 violations)
  PASS  docs/board/rc-board-phase2.json  (0 violations)
  PASS  docs/board/rc-board-phase3.json  (0 violations)

npm run check:conflict-residue
  check-conflict-residue: 3 checks passed, no conflict residue in the tree.
```

The validator was run before every commit, per `CLAUDE.md` section 2. No
credential was read, echoed, logged or committed by this session; the only
secrets referenced anywhere in this report are variable names.
