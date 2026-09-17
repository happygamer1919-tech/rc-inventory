# EXECUTOR report, 2026-09-17, card P3-73: the documentation-only fast path in the `quality` workflow

**Role:** AUTHOR for the card, then EXECUTOR for the build, one session, one
branch `card/p3-73`, one pull request **#324**.

**Ivan's finding:** F12, in his approved form, goal G29 in the operator
factory's `GOALS.md`.

**Migration files added or changed: NONE.** Nothing under `supabase/migrations/`
is touched, so nothing reaches the production database when this merges.

---

## 1. In plain words, for the owner

A change that touches nothing but written documents no longer waits about twenty
minutes for the system to rebuild and retest an application that nobody edited.
The rebuild and the browser test suite now sit out a documents-only change, and
they still run in full on every change that touches the program itself. A board
update or a written report is confirmed in a couple of minutes instead of a
coffee break.

Nothing about how a code change is checked has changed. Everything that checks
the rules of this project, about forty-five separate checks, still runs on every
single change without exception.

---

## 2. Boot, and the status this session started from

- Role stated: AUTHOR, moving to EXECUTOR once the card was written.
- `docs/board/rc-board-phase2.json`: 68 shipped, 32 todo, 2 blocked.
- `docs/board/rc-board-phase3.json`: 88 shipped, 32 todo, 1 blocked, read
  because repo `CLAUDE.md` section 1 names only phase 2 and the next eligible
  cards sit on phase 3 (known defect, card RULE-05).
- Launch gates: the `launch_gate` object on each board carries no condition
  array the boot report can count, so the count is `0/0` on both. That is what
  the files say, not a claim that no gates exist.
- Open pull requests by this account at start: **none**. Verified with
  `gh pr list --state open --author @me` before anything was pushed.
- Id allocated: `npm run id:free -- P3-73` answered **FREE**, lane highest
  `P3-72`, zero open pull requests.
- Worktree cut from `origin/main` at `7b9b3fa`.

---

## 3. What the finding asked for, and what was built

F12 asked for a step-level filter, never a workflow `paths:` key, that lets a
documentation-only pull request skip the heavy steps while the job still runs
the validators and exits green.

### 3.1 The new step

`.github/workflows/quality.yml` gains ONE step, placed before `Typecheck`
because it has to gate `Build`, which is the second step in the job:

- **name:** `Decide whether the diff is documentation only`
- **id:** `docs_scope`

It resolves the base commit and diffs against it in **exactly the shape
`applier_scope` already uses**: same `BASE` expression, same
`git diff --name-only`, same fail-open branch when the base is unresolvable.

`docs_only=true` only when EVERY changed file matches one of:

- `^docs/`
- `^decisions/`
- `\.md$`, at any depth, which is what makes `CLAUDE.md` documentation
- the three board files `docs/board/rc-board.json`,
  `docs/board/rc-board-phase2.json`, `docs/board/rc-board-phase3.json`, which
  `^docs/` already covers and which are named anyway because they are the files
  this exemption most often exists for

### 3.2 It fails open in three places

Every one of them sets `docs_only=false`, meaning run everything:

1. **The base commit cannot be resolved.** Mirrors `applier_scope` exactly.
2. **The changed-file list is empty.** No counterpart in `applier_scope`. A
   filter that was handed nothing must not conclude that nothing changed.
3. **The classifier itself exits with an error** (`grep` status greater than 1).
   No counterpart in `applier_scope` either.

Two and three are additions rather than copies because this filter's false
positive skips ten more steps than `applier_scope`'s does.

### 3.3 The one place the shape deliberately departs from `applier_scope`

`applier_scope` writes `printf '%s\n' "${CHANGED}" | grep -qE '...'`. This step
does **not** use `grep -q`. It collects the offending files into a variable and
tests whether that variable is empty:

```
set +e
OUTSIDE="$(printf '%s\n' "${CHANGED}" | grep -vE '...')"
STATUS=$?
set -e
```

