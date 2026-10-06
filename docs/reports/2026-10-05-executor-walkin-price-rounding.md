# P3-163: walk-in sale prices show their exact value

Pull request #433, branch card/walkin-price-rounding.

What changed for Rapid Construct: on the walk-in sale form and the outbound panel, unit prices and totals show the bani (12,50 MDL, 0,40 MDL) and are no longer rounded to whole lei.

Repair note (2026-10-05, repair run): the branch was synced with main, and the card was flipped from in_flight to shipped in this pull request, because `check:board-edit` refused a code pull request whose card was still in_flight. The code and the specs were not changed by the repair. The acceptance cases run in this pull request's own `quality` run.
