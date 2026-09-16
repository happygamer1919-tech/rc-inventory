# DOCTRINE-PATTERNS

**Created 2026-09-15 by ruling R-198, on the owner's dispatch of that day.**

A named pattern is a failure shape this project has already paid for, stated once
and by name, so the next instance is recognised as that pattern rather than
rediscovered.

**Why this file exists.** The owner's dispatch asked for a pattern to be added to
"the doctrine list". **No such list existed.** Until this file, standing patterns
lived only inside the rulings in `decisions/inbox.md` that recorded them. This
file is that list.
- It opened with P-2, the pattern the dispatch named, and P-1, the pattern that
  dispatch said it is distinct from, because neither can be read correctly without
  the other.
- The owner's next dispatch, the same day, added P-3.

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
it cites its ruling the way the entries below do.

**A sentence here that turns out to be false is quoted and marked, never deleted,**
the way `CLAUDE.md` section 9c binds its own text. P-2 carries the first such
correction.

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

**Recorded by:** R-198, 2026-09-15, parts (a) to (f), amended the same day.

**Distinct from P-1.** In P-1 a value is misread, and the wrongness repeats. A
check on a relation the misread breaks can still catch it. In P-2 the value is
derived from the very relation the check tests, so every check of that relation
passes it with a difference of zero, by construction. **P-1 is defeated by
agreement. P-2 is defeated by construction.**

**The instance.**
- When a printed line total was absent, the counterparty's model produced the
  missing figure as quantity times unit price. The document reconciled exactly and
  was reported cleanly extracted.
- **It was never exercised against a client document.** The counterparty reports
  that his scenario has never been active: 46 executions between 1 and 15
  September 2026, all his own. There is no unmeasured historical incidence, and no
  boundary date is needed for past traffic.
- **The boundary that exists is his prompt version `2026-09-15b`.** See "The
  control that shipped" below and R-198 part (g).

**Superseded 2026-09-15 by R-198's amendment, quoted as written:**

> *"The boundary date, the counterparty's prompt change, is TBD pending the
> counterparty's confirmation. Incidence before it is unknown and cannot be
> measured from stored data."*

**What does not work against it.**
- **No arithmetic control on either side.** The sum reconciliation and the header
  checks both pass it.
- **Checking `line_total` against quantity times unit price.** That is the same
  trap one layer down: it verifies exactly the relation the figure was computed
  from, so adding it would add a second check that certifies the defect.
- **An instruction to withhold.** Two prior attempts at a withholding rule were
  ignored by the model, while `line_total` already permitted null.

**The control that shipped.**
- Prompt version `2026-09-15b` makes every line carry a required `line_total_source`,
  valued `printed` or `derived`.
- One `derived` line fails reconciliation, regardless of arithmetic agreement.
- This replaces an instruction to abstain with an instruction to declare, and the
  failure no longer depends on the arithmetic the manufactured figure satisfies.
- **What it still cannot prove:** that a line declared `printed` was printed. That
  remains the model's account of its own reading.

**Superseded 2026-09-15 by R-198's amendment, quoted as written:**

> *"The only control. A rule at the producer, refusing to emit a figure the source
> does not show: the line carries `line_total: null`. On the counterparty's side
> that routes to `partial` with cause `lines`. On ours, a null `line_total` lands
> as R-198 part (c) records."*

**How to recognise the next instance.** Ask what the check verifies, then ask
whether the value could have been produced from that same relation. If it could,
the check is not evidence that the value was read.

## P-3. A control filed under the wrong scope

**The rule.** A control correctly written but filed under the wrong scope executes
in that scope only and reads as coverage everywhere else. **Its presence is what
prevents anyone looking.**

**Recorded by:** R-198 part (h), 2026-09-15.

**The bar.** A control's scope is verified independently of its text. Reading the
control, however correct it is, says what it does. It does not say where it runs.
That is established only by exercising it in every scope it is claimed to cover.

**The instance.** The counterparty's no-invented-figure rule existed under a
scanned-document heading in his prompt and was never applied to digital PDFs. Read
as text, it was the right rule. Filed where it was, it governed scans only, while
the manufactured figures of P-2 came from digital documents it never reached.

**Distinct from P-2.** In P-2 the control runs where it should and is satisfied by
construction; the value defeats the check. In P-3 the control would catch the
defect, but it runs somewhere else; the filing defeats the control.

**Distinct from R-193**, a control that has never executed. R-193's control runs
nowhere, so exercising it once exposes it. A P-3 control runs, correctly, in its
own scope, so exercising it there passes. It is exposed only by exercising it in
the scope it was assumed to cover.

**What does not work against it.**
- **Reading the control.** Its text is correct.
- **A review that confirms the control exists.** Its existence is the reason
  nobody checks where it applies.
- **A test in the scope it was written for.** That test passes.

**How to recognise the next instance.** For any control cited as coverage, name
each scope it is claimed to cover, and ask for evidence that it executed in each
one. A control with evidence from one scope and a claim about several is P-3 until
shown otherwise.
