# P3-316: timestamps show the Chisinau day

Card P3-316, branch card/p3-316. Source: Fable bug check of 2026-10-16 20:57Z. The finding file
sits outside the executor folders, so the card was built from the task text and the code.

## What changed
- `lib/data/format.ts`: new `formatTimestampDate(iso)`, which is `formatDate(chisinauDateOf(iso))`.
  Empty gives a dash, an unreadable value falls back to `formatDate`.
- Used for `timestamptz` values only: emis, expediata and the history dates in the outbound panel,
  the orders list (recepționată, expediată, emis), the home activity feed, the inbound panel and
  product panel dates, and the date on both outbound success screens.
- Plain `date` columns (pickup_date, expected_at, due and follow-up dates) stay on `formatDate`.
- New test `tests/format-timestamp-date.test.ts`: 2026-12-31T22:30Z shows 01.01.2027.

## Checks run locally
- `npx tsc --noEmit`: exit 0.
- The four formatter cases were run through tsx and gave 01.01.2027, 31.12.2026, 01.01.2027, "-".
- The Playwright run needs the database web server, so the named test runs in CI.

## Not changed
No migration. The hasPhase3Schema gate and the `lead=` PageHeader prop are untouched.
