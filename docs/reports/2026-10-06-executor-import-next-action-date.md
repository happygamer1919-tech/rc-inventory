# P3-186: import keeps the mirrored next-step date

- Bug: an absent date column reached `validateNextAction` as `""` (a clear), so imported "De reluat" rows lost the mirrored date. The date was also not fillable on an existing record.
- Fix: `importNextActionAt` in `lib/data/import-shared.ts`, used by `lead-import-actions.ts` and `client-import-actions.ts`; `loadExisting` in both reads `next_action_at` and lists `nextActionDate` as fillable.
- Test: `tests/e2e/lead-import-next-action-date.spec.ts` (helper and plan, pure). The database write path runs only in CI; no Docker here.
- Run locally: `npx tsc --noEmit` and the board validator, both exit 0. The remaining gates run below in the close-out.
- No migration, no change to `validateNextAction`.