**The reason, and it is the single most load-bearing decision in this card.**
Under `set -o pipefail`, `grep -q` can close the pipe the moment it matches, the
writer takes SIGPIPE, and the pipeline reports **141**. In an
`if printf | grep -qv ...; then` construction, 141 is non-zero and therefore
**indistinguishable from "grep found nothing offending"**. In `applier_scope`
that mistake would run a proof that did not need to run, which costs minutes and
nothing else. Here it would classify a **code** diff as documentation and skip
the build and the whole suite. Reading the entire list has no early exit and
cannot produce that status. The `set +e` / `$?` / `set -e` idiom is the one the
step `Prove the production guard refuses` already uses in this same workflow.

### 3.4 The twelve gated steps

Every one carries `if: steps.docs_scope.outputs.docs_only != 'true'`:

| # | step | also gated by |
|---|---|---|
| 1 | `Build` | |
| 2 | `Apply every migration to a bare postgres, unmodified` | |
| 3 | `Prove the migration applier against the Docker shim` | `applier_scope` |
| 4 | `Prove every applier assertion can fail` | `applier_scope` |
| 5 | `Start local Supabase` | |
| 6 | `Launch database, auth and storage` | |
| 7 | `Apply migrations to the local stack` | |
| 8 | `Export local Supabase credentials` | |
| 9 | `Seed the three test accounts` | |
| 10 | `Install Playwright chromium` | |
| 11 | `End to end` | |
| 12 | `Upload Playwright report on failure` | `failure()` |

**Nothing else in the job carries an `if:` at all.** That was verified by
grepping every `if:` line in the file against the step it belongs to, and the
list came back as exactly these twelve.

### 3.5 Why combining with `applier_scope` is safe, stated rather than left implicit

`applier_scope` answers `run=true` only when the diff touches
`scripts/apply-pending-migrations.*`, `supabase/migrations/**`,
`scripts/poc-free/local-db/**` or
`scripts/poc-free/prove-assertions-can-fail.*`. **Not one of those paths can
appear in a diff `docs_scope` calls documentation**, so the two filters cannot
disagree: when `docs_only` is true, `run` is already false and both steps were
skipping anyway. The combination changes nothing today, by construction.

It is written on the step regardless, so that whoever widens either filter later
sees both gates on the step instead of inferring one from the other. The same
reasoning is written into the workflow in a comment next to the steps.

### 3.6 Why `Build` can be skipped without breaking anything downstream

Verified by reading, not assumed:

- `npm run build` appears **exactly once** in the whole workflow.
- **No step in the workflow references `.next`, `next start` or `NEXT_DIST_DIR`.**
- `playwright.config.ts`'s production-mode `webServer` entry runs its **own**
  `NEXT_DIST_DIR=.next-prod npm run build && ... next start`, and its own comment
  at lines 248 to 251 says in terms that it does not rely on the workflow's build
  step, because the dev server overwrites `.next` when it starts anyway.

So the early `Build` step is a standalone smoke test with nothing downstream
depending on its artefacts, and the only thing that could have needed it, the
End to end block, is skipped as a block alongside it.

---

## 4. The doctrine amendment, under section 9c

Two sentences in `CLAUDE.md` section 3.1 became false when this landed. Both are
**quoted, marked corrected, and kept**, per section 9c, with the true statement
above them.

**First**, in `#### THE CONDITION THIS RESTS ON`:

> *"`.github/workflows/quality.yml` triggers on `pull_request` with no path
> filter, so every pull request runs every step of the job: typecheck, build,
> all three board validators, ... and the end to end suite against a local
> Supabase stack."*

The `no path filter` half is still true and is still what the whole section
rests on. The `every step` half is not, and had already been partly false since
R-084 and PROVE-01 each filtered a step.

**Second**, in the PROVE-01 subsection:

> *"so there are two filtered steps and still one filter."*

There are now two filters and twelve filtered steps.

