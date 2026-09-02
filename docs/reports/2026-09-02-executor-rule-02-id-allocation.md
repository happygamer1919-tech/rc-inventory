# EXECUTOR, 2026-09-02: RULE-02, id allocation becomes atomic and collisions fail the build

Card **RULE-02**. Branch `card/rule-02`. No migration, no database, no secret read, no production write.

---

## 1. What went wrong, twice

"Namespaced by author" was doctrine and was enforced by nothing.

On 2026-09-01 a TRIAGE branch authored **R-083 through R-089** while **R-083 through R-086** were being authored on `main`, with completely different meanings:

| id | on `main` | on the branch |
|---|---|---|
| R-083 | deviz is internal only | the input this run was handed was not the newest report |
| R-084 | `prove:applier` enters `quality` | the deviations in both reports, ratified |
| R-085 | a batch's declarations describe what it changes | R-082 records the owner with no verbatim text |
| R-086 | stopping is only correct when work cannot continue | the phase 3 gate audit re-runs |

**The collision was invisible to git.** The two branches appended to *different parts* of `decisions/inbox.md`, so there was no merge conflict to notice. Two authors each believed they held R-083, and the only thing that caught it was a human reading both. Three ruling ids ended up stranded on a pull request that was then closed unmerged (#143).

## 2. Two halves, because neither substitutes for the other

### The counter makes allocation atomic

`decisions/NEXT-RULING-ID` holds one id, `R-NNN`, and nothing else. You read it, you use it, and **you advance it in the same commit as the ruling.**

It is one line, so two terminals allocating at the same time produce a **merge conflict on that line** - the loudest signal git has. Before it existed there was no conflict at all.

**A counter rather than a role prefix, and the reason is the readers.** A prefix (`R-TRIAGE-001`) makes collisions structurally impossible, and it forks a namespace that ninety rulings and every cross-reference already use, so every future reader has to know both schemes and which era a citation belongs to. The counter keeps one flat namespace and converts the collision into a conflict. That judgement was the card's to make and this is where it is recorded.

### The check catches what the counter cannot

**The counter alone would not have caught #143.** Both branches were cut from the same `main` and neither merged, so no conflict ever surfaced.

So `check-unique-ids.mjs` reads **`origin/main` as well as the working tree** and refuses a ruling id whose heading differs from the same id on main. Within each side the ids were perfectly unique; the collision existed only *between* them, and nothing in the repository was asking that question.

It refuses, in `quality`, on every pull request:

- a card id twice, on one board or across all three
- a ruling id twice in `decisions/inbox.md`
- **a ruling id redefined against `origin/main`** - the #143 case
- a counter that has not moved past the ruling just written
- a ruling-shaped heading the regex cannot parse
- a board carrying zero cards

## 3. It asserts its own input count against its match count

`docs/LEARNINGS.md` names the class: a matcher whose empty result means "nothing to do" reports a broken scanner as a clean tree. **A duplicate check that parses zero ids finds zero duplicates**, and this is exactly the shape most likely to fall into it.

So every heading that *looks* like a ruling is counted, every heading *parsed* as a ruling is counted, and a divergence not explained by the one documented exception - the `### R-NNN - <one line naming the decision>` template at the top of the inbox - is a hard failure. Fixture case 6 drives precisely that.

## 4. Acceptance, run

```
$ npm run check:unique-ids
  boards        3, 129 card(s), 129 id(s) read
  decisions/inbox.md   87 ruling-shaped heading(s), 86 parsed, 1 skipped with a reason
  origin/main   86 ruling id(s)
  this branch   0 new ruling id(s)
  decisions/NEXT-RULING-ID  R-087, highest allocated 086
  check-unique-ids: OK. 129 card id(s) across 3 boards and 86 ruling id(s) are each
  unique, 0 redefined against main.

$ npm run prove:unique-ids
  ok    CONTROL: a record with no duplicate id passes
  ok    REFUSES two cards with the same id on ONE board
  ok    REFUSES the same card id on TWO boards, which no single board can see
  ok    REFUSES two rulings with the same id in the inbox
  ok    REFUSES an id that means something else on main. THIS IS THE #143 CASE
  ok      ...and a genuinely NEW ruling id on the same branch passes
  ok    REFUSES a counter that has not moved past the ruling just written
  ok      ...and accepts a counter that IS ahead
  ok    REFUSES a ruling-shaped heading it cannot parse, rather than skipping it
  ok    REFUSES a board with zero cards, which would make an empty duplicate set look clean
  ok    FINAL CONTROL: the passing case still passes after all of the above
  prove-unique-ids: every collision is refused and every control passes.
```

**Each fixture is a real git repository with a real `origin/main`**, built in a temp directory and deleted. That matters: the load-bearing question is answered with `git show origin/main:decisions/inbox.md`, and a fixture with no origin would exercise every other branch of the file and skip the one the card is about.

**Each negative case is paired with a control that must pass on the same fixture**, so a fixture that fails to build cannot satisfy every assertion while proving nothing. The passing case is re-run **last**, after every refusal.

## 5. No id is renumbered to make it pass

History is not rewritten. Where two ids already collide, the pair goes in the check's `TOLERATED` list with its reason, exactly as `check-card-ids` keeps an allow-list rather than editing the log.

**That list is committed empty.** The check was written against a record that has no duplicates, so the first entry anybody adds is a decision to tolerate one - readable in a diff - rather than a silent widening.

## 6. CLAUDE.md section 8b

A rule that lives only in a script is a rule the next session does not read before it allocates. Section 8b carries the three-step allocation, the reason it is a counter and not a prefix, and the no-renumbering rule.
