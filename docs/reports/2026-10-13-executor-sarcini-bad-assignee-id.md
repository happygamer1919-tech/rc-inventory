# Executor report: P3-273, Sarcini malformed responsabil

Card P3-273, branch card/p3-273.

What changed for Rapid Construct: an old or damaged task list link with a broken colleague code opens the full task list instead of the error page.

Cause: P3-251 passed the raw `responsabil` value on, and Postgres refuses a non-uuid in `.eq('assignee_id', ...)`, so the read threw.

Fix: `parseTaskQuery` in `lib/data/tasks-query.ts` keeps the value only when `looksLikeUuid` accepts it. A valid uuid is unchanged, so P3-270 (inactive colleague kept, unknown uuid stripped by the screen) is untouched.

Tests: `tests/e2e/parse-task-query.spec.ts` (parser cases) and `tests/e2e/sarcini-bad-assignee-id.spec.ts` (`abc` and a truncated uuid show the list, not the error screen, and `responsabil` leaves the address). The parser cases sit under tests/e2e because nothing runs tests elsewhere.

No migration, no schema change.