A new `######` subsection follows, naming `docs_scope`, tabling every step it
gates, explaining the fail-open behaviour and the `grep -q` hazard, giving the
skips-versus-reports table in the same shape the R-084 subsection uses, and
restating what self-merge requires in four numbered points. The last line says
that a third filter is again a change to that section rather than an application
of it, which is the sentence the two previous filters each left for the next one.

---

## 5. Acceptance, both halves, proven in real Action runs

F12's own line: *"a docs-only PR shows `quality` green in well under 10 minutes;
a code PR still runs every step"*.

### 5.1 The documentation half. Run **35273788191**

Proven on a **throwaway pull request, #323**, whose base was `card/p3-73` and
**never main**, so nothing about it was ever proposed for merge. Its diff was
ONE appended comment line in `docs/reports/2026-09-17-executor-g28-f5-meta-shown-on-review.md`
and nothing else. The pull request is closed and its branch is deleted, locally
and on the remote.

- **Conclusion: success.** Created `2026-09-17T20:56:25Z`, updated
  `2026-09-17T20:58:54Z`: **2 minutes 29 seconds**, against the finding's "well
  under 10 minutes".
- The classifier printed the one changed file and then
  `every changed file is documentation, so Build, the migration apply, the
  applier proofs and End to end are skipped`.
- **Exactly twelve steps concluded `skipped`**, read back from the jobs API, and
  they are exactly the twelve in the table above. Nothing else was skipped.
- **54 steps concluded `success`**, including `Typecheck`, `Validate boards`,
  `Refuse a commit whose card id resolves to no card`, `Refuse a duplicate
  ruling id or card id`, `Refuse a migration that removes rows` and `Refuse an
  assertion with no failing case`.

### 5.2 The code half. This pull request, #324

**This pull request is correctly classified NOT documentation, and it is worth
being explicit about why, because it is the one case where the answer is not
obvious.** Its diff is:

| file | classified |
|---|---|
| `CLAUDE.md` | documentation, by the `\.md$` rule |
| `docs/board/rc-board-phase3.json` | documentation, by `^docs/` |
| `docs/reports/2026-09-17-executor-g29-f12-docs-only-fast-path.md` | documentation |
| `.github/workflows/quality.yml` | **NOT documentation** |

The filter is an "every file must match" test, so **one** non-matching file
makes the whole diff code. `.github/workflows/quality.yml` matches nothing, so
`docs_only` must be `false` and every step must run.

The run on this pull request's head sha is recorded in the card's evidence.

### 5.3 The rest

- No `paths:` key exists anywhere in the workflow. The only occurrences of the
  word are in comments explaining why one must never be added.
- The check name is unchanged: the workflow's `name:` is `quality` and the job's
  `name:` is `quality`.
- `npx tsc --noEmit` exit 0 and `npm run build` exit 0 locally.

---

## 6. Every local gate, run from the worktree

| command | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| board validator, all three boards | exit 0 before EVERY commit |
| `npm run check:card-ids` | exit 0, 236 ids resolved |
| `npm run check:unique-ids` | exit 0, 237 card ids and 206 ruling ids unique |
| `npm run check:open-branch-ids` | exit 0 |
| `npm run check:no-destructive-migration` | exit 0, **0 files, 0 statements** |
| `npm run check:conflict-residue` | exit 0, 3 checks |
| `npm run check:categories` | exit 0, 8 checks |
| `npm run check:ledger-rows` | exit 0, 6 checks |
| `npm run check:no-prod-target` | exit 0, 5 checks |
| `npm run check:pending-schema-reads` | exit 0 |
| `npm run check:removal-safety` | exit 0 |
| `npm run check:assertion-register` | exit 0, 18 assertions |
| `npm run check:board-clock` | exit 0 |
| `npm run check:board-edit` | refuses while the card is `in_flight`, passes once it is `shipped` in this same pull request |

