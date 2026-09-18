# EXECUTOR, 2026-09-18: P3-76, Ivan's finding F9, the extraction callback key allowlist

**Roles:** AUTHOR (card P3-76 written on the phase 3 board), then EXECUTOR (the code), in one pull request.
**Branch:** `card/p3-76`. **Migration:** none.

## In plain words

When the document reader sends a piece of information the system does not know, the
system now writes one warning line in its technical log naming it. Nothing is refused,
nothing on screen changes, and every order that was accepted before is accepted the same
way. Two things the reader sends today (`supplier` and `pages`) will show up in that log,
because the system reads them under other names and loses them. That is the warning doing
its job.

## Boot

Phase 2: 68 shipped, 32 todo, 2 blocked. Phase 3 before this card: 91 shipped, 32 todo,
1 blocked. Launch gates 0/9 on each. Next eligible by board order: AUT-3. This run worked
the task-assigned card instead, allocated with `npm run id:free -- P3-76` (FREE, lane
highest P3-75, zero open pull requests).

## What changed

- `lib/data/callback-keys.mjs` (+ `.d.mts`): the allowlist and `warnUnknownCallbackKeys`.
  Known keys are the 18 top-level and 10 per-line keys the route reads, plus the five EXT-34
  keys (`document_type`, `client_ref`; per line `supplier_code`, `description`,
  `line_total_source`). One `console.warn` per callback at most, naming at most 20 keys,
  each JSON-quoted and cut to 64 characters, plus the `order_id`. Never throws, even if the
  logger throws.
- `app/api/extraction/callback/route.ts`: one call, right after the body parses, before
  every shape check. Its return value is not used.
- `scripts/poc-free/check-callback-keys.mjs` and `npm run check:callback-keys`: 30 cases
  with a mocked logger, plus a guard that reads the route's own source and fails if the
  route reads a key the allowlist does not name.
- `.github/workflows/quality.yml`: new step `Check the callback key allowlist`.
- `tests/e2e/extraction-key-allowlist.spec.ts`: two cases (same 202, same response, same
  stored values with and without unknown keys; a refused payload stays 400 with the same
  text).

## The choices F9 asks to be recorded (also in the card notes)

- **Warn, never refuse.**
- **Scope: top level plus per line.** The inside of `_meta` is not checked; it is stored
  verbatim by design.
- **The five EXT-34 keys are included.** The counterparty already sends them; leaving them
  out would warn on every real callback and teach readers to ignore the log.
- **`supplier` and `pages` are not included**, so they warn: their values are lost today.

## Commands run locally, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards before every
commit, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration` (0 files), `check:conflict-residue`, `check:categories`,
`check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`,
`check:removal-safety`, `check:assertion-register`, `check:numeric-field`,
`check:callback-keys` (30 cases). `check:board-edit` refused while the card was `in_flight`,
as designed, and is rerun after the shipped flip.

## Left for CI

The Playwright End to end suite (the new spec and every existing extraction spec). This
machine has no Docker and no Supabase CLI.

## Andre

What the callback route accepts, refuses and returns is unchanged. Andre was not told; this
factory has no channel to him.

## Learnings

Nothing broke while working this card, so `docs/LEARNINGS.md` is untouched.

## Merge

Not self-merged: real client data is in production. The owner approves in chat and POC
merges.
