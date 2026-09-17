# Executor report, 2026-09-17: P3-74, Ivan's finding F2

Card: **P3-74**, phase 3 board. Branch `card/p3-74`. Roles, in order: AUTHOR for
the card, then EXECUTOR for the code, both in one pull request, as the task
asked. No migration.

## 1. What changes for Rapid Construct, in plain words

When the document reader leaves a number blank on an order, the system now
records it as missing instead of recording a zero. Before this, a blank supplier
total or a blank quantity was saved as 0, which looks on the review screen
exactly like a document that really says zero, so someone could confirm an order
believing the paper said nothing was owed. A real zero printed on a document is
still saved as zero.

## 2. The defect, read cold from the code

`app/api/extraction/callback/route.ts` held this, at the top of the file:

```ts
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}
```

Two things are wrong and only one of them is visible. The visible one is that
both branches of the ternary are the same expression, so the `typeof` test does
nothing. The load-bearing one is that `Number.isFinite` was being trusted to
answer "is this a number", and it does not:

| sent in the payload | `Number(v)` | finite? | stored before | stored now |
|---|---|---|---|---|
| `""` | `0` | yes | `0` | `null` |
| `"   "` | `0` | yes | `0` | `null` |
| `true` | `1` | yes | `1` | `null` |
| `false` | `0` | yes | `0` | `null` |
| `[]` | `0` | yes | `0` | `null` |
| `[5]` | `5` | yes | `5` | `null` |
| `12.5` | `12.5` | yes | `12.5` | `12.5` |
| `"18450.00"` | `18450` | yes | `18450` | `18450` |
| `0` | `0` | yes | `0` | `0` |
| `"MDL"` | `NaN` | no | `null` | `null` |

`num()` is the reader for `subtotal`, `vat_amount`, `document_total` and
`vat_rate` on the document, and for `quantity`, `unit_price` and `line_total` on
every line, plus the `line_total` list the reconciliation sum is built from. So
a false `0` was reaching both what the operator sees and the platform's own
arithmetic verdict.

`bool()` was read and needed nothing: `typeof v === "boolean"` is already a
strict test, so a non-boolean never becomes `true` or `false` there. `str()` and
`pageCount()` were likewise left alone. F2 names `num()` and this card changed
`num()`.

## 3. The fix

- **New `lib/data/numeric-field.mjs`**, with types in `numeric-field.d.mts`. The
  rule is a type test BEFORE any conversion: only a `number` or a non-empty
  trimmed `string` ever reaches `Number()`. `null`, `undefined`, a boolean of
  either value, an array, an object, an empty or whitespace-only string and any
  string that does not parse all return `null`. `NaN`, `Infinity` and
  `-Infinity` stay refused by the same `Number.isFinite` guard that refused them
  before.
- **`num()` became a one-line delegation** with the same name and the same
  signature, so not one of its fourteen call sites changed. The old body is
  quoted in the comment above it with the reason it was wrong, rather than
  deleted.
- **New `npm run check:numeric-field`**, 28 cases, wired into `quality`
  unfiltered, next to `Check the reconciliation tolerance` and for the reason
  that step gives.
- **New named spec** `tests/e2e/extraction-webhook-number-coercion.spec.ts`,
  three cases.

### Why the rule moved out of the route, which is the one decision that added files

A function inside a Next route handler cannot be proven without a database, a
storage bucket and a browser. This machine has no Docker and no Supabase CLI, so
before the move there was no way to demonstrate the fix at all without pushing
and waiting about twenty minutes. The shape is the repository's own:
`page-count.mjs`, `document-url-contract.mjs` and `reconciliation` each live
outside the surface that uses them and each has a `check-*.mjs` in `quality`.
The diff inside the route is one function body and one import line.

### The array and the object are included, and F2 names neither

`Number([])` is `0` and `Number([5])` is `5`, both finite, so both were stored as
readings by exactly the mechanism F2 describes, and JSON can carry either in a
numeric field. Including them refuses nothing extra and strictly reduces false
figures. It is written here rather than left to be discovered.

### A zero sent deliberately is still zero

A document can say zero. Turning a reading into an absence would be the same
class of defect pointed the other way. Case 3 of the spec asserts a `vat_rate`
of `0` sent as a number reads back as `0`, and two cases of the unit check assert
`0` and `"0"`.

## 4. Does this change what the route accepts or refuses at the HTTP level, and was Andre told

