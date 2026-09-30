# P3-117: the section-transition baseline, and nothing fixed

EXECUTOR, goal G72, branch `card/p3-117`, pull request #384, cut from `origin/main` at `9e17b02`.
Written 2026-09-30.

**Nothing was optimised.** That is the card's own first clause, twice: "THIS CARD DOES NOT FIX
ANYTHING AND MUST NOT." `git diff --name-only origin/main...HEAD` lists no path under `app/`,
`components/` or `lib/`, and no path under `supabase/migrations/`. No cause card was authored and no
second pull request was opened.

---

## 1. The six numbers, for the owner, in plain words

Measured on a test copy of the system that CI builds and seeds from scratch, ten moves per screen,
reporting how long the slowest quarter of the moves took:

| Screen | Slowest quarter of moves | Moves measured |
| --- | --- | --- |
| Tablou de bord | 175 ms | 10 |
| Inventar (Stoc) | 180 ms | 10 |
| Ieșiri materiale | 123 ms | 10 |
| CRM | 104 ms | 10 |
| Facturi | 120 ms | 10 |
| Setări | 182 ms | 10 |

**Two tenths of a second at the worst, against the two to four seconds Rapid Construct reports.**

### The slowest sections, named

In this measurement the slowest three are **Setări (182 ms)**, **Inventar (180 ms)** and **Tablou de
bord (175 ms)**, and the fastest is **CRM (104 ms)**. The spread between best and worst is 78 ms.

**But that ordering must not be used to pick cause cards, and here is the honest reason.** On this
test copy every screen is fast, so the ranking is a ranking of small differences between screens that
are all fine. It is not a ranking of the problem the owner described, because the problem the owner
described did not happen here at all.

### What the measurement actually found, and it is the important finding

**The complaint does not reproduce on a small, local, freshly seeded copy of the system.** Every one
of the six screens came back roughly ten to twenty times faster than the owner's report. That is not
a contradiction of the owner: it is information about where the two to four seconds comes from. It is
not in the part this measurement can see from a CI runner, which is the client-side route change on a
production build talking to a database on the same machine with a handful of test rows in it.

So the two to four seconds is somewhere the test copy does not have:

1. **How much data is in the real tables.** A screen that lists everything is fast with ten rows and
   slow with ten thousand. The test copy has ten.
2. **The distance to the real database.** On the CI runner the application and the database are the
   same machine. In real use the request leaves Moldova, reaches the hosting region, reaches the
   database, and comes back, several times per screen.
3. **A server that was asleep.** The first request to an idle serverless function pays for starting
   it. CI measures a server that has just served 510 tests and is thoroughly awake.

Those three are candidates for the cause cards, and **this card does not turn them into cards**, by
its own instruction and by CLAUDE.md section 3. They are written here and in the card's notes so the
later AUTHOR pull request has somewhere to start.

**What the cause cards actually need next is the production number**, which D1 already says is
produced by Max or by Ivan on their own machine. The script in this pull request is exactly what they
run to get it: set three environment variables, run one command. Until that number exists, the
numbers above are a **floor** (proof that the code path itself is not the problem) and not a baseline
of the complaint.

---

## 2. Deviations

### D-1. The baseline is a CI seeded-stack number, not a Vercel preview number

**What the card asks.** Acceptance (e) wants the six numbers in the card's notes before it ships,
with "the preview deployment sha, the fixture seed and the run date". D1 says the terminal runs the
script "against a Vercel preview seeded with fixtures of production-like size".

**Why that is not what happened.** No terminal on this machine holds a Vercel preview address or an
account password for one, and none may be fetched: repo CLAUDE.md section 7, and the operator
factory's own standing rule that there are no credentials here. This was also confirmed by the pull
request itself: the `Vercel` check on #384 reports **"Canceled by Ignored Build Step"**, so this
branch has no preview deployment to measure even if an account for it existed.

**What was done instead.** The measurement ran the way the whole end to end suite already runs: in
CI, against the production build the suite had just compiled (`.next-main`), started again on a
localhost port, on the local Supabase stack seeded by the same seed scripts every other spec uses,
signing in as the seeded development owner read out of the runner's `.env.local`.

**And it is labelled as what it is.** The card's notes carry a `FELUL RULARII:` line saying
explicitly that this is a CI seeded-stack run and not a preview or production run, and a `RULARE:`
line carrying the CI run id in place of a preview deployment sha. The card's notes also carry the
caveat in section 1 above, so nobody later reads 175 ms as "the dashboard is fine" when what it means
is "the dashboard is fine under these conditions, which are not the owner's conditions".

This was the deviation the task file told me to settle honestly, with a mailbox question as the
alternative. I did not write the question, because the task file's own recommended route was
available and honest: run it the way the suite runs, label it for what it is, and leave the
production number where D1 already leaves it. A number that misdescribes itself was the thing to
avoid, and a `FELUL RULARII` line plus the caveat avoids it.

