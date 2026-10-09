# P3-198 executor report, 2026-10-09

- Fault: Client nou on the Clienti screen started at stage cold; the walk-in buyer picker (P3-196) reads stage client only.
- Change: `components/clients/ClientForm.tsx` gets an optional `defaultStage` used only for a new record; `components/clients/ClientsScreen.tsx` passes `client`. Editing keeps the stored stage. Leads screens and the lead import are untouched (the Clienti screen has no Client nou on its leads view).
- Spec: `tests/e2e/new-client-stage.spec.ts` (three cases, run in CI only). The brief said `e2e/`; the repo keeps specs in `tests/e2e/`.
- Card: P3-198 on the phase 3 board. No migration.
- Local: board validator, `npx tsc --noEmit`.
