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
| P2-01 | ivan | **Apply migration 0001** in the Supabase SQL editor. Shipped card, apply outstanding. |
| P2-02 | ivan | **Blocks the whole board.** Apply 0001, create the two accounts and their profiles rows, write `.env.local`. |
| P2-08 | andre | Confirm the Make.com webhook contract sent 2026-08-25. Recommendation on the card: proceed per the contract as sent. |
| P2-12 | ivan | Connect the client domain in Vercel and confirm HTTPS. Click steps written out on request. |
| P2-13 | ivan | Execute the credential rotation checklist and tick every box in the committed document. |
| P2-14 | client | Mihai runs one full cycle himself on production, unassisted. |

**Nothing on the board is eligible while P2-02 is blocked.** P2-03 through P2-07
all depend transitively on it. The three steps, in this order:

1. Apply `supabase/migrations/0001_phase2_schema.sql` in the Supabase SQL editor
   on the eu-west-1 project. Paste it whole, run once, and read the verification
   grid it prints after commit: eleven rows, `rls_enabled` true on every one,
   `policy_count` non-zero on every one.
2. Create two accounts in the Supabase dashboard, then insert a
   `public.profiles` row for each, keyed on the `auth.users` id, with `role` set
   explicitly. One `owner`, one `account_manager`. The column defaults to
   `account_manager`, so the owner row is the one that goes wrong if the role is
   left unset.
3. Write `.env.local` in the repo root with `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the two test account credentials. It is
   already gitignored. Values come from your own store; no terminal may read
   `/Users/ivan/rc-secrets`.

---

## Rulings

No rulings yet.
