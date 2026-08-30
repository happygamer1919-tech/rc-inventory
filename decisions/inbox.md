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

Read off the board, not maintained by hand. As of 2026-08-26:

| Card | Owed by | Ask |
|---|---|---|
| ~~P2-01~~ | ~~ivan~~ | **Closed 2026-08-25.** Migration 0001 applied by Ivan, verified by EXECUTOR with a three-phase journal under R-001. |
| ~~P2-02~~ | ~~ivan~~ | **Unblocked 2026-08-25** by R-001. Accounts created and `.env.local` written by EXECUTOR. |
| P2-08 | andre | Confirm the Make.com webhook contract sent 2026-08-25. Recommendation on the card: proceed per the contract as sent. |
| ~~P2-12~~ | ~~ivan~~ | **Closed 2026-08-26.** DNS verified: apex 308 to www, www 200 on /autentificare, valid certificates on both, zero console messages, all three Resend records present, Resend status VERIFIED by owner confirmation. The delivered-email clause was withdrawn from the acceptance in writing and moved to P2-13 as items (e) and (f), because there is nobody to send to yet. |
| P2-13 | ivan | Execute the credential rotation checklist and tick every box in the committed document. |
| P2-14 | client | Mihai runs one full cycle himself on production, unassisted. |
| P2-15 | ivan | Run `scripts/reset-test-data.sql` on production, or rule that the e2e residue stays. Nine DELETE statements quoted verbatim on the card. Recommendation on the card: run it, once, after P2-12 and before the first real data. |
| ~~G7 (0006)~~ | ~~ivan~~ | **Closed 2026-08-26.** Migration 0006 was already applied when EXECUTOR reached the pre-check under R-007. Not re-applied, verified read-only instead: the function exists, SECURITY DEFINER, search_path pinned, no PUBLIC and no anon in its ACL, one recipient returned, and the public function count is 9 against the CRITIC baseline of 8. Who applied it is not recorded: the journal table has no timestamp and no actor column. |
| G7 (live send) | ivan | Still open, and now three things rather than two. `RESEND_API_KEY` present in the PRODUCTION Vercel environment; one real delivered email from a real crossing; and a REAL recipient address. `owner_reminder_recipients()` returns exactly one address today and it is on `rc-inventory.local`, the seeded dev account on a domain that does not exist, so a crossing on production would address nobody. The real accounts are created at P2-13. |

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

### R-003 - CRITIC wave 1 deviations 1 to 9 ratified, wave 1 declared clean
**Date:** 2026-08-26
**Asked on:** the CRITIC wave 1 boundary review (`docs/reports/critic-wave1.md`), P2-13
**Answer, verbatim:**
> R-003: CRITIC wave 1 deviations 1-9 ratified by strategy 2026-08-26.
> Deviation 5 (dev password in Vercel edge logs) added as a line item to P2-13
> rotation checklist. Wave 1 declared clean, residual test data is an owner
> decision not a defect.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** The nine deviations the CRITIC recorded at the wave 1 boundary are
ratified as a set. None becomes a card. Wave 1 (P2-01 through P2-07, plus
CRIT-10 through CRIT-14) is closed clean.

One deviation carries an action. **Deviation 5, the dev account password
recorded in the Vercel edge request logs** by the pre-CRIT-10 login form that
submitted natively and put the password in the URL query string, becomes a
tickable line item on the P2-13 rotation checklist. It is a rotation item and
not an incident card for two reasons: the accounts it affects are the dev
accounts that P2-13 retires anyway, and a log line cannot be unwritten, so the
only available action is to make the recorded value worthless. CRIT-10 stopped
new leaks; it could not remove the ones already logged. The Vercel log retention
window is treated as the exposure period rather than assuming the fix ended it.

**The residual test data on production is an owner decision, not a defect.** The
roughly 300 e2e rows CRIT-11 left in place are not a bug to be fixed by a
terminal. Removing them is destructive work on the project the client is about
to accept on, and CLAUDE.md section 8.6 forbids any terminal applying it. It is
therefore authored, quoted and handed over: card **P2-15** carries the full
statement set in its `question` field and is blocked on Ivan.

**Unblocks:** nothing directly. It closes the wave 1 review, adds one checklist
item to P2-13, and authorises P2-15 to exist.
**Also changes:** P2-13 `defaults` gains the deviation 5 rotation item and
`depends_on` gains P2-15. P2-15 is authored.
**Supersedes:** none.

### R-004 - the vercel.app host is not a supported entrypoint
**Date:** 2026-08-26
**Asked on:** P2-12
**Answer, verbatim:**
> R-004: vercel.app host is not a supported entrypoint. Deployment Protection
> stays enabled. P2-12 default rewritten: client domain www.rapidconstructmd.com
> is the only public URL, no expectation that any vercel.app host serves
> anonymously.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** Vercel Deployment Protection stays **enabled** on the project. The
project alias answers 302 to `vercel.com/sso-api` for any client that is not
signed in to the Vercel team, and that is the intended posture, not a
misconfiguration to be turned off. **`www.rapidconstructmd.com` is the only
public URL of this application.** No card, no test, no runbook and no acceptance
line may assume that any `vercel.app` host serves an anonymous request, and
there is no fallback way in through one.

P2-12's `defaults` carried the opposite assumption and is rewritten. The
superseded sentence is quoted verbatim inside the new default text rather than
deleted, so the edit adds a record instead of erasing one. The CRITIC raised it:
section 1 of the wave 1 report could not exercise the `vercel.app` host at all,
and noted that the fallback the default protected did not exist for anyone
outside the Vercel team. The bare `rc-inventory.vercel.app` is a different
owner's project entirely, so anyone testing that host is testing someone else's
site.

**Unblocks:** nothing. P2-12 stays `blocked_on: ivan` on the domain connection.
**Also changes:** P2-12 `defaults` rewritten, `notes` records the rewrite.
**Supersedes:** the "THE OLD vercel.app HOST KEEPS WORKING" clause of P2-12's
defaults as authored 2026-08-25.

### R-005 - POC sequencing rule satisfied, POC build authorized
**Date:** 2026-08-26
**Asked on:** the role sequencing question raised at the wave 1 boundary
**Answer, verbatim:**
> R-005: sequencing rule for POC satisfied. POC build authorized, dispatched
> separately.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** The sequencing precondition for standing up the POC role is met. The
POC build is authorized and is dispatched to its own session, separately from
this one. EXECUTOR takes no action on it and does not write POC scope: recorded
here so the ruling is on file and the next session does not re-ask.

**Unblocks:** nothing on this board. It authorises work outside it.
**Also changes:** nothing in this repository.
**Supersedes:** none.

### R-006 - the Telegram owner id may be written to the secrets file, and is not a credential
**Date:** 2026-08-26
**Asked on:** the POC build dispatch, step 5 (`scripts/poc/inbox.mjs`)
**Answer, verbatim:**
> R-006: POC-BUILDER may append exactly one line TELEGRAM_OWNER_ID=<numeric id>
> to /Users/ivan/rc-secrets/phase2.env, read from the from.id of Ivan's messages
> in getUpdates. A Telegram user id is not a credential. No other edit to that
> file. Values of TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID never printed.

**Ruled by:** strategy, 2026-08-26, relayed to POC-BUILDER in the session dispatch.

**Ruling:** The inbox reader needs to know which Telegram account is Ivan, because
it accepts rulings from exactly one sender and ignores every other message. That
sender is identified by `from.id`, a numeric Telegram user id. A user id is a
public identifier: it is visible to any chat participant, it authenticates
nothing on its own, and it grants no access if disclosed. It is therefore
written in the clear, named `TELEGRAM_OWNER_ID`, and it lives in
`/Users/ivan/rc-secrets/phase2.env` for one reason only: that is the file the
POC run already sources, so the reader gets it without a second secret path.

This is a **narrow, one-line write grant, not a read grant**. Specifically:

- POC-BUILDER may append **exactly one line**, `TELEGRAM_OWNER_ID=<numeric id>`,
  and nothing else. No other line in that file is added, edited, reordered or
  removed.
