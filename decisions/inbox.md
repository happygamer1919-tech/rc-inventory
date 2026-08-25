# Decisions inbox

Where Ivan's answers land, and where they become binding.

## How this works

1. A terminal hits a decision it cannot make on its own authority. It follows
   the skip-not-halt rule in CLAUDE.md section 4: fills the card's `question`
   field with the structured decision-needed text and a recommendation, sets
   `blocked_on` to the person who owes the answer, sets `status` to `blocked`,
   commits the board, and **moves to the next eligible card**. The run never
   waits.

2. The open questions are read off the board. Every card whose `blocked_on` is
   not null is a question someone owes an answer to, with the ask and the
   recommendation already written on the card.

3. **Ivan answers on Telegram**, in batch, whenever suits him. Those answers are
   pasted into this file, verbatim, under a new dated entry. Verbatim matters: a
   paraphrase is a second decision made by whoever paraphrased.

4. **POC commits them as rulings.** The POC terminal turns each pasted answer
   into a RULING entry below, then unblocks the affected cards: clears
   `blocked_on`, sets `status` back to `todo`, and logs the ruling in the card
   `notes` so the reason travels with the work.

An answer that is not in this file is not a ruling. A verbal yes that was never
pasted here does not exist, because the next session cannot see it.

## Rules

- **Verbatim first, interpretation second.** Paste what Ivan wrote, then write
  the ruling underneath it. If the two ever disagree, the verbatim text wins.
- **One ruling, one entry.** Do not edit an old ruling. A changed mind is a new
  dated ruling that supersedes the old one by id, so the history of the decision
  stays readable.
- **Every ruling names the cards it unblocks.** A ruling that unblocks nothing
  is either premature or belongs in CLAUDE.md as a standing rule instead.
- **Never a credential.** No secret value is ever pasted here, no matter how it
  arrived. Variable names only.
- **A ruling that keeps recurring becomes a standing rule.** If the same class
  of question is answered three times, stop asking: promote it to a card
  `defaults` field or to CLAUDE.md, and say so in the ruling.

## Entry format

```
### R-NNN - <one line naming the decision>
**Date:** YYYY-MM-DD
**Asked on:** <card ids>
**Answer, verbatim:**
> <exactly what Ivan wrote>

**Ruling:** <what this means for the build, in one or two sentences>
**Unblocks:** <card ids, with what changed on each>
**Supersedes:** <R-NNN, or none>
```

---

## Open

Read off the board, not maintained by hand. As of 2026-08-25:

| Card | Owed by | Ask |
|---|---|---|
| ~~P2-01~~ | ~~ivan~~ | **Closed 2026-08-25.** Migration 0001 applied by Ivan, verified by EXECUTOR with a three-phase journal under R-001. |
| ~~P2-02~~ | ~~ivan~~ | **Unblocked 2026-08-25** by R-001. Accounts created and `.env.local` written by EXECUTOR. |
| P2-08 | andre | Confirm the Make.com webhook contract sent 2026-08-25. Recommendation on the card: proceed per the contract as sent. |
| P2-12 | ivan | Connect the client domain in Vercel and confirm HTTPS. Click steps written out on request. |
| P2-13 | ivan | Execute the credential rotation checklist and tick every box in the committed document. |
| P2-14 | client | Mihai runs one full cycle himself on production, unassisted. |

The three steps that blocked the board on 2026-08-25 are all done. Ruling R-001
delegated them, and they were executed the same day:

1. **Migration 0001 applied.** By Ivan, before the ruling landed. EXECUTOR
   verified it rather than re-applying: pre-check found the schema already
   present, the apply attempt failed on `type "app_role" already exists` and
   rolled back whole, and the post-check confirmed 11 tables all with RLS and
   non-zero policy counts, 6 enums with exact labels, and an IDENTICAL
   table-name diff against the committed file.
2. **The two dev accounts exist**, created through the auth admin API with their
   `profiles` rows and roles set explicitly.
3. **`.env.local` written**, mode 600, gitignore confirmed before writing.

**One thing to fix on your side before P2-12:** `NEXT_PUBLIC_SUPABASE_URL` in
`phase2.env` is not the bare project origin. It carries a `/rest/v1/` suffix,
which breaks supabase-js and the auth admin API when anything appends an
endpoint to it. `.env.local` was written with the normalised origin. **Check the
Vercel environment for the same defect.**

---

## Rulings

### R-001 - Migration apply delegated to EXECUTOR until P2-13
**Date:** 2026-08-25
**Asked on:** P2-01, P2-02
**Answer, verbatim:**
> RULING: MIGRATION APPLY DELEGATION. EXECUTOR is authorized to apply migrations
> to the RC Supabase project while it contains zero real client data. Amend
> CLAUDE.md in a PR: replace the migrations section with the delegated doctrine:
> (1) migrations still authored as files in PRs; (2) EXECUTOR sources
> /Users/ivan/rc-secrets/phase2.env with set -o allexport, this is the single
> permitted read in /Users/ivan/rc-secrets, values are never echoed, printed,
> logged or committed anywhere; (3) the database connection string is derived at
> runtime: project ref extracted from NEXT_PUBLIC_SUPABASE_URL, session pooler
> host for eu-west-1 on port 5432, user postgres.<ref>, password
> SUPABASE_DB_PASSWORD, and connectivity is proven with SELECT 1 before any
> migration work, on derivation or connection failure stop and write the exact
> error to the card question, never guess; (4) every apply runs a pre-check
> listing pending migration files with literal counts, applies inside one
> transaction, then post-checks: table list, rls_enabled per table, policy count
> per table, enum list; the full journal of all three phases goes into the card
> evidence ref; (5) any migration containing DROP TABLE, TRUNCATE or DELETE
> statements is never auto-applied, the card goes blocked_on ivan with the
> statement quoted in question; (6) this grant expires at P2-13: the rotation
> checklist gains revoking this read permission in CLAUDE.md (reverting to
> Ivan-only applies), rotating SUPABASE_DB_PASSWORD and
> SUPABASE_SERVICE_ROLE_KEY, and confirming no terminal-held copies remain.
> Record the ruling in decisions/inbox.md as ruled by Ivan in chat, 2026-08-25.

