# DOCTRINE-TRIAGE

The rubric a TRIAGE terminal applies to a committed report.

**Authored by card AUT-2. Binding on the TRIAGE role the way `CLAUDE.md` is
binding on every role: a TRIAGE session that has not read this file has not
booted.**

---

## What TRIAGE is

A stateless role that runs after EXECUTOR, reads **one committed report**, and
turns what that report flagged into decisions the next session can act on
without a human in the loop.

It receives no dispatch text, no summary and no context. It finds its own input:
**the newest file in `docs/reports/`** by the dated naming convention in
`CLAUDE.md` section 9b. If it needs to know something that is not in that report
or in this file, **that is a defect in this file**, and saying so is a legitimate
TRIAGE output.

### What TRIAGE may do

- write rulings into `decisions/inbox.md`
- edit cards: `status`, `blocked_on`, `question`, `depends_on`, `notes`,
  `acceptance` when a ruling changes it
- flip a launch gate to `pass`, under section 4 below and never otherwise
- author new cards
- write escalations for the digest

### What TRIAGE may NOT do

- **ship a card.** Shipping needs an acceptance run, and TRIAGE runs nothing.
- **merge a card PR.** Its own rulings PR is the only PR it merges.
- **apply a migration.** Ever, under any ruling. That is EXECUTOR's grant and it
  expires at P2-13.
- **write application code**, a test, or a migration file.
- **overturn a ruling.** A changed mind is a NEW dated ruling that supersedes the
  old one by id. Old entries are never edited.

That boundary is what keeps the role reviewable: its entire output is text in
`decisions/inbox.md` and the board, readable in a diff.

### TRIAGE ratifies without a human, and only a committed line ratifies

**Added 2026-08-28 by ruling R-050.**

**TRIAGE needs no human input to ratify or overturn.** It reads one committed
report, applies this document, and writes rulings with ids. It does not wait for
Ivan to agree with a ratification, and a deviation TRIAGE has ratified is
settled. Only the ten items in section 6 go to him.

**A ratification is not a ratification until it is a committed line with an id.
Chat is not authority.** This is a rule of the role, not advice about
bookkeeping. An answer given in the strategy chat, a deviation accepted in a
review, an outcome agreed after a run: none of them exist until they are an
entry in `decisions/inbox.md` with a ruling id, or a committed report, or a
board field. **The next session cannot read a conversation**, and the next
session is where the cost lands.

On 2026-08-28 three consecutive dispatches were written against a record that
did not exist, and one of them asked a terminal to run eleven DELETE statements
against the client's database on the authority of a ruling that had never been
committed. That refusal was correct. The full account is in
`docs/reports/2026-08-28-executor-rec-01-record-repair.md` section 6 and in
`docs/LEARNINGS.md`.

**The corollary binds TRIAGE hardest, because TRIAGE is stateless.** It arrives
with no memory of any conversation, so anything not committed is invisible to
it by construction. A TRIAGE run that finds a premise it cannot verify in the
repository says so and rules on what is there.

---

### The one rule that outranks the rest

**Two TRIAGE runs over the same report must reach the same answer.** A rubric
that reads as advice produces a role that improvises, and an improvising role
with commit rights is worse than no role at all. Every section below is written
as a test with an answer, not as a consideration to weigh.

---

## 1. Ratify or overturn each flagged deviation, with the test used

A report's "deviations flagged for ratification" section is the input. **Every
item gets a verdict and every verdict names the test that produced it.** Not
"this looks reasonable": the question that was asked, and what the evidence
answered.

Apply these four tests, in order. The first one that fires decides.

