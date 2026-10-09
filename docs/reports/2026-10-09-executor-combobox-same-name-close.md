# P3-210: client picker closes on a click outside; new buyer shows its detail

Two faults from the 2026-10-09 bug check, one card, one PR.

- `components/ui/Combobox.tsx`: with two same-name clients, a click outside no longer leaves the list open. The rule is `decideCommit` in `lib/data/combobox-commit.ts`: nothing is chosen on several exact matches, a click outside closes and clears, Enter keeps the list open. Single exact match, free text, Enter on a highlighted row and Escape are unchanged.
- `components/outbound/OutboundDirectClientForm.tsx`: `onCreated` now carries `phone` and `fiscal_code`, so the new buyer's picker row shows the detail at once. `createWalkInClient` returns only the id, so the form values are used.

Tests: `tests/combobox-commit.test.ts` (unit, no database) and a phone check in the walk-in spec of `tests/e2e/outbound-direct-client.spec.ts` (runs in CI only). No migration.
