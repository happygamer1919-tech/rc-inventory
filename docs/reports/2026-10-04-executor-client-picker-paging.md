# P3-166: client pickers read every active client

Role: EXECUTOR. Branch `card/client-picker-paging`. Bug check of 2026-10-04.

## What changed for Rapid Construct
Every active client can be chosen in the client pickers, however many clients there are. Before, past 1000 active clients some were missing without a message.

## Cause
`listClientOptions` (`lib/data/projects-list.ts`) read `clients` with no paging and no order. The database returns at most 1000 rows. Leads share the table, so one import can pass the limit. A read error returned an empty list.

## Fix
- New `lib/data/client-options-read.ts`: `readActiveClientOptions` reads pages of 1000, `.order("name").order("id")`, until a page returns fewer than 1000 rows. Same Romanian sort and `{ id, name }[]` shape.
- A read error throws; callers are server pages and `app/error.tsx` shows the Romanian error screen. No caller changed.
- `listClientOptions` now delegates to it.
- Callers checked: pages sarcini, iesiri, proiecte, proiecte/[id], and `lib/data/facturare-create.ts`. No other picker reads all clients this way. The import reads already page (`readAllClients`).
- No migration. `supabase/config.toml` untouched.

## Tests
`tests/e2e/client-options-read.spec.ts`, three cases with a stubbed Supabase client: 1000 + 1000 + 250 rows (last name "Zz..." present, ranges 0-999, 1000-1999, 2000-2999, order name then id), exactly 1000 rows (a second, empty page is asked), and a failing first or later page (throws). Seeding 1000+ rows through the database in CI would be slow and the paging loop is what is under test, so a stub is used.

## Local gates
Run here: `npx tsc --noEmit`, board validator (exit 0). The Playwright suite needs Supabase and Docker, which this machine does not have, so the new spec runs in CI only.
