# 2026-10-22 EXECUTOR report: slip numbers keep counting past 9999 (P3-334)

Role: EXECUTOR. Card: P3-334 (phase 3 board, authored in this pull request, id from `npm run id:free`). Branch `card/p3-334`.

## In plain words

Once a year reached slip number 10000, every new slip (project or walk-in) would have failed to save until January, because the next number was found by sorting the numbers as text, where 9999 comes after 10000. Now the next number is found by value, so the series goes 9999, 10000, 10001 and on. The screen now asks the database for the number instead of working it out itself, so the two can never disagree again. No existing slip is renumbered. Merging changes the live database (migration 0090, one read-only function), so it waits for the owner's OK.

## Source

Bug check of 2026-10-22, severity medium, verified on origin/main 657d0119.

- `lib/data/outbound.ts` `nextOutboundReference()`: `.like("reference", "IES-<year>-%").order("reference", { ascending: false }).limit(1)`, then `Number(tail) + 1`.
- `supabase/migrations/0089_sale_lines_and_slip_insert_lock.sql` section 2, `public.outbound_next_reference()`: `order by oi.reference desc limit 1`, tail plus one.
- With 9999 and 10000 saved, both read 9999 as the highest and give 10000 again; the guard passes (they agree) and the insert fails on `outbound_issues_reference_unique`.

## What was built

- `supabase/migrations/0090_slip_number_past_9999.sql`: `create or replace function public.outbound_next_reference()`, same signature, SECURITY DEFINER, search_path, grants (repeated with the 0089 values) and comment style. The last number is `max(substr(reference, length(prefix)+1)::numeric)` over this year's references whose tail matches `^[0-9]+$`; tails that are not all digits are ignored. Plus one, at least four digits. No DROP, TRUNCATE, DELETE, and no row written. `outbound_issues_guard` and every other function body untouched.
- `lib/data/outbound.ts` `nextOutboundReference()`: calls `supabase.rpc("outbound_next_reference")`; on an error or empty answer it throws "Nu s-a putut afla numărul următoarei ieșiri: ...". Same export and signature; the caller in `lib/data/outbound-actions.ts` is unchanged. The unused `chisinauDateOf` import is removed.
- `scripts/poc-free/local-db/assertions/0090_slip_number_past_9999.sql`: shape (SECURITY DEFINER, authenticated yes, anon no, body names P3-334, guard still names P3-331); as the superuser: empty year 0001, 0009 and 0010 give 0011, 9999 and 10000 give 10001, 10099 gives 10100, 0041-X and 9999-X ignored, last year's 20000 and another prefix not counted; with a real role switch and JWT, an account manager inserts the next number (10001, accepted), an empty number (set to 10002), and 10000 again (refused by the guard, P0001, not by the unique index).
- `scripts/poc-free/local-db/assertions/0089_sale_lines_and_slip_insert_lock.sql`: the one edge that expected a non numeric tail to restart the series at 0001 now expects it to be ignored (10000 after 9999); the header names the change. No case deleted.
- Board card P3-334 authored and shipped in this pull request; `docs/migrations/APPLY-LOG.md` pending line; `docs/LEARNINGS.md` one entry.

## Defaults applied

- One rule: the app reads the database function; no fallback to the old text-order read.
- Non numeric tails are ignored rather than counted as 0 or restarting the series.

## Commands run locally (all exit 0)

`npx tsc --noEmit`, `npm run build`, board validator, `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`.

Not run here: `npm run check:migrations` and the end to end suite need Docker, which this machine does not have. They run in the pull request's `quality` job.
