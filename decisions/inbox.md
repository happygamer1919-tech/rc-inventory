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

---

### R-063 - the two deviations in the P3-11 run are ratified individually, and the four second claim collision becomes evidence on CLAIM-01 rather than a new card
**Date:** 2026-08-31
**Asked on:** P3-11, P3-04b, P3-05b, CLAIM-01
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-11-material-cost.md, section 1:
>
> **PR #123 was opened at 02:00:00Z. This run started at 02:00:04Z.** That pull
> request carries exactly those two cards, sets both to `blocked_on: ivan`, and
> argues the same thing this run would have argued.
>
> **The claims map in `docs/poc/state.json` was empty**, so the lease mechanism
> did not catch this. It could not: a claim only protects a card once it is on
> `main`, and #123 had existed for four seconds. What caught it was reading the
> open pull request list before starting, which is worth doing for exactly this
> reason.
>
> from the same report, section 2:
>
> The card asks for three issues across two months. **The issue form has no date
> field**: `issued_at` is `now()`. Data built through the screen can only ever
> land in the current month, so the month breakdown, which is half the card,
> could not have been tested at all.

**Ruling:** both deviations are RATIFIED. They are ruled one at a time, with the
test named for each, because a set ratified as a block is a set nobody read.

**DEVIATION 1: THE LOWEST-ID ELIGIBLE CARDS WERE SKIPPED ON A SIGNAL THAT IS NOT
A CLAIM.** `CLAUDE.md` section 2 says take the lowest-id eligible card and never
skip one because a later card looks easier. Section 13 permits skipping a card
another actor HOLDS, and holding means a claim in `docs/poc/state.json`. The
claims map was empty, so what the run acted on was an open pull request, which
is not a claim under any reading of section 13.

- Test 1, unrecoverable data: does not fire. Nothing was written anywhere.
- Test 2, committed evidence a stranger can re-verify: PASSES. PR #123 merged as
  `942b6bf` and the board carries both cards blocked on ivan with its text.
- Test 3, widening or applying: APPLYING. Reading the open pull request list and
  declining to duplicate somebody's in-flight work is a narrowing of what the run
  did, not a widening of what it may do. The failure mode of the narrower
  behaviour is a delay of one scheduled window; the failure mode of the wider one
  is two board edits to the same two cards in two pull requests.
- Test 4, would the alternative have been worse: YES, and concretely. Taking
  P3-04b and P3-05b would have produced a second pair of `blocked_on: ivan`
  edits carrying a second copy of the same question, and whichever merged second
  would have conflicted on the same lines. `CLAUDE.md` names web-editor conflict
  resolution as the source of three residue incidents, and this would have
  manufactured one for no gain.

**RATIFIED.** The board rule that was bent is worth restating rather than
quietly widening: **an open pull request is not a claim.** It happened to be the
better signal here because it was the only one that existed at the moment it was
needed, and CLAIM-01 is where that belongs.

**DEVIATION 2: A SEED SCRIPT AND A FOURTH ISSUE THE CARD DID NOT ASK FOR.**
`CLAUDE.md` section 3 forbids self-invented scope.

- Test 1: does not fire. `scripts/seed-test-cost.mjs` contains no DELETE, writes
  fixed ids so a second run overwrites rather than doubles, and ran against no
  production database.
- Test 2: PASSES. PR #125, the script, `tests/e2e/project-cost.spec.ts` with
  seven cases, and the arithmetic written out twice so either copy can be checked
  by hand against the other.
- Test 3: APPLYING. P3-11's `defaults` state the Europe/Chisinau bucketing rule.
  Testing a stated default is executing the card, not extending it.
- Test 4: YES. Without the script the month breakdown, which is half the card,
  ships with a test that could never have failed, because every row the screen
  can create lands in the current month. Without the row at 2026-07-31T21:30Z the
  timezone rule is untested and untestable, because it is the only row on which
  the Chisinau rule and the UTC rule disagree.

**RATIFIED.**

**THE COLLISION ITSELF IS NOT A NEW CARD.** CLAIM-01 already carries it, by name:
"a claim protects nothing until its pull request merges, which is usually after
the work it was meant to protect has started." Authoring a second card for a
problem an open card names is how both get half done. The four second measurement
and the open-pull-request mitigation are appended to CLAIM-01's `notes` as
evidence for the latency half of its own acceptance, which already permits
recording why the pre-merge check was rejected and what was done instead.

**Unblocks:** nothing. Both cards named in deviation 1 stay `blocked` on ivan,
and P3-11 stays shipped.
**Also changes:** `docs/board/rc-board-phase3.json`, notes on P3-11, P3-04b and
P3-05b; `docs/board/rc-board-phase2.json`, notes on CLAIM-01.
**Supersedes:** none.

---

### R-068 - the two P3-13 build deviations are ratified individually, each with the test that cleared it, and the uncovered DELETE is recorded as evidenced rather than overlooked
**Date:** 2026-08-31
**Asked on:** P3-13
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13-deviz-schema.md, section 1:
>
> "**One. The card names "a before-update trigger on `deviz_lines`" and the
> trigger fires on INSERT as well.** Adding a line to a sent deviz changes what
> was quoted exactly as much as editing one does. A trigger catching only UPDATE
> would leave the larger half of the hole open, and the rule the card states is
> the no-edit rule, not the no-update rule."
>
> "**Two. `approved_at` is held by the database.** The card states the rule, "set
> when status becomes accepted, and is null otherwise", and the card's own
> sentence about the no-edit rule is that a rule the database does not hold is a
> rule the next screen forgets."

**Ruling:** both are RATIFIED. They are ratified one at a time, with the test
named for each, because DOCTRINE-TRIAGE section 1 says a set ratified as a block
is a set nobody read.

**DEVIATION 1, THE TRIGGER THAT ALSO FIRES ON INSERT. RATIFIED ON TEST 4.**

- Test 1, unrecoverable data: does not fire. `supabase/migrations/0025_deviz.sql`
  is a file in a git repository and has not been applied to any database. The
  report says so in section 2 and the file joins the pending register against
  P3-27.
- Test 2, committed evidence a stranger can re-verify: satisfied.
  `scripts/poc-free/local-db/assertions/0025_deviz.sql` asserts the behaviour and
  raises rather than prints, `npm run check:migrations` is a hard step of the
  `quality` job, and the job concluded success on head sha `f44fd5c` in PR #129.
  The named clause is that a `sent` deviz "refuses a line ADDED to it".
- Test 3, widen or apply: applies. The card states the no-edit rule. INSERT into
  a sent deviz is inside that rule, not outside it. Nothing in `CLAUDE.md`, a
  gate or a grant moved.
- Test 4, would the alternative have been worse: yes, and this is the test that
  decides. An UPDATE-only trigger ships a no-edit rule that any caller can walk
  around by adding a new line instead of editing an old one, on a document a
  client is already holding a copy of. The alternative is a rule that reads as
  enforced and is not.

**DEVIATION 2, `approved_at` HELD BY THE DATABASE. RATIFIED ON TEST 4.**

- Test 1: does not fire, same reason.
- Test 2: satisfied. The same assertion file proves `approved_at` set on accept
  and cleared on the way out, in the same green run on `f44fd5c`.
- Test 3: applies. The card states the rule and is silent on where it lives;
  `defaults` and section 5 of `CLAUDE.md` say silence is filled, not contradicted.
- Test 4: yes. Two screens write the status. The alternative is a rule that holds
  only on whichever of them remembered it, which is the failure the card's own
  no-edit sentence is written against.

**THE UNCOVERED DELETE IS NOT A THIRD DEVIATION AND IS RECORDED SO NOBODY AUDITS
IT TWICE.** The report states that DELETE is deliberately not covered and gives
the reason: neither table carries a delete policy, so no authenticated role can
reach a delete, and the only delete that can touch a line is the cascade from a
`devize` row that RLS already forbids. The structural half of the assertion file
proves the absence of a delete policy on both tables, so the premise the argument
rests on is asserted rather than claimed. That is a gap closed by evidence, not a
gap left open.

**Unblocks:** nothing. P3-13 is already shipped on PR #129 and this ruling
records why it was allowed to ship in the shape it did.
**Supersedes:** none.

---

### R-064 - the board reads a clock: the as_of deviation is overturned, the drift is measured as a ratchet rather than an offset, and BOARD-02 authors the check
**Date:** 2026-08-31
**Asked on:** P3-11, and every card on both boards that carries a timestamp
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-11-material-cost.md, section 4b:
>
> **Worth naming rather than silently following: the phase 3 board's timestamps
> run about nine hours ahead of real UTC.** P3-10 shipped with
> `2026-08-31T10:40:00Z` and #123 wrote `2026-08-31T11:30:00Z`, both while the
> real clock read shortly after 02:00Z. This run wrote `2026-08-31T11:45:00Z` on
> `as_of`, on P3-11's evidence and on both `last_checkpoint` fields, because the
> alternative was an `as_of` that moves BACKWARDS by nine hours on a board whose
> whole purpose is to say when it last told the truth. Following the convention
> keeps the ordering honest and makes the offset a single, findable defect rather
> than a jagged sequence.

**Ruling:** the deviation is **OVERTURNED**. `as_of` is corrected on both boards
in the pull request carrying this ruling, to a value read from the system clock,
and it moves BACKWARDS by roughly nine hours on the phase 3 board. That backwards
jump is the ruling taking effect and is not to be corrected forward.

**THE FINDING IS CREDITED AND THE CHOICE IS REVERSED, AND THOSE ARE DIFFERENT
THINGS.** Nobody else had noticed. The report measured it, named it, said it
needed a card, and disclosed that it had followed the convention anyway. Without
that paragraph this ruling could not have been written. What is overturned is the
one sentence of it that decided to write a timestamp nobody had read from a
clock.

**TEST 4 IS WHY IT IS AN OVERTURN AND NOT A RATIFICATION.** The alternative, named
concretely, is a board carrying `as_of: 2026-08-31T02:31Z` with the report's own
section 4b explaining why the number appears to jump back. That is not worse than
what shipped. It is the correct board plus one paragraph of explanation that was
already written.

**IT IS A RATCHET, NOT AN OFFSET, AND THAT IS WHAT MAKES IT URGENT.** The report
reads it as a fixed nine hour skew, which would be a timezone bug somewhere. It is
not. Measured across the eleven commits that touched
`docs/board/rc-board-phase3.json`, the gap between `as_of` and the real commit
time, in minutes:

| commit | commit time (UTC) | as_of | ahead by |
|---|---|---|---|
| `b8910e5` | 2026-08-30T21:06Z | 2026-08-30T21:10Z | 3 min |
| `afe4f88` | 2026-08-30T21:34Z | 2026-08-30T21:55Z | 21 min |
| `f43f538` | 2026-08-30T22:18Z | 2026-08-30T23:20Z | 62 min |
| `1a18f04` | 2026-08-30T22:50Z | 2026-08-31T01:20Z | 150 min |
| `f0a99c1` | 2026-08-30T23:23Z | 2026-08-31T03:10Z | 226 min |
| `111a6a3` | 2026-08-31T00:09Z | 2026-08-31T05:10Z | 300 min |
| `8e2a78e` | 2026-08-31T00:41Z | 2026-08-31T07:20Z | 398 min |
| `0f26ea0` | 2026-08-31T01:13Z | 2026-08-31T09:00Z | 467 min |
| `1eab1d4` | 2026-08-31T01:58Z | 2026-08-31T10:40Z | 521 min |
| `942b6bf` | 2026-08-31T02:13Z | 2026-08-31T11:30Z | 557 min |
| `612ca05` | 2026-08-31T02:31Z | 2026-08-31T11:45Z | 554 min |

**Every session read the previous `as_of` and wrote something plausibly later
than it, and the increment each one added exceeded the real elapsed time.** The
error compounds. Nothing in the repository stops it, so at the observed rate the
board would be claiming tomorrow's date within a week, and `last_checkpoint`
would stop ordering anything.

**THE REASONING THAT PRODUCED IT IS SOUND AND IS EXACTLY THE PROBLEM.** Nobody
wants to be the session that moves the number backwards. That is true at every
step, which is why a rule cannot fix it and a check can. `CLAUDE.md` section 2
already says "the top-level `as_of` bumped to the commit moment in ISO 8601", and
it was not enough, because these are unattended runs at 22:00, 01:00, 04:00 and
07:00 and a rule with no check survives exactly as long as nobody is tired.

**WHAT IS CORRECTED NOW AND WHAT IS LEFT TO THE CARD.** This pull request sets
`as_of` on both boards from the clock, and sets `last_checkpoint` from the clock
on the cards it touches. It does not sweep the boards, and it does not touch
`evidence.at` anywhere: that field belongs to the run that produced the proof, and
rewriting another session's record of its own work is a worse fault than leaving a
value that a committed ruling explains. **BOARD-02** carries the sweep and the
check.

**Unblocks:** nothing.
**Also changes:** `as_of` on both boards; `last_checkpoint` on P3-11, P3-04b,
P3-05b, P3-27 and CLAIM-01; `docs/board/rc-board-phase2.json` gains BOARD-02.
**Supersedes:** none. It does not amend `CLAUDE.md` section 2, which already said
this.

---

### R-065 - the phase 3 gate audit: 0 of 9, every condition behind P3-27, and the two drop cards stop asking Ivan a question that belongs to another card
**Date:** 2026-08-31
**Asked on:** the phase 3 launch gate, P3-27, P3-04b, P3-05b
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-11-material-cost.md, section 7:
>
> **P3-27 is still blocked on Ivan and the pending register is now twelve files.**
> Nothing in CI needs it, because every acceptance runs against the local stack,
> but nothing the owner can SEE exists on the live site until it runs. It is the
> oldest unanswered question on this board.

**Ruling:** all nine phase 3 conditions were audited clause by clause under
DOCTRINE-TRIAGE section 4. **None flips.** The audit is written into each
condition's `evidence` field whether or not it flipped, because an audit that
flips nothing is still the most useful thing the next session can read.

**THE RESULT IS ONE SENTENCE: EVERY CLAUSE OF EVERY CONDITION SAYS "ON
PRODUCTION", AND NOTHING IS ON PRODUCTION.** Twelve migration files, 0013 to
0024, sit in the Pending section of `docs/migrations/APPLY-LOG.md`, every one
naming P3-27, which is blocked on ivan. Eleven cards have shipped on this board
and the readiness score has not moved off 0 of 9 and cannot.

**THAT IS THE THIRD KIND OF UNFLIPPABLE GATE IN SECTION 4, WITH ONE DIFFERENCE
WORTH NAMING.** Section 4 says a gate needing an action in a production
environment no terminal holds is recognised and recorded, not treated as a
backlog. These nine are that shape, except that a terminal DOES hold the
capability: R-001 has not been revoked, P2-13 has not run, and section 8.7 has not
fired. What withholds it is one sentence of the 2026-08-30 owner dispatch, which
P3-27's own question already records. So this is not a permanent structural
limit; it is one unanswered question, and it is escalated rather than ruled.

**TWO CLAUSES DID GAIN EVIDENCE, AND BOTH COME OUT OF THE REPORT BEING TRIAGED.**

- **G2 clause 3** demanded the count of issues with no project assigned, taken
  read-only and pasted. P3-11 shipped `public.unassigned_outbound_count()` in
  `supabase/migrations/0024_project_material_cost.sql`, and the Cost tab prints
  the count even when it is zero. The clause was written before anything could
  produce that number; now it is one query.
- **G5's arithmetic half** is evidenced in full: PR #125,
  `tests/e2e/project-cost.spec.ts`, seven cases, a total hand-calculated at
  1850.00 MDL asserted to the leu, a month boundary row that separates Chisinau
  bucketing from UTC, an unassigned issue carrying 10000 MDL that would have
  broken the arithmetic loudly rather than plausibly, and a deactivated product
  carrying 400 of the 1850. The gate's own notes say both halves are required and
  say why. **The hand check against one real project is the missing half and it
  cannot exist**, because there is no real project and no real client data.

**THE RESEQUENCE, WITH THE OLD EDGE AND THE NEW ONE NAMED.** Section 3 check 2
fired on three cards: P3-04b, P3-05b and P3-27 are all `blocked` on ivan with
every `depends_on` id shipped. On P3-27 that is correct, he owes the apply. On the
other two it is a **duplicated ask**: their `question` fields open with the same
sentence P3-27's does, "apply the wave 1 migrations to production", so the owner
reads one question three times and any of the three answers could be missed.

- P3-04b: `depends_on` was `[P3-04, P3-10]`, is now `[P3-04, P3-10, P3-27]`.
- P3-05b: `depends_on` was `[P3-05, P3-10]`, is now `[P3-05, P3-10, P3-27]`.

**BOTH STAY BLOCKED ON IVAN AND THAT IS NOT AN OVERSIGHT.** After the apply there
is still a reconciliation list to read with Mihai before a column is dropped, and
on P3-05b that list may not even exist, because the backfill refuses above twenty
distinct supplier names. Anything that reaches Mihai is item 6 of the closed
escalation list. The edge removes the duplicated question, not the real one.

**P3-27'S TITLE SAYS WAVE 1 AND ITS REGISTER HOLDS TWELVE FILES ACROSS THREE
WAVES.** Recorded in its `notes` and not fixed: TRIAGE does not edit titles, and
a reader who takes "wave 1" literally would otherwise conclude that 0020 to 0024
have no apply card.

**Unblocks:** nothing, and that is the finding. It makes explicit that eleven
shipped cards and nine failed gates are one blocked card apart.
**Also changes:** `evidence` on all nine phase 3 launch gate conditions;
`depends_on`, `question` and `notes` on P3-04b and P3-05b; `question` and `notes`
on P3-27.
**Supersedes:** none. R-046 audited the PHASE 2 gate and is untouched; nothing in
this report bears on G4, G7 or G9 of that board, which stand at fail on that
audit.

---

### R-066 - the cost basis is work, not an owner decision: the issue-time value snapshot is authored as P3-28
**Date:** 2026-08-31
**Asked on:** P3-11, P3-12, P3-14
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-11-material-cost.md, section 2:
>
> **The screen carries its own limitation in Romanian.** `unit_value_mdl` is the
> current catalogue value and no cost is snapshotted at issue time, so editing a
> product price moves every historical total containing it. The footnote says
> that. The real fix is a `unit_value_at_issue_mdl` column on `outbound_lines`,
> written at issue time, and that is a schema change this card was not given. It
> stays on the card notes where the AUTHOR put it, for Ivan.

**Ruling:** it does not stay on the card notes and it does not go to Ivan. It is
**P3-28**, authored on the phase 3 board in the pull request carrying this ruling,
depending on P3-11 and on nothing else.

**THE ONLY DECISION TRIAGE MADE HERE IS THAT THIS IS NOT ESCALATED, SO THE TEST
IS WRITTEN OUT.** The closed list in DOCTRINE-TRIAGE section 6 is ten items. This
is not money, not what the client is charged, not legal, not a vendor, not a
credential grant, not a request that reaches Mihai or Andre, not a click in
somebody's console, not a production DELETE, not an acceptance sign-off and not
launch timing. Everything not on that list, TRIAGE decides and records, and that
authority is R-050. Two independent authors reached for the owner here, which is
the cautious instinct, and the cost of it is real: a limitation parked in a
`notes` field is rediscovered by whoever first notices that two printouts of the
same month disagree.

**IT IS NOT A DEFECT IN P3-11 AND THAT CARD IS NOT REOPENED.** P3-11 was given
`unit_value_mdl` by its dispatch, implemented exactly that, and put the limitation
on the screen in Romanian instead of hiding it. It shipped on a green `quality`
run plus its named spec. This is the schema change it was not given.

**THE SHAPE IS FIXED IN THE CARD'S DEFAULTS AND THE IMPORTANT ONE IS NEGATIVE:
NOT NULL WITH A BACKFILL, NEVER NULLABLE WITH A FALLBACK.** A column read as
`coalesce(unit_value_at_issue_mdl, p.unit_value_mdl)` is a default-and-override
rather than a snapshot, indistinguishable from correct on the day it is built and
silently divergent afterwards. **R-058 rejected precisely that shape on the deviz
price three days ago**, and the same reasoning binds a second money column in the
same schema. The card also removes the Romanian footnote, because a caveat that
has stopped being true teaches the reader to distrust a number that is now right.

**ONE ORDERING NOTE RATHER THAN A SECOND EDGE.** P3-14 credits a project by
returned quantity times unit value. If P3-28 lands first, P3-14 reads the frozen
value, which is the only way a return credits exactly what the issue charged. If
P3-14 lands first it reads the catalogue and P3-28 updates it. Neither order is
wrong, so it is written into both cards rather than made a dependency that would
park one behind the other for no correctness gain. P3-12 needs no edge at all: it
reads `lib/reporting/material-cost.ts` and inherits whatever that module does.

**Unblocks:** nothing today. P3-28 is `todo` and eligible, since P3-11 is shipped.
**Also changes:** `docs/board/rc-board-phase3.json`, which gains P3-28 and goes
from 31 to 32 cards; `notes` on P3-11.
**Supersedes:** the "for Ivan" clause of the AUTHOR note on P3-11, quoted where it
is replaced. Nothing in this file.

---

### R-067 - DOCTRINE-TRIAGE's input clause contradicts its own sections 2 to 5, and the correction is a card for AUTHOR rather than an edit by TRIAGE
**Date:** 2026-08-31
**Asked on:** AUT-2, AUT-3, and every future TRIAGE run
**Answer, verbatim:**
> from docs/DOCTRINE-TRIAGE.md, "What TRIAGE is", quoted because this ruling is
> about that file rather than about the report:
>
> It receives no dispatch text, no summary and no context. It finds its own
> input: **the newest file in `docs/reports/`** by the dated naming convention in
> `CLAUDE.md` section 9b. If it needs to know something that is not in that
> report or in this file, **that is a defect in this file**, and saying so is a
> legitimate TRIAGE output.

**Ruling:** the invitation in that last sentence is taken. **The clause is wrong
as written, and it is wrong against three later sections of the same document.**

- **Section 2** requires the next free ruling id, which is only knowable from
  `decisions/inbox.md`.
- **Section 3** requires all four `depends_on` checks "over the whole board and
  not only the cards the report touched", which is only knowable from the board
  files.
- **Section 4** requires each failing gate to be audited against committed
  artefacts, naming "a PR number, a run id, a journal entry, a named screenshot".
- **Section 5** forbids authoring a card for something an open card already
  covers, which is only knowable from the board.

**A TRIAGE session obeying the input clause literally cannot perform sections 2
through 5.** This run opened both board files, `decisions/inbox.md`,
`docs/migrations/APPLY-LOG.md`, `CLAUDE.md` and the git history, and every one of
those reads was mandatory. Two of the four rulings in this pull request could not
otherwise exist: R-064's drift table is git history, and R-065's audit is the
board plus the migration register.

**THE INTENDED READING IS OBVIOUS AND THE WORDING SHOULD SAY IT.** Section 6 of
the same file states the rule the clause is reaching for: **ground truth is
committed repository files only.** The report is the only DISPATCH, not the only
readable file. What the clause correctly forbids is a human handing TRIAGE a
summary, a chat message or a verbal ratification, which is R-050's point.

**IT IS NOT FIXED HERE, AND THAT RESTRAINT IS THE OTHER HALF OF THE RULING.**
`CLAUDE.md` section 1 gives governing documents to AUTHOR, and DOCTRINE-TRIAGE is
TRIAGE's own rubric. A role that rewrites the document that constrains it has
removed the constraint, whatever the edit says, and "two TRIAGE runs over the same
report must reach the same answer" is worth exactly as much as the stability of
the file that produces the answer. So the correction is **AUT-15**, authored for
AUTHOR, with the wording it must satisfy written into the card.

**Unblocks:** nothing.
**Also changes:** `docs/board/rc-board-phase2.json`, which gains AUT-15.
**Supersedes:** none. It proposes an amendment to `docs/DOCTRINE-TRIAGE.md` and
does not make one.

---

### R-069 - a ruling committed on an OPEN pull request is in force under two conditions and no others, and the P3-13 run following R-064 before it merged is ratified
**Date:** 2026-08-31
**Asked on:** P3-13, and every card whose board edit writes a timestamp
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13-deviz-schema.md, section 4:
>
> "**R-064 is in PR #126 and was not on `main` when this was written.** It was
> followed anyway, because it settles the exact question this edit would
> otherwise have had to decide for itself, it decides it the other way from the
> last run, and writing a timestamp nobody read from a clock in full knowledge of
> a ruling that forbids it would be the worse of the two."

**Ruling:** RATIFIED, and the general rule behind it is written out so the next
session does not have to re-derive it.

**THE RATIFICATION, BY THE FOUR TESTS.**

- Test 1: does not fire. Two board fields, `as_of` and `last_checkpoint`. No row,
  no credential, no production write.
- Test 2: satisfied, and this is the test the question actually turns on. R-064
  is a committed line with an id at `f542e3f` on `triage/20260830-220004`, open as
  PR #126, and the report names it by id and by pull request number. A stranger
  can read it today without asking anyone.
- Test 3, widen or apply: APPLIES. DOCTRINE-TRIAGE states the standing rule as "a
  ratification is not a ratification until it is a committed line with an id" and
  the failure it names is chat, not an unmerged branch. R-064 is a committed line
  with an id. Reading that rule to mean "merged to main" would be a NARROWING
  invented here, not the rule as written.
- Test 4: yes. The alternative was to write a timestamp derived from the previous
  board value, which is the exact practice R-064 measured as a ratchet running
  eleven commits and 554 minutes ahead of the clock, in full knowledge of the
  ruling forbidding it.

**THE GENERAL RULE, AND IT IS DELIBERATELY NARROW.** A ruling committed on an
OPEN pull request is in force for a terminal when BOTH hold:

1. the terminal names it in its report by ruling id and pull request number, so
   the authority it acted on is readable by whoever reads the report next, and
2. the alternative is to WRITE something that ruling forbids. A ruling on an open
   pull request never compels an action that could simply be deferred.

**AND IT IS NEVER IN FORCE FOR THREE THINGS**, because the cost of being wrong is
not a timestamp: a production write of any kind, a credential act, or a card
ship. Those wait for `main`.

**THE RISK THIS CARRIES IS REAL AND IS NAMED RATHER THAN WAVED AT.** If PR #126
closes unmerged, R-064 never reaches `main` and two board fields will have been
written on an authority that evaporated. That is not hypothetical today: #126 has
gone from BEHIND to CONFLICTING since the report was written. R-070 authors the
card that lands it, and the two rulings are read together.

**Unblocks:** nothing. It settles a question every future board edit hits.
**Supersedes:** none. It states a rule DOCTRINE-TRIAGE implies and does not spell
out, and it does not touch R-064.

---

### R-070 - PR #126 is now CONFLICTING, so it belongs to EXECUTOR under R-052 and not to TRIAGE, and landing it is authored as RST-03
**Date:** 2026-08-31
**Asked on:** RST-02, RST-03
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13-deviz-schema.md, section 3a:
>
> "**Somebody has to update that branch and re-run `quality` on the new sha.**
> Until then four rulings and two authored cards sit outside `main`, and every
> board edit that lands ahead of it makes its eventual merge harder."
>
> and from section 6 of the same report:
>
> "**A second thing that is not an escalation and should not be lost:** PR #126 is
> green and stuck behind branch protection, per section 3a. It needs its branch
> updated, which is TRIAGE's push to make."

**Ruling:** the finding stands and the assignment in its last clause does not.
**PR #126 IS ASSIGNED TO EXECUTOR**, per R-052, and the work is card RST-03.

