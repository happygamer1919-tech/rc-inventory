# EXECUTOR, card P3-103: a document sent a second time leaves one row, not two

Role: AUTHOR, then EXECUTOR, in one pull request.
Card: P3-103, phase 3 board, allocated with `npm run id:free -- P3-103` (FREE, lane highest P3-102,
zero open pull requests).
Branch: `card/p3-103`, worktree `/Users/sm33xy/Projects/rc-inventory-worktrees/g60-resend-supersede`,
cut from `origin/main` at `a3bda7e`.
Goal: the operator factory's G60, Ivan's finding F25 of 2026-09-26.

---

## In plain words, for the owner

When the same supplier document was sent to be read a second time, the person checking documents saw
it twice. The earlier attempt stayed in the list beside the newer one, so a document whose reading had
failed and been retried looked like two separate documents waiting.

From this card it appears once. The earlier attempt is not thrown away. It is kept, marked as
replaced, and can still be opened from the newer one, where it says "Înlocuit de retrimiterea din"
and the date of the newer send. No count on that screen counts it any more. Nothing is deleted, ever.

**One thing in the finding turned out to be wrong, and it is worth a sentence because it changed what
was built.** The finding blames the "Retrimite" button. The button is not the cause and never could
have been, and fixing it the way the finding suggested would have broken something that is currently
working. The real cause is uploading the same document again. That is where the fix went. The section
below shows how that was settled.

---

## STEP 0: which path actually minted the new order_id

The task required this to be settled before any code was written, and it required a stop if the fix
would have touched the idempotency key. Both mattered.

### What the code says

`refireExtraction` in `lib/data/extraction-actions.ts` re-fires the **same** `order_id`. Its doc
comment, unchanged by this card, gives the reason:

> "Retrimite ACELASI document cu ACELASI order_id. Asta este ce face retrimiterea sigura: prin regula
> de idempotenta a contractului (sectiunea 2.2) rezultatul INLOCUIESTE extragerea precedenta in loc sa
> adauge a doua ciorna. **Un order_id nou ar produce exact duplicatul pe care cheia de idempotenta
> exista sa il previna.**"

So the button cannot mint an `order_id` and cannot leave a second row. `startExtraction`, by contrast,
calls `randomUUID()` on every upload, which does mint one.

### What settled it, since there is no local stack

The task asked for a reproduction on the local stack. **This machine has no Docker and no Supabase
CLI** (`which docker` and `which supabase` both come back empty), so there is no local database to run
the application against, and production must never be opened. A reproduction by clicking was not
available here, and the acceptance spec is the reproduction: it runs in CI against a real Supabase.

The finding's own numbers settle it without one, and they settle it decisively. Ivan reports, from
Andre's side:

> **five executions, five order_ids, three documents**

A refire adds an execution **without** adding an order_id. So if the button had been pressed even
once, executions would outnumber order_ids. They are equal. Therefore **every one of the five sends
was a fresh upload**, and the arithmetic closes exactly: three documents uploaded once each, two of
them uploaded a second time, is five order_ids and five executions.

### The answer, plainly

- **The duplicate came from the document being UPLOADED AGAIN, not from the "Retrimite" button.**
- **`refireExtraction` needed no change and was not edited.** Not one line. Case 5 of the acceptance
  spec proves its behaviour directly rather than leaving it asserted here: it presses the button and
  checks that every send for that document carries the same `order_id` and that the queue gains no row.
- **`callback_at` was left alone, on every path.** Nothing in this card reads it, writes it or clears
  it, and case 5 reads it back after a refire and asserts it is byte for byte what it was. The reason
  is the one `refireExtraction` already records: the callback receiver reads exactly that field to
  choose between 202 accepted and 200 duplicate, and the contract defines a duplicate on `order_id`.
- **`app/api/extraction/callback/route.ts` was not touched.** It names none of the new columns, so a
  late callback is answered exactly as it is today. **Andre needs no notice**, because nothing changed
  in what that route accepts, refuses or returns.

The task's stop condition, "if the fix would require `refireExtraction` to stop reusing the
`order_id`, STOP", was therefore not reached: the fix does not go near it.

---

## What was built

### The migration: `supabase/migrations/0062_extraction_draft_supersede.sql`

Additive only. Four `add column if not exists` on `public.extraction_drafts`, two indexes and four
`comment on column`. No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, no `DROP COLUMN` and no `UPDATE` of
any existing row.

| column | type | meaning |
|---|---|---|
| `document_sha256` | `text` | lowercase hex sha256 of the uploaded bytes |
| `superseded_at` | `timestamptz` | when this draft was replaced. Superseded means this is not null |
| `superseded_by` | `uuid` | the newer draft, `references public.extraction_drafts (order_id) on delete set null` |
| `superseded_by_user` | `uuid` | who uploaded the newer document, `references auth.users (id) on delete set null` |

