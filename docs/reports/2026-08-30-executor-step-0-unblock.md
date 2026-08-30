# EXECUTOR: step 0, the four blockers cleared. AUT-14 shipped, five rulings, the deviz spec resolved.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/aut-14-shim-and-unblock`, cut from `origin/main` at `63d548a`
**Card:** AUT-14, plus rulings R-057 through R-061

---

## 0. Boot

Role stated: EXECUTOR. Both planning boards read before anything was written.

**Phase 2 board**, `docs/board/rc-board-phase2.json`, as read at `63d548a`:

| status | count |
|---|---|
| shipped | 35 |
| todo | 11 |
| blocked | 1 |
| in_flight | 1 |

Launch gate **6 of 9**. G4, G7 and G9 fail; G7 is `blocked_on: ivan`.
Next eligible card: **AUT-14**, `depends_on []`, `blocked_on null`.

**Phase 3 board**, 28 cards, all `todo`, gate 0 of 9.

---

## 1. What this pull request does, in one paragraph

It clears the four things standing in front of every CRM card. The self-merge
grant is widened to every path (R-059). The escalation list becomes the sole
authority for every role and the pointer to an untracked file is deleted
(R-057). The Docker shim is committed, wired and proved on all three of its
exit paths (AUT-14, R-060). The deviz spec is resolved in favour of the owner
addendum across all twelve differences, with P3-13 split three ways (R-058).
A fifth ruling opens the phase 3 board to interactive terminals while leaving
the harness on phase 2 (R-061), which the board's own doctrine required and the
dispatch did not mention.

---

## 2. The one premise in the dispatch that the repository contradicted, and why it is not a halt

The dispatch, step 0d:

> Read section 4 of `docs/reports/2026-08-28-executor-crm-board-halt.md`

**That file exists at no commit, on no branch, in no worktree.**

```
git log --all --oneline --name-only --diff-filter=A -- '*crm-board-halt*'   -> empty
git log --all --name-only --pretty=format: | sort -u | grep -i halt         -> empty
find /Users/ivan/rc-inventory -iname '*halt*' -not -path '*/node_modules/*' -> empty
find /Users/ivan -maxdepth 2 -iname '*crm-board-halt*'                      -> empty
```

**The content is on `main` under a different name.**
`docs/reports/2026-08-28-executor-phase-3-crm-preflight.md`, section 4, titled
"The deviz addendum against the authored card: the delta, so it is not
re-derived". Twelve differences, in the order they matter, plus a thirteenth.
Every one of them is resolved in this pull request.

**A wrong filename is not an absent premise and halting on it would have been
halting on a typo.** The check that settled it took ten seconds: list
`docs/reports/` for the same date and role, then grep for a distinctive phrase
from the citation. That is now a LEARNINGS entry, because this is the third time
this repository has paid for the difference between a record that does not exist
and a record that was misnamed, and only the first two were the former.

**Everything else in the dispatch verified.** Docker is running, server 29.4.2,
with `postgres:16` already pulled. `scripts/poc-free/local-db/` did not exist and
`npm run check:migrations` was absent, exactly as the preflight report's addendum
said. R-051 authorises the shim. The phase 3 board is on `main` as PR #98.

---

## 3. 0a: self-merge widened to every path. R-059.

`CLAUDE.md` section 3.1 rewritten. Four roles, EXECUTOR, AUTHOR, POC-BUILDER and
TRIAGE, merge their own pull request on any path once `quality` is green on the
head sha.

**The id.** The dispatch called this R-056. R-056 was taken two days earlier by
the ruling that added AUTHOR on the EXECUTOR path set, and the rules at the top
of `decisions/inbox.md` forbid editing an old ruling: a changed mind is a new
dated ruling that supersedes the old one by id. Overwriting R-056 would have
destroyed the record of the narrower grant and made every citation of "R-056"
ambiguous by date. **It is R-059, section 3.1 names all three ids in order, and
the ruling says in terms that a future dispatch citing R-056 for the widening
means R-059.**

**Two clauses were read narrowly and both are declared.**

**The acceptance half of section 5b is NOT removed.** R-049 removed it only for
documentation-shaped paths, on the reasoning that a docs-only pull request has no
acceptance to run. The paths this widening adds are exactly the ones that do have
one. Extending the removal would mean application code shipping with nobody
having run its named test. The dispatch's own per-card line says the opposite:
"machine-checkable acceptance, committed report, self-merge on green". **What is
removed is the wait for the owner. The proof stays.**