### D-2. Acceptance (e) is enforced by a new check, and the first run of this branch was deliberately red

**The problem.** On this board a card is written `shipped` **before** its quality run concludes,
because `check-board-edit` refuses a pull request carrying a card's code while that card is short of
a terminal status, and a spec file counts as code. Meanwhile the owner's auto-merger lands a branch
on its **first** green. Put those together and this card had exactly one likely way to go wrong:
ship green with the six numbers still missing and merge in seconds, leaving the epic with a card that
says "measured" and a notes field that measured nothing. The card's own acceptance says "A card set
shipped with an empty baseline has not met (e)", and until this pull request that sentence was a
promise rather than a check.

The factory's normal answer to a multi-run proof is a draft pull request, but the task file forbids a
draft in as many words, and for a good reason: P3-102 sat stranded overnight because the auto-merger
cannot merge a draft.

**The answer.** `scripts/poc-free/check-perf-baseline.mjs`, wired into `quality` as the step
`Refuse P3-117 shipped with an empty baseline`, placed **after** the step that produces the baseline.
It reads the board and nothing else, so it has no `if:` guard and runs even on a documentation-only
diff, which is exactly the diff that could quietly blank the notes later. Six checks: the card is
`shipped`; exactly six report lines, one per section, in report order; every `p75` and every count at
least one, because a zero is a line somebody typed and not a measured transition; no `Rapoarte` line;
`FELUL RULARII`, `RULARE`, `SAMANTA` and `DATA` all present with content; and the date is a real
`YYYY-MM-DD`.

