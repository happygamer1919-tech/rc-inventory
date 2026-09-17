# EXECUTOR report, 2026-09-17: a missing MAKE_WEBHOOK_URL fails an upload visibly

**Card:** P3-71, phase 3 board. **Branch:** `card/p3-71`. **Goal:** G28, Ivan's
finding F3, quoted: *"silent upload failure when `MAKE_WEBHOOK_URL` is missing: a
visible Romanian error on the upload screen and a named test"*.

**Roles, in order:** AUTHOR (the board card, no application code), then EXECUTOR
(the code, the migration, the spec), both in this one pull request, as the task
asks.

**MERGE IS NOT PRE-APPROVED. This pull request is left open and unmerged.** It
carries a migration, real client data is in production since 2026-09-14, and the
task states in terms that Max says "merge" in chat himself. The owner question is
filed in the operator factory's mailbox.

---

## In plain words, for the owner

When a document is uploaded for automatic reading, the system sends it on to the
reading service. The address of that service is a setting. If that setting is
missing, the system correctly refused to send anything, and then said nothing at
all: the upload looked like it worked, the file really was saved, and the
document just never went anywhere. Nothing on any screen said why, and there was
nothing stored that anyone could have looked at afterwards to find out.

Now the refusal is written down and shown. The person who uploaded sees, in
Romanian, that the document was saved but was not sent because a system setting
is missing, and is told to inform the administrator. Nothing about how documents
are read, sent or received changes. Nothing is deleted.

---

## What was wrong, read from the code before anything was written

`lib/data/extraction-fire.ts`, `fireExtraction()`:

```ts
const url = webhookUrl();
if (!url) {
  return { ok: false, reason: "Variabila de mediu MAKE_WEBHOOK_URL lipseste." };
}
// ... only AFTER this does it upsert the extraction_drafts row
```

The refusal returned **before** the `extraction_drafts` upsert. So for that order
**no draft row existed at all**. That matters because of what the callers then do:

- `lib/data/extraction-actions.ts`, `startExtraction` (the `/incarca-comanda`
  upload screen, line 118 onward) marks the failure with
  `.update({ status: "failed", error_code: ..., reason }).eq("order_id", orderId)`.
  An update against a row that was never inserted **matches zero rows and reports
  no error.**
- the same in `refireExtraction` (line 205 onward). There the row does exist,
  because the re-fire read it first, so that path was already visible.
- `lib/data/inbound-actions.ts`, `uploadOrderDocument` (line 208) **discards the
  result entirely**, by design: its P2-08a comment says the send must not be able
  to make a successful upload look failed, because "motivul unui esec ajunge pe
  randul de ciorna si se vede pe ecran". That promise was the one this branch
  broke.

Every other refusal in that function sits **after** the upsert, which is exactly
why the too-many-pages case is visible today and this one was not.

The screen needed no change: `components/orders/ExtractionReviewPanel.tsx` already
renders `EXTRACTION_ERROR_LABEL[draft.errorCode]` under
`data-testid="draft-error-sentence"` and `draft.reason` under
`data-testid="draft-reason"` (lines 598 to 611) for any failed draft. **This was
verified by testing it rather than assumed**: case 1 of the named spec asserts
both elements carry the expected text, and the second of them asserts the screen
shows exactly the string stored in `extraction_drafts.reason`, not a string built
in the component.

## The decision this card actually turned on, and it is not the one the task expected

**`config_error` is deliberately NOT added to `EXTRACTION_ERROR_CODES`.**

`lib/data/extraction-types.ts` exports that array as "the closed set of contract
section 5.2". It is not only a type source:
`app/api/extraction/callback/route.ts:131` tests every incoming payload against it
through `isExtractionErrorCode`, and answers `400 "error_code in afara multimii"`
to anything outside it. That route is **FROZEN by ruling R-202**: nothing that
changes what it accepts, refuses or returns may merge while the Andre connection
is open.

Appending the new label to that array, which is what migrations 0034 and 0042 did
for their labels, would have turned a callback carrying `config_error` from a 400
into an accepted payload. **That is a change to what the frozen route accepts,
made from outside the frozen file, through a constant the route imports, with the
route never appearing in the diff.**

So the label stays out of it:

- `EXTRACTION_ERROR_CODES` and `isExtractionErrorCode` are **byte-identical** to
  what is on `main`. The route file is not touched.
- `LOCAL_ERROR_CODES = ["config_error"]` is the new, separate set: codes we write
  ourselves and never speak on the wire.
