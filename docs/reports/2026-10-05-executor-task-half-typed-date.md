# P3-158: a half-typed date no longer clears the due date silently

Pull request #428, branch card/task-half-typed-date.

What changed for Rapid Construct: in the task form, a due date that is only half typed no longer wipes the saved due date without a message.

Repair note (2026-10-05, repair run): the branch was synced with main, and the card was flipped from in_flight to shipped in this pull request, because `check:board-edit` refused a code pull request whose card was still in_flight. The code and the specs were not changed by the repair. The acceptance cases run in this pull request's own `quality` run.