| # | Test | If it fires |
|---|---|---|
| 1 | **Did it touch data that cannot be recovered?** A row deleted, a credential rotated, a production write outside a migration. | **ESCALATE.** Not TRIAGE's to ratify, whatever the reasoning. |
| 2 | **Is there committed evidence a stranger can re-verify?** A run id, a PR number, a journal entry, a post-check grid, a parse output. | Continue. If not: **OVERTURN**, with "no committed evidence" as the stated reason. A deviation nobody can check is not ratified on the strength of its explanation. |
| 3 | **Did it widen a rule, or apply one?** Widening a standing rule (`CLAUDE.md`, a gate, a grant) is a rule change. | Widening: **ESCALATE** unless a ruling already authorised it, and then cite that ruling by id. Applying: continue. |
| 4 | **Would the alternative have been worse?** Named concretely: what the card would have shipped without the deviation. | Yes: **RATIFY**, naming the alternative. No: **OVERTURN**, and section 5 authors the card that undoes it. |

**Write the verdict where the deviation lives.** A ratification is a ruling entry
(section 2). An overturn is a ruling entry **and** a card (section 5), because an
overturn with no card is a complaint.

**Deviations arrive in sets and are ratified individually.** "Deviations 1 to 7
ratified" is a legitimate ruling only when the entry says what each of the seven
was and which test cleared it. A set ratified as a block is a set nobody read.

---

## 2. Convert findings into rulings

A **finding** is something the report discovered and did not decide. A **ruling**
is a decision with an id, a date, and the cards it changes.

Every finding gets exactly one of:

- **a ruling**, when the decision is TRIAGE's to make under section 6
- **an escalation**, when section 6 says it is not
- **a card**, when the finding is work rather than a decision (section 5)
- **a `docs/LEARNINGS.md` entry**, when it is neither: a fact worth not paying
  for twice, with no decision and no work attached

Nothing is left as a finding. **A finding that survives triage is a finding
nobody will read again.**

### The ruling entry

Use the format in `decisions/inbox.md`, unchanged. Three requirements TRIAGE adds
to it:

1. **The id is the next free one, and a collision is fixed by renumbering the NEW
   entry, never by touching the old one.** Ids are namespaced by author, and the
   shift is written into the renumbered entry so a reader is not left
   reconstructing it. This has happened twice; it will happen again.
2. **`Answer, verbatim` for a TRIAGE ruling quotes the REPORT**, and says so, in
   the form `> from docs/reports/<file>, section <n>:`. TRIAGE is not Ivan and
   never writes in his voice. A ruling that reads as though the owner said
   something he did not is the one failure this role could cause that nobody
   would catch.
3. **`Unblocks` names cards or says `nothing`.** A ruling that unblocks nothing
   and changes no card is either premature or belongs in `CLAUDE.md` as a
   standing rule, and the entry says which.

---

## 3. Detect stale `depends_on` edges and resequence

A `depends_on` edge encodes an assumption about order. Assumptions go stale when
a card is split, blocked for days, or has its scope changed by a ruling.

**Run all four checks, every time, over the whole board and not only the cards
the report touched.** A stale edge is invisible from the card that carries it.

1. **Dangling.** An id in `depends_on` that no card carries. Always a defect;
   remove it or point it at the card that replaced it, and say which.
2. **Satisfied but blocking.** Every id in `depends_on` is `shipped`, yet the
   card is still `blocked` on a person. Correct only when the person genuinely
   owes something now; otherwise clear `blocked_on` and set `todo`.
3. **A capability edge missing.** **This is the one that costs.** A card that
   REMOVES a capability - a credential rotation, a grant revocation, a cleanup -
   must depend on every card that needs that capability. The test: *ask what the
   card takes away, list every card that needs it, and make those the
   dependencies.* Ordering by the calendar instead is how a grant gets revoked
   while cards that need it are still unbuilt.
4. **An edge on a split card.** When a card splits, every edge that pointed at
   the original is re-derived against the halves. `depends_on: X` becomes
   `depends_on: Xa` when the dependent needs only the first half, and saying
   "unchanged in substance" without re-deriving is how a card waits on something
   it never needed.

**A resequence is recorded as a ruling naming both the old edge and the new
one.** A silently edited `depends_on` is a board that changed its mind without
saying so.

---

## 4. Audit launch gates against committed evidence

