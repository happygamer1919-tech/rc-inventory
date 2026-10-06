# P3-185: take stock only on a slip awaiting shipment, outbound line writes owner only

Role: EXECUTOR. Branch `card/p3-185`. Bug check 2026-10-06, factory task 234.

## What changed for Rapid Construct
Stock can no longer be taken off a delivery note that is already shipped, and only the owner can add sale lines or change sale prices outside the normal screens. Nobody using the screens notices a change: both kinds of outbound (to a project, to a walk-in client) and shipping work as before for account managers.

## The defect
- `public.outbound_issue_take_stock(uuid, jsonb)` (0067) was granted to `authenticated` and did not check the issue status. On a shipped slip it wrote lines (the stock decrement) and a new `null -> awaiting_shipment` history row.
- 0070 kept `outbound_lines` INSERT and UPDATE open to every active role. An account manager could POST a line (skipping the overdraw check) or PATCH `sale_price_mdl` through PostgREST.
- Both only through hand-built API calls, not through the screens.

## Which status is valid
`public.outbound_status` has `awaiting_shipment` and `shipped` (0001). Both doors of 0067 insert the issue as `awaiting_shipment` and call the routine on it in the same transaction; `ship_outbound_issue` (0004) is the only path to `shipped`. So taking stock is valid only on `awaiting_shipment`.

## The choice for the line policies
The screens write `outbound_lines` only through the routine: `lib/data/outbound-actions.ts` calls `create_outbound_issue` and `create_direct_client_issue`, both end in `outbound_issue_take_stock`. Nothing in `lib/`, `app/` or `components/` inserts or updates lines directly (only reads in `facturare-create.ts` and `product-movement.ts`). So the brief's first option applies: direct INSERT and UPDATE are now owner only. Because the routine was SECURITY INVOKER, its own insert used the caller's policy; it is now SECURITY DEFINER so account managers keep creating outbound through the screens.

## Migration 0075 (`supabase/migrations/0075_take_stock_status_and_line_policies.sql`)
- `outbound_issue_take_stock`: same signature, `create or replace`, SECURITY DEFINER, `search_path` pinned. New refusals, all before any write: a token holder with no active profile (`Contul tău nu mai este activ. Stocul nu a fost scăzut.`), a missing issue (`Ieșirea nu mai există. Reîncarcă pagina.`), a status other than `awaiting_shipment` (`Ieșirea a fost deja expediată. Stocul nu se mai poate scădea pe ea.`). The issue row is locked `for update` for the check. Everything after is 0067 word for word. EXECUTE revoked from public and anon, kept for authenticated.
- `outbound_lines_insert` and `outbound_lines_update`: `current_app_role() is not null and is_owner()`. Select and delete unchanged.
- No DROP TABLE, TRUNCATE, DELETE, no row written or removed.
- The active check runs only when `auth.uid() is not null`: the local applier calls both doors as a superuser with no JWT (the reason 0070 gave for not writing it). anon has no EXECUTE.

## Migration number
0075. On main the highest is 0072. Open pull requests: #413 has 0071, #452 has 0073, #445 has 0074.

## Assertions
- New `scripts/poc-free/local-db/assertions/0075_take_stock_status_and_line_policies.sql`: shape and grants, then real role switches (account manager, deactivated account manager, owner) with JWT claims.
- `assertions/0070` section 3 changed: it pinned SECURITY INVOKER; it now accepts invoker, or definer whose body carries the `current_app_role() is null` refusal. The protected property (a deactivated account cannot take stock) is unchanged.
- Run locally on a throwaway Homebrew postgres (unix socket, temporary data dir, no network): 73 migrations applied, 56 of 56 assertion files passed. With 0075 removed, assertions/0075 fails on its first check, so it can fail.

## Specs
- New `tests/e2e/take-stock-guard.spec.ts`, four cases: shipped slip refused with no line and no history row (witness: same account succeeds before shipping); account manager POST and PATCH refused; owner POST and PATCH work; both doors, shipping and the INSUFFICIENT_STOCK refusal still work for an account manager.
- `tests/e2e/outbound-lines-deactivated.spec.ts` (P3-138): the direct write case now uses an owner account as the witness, since an active account manager is refused now. Its other three cases are unchanged.
- Playwright needs the Supabase stack: CI only.

## Left open (not in scope)
- `outbound_issues` UPDATE is still open to any active role, so a hand-built PATCH could move a status back to `awaiting_shipment`. Taking stock after that still goes through the overdraw check.
- Calling the routine twice on the same awaiting slip still adds lines and a second history row, under the overdraw check.
- #452 also edits `tests/e2e/outbound-lines-deactivated.spec.ts`; whichever merges second resolves by keeping both changes.