- The value is obtained from the `from.id` field of a message Ivan sent to the
  bot, read through `getUpdates`.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` remain values that are never
  printed, never logged, never committed and never placed in tool output.
  CLAUDE.md section 7 is otherwise untouched: the file is still sourced with
  `set -o allexport` and never catted, grepped or displayed.
- The grant covers writing the id. It does not license reading anything else in
  that file, and it does not extend to any other file under
  `/Users/ivan/rc-secrets`.

**Fail-closed consequence.** Until that line exists, `scripts/poc/inbox.mjs`
accepts **no** message from anyone. An unset `TELEGRAM_OWNER_ID` is not treated
as "accept everything"; it is treated as "accept nothing, and log why". That is
the behaviour that makes an unauthenticated Telegram group safe to read from: a
stranger who messages the bot cannot become the owner by being first.

**Unblocks:** nothing on the board. It authorises step 5 of the POC build, which
is outside the card backlog.
**Also changes:** `CLAUDE.md` gains a POC section that restates the fail-closed
rule, so a session that never reads this file still refuses unknown senders.
**Supersedes:** none. It sits alongside R-001 and R-007 as a narrow, named
exception to section 7 rather than a change to it.

### R-007 - R-001 stands, with a one-shot read granted for migration 0006
**Date:** 2026-08-26
**Asked on:** P2-10, gate G7
**Answer, verbatim:**
> R-007: R-001 remains in force. The environment holds zero real client data,
> the firewall flips at P2-13. This terminal is explicitly granted a read of
> /Users/ivan/rc-secrets/phase2.env for the sole purpose of applying migration
> 0006, values never printed, no connection string echoed, session pooler string
> derived at runtime. Grant expires when 0006 is journalled.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** R-001 is unchanged and still expires at P2-13. On top of it, one
narrow grant: EXECUTOR reads `/Users/ivan/rc-secrets/phase2.env` for the single
purpose of applying `supabase/migrations/0006_reminder_recipients.sql`. Values
are never printed, no connection string is echoed, and the session pooler
connection is derived at runtime per CLAUDE.md 8.4 rather than stored. **The
grant expires the moment 0006 is journalled**, which is a narrower window than
R-001's own expiry at P2-13.

The basis is the same as R-001's: the project holds zero real client data, and
the credential firewall flips at P2-13.

**Unblocks:** gate G7's second precondition, the one recorded on the gate in
PR #22. It does not unblock G7 itself, which still needs `RESEND_API_KEY` in the
production environment and one real delivered email.
**Also changes:** nothing in `CLAUDE.md`. R-001's section 8 already describes the
procedure; this ruling authorises one use of it and sets its expiry.
**Supersedes:** none. It sits on top of R-001.

### R-008 - the two P2-10 decisions are permanent
**Date:** 2026-08-26
**Asked on:** P2-10
**Answer, verbatim:**
> R-008: P2-10 decisions ratified as permanent. A threshold of 0 is not a
> threshold. A reminder disarms on send attempt, not on delivery. Do not
> revisit.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** Both decisions taken inside P2-10 are ratified and are now standing
behaviour, not executor judgement awaiting review.

**A threshold of 0 is not a threshold.** `products.threshold` defaults to 0, so
a product created without one never fires a reminder. Products that need an
out-of-stock alert get a threshold set on the product screen.

**A reminder disarms on send ATTEMPT, not on delivery.** A failed send still
disarms the row; the reason is written to `last_send_error` and shown on
`/memento` as `Netrimis`. There is no automatic retry, because a retry at every
subsequent stock mutation is the same email storm the one-per-crossing rule
exists to prevent, only triggered by a down service instead of by a low
warehouse.

Neither is revisited. A future card that wants different behaviour supersedes
this ruling by id; it does not reopen the question by preference.

**Unblocks:** nothing. It closes two open decisions so they stop being reviewed.
**Also changes:** P2-10's notes gain the ratification, so the reason travels with
the card.
**Supersedes:** none.

### R-009 - P2-15 is a ratified exception, and option (c) is declined
**Date:** 2026-08-26
**Asked on:** P2-15
**Answer, verbatim:**
> R-009: P2-15 is ratified as an exception to cancelled-never-deleted. That
> convention protects evidence of real business events; e2e pollution in client
> production is contamination. The cancel-instead-of-delete variant (option c)
> is declined and must not be built.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** The cancelled-never-deleted convention from P2-07 and P2-13 stands
for everything it was written for, and the reason is now stated: **it protects
evidence of real business events.** An order that was placed, a batch that
arrived, an issue that shipped: those are facts about the warehouse and are
never deleted, only cancelled.

E2E residue is not that. It is contamination in a client production project,
produced by a suite pointed at the wrong environment, and it records no business
event at all. P2-15 is therefore a ratified exception rather than a violation
awaiting argument.

**Option (c) is declined and must not be built.** The cancel-instead-of-delete
variant written into P2-15's question as an alternative is closed. It is not a
fallback, not a safer first step, and not something to offer again.

P2-15 stays `blocked_on: ivan`: the ruling settles what the card is, not that it
has been run. The nine statements still need the owner in the SQL editor.

**Unblocks:** nothing yet. It removes the doctrinal objection to the card, which
is what stood between the card and being run.
**Also changes:** P2-15's notes record the ratification and the closure of
option (c), so a later reader does not resurrect it from the question text.
**Supersedes:** none. It scopes the P2-07 convention rather than overturning it.

### R-010 - PR #22 waits for Actions, and waiting is not the violation
**Date:** 2026-08-26
**Asked on:** PR #22
**Answer, verbatim:**
> R-010: PR #22 stays open until GitHub Actions restores and a green quality run
> exists for its head sha. Merging on an absent check is the violation, waiting
> is not.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** PR #22 (board-only, gate G7) stays open. It is merged when GitHub
Actions has recovered and a green `quality` run exists **for its head sha**, not
for an earlier commit on the branch and not for `main`.

This restates CLAUDE.md section 3 rather than bending it: a merge on a check
that is pending, failed, skipped or absent is a violation regardless of how
obviously correct the change is. An outage makes the check absent, which is the
one condition under which the rule is most tempting to skip and most necessary.
An open PR waiting on infrastructure costs nothing; a board-only change merged
without proof costs the rule.

**Unblocks:** nothing. It authorises an open PR to stay open.
**Also changes:** nothing on the board.
**Supersedes:** none.

### R-011 - TELEGRAM_CHAT_ID was stale, and POC-BUILDER was authorised to correct it
**Date:** 2026-08-26
**Asked on:** the POC build dispatch, step 4 (`scripts/poc/notify.mjs`)
**Answer, verbatim:**
> I author you to do it

**Ruled by:** Ivan, 2026-08-26, answering the question in the POC build session.

**Ruling:** `TELEGRAM_CHAT_ID` held a nine digit positive id that was not Ivan's
Telegram account and was not any chat the bot could reach. Every `sendMessage`
against it returned `Bad Request: chat not found`, so the digest, which is the
entire point of the unattended loop, could not be delivered at all.

It was proved stale rather than assumed stale. Once `TELEGRAM_OWNER_ID` was
resolved under R-006, the two values were compared programmatically and differ,
`sendMessage` to the configured id failed while `sendMessage` to the owner id
succeeded, and the old value's length and a short hash were recorded instead of
the value itself.

R-006 permits exactly one appended line and no other edit to
`/Users/ivan/rc-secrets/phase2.env`, so correcting an existing line was outside
POC-BUILDER's authority. This ruling grants that one correction, and nothing
wider: `TELEGRAM_CHAT_ID` is set to the same numeric id as `TELEGRAM_OWNER_ID`,
because the owner confirmed the digest is meant to arrive as a direct message
rather than in a group. No other line in that file was read out, altered,
reordered or removed, and the file's variable names and line count were checked
before and after to prove it.

**The fallback stays.** `notify.mjs` still falls back to `TELEGRAM_OWNER_ID`
when the configured chat returns `chat not found`, and still prints the
stale-configuration warning when it does. The correct value makes the fallback
silent, it does not make it unnecessary: the next time that id drifts, a digest
should still arrive, loudly, rather than vanish.

**Unblocks:** nothing on the board. It closes the step 4 delivery failure in the
POC build.
**Also changes:** nothing in `CLAUDE.md`. Section 7 stands; this is a named,
one-line, one-time exception to it in the same shape as R-006.
**Supersedes:** none. It sits alongside R-006.

### R-012 - R-007 superseded, the secrets read is granted for the whole board until P2-13
**Date:** 2026-08-26
**Asked on:** the whole board
**Answer, verbatim:**
> R-011: R-007 superseded. EXECUTOR is granted a read of
> /Users/ivan/rc-secrets/phase2.env for any card on this board while the
> environment holds zero real client data. Values never printed. Grant expires
> at P2-13, not per task. Per-task scoping was an authoring error.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**NUMBERED R-012, NOT R-011.** The dispatch asked for this to be R-011, and
R-011 was already taken: POC-BUILDER committed "R-011 - TELEGRAM_CHAT_ID was
stale, and POC-BUILDER was authorised to correct it" earlier the same day, in
PR #34. This file's own rule is that an old ruling is never edited, so the four
rulings in this dispatch are shifted by one and the mapping is written into each
of them. Dispatch R-011 to R-015 are committed here as R-012 to R-016.

**Ruling:** R-007 is superseded. Its grant was scoped to a single task, the
apply of migration 0006, and expired the moment that migration was journalled.
That scoping is now recorded as an authoring error: it made every later card
that needs the environment a fresh authorisation request, and the cost of
asking repeatedly is that the asking stops being read.

The grant is now **board-wide and time-bounded**: EXECUTOR reads
`/Users/ivan/rc-secrets/phase2.env` for any card on this board, for as long as
the environment holds **zero real client data**. Values are never printed, never
logged, never written to a committed file, never pasted into a board field and
never included in tool output. Variable names may be written freely.

**The expiry is P2-13 and nothing else.** Not per task, not per session, not per
card. P2-13 is where the credential firewall flips because that is where real
client data starts existing, which is the condition the grant rests on. CLAUDE.md
section 8.7 already requires P2-13's checklist to revoke it, and that requirement
is unchanged.

**Unblocks:** nothing directly. It removes a per-task authorisation step from
every card that needs the environment.
**Also changes:** nothing in `CLAUDE.md`. Section 8.3 already describes the read
and its rules; this ruling widens which cards may perform it and fixes the
expiry.
**Supersedes:** R-007.

### R-013 - EXECUTOR deviations 1 to 8 ratified, and the journal gap folds into P2-11
**Date:** 2026-08-26
**Asked on:** the EXECUTOR report of 2026-08-26
**Answer, verbatim:**
> R-012: EXECUTOR deviations 1-8 from the 2026-08-26 report ratified. The
> reset-SQL check asserts every mutating statement is a DELETE, exactly nine,
> all WHERE-guarded, single BEGIN/COMMIT. Migration journal carrying no actor or
> timestamp is folded into P2-11, not a separate card.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.
**Numbered R-013, not R-012.** See the note in R-012.

**Ruling:** All eight deviations flagged in the 2026-08-26 EXECUTOR report are
ratified as a set. Two carry consequences worth stating on their own.

**The reset-SQL check keeps the assertions it actually implements.** The check
was requested as "statement count is 9, every statement is a DELETE"; the file
parses to eighteen statements because it opens a transaction, builds four
temporary tables, prints a pre-check, runs the nine deletes, prints two
post-checks and commits. The ratified assertion set is the implemented one:
**every statement that can mutate data is a DELETE, exactly nine of them, every
one WHERE-guarded, inside a single BEGIN and COMMIT.** The requested wording is
superseded, not the requested intent.

**The migration journal has no actor and no timestamp**, so the project cannot
say who applied any migration or when. Migration 0006 was found already applied
by an unidentified actor and that gap is why. It is **folded into P2-11 as an
apply-log requirement, not raised as a separate card**: P2-11 is production
hardening and an unauditable apply path is a hardening defect, not a feature.

**Unblocks:** nothing. It closes eight open flags.
**Also changes:** P2-11 gains the apply-log requirement in its acceptance and
defaults. P2-15's notes already carry the implemented assertion set.
**Supersedes:** the requested wording of the reset-SQL assertions.

### R-014 - extraction contract v2 accepted, with three amendments
**Date:** 2026-08-26
**Asked on:** P2-08, P2-09
**Answer, verbatim:**
> R-013: extraction contract v2 accepted. Andre's changes a through l ratified
> with three amendments: category follows the unit and currency pattern
> (category_raw verbatim plus nullable mapped category against our controlled
> list); order_id is the idempotency key, upsert never append; failed and
> partial both require a visible document state with reason and a re-fire
> control. Absent is null, never empty string, never zero. Callback response
> codes: 202 accepted, 200 duplicate, 400 rejected, 401 bad secret, 5xx
> retryable.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.
**Numbered R-014, not R-013.** See the note in R-012.

**Ruling:** Andre's extraction contract v2, changes (a) through (l), is
accepted, with three amendments and two global rules. It is frozen as
`docs/contracts/extraction-v2.md` in this PR, and P2-08 and P2-09 are rewritten
against it.

**Amendment 1, category follows the unit and currency pattern.** The callback
carries `category_raw` verbatim as the document said it, and a nullable
`category` mapped against our controlled list. Never one field doing both jobs:
a mapped value that silently replaces what the document said destroys the only
evidence of what was extracted.

**Amendment 2, `order_id` is the idempotency key. Upsert, never append.** A
callback that arrives twice for the same `order_id` replaces the stored
extraction; it never creates a second one. Retries are expected, and a contract
without an idempotency key turns each retry into a duplicate draft order.

**Amendment 3, `failed` and `partial` both require a visible document state**
carrying the reason and a re-fire control that re-posts with the same
`order_id`. A failure the operator cannot see is a document that sits in the
system looking pending forever.

**Absent is `null`. Never an empty string, never zero.** An empty string is a
value that was extracted and was blank; a zero is a quantity or a price. Both
are lies about what the document contained, and both are indistinguishable from
real data downstream.

**Callback response codes are fixed:** `202` accepted, `200` duplicate, `400`
rejected, `401` bad secret, `5xx` retryable. Make retries on `5xx` and does not
retry on `4xx`, so the split is what decides whether a bad payload is retried
forever or dropped once.

**ONE AMENDMENT IS NOT IMPLEMENTABLE AS WRITTEN TODAY, and this is recorded
rather than worked around.** Amendment 1 says the mapped `category` is validated
"against our controlled list". **There is no controlled category list.** `unit`
and `currency` are PostgreSQL enums (`unit_code`, `currency_code`) and are
genuinely controlled; `categories` is a rows table with a unique name and no
seed, and migration 0001 says it is deliberately unseeded because the phase 1
seven were mock data. So the contract specifies `category` as nullable and
mapped against **the `categories` rows present at extraction time**, which is
the only list that exists, and `category_raw` always carries the document's own
words. If the owner wants a fixed enumerated list, that is a schema decision and
a migration, and it is a card.

**Unblocks:** nothing yet. P2-08 stays `blocked_on: andre`: this ruling settles
what OUR side of the contract is, not that Andre has confirmed his.
**Also changes:** P2-08 and P2-09 rewritten. `docs/contracts/extraction-v2.md`
authored as the frozen contract.
**Supersedes:** the v1 webhook contract sent to Andre on 2026-08-25.

### R-015 - no third-party document conversion sub-processor without a ruling
**Date:** 2026-08-26
**Asked on:** P2-08
**Answer, verbatim:**
> R-014: no third-party document conversion sub-processor without an owner
> ruling. If Make's OpenAI file input does not work, conversion is built inside
> our own app.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.
**Numbered R-015, not R-014.** See the note in R-012.

**Ruling:** No third-party document conversion service is added to the pipeline
without an owner ruling naming it. Not a PDF-to-image API, not an OCR service,
not a file conversion endpoint, however small and however free.

The reason is that a converter is a **sub-processor**: the client's supplier
invoices pass through it, in full, and every one carries supplier names, prices
and commercial terms. Adding one is a data-sharing decision about Rapid
Construct's commercial information, and that decision is not an implementation
detail an executor picks while unblocking a card.

**If Make's OpenAI file input does not work, conversion is built inside our own
app.** That is the pre-authorised path, and it needs no further ruling.

**Unblocks:** nothing. It closes a path before anyone walks down it.
**Also changes:** P2-08's defaults gain the prohibition, so the constraint is on
the card rather than only in this file.
**Supersedes:** none.

### R-016 - POC-BUILDER deviations 1 to 6 ratified, install.sh is permanent
**Date:** 2026-08-26
**Asked on:** the POC-BUILDER report of 2026-08-26
**Answer, verbatim:**
> R-015: POC-BUILDER deviations 1-6 ratified. install.sh is permanent, not
> provisional.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.
**Numbered R-016, not R-015.** See the note in R-012.

**Ruling:** All six deviations POC-BUILDER flagged are ratified as a set.

**`install.sh` is permanent, not provisional.** It is the supported way the
launchd schedule is installed and reinstalled, and it is maintained as product
rather than kept as scaffolding to be replaced later. A provisional installer is
one nobody updates, and the schedule it installs is the thing that runs the
board unattended four times a day.

Recorded by EXECUTOR on POC-BUILDER's behalf because the two sessions share this
file and one dispatch carried both sets of rulings. The deviations themselves
are POC-BUILDER's to describe; this entry ratifies them and does not restate
them.

**Unblocks:** nothing on this board.
**Also changes:** nothing EXECUTOR owns.
**Supersedes:** none.

### R-017 - EXECUTOR deviations 1 to 8 ratified, and the renumbering stands
**Date:** 2026-08-26
**Asked on:** the EXECUTOR contract report of 2026-08-26
**Answer, verbatim:**
> R-017: EXECUTOR deviations 1-8 from the 2026-08-26 contract report ratified.
> The R-012..R-016 renumbering stands.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** All eight deviations flagged in the contract report are ratified,
and the renumbering of that dispatch's rulings from R-011..R-015 to
R-012..R-016 is confirmed correct. POC-BUILDER's R-011 stands untouched.

**One of the eight is withdrawn by the author rather than ratified, and this is
the entry that records it.** Deviation 5 read: "public.categories holds 305
products, up from 304 at the last count. One more product arrived from somewhere
after the CRIT-11 guard landed." The second sentence is false. Forensics under
R-012 established that the newest product row in the project is
`CRITIC-RACE-1787702980667` at `2026-08-26 00:09:40+00`, and the CRIT-11 merge
commit `aef3c54` is `2026-08-26 02:50:44+00`. **The row predates the guard by
two hours and forty one minutes**, and it was created by the CRITIC's own
documented live concurrency test at the wave 1 boundary. Zero rows have been
written to the production project since the guard merged, in any table. The
count movement was real; the account of when it happened was invented. Recorded
in full at `docs/reports/forensics-20260826-product-count.md`.

**Unblocks:** nothing. It closes eight flags and corrects one of them.
**Also changes:** the id namespacing rule is written into `docs/LEARNINGS.md`:
strategy issues `R-nnn`, POC-BUILDER issues `P-nnn`, CRITIC issues `C-nnn`, and
a collision is fixed by renumbering the new entry rather than editing the old.
**Supersedes:** none.

### R-018 - the categories halt was correct, and P2-17 authors the list
**Date:** 2026-08-26
**Asked on:** P2-08, P2-17
**Answer, verbatim:**
> R-018: the categories halt is ratified as correct. Exporting the live single
> test row as controlled vocabulary would have been harmful. The controlled list
> is authored as a schema decision under P2-17.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** Halting the categories export was correct. `public.categories` held
exactly one row, `TEST-Categorie`, carrying every product in the project, and it
is CRIT-11 residue that P2-15 exists to delete. Exporting it would have committed
one test string as the client's controlled vocabulary, to be read by whoever
builds the extraction mapping long after the row it names was removed.

**The controlled list is a schema decision, so it is authored as one.** P2-17
seeds `public.categories` with a Romanian working vocabulary through a migration:
INSERT only, no DELETE, idempotent on re-run, and it does not touch the
`TEST-Categorie` row, which belongs to P2-15.

**The vocabulary is a working default, not a specification.** Mihai may rename
entries at P2-14 without a code change, because they are rows and not an enum.
That is the reason the list is rows: an enum would have made every rename a
migration.

**Unblocks:** the `category` mapping in extraction contract v2 section 4.4,
which until now mapped against a list that did not exist.
**Also changes:** `docs/contracts/extraction-v2.md` section 4.4 gains a reference
to `docs/contracts/categories.json`, exported from the live schema after the
migration applies.
**Supersedes:** none. It resolves the caveat R-014 recorded.

### R-019 - P2-12 no longer depends on P2-11
**Date:** 2026-08-26
**Asked on:** P2-12
**Answer, verbatim:**
> R-019: P2-12 depends_on P2-11 is severed. DNS verification does not depend on
> hardening. The edge was authored when domain work sat at the end of the build
> and is now stale.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** The `depends_on` edge from P2-12 to P2-11 is removed. Connecting a
domain and verifying that it serves over HTTPS has no dependency on security
headers, an environment presence check, Romanian error pages or a console sweep.

The edge was not wrong when it was authored. It encoded an ORDER, that domain
work came last, at a time when that was the plan. The plan changed: Ivan did the
DNS early, the verification passed, and the edge then held a finished piece of
work behind a card parked three deep behind a third party. **An ordering
constraint that has outlived its ordering is a stale edge, and a stale edge is
indistinguishable from a real one to everything that reads the board.**

**Unblocks:** P2-12, which becomes eligible and is worked in this dispatch.
**Also changes:** P2-12's `depends_on` becomes empty.
**Supersedes:** the `depends_on` of P2-12 as authored on the phase 2 board.

### R-020 - CRIT-11 is reopened as CRIT-15
**Date:** 2026-08-26
**Asked on:** CRIT-11
**Answer, verbatim:**
> R-020: CRIT-11 is reopened as CRIT-15. A guard proven on the local path only
> does not close the defect it was carded for.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** CRIT-11 is reopened as **CRIT-15**. A guard proven on one execution
path does not close a defect defined across all of them, and CRIT-11's evidence
records six exit paths exercised **locally** and none in CI.

**The premise this ruling was issued on is narrower than it appeared, and the
card is written against what is actually true.** Forensics under R-012
established that **CI does not point at production and cannot**: the workflow
starts its own Supabase stack, exports that stack's URL and keys, references no
repository secret, and the repository has no secrets configured at all. The
runner has no production credential to misuse. That was confirmed empirically
from a real run log, not only by reading the workflow.

**What is genuinely unproven is the refusal branch in CI.** The guard executes
on both paths, because `globalSetup` runs before every Playwright invocation.
But CI always resolves to a local stack, so only the guard's PASS path has ever
run there. A green `quality` run proves the guard does not block a legitimate
suite; it proves nothing about whether it would stop an illegitimate one.

The failure this leaves open is a future edit, not today's configuration:
someone adds a repository secret and wires `NEXT_PUBLIC_SUPABASE_URL` to it for
a preview environment or a smoke test, and the first thing that tells anyone the
guard stopped enforcing is rows appearing on the client's screen.

CRIT-15 closes that, and its acceptance is a **deliberate failing run inside
CI**, so the refusal is exercised by the same workflow that would otherwise
silently stop enforcing it.

**Unblocks:** nothing. It reopens a defect that was reported closed.
**Also changes:** CRIT-11's notes record the reopening and point at CRIT-15 and
at the forensics report, so the card does not go on reading as closed.
**Supersedes:** CRIT-11's claim to have closed the defect. CRIT-11's code is
correct and stays; what is superseded is the completeness of its proof.

### R-021 - EXECUTOR forensics deviations ratified, the +1 product finding withdrawn
**Date:** 2026-08-26
**Asked on:** the EXECUTOR forensics report of 2026-08-26
**Answer, verbatim:**
> R-021: EXECUTOR deviations 1-7 from the 2026-08-26 forensics report ratified.
> The +1 product finding is withdrawn as false; the row is CRITIC's documented
> concurrency test and predates the guard. CI does not and cannot write to
> production.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** All seven deviations from the forensics report are ratified.

**The +1 product finding is withdrawn as false.** The newest product row in the
project is `CRITIC-RACE-1787702980667` at `2026-08-26 00:09:40+00`; the CRIT-11
merge commit `aef3c54` is `2026-08-26 02:50:44+00`. The row predates the guard by
two hours and forty one minutes and was created by the CRITIC's own documented
live concurrency test at the wave 1 boundary. **Zero rows have been written to
the production project since the guard merged, in any table.**

**CI does not and cannot write to production.** The workflow starts its own
Supabase stack and reads that stack's credentials back out of it, references no
repository secret, and the repository has no secrets configured at all.
Confirmed empirically from a real run log rather than only by reading the
workflow.

**The escalation itself is the lesson, and it is recorded rather than
smoothed over.** An unverified sentence in a terminal report became the headline
premise of the next dispatch without anyone demanding the query that would settle
it. The standing rule that an apply is believed only with its pre-check and
post-check output pasted is not about applies: it is about counts and states of
the client's database, from any source. Written into `docs/LEARNINGS.md`.

**Unblocks:** nothing. It closes seven flags and withdraws one finding.
**Also changes:** nothing on the board. CRIT-15 already shipped against the
correct, narrower defect.
**Supersedes:** deviation 5 of the 2026-08-26 contract report.

### R-022 - the P2-12 acceptance amendment is ratified
**Date:** 2026-08-26
**Asked on:** P2-12
**Answer, verbatim:**
> R-022: P2-12 acceptance amendment ratified, precedent CRIT-14. Delivered-email
> proof correctly moved to P2-13.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** Amending P2-12's acceptance rather than shipping around it was
correct, and the precedent is CRIT-14: when the acceptance and what can actually
be checked disagree, **the acceptance is what gets corrected, in writing, with
the old text preserved**.

The withdrawn clause required the reminder sender to be switched to the client
domain, proven by a delivered email. That work moved to P2-13 as checklist items
(e) and (f), and the reason it cannot be proven is one line: there is nobody to
send to. `owner_reminder_recipients()` returns one address on a domain that does
not exist.

The alternative was to ship on instruction alone and leave the card carrying a
clause nobody could ever run, which is the board lying about a commit that does
not exist.

**Unblocks:** nothing. P2-12 already shipped.
**Also changes:** nothing further. The full previous acceptance is quoted
verbatim in P2-12's notes.
**Supersedes:** the delivered-email clause of P2-12's acceptance as authored
under R-002.

### R-023 - launch gates flip on committed evidence only
**Date:** 2026-08-26
**Asked on:** the launch gate
**Answer, verbatim:**
> R-023: launch gates flip on committed evidence only, never on a shipped card
> by implication. Gate flips are a strategy judgement, executed by audit under
> this ruling.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** A launch gate condition flips to `pass` only when **every clause of
its own stated criteria** has committed evidence behind it. A card shipping does
not flip a gate by implication, however completely that card appears to cover
the gate's subject.

The reason is that the two are written for different readers. A card's
acceptance is what proves the work was done; a gate's criteria are what the
owner reads to decide whether the system may go in front of a client. They
overlap and they are not the same sentence, and the difference is exactly where
"the card is done so the gate must be closed" goes wrong.

**Gate flips are a strategy judgement, executed by audit.** The executor audits
each gate clause by clause, names the committed evidence for each, and flips only
those where nothing is unmet. Where a clause is unmet it says which clause and
stops. **It never stretches an adjacent fact to cover a clause**, and if no gate
qualifies it reports that plainly rather than finding one.

The validator already enforces the shape: a condition at `state: pass` with
`evidence: null` is a hard failure, and `readiness_passed` must equal the counted
number of passing conditions.

**Unblocks:** the gate audit performed in this dispatch.
**Also changes:** nothing structural. It states the standard the audit is held to.
**Supersedes:** none.

### R-024 - P2-15 and P2-13 are resequenced behind the build tail
**Date:** 2026-08-26
**Asked on:** P2-13, P2-15
**Answer, verbatim:**
> R-024: P2-15 and P2-13 are resequenced. P2-15 depends_on P2-09 and P2-11 both
> shipped. P2-13 depends_on P2-15. Neither is an owner action until the build
> tail is complete. The previous ordering would have revoked credentials still
> needed for migrations.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** P2-15 depends on P2-09 and P2-11. P2-13 depends on P2-15. Both come
off `blocked_on: ivan`, because **neither is an owner action yet**: an owner
action is one waiting on a person, and these are waiting on cards.

**The previous ordering would have locked a door with people still inside.**
P2-13 revokes the migration-apply grant, rotates every credential and retires the
dev accounts. P2-15 deletes the production residue. Both sat ahead of P2-08,
P2-09 and P2-11, and P2-08 needs a migration to store extraction drafts.
Following the board as authored, the credentials would have been rotated and the
grant revoked while cards requiring both were still unbuilt.

The ordering was correct when it was written: handover sat at the end of a short
build tail. Then P2-08 parked on a third party for days while everything around
it shipped, and the tail outlived the assumption.

**The fix is an edge, not a position.** A `depends_on` edge is checked by the
validator on every commit. A position in a list is checked by whoever happens to
notice.

**Unblocks:** nothing immediately. It stops two cards from being workable before
the cards that need their credentials.
**Also changes:** P2-15 `depends_on` becomes P2-09 and P2-11 with `blocked_on`
cleared and status back to `todo`; P2-13 `depends_on` becomes P2-15 with
`blocked_on` cleared.
**Supersedes:** the `depends_on` and `blocked_on` of P2-13 and P2-15 as
previously authored.

### R-025 - P2-08 splits, and the app side is buildable without Andre
**Date:** 2026-08-26
**Asked on:** P2-08, P2-09
**Answer, verbatim:**
> R-025: contract v2 being frozen makes the app side of the extraction lane
> buildable without Andre. P2-08 splits into P2-08a (app side, mocked
> transport) and P2-08b (live integration, blocked_on andre). P2-09 depends on
> P2-08a only.

**Ruled by:** strategy, 2026-08-26, relayed to EXECUTOR in the session dispatch.

**Ruling:** Freezing extraction contract v2 changed what P2-08 was waiting for.
It was blocked on Andre because nobody knew the shape of the payload. The shape
is now decided, written down and frozen at
`docs/contracts/extraction-v2.md`, and **our side of a frozen contract is
buildable against it whether or not the other side has confirmed.**

What still genuinely needs Andre is the live round trip. So P2-08 splits:

- **P2-08a**, the app side, with Make mocked at the transport exactly as P2-10
  mocks Resend. Eligible now.
- **P2-08b**, one live round trip against Andre's real scenario with a real
  document. Stays `blocked_on: andre`.

**P2-09 depends on P2-08a only.** The review and confirm flow needs drafts in the
database to review; it does not need those drafts to have arrived from Andre's
scenario rather than from a mock.

**The risk this accepts, stated rather than hidden:** if Andre's scenario
eventually sends something other than v2, P2-08a's receiver is wrong and gets
corrected. That is a smaller cost than three cards idle behind a third party,
and it is bounded by the contract being frozen and written down rather than
assumed.

**Unblocks:** P2-08a immediately, and P2-09 and P2-11 once it ships.
**Also changes:** P2-08 becomes P2-08a and P2-08b; P2-09 and P2-11 `depends_on`
recalculated; P2-15's new dependencies from R-024 read against the split.
**Supersedes:** P2-08 as a single card.

### R-027 - EXECUTOR deviations 1 to 7 ratified, and 0008's anon grant was the procedure working
**Date:** 2026-08-27
**Asked on:** P2-08a
**Answer, verbatim:**
> R-026: EXECUTOR deviations 1-7 from the P2-08a report ratified. Migration
> 0008's anon grant, caught by its own post-check and corrected by 0009, is the
> procedure working, not a process failure.

**Ruling:** All seven deviations flagged in the P2-08a report are ratified as a
set. Nothing on that card is reopened and nothing is rebuilt.

**RENUMBERED FROM R-026, AND THE SHIFT IS RECORDED RATHER THAN LEFT TO BE
RECONSTRUCTED.** The dispatch that carried this answer numbered it R-026. That
id was already taken: PR #44, authored earlier the same day by the POC inbox
reader, commits "R-026 - ruling relayed from Telegram for P2-12". Per the
standing rule in `docs/LEARNINGS.md` ("Ruling ids are namespaced by author, and
a collision is an authoring defect") the NEW entry is renumbered and the old one
is never touched, so the three rulings in this dispatch land as **R-027, R-028
and R-029** instead of R-026, R-027 and R-028. R-026 belongs to PR #44 whether
or not that PR merges; a gap in the sequence is cheap and a duplicated id is
not.

**On the anon grant specifically.** Migration 0008 created
`extraction_drafts` and `extraction_draft_lines` and left `anon` holding SELECT
on both, because Supabase grants at CREATE TABLE time from project-level default
privileges and 0001's one-time revoke does not reach tables created later.
Nothing leaked: RLS was enabled and every policy is `to authenticated`, so the
second of the two layers was holding throughout. **The defect was found by the
card's own phase 3 post-check, named in the card notes, and corrected by a new
numbered migration rather than by editing an applied one.** That sequence is
what the three-phase apply exists to produce. Ratified as the procedure working.

**Unblocks:** nothing. P2-08a is already shipped; this closes its report.
**Also changes:** nothing on the board.
**Supersedes:** none.

### R-028 - the gate audit stands at 6 of 9, and the three open gates are people-gated
**Date:** 2026-08-27
**Asked on:** launch_gate
**Answer, verbatim:**
> R-027: gate audit ratified at 6/9. G4, G7 and G9 are all people-gated and
> cannot be closed by any terminal.

**Ruling:** The gate audit of 2026-08-27 is ratified as it stands. Six of nine
conditions are `pass` on committed evidence under R-024's evidence rule, and the
three that are not are **not work any terminal can do**:

- **G4**, AI extraction live end to end, needs one real document through Andre's
  real Make scenario. The app side is built and proven against the frozen
  contract (P2-08a, mocked at the transport) and the review and confirm surface
  is P2-09. What is missing is the other party, which is card P2-08b and its
  `blocked_on: andre`.
- **G7**, reminders firing a real Resend email on production, needs a send from
  the production environment. The logic is proven by four green acceptance cases
  against a mocked transport; the production half is environment and account
  work at the handover.
- **G9**, Mihai completing one full cycle himself on production, is card P2-14
  and is by definition the client's own hands.

**No terminal may flip any of the three, and none of them is a build task
waiting to be picked up.** Recording that here stops a future session reading
`6/9` as a backlog.

**Unblocks:** nothing.
**Also changes:** nothing on the board. `readiness_passed` stays 6 of 9.
**Supersedes:** none.

### R-029 - SUPABASE_SERVICE_ROLE_KEY is a precondition of P2-08b, verified by name only
**Date:** 2026-08-27
**Asked on:** P2-08b
**Answer, verbatim:**
> R-028: SUPABASE_SERVICE_ROLE_KEY is required in the Vercel production
> environment before P2-08b. Verify by name only, never read or print the value.

**Ruling:** `SUPABASE_SERVICE_ROLE_KEY` must be present in the Vercel
**production** environment before P2-08b runs, and its absence is a precondition
failure rather than a defect to debug on the day.

**Why the callback needs it at all**, recorded so nobody later removes it as
surplus: Make posts to `/api/extraction/callback` with no session and no cookie,
and every RLS policy on `extraction_drafts` and `extraction_draft_lines` is
`to authenticated`. An anonymous request matches no policy, so the receiver
writes with the service key **after** verifying the shared secret the contract
specifies. Without the variable the route answers `500`, which under contract
section 6 means "nothing was stored, retry" - so a live round trip would look
like Make retrying forever against a healthy-looking endpoint.

**Verification is by name only.** The variable is confirmed present or absent by
its name in the Vercel environment listing. Its value is never read, printed,
logged, pasted into a board field or written into any file, here included.
Section 7 of `CLAUDE.md` is unchanged by this ruling.

**Unblocks:** nothing yet. P2-08b stays `blocked_on: andre`; this adds a second
precondition that is Ivan's to satisfy and that can be satisfied at any time
before Andre answers.
**Also changes:** P2-08b `defaults` gains the precondition.
**Supersedes:** none.

### R-026 - P2-12: the recommendation is accepted
**Date:** 2026-08-27
**Asked on:** P2-12
**Answer, verbatim:**
> R P2-12 default

**Ruled by:** Ivan, on Telegram, relayed by the POC inbox reader in run 20260826-220005.

**Ruling:** Ivan accepted the recommendation already written on P2-12. That recommendation is now the decision, unchanged:

CANONICAL URL LIVES IN ONE ENVIRONMENT VARIABLE and every absolute URL in the application is built from it: auth redirects, callback URLs, email links, metadata. Nothing hardcodes a vercel.app host and nothing infers the host from a request header, because a forwarded host header is attacker-controlled. AUTH REDIRECT ALLOWLIST in Supabase must name the production domain. That is a dashboard setting Ivan makes, and it is listed in the handover text of this card so it is not discovered as a login failure later. THE vercel.app HOST IS NOT A SUPPORTED ENTRYPOINT, rewritten 2026-08-26 by ruling R-004. Vercel Deployment Protection stays ENABLED on the project, so the project alias answers 302 to vercel.com/sso-api for any client not signed in to the Vercel team. www.rapidconstructmd.com is the only public URL of this application. No card, no test, no runbook and no acceptance line may assume that any vercel.app host serves anonymously, and there is no fallback way in through one. The previous text of this default claimed the opposite and is superseded: it read 'THE OLD vercel.app HOST KEEPS WORKING and is not redirected away in this card; breaking it while the new domain settles would remove the only working way in.' The CRITIC proved that host already did not work for anyone outside the Vercel team, so the fallback it protected did not exist. RESEND SENDER: once the domain is verified in Resend, the P2-10 sender moves off the onboarding domain. That is an environment change, not a code change, and is done here rather than as a new card. www AND APEX both resolve, with one canonical and the other redirecting to it. Ivan chooses which is canonical; if he does not say, apex is canonical.

**Unblocks:** P2-12. `blocked_on` cleared, `status` returned to `todo`.
**Supersedes:** none.

**Recorded late, on 2026-08-27, and what actually happened.** This ruling was
generated by the POC inbox reader during run 20260826-220005 and opened as PR
#44. That PR never merged: branch protection on `main` requires a branch to be
up to date, the harness could not handle a `BEHIND` branch, and it retried and
failed the same merge on every run for three runs. While it sat, `main` moved on
and the PR went from `BEHIND` to conflicting.

By the time it was recovered, **P2-12 had already shipped by another route**, so
the `Unblocks` line above is history rather than instruction: the card did not
return to `todo`, it went to `shipped`. The line is left exactly as the reader
wrote it, because a ruling is not edited after the fact and the verbatim answer
is what binds.

Only the ruling half of PR #44 is landed here. **Its board edit was discarded
deliberately**: that edit would have written a stale `last_checkpoint` and notes
onto a card that had since shipped, which is a regression dressed as an unblock.
PR #44 is closed as superseded by this entry.

This entry also repairs a dangling citation. Five card notes on `main` already
said "Unblocked by R-026" while `decisions/inbox.md` had no R-026 at all, so the
board was citing a ruling that did not exist. It exists now.
### R-030 - EXECUTOR deviations 1 to 7 from the P2-09 and P2-11 report ratified
**Date:** 2026-08-27
**Asked on:** P2-09, P2-11, CRIT-16
**Answer, verbatim:**
> EXECUTOR deviations 1-7 from the P2-09 and P2-11 report ratified.

**Ruling:** All seven deviations flagged at the end of the P2-09 and P2-11
session are ratified as a set. Nothing on those cards is reopened.

Three of the seven carry an action and it is recorded here so the ratification
does not quietly close them:

- **Deviation 1, migration 0011 authored and not applied.** Closed on
  2026-08-27: the apply was retried under R-012, succeeded, and is journalled in
  full at `docs/migrations/APPLY-LOG.md` with all three phases. What remains is
  two rows in `supabase_migrations.schema_migrations`, which the apply's own
  pre-check discovered were also missing for 0010. See R-033.
- **Deviation 2, the `drop constraint` near-miss.** Answered by R-031, which
  widens CLAUDE.md 8.6 rather than granting an exception.
- **Deviation 5, the account_manager refused at confirm.** Answered by R-032,
  which makes it a card rather than leaving it as an observation.

The other four - two defects in 0010 corrected by 0011, two findings written
onto P2-15, and having touched two shipped cards' files - are ratified as
correct handling and need nothing further.

**Unblocks:** nothing. Closes the report.
**Also changes:** nothing on the board beyond what R-031, R-032 and R-033 change.
**Supersedes:** none.

### R-031 - CLAUDE.md 8.6 is widened to operations that destroy rows
**Date:** 2026-08-27
**Asked on:** P2-09, migration 0011
**Answer, verbatim:**
> CLAUDE.md 8.6 widened: the forbidden set is operations that destroy rows
> (DROP TABLE, TRUNCATE, DELETE). ALTER TABLE ... DROP CONSTRAINT is permitted,
> must be quoted verbatim in the report, and must be parsed with pgsql-parser
> before it goes near the database. Update CLAUDE.md itself, not only the inbox.

**Ruling:** The forbidden set is **operations that destroy rows**, and it stays
exactly three: `DROP TABLE`, `TRUNCATE`, `DELETE`. `ALTER TABLE ... DROP
CONSTRAINT` is permitted and may be auto-applied under three conditions, all of
them, every time: the statement is **quoted verbatim in the report**, the file
is **parsed with `pgsql-parser`** before it goes near the database with the
parse reported, and the apply is **journalled** with the near-miss named rather
than omitted.

**Why the narrow reading was wrong.** A constraint is replaced, never edited: the
only way to relax one is to drop it and add the corrected one. A rule that
forbade that would make a wrong constraint permanent, which is how a schema
defect outlives the migration that introduced it. Migration 0011 is exactly that
case: 0010 shipped a CHECK that a referential action could violate, and the
correction was un-appliable under the narrow reading.

**The test for a case nobody has met yet, written into CLAUDE.md so it does not
have to come back as a ruling:** does executing this statement reduce the number
of rows in any table? If yes it stops and goes to Ivan. If no it is in scope,
under the three conditions. When the answer is genuinely unclear it stops,
because the cost of stopping is a delay and the cost of being wrong is data.

**CLAUDE.md SECTION 8.6 IS UPDATED BY THIS RULING**, not only this file. A rule
that lives only in the inbox is a rule the next session does not read.

**Unblocks:** migration 0011, applied the same day.
**Also changes:** `CLAUDE.md` section 8.6, rewritten.
**Supersedes:** the previous text of CLAUDE.md 8.6.

### R-032 - account_manager may create products through the extraction confirm path only
**Date:** 2026-08-27
**Asked on:** P2-09
**Answer, verbatim:**
> account_manager may create products through the extraction confirm path only,
> always with needs_review set. Direct product creation stays owner-only. The
> account_manager is the operator who uploads documents daily; refusing them at
> confirm breaks the workflow the lane exists for. Author this as a card and
> work it.

**Ruling:** The `account_manager` role may create products **through the
extraction confirm path and nowhere else**, and every product created that way
carries `needs_review`. Direct creation in the catalogue screen stays
owner-only, unchanged.

**Why the current behaviour is a defect and not a safeguard.** `products_insert`
in migration 0001 checks `is_owner()`, so an account_manager confirming a
document that names a product the catalogue does not have is refused, in
Romanian, at the moment of confirm. The account_manager is the operator who
uploads supplier documents every day. The extraction lane exists to save that
person typing, and it currently stops working the first time a supplier sends
something new - which is the most ordinary thing a supplier does.

**Why the grant is narrow rather than "let the manager create products".** A
product created at confirm is anchored to a document that was uploaded, fired,
extracted and reviewed, and it arrives flagged for the owner to complete. A
product created from the catalogue screen is anchored to nothing. Those are
different acts and only the first one is granted.

**This is a card, and the card writes the rule into the database rather than
into the application.** An application-level check is a check the next screen
can forget; a policy is enforced wherever the write comes from.

**Unblocks:** authors P2-18 and works it.
**Also changes:** a new card, P2-18.
**Supersedes:** none.

### R-033 - P2-15 is not offered to Ivan until 0011 is applied and its selector is corrected
**Date:** 2026-08-27
**Asked on:** P2-15
**Answer, verbatim:**
> P2-15 must not be executed until migration 0011 is applied and its selector
> corrected. It is not offered to Ivan before both.

**Ruling:** Two preconditions, both of them, before `scripts/reset-test-data.sql`
is handed to Ivan to run:

1. **Migration 0011 applied.** 0010 shipped a CHECK constraint that a
   referential action can violate: `confirmed_inbound_order_id` carries
   `on delete set null`, and the reset deletes from `inbound_orders`. Once any
   draft had been confirmed against an order in the delete set, the reset would
   have failed with `23514` and rolled back whole, in the SQL editor, with the
   owner watching. **SATISFIED 2026-08-27**: applied under R-012, journalled in
   `docs/migrations/APPLY-LOG.md`, constraint verified in phase 3 as the
   corrected implication form.
2. **The selector corrected.** The script selects test rows with
   `sku like 'TEST-%'`. The extraction review lane creates flagged products with
   SKUs shaped `EXT-<slug>-<hex>`, so acceptance residue survives the reset, and
   the inbound orders those lines belong to then contain a product outside the
   delete set, are classified "mixed", and survive too. The script's own
   post-check would still report zero, because it counts what the selector
   selected.

**A card is not offered to Ivan while a known defect in it is unfixed.** The
whole value of P2-15 is that the owner runs it once, against production, and it
does what it says. A script that silently leaves rows behind spends the one
thing that card has, which is the owner's trust that the count at the end means
something.

**Unblocks:** nothing yet. P2-15 becomes offerable when precondition 2 lands.
**Also changes:** P2-15 `defaults` and `notes` carry both preconditions.
**Supersedes:** none.

### R-034 - EXECUTOR deviations 1 to 7 from the 2026-08-27 rulings, 0011, P2-15 and autonomy report are ratified
**Date:** 2026-08-27
**Asked on:** AUT-1, P2-15, P2-18, AUT-2, AUT-4, and migration 0011
**Answer, verbatim:**
> Deviations 1-7 from the rulings/0011/P2-15/autonomy report ratified.

**Ruling:** All seven deviations flagged in section 6 of
`docs/reports/2026-08-27-executor-rulings-0011-p2-15-and-the-autonomy-cards.md`
are ratified as recorded. They stand as the decision, not as an exception to be
argued again on the next card. Named individually, because a ratification that
does not name what it ratified is not readable in six weeks:

1. **A local commit landed on local `main` in the main clone**, from a command
   block that ran without its `cd`. Nothing was pushed, `main` was reset to
   `origin/main`, the edit was redone on the card branch. Ratified as reported:
   the rule that matters is that the remote `main` was never touched.
2. **Em dashes reached four PR descriptions** (#54, #57, #59 and the first draft
   of #58) and were swept out of all four. Ratified. Section 11 stands unchanged
   and the sweep is now a step, not an intention.
3. **P2-15's acceptance literal moved from 9 to 11** and gained
   `npm run check:reset-sql`. Ratified. An acceptance line that a corrected file
   fails is a broken acceptance line, and a bare count cannot say whether the
   eleven are the right eleven.
4. **P2-18's acceptance case 9 was amended.** The original asked for a refusal
   that is not drivable, because the catalogue screen offers the manager no
   creation control and therefore presents no write to refuse. Ratified: the
   database-level proof is the policy dump in the apply journal, which is the
   rule itself rather than a consequence of it.
5. **AUT-4's acceptance dropped its chained-run half.** Ratified. That run is
   AUT-3's acceptance, and asking for it twice would park two cards on one
   event while proving the same thing once.
6. **`scripts/poc/claim.sh` did not exist at boot and landed mid-session** in
   PR #56, after every card in that session was already in flight, so no
   retroactive claims were minted. Ratified. A claim taken after the work begins
   protects nothing, and minting one to look compliant would have been the worse
   act.
7. **Three migration ledger rows are unwritten.** Ratified as a flagged, open
   loose end rather than as a completed item. It is bookkeeping and not schema,
   and it is tracked from here as its own card rather than as a footnote on a
   shipped one.

**Unblocks:** nothing directly. It closes the ratification loop on seven items
so that no later session re-opens a settled decision.
**Also changes:** deviation 7 becomes a board card rather than a report footnote.
**Supersedes:** none.

### R-035 - POC-BUILDER deviations 1 to 7 from the harness report are ratified, including the abandonment of PR #55
**Date:** 2026-08-27
**Asked on:** the POC harness work, PRs #53, #55 and #56
**Answer, verbatim:**
> Deviations 1-7 from the POC-BUILDER harness report ratified, including the
> abandonment of PR #55: green is not the same as correct when the diff reverts
> other terminals' work.

**Ruling:** All seven deviations flagged in POC-BUILDER's harness report are
ratified as reported by that terminal.

**The one this file records in full, because it is a standing rule and not a
one-off.** PR #55 was abandoned rather than merged, and PR #56 rebuilt the same
change on current `main`. **A green check is not a correctness proof.** `quality`
answers one question, whether the tree it was handed builds and validates. It
does not and cannot answer whether the diff quietly reverts work that other
terminals landed while the branch was open. PR #55 was cut from an older `main`
and carried #53 inside it; merging it would have been green and would still have
undone commits that were not its own.

**The rule this makes standing, for every role:** before merging a branch that
has been open across other terminals' merges, read what the diff removes, not
only what it adds. A branch that has fallen behind is rebuilt on current `main`
under a new number. It is never force-pushed, per section 3, and it is never
merged on the strength of a green check alone.

**Why the abandonment was correct rather than wasteful.** The cost was one PR
number and a rebuild. The cost of the alternative is a silent revert that nobody
reads, in a repo where four unattended runs a day merge on green.

**A limit on this ratification, stated rather than implied.** The other six
deviations are ratified on POC-BUILDER's own report of them. That report is not
committed under `docs/reports/`, so this file cannot quote them, and the
executor terminal writing this ruling did not read them: POC-BUILDER's worktree
is out of bounds. Ratified on the owner's word, which is what a ruling is. The
gap is itself a finding, recorded in R-036's neighbour below and in the
executor report for this session: section 9b binds every role, and a report that
was never committed is a report the next session cannot read.

**Unblocks:** nothing directly. It settles the abandonment so it is not
re-litigated, and it makes the read-what-the-diff-removes rule standing.
**Also changes:** nothing in `CLAUDE.md` yet. If this class of near-miss recurs
a third time it is promoted to section 3 as a numbered rule.
**Supersedes:** none.

### R-036 - AUT-3 is not an owner action, and its acceptance is the next scheduled harness run
**Date:** 2026-08-27
**Asked on:** AUT-3
**Answer, verbatim:**
> AUT-3 is not an owner action. Its acceptance is satisfied by the next
> scheduled harness run producing a TRIAGE rulings PR with no human input;
> evidence is that run log. Move it off blocked_on ivan to depends_on the next
> scheduled run.

**Ruling:** AUT-3 stops naming Ivan. There is nothing for him to do on it: the
TRIAGE step is already wired into the chain and merged in PR #62, and what the
card is waiting for is a scheduled event, not a decision, a credential or a
click.

**Its acceptance is a chained run that nobody starts by hand.** The next
scheduled harness run boots TRIAGE after EXECUTOR, applies
`docs/DOCTRINE-TRIAGE.md` to the newest committed report, and opens a rulings PR
with no human input. The evidence is that run's log.

**Why `blocked_on: ivan` was wrong and not merely untidy.** Section 5b draws a
line: `blocked_on` naming a person is an owner ACTION, something only that
person can perform. A card parked on a person who has nothing to perform reads,
to every later session and to the digest, as work the owner is holding up. It
also inflates the blocked-on-people lane, which is the one lane the owner is
expected to act on, with an item he cannot act on.

**Unblocks:** AUT-3 itself: `blocked_on` is cleared.
**Also changes:** AUT-3 `status`, `blocked_on`, `acceptance` and `notes`.
**Supersedes:** the `blocked_on: ivan` set when AUT-3 was authored.

### R-037 - P2-13 gains a dependency on P2-08b, so the credential firewall cannot flip before the live round trip
**Date:** 2026-08-27
**Asked on:** P2-13, P2-08b
**Answer, verbatim:**
> P2-13 depends_on gains P2-08b. The credential firewall must not flip before
> the live extraction round trip completes, or a finding from that round trip
> cannot be fixed.

**Ruling:** `P2-13.depends_on` gains `P2-08b`, alongside the existing `P2-15`.

**What P2-13 actually does, and why the order is load-bearing.** P2-13 is the
end of the temporary grant in `CLAUDE.md` section 8: it reverts section 8 to
Ivan-only applies with no database connection from any terminal, and it rotates
`SUPABASE_DB_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY`. After it lands, no
terminal can apply a migration.

**P2-08b is the first time a real supplier document travels the whole path** -
upload, Make scenario, extraction, confirm - against the frozen contract. That
is exactly the run that discovers a mapping or a constraint that the seven
synthetic cases did not. A finding from it is usually a migration.

If the firewall flips first, that migration has no one who can apply it until
the owner does it by hand, and the round trip that found it has to be re-run to
prove the fix. Ordering the two costs nothing, because P2-13 is already waiting
on P2-15 and cannot start today either way.

**This is not a softening of the expiry in section 8.7.** The grant still dies
at P2-13. This ruling fixes when P2-13 runs, not whether it does.

**Unblocks:** nothing. It adds an edge, it does not remove one.
**Also changes:** `P2-13.depends_on`, and P2-13 `notes` carrying the reason.
**Supersedes:** none.

### R-038 - the digest is written for the owner, and internal mechanics are cut from it
**Date:** 2026-08-27
**Asked on:** the Telegram digest. POC-BUILDER tracks this work as AUT-5, which
is harness work and deliberately not a card on the product board
**Answer, verbatim:**
> The digest is written for the owner, not for the strategy role. Card ids,
> ruling ids, PR numbers, CI states and claim mechanics are internal and do not
> belong in it.

**Ruling:** The Telegram digest has one reader, Ivan, and it is written in
ordinary business English about the product.

**Cut from the digest, by name:** card ids, ruling ids, PR numbers, CI check
states, claim and lease mechanics, branch names, file paths, migration numbers
and role names. None of them are secret. They are simply the build's internal
vocabulary, and the digest is not addressed to anyone who speaks it.

**Kept:** what changed for the product, what is now possible that was not
yesterday, what is waiting on the owner in terms of the thing he must do, and
what is waiting on someone else with the person named.

**Why this is a rule and not a preference.** A digest that reads as a list of
card ids and green checks trains its only reader to skip it. The moment he skips
it, the escalation path built through it stops working, and the unattended runs
lose the one channel that carries a question out to a human.

**The digest is the second surface this applies to, not the only one.** The
board's own cards are the first: every card carries a `plain` field saying what
it means for the product and for Mihai, authored under AUT-7. One vocabulary for
the internals, one for the owner, and the boundary is written down rather than
left to whoever composes the next message.

**Unblocks:** the plain-language digest, which POC-BUILDER holds.
**Also changes:** the digest composer. Card `plain` fields land under AUT-7.
**Supersedes:** none.

### R-039 - EXECUTOR deviations 1 and 2 from the 2026-08-28 acceptance pass are ratified, each with the test that cleared it
**Date:** 2026-08-28
**Asked on:** the scheduled run 20260827-220052, PR #78
**Answer, verbatim:**
> from docs/reports/2026-08-28-executor-critic-acceptance-pass.md, section 3:
> "Why this run merged #78, which is another run's PR. It was open, docs-only,
> and its `quality` check was green, but its branch was BEHIND `main` and the
> branch protection requires an up-to-date head, so it could never merge
> itself."
>
> and section 5, finding 3:
> "Elapsed: ~7h52m against a 2700s cap. The watchdog never fired."

**Ruling:** The report carries no section headed "deviations flagged for
ratification". It carries two acts that are deviations in substance, and
DOCTRINE-TRIAGE section 1 binds on the act rather than on the heading, so both
get a verdict and both name the test that produced it. They are ratified
individually, not as a block.

**DEVIATION 1: this run merged PR #78, which belongs to a different run.**
RATIFIED.

- Test 1, did it touch data that cannot be recovered? No. A merge of a
  documentation-only PR onto `main`, revertible by a commit.
- Test 2, is there committed evidence a stranger can re-verify? Yes, and TRIAGE
  re-verified it rather than accepting it. PR #78, head sha `3f8b4a0`; the
  GitHub check-runs API for that sha returns `quality` with conclusion
  `success`. The merge landed as `10011d0` on `main`. The claim that the check
  was green FOR THE NEW HEAD SHA, which is the claim section 3 of `CLAUDE.md`
  actually turns on, is the claim that was checked.
- Test 3, did it widen a rule or apply one? Applied. `gh pr update-branch`
  merges base into head; it is not a force push and rewrites no history, so the
  no-force-push rule is untouched. The merge-only-on-green rule was satisfied in
  its strict form, for the head sha rather than for a stale rollup.
- Test 4, would the alternative have been worse? Yes, concretely. A branch that
  is behind `main` cannot merge itself under this repository's protection, and
  nothing in the chain picks up another run's stranded PR. The file on it is a
  section 9b report, and section 9b exists so that the next role can read the
  previous role's output. TRIAGE reads the newest report ON `origin/main`. Left
  alone, the 2026-08-27 CRITIC report would have been permanently invisible to
  the only role written to consume it.

**DEVIATION 2: the run continued for roughly eight hours against a declared
2700s cap, holding `run.lock` across two scheduled slots.** RATIFIED, and the
defect it exposed becomes a card.

- Test 1, unrecoverable data? No.
- Test 2, committed evidence? Yes, and again re-verified rather than accepted.
  `/Users/ivan/rc-poc-logs/run.lock` still existed at `2026-08-28T10:45:33Z`
  carrying `run_id=20260827-220052` and `started_at=2026-08-28T02:00:52Z`, which
  is 8h44m. The launchd log records the start line at that timestamp and carries
  no release line after it.
- Test 3, widened a rule or applied one? Applied. `CLAUDE.md` section 13 states
  the cap "is enforced by the harness, not by the session's own sense of time".
  A session that keeps working while the harness does not stop it is following
  that sentence, not stretching it. The session did not decide to overrun; it
  was never told to stop.
- Test 4, would the alternative have been worse? Yes. A session that guessed at
  its own elapsed time and self-terminated would have committed no report, and
  the defect that swallowed two of the night's four slots would have gone
  undiscovered for a fourth consecutive night. The overrun is what surfaced it.

**Unblocks:** nothing. It closes the ratification loop on two acts so that no
later session re-opens them.
**Also changes:** deviation 2's defect is carded as AUT-9 under R-042.
**Supersedes:** none.

### R-040 - the scheduled EXECUTOR's environment is narrowed to what it needs, and the report's finding 4 is corrected
**Date:** 2026-08-28
**Asked on:** finding 1 and finding 4 of the 2026-08-28 acceptance pass report
**Answer, verbatim:**
> from docs/reports/2026-08-28-executor-critic-acceptance-pass.md, section 5,
> finding 1:
> "This is no longer an inference from reading the script. It is the state of
> the process writing this sentence."
>
> and, from the same finding:
> "CLAUDE.md 8.2 scopes the secret-read grant to *applying migrations*, and this
> run applied none and needed none."

**Ruling:** The scheduled EXECUTOR stops carrying credentials it has no card to
use. The work is carded as **AUT-8**.

**Why this is TRIAGE's to rule and not Ivan's.** DOCTRINE-TRIAGE section 6 item
5 escalates granting, widening, extending or renewing access to a secret, and
says in the same sentence that narrowing or revoking one is not an escalation
and TRIAGE may rule it, "because the failure mode of narrowing is an outage and
the failure mode of widening is a breach". This narrows. It is the one direction
the rubric hands to this role.

**What is narrowed, precisely.** `CLAUDE.md` 8.2 grants the secrets read for
applying migrations. The harness sources the whole file into the environment of
every scheduled run whether or not a migration is in scope, four times a night.
AUT-8 keeps 8.3 exactly as written by re-sourcing inside the migration step, and
removes the standing copy. Nothing in section 8 is weakened and no new
permission is created.

**AND A CORRECTION TO THE REPORT, which changes what AUT-8 may claim.** Finding
4 says the end-to-end guard "resolves with" finding 1. It does not.
`scripts/assert-not-prod.mjs` exits 2 when either checked URL names a production
project and exits **4 when neither is set**, and its own comment gives the
reason: an empty environment does not mean "not production", it means it cannot
be known, so it stops. Stripping the production URL moves the guard from exit 2
to exit 4. It never reaches exit 0. What the suite needs is a local Supabase
stack, which needs Docker, which is not installed on this machine: `which
docker` returns nothing, verified 2026-08-28. That is a dependency decision and
it is escalated, not ruled. See the TRIAGE report, escalation E3.

**Why the correction matters more than the finding.** A card authored on
finding 4 as written would have shipped, been marked green, and left the ceiling
exactly where it is, with a board entry saying it was fixed.

**Unblocks:** nothing. It authors AUT-8, priority high, `todo`, no dependencies.
**Also changes:** AUT-8 carries the correction in its own notes and defaults, so
whoever works it cannot inherit the wrong claim.
**Supersedes:** none.

### R-041 - harness work that ships code to main is a card on the phase 2 board, in the AUT lane
**Date:** 2026-08-28
**Asked on:** finding 2 of the 2026-08-28 acceptance pass report, AUT-5, AUT-6
**Answer, verbatim:**
> from docs/reports/2026-08-28-executor-critic-acceptance-pass.md, section 5,
> finding 2:
> "That is real executable code, including a Telegram responder that reads the
> repo and answers the owner, landed on `main` under an id with no card, no
> `plain` field, no `acceptance`, no `defaults`, no `evidence`."
>
> and:
> "The board says 32 cards and the owner reads 32 cards; the repository contains
> work from at least 34."

**Ruling:** Work that ships executable code to `main` is a card on
`docs/board/rc-board-phase2.json`, whatever it builds. The harness is not an
exception. The work merged as AUT-5 and AUT-6 is written onto the board by
**AUT-10**, and **AUT-11** makes the gap impossible to reopen.

**The test, stated so it gives the same answer twice.** Run **STATE** is off the
board: run ids, claims, leases, escalations, the bookkeeping in
`docs/poc/state.json`. That is what `CLAUDE.md` section 13 means by "POC state
lives in `docs/poc/state.json`, never on the board", and it stands untouched.
Run **CODE** is a card. The distinction is data versus work, and it is
checkable: if the change is a commit that alters behaviour, it is a card.

**Why the board already agrees.** AUT-1, AUT-2, AUT-3, AUT-4 and AUT-7 are all
harness and process work and all five are cards on this board. AUT-3 changed
`scripts/poc/run.sh` itself. AUT-5 and AUT-6 were minted in that same id
sequence, which is the strongest available evidence that they were meant to sit
in it. They are the exception, not the rule.

**And one of them is a surface the owner touches.** AUT-6 is the assistant that
answers Ivan in the chat. A thing that talks to the client's owner cannot be
invisible bookkeeping, and `plain` exists under AUT-7 exactly so that the board
speaks to him about it.

**THIS DOES NOT OVERTURN R-038 AND MUST NOT BE READ AS DOING SO.** R-038 rules
on what the digest contains. Its "Asked on" line records POC-BUILDER's practice
of tracking AUT-5 off-board as context for that question; it is not a clause of
the ruling and no ruling has ever put harness work off the board. TRIAGE does
not overturn rulings, and nothing here is an edit to an existing entry.

**A live consequence, not only bookkeeping.** The previous pass recorded that
AUT-4's four triage sections stopped reaching the digest, "AUT-5 working as
designed". A shipped card's behaviour was changed by work that no card records,
and the only trace of it is a sentence in a report.

**Unblocks:** nothing. It authors AUT-10 (`todo`, no dependencies) and AUT-11
(`todo`, `depends_on: ["AUT-10"]`).
**Also changes:** nothing in `CLAUDE.md`. If a second class of off-board work
appears, the test above is promoted to section 2 as a numbered rule.
**Supersedes:** none.

### R-042 - the run cap measures wall clock, and a lock whose owner is gone is not honoured forever
**Date:** 2026-08-28
**Asked on:** finding 3 of the 2026-08-28 acceptance pass report
**Answer, verbatim:**
> from docs/reports/2026-08-28-executor-critic-acceptance-pass.md, section 5,
> finding 3:
> "CLAUDE.md section 13 states the cap 'is enforced by the harness, not by the
> session's own sense of time.' Tonight it was enforced by neither."
>
> and:
> "This run has held that lock for eight hours across the **01:00 and 04:00
> scheduled slots**, so those runs either refused or never got a turn. One
> overrunning run silently consumed the rest of the night."

**Ruling:** Carded as **AUT-9**, priority high, no dependencies.

**Verified by TRIAGE rather than accepted from the report.** `run.lock` still
existed at `2026-08-28T10:45:33Z` with `started_at=2026-08-28T02:00:52Z`, 8h44m
against a 2700s cap.

**And the log makes the missing slots visible in a way the report did not.**
Every previous run in `launchd.out.log` is bracketed by a start line and a
release line. Between `2026-08-27T20:39:28Z` and `2026-08-28T02:00:52Z` there is
nothing, and after the start line there is nothing until this run. The 01:00 and
04:00 slots produced no line of any kind. That is worse than a refusal, because
`CLAUDE.md` section 13 requires a run that finds the lock to **log the refusal**
and exit 0, and a silent absence cannot be told apart from a slot that never
fired. AUT-9 carries that as an acceptance case.

**The mechanism stays a hypothesis and the card does not rest on it.** The
report offers the suspended-clock explanation and explicitly declines to assert
it, which is the right posture. AUT-9's acceptance tests the suspension case
directly with `SIGSTOP`, so the fix is proved against that failure mode whether
or not it was the actual cause.

**Priority high on a board with no eligible product work is not a contradiction.**
While one run can hold the lock for eight hours, three of the four scheduled
slots do not exist, and every other improvement to the schedule is multiplied or
cancelled by this one.

**Unblocks:** nothing today. It authors AUT-9.
**Also changes:** the triage watchdog is fixed in the same pass, being the same
shape at a different step.
**Supersedes:** none.

### R-043 - finding 5 is withdrawn as stale against the file it describes, and no card is authored for it
**Date:** 2026-08-28
**Asked on:** finding 5 of the 2026-08-28 acceptance pass report
**Answer, verbatim:**
> from docs/reports/2026-08-28-executor-critic-acceptance-pass.md, section 5,
> finding 5:
> "Carried forward, still unresolved: the harness cuts its state branch from an
> unrefreshed origin/main."

**Ruling:** The premise does not hold. **No card is authored.**

**What the file actually contains.** `scripts/poc/run.sh` step 5 runs
`git fetch origin main --quiet` eleven lines above
`git checkout -b "$STATE_BRANCH" origin/main`, with only the report-path lookup
and a log line between them. The state branch is cut from a refreshed
`origin/main`.

**It was already there when the finding was first written.** The 2026-08-27
report recorded it as "line 664 does `git checkout -b ...` without a fetch
immediately before it". `git show 3420435:scripts/poc/run.sh` carries that fetch
at the same place. The finding was wrong on the day it was written: the reader
looked at the line immediately above the checkout rather than at the block, and
this run carried it forward without re-checking.

**What survives, and it is a different thing.** Two branches rewriting the whole
of `docs/poc/state.json` can still clobber each other, because a whole-file JSON
write has no merge. That risk is real and it is already covered by R-035's
standing rule: before merging a branch that has been open across other
terminals' merges, read what the diff removes, not only what it adds. It needs
no new card.

**Why this ruling is the useful output and not a pedantic one.** Authoring a
card against a premise that does not hold is how phantom work enters a board.
The queue is already dry of product work, and a plausible-sounding harness card
would have been picked up as the lowest-id eligible card and spent a whole run
fixing something that is not broken.

**THE RULE THIS MAKES, and it is the reason the finding survived two passes:** a
finding CARRIED FORWARD is re-verified against the current file before it is
carried again, and the report says which lines were read. A finding repeated
without re-reading is a claim aging into a fact.

**Unblocks:** nothing.
**Also changes:** nothing on the board. Deliberately.
**Supersedes:** none. It withdraws a finding, which is not a ruling.

### R-044 - P2-13 gains a dependency on P2-19, because it removes the only capability that could ever take P2-19 off Ivan's hands
**Date:** 2026-08-28
**Asked on:** P2-13, P2-19
**Answer, verbatim:**
> from docs/board/rc-board-phase2.json, card P2-19 `defaults`, quoted because
> the edge is derived from the board rather than from the report:
> "If the connection ever becomes available to a terminal, this card is worked
> unattended under CLAUDE.md 8.5 as a normal three-phase apply and stops being
> an owner action."
>
> and from the same card's `question`, IMPACT IF UNANSWERED:
> "It stays a known-wrong record that the next CLI-driven apply trips over, and
> P2-13's handover inherits it."

**Ruling:** `P2-13.depends_on` becomes `["P2-15", "P2-08b", "P2-19"]`.

**The capability test, applied as DOCTRINE-TRIAGE section 3 check 3 writes it.**
Ask what the card takes away, list every card that needs it, make those the
dependencies. P2-13 takes away, permanently, the ability of any terminal to open
a database connection: section 8.7 reverts `CLAUDE.md` section 8 to Ivan-only
applies with no connection from any terminal.

**P2-19 is a card that needs exactly that.** Its own defaults say the card stops
being an owner action the moment a connection becomes available to a terminal.
After P2-13 lands, that sentence can never come true, and a two-minute
bookkeeping repair is welded to the owner's hands forever.

**And the ordering is load-bearing for the handover itself.** P2-13 IS the
handover. Handing over a database whose own record of what is installed is three
versions behind means the first tool that reads that record afterwards tries to
re-apply three migrations. P2-19's own impact line already says the handover
inherits it.

**The edge costs nothing.** P2-13 is already waiting on P2-15 and P2-08b and
cannot start today under any ordering.

**This is the third edge added to P2-13 for the same reason** (R-024 for P2-15,
R-037 for P2-08b, this one for P2-19). Three is the threshold in the rules
above: the pattern is now stated as a standing test rather than rediscovered a
fourth time. **A card that revokes a capability depends on every card that needs
that capability, and the check is run over the whole board rather than over the
cards a report happened to mention.** It already lives in DOCTRINE-TRIAGE
section 3 check 3, which is where it stays.

**Unblocks:** nothing. It adds an edge and removes none.
**Also changes:** `P2-13.depends_on` and P2-13 `notes`.
**Supersedes:** none. R-024 and R-037 stand unchanged.

### R-045 - AUT-3's acceptance event has occurred, and TRIAGE records the evidence instead of shipping the card
**Date:** 2026-08-28
**Asked on:** AUT-3
**Answer, verbatim:**
> from docs/board/rc-board-phase2.json, card AUT-3 `acceptance`:
> "THE NEXT SCHEDULED HARNESS RUN produces a rulings PR authored by TRIAGE with
> no human input: EXECUTOR commits its report, TRIAGE boots, reads the newest
> file in docs/reports/, applies the rubric, and opens a PR carrying
> decisions/inbox.md entries and board edits."

**Ruling:** The event happened. The card does **not** flip to `shipped` here. It
moves `in_flight` to `todo` so the next EXECUTOR run can verify the evidence and
ship it.

**What occurred, with the timestamps a stranger can check.** Scheduled run
`20260827-220052` booted EXECUTOR; EXECUTOR committed its report to
`docs/reports/2026-08-28-executor-critic-acceptance-pass.md`, merged as `#80`;
the harness logged "invoking TRIAGE on
docs/reports/2026-08-28-executor-critic-acceptance-pass.md, cap 900s" at
`2026-08-28T10:42:33Z`; TRIAGE read the newest report on `origin/main`, applied
`docs/DOCTRINE-TRIAGE.md`, and opened this pull request carrying
`decisions/inbox.md` entries and board edits. No human started the run and no
human was asked for anything.