**This pull request merges under the grant it creates.** R-056's own pull request
deliberately went to Ivan, on the reasoning that a grant authorising its own
creation is a terminal writing its own permissions. That reasoning is right and
does not apply here: the widening is an owner instruction stated twice, and the
dispatch carrying it says to self-merge on green and to work continuously without
returning to the owner between cards. Stopping to ask him to merge the pull
request implementing his instruction not to stop and ask him would be a loop, not
a safeguard. It is written down because it is the kind of thing that should never
pass unremarked.

---

## 4. 0b: the escalation list is the sole authority. R-057.

**The list was already this list, and that is the useful finding.** The
dispatch's ten items map onto `docs/DOCTRINE-TRIAGE.md` section 6's committed ten
one for one, with nothing added and nothing dropped. The mapping table is in
R-057.

**So two things changed and neither is the list.**

**One: the section now binds every role, not only TRIAGE.** It sat inside a
document about TRIAGE and was written in TRIAGE's voice, so an EXECUTOR or an
AUTHOR reading it could reasonably conclude it bound somebody else. That is how a
dispatch came to cite an external document at all: no file visibly answered "what
may I decide" for the role reading it.

**Two: the pointer is deleted.** Section 6 carried a paragraph naming
`/Users/ivan/Downloads/RC-PROJECT-RULES.md`, saying it held a similar list, and
saying no terminal is required to open it. Every sentence of that was true and it
still did harm: naming a file a terminal must not rely on leaves the reader
wondering whether they ought to go and look, which is most of the cost of the
citation it was neutralising.

**Item 7 gains named examples and loses nothing.** DNS, Vercel, Supabase,
BotFather, email and payment consoles, under a category test that is unchanged.
**BotFather is the one worth adding**: the Telegram bot is this project's own
plumbing rather than a client-facing service, which made it the single panel a
terminal was most likely to reason itself into treating as internal.

**Four references remain and three of them are correct.**

| where | what it is | action |
|---|---|---|
| R-050, `decisions/inbox.md` | a ruling recording that the citation failed | kept, rulings are never edited |
| `2026-08-28-author-authorization-grants.md` | a report recording the same | kept, `CLAUDE.md` 9b |
| AUT-12 notes, phase 2 board | a card note recording the same | kept |
| AUT-13 notes, phase 2 board | the file offered as CORROBORATION for the plain-hyphens rule | **deleted** |

The first three are records that the citation failed, not citations. Deleting
them would remove the only committed explanation of why the reference stopped
being used. **The fourth was the only live one**, and a rule in this repository
does not become more binding by being agreed with somewhere a terminal cannot
read.

**`CLAUDE.md` needed no edit.** It never referenced the file. `grep -rn
'RC-PROJECT-RULES\|Downloads/' CLAUDE.md` returns nothing, before and after. No
dispatch template exists in the repository either; `grep -rni 'dispatch
template'` across `docs/`, `CLAUDE.md`, `decisions/` and `scripts/` returns
nothing. Both were checked rather than assumed, because the dispatch named them.

---

## 5. 0c: AUT-14, the shim. Committed, wired, and all three exits proved.

`scripts/poc-free/local-db/shim.sql` and `scripts/poc-free/local-db/apply.mjs`,
wired as `npm run check:migrations`, at the location the card fixed.

### 5.1 The pass path, exit 0

```
$ npm run check:migrations
docker server 29.4.2
shim applied
applied 0001_phase2_schema.sql
applied 0002_rc_docs_bucket.sql
applied 0003_inbound_functions.sql
applied 0004_outbound_functions.sql
applied 0005_service_role_grants.sql
applied 0006_reminder_recipients.sql
applied 0007_seed_categories.sql
applied 0008_extraction_drafts.sql
applied 0009_revoke_anon_on_extraction_drafts.sql
applied 0010_confirm_extraction_draft.sql
applied 0011_extraction_confirm_corrections.sql
applied 0012_manager_flagged_products.sql

12 migration files applied, unmodified, on postgres:16

EXIT=0 elapsed=2s
$ docker ps -a --filter name=rc-check-migrations   ->  no rows
```

### 5.2 Failing path (a): one corrupted migration, exit 1, the file named

