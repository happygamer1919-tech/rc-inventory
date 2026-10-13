# P3-148 tests added after the fact

Card P3-148 (a walk-in line with a product but no quantity is refused) was marked shipped by #430 without the three named cases its acceptance promises. This pull request adds them to `tests/e2e/outbound-direct-client.spec.ts`. No behaviour changed: the form and the server already refused the case.

## Cases added
- `outbound walk-in: three lines, third without quantity, create button shows the message and no slip is created`: expects "Rândul 3: completați cantitatea sau ștergeți rândul." and the same number of slips for the test client before and after.
- `outbound walk-in: filling the quantity then saves 3 items`: after the refusal, fills the third quantity, saves, and expects 3 stored lines.
- `outbound walk-in: a payload with a half-filled line is refused by server`: captures the real server action request of a good save, replays it with a second line that has a product and an empty quantity, and then one with a quantity and no product. Expects the server message "Un rând are produs fără cantitate sau invers." and no new slip.

## Notes
- A quantity of "0" is not in the server case: the reader refuses it earlier with the invalid-quantity message, which is a different rule.
- E2E runs only in CI on this machine. Local: tsc, build and the board and repo checks.
- Board: P3-148 evidence and last_checkpoint point to this pull request, lane stays shipped.
