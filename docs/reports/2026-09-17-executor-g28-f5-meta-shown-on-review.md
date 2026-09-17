# EXECUTOR report, 2026-09-17: P3-72, Ivan's finding F5

Card **P3-72**, phase 3 board. Branch `card/p3-72`, cut from `origin/main` at
`39d37cd`. Role: **AUTHOR** first, writing the card and no application code,
then **EXECUTOR**, writing the code, both in one pull request, as the task asks.

**No migration. `app/api/extraction/callback/route.ts` is not touched**, ruling
R-202. `git diff origin/main -- app/api/extraction/callback/route.ts` is empty.

**MERGE NOT PRE-APPROVED.** The pull request is left open and green, and the
owner question is filed in the factory mailbox. Nothing here was merged.

---

## 1. What changed for Rapid Construct, in plain words

When a supplier document is read automatically and the reading comes out wrong,
the person checking it can now open a small panel on the review screen and see
what the reading software reported about itself: which model read the document,
which version of the instructions it was given, how long it took, and, when the
sender says so, why it only managed part of the document. On a document that
failed outright it also shows two page counts side by side: how many pages the
model thinks the document had, and how many pages the file really has.

That last pair is the one that earns its place. A model that reports one page on
a four-page document has quietly read a quarter of it and returned an answer
that agrees with itself, and nothing else in the chain notices: the totals of
page one reconcile against the lines of page one, and every number on the screen
looks right.

All of this was already being recorded on every reading. None of it was visible
to anybody. That is the whole of the change: nothing is stored differently,
nothing is accepted or refused differently, and no existing behaviour moved.

## 2. The finding, quoted

> F5: `_meta` (model, prompt_version, duration_ms, partial_cause, and page_count
> in the failed shape) is read somewhere useful: shown on the review screen or
> the document's detail, in Romanian.

## 3. What was already there, read cold before anything was written

The task's account of the code was checked line by line against the repository
and is correct in every part.

| claim | where | verdict |
|---|---|---|
| the callback route stores the whole block verbatim | `app/api/extraction/callback/route.ts:561`, `meta: body._meta ?? null` | confirmed |
| `meta` is `jsonb`, created with the table | `supabase/migrations/0008_extraction_drafts.sql:105` | confirmed |
| the model's page count has its own column | `app/api/extraction/callback/route.ts:583`, `supabase/migrations/0032_extraction_draft_page_count.sql` | confirmed |
| neither column was ever selected | `lib/data/extraction.ts`, `DRAFT_COLUMNS` and `DRAFT_COLUMNS_WITH_SOURCE` | confirmed |
| `hasExtractionPageCount` existed and was used only by the callback route | `lib/data/schema-capability.ts:165`, one caller | confirmed |
| the review panel never read the block | `components/orders/ExtractionReviewPanel.tsx` | confirmed, one unrelated comment mentioned it |

**So the route needed no change and did not get one.** Everything this card
shows was already being written on every callback, by code that has been in
production since the column it writes to was created.

Both migration comments say the value is *"stored and never shown to the
operator"*, and both also say it exists *"so a wrong extraction can be explained
rather than argued about"*. Those two sentences cannot both be honoured. The
finding picks the second, and this card is the first thing in the repository
that makes the block do the job it was stored for.

## 4. Which screen, and why that one

**The review screen, `/incarca-comanda`, on the draft row.** The finding offers
"the review screen or the document's detail" and asks for one to be picked and
justified.

**The document's detail screen does not exist to be chosen.** `ExtractionDraft`
is consumed by exactly one component in the repository,
`components/orders/ExtractionReviewPanel.tsx`, rendered by
`app/(app)/incarca-comanda/page.tsx`. `grep -rln ExtractionDraft app components`
returns that one file. There is no second surface holding a draft.

**On the draft ROW, not inside the review form**, and this is the part that
matters. The panel has two expandable bodies and neither covers every draft:

| draft shape | expandable body | button |
|---|---|---|
| `extracted` or `partial` | `review-form` | Verifică |
| scan-sourced `failed` | `review-unread-scan` | Vezi antetul |
| **digital `failed`** | **none** | none |

A block placed inside either body would have been invisible on the digital
failed shape, which is exactly the shape the finding names. On the row it is
present on every draft.

**Inside a closed `details` element.** The screen has one job, reconciling the
document against what gets saved, and a model name and a millisecond count have
no business in front of that job. Case 1 of the named spec asserts the body is
**hidden before it clicks**, so the claim about not cluttering the screen is
proven rather than asserted.

## 5. What is shown, and under what condition

