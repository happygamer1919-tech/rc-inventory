# EXECUTOR: GATE-01, the anon write that production refuses

**Run** `20260908-040001`, unattended, CLAUDE.md section 13.
**Role** EXECUTOR.
**Card** `GATE-01`, phase 3 board.
**Date** 2026-09-08 UTC.

---

## What the card asked for

> Phase 3 gate G1 clause 3: a write from a role without permission is refused AT
> THE DATABASE, proven on production, which has never been attempted.

The 2026-08-31 gate audit recorded clause 3 as **never attempted**, because every
anon request that audit made was a **read**. This card is the same call with a
different verb.

Acceptance, verbatim from the card:

> COMMAND, COMMITTED AND RE-RUNNABLE: a script that issues a WRITE against the
> production project with the PUBLIC anon key and no session, against clients,
> contacts and suppliers, and asserts each is refused BY POSTGRES with 42501
> insufficient_privilege or an equivalent RLS refusal. Exit 0 only when all three
> refuse. The verbatim response of each is committed in the card's report. PLUS:
> gate condition G1's evidence field on `docs/board/rc-board-phase3.json` records
> clause 3 as MET with that command named, or records what it actually found.

---

## The command

```
set -o allexport; source /Users/ivan/rc-secrets/phase2.env; set +o allexport
npm run prove:anon-write-refused
```

`scripts/prove-anon-write-refused.mjs`, sha256
`c2e90696676fc18db23d0469ce543146ac99097561f26c4487b20d90f2a3e51c`.

**It is not in the `quality` workflow and must not be added to it.** The CI runner
holds no Supabase credential, and pointing a workflow at a production ref is
exactly what `scripts/poc-free/check-no-prod-target.mjs` refuses.

### Three things it asserts before it sends anything

1. **The target is production.** It derives the project ref from
   `NEXT_PUBLIC_SUPABASE_URL` and refuses to run unless that ref is in
   `scripts/production-refs.mjs`. This is the inverse of `assert-not-prod.mjs`
   and it exists for one reason: a green run against a local stack would look
   identical in a report and would be evidence for a claim nobody made. The
   clause says "on production", so the check says it too.
2. **The request carries the anon role.** It reads the `role` claim out of the
   public JWT and refuses if it is anything but `anon`. A refusal from some other
   role is not evidence about the anon role, and a *success* from some other role
   would write a real row to production.
3. **The key and the URL name the same project.**

### The credential question, which this card did not have

**The anon key is public.** It is compiled into the browser bundle by design, so
anyone who has opened the sign-in screen already has it. That is why this card
needed no new credential, no service role key and no owner action, and it is why
it was the cheapest piece of launch readiness left. The key value appears nowhere
in this report, in the board, in the script, or in any log. Only the `role` claim
is printed. CLAUDE.md section 7 is unchanged by any of this.

---

## The run, verbatim

```
==============================================================================
GATE-01: anon WRITE refusal on production
==============================================================================
project ref     bwhzatwwjqmyfesfnisa   (public: it is in the browser bundle)
key role claim  anon
session         none. apikey and Authorization both carry the anon key.
marker          GATE-01 anon write probe 2026-09-08T08:05:52.250Z
tables          clients, contacts, suppliers

------------------------------------------------------------------------------
POST https://bwhzatwwjqmyfesfnisa.supabase.co/rest/v1/clients
body {"name":"GATE-01 anon write probe 2026-09-08T08:05:52.250Z","type":"company","notes":"GATE-01 anon write probe 2026-09-08T08:05:52.250Z"}
HTTP 401 Unauthorized
RESPONSE {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT, INSERT ON public.clients TO anon;","message":"permission denied for table clients"}
OUTCOME REFUSED

------------------------------------------------------------------------------
POST https://bwhzatwwjqmyfesfnisa.supabase.co/rest/v1/contacts
body {"client_id":"00000000-0000-4000-8000-000000000001","name":"GATE-01 anon write probe 2026-09-08T08:05:52.250Z","notes":"GATE-01 anon write probe 2026-09-08T08:05:52.250Z"}
HTTP 401 Unauthorized
RESPONSE {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT, INSERT ON public.contacts TO anon;","message":"permission denied for table contacts"}
OUTCOME REFUSED

------------------------------------------------------------------------------
POST https://bwhzatwwjqmyfesfnisa.supabase.co/rest/v1/suppliers
body {"name":"GATE-01 anon write probe 2026-09-08T08:05:52.250Z","type":"company","notes":"GATE-01 anon write probe 2026-09-08T08:05:52.250Z"}
HTTP 401 Unauthorized
RESPONSE {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT, INSERT ON public.suppliers TO anon;","message":"permission denied for table suppliers"}
OUTCOME REFUSED

==============================================================================
VERDICT
==============================================================================
  table      http  code   outcome
  clients    401   42501  REFUSED
  contacts   401   42501  REFUSED
  suppliers  401   42501  REFUSED

PASS: 3 of 3 writes refused by PostgreSQL with 42501.
Gate G1 clause 3 is MET: a role without permission is stopped at the database.
```

Exit code **0**.

---

## What the refusal actually proves, and what it does not