**Why TRIAGE does not ship it, and this is not a technicality.**
`DOCTRINE-TRIAGE.md` says TRIAGE may not ship a card, because shipping needs an
acceptance run and TRIAGE runs nothing. This card's acceptance IS TRIAGE's own
output. A role that marks its own existence proven is the one failure this
boundary was drawn to prevent, and the boundary is worth more than the day saved
by crossing it once.

**Why `todo` and not `in_flight`.** `in_flight` was correct while the card waited
on an event nobody could schedule: it kept an unattended run from picking up a
card whose only outstanding item was evidence that run itself would produce.
That reason has expired. The evidence now exists, in committed files, produced
by a different session than the one that will read it. `todo` is what puts it
back in the queue, and its id sorts ahead of every other eligible card.

**If the verification fails**, R-036 already answers it: the failure is a
harness defect and becomes a card of its own, never a question for the owner.

**Unblocks:** AUT-3 itself, which becomes the lowest-id eligible card on the
board.
**Also changes:** AUT-3 `status`, `lane`, `last_checkpoint` and `notes`.
**Supersedes:** none. R-036 stands: this is the event it named, arriving.

### R-046 - the 2026-08-28 gate audit: 6 of 9 stands, G4's first clause is re-derived against the P2-08 split, and none of the three open gates has a clause a terminal can close
**Date:** 2026-08-28
**Asked on:** G4, G7, G9
**Answer, verbatim:**
> from docs/reports/2026-08-28-executor-critic-acceptance-pass.md, section 1:
> "LAUNCH GATE: 6/9 passed"
>
> and section 2:
> "**None.** No board edit, no application code, no migration, no card status
> change."

