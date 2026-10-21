# 2026-10-21 EXECUTOR report: sale lines only through the screens, new slip dated now with the next number (P3-331)

Role: EXECUTOR. Card: P3-331 (phase 3 board, authored in this pull request, id from `npm run id:free`). Branch `card/p3-331`, pull request #557.

## In plain words

Two holes found by the bug check of 21 October are closed. First: the owner account, by sending a request straight to the database instead of using the screens, could change how much was sold on a slip line, and the stock went back up with no record. Now nobody, the owner included, can add or change a sale line except by saving a slip on screen. Second: any staff account could, the same way, save a slip dated in the past with a number it picked, and then take stock on it. Now a new slip always gets the moment it is saved as its date and the next number in the series; anything else is refused. People using the screens notice nothing. Merging changes the live database (migration 0089), so it waits for the owner's OK.

## Source

Fable bug check build-20261021T191810792Z (2026-10-21 19:18Z), findings 0 and 1 (zero based), both medium.

- Finding 0: 0075 section 2 left `outbound_lines_insert` and `outbound_lines_update` on `is_owner()`; nothing later replaced them (0088 dropped only the delete). An owner `PATCH /rest/v1/outbound_lines?id=eq.<line> {"quantity": 0.01}` returned the rest to stock with no history row.
- Finding 1: the INSERT branch of `outbound_issues_guard` (0082, 0083, 0085) checked `created_by`, status, mode shape and the buyer, not `issued_at`, `created_at` or `reference`. `POST /rest/v1/outbound_issues {..., "issued_at": "2025-01-01", "reference": "IES-2026-0001-X"}` then `rpc/outbound_issue_take_stock` saved a backdated slip with a chosen number and took stock.

Line numbers re-checked on origin/main c3635ff.

## Every writer read

grep of `supabase/migrations`, `lib/`, `app/`, `components/`, `scripts/` and `tests/` for `outbound_lines` and `outbound_issues`:

- `outbound_lines` is inserted only by `outbound_issue_take_stock` (0085 body, SECURITY DEFINER since 0075), which `create_outbound_issue` (0067) and `create_direct_client_issue` (0084) call last. No screen, action, route or function updates a line; the screens only read lines. Seeds write with the service role.
- `outbound_issues` is inserted by the two doors with the reference `lib/data/outbound.ts` `nextOutboundReference` computes (prefix `IES-<year in Chisinau>-`, highest reference with that prefix in text order, plus one, four digits) and with `issued_at` and `created_at` left to their default `now()`.

## What was built

- `supabase/migrations/0089_sale_lines_and_slip_insert_lock.sql`:
  - `drop policy if exists outbound_lines_insert` and `outbound_lines_update`, none created again (the shape 0087 gave batches and order lines). Only `outbound_lines_select` is left.
  - `public.outbound_next_reference()`: the app's numbering on the server, SECURITY DEFINER, read only, granted to authenticated and not anon.
  - `outbound_issues_guard`: 0085 word for word plus, on a signed-in INSERT (owner included), empty `created_at` and `issued_at` filled with `now()` and any other value refused (42501); the next number read under `pg_advisory_xact_lock`, an empty reference filled with it and any other refused (P0001, "Numărul ieșirii nu este următorul din serie (...). Reîncarcă pagina și salvează din nou.", shown as written by `lib/data/outbound-actions.ts`).
  - a new comment on `outbound_issue_take_stock`; its body is untouched.
  - No DROP TABLE, TRUNCATE or DELETE; no row read or changed when it applies.
- `scripts/poc-free/local-db/assertions/0089_sale_lines_and_slip_insert_lock.sql`: the shape, the numbering against the app's rule (empty year, other years and prefixes ignored, 9999 then 10000, a non numeric tail restarts at 0001), then with a real role switch and JWT, an account manager: both doors, ship and a door-shaped direct insert plus take stock work and take 0042 to 0045 in order, a slip sent with no number gets the next one; a direct line insert is refused and a quantity PATCH touches no row; a past `issued_at`, a past `created_at`, a future `issued_at`, the finding's `IES-<year>-0001-X`, a skipped number, a reused number and a door call with a chosen number are each refused. The owner: PATCH quantity 0.01 and price on the shipped line touch no row, a direct line insert is refused, a backdated slip and a chosen number are refused, the project door still works (0046). Verdict: every accepted slip carries `now()` and its number, no refused slip exists, lines keep quantity and price, stock is 100 - 3 - 2 - 1 - 4 = 90.
- Older assertions: 0070, 0073 and 0075 now expect one policy on outbound_lines (0075's owner case turned round); 0081 to 0085 pass `public.outbound_next_reference()` to the doors and to the accepted direct inserts.
- End to end specs moved to the rule (no case deleted or skipped): take-stock-guard (owner case turned round, quantity PATCH added), take-stock-lines-guard, outbound-lines-deactivated (witness is the visible line), outbound-direct-client (labels kept as keys to the numbers), walkin-buyer-lead, client-material-walkin, p3-200-client-materials-decimals, facturare-create.
- `docs/migrations/APPLY-LOG.md` pending line, `docs/LEARNINGS.md` two entries, board card P3-331 authored and shipped with evidence.

## Defaults applied

- THE NUMBER (card defaults): computed on the server from the app's rule, under an advisory lock, so two slips saved at once take numbers one after the other. Before this change the second of two simultaneous saves failed on `outbound_issues_reference_unique`; now, if the screen's number was taken in between, it is refused with a sentence asking to save again.
- An empty number or date is filled by the server; anything else is refused, as the task asks.
- The app is not changed: it already sends the number the server expects, so the deployed build keeps working across the apply.

## Commands and results

- Local throwaway Homebrew postgres (no Docker here), every migration then every assertion with `ON_ERROR_STOP=1`: baseline on main 88 and 70 passed; with this branch 89 migrations, 71 of 71 assertion files passed.
- Red proofs: without 0089, "public.outbound_lines has 2 insert, update, delete or ALL policy"; with the line policies kept, "case o_line_insert was not refused by row level security, got accepted"; with a guard that fills but never refuses, "the owner's slip got IES-2026-0055, expected IES-2026-0046".
- `npx tsc --noEmit`, `npm run build`, `check:card-ids`, `check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration` (1 file, 17 statements), `check:conflict-residue`, `check:categories`, `check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`: all exit 0.
- Not run here: `npm run check:migrations` itself, the applier proofs and the end to end suite need Docker and Supabase and run in CI.

## Left for the owner

Migration 0089 changes the live database: it waits for Max's OK (mailbox question written when CI is green).
