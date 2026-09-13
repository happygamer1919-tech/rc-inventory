# EXECUTOR report: P3-41, the chosen date written out in Romanian on the manual intake form

**Role:** EXECUTOR. **Date:** 2026-09-13 (UTC). **Branch:** `card/p3-41-romanian-date`,
cut from origin/main at eb7b34d. **Pull request:** #283.

**Cards:** `P3-41` moved from `blocked` to `in_flight` to `shipped`.

This closes out the re-scope PURPLE approved in the factory mailbox answer q005, option
A. The original finding, that the card's premise was false, is in pull request #282 and
in `docs/reports/2026-09-13-executor-p3-41-date-picker.md`.

## In plain words

The two date boxes on the manual order form follow the language of the operator's web
browser. On an English-language browser, the keys for 1 December save 12 January, and
until now nothing on the form said which day had been picked. Each date box now has the
chosen date written out in Romanian under it, for example "marți, 12 ianuarie 2027", and
it changes as the box changes. An empty box shows nothing. What is saved did not change,
and nothing in the database changed.

## Boot

Phase 2 board at as_of 2026-09-12T22:55:06Z: todo 32, in_flight 0, blocked 2, halted 0,
shipped 68. Launch gate 6/9. Next eligible card on that board: AUT-3. Phase 3 board
(read too, per the RULE-05 defect) at as_of 2026-09-13T21:48:17Z: todo 37, blocked 1,
shipped 55. P3-41 was the one blocked card, on `ivan`, and is worked here on PURPLE's
answer rather than picked as eligible. Open pull requests at start: zero.

One deviation from section 1, stated rather than buried: the worktree was created before
the status report above was printed. No file in the repository changed before the
report was computed, and the first board edit came after it.

## What was built

- `lib/data/format.ts`: `formatDateWords(iso)`. It takes the field's `YYYY-MM-DD` string
  and returns the Romanian date with weekday and month names through
  `Intl.DateTimeFormat`. It returns an empty string for an empty field, for a string that
  is not `YYYY-MM-DD`, and for a day that does not exist. The date is built with
  `setUTCFullYear` and formatted in UTC, so no timezone can move the day, and years 0 to
  99 are not shifted into the 1900s.
- `components/orders/InboundOrderForm.tsx`: a small `DateInWords` part under each of the
  two date inputs, `order-ordered-at-words` and `order-expected-at-words`. It renders
  nothing when its field is empty.
- `tests/e2e/inbound.spec.ts`: the new case below.

No dependency added. No migration added. What is stored is untouched: the inputs, their
values and the server action are unchanged.

## Acceptance, clause by clause

The case is "fiecare câmp de dată arată în română ziua care se salvează", at
`tests/e2e/inbound.spec.ts:267`.

| clause | how the case proves it |
|---|---|
| (1) a browser whose date order disagrees with the page | it launches its own Chromium with `--lang=en-US`, page locale ro-RO, and asserts first that the keystrokes 01122027 store 2027-01-12 |
| (2) written-out date visible, matching, independent | `toBeVisible` and exact `toHaveText` under each field ("marți, 12 ianuarie 2027", "joi, 10 septembrie 2026"); each text is re-read after the other field changes |
| (3) the typed path still works | both dates are typed with `pressSequentially`; the order is saved and the order list reads `estimat 12.01.2027`, the written-out day |
| (4) empty Data comenzii shows nothing | count 0 before any date is chosen, and count 0 again after the field is cleared |
| PLUS tsc, no migration | `npx tsc --noEmit` exit 0 locally and in `quality`; the pull request states no migration was added |

Why the case launches its own browser: launch options belong to the worker process, so
Playwright does not allow them per group, and setting them for the whole file would have
changed the language for every other case in it.

## Commands run locally, and results

All from the worktree, each exit 0.

On the red arm head `e7508d4`, before its push: `npx tsc --noEmit`, `npm run build`,
the board validator on the three boards (0 violations), `check:card-ids`,
`check:board-edit`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration` (0 files), `check:conflict-residue`,
`check:categories`, `check:ledger-rows`, `check:no-prod-target`,
`check:pending-schema-reads`, `check:removal-safety`, `check:assertion-register`.

On the implementation head, before its push: the same set.

Before writing the case, the behaviour was measured in Chromium 151 with a throwaway
script (not committed), page locale ro-RO:

    {"args":["--lang=en-US"],"focusType":"2026-01-12","pressSeq":"2026-01-12"}
    {"args":[],"focusType":"2026-01-12","pressSeq":"2026-01-12"}
    {"args":["--lang=ro-RO"],"focusType":"2026-12-01","pressSeq":"2026-12-01"}

and `Intl.DateTimeFormat` with weekday and month names printed
`marți, 1 decembrie 2026` for both ro-RO and ro-MD, with the comma-below letter, in
Node (ICU 78.3) and in Chromium alike.

**Not run locally, and why:** the Playwright suite, `check:migrations` and the two
applier proofs need Docker or a local Supabase stack, which this machine does not have.
They run in `quality`.

## CI

**Red arm, run 34787496025** on the tests-only head `e7508d4`: `quality` failure at End
to end only, 24 minutes. Exactly one case failed, the new one, and 213 passed,
`cross-links.spec.ts` and `client-detail.spec.ts` among them. Every step in front of
End to end passed; the two applier proof steps were skipped, correctly, since the pull
request adds no migration.

The failure message was read, not only the count. It failed at `:304`,
`expect(locator).toBeVisible()` on `getByTestId('order-expected-at-words')`, element not
found. The divergence assertion at `:301` had already passed in CI, so the case was red
because the written-out date did not exist, and not because the CI browser happened to
order the field the Romanian way.

It was watched to completion before the implementation was pushed, because
`quality.yml` cancels an in-progress run on a new push.

**Implementation head:** its `quality` run id, conclusion and `npm run checks:state 283`
are recorded in the pull request, because writing them here would move the head sha
away from the run that proved them.

## Decisions taken without asking, stated rather than buried

Each is logged in the card's `notes` too.

1. **Locale ro-MD**, the one `lib/data/format.ts` already uses for numbers. For a
   written-out date it prints the same text as ro-RO.
2. **UTC** to build and to format, so the written day is always the stored day.
3. **The upload screen shows it too.** `UploadOrderScreen` renders the same
   `InboundOrderForm` in manual mode. The component's own header says the two paths share
   one form so they cannot diverge, so the display was not gated off there.
4. **Nothing rendered for an empty field**, not an empty line, so the optional field never
   shows a date that was not chosen.
5. **The card's acceptance was rewritten** to the re-scoped one, with the original quoted
   in `notes`, because section 6 requires the acceptance run in the shipping pull request
   to be the one on the card. The card's title still states the disproved premise and is
   left as authored.

## Defects found, cross-referenced to docs/LEARNINGS.md

One entry: "Clicking a native date field and then typing stores nothing". The first
measurement script clicked the date field and typed, and read back an empty value under
every language. The click lands on a middle segment; focusing the field first, or
`pressSequentially`, fixes it. The committed case uses `pressSequentially`.

## Noticed and not touched

- The same native date control, without a written-out date, is on the client form, the
  leads form, the project form and the extraction review panel. That stays the
  `docs/LEARNINGS.md` finding recorded by pull request #282 and is not added here.

## Migration

None added.

## Left for the owner

Nothing to decide. After the merge, the manual order form on the live site shows the
written-out date under both date boxes.