**Ruling:** The gate count is unchanged at **6 of 9**. No gate flips. The audit
is recorded anyway, into each open gate's `notes`, because DOCTRINE-TRIAGE
section 4 requires it every time and because an audit that flips nothing is
still the most useful thing the next session can read.

**G4, stays `fail`, and its first clause is re-derived.** The clause still reads
"Closes when P2-08 and P2-09 have both landed", naming a card that no longer
exists: P2-08 split into P2-08a and P2-08b under R-025. Re-derived against the
board, per DOCTRINE-TRIAGE section 3 check 4, it reads: P2-08a shipped, P2-09
shipped, **P2-08b not shipped and blocked on andre**. The deciding clause is the
second one and it is untouched: no real document has travelled the whole path on
production. That clause is what P2-08b IS.

**G7, stays `fail`, `blocked_on: ivan` retained.** Three things stand in front of
the live send and none moved: `RESEND_API_KEY` in the production environment,
`RESEND_FROM` set, and a real recipient. No database read was performed for this
audit and none is claimed; nothing could have written a reminder row, because no
card shipped and no session touched the production database.

**G9, stays `fail`.** P2-14 is `todo` and blocked on the client, and no report of
Mihai completing a cycle exists. It is also downstream of G4.

**THE THREE OPEN GATES ARE NOT BACKLOG AND THERE IS NO CARD THAT MOVES THEM.**
Each is one of the three kinds DOCTRINE-TRIAGE section 4 says no terminal can
ever flip: G4 needs a third party to act, G7 needs actions in consoles no
terminal holds plus an account that P2-13 creates, and G9 needs the client to do
something himself. A reader who counts three of nine as remaining engineering
work will go hunting for cards that do not exist. That sentence is the point of
recording an audit that flips nothing.