The card requires this because a checker that has only ever passed is a checker
nobody has tested. A scratch copy of the two directories, with one line appended
to `0007_seed_categories.sql` referencing a column that does not exist:

```
EXIT=1
docker server 29.4.2
shim applied
applied 0001_phase2_schema.sql
...
applied 0006_reminder_recipients.sql
FAILED: supabase/migrations/0007_seed_categories.sql
ERROR:  column "nonexistent_column" does not exist
LINE 1: select nonexistent_column from public.categories;
               ^
```

**This run also proves the pass path was real work.** Two seconds for twelve
files invites the suspicion that psql was never executing anything; a run that
stops on statement-level semantics inside file seven settles it.

### 5.3 Failing path (b): Docker unusable, exit 2, one line naming Docker

**Docker Desktop was not stopped to test this**, because `docker cp` has already
taken this machine down once and stopping the daemon mid-session is a worse test
than a faithful one. The client was pointed at a dead socket instead, which is
precisely what a stopped daemon looks like to it, and both sub-branches were
exercised:

```
$ DOCKER_HOST=unix:///nonexistent/docker.sock node scripts/poc-free/local-db/apply.mjs
EXIT=2
Docker is installed but the daemon is not responding. Start Docker Desktop and run this again.

$ env PATH=<node only, no docker> node scripts/poc-free/local-db/apply.mjs
EXIT=2
Docker is not installed, or `docker` is not on PATH. This check needs a running Docker daemon and nothing else.
```

`docker version --format '{{.Server.Version}}'` is the probe, not
`docker --version`, because the second answers from the client alone and would
report success against a stopped Docker Desktop.

### 5.4 The card's constraints, each one and how it is met

| constraint | how |
|---|---|
| never `docker cp` | not used. SQL is fed on stdin to `docker exec -i` |
| teardown always runs | `process.on('exit')`, plus SIGINT and SIGTERM handlers, plus a `die()` that tears down before it writes |
| name derived from the process | `rc-check-migrations-<pid>-<base36 time>` |
| never reads a secret, never takes a host | no arguments, no database env var, every path derived from `import.meta.url` |
| migrations applied UNMODIFIED | files are read and piped byte for byte. Nothing rewrites, strips, splits or reorders |
| object count not asserted | the file is the authority. Three committed documents disagree about whether it is five, nine or ten |
| shim contains only what Supabase provides | roles `anon`, `authenticated`, `service_role`; schemas `auth`, `storage`; `auth.users`, `auth.uid()`, `auth.role()`, `storage.buckets`, `storage.objects` |

**One deviation from the card defaults, logged rather than left to be noticed in
review.** The default says to deliver by read-only bind mount AND feed on stdin.
**As built it is stdin only and there is no mount.** The operative rule is never
`docker cp`, and stdin satisfies it alone; a mount nothing reads is dead weight,
and a read-only bind mount on macOS is also the part most likely to fail for
reasons unrelated to a migration. The card's `defaults` field now carries this.

**Two things the shim does that a minimal one would not, both deliberate.**

`auth.uid()` reads `request.jwt.claims` the way the real one does, instead of
returning null. Fifteen policies call it. A stub returning null makes every
owner-scoped policy silently deny, and a suite that only ever sees denial proves
nothing about the allow path.

**RLS is enabled on `storage.objects` in the shim.** Migration `0002` says in a
comment that "RLS is already enabled on `storage.objects` by Supabase" and then
relies on it: it creates three policies and never enables RLS itself. A shim that
left RLS off would apply `0002` cleanly and produce a bucket whose policies
restrict nothing, which is the class of failure this tool exists to catch before
it reaches a real project.

### 5.5 Wired into `quality`, against the card default that forbade it. R-060.

The card's `defaults` said `IT IS NOT ADDED TO THE QUALITY WORKFLOW`, in
capitals. The dispatch says `wired into quality`. `CLAUDE.md` section 5 settles
precedence in one line, defaults fill silence and do not contradict speech, but
precedence alone is a poor reason to overwrite a written argument, so the
argument is answered instead.

**The default is correct about the migrations and weighs the wrong artefact.**
CI does already apply every migration to a real stack via `supabase db reset`.
**The step does not guard the migrations. It guards the shim.** The day a
migration references a Supabase object `shim.sql` lacks, `supabase db reset`
still passes, because a real stack has every object; the local tool silently
stops working and nobody finds out until the next session that needs it, offline,
with no credentials, in the middle of proving a destructive statement. That is
the exact situation the tool exists for and the worst possible moment to discover
it rotted.