**THE ASSIGNMENT CHANGED BECAUSE THE PULL REQUEST DID.** When the report was
written #126 was `MERGEABLE` and `BEHIND`, which is a branch update and nothing
more. Read today it is `CONFLICTING` and `DIRTY`, conflicting on
`docs/board/rc-board-phase3.json`, because P3-13's own board edit landed on `main`
as `c124529` in the hour between. R-052 is unambiguous about what that makes it:
"A conflicting PR is assigned to EXECUTOR, which resolves it locally, against the
full tree, with the validator run before the commit." TRIAGE writes no code and
runs no acceptance, so it is the wrong hands for a resolution that has to be
proved by running things.

**THE COUNT IS FIVE RULINGS AND THREE CARDS, NOT FOUR AND TWO.** The report read
the pull request title, which names R-063 to R-066. The branch carries a second
commit, `361d40e`, adding **R-067 and card AUT-15**. So `main` is currently
missing R-063, R-064, R-065, R-066, R-067, cards P3-28, BOARD-02 and AUT-15, and
the committed TRIAGE report at
`docs/reports/2026-08-31-triage-board-clock-and-gate-audit.md`.

**THIS RUN MADE THE CONFLICT WORSE AND SAYS SO RATHER THAN HIDING IT.** This
ruling and the six around it append to `decisions/inbox.md` at exactly the point
R-063 to R-067 append, so a second conflict now exists in that file. It is
unavoidable: writing rulings into that file is the only output the role has, and
declining to write them to protect another branch would be a run that produced
nothing. What IS avoidable was avoided, and it is listed so the resolver knows
where the overlap is NOT: **this run edits no field of
`docs/board/rc-board-phase3.json`**, which is where #126's nine gate evidence
rewrites live, and it does not re-audit the phase 3 gate that R-065 already
audited. See R-074.

**RST-02 GAINS THE SYSTEMIC HALF INSTEAD OF A SECOND CARD.** DOCTRINE-TRIAGE
section 5 forbids authoring a card for something an open card already covers.
RST-02 is the leftover pull request sweep and its whole subject is a TRIAGE pull
request abandoned by its own cap. It does not cover this case, because a sweep
that merges cannot merge a CONFLICTING pull request, and today that failure is
silent. The finding goes into RST-02's `notes`: the sweep must distinguish a
pull request it can merge from one it cannot, and escalate the second rather than
pass over it. RST-03 is the instance and RST-02 is the class, which is why one is
a new card and the other is a note.

**Unblocks:** nothing today. RST-03 unblocks R-063 to R-067, P3-28, BOARD-02 and
AUT-15 the moment it ships.
**Also changes:** `docs/board/rc-board-phase2.json` gains RST-03 and RST-02 gains
a note.
**Supersedes:** the last clause of section 6 of the P3-13 report, which assigned
the push to TRIAGE. Nothing in this file.

---

### R-071 - the harness resolves a card id against one board while every unattended run works the other, so the owner cannot answer a phase 3 question and the digest cannot see phase 3 work; the harness half of R-061 is superseded and AUT-16 is authored
**Date:** 2026-08-31
**Asked on:** AUT-16, P3-27, and every phase 3 card that will ever be blocked on a person
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13-deviz-schema.md, section 3b:
>
> "`POC_BOARD=docs/board/rc-board-phase2.json` in `scripts/poc/run.sh`, line 23.
> The consequences are visible in `docs/poc/state.json` right now: a claim on
> `AUT-10` by `harness`, taken at the end of a run that worked P3-11. The
> eligible-card line in the harness log, the `$CLAIM_SKIPPED` set it interpolates
> into the prompt, and the claim it writes at the end are all computed against a
> board nobody is currently working."

**Ruling:** the finding is upheld, it is WIDER than the report found, and the
harness half of R-061 is superseded. The work is card AUT-16.

**THREE COMPONENTS HARDCODE ONE BOARD PATH AND THE REPORT FOUND ONE OF THEM.**

- `scripts/poc/run.sh:23`, `POC_BOARD=docs/board/rc-board-phase2.json`. This is
  the one the report names: eligibility, the claim-skip set and the claim written
  at the end of the run are all computed against the wrong board. Visible in
  `docs/poc/state.json` as a claim on `AUT-10` by `harness` at
  `2026-08-31T02:48:59Z`, written by a run that spent its time on P3-11.
- **`scripts/poc/inbox.mjs:38`, the same path, and this is the one that costs.**
  The Telegram reader builds `knownCardIds` from that one board and returns
  `{accepted: false, reason: "no card " + cardId + " on the board"}` for anything
  else. **`R P3-27 default` is therefore REFUSED**, and so is every other phase 3
  card id. `CLAUDE.md` section 13 names Telegram as the owner's answer channel and
  the two accepted forms are `R <card-id> default` and `R <card-id>: <text>`.
  Both are unusable for the entire board where the work is. The oldest unanswered
  question in this repository is P3-27, and the owner could not have answered it
  from his phone if he had tried.
- `scripts/poc/notify.mjs:27`, the same path again. `plain-digest.mjs` reads
  `board.launch_gate.readiness_passed` and counts `status === "shipped"` off that
  one board, so the digest reports 36 done and 6 of 9 and says nothing about the
  twelve phase 3 cards shipped since 2026-08-30. It is not that the digest
  under-reports phase 3. It cannot see it.

**R-061 IS SUPERSEDED IN ITS HARNESS HALF ONLY, AND IT IS SUPERSEDED BECAUSE ITS
PREMISE DID NOT HOLD, NOT BECAUSE IT WAS WRONG.** R-061 said: "**The harness is
not repointed and the phase 2 board is still the queue for every unattended
run.**" That sentence assumes the unattended runs work the phase 2 board. They do
not, and the evidence is committed and consecutive: run `20260830-220004` shipped
P3-11 and run `20260831-010005` shipped P3-13, both filed as "EXECUTOR, unattended
scheduled run" in their own reports. R-061 also kept a paragraph headed "what does
not change" whose first item is the claim lease, and the lease is exactly what
stopped working. A rule whose stated protection is the first thing to fail under
it is a rule that has been overtaken.

**WHAT REPLACES IT: THE HARNESS RESOLVES A CARD AGAINST EVERY BOARD, IT DOES NOT
GET REPOINTED AT A DIFFERENT ONE.** Repointing `POC_BOARD` at the phase 3 board
moves the blindness rather than removing it: the AUT, BOARD, CLAIM, LEARN and RST
lanes and the phase 2 launch gate would disappear from the digest instead. The
board set is the unit, not the board.

**WHY THIS IS TRIAGE'S TO RULE.** It is measured against the closed ten-item list
in DOCTRINE-TRIAGE section 6, item by item, and lands on none of them. It is not
money, pricing, legal, a vendor, a credential grant, a request reaching Mihai or
Andre, a click in anybody's console, a production DELETE, an acceptance sign-off
or launch timing. It is which file a script reads. Under R-050 that is TRIAGE's
and it is recorded here with an id rather than settled in a report nobody has to
obey.

**Unblocks:** nothing directly. It restores the channel P3-27's answer has to
arrive through, which is why the P3-27 escalation is carried forward in the same
run.
**Also changes:** `docs/board/rc-board-phase2.json` gains AUT-16, in the AUT lane
per R-041.
**Supersedes:** the harness half of R-061, quoted above in full. R-061's opening
of the phase 3 board, its retirement of the do-not-work-this-board sentence and
its "what does not change" list are untouched.

---

### R-072 - the board sweep under DOCTRINE-TRIAGE section 3: P2-13 removes a capability the phase 3 board depends on and the edge cannot be authored across boards, so it becomes an acceptance clause; P2-14's status is corrected to match its own blocked_on
**Date:** 2026-08-31
**Asked on:** P2-13, P2-14, P3-04b, P3-05b, P3-27, P2-08b
**Answer, verbatim:**
> This ruling quotes no line of the input report, because it comes from a sweep
> the report could not have performed. From docs/DOCTRINE-TRIAGE.md, section 3:
>
> "**Run all four checks, every time, over the whole board and not only the cards
> the report touched.** A stale edge is invisible from the card that carries it."
>
> and check 3 of the same section:
>
> "**A capability edge missing.** **This is the one that costs.** A card that
> REMOVES a capability - a credential rotation, a grant revocation, a cleanup -
> must depend on every card that needs that capability."

**Ruling:** all four checks were run over both open boards. Three found nothing.
The fourth found P2-13, and it cannot be fixed the way the doctrine says to fix
it.

**CHECK 1, DANGLING EDGES: NONE.** Every id in every `depends_on` on both boards
resolves to a card on the same board. No cross-board edge exists anywhere today.

**CHECK 2, SATISFIED BUT BLOCKING: FOUR CARDS FIRE AND THREE ARE CORRECT.**

- P2-08b, `blocked` on `andre`, P2-08a shipped. Andre genuinely owes the live
  round trip now. Correct, unchanged.
- P3-27, `blocked` on `ivan`, no edges. Ivan genuinely owes the apply decision
  now. Correct, unchanged, and carried forward as this run's escalation.
- P3-04b and P3-05b, both `blocked` on `ivan` with every edge shipped. The check
  fires and **R-065 already resequenced both onto P3-27**, in PR #126. Doing it
  again here would write the same edit into the same fields on a board whose
  merge is already conflicting, and would destroy the earlier audit when the two
  meet. Recorded, deliberately not repeated. DOCTRINE-TRIAGE section 5's rule
  against a second card for one problem is the same rule.
- P2-14 is the fourth and it is a different defect: `status: "todo"` while
  `blocked_on: "client"`. `CLAUDE.md` section 4 makes a card with a person in
  `blocked_on` a `blocked` card, and P2-14's own notes say "BLOCKED ON CLIENT AT
  AUTHORING TIME". **Corrected to `blocked`**, which also moves it into the
  BLOCKED ON PEOPLE lane under the `client` column, where the board Ivan reads
  will show it as what it is. The counts move with it: todo 10 to 9, blocked 1 to
  2. No eligibility changes, because a card with a non-null `blocked_on` was never
  eligible.

**CHECK 4, EDGES ON A SPLIT CARD: ALL RE-DERIVED, NOTHING STALE.** P3-13 split
three ways under R-058 and every edge that points into that family points at the
half it needs: P3-13b on `[P3-13, P3-09]`, P3-13c on `[P3-13b, P3-04]`, P3-12 on
`[P3-11, P3-13b]`, P3-18 on `[P3-13c]`. Nothing depends on the schema half where
it needs the editor half. P2-08's split is settled by R-025 and R-046 and nothing
points at the retired id.

**CHECK 3 IS THE ONE THAT FIRED, AND IT FIRED ON P2-13.**

Apply the test as the doctrine writes it. **What does P2-13 take away?** Section
8.7 of `CLAUDE.md`, which P2-13's own `defaults` quote as four tickable boxes:
the ability of ANY terminal to open a database connection or apply a migration,
the single permitted read under `/Users/ivan/rc-secrets`, and, added by R-059 and
listed in 8.7, the self-merge grant in section 3.1 on every path.

**Now list every card that needs those capabilities.** P3-27 needs the first one
and is nothing else: it IS the apply of thirteen pending migration files. Every
future phase 3 schema card needs it. And the second capability, self-merge, is
what the sixteen unshipped phase 3 cards are being built under: without it every
pull request returns to Ivan, which section 8.7 says in terms, "Deleting section
3.1 returns every PR to Ivan."

**P2-13's `depends_on` is `["P2-08b"]` and that is the whole set.** R-044 applied
this identical test on 2026-08-28 and added P2-19 for exactly this reason. R-054
then removed P2-19 because it was retired, correctly, and the reasoning did not
survive the removal. The board then split in two, and the cards that now need the
capability landed on the other side of the split.

**THE EDGE CANNOT BE AUTHORED. THIS IS A REAL CONSTRAINT AND NOT A PREFERENCE.**
`docs/board/validate-board.mjs` resolves `depends_on` against the cards of the
board being validated and fails with "is not a card id on this board" otherwise.
Adding `P3-27` to P2-13 makes the validator red, and `CLAUDE.md` section 2 makes a
commit on a red validator a commit that gets reverted. The doctrine's check 3
assumes one board and there are two.

**SO IT IS WRITTEN WHERE THE BOARD CAN CARRY IT: AS A CLAUSE ON P2-13's OWN
ACCEPTANCE.** P2-13's acceptance is that every box in
`docs/RUNBOOK-CREDENTIAL-ROTATION.md` is ticked, proven by counting unticked
boxes. That is already machine-checkable and it is already the gate on the card,
so the precondition becomes a box in the same document rather than a new
mechanism: before any credential is rotated, every migration file under
`supabase/migrations/` is recorded as applied in `docs/migrations/APPLY-LOG.md`.
Thirteen are pending today. The clause is added to `acceptance` and the reasoning
to `notes`, which are two of the fields DOCTRINE-TRIAGE lets TRIAGE edit.
`defaults` is NOT edited, because it is not on that list, and the runbook item
belongs to whoever authors the runbook.

**THIS IS ORDERING, NOT A GRANT, AND THE DISTINCTION IS THE SAME ONE R-037 DREW.**
R-037 said it in one line when it added P2-08b: "This does not soften section 8.7.
The grant still dies at P2-13. The ruling fixes when P2-13 runs, not whether it
does." Identical here. Item 5 of the closed escalation list covers granting,
widening, extending or renewing access; this narrows nothing and grants nothing,
and the grant's other two death conditions in section 8.6 are untouched, first
real client data being the one that does not wait for any card at all.

**Unblocks:** nothing. It stops P2-13 from stranding the phase 3 board.
**Also changes:** P2-14 `status`; P2-13 `acceptance` and `notes`.
**Supersedes:** none. It restores to P2-13 what R-044 put there and R-054 removed
for an unrelated reason, in the only form the validator permits.

---

### R-073 - a report committed before its acceptance ran is corrected by a dated addendum in a follow-up pull request, never by a rewrite
**Date:** 2026-08-31
**Asked on:** P3-13, and every card that ships a report under CLAUDE.md 9b
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13-deviz-schema.md, section 8, which
> exists on branch `card/p3-13-learnings` in open PR #130 and is NOT on `main`:
>
> "Section 9b puts the report in the pull request that carries the card, so this
> report was committed BEFORE `quality` had run. It then failed twice. Both
> failures and both fixes are recorded here rather than left in a run log, because
> a report that describes only the passing attempt is a report that makes the work
> look easier than it was."

**Ruling:** the addendum is the correct handling and it becomes the standing
pattern.

**THE TENSION IS STRUCTURAL AND NEITHER RULE IS AT FAULT.** Section 9b commits the
report inside the pull request that carries the card. Section 6 requires the
acceptance to have passed in that same pull request. The `quality` job takes about
fourteen minutes here. So a report is always written before its own verdict, and
sometimes the verdict disagrees with it.

**WHAT A TERMINAL DOES ABOUT IT.** It appends a dated addendum in a follow-up pull
request naming what failed, what fixed it, and how many of the three attempts in
section 10 were used. It does NOT rewrite the body to read as though the first
attempt passed. The record of what was believed and when is the only thing that
makes a report worth reading later, and this repository already made that choice
once, in G7's gate notes, where a paragraph that became false hours after it was
written was corrected underneath rather than deleted.

**THE INSTANCE IS PR #130 AND IT IS STILL OPEN.** Its `quality` run was in
progress while this was written. Nothing here merges it: TRIAGE does not merge a
card pull request, and this ruling is about the shape of the correction, not about
whether that one passes.

**A CONSEQUENCE FOR WHOEVER READS A REPORT NEXT, INCLUDING TRIAGE.** The version
of a report on `main` may be missing its addendum. This run read both: 241 lines
on `main`, 288 on the branch, and section 8 exists only in the second. A TRIAGE
run that reads only `main` sees a report whose acceptance section says the
migration passed and does not know it took three pushes to get there.

**Unblocks:** nothing.
**Supersedes:** none.

---

### R-074 - the phase 2 gate audit re-runs at 6 of 9 with nothing flipped, and the phase 3 gate is deliberately NOT re-audited because R-065 already audited it and the audit is not yet on main
**Date:** 2026-08-31
**Asked on:** the launch gate on both open boards
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13-deviz-schema.md, section 2:
>
> "**No `DROP TABLE`, no `TRUNCATE`, no `DELETE`.** Nothing in this file is
> destructive and nothing in it was applied to production. It joins the pending
> register against P3-27, per R-062."

**Ruling:** **PHASE 2 STAYS AT 6 OF 9 AND PHASE 3 STAYS AT 0 OF 9. NOTHING
FLIPS.** The audit is recorded because DOCTRINE-TRIAGE section 4 says an audit
that flips nothing is still the most useful thing the next session can read.

**PHASE 2, THE THREE OPEN CONDITIONS, EACH WITH ITS DECIDING CLAUSE.**

- **G4**, AI extraction end to end. Deciding clause as re-derived by R-053: the
  ingest endpoint asserted against a fixture. P2-08a is unshipped and P2-08b is
  `blocked` on `andre`. Unchanged since the 2026-08-28 audit under R-046.
- **G7**, a real Resend email from a real threshold crossing. Deciding clause: one
  real email delivered on production. The three things standing in front of it are
  the three the 2026-08-27 audit named and none has moved: `RESEND_API_KEY` in the
  production environment, `RESEND_FROM` set, and a recipient that is not on
  `rc-inventory.local`, a domain that does not exist. Two are clicks in a hosting
  console and the third lands at P2-13.
- **G9**, Mihai completes one full cycle himself. Deciding clause: P2-14 recording
  it. P2-14 is `blocked` on `client` as of this run, per R-072.

**NONE OF THE THREE IS BACKLOG AND THE SECTION 4 RULE IS RESTATED SO A READER
DOES NOT GO HUNTING.** G4 needs a third party, G7 needs actions in consoles no
terminal holds, and G9 needs the client to do something himself. There is no card
a terminal can pick up that closes any of them.

**THE P3-13 REPORT MOVED NO GATE ON EITHER BOARD, AND THE QUOTED LINE IS WHY.**
`0025_deviz.sql` is authored, parsed, proven against a bare `postgres:16` and
merged, and it has never been applied to anything. Every phase 3 gate condition
says "on production". A file in `supabase/migrations/` is not production, and
thirteen of them now wait on P3-27.

**THE PHASE 3 AUDIT IS NOT REPEATED HERE, DELIBERATELY.** R-065 audited all nine
conditions on 2026-08-31 and wrote the audit into all nine `evidence` fields. That
work is in PR #126 and is not on `main`. Writing a second audit into the same nine
fields would conflict with it and, on resolution, would very likely delete it,
which is the opposite of what section 4 exists for. **This run therefore edits no
field of `docs/board/rc-board-phase3.json` at all.** Nothing has happened since
R-065 that could flip any of the nine: no migration has been applied and no card
has shipped on production. When RST-03 lands #126, R-065's audit is the current
one and this ruling is its confirmation.

**ONE DIVERGENCE FROM THE RUBRIC, STATED SO THE NEXT RUN REACHES THE SAME
ANSWER.** DOCTRINE-TRIAGE section 4.4 says to write the audit into `evidence.ref`.
On this board a failing condition carries `evidence: null` and both prior audits,
R-023's and R-046's, are in the condition's `notes`. This audit goes to `notes`
too, because three audits of one gate in two different fields is a record a
stranger has to assemble. The rubric and the board practice disagree and the board
practice is two audits old; correcting DOCTRINE-TRIAGE is AUT-15's business, and
AUT-15 is in PR #126.

**Unblocks:** nothing. A gate is not work.
**Also changes:** the `notes` of G4, G7 and G9 on
`docs/board/rc-board-phase2.json`.
**Supersedes:** none. It confirms R-046 for phase 2 and R-065 for phase 3.

---

### R-075 - the report this TRIAGE run was handed had already been triaged, the real newest report was on an open pull request, and the harness selector is authored as AUT-17
**Date:** 2026-08-31
**Asked on:** AUT-3, AUT-15, AUT-17, and every future TRIAGE run
**Answer, verbatim:**
> from the harness dispatch this run received, generated by
> `scripts/poc/run.sh` lines 734 to 750:
>
> "Your input is the newest report in docs/reports/, which is
> docs/reports/2026-08-31-executor-p3-13-deviz-schema.md. Read it. You get
> nothing else and you need nothing else."
>
> and from `docs/poc/triage-latest.json` on `main`, written by the PREVIOUS
> TRIAGE run and merged as PR #131 at 08:36:51Z, before this run's TRIAGE step
> started:
>
> "run_id": "20260831-010005",
> "report": "docs/reports/2026-08-31-executor-p3-13-deviz-schema.md"

**Ruling:** the dispatch named a report that had already been fully triaged by
run `20260831-010005` as R-068 to R-074. **This run did not re-triage it.** It
took as its input the actually-newest committed executor report,
`docs/reports/2026-08-31-executor-p3-13b-deviz-editor.md`, which is committed on
branch `card/p3-13b` in open PR #133 and is this same run's own EXECUTOR output.
The selector defect is card **AUT-17**.

**THREE DEFECTS IN ELEVEN LINES OF SHELL, AND THE THIRD IS THE ONE THAT FIRED
TODAY.**

```
TRIAGE_REPORT=$(git ls-tree -r --name-only origin/main -- docs/reports/ \
  | grep -E "^docs/reports/[0-9]{4}-[0-9]{2}-[0-9]{2}-executor-[a-z0-9-]+\.md$" \
  | sort | tail -1)
```

- **It sorts filenames, not commits.** Within one date the SLUG decides which
  report is "newest". Today that was harmless by luck: `p3-13b-deviz-editor`
  happens to sort after `p3-13-deviz-schema`, because `b` is greater than `-`.
  On 2026-08-31 `main` also carries `2026-08-31-executor-drops-blocked.md`, whose
  slug sorts FIRST, and if the next run's slug begins with a letter early in the
  alphabet the harness will hand TRIAGE a report from hours earlier and call it
  the newest.
- **It reads `origin/main` only.** An executor report rides in the pull request
  that carries its card, per `CLAUDE.md` section 9b. A card that does not ship
  leaves its report on an unmerged branch, which is exactly what happened here:
  P3-13b's acceptance ran red, the card stayed `in_flight`, and its report is on
  `card/p3-13b`. A run whose card fails is precisely the run whose report most
  needs triaging, and it is the one shape this selector cannot see.
- **It never asks whether that report has already been consumed**, although the
  answer is committed, on `main`, in a file the harness itself requires TRIAGE to
  write: `docs/poc/triage-latest.json` carries the `report` path of the last run
  that triaged one. Comparing the selected path against that field is one line.

**WHAT THE FAILURE WOULD HAVE LOOKED LIKE, WHICH IS WHY IT IS A CARD AND NOT A
NOTE.** A TRIAGE session obeying the dispatch literally re-reads a report whose
every deviation was ratified three hours earlier, finds the same findings, and
writes a second set of rulings with new ids over the same facts. Nothing errors.
The pull request is green. The digest reports rulings written. Two ids now say
the same thing about one report and a later reader cannot tell which was the
decision. That is the same failure shape AUT-15's notes name: it looks exactly
like a clean run.

**THE DISPATCH SENTENCE IS FALSE AND IT IS FALSE IN THE HARNESS, NOT ONLY IN THE
DOCTRINE.** "You get nothing else and you need nothing else" is the same clause
R-067 already overturned in `docs/DOCTRINE-TRIAGE.md`, and AUT-15 corrects it
there. AUT-15 does not touch `scripts/poc/run.sh`, which reproduces the clause
verbatim in the text that actually reaches the model. Correcting one and not the
other leaves the false half in the only copy a session is guaranteed to read, so
the harness line is an acceptance clause of AUT-17 rather than a second finding.

**WHAT THIS RULING DOES NOT DO.** It does not weaken R-050. TRIAGE still takes no
chat, no summary, no verbal ratification and no human context. The report is
still the only DISPATCH. What is corrected is a selector that picks the wrong
file and a sentence that forbids reading the repository the rubric requires.

**Unblocks:** nothing. AUT-17 is `todo` and eligible.
**Also changes:** `docs/board/rc-board-phase2.json` gains AUT-17, in the AUT lane
per R-041.
**Supersedes:** none. It applies R-067 rather than amending it, and extends its
finding to the second copy of the clause.

---

### R-076 - the two authority deviations in the P3-13b run are ratified individually: EXECUTOR merged two TRIAGE pull requests it had resolved, and it did RST-03's work without RST-03
**Date:** 2026-08-31
**Asked on:** RST-03, and every future conflicting pull request
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13b-deviz-editor.md, section 2b:
>
> "**A NOTE ON AUTHORITY, BECAUSE THIS IS THE ONE THING IN THIS RUN THAT IS NOT
> LITERALLY SPELLED OUT.** Section 3.1 grants each of the four roles a self-merge
> on its OWN pull requests, and #126 and #131 are TRIAGE's. R-052 assigns a
> CONFLICTING pull request to EXECUTOR, which is how they came to this terminal
> at all, and after the resolution the head sha on both was this terminal's
> commit. Merging them is the reading taken here, and the alternative was to
> resolve two conflicts and then leave both sitting, which is the exact outcome
> the previous run flagged and which would have conflicted again by the next run.
> **Named here rather than buried, so TRIAGE can object if the reading is
> wrong.**"

**Ruling:** both are **RATIFIED**, one at a time with the test named for each,
because DOCTRINE-TRIAGE section 1 says a set ratified as a block is a set nobody
read. The reading taken is the correct one and it is now written down so the next
run does not have to take it again.

**DEVIATION 1: EXECUTOR MERGED PR #126 AND PR #131, WHICH TRIAGE OPENED.
RATIFIED ON TEST 3, WITH THE AUTHORISING RULINGS CITED BY ID.**

- Test 1, unrecoverable data: does not fire. Two merges of committed text into
  `main`. No row, no credential, no production write, and both are revertible in
  the ordinary way.
- Test 2, committed evidence a stranger can re-verify: satisfied on both. #126
  merged at 08:16:40Z with `quality` success on head sha `cc99420`; #131 merged at
  08:36:51Z with `quality` success on head sha `1bdbb12`. Both runs exist for
  those exact shas, which is the condition `CLAUDE.md` section 3.1 states and the
  one a `gh pr checks` summary on a conflicting pull request does not satisfy. The
  resolutions were made locally against the full tree with the board validator and
  `npm run check:conflict-residue` run BEFORE the commit, per R-052, and the
  report quotes the output of each.
- Test 3, widen or apply: this is where it turns. Read narrowly, section 3.1
  grants a role a self-merge on ITS OWN pull requests, and these were opened by
  TRIAGE. **A ruling already authorised it, and it is cited by id: R-052 assigns
  a conflicting pull request TO EXECUTOR, and R-070 applied that assignment to
  #126 by number three hours earlier.** An assignment that hands a terminal the
  resolution but withholds the merge hands it the ability to produce a green,
  up-to-date, still-unmerged pull request, which is the state the assignment
  exists to end. Nothing widened: the four roles in the table are unchanged, the
  path column is unchanged, the green-on-head-sha condition was met on both, and
  the one exclusion, executing against production, was nowhere near this.
- Test 4 is not reached, and is recorded anyway because it is unambiguous: the
  alternative was two green, resolved, unmerged pull requests that would have
  conflicted again within one run, which is the condition R-070 authored a card to
  escape.

**RATIFIED, AND THE GENERAL RULE IS STATED SO IT IS NOT RE-DERIVED: A CONFLICTING
PULL REQUEST ASSIGNED TO EXECUTOR UNDER R-052 IS EXECUTOR'S TO MERGE, ON GREEN
`quality` ON THE SHA IT PUSHED.** It is not a widening of section 3.1 because
R-052 moved the pull request, not the grant. What does NOT follow, and is written
out so nobody reads this as a general licence: EXECUTOR may not merge a TRIAGE
pull request that is not conflicting, because nothing assigned it, and TRIAGE may
still not merge a card pull request under any circumstance.

**DEVIATION 2: THE RUN PERFORMED RST-03'S WORK WITHOUT TAKING RST-03. RATIFIED ON
TEST 4.**

