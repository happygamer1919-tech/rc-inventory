# P3-140: import refuses an unreadable email or phone

Date: 2026-10-04. Branch: card/import-bad-contact. Role: EXECUTOR.

## What changed for Rapid Construct
In the client and lead import, a row whose email or phone cell is filled but cannot be read now
shows as an error with a Romanian reason. Before, the row was imported without the email, or with a
wrong phone number.

## Cause
`normalisePhone` stripped every non-digit, so `069123456, 079654321` became one long number and
`069 123 45` gained a +373 prefix. `normaliseEmail` returned null for `ion@gmail`, and a row with a
good phone and a bad email was created with no email (so the email duplicate check was skipped too).

## Change
- `lib/data/lead-import-types.ts` and `lib/data/client-import-types.ts`: new `readPhone` and
  `readEmail` (empty, ok, many, bad). `normalisePhone` and `normaliseEmail` now wrap them, so the
  callers that read stored values keep working.
- Lead `prepareRow` and the client phone and email fields refuse "many" and "bad" with new reasons
  (`badPhone`, `manyPhones`, `badEmail`, `manyEmails`). An empty cell stays allowed; `noContact` stays.
- `tests/e2e/import-bad-contact.spec.ts`: four named pure cases.
- Board card P3-140, LEARNINGS entry. No migration.

## Phone rule
Several whole numbers (7+ digits each, split on comma, semicolon, slash, or two runs of 8+ digits)
are refused. A local 0 number must be 0 plus exactly 8 digits and is never given a plus prefix.
Foreign numbers need 7 to 15 digits.

## Checks run locally
Board validator, `npx tsc --noEmit`, the new spec and the other pure import specs (run with a
temporary Playwright config without the web server, which needs Supabase variables).
