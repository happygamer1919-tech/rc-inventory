# Production writes that are not migrations

**Created 2026-08-28 by ruling R-055. Card REC-02.**

The sibling of `docs/migrations/APPLY-LOG.md`. That file is, by its own framing,
a **migrations** log: authored `supabase/migrations/NNNN_name.sql` files, applied
in three phases under `CLAUDE.md` 8.5. This file is everything else that has
written to the production database.

**Why it exists.** Until ruling R-047 there was exactly one way to write to
production and exactly one journal. R-047 created a second: an
assertion-bearing script, executed by a terminal. The first such run happened the
same day, and its record lived in a report and a board field, nowhere a reader
looking for "what has been done to the production database" would think to look.
One run is survivable. **Two write paths and one log is a record that has quietly
stopped being complete**, and nobody finds out until they are relying on it.

**The rule, and it is in `CLAUDE.md` section 8 so a session that never opens this
file still obeys it: a row goes in here BEFORE the PR that performs the write is
merged.** Not after, not in a follow-up. A write with no row is the failure this
file was created to prevent, and this project has already paid for that failure
once, on 2026-08-28, when a run the owner performed was ratified in chat and
never committed. Two later dispatches were then written against a record that did
not exist.

## What a row carries, and why each field is there

| field | the question it answers |
|---|---|
| **date** | when the write happened, UTC |
| **actor** | who or what ran it, by name: the owner, or the role of the terminal |
| **script sha256** | **exactly which bytes ran**, not which file name |
| **assertions** | how many pass conditions the script evaluated on itself, and the result |
| **rows** | the blast radius, as a number |
| **report** | where the grids are |

**The sha256 is the field that matters most and it is the easiest to leave out.**
A file name identifies a path, not a version. `scripts/reset-test-data.sql` meant
two materially different files eleven hours apart on 2026-08-28, and a log
carrying only the path cannot tell them apart. The difference between those two
versions is three products and a category.

## The log

| date | actor | script | sha256 | assertions | rows | report |
|---|---|---|---|---|---|---|
| 2026-08-28 | **Ivan, the owner**, by hand with `psql` | `scripts/reset-test-data.sql` | `6887402172e690aa4c48fc43de1994841eed5447a289312d1dc90f84c061f1f8` | **none.** The file printed grids and a human decided | **1221** | `docs/reports/2026-08-28-owner-p2-15-reset-run.md` |
| 2026-08-28 | **EXECUTOR terminal**, under R-047 | `scripts/reset-test-data.sql` | `542e7bc72a6edc4123e6cd15b519401cf7d91f39d24fd954ab9bdf94eeb42d7f` | **20 of 20 passed**, gate committed on all-pass | **20** | `docs/reports/2026-08-28-executor-rst-01-run.md` |
| 2026-08-31 | **EXECUTOR terminal**, under R-082 | `scripts/apply-pending-migrations.mjs` | `315448e15f4e02e83d55bb1003fb9c28ff1152b45acd5a4020c54ff4a0b0b9a6` | **11 of 11 passed**, committed on all-pass | **0 rows deleted**, 13 migrations applied (0013 to 0025) | `docs/reports/2026-08-31-executor-p3-27-apply.md` |
| 2026-09-01 | **EXECUTOR terminal**, under R-082 | `scripts/apply-pending-migrations.mjs` | `ba36aecb6e4d6de759d9b6b7fee274ea0a1ce383f22dd6d05febb3476a8292fe` | **12 of 12 passed**, committed on all-pass | **0 rows deleted**, 1 migrations applied (0026 to 0026) | `docs/reports/2026-09-01-executor-p3-04b-drop.md` |
| 2026-09-01 | **EXECUTOR terminal**, under R-082 | `scripts/apply-pending-migrations.mjs` | `a37407bb8a296aa3248497b6b8aa8d31452bd7b144605e367996f1b0508ca238` | **12 of 12 passed**, committed on all-pass | **0 rows deleted**, 1 migrations applied (0027 to 0027) | `docs/reports/2026-09-01-executor-p3-05b-drop.md` |
| 2026-09-02 | **EXECUTOR terminal**, card EXT-08 | `scripts/ext/serve-sample-documents.mjs` | `f3f0ec96779b6ccb916ac5ec20ef4962a7073445931d0d9dce43bf14e8848404` | **none.** The script writes objects and reads back responses; the assertions for this card are `npm run check:document-url` (22 cases) and `tests/e2e/document-url.spec.ts` (8 cases), both in `quality` | **0 database rows.** 4 objects written to storage under `rc-docs/_samples/andre/`, plus one throwaway probe object written and deleted | `docs/reports/2026-09-02-executor-ext-08-sample-documents.md` |

**Total written to production outside a migration: 1,241 rows, both on
2026-08-28, both deletions, both against the Rapid Construct project
`bwhzatwwjqmyfesfnisa`.**

## The storage row, which is the first one that is not the database

**2026-09-02 is the first row here that wrote to production STORAGE and not to
the production database.** It is in this file rather than in a third one because
the question this file answers is "what has been done to production", and a
reader asking that question is not asking it one backing service at a time. The
header of this file says "the production database"; that wording is now narrower
than its own purpose, and widening it is a documentation card rather than a
reason to keep the write unlogged.

**It has no assertion count and the field says so instead of saying zero.** The
script writes four objects and captures responses; there is nothing for it to
assert about a database. What holds this card is two checks in `quality`, both
named in the row.

## Notes on the two backfilled rows

**They are backfilled, and this file says so rather than implying it was always
here.** Both runs predate the ruling that created this log. Neither row is a
reconstruction: the first is transcribed from the owner's own grids, checked
arithmetically in its report, and the second is the terminal's captured stdout.

**The two rows are the argument for R-047 in one line.** The first run had **no
assertions**: the file printed grids and the operator decided. One of its numbers
was not what he had been told to expect, and it committed anyway. It committed
correctly, for reasons ruling R-048 records, but correctness by judgement is not
a control and it reads identically to the case where the judgement was wrong. The
second run had **20 assertions and no decision to make**. Its blast radius was
five times the forecast, and that changed nothing about its safety, because
nobody was asked to approve it.

**Neither row is a migration and neither belongs in `APPLY-LOG.md`.** The
migration ledger still says `0009` while the schema is at `0012`; correcting that
is a migration-path write and it is journalled over there, not here.