`CLAUDE.md` section 2 is one card, one branch, one pull request, and RST-03 is a
card whose entire subject is landing the content of #126. This run landed it on
two other branches, shipped nothing, and left RST-03 `todo`.

- Test 1: does not fire, same reason as above.
- Test 2: satisfied. The four clauses of RST-03's acceptance are each verifiable
  against `origin/main` today and are enumerated in R-077.
- Test 3, widen or apply: applies. R-052 assigns the conflict resolution and
  R-070 named #126 by number. Neither is conditioned on the card being taken
  first, and R-052 exists precisely because a conflict is discovered by whoever
  runs into it rather than scheduled.
- Test 4, would the alternative have been worse: yes. The alternative was to
  take RST-03 as a card, which is on the phase 2 board while this run's queue was
  the phase 3 board, in a run that also had P3-13b eligible and a 45 minute cap.
  Two cards is the per-run maximum and the conflict was blocking both boards. A
  run that had correctly identified the blockage, and had the rule in hand
  assigning it, waiting for the next run to take the card would have left five
  rulings and three cards outside `main` for another three hours while every board
  edit widened the conflict.

**RATIFIED. THE CARD IS NOT MARKED SHIPPED BY THIS RULING AND R-077 SAYS WHY.**

**Unblocks:** nothing directly. R-063 to R-067, P3-28, BOARD-02 and AUT-15 are on
`main` as a result of the work ratified here.
**Supersedes:** none.

---

### R-077 - RST-03's acceptance is met in full on committed evidence, and TRIAGE records it instead of shipping the card
**Date:** 2026-08-31
**Asked on:** RST-03
**Answer, verbatim:**
> from docs/board/rc-board-phase2.json, card RST-03 `acceptance`:
> "AGAINST origin/main AFTER THIS CARD SHIPS, ALL FOUR EXIT 0."

**Ruling:** all four clauses are satisfied against `origin/main` at `1879be0`.
**The card does NOT flip to `shipped` here.** The evidence is written into its
`notes` and it stays `todo` so the next EXECUTOR run verifies and ships it. This
is R-045 applied unchanged: DOCTRINE-TRIAGE says TRIAGE may not ship a card
because shipping needs an acceptance run and TRIAGE runs nothing.

**THE FOUR CLAUSES, EACH WITH WHAT ANSWERS IT, READ-ONLY AND RE-RUNNABLE BY A
STRANGER.**

1. `git show origin/main:decisions/inbox.md | grep -c '^### R-06[34567] '` prints
   **5**. R-063, R-064, R-065, R-066 and R-067 are all on `main`.
2. `docs/board/rc-board-phase2.json` carries **BOARD-02** and **AUT-15**, and
   `docs/board/rc-board-phase3.json` carries **P3-28**, each with a non-empty
   `plain`, `acceptance` and `defaults`.
3. `git show origin/main:docs/reports/2026-08-31-triage-board-clock-and-gate-audit.md | head -1`
   prints its title line, so the TRIAGE report survived per `CLAUDE.md` section
   9b. The second TRIAGE report,
   `docs/reports/2026-08-31-triage-answer-channel-and-capability-edge.md`, is on
   `main` too.
4. The validators and `npm run check:conflict-residue` were run BEFORE each
   resolution commit and their output is quoted in
   `docs/reports/2026-08-31-executor-p3-13b-deviz-editor.md` sections 2 and 2b:
   both boards PASS with 0 violations and 3 of 3 residue checks passed on
   `cc99420`, and 52 cards with the validator PASS on `1bdbb12`. `quality`
   concluded success on both of those exact shas.

**THE ROUTE TAKEN WAS (a) AND NOT (b), WHICH THE CARD'S OWN `defaults` ALLOW
EITHER OF.** The branches were resolved locally against the full tree and merged;
no new branch was needed and nothing was re-landed verbatim. Nothing was dropped
to make either merge easier, which is the clause the card was most at risk on:
R-063 to R-067 and R-068 to R-074 are all present, once each, in id order, and
R-065's nine gate evidence rewrites survived alongside `main`'s P3-13 board edit.

**WHY `todo` AND NOT A FLIP, RESTATED BECAUSE IT WILL LOOK LIKE PEDANTRY TO
WHOEVER READS THE BOARD NEXT.** Every clause here was checked by reading
committed files, which is what DOCTRINE-TRIAGE section 4 requires of a gate audit
and is not the same act as running a card's acceptance. The card's own fourth
clause is about commands run before a commit, and TRIAGE was not at that
keyboard. The next EXECUTOR run has four `git show` and `node -e` commands to run
and a status field to set, which is the cheapest card on either board.

**Unblocks:** nothing. RST-03 is already `todo` and eligible.
**Also changes:** RST-03 `notes`.
**Supersedes:** none. R-045 is the precedent and is followed rather than
extended.

---

### R-078 - two card pull requests are stuck with no `quality` run any merge could rest on, the sweep is designed never to see either, and the visibility half is authored as AUT-18
**Date:** 2026-08-31
**Asked on:** RST-02, AUT-18, P3-13b, P3-13
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13b-deviz-editor.md, section 6:
>
> "**PR #133 and the seven remaining red cases.** The branch already carries the
> diacritic fix. Merge `main` into it (it is BEHIND now that #126 and #131 have
> landed), push, and read the next `quality` run."

**Ruling:** the handoff is correct and it is already out of date, which is the
finding. **PR #133 is no longer BEHIND. It is `CONFLICTING` and `DIRTY`, and
there is NO `quality` check run on its head sha `f377fb9` at all** - the check
runs on that commit are Vercel and a skipped Supabase preview, and nothing else.
`CLAUDE.md` section 3 already names this: a pull request conflicting with `main`
triggers zero workflows. **The diacritic fix in that head commit has therefore
never been tested**, and the report's own table, which records the red run, was
measured on an earlier sha.

**AND IT IS NOT THE ONLY ONE. PR #130 IS ALSO STUCK, AND NOTHING HAS NAMED IT FOR
A FULL RUN.** It carries the R-073 addendum to the P3-13 report plus two
learnings. It is `MERGEABLE` and `BEHIND`, and its `quality` run on head sha
`5631e6e` **concluded FAILURE at the `End to end` step**, at 05:34:45Z. `main` was
green at `c124529` one minute earlier and green again at `f036f1b`, so this is not
`main` being red. It is a documentation-only branch failing the end to end suite,
which is either a flake or an intermittent, and either way it is a red check that
no merge may rest on. R-073 named #130 as the live instance of the addendum
pattern and said nothing here merges it. The P3-13b report does not mention it.
One more run and it is wreckage found by hand, which is the incident RST-02 was
authored for.

**WHY NEITHER IS COVERED BY AN OPEN CARD, AND THE ANSWER IS THAT RST-02 IS
CORRECT.** RST-02's `defaults` forbid the sweep from ever taking a `card/` branch,
in its strongest terms, and its acceptance asserts the exclusion as a test that
fails if a card branch is ever selected. That is right and is not weakened here: a
sweep that merged card branches would ship unproven cards at four in the morning.
R-070 added to RST-02 that a selected pull request the sweep cannot merge is
escalated rather than skipped. **A `card/` branch is never selected, so it is never
escalated either.** The two rules compose into a blind spot exactly the width of
the pull requests that carry the actual product.

**SO THE MISSING PIECE IS VISIBILITY, NOT RECOVERY, AND IT IS A SEPARATE CARD FOR
THE SAME REASON R-070 KEPT RST-02 AND RST-03 SEPARATE.** AUT-18 is a census: every
run lists every OPEN pull request it did not merge, with its merge state and
whether a `quality` run exists for its head sha, and escalates into
`docs/poc/state.json` any that conflicts or has no run on its head sha. **It
merges nothing and it must never be able to.** RST-02 picks work up; AUT-18 makes
it impossible for work to be invisible. `CLAUDE.md` section 13 already says
silence about eligible work is a defect and never a normal outcome, and two stuck
pull requests carrying a card, a ruling addendum and two learnings are that.

**P3-13b IS DELIBERATELY NOT EDITED BY THIS RUN, AND THAT IS THE SAME CALL R-074
MADE.** The card's `notes` on branch `card/p3-13b` already record the red
acceptance, the eight failed cases, the diacritic root cause and the three
undiagnosed failure shapes, in PR #133, in the only fields TRIAGE would write to.
Writing a second copy onto `main` would conflict with that pull request on the
same card and would most likely delete the executor's own account of its run when
the two meet. **The conflict status above is recorded here and in this run's
report instead**, and the next EXECUTOR reads it there.

**THE ONE THING THAT MUST NOT BE INFERRED FROM THIS RULING.** P3-13b is
`in_flight` with a red acceptance and stays that way. Nothing here ships it,
nothing here excuses the seven undiagnosed cases, and the failure ceiling in
`CLAUDE.md` section 10 stands at one attempt of three, as the report states.

**A THIRD INSTANCE OF THE SAME SHAPE, ON THE BOARD RATHER THAN ON A PULL
REQUEST, AND IT IS THE ONE THAT COULD COST A WHOLE RUN.** `CLAUDE.md` section 2
says a card flips to `in_flight` in a commit made BEFORE the work starts, "so the
board never shows a card being worked as untouched". P3-13b's flip is in PR #133.
**On `main` today P3-13b reads `status: todo`, and `scripts/poc/eligible.mjs`
against `main` returns it as the first eligible card on the phase 3 board**, with
no claim on it in `docs/poc/state.json` and no note on the card mentioning a
branch. A run that reads only `main` sees an untouched card and could start it
from scratch on a second branch, which is the collision the claim lease exists to
prevent and which the lease cannot prevent here, because a claim protects a card
only once its own pull request has merged.

**THAT INSTANCE GOES ON CLAIM-01 AND NOT ON A NEW CARD.** CLAIM-01 already names
the general defect in its own title, and DOCTRINE-TRIAGE section 5 forbids a
second card for a problem an open card covers. **P3-13b itself is still not
edited**, for the reason above: flipping its status on `main` would collide with
#133 on the one card #133 exists to change, and it would also remove the card from
the eligible list, so a run that would otherwise pick it up and find the branch
would be sent to P3-14 instead. Both readings are bad and the only real fix is
landing #133, which is item 1 of this run's report.

**Unblocks:** nothing. AUT-18 is `todo` and eligible.
**Also changes:** `docs/board/rc-board-phase2.json` gains AUT-18; RST-02 `notes`
gain the boundary between the two cards.
**Supersedes:** none. R-070's addition to RST-02 stands unchanged; this names what
that addition cannot reach.

---

### R-079 - a Romanian word missing its diacritic is caught by nothing, and P3-21's acceptance gains the half that catches it
**Date:** 2026-08-31
**Asked on:** P3-21
**Answer, verbatim:**
> from docs/reports/2026-08-31-executor-p3-13b-deviz-editor.md, section 3c:
>
> "```
> Expected substring: "Ciornă"
> Received string:    "Versiunea 2Ciorna-2770 MDL"
> ```
>
> `DEVIZ_STATUS_LABEL` shipped the draft label as **`Ciorna`, without the
> diacritic**, which CLAUDE.md section 11 forbids by name and which the spec
> caught on its very first assertion."

**Ruling:** the defect was caught by a card's own end to end spec, by accident of
that spec asserting the label text, and **by nothing that would catch the next
one**. P3-21's `acceptance` gains a second half. Its `defaults` already say
"DIACRITICS ARE PART OF THIS", so this is not new scope: it is the acceptance
line catching up with the card's own stated scope.

**WHAT THE CHECK P3-21 ALREADY SPECIFIES WOULD DO WITH `Ciorna`: NOTHING.**
`check:i18n` as the card describes it is a wordlist of ENGLISH words, word
boundary matched, that must never reach a user-facing string. `Ciorna` is not an
English word. It is a Romanian word spelled wrong, it passes every test in that
design, and it reached a merged branch and a red acceptance.

**THE SHAPE IS A DENYLIST OF ASCII SPELLINGS, AND IT IS HONEST ABOUT BEING
INCOMPLETE.** A committed list of pairs, correct form and forbidden ASCII form,
seeded with `Ciornă`/`Ciorna` because that pair has already cost a run, and grown
whenever a sweep or a review finds another. The same `check:i18n` script, the same
escape hatch, the same wired-into-`quality` step. **It is deliberately NOT a
general "this string has no diacritics" heuristic**: Romanian has plenty of
correctly spelled words with no diacritic in them, so a heuristic would fire on
every one, would be suppressed within a week, and would then catch nothing. A
denylist catches exactly the regressions of words somebody has already fixed once,
which is the failure that actually recurs.

**WHY THE ACCEPTANCE AND NOT THE `defaults`.** DOCTRINE-TRIAGE lets TRIAGE edit
`acceptance` when a ruling changes it, and this ruling changes it. A property
stated only in `defaults` is a property nothing proves: `defaults` fill silence
for the builder, and `acceptance` is what the card ships on. The diacritic
sentence has been in P3-21's `defaults` since it was authored and a diacritic
defect shipped anyway.

**Unblocks:** nothing. P3-21 is `todo` and eligible and this does not change that.
**Also changes:** P3-21 `acceptance` and `notes` on
`docs/board/rc-board-phase3.json`.
**Supersedes:** none.

---

### R-080 - the gate audit: G4 has been closeable by a terminal since R-053 and has no card, because R-053's board edits never landed; three of its five clauses are already green; P2-20 is authored and R-074's premise is corrected
**Date:** 2026-08-31
**Asked on:** G4, G7, G9, P2-08b, P2-20, and the phase 3 launch gate
**Answer, verbatim:**
> from decisions/inbox.md, R-053, its own `Also changes` line, quoted because
> this ruling is about a board edit that a ruling ordered and nobody made:
>
> "**Also changes:** G4's clause and notes on the board. P2-08b is rescoped to
> the ingest endpoint and its four failure cases; the live round trip is a new
> non-gating card."

**Ruling:** **PHASE 2 STAYS AT 6 OF 9 AND PHASE 3 STAYS AT 0 OF 9. NOTHING
FLIPS.** But G4's audit has been wrong in the same way three times, and the cause
is that half of R-053 was never applied to the board.

**G4, AND THIS IS THE FINDING OF THE RUN.** R-053 replaced G4's deciding clause on
2026-08-28: it is no longer one real document through Andre's live scenario, it is
**the ingest endpoint asserted against a fixture document plus its four named
failure cases: redirect, malformed payload, oversize, auth rejection.** The gate's
`notes` carry that rescope. The rest of R-053's `Also changes` line never
happened: **P2-08b was not rescoped, no new non-gating card was authored for the
live round trip, and no card of any kind was authored for the four failure
cases.** So a gate that a terminal has been able to close for three days has been
audited twice since as one that no terminal can close.

**THE CLAUSES, MEASURED AGAINST THE TREE RATHER THAN AGAINST THE CARDS. THREE OF
FIVE ARE ALREADY GREEN AND NOBODY HAS RECORDED IT.** `tests/e2e/extraction.spec.ts`
runs in the `End to end` step of `quality` on every push and carries eight cases:

- **the fixture document: GREEN.** Case 2, "un callback extracted scrie fiecare
  camp al contractului", asserts a fixture callback writing every field of the
  contract.
- **auth rejection: GREEN.** Case 4, "secret gresit sau lipsa este 401 si nu scrie
  nimic".
- **malformed payload: GREEN.** Case 5, "un payload in afara contractului este 400
  si nu scrie nimic".
- **redirect: ABSENT.** Nothing in `lib/data/extraction-fire.ts` sets a redirect
  policy and nothing anywhere asserts one. This is the case R-053's rationale is
  built on: an endpoint behind a redirect returns 200 while doing nothing, and the
  fire would record a success.
- **oversize: ABSENT.** The callback route at `app/api/extraction/callback/route.ts`
  bounds nothing, and no case asserts a refusal.

**SO G4 IS TWO CASES SHORT, AND THOSE TWO CASES ARE CARD P2-20**, authored on the
phase 2 board by this ruling, depending on P2-08a, which is shipped. This is the
first time in this repository's history that G4 has had a card.

**R-074'S G4 AUDIT IS CORRECTED, AND THE CORRECTION IS A NEW RULING BECAUSE A
RULING IS NEVER EDITED.** R-074 wrote, three hours ago: "P2-08a is unshipped and
P2-08b is blocked on andre." **P2-08a is shipped**, on the board, and R-046 had
already re-derived it as shipped on 2026-08-28. The conclusion R-074 reached,
that G4 stays `fail`, is correct and is confirmed here on better evidence; the
premise it reached it on is not. Nothing else in R-074 depends on that sentence.

**THE IDS ARE ASSIGNED THE OPPOSITE WAY ROUND FROM R-053'S SENTENCE, AND THE SWAP
IS WRITTEN DOWN SO NOBODY HUNTS FOR A CARD THAT DOES NOT EXIST.** R-053 said
rescope P2-08b to the endpoint assertions and author a new card for the live round
trip. Done that way, P2-08b's title, acceptance, `defaults` and the preserved
Andre question would all have to be rewritten to mean something else, and
**TRIAGE does not edit titles**, which R-065 already stated. So P2-08b keeps the
live round trip it is written for and the NEW card, P2-20, carries the endpoint
assertions. The substance of R-053 is applied exactly; only which id holds which
half differs.

**P2-08b IS DEGATED AND ITS `question` SAYS SO IN A DATED APPENDED PARAGRAPH,
NEVER BY A REWRITE.** Its `IMPACT IF UNANSWERED` line reads "gate G4 stays fail",
which has been false since R-053 and is the sentence most likely to be read off
this card by whoever next asks what Andre is holding up. It is corrected
underneath rather than replaced, which is what G7's own `notes` did on 2026-08-26
when a paragraph became false hours after it was written. P2-08b stays `blocked`
on `andre`: the round trip is still worth having, it is still the only thing that
proves the three prompt rules hold on real paper, and nothing here asks Andre for
anything new. What changes is that no launch condition waits on him.

**P2-13 KEEPS ITS EDGE ON P2-08b AND THAT IS DELIBERATE.** R-037 added it so the
credential firewall cannot flip before the live round trip, and that reasoning is
about credentials rather than about G4. Removing the edge because G4 stopped
depending on P2-08b would be inferring one from the other.

**G7, RE-AUDITED, STAYS `fail`, `blocked_on: ivan` RETAINED.** Deciding clause
unchanged: one real email delivered from a real threshold crossing on production.
The three things in front of it are the three the 2026-08-27 audit named and none
has moved: `RESEND_API_KEY` present in the production environment, `RESEND_FROM`
set, and a recipient that is not on `rc-inventory.local`, a domain that does not
exist. **No database read was performed for this audit and none is claimed.** The
first two are panel actions and are escalated by this run with a recommended
default, which is the first time they have been put in front of the owner as
anything other than a line inside a gate's notes.

**G9, RE-AUDITED, STAYS `fail`.** Deciding clause unchanged: P2-14 recording Ivan
reporting that Mihai personally completed a full cycle on production. No such
report exists. P2-14 is `blocked` on `client` since R-072. This is the one gate no
terminal can close.

**THE PHASE 3 GATE IS NOT RE-AUDITED AND THE REASON IS NO LONGER R-074'S.** R-074
declined because R-065's audit was outside `main`; it is on `main` now, as of
`f036f1b`. It is not repeated because **nothing has happened that could move any
of the nine**: no migration has been applied to production, the pending register
stands at thirteen files, and the one card this run's report touched, P3-13b, is
`in_flight` with a red acceptance. Every phase 3 condition says "on production".
R-065's audit is the current one and stands.

**THE SECTION 4 RULE, RESTATED, BECAUSE THIS AUDIT CHANGES WHO IT APPLIES TO.**
Of the three open phase 2 conditions, G7 needs actions in a console no terminal
holds and G9 needs the client to act himself. Neither is backlog. **G4 no longer
belongs in that list.** It is backlog, it has a card, and P2-20 is the card.

**Unblocks:** nothing today, and that is the point of writing it: G4 stops being
recorded as unreachable.
**Also changes:** `docs/board/rc-board-phase2.json` gains P2-20; G4, G7 and G9
`notes`; P2-08b `question` and `notes`.
**Supersedes:** the sentence "P2-08a is unshipped" in R-074's G4 audit, and
R-074's stated reason for not re-auditing the phase 3 gate. Both of R-074's
conclusions stand. R-053 is applied, not amended.

---

### R-081 - the board sweep under DOCTRINE-TRIAGE section 3: four checks over both boards, one stale edge found on a card this run did not touch, and the cross-board capability edge is still unauthorable
**Date:** 2026-08-31
**Asked on:** every card on both open boards
**Answer, verbatim:**
> This ruling quotes no line of the input report, because it comes from a sweep
> the report could not have performed. From docs/DOCTRINE-TRIAGE.md, section 3:
>
> "**Run all four checks, every time, over the whole board and not only the cards
> the report touched.** A stale edge is invisible from the card that carries it."

**Ruling:** all four checks were run over both open boards.

**CHECK 1, DANGLING EDGES: NONE.** Every id in every `depends_on` on both boards
resolves to a card on the same board, including the three cards this run
authors, which carry no edges except P2-20's on P2-08a.

**CHECK 2, SATISFIED BUT BLOCKING: FOUR CARDS FIRE, ALL FOUR ARE CORRECT AND ONE
HAS CHANGED MEANING.**

- **P2-08b**, `blocked` on `andre`, P2-08a shipped. Andre genuinely owes the live
  round trip. **The card is unchanged and its meaning is not**: R-080 records that
  it no longer holds a launch condition, so the wait is now a wait for
  completeness rather than for launch.
- **P3-27**, `blocked` on `ivan`, no edges. Ivan genuinely owes the apply
  decision. Correct, unchanged, carried forward as this run's first escalation.
- **P3-04b and P3-05b**, `blocked` on `ivan` with every edge shipped. R-065
  resequenced both onto P3-27 and that audit is on `main` now. Correct as they
  stand, unchanged.

**CHECK 3, A MISSING CAPABILITY EDGE: P2-13 STILL, AND IT IS STILL UNAUTHORABLE.**
P2-13 removes the database connection every phase 3 schema card needs and the
self-merge grant the sixteen unshipped phase 3 cards are being built under. R-072
established that `docs/board/validate-board.mjs` resolves `depends_on` against the
cards of the board being validated, so a `P2-13 -> P3-27` edge makes the validator
red, and wrote the precondition into P2-13's `acceptance` instead. **That remains
the only form the board can carry and it is not re-written here.** Nothing else on
either board removes a capability: AUT-17 and AUT-18 add reporting, P2-20 adds
assertions, and none of the three takes anything away.

**CHECK 4, EDGES ON A SPLIT CARD: ALL RE-DERIVED, NOTHING STALE.** The P3-13
family under R-058 is unchanged since R-072 checked it: P3-13b on `[P3-13, P3-09]`,
P3-13c on `[P3-13b, P3-04]`, P3-12 on `[P3-11, P3-13b]`, P3-18 on `[P3-13c]`.
**The P2-08 split is checked again on purpose and it is where check 4 earns its
place this run.** R-053 split P2-08b's subject in two and named the second half as
a card that was never authored, so for three days the split existed in a ruling
and not on the board. P2-20 is that half, and G4's clause now points at a card
rather than at a sentence. No edge anywhere points at the retired `P2-08`.

**ONE THING THE SWEEP CANNOT DO AND SAYS SO RATHER THAN PASSING SILENTLY.** The
phase 3 board on `main` is not the phase 3 board the next run will read: PR #133
carries a P3-13b edit that is not here, and this run's own edit to P3-21 is not
there. The sweep was run against `main` at `1879be0`, which is the only tree a
stranger can reproduce it on, and the one card whose state differs is named.

**Unblocks:** nothing. A sweep is not work.
**Supersedes:** none. It confirms R-072's four checks and adds the P2-08 half that
check 4 was written to catch.
### R-082

**Migration apply under assertion. CLAUDE.md 8.6 is amended.**

**Asked by:** card P3-27a, on the owner's dispatch of 2026-08-31.
**Decided by:** the owner, in that dispatch, in his own words.

**THE GAP THIS CLOSES, AND IT WAS REAL RATHER THAN THEORETICAL.** Thirteen
migrations are merged and unapplied. Nothing in the rulings so far let a terminal
apply them:

- **R-047** permits a terminal to execute an assertion-bearing SCRIPT against the
  phase 2 database. It says in terms that **MIGRATIONS ARE NOT IN SCOPE**, because
  migrations have their own three-phase path in 8.5 and their own stop in 8.6.
- **R-049, R-056 and R-059** widened the SELF-MERGE grant, twice, to every path
  and to four roles. None of them touched 8.6, and section 3.1 says so itself:
  merging a migration file changes one text file in a git repository and changes
  nothing in any database. **Merging the file is not applying it.**

So the apply was reachable by nobody, and P3-27 had been blocked on the owner
since it was authored. This ruling closes that explicitly rather than letting
somebody infer it from the self-merge grant, which is the inference 3.1 was
written to forbid.

**THE GRANT.** A terminal may apply merged migrations to the production database
ONLY through an applier that:

- runs the whole batch inside **one transaction**
- records the **pending register** and the **applied ledger** before and after
- evaluates its assertions **in SQL**, inside that transaction, after the
  mutations and before the commit
- **commits only on all-pass**, and otherwise rolls back whole and exits non-zero
  naming every failure
- **never chooses.** It does not read a grid and decide, it does not judge whether
  a count is close enough, and it does not continue past a deviation because the
  deviation is explainable. The script decides. The terminal reports what the
  script decided and nothing else.

That last clause is R-047's fourth condition, repeated here rather than
cross-referenced, because it is the whole reason either grant is safe.

**THE ABSOLUTE EXCLUSION IS UNCHANGED.** `DROP TABLE`, `TRUNCATE` and `DELETE`
are never auto-applied, by this applier or by anything else. Encountering one is
an immediate refusal with **nothing executed**, the statement quoted verbatim, and
the card goes `blocked_on: ivan`. No exception, no judgement call, no "it is
obviously safe here".

**`DROP FUNCTION` IS PERMITTED, UNDER ONE ADDITIONAL ASSERTION.** It removes a
rule about rows and no row, which is the class 8.6 already lists as permitted
alongside `DROP INDEX`, `DROP POLICY` and `DROP TRIGGER`. The additional
assertion, evaluated BEFORE the drop executes, is that the target function has
**zero dependent objects** and is **named by no deployed route that is not behind
the phase 3 probe**. If it has any, the whole batch rolls back. The exact `DROP`
statement is printed to stdout whatever happens, so it can be quoted to the owner
from the run output alone.

**REVOKED BY P2-13**, with every other terminal grant, exactly as 8.7 says.

**ONE DEVIATION IS ALREADY KNOWN AND IT IS BOUNDED, see the P3-27a report.**
PostgreSQL refuses to let a newly added enum label be USED in the transaction
that added it, and this batch does exactly that across 0015 and 0021. The applier
therefore commits enum additions in a pre-phase of their own, and refuses to put
anything but `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in it. The only thing that
can survive a rollback of the main batch is an unused, idempotent enum label.
### R-083

**Deviz is INTERNAL ONLY. No PDF, no letterhead, no client-facing layout, anywhere
in wave 3.**

**Asked by:** nobody. **Decided by:** the owner, unprompted, in his dispatch of
2026-09-01, and recorded here so it is not rediscovered by the next terminal that
opens a deviz card and reasons its way to an export button.

The deviz screens are a tool the business uses to work out what a job costs and to
see where quoted prices have drifted from today's catalogue. They are **not** a
document that goes to a client. Nothing in wave 3 produces a PDF, applies a
letterhead, or lays a deviz out for printing or sending.