**It is the GRANT that stopped it, not a policy, and the database said so.** Each
hint reads `GRANT SELECT, INSERT ON public.<table> TO anon`, which is PostgreSQL
naming the privilege the caller lacks. That is migrations `0013_clients.sql`,
`0014_contacts.sql` and `0019_suppliers.sql` each carrying
`revoke all on table public.<table> from anon`, live on production, doing what
they were written to do. Those three revokes are described in their own files as
no-ops, because `0009` already revoked the anon default privilege for the whole
schema. **A no-op that fires is still the layer that answered**, and this run is
the first thing in the repository that shows the two layers producing a refusal
rather than being read off a policy listing.

**Row level security was never reached, and the acceptance line anticipated
that.** It asks for `42501 insufficient_privilege` *or* an equivalent RLS
refusal. Table privileges are checked before policies, so the request stops one
gate earlier than the policies. Both answers are 42501 and both are the clause.

**A SECOND FINDING, RECORDED AND NOT ACTED ON.** A `42501` is an answer *from the
table*. PostgREST replies `404` with `PGRST205` for a relation it cannot find in
its schema cache, so these three responses are also proof that `clients`,
`contacts` and `suppliers` **exist on production**. That is clause 1 of the same
condition, which the 2026-08-31 audit recorded as unevidenced on the premise that
no phase 3 migration had reached production. **That premise was disproved by
R-124 on 2026-09-04**, and P3-27 has run since. Clause 1 belongs to `GATE-02`,
which re-runs the whole audit, and this card does not claim it. It records it.

**G1 is still `fail` and this card did not flip it.** Four clauses, one measured.
Clause 2 (an unauthenticated read returns zero rows) and clause 4 (products carry
a supplier foreign key) were not attempted here. Flipping a gate on one of four
clauses is exactly the failure the gate wording exists to prevent.

---

## Production writes

**Zero rows were written.** Three INSERTs were *attempted* and three were refused
before any row existed.

A row is in `docs/PRODUCTION-WRITES.md` anyway, per CLAUDE.md 8.8, with the
script sha256 and `rows: 0`. That file answers "what has a terminal pointed at
production", and a log that silently omits the requests whose outcome was good is
a log that is wrong about its own coverage. It also means somebody reading the
access logs later finds out what those three POSTs were.

**If that row count is ever not 0, it is an incident and not a bigger number.**
The script does not clean up after itself, prints the row it created, and exits
non-zero. The card's defaults require exactly that: "If any of the three writes
SUCCEEDS, the card does not fail quietly and does not fix it in passing."

---

## Defects hit

**None.** Nothing in `docs/LEARNINGS.md` was appended, per CLAUDE.md section 9,
and this line is the "says so".

The card's own note is worth repeating because it is about a pattern rather than
about this clause: this is the **second** gate condition found closeable with no
card behind it, after the phase 2 G4 on 2026-08-31. Both times the audit
correctly recorded what was missing and nobody converted the cheap half into
work. `GATE-02` is the direct descendant of that observation and it is the next
eligible card.

---

## Board

`docs/board/rc-board-phase3.json`:

- `GATE-01` -> `shipped`, `evidence` carrying the command, the exit code and all
  three verbatim responses, `last_checkpoint` and `notes` updated.
- `launch_gate.conditions[G1].evidence` rewritten to record **clause 3 as MET**
  with the command named, to record what the same run says about clause 1, and to
  keep the 2026-08-31 audit text verbatim underneath it rather than deleting a
  superseded premise. CLAUDE.md 9c.
- `state` on G1 left at `fail`. The gate count is unchanged at **0/9**.
- `as_of` bumped.

`node docs/board/validate-board.mjs docs/board/rc-board-phase3.json` exits 0.

**ONE PROCESS DEVIATION, STATED RATHER THAN LEFT TO BE NOTICED.** CLAUDE.md
section 2 says the `todo` -> `in_flight` flip is committed first, so the board
never shows a card being worked as untouched. This run did not commit that flip
separately: the card went from `todo` to `shipped` in a single commit. The rule
exists so that two actors cannot start the same card, and the exposure here was
the few minutes between the branch being cut and the ship. It is still a
deviation and the next run should not read this as precedent.

---

## The run itself: one card, and why not two

**Cards touched: one.** `GATE-01`, shipped, on pull request **#264**, merged on a
green `quality` run existing for its own head sha under CLAUDE.md 3.1. No other
card was touched, no card was blocked, and nothing was escalated.

**`GATE-02` was the next eligible card and was deliberately not started.** It is
an audit of all nine phase 3 gate conditions, and its own defaults forbid the
only version of it that fits in the time that was left: "EVERY CONDITION IS
RE-DERIVED, NONE IS DECLARED UNCHANGED". Nine conditions, each needing a live
probe and a rewritten evidence field, against a 45 minute cap that was roughly
half spent. Section 13 says do not start work that cannot be finished and merged,
and a half-audit that carries seven conditions forward as "obviously unchanged"
is precisely the failure that card exists to correct.

**Nothing else was claimed and nothing was skipped for being hard.** The lease
file `docs/poc/claims/` was empty of card claims, and the only entry in
`docs/poc/state.json` was a harness claim on `EXT-11`, a card that has already
shipped.

## Next run picks up

**`GATE-02`**, and it is now cheaper than it was this morning. It re-runs the
phase 3 gate audit against a premise P3-27 discharged, and this run has already
handed it clause 3 of G1 finished and clause 1 half-answered by the same three
responses. After it: `P3-14`, `P3-15`, `P3-16`.
