# P3-327: a counter price is saved as the screen shows it

## What was wrong
- The walk-in (client direct) form sent `parsePriceText(raw).text` to the server. For a typed
  `2,500` that text is `2.500`. The server reads price text with the same screen rule (P3-314),
  where a dot plus exactly three digits is thousands, so it saved 2500 while the screen said
  `Citit: 2,50 lei`. The same happened for `1,250` (saved 1250, screen 1,25).

## What changed
- `lib/data/price-input.ts`: new `priceTextForServer(raw)`. It returns the typed text (trimmed)
  when the screen can read it, and an empty text for an empty or unreadable box.
- `components/outbound/OutboundDirectClientForm.tsx`: the line price sent to the server is
  `priceTextForServer(l.price)`. The old local `priceText` is removed.
- The project sale form already sent the typed text; it is unchanged. No other money box
  re-reads parser output (checked every caller of `parsePriceText` and `parseQuantityText`).
- Why the typed text and not a number: a number turned into text is read again by the same
  guess (999,123 is 999.123, read back as 999123).
- Quantity: the form still sends the normalised quantity text. That is safe, because a
  separator plus three digits is refused as unclear before anything is sent. A test keeps it so.

## Tests
- `tests/e2e/price-input.spec.ts`: round trip over 18 typed prices, empty and unreadable
  boxes, and the quantity round trip. Run locally with a throwaway config: 15 passed.
- `tests/e2e/outbound-direct-client.spec.ts`, case P3-327: types 2,500, 1,250 and 1.250 on
  three lines, checks the "Citit" labels and finds 2.5, 1.25 and 1250 in the database.
  Needs the database stack, so it runs in CI only.

## Not changed
- No migration, no change to the project form, to the import rules or to `lead=`.