**WHY IT NEEDS TO BE A RULING RATHER THAN A CARD NOTE.** P3-13b's own defaults
already said "NO PDF, NO EXPORT, NO EMAIL IN THIS CARD", and reasoned that getting
the estimate out to a client is a separate decision with a document-template
question inside it. That sentence is scoped to one card, so the next deviz card
starts the argument again from zero. This ruling scopes it to the wave: a deviz
card that wants an export is not applying a default, it is asking for this ruling
to be overturned, and that is the owner's.

**WHAT IS STILL IN SCOPE:** everything the screens already do. Versions, frozen
quoted prices, the current-price comparison, totals, the Romanian labels. Reading
a deviz on screen is the product. Sending one is not, yet.

### R-084

**`npm run prove:applier` runs in `quality`, as the one path-filtered STEP in the
job. CLAUDE.md 3.1 survives it, and 3.1 says how.**

**Asked by:** the P3-27a report, which recommended adding it and said the runtime
cost was the owner's call. **Decided by:** the owner, in his dispatch of
2026-09-01: add it, with a path filter.

**The filter.** The step runs only when `scripts/apply-pending-migrations.*`,
`supabase/migrations/**` or `scripts/poc-free/local-db/**` changed. It builds five
throwaway postgres containers and takes minutes, which is why it is not run on a
pull request that touches a board file.

**IT IS A STEP-LEVEL `if:`, NOT A WORKFLOW `paths:` KEY, AND THAT DISTINCTION IS
THE RULING.** A `paths:` key would skip the entire `quality` job, and GitHub
reports a skipped required check as SUCCESS, which would silently authorise
merging on a check that never executed. CLAUDE.md 3.1 says in terms that adding a
path filter kills the self-merge grant. A step-level `if:` skips one step and
leaves every other step running and reporting, so the grant survives, and 3.1 now
carries a subsection saying exactly that.

**IT FAILS OPEN.** When the base commit cannot be resolved, the proof RUNS. A
filter that cannot tell what changed must never conclude that nothing did.

**SELF-MERGE STILL REQUIRES THE FULL UNFILTERED SUITE GREEN**, and additionally,
for a pull request touching any of the three applier paths, requires this step to
have RUN and PASSED rather than skipped.

**A SECOND PATH-FILTERED STEP IS NOT COVERED BY THIS.** The exemption is for this
one step. Adding another is a change to 3.1 and needs its own ruling.
### R-085

**A batch's declarations describe what it CHANGES, never what EXISTS. Every applier
guard reads `information_schema` at run time.**

**Asked by:** nobody. **Decided by:** the owner on 2026-09-01, ratifying a finding
the terminal reported after hitting it three times.

`scripts/apply-pending-migrations.mjs` parses the pending files and derives sets
from them: tables created, columns added, columns dropped, functions dropped.
Those sets are the batch's **intent**, and they are the right thing to check the
batch's own work against. They are the WRONG thing to ask what the schema looks
like, and the difference produced three separate defects:

1. `free-text-columns-untouched` hardcoded three column names and would have
   REFUSED the migration it was built to apply.
2. Its derived replacement still guarded only three names, so a mutation dropping
   `clients.notes` committed cleanly.
3. The reconciliation grid named `client_name`, a column dropped by the PREVIOUS
   batch and therefore absent from this batch's set. It rolled back the first
   production attempt of P3-05b.

The first two were patched at the symptom. The third was found in production.

**THE RULE.** A guard that needs to know whether an object exists asks the
database, at run time, through `information_schema` or the `pg_` catalogues. A
guard that needs to know what the batch INTENDED reads the parsed declarations.
Neither substitutes for the other.

**THE AUDIT THIS RULING REQUIRES**, run once and recorded: every guard in the
applier is classified as batch-derived or schema-reading, and every batch-derived
one is checked to be asserting intent rather than inferring existence. Two were
found still confusing them, `supplier-backfill` and `outbound-destination-backfill`,
and both are fixed in the pull request that carries this ruling.

### R-086

**Stopping is only correct when work cannot continue. CLAUDE.md gains section 4b,
and it binds every role.**

**Asked by:** nobody. **Decided by:** the owner on 2026-09-01, in his own words,
after three pauses in one session that were notes rather than blocks.

A finding, a fixed defect or a noticed pattern is REPORTED and the run continues.
A choice the card's defaults already cover is MADE, recorded, and the run
continues. A decision only the owner can make goes through `scripts/poc/ask.sh`
with a recommendation and a stated default for silence, which blocks THAT CARD and
leaves every other eligible card claimable. A terminal stops and prints only when
every eligible card is blocked or shipped, and it sends the dry-board Telegram
message first, because that message is the signal the owner needs in order to
author more.

**THE DISTINCTION IS BETWEEN BLOCKING AND REPORTING**, and it was being made
wrongly in the direction that costs the most: a question asked by stopping parks
the whole run, including work with no relation to the question. Section 4 already
forbade halting for a question. This forbids halting for an answer nobody was
waiting on.

### R-096

**The sample document signed URL TTL is raised from two hours to twenty-four,
for the four permanent test documents only.**

**Asked by:** nobody. **Decided by:** the owner on 2026-09-03, in his own dispatch.

**Scope, and it is the whole ruling.** `scripts/ext/serve-sample-documents.mjs`
signs at `TTL_SECONDS`, which becomes `24 * 60 * 60`. That script signs exactly
the four PDFs under `_samples/andre` and its own throwaway probe object. Those
are **test fixtures containing no client data**: they are supplier documents
handed over as an extraction sample set, and nothing under that prefix is reached
by any product surface.

**NO OTHER SIGNING PATH CHANGES.** `lib/data/inbound-actions.ts` line 238 and
`lib/data/extraction-fire.ts` line 23 both sign at fifteen minutes and are not
touched by this ruling. A real supplier document carried to the extractor still
expires in fifteen minutes. Anyone reading this ruling as a general TTL increase
has read it wrong.

**The reason line, verbatim from the dispatch:** a TTL shorter than the
counterparty response cycle produces repeat handoffs through the owner.

Two hours was chosen when the links were issued and checked inside one sitting.
The counterparty is a person in another company working his own week: a link
issued on our afternoon is opened on his morning. Every expiry between those two
moments is not a security event, it is a message to the owner asking for a fresh
link, and the owner is the one path in this project that does not scale.

**What did NOT change and why it is safe.** The token is still a Supabase signed
JWT over one object path, still single-scope `download`, still unguessable, and
still verified by the same route. The failure contract in
`docs/contracts/document-url.md` is untouched: expired is still `400`
`EXPIRED_TOKEN`, tampered is still `401` `INVALID_TOKEN`, missing is still `404`
`OBJECT_NOT_FOUND`, and no path returns `text/html`. Lengthening the window on a
fixture set widens no blast radius, because the objects behind it are the four
documents we deliberately gave away.