**Unblocks:** nothing.
**Also changes:** the `notes` of G4, G7 and G9 carry the audit.
**Supersedes:** none. R-023 remains the standing rule that gates flip on
committed evidence only, and R-028 remains the audit it produced.

---

### R-047 - ledger execution under assertion: a terminal may execute a DELETE-class script that proves its own outcome, and nothing else
**Date:** 2026-08-28
**Asked on:** RST-01, P2-15, and CLAUDE.md section 8.6
**Answer, verbatim:**
> from the owner, in the strategy chat, 2026-08-28, on the RST-01 terminal's
> refusal to run the reset:
>
> "On 2026-08-28 Ivan personally executed scripts/reset-test-data.sql via psql
> inside an explicit transaction, read both grids, and committed. The strategy
> chat ratified the outcome in chat and never committed it. RST-01's terminal
> correctly refused to act on it."

**Ruling:** `CLAUDE.md` section 8.6 is **amended**. A terminal may execute a
DELETE-class script against the phase 2 database when, and only when, **all four**
of the following hold:

1. the script runs inside an **explicit transaction**,
2. it **evaluates its own pass and fail conditions in SQL**, inside that
   transaction, after the mutations and before the commit,
3. it **commits only on all-pass**, and otherwise **rolls back and exits
   non-zero**, and
4. **the terminal never chooses.** No reading of a grid, no judgement about
   whether a number looks right, no "the deviation is explainable so continue".
   The script decides and the terminal reports what it decided.

**NO SCRIPT WITHOUT EMBEDDED ASSERTIONS QUALIFIES.** This is not a general
loosening of 8.6 and it is not a permission attached to a person, a card or a
session. It is attached to a **property of the file**, and a file either has that
property or it does not. A script that prints grids for a human to read has
exactly the shape 8.6 was written to stop, whoever is running it and however
obviously safe it looks. The "no exceptions, no judgement call, no it is
obviously safe here" wording survives verbatim for that class, which is still
every script this repository has except one.

**WHY THE PROPERTY IS THE RIGHT THING TO ATTACH IT TO.** 8.6 exists because the
failure mode of a destructive script is a human being told in advance what the
numbers should be, at the end of a long transaction, deciding that what they are
seeing is close enough. That failure mode is not reduced by trusting the operator
more. It is removed by taking the decision away from whoever is at the keyboard,
which is what conditions 2, 3 and 4 do. A script that cannot commit a wrong
outcome is safer in a terminal's hands than a script that can, in anyone's.

**THE GRANT IS BOUNDED THREE WAYS, ALL OF THEM BINDING:**

- **Revoked by P2-13**, together with every other terminal credential grant.
  P2-13's checklist already carries the reversion of section 8 to Ivan-only
  applies with no connection from any terminal, and this ruling is revoked in the
  same act. It does not need its own line to die; it dies with the section.
- **Does not survive first real client data entry.** The moment real Rapid
  Construct data exists, the grant is gone, whether or not P2-13 has run. This is
  the same condition R-001's grant was written under and it is not weaker here.
  A script that asserts its own outcome still deletes rows, and an assertion
  proves the script did what it meant to, never that what it meant to do was
  right about somebody's real data.
- **Phase 2 database only.** No other project, no other environment.

**THE CONFLICT WITH R-044, STATED PLAINLY BECAUSE IT IS REAL.** R-044, ruled on
this same day, records that P2-13 "takes away, permanently, the ability of ANY
terminal to open a database connection", and adds `P2-19` to P2-13's
`depends_on` on exactly that reasoning. R-047 opens a connection R-044 describes
as closed.

**R-047 SUPERSEDES R-044 FOR ASSERTION-BEARING SCRIPTS ONLY.** Everything else in
R-044 stands untouched, including the capability edge it authored: P2-13 still
removes the connection permanently, P2-19 still depends on that removal, and the
ordering argument R-044 made is unaffected. What changes is only the window
before P2-13: in that window an assertion-bearing script may be executed by a
terminal. After P2-13 nothing may, and R-044's account of the end state is
exactly correct. The two rulings do not disagree about where this ends. They
disagree about one bounded window in the middle, and R-047 wins inside it.

**WHAT THIS DOES NOT AUTHORISE.** Authoring a destructive script and running it
in the same session without the assertions being reviewable in the diff first.
Applying a migration containing `DROP TABLE`, `TRUNCATE` or `DELETE`: migrations
are a separate path with their own three-phase apply, and 8.6's ban on them is
untouched. Reading anything under `/Users/ivan/rc-secrets` beyond the single
permitted read in 8.3. Executing anything at all against a project that holds
real client data.

**Unblocks:** nothing directly. RST-01 stays `blocked_on: ivan` on its own terms
until the corrected reset is run; this ruling changes who may run it, not whether
it has been run.
**Also changes:** `CLAUDE.md` section 8.6 is amended to match, in the same PR.
**Supersedes:** R-044, for assertion-bearing scripts only and only before P2-13.
R-031's widening of 8.6 to row-destroying operations stands. R-001 and R-012
stand.

---

### R-048 - P2-15 is accepted, with one ratified deviation: POST categories TEST- returned 1 against an acceptance line of 0
**Date:** 2026-08-28
**Asked on:** P2-15
**Answer, verbatim:**
> from the owner, 2026-08-28, on the run he executed himself:
>
> "POST categories TEST- returned 1 against an acceptance line of 0. Cause is
> RESTRICT + NOT NULL on products.category_id protecting three CRITIC-RACE
> products, active=f, created by hand from two live CRITIC sessions at the wave 1
> boundary. Not a script defect. RST-01 carries the fix."

**Ruling:** **P2-15 is accepted and ships.** One acceptance line returned a
non-zero count and the deviation is **ratified, not waived**: the cause is known,
it is not a defect in the file, and the correction is already authored.

**WHAT HAPPENED, FROM THE GRIDS THEMSELVES.** The eleven DELETE counts in file
order were 358, 0, 0, 131, 36, 179, 36, 179, 0, 302, 0, summing to **1,221 rows**.
Ten of the eleven consumed their PRE count exactly. The eleventh did not:
`PRE categories TEST 1` against `DELETE 0`, leaving `POST categories TEST- 1`.
Every other POST row is 0 as required, the mixed-orders list is empty, and
`POST products remaining` is 3.

**THE CAUSE IS THE SCHEMA DOING ITS JOB, NOT THE FILE FAILING.**
`products.category_id` is `NOT NULL` and `ON DELETE RESTRICT`, and it is the only
reference to `categories` in the schema. The category delete carries
`and not exists (select 1 from public.products p where p.category_id = c.id)`,
deliberately, so that a category still in use is **skipped rather than raising an
error that rolls the whole file back**. Three products were still pointing at it,
so it was skipped, exactly as written.

**THE THREE PRODUCTS ARE THE ONES THE SELECTOR COULD NOT SEE.** SKU prefixes
`CRITIC-RACE-` and `CRITIC-RACE2-`, `active=f`, created by hand from two live
CRITIC sessions at the wave 1 boundary on 2026-08-25 and 2026-08-26. They are in
no committed test source at any commit in this repository's history, because a
session that types into a screen leaves nothing in `tests/`. `POST products
remaining 3` is those three and nothing else.

**WHY THE ACCEPTANCE LINE READ 0 AND THE RUN READ 1, WHICH IS THE REAL FINDING.**
The old file's pre-check counted `categories where name like 'TEST-%'`, while its
delete counted that **minus the ones still referenced**. The two clauses measured
different sets, so a skip could never show up as a discrepancy the pre-check had
predicted. That is a reporting defect rather than a data defect: nothing wrong
was deleted and nothing wrong survived, but the file could not tell the operator
in advance that a skip was coming.

**RST-01 CARRIES THE FIX AND IS ALREADY MERGED**, as `f8e9078`. It resolves the
category set once, before the deletes, into `rc_reset_categories`, so the
pre-check counts the rows the delete will actually remove; it adds the two
CRITIC-RACE prefixes to a provenance-bearing registry so those three products
come into scope; and it asserts both halves of the category rule, failing on a
prefixed category with zero referencing products and on one still held by a
product that should itself have gone. Run against the corrected file, this
deviation cannot recur silently: it either does not happen or it stops the run.

**WHAT IS STILL OUTSTANDING, AND IT IS NOT THIS CARD.** The three products and
the one category are still in the client's catalogue. Removing them is RST-01's
run, which is `blocked_on: ivan`, and under R-047 a terminal may now perform it
because the corrected file asserts its own outcome.

**Unblocks:** P2-15 ships. P2-13's `depends_on` on P2-15 is satisfied; P2-13
remains blocked behind P2-08b and P2-19.
**Also changes:** the board, P2-15 to `shipped` with `evidence.kind: journal`
carrying both grids verbatim, committed as
`docs/reports/2026-08-28-owner-p2-15-reset-run.md`.
**Supersedes:** none. R-033's two preconditions were both met before the run.

---