All four nullable, no default. A default would rewrite every existing row into a claim nobody made;
NULL on an old row means "not superseded", which is true.

**`superseded_by` references `order_id` because that is the table's own primary key** (read out of
`0008_extraction_drafts.sql` before the type was chosen) and is what every code path addresses a draft
by. The shape is the one `cancelled_by` and `confirmed_by` already carry.

**Why the bytes and not the filename.** Many suppliers send `factura.pdf`. Matching on a name would
mark a **different** document superseded and hide it from the queue, and the two errors are not
symmetric: a missed match leaves exactly today's behaviour, two rows, while a wrong match hides a real
document somebody is waiting on. A sha256 has no false positives and is precisely the observed case,
the same file sent again. The hash is taken from the buffer `startExtraction` already reads to count
pages, so it costs no second read of the file. Case 1 of the spec uploads the second copy under a
**different filename** to prove the matching is on bytes.

**No `superseded_reason` column.** Nobody types a reason here; the supersede is automatic. A column no
path ever writes is a field that lies about being available. The "who and when" the goal asks for is
`superseded_by_user` and `superseded_at`.

Assertion file `scripts/poc-free/local-db/assertions/0062_extraction_draft_supersede.sql` checks five
things: the four columns typed, nullable and without a default; that `superseded_by` really is a
foreign key into `extraction_drafts (order_id)`; that a superseded draft writes and reads back with
the link resolving; that a row written without the columns stays NULL on all four; and that a
`superseded_by` naming no draft is **refused**.

### The capability probe: `hasExtractionSupersede`

In `lib/data/schema-capability.ts`, the idiom of `hasExtractionCancel` and for the same reason: the
code reaches production about two minutes before 0062 does, and a select, filter or write naming a
column that does not exist yet answers 42703 and would kill `/incarca-comanda`, the screen documents
are worked on. That is INC-05 and it is the cost P3-45's comment describes.

All four columns arrive in one transaction, so one probe on `superseded_at` is enough. **Before the
migration applies, the screen is exactly today's:** no checksum written, nothing superseded, no extra
filter, no folded block. That is two rows for the same document, which is the state being improved and
not a worse one.

### The write: `supersedeEarlierSends` in `lib/data/extraction-actions.ts`

Called from `startExtraction` **after `fired.ok`**. It writes the checksum on the new row, then in one
guarded write marks every older draft carrying the same hash:

```
.eq("document_sha256", sha256)
.neq("order_id", orderId)
.is("confirmed_at", null)
.is("cancelled_at", null)
.is("superseded_at", null)
```

- **Only after a send that actually left.** A send that never left (missing `MAKE_WEBHOOK_URL`,
  missing `NEXT_PUBLIC_SITE_URL`, the 100-page refusal) writes a row that is already failed, and
  hiding a confirmable older draft behind it would be the wrong trade.
- **A confirmed draft is never superseded, and a cancelled one is never superseded.** Both are excluded
  in the WHERE of the write, not only in a read before it. A confirmed draft has become a real order; a
  cancelled one already carries a person's account of why it left the queue.
- **The first supersede is the fact.** Rows already carrying `superseded_at` are excluded, so three
  uploads make a chain and never a rewritten link. The same idempotence `cancelExtractionDraft` keeps.
- **It cannot overturn the upload.** The document has already gone for reading by then, and the
  function never throws.
- **A draft from the other lane cannot match**: `uploadOrderDocument` writes no checksum.

`0056`'s columns are read here without a second probe, and that is sound rather than lucky: migrations
apply in file order, so a database on which 0062 exists always has `cancelled_at` too. The probe is on
the **newest** column for exactly that reason.

### The reads: `lib/data/extraction.ts`

- `listReviewDrafts` adds `.is("superseded_at", null)` behind the probe, beside the cancelled filter.
- `listCancelledDrafts` adds the same filter, so the count in the "Documente la care s-a renunțat"
  summary stays clean and no draft is told two stories.
- `supersededSendsBy` reads what each queued draft replaced, **in batches**, the same discipline
  `profileNames` and `existingOrderIds` already keep, because an id list goes into the request URL and
  that is what caused the 414 defect P3-38 fixed. It reads seven light columns and no lines: the folded
  block offers no confirmation path and needs no totals.
- A failed read **throws**, like every other read in that file. An empty map would say "nothing was
  replaced", which is the exact claim this card makes checkable.
- The field is **absent** when 0062 is not applied and an **empty array** when nothing was replaced.
  Those are different statements and the type keeps them apart.

### The screen: `components/orders/ExtractionReviewPanel.tsx`

A folded `<details>` inside the newer draft's own card, closed by default, with no buttons:

```
1 trimitere anterioară înlocuită
  TEST-F25-unu-<run>.pdf
  Înlocuit de retrimiterea din 26.09.2026
  Încărcat la 26.09.2026. Documentul este păstrat, nu a fost șters.
```

**Inside the newer card** because the goal asks for the replaced row to be readable **from the new
one**. A draft before confirmation has no order to hang it on (header of migration 0010), and the
"Documente la care s-a renunțat" section is a different statement about a different act.

**A known limit, recorded rather than left to be discovered.** Once the newer draft is itself confirmed
or cancelled it leaves the queue, and the rows it superseded are then not reachable from any screen,
though they stay in the database untouched and are still readable on the machine path. Giving them a
second home would be a new surface the card did not ask for, so it was not invented here. It is a
candidate for a later card if the owner wants it.

---

## Acceptance, and where it is proved

`tests/e2e/extraction-resend-supersede.spec.ts`, five cases named `G60 F25: ...`, run by the **End to
end** step of the `quality` check on the pull request head sha.

| # | what it proves |
|---|---|
| 1 | the same bytes uploaded a second time, **under a different filename**, leave ONE card in the queue and it is the newer one; the first row is still in the database, unconfirmed, uncancelled, with `superseded_at` set, `superseded_by` equal to the newer `order_id`, `superseded_by_user` set, and its `status` and `reason` unchanged |
| 2 | the newer card carries the folded block, closed by default, summary `1 trimitere anterioară înlocuită`, and the row inside reads `Înlocuit de retrimiterea din <data>` with the replaced document's name and the "păstrat, nu a fost șters" sentence. Checked again at 390x844, where nothing leaves the screen |
| 3 | no count on the review screen counts a superseded draft: it is not among the queue's `draft-card` order ids, the dismissed-documents summary count equals its own rows, and the superseded draft is not among them. The row is read back from the database to show it is still there |
| 4 | a **confirmed** draft is never superseded: the document is confirmed into a real order, the same bytes are uploaded again, and the confirmed row reads back with `superseded_at` still null. A **cancelled** draft is still refused a resend, through the two-tab path, with the Romanian refusal on screen and nothing sent to the extractor |
| 5 | **the finding's premise, tested directly.** "Retrimite" fires again on the SAME `order_id`, every send for that document carries that one id, the queue gains no row, and `callback_at` is unchanged |

Test data is superseded or cancelled, never deleted. Every fixture is built by hand in `tests/`, prefixed
`TEST`, and each case's bytes carry its own tag so that one case's document can never match another's.
No production row is read and the live site is never opened.

---

## Migrations, by path, and what merging them does

- `supabase/migrations/0062_extraction_draft_supersede.sql`

**MERGE IS APPLY** (`CLAUDE.md` 8.0, ruling R-124). Merging this pull request adds **four nullable
columns and two indexes** to `public.extraction_drafts` in the production database within about two
minutes. It reads no row, writes no row, and changes no existing value. Every existing draft keeps every
value it has and answers "not superseded", which is true of all of them.

`npm run check:no-destructive-migration` parsed it: **1 file, 13 statements, no DROP TABLE, no TRUNCATE,
no DELETE, every statement kind classified.** The words `delete` and `DELETE` appear in the file only
inside `on delete set null`, which is a referential action and removes nothing.

The migration number was re-checked against `supabase/migrations/` immediately before the final push,
because a collision with Ivan's lane is the classic failure here (PR #290, PR #293).

---

## What was run here, and what only CI can run

Each command run alone, each exit 0:

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards before every commit,
`check:card-ids`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`,
`check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`, `check:board-clock`,
`check:board-edit` (re-run after the board flip), and `npx playwright test --list`, which collects all
five cases.

**This machine has no Docker and no Supabase CLI.** The bare-postgres apply (`check:migrations`), both
applier proofs (`prove:applier`, `prove:assertions`) and the End to end suite run **only in CI**, and
nothing here claims otherwise.

---

## Merge

**NO SELF-MERGE.** Real client data has been in production since 2026-09-14, and a pull request adding a
file under `supabase/migrations/` never self-merges. A merge-approval question is filed for the owner
with the pull request number, the head sha and the migration path.

---

## Left for the owner

1. **The finding's title is wrong about the cause, and the fix went elsewhere.** "Retrimite" does not and
   cannot leave a second row. Re-uploading the document does. Worth relaying to Ivan, because anyone
   reading F25 later will reach for the button.
2. **A known limit**, described above: a replaced row is reachable from the draft that replaced it, and
   stops being reachable from any screen once that newer draft is itself confirmed or cancelled. The row
   is never lost. Say whether you want a second place to find it.
3. **Documents sent before this migration carry no checksum** and can never be matched, so a document
   already sitting twice in the queue today stays twice. From the first upload after the migration lands,
   the behaviour is the new one.