**Ruled by:** Ivan, in chat, 2026-08-25.

**Ruling:** The Ivan-only migration apply is lifted for the duration of the
build. EXECUTOR applies migrations itself, under a named procedure with a proven
connection, a three-phase journal, a hard stop on destructive statements, and
one permitted secret read. The basis of the grant is that the database holds no
real client data. It is temporary by construction: P2-13 must revoke it in
`CLAUDE.md` and rotate both credentials, and P2-13 is not complete until it has.

**Unblocks:** P2-01 (apply request satisfied, `blocked_on` cleared, card fully
closed) and P2-02 (`blocked_on` cleared; the migration, the two accounts and the
local environment all become EXECUTOR work). Transitively unblocks P2-03 through
P2-07, which were all waiting on P2-02.

**Also changes:** `CLAUDE.md` section 8 is rewritten whole, in the same PR as
this entry. P2-13's card notes gain the four revocation items the checklist must
carry.

**Supersedes:** none. This is the first ruling.

### R-002 - owner_merge retired, and P2-12 extended to cover Resend domain verification
**Date:** 2026-08-25
**Asked on:** the whole board (gate doctrine), P2-12 (scope)
**Answer, verbatim:**
> ADDENDUM RULING FROM IVAN, dated 2026-08-25. Queue this to your next card
> boundary, then continue the wave. Two changes:
>
> 1. GATE DOCTRINE: owner_merge is retired on this board. In your next
> board-touching PR: amend CLAUDE.md and the board doctrine field to state:
> owner_merge is retired as of 2026-08-25 by owner ruling; cards ship on
> green_self_merge discipline: green quality check plus the card's named
> acceptance spec passing; visual and behavioral defect review belongs to the
> CRITIC at wave boundaries and to an optional owner batch review before client
> demo, neither is a merge gate. Flip every card currently carrying gate
> owner_merge to green_self_merge (P2-03, P2-04, P2-05, P2-06, P2-09, P2-10,
> P2-11, P2-12, P2-13). P2-12 and P2-13 keep their blocked_on ivan entries,
> those are owner actions, not reviews. P2-14 stays stakeholder. Launch gate
> conditions still flip to pass only on their named proof: for screen conditions
> that proof is now the named spec green in CI plus EXECUTOR's own
> deployed-screen verification, recorded as evidence. Record the ruling in
> decisions/inbox.md.
>
> 2. P2-12 SCOPE EXTENSION: the card now also covers Resend domain verification.
> Append to its notes and acceptance: alongside the Vercel domain DNS records,
> the Resend domain DNS records (SPF, DKIM) are added in the same DNS panel
> session by Ivan right before launch, Resend dashboard must show the domain
> verified, and the reminder sender switches from the onboarding domain to the
> client domain. Until then P2-10 sends via the Resend onboarding domain,
> RESEND_API_KEY is being filled in Vercel and phase2.env by Ivan today.
>
> Everything else stands. Continue the wave.

**Ruled by:** Ivan, in chat, 2026-08-25.

**Ruling:** Two changes.

*Gates.* `owner_merge` is retired on this board. Nine cards flip to
`green_self_merge`: P2-03, P2-04, P2-05, P2-06, P2-09, P2-10, P2-11, P2-12,
P2-13. Shipping now requires the green `quality` check **and** the card's named
acceptance spec passing, which is a stricter bar than a green check alone.
Defect review moves to the CRITIC at wave boundaries and to an optional owner
batch review before the client demo; neither is a merge gate. P2-14 stays
`stakeholder`. P2-12 and P2-13 keep `blocked_on: ivan`, because those are owner
actions and not reviews. Launch gate conditions still need their named proof:
for screen conditions that is the named spec green in CI plus EXECUTOR's own
deployed-screen verification, both recorded as evidence.

*P2-12.* The card now also covers Resend domain verification: SPF and DKIM
records added in the same DNS panel session as the Vercel records, the Resend
dashboard showing the domain verified, and the reminder sender switching off the
onboarding domain. `RESEND_API_KEY` is being filled into Vercel and `phase2.env`
by Ivan today, so P2-10 is not blocked on it and stays buildable with Resend
mocked.

**Unblocks:** nothing directly. It removes the owner from the merge path of nine
cards, which is what lets a wave run to its end without waiting on a review.

**Also changes:** `CLAUDE.md` gains section 5b. The board `doctrine` field's
gate vocabulary is rewritten. `docs/board/validate-board.mjs` now rejects
`owner_merge` on a planning-contract board, so a future card cannot be authored
with a retired gate.

**Supersedes:** the gate vocabulary carried into the phase 2 board at authoring
time, which quoted phase 1's three gates unchanged. Phase 1's own board is
untouched and keeps `owner_merge` on its nine shipped cards.
