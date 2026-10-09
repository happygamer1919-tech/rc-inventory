# P3-201 report: date boxes red only after blur

- Cause: P3-158 changed `invalid` in components/ui/DateField.tsx to `text !== "" && parsed === null`, so every date box turned red from the first digit.
- Fix: optional prop `markWhileTyping`; `invalid = markWhileTyping ? incomplete : incomplete && (touched || digitCount >= 8)`. Only components/tasks/TaskForm.tsx passes it. `completeOnly` untouched.
- Spec: tests/e2e/p3-201-datefield-red-after-blur.spec.ts (runs in CI only; no Docker here). The repo has no component test runner, so acceptance (a) and (b) are Playwright tests on real forms.
- Board: P3-201 added on docs/board/rc-board-phase3.json. No migration.
