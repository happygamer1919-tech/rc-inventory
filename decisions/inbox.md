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