The same argument is already made in this workflow, about the phase 3 board
validator: a board nobody works is exactly the board that rots.

Cost measured, not estimated: about two seconds locally on a warm image, plus a
one-time image pull on the runner.

---

## 6. 0d: the deviz spec resolved. R-058.

All twelve differences resolved in favour of the owner addendum. `P3-13` becomes
three cards along the addendum's own build order, so the board goes from 28 cards
to 30.

| card | was | is |
|---|---|---|
| P3-13 | the whole deviz feature, one card, `depends_on [P3-09]` | the schema alone, `depends_on [P3-03]` |
| P3-13b | did not exist | the line editor, `depends_on [P3-13, P3-09]` |
| P3-13c | did not exist | the comparison view, `depends_on [P3-13b, P3-04]` |
| P3-18 | `depends_on [P3-13]` | rewritten, `depends_on [P3-13c]` |
| P3-12 | `depends_on [P3-11]` | rewritten, `depends_on [P3-11, P3-13b]` |

### 6.1 The two contradictions, both on P3-18, both of which would have shipped green

**The status set.** The authored acceptance asserted that a project `in lucru` is
EXCLUDED from the material requirement even with a deviz. The addendum includes
it. An executor working that card would have written the assertion the card
named, watched it pass, and shipped a procurement screen that omits the largest
committed demand on the board.

The authored reasoning was that an active project is already consuming from stock
and the low-stock alerts cover it. **That reasoning is answered by the second
fix rather than by exclusion**: an active project's REMAINING requirement is
exactly what it still needs.

**The subtraction.** The authored card summed accepted deviz quantities with no
subtraction of what had already been issued, which over-orders by exactly the
amount already delivered. The requirement is now deviz lines minus issued
quantity, **floored at zero per project per product, before aggregation, never
after**, so a project that over-issued one product contributes zero for it rather
than a negative that quietly cancels another project's genuine requirement.

### 6.2 The remaining ten, and where each landed

| # | difference | card |
|---|---|---|
| 3 | price was a default-and-override, not a snapshot | P3-13, P3-13b |
| 4 | no status pipeline, so a draft would have fed procurement | P3-13, P3-18 |
| 5 | no versioning | P3-13, P3-13b |
| 6 | `devize` field list absent | P3-13 |
| 7 | `deviz_lines` field list absent | P3-13 |
| 8 | comparison was quantity-only | P3-13c |
| 9 | no over-issue flag | P3-13c |
| 10 | no foot totals | P3-13c |
| 11 | `Neprevazut` described in English, not named in Romanian | P3-13c |
| 12 | P3-12 carried two numbers where three are needed | P3-12 |
| 13 | stale `INVENTED, NOT REQUESTED` notes and a stale halt instruction | P3-13, P3-18 |

Delta 3 is the one with a named test, because the addendum asked for one by name:
**a deviz quoted in March still shows March prices in June.** A
default-and-override and a snapshot are indistinguishable on the day they are
built and diverge silently afterwards, so the acceptance asserts the divergence
rather than the mechanism.

Delta 13 matters more than its position suggests. P3-13's notes instructed the
executor to HALT and block on Ivan if the versioning or price model turned out to
contradict how Mihai works. The addendum settles both: "Both previously marked
INVENTED. Both now IN." A stale halt instruction is the most expensive kind of
stale text on a board.

### 6.3 The one place the addendum's literal text is not copied

The addendum names the pipeline `draft, emis, acceptat, respins, expirat`, which
is one English word and four Romanian ones. **That is a list of UI states, not of
SQL tokens.** P2-01 fixed the convention that stored enum values are English with
Romanian labels in the presentation layer, and `public.project_status` on P3-03
already follows it.

**The set of five states, their order, and the rule that only `accepted` feeds
procurement are the addendum's and are binding.** Stored:
`draft, sent, accepted, rejected, expired`. Labels: Ciorna, Emis, Acceptat,
Respins, Expirat. If that reading is wrong it is wrong about five strings in a
migration and nothing about behaviour.

### 6.4 Three ambiguities the addendum did not cover, decided under the board's wide defaults rule