### R-049 - self-merge on green quality for documentation-shaped PRs, by role and by path, and not one inch further
**Date:** 2026-08-28
**Asked on:** AUT-12, and CLAUDE.md section 3
**Answer, verbatim:**
> from the owner, in the strategy chat, 2026-08-28, dispatched to the AUTHOR
> terminal:
>
> "AUT-12, self-merge authorization.
>   POC-BUILDER may merge its own PRs touching scripts/poc/, run.sh, CLAUDE.md,
>   DESIGN.md when quality is green on the head sha. EXECUTOR may merge its own PRs
>   touching docs/, decisions/, docs/board/ when quality is green. Application code
>   and migrations are excluded and route to AUT-13. Revoked by P2-13 with every
>   other terminal grant. Amend CLAUDE.md."

**Ruling:** granted as written, and `CLAUDE.md` section 3 gains a self-merge
clause naming the two role and path pairs. The grant is bounded by role, by
path, by check and by date, and every one of those four bounds is load-bearing.

**WHAT THIS ACTUALLY CHANGES, WHICH IS NARROWER THAN IT READS.** Application
code already self-merges. Section 5b has said since R-002 that cards ship on
`green_self_merge`, which is two things: the green `quality` check AND the
card's named acceptance spec passing. The gap this closes is the PR that has no
card and therefore no acceptance line: a report, a ruling commit, a board edit,
a dispatch output. Three of those landed on 2026-08-28 and none of them had a
rule saying who could merge them. So this grant drops the acceptance half of 5b,
and it drops it only for changes whose content `quality` can already inspect in
full.

**TWO PATHS IN THE DISPATCH ARE REDUNDANT AND ARE RECORDED AS SUCH RATHER THAN
COPIED.** `run.sh` resolves to exactly one tracked file, `scripts/poc/run.sh`,
which is already inside `scripts/poc/`. `docs/board/` is already inside `docs/`.
`DESIGN.md` resolves to exactly one tracked file, `docs/poc/DESIGN.md`. The
clause in `CLAUDE.md` is written with the paths deduplicated and the resolutions
named, because a path list with overlapping entries invites a later reader to
assume the overlap meant something.

**THE GRANT, EXACTLY:**

- **POC-BUILDER** may merge its own PR when every changed path is under
  `scripts/poc/`, or is `CLAUDE.md`, or is `docs/poc/DESIGN.md`.
- **EXECUTOR** may merge its own PR when every changed path is under `docs/` or
  under `decisions/`.
- **Every changed path.** One file outside the set removes the grant for the
  whole PR. There is no partial merge and no judgement about whether the stray
  file mattered.
- **`quality` green on the head sha**, which means the run exists for that exact
  sha and concluded success. A pending check is not green, an absent check is
  not green, and a check inherited from an earlier sha is not green.

**APPLICATION CODE AND MIGRATIONS ARE EXCLUDED, AND THE EXCLUSION IS WHAT MAKES
THE REST SAFE.** A PR touching `app/`, `lib/`, `components/`, `tests/`,
`supabase/migrations/` or any other application path keeps the full 5b gate,
green check plus the card's named acceptance run, and migrations keep section 8
on top of that. This ruling does not touch either. Where such a PR carries a
deviation, the deviation goes to TRIAGE under R-050 rather than to Ivan.

**WHY GREEN IS A REAL PROOF HERE AND NOT A SKIP, WHICH WAS CHECKED BEFORE
GRANTING.** `.github/workflows/quality.yml` triggers on `pull_request` with **no
path filter**, so a documentation-only PR runs the entire job: typecheck, build,
both board validators, the production reset SQL parser, the category vocabulary
check, the migration ledger check, the production-target check, the harness cap
proof, the production guard refusal, and the end to end suite against a local
Supabase stack. A docs-only green here is thirteen steps that actually executed,
not a skipped workflow reporting success. Had the workflow carried a `paths`
filter, this grant would have been a grant to merge on a check that never ran,
and it would have been refused.

**WHAT THE GRANT DOES NOT COVER, STATED SO NOBODY INFERS IT.** AUTHOR and TRIAGE
are not named in the dispatch and are not granted anything here. TRIAGE's
existing authority is unchanged: `docs/DOCTRINE-TRIAGE.md` lets it merge its own
rulings PR and no other. An AUTHOR PR, including the one carrying this ruling,
still goes to Ivan. Widening a grant is an owner decision under escalation item
5, so the gap is recorded and left open rather than filled by inference.

**Unblocks:** nothing is blocked on this. It removes a class of PR that had no
stated merge authority and was therefore accumulating.
**Also changes:** `CLAUDE.md` section 3 gains the self-merge clause; section 8.7
gains the revocation item; the board gains AUT-12.
**Revoked by P2-13**, with every other terminal grant, as a checklist item in
`docs/RUNBOOK-CREDENTIAL-ROTATION.md` and not as an inference from section 8.
**Supersedes:** none. R-002 is unchanged and still governs cards.

---

### R-050 - TRIAGE ratifies without a human, the escalation list gains launch timing, and a ratification that is not committed with an id did not happen
**Date:** 2026-08-28
**Asked on:** AUT-13, `docs/DOCTRINE-TRIAGE.md` sections "What TRIAGE is" and 6
**Answer, verbatim:**
> from the owner, in the strategy chat, 2026-08-28, dispatched to the AUTHOR
> terminal:
>
> "AUT-13, TRIAGE ratifies deviations.
>   TRIAGE applies DOCTRINE-TRIAGE.md to committed reports and issues ratify or
>   overturn rulings with ids, without human input. Escalation to Ivan narrows to
>   RC-PROJECT-RULES section 2 owner decisions only: money, pricing, launch timing,
>   legal, vendor agreements, credential grants, anything touching Mihai or Andre,
>   panel actions, production DELETE-class execution, acceptance sign-off.
>   Binding constraint: a ratification is not a ratification until it is a committed
>   line with an id. Chat is not authority. This is the failure that produced two
>   refused dispatches on 2026-08-28; record it in LEARNINGS."

**Ruling:** granted, with **three corrections to the premises**, all three
verified against the committed record before this entry was written. The
substance of the grant is unchanged by all three.

**CORRECTION 1: THE ESCALATION LIST IS NOT NARROWED, BECAUSE IT WAS ALREADY THIS
LIST AND WAS ALREADY CLOSED.** `docs/DOCTRINE-TRIAGE.md` section 6 has carried a
CLOSED list of nine items since AUT-2, and it opens with "The list is CLOSED.
Everything on it goes to Ivan. Everything not on it, TRIAGE decides and records."
Nine of the dispatch's ten items are already on it, item for item: money,
pricing, legal, vendor, credential grants, anything touching Mihai or Andre,
panel actions, production DELETE-class execution, acceptance sign-off. **The
dispatch therefore widens the list by exactly one item and narrows nothing.**
The new item is **launch timing**, which is genuinely absent from the nine and is
genuinely an owner decision. It is added as **item 10** and the list stays
closed. Recording this as a narrowing would have left a future reader believing
TRIAGE's authority grew on this date. It did not; the owner's kept list grew.

**CORRECTION 2: THE CITED AUTHORITY DOES NOT RESOLVE, AND THE LIST IS WRITTEN
OUT INSTEAD OF POINTED AT.** "RC-PROJECT-RULES section 2" cannot be followed by
a terminal. The file is not tracked in this repository at any commit, it lives
at `/Users/ivan/Downloads/RC-PROJECT-RULES.md`, and its headings are not
numbered, so "section 2" resolves by position to COMMUNICATION FORMAT rather
than to any list of owner decisions. The matching content is under its OWNER VS
DELEGATED heading, the seventh, and reads "money, pricing, launch timing, legal,
vendor agreements, credential grants, anything touching the client relationship".
That file's own first rule is that ground truth is committed repository files
only, so **citing it as the boundary of a terminal's authority would violate the
rule it states.** The escalation list in `docs/DOCTRINE-TRIAGE.md` remains the
single authority, is now ten items, and is enumerated in full there. No terminal
is required to read an uncommitted file to know what it may decide.

**CORRECTION 3: THE 2026-08-28 FAILURE WAS THREE DISPATCHES WITH ABSENT
PREMISES, OF WHICH ONE STEP WAS REFUSED, NOT TWO REFUSED DISPATCHES.** The
committed count is in `docs/reports/2026-08-28-executor-rec-01-record-repair.md`
section 6: landing PR #83 was dispatched as CONFLICTING and 7 behind when origin
had already been merged into by a broken resolution nobody validated; RST-01 was
dispatched with P2-15 having run and a "ledger execution ruling" authorising the
destructive step, when P2-15 was `blocked` with `evidence: null` and the inbox
ended at R-046; REC-01 was dispatched to close PR #83 unmerged when #83 was
already MERGED and `c97e48e` was its own squash-merge commit. **Exactly one
action was refused**, RST-01's step 4, and it was refused correctly. One further
step, REC-01's step 5, was reported inapplicable rather than refused. The card
and the LEARNINGS entry carry the accurate count, because a card describing this
failure while itself miscounting it would be the failure.

**THE GRANT ITSELF, WHICH ALL THREE CORRECTIONS LEAVE INTACT:**

1. **TRIAGE ratifies and overturns without human input.** It reads one committed
   report, applies the rubric, and writes rulings with ids. It does not wait for
   Ivan to agree, and a deviation it has ratified is settled. This was already
   the design; it is now stated in the document rather than implied by the list
   of what TRIAGE may do.
2. **A ratification is not a ratification until it is a committed line with an
   id.** Chat is not authority. This is the binding constraint and it is written
   into `docs/DOCTRINE-TRIAGE.md` as a rule of the role, not as advice.
3. **The escalation list is ten items and closed.** Everything not on it, TRIAGE
   decides and records.

**ITEM 8 KEEPS ITS WORDING AND GAINS A POINTER, BECAUSE R-047 CHANGED WHO MAY
PERFORM AND NOT WHO MAY DECIDE.** R-047 lets a terminal execute a DELETE-class
script that proves its own outcome. It did not give any role the authority to
decide such a run should happen. Item 8 forbids TRIAGE deciding it, and that is
untouched: the two rulings govern different verbs and do not conflict.

**Unblocks:** nothing. It removes the condition under which a correctly
committed TRIAGE ratification was treated as provisional.
**Also changes:** `docs/DOCTRINE-TRIAGE.md` gains the no-human-input statement,
the committed-line constraint, and item 10; `docs/LEARNINGS.md` gains the entry
the dispatch asked for; the board gains AUT-13.
**Supersedes:** none. R-041 and R-045 stand.

---

### R-051 - Docker on the build machine is accepted, the local Postgres shim becomes a committed artefact, and E3 closes by half
**Date:** 2026-08-28
**Asked on:** AUT-14, escalation E3, and `docs/reports/2026-08-28-executor-rst-01-self-asserting-reset.md`
**Answer, verbatim:**
> from the owner, in the strategy chat, 2026-08-28, dispatched to the AUTHOR
> terminal:
>
> "AUT-14, commit the Docker Supabase shim.
>   The nine-object shim RST-01 used to apply twelve migrations to stock postgres:16.
>   Wire it so unattended runs can verify migrations. Closes escalation E3."

**Ruling:** granted, with the dependency decision recorded as the owner decision
it is, and with **one correction: this closes half of E3, not E3.**

**THE OWNER DECISION E3 WAS ACTUALLY ASKING FOR IS NOW MADE, AND IT IS THE PART
ONLY IVAN COULD MAKE.** E3 escalated under two of the nine: item 1, money, since
Docker Desktop is not free for business use above its threshold, and item 4,
adding a third-party dependency. **Docker Desktop is accepted on the build
machine.** It is installed and running there now, Docker Desktop server 29.4.2,
with `postgres:16` already pulled, and the owner confirmed it during the RST-01
session. That answer is what this entry commits, because the answer was given in
chat and the escalation is still open in the record, which is precisely the
failure R-050 exists to stop.

**CORRECTION: E3 ASKED FOR TWO CAPABILITIES AND THIS CARD DELIVERS ONE.** E3's
text is "install Docker on the build machine so unattended runs can start a
local database **and run the automated screen tests**". Those are different
capabilities with different requirements, and the card as dispatched buys only
the first.

- **The migration half closes.** A committed shim plus stock `postgres:16`
  applies all twelve migrations with no credentials, no Supabase CLI and no
  network.
- **The screen-test half does not close here, and it does not need this card.**
  The Playwright suite talks to PostgREST, GoTrue and the storage API, none of
  which a bare `postgres:16` serves. What it needs is `supabase start`, which
  needed Docker and now has it. That is a separate wiring job in `run.sh` and is
  not authored as a card by this ruling.
- **Note what CI already does, so the card is not sold as more than it is.**
  `.github/workflows/quality.yml` already runs `supabase start` and
  `supabase db reset` on every pull request, so migrations are already proven
  against a real stack on every PR. **The shim's value is not that migrations
  become verified; it is that they become verifiable locally, offline, with no
  credentials, in one container instead of ten.** That is what let a destructive
  file aimed at the client's database be proven before the owner ran it, and it
  is the thing that would otherwise exist only as prose in a report.

**THE OBJECT COUNT IS NOT PART OF THIS RULING AND MUST NOT BE PART OF THE
ACCEPTANCE LINE.** The repository states it three different ways today: the
`docs/LEARNINGS.md` entry is titled "five-object shim", the RST-01 report says
nine, and enumerating either of their own lists gives ten. The committed file
becomes the authority and the count is dropped, because an acceptance line
asserting a number that three committed documents already disagree about would
fail for a reason that has nothing to do with whether the shim works.

**THE MACHINE CONSTRAINT IS PART OF THE RULING, BECAUSE IT IS NOT DISCOVERABLE
AND IT IS DESTRUCTIVE.** `docker cp` kills Docker Desktop on this machine. The
shim is delivered to the container by bind mount, and SQL is fed to `psql` on
stdin. Any wiring that reaches for `docker cp` takes the build machine down and
must not be written.

**Unblocks:** nothing is blocked on this. It converts a capability that exists
only as prose in a report into one a stranger can run.
**Also changes:** the board gains AUT-14, authored `todo` and not shipped, since
committing and wiring a script is EXECUTOR work and this is an AUTHOR pass.
Escalation E3 is answered on its owner half and stays open on its screen-test
half, recorded on the card rather than silently dropped.
**Supersedes:** none.
---

### R-052 - a merge conflict is resolved locally by EXECUTOR, never in the GitHub web editor and never by the owner
**Date:** 2026-08-28
**Asked on:** GUARD-01, and every PR that has ever conflicted on this board
**Answer, verbatim:**
> from the owner, 2026-08-28, on the third conflict-residue incident in four days:
>
> "Three incidents: 555b725 (board JSON, marker chars stripped, tails left as
> content, did not parse), LEARNINGS.md:1536 and :1636 (same, in markdown, caught
> by nothing), and PR #94 (owner resolving in the GitHub web editor)."

**Ruling:** **Merge conflicts are never resolved in the GitHub web editor, and
never by the owner.** A conflicting PR is assigned to EXECUTOR, which resolves it
**locally, against the full tree, with the validator run before the commit.**

**THREE INCIDENTS, ONE FAILURE MODE, AND IT IS NOT CARELESSNESS.** In all three
the resolver deleted the conflict marker CHARACTERS and left the tails behind as
file content:

- `555b725`: `docs/board/rc-board-phase2.json` committed with
  ` triage/20260827-220052` and ` main` as literal lines. The file did not parse.
  The board validator would have caught it and was not run.
- `d66a28e`: `docs/LEARNINGS.md` lines 1536 and 1636, ` poc/19-harness-caps` and
  ` main`. Markdown has no parser to offend, so **nothing caught it and it sat on
  `main` for a day**, through four subsequent merges, until GUARD-01 removed it.
- PR #94: the same residue **four times across two files**, produced in the
  GitHub web editor.

**WHY THE WEB EDITOR IS THE COMMON FACTOR AND THE RULE NAMES IT.** It shows one
file at a time, out of the tree, with no way to run the validator, no way to run
the parser and no way to run the test suite before committing. Every safeguard
this repository has is a command, and the web editor is the one place where none
of them can be run. A resolution made there is a resolution made blind, and being
the owner does not change what the tool can see.

**AND WHY IT NAMES THE OWNER SPECIFICALLY, WHICH IS NOT A CRITICISM.** The owner
does not read code; that is the standing condition this whole project is built
around, and it is why every check here is machine-checkable. Resolving a merge
conflict is the one task that requires reading both sides of a diff and deciding
which lines survive. Asking him to do it inverts the arrangement. It is also the
task with the least visible failure: a bad resolution produces a file that looks
finished.

**WHAT EXECUTOR DOES INSTEAD, and it is already how this was done once.** Fetch,
rebase or merge locally, resolve against the whole tree, run
`node docs/board/validate-board.mjs` on both boards plus
`npm run check:conflict-residue`, and only then commit. Where the branch cannot
be force-pushed, per CLAUDE.md section 3, the resolved tree lands as one ordinary
commit on top of the existing head. PR #83 was landed exactly this way on
2026-08-28.

**A GREP FOR THE MARKERS IS NOT THE CHECK.** It is worth saying because it is the
obvious response and it does not work: `grep '<<<<<<<'` finds nothing in any of
the three incidents, since the characters it looks for are precisely the
characters the bad resolution deleted. GUARD-01 adds
`scripts/check-conflict-residue.mjs` to the `quality` workflow, which catches
markers intact, markers with the leading characters stripped, and the duplicate
JSON keys that survive a naive cleanup and still parse.

**Unblocks:** nothing.
**Also changes:** `CLAUDE.md` section 3 carries the rule.
`scripts/check-conflict-residue.mjs` and the `Check for conflict residue`
workflow step enforce it. `docs/LEARNINGS.md` loses the two residue lines that
were live on `main`.
**Supersedes:** none.

---

### R-053 - G4 is decoupled from Andre: the gate is the ingest endpoint asserted against a fixture, not one real document through a live scenario
**Date:** 2026-08-28
**Asked on:** G4, P2-08b
**Answer, verbatim:**
> from the owner, 2026-08-28:
>
> "G4 is no longer satisfied by one real supplier document through Andre's live
> Make scenario. It is satisfied by the ingest endpoint asserted against a fixture
> document plus its failure cases: redirect, malformed payload, oversize, auth
> rejection. Andre's live scenario becomes a non-gating card landing whenever his
> result arrives."

**Ruling:** **G4's deciding clause changes.** It is no longer "one real document
has travelled the whole path on production". It is:

**the ingest endpoint asserted against a fixture document, plus its four named
failure cases: redirect, malformed payload, oversize, and auth rejection.**