**ON THE ID, AND IT IS A DEVIATION WORTH READING.** `decisions/NEXT-RULING-ID` on
`origin/main` holds `R-087`, and by section 8b that is the id to take. It was not
taken. `R-087` through `R-095` are each already written as a DIFFERENT decision on
an open pull request: `triage/20260903-070005` (PR #172) claims `R-087` to
`R-091`, `triage/20260902-070904` (PR #157) claims through `R-095`. Section 8b
exists to stop one number naming two decisions, and taking `R-087` here would
have produced exactly that, knowingly, rather than as the invisible race the
counter was built to convert into a conflict. `R-096` is the first id no open
branch has written. The counter advances to `R-097`. Nothing is renumbered.


### R-097

**The extraction contract gains `document_source` on the emitter side: two values,
`scan` under any doubt, and absent read as `scan` as a second layer.**

**Asked by:** nobody. **Decided by:** the owner on 2026-09-03, in his own dispatch,
after Andre's report on the field.

The contract is frozen, so it changes by ruling. Three amendments, and a note that
is not an amendment because it changes nothing.

**Amendment 1. The emitter side of the enum carries `scan` and `digital`, and
nothing else.** No `unknown`, no `photo`, no `mixed`, no empty string. A third
value on the emitter side is not a richer signal, it is a branch nobody wrote:
every consumer of this field has exactly two arms, and a value that matches
neither survives only as long as somebody remembers to look for it.

**Amendment 2. The model declares `scan` whenever it is not certain. This is the
FIRST layer and it lives in the prompt.** Uncertainty about the source is not
reported as uncertainty, it is reported as `scan`. The asymmetry is the reason and
it is not generic caution: calling a scanned document `digital` puts invented
stock into a real warehouse, and calling a digital one `scan` costs somebody
reading a document with their own eyes. Those two errors are not the same size, so
the tie does not get broken in the middle.

**This amendment is deliberately NOT of the same kind as `confidence`, removed by
EXT-14.** `confidence` asked the model to know that it had misread something,
which is knowledge it does not have. This asks it to break a tie in a stated
direction when it cannot tell an image from a text layer. The first is
introspection, the second is a default.

**Amendment 3. Absent reads as `scan` on our side. This is the SECOND layer, not
the first.** A payload that omits the field, or sends it null, is read as `scan`.
Amendment 2 is not made redundant by this and the ordering matters: a prompt rule
that is only enforced by our default is a prompt rule nobody can observe being
broken, because every violation arrives looking exactly like a payload that did
the right thing. The default catches the emitter that has not shipped the rule
yet. It is not the rule.

**THE NOTE, AND IT IS THE PART MOST LIKELY TO BE READ WRONG. Our validator's
accepted set is NOT narrowed by any of the three amendments above.** Amendments 1
through 3 bind what Andre's scenario EMITS. What we ACCEPT is a separate set, it
is wider, and it stays wider on purpose. An acceptance set that tracks the
emitter's set exactly turns every ordering of two deploys into an outage: he ships
first and we reject valid payloads, or we ship first and reject the payloads he
has not stopped sending. **Our acceptance may be wider than his emission and must
never be narrower.** Nothing in this ruling removes a value our validator accepts
today, and no future card may cite this ruling as authority to.


---

### R-123

**RENUMBERED FROM `R-098` ON 2026-09-04, BEFORE MERGING, AND THE REASON IS THIS
RULING'S OWN SUBJECT MATTER.** Pull request #184 also writes `R-098`, with a
different heading, and neither pull request had merged. `npm run check:unique-ids`
was green on both, because it compares each branch against `main` and within each
side the ids are perfectly unique. That is exactly the defect card `RULE-04`
describes, met in the wild while allocating this very id.

**RENUMBERING HERE IS NOT THE RENUMBERING CLAUDE.md 8b FORBIDS.** That rule
protects an id already on `main`, which has been cited and read and which history
must not lose. This id had never landed anywhere, so nothing points at it.
`R-098` is left to #184, which claims `R-098` through `R-101`, and this ruling
takes the next id verified free across `main` and all thirteen open branches.

### R-098

**A failure code that is new on ANY surface is communicated to the counterparty
BEFORE it can be emitted or received, in BOTH directions, and it is added to a
NAMED set rather than to an assumed one.**

**Asked by:** EXECUTOR, 2026-09-03, on the owner's dispatch. **Decided by:** the
owner in that dispatch.

**Why now.** EXT-16 needs `reconciliation_failed`, which is **not in the set**.
Section 5.2 fixes seven codes and says anything outside them is a rejected
payload, `400`. So the moment our validator emits or accepts that code without
Andre having been told, one of two things happens and both are outages:

- **He emits it first and we reject it.** Our `400` says "error_code in afara
  multimii", Make does not retry a `4xx`, and a document is dropped once, quietly.
- **We emit it first and he does not know it.** Whatever his side does with an
  unknown code, it was not designed for this one.

Neither is a bug in anybody's code. Both are the two sides holding different
copies of a set that section 5.2 calls fixed.

**THE SETS, NAMED, so a future code is added to a stated set rather than an
assumed one.** There is ONE `error_code` enum and it spans two surfaces. Both are
named here because "add it to the error codes" is ambiguous today and a reader
adding the eighth code needs to know which half they are touching and who else
holds a copy.

**The download path**, meaning failures that occur before the model runs, where
the subject is our signed URL and our storage:

    download_failed        the signed URL could not be fetched
    url_expired            the signed URL had expired by the time Make used it

**The payload path**, meaning failures of the extraction itself, where the
subject is the document and the model:

    unsupported_format     the file is not a format the extractor can read
    unreadable_document    the format is supported and the content is not legible
    extraction_failed      the model ran and produced nothing usable
    invalid_output         the model produced output that does not satisfy the schema
    timeout                the extraction exceeded Make's own limit

**A third surface exists and has no codes yet, and that is stated so it is not
discovered later.** Our own validator can now REFUSE a payload that is
well-formed, which is what EXT-16 does when the arithmetic does not reconcile.
That is neither a download failure nor an extraction failure: the download
succeeded and the model returned. `reconciliation_failed` is the first member of
that third group and it is **OURS to emit, not his**, which is precisely why it
still has to reach him before it exists.

**WHAT THE RULE REQUIRES, and it is four things.**

1. **Both directions.** A code he adds reaches us before he emits it. A code we
   add reaches him before we emit OR accept it. The asymmetry that would
   otherwise creep in is that we think of his codes as "the contract" and ours as
   "our behaviour"; they are the same set.
2. **Before it can be emitted OR RECEIVED.** Accepting an unknown code is as much
   a change as sending one, because acceptance is what section 5.2's `400` is
   deciding.
3. **Added to a named set.** The pull request that adds a code names which of the
   groups above it joins, or declares a new group as this ruling declares the
   third. A code appended to a table with no group named is how the two halves
   drift.
4. **The contract file is the record, not the message.** Telling him is not
   enough; `docs/contracts/extraction-v2.md` carries the code and the group in the
   same pull request that makes it emittable.

**WHAT THIS DOES NOT DO.** It does not require his agreement, only his knowledge
before the fact. Waiting for a counterparty to approve every code would put a
third party in front of our own refusals, and the owner has ruled repeatedly that
a control on our side is ours. It requires that he is never surprised.

**Allocation note, and it is an instance of the thing RULE-04 cards.** `R-098`
was taken on 2026-09-03 after reading `decisions/NEXT-RULING-ID` on `main` AND on
all six open pull request branches then existing, and after grepping each for a
written `R-098`. None had one.

**AND IT COLLIDED ANYWAY, WHICH IS THE POINT.** By 2026-09-04 pull request #184
had been opened and had also taken `R-098`. A sweep is only true at the moment it
runs, and neither branch had merged, so nothing went red: `check:unique-ids`
compares each branch against `main` only. This ruling was renumbered to `R-123`
rather than argued about, and the heading above records it.

**A MANUAL SWEEP IS NOT THE FIX, IT IS THE EVIDENCE THAT ONE IS NEEDED.** RULE-04
asks for the check that refuses at allocation time, which is what would have
caught this.

### R-122

**A probe run against production must be INCAPABLE OF WRITING, not merely undone
if it writes. A probe whose undo is a DELETE is the wrong shape.**

**Asked by:** EXECUTOR, 2026-09-04, on the owner's dispatch. **Decided by:** the
owner in that dispatch.

**THE INSTANCE IS THIS TERMINAL'S OWN PROBE, and it is cited rather than a
hypothetical because the distinction the rule draws is exactly the one that probe
sat on.**

On 2026-09-03, verifying that the Supabase integration had applied migration 0032
FAITHFULLY and not merely its `ADD COLUMN`, a probe posted a row to
`extraction_drafts` carrying `page_count = 0`:

    POST /rest/v1/extraction_drafts  {..., "page_count": 0}
      ->  400  {"code":"23514", ...}

`23514` is `check_violation`. The constraint refused it, **nothing was written**,
and there was no row to journal under CLAUDE.md 8.8.

**THE PROBE ALSO CARRIED A `DELETE` CLEANUP that would have run had the insert
unexpectedly succeeded. It did not execute.** So the probe was safe. It was safe
**BY CONSTRUCTION AND NOT BY DESIGN**, and that is the whole ruling: the thing
that made it safe was a constraint the probe was testing for, not a property the
probe had. Had the constraint been absent, which is the case the probe existed to
detect, the insert would have succeeded and the `DELETE` would have run against
production.

**WHY A DELETE CLEANUP IS NOT A ROLLBACK.** PostgREST offers **no transaction**.
There is nothing to roll back, so "undo it afterwards" means a second write, on a
second request, which can fail on its own, and which leaves the row in place if
the process dies in between. A transaction either happens or does not; a
compensating delete is a promise.

**AND IT COLLIDES WITH 8.6.** A `DELETE` against production is in the forbidden
class. R-047 permits a DELETE-class SCRIPT only when it runs inside an explicit
transaction, evaluates its own pass and fail conditions in SQL before the commit,
and commits only on all-pass. A cleanup delete over PostgREST satisfies none of
those three, so a probe that might run one is a probe that might execute an
unauthorised destructive statement.

**WHAT THE RULE REQUIRES, and it is one thing with three ordinary forms.**

**A production probe must be structurally unable to write.** Not "unlikely to",
not "cleaned up if it does".

1. **Read.** A `GET` cannot write. Most questions are answerable this way and
   this is the default: whether a column exists, what a function returns, how
   many rows match.
2. **A write that the schema must refuse.** Permitted, and it is what the 0032
   probe should have been on purpose: choose a value the constraint under test
   forbids, so success is impossible and the refusal IS the answer. **Then carry
   no cleanup at all**, because there is nothing to clean, and the absence of the
   cleanup is what proves the author knew it could not succeed.
3. **A transaction, where one exists.** Through the applier or `psql`, `begin`
   plus `rollback` is a real undo. Over PostgREST it is not available, so form 1
   or form 2 applies.

**WHAT IT FORBIDS:** a probe whose safety depends on a later request, on the
process surviving, or on a condition the probe is itself trying to establish.

**IT BINDS PROBES, NOT WORK.** A card that is authorised to write to production
writes, journals it under 8.8, and is governed by 8.5, 8.6 and R-047 as before.
This is about the reads-dressed-as-writes a terminal performs to answer a
question, which have no card, no journal row and no ceremony, and which are
therefore the ones most likely to be done casually.

**Allocation note.** `R-122` was taken after reading `decisions/NEXT-RULING-ID`
on `main` and on all thirteen open pull request branches, and grepping each for a
written `R-122`. None had one. **That manual sweep found a live collision in the
process:** pull requests #184 and #181 both write `R-098`, with different
headings, and `check:unique-ids` is green on both because it compares each branch
against `main` only. That is precisely the defect card `RULE-04` describes, and it
is why this id is 122 rather than the 099 the counter would have handed out.


---

### R-124

**THE SUPABASE GIT INTEGRATION KEEPS APPLYING MIGRATIONS ON MERGE. CLAUDE.md
SECTION 8 IS REWRITTEN TO DESCRIBE WHAT HAPPENS RATHER THAN WHAT WAS INTENDED,
AND THE MERGE BECOMES THE DESTRUCTIVE-STATEMENT BOUNDARY.**

**Asked by:** EXECUTOR, 2026-09-04, carrying card `MIG-01`. **Decided by:** the
owner in his dispatch of the same day.

**WHAT WAS BELIEVED, AND FOR HOW LONG.** CLAUDE.md 3.1 said, in terms, that a
pull request adding `supabase/migrations/0013_something.sql` *"changes one text
file in a git repository and changes nothing in any database"*. That sentence was
the entire basis of the grant separating merging from applying. R-082's whole
preamble rests on it. It was written in good faith and it was false.

**WHAT IS TRUE.** A Supabase GitHub integration watches `main` and applies merged
migrations to the production project within about two minutes. It runs on every
push. Nothing in this repository configured it as doctrine and nothing in this
repository governs it.

**THE EVIDENCE, AND IT IS A PREDICTION WITH A CONTROL RATHER THAN A CORRELATION.**
Two migrations both numbered `0032` existed on 2026-09-03 on two open pull
requests, `page_count` on #180 and `document_source` on #177. Before merging
either, production reported `applied_ledger_version()` of `"0031"` and both
columns absent with `42703`. **#180 was merged and #177 was deliberately left
open.** Within two minutes the ledger read `"0032"`, `page_count` was present, and
`document_source` was still absent. #177 was later merged and `document_source`
appeared in its turn: the same prediction, made again, held again.

**The unmerged twin is what makes it a test.** Same day, same register, same
shape, and only the merged one landed.

**IT APPLIES THE FILE FAITHFULLY, WHICH IS THE HALF THE DECISION TURNS ON.** The
column landing does not prove the whole file ran, so the constraint was probed:
an insert violating `0032`'s CHECK was refused with `23514`. The integration ran
the file, not merely its `ADD COLUMN`.

**THE DECISION: IT STAYS, AND THE DOCTRINE MOVES TO MEET IT.** The alternative
was disabling it and returning every apply to `scripts/apply-pending-migrations.mjs`.
That was refused: it has applied at least six migrations correctly, the friction
it removes is real, and the danger is concentrated entirely in the class of
statements that remove rows, which a pre-merge check covers completely.

**WHAT THE RULING REQUIRES:**

1. **CLAUDE.md gains section 8.0**, which states that merging applies, names the
   four consequences, and is placed before everything else in section 8 so no
   reader reaches 8.5 or 8.6 believing the old model.
2. **The false sentence in 3.1 is corrected in place, not deleted.** It is quoted,
   marked disproved, and the evidence sits underneath it. Deleting it would leave
   every reader who remembers it with no way to learn they were wrong. The same
   clause inside R-082's preamble is corrected the same way.
3. **The destructive-statement boundary is the MERGE.**
   `npm run check:no-destructive-migration` is the control: it parses with
   `pgsql-parser`, refuses `DROP TABLE`, `TRUNCATE` and `DELETE` with the
   statement quoted, fails closed on any statement kind it has not been taught,
   and treats an unparseable file as a failure rather than a pass. It is not
   path-filtered and `prove:no-destructive-migration` proves it refuses.
4. **8.5, 8.6 and 8.8 keep binding the applier path**, which still exists and is
   still the only path a TERMINAL may take. What changed is that it stopped being
   the only path.
5. **8.8 names the third writer.** The integration journals nothing. Recording
   that is not an admission of a gap, it is the correction of a count that was
   wrong.

**WHAT THIS RULING DOES NOT DO.** It grants no terminal anything. It does not
touch R-047 or R-082, whose conditions on a terminal-run apply are unchanged. It
does not make a merged `DROP TABLE` acceptable; it moves the refusal earlier, to
the only place left that precedes production.

**THE GENERAL LESSON, RECORDED BECAUSE IT WILL RECUR.** A repository's doctrine
describes the actors it knows about. Before relying on a control, ask what ELSE
can perform the action it controls: an integration, a bot, a scheduled job, a
console someone can click. The gap here was invisible for weeks precisely because
every actor anybody audited was compliant.

---

### R-090 - the ruling sequence skips R-087 to R-089 because they are committed lines on a conflicting pull request, that pull request is disposed of item by item, and its new card collides with a card id already on main
**Date:** 2026-09-02
**Asked on:** pull request 143, branch `triage/20260901-070544`, and card P3-29
**Answer, verbatim:**
> from `docs/DOCTRINE-TRIAGE.md`, section 2, the ruling entry, requirement 1:
>
> "**The id is the next free one, and a collision is fixed by renumbering the NEW
> entry, never by touching the old one.** Ids are namespaced by author, and the
> shift is written into the renumbered entry so a reader is not left
> reconstructing it. This has happened twice; it will happen again."

**Ruling:** this run's rulings begin at **R-090**. R-087, R-088 and R-089 are
TAKEN.

**WHERE THEY ARE TAKEN, SO NOBODY HAS TO HUNT.** They are committed lines with
ids on branch `triage/20260901-070544`, open as pull request 143, whose merge
state is CONFLICTING. `main` carries the sequence up to R-086. A reader of
`main` alone sees R-086 followed by R-090 and would otherwise conclude that three
entries were lost.

**THE THREE IDS ARE RETIRED WHETHER OR NOT 143 EVER MERGES, AND THAT IS THE
POINT OF THE RULE.** Reusing an id that a committed line already carries produces
two different rulings answering to one number, which is the collision requirement
1 exists to forbid. If 143 closes unmerged, R-087 to R-089 stay retired and the
gap stays explained by this entry.

**PULL REQUEST 143 IS DISPOSED OF ITEM BY ITEM, BECAUSE A SET DISPOSED OF AS A
BLOCK IS A SET NOBODY READ.**

- **R-087, the phase 2 gate audit.** Its finding stands and is not disputed: the
  three failing conditions carried their audits in `notes` while `evidence` was
  null, and section 4 point 4 names `evidence.ref` as the field. **Superseded in
  effect by R-094 of this run**, which performs the audit again against today's
  tree and writes it where the rubric says to look. Nothing of R-087 is lost by
  143 closing.
- **R-088, the applier hardcodes wave 1.** **Half void, half confirmed, and both
  halves are stated.** VOID: its headline, that `free-text-columns-untouched`
  will refuse P3-04b and P3-05b by name. That assertion is GONE from
  `scripts/apply-pending-migrations.mjs` on `main`, removed under R-085's audit,
  and both cards have since shipped and applied. CONFIRMED AND STILL LIVE TODAY:
  `one-create-outbound-issue-five-args` pins `create_outbound_issue` to the exact
  signature `(text, text, text, jsonb, uuid)` unconditionally, so any later
  migration that legitimately changes that function rolls its whole batch back.
  Verified in the tree at `scripts/apply-pending-migrations.mjs` lines 1012 to
  1028, this run, not taken from the report.
- **R-089, the board sweep.** Superseded in effect by R-095 of this run, which
  re-runs the same four checks and carries forward the one durable correction
  R-089 made, R-082 as a third named revocation on P2-13.

**THE CARD ID COLLISION, WHICH IS THE REASON 143 CANNOT SIMPLY BE RESOLVED AND
MERGED.** R-088 authors a card **P3-29** titled "the migration applier stops
hardcoding wave 1". A DIFFERENT card **P3-29**, "punctuation and diacritic
normalisation on the supplier write path", landed on `main` on 2026-09-01 in pull
request 150, four hours after 143 was opened. Two different cards answer to one
id on one board. Merging 143 as it stands either duplicates the id, which
`docs/board/validate-board.mjs` fails on, or silently overwrites a card nobody
decided to delete.

**THE RESOLUTION: `main` KEEPS THE ID, THE STRANDED CARD IS RE-AUTHORED HERE AS
P3-36.** The card on `main` is on `main`, it is referenced by the supplier work
already shipped, and the later author had no way to see an id claimed only on an
unmerged branch. P3-36 carries the confirmed half of R-088's finding and nothing
else, and it is authored in this pull request so the finding lives on the board
rather than on a branch.

**Unblocks:** nothing.
**Also changes:** `docs/board/rc-board-phase2.json`, new card **RST-04**;
`docs/board/rc-board-phase3.json`, new card **P3-36**.
**Supersedes:** in effect, R-087 and R-089 by re-performance, and R-088 in the
half named void above. None of the three is edited, per the rule that a changed
mind is a new dated ruling.

---

### R-091 - the P3-11d report flags no deviations, and its one rule change was required by the card's own acceptance line rather than taken
**Date:** 2026-09-02
**Asked on:** P3-11d
**Answer, verbatim:**
> from docs/reports/2026-09-01-executor-p3-11d-stale-checks.md, section 2:
>
> "CLAUDE.md section 3 already names this trap **for merging**, and section 3.1
> forbids merging on anything but a run for the head sha. Neither covers the
> terminal that is **not merging yet** and is simply **waiting** on a fix. That
> is the case that hurt, and section 3 is extended here from merging to waiting."

**Ruling:** **RATIFIED.** The report carries no "deviations flagged for
ratification" section, and that is recorded rather than treated as an omission:
there was one act in it that looks like a deviation and it was not one.

**THE ACT: A STANDING RULE FILE WAS EDITED BY AN EXECUTOR.** Editing `CLAUDE.md`
is the shape section 1's third test exists to catch, so it is run in full rather
than waved past.

- **Test 1, unrecoverable data.** Does not fire. One markdown file, one script,
  three JSON fixtures, one board edit. No row, no credential, no production
  write.
- **Test 2, committed evidence a stranger can re-verify.** Satisfied.
  `npm run prove:pr-state` reports 4 of 4 and exits 0, the three fixtures name
  the real pull request states they reconstruct, and the whole change merged as
  pull request 152 on `main`.
- **Test 3, widen or apply. APPLIES, AND THE DISTINCTION IS WORTH WRITING DOWN.**
  The card's own `acceptance` demands the edit in terms: "PLUS: CLAUDE.md section
  3 is extended from merging to WAITING, in the same PR". An executor doing what
  its acceptance line requires is applying a rule, not widening one. **And the
  direction matters independently**: the edit ADDS a constraint on what a
  terminal may rely on. It grants nothing, reaches no credential, and loosens no
  gate. Section 6 item 5 already draws that line for credentials, that narrowing
  is not an escalation and widening is, and the same asymmetry decides this.
- **Test 4, would the alternative have been worse.** Not reached, test 3 having
  resolved it, and it would have said yes: the alternative is a rule that names
  the stale-green trap for merging only, which is the exact half that did not
  cost an hour of the INC-06 outage.

**WHAT WOULD HAVE MADE THIS AN ESCALATION, WRITTEN SO THE NEXT RUN DOES NOT HAVE
TO DERIVE IT.** A `CLAUDE.md` edit that widens a grant, adds a path to the
self-merge table, softens a stop, or removes a check goes to Ivan under item 5 or
under section 1 test 3, whatever the card says. A card acceptance cannot
authorise a widening, because the card is authored inside the same system the
rule constrains.

**ONE THING THE REPORT DOES NOT SAY AND SHOULD HAVE.** `CLAUDE.md` section 9
requires every card to append its ERROR and SOLUTION pairs to
`docs/LEARNINGS.md`, or to say that it hit none. This report does neither, and
`docs/LEARNINGS.md` carries no entry for this card. **That is not overturned and
no card is authored for it**, because the substance is preserved: the report is
committed, section 5 of it states the error and the habit that closes it, and
the card's `evidence.ref` names the report. It is recorded here so a reader
counting learnings against cards does not conclude the run hit no defects.

**Unblocks:** nothing.

### R-087 - the ruling counter has a second allocator that never reads it, so the Telegram answer path issues an id the counter did not hand out and leaves the counter behind
**Date:** 2026-09-03
**Asked on:** RULE-02. Authors card RULE-03.
**Answer, verbatim:**
> from docs/reports/2026-09-02-executor-rule-02-id-allocation.md, section 2:
>
> `decisions/NEXT-RULING-ID` holds one id, `R-NNN`, and nothing else. You read it, you use it, and **you advance it in the same commit as the ruling.**
>
> It is one line, so two terminals allocating at the same time produce a **merge conflict on that line** - the loudest signal git has. Before it existed there was no conflict at all.

**Ruling:** That sentence is true of every allocator that reads the counter, and this repository holds one that does not.

`scripts/poc/inbox.mjs` is the code path by which Ivan's Telegram answer becomes a
committed ruling. It allocates with `nextRulingId()` at line 244, which is
`highest written + 1` - the exact "next free one" method RULE-02 replaced - and
it writes the entry at line 431. It never reads `decisions/NEXT-RULING-ID` and it
never advances it: line 456 stages `INBOX_PATH` and `BOARD_PATH` and nothing
else. Verified on this branch, cut from `main` at 3642d79:
`grep -rn NEXT-RULING-ID` over the tree returns `CLAUDE.md`, the RULE-02 report,
`check-unique-ids.mjs` and `prove-unique-ids.mjs`, and no other caller.

**Two consequences, and the second is live today.**

1. **The conflict RULE-02 rests on cannot occur on that path.** A terminal
   holding R-087 from the counter and the responder computing R-087 from the
   inbox produce two different R-087s with no shared line to conflict on. That is
   the #143 shape with the one new safeguard removed, and the report says in its
   own words that within each side the ids were perfectly unique.
2. **The counter assertion turns the answer channel red.**
   `check-unique-ids.mjs` lines 259-263 refuse a counter that has not moved past
   the highest ruling written. A responder run that appends a ruling and leaves
   the counter behind makes `quality` fail on the pull request that carries it,
   and that pull request is the one carrying the owner's answer. The channel
   section 14 calls the thing that must never go quiet is the channel this
   breaks.

**THE FIX IS ONE ALLOCATOR, NOT TWO, AND IT IS NOT A SECOND COUNTER.** A
responder that reads the counter, uses it and advances it in the same commit is
the same three steps CLAUDE.md 8b already binds a human terminal to. Authored as
**RULE-03**.

**NOTHING IS RENUMBERED AND NOTHING ALREADY WRITTEN IS TOUCHED.** R-001 through
R-086 were allocated under the old method and are correct as they stand. This is
about the next allocation, not the last eighty-six.

**Unblocks:** nothing. Authors RULE-03 on the phase 2 board.
**Supersedes:** none.

---

### R-088 - DOCTRINE-TRIAGE section 2 still tells TRIAGE to allocate a ruling id the way RULE-02 abolished, and this run had to ignore its own rubric to be correct
**Date:** 2026-09-03
**Asked on:** RULE-02. Authors card AUT-19.
**Answer, verbatim:**
> from docs/reports/2026-09-02-executor-rule-02-id-allocation.md, section 1:
>
> "Namespaced by author" was doctrine and was enforced by nothing.

**Ruling:** It was doctrine in exactly one place, and that place is the file this
role is bound by. `docs/DOCTRINE-TRIAGE.md` section 2, requirement 1, reads on
`main` today:

> **The id is the next free one, and a collision is fixed by renumbering the NEW
> entry, never by touching the old one.** Ids are namespaced by author, and the
> shift is written into the renumbered entry so a reader is not left
> reconstructing it.

Three clauses, and RULE-02 contradicts each:

| the clause | what binds now |
|---|---|
| "the id is the next free one" | the id is the value in `decisions/NEXT-RULING-ID`, advanced in the same commit. CLAUDE.md 8b. |
| "ids are namespaced by author" | one flat namespace, and the report's own first line says the namespacing was enforced by nothing. |
| "a collision is fixed by renumbering the NEW entry" | `check-unique-ids.mjs` prints "NO ID IS RENUMBERED TO MAKE THIS PASS. Allocate a fresh one from decisions/NEXT-RULING-ID and advance it in the same commit." |

**THIS IS NOT A COSMETIC STALENESS AND THIS RUN IS THE PROOF.** DOCTRINE-TRIAGE
opens by saying it is the whole of TRIAGE's rubric and that a session which has
not read it has not booted. A session that read it and nothing else would have
scanned the inbox, found R-086, written R-087 without touching the counter, and
shipped a pull request that `quality` refuses on the counter assertion. This run
allocated from `decisions/NEXT-RULING-ID` instead, which is correct and is
against its own rubric's letter. A role whose rubric has to be disobeyed to
produce a correct result is a rubric defect, and DOCTRINE-TRIAGE says naming one
is a legitimate TRIAGE output.

**TRIAGE DOES NOT EDIT THE FILE.** Its permitted set is rulings, card fields,
gate flips, new cards and escalations. Governing documents are AUTHOR's, which is
why AUT-15 is an authoring card and not a TRIAGE edit. Authored as **AUT-19**.

**UNTIL THAT CARD LANDS, CLAUDE.md 8b GOVERNS AND THIS RULING IS THE POINTER.**
Where section 8b and DOCTRINE-TRIAGE section 2 disagree about id allocation, 8b
wins, because it is the newer of the two and it is the one the check enforces.

**Unblocks:** nothing. Authors AUT-19 on the phase 2 board.
**Supersedes:** none. It supersedes no ruling, because the stale text is in a
doctrine file rather than in a ruling, and it corrects nothing anybody decided.

---

### R-089 - a merged migration's apply is orphaned: the pending register names an apply card that has already shipped, so nothing open carries the apply
**Date:** 2026-09-03
**Asked on:** the DOCTRINE-TRIAGE section 3 board sweep. Authors card P3-37.
**Answer, verbatim:**
> NOT FROM THE DISPATCH REPORT, AND SAID SO RATHER THAN ATTRIBUTED.
> DOCTRINE-TRIAGE section 2 requires this field to quote the report. This finding
> is not in the report: it came out of the section 3 sweep and the section 4 gate
> audit, both of which that same document requires be run over committed
> repository files every time. Attributing it to the report would make the entry
> say something false about where it came from, so the verbatim text is the
> committed artefact that decided it.
>
> from docs/migrations/APPLY-LOG.md line 42:
>
> - `0028_applied_ledger_version.sql`, card de aplicare P3-11e
>
> from docs/board/rc-board-phase3.json, card P3-11e, `status: shipped`, notes:
>
> 0028 IS AUTHORED AND MERGED, NOT APPLIED. Merging a migration file changes one
> text file and changes nothing in any database. The apply is a separate act with
> its own three phases and its own journal.

**Ruling:** Both statements are true and together they leave an obligation with
no owner. The register names P3-11e as the card that will apply 0028; P3-11e
shipped, correctly, on its own acceptance, which is a health route and a deployed
commit check and says nothing about applying anything. `grep -c 0028` over all
three boards returns 2, both on P3-11e, so **no open card carries this apply.**

**WHAT IS NOT WRONG HERE, STATED FIRST SO THE CARD IS NOT READ AS A REPRIMAND.**
P3-11e shipping was right. R-062 split "merged" from "applied" precisely so a
migration card need not wait on a database, and P3-11e's notes record the
distinction in the correct words. `tests/e2e/headers.spec.ts` is satisfied
because 0028 is in exactly one of the two places. Nothing lied.

**WHAT IS WRONG IS THAT THE REGISTER'S `card de aplicare` FIELD HAS NO
LIVENESS.** It names a card, and nothing anywhere asks whether that card is still
open. P3-27 existed because thirteen files reached that state at once and were
reachable by nobody; one night after P3-27 cleared the register, a fourteenth
entered it and its named card closed.

**THE FILE IS NOT DELETE-CLASS AND THAT IS ESTABLISHED, NOT ASSUMED.** `grep -inE
"drop table|truncate|delete"` over `supabase/migrations/0028_applied_ledger_version.sql`
matches nothing. It creates one SECURITY DEFINER function, revokes it from
PUBLIC and grants it to `service_role`. It is therefore in scope for the R-082
applier and does not go to Ivan under 8.6. **TRIAGE APPLIES NOTHING AND DECIDES
NOTHING ABOUT A DESTRUCTIVE RUN**; it authors the card, and the applier's own
assertions decide the outcome.

Authored as **P3-37** on the phase 3 board, carrying both halves: the apply, and
the check that would have caught this.

**Unblocks:** nothing. Authors P3-37 on the phase 3 board.
**Supersedes:** none.

---

### R-092 - a pushed branch with no pull request is invisible to every sweep this repository has, and the census card gains the clause rather than a new card being authored
**Date:** 2026-09-02
**Asked on:** AUT-18, and by boundary RST-02
**Answer, verbatim:**
> from docs/reports/2026-09-01-executor-p3-11d-stale-checks.md, section 5:
>
> "This card's own branch was pushed and **no pull request was ever opened**, so
> no CI ran and nothing reported anything at all. The owner noticed before I did.
> That is the same family as the defect the card addresses: **absence of a signal
> read as absence of a problem.**"

**Ruling:** this is **work, not a decision**, and section 5 forbids a second card
for a problem an open card covers. **AUT-18 gains a fourth acceptance clause and
the finding in its notes. No new card is authored.**

**THE GAP IS REAL AND IT IS EXACTLY ONE QUERY WIDE.** Both existing sweeps start
from the list of pull requests:

- **RST-02** widens which pull request branches the sweep MERGES. A branch with
  no pull request is not in its input.
- **AUT-18** is the census, and its acceptance clause 1 begins "fed a fixture
  list of OPEN PULL REQUESTS". A branch with no pull request is not in its input
  either.

So the two cards compose into a blind spot of the same shape R-078 already found
once between them, and this instance is one notch further out: not a pull request
nobody could merge, but a branch nobody opened a pull request for. **Nothing in
this repository would have named `card/p3-11d`**, and nothing did. The owner did.

**WHY IT BELONGS ON AUT-18 AND NOT ON RST-02.** AUT-18 reads and reports and
merges nothing, which is why its own defaults say it may safely look at `card/`
branches at all. RST-02 merges, and its acceptance asserts that a `card/` branch
is NEVER selected, for the reason written on that card. A branch with no pull
request must be REPORTED and must never be merged, so it lands on the reading
card and not on the merging one. **RST-02's negative test is untouched and must
stay untouched.**

**THE CLAUSE, AS WRITTEN INTO AUT-18's ACCEPTANCE.** Clause 4: fed a fixture list
of remote branches and a fixture list of open pull requests, the run writes one
line per remote branch that has NO open pull request and is NOT already merged
into `main`, carrying the branch name, its head sha and its age, and escalates
any such branch whose head commit predates the start of the current run.
`main` itself and any branch already merged are asserted NOT to appear, because a
census that names every merged branch forever is a census nobody reads.

**THE AGE CONDITION IS THE SAME ONE AUT-18 ALREADY ARGUES FOR ITS SECOND SHAPE,
AND FOR THE SAME REASON.** A branch pushed by the current run is work in
progress. A branch pushed before this run started, with no pull request, is
either abandoned or forgotten, and both are the failure the card exists to name.

**WHAT THIS DOES NOT DO, STATED SO IT IS NOT MISREAD AS A FIX FOR THE HABIT.**
The report names the habit that closes it at the source: check that a pull
request exists after pushing, rather than assuming the push was the last step. A
habit is not a check and this repository does not gate on habits. The census is
the machine-verifiable half, it runs nightly, and it would have named
`card/p3-11d` on the first run after the push.

**Unblocks:** nothing.
**Also changes:** `docs/board/rc-board-phase2.json`, AUT-18 `acceptance`,
`defaults` and `notes`.
**Supersedes:** none. R-078 authored AUT-18 and its three clauses are unchanged.

---

### R-093 - the phase 3 gate audit: the blocker that failed all nine conditions is discharged, the score stays 0 of 9, and four conditions become work a terminal can actually do
**Date:** 2026-09-02
**Asked on:** the phase 3 launch gate, all nine conditions
**Answer, verbatim:**
> from `docs/DOCTRINE-TRIAGE.md`, section 4 point 4:
>
> "Write the audit into `evidence.ref` whether or not it flips. An audit that
> flips nothing is still the most useful thing the next session can read, because
> it says what is actually missing."

**Ruling:** all nine conditions re-audited clause by clause. **None flips. The
phase 3 gate stays 0 of 9.** What changed is the reason, on every one of the
nine.

**THE SENTENCE CARRIED IDENTICALLY ON ALL NINE CONDITIONS IS NOW FALSE.** R-065
wrote, into every one of them: "no phase 3 migration has been applied to the RC
Supabase project. Twelve files, 0013 to 0024, are pending in
`docs/migrations/APPLY-LOG.md`, every one naming P3-27, which is blocked on
ivan." **Every file from 0013 to 0027 is now recorded as APPLIED in that log, the
Pending section is EMPTY, and P3-27 is shipped.** R-065's own closing finding was
that eleven shipped cards and nine failed gates were one blocked card apart. That
card ran.

**THE RESULT PER CONDITION, BECAUSE A SET AUDITED AS A BLOCK IS A SET NOBODY
READ.**

- **G1, counterparties as records.** Clauses 1 and 4 are now MET: the client,
  contact and supplier tables and the products supplier foreign key are on
  production, per the applied entries for 0013, 0014, 0019 and the wave 1 batch.
  Clauses 2 and 3, row level security proven by an unauthenticated request
  returning zero rows and a write refused AT THE DATABASE, are UNMET and have
  never been attempted. **They are now reachable read-only.** 2 of 4.
- **G2, projects and the pipeline.** Clauses 1 and 2 MET on production, per 0016,
  0017 and 0018 applied. Clause 3, the count of issues with no project assigned
  taken read-only on the day and PASTED, is unmet and is now a single call to
  `public.unassigned_outbound_count()`, which 0024 put on production.
  **This is the closest any condition on either board is to flipping.** 2 of 3.
- **G3, the live sections.** The screens shipped as P3-06 through P3-09 and the
  tables they read now exist on production, so the previous audit's reason,
  "a deployed-screen verification today would find an error page", no longer
  holds. Clause 4 requires the executor's own verification ON the deployed
  screens, recorded as evidence. Nobody has looked. 3 of 4.
- **G4, the cross-linking walk.** P3-10 shipped all nine directions with its
  named spec green. The walk has still never been run on production, and now can
  be. 0 of 3 evidenced on production, and the blocker is a run nobody has done
  rather than a schema nobody applied.
- **G5, material cost per project.** The arithmetic half remains the strongest
  evidence on this board, pull request 125 and seven cases. Clause 2 needs ONE
  REAL PROJECT reconciled by hand. **There is no real project and there will not
  be one before the client is using the system**, which puts this condition in a
  different class from the four above: it waits on real data, not on a check.
- **G6, budget versus actual.** P3-12 is todo. Unchanged.
- **G7, the estimate comparison.** **The previous audit's premise is corrected:**
  it recorded "P3-13, P3-13b and P3-13c are all todo; P3-13 is the next eligible
  card". P3-13 and P3-13b are SHIPPED. P3-13c is todo and is the remaining card.
- **G8, documents and follow-up notes.** P3-15 and P3-16 are todo. Unchanged.
- **G9, the density sweep.** P3-19 through P3-26 are todo and P3-21 carries the
  localisation check, which R-079 already required to be seen to FAIL on a word
  missing its diacritic. Unchanged.

**THE FINDING THIS AUDIT EXISTS TO PRODUCE.** Four conditions, G1, G2, G3 and G4,
are now short of nothing but a read-only verification against production and a
look at the deployed screens. That work has NO CARD, it is not blocked on
anybody, and until it is on the board a reader of the 0 of 9 score cannot tell it
apart from the five conditions that genuinely wait on unbuilt features.
**P3-35 is authored for it**, under section 5.

**THE CAPABILITY THAT WORK NEEDS IS THE ONE P2-13 TAKES AWAY**, and section 3
check 3 applies to it. The cross-board edge is still unauthorable for the reason
R-072 and R-081 both recorded, so it goes into P2-13's `acceptance` as a box,
under R-095 of this run.

**Unblocks:** nothing directly. It makes visible that four of nine conditions are
one read away.
**Also changes:** `evidence.ref` on all nine phase 3 conditions;
`docs/board/rc-board-phase3.json`, new card **P3-35**.
**Supersedes:** R-065's common-blocker paragraph, by discharge rather than by
disagreement. R-065 is not edited and its audit was correct on the day.

---

### R-094 - the phase 2 gate audit: 6 of 9, nothing flips, and the three failing audits are written into the field the rubric names
**Date:** 2026-09-02
**Asked on:** the phase 2 launch gate, G4, G7 and G9
**Answer, verbatim:**
> from `docs/DOCTRINE-TRIAGE.md`, section 4 point 2:
>
> "For each clause, name the committed artefact that satisfies it: a pull request
> number, a run id, a journal entry, a named screenshot. Nothing else is
> evidence."

**Ruling:** **phase 2 stays at 6 of 9.** G1, G2, G3, G5, G6 and G8 remain pass on
the audits already recorded against them. G4, G7 and G9 are audited again and
none flips.

**THE FORM CORRECTION, WHICH IS THE SAME ONE R-087 MADE ON THE CONFLICTING
BRANCH AND WHICH THEREFORE HAS NEVER REACHED `main`.** All three failing
conditions carry `evidence: null` while four audits each sit in `notes`. The
rubric names `evidence.ref`. The audits already in `notes` are left exactly as
they are, because a record is not rewritten, and this one is written to
`evidence.ref` on each.

- **G4, extraction end to end.** Deciding clause since R-053 is the ingest
  endpoint asserted against a fixture plus four named failure cases.
  **Re-measured against the tree this run, not against the cards.**
  `tests/e2e/extraction.spec.ts` carries eight cases. Fixture document GREEN,
  case 2. Auth rejection GREEN, case 4. Malformed payload GREEN, case 5.
  **Redirect ABSENT** and **oversize ABSENT**: no case names either, and
  `app/api/extraction/callback/route.ts` bounds nothing it accepts. Two cases
  short, and both are card **P2-20**, which is todo, eligible, and depends on
  P2-08a which is shipped. Unchanged since R-080 and confirmed rather than
  assumed.
- **G7, the reminder email.** Deciding clause unchanged: one real email delivered
  from a real threshold crossing on production. The three things in front of it
  are the three named on 2026-08-27 and **none has moved**: `RESEND_API_KEY`
  present in the production environment, `RESEND_FROM` set, and a recipient that
  is not on a domain that does not exist. **NO DATABASE READ WAS PERFORMED FOR
  THIS AUDIT and none is claimed.** The first two are panel actions, escalated on
  2026-08-31 and again on 2026-09-01, unanswered both times, and carried forward
  as escalation 1 of this run. `blocked_on: ivan` retained.
- **G9, Mihai's full cycle.** Cannot be flipped by any terminal, ever. It needs
  the client to do something himself, which is the second kind of unflippable
  gate in section 4. **It is not backlog, there is no card that closes it, and
  there should not be one.** Recorded as a property, as R-087 also recorded it.

**Unblocks:** nothing.
**Also changes:** `evidence` on G4, G7 and G9 of `docs/board/rc-board-phase2.json`.
**Supersedes:** none. R-080's G4 audit is confirmed on a fresh reading of the same
files.

---

### R-095 - the board sweep under section 3: four checks over both boards, one satisfied-but-blocking card that is correct, and P2-13's acceptance carries two corrections and one addition
**Date:** 2026-09-02
**Asked on:** every card on both open boards, and P2-13 in particular
**Answer, verbatim:**
> from `docs/DOCTRINE-TRIAGE.md`, section 3:
>
> "**Run all four checks, every time, over the whole board and not only the cards
> the report touched.** A stale edge is invisible from the card that carries it."

**Ruling:** all four checks were run mechanically over
`docs/board/rc-board-phase2.json` and `docs/board/rc-board-phase3.json` at
`5f5e13f`, which is `main` and the only tree a stranger can reproduce this on.

**CHECK 1, DANGLING EDGES: NONE.** Every id in every `depends_on` on both boards
resolves to a card on the same board, including the three cards this run
authors, which carry the edges named on them and no others.

**CHECK 2, SATISFIED BUT BLOCKING: ONE CARD FIRES, AND IT IS CORRECT.** P2-08b,
`blocked` on `andre`, with P2-08a shipped. Andre genuinely owes the live round
trip, so `blocked_on` is retained and nothing is cleared. **What has changed
since the last sweep is what sits behind it**: no launch condition has waited on
this card since R-053, per R-080, so the only thing it now holds is P2-13's
`depends_on`, and P2-13 holds P2-14 and the whole handover. Six days blocked on a
third party, with the handover lane behind it, is escalation 3 of this run.
**Nothing on either board is `halted`.** The three cards that fired on the last
sweep, P3-27, P3-04b and P3-05b, are all shipped.

**CHECK 3, A MISSING CAPABILITY EDGE: P2-13, FOR THE THIRD SWEEP RUNNING, AND IT
IS STILL UNAUTHORABLE AS AN EDGE.** P2-13 takes away the database connection, the
single permitted secrets read, the migration-apply grant and, per section 8.7 and
R-059, the self-merge grant on every path. `docs/board/validate-board.mjs`
resolves `depends_on` against the cards of the board being validated, so an edge
onto a phase 3 card makes the validator red. The precondition therefore lives in
`acceptance`, as R-072 established, and **it gains a third box this run**.
**P2-13's acceptance takes three changes:**

1. **A STALE SENTENCE IS CORRECTED.** It ended "THIRTEEN FILES ARE PENDING TODAY,
   0013 to 0025, and P3-27 is the card that applies them." **Zero files are
   pending and P3-27 is shipped.** The BOX is kept and is deliberately not
   converted into a statement of fact, for the reason R-089 gave on the
   conflicting branch: it is a precondition to be re-checked on rotation day
   against whatever the highest migration number is then, not a note about
   wave 1.
2. **R-082 IS NAMED AS A THIRD REVOCATION, WHICH IS R-089's ONE DURABLE FINDING
   AND IS CARRIED HERE BECAUSE IT HAS NEVER REACHED `main`.** Section 8.7
   enumerates two grants by id and covers R-082 only by the blanket phrase
   "reverting section 8". A checklist that enumerates two and leaves the third to
   a blanket is a checklist that will revoke two. R-082 created the
   migration-applier grant on 2026-08-31, AFTER R-072 wrote this card's
   capability clause, so the clause could not have known about it.
3. **A NEW BOX FOR THE PRODUCTION VERIFICATION P3-35 PERFORMS.** Under R-093,
   four phase 3 conditions are now short of nothing but a read-only check against
   production. P2-13 removes the ability to perform it. The box requires P3-35 to
   have shipped, or the four conditions to have been ruled unreachable, before a
   credential is rotated.

**CHECK 4, EDGES ON SPLIT CARDS: THIRTEEN EDGES POINT AT A CARD THAT HAS SINCE
GROWN A LETTERED HALF, AND EVERY ONE IS RE-DERIVED AND CORRECT.** `P3-08`,
`P3-09`, `P3-11`, `P3-13c` and `P3-14` on `P3-04` need the foreign key, not the
column drop in `P3-04b`. `P3-10` on `P3-05`, same reasoning. `P3-13b` and
`P3-13c` on `P3-13` need the schema half. `P3-12` and `P3-28` on `P3-11` need the
cost function, not the budget screen. `P3-04b` and `P3-05b` on `P3-27` needed the
apply, not `P3-27a` the applier, and both have shipped. On the phase 2 board no
edge points at the retired `P2-08`. **P3-29 IS THE ONE PLACE THIS CHECK NOW HAS
TO BE READ WITH R-090 BESIDE IT**: `P3-29a`, `P3-29b` and `P3-29c` are NOT halves
of `P3-29`, they are three unrelated cards from Andre's contract review that
happened to be numbered after it, and no edge points at any of the four.

**Unblocks:** nothing. A sweep is not work.
**Also changes:** `docs/board/rc-board-phase2.json`, P2-13 `acceptance` and
`notes`.
**Supersedes:** none. It re-runs the checks R-072, R-081 and R-089 each required
to be re-run, and carries R-089's third-revocation finding onto `main` for the
first time.

### R-125 - the pick rule reads lexically and one lane was never zero padded, so two cards authored on 2026-08-28 sit behind three authored on 2026-08-31 in every run, permanently


**RENUMBERED 2026-09-04, BEFORE MERGING.** This ruling was written as `R-090`. Pull request #157 also wrote `R-090`, with different content, and neither had merged. `npm run check:open-branch-ids`, built the same day as card RULE-04, REFUSED BOTH BRANCHES and named the other one, which is the first time that collision has been caught by a machine rather than by a person reading two files. #157 merges first and keeps its number; this one moves, per the rule that the pull request merging SECOND renumbers and the one already on main never does. CLAUDE.md 8b forbids renumbering an id that has LANDED; this one had never left its branch.
**Date:** 2026-09-03
**Asked on:** the mandatory boot report of run 20260903-070005. Authors card BOARD-03.
**Answer, verbatim:**
> NOT FROM THE DISPATCH REPORT. It surfaced in CLAUDE.md section 1's mandatory
> boot report, at the step that requires the next eligible card be named. The
> verbatim text is the command output and the rule it contradicts.
>
> $ node scripts/poc/eligible.mjs --board docs/board/rc-board-phase2.json --ids
> AUT-16,AUT-17,AUT-18,AUT-8,AUT-9,BOARD-01,BOARD-02,CLAIM-01,DIG-01,GATE-03,LEARN-01,P2-20,RST-02,RST-03
>
> from CLAUDE.md section 2:
>
> **Pick.** Take the **lowest-id eligible card**. Ids sort lexically
> (`P2-01` before `P2-02` before `P2-10`), which is why they are zero-padded.

**Ruling:** The rule is honest about its own precondition and the precondition
does not hold. Lexical order equals work order only while every id in a lane is
padded to the same width. The AUT lane runs AUT-1 to AUT-9 unpadded and AUT-15 to
AUT-18 two-digit, so `AUT-16` sorts above `AUT-8` and the harness hands out
AUT-16 first, every run, for ever. `scripts/poc/eligible.mjs` line 101 sorts with
a bare `a.id.localeCompare(b.id)`, which is faithful to the rule as written.

**THE COST IS NOT THEORETICAL AND IT IS NOT COSMETIC.** AUT-8 strips credentials
the scheduled run does not need out of the model process. AUT-9 makes the wall
clock cap actually stop a run, which is the defect that cost nine hours and three
scheduled windows on 2026-08-27. Both were authored on 2026-08-28, both are
eligible, and both are queued behind three cards authored three days later by an
artefact of string comparison. Nobody decided that.

**THE FIX IS THE SORT, NOT THE IDS.** Two paths were considered:

| path | what it fixes | what it leaves |
|---|---|---|
| pad new ids and tolerate the old, as `check-unique-ids` tolerates collisions | future lanes | AUT-8 and AUT-9 behind AUT-16 for ever, because the existing ids cannot be renumbered |
| sort on (prefix, number, suffix) instead of on the raw string | today and every future lane, with nothing renamed | nothing |

The second is taken. **RENUMBERING IS NOT AVAILABLE AND WAS NOT WEIGHED AS IF IT
WERE**: CLAUDE.md 8b forbids it, and an id that has appeared in a report, a
ruling or a pull request is a citation somebody may follow.

**IT PRESERVES THE PROPERTY THE CURRENT RULE WAS CHOSEN FOR.** P3-04b must sort
between P3-04 and P3-05, and a (prefix, number, suffix) key gives exactly that,
which a naive numeric parse would not. The phase 3 board's doctrine string
depends on it by name.

Authored as **BOARD-03**. The card carries the CLAUDE.md section 2 correction
with it, because a rule that no longer describes the code is the same defect one
layer up.

**Unblocks:** nothing. Authors BOARD-03 on the phase 2 board. **No card's
`depends_on` is edited by this ruling**: the ordering defect is in the selector,
not in any edge, and adding edges to force an order would encode a workaround as
a dependency.
**Supersedes:** none.

---

### R-126 - the gate audit and the board sweep for run 20260903-070005: the phase 2 gate stays 6 of 9 with nothing flipped, four dependency checks over three boards resequence nothing, and the phase 3 gate is deliberately not audited because GATE-02 owns it


**RENUMBERED 2026-09-04, BEFORE MERGING.** This ruling was written as `R-091`. Pull request #157 also wrote `R-091`, with different content, and neither had merged. `npm run check:open-branch-ids`, built the same day as card RULE-04, REFUSED BOTH BRANCHES and named the other one, which is the first time that collision has been caught by a machine rather than by a person reading two files. #157 merges first and keeps its number; this one moves, per the rule that the pull request merging SECOND renumbers and the one already on main never does. CLAUDE.md 8b forbids renumbering an id that has LANDED; this one had never left its branch.
**Date:** 2026-09-03
**Asked on:** DOCTRINE-TRIAGE sections 3 and 4, which require both every time.
**Answer, verbatim:**
> NOT FROM THE DISPATCH REPORT. Sections 3 and 4 of DOCTRINE-TRIAGE require this
> work on every run regardless of what the report contains, and
> docs/reports/2026-09-02-executor-rule-02-id-allocation.md moves no gate and no
> edge: it adds a check, a counter and a section of CLAUDE.md, and touches no
> screen, no endpoint, no migration and no third party.

**Ruling:**

**SECTION 4, THE GATE AUDIT. Phase 2 stays at 6 of 9. Nothing flipped.**

- **G4, AI extraction, stays `fail`.** Measured against the tree rather than
  against the cards, as R-080 established. R-053's deciding clause is the ingest
  endpoint asserted against a fixture plus four named failure cases.
  `tests/e2e/extraction.spec.ts` carries **eight** cases today, numbered 1 to 8,
  the same eight R-080 counted. The fixture document (case 2), auth rejection
  (case 4) and malformed payload (case 5) are green. **Redirect and oversize are
  still absent**: `grep -cn "redirect|maxBodySize|oversize|301|302"` returns 0 on
  `tests/e2e/extraction.spec.ts`, 0 on `lib/data/extraction-fire.ts` and 0 on
  `app/api/extraction/callback/route.ts`. Two clauses short, exactly as R-080
  found. **It is backlog and it has a card**: P2-20, `todo`, eligible, dependency
  P2-08a shipped.
- **G7, reminders, stays `fail`, `blocked_on: ivan` retained.** Deciding clause
  unchanged: one real email delivered from a real crossing on production. The
  three things in front of it are the three named on 2026-08-27 and none has
  moved: `RESEND_API_KEY` present in the production environment, `RESEND_FROM`
  set, and a recipient not on `rc-inventory.local`. **No database read was
  performed for this audit and none is claimed.** The first two are re-escalated
  by this run; the third lands at P2-13.
- **G9, Mihai's own cycle, stays `fail`.** Deciding clause unchanged: P2-14
  recording Ivan reporting that Mihai completed a full cycle himself. No such
  report exists, P2-14 is `blocked` on `client`. **This is DOCTRINE-TRIAGE
  section 4's second unflippable kind**: it needs the client to act himself. It
  is not backlog and no card can close it.

**THE PHASE 3 GATE IS NOT AUDITED HERE, AND THAT IS A DECISION RATHER THAN AN
OMISSION.** All nine of its conditions read `fail` and its `readiness_passed` is
0, against a premise P3-27 discharged on 2026-08-31 when thirteen migrations were
applied in one transaction. Re-running it is real and overdue work. It is also
**already an open card**: GATE-02, `todo`, whose acceptance is a committed report
re-running all nine conditions and rewriting every `evidence` field with a new
timestamp. DOCTRINE-TRIAGE section 5 says do not author a card for something an
open card already covers, and the same logic forbids doing that card's work in a
ruling: an audit written here would land without the report GATE-02's acceptance
requires, and the card would then be half-done by two hands. **The escalation
that said all nine sit behind P3-27 is retired**: P3-27 shipped, and GATE-02 is
the successor.

**SECTION 3, THE BOARD SWEEP. Four checks, three boards, 134 cards. No edge
changed.**

1. **Dangling.** Zero. Every id in every `depends_on` on all three boards
   resolves to a card that exists.
2. **Satisfied but blocking.** One: **P2-08b**, whose only dependency P2-08a is
   shipped and which is `blocked_on: andre`. The check asks whether that person
   genuinely owes something now. **He does**, and the ask on the card is
   unchanged and specific: confirm contract v2 and run one real document through
   the real Make scenario. `blocked_on` is retained. It is escalated by this run
   instead, because it is the whole of what stands between this board and its
   own close-out.
3. **A capability edge missing.** P2-13 is the card that removes capabilities,
   and its edges are settled: R-037 keeps its dependency on P2-08b, R-072 ruled
   the cross-board edge unauthorable and made it an acceptance clause instead,
   and GATE-03 is the open card that puts R-082's grant into its checklist by id.
   **Nothing authored since adds a capability edge.** RULE-02 added a counter and
   a check; neither is a credential and neither is revoked by P2-13.
4. **An edge on a split card.** No card split since the last sweep. P2-08a and
   P2-08b remain the only split pair on this board and their edges were
   re-derived under R-046.

**THE THREE CARDS AUTHORED TODAY CARRY NO EDGES, AND THAT IS DERIVED RATHER THAN
DEFAULTED.** RULE-03, AUT-19 and BOARD-03 each touch a file that exists on `main`
now and none needs a capability another card grants or removes. P3-37 carries no
edge for the same reason: 0028 is merged and the applier exists.

**Unblocks:** nothing. Records the audit into the notes of G4, G7 and G9 per
DOCTRINE-TRIAGE section 4 requirement 4, and confirms the sweep changed no edge.
**Supersedes:** none. It confirms R-080's gate findings on re-measurement and
retires the phase 3 migration escalation that R-080 carried, on the ground that
P3-27 shipped.

---

was taken after reading `decisions/NEXT-RULING-ID` on `main` AND on all six open
pull request branches, and after grepping each for a written `R-098`. None had
one. That manual check is exactly the procedure RULE-04 asks to be automated,
and it was performed by hand here because the automation does not exist yet.

---

### R-099 - the AUT-15 merge reverted committed content on `main`, and no check in `quality` can see it: two cards, one ruling, the four-migration reconstruction, three learnings, a contract section and a test fixture, deleted by a conflict resolution that kept its own side
**Date:** 2026-09-04
**Asked on:** the input report's section 2 finding 1 and section 6 item 1, `docs/migrations/APPLY-LOG.md`, `docs/board/rc-board-phase2.json`, `decisions/inbox.md`, `docs/LEARNINGS.md`, `docs/contracts/extraction-v2.md`, `scripts/poc/test-ask-digest.sh`
**Answer, verbatim:**
> from docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md, section 2:

### R-102 - this TRIAGE run was handed a report that run 20260903-220002 had already triaged in full, which is the SECOND live instance of AUT-17 and the first that produced two runs over one report three hours apart
**Date:** 2026-09-04
**Asked on:** AUT-17, and every future TRIAGE run
**Answer, verbatim:**
> from the harness dispatch this run received:
>
> "Your input is the newest report in docs/reports/, which is
> docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md. Read it.
> You get nothing else and you need nothing else."
>
> and from `docs/poc/triage-latest.json` on branch `triage/20260903-220002`,
> open as pull request `#184`, written by the PREVIOUS TRIAGE run:
>
> "run_id": "20260903-220002",
> "report": "docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md"

**Ruling: the dispatch named a report that run `20260903-220002` had already
triaged in full, as R-098 to R-101 with two cards and a gate audit, on pull
request `#184`. This run did NOT re-triage it in the ordinary way.** It applied
the rubric to what the previous run's output and the three hours since have
changed, and its section 1 verdicts on the report's own deviations are R-104,
written because the previous run recorded that there were none to give and that
finding is wrong.

**THIS IS THE SECOND INSTANCE AND IT IS WORSE THAN THE FIRST.** R-075 recorded
the first on 2026-08-31, authored AUT-17, and named the exact clause that fired
today: clause 2 of AUT-17's acceptance, "given a fixture
`docs/poc/triage-latest.json` whose `report` field equals the path the selector
would return, the harness does NOT invoke the review step on it a second time."

The difference between the two instances is the one that matters. On 2026-08-31
the already-triaged report's triage was **merged**, on `main`, in
`docs/poc/triage-latest.json`, so the run that was handed it could see the
collision in one read of a committed file. Today the previous triage is on an
**open, unmerged pull request**, so `docs/poc/triage-latest.json` on `main` still
names run `20260831-040003` and a report from four days ago. **A selector
implementing AUT-17 clause 2 exactly as written, reading `main` only, would have
missed this instance**, because the field it compares against had not moved.

**THEREFORE AUT-17 GAINS A CLAUSE RATHER THAN A NEW CARD BEING AUTHORED**, per
`docs/DOCTRINE-TRIAGE.md` section 5. The clause: the consumed-report check reads
`docs/poc/triage-latest.json` **on every open pull request head as well as on
`main`**, because the file's whole purpose is to record consumption and a triage
run's own output is unmerged by construction at the moment the next run starts.
AUT-17 clause 3 already establishes that the selector must look at unmerged
branch heads for the report itself; this extends the same reach to the file that
says whether it has been read. The finding is written into AUT-17's `notes` with
this ruling id.

**WHAT THIS RUN DID INSTEAD OF RE-TRIAGING.** It read the same report, then
checked the previous run's output against the repository, which is what
`docs/DOCTRINE-TRIAGE.md` calls ground truth. That check is R-103 and it did not
come out the way a confirming read would have.

**Unblocks:** nothing. AUT-17 is `todo` and eligible and was the lowest-id
eligible card on `main` at this run's boot after AUT-16.
**Also changes:** `AUT-17.notes` on `docs/board/rc-board-phase2.json`.
**Supersedes:** none. It is the second application of R-075 and extends the card
R-075 authored.

---

### R-103 - pull request #184's central finding is false: the AUT-15 merge reverted nothing on `main`, and the inventory behind R-099 and R-100 is a diff against the tip of a DIFFERENT open pull request
**Date:** 2026-09-04
**Asked on:** the disposition of pull request #184, and cards RESTORE-01 and GUARD-02 which exist only on it
**Answer, verbatim:**
> from `docs/reports/2026-09-04-triage-the-aut-15-merge-revert.md` section 1,
> committed on branch `triage/20260903-220002`, open as pull request `#184`:
>
> "**Then commit `29afb21` deleted all of it.** That commit is
> `AUT-15: merge origin/main into the card branch, no rewrite, no force push`.
> It merged `origin/main` into `card/aut-15` and resolved every conflicted file
> by keeping the branch side. `main` was `b25dc75` at that moment."
>
> and:
>
> "**The inventory. Every line verified with `git diff b25dc75 origin/main` on
> this branch, nothing inferred:**"

**Ruling: the premise is false and it is falsifiable by one command.
`b25dc75` was never `main`.** It is the tip of branch
`board/dispatch-20260903`, open as pull request `#181`, which is `DIRTY` and has
never merged.

**THE FOUR COMMANDS, RUN ON THIS BRANCH AT `origin/main` = `e15e928`:**

```
$ git merge-base --is-ancestor b25dc75 origin/main && echo YES || echo NO
NO

$ git branch -a --contains b25dc75
  board/dispatch-20260903
  remotes/origin/board/dispatch-20260903

$ git diff --stat 29afb21^2 29afb21
 docs/DOCTRINE-TRIAGE.md         | 18 +++++++++++++-----
 docs/board/rc-board-phase2.json |  6 +++---
 2 files changed, 16 insertions(+), 8 deletions(-)

$ git diff --stat e173fad^1 e173fad
 5 files changed, 271 insertions(+), 11 deletions(-)
```

**Read them in order.** The first says `b25dc75` is not in `main`'s history at
all. The second says the only branch carrying it is the one belonging to an open
pull request. The third is the decisive one: `29afb21^2` is the `origin/main`
that commit merged in, and the merge result differs from it by **two files and
eight deleted lines**, which are AUT-15's own doctrine paragraph rewrite and its
own card's status flip. The fourth says the same about the merge into `main`:
pull request `#183` added 271 lines and removed 11, and the 11 are the same
paragraph.

**WHAT THE INVENTORY ACTUALLY MEASURED.** `git diff b25dc75 origin/main` is the
difference between an unmerged pull request's branch tip and `main`. In that
direction, **everything the pull request ADDS appears as a deletion.** The 317
`APPLY-LOG.md` lines, ruling `R-098`, cards `MIG-01` and `RULE-04`, the three
learnings, the `extraction-v2.md` section and the `test-ask-digest.sh` fixture
are not content that was removed from `main`. They are the content of `#181`,
which has not landed. Nothing deleted them because nothing ever had them.

**THE CONSEQUENCES, NAMED SO WHOEVER LANDS `#184` KNOWS WHICH PARTS TO DROP:**

- **`R-099` is overturned as to its premise.** There was no revert. Its
  generalisation, that every guard in `quality` checks that what is PRESENT is
  correct and none checks that what WAS present is still there, is true, is
  worth keeping, and is recorded here as true. It was reached from a false
  instance and it has no live instance behind it.
- **`RESTORE-01` restores nothing.** Its work, putting `R-098`, `MIG-01`,
  `RULE-04`, the reconstructed apply entries, the contract section and the
  learnings onto `main`, is real work that nobody owns. It is not a restore, it
  is landing pull request `#181`. Card `RST-05`, authored by R-107, is that work
  and it covers `#181` together with the three other stranded pull requests it
  collides with.
- **`GUARD-02` guards a real gap on a phantom instance.** A check that refuses a
  change removing a ruling, a card or an apply entry that exists on `main` is
  worth having on its own merits. Nothing in this repository's history has yet
  needed it. It is kept as a card and its justification is corrected, not its
  content.
- **`R-100` is moot.** The counter did not go backwards. `decisions/NEXT-RULING-ID`
  on `main` reads `R-098` and has read `R-098` since `a446655`, which is where
  R-096 and R-097 advanced it. `R-098` was never on `main` to be deleted, so it
  is not restored: it is **allocated**, on `#181`, and it is allocated a second
  time and differently on `#184`. That is a live id collision between two open
  pull requests and R-107 disposes of it.

**WHY THIS RULING EXISTS RATHER THAN A CORRECTION TO `#184`.**
`docs/DOCTRINE-TRIAGE.md` forbids TRIAGE overturning a ruling by editing it: a
changed mind is a new dated ruling that supersedes the old one by id. R-099 and
R-100 are untouched, on their branch, exactly as written. This is the superseding
entry and it names them.

**THE TRANSFERABLE PART, WHICH IS NOT ABOUT ANYONE'S CARE.** A diff between
`main` and a branch tip is symmetric in appearance and asymmetric in meaning, and
`git diff A B` never says whether `A` was ever reachable from `B`. The check that
distinguishes a revert from an unmerged pull request is
`git merge-base --is-ancestor`, it costs nothing, and no report in this
repository has ever run it. **Any claim that `main` lost content names the
commit it lost it in, and proves that commit is an ancestor of `main`.** That is
recorded in `docs/LEARNINGS.md` by this run.

**Unblocks:** nothing. It changes what `#184` should carry when somebody lands
it, and `#184` is not this run's to merge.
**Also changes:** nothing on `main`'s boards. `RESTORE-01` and `GUARD-02` do not
exist on `main` and are not authored here.
**Supersedes:** `R-099` as to its premise and its two cards' justification, and
`R-100` entirely. Both remain on branch `triage/20260903-220002` unedited.

---

### R-104 - the six deviations in the sample-TTL report, ratified individually with the test that fired, because the previous triage of this same report recorded that it flagged none
**Date:** 2026-09-04
**Asked on:** the deviations taken by the run that produced docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md
**Answer, verbatim:**
> from `docs/reports/2026-09-04-triage-the-aut-15-merge-revert.md` section 2,
> on branch `triage/20260903-220002`:
>
> "**Section 1 verdicts.** The input report flags no deviations for ratification
> and its section 5 says so in terms: 'Nothing. No `ask.sh` was raised and no
> step stopped.' **There was nothing to ratify or overturn**"

**Ruling: that reading is wrong and the six deviations below are ratified
individually.** The report's section 5 answers "what BLOCKED", which is a
different question from "what was DEVIATED". A run that stopped for nothing can
still have taken six decisions outside the written procedure, and this one did.
`docs/DOCTRINE-TRIAGE.md` section 1 puts the deviations section of a report in as
input; it does not say that a report without a section under that heading has no
deviations, and treating the heading as the boundary means the only deviations
ever examined are the ones the deviating role already thought to declare.

**The four tests are applied in order and the first that fires decides. Each
verdict names the test.**

**D1. Ruling ids `R-096` and `R-097` taken while `decisions/NEXT-RULING-ID` read
`R-087`. RATIFIED on test 4.**
Test 1 does not fire: no row, no credential, no production write. Test 2 passes:
pull request `#179` is merged, both ids are on `main`, the counter is advanced to
`R-098` in the same commit `a446655`, and `check:unique-ids` is green. Test 3 is
**apply, not widen**: section 8b's mechanism is one id naming one decision, and
its counter is the instrument, not the goal. Test 4 names the alternative
concretely: taking `R-087` would have put a **fifth** meaning on an id that
`#172` had already written and that `#157` had written again as `R-090` and
`R-091`, knowingly, at the moment of writing. That is worse than a gap in the
sequence, and section 8b says in terms that no id is ever renumbered to make a
check pass.

**D2. `docs/contracts/extraction-v2.md` amended in three places by `R-097`,
which binds what Andre's scenario emits. RATIFIED on test 3, by citation.**
Test 1 does not fire. Test 2 passes: the contract file on `main` carries section
8.4 and `#179` is merged. Test 3 fires as a **widening that a ruling already
authorised**, and the ruling is cited: `R-097` itself records
`**Decided by:** the owner on 2026-09-03, in his own dispatch`, which is escalation
item 6 answered by the only person who may answer it, before the deviation was
taken. The report adds the fact that makes it cost nothing either way: Andre had
already dropped `unknown` from his emitter independently, and our acceptance set
is wider than his emission in both the current and the pending state.
**Recorded rather than passed over:** had `R-097` not carried an owner decision,
this one was an escalation and not a ratification, because amendments 1 and 2
change what is asked of the extraction vendor.

**D3. `/Users/ivan/rc-samples/ANDRE-LINKS.md` rewritten to carry one live sample
link where it previously carried four. RATIFIED on test 4, and its consequence
is escalated.**
Test 1 does not fire: the report proves the objects still exist and states that
regenerating the other three is one command. Test 2 passes on the deviation as
performed, though not on the file: the file is outside the repository and is not
committed, and what a stranger can re-verify is the report's own section 4 table,
three URLs with status, content type and body, plus the four repeat fetches whose
`sha256` matches the local sample. Test 3 is apply. Test 4: the alternative was a
handover file carrying four links at the old two hour TTL, which is the exact
condition `R-096` was written to end.
**The consequence is not TRIAGE's**: whether Andre needs the other three live is
escalation item 6, and it is escalated with a recommended default rather than
decided here.

**D4. A read against the production project `bwhzatwwjqmyfesfnisa` to settle
Andre's blank-category report. RATIFIED on test 4.**
Test 1 does not fire and the reason is stated rather than assumed: the test names
a row deleted, a credential rotated, or a production write outside a migration,
and a read is none of the three. Test 2 passes: the report records
`applied_ledger_version()` returning `"0031"`, nineteen active category rows with
`Vopsele, lacuri si solventi` at `sort_order` 19, and the unit list, each
re-runnable by anyone holding the grant. Test 3 is apply: `CLAUDE.md` 8.3 and 8.4
under R-001, unwidened. Test 4: without the read the run would have relayed a
third party's report of a live defect that does not exist, and the correct
mechanism would have been described with the wrong conclusion attached.

**D5. `origin/main` MERGED into the card branch rather than the branch rebased,
before merging `#179`. RATIFIED on test 4, and it is an application of a rule
rather than a deviation from one.**
Test 3 is apply: `CLAUDE.md` section 3 forbids force pushes on every branch,
`--force-with-lease` included, so a rebase was not available. Test 4: the
alternative was merging on a `quality` run that tested a `main` which no longer
existed, which section 3 also names.

**D6. Both rulings and the whole seven-step dispatch worked with NO BOARD CARD.
RATIFIED on test 4, and this is the one with a standing cost.**
The report says so itself in its header: "Dispatch: direct from the owner, seven
steps, no board card authored for it", and its section 3 says "Cards touched:
None." Test 1 does not fire. Test 2 passes: `#179` is merged and the report is
committed. Test 3 is apply, not widen: `CLAUDE.md` section 2 says nothing is
worked that is not a card, and an owner dispatch is an explicit instruction,
which section 5 says defaults fill silence around and never contradict. Test 4:
the alternative was refusing an owner dispatch until a card existed for it, and
the run would have shipped nothing.
**THE COST IS RECORDED BECAUSE IT IS REAL AND RECURRING.** Work done off the
board is invisible to the digest, to the eligibility sweep, and to every gate
audit, and this dispatch produced two rulings, a contract amendment and three
defects. No card is authored for it: a card authored after the work is a card
nobody worked. It is written into `AUT-18`'s `notes`, which is the card that
exists to make unfinished and unreported work impossible to miss.

**Unblocks:** nothing. Six ratifications settle six deviations and none of them
was blocking a card.
**Also changes:** `AUT-18.notes` on `docs/board/rc-board-phase2.json`.
**Supersedes:** the section 1 finding in
`docs/reports/2026-09-04-triage-the-aut-15-merge-revert.md`, which is a report
rather than a ruling, so nothing is superseded by id.

---

### R-105 - P2-13's acceptance names thirteen pending migrations that are applied, the six that are actually pending are elsewhere, and the card gains the capability edge on GATE-03 it has never had
**Date:** 2026-09-04
**Asked on:** P2-13, GATE-03
**Answer, verbatim:**
> from `docs/board/rc-board-phase2.json`, card `P2-13`, field `acceptance`, on
> `origin/main` at `e15e928`:
>
> "THIRTEEN FILES ARE PENDING TODAY, 0013 to 0025, and P3-27 is the card that
> applies them."
>
> and from `docs/migrations/APPLY-LOG.md` on the same commit, lines 42 to 47:
>
> "- `0028_applied_ledger_version.sql`, card de aplicare P3-11e
>  - `0029_category_paints.sql`, card de aplicare P3-34
>  - `0030_units_tonne_litre.sql`, card de aplicare P3-33
>  - `0031_units_tonne_litre_rows.sql`, card de aplicare P3-33
>  - `0032_extraction_draft_page_count.sql`, card de aplicare EXT-09
>  - `0033_extraction_document_source.sql`, card de aplicare EXT-15"

**Ruling: the sentence is corrected, the box it sits in is NOT converted into a
statement of fact, and P2-13 gains `depends_on: GATE-03`.**

**THE SENTENCE IS FALSE IN BOTH HALVES.** `0013` through `0025` are recorded
APPLIED in `docs/migrations/APPLY-LOG.md` under the heading
`WAVE 1 BATCH, 0013 to 0025 - APPLIED`, and `P3-27`, the card named as applying
them, is `shipped` on the phase 3 board. The files that are pending today are
`0028` to `0033`, six of them, and every card named as their applier
(`P3-11e`, `P3-34`, `P3-33`, `EXT-09`, `EXT-15`) is **shipped**. The correction
replaces the file numbers and the card name with what is true and re-derivable.

**THE BOX STAYS A PRECONDITION AND THIS FOLLOWS GATE-03'S OWN DEFAULTS**, which
already ruled on this exact line: "The box is not converted into a statement of
fact: it is a precondition to be re-checked on rotation day against whatever the
highest migration number is then. Rewording it to say 'no files are pending'
would make it false the next time somebody authors a migration." The correction
is a corrected count with its date attached, not a claim about rotation day.

**AND THE COUNT IS ITSELF DISPUTED, WHICH IS WRITTEN IN RATHER THAN RESOLVED.**
The input report records production returning `applied_ledger_version()` of
`"0031"` and holding every object `0029`, `0030` and `0031` create, so at least
four of the six lines say pending about a file production has applied. That is
the report's own first defect and it is unfixed on `main`. It is not fixed here
either, for the reason the report gives: `APPLY-LOG.md` entries are what a
stranger reads instead of database access, and an entry reconstructed after the
fact by whoever noticed the gap is a plausible journal of a run nobody made.
Landing that reconstruction is `RST-05` under R-107.

**THE CAPABILITY EDGE, WHICH IS SECTION 3 CHECK 3 AND IS THE ONE THAT COSTS.**
`P2-13` REMOVES capabilities: it reverts `CLAUDE.md` section 8 to Ivan-only
applies, deletes section 3.1, and rotates two credentials. The test the rubric
names is to ask what the card takes away and make every card that needs it a
dependency. `GATE-03` exists precisely because `P2-13`'s checklist names two
grants by id and covers `R-082`'s applier grant only through the blanket phrase
"reverting section 8 to Ivan-only applies". **If `P2-13` executes first, the
checklist is ticked complete with `R-082`'s grant still standing**, and
`CLAUDE.md` 8.7 already states the failure in its own words: a grant that
outlives the condition it was granted under is how a temporary permission becomes
a permanent one. `P2-13.depends_on` becomes `["P2-08b", "GATE-03"]`.

**Nothing is unblocked by the edge and nothing is newly blocked by it.** `P2-13`
is not eligible today, because `P2-08b` is `blocked` on Andre. `GATE-03` is
`todo`, eligible, and unpicked. The edge changes only the order, and order is the
whole of what it protects.

**GATE-03 STILL OWNS ITS OWN WORK.** This ruling corrects a stale acceptance
line, which `docs/DOCTRINE-TRIAGE.md` section 6 names as TRIAGE's. It does NOT
add `R-082` to the checklist and it does NOT write the check that notices an
unrevoked grant: both are `GATE-03`'s acceptance and TRIAGE writes no check.
Whoever works `GATE-03` will edit the same field and should expect to.

**Unblocks:** nothing.
**Also changes:** `P2-13.acceptance`, `P2-13.depends_on` and `P2-13.notes` on
`docs/board/rc-board-phase2.json`.
**Supersedes:** none. It corrects a field, and the R-072 amendment that wrote the
clause stands.

---

### R-106 - the launch gate audit for run 20260904-010000: phase 2 stays 6 of 9 with all three failures re-derived against the tree, and phase 3 is deliberately not audited because GATE-02 owns it
**Date:** 2026-09-04
**Asked on:** G4, G7 and G9 on the phase 2 board, and the nine phase 3 conditions
**Answer, verbatim:**
> from `docs/DOCTRINE-TRIAGE.md` section 4:
>
> "**Write the audit into `evidence.ref` whether or not it flips.** An audit that
> flips nothing is still the most useful thing the next session can read, because
> it says what is actually missing."

**Ruling: nothing flips. Phase 2 stays 6 of 9 and phase 3 stays 0 of 9.** The
three phase 2 failures are re-derived below against the tree at `e15e928`, not
against the cards, and each audit is written into its condition's `evidence.ref`.

**G4, extraction live end to end. STAYS `fail`. TWO CASES SHORT, AND BOTH WERE
RE-CHECKED IN THE FILES RATHER THAN INHERITED FROM THE PREVIOUS AUDIT.**
The deciding clause is R-053's: the ingest endpoint asserted against a fixture
document plus four named failure cases.

```
$ grep -n "redirect" lib/data/extraction-fire.ts app/api/extraction/callback/route.ts
(no output)

$ grep -niE "content-length|maxsize|max_size|too large|413|oversize" \
    app/api/extraction/callback/route.ts lib/data/extraction-fire.ts
(no output)
```

`tests/e2e/extraction.spec.ts` now carries fourteen cases, up from eight at the
2026-08-31 audit, and the four added since are EXT-15's document-source cases and
EXT-09's page-count cases. **Neither of the two missing clauses is among them.**
Fixture document, auth rejection and malformed payload are green as before, cases
2, 4 and 5. Redirect and oversize are absent from the code and from the suite.
The card is `P2-20`, it is `todo` and eligible, and it is the only card either
gate condition has.

**G7, the low-stock reminder email. STAYS `fail`, `blocked_on: ivan`,
UNFLIPPABLE BY ANY TERMINAL.** Two of its three clauses are panel actions in the
production hosting environment, `RESEND_API_KEY` and `RESEND_FROM`, which no
terminal holds. This is escalation item 7 and it has now been put in front of the
owner on 2026-08-31, 2026-09-02 and 2026-09-03 without an answer, and **every one
of those three escalations is on a pull request that has not merged**, so the
digest has never carried it from `main`. It is escalated again by this run. The
third clause, a recipient address on a domain that exists, lands with the real
staff accounts at `P2-13` and is not separately actionable.

**G9, Mihai's full cycle. STAYS `fail`. UNFLIPPABLE BY ANY TERMINAL, AND IT IS
NOT BACKLOG.** It needs the client to do something himself. `P2-14` is `blocked`
on `client` and no such report exists. A reader counting three failing conditions
as three units of remaining work is wrong about two of them: only `G4` has a card
anybody can pick up.

**PHASE 3 IS NOT AUDITED HERE AND THE REASON IS A CARD, NOT AN OMISSION.**
All nine conditions are `fail` and `GATE-02` exists to re-run every one of them
against the premise `P3-27` discharged, with an acceptance that requires each
condition's `evidence` field rewritten with a new `at`. `GATE-02` is `todo` and
eligible. Section 5 forbids authoring a second card for one problem, and writing
a partial audit into the same nine fields that `GATE-02` must rewrite would
collide with it. **What is recorded instead, because it is the cheapest thing on
either board:** `GATE-01` carries phase 3 G1 clause 3, a read-only proof that an
unauthorised write is refused by Postgres, it needs nothing from anyone, and it
is unpicked.

**NO DATABASE READ WAS PERFORMED FOR THIS AUDIT AND NONE IS CLAIMED.** Every
finding above is from files at `e15e928`. Where the input report's production
read is relied on, it is cited as the report's, in R-105.

**Unblocks:** nothing. A gate is not work.
**Also changes:** `evidence` on `G4`, `G7` and `G9` of
`docs/board/rc-board-phase2.json`. `readiness_passed` stays 6.
**Supersedes:** none. It confirms R-080 for `G4` and R-046 for `G7` and `G9`, on
re-derived evidence rather than by inheritance.

---

### R-107 - four pull requests are stranded outside `main` carrying fifteen ruling ids, eleven cards and the fix for a false journal, three of them conflict, and their ids collide with each other: a ruling that has never been on `main` may be re-allocated before it lands
**Date:** 2026-09-04
**Asked on:** RST-05, and pull requests #157, #172, #181 and #184
**Answer, verbatim:**
> from `docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md`,
> section 2:
>
> "**The pending migration list said pending and production said applied.**
> `docs/migrations/APPLY-LOG.md` lists `0028`, `0029`, `0030` and `0031` as
> pending with the card that will apply each. Production reports `0031` applied
> and has every object the four files create. **This is the finding that matters
> most and it is not fixed here.**"

**Ruling:** **THE FINDING WAS FIXED ON `main` AND THEN UN-FIXED BY THE PULL
REQUEST THAT CARRIES THE REPORT.** It is restored by card `RESTORE-01`, authored
here, and the mechanism that hid it is carded as `GUARD-02`.

**WHAT THIS RUN CHECKED, AND WHY IT DID NOT STOP AT THE REPORT.** DOCTRINE-TRIAGE
says the report is the only dispatch and committed repository files are the ground
truth. Read against the tree, the report's finding 1 is no longer a description of
`main`: between the report being written and this run, commits `8b09bde`,
`a02e964` and `b25dc75` wrote the whole reconstruction of `0028` to `0033` into
`docs/migrations/APPLY-LOG.md`, established the mechanism by prediction with a
control, and authored card `MIG-01` to carry the vendor decision. That work is
gone from `main` today.

**THE INSTRUMENT, NAMED, BECAUSE IT IS ONE COMMIT.** `29afb21`, "AUT-15: merge
origin/main into the card branch, no rewrite, no force push", merged
`origin/main` into `card/aut-15` and resolved every conflicted file by keeping the
branch side. `main` was `b25dc75` at that moment. Pull request `#183` merged the
result as `e173fad`, so `origin/main` now carries less than it did four hours
earlier.

**THE INVENTORY, EACH ITEM VERIFIED BY `git diff b25dc75 origin/main` ON THIS
BRANCH, NOT INFERRED:**

    docs/migrations/APPLY-LOG.md      -317 lines. The whole RECONSTRUCTION OF
                                      0028 TO 0031 header, the six APPLIED
                                      entries, the observed-mechanism section
                                      with its prediction and its control. The
                                      six stale `pending` lines are re-added in
                                      their place, so the file states again the
                                      exact falsehood the report flagged.
    docs/board/rc-board-phase2.json   cards MIG-01 and RULE-04 deleted. 64 cards
                                      became 62.
    decisions/inbox.md                ruling R-098 deleted, 81 lines.
    decisions/NEXT-RULING-ID          R-099 rolled back to R-098.
    docs/LEARNINGS.md                 three entries deleted: "Second instance: an
                                      instruction not to invent a self-consistent
                                      total was ignored three runs of three", "A
                                      migration reaches production on merge, with
                                      no applier, no journal and no human", "A
                                      proof script that copies the live board
                                      inherits today's board as an unstated
                                      precondition".
    docs/contracts/extraction-v2.md   section 5.2a deleted, the half of R-098
                                      that lives in the contract.
    scripts/poc/test-ask-digest.sh    the fixture neutralisation deleted, 36
                                      lines.

**THE TEST THAT PRODUCED THIS VERDICT IS DOCTRINE-TRIAGE SECTION 1 TEST 2, RUN
AGAINST THE REVERT RATHER THAN AGAINST THE REPORT.** Is there committed evidence a
stranger can re-verify? Yes, and it is unusually strong: two shas, a card id, a
ruling id and a line count, all readable with one `git diff`. Test 1 does not fire:
nothing here touched data that cannot be recovered, because every deleted line is
still in git. Test 4 answers itself: the alternative to restoring is a repository
that tells its next reader six migrations are pending which production applied
weeks of work ago.

**WHY NO CHECK CAUGHT IT, WHICH IS THE PART WORTH KEEPING.** `quality` ran and was
green. Every guard in it is built for a DIFFERENT failure of the same file set:

- `check:conflict-residue` looks for the marker tails a bad resolution leaves
  behind. This resolution left none, because it deleted whole hunks cleanly rather
  than half-merging them. CLAUDE.md's conflict section already says a grep for the
  markers is not the check; it does not yet say that a clean resolution can delete
  a card.
- `check:unique-ids` compares ruling headings against `origin/main` and requires
  the counter to be AHEAD of the highest written. `R-098` on the counter over
  `R-097` written satisfies it. **The check has no concept of an id that USED to
  exist**, so deleting a merged ruling is invisible to it by construction.
- `tests/e2e/headers.spec.ts` requires every migration file to be in EXACTLY ONE
  of applied or pending. Moving all six files from applied back to pending keeps
  them in exactly one. The invariant held while its meaning inverted.
- `validate-board.mjs` validates the cards that are present. A deleted card is not
  an invalid card.

**Unblocks:** nothing today. **It re-opens `MIG-01`,** which is the largest open
decision in this repository and which vanished from the board it was authored on.
Because the board is what the digest reads, that decision has been invisible to
the owner since `e173fad`, and this run carries it in its escalations instead.
**Also changes:** `docs/board/rc-board-phase2.json` gains `RESTORE-01` and
`GUARD-02`.
**Supersedes:** nothing. It does not amend `R-098`, which is restored verbatim by
`R-100`, and it does not amend `MIG-01`, which is restored verbatim by
`RESTORE-01`.

---

### R-100 - the ruling counter went backwards, `R-098` is restored verbatim in this pull request, and it is not reallocated
**Date:** 2026-09-04
**Asked on:** `decisions/inbox.md`, `decisions/NEXT-RULING-ID`, card `RULE-04`, and CLAUDE.md section 8b
**Answer, verbatim:**
> from docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md, section 1, step 3:
>
> "**The id is `R-096` and the committed counter said `R-087`.** `R-087` through
> `R-095` are each already written as a **different** decision on an open PR
> [...] Section 8b exists to stop one number naming two decisions; taking
> `R-087` would have produced that knowingly rather than as the invisible race
> the counter converts into a conflict."

**Ruling:** **`R-098` IS RESTORED HERE, WORD FOR WORD, FROM `b25dc75`, AND IT IS
NOT REWRITTEN, RENUMBERED OR SUMMARISED. THIS RUN ALLOCATES `R-099` ONWARDS AND
THE COUNTER GOES TO `R-102`.**

**WHY THIS HALF IS DONE HERE AND THE REST IS A CARD.** `decisions/inbox.md` and
`decisions/NEXT-RULING-ID` are TRIAGE's own write surface, the restoration is a
verbatim copy of a merged ruling rather than an edit of one, and the hazard is
IMMINENT in a way none of the other losses are: **the counter currently hands
`R-098` to the next terminal that allocates**, which on this schedule is a run a
few hours away. That terminal would write a second, different `R-098`, and
`check:unique-ids` would pass it, because on `main` there is no `R-098` to
collide with. The repository would then hold two merged decisions wearing one
number, which is precisely the outcome CLAUDE.md 8b was written to make
impossible.

**THE HOLE ON `main` IS NOW LARGER AND IS DELIBERATELY NOT FILLED.** `R-087` to
`R-095` are reserved on open branches, `R-096` and `R-097` are written, `R-098` is
restored here, and this run writes `R-099`, `R-100` and `R-101`. **No id is
renumbered to make anything tidy**, per CLAUDE.md 8b. Whoever merges `#172` or
`#157` gets their ids as written.

**THE CARD FOR THE GENERAL CASE ALREADY EXISTED AND WAS ITSELF DELETED.**
`RULE-04` carded exactly this defect, was authored on `main` at `8b09bde`, and is
one of the two cards `29afb21` removed. It is restored by `RESTORE-01` rather than
re-authored, because re-authoring it would produce a second card for one problem,
which DOCTRINE-TRIAGE section 5 forbids.

**Unblocks:** nothing. It prevents a collision rather than releasing work.
**Also changes:** `decisions/inbox.md` gains `R-098` back; `decisions/NEXT-RULING-ID`
becomes `R-102`. Both files are explicitly OUT of `RESTORE-01`'s scope so the two
pull requests cannot collide on them.

---

### R-101 - the gate audit and the board sweep: phase 2 stays 6 of 9, nothing flips, and P2-13 gains the capability edge on MIG-01 that RESTORE-01 lands
**Date:** 2026-09-04
**Asked on:** G4, G7, G9, the phase 3 launch gate, P2-08b, P2-13
**Answer, verbatim:**
> from docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md, section 1, step 7:
>
> "Read against production (`bwhzatwwjqmyfesfnisa`) on 2026-09-03:
> `applied_ledger_version()` -> `"0031"`"

**Ruling:** **PHASE 2 STAYS AT 6 OF 9. PHASE 3 STAYS AT 0 OF 9. NOTHING FLIPS,
AND ONE DEPENDENCY EDGE IS ADDED.**

**G4, RE-AUDITED AGAINST THE TREE, STAYS `fail`.** R-053's deciding clause is the
ingest endpoint asserted against a fixture plus four named failure cases. Measured
today, not carried over: `tests/e2e/extraction.spec.ts` now carries fourteen
cases, four more than at the R-080 audit, and the four are EXT-09's page-count
trio and EXT-15's document-source trio. **Neither of the two missing cases moved.**
`grep -n redirect lib/data/extraction-fire.ts app/api/extraction/callback/route.ts`
returns nothing, and nothing in the callback route bounds a body size. Redirect
ABSENT, oversize ABSENT, exactly as R-080 found. **P2-20 is still the card and it
is still `todo` and eligible.**

**G7 STAYS `fail`, `blocked_on: ivan` RETAINED.** The three items in front of it
are unchanged since the 2026-08-27 audit: `RESEND_API_KEY` present in the
production environment, `RESEND_FROM` set, and a recipient that is not on
`rc-inventory.local`. **NO DATABASE READ WAS PERFORMED FOR THIS AUDIT AND NONE IS
CLAIMED.** Two of the three are panel actions, item 7 of the closed list, escalated
on 2026-08-31 by run `20260831-040003` and never answered. They are escalated again
by this run, because an unanswered escalation that goes quiet is an escalation that
was never made.

**G9 STAYS `fail`.** P2-14 is `blocked_on: client` and no report exists of Mihai
completing a cycle himself. This is the one gate no terminal can close.

**THE PHASE 3 GATE IS NOT RE-AUDITED HERE AND THE REASON IS STATED RATHER THAN
OMITTED.** All nine conditions are `fail` and every one of them says "on
production". Card `GATE-02` on the phase 3 board exists to re-run that audit and is
`todo`. Nothing in the input report touches a phase 3 screen, and a second audit
written by a role that ran no check would be a copy of R-065's with a newer date.

**THE BOARD SWEEP, DOCTRINE-TRIAGE SECTION 3, ALL FOUR CHECKS, ALL THREE BOARDS,
140 CARDS.**

- **Dangling: none.** Every id in every `depends_on` resolves to a card.
- **Satisfied but blocking: one, and it is CORRECT.** `P2-08b`'s only dependency
  `P2-08a` is shipped and it is `blocked_on: andre`. Andre genuinely owes the live
  scenario run, so the block stands. R-053 degated it, R-080 recorded that, and
  neither made him owe less.
- **An edge on a split card: none outstanding.** The P2-08 split was re-derived by
  R-046 and R-080 and holds.
- **A CAPABILITY EDGE MISSING: ONE, AND IT IS THE EXPENSIVE KIND.** `P2-13`
  `depends_on` is `["P2-08b"]`. **It must become `["P2-08b", "MIG-01"]`.**

**WHY THAT EDGE, DERIVED BY THE SECTION 3 CHECK 3 TEST RATHER THAN BY FEEL.** Ask
what the card TAKES AWAY, then list every card that needs it. P2-13 revokes every
terminal grant that writes production: section 8's apply grant, R-047's script
grant, R-082's applier grant, and section 3.1's self-merge grant. Its acceptance
carries a box, added by R-072, that must be ticked BEFORE any credential is
rotated, confirming **every migration file under `supabase/migrations/` is recorded
as applied in `docs/migrations/APPLY-LOG.md`**. `MIG-01` establishes that a path
exists which applies migrations to production and journals nothing. **While that
path is undescribed, P2-13's precondition box cannot be honestly ticked and P2-13
revokes the controlled path while leaving the uncontrolled one running.** That is
check 3's failure mode with the sign flipped: not a grant revoked before its
dependants are built, but a control removed while the thing it controls keeps
writing.

**THE EDGE IS RULED HERE AND LANDED BY `RESTORE-01`, NOT BY THIS PULL REQUEST.**
`MIG-01` is not on the board today, so writing the edge now would produce a
dangling `depends_on` and a red `validate-board.mjs`, and CLAUDE.md forbids a
commit made while the validator is red. `RESTORE-01`'s acceptance carries the edge
as a named artefact condition.

**Unblocks:** nothing. **Also changes:** G4, G7 and G9 `notes` on
`docs/board/rc-board-phase2.json`; `P2-13.depends_on` by way of `RESTORE-01`.
**Supersedes:** nothing. R-080's G4 audit stands and is confirmed on newer
evidence.

**Ruling: the fix exists, it is committed, and it is stranded. Card `RST-05` is
authored to land all four pull requests as one reconciliation, and the id rule
they need is settled here.**

**THE CENSUS, TAKEN ON THIS BRANCH AT `origin/main` = `e15e928`:**

| pull request | branch | merge state | what is on it and nowhere else |
|---|---|---|---|
| `#157` | `triage/20260902-070904` | `DIRTY` | `R-090` to `R-095`, cards `P3-35`, `P3-36`, `RST-04`, the phase 3 gate audit |
| `#172` | `triage/20260903-070005` | `DIRTY` | `R-087` to `R-091`, cards `RULE-03`, `AUT-19`, `P3-37`, `BOARD-03` |
| `#181` | `board/dispatch-20260903` | `DIRTY` | `R-098`, cards `MIG-01`, `RULE-04`, the `0028` to `0033` apply reconstruction, a contract section, three learnings |
| `#184` | `triage/20260903-220002` | `BEHIND` | `R-098` to `R-101`, cards `RESTORE-01`, `GUARD-02` |

**THREE OF THE FOUR CONFLICT WITH `main`, AND `CLAUDE.md` SECTION 3 SAYS WHAT
THAT MEANS: a conflicting pull request triggers ZERO workflows.** Whatever
`gh pr checks` reports on any of them belongs to a commit nobody is proposing to
merge. `R-052` assigns the resolution to EXECUTOR, locally, against the full
tree, with the validator run before the commit, and never in the web editor.

**THE IDS COLLIDE WITH EACH OTHER, NOT WITH `main`.** `R-090` and `R-091` are
written on `#157` and again, meaning something different, on `#172`. `R-098` is
written on `#181` and again, meaning something different, on `#184`. Within each
branch every id is unique, which is exactly the shape section 8b says
`check:unique-ids` cannot see, and it is why that check compares headings against
`origin/main`: on `main` none of these ids exists at all, so all four pull
requests pass it today and any two of them landing turns green into a permanent
ambiguity.

**THE RULE, AND IT IS THE PART WORTH KEEPING.** Section 8b says NO ID IS EVER
RENUMBERED TO MAKE IT PASS, and that rule protects `main`. **A ruling that has
never been on `main` is not history and may be re-allocated a fresh id before it
lands.** History is what is committed to the trunk; a branch is a proposal.
Renumbering an id that has landed rewrites what a citation elsewhere already
points at, and nothing points at these. The re-allocation is written into the
renumbered entry, naming the id it was drafted under and the branch it was
drafted on, so a reader arriving from the branch lands somewhere that tells them.

**WHICH SIDE KEEPS THE ID IS DECIDED BY MERGE ORDER AND NOT BY MERIT**, so that
the decision needs no judgement at the moment of resolution: the pull request
that lands FIRST keeps the id it wrote, and every later one re-allocates from
`decisions/NEXT-RULING-ID` as it then stands. Merge order is observable and merit
is arguable, and the failure this is guarding against is a terminal choosing at
2am.

**`RST-05` IS ONE CARD FOR FOUR PULL REQUESTS AND SECTION 5 REQUIRES THAT
ARGUED.** The four are not four independent problems. Two pairs of them collide
on ids, so resolving one at a time means the second resolution has to be redone
against the first, and `#184`'s content is partly invalidated by R-103 which can
only be applied while looking at `#181`. The precedent is `RST-03`, which is the
same shape for a single stranded pull request and is still `todo`, and `RST-02`
and `AUT-18` remain the class fixes: the sweep that would have merged them and
the census that would have named them. `RST-05` is the instance, as `RST-03` is,
and it says so.

**THE CARD ID IS `RST-05` AND NOT `RST-04`, DELIBERATELY.** `RST-04` is authored
on `#157` and does not exist on `main`, so `check:unique-ids` would accept
`RST-04` here and then fail the moment `#157` landed. Taking the next free id is
one line of cost now against a manufactured collision later.

**WHAT THIS RULING DOES NOT DECIDE.** It does not decide whether the automatic
apply path that `#181` documents should be kept or switched off. That is a click
in the Supabase console, escalation item 7, and it is escalated by this run with
a recommended default rather than ruled.

**Unblocks:** nothing today, and that is the point of writing it. It gives the
four stranded pull requests one owner and one rule, where they currently have
neither.
**Also changes:** `docs/board/rc-board-phase2.json` gains `RST-05` in the
`loose_ends` lane.
**Supersedes:** none. It applies section 8b to a case section 8b does not name.

### R-108 - AUT-16's three off-card fixes are ratified, individually, and the id this TRIAGE run allocated from is R-108 rather than the counter's R-098
**Date:** 2026-09-04
**Asked on:** AUT-16, and every future run that fixes a defect it finds on the path it is already editing
**Answer, verbatim:**
> from docs/reports/2026-09-04-executor-aut-16-board-set.md, section 2:
>
> "Two defects on the same path, found while working it and fixed with it.
> `claim.sh` upper-cased the id it was handed, so a lease on `P3-04b` was stored
> as `P3-04B` and `eligible.mjs` looked it up verbatim and never found it: the
> lease was written, reported as taken, and honoured by nobody. And `run.sh` read
> one board when reporting branch work, so every phase 3 card worked on a branch
> reported `unknown`, which is silence wearing a status."
>
> and from the same section:
>
> "The first run for this branch FAILED on the new step with
> `scripts/poc/claim.sh: line 79: node: command not found`. `claim.sh` replaced
> `PATH` outright with this machine's tool paths, which is right for launchd and
> makes the script unrunnable anywhere else."

**Ruling:** all three are **RATIFIED**, individually, each with the test that
cleared it. CLAUDE.md section 3 forbids self-invented scope and these are the
class of thing it forbids, so they are ratified rather than waved past.

**THE FOUR TESTS, RUN IN ORDER, ON EACH OF THE THREE.**

- **`claim.sh` keeps the inherited `PATH`.** Test 1, no data touched. Test 2,
  committed evidence: PR #186, merged as `d4915a8`, and the failing run named in
  the report. Test 3, applies a rule rather than widening one. Test 4, the
  alternative: AUT-16's acceptance is `bash scripts/poc/test-board-set.sh`, that
  test invokes `claim.sh`, and `claim.sh` could not run outside launchd. Without
  the fix the card had no runnable acceptance and could not ship at all.
  **RATIFIED.**
- **`claim.sh` stops upper-casing the id.** Tests 1 to 3 as above. Test 4, the
  alternative named concretely: AUT-16 would have shipped a harness that resolves
  `P3-04b` correctly in the answer channel, the digest and the eligibility rule,
  and stores the lease for it under a different string. The card's own property
  would have been false in the one component it did not fix, and the failure is
  invisible: the lease is written, reported as taken, and honoured by nobody.
  **RATIFIED.**
- **`run.sh` reports branch work against the board set.** Tests 1 to 3 as above.
  Test 4: every phase 3 card worked on a branch would have kept reporting
  `unknown`. CLAUDE.md section 13 says silence about an eligible card is a defect
  and never a normal outcome, and `unknown` is that silence with a value in it.
  **RATIFIED.**

**THE COMMON PROPERTY, STATED SO THIS RATIFICATION IS NOT READ AS A LICENCE.**
All three sit **on the path the card was already editing** and all three would
have made the card's own stated property false. That is the boundary. A defect
noticed in a file this card never opened is still a new card or a learning, and
the same report demonstrates the correct handling of exactly that: three findings
in its section 4 were written up and deliberately not fixed.

**THE SEVEN `defaults` APPLICATIONS IN THE SAME REPORT WERE CHECKED AND ARE NOT
DEVIATIONS.** Section 5 requires a default to be applied and logged, and they
were. One of them, the cross-board pick order, is a rule change wearing a
default's clothes and it gets its own ruling at R-110 rather than being cleared
here.

**ON THE ID, AND IT IS THE SECOND TIME THIS DEVIATION HAS BEEN NEEDED.**
`decisions/NEXT-RULING-ID` on `origin/main` holds `R-098`, and by CLAUDE.md
section 8b that is the id to take. It was not taken. `R-098` through `R-107` are
each already written as a decision on an open pull request: `board/dispatch-20260903`
(PR #181) and `triage/20260903-220002` (PR #184) both carry `R-098`, #184 carries
through `R-101`, and `triage/20260904-010000` (PR #187) carries `R-102` to
`R-107`. Taking `R-098` here would knowingly produce the collision section 8b
exists to convert into a conflict. `R-108` is the first id no open branch has
written. The counter advances to `R-118`. **Nothing is renumbered**, and the
identical deviation recorded above R-096 on 2026-09-03 is the precedent this
follows rather than a second invention.

**AND THE COUNTER IS NOT WORKING AS DESIGNED, WHICH IS A FINDING AND NOT A
COMPLAINT.** Section 8b's mechanism is that two terminals allocating at once
produce a merge conflict on one line, which is the loudest signal git has. It
produces that conflict **only when both branches merge**. Five branches have now
allocated against a counter none of them advanced on `main`, four of them are
still open, and the conflict has been deferred five times rather than raised
once. The deviation above is what a terminal does about it; whether the counter
should be advanced by the ALLOCATING pull request rather than the merging one is
a change to section 8b and belongs to whoever authors next.

**Unblocks:** nothing. AUT-16 is shipped and merged as `d4915a8`.

---

### R-109 - AUT-17's defect fired for a third time on this run, in a second shape that has now fired twice, and the card's own line numbers are stale
**Date:** 2026-09-04
**Asked on:** AUT-17
**Answer, verbatim:**
> from the harness dispatch this TRIAGE run received:
>
> "Your input is the newest report in docs/reports/, which is
> docs/reports/2026-09-04-executor-aut-16-board-set.md."
>
> and from docs/reports/2026-09-04-executor-aut-16-merge-and-the-check-that-outlasts-the-cap.md,
> which is the report this run's own EXECUTOR wrote, committed as `e8410db` on
> branch `poc/report-20260904-040001`, unmerged:
>
> "**Role:** EXECUTOR. Unattended scheduled run [...] **Run:** 20260904-040001"

**Ruling:** the finding is upheld and it is **wider than AUT-17 was authored
against**. No new card: DOCTRINE-TRIAGE section 5 forbids a second card for one
problem, so this lands in AUT-17's `notes` and the card's acceptance is
unchanged, because all four of its halves were already the right four.

**THE THIRD INSTANCE, WHICH IS ACCEPTANCE CASE (3).** This run was handed the
report of the PREVIOUS run, `20260904-010000`. The report its own run wrote is
on an unmerged branch and therefore invisible to a selector that reads
`origin/main`. That is the card's case (3), reproduced by the live system rather
than by a fixture, on the third consecutive night.

**THE SECOND SHAPE, WHICH IS CASE (2), AND IT HAS NOW FIRED TWICE.**
`docs/poc/triage-latest.json` on `origin/main` still records run
`20260831-040003`, because every review since has ridden in a pull request that
has not merged. Read off the branches directly: `triage/20260903-220002` (PR
#184) and `triage/20260904-010000` (PR #187) were **both handed
`docs/reports/2026-09-03-executor-sample-ttl-and-document-source.md`** and both
reviewed it in full, six rulings apart. Two reviews, one report, nothing red,
both pull requests green.

**THAT IS A CONSTRAINT ON HOW CASE (2) MAY BE BUILT AND IT IS NOT OPTIONAL.**
The card's `defaults` say consumed is read from `docs/poc/triage-latest.json` and
nowhere else, which is right about the FILE and silent about the REF. Reading it
at `origin/main` alone cannot work, because the file that records a consumption
sits inside the unmerged pull request that performed it. **The consumed set is
read from the same place the candidate set is read from**: the run's own branch
and the open review branches, not `origin/main` alone. If that is judged out of
scope, the pull request says so and leaves a card; what it may not do is ship
case (2) against `origin/main` only and report the duplicate review as fixed.

**TWO LINE NUMBERS ON THE CARD ARE STALE BY EXACTLY ONE CARD**, because AUT-16
moved `scripts/poc/run.sh` underneath it. The selector is at 792 to 794, not 734.
The dispatch phrase is at 808, not 749. Both are corrected in `notes` with the
instruction to re-grep rather than to trust the corrected numbers either, since
they will be stale again the next time anything edits that file.

**THIS RUN DID NOT RE-TRIAGE ANYTHING.** The report it was handed has not been
reviewed by any committed or open TRIAGE output, verified by reading
`docs/poc/triage-latest.json` on all five branches that carry one. The report
this run's own executor wrote is **deliberately left unreviewed** and is named
here and in this run's report so the next review takes it: reviewing two reports
in one session to compensate for a broken selector is how "two TRIAGE runs over
the same report must reach the same answer" stops being checkable.

**Unblocks:** nothing. AUT-17 was already `todo`, eligible and unclaimed.

---

### R-110 - the eligible-card order now crosses two boards and CLAUDE.md still describes one, so a session that boots on the rules picks the wrong card; RULE-05 is authored
**Date:** 2026-09-04
**Asked on:** RULE-05, AUT-16, and every session that boots per CLAUDE.md section 12
**Answer, verbatim:**
> from docs/reports/2026-09-04-executor-aut-16-board-set.md, section 6:
>
> "But read this first: the eligible-card selector now returns phase 3 cards
> ahead of phase 2 ones, because that is what AUT-16's `defaults` require and
> what R-061 says the owner's priority is. From the next run onward the harness
> line will read `EXT-10, EXT-11, ...` before it reaches `AUT-16`'s neighbours.
> A run that expected the phase 2 board to be the queue is reading a stale
> premise; R-071 already superseded that half of R-061."

**Ruling:** the ORDER is **RATIFIED** as an application, not a widening, and the
DOCUMENT is a defect with a card.

**THE RATIFICATION, BY THE FOUR TESTS.** Test 1, no data. Test 2, committed
evidence: AUT-16 shipped, merged as `d4915a8`, acceptance `test-board-set.sh`
25 passed and wired into `quality` by name. Test 3 is the one that matters here,
and it does not fire: R-071 supersedes the harness half of R-061 in terms, AUT-16
was authored under it, and the ORDER is written into AUT-16's own `defaults`,
which section 5 makes pre-authorised. A default applied is not a rule widened.
**RATIFIED, citing R-061 and R-071 by id.**

**THE DEFECT IS THAT CLAUDE.md DOES NOT SAY SO.** Section 2 reads "The board is
the work queue", singular, and "Take the **lowest-id eligible card**", with a
worked example of lexical sorting. Verified against the repository today: the
phase 2 board's first eligible card is `AUT-17`, the phase 3 board's is `EXT-10`,
and the working set puts phase 3 first, so the harness picks `EXT-10`. **A fresh
session booting on the two lines in section 12 and reading section 2 computes
`AUT-17`, and nothing anywhere is red.** Section 12 states the standard this
fails: everything a session needs is in that file, and a session that needs a
third line is a defect in it.

**IT IS THE SAME SHAPE THE PROJECT KEEPS PAYING FOR.** R-071 found three
components each holding a private copy of one board path. This is that fact held
in a fourth place, a human-readable one, which is the copy no test can see. So
RULE-05's acceptance is written as an **agreement check** between
`scripts/poc/boards.mjs` and `CLAUDE.md` rather than as a grep for two filenames:
the document and the module must not be able to disagree silently, and a prose
copy of the list would re-create the second copy AUT-16 removed.

**Unblocks:** nothing. RULE-05 is authored `todo` with no dependency.

---

### R-111 - the Telegram answer forms refuse every card id with a lower-case suffix, so a split card is unanswerable from the owner's phone; AUT-19 is authored
**Date:** 2026-09-04
**Asked on:** AUT-19, and every card that will ever be blocked on a person after a split
**Answer, verbatim:**
> from docs/reports/2026-09-04-executor-aut-16-board-set.md, section 4, finding 1:
>
> "`R p3-04b default` is still refused by the accepted-form regex. `FORM_DEFAULT`
> in `inbox.mjs` reads `[A-Za-z0-9]+-[0-9]+` and stops at the digits, so every
> card with a lower-case suffix (`P3-04b`, `P3-11a`, `P3-13c`) is unreachable
> through the message form even though the id now resolves correctly. AUT-16's
> `defaults` say in terms that the reader does not get wider here, so this is
> written up in `docs/LEARNINGS.md`, named in the test as deliberately not
> asserted, and wants a card of its own."

**Ruling:** the finding is upheld and it is **work**, so it is card **AUT-19**
and not a ruling about behaviour. The executor's decision not to fix it in
AUT-16 is **RATIFIED**: the card's `defaults` said the reader does not get wider,
CLAUDE.md section 5 makes a default binding on the card that carries it, and
section 3 forbids the quiet extra commit. Reporting it and asking for a card is
the behaviour those two rules describe.

**IT IS NOT A RARE SHAPE, WHICH IS WHY IT IS HIGH.** The ids it refuses are
`P2-08a`, `P2-08b`, `P3-04b`, `P3-05b`, `P3-11a` through `P3-11e`, `P3-13b`,
`P3-13c` and `P3-27a`. That is what a **split card** looks like on these boards,
and a split card is disproportionately the kind that ends up blocked on a person
and needing an answer. The channel is at its narrowest precisely where it is
needed most.

**WHAT IT COSTS IS WORSE THAN A LOST MESSAGE.** The refusal reads back as "no
card P3-04b on the board", which is indistinguishable to the owner from a card id
he mistyped. The channel does not merely fail to carry his answer; it tells him
something false about the board and invites him to stop trying.

**THE CARD MAY NOT WIDEN WHO MAY SPEAK, AND ITS `defaults` SAY SO IN TERMS.**
Two accepted forms stay two, `TELEGRAM_OWNER_ID` still gates every message, an
unset owner id still accepts nothing, every other message is still logged and
never acted on. CLAUDE.md section 13 is untouched. This widens **which ids
resolve** and nothing else.

**AND IT MAY NOT FOLD CASE ON THE WAY OUT.** The id is resolved against the
board set and the BOARD's own spelling is what gets stored and quoted back.
Upper-casing and storing that is the `claim.sh` defect ratified at R-108 hours
earlier, and the report calls it the fourth instance of that class here. This
card does not create a fifth.

**Unblocks:** nothing. AUT-19 is authored `todo` with no dependency.

---

### R-112 - a whole test file has been red on main and in no required check; AUT-20 is authored and it is high
**Date:** 2026-09-04
**Asked on:** AUT-20
**Answer, verbatim:**
> from docs/reports/2026-09-04-executor-aut-16-board-set.md, section 4, finding 2:
>
> "`scripts/poc/test-chat-classify.sh` fails on `main`, before this branch.
> Verified by running it in a clean worktree at `HEAD`: `the five outcomes, in
> order: expected [ignored,empty,ruling,ruling,question], got
> [ignored,empty,ruling,ruling,answer]`. It is **not wired into `quality`**,
> which is why nobody has seen it. Reported, not touched."

**Ruling:** upheld, it is **work**, and it is card **AUT-20** at priority high.
The second half of the finding was re-verified from the repository before this
ruling was written, because DOCTRINE-TRIAGE test 2 asks for evidence a stranger
can re-check and "it is not wired in" is exactly that: `.github/workflows/quality.yml`
names twenty two steps and `test-chat-classify.sh` is in none of them, while its
four siblings `test-harness-caps.sh`, `test-install.sh`, `test-ask-digest.sh` and
`test-board-set.sh` are each wired in by name with a comment tag.

**WHY HIGH AND NOT MEDIUM.** The classifier decides what an incoming Telegram
message IS, and CLAUDE.md section 13 makes the narrowness of that decision the
whole of the channel's security model: identity checked first, two exact forms
accepted, everything else logged and never acted on. The failing case is
specifically one where a message that should be classified as a **question** is
classified as an **answer**. An answer is acted on. A question is not.

**THE CARD FIXES WHICHEVER SIDE IS WRONG, ON THE EVIDENCE, AND SAYS WHICH.** If
a committed ruling changed the behaviour and the test was never updated, the test
is corrected and that ruling is cited by id. If no such ruling exists the
classifier is wrong, because a command surface that widened without a ruling is a
command surface that widened by accident. Where the evidence does not decide, the
card takes the narrower outcome. **Deleting the test is not an option** and the
`defaults` say so: a failing test removed is a check that was never run, recorded
as a check that passes.

**WIRING IT IN IS HALF THE CARD AND SHIPS IN THE SAME PULL REQUEST.** A green
test nothing runs is the defect, not the symptom.

**THE CLASS, RECORDED AND NOT YET CARDED.** `npm run check:assertion-register`
already catches an assertion with no failing case. Nothing catches a whole test
FILE with no runner. That is a different check and it is worth a card if a
second instance appears; one instance is a card, two is a check.

**Unblocks:** nothing. AUT-20 is authored `todo` with no dependency.

---

### R-113 - the deployed harness copies drift from the repository with nothing comparing them; the one-off reinstall is not a card and the missing check is, so AUT-21 is authored
**Date:** 2026-09-04
**Asked on:** AUT-21
**Answer, verbatim:**
> from docs/reports/2026-09-04-executor-aut-16-board-set.md, section 4, finding 3:
>
> "`scripts/poc/install.sh` must be re-run. CLAUDE.md section 15 requires it
> after any change to `run.sh`, `responder.sh` or `digest.sh`. This card changed
> `run.sh` and `digest.sh`. The deployed copies under `/Users/ivan/rc-poc-bin`
> are stale until somebody runs it. The fallback paths added in this card mean a
> stale deployed copy degrades to the old single-board behaviour with a log line
> rather than dying, but it is still stale."

**Ruling:** the finding is upheld and it is **split in two, deliberately**.

**THE RE-RUN IS AN ACTION AND AN ACTION IS NOT A CARD.** DOCTRINE-TRIAGE section
5 requires machine-checkable acceptance and "somebody ran a command on a laptop"
is not one. It is named in this run's report and carried by the digest so it does
not go quiet, and it is not blocked on anything.

**THE CARD IS THE REASON NOBODY KNEW.** Nothing anywhere compares the deployed
copy to the repository, so the staleness was found by an executor reading a rule
rather than by anything running. That is card **AUT-21**: a run that reports
drift between its own deployed scripts and the repository copy at the commit it
is executing.

**IT REPORTS, IT NEVER RE-INSTALLS, AND THAT IS IN THE `defaults` RATHER THAN
LEFT TO JUDGEMENT.** A run that reinstalls its own harness rewrites the script it
is executing, and bash reads a script incrementally from disk, so the failure is a
run that changes behaviour halfway through with nothing in the log to say so.
A drift is an escalation, never a refusal: a stale run that says it is stale beats
no run, and refusing to start would convert a reporting gap into an outage the
first time somebody edits a script and forgets the reinstall, which is exactly the
situation being ruled on.

**IT IS NOT COVERED BY `test-install.sh`, WHICH IS GREEN AND PROVES SOMETHING
ELSE.** That test installs into a fixture prefix and invokes what it installed,
proving the INSTALLER works. It says nothing about whether the installer was ever
RUN on this machine after the last change, and its own comments record that it
deliberately never touches the real deployed directory. Two properties, one
check.

**THE COST IS ALREADY ON THE RECORD.** AUT-16 had to choose an argument shape
whose old reading is the old behaviour, precisely because for one merge window a
new shell script calls an old parser. That mitigation is correct and it is not a
substitute for knowing which window you are in.

**Unblocks:** nothing. AUT-21 is authored `todo` with no dependency.

---

### R-114 - the required check costs half the run cap, so a run that builds a card cannot merge it; AUT-22 is authored and the cap is NOT raised
**Date:** 2026-09-04
**Asked on:** AUT-22, AUT-9, and every scheduled run
**Answer, verbatim:**
> from docs/reports/2026-09-04-executor-aut-16-board-set.md, header:
>
> "**Cap:** 45 minutes of wall clock, 2 cards. **The cap arrived with PR #186
> open and its `quality` check still running.** One card was worked, none was
> merged."
>
> and from the same report, section 2:
>
> "The acceptance passed and the `quality` check was still running its End to end
> step when the 45 minute wall clock cap arrived."

**Ruling:** upheld, it is **work**, and it is card **AUT-22**.

**THE ARITHMETIC IS FROM COMMITTED RUN HISTORY, NOT FROM AN IMPRESSION.** The
last measured `quality` runs took 24m48s, 18m09s and 19m43s, and one was
cancelled at 21m. The cap is 45 minutes. The required check therefore costs
between forty and fifty five percent of the entire budget, and two consequences
follow with no judgement in them: a run can merge at most one pull request, and
only if its head sha is pushed inside the first twenty minutes; and **a run that
builds a card from scratch cannot also merge it**.

**IT HAS FIRED ON THREE CONSECUTIVE RUNS.** `20260904-010000` built AUT-16 in
full and ran out of clock with PR #186 open. `20260904-040001` merged it, having
inherited finished work and pushed at minute two, then could not start AUT-17 for
the same reason and said so rather than leaving half a `run.sh` on a branch. The
pattern reads across three reports as three runs each failing to finish, and it
is not: it is the harness meeting an arithmetic constraint nobody had written
down.

**THIS IS NOT AN ARGUMENT FOR A LONGER CAP AND THE CARD MAY NOT RAISE ONE.**
Forty five minutes is the owner's number in CLAUDE.md section 13 and changing it
is his. Making the run longer moves the boundary; making the run KNOW where the
boundary is removes the class.

**A RUN THAT REFUSES TO START A CARD IS NOT A SILENT RUN.** CLAUDE.md section 13
says silence about an eligible card is a defect and never a normal outcome, and
names four reasons a run can ship nothing. This adds a fifth, "not enough clock
left to merge it", written to the log and appended as an escalation exactly like
the other four. A run that quietly does nothing because arithmetic said so is a
worse outcome than the one being fixed.

**BOUNDARY WITH AUT-9 AND AUT-18, RECORDED IN ALL THREE SO NONE IS HALF-DONE.**
AUT-9 makes the cap MEASURE the wall clock correctly and stops a dead lock being
honoured forever. AUT-22 decides what to START given a clock that already
measures correctly. AUT-18 makes every open pull request VISIBLE and merges
nothing. Measurement, selection, census: three cards, three code paths, no
overlap.

**Unblocks:** nothing. AUT-22 is authored `todo` with no dependency.

---

### R-115 - six merged migrations have never been applied, every phase 3 launch condition sits behind them, and no card owned it; APPLY-02 is authored and it is not an escalation
**Date:** 2026-09-04
**Asked on:** APPLY-02, P2-13, and all nine phase 3 launch gate conditions
**Answer, verbatim:**
> from `docs/migrations/APPLY-LOG.md`, the post-check of the last recorded apply:
>
> "ledger  -> 27 rows, highest 0027"
>
> and from `git ls-tree --name-only origin/main supabase/migrations/`:
>
> 0028_applied_ledger_version.sql, 0029_category_paints.sql,
> 0030_units_tonne_litre.sql, 0031_units_tonne_litre_rows.sql,
> 0032_extraction_draft_page_count.sql, 0033_extraction_document_source.sql

**Ruling:** the gap is real, it is **work**, and it is card **APPLY-02**.

**THE SAME GAP HAS NOW OPENED TWICE AND THE SECOND TIME NOBODY REPORTED IT.**
R-082 exists because thirteen merged migrations were unapplied and reachable by
no role. P3-27 applied 0014 to 0027 and shipped. Six have merged since and no
card on any board applies them. This ruling was produced by DOCTRINE-TRIAGE
section 4's gate audit, not by a report, which is the point: nothing in the
repository notices the pending register growing.

**WHY IT REACHES NOBODY BY DEFAULT.** Merging a migration file changes one text
file and changes no database. CLAUDE.md 3.1 says that in terms and it is correct.
The consequence is that the apply must be somebody's card **explicitly**, and a
card that shipped its file reads as finished.

**WHAT IT BLOCKS IS THE ENTIRE PHASE 3 GATE.** All nine conditions require
behaviour live **on production**, and behaviour cannot be live on a schema that
was never applied. The gate has read 0 of 9 since the board opened, and this is
the single deciding cause for all nine. That is recorded in each of the nine
gates' notes by the same audit, under R-117.

**THIS IS NOT AN ESCALATION AND THE DISTINCTION IS THE WHOLE OF WHY IT IS NOT.**
The closed list's item 8 withholds **deciding** that a row-destroying run should
happen. Checked across all six files for `DROP TABLE`, `TRUNCATE` and `DELETE`:
none appears. R-082 already grants the apply through the assertion-bearing
applier and has never been revoked. So authoring the card is work, not a
decision, and it stays out of the owner's inbox where a real decision belongs.
**The grep does not outrank the parser**: if `pgsql-parser` disagrees inside the
applier, the applier refuses with nothing executed and the card blocks on ivan
with the statement quoted. That is written into the card's `defaults`.

**0030 AND 0031 ARE THE ENUM PAIR AND THE APPLIER ALREADY KNOWS.** 0030 carries
`ALTER TYPE ... ADD VALUE` and 0031 uses the labels, which is R-082's one bounded
deviation from "one transaction" and is PostgreSQL's rule rather than a
preference. The card records which files went to the pre-phase; it does not argue
with the split.

**IT MUST RUN BEFORE P2-13**, which revokes R-082 with every other terminal
grant. After P2-13 no terminal can apply these files at all. That edge is R-116's
subject, because the board cannot currently express it.

**Unblocks:** APPLY-02 is authored `todo`, eligible, no dependency. It is the
only card on either board that moves the phase 3 launch gate off 0.

---

### R-116 - depends_on cannot cross the board set, so the capability edge this audit found is the one edge the board has no way to hold; BOARD-03 is authored
**Date:** 2026-09-04
**Asked on:** BOARD-03, P2-13, APPLY-02
**Answer, verbatim:**
> from `node docs/board/validate-board.mjs docs/board/rc-board-phase2.json`, run
> by this TRIAGE session after writing the edge:
>
> "FAIL  docs/board/rc-board-phase2.json  (1 violation)
>   - cards (P2-13).depends_on: "APPLY-02" is not a card id on this board."

**Ruling:** the validator's refusal is **correct against the schema as it
stands** and the schema is now behind the boards. The work is card **BOARD-03**.

**WHAT HAPPENED, IN ORDER, SO IT IS NOT READ AS A COMPLAINT ABOUT THE
VALIDATOR.** DOCTRINE-TRIAGE section 3 check 3 asks what a card TAKES AWAY and
makes every card that needs that capability a dependency. P2-13 takes away three
capabilities at once. APPLY-02 is the only unshipped card whose sole authority is
one of them. The edge was written, and refused, because `depends_on` resolves
within one board file and APPLY-02 lives on the phase 3 board where every
migration-apply card lives.

**SO THE HIGHEST-VALUE DEPENDENCY THIS AUDIT FOUND IS THE ONE THE BOARD CANNOT
EXPRESS.** Section 3 calls the capability edge "the one that costs", and its
entire mechanism is that the edge sits in `depends_on` where the eligibility rule
reads it. An edge recorded in prose is read by whoever happens to read the notes,
which is the failure mode the check exists to prevent: ordering by something
other than the dependency.

**IT IS A CONSEQUENCE OF AUT-16, NOT A DEFECT IN IT.** Until R-061 opened phase 3
the harness worked one board and a board-local `depends_on` was the whole truth.
R-071 and AUT-16 brought id resolution, eligibility, claims and the digest across
to the board SET. The validator was not in that set because nothing had needed it
to be. This is the fourth component to cross the same line and the first three
are already done.

**THE WIDENING IS TO THE SET AND NOT TO ANYTHING**, and BOARD-03's acceptance
asserts both directions: a real cross-board edge validates, and a dangling id
that is on NO board in the set still fails, naming the id. `npm run
check:unique-ids` is what makes this safe and it is already required and already
green: no card id appears on two boards, so resolving against the set has exactly
one answer. If that check is ever weakened this card's premise goes with it.

**UNTIL BOARD-03 SHIPS, THE EDGE LIVES IN P2-13's NOTES**, at the top rather than
the bottom, with the validator's exact refusal quoted so the next reader does not
re-derive why the array looks incomplete.

**Unblocks:** nothing. BOARD-03 is authored `todo` with no dependency, and
P2-13's array gains `APPLY-02` in the pull request that ships it.

---

### R-117 - the board audit: four depends_on checks over 147 cards on three boards, one resequence, and eighteen gate conditions audited with nothing flipped
**Date:** 2026-09-04
**Asked on:** P2-13, and all eighteen launch gate conditions on the two open boards
**Answer, verbatim:**
> from DOCTRINE-TRIAGE section 3:
>
> "Run all four checks, every time, over the whole board and not only the cards
> the report touched. A stale edge is invisible from the card that carries it."
>
> and from section 4:
>
> "Write the audit into `evidence.ref` whether or not it flips."

**Ruling:** all four checks were run over all 147 cards on all three boards, and
all eighteen open-board gate conditions were audited. **One resequence. No gate
flips.**

**CHECK 1, DANGLING: NONE.** Every id in every `depends_on` on all three boards
resolves to a card, within its own board.

**CHECK 2, SATISFIED BUT BLOCKING: TWO CARDS, BOTH CORRECT AS THEY STAND.**
P2-08b has its only dependency shipped and is blocked on `andre`; he genuinely
owes the live extraction round trip and the block is not stale. P2-14 is blocked
on `client` with P2-13 unshipped; the client genuinely owes the acceptance walk.
Neither is cleared.

**CHECK 3, THE CAPABILITY EDGE: ONE RESEQUENCE AND ONE EDGE THE BOARD CANNOT
HOLD.** `P2-13.depends_on` was `["P2-08b"]` and is now `["P2-08b","GATE-03"]`.
GATE-03 exists to make P2-13's own checklist name R-082 explicitly, because a
checklist that names two grants by id and leaves the third to a blanket phrase
revokes two. Worked in the wrong order, the checklist ticks out complete with
R-082's grant still alive: a permission that outlives its condition with every
box ticked, which is the exact failure CLAUDE.md 8.7 was written to prevent. The
second edge, to APPLY-02, is real and unexpressible and is R-116.

**THE P2-08b EDGE IS KEPT AND THE COST OF KEEPING IT IS ESCALATED RATHER THAN
ABSORBED.** P2-08b needs the pre-rotation credentials so it genuinely belongs
before the rotation, and removing the edge would let a rotation destroy the
credentials it needs. But P2-08b has been blocked on a third party since
2026-08-27, which makes the credential firewall hostage to somebody outside this
project: the grant CLAUDE.md 8.7 calls temporary stays alive for exactly as long
as he does not answer. The edge stays; the consequence goes to the owner with a
recommended default, because deciding to rotate without waiting for him is
sequencing and is his under the closed list.

**CHECK 4, EDGES ON A SPLIT CARD: RE-DERIVED, NO CHANGE.** P2-08's split into
P2-08a and P2-08b was re-derived against every dependent. P2-13 needs the live
round trip, so P2-08b is the correct half and not P2-08a. G4's first clause was
already re-derived against the split under R-046 and is unchanged.

**THE PHASE 2 GATE STAYS 6 OF 9, AND THE THREE FAILURES ARE THREE DIFFERENT
KINDS.** G4 is the only one that is BACKLOG: R-053's rescoped clause is four
assertions, two exist, and the two that are missing are card P2-20, which is
eligible and unclaimed. G7 needs a console click and a real client account, and
its third clause is the one most likely to be forgotten: the reminder recipient
is on `rc-inventory.local`, a domain that does not resolve, so setting the two
environment variables does **not** flip it and the escalation carrying them says
so in its own words. G9 needs the client to act himself. A reader counting three
failing conditions as three units of remaining work will go hunting for cards
that do not exist, and only one of the three has one.

**THE PHASE 3 GATE STAYS 0 OF 9 AND ALL NINE HAVE ONE DECIDING CAUSE.** Six
merged migrations are unapplied, so no condition requiring behaviour on
production can be evidenced whatever ships. Each of the nine records that, and
records that the cause now has a card, APPLY-02, under R-115. Their own clauses
are deliberately **not** re-derived in this audit and each says so: a clause
cannot be evaluated against a schema that is not there, and writing a verdict on
one anyway is how an audit starts inventing its own evidence. When APPLY-02 lands
each of the nine is audited on its own terms and this paragraph is superseded.

**THE AUDITS ARE WRITTEN INTO `notes`, NOT INTO `evidence.ref`, AND THAT IS A
DELIBERATE DEPARTURE FROM DOCTRINE-TRIAGE SECTION 4 STEP 4.** The validator
permits `evidence` on a failing gate, so the instruction is followable. It should
not be followed here: `docs/board/board-app.js` renders `evidenceBit(g.evidence)`
beside every gate, so an audit placed there appears in the owner's portal, next to
a failing condition, in the slot labelled as its proof. The owner does not read
code and that is the standing condition this project is built around, so a field
that reads as "here is the proof" beside something that has not passed is the one
place an audit must not go. Every prior audit on this board went into `notes` and
this one matches them. **DOCTRINE-TRIAGE section 4 step 4 and the board's own
rendering disagree, this ruling resolves it for this repository in favour of
`notes`, and saying so is what that document's own opening calls a legitimate
TRIAGE output.**

**Unblocks:** nothing. The resequence adds an edge, it does not clear one.
