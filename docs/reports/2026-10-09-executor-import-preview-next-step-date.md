# P3-203 executor report, 2026-10-09

Problem: the "Rânduri noi" preview of client and lead imports did not show the next-step date, though it is saved.

Change: `lib/data/import-preview-rows.ts` gets a "Data pasului următor" column right after "Următorul pas", formatted with the existing date() helper (ZZ.LL.AAAA), empty stays empty. No change to what is imported or saved.

Tests: `tests/e2e/import-preview-rows.spec.ts`, two new cases (with and without the contact column). The Playwright suite needs the app server and database env, so it runs only in CI. Locally `npx tsc --noEmit` passes.