**THE RATIONALE IS A PROPERTY OF MACHINE ENDPOINTS, NOT AN ACCOMMODATION.** A
machine endpoint sitting behind a redirect returns **200 while doing nothing**.
The caller sees success, the payload goes to the redirect target or nowhere, and
every happy-path test passes. So the happy path was never the thing worth gating
on: it is the case least able to distinguish a working endpoint from a broken
one. The four failure cases are what actually prove the endpoint exists, is
reachable without a redirect, validates what it receives, bounds what it accepts,
and refuses what is not authenticated.

**THIS IS A STRICTLY STRONGER GATE, WHICH IS THE POINT.** One real document
through a live scenario proves one document worked once, on a day, through a
third party's configuration. It is not re-runnable, it is not a check, and it
cannot fail in CI. A fixture document plus four failure assertions runs on every
push, for ever.

**WHAT IT REMOVES IS A DEPENDENCY ON A PERSON, NOT A STANDARD.** G4 has been
`fail` since the board opened and every audit has recorded the same cause: it
waits on Andre. R-046 stated that plainly, that no terminal can close it and no
card exists that moves it. That is an unbounded wait on a third party for a gate
that is supposed to measure whether **this** repository's extraction path works.

**ANDRE'S LIVE SCENARIO IS NOT CANCELLED, IT IS DEGATED.** It becomes a
**non-gating card**, landing whenever his result arrives. The round trip through
his Make scenario is still worth having and is still the thing that proves the
integration end to end with the real counterparty. It simply stops holding a
launch condition hostage.

**Unblocks:** G4 becomes closeable by a terminal for the first time. It does not
flip here: gates flip on committed evidence only, under R-023, and the assertions
do not exist yet.
**Also changes:** G4's clause and notes on the board. P2-08b is rescoped to the
ingest endpoint and its four failure cases; the live round trip is a new
non-gating card.
**Supersedes:** R-046's G4 audit is superseded on its deciding clause only. Its
finding that the first clause still named a card that no longer existed stands
and is already applied.

---

### R-054 - P2-19 is retired: `Bash(psql:*)` is permitted, so the migration ledger is no longer an owner action
**Date:** 2026-08-28
**Asked on:** P2-19, P2-13
**Answer, verbatim:**
> from the owner, 2026-08-28:
>
> "P2-19 retired. Bash(psql:*) is permitted in Claude Code. Update P2-13's
> depends_on accordingly and state the new dependency set explicitly."

**Ruling:** **P2-19 is retired.** The card existed because the migration ledger
said 0009 while the schema was at 0012, and because **only Ivan could correct
it**: no terminal could open a database connection. That premise is gone.
`Bash(psql:*)` is permitted in Claude Code, `psql` is on this machine at
`/opt/homebrew/opt/libpq/bin/psql`, and R-047 already governs what a terminal may
execute. The ledger correction is now ordinary work.

**P2-13's `depends_on` BECOMES EXACTLY `["P2-08b"]`.** Stated explicitly because
the card has carried three different dependency sets in two days and a reader
should not have to reconstruct which is current:

- `P2-15` is **removed**: shipped 2026-08-28, accepted under R-048.
- `P2-19` is **removed**: retired by this ruling.
- `P2-08b` **remains**, and is now the only entry.

**WHAT R-044 GOT RIGHT AND WHAT THIS CHANGES.** R-044 added `P2-19` to P2-13's
`depends_on` on a capability argument: P2-13 permanently removes any terminal's
ability to open a database connection, and P2-19 needed exactly that capability,
so P2-19 had to land first or become an owner action for ever. **The argument was
correct and is now satisfied a different way.** P2-19 does not need to precede
P2-13 because the ledger correction can simply be done, now, while the connection
exists. The edge is not deleted because it was wrong; it is deleted because the
work it protected is no longer blocked.

**THE HANDOVER STILL INHERITS THE DEFECT IF NOBODY FIXES THE LEDGER.** Retiring
the card does not fix the ledger. `docs/migrations/APPLY-LOG.md` and the ledger
rows in `scripts/ledger-rows-0010-0012.sql` still describe a database whose own
record of what is installed is three versions behind. A card for that write is
authored under GUARD-01's sibling work, and it is an ordinary card now rather
than a permanent owner action.

**Unblocks:** P2-19 leaves the blocked lane. P2-13 loses two of its three
dependencies.
**Also changes:** the board, P2-19 to shipped-as-retired with the reason on the
card, and P2-13's `depends_on`.
**Supersedes:** R-044, on the `P2-19` edge only. R-044's capability test and its
account of what P2-13 removes stand unchanged, as does R-047's bounded exception
to that removal.

---

### R-055 - every non-migration production write is journalled in docs/PRODUCTION-WRITES.md
**Date:** 2026-08-28
**Asked on:** R-047, RST-01
**Answer, verbatim:**
> from the owner, 2026-08-28, on the loose end RST-01's report flagged:
>
> "R-047 created a second production write path with no journal, since
> APPLY-LOG.md is by its own framing migrations only. Create
> docs/PRODUCTION-WRITES.md as its sibling: one row per non-migration production
> write, carrying date, actor, script sha256, assertion pass count, rows affected,
> and the report path."

**Ruling:** **`docs/PRODUCTION-WRITES.md` is created as the sibling of
`docs/migrations/APPLY-LOG.md`,** and **every non-migration write to the
production database gets a row in it, before the PR that performs the write is
merged.**

**THE GAP THIS CLOSES WAS OPENED BY R-047 AND WAS REPORTED BY THE TERMINAL THAT
USED IT.** Until R-047 there was one way to write to production, a migration,
and one journal, `APPLY-LOG.md`. R-047 created a second: an assertion-bearing
script executed by a terminal. `APPLY-LOG.md` is by its own framing a migrations
log, so the RST-01 run of 2026-08-28 was journalled in a report and a board
field and nowhere a reader would think to look. **One run is survivable. Two
paths and one log is a record that quietly stops being complete.**

**EACH ROW CARRIES SIX FIELDS, AND EACH ONE IS THERE TO ANSWER A QUESTION A
STRANGER WILL ACTUALLY ASK:**

| field | the question it answers |
|---|---|
| date | when |
| actor | who or what ran it, by name: the owner, or the role of the terminal |
| script sha256 | **exactly which bytes ran**, not which file name |
| assertion pass count | what the script proved about its own outcome |
| rows affected | the blast radius, as a number |
| report path | where the grids are |

**THE SHA256 IS THE FIELD THAT MATTERS MOST AND IT IS THE EASIEST TO OMIT.** A
file name identifies a path, not a version. `scripts/reset-test-data.sql` on
2026-08-28 meant two materially different files eleven hours apart: the one the
owner ran, and the one RST-01 corrected and a terminal ran. A log carrying only
the path cannot tell those apart, and the difference between them is three
products and a category.

**THE BACKFILL IS PART OF THE RULING, NOT A COURTESY.** Both 2026-08-28 writes
are entered: the owner's P2-15 run and the terminal's RST-01 run. A journal that
begins on the day it is created implies nothing happened before it.

**CLAUDE.md CARRIES THE MANDATE**, in section 8, so a session that never opens
this file still obeys it.

**Unblocks:** nothing.
**Also changes:** `docs/PRODUCTION-WRITES.md` created and backfilled with both
2026-08-28 runs. `CLAUDE.md` section 8 mandates an entry for any future
non-migration production write.
**Supersedes:** none. `APPLY-LOG.md` keeps its scope exactly: migrations, and
only migrations.

---

### R-056 - the self-merge grant extends to AUTHOR on the EXECUTOR path set, and the clause saying it did not is retired by the owner who reserved that decision
**Date:** 2026-08-28
**Asked on:** CLAUDE.md section 3.1, R-049, and PR #94's first named loose end
**Answer, verbatim:**
> from Ivan, 2026-08-28, in the session that dispatched the phase 3 board:
>
> "Also: extend R-049 to AUTHOR, same terms as EXECUTOR. AUTHOR may merge its own
> PRs touching docs/, decisions/ and docs/board/ when quality is green on the head
> sha. Application code and migrations excluded. Revoked by P2-13 with every other
> terminal grant. Amend CLAUDE.md 3.1 and append the ruling."

**Ruling:** granted as written. `CLAUDE.md` section 3.1 gains a third row,
**AUTHOR**, carrying the same path set as EXECUTOR: anything under `docs/` or
under `decisions/`.

**THE THREE PATHS IN THE DISPATCH ARE TWO.** `docs/board/` is inside `docs/`.
R-049 made exactly this deduplication for `run.sh` and `DESIGN.md`, and recorded
the resolutions rather than copying the overlap, on the grounds that a path list
with overlapping entries invites a later reader to assume the overlap meant
something. Same treatment, same reason. The AUTHOR row is character-for-character
the EXECUTOR row, because **same terms** was the instruction and two rows meaning
one thing should not be two different sentences.

**THIS RETIRES A CLAUSE R-049 WROTE DELIBERATELY, WHICH IS THE SUBSTANCE OF THIS
RULING.** Section 3.1 said: "AUTHOR AND TRIAGE ARE NOT GRANTED ANYTHING HERE...
An AUTHOR PR goes to Ivan. Widening this grant to another role is an owner
decision, not an inference from the table." R-049 was right to write it and right
about who could undo it, and the sentence did its job: the grant was widened by
the owner saying so rather than by a terminal reasoning that AUTHOR obviously
qualified. **TRIAGE keeps its exclusion in full.** Only the AUTHOR half moves.

**WHY THE GAP EXISTED AT ALL.** R-049 identified the case it was closing as the
PR with no card and therefore no acceptance line: a report, a ruling commit, a
board edit. AUTHOR is the role that produces almost all of that, and it was the
one role excluded from the grant aimed at its own output. PR #94 said so in its
description as its first loose end, and this closes it.

**EVERY BOUND FROM R-049 SURVIVES, restated because a ruling that only says "same
terms" makes a reader guess which terms:**

- **Every changed path.** One file outside the set removes the grant for the
  whole PR. No partial merge, and no judgement about whether the stray file
  mattered, because that judgement is the thing being removed.
- **`quality` green on the head sha.** A run exists for that exact sha and
  concluded success. Pending is not green, absent is not green, and a run
  inherited from an earlier sha is not green. A conflicting PR triggers zero
  workflows, so an all-pass from `gh pr checks` on a conflicting PR is leftover
  context, not a result.
- **Application code and migrations excluded**, keeping the full 5b gate: green
  check plus the card's named acceptance run, with section 8 on top for
  migrations.
- **The clause dies if a `paths:` filter is ever added to
  `.github/workflows/quality.yml`**, because a docs-only PR would then be
  skipped, report success in seconds, and the grant would read "merge whenever
  the checks did not run". Re-verified for this ruling rather than inherited:
  `grep -c '^[[:space:]]*paths:' .github/workflows/quality.yml` prints `0`.
- **Revoked by P2-13** with every other terminal grant. Section 8.7 already
  carries "revoking the self-merge grant in section 3.1" and needs no amendment:
  deleting that section removes all three rows at once. **No fourth checklist
  item is added on purpose.** A second line aimed at the same section is a second
  thing to forget and a chance for the two to disagree.

**WHAT THIS DOES NOT REACH, ON THE BOARD IT WAS DISPATCHED ALONGSIDE.** Every
card in the phase 3 schema wave authors a file under `supabase/migrations/`.
Those PRs are outside this grant under any reading, and were outside R-049 too.
The grant covers authoring a board, never working it.

**THE PR CARRYING THIS RULING IS ITSELF OUTSIDE THE GRANT IT CREATES.** It
touches `CLAUDE.md`, `.github/workflows/quality.yml` and `.gitignore`, none of
which is in the AUTHOR set, so Ivan merges it. That is not an awkwardness to work
around. A grant that could authorise its own creation is a terminal writing its
own permissions, and the path rule producing the right answer here with nobody
special-casing it is the best evidence the rule is drawn correctly.

**Unblocks:** nothing. It removes an approval step from future AUTHOR pull
requests whose every path is under `docs/` or `decisions/`.
**Also changes:** `CLAUDE.md` section 3.1, the role table and the
AUTHOR-and-TRIAGE paragraph; and the `doctrine` field of
`docs/board/rc-board-phase3.json`, which cites R-049 and this ruling together.
**Supersedes:** none. R-049 stands in full and this extends it by one row. R-002
and section 5b are untouched.

### R-057 - the escalation list in DOCTRINE-TRIAGE section 6 is the sole authority on what goes to the owner, for every role, and the pointer to an untracked file is deleted
**Date:** 2026-08-30
**Asked on:** none. An owner dispatch, step 0b.
**Answer, verbatim:**
> The owner escalation list, committed. Every dispatch citing "RC section 2" has
> been citing a file that is not in the repo. That is the same false-premise
> failure that produced two refusals. Write the list into DOCTRINE-TRIAGE section
> 6 as the sole authority, ruling R-057, and delete every reference to an
> external rules file from CLAUDE.md and any dispatch template:
>   money, pricing, launch timing, legal, vendor agreements, credential grants,
>   anything touching the client, panel actions (DNS, Vercel, Supabase,
>   BotFather), production destructive execution, acceptance sign-off.
> Everything else is TRIAGE's under R-050.

**Ruling:** `docs/DOCTRINE-TRIAGE.md` section 6 is the sole authority on what
escalates to the owner, **for every role and not only for TRIAGE**, and it says
so in its own first paragraph now. The pointer to the untracked file is deleted.

**THE LIST WAS ALREADY THIS LIST, AND SAYING SO IS THE USEFUL PART OF THIS
RULING.** The dispatch's ten items map onto the committed ten one for one, with
nothing added and nothing dropped:

| dispatched | section 6 |
|---|---|
| money | 1, money |
| pricing | 2, pricing |
| launch timing | 10, launch timing |
| legal | 3, legal |
| vendor agreements | 4, vendor |
| credential grants | 5, credential grants |
| anything touching the client | 6, anything touching Mihai or Andre |
| panel actions (DNS, Vercel, Supabase, BotFather) | 7, panel actions |
| production destructive execution | 8, production DELETE-class execution |
| acceptance sign-off | 9, acceptance sign-off |

**So this ruling changes exactly two things and neither is the list.**

**ONE: IT MAKES THE SECTION THE AUTHORITY FOR EVERY ROLE, NOT ONLY FOR TRIAGE.**
It sat inside a document about TRIAGE and was written in TRIAGE's voice, so an
EXECUTOR or an AUTHOR reading it could reasonably conclude it bound somebody
else. That is how a dispatch came to cite an external document at all: there was
no file that visibly answered "what may I decide" for the role reading it.

**TWO: IT DELETES THE POINTER, WHICH THE PREVIOUS WORDING KEPT ON PURPOSE AND
WHICH WAS THE WRONG CALL.** Section 6 carried a paragraph naming
`/Users/ivan/Downloads/RC-PROJECT-RULES.md`, saying it held a similar list, and
saying no terminal is required to open it. Every sentence of that was true and
the paragraph still did harm: naming a file a terminal must not rely on leaves
the reader wondering whether they ought to go and look, which is most of the
cost of the citation it was trying to neutralise. It is gone. There is nothing
to look at.

**ITEM 7 GAINS NAMED EXAMPLES AND LOSES NOTHING.** It read "a hosting, database,
DNS, email or payment console". It now reads "a console someone has to log into"
with DNS, Vercel, Supabase, BotFather, email and payment named as examples.
**BotFather is the one worth adding.** The Telegram bot is this project's own
plumbing rather than a client-facing service, which made it the single panel a
terminal was most likely to reason itself into treating as internal. It is not.
It is a click in somebody else's session like every other item, and the test
stays the category rather than the list.

**WHAT WAS NOT DELETED, AND WHY THAT IS NOT AN OVERSIGHT.** Three places still
name the external file: ruling R-050 in this file, the AUTHOR report of
2026-08-28, and the AUT-12 note on the phase 2 board. All three are RECORDS THAT
THE CITATION FAILED, not citations. Deleting them would remove the only
committed explanation of why the reference stopped being used, and the rules of
this file and of `CLAUDE.md` 9b both forbid rewriting a ruling or a report after
the fact. **One live citation existed and it is gone**: the AUT-13 note on the
phase 2 board offered the file as corroboration for the plain-hyphens rule, and
a rule in this repository does not become more binding by being agreed with
somewhere a terminal cannot read.

**Unblocks:** every CRM card. A dispatch instruction that could not be followed
was standing in front of all of them.
**Also changes:** `docs/DOCTRINE-TRIAGE.md` section 6, header and item 7 and the
closing paragraph; the AUT-13 note on `docs/board/rc-board-phase2.json`; and the
`doctrine` field of `docs/board/rc-board-phase3.json`, which summarised the list
as nine items and was stale from the day it was written, because R-050 had added
launch timing two days earlier.
**Supersedes:** none. R-050 stands in full; this makes its list reachable from
outside TRIAGE.

---

### R-058 - the deviz cards are resolved in favour of the owner addendum, all twelve differences, and P3-13 is split three ways along the addendum's own build order
**Date:** 2026-08-30
**Asked on:** P3-12, P3-13, P3-18
**Answer, verbatim:**
> Deviz spec reconciliation, ruling R-058. The previous EXECUTOR report records
> twelve differences between the owner addendum and the authored P3-13, two of
> them contradictions, sharpest being P3-18 acceptance asserting that a project
> in lucru is EXCLUDED when the addendum includes it. Read section 4 of
> docs/reports/2026-08-28-executor-crm-board-halt.md, resolve every difference in
> favour of the OWNER ADDENDUM, rewrite the affected cards and their acceptance
> lines, and record the resolution. Do not build against the authored version.

**Ruling:** every one of the twelve differences is resolved in favour of the
addendum. `P3-13` is now the schema alone, `P3-13b` is the line editor and
`P3-13c` is the comparison view, which are the addendum's own three build steps.
`P3-18` and `P3-12` are rewritten. The authored versions are not built.

**THE CITED FILE DOES NOT EXIST AND THE CONTENT DOES.** There is no
`docs/reports/2026-08-28-executor-crm-board-halt.md` at any commit on any branch.
The delta is section 4 of
`docs/reports/2026-08-28-executor-phase-3-crm-preflight.md`, which is on `main`
and carries all twelve differences plus a thirteenth. A wrong filename is not an
absent premise, and this ruling records the correction rather than the halt,
because the halt would have been on a typo.

**THE TWELVE, AND WHERE EACH LANDS.**