**It does not, and this was traced rather than assumed.** Every one of the
eleven `CALLBACK_CODES.rejected` returns that judge a payload's shape stands
ABOVE the first call of `num()` in the file: the secret check, the JSON parse,
`order_id`, `status`, `error_code` against the set, `error_code` required on
`failed` and forbidden on `extracted`, `document_source` against the set, the
`lines` key on a failed scan, `lines` missing, a `partial` with no code and no
lines, and a line with no `product_name`. The two below it concern an
`order_id` the database does not know and the `GET` reader. `isTooManyPages`,
which the task asked me to check, is not in this route at all: it lives in
`lib/data/extraction-fire.ts` on the upload path, before anything is sent. No
accept-or-refuse decision reads a `num()` result.

So the same payloads that get 202, 200, 400, 401 and 5xx today get exactly the
same codes after this change. What changes is what is **stored** (a `null`
instead of a false `0` or `1`) and, through the stored figures, the platform's
own computed verdict on a scan, which is recorded beside the sender's verdict
and never substituted for it.

**Andre has not been told, and this factory has no channel to him.** That is the
honest state and it is recorded rather than worked around. It is also the
lightest possible case for the notification rule the lifted freeze left in
place, because there is nothing for him to act on: nothing he sends starts being
refused and nothing he sends starts being accepted.

## 5. Acceptance, and what is left for CI

Run here, on the owner machine, each exit 0:

| command | result |
|---|---|
| `npm run check:numeric-field` | 28 cases, all pass |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `node docs/board/validate-board.mjs` on all three boards | 0 violations, before every commit |
| `npm run check:card-ids` | OK, 237 ids resolved |
| `npm run check:board-edit` | OK once the card was flipped to shipped |
| `npm run check:unique-ids` | OK, 238 card ids, 206 ruling ids |
| `npm run check:open-branch-ids` | OK, 0 other open pull requests |
| `npm run check:no-destructive-migration` | OK, 0 files, 0 statements |
| `npm run check:conflict-residue` | OK, 3 checks, 590 files |
| `npm run check:categories` | OK, 8 checks |
| `npm run check:ledger-rows` | OK, 6 checks |
| `npm run check:no-prod-target` | OK, 5 checks |
| `npm run check:pending-schema-reads` | OK |
| `npm run check:removal-safety` | OK |
| `npm run check:assertion-register` | OK, 18 assertions |
| `npm run check:board-clock` | OK, after the correction in section 7 |
| `npm run check:page-count` | OK, unchanged by this card |
| `npm run check:reconciliation` | OK, unchanged by this card |

**Left to CI, because this machine has no Docker and no Supabase CLI:** the whole
Playwright suite including this card's three new cases, `npm run check:migrations`,
`npm run prove:applier` and `npm run prove:assertions`. Nothing was skipped
silently; the pull request body says the same.

## 6. Nothing broke, and one thing nearly did

Typecheck and build passed on the first run. The `@/lib/data/numeric-field.mjs`
import resolves under both `tsc` with `moduleResolution: bundler` and the Next
build, which was the only thing about the file layout I was unsure of and the
reason I ran the build before writing anything else.

`docs/LEARNINGS.md` gained one entry, `Number() is a converter, not a type test,
so "" and true and [] all become finite numbers`, because the rule it carries
generalises past this route: a finite check on a converted value does not answer
the question it looks like it answers.

## 7. What I got wrong in this session, and it is the thing the last card warned about

The board timestamps for the authoring and in-flight commits were typed forward,
to `22:10:00Z` and `22:16:00Z`, while the commits landed at `21:54:42Z` and
`21:54:52Z`. `npm run check:board-clock` refused it, naming the field and the
drift, exactly as the `docs/LEARNINGS.md` entry from P3-71 says it will. That
entry was already in the file when I started and I read it before running the
check, which is the only reason the check was run locally at all: it is not in
the close-out block's gate list. The timestamps were rewritten from `date -u`
and the notes now carry the real commit times. **The learning stands and does
not need a second entry: read the clock, do not estimate it forward, and keep
`check:board-clock` in the local run whenever a board is edited.**

## 8. Anything left for the owner

Nothing to decide. Per the task, merge is automatic once `quality` is green:
Max runs `scratchpad/auto-merge.sh` on this machine and it squash-merges an open
pull request by this account once `npm run checks:state` says the head can be
trusted. **One thing to watch, reported as a fact and not as a problem:** that
script's documented conditions mention "the frozen callback route is untouched",
and this card touches exactly that file, with Ivan's permission, the freeze
having been lifted on 2026-09-17 at about 15:50. If that condition was not
updated for the lifted freeze, this pull request will sit green and unmerged and
will need a human to merge it by hand. The script is not in this repository and
I have no access to it, so this is not something to fix from here.