- **`margin_percent` applies to the deviz total, not per line.** The addendum
  lists it on `devize` and lists no per-line margin column. Foot rows: Subtotal,
  Adaos, Total.
- **`currency` is a column and a CHECK pins it to MDL this phase.** P3-03 already
  ruled multi-currency out of scope and every wave 3 computation sums MDL.
  Storing a currency the arithmetic ignores would be a third silent-wrong-number
  path on a board that has just removed two. `CLAUDE.md` 8.6 already permits
  `ALTER TABLE ... DROP CONSTRAINT`, which is how a later card relaxes it.
- **`valid_until` is recorded and is not enforced by a job.** A deviz still
  `sent` past its date is displayed as expired with a Romanian warning; the enum
  value is set by a person. A scheduler is a separate card.

### 6.5 One rule that is enforced in the database rather than in a screen

A deviz past `draft` is superseded by a new version, never edited. That is
enforced by a before-update trigger in the P3-13 migration, and P3-13b's
acceptance requires the refusal to come from the database and not only from a
disabled button. The whole reason for versioning is that a client holds a copy of
what was sent, and a rule that exists in one screen stops existing the moment a
second screen touches the table.

---

## 7. R-061: phase 3 opens, and the harness does not move

The dispatch says "STEP 1 onward, build" and orders wave 1. The phase 3 board's
own `doctrine` field said the opposite:

> A terminal that finds itself picking a P3 card before phase 2 closes has made a
> mistake and stops.

The same field reserved the decision: "Phase 3 opens after that, by an owner
ruling that repoints the harness, and not before." **The dispatch is that owner
ruling.** The harness half is deliberately NOT done, so the sentence is amended
rather than deleted, and what it protected is kept: `run.sh`, `inbox.mjs` and
`notify.mjs` still read the phase 2 board by path and no line of them changes.

**Why waiting for 9 of 9 stopped being the right order.** The gate is at 6 of 9.
G4 needs the extraction round trip and P2-08b is `blocked` on Andre; G9 needs the
client to complete a cycle downstream of G4, P2-13 and P2-14. **The gate cannot
reach 9 of 9 on any timetable this repository controls.** Sequencing phase 3
behind it did not mean "later", it meant "when somebody outside the project gets
round to something else", and the thing queued behind it is the owner's primary
complaint about the platform. That is now a LEARNINGS entry in its general form:
a sequencing rule whose unblock condition is outside this project's control needs
an explicit escape written at authoring time.

---

## 8. Acceptance, run

| check | result |
|---|---|
| `npm run check:migrations` | exit 0, 12 files, container removed |
| corrupted migration, scratch copy | exit 1, failing file named |
| `DOCKER_HOST` at a dead socket | exit 2, one line naming Docker |
| `docker` absent from PATH | exit 2, one line naming Docker |
| `node docs/board/validate-board.mjs` on all three boards | PASS, 0 violations each |
| `npm run check:conflict-residue` | 3 checks passed |
| em dash or en dash in any file touched | zero |

---

## 9. Learnings appended

Four entries in `docs/LEARNINGS.md`:

1. **A dispatch cited a report filename that does not exist, and the report
   does.** Search for a cited file's CONTENT, not only its name, before treating
   it as absent.
2. **A wrong acceptance line does not fail, it certifies.** It is the one
   artefact whose being wrong produces a green result, and an acceptance that
   asserts something is EXCLUDED is the shape to look at hardest.
3. **A rule that waits on a third party is a rule that never fires.** Check
   whether a sequencing rule's unblock condition is inside this project's
   control, and write the escape at authoring time.
4. **The Supabase shim is what rots, not the migrations it applies.** When
   deciding whether a check earns its place in CI, ask what it GUARDS rather
   than what it asserts.

---

## 10. Production writes

**None.** Nothing in this pull request connects to any database. `docs/PRODUCTION-WRITES.md`
gets no row, and `docs/migrations/APPLY-LOG.md` gets no entry, because there is
nothing to record: the only database this pull request touches is a container it
starts and removes in the same process, and it cannot be pointed anywhere else.

---

## 11. What is next

The board is open and wave 1 is clear. Next eligible on the phase 3 board are
`P3-01` and `P3-05`, both `depends_on []`. `P3-01` is lower and is taken next.

Migration numbers: `0012` is the highest in `supabase/migrations/`, so the next
free is **0013**.
