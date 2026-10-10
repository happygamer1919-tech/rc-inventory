# P3-261: a paged read that loses a row to a shifted page fails visibly or retries

## What changed
- `lib/data/id-list.ts`: `readAllPages` takes an optional fourth argument `keyOf`. A key that repeats among the collected rows means the page window shifted (an insert before the cursor plus a delete in the same window keeps the count equal). It is treated like a changed total: the read restarts, up to `READ_ATTEMPTS` times, then fails with `LIST_CHANGED_MESSAGE`. Without `keyOf` nothing changes.
- Header comment rewritten to say what is detected (count change, empty page, repeated key) and what is not (a shift without a key).
- Four callers pass a key: `lib/data/azi.ts` (clients by `id`, notes by `id`, which is now selected because `client_id` plus `created_at` can repeat on two real notes) and `lib/data/extraction.ts` (drafts by `order_id`, the primary key, in both reads).
- Test: one case in `tests/e2e/review.spec.ts` with three parts (shifted once then true list, shifted every time rejects, no key behaves as before).

## Differences from the task text
- The task asked for one restart and a new error text. Main already retries up to three times on a changed total (P3-193) with an operator message, so the repeated key reuses that path and message.
- Callers that already use `dedupeById` (stock, catalog, inbound, outbound, tasks, movements, import, client options) were not touched. They hide the repeat but still lose the skipped row. Passing a key there is a follow-up.
- `app/api/extraction/callback/route.ts` is not touched.

## Not changed
`ID_LIST_BATCH_SIZE`, `inBatches`, `ROW_PAGE_SIZE`, existing error texts, any migration.

## Checked locally
Board validator, `npx tsc --noEmit`. The e2e suite runs only in CI.