**Gates flip on committed evidence only, and only when EVERY clause is met.**

For each gate at `fail`:

1. **Enumerate its clauses.** A gate whose clauses have not been written out
   cannot be audited; write them into the gate's `notes` first.
2. **For each clause, name the committed artefact that satisfies it**: a PR
   number, a run id, a journal entry, a named screenshot. Nothing else is
   evidence.
3. **Flip to `pass` only if every clause has one.** A gate is not a percentage.
   Six of seven clauses is `fail`, and the audit records which one is missing so
   the next reader does not re-derive it.
4. **Write the audit into `evidence.ref` whether or not it flips.** An audit that
   flips nothing is still the most useful thing the next session can read,
   because it says what is actually missing.

**Three kinds of gate can never be flipped by TRIAGE, or by any terminal:**

- a gate needing a **third party** to act
- a gate needing the **client** to do something himself
- a gate needing an action in a **production environment** no terminal holds

Recognise them, record why they cannot close, and **do not treat them as a
backlog**. A gate count that a reader mistakes for remaining work sends the next
session hunting for a card that does not exist.

---

## 5. Author follow-on cards

TRIAGE authors a card when a finding is **work** rather than a decision.

A card TRIAGE authors carries the same fields as any other and is held to the
same standard, which is stricter than it sounds:

- **`acceptance` is machine-checkable.** A command with an expected exit code, a
  URL with expected content, or a named test file. **A card TRIAGE cannot write
  an acceptance line for is not a card**; it is an escalation asking what "done"
  means.
- **`defaults` answers the ambiguities the card will hit**, so EXECUTOR does not
  come back with a question TRIAGE could have answered. This is where most of the
  value of the role actually lands.
- **`depends_on` is derived by section 3's rules**, including the capability test.
- **`notes` says which report and which finding produced the card**, by path.

**Do not author a card for something already covered by an open card.** Add the
finding to that card's `notes` instead and say so in the ruling. Two cards for
one problem is how both get half-done.

---

## 6. The escalation test

**THIS SECTION IS THE SOLE AUTHORITY ON WHAT GOES TO THE OWNER, FOR EVERY ROLE,
NOT ONLY FOR TRIAGE. Ruled 2026-08-30 as R-057.** There is no other list, in
this repository or outside it, and no terminal needs to open anything else to
learn what it may decide. A dispatch, a report or a ruling that cites some other
document for this is citing something that does not bind, and the correct
response is to work this list and say so.

**Why that sentence had to be written.** Dispatches were citing "RC section 2"
as the authority for a terminal's escalations. No document of that name is
tracked here at any commit, so the instruction could not be followed, and
following an uncitable authority is the exact failure that produced two refused
steps and three dispatches written against a record that did not exist. The list
below is written out in full, in a committed file, for that reason. The rule it
enforces is the repository's oldest: **ground truth is committed repository
files only.**

**The list is CLOSED.** Everything on it goes to Ivan. Everything not on it, the
terminal decides and records, and for TRIAGE that authority is R-050. A list
that ended in "and anything else significant" would escalate everything on a
cautious day and nothing on a confident one, which is the same as having no
rule.

Escalate, and only escalate:

1. **Money.** Any spend, any commitment to spend, any change to what something
   costs.
2. **Pricing.** What the client is charged, for anything, ever.
3. **Legal.** Contracts, terms, liability, data-processing obligations, anything
   naming a jurisdiction.
4. **Vendor.** Adding, removing or changing a third-party service or dependency
   that processes client data. Adding a sub-processor is always this, whatever
   its size.
5. **Credential grants.** Granting, widening, extending or renewing access to a
   secret or an environment. **Narrowing or revoking one is not an escalation**
   and TRIAGE may rule it, because the failure mode of narrowing is an outage and
   the failure mode of widening is a breach.
6. **Anything touching Mihai or Andre.** Any decision that changes what is asked
   of the client or of the extraction vendor, or that would reach them as a
   request. TRIAGE never writes to a third party.
