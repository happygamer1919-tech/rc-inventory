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
| 2026-09-08 | **EXECUTOR terminal**, card GATE-01 | `scripts/prove-anon-write-refused.mjs` | `c2e90696676fc18db23d0469ce543146ac99097561f26c4487b20d90f2a3e51c` | **3 of 3 passed.** The script decides: exit 0 only when all three inserts are refused with 42501 | **0 rows.** 3 INSERTs ATTEMPTED and 3 refused by PostgreSQL before any row existed | `docs/reports/2026-09-08-executor-gate-01-anon-write.md` |
| 2026-09-14 | **EXECUTOR terminal (ORANGE)**, on the owner dispatch of 2026-09-14, step 4 | `scripts/ext/document-url-test-links.mjs --object-not-found` | `794b2202467fee2e38ab89fc502ba4edb66d4e37e72352f9cef4db258665ca34` | **1 of 1 passed in the script**: the link was written only after the live route answered 404, `OBJECT_NOT_FOUND`, `application/json`; exit 0. Rechecked independently at 2026-09-14T22:58:20Z, same answer | **0 database rows by SQL.** In storage: 1 placeholder object `rc-docs/_samples/andre/ext-30-object-not-found.pdf` UPLOADED (upsert), signed with the sample TTL of R-096, then DELETED; net 0 objects | `docs/reports/2026-09-14-executor-orange-ext-28-merge-and-closeout.md` |
| 2026-09-15 | **EXECUTOR terminal (ORANGE)**, on the owner dispatch of 2026-09-15, steps 3 and 4 | `scripts/ext/serve-sample-documents.mjs`, run twice: run A with `RC_SAMPLES_DIR` holding only the two fixtures, 2026-09-15T13:16:21Z to 13:16:31Z; run B with `--capture-only` and `RC_SAMPLES_DIR` holding all six, 13:16:31Z to 13:16:40Z | `1b840b65ebd7b96f5b92807e383f7aaa65f09c44a771ef0333ae0d14fe5817ab` | **none in the script**, as in the 2026-09-02 row; both runs exit 0. Checked afterwards by reads only: the prefix lists 6 objects and 0 probe objects; both new objects downloaded back with sha256 equal to the local files; all six signed links GET 200 `application/pdf` through the route with sha256 equal to the local files, 6 of 6 | **0 database rows.** In storage: 2 objects UPLOADED, `rc-docs/_samples/andre/factura-nordavex-0002718.pdf` and `rc-docs/_samples/andre/confirmare-comanda-lumicast-5531.pdf`; 2 throwaway probe objects `rc-docs/_samples/andre/_probe-<ms>.pdf` written and deleted, one per run; the four existing objects NOT written | `docs/reports/2026-09-15-executor-orange-andre-fixtures.md` |
| 2026-09-15 | **EXECUTOR terminal (ORANGE)**, on the owner dispatch of 2026-09-15 that followed #297, step 4 | `scripts/ext/serve-sample-documents.mjs --capture-only`, run C, `RC_SAMPLES_DIR` holding all six, 2026-09-15T16:01:17Z to 16:01:31Z | `052039be199b79096bcb4c9f08ce6ab114ad86d3e3e599fe4b180d5385ccdfb8` | **none in the script**; exit 0. Checked afterwards by reads only: the prefix lists 6 objects, 0 probe objects, and 0 objects updated after run A's upload; all six signed links GET 200 `application/pdf` through the route with sha256 equal to the local files, 6 of 6 | **0 database rows.** In storage: 0 documents written; 1 throwaway probe object `rc-docs/_samples/andre/_probe-<ms>.pdf` written and deleted | `docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md` |
| 2026-09-17 | **EXECUTOR terminal**, on the owner dispatch of 2026-09-17, Part 3, under **R-206**, which ratifies it and which lands in the same pull request as this row | an upload-only script written for this dispatch, run as `andre-sample-put.mjs upload`, kept outside the repository and printed verbatim in the report | `aa5afbeb287cf0fd06eefbaee3a8e0b48f2aa1102093088592cf9cbb08300a9c` | **2 of 2 passed in the script**: the target object name was absent from the prefix listing before the write, and the stored size read back equals the local size; it exits non-zero on either failing | **0 database rows.** In storage: 1 object UPLOADED, `rc-docs/_samples/andre/aviz-silvamat-0044213.pdf`, 45942 bytes, with `upsert: false` so an existing name would have failed rather than overwritten; NO probe object, NO signed URL, and the six existing objects NOT written. The prefix went from 6 objects to 7 | `docs/reports/2026-09-17-executor-r203-r206-regression-file-and-handover.md` |

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

**Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six documents since 2026-09-15, and R-096 as amended that day covers every document under that prefix, not a fixed count of four. The four named here are the original set; nothing above is changed.

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

## The attempted-write row, which is the first one that wrote nothing

**2026-09-08 is the first row here for a run that was SUPPOSED to fail, and it is
in this file for the same reason every other row is.** Card GATE-01 sends three
INSERTs to production carrying the public anon key, and the whole point is that
PostgreSQL refuses all three. Its `rows` field is 0 and always will be, on every
future re-run.

**Why log a write that did not happen.** This file answers "what has a terminal
pointed at production", and a reader auditing that question is not helped by a
log that silently omits the requests whose outcome was good. The row is also what
makes the run REPEATABLE without alarm: somebody reading the access logs a month
from now finds three POSTs from a terminal against `clients`, `contacts` and
`suppliers`, and this row is where they find out what they were.

**If the row count is ever not 0, that is an incident and not a bigger number.**
A successful insert here means the anon grant is open on production. The script
does not clean up after itself, prints the row it created, and exits non-zero.

## The test-link row, which is a placeholder written and deleted on purpose

**2026-09-14 is a storage write whose only purpose is to leave NOTHING behind.** `OBJECT_NOT_FOUND` is the answer Supabase Storage gives only to a VALID signature over an object that is gone, so the script uploads a placeholder PDF of a few bytes to `rc-docs/_samples/andre/ext-30-object-not-found.pdf`, signs it, deletes it, and requests the signed link through `https://app.rapidconstruct.md/api/documents/`. The run took 2026-09-14T22:57:45Z to 22:57:47Z. The placeholder holds no client data and is not there afterwards. The link itself is kept outside the repository, in `/Users/ivan/rc-samples/EXT-30-TEST-LINKS.md` with mode 600, for the counterparty; it answers `OBJECT_NOT_FOUND` until its sample TTL runs out and `EXPIRED_TOKEN` after. **No key, token or signed URL is in this file or in any commit.**

## The fixture row, which added two objects and signed six links

**2026-09-15 adds two objects that stay.** `factura-nordavex-0002718.pdf` and `confirmare-comanda-lumicast-5531.pdf` are synthesized supplier documents, digital source, built for the two refusal arms the counterparty asked fixtures for: one whose line sums disagree with a sound printed total, one with a line missing its total. They contain no client paperwork and no real supplier identity. Their sha256 are in the upload table of `docs/reports/2026-09-02-executor-ext-08-sample-documents.md`.

**Why the script ran twice rather than once.** The script uploads every PDF in `RC_SAMPLES_DIR` with `upsert`. One run over all six would have rewritten the four existing objects with identical bytes, a write to four objects the dispatch did not name. Run A therefore held only the two new files. Run B used `--capture-only`, which uploads nothing and signs every file, over all six. Each run also writes and deletes its own probe object, and the prefix listing afterwards shows none left.

**Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six documents since 2026-09-15, and R-096 as amended that day covers every document under that prefix, not a fixed count of four. The four named here are the original set; nothing above is changed.

**The TTL is R-096's, and R-096's text names four documents.** The dispatch signs six at `TTL_SECONDS`. That is recorded in the report as a deviation for the owner, not settled by this row.

**Note 2026-09-15, card EXT-33:** the sample set under `_samples/andre` holds six documents since 2026-09-15, and R-096 as amended that day covers every document under that prefix, not a fixed count of four. The four named here are the original set; nothing above is changed.

The six links are kept outside the repository, in `/Users/ivan/rc-samples/ANDRE-SAMPLES-2026-09-15.md` with mode 600, and expire at 2026-09-16T13:16:31Z. **No key, token or signed URL is in this file or in any commit.**
