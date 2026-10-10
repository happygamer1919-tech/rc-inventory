# P3-256 client date Enter wipe

Plain words: pressing Enter while a client's next-step date is half typed no longer erases the saved date. The form stays open, the date turns red with the usual Romanian message, and nothing is saved.

## Cause
`DateField` marked a half typed date invalid only after blur or after 8 digits (unless `markWhileTyping`). Enter submits without blur, so the form guard `dateInvalid` was false and an empty string reached `validateNextAction`, which wrote `next_action_at` null.

## Change
`markWhileTyping` added to the DateField of every form that already stops its save button on an invalid date:
- components/clients/ClientForm.tsx (follow-up date and next-step date)
- components/clients/LeaduriForm.tsx
- components/clients/ClientNoteForm.tsx
- components/projects/ProjectForm.tsx (start and planned end)
- components/outbound/OutboundDirectClientForm.tsx (pickup date)
- components/orders/InboundOrderForm.tsx (ordered, expected)
- components/orders/ExtractionReviewPanel.tsx (ordered, expected)
- components/facturare/FacturaEditor.tsx (issue, due)

Already fine: TaskForm (had the prop), SarciniScreen and FacturiScreen filters (completeOnly, they never send a partial date).
Left alone: FacturaScreen paid-on date, which has no validity guard (it would need a new one, outside this card).

A deliberately emptied box still saves as no date. A full valid date saves as before.

## Tests
New `tests/e2e/p3-256-client-date-enter-wipe.spec.ts` (Enter with one digit keeps the stored date; emptied box saves null). `date-invalid-blocks-save.spec.ts` must stay green. E2E runs only in CI (no Docker here).
