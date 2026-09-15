# DOCTRINE-PATTERNS

**Created 2026-09-15 by ruling R-198, on the owner's dispatch of that day.**

A named pattern is a failure shape this project has already paid for, stated once
and by name, so the next instance is recognised as that pattern rather than
rediscovered.

**Why this file exists.** The owner's dispatch asked for a pattern to be added to
"the doctrine list". **No such list existed.** Until this file, standing patterns
lived only inside the rulings in `decisions/inbox.md` that recorded them. This
file is that list. It carries the pattern the dispatch named, and the pattern the
dispatch says it is distinct from, because neither can be read correctly without
the other.

**What an entry carries.**
- **the name**
- **the rule**, in one sentence
- **the ruling that records it**, which stays the authority
- **what it is distinct from**
- **its instances**
- **what does not work against it**

**Other standing rules that name a failure shape stay in their rulings and are not
copied here.** Examples are R-186, on the delta not being a quality measure, and
R-193, on a control that has never executed. Entering one is a later decision, and
it cites its ruling the way the two entries below do.

---

## P-1. Errors that agree with each other

**The rule.** A deterministic misread returns the same wrong value on every pass,
so comparing passes, or voting across them, certifies the error instead of
catching it.

**Recorded by:** R-185, 2026-09-09.

**The instance.** A counterparty scan measured at the line level across four
passes. One unit price moved, three lines were byte-identical and correct every
pass, and one line was byte-identical and wrong every pass.

**What does not work against it.** Multi-pass comparison and majority voting are
ruled out permanently. Three passes over the wrong line return the same wrong value
three times, and a vote reports it as unanimous.

**What can still catch it.** A check on a relation the misread does not satisfy.
Reconciling the line sum against a printed total is one, provided the wrong value
breaks that sum.

## P-2. A manufactured value that satisfies the check built to verify it

**The rule.** A manufactured value that satisfies the check built to verify it is
undetectable by that check.

**Recorded by:** R-198, 2026-09-15.

**Distinct from P-1.** In P-1 a value is misread, and the wrongness repeats. A
check on a relation the misread breaks can still catch it. In P-2 the value is
derived from the very relation the check tests, so every check of that relation
passes it with a difference of zero, by construction. **P-1 is defeated by
agreement. P-2 is defeated by construction.**

**The instance.** When a printed line total was absent, the counterparty's model
produced the missing figure as quantity times unit price. The document reconciled
exactly and was reported cleanly extracted. **The boundary date, the counterparty's
prompt change, is TBD pending the counterparty's confirmation.** Incidence before
it is unknown and cannot be measured from stored data.

**What does not work against it.**
- **No arithmetic control on either side.** The sum reconciliation and the header
  checks both pass it.
- **Checking `line_total` against quantity times unit price.** That is the same
  trap one layer down: it verifies exactly the relation the figure was computed
  from, so adding it would add a second check that certifies the defect.

**The only control.** A rule at the producer, refusing to emit a figure the source
does not show: the line carries `line_total: null`. On the counterparty's side that
routes to `partial` with cause `lines`. On ours, a null `line_total` lands as R-198
part (c) records.

**How to recognise the next instance.** Ask what the check verifies, then ask
whether the value could have been produced from that same relation. If it could,
the check is not evidence that the value was read.