| field | source | shown when |
|---|---|---|
| Model | `_meta.model` | always, absence said |
| Versiunea promptului | `_meta.prompt_version` | always, absence said |
| Durata citirii | `_meta.duration_ms` | always, absence said |
| Cauza citirii parțiale | `_meta.partial_cause` | **only when it arrives** |
| Pagini raportate de model | `extraction_drafts.page_count` | **only on `failed`** |
| Pagini numărate la încărcare | `extraction_drafts.upload_page_count` | **only on `failed`**, beside the one above |

**`partial_cause` is shown only when present, and the three contract fields are
shown always.** `partial_cause` is not in `docs/contracts/extraction-v2.md`
section 4.3; the ruling recorded in `decisions/inbox.md` says in terms that it
arrives inside `_meta`, which our route stores and does not read, and the
counterparty's own key list confirms he sends it. A row reading "Nu s-a
raportat" would promise a field nobody undertook to send. The other three are in
the contract, so their absence is itself a fact about the reading and is said.

**The model page count only on the failed shape**, which is the finding's own
wording, checked against section 4.3a of the contract. On a document that read
successfully the number says nothing the lines do not already say. On a failed
one it is the only signal in the chain that the model read part of the document
and answered consistently with itself.

**Our own upload-time count is shown beside it, under its own label**, because
the acceptance asks for the model's number to be distinct from ours and one
number alone cannot be compared with anything. Both labels come from one
constant, `EXTRACTION_META_LABEL`, so the two strings cannot drift apart; the
existing label in the unread-scan header now reads from the same constant, which
is the only line of existing markup this card changed.

## 6. A sentence in the code that turned out to be false, kept rather than deleted

`components/orders/ExtractionReviewPanel.tsx` carried, beside the upload-time
count:

> *"Forma nu poarta _meta, deci numarul modelului nu exista aici niciodata"*

**It is true about the contract and false about what we receive**, and the row
under it was written on top of it, so it is kept and marked, in the spirit of
CLAUDE.md section 9c, rather than removed.

- Contract section 4.1a lists sixteen fields "and nothing else" for a
  scan-sourced failure, and `_meta` is not among them.
- **Our route refuses only the `lines` key on that shape**
  (`app/api/extraction/callback/route.ts:213-220`) and writes `body._meta`
  verbatim whatever arrives.
- The counterparty's own key list, recorded in
  `docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md`,
  carries `_meta` on the failure shape too.

So the model's number can exist on a failed draft, and from this card it is
shown.

## 7. How the untyped blob is read

`extraction_drafts.meta` is unvalidated `jsonb` written verbatim from somebody
else's payload. Nothing checks its shape at write time and nothing can at read
time. `readExtractionMeta` in `lib/data/extraction-types.ts` reads it field by
field and believes none of it:

- not an object, an array, or `null`: the whole block reads as absent.
- a field of the wrong type: `null`, which is what an absent field already means.
- a number where a string was expected: kept, stringified. It is still something
  the sender reported, and discarding it would hide the thing the block exists for.
- an empty or whitespace-only string: `null`. An empty field is not a report.
- a negative or non-finite duration: `null`. **A broken report is never coerced
  to zero**, for the reason migration 0032 refuses a default on the page count:
  zero pages is not a smaller reading, and an instantaneous duration is not a
  faster one. A duration the sender really reports as `0` is kept as `0`.

Verified locally against the real module, outside the browser and outside a
database, with `node --experimental-strip-types`: nine cases, all as above.

## 8. `meta` takes no capability probe. `page_count` does.

The three probes already in `draftColumnsFor` each guard a column added by a
**later** migration, because a merged migration reaches production about two
minutes after the code that reads it ships from the same push, and a `select`
naming a column that is not there yet is `42703` on the operator's screen.

- **`meta` arrives in `0008_extraction_drafts.sql`, the file that CREATES the
  table.** The column and the table share a fate: a database on which
  `extraction_drafts` exists always has `meta`. A probe on it would be a
  question whose answer can never be no, cached for its TTL, costing a round
  trip to learn what the table's own existence already settles. It is appended
  unconditionally, with the reason written beside it.
- **`page_count` arrives in `0032`, a separate later file**, and genuinely needs
  its gate. `hasExtractionPageCount` already existed for exactly this and had
  one caller; it now has two, and the append mirrors `UPLOAD_PAGE_COUNT_COLUMN`
  exactly.

This is the report's one reusable lesson and it is in `docs/LEARNINGS.md`.

## 9. Files changed