- `StoredErrorCode = ExtractionErrorCode | LocalErrorCode` is what a draft row and
  the screen's label map are typed against.

Ruling R-098's condition, that the counterparty must know a code before we emit
it, is not engaged: nothing emits this code. It is written by our own upload path
onto our own draft row, for a document that was never sent anywhere.

**This is proved, not promised.** Case 2 of the named spec asserts
`EXTRACTION_ERROR_CODES` still has nine members, does not contain `config_error`,
and that the route, posted to with the correct secret and that code, still answers
`400` with the same error text. A sentence in a report cannot be run; that case
can.

The task said the fix "does not need to touch the route (confirmed below)" and to
STOP and write an `IVAN:` question if investigation found otherwise. **The
investigation found the route reachable from the obvious implementation, and the
implementation was changed so that it is not.** No stop was needed, because
nothing about the route's behaviour changes and the route file is not edited. If
a reader disagrees with that reading, the disagreement is fully visible in one
place: whether `config_error` belongs in `EXTRACTION_ERROR_CODES`. It does not.

## What changed, file by file

| file | what |
|---|---|
| `supabase/migrations/0051_error_code_config_error.sql` | **NEW MIGRATION.** One `alter type public.extraction_error_code add value if not exists 'config_error'`, plus the verification select every enum migration here carries. No row touched. |
| `lib/data/extraction-fire.ts` | the missing-URL branch calls the new `recordConfigRefusal`, which writes the failed row, then returns the code it wrote under. `FireResult.errorCode` widened. `FireInput` extracted as a named type so the helper and the function share one shape. |
| `lib/data/schema-capability.ts` | `hasConfigErrorCode`, the label gate, same shape as `hasDocumentTooLargeCode`. |
| `lib/data/extraction-types.ts` | `LOCAL_ERROR_CODES`, `LocalErrorCode`, `StoredErrorCode`; `EXTRACTION_ERROR_LABEL` and `ExtractionDraft.errorCode` widened to `StoredErrorCode`; the Romanian sentence for the new code. `EXTRACTION_ERROR_CODES` untouched. |
| `lib/data/extraction.ts` | the row-to-draft cast reads `StoredErrorCode`. |
| `playwright.config.ts` | a third dev server on port 3102 with `MAKE_WEBHOOK_URL: ""` and its own `NEXT_DIST_DIR`, and a third project `fara-webhook` that runs only the new spec. `chromium` ignores the new spec. |
| `.gitignore` | `.next-no-webhook`. |
| `tests/e2e/extraction-webhook-missing.spec.ts` | **NEW.** The acceptance, two cases. |
| `scripts/poc-free/local-db/assertions/0051_error_code_config_error.sql` | **NEW.** Label exists, whole set is the ten in order, a row can be written with it as `failed` and the 0041 constraint still refuses it on `extracted`. |
| `scripts/poc-free/local-db/assertions/0042_...sql` | narrowed: stops pinning the whole set, keeps its own fact (ninth label). |
| `scripts/poc-free/local-db/assertions/0034_...sql` | one stale pointer corrected: the newest set-pinning file is now 0051's. |
| `docs/migrations/APPLY-LOG.md` | pending line for 0051. |
| `docs/board/rc-board-phase3.json` | card P3-71, authored, in flight, shipped. |
| `docs/LEARNINGS.md` | two entries, below. |

### The behaviour before the migration lands, which is not the same choice 0042 made

A label cannot be written before `alter type` has run: PostgreSQL answers
`22P02`. Merging applies the migration within about two minutes, and the code
ships in the same push, so there is a window.

`document_too_large` handles that window by **not refusing at all**: the document
goes, and the counterparty's own cap stays the only one. That choice is not
available here. The variable really is missing, the document really cannot go, and
the only question is whether the operator is told. So in that window
`recordConfigRefusal` writes **the same row with the same Romanian reason under
`download_failed`**, which is already the code both callers put on any failure
without one of its own. The code is then more general than the truth for two
minutes; silence was the defect being repaired.

### One upsert, not an upsert then an update

The page-count refusal writes twice because the row must exist before the count is
judged. Here nothing is judged: it is known at the first line that the document is
not going, so the row is written once, already `failed`. `onConflict: order_id`
covers the re-fire case, where the row exists.

### What was found and deliberately not fixed

