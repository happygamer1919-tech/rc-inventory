# Migration apply log

**Required by P2-11, added by ruling R-013.**

Every migration applied to the RC Supabase project gets one entry here, carrying
the version, **the actor who applied it**, a UTC timestamp, and the pre-check
and post-check output in full.

## Why this file exists

On 2026-08-26 migration `0006_reminder_recipients.sql` was found already applied
to the production project, and **nobody could say by whom or when**.
`supabase_migrations.schema_migrations` carries `version`, `statements` and
`name`. It has no actor column and no timestamp column, so the question is not
answerable from the database at all. All that could be established was that it
was not this terminal.

A migration path nobody can audit is a hardening defect, which is why R-013
folded this into P2-11 rather than raising a separate card.

## Pending: authored and merged, NOT applied

**Added 2026-08-30 by ruling R-062.** Until that ruling, every file in
`supabase/migrations/` was also an applied migration, so "has an entry in this
log" and "is accounted for" were the same question. R-062 split them: **merging
a migration file changes one text file in a git repository and changes nothing
in any database**, and the apply is a separate card.

A file listed here has been authored, proven to apply UNMODIFIED to a real
PostgreSQL by `npm run check:migrations`, and merged. It has **not** run against
the RC Supabase project. When it does, it gets a normal entry below and its line
here is removed, in the same pull request.

**The invariant got stronger, not weaker.** `tests/e2e/headers.spec.ts` used to
require every migration file to have an entry. It now requires every migration
file to be in **exactly one** of the two places: applied, or pending with the
card that will apply it. A file in both, a file in neither, and a pending line
naming a file that does not exist all fail the suite.

The format is machine-read, so keep it exactly:


# RECONSTRUCTION OF 0028 TO 0031, 2026-09-03. READ THIS BEFORE THE FOUR ENTRIES.

**The four entries below are RECONSTRUCTED, NOT JOURNALLED, and each one says so
in its own heading.** Every other entry in this file was written by whoever ran
the apply, in the same pull request, with the three phases of CLAUDE.md 8.5.
These four were written afterwards by a terminal that did not run them and cannot
find anyone who did. They must never be read as carrying the same weight.

## What was searched for first, and does not exist

The evidence of the applies AS EVENTS was looked for before a word was written
here, because inventing four journal entries would be far worse than recording
that there are none.

- **`git log --all -S"0031_units_tonne_litre_rows.sql - APPLIED"` over this file
  returns no commit.** The same for `0029`. No branch, merged or open, has ever
  carried an APPLIED heading for any of the four.
- **`docs/PRODUCTION-WRITES.md` has no row.** Its only two rows are the
  2026-08-28 reset runs, and it says in its own text that neither is a migration.
- **Every card report asserts the opposite of applied.** P3-34's report says
  `0029_category_paints.sql`, "authored and merged, NOT applied". P3-33's says the
  same of `0030` and `0031` and adds that "until they are applied, tonne and litre
  are live in the code and the validator, and not in the database". P3-11e's says
  `0028` was "AUTHORED AND MERGED, NOT APPLIED".
- **No pre-check, no post-check, no assertion count, no statement list, no
  actor.** There is nothing to transcribe. A journal entry under 8.5 needs those
  and they were never produced.

**So: the applies have no record of having run, and nothing below invents one.**

## What DOES exist: production, queried directly

Read 2026-09-03, against project ref `bwhzatwwjqmyfesfnisa`, through PostgREST
with the service role, by EXECUTOR. Variable names only, per section 7. The
queries and their output, verbatim:

    POST /rest/v1/rpc/applied_ledger_version   ->  "0031"

    GET  /rest/v1/categories?select=name,sort_order,active&order=sort_order
      ->  19 rows, 19 active, including
          {"name":"Vopsele, lacuri si solventi","sort_order":19,"active":true}
          (stored with diacritics; transcribed here without them)

    GET  /rest/v1/units?select=*
      ->  9 rows; columns code,sort_order,active,created_at,updated_at
      ->  codes: m2,lm,pcs,bag,kg,roll,m3,t,l

    GET  /rest/v1/extraction_drafts?select=document_source&limit=1  ->  42703
    GET  /rest/v1/extraction_drafts?select=page_count&limit=1       ->  42703

## The two NEGATIVE reads are load-bearing and are here on purpose

`document_source` and `page_count` both return **42703, undefined column**. Those
are the two migrations numbered `0032` on open pull requests #177 and #180, and
both are **unmerged**. Production having everything that has merged and nothing
that has not is the strongest available evidence about **WHEN** these applies
happen: **on merge to `main`, and not on a pull request.**

## THE MECHANISM WAS PROBABLE WHEN THIS WAS WRITTEN AND IS NOW OBSERVED

**This section was written as circumstantial and was then confirmed by a
PREDICTION, with a control, half an hour later.** The upgrade is recorded rather
than the original wording quietly replaced, because how a claim was established
matters as much as the claim.

**The prediction.** If the mechanism is the Supabase GitHub app applying on merge
to `main`, then merging a migration should make it appear in production within
minutes, and a migration on an unmerged branch should stay absent.

**The test.** `0032_extraction_draft_page_count.sql` was merged as PR #180 at
`71dd97a`. Before the merge, read at 21:2xZ:

    applied_ledger_version()                 ->  "0031"
    extraction_drafts.page_count             ->  42703, absent
    extraction_drafts.document_source        ->  42703, absent

After the merge, with the `Supabase Preview` check on `71dd97a` completing at
**2026-09-03T21:33:39Z**:

    applied_ledger_version()                 ->  "0032"
    extraction_drafts.page_count             ->  PRESENT
    extraction_drafts.document_source        ->  still absent

**`document_source` is the control and it is what makes this a test rather than a
coincidence.** It is the OTHER migration numbered 0032, on PR #177, which is still
open. Both were written the same day, both sat in the same pending register, and
only the merged one appeared. Nothing else about the two differs in a way that
could explain it.

**So the four entries below are reconstructions of an event whose MECHANISM is now
directly established**, even though their own actor and timestamp remain
unrecorded. That is the strongest form the reconstruction can take and it is still
not a journal.

## The original circumstantial argument, kept because it was the basis at the time

A **`Supabase Preview` check, from the GitHub app `supabase`**, runs on every push
to `main` and points at
`https://supabase.com/dashboard/project/bwhzatwwjqmyfesfnisa`, the production
project. It concluded `success` on exactly the merges that carried these files,
within seconds of each:

| merge | carried | Supabase check |
|---|---|---|
| `9862111` (#163, P3-11e) | `0028` | 2026-09-02T17:41:09Z to 17:41:13Z, success |
| `1f7d3ab` (#169, P3-34) | `0029` | 2026-09-03T16:08:52Z to 16:08:56Z, success |
| `c9c1c14` (#170, P3-33) | `0030`, `0031` | 2026-09-03T16:47:26Z to 16:47:31Z, success |

**The check carries no title and no summary, so it does not state what it
applied.** Timing, app identity and project ref line up on every merge that
carried a migration. That is circumstantial. It is recorded as the probable
mechanism because a reader deserves the best available explanation, and it is
labelled probable because nothing observed actually says so.

## What this means, and it is not small

**There is a path that writes production and journals nothing.** CLAUDE.md 8.8
says a write with no row in one of the two journals is a violation. That section
is written for terminals; this path is not a terminal, so the rule has been broken
without anybody breaking it, which is the harder kind to notice.

**The stale register reached a third party.** `/Users/ivan/rc-samples/ANDRE-STATUS.md`
told the extraction counterparty that the category and the two units "land when
the pending migration batch is applied to production, which is a separate
owner-run step". That was already false when it was written, and it was written
from this file.

**Nothing here is a licence to stop journalling.** The next apply a terminal
performs is journalled in full under 8.5, like every entry that is not one of
these four.

## 0028_applied_ledger_version.sql - APPLIED (RECONSTRUCTED, NOT JOURNALLED)

**Actor:** **NOT RECORDED, AND NOT GUESSED AT HERE.** No terminal ran this and no
journal names one. The probable mechanism is the `Supabase Preview` GitHub app on
the merge to `main`, for the reasons in the reconstruction preamble above, and
that is circumstantial rather than observed.

**Applied at:** **NOT RECORDED. BOUNDED, not claimed:** after
`2026-09-02T17:41:09Z`, when the merge `9862111` (#163) put the file on `main`, and
before 2026-09-03T21:25Z, when the read below observed the object in production.
The Supabase check on that merge completed at `2026-09-02T17:41:13Z`, which is the probable
moment inside that window.

**What it creates:** `public.applied_ledger_version()`, a SECURITY DEFINER function granted to `service_role` only.

**Proof that it is applied:** the RPC **answered with `"0031"`**. A missing function returns an error, not a string, so the function exists. This is a direct observation.

**Phases 1, 2 and 3 of CLAUDE.md 8.5:** none exist. No pre-check, no in-transaction
assertion count, no post-check grid. That is the whole reason this entry is marked
reconstructed.

## 0029_category_paints.sql - APPLIED (RECONSTRUCTED, NOT JOURNALLED)

**Actor:** **NOT RECORDED, AND NOT GUESSED AT HERE.** No terminal ran this and no
journal names one. The probable mechanism is the `Supabase Preview` GitHub app on
the merge to `main`, for the reasons in the reconstruction preamble above, and
that is circumstantial rather than observed.

**Applied at:** **NOT RECORDED. BOUNDED, not claimed:** after
`2026-09-03T16:08:52Z`, when the merge `1f7d3ab` (#169) put the file on `main`, and
before 2026-09-03T21:25Z, when the read below observed the object in production.
The Supabase check on that merge completed at `2026-09-03T16:08:56Z`, which is the probable
moment inside that window.

**What it creates:** the nineteenth category row, `Vopsele, lacuri si solventi`.

**Proof that it is applied:** the row is present, `sort_order` 19, `active` true, in a table of 19 rows. **Direct observation.**

**Phases 1, 2 and 3 of CLAUDE.md 8.5:** none exist. No pre-check, no in-transaction
assertion count, no post-check grid. That is the whole reason this entry is marked
reconstructed.

## 0030_units_tonne_litre.sql - APPLIED (RECONSTRUCTED, NOT JOURNALLED)

**Actor:** **NOT RECORDED, AND NOT GUESSED AT HERE.** No terminal ran this and no
journal names one. The probable mechanism is the `Supabase Preview` GitHub app on
the merge to `main`, for the reasons in the reconstruction preamble above, and
that is circumstantial rather than observed.

**Applied at:** **NOT RECORDED. BOUNDED, not claimed:** after
`2026-09-03T16:47:26Z`, when the merge `c9c1c14` (#170) put the file on `main`, and
before 2026-09-03T21:25Z, when the read below observed the object in production.
The Supabase check on that merge completed at `2026-09-03T16:47:31Z`, which is the probable
moment inside that window.

**What it creates:** the enum labels `t` and `l` on `public.unit_code`.

**Proof that it is applied:** **INDIRECT, AND FLAGGED AS INDIRECT.** Enum labels are not rows and PostgREST cannot list them. `public.units.code` IS of type `public.unit_code` (`0001_phase2_schema.sql`, line 126), and rows keyed `t` and `l` are present, so the labels must exist because the insert could not otherwise have succeeded. Sound, but an inference rather than an observation.

**Phases 1, 2 and 3 of CLAUDE.md 8.5:** none exist. No pre-check, no in-transaction
assertion count, no post-check grid. That is the whole reason this entry is marked
reconstructed.

## 0031_units_tonne_litre_rows.sql - APPLIED (RECONSTRUCTED, NOT JOURNALLED)

**Actor:** **NOT RECORDED, AND NOT GUESSED AT HERE.** No terminal ran this and no
journal names one. The probable mechanism is the `Supabase Preview` GitHub app on
the merge to `main`, for the reasons in the reconstruction preamble above, and
that is circumstantial rather than observed.

**Applied at:** **NOT RECORDED. BOUNDED, not claimed:** after
`2026-09-03T16:47:26Z`, when the merge `c9c1c14` (#170) put the file on `main`, and
before 2026-09-03T21:25Z, when the read below observed the object in production.
The Supabase check on that merge completed at `2026-09-03T16:47:31Z`, which is the probable
moment inside that window.

**What it creates:** the `t` and `l` rows in `public.units`.

**Proof that it is applied:** both rows present among the 9 returned: `m2,lm,pcs,bag,kg,roll,m3,t,l`. **Direct observation.**

**Phases 1, 2 and 3 of CLAUDE.md 8.5:** none exist. No pre-check, no in-transaction
assertion count, no post-check grid. That is the whole reason this entry is marked
reconstructed.

## 0032_extraction_draft_page_count.sql - APPLIED, OBSERVED PROSPECTIVELY

**Actor:** **the Supabase GitHub app, on the merge of PR #180 to `main`.** This is
the one entry in this group where the actor is stated rather than left unrecorded,
because this apply was PREDICTED BEFORE IT HAPPENED and then observed, with a
control. See the mechanism section above. **No terminal ran it. EXECUTOR authored
the file and did not apply it, and the card's own evidence says "NOT APPLIED",
which was true when written and is false now.**

**Applied at:** between `2026-09-03T21:31Z`, when PR #180 merged as `71dd97a`, and
`2026-09-03T21:33:39Z`, when the `Supabase Preview` check on that commit completed
`success`. Read as present immediately after.

**What it creates:** `public.extraction_drafts.page_count`, integer, nullable, no
default, with `extraction_drafts_page_count_positive` checking `page_count is null
or page_count >= 1`.

**Proof that it is applied:**

    before merge:  GET /rest/v1/extraction_drafts?select=page_count&limit=1  ->  42703
    after merge:   GET /rest/v1/extraction_drafts?select=page_count&limit=1  ->  200
                   POST /rest/v1/rpc/applied_ledger_version                  ->  "0032"

**AND IT WAS APPLIED FAITHFULLY, CONSTRAINT INCLUDED.** The column landing does
not prove the whole file landed, so the constraint was probed directly:

    POST /rest/v1/extraction_drafts  {..., "page_count": 0}
      ->  400  {"code":"23514", ...}

`23514` is `check_violation`. `extraction_drafts_page_count_positive` is present
and enforcing in production, so the integration ran the file rather than only its
`ADD COLUMN`. **That matters for MIG-01's recommendation:** the argument for
keeping this path rests on it applying correctly, and this is the evidence for
that half.

**A PRODUCTION WRITE WAS ATTEMPTED HERE AND IS DECLARED RATHER THAN GLOSSED.**
The probe was an `INSERT` designed to be refused, and it was refused, so **nothing
was written and there is no row to journal under 8.8**. The script carried a
`DELETE` cleanup that would have run only if the insert had unexpectedly
succeeded; **it did not execute**. That path should not have been written as a
`DELETE` at all: PostgREST offers no transaction to roll back, so a probe that
can only be undone by deleting is the wrong shape, and the right one is a probe
that cannot succeed. This one could not, which is why it was safe, but it was safe
by construction rather than by design and the distinction is worth keeping.

**Phases 1, 2 and 3 of CLAUDE.md 8.5: none exist**, and here that is not a gap in
the record, it is the finding. A migration reached production **with no pre-check,
no in-transaction assertions, no post-check, no journal and no human**, minutes
after a pull request merged. `scripts/apply-pending-migrations.mjs` and the whole
of R-082 were bypassed, not by anybody deciding to bypass them, but because this
path does not go through them at all.

**THIS IS NOT A LICENCE AND IT IS NOT A CONVENIENCE.** It means the destructive
statement stop in 8.6 protects nothing on this path: a merged migration containing
`DROP TABLE` would apply on merge, and the rule that says it "is never
auto-applied" would have been obeyed by every terminal and broken anyway.

**That is card `MIG-01`**, on the phase 2 board, `blocked_on: ivan` for the vendor
decision only. Its `defaults` say the pre-merge check that refuses a row-destroying
statement is NOT blocked on his answer and should be built first, because it is
what makes the permissive answer safe to choose.

## 0033_extraction_document_source.sql - APPLIED, OBSERVED PROSPECTIVELY, THIRD CONFIRMATION

**Actor:** **the Supabase GitHub app, on the merge of PR #177 to `main`.** Stated
rather than left unrecorded, for the same reason as `0032` and with the same kind
of evidence: this apply was **predicted before it happened** and then observed.
**No terminal ran it.**

**Applied at:** between `2026-09-03T22:22Z`, when PR #177 merged as `c3f5bb3`, and
`2026-09-03T22:24:24Z`, when the `Supabase Preview` check on that commit completed
`success`. Read as present immediately after.

**What it creates:** `public.extraction_drafts.document_source`, text, with a
check constraining it to the declared set, no default.

**Proof that it is applied:** this column was **the control in the `0032` test.**
While PR #177 sat open it was read three separate times and returned `42703,
undefined column` every time, in exactly the same query that showed `page_count`
appearing the moment #180 merged. Merging #177 was therefore a second, independent
prediction:

    while #177 was OPEN:   GET ...?select=document_source  ->  42703  (three reads)
    after #177 merged:     GET ...?select=document_source  ->  200
                           POST /rest/v1/rpc/applied_ledger_version  ->  "0033"

**THREE MIGRATIONS, THREE MERGES, THREE APPLIES, AND TWO OF THEM PREDICTED.** The
first four entries in this group were reconstructed after the fact from
circumstantial evidence. `0032` was predicted and observed with `0033` as the
control. `0033` was then predicted and observed in its turn. There is no longer
any reasonable doubt about the mechanism, and the sentence in CLAUDE.md 3.1 that
merging a migration "changes nothing in any database" is simply false here.

**Phases 1, 2 and 3 of CLAUDE.md 8.5: none exist.** Card `MIG-01` carries the
decision.

## Rules

- **One entry per apply**, in the order they were applied, newest at the bottom.
- **Append only.** An entry is never edited after it is written. A correction is
  a new entry naming the one it corrects.
- **The actor is named.** `EXECUTOR`, `IVAN`, `CRITIC`, whoever ran it. "someone"
  is not an actor.
- **Both check outputs go in whole**, not summarised. The point is that a
  stranger can re-read what actually happened without database access.
- **No credential values.** Variable names only, as everywhere.

## Entries before this file existed

`0001` through `0006` were applied before this log was required. Their journals
live on their cards, and this section carries what is knowable about each.

**EXPANDED FROM A TABLE INTO ENTRIES BY P2-11, 2026-08-27. Not one fact was
changed, added or removed:** every row of the original table became the entry of
the same version below, word for word in its "journal" line. The table was the
only part of this file that did not carry one heading per migration, so an
audit could not ask "does every migration have an entry" without a human reading
prose. `tests/e2e/headers.spec.ts` now asks exactly that, per file, and it needs
the headings to be able to.

## 0001_phase2_schema.sql

- **Version:** 0001
- **Actor:** IVAN, in the Supabase SQL editor
- **Applied at:** before 2026-08-25, exact time not recorded
- **Journal:** P2-01 evidence, verified rather than re-applied by EXECUTOR under
  R-001

## 0002_rc_docs_bucket.sql

- **Version:** 0002
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-04 evidence

## 0003_inbound_functions.sql

- **Version:** 0003
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-04 evidence

## 0004_outbound_functions.sql

- **Version:** 0004
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-05 evidence

## 0005_service_role_grants.sql

- **Version:** 0005
- **Actor:** EXECUTOR under R-001
- **Applied at:** 2026-08-25, exact time not recorded
- **Journal:** P2-06 evidence

## 0006_reminder_recipients.sql

- **Version:** 0006
- **Actor:** **UNKNOWN.** Not this terminal.
- **Applied at:** **UNKNOWN.** Found already applied at the pre-check on
  2026-08-26 and verified read-only rather than re-applied.
- **Journal:** none. This unanswerable row is the reason this file exists:
  `supabase_migrations.schema_migrations` carries version, statements and name,
  and has no actor column and no timestamp column, so the question is not
  answerable from the database at all.

---

## 0007_seed_categories.sql

- **Version:** 0007
- **Name:** seed_categories
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-26T21:05:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-17
- **Card:** P2-17
- **Destructive statements:** none. INSERT only, `on conflict (name) do nothing`.
- **Connection:** derived at runtime per CLAUDE.md 8.4. eu-west-1 session pooler,
  port 5432, user `postgres.<ref>`, password from `SUPABASE_DB_PASSWORD`. No
  connection string stored and no value printed.
- **Parsed before applying:** yes, with `pgsql-parser`. 3 statements,
  `TransactionStmt InsertStmt TransactionStmt`, 18 rows in the VALUES list,
  on-conflict action `ONCONFLICT_NOTHING`.

### Connectivity

```
select 1
1
```

### Phase 1, pre-check

```
migration files on disk: 7
journal rows before:
  0001|phase2_schema
  0002|rc_docs_bucket
  0003|inbound_functions
  0004|outbound_functions
  0005|service_role_grants
  0006|reminder_recipients
pending (on disk, not in journal): 0007
0007 claims to create: 18 category rows, INSERT only, on conflict do nothing
categories rows before: 1
names before: TEST-Categorie
```

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1 -f`. The file carries its own `begin`
and `commit`. No output, no error, clean exit. The journal row was then written:

```
insert into supabase_migrations.schema_migrations (version, name, statements)
  values ('0007','seed_categories', array[...]) on conflict (version) do nothing
  returning version
0007
```

### Phase 3, post-check

```
categories rows after: 19        (18 seeded + TEST-Categorie untouched)

the 18 seeded, sort_order | name | active:
 1 | Cimenturi și mortare        | t
 2 | Zidărie și cărămidă         | t
 3 | Betoane și agregate         | t
 4 | Armături și oțel            | t
 5 | Lemn și plăci               | t
 6 | Izolații termice            | t
 7 | Hidroizolații               | t
 8 | Gips-carton și profile      | t
 9 | Finisaje pereți             | t
10 | Placări ceramice și adezivi | t
11 | Instalații sanitare         | t
12 | Instalații electrice        | t
13 | Acoperișuri și tablă        | t
14 | Feronerie și fixări         | t
15 | Scule și consumabile        | t
16 | Uși și ferestre             | t
17 | Amenajări exterioare        | t
18 | Altele                      | t

TEST-Categorie untouched?  name | active | sort_order | product count:
TEST-Categorie | t | 0 | 305

tables | with RLS | policies in public:  11 | 11 | 41
enums: 6

journal after:
  0001|phase2_schema
  0002|rc_docs_bucket
  0003|inbound_functions
  0004|outbound_functions
  0005|service_role_grants
  0006|reminder_recipients
  0007|seed_categories
```

### Idempotency, proven rather than claimed

The same file was applied a **second time** in the same session:

```
SECOND_APPLY_EXIT= (clean)
categories rows after second apply: 19        (unchanged)
duplicate names: none duplicated
```

### What was deliberately not touched

`TEST-Categorie` was not renamed, deactivated, deleted or merged. It is CRIT-11
e2e residue carrying all 305 products, and it belongs to **P2-15** and to the
owner decision recorded there. A seed migration that quietly tidied it would be
taking that decision on Ivan's behalf, which is exactly what P2-15 exists to
prevent.

---

## 0008_extraction_drafts.sql

- **Version:** 0008
- **Name:** extraction_drafts
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T08:40:00Z
- **Authority:** ruling R-012, card P2-08a
- **Destructive statements:** none. The only `delete` tokens are `on delete set
  null` and `on delete cascade` in foreign keys, and `for delete` in policies.
- **Parsed before applying:** yes, `pgsql-parser`. 21 statements:
  2 `CreateEnumStmt`, 2 `CreateStmt`, 2 `CommentStmt`, 2 `IndexStmt`,
  1 `CreateTrigStmt`, 2 `AlterTableStmt`, 8 `CreatePolicyStmt`, wrapped in
  `TransactionStmt`. Zero destructive statement kinds.

### Phase 1, pre-check

```
files on disk: 8
journal before: 0001..0007
pending: 0008
0008 claims to create: 2 enums, 2 tables, 2 comments, 2 indexes, 1 trigger,
                       8 policies, RLS on both tables
tables in public before: 11
enums before: 6
```

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1 -f`. Clean. Journal row written.

### Phase 3, post-check

```
tables | with RLS | policies:   13 | 13 | 49
extraction_drafts        rls=t  policies=4
extraction_draft_lines   rls=t  policies=4
enums: 8
  extraction_status      extracted,partial,failed
  extraction_error_code  download_failed,url_expired,unsupported_format,
                         unreadable_document,extraction_failed,invalid_output,timeout

NULLABILITY, every contract field nullable:
extraction_drafts       order_id=NO document_path=NO document_filename=NO
                        mime_type=NO size_bytes=NO created_at=NO updated_at=NO
                        ALL 17 OTHERS = YES
extraction_draft_lines  id=NO order_id=NO line_no=NO product_name=NO
                        created_at=NO
                        ALL 10 OTHERS = YES

COLUMN DEFAULTS that are 0 or empty string: none
journal after: 0001..0008
```

### The post-check found a defect, which is what it is for

`anon` held `SELECT` on both new tables. Every other table in this schema grants
`anon` nothing, verified by the CRITIC at the wave 1 boundary and re-verified
read-only the same morning during the G2 gate audit: zero of eleven.

Nothing leaked. RLS is on and every policy is `to authenticated`, so an
anonymous request matched no policy and returned zero rows. PostgreSQL checks
the GRANT first and RLS second, and the second check was holding. But the point
of revoking `anon` is that it is the FIRST of the two, and a table with one
layer where every sibling has two is protected less.

Corrected by **0009**, below. 0008 is not edited: it is applied, and CLAUDE.md
8.1 says a correction is a new numbered file.

---

## 0009_revoke_anon_on_extraction_drafts.sql

- **Version:** 0009
- **Name:** revoke_anon_on_extraction_drafts
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T08:50:00Z
- **Authority:** ruling R-012, card P2-08a
- **Destructive statements:** none. `REVOKE` only.
- **Parsed before applying:** yes. 11 statements: 5 `GrantStmt` (revokes),
  3 `AlterDefaultPrivilegesStmt`, 1 verification `SelectStmt`, wrapped in
  `TransactionStmt`.

### Why 0008 needed correcting

Supabase grants table privileges to `anon` and `authenticated` **at CREATE TABLE
time**, from project-level default privileges that predate every migration here.
Migration 0001 knew that and revoked `anon` explicitly. That statement ran once,
against the tables that existed then. It is not a policy and it does not reach
tables created later. 0008 created two and did not repeat it.

The durable fix is the default privilege, not the revoke: the revoke fixes the
two tables that exist, and `alter default privileges ... revoke all on tables
from anon` stops the next `CREATE TABLE` reintroducing it. Same reasoning 0005
used for `service_role` and `authenticated`.

### Phase 1, pre-check

```
tables where anon can SELECT: 2   (extraction_drafts, extraction_draft_lines)
```

### Phase 2, apply

One transaction, clean. The file's own verification query printed all 13 tables
with `anon_can_read = f` and `authenticated_can_read = t`.

### Phase 3, post-check

```
tables where anon can SELECT:           0   of 13
tables where authenticated can SELECT:  13  of 13
tables where service_role can SELECT:   13  of 13
journal after: 0001..0009
```

---

## 0010_confirm_extraction_draft

- **Version:** 0010
- **Name:** confirm_extraction_draft
- **Actor:** EXECUTOR (unattended run 20260827-041238)
- **Applied at:** 2026-08-27T09:56:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-09
- **Card:** P2-09
- **Destructive statements:** none. 0 `DROP TABLE`, 0 `TRUNCATE`, 0 `DELETE`.
  Near-misses correctly excluded: two `on delete set null` foreign key clauses,
  which are referential actions and delete no row.
- **Connection:** derived at runtime per CLAUDE.md 8.4. Session pooler
  eu-west-1, port 5432, user `postgres.<ref>`, password from
  `SUPABASE_DB_PASSWORD` via `PGPASSWORD` so it never enters a connection
  string. No value printed and no connection string stored.

### The host, and why the first attempt failed

`aws-0-eu-west-1.pooler.supabase.com` resolved, accepted TCP and rejected the
tenant: `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`. That is the
same failure 0001 hit and recorded, so the correct host was not guessed at, it
was read back out of this repository: the 0001 journal on the board and
`docs/LEARNINGS.md` both name `aws-1-eu-west-1.pooler.supabase.com` as the one
that answers. Retried there and `select 1` returned `1`.

### Connectivity

```
select 1
1
```

### Phase 1, pre-check

```
pending files: 1 -> 0010_confirm_extraction_draft.sql
file claims: 2 alter table, 1 create function
db state before: extraction_drafts columns=24, confirm_extraction_draft exists=0
```

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1 -f`. The file carries its own
`begin`/`commit`.

```
BEGIN
ALTER TABLE
CREATE INDEX
ALTER TABLE
COMMENT
CREATE FUNCTION
COMMENT
COMMIT
apply exit: 0
```

### Phase 3, post-check

```
extraction_drafts new columns: confirmed_at, confirmed_by, confirmed_inbound_order_id
confirm_extraction_draft security_definer=false
extraction_draft_lines rls=true policies=4
extraction_drafts      rls=true policies=4
products=305 inbound_orders=181 extraction_drafts=0
```

`security_definer=false` is the intended value and not an oversight: the
function writes the order, its lines and its history row AS THE OPERATOR, so
every RLS policy on those tables still applies to the write. A definer function
here would have been a hole that let any signed-in session write rows the
policies refuse.

`products=305` and `inbound_orders=181` are test rows, not client data: they are
what P2-15's reset script exists to remove before first real data. The R-001
grant's condition, zero REAL client data, still holds.

## 0011_extraction_confirm_corrections

- **Version:** 0011
- **Name:** extraction_confirm_corrections
- **Actor:** EXECUTOR
- **Applied at:** NOT APPLIED. See "Why this entry exists unapplied" below.
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-09
- **Card:** P2-09
- **Destructive statements:** none of the three named by CLAUDE.md 8.6. 0
  `DROP TABLE`, 0 `TRUNCATE`, 0 `DELETE`. **One near-miss, named rather than
  buried:** the file contains `alter table ... drop constraint`, which removes a
  CHECK expression and no row, and which is the only way a constraint can be
  relaxed. Flagged here and in the PR so the owner can rule otherwise if he
  reads the rule wider than it is written.
- **Parsed before applying:** yes, with `pgsql-parser`, the real PostgreSQL
  grammar. **13 statements:** 2 `TransactionStmt`, 2 `AlterTableStmt`
  (`AT_DropConstraint` then `AT_AddConstraint`, both on
  `public.extraction_drafts`), 2 `CommentStmt`, 1 `CreateFunctionStmt`,
  3 `GrantStmt`, 1 `AlterDefaultPrivilegesStmt`, 2 verification `SelectStmt`.
  Forbidden statements found: none.

### Why this entry exists unapplied

The apply was attempted and **the terminal was refused by its own sandbox**, not
by any rule in this repository. R-012 grants the secrets read and CLAUDE.md 8.3
describes exactly how to perform it; the command that sources
`/Users/ivan/rc-secrets/phase2.env` and opens a session-pooler connection was
denied by the harness running this session, twice, and a denial is not retried
around. Nothing was read, nothing was connected to, and no value was seen.

**The card ships anyway, and this is not a shortcut.** P2-09's acceptance is
`tests/e2e/review.spec.ts` against the CI stack, and CI replays every migration
from empty with `supabase db reset`, so 0011 is executed on every push and its
statements are proven to run against a real PostgreSQL. What is outstanding is
only the production database, which is a different question from whether the
file is correct.

### What production looks like until it is applied

Coherent, and no screen behaves differently. 0010 is applied, so every column
the application reads exists. The two things production does not yet have:

1. **The corrected CHECK.** `extraction_drafts_confirmed_pair` is still the
   equivalence form, so deleting an inbound order that a confirmed draft points
   at fails with `23514`. Nothing in the application deletes an inbound order.
   The one file that does is `scripts/reset-test-data.sql`, which belongs to
   **P2-15 and has not run**, so the correct ordering is simply: apply 0011
   before P2-15 is executed. Written onto the P2-15 card.
2. **The function grants.** `confirm_extraction_draft` is executable by
   `PUBLIC`, and `anon` is a member of `PUBLIC`. Nothing is reachable through
   it: the function is `SECURITY INVOKER`, 0009 revoked every table privilege
   from `anon`, and every RLS policy is `to authenticated`, so an anonymous
   caller is refused twice over. It is the same shape as 0008's table grant,
   with the same conclusion: the missing layer is the first of two and the
   second is holding.

### The apply command, for whoever runs it

Three phases per CLAUDE.md 8.5, connection derived per 8.4 (session pooler
`aws-1-eu-west-1`, port 5432, user `postgres.<ref>`, `PGPASSWORD` from
`SUPABASE_DB_PASSWORD`, never a connection string). The file carries its own
`begin`/`commit`, so `psql -v ON_ERROR_STOP=1 -f
supabase/migrations/0011_extraction_confirm_corrections.sql` is the whole apply,
and the two `select` statements after `commit` are the post-check.

**The post-check to read is the reachability one, not the counting one**, per
the learning added on 2026-08-27: expect `anon_can_execute = false` on every row
of the function listing, `authenticated_can_execute = true` on every function
the application calls, and `set_updated_at` false, which is correct because a
trigger function is only ever reached through its trigger.

## 0011_extraction_confirm_corrections - APPLIED

**This entry corrects the one above it,** which was written when the apply had
been refused and read "NOT APPLIED". Per the rules at the top of this file an
entry is never edited after it is written, so the correction is a new entry
naming the one it corrects. Everything the earlier entry says about what the
file does, why it exists and what production looked like without it still
stands; only its status is superseded.

- **Version:** 0011
- **Name:** extraction_confirm_corrections
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T14:05:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), card P2-09
- **Card:** P2-09 (correction to that card's own 0010)
- **Destructive statements:** none that destroy a row. 0 `DROP TABLE`,
  0 `TRUNCATE`, 0 `DELETE`. **One `ALTER TABLE ... DROP CONSTRAINT`, quoted
  verbatim as ruling R-031 requires:**

  ```sql
  alter table public.extraction_drafts
    drop constraint extraction_drafts_confirmed_pair;
  ```

  It removes a CHECK expression and no row, and it is the only way a constraint
  can be relaxed. R-031 widened CLAUDE.md 8.6 to the operations that destroy
  rows and permits this one under exactly these conditions.
- **Parsed before applying:** yes, with `pgsql-parser`, the real PostgreSQL
  grammar. 13 statements: 2 `TransactionStmt`, 2 `AlterTableStmt`
  (`AT_DropConstraint` then `AT_AddConstraint`, both on
  `public.extraction_drafts`), 2 `CommentStmt`, 1 `CreateFunctionStmt`,
  3 `GrantStmt`, 1 `AlterDefaultPrivilegesStmt`, 2 verification `SelectStmt`.
  Forbidden statements found: none.
- **Connection:** derived at runtime per CLAUDE.md 8.4. Session pooler
  `aws-1-eu-west-1`, port 5432, user `postgres.<ref>`, password from
  `SUPABASE_DB_PASSWORD` via `PGPASSWORD` so it never enters a connection
  string. No value printed, no connection string stored.
## 0012_manager_flagged_products

- **Version:** 0012
- **Name:** manager_flagged_products
- **Actor:** EXECUTOR
- **Applied at:** 2026-08-27T15:15:00Z
- **Authority:** ruling R-012 (board-wide secrets read until P2-13), ruling R-032
  (the grant itself), card P2-18
- **Card:** P2-18
- **Destructive statements:** none that destroy a row. 0 `DROP TABLE`,
  0 `TRUNCATE`, 0 `DELETE`. **One `DROP POLICY`, quoted verbatim as ruling R-031
  requires:**

  ```sql
  drop policy products_insert on public.products;
  ```

  It removes a rule about rows and no row. A policy is REPLACED, never edited,
  so there is no other way to change one. R-031's three conditions are met:
  quoted here, parsed below, journalled in this entry.
- **Parsed before applying:** yes, with `pgsql-parser`. **6 statements:**
  2 `TransactionStmt`, 1 `DropStmt` (`removeType: OBJECT_POLICY`, which is the
  near-miss above and not a table), 1 `CreatePolicyStmt`, 1 `CommentStmt`,
  1 verification `SelectStmt`.
- **Connection:** derived at runtime per CLAUDE.md 8.4. Session pooler
  `aws-1-eu-west-1`, port 5432, user `postgres.<ref>`, password from
  `SUPABASE_DB_PASSWORD` via `PGPASSWORD`. No value printed, no connection
  string stored.

### Connectivity

```
select 1 as ok
 ok
----
  1
(1 row)
```

### Phase 1, pre-check

```
extraction_drafts columns: 27
constraint before:
 extraction_drafts_confirmed_pair | CHECK ((((confirmed_inbound_order_id IS NULL) AND (confirmed_at IS NULL))
                                    OR ((confirmed_inbound_order_id IS NOT NULL) AND (confirmed_at IS NOT NULL))))

function EXECUTE reachability before:
          proname          | anon_exec | auth_exec | svc_exec
---------------------------+-----------+-----------+----------
 confirm_extraction_draft  | t         | t         | t
 create_inbound_order      | t         | t         | t
 create_outbound_issue     | t         | t         | t
 current_app_role          | t         | t         | t
 is_owner                  | t         | t         | t
 owner_reminder_recipients | f         | t         | t
 product_available_stock   | t         | t         | t
 receive_inbound_order     | t         | t         | t
 set_updated_at            | t         | t         | t
 ship_outbound_issue       | t         | t         | t

extraction_drafts rows: 0        confirmed rows: 0
ledger (supabase_migrations.schema_migrations), newest three: 0009, 0008, 0007
```

**NINE OF TEN FUNCTIONS WERE REACHABLE BY `anon`, NOT ONE.** The 0011 header
predicted this and it is worth reading against the earlier entry: the defect was
never specific to `confirm_extraction_draft`. PostgreSQL grants EXECUTE to
`PUBLIC` at CREATE FUNCTION time and `anon` is a member, so every function this
schema ever created carried it, from 0001 onward. The single exception,
`owner_reminder_recipients`, is the one migration that knew: 0006 revoked
`from public` and `from anon` by name and re-granted explicitly. That is the
pattern 0011 now applies to the whole schema and to every function created
after it.

Nothing was reachable through any of them: they are all `SECURITY INVOKER`,
0009 had revoked every table privilege from `anon`, and every RLS policy is
`to authenticated`. The first of two layers was missing on nine functions and
the second was holding on all nine.

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1`. The file carries its own `begin`
and `commit`.

```
BEGIN
ALTER TABLE
ALTER TABLE
COMMENT
CREATE FUNCTION
COMMENT
GRANT
GRANT
REVOKE
ALTER DEFAULT PRIVILEGES
   policyname    |  cmd   |      roles      | using_expression | with_check_expression
-----------------+--------+-----------------+------------------+-----------------------
 products_insert | INSERT | {authenticated} |                  | is_owner()
 products_select | SELECT | {authenticated} | true             |
 products_update | UPDATE | {authenticated} | is_owner()       | is_owner()

 products_total | products_flagged
----------------+------------------
            305 |                0
```

`products_flagged = 0` is the number worth reading twice. Not one product in the
client's catalogue carries `needs_review` today, so this policy change grants
nothing retroactively and touches no existing row: it only decides what may be
inserted next.

### Phase 2, apply

One transaction, `psql -v ON_ERROR_STOP=1`. The file carries its own `begin` and
`commit`.

```
BEGIN
DROP POLICY
CREATE POLICY
COMMENT
COMMIT
apply exit: 0
```

### Phase 3, post-check

```
constraint after:
 extraction_drafts_confirmed_pair | CHECK (((confirmed_inbound_order_id IS NULL) OR (confirmed_at IS NOT NULL)))

function EXECUTE reachability after:  anon f on 10 of 10, authenticated t on 10 of 10,
                                      service_role t on 10 of 10
table SELECT reachability after:      anon f on 13 of 13, authenticated t on 13 of 13
tables with RLS:                      13 of 13
```

`set_updated_at` reads `authenticated = t` after the revoke, which is correct
and not a leftover: Supabase's project-level default privileges grant to
`authenticated` at CREATE FUNCTION the same way they grant to `anon`, and only
the `PUBLIC` grant and `anon`'s own were being removed. It is a trigger function
either way, reached through its trigger and never called directly.

### OUTSTANDING, AND IT IS BOOKKEEPING RATHER THAN SCHEMA

**The `supabase_migrations.schema_migrations` rows for 0010 and 0011 were not
written.** The pre-check above is what found it: the ledger's newest row is
`0009`, so **the 0010 apply ran its SQL and never wrote its journal row**, and
the database's own record of what has been applied disagrees with the database.
Anything that reads that ledger to decide what is pending would try to apply
0010 again.

The command that writes both rows was authored and **refused by this session's
sandbox, twice**, with the same refusal recorded for the first 0011 attempt:

```
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: Blocked by classifier.
```

It was not retried a third time. The schema is correct and complete; what is
missing is two rows in a bookkeeping table. `docs/runbooks/apply-0011.md`
carries the exact statements for whoever runs them, and this is the only thing
about 0011 that is still open.
The policy definitions ARE the database-level proof of the rule, so they are
recorded verbatim rather than summarised:

```
   policyname    |  cmd   |      roles      | using_expression |         with_check_expression
-----------------+--------+-----------------+------------------+---------------------------------------
 products_insert | INSERT | {authenticated} |                  | (is_owner() OR (needs_review = true))
 products_select | SELECT | {authenticated} | true             |
 products_update | UPDATE | {authenticated} | is_owner()       | is_owner()

      relname      | rls | policies
-------------------+-----+----------
 extraction_drafts | t   |        4
 products          | t   |        3

 anon_can_insert_products | auth_can_insert_products
--------------------------+--------------------------
 f                        | t
```

Three things to read off that grid, because each is a separate promise:

1. **`products_insert` now has two branches.** The owner keeps the unrestricted
   one. Everyone else gets the flagged one, and `needs_review = true` is the
   whole of the grant.
2. **`products_update` is untouched and still `is_owner()`.** That is what stops
   the grant becoming unlimited creation: an account_manager can bring a flagged
   row in and cannot clear the flag, so every row that role creates stays
   visibly unfinished until an owner accepts it.
3. **`anon` still cannot insert at all.** The table grant revoked in 0009 is
   doing its job underneath the policy, and widening a policy did not widen the
   privilege beneath it.

### Ledger

The `supabase_migrations.schema_migrations` row for 0012 was not written, for the
same reason 0010's and 0011's were not: the command that writes it is refused by
this session's sandbox. `docs/runbooks/apply-0011.md` covers 0010 and 0011 and
the same statement shape applies to 0012, with `version` `'0012'` and `name`
`'manager_flagged_products'`.

---

## LEDGER ROWS 0010, 0011 and 0012 - AUTHORED, PARSED, NOT APPLIED

**Card:** P2-19. **Date:** 2026-08-27. **Applied by:** nobody.

This entry is not a migration apply. It records the state of Supabase's own
bookkeeping table, `supabase_migrations.schema_migrations`, and what was built to
repair it. The schema is correct and complete; the ledger's newest row is `0009`
while the database is at `0012`.

### Phase 1, pre-check

**Not run.** The pre-check is the first two statements of
`scripts/ledger-rows-0010-0012.sql` and runs inside the same transaction as the
inserts, so whoever executes the file sees the before-state and the after-state
without a second connection. Expected: nine rows, `0001` through `0009`,
`ledger_rows_before = 9`.

The evidence that the ledger is at `0009` is not new to this entry. It was read
on 2026-08-27 during the 0011 apply, recorded in this file under
`0011_extraction_confirm_corrections - APPLIED`, and nothing has written to that
table since.

### Phase 2, apply

**Not run.** Authored as three `insert ... on conflict (version) do nothing`
statements inside one transaction that the file deliberately leaves open.

### Phase 3, post-check

**Not run.** Expected: twelve rows, `0001` through `0012`,
`ledger_rows_after = 12`.

### Destructive statements

**None, and this was parsed rather than eyeballed.** The file embeds the three
migrations as string literals, so their own text contains the words `DROP`,
`DELETE` and `ALTER`. A grep finds those hits and a grep is the wrong tool.
`pgsql-parser`, the real PostgreSQL grammar, reports the file as **8 statements:
one TransactionStmt, four SelectStmt, three InsertStmt.** All three inserts
target `supabase_migrations.schema_migrations` and nothing else. No statement in
the file removes a row from any table, so CLAUDE.md 8.6 does not stop it.

The parse runs in CI on every push as `npm run check:ledger-rows`, alongside the
check that the generated file still matches the three migration files it is
generated from. Both were proved to fail on a mutated copy before being added.

### Why it was not applied

The command that opens the connection is refused by the sandbox, before it
executes. The refusal is quoted verbatim in
`docs/runbooks/ledger-rows-0010-0012.md`. A second, narrower probe that ran no
SQL and only asked which postgres clients exist on the machine was refused with
the same text, which is what makes it a blanket refusal rather than a rule about
the statement. It was not attempted a third time.

This is a sandbox limit, not a doctrine limit: CLAUDE.md 8.2 still authorises
EXECUTOR to apply while the project holds zero real client data, and that grant
runs until P2-13.

### What closes this

Ivan runs `scripts/ledger-rows-0010-0012.sql` and pastes the two grids back, or
a Bash permission rule is added that lets a session open the derived pooler
connection, at which point the next scheduled run does it unattended. Until one
of those happens the row for this apply stays **NOT APPLIED**, which is the
whole point of writing it down rather than leaving the gap implicit.
---

## WAVE 1 BATCH, 0013 to 0025 - APPLIED

**Card:** P3-27. **Date:** 2026-08-31. **Applied by:** EXECUTOR terminal, under
ruling **R-082**, through `scripts/apply-pending-migrations.mjs`.

**This is the entry that closes the pending register.** All thirteen lines were
removed by the applier itself on commit, which is also what switched
`npm run check:pending-schema-reads` off by its own design.

Full captured stdout: `docs/reports/p3-27-apply-stdout.txt`.
Report: `docs/reports/2026-08-31-executor-p3-27-apply.md`.

**Connectivity proven first**, per 8.4: `select 1` returned 1 against the
eu-west-1 session pooler on port 5432, server PostgreSQL 17.6.

**The 8.2 precondition was checked and held**: zero real client data. products,
inbound_orders, outbound_issues, batches, order_lines, outbound_lines,
status_history, reminders, extraction_drafts and extraction_draft_lines were all
0. Only categories 18, units 7 and profiles 3, all of them seeded by earlier
migrations or by the test accounts.

### Phase 1, pre-check

Ledger before the batch: **10 rows**, `0001` to `0009` plus `0015` from the enum
pre-phase. **The ledger had been at `0009` while the schema was at `0012`**,
exactly as the P2-19 entry above records. `0010`, `0011` and `0012` had never been
journalled; the applier wrote all three inside the batch and asserted the result.

### Phase 2, apply

**13 files, 202 statements, one transaction, 11 assertions, committed on
all-pass.** 23:27:11Z to 23:27:25Z.

    batch sha256    a5e9e87f46b04839ab83529f2d492f01b123c48f3ee496fd2b64c86324e14667
    script sha256   315448e15f4e02e83d55bb1003fb9c28ff1152b45acd5a4020c54ff4a0b0b9a6

**ONE BOUNDED DEVIATION FROM A SINGLE TRANSACTION, and it is the server's rule.**
PostgreSQL refuses to let a newly added enum label be USED in the transaction that
added it. `0015` adds `'project'` to `status_entity` and `0021` creates
`project_status_history` as `language sql`, whose body names it and is validated
at CREATE time. The enum addition therefore committed in a pre-phase of its own,
carrying exactly one statement, idempotent:

    alter type public.status_entity add value if not exists 'project';

R-082 and CLAUDE.md 8.6 both carry this deviation and its four bounds.

### The destructive-statement declaration, per 8.6

**No `DROP TABLE`, no `TRUNCATE`, no `DELETE` in any of the thirteen files**,
established by parsing each one with `pgsql-parser` before anything executed.

**One `DROP FUNCTION`, quoted verbatim** as that section requires, from `0018`:

    drop function if exists public.create_outbound_issue(text, text, text, jsonb);

It removes a rule about rows and no row. The applier asserted **before** it ran
that the target had zero dependent objects: `0018 gate: dependent objects on the
four-argument function = 0`. After the commit exactly one function remains, with
five arguments.

### Phase 3, post-check

**Ledger after: 25 rows, `0001` to `0025`, no gaps.**

**Row counts identical on every pre-existing table**, which is the
`zero-rows-deleted` assertion as a grid:

    batches 0->0   categories 18->18   extraction_draft_lines 0->0
    extraction_drafts 0->0   inbound_orders 0->0   order_lines 0->0
    outbound_issues 0->0   outbound_lines 0->0   products 0->0
    profiles 3->3   reminders 0->0   status_history 0->0   units 7->7

RLS enabled with 3 policies on each of `clients`, `contacts`, `projects`,
`suppliers`, `devize`, `deviz_lines`. The free-text columns
`outbound_issues.client_name`, `outbound_issues.project_name` and
`products.supplier_name` are **still present and untouched**; they are dropped by
P3-04b and P3-05b, after their backfills are verified against real rows.

**Both reconciliations returned zero because both source tables are empty.** The
backfills proved nothing about real rows, so P3-04b and P3-05b cannot be closed on
this run's evidence.

### The sandbox refusal, and that it was not worked around

The first attempt was refused by the Claude Code auto-mode classifier, the same
blanket refusal recorded for 0010, 0011, 0012 and RST-01. The run stopped, the
exact command and three options went to the owner, he granted the permission, and
the run went through. The refusal is a harness limit, not a doctrine limit, and
the resolution is the one RST-01 established.

---

## 0013_clients.sql - APPLIED

- **Version:** 0013
- **Name:** clients
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0014_contacts.sql - APPLIED

- **Version:** 0014
- **Name:** contacts
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0015_status_entity_project.sql - APPLIED

- **Version:** 0015
- **Name:** status_entity_project
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0016_projects.sql - APPLIED

- **Version:** 0016
- **Name:** projects
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0017_outbound_project_id.sql - APPLIED

- **Version:** 0017
- **Name:** outbound_project_id
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0018_outbound_issue_project_write.sql - APPLIED

- **Version:** 0018
- **Name:** outbound_issue_project_write
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0019_suppliers.sql - APPLIED

- **Version:** 0019
- **Name:** suppliers
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0020_search_clients.sql - APPLIED

- **Version:** 0020
- **Name:** search_clients
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0021_projects_search_and_status.sql - APPLIED

- **Version:** 0021
- **Name:** projects_search_and_status
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0022_client_detail.sql - APPLIED

- **Version:** 0022
- **Name:** client_detail
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0023_project_material_summary.sql - APPLIED

- **Version:** 0023
- **Name:** project_material_summary
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0024_project_material_cost.sql - APPLIED

- **Version:** 0024
- **Name:** project_material_cost
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.

## 0025_deviz.sql - APPLIED

- **Version:** 0025
- **Name:** deviz
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-08-31T23:27:25Z
- **Authority:** ruling R-082, card P3-27
- **Card:** P3-27

Applied as part of the wave 1 batch. The three-phase journal for this file is the
batch entry above, `WAVE 1 BATCH, 0013 to 0025 - APPLIED`: it ran inside that one
transaction, its ledger row was written in the same transaction, and the
post-check grid covers it. Captured stdout:
`docs/reports/p3-27-apply-stdout.txt`.
---

## 0026_drop_outbound_free_text.sql - APPLIED

- **Version:** 0026
- **Name:** drop_outbound_free_text
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-09-01T13:14:47Z
- **Authority:** ruling R-082, card P3-04b, owner ratification of 2026-09-01
- **Card:** P3-04b

Full captured stdout: `docs/reports/p3-04b-apply-stdout.txt`.
Report: `docs/reports/2026-09-01-executor-p3-04b-drop.md`.

### Phase 1, pre-check

Taken on production in the same session as the apply:

    select count(*) from public.outbound_issues where project_id is null;  -> 0
    select count(*) from public.outbound_issues;                           -> 0

**THE FIRST ZERO IS TRUE BECAUSE THE SECOND IS.** No row was matched because no
row existed. This apply did not verify a backfill and its evidence must not be
read as though it had. The owner ratified the drop on that stated basis.

Ledger before: 26 rows expected after; `client_name`, `project_name` and
`project_id` all present beforehand.

### Phase 2, apply

One file, one transaction, **12 of 12 assertions passed**, committed on all-pass.
13:14:44Z to 13:14:47Z.

    script sha256   see docs/PRODUCTION-WRITES.md row for 2026-09-01

**THE FIRST ATTEMPT ROLLED BACK AND NOTHING WAS COMMITTED.** Every existence
assertion built its SQL array from a JavaScript set, and this batch creates no
table, so it emitted `array[]` with no type and PostgreSQL refused: "cannot
determine type of empty array". The applier did exactly what it is for, the
defect was fixed, the shim proof was re-run to 14 of 14, and the apply was
repeated. Recorded because a rollback that worked is evidence, not an
embarrassment.

### The destructive-statement declaration, per 8.6

No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, established by parsing the file with
`pgsql-parser` before anything executed.

**One `DROP FUNCTION`, quoted verbatim:**

    drop function if exists public.backfill_outbound_project_ids();

**One `DROP COLUMN`, quoted verbatim:**

    alter table public.outbound_issues drop column client_name, drop column project_name;

Neither reduces the number of rows in any table, which is the test 8.6 applies.
The applier's `zero-rows-deleted` assertion compared every table's count before
and after and found them identical.

### Phase 3, post-check

Verified from a fresh connection after the commit:

    client_name, project_name              -> ABSENT
    project_id                             -> present, is_nullable = NO
    backfill_outbound_project_ids          -> dropped
    create_outbound_issue                  -> exactly one, (text, text, text, jsonb, uuid)
    ledger                                 -> 26 rows, highest 0026
    products 0, outbound_issues 0, categories 18, units 7, profiles 3  -> unchanged
---

## 0027_drop_products_supplier_name.sql - APPLIED

- **Version:** 0027
- **Name:** drop_products_supplier_name
- **Actor:** EXECUTOR terminal, under R-082
- **Applied at:** 2026-09-01T13:58:32Z
- **Authority:** ruling R-082, card P3-05b, owner ratification of 2026-09-01
- **Card:** P3-05b

Full captured stdout: `docs/reports/p3-05b-apply-stdout.txt`.
Report: `docs/reports/2026-09-01-executor-p3-05b-drop.md`.

### Phase 1, pre-check

    select count(*) from public.products
     where supplier_id is null and supplier_name is not null
       and btrim(supplier_name) <> '';                       -> 0
    select count(*) from public.products;                    -> 0

**THE FIRST ZERO IS TRUE BECAUSE THE SECOND IS.** No row was matched because no
row existed, and 0019's backfill had created zero suppliers and linked zero
products. This apply did not verify a backfill and its evidence must not be read
as though it had. The owner ratified the drop on that stated basis.

All three `supplier_name` columns present beforehand, on `products`,
`inbound_orders` and `extraction_drafts`.

### Phase 2, apply

One file, one transaction, **12 of 12 assertions passed**, committed on all-pass.
13:58:29Z to 13:58:32Z.

**THE FIRST ATTEMPT ROLLED BACK AND NOTHING WAS COMMITTED.** The applier's
reconciliation grid named `client_name`, which migration 0026 had dropped in the
PREVIOUS batch. The grid keyed off the set of columns the CURRENT batch declares
it will drop, and a column dropped earlier is not in that set. Both the grid and
the supplier reconciliation now build themselves from `information_schema` at run
time. **A batch's declarations describe what it CHANGES, never what EXISTS**, and
this was the third time that confusion produced a defect.

### The destructive-statement declaration, per 8.6

No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, established by parsing the file with
`pgsql-parser` before anything executed.

**One `DROP FUNCTION`, quoted verbatim:**

    drop function if exists public.backfill_product_suppliers(integer);

**One `DROP COLUMN`, quoted verbatim:**

    alter table public.products drop column supplier_name;

Neither reduces the number of rows in any table.

### Phase 3, post-check

Verified from a fresh connection after the commit:

    products.supplier_name                      -> ABSENT
    inbound_orders.supplier_name                -> present, untouched
    extraction_drafts.supplier_name             -> present, untouched
    products.supplier_id                        -> present, is_nullable = YES
    backfill_product_suppliers                  -> dropped
    ledger                                      -> 27 rows, highest 0027
    products 0, suppliers 0, categories 18, profiles 3  -> unchanged

`supplier_id` stays NULLABLE deliberately: a product may genuinely have no
supplier, which is not true of an outbound issue and its project.