**So the first run of this branch was red on purpose, and only at that step.** Run
[36754804705](https://github.com/happygamer1919-tech/rc-inventory/actions/runs/36754804705) on head
`898c6a6`, 41m14s: every step succeeded except the guard, with the two applier proofs correctly
skipped because this pull request carries no migration. The baseline step printed the six numbers, the
guard then refused the empty notes, the numbers were committed, and the second run is the green one.
That is not a check weakened to pass: it is a check doing its job on the one commit where it had
something to refuse.

### D-3. The dashboard is measured from Inventar, not from itself

The card says "for each section navigates to it from the dashboard N times". Five of the six
sections are reached from the dashboard exactly as written. The dashboard itself cannot be, because a
click on the section you are already in is not a transition. Its measured leg is Inventar to
dashboard, which is the same kind of client route change through the same menu. Written down in
`tests/perf/support/report.ts` beside the section list.

### D-4. The printed section names carry no diacritics, and that is the card's own regex

The task file told me to check rather than guess. Acceptance (a) fixes the line shape as
`^(Tablou de bord|Inventar|Iesiri materiale|CRM|Facturi|Setari) p75=\d+ms n=\d+$`: no diacritics on
"Iesiri materiale" or "Setari". So the **report** prints the ASCII names and the **menu labels the
script clicks** keep their proper diacritics ("Ieșiri materiale", "Setări"), because those are
interface text and the repo rule is about the interface. Both are held in one place, as separate
fields on each section, with the reason written there. The repo's own neighbour,
`tests/e2e/support/accounts.ts`, writes its terminal messages the same way.

### D-5. A second Playwright config, not a project inside the existing one

The end to end suite starts three Next servers and a local stack through `webServer` and a
`globalSetup`, and that is exactly what the measurement must not do: it visits an application that is
already deployed, at whatever address `RC_PERF_BASE_URL` names. A project added to
`playwright.config.ts` would inherit those, changing how the existing suite runs.
`playwright.perf.config.ts` is separate, so `npx playwright test` still reads only
`playwright.config.ts`, whose `testDir` is `./tests/e2e`, and never sees `tests/perf`.

**Proof the suite is unchanged:** `npx playwright test --list` collects **510 tests in 74 files**,
the same set as main, and the `End to end` step of run 36754804705 succeeded.

### D-6. The CI step reads the seeded account out of `.env.local` instead of repeating it

The draft of this step that was in the worktree when I picked the card carried
`RC_PERF_EMAIL` and `RC_PERF_PASSWORD` as literals in `quality.yml`, duplicating the two values the
`Seed the three test accounts` step already carries. They are a CI-only seeded development account
and not a real secret, but two copies is two places to change, and the day they drifted apart this
step would sign in as an account the stack does not have. The step now reads them out of the
`.env.local` that the seed step writes, which is gitignored and exists only on the runner, through
command substitution that prints nothing.

---

## 3. What was already in the worktree, and what was wrong with it

The worktree `g72-perf-baseline` already held an uncommitted draft of this work from an earlier
attempt: the spec, the support module, the perf config, the npm script, the gitignore lines, the
quality step and the check script. It was good work and most of it is in this pull request as it was.
**It did not compile.** `npx tsc --noEmit` failed with four `TS2741` errors: the environment-reading
functions were typed `NodeJS.ProcessEnv`, and that type requires `NODE_ENV`, so the hand-written
environment objects in the two named cases (three variables, one of them deleted) do not satisfy it.
That is why the earlier attempt stopped where it did, and the check script was never wired into
`package.json` or `quality.yml` either.

Fixed by giving the module its own `MediuPerf = Record<string, string | undefined>`, which
`process.env` still satisfies and a hand-built object does too, with the reason written beside the
type.

---

## 4. Acceptance, line by line

- **(a)** Green. The `Baseline p75 of the section transitions` step in run 36754804705 ran
  `npm run perf:sections` and then **checked rather than assumed**: it grepped the log for lines of
  the fixed form, required the count to be exactly `6`, and required no `Rapoarte` line anywhere. The
  spec asserts the same three things itself, plus that every section carries exactly N measurements,
  so a lost navigation cannot produce a percentile computed over fewer values than its own line
  claims.
- **(b)** Green. `perf: lipsa unei variabile de mediu opreste rularea cu un mesaj care numeste
  variabila`. Each of the three variables removed in turn; asserts a non-zero code, asserts the
  message names the missing variable, and asserts the message carries **none of the other two values**
  even though those are set. Also asserts that a variable set to whitespace counts as absent, so it
  fails at the guard with a useful message instead of in the browser. No `page` fixture, so
  Playwright starts no browser, and no database.
- **(c)** Green. `perf: raportul nu tipareste niciodata adresa de baza, emailul sau parola`. Three
  sentinel strings nothing in the code could produce by accident; the case first proves the report
  really was handed them (so it has something to leak) and then asserts none of the three appears in
  the output. Same case also pins the report shape (six lines, in order, each matching the card's
  regex, no `Rapoarte`) and the `p75` arithmetic against a hand-checked fixture.
- **(d)** Green. `npm run check:no-prod-target` exits 0, locally and in CI.
- **(e)** Met by this pull request's second commit-and-run: the six numbers, `FELUL RULARII`,
  `RULARE`, `SAMANTA` and `DATA` in the card's notes, and `npm run check:perf-baseline` enforcing all
  of it.

**No threshold is asserted.** The under-2000 ms line is the epic's and lands with the last cause
card. A baseline card that failed its own run because the application is slow, which is the finding,
could never record the number that is its whole deliverable.

---

## 5. No credential, no production, no real client data

- No production address in the spec, the config, the check or the workflow. The base address in CI is
  a localhost port.
- The measurement **refuses a production host itself**, by name, in `tests/perf/support/report.ts`,
  with the same reasoning `scripts/production-refs.mjs` writes down: a public hostname is not a
  secret, and a list read from the environment would be disabled by the empty environment of any new
  terminal. `scripts/assert-not-prod.mjs` does not cover this case, because it reads the Supabase
  project ref out of the process environment and that says nothing about which database an
  already-deployed application the browser merely visits is talking to.
- Three variables, none defaulted, none printed. A missing one stops the run with a Romanian message
  naming the **variable name** and no value.
- No password is committed. No live site was opened and no production row was read. Environment
  variable **names** only.
- No real client record was seen. Nothing in this work touches production.

## 6. Off limits, respected

Nothing under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*` or
`docs/contracts/extraction*` was read or changed, so there is nothing to tell Andre. Nothing was
renamed or swept on the word `lead`. `git fetch origin` then `git merge origin/main` before every
push, never a rebase and never a force push; `gh pr list --state open` reported zero open pull
requests when this branch was cut.

## 7. Local gates, each command run alone

`npx tsc --noEmit` 0; `npm run build` 0; the board validator on all three boards before every commit,
0; `check:card-ids` 0; `check:board-edit` 0 (P3-117 `todo` to `shipped`, flipped, six code files
carrying the rule); `check:unique-ids` 0; `check:open-branch-ids` 0;
`check:no-destructive-migration` 0 (zero files); `check:conflict-residue` 0, run **after** `git add`;
`check:categories` 0; `check:ledger-rows` 0; `check:no-prod-target` 0; `check:pending-schema-reads` 0;
`check:removal-safety` 0; `check:assertion-register` 0; `check:board-clock` 0; `check:board-app` 0;
`npx playwright test --list` 510 tests in 74 files; and the two browser-free perf cases, 2 passed.

**This machine has no Docker and no Supabase CLI**, so the end to end suite and the baseline step run
only in CI, and nothing here claims otherwise.

## 8. Left for the owner

**One thing, and it is the thing that makes the cause cards possible: the production number.** D1
already assigns it to Max or to Ivan on their own machine. It is three environment variables and one
command:

```
RC_PERF_BASE_URL=<the address> RC_PERF_EMAIL=<the account> RC_PERF_PASSWORD=<its password> npm run perf:sections
```

`RC_PERF_RUNS` changes the ten moves per screen to any whole number. The script refuses to start
against the production application by name, so producing a production number means pointing it at a
preview or a staging copy, which is what the request itself requires two lines above where it asks
for the measurement.
