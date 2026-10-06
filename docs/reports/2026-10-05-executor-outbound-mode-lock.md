# P3-144 Tip ieșire locked while a slip saves

Date: 2026-10-05. Branch: card/outbound-mode-lock. Role: EXECUTOR.

## What was wrong
Clicking "Creează bonul de eliberare" and then the other "Tip ieșire" option before the answer came back unmounted the form that was waiting. The issue was saved and stock deducted, but the screen showed an empty form and no confirmation. Same on the project and the walk-in path.

## What changed
- `components/outbound/OutboundModeChoice.tsx`: new `disabled` prop. It disables both radio inputs and the fieldset (`disabled`, `aria-disabled`), and greys the labels.
- `components/outbound/OutboundProjectForm.tsx` and `OutboundDirectClientForm.tsx`: pass their own `pending` as `disabled`, and ignore a mode change that arrives while pending.
- `tests/e2e/outbound-mode-lock.spec.ts`: three cases, the save request held for two seconds. During the save both options are disabled and a forced click does not change the mode. After it the confirmation shows and exactly one issue line exists for the product.
- Board card P3-144, LEARNINGS entry.

## Not changed
Save logic, stock deduction, labels, layout, server actions, the `lead=` prop, the hasPhase3Schema gate. No migration.

## Notes
- The repo has no component test runner, so the "component spec" is an end to end case. It needs the CI database and was not run locally.
- "A result that arrives after a mode change still shows its confirmation" is met by making that change impossible during a save, not by keeping an unmounted form alive.