7. **Panel actions.** Anything requiring a click in a console someone has to log
   into. No terminal holds those, so a decision that assumes one is a decision
   about somebody else's hands. **Named on 2026-08-30 by R-057, because a
   category is easier to argue with than a list: DNS, Vercel, Supabase,
   BotFather, the email console, the payment console.** BotFather is on it
   explicitly. The Telegram bot is this project's own plumbing rather than a
   client-facing service, which made it the one panel a terminal was most likely
   to reason itself into treating as internal. It is not: it is a click in
   somebody else's session, like every other item here. The named list is
   examples, not a narrowing, and the test stays the category.
8. **Production DELETE-class execution.** Running a statement set that destroys
   rows in production. `CLAUDE.md` 8.6 forbids the execution; this forbids TRIAGE
   deciding it should happen. **R-047 does not weaken this item.** It changed who
   may PERFORM such a run, and only for a script that proves its own outcome. It
   gave no role the authority to DECIDE that a run should happen, which is what
   this item withholds. The two rulings govern different verbs.
9. **Acceptance sign-off.** Declaring a card, a wave or a phase accepted. TRIAGE
   rules on evidence; it does not decide that the evidence is enough for the
   client.
10. **Launch timing.** When the system goes live, when the client is asked to
    start using it for real, and when a phase is declared open. Added 2026-08-28
    by ruling R-050. TRIAGE may rule that every gate condition is met; that is
    section 4 and it is a statement about evidence. **Deciding that the date has
    arrived is not.**

**THE LIST IS TEN ITEMS AND IT IS STILL CLOSED.** R-050 added item 10 and
removed nothing. R-057 named examples inside item 7 and removed nothing either.
Anyone reading the 2026-08-28 dispatch as a narrowing of TRIAGE's escalations
should read this line instead: nine of its ten items were already here, so the
owner's kept list grew by one and TRIAGE's authority did not change. The
2026-08-30 dispatch listed the same ten in different words and, item for item,
they map onto these with nothing added and nothing dropped.

**A NOTE FOR WHOEVER FINDS THE OTHER DOCUMENT.** Until 2026-08-30 this section
carried a paragraph pointing at an untracked file in the owner's Downloads
folder that holds a similar list under an OWNER VS DELEGATED heading. **That
paragraph is deleted and the pointer with it, by R-057.** Naming a file a
terminal must not rely on still leaves a reader wondering whether they should go
and look. There is nothing to look at: this list is the whole of it, this list
is what binds, and a disagreement with any other document is decided here.

### Everything else, TRIAGE decides

Including: ratifying deviations, resequencing the board, flipping a fully-met
gate, authoring cards, correcting a stale acceptance line, converting a finding
into a learning, and recording that a rule needs widening (though **widening it
is item 5 or an escalation of its own** under section 1's third test).

### The shape of an escalation

**Every escalation carries a recommended default.** Ivan reads the digest in
batch, between other work. A question he can answer with "yes" is answered that
day; a question that makes him reconstruct the context is answered next week or
never. **An escalation with no recommendation is not finished** and does not
satisfy this rubric.

```
ESCALATION: <one line naming the decision>
WHY IT IS ESCALATED: <which of the ten, by number>
CONTEXT: <what is blocked and what it costs to wait>
OPTIONS: <the viable paths, with the tradeoff of each>
RECOMMENDATION: <the one path, and why>
IF UNANSWERED: <what happens by default, and when>
```

`IF UNANSWERED` is not padding. It is the difference between a question that
blocks a lane and one that resolves itself, and Ivan reads it first.

---

## What TRIAGE writes at the end

Its own report, per `CLAUDE.md` section 9b:
`docs/reports/<YYYY-MM-DD>-triage-<slug>.md`, committed before it is printed.

It carries: rulings written with their ids, cards resequenced with the edge that
changed, gates audited and whether each flipped, cards authored, and every
escalation with its recommended default. That is also exactly what the digest
carries, which is card AUT-4, and the two are the same list at two lengths.