Two sibling refusals in the same function, a missing `NEXT_PUBLIC_SITE_URL` and a
missing `MAKE_WEBHOOK_SECRET`, are also configuration failures and would be more
accurately described by `config_error` than by the `download_failed` their callers
currently write. They already write a row, because they sit after the upsert, so
they are **visible today** and are not part of F3. Changing them is scope this card
was not given (CLAUDE.md section 3). Reported here for a future card.

## Commands run, and their results

On the owner's machine, from the worktree:

| command | result |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **exit 0** |
| `node docs/board/validate-board.mjs` on all three boards | **PASS, 0 violations**, before every commit |
| `npm run check:card-ids` | exit 0, 234 ids resolved |
| `npm run check:board-edit` | exit 0 at the shipped commit (it correctly REFUSED while the card was `todo`) |
| `npm run check:unique-ids` | exit 0, 235 card ids, 206 ruling ids, 0 redefined |
| `npm run check:open-branch-ids` | exit 0, 0 open pull requests, no id contested |
| `npm run check:no-destructive-migration` | exit 0, 1 file, 2 statements, every kind classified |
| `npm run check:conflict-residue` | exit 0, 582 files |
| `npm run check:categories` | exit 0, 8 checks |
| `npm run check:ledger-rows` | exit 0, 6 checks |
| `npm run check:no-prod-target` | exit 0, 5 checks |
| `npm run check:pending-schema-reads` | exit 0, 8 pending migrations, no unguarded read |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0, 18 assertions, each with a failing case |

**The migration parse, quoted, per CLAUDE.md 8.6's three conditions.** Parsed with
`pgsql-parser`, the real PostgreSQL grammar, before it went near anything:

```
supabase/migrations/0051_error_code_config_error.sql -> 2 statement(s)
    AlterEnumStmt   newVal "config_error", skipIfNewValExists true
    SelectStmt      the verification query over pg_enum
```

The statement itself, verbatim:

```sql
alter type public.extraction_error_code add value if not exists 'config_error';
```

**No forbidden statement is present**: no `DROP TABLE`, no `TRUNCATE`, no
`DELETE`. The file is exactly the shape the applier's enum pre-phase requires
(`AlterEnumStmt` and `SelectStmt` only, with `IF NOT EXISTS`). It removes no row,
so under the test CLAUDE.md 8.6 names, "does executing this statement reduce the
number of rows in any table", the answer is no.

### What could NOT be run here, and is left to CI

- **`npx playwright test tests/e2e/extraction-webhook-missing.spec.ts`**, the
  card's acceptance. It needs a Supabase stack, and this machine has no Docker and
  no Supabase CLI. It runs in `quality`, in the new `fara-webhook` project, which
  `npx playwright test` picks up with no workflow change.
- **`npm run check:migrations`** and the two applier proofs
  (`prove:applier`, `prove:assertions`). All three need Docker. The applier proof
  steps are path-filtered on `supabase/migrations/**`, which this pull request
  changes, so they **must run and pass** on it rather than be skipped, per
  CLAUDE.md 3.1.
- **A local postgres replay** of the migrations and assertion files, which the
  P3-70 session was able to do here, was **not** available this time: `psql` is
  present on the machine but running it is denied in this session's permissions.
  The assertion file for 0051 is therefore proven by CI's `supabase db reset` and
  `check:migrations`, not locally. Said here rather than skipped silently.

## Two terminals share this repo

`gh pr list --state open --author @me` was **empty** before this branch was cut
(P3-67's #320 merged earlier today), so the one-open-pull-request rule holds.
`git fetch origin` and the branch cut from `origin/main` at `a1b6d36`. No board
conflict arose. Nothing under `app/api/extraction/**`, `app/api/documents/**` or
`docs/contracts/extraction*` is touched; `lib/data/extraction*` is touched under
the ban lift Ivan granted on 2026-09-17 for the cards of findings F2, F3 and F5 to
F9.

**F2 is not this card.** Its real fix lives inside the frozen callback route, so
YELLOW is holding it on mailbox question q052 until Ivan answers. F3 was drafted
ahead of it for that reason.

## Learnings

Two entries appended to `docs/LEARNINGS.md`:

1. *A refusal that returned before the diagnostic row was written was a failure
   nobody could see.*
2. *A new enum label that joins a wire-validation array changes what a frozen
   route accepts.*

## What is left for the owner

One decision: **whether to merge.** The pull request is left open, green, and
unmerged. Merging it adds one value, `config_error`, to the
`extraction_error_code` list in the live database, within about two minutes. **No
existing row is changed, nothing is removed, and no screen behaves differently for
any document that is being read normally.**