Not runnable on this machine, and said so rather than skipped silently: the
Playwright suite, `npm run check:migrations`, `npm run prove:applier` and
`npm run prove:assertions`. This machine has no Docker and no Supabase CLI. All
four run in CI.

---

## 7. Am I confident the filter is correct? Mostly yes, and here is exactly where the doubt sits

The task asked for a plain answer rather than a green run standing in for one.

### What I am confident about, and why it is not just the green run

I walked the truth table by hand before the run existed, and the run then agreed
with it:

| state | `docs_only` | `applier_scope.run` | behaviour vs today |
|---|---|---|---|
| base unresolvable | `false` (fail open) | `true` (fail open) | identical: everything runs |
| code diff, no applier path | `false` | `false` | identical: applier proofs skip, all else runs |
| code diff touching a migration | `false` | `true` | identical: everything runs |
| documentation-only diff | `true` | `false` necessarily | twelve steps skip, every validator runs |

The fourth row is the only new behaviour, and the applier proofs in it were
already skipping before this card, so the combined condition on those two steps
is provably a no-op today.

I also checked the classifier's regex by hand against a list of sample paths
including `app/.md/route.ts`, which is correctly NOT documentation because the
pattern is anchored `\.md$`, and `supabase/migrations/0041_x.sql`, which is
correctly NOT documentation.

### What still deserves a second pair of eyes

1. **`docs/board/validate-board.mjs` is classified as documentation**, because
   it lives under `docs/` and the finding's own path list is `docs/**`. It is
   executable JavaScript. I did not carve it out, and I think that is right: the
   step that exercises it, `Validate boards`, is NOT gated and runs on every
   pull request, so a change to it is still proven by the same run, and neither
   `Build` nor the Playwright suite could say anything about it. But it is a
   real edge in the finding's own wording and someone should know it is there
   rather than discover it. The same is true of anything else executable that
   ever lands under `docs/`.
2. **A `.md` file at any depth counts as documentation**, `CLAUDE.md` included.
   That is what the finding says and it is what makes this card's own pull
   request an interesting worked example rather than a trivial one. If a `.md`
   file ever becomes an input to the build, this rule would be wrong. Nothing in
   the repository does that today.
3. **The `push: branches: [main]` trigger also gets the filter**, using
   `github.event.before`. A documentation-only merge to main will therefore skip
   the build on the post-merge run too. I believe that is correct and consistent,
   but it is a behaviour change on a trigger the finding did not discuss, and it
   is recorded here rather than left to be noticed.

None of these three is a correctness defect in the filter. They are places where
the finding's path list and the repository's actual contents are not a perfect
match, and I would rather name them than let a green run imply nobody looked.

---

## 8. What was NOT changed

- No `paths:` key. Ever.
- The check name `quality`, in both places.
- Branch protection settings. Out of scope for this card.
- The logic of any of the roughly fifty validator and proof steps.
- `app/api/extraction/callback/route.ts`, byte-identical to main, ruling R-202
  held. Nothing under `app/api/extraction/**`, `app/api/documents/**`,
  `lib/data/extraction*` or `docs/contracts/extraction*`.
- The `lead=` `PageHeader` prop. Nothing in this card goes near it.
- `supabase/migrations/**`. No migration.

---

## 9. Learnings

**`docs/LEARNINGS.md` is left untouched, and that is deliberate.** Nothing broke
while working this card. The typecheck, the build and all fourteen close-out
checks passed on their first run, the board validator's two refusals
(`home_lane` and the derived `lane`) were the validator doing its documented job
on a newly authored card rather than defects, and the throwaway proof run passed
on its first attempt. Section 9 says a card that hit no defects appends nothing
and says so. This is that sentence.

The `grep -q` SIGPIPE hazard in section 3.3 is not a learning either: it was
reasoned about before any code was written and never became an error anybody
saw. It is recorded in the workflow comment, in the card's `defaults` and in
section 3.3 above, which is where a reader of that step will actually look.
