# P3-340: slip number read failure shows a message

Source: Fable bug check build-20261023T151853928Z, finding 0.

- `lib/data/outbound-reference.ts`: `readSlipNumber` turns a thrown read into `{ ok: false, message }` with the Romanian text.
- `lib/data/outbound-actions.ts`: `createOutboundIssue` reads the number through it and returns early on failure.
- `OutboundProjectForm.tsx` and `OutboundDirectClientForm.tsx`: the submit wraps the action in try/catch/finally, so `pending` is always reset.
- `tests/outbound-slip-number-read.test.ts`: three cases, green locally with `npm test`.
- No end to end case: it needs the database function to fail on purpose.
- No migration.