| # | the difference | resolved on |
|---|---|---|
| 1 | P3-18 excluded a project `active`; the addendum includes it | P3-18 |
| 2 | P3-18 summed deviz lines with no subtraction of what was already issued | P3-18 |
| 3 | the price was a default-and-override, not a snapshot | P3-13, P3-13b |
| 4 | no status pipeline, so a draft would have fed procurement | P3-13, P3-18 |
| 5 | no versioning | P3-13, P3-13b |
| 6 | the `devize` field list was absent | P3-13 |
| 7 | the `deviz_lines` field list was absent | P3-13 |
| 8 | the comparison was quantity-only | P3-13c |
| 9 | no over-issue flag | P3-13c |
| 10 | no foot totals | P3-13c |
| 11 | `Neprevazut` was described in English, not named in Romanian | P3-13c |
| 12 | P3-12 carried two numbers where three are needed | P3-12 |
| 13 | the stale `INVENTED, NOT REQUESTED` notes and the stale halt instruction | P3-13, P3-18 |

**THE TWO CONTRADICTIONS ARE BOTH ON P3-18 AND BOTH WOULD HAVE SHIPPED GREEN.**
Its acceptance line asserted that a project `in lucru` is EXCLUDED even with a
deviz. The addendum includes it. An executor working the authored card would have
written a Playwright assertion that asserts the opposite of the owner's spec,
watched it pass, and shipped it. That is the whole argument for resolving a spec
conflict before a wave starts rather than during it: a wrong acceptance line does
not fail, it certifies.

The second is quieter and costs more money. The authored card summed accepted
deviz quantities with no subtraction of what had already gone to site, which
over-orders by exactly the amount already delivered. The addendum's version is
procurement. The authored version is a shopping list written by somebody who has
not looked in the warehouse.

**THE ONE PLACE THE ADDENDUM'S LITERAL TEXT IS NOT COPIED, DECLARED HERE RATHER
THAN BURIED.** The addendum names the deviz pipeline `draft, emis, acceptat,
respins, expirat`, which is one English word and four Romanian ones. That is a
list of UI states, not of SQL tokens. P2-01 fixed the convention that stored enum
values are English tokens with Romanian labels in the presentation layer, and
`public.project_status` on P3-03 already follows it. **The set of five states,
their order, and the rule that only `accepted` feeds procurement are the
addendum's and are binding.** The stored tokens are `draft, sent, accepted,
rejected, expired` and the labels are the addendum's Romanian words: Ciorna,
Emis, Acceptat, Respins, Expirat. If that reading is wrong, it is wrong about
five strings in a migration and nothing about behaviour.

**THREE AMBIGUITIES THE ADDENDUM DID NOT COVER, DECIDED UNDER THE BOARD'S WIDE
DEFAULTS RULE AND LOGGED HERE SO THEY ARE NOT RE-DECIDED.**

- **`margin_percent` applies to the deviz total, not per line.** The addendum
  lists it in the `devize` field list and lists no per-line margin column, so a
  per-line markup would need a column it did not ask for. Foot rows are
  Subtotal, Adaos, Total.
- **`currency` is a column and a CHECK pins it to MDL for this phase.** The
  addendum names the field; P3-03 already ruled multi-currency out of scope and
  every wave 3 computation sums MDL. Storing a currency the arithmetic ignores
  would be a third silent-wrong-number path on a board that has just removed two.
  The constraint is what a later card relaxes, and `CLAUDE.md` 8.6 already
  permits `ALTER TABLE ... DROP CONSTRAINT` for exactly this.
- **`valid_until` is recorded and is not enforced by a job.** Nothing flips a
  status on a date. A deviz still `sent` past its date is displayed as expired
  with a Romanian warning; the enum value is set by a person. A scheduler is a
  separate card.

**TWO DEPENDENCY EDGES MOVED AND ONE IS NEW, WHICH IS A RESEQUENCING AND IS
DECLARED AS ONE.** `P3-13` drops its edge to `P3-09` and takes one to `P3-03`:
split out, the schema needs the projects table and nothing else, so it can be
authored and proven against the AUT-14 shim while the detail tabs are still
being built. `P3-13c` takes a new edge to `P3-04`, because a comparison built
before `outbound_issues.project_id` exists would be comparing against a free-text
project name. `P3-12` takes a new edge to `P3-13b`, because the accepted deviz
total cannot be computed before deviz lines exist.

**Unblocks:** P3-12, P3-13, P3-13b, P3-13c and P3-18, all of which were
unsafe to build. It blocks nothing.
**Also changes:** `docs/board/rc-board-phase3.json`, which gains two cards and
goes from 28 to 30.
**Supersedes:** the authored text of P3-13, P3-18 and P3-12 as they stood at
`63d548a`. Nothing in this file.

---

### R-059 - self-merge widens to every path for EXECUTOR, AUTHOR, POC-BUILDER and TRIAGE, and the only exclusion is executing against production
**Date:** 2026-08-30
**Asked on:** every card on both boards
**Answer, verbatim:**
> R-056, self-merge widened. Owner grant, Ivan, 2026-08-28, stated twice.
> R-049 is extended: EXECUTOR, AUTHOR, POC-BUILDER and TRIAGE merge their own
> PRs on any path when quality is green on the head sha. Application code and
> migration FILES are now included. The single exclusion: applying a migration
> or any destructive statement against the production database remains gated by
> CLAUDE.md 8.6 and R-047. Merging the file is not applying it. Amend
> CLAUDE.md 3.1. Revoked with every other terminal grant at P2-13.

**Ruling:** `CLAUDE.md` section 3.1 is rewritten. Four roles merge their own pull
requests on any path once `quality` is green on the head sha. The path sets are
gone. Applying against production is not covered and never was.

**THE ID IS R-059 AND THE DISPATCH CALLED IT R-056, AND BOTH NUMBERS RESOLVE TO
THIS.** R-056 was taken two days earlier by the ruling that added AUTHOR on the
EXECUTOR path set, and the rules at the top of this file forbid editing an old
ruling: a changed mind is a new dated ruling that supersedes the old one by id,
so the history of the decision stays readable. Overwriting R-056 with a wider
grant would have destroyed the record of the narrower one and made every citation
of "R-056" ambiguous by date. **A future dispatch citing R-056 for the widening
means this ruling.** Section 3.1 names all three ids in order so the trail works
from either end.

**MERGING THE FILE IS NOT APPLYING IT, AND THAT SENTENCE IS THE SUBSTANCE.** A
pull request that adds `supabase/migrations/0013_something.sql` changes one text
file in a git repository and changes nothing in any database. Under the old
wording it was un-mergeable until the owner was available to run something the
pull request never asked him to run. The apply keeps its own three phases in 8.5,
its own journal in 8.8, and its own stop in 8.6, all untouched, and it is gated
whether or not a check is green, because a green check says nothing about a
database.

**THE ACCEPTANCE HALF OF 5b IS NOT REMOVED, AND THIS IS THE ONE PLACE THE
DISPATCH IS READ NARROWLY.** R-049 removed both halves for documentation-shaped
paths, on the reasoning that a docs-only pull request has no acceptance to run.
The paths this widening adds are exactly the paths that do have one. Extending
the removal would mean application code shipping with nobody having run its named
test, which is not what a merge grant is for and is not what the dispatch asked
for: its own per-card line reads "machine-checkable acceptance, committed report,
self-merge on green". **What is removed is the wait for the owner. The proof
stays.**

**THIS PULL REQUEST MERGES UNDER THE GRANT IT CREATES, WHICH R-056 SPECIFICALLY
DECLINED TO DO, AND THE DIFFERENCE IS WHO ASKED.** R-056's own pull request went
to Ivan, on the reasoning that a grant authorising its own creation is a terminal
writing its own permissions. That reasoning was right and it does not apply here:
the widening is an owner instruction stated twice, the dispatch carrying it says
in terms to self-merge on green and to work continuously without returning to the
owner between cards, and stopping to ask him to merge the pull request that
implements his instruction not to stop and ask him would be a loop rather than a
safeguard. It is recorded because it is the kind of thing that should never pass
unremarked.

**TRIAGE ENTERS THE TABLE AND ITS DECISION AUTHORITY DOES NOT MOVE.** It could
always open a pull request; it may now merge one. What it may DECIDE is
`docs/DOCTRINE-TRIAGE.md` section 6, unchanged, and R-057 has just made that
section the sole authority on it.

**Unblocks:** every card that authors a migration file, on both boards, and the
whole phase 3 schema wave. The phase 3 board's `doctrine` field said in terms
that a schema card touches `supabase/` and therefore could never be self-merged;
that sentence is retired.
**Also changes:** `CLAUDE.md` section 3.1 in full and the 8.7 revocation
checklist item, which now names all three rulings; and the `doctrine` field of
`docs/board/rc-board-phase3.json`.
**Supersedes:** the path-set table in R-049 and R-056. The rest of both stands,
including R-049's green-on-the-head-sha definition and its `paths:` filter
clause, both of which are restated in the new section 3.1.

---

### R-060 - the migration shim check runs in the quality job, against the AUT-14 card default that said it must not
**Date:** 2026-08-30
**Asked on:** AUT-14
**Answer, verbatim:**
> AUT-14, commit the Docker shim. Authorised by R-051, never built. The nine-object
> Supabase shim that applied twelve migrations to stock postgres:16 during RST-01.
> Land it at scripts/poc-free/local-db/ with a check:migrations npm script, wired
> into quality. This is the tool wave 1 needs to prove a migration.

**Ruling:** `npm run check:migrations` is a step in `.github/workflows/quality.yml`.
The AUT-14 default that forbade it is amended in the same pull request, so the
committed record does not contradict the workflow.

**THE CONFLICT IS REAL AND IS NOT A READING ERROR.** The card's `defaults` said
`IT IS NOT ADDED TO THE QUALITY WORKFLOW`, in capitals, with a reason. The
dispatch says `wired into quality`. `CLAUDE.md` section 5 settles the precedence
in one line: **defaults fill silence, they do not contradict speech**, and an
owner instruction is speech. But precedence alone is a bad reason to overwrite a
written argument, so the argument gets answered.

**THE DEFAULT'S REASONING IS CORRECT ABOUT THE MIGRATIONS AND WEIGHS THE WRONG
THING.** It said CI already applies every migration through `supabase start` plus
`supabase db reset` against a real stack, so a second weaker application buys
nothing. True. **The step does not guard the migrations. It guards the shim.**

`shim.sql` lists the Supabase objects a bare postgres does not have. The day a
migration references an object the shim lacks, `supabase db reset` still passes,
because a real stack has every object. The local tool silently stops working, and
nobody finds out until the next session that needs it: offline, with no
credentials, in the middle of proving a destructive statement. That is the exact
situation the tool exists for and the worst possible moment to discover it
rotted. The same argument is already made in this repository, in this workflow,
in the comment explaining why the phase 3 board is validated by a job that no
terminal was working: **a board nobody works is exactly the board that rots.**

**THE COST WAS MEASURED, NOT ESTIMATED.** The full check runs in about two
seconds locally on a warm image. The runner pays a one-time image pull.

**Unblocks:** nothing. It keeps AUT-14's tool working after the session that
built it.
**Also changes:** `.github/workflows/quality.yml`, one step; `package.json`, one
script; and the AUT-14 `defaults` on `docs/board/rc-board-phase2.json`.
**Supersedes:** one paragraph of the AUT-14 card defaults, quoted in full at the
point where it is replaced.

---

### R-061 - phase 3 opens to interactive terminals now, and the harness stays on the phase 2 board
**Date:** 2026-08-30
**Asked on:** every card on the phase 3 board
**Answer, verbatim:**
> STEP 1 onward, build. Wave 1 schema, then wave 2 sections, then wave 3 value
> layer. Wave 4 density cards are independent; pick them when a wave is blocked.
> [...]
> Priority note: the platform currently has no client or project management at all,
> which is the owner's primary complaint. Wave 1 and wave 2 are the path to something
> visible on screen. Prefer them over wave 3 and wave 4 unless blocked.

**Ruling:** the phase 3 board is open. Its `doctrine` field said a terminal that
found itself picking a P3 card before phase 2 closed had made a mistake and
should stop; that sentence is retired. **The harness is not repointed and the
phase 2 board is still the queue for every unattended run.** The two boards are
now worked in parallel by different terminals rather than in sequence.

**THE SENTENCE THAT IS RETIRED RESERVED THIS DECISION FOR EXACTLY THIS.** It
read: phase 3 opens after the phase 2 gate reaches 9 of 9, by an owner ruling
that repoints the harness, and not before. The owner opened it by dispatch
instead, which is the owner ruling half. The harness half is deliberately not
done, so the sentence is amended rather than deleted, and what it protected is
kept: `scripts/poc/run.sh`, `inbox.mjs` and `notify.mjs` still read
`docs/board/rc-board-phase2.json` by path, and nothing in this ruling changes a
line of them.

**WHY WAITING FOR 9 OF 9 STOPPED BEING THE RIGHT ORDER, WHICH IS WORTH WRITING
DOWN BECAUSE THE ORIGINAL RULE WAS SOUND.** The phase 2 gate is at 6 of 9. Of the
three open conditions, G4 needs the extraction round trip and P2-08b is `blocked`
on Andre, a third party nobody here can schedule; G9 needs Mihai to complete a
full cycle on production, which is downstream of G4 and of P2-13 and P2-14.
**The gate cannot reach 9 of 9 on any timetable this repository controls.**
Sequencing phase 3 behind it therefore did not mean "later", it meant "when
somebody else gets round to it", and the thing waiting behind it is the owner's
primary complaint about the platform: it has no client or project management at
all. A rule that would have held the visible half of the product behind an
unschedulable third party is a rule that has stopped doing what it was for.

**WHAT DOES NOT CHANGE, LISTED BECAUSE AN OPENING IS THE MOMENT SOMETHING GETS
QUIETLY DROPPED.** The claim lease in `CLAUDE.md` section 13 still governs: a
card is claimed before it is worked and a claim is honoured for six hours, and a
harness working phase 2 and a terminal working phase 3 cannot see each other any
better than two terminals could. Eligibility, the lowest-id rule, the acceptance
rule, skip-not-halt, the halt-on-a-false-premise rule and the migration sections
all bind this board exactly as written. Section 8.6 is untouched: authoring and
merging a migration file is not applying one, per R-059, and applying one against
production is still the owner's.

**Unblocks:** the entire phase 3 board, 30 cards.
**Also changes:** the `doctrine` field of `docs/board/rc-board-phase3.json`.
**Supersedes:** the do-not-work-this-board clause of that field, quoted where it
is replaced. Nothing in this file.

### R-062 - a schema card ships on the file plus the container proof, and the production apply is one card for the wave
**Date:** 2026-08-30
**Asked on:** P3-01, and every schema card in wave 1
**Answer, verbatim:**
> Migrations: author, prove against the AUT-14 shim, commit the proof in the report,
> merge the file. The APPLY step against production is a separate blocked card per
> 8.6. P3-04 and P3-05 backfill without dropping the old column; the drop is its own
> card after backfill verification against real rows.
>
> STOP: nothing in this dispatch requires a database connection. If a step seems to,
> you have misread it.

**Ruling:** a wave 1 schema card's acceptance is met by the migration file plus
the AUT-14 container proof. The production apply is **P3-27**, one card for the
wave, `blocked_on: ivan`.

**THE ACCEPTANCE IS SPLIT, NOT WEAKENED, AND THAT DISTINCTION IS THE WHOLE
RULING.** P3-01 asked for a migration journal showing the table present, RLS
enabled, exactly three policies with no delete policy, and anon holding SELECT
on nothing. **Every one of those assertions except the words "on production" is
now checked on every push**, by
`scripts/poc-free/local-db/assertions/0013_clients.sql`, against a real
PostgreSQL that has applied every migration in the repository. What P3-27 adds
is that the same assertions hold on the real project. Nothing was dropped;
the two halves are now in two places and both are named.

**IT IS ALSO STRICTLY MORE PROOF THAN THE CARD ASKED FOR, WHICH IS WORTH SAYING
BECAUSE SPLITTING AN ACCEPTANCE USUALLY MEANS LESS.** Migrations 0001 to 0012
were merged and applied without any parser or server having read them: P2-15
shipped SQL with its own card admitting "there is no PostgreSQL binary and no
running Docker on this machine". 0013 is the first migration in this repository
that was executed by a PostgreSQL before it was merged. On top of that, **every
assertion was proved to FAIL on a mutated copy of the migration**, which no
apply journal has ever established about any earlier file.

**THE ASSERTIONS ARE A DIRECTORY, NOT A ONE-OFF.** `apply.mjs` runs every
`.sql` in `scripts/poc-free/local-db/assertions/` after the migrations, in
filename order, and each RAISES rather than printing. That makes them a
regression suite as well as an acceptance: a LATER migration that quietly drops
a policy, grants anon a privilege or removes an updated_at trigger fails on the
pull request that does it. A file that printed a grid for a human to read would
be the exact shape `CLAUDE.md` 8.6 was written to stop.

**THE BLOCK ON P3-27 COMES FROM THE DISPATCH AND NOT FROM THE RULES, AND THE
CARD SAYS SO IN ITS QUESTION.** `CLAUDE.md` section 8 has NOT been revoked:
R-001 still grants EXECUTOR a temporary apply while the project holds zero real
client data, P2-13 has not run, and section 8.7 has not fired. A future reader
finding P3-27 blocked must not conclude the grant lapsed. What blocks it is one
sentence of an owner dispatch: "nothing in this dispatch requires a database
connection."

**ONE CARD FOR THE WAVE, NOT ONE PER MIGRATION.** The dispatch says "a separate
blocked card", singular, and does not say which. Five near-identical blocked
cards would be five lines on the owner board saying the same sentence, and they
would be answered in one sitting anyway, because that is how somebody applies
migrations. P3-27 carries the pending file list in its `question`, where he
reads it, and it deliberately has **no `depends_on` edges**: an edge per schema
card would make it ineligible until the whole wave landed, and the owner may
reasonably want to apply what exists rather than wait.

**THE DROP-AFTER-BACKFILL HALF OF THE DISPATCH NEEDED NOTHING.** It is already
board structure: P3-04b and P3-05b are separate cards, each carrying the drop in
its own migration, each `depends_on` its backfill card and P3-10. That was
authored before this dispatch and is recorded here so nobody implements it twice.

**Unblocks:** P3-01, and every wave 1 schema card behind it. Without this they
were all blocked on an apply the same dispatch forbids.
**Also changes:** `docs/board/rc-board-phase3.json`, which gains P3-27 and goes
from 30 to 31 cards; `scripts/poc-free/local-db/apply.mjs`, which gains the
assertions pass.
**Supersedes:** the production half of P3-01's acceptance line, moved to P3-27
verbatim rather than deleted. Nothing in this file.