| file | what |
|---|---|
| `docs/board/rc-board-phase3.json` | card P3-72 authored, flipped `todo` to `in_flight` to `shipped` with evidence |
| `lib/data/extraction-types.ts` | `ExtractionMeta`, `readExtractionMeta`, `hasExtractionMeta`, the Romanian labels and the duration formatter; `modelPageCount` and `meta` on `ExtractionDraft` |
| `lib/data/extraction.ts` | `META_COLUMN` and `MODEL_PAGE_COUNT_COLUMN` in `draftColumnsFor`; both fields mapped in `mapDraft` |
| `components/orders/ExtractionReviewPanel.tsx` | `ExtractionMetaDetails` and `MetaRow`, rendered on every draft row; the false comment marked; the existing upload-count label read from the shared constant |
| `tests/e2e/extraction-meta-shown.spec.ts` | NEW, the named acceptance, three cases |
| `docs/LEARNINGS.md` | one entry, the probe distinction above |
| `docs/reports/2026-09-17-executor-g28-f5-meta-shown-on-review.md` | this file |

**Not touched, and each one deliberately:** `app/api/extraction/callback/route.ts`
(FROZEN, R-202), `app/api/documents/**`, `docs/contracts/extraction*`,
`supabase/migrations/**`.

## 10. Commands run, and their results

Locally, from the worktree, every one exit 0:

```
npx tsc --noEmit
npm run build
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
npm run check:card-ids
npm run check:board-edit            (after the shipped flip; see section 11)
npm run check:unique-ids
npm run check:open-branch-ids
npm run check:no-destructive-migration
npm run check:conflict-residue      (run AFTER git add, per KNOWN-FAILURES)
npm run check:categories
npm run check:ledger-rows
npm run check:no-prod-target
npm run check:pending-schema-reads
npm run check:removal-safety
npm run check:assertion-register
npm run check:board-clock
npm run id:free -- P3-72            (FREE, lane highest P3-71, 0 open pull requests)
```

**LEFT TO CI, and nothing was skipped silently:**
`npx playwright test tests/e2e/extraction-meta-shown.spec.ts`. This machine has
no Docker, no Supabase CLI and no `.env.local`, so the end to end suite cannot
start a database or a dev server that can reach one. The `quality` check runs it
against a local Supabase stack. The migration applier proofs are not reached at
all by this pull request: it adds and changes no migration file, so those two
path-filtered steps are correctly skipped and nothing here depends on them.

## 11. What broke while working the card

**One thing, and it was already written down.** The card's `last_checkpoint` and
its two note timestamps were typed as rounded times (`20:05:00Z`, `20:12:00Z`)
while the commit that carried them landed at `19:48:33Z`.
`npm run check:board-clock` refused with `1 of 217 timestamp(s) are AHEAD of the
commit that wrote them`. The board validator passed the same file, because the
shape was fine.

This is the signature the factory's `KNOWN-FAILURES.md` records as seen on
2026-09-14 (P3-29a, PR #286) and which `docs/LEARNINGS.md` already carries
**four** times over, the most recent added by P3-71 the same day. It was caught
locally, before any push, by running `check:board-clock` as those entries tell
you to. **No fifth entry was added**: the rule is written, it is written well,
and the failure was mine for typing a clock instead of reading one. The
correction is its own commit.

`docs/LEARNINGS.md` gained one entry, section 8's, which is new.

## 12. What is left for the owner, and what is reported but not done

**The merge.** The pull request is open and green and is NOT pre-approved. The
question is filed at
`mailbox/questions/q054-approve-p3-72-merge.md` in the factory folder, starting
`OWNER:`, naming the pull request number and the head sha.

**Reported, not fixed, each needing its own card:**

1. **Two migration comments are now stale.** `0008` and `0032` both say the
   value is "stored and never shown to the operator", and from this card it is
   shown. A migration file is never edited after it has been applied
   (CLAUDE.md 8.1), so correcting them takes a new `comment on column` file,
   which this card was not asked for and did not invent.
2. **The counterparty sends `pages`, we read `_meta.page_count`.** Recorded in
   `docs/reports/2026-09-15-executor-orange-sample-count-notes-callback-keys.md`:
   his success and failure shapes carry `_meta.pages`, and `pageCount()` in the
   callback route reads `page_count`. Until that is settled the model page count
   this card now shows will read "Nu s-a raportat" on real traffic, correctly,
   because nothing under the name we read has arrived. **This card does not fix
   it and must not**: the fix is inside the frozen route (R-202), and it is a
   contract question for Ivan and Andre, not a display question. The screen says
   exactly what is stored, which is the truth about the row.
3. **Comparing the two page counts is still not built.** Contract section 4.3a
   says so in terms. This card puts both numbers in front of a human, side by
   side and labelled; it does not judge them, block on them, or flag them.
