# EXECUTOR, 2026-09-06: cancelling APPLY-02, the AUT-9 contradiction quoted, P3-39 carded, and CI-01 pinned

**Role:** EXECUTOR. **Dispatch:** an owner ruling cancelling APPLY-02, both sides of
the AUT-9 contradiction quoted without resolving it, the drafts-cap exposure
carded without building it, then the board in order from CI-01, authoring no new
scope beyond step 3.

**Ratifications quoted back, as the dispatch required:**

- P3-38's embed over batching, accepted, and the `max_rows` measurement that
  decided it is the reason
- three `.in()` sites reported and not fixed on the grounds that each is bounded
  by one document's line count, accepted
- no allow-list on the board-edit check, accepted a second time
- BOARD-03's selector defect choosing my work order, accepted, and the rule
  surviving because it described the code is the point

**Rulings in force:** R-059, R-082, R-085, R-086, R-098, R-122, R-123, R-124,
R-127. All nine verified present in `decisions/inbox.md` before anything was built
on them.

---

## Boot

The clone was **10 commits behind** `origin/main` and was refreshed before
anything was read.

| Board | Cards | todo | in_flight | blocked | halted | shipped | Gate |
|---|---|---|---|---|---|---|---|
| phase 1 | 13 | 0 | 0 | 0 | 0 | 13 | 9/9, closed |
| phase 2 | 80 | 17 | 1 | 4 | 0 | 58 | 6/9 |
| phase 3 | 71 | 32 | 0 | 1 | 0 | 38 | 0/9 |

Next eligible: `CI-01`, and **the harness selector agreed** - the first time
BOARD-03's tuple comparator has answered on `main`.

---

## Step 1. R-142: APPLY-02 cancelled, with the verification on the card

**Pull request #224**, merged. Record only, nothing written to production.

### The id was allocated against every open branch, not against the counter

`decisions/NEXT-RULING-ID` on `main` said `R-128`, and **it was stale**. Two open
TRIAGE pull requests claim `R-128` to `R-141` between them:

| branch | rulings it adds | its own counter |
|---|---|---|
| `triage/20260904-220003` (#207) | R-128 to R-134 | R-135 |
| `triage/20260905-010004` (#210) | R-135 to R-141 | R-142 |

So the ruling took **R-142**, the next id free across `main` and all open
branches, and advanced the counter to `R-143` in the same commit per CLAUDE.md 8b.
`npm run check:open-branch-ids` exits 0. **The counter is not the authority; the
branches are**, and this is the second time that has mattered.

### The verification, re-run today rather than quoted from yesterday

The dispatch asked for the output on the card, not the claim. It is there in full:

    AT                        2026-09-06T12:34:42.778Z
    project ref               bwhzatwwjqmyfesfnisa
    applied_ledger_version()  HTTP 200  "0034"
    GET /api/health           HTTP 200  {"commit":"af9f592dea7a89f1ac2cf1a41a89663d0debc5f6",
                                         "ledger_version":"0034",
                                         "at":"2026-09-06T12:34:44.953Z"}
    pending register entries  0 (empty)
    highest migration file    0034_error_code_reconciliation_failed.sql
    applier, RC_APPLY_TARGET=production
                              "zero pending migrations ... Nothing was executed
                               and nothing was written."  exit 0

**Three readers agree and one is not a repository file.** The function answers
`0034`, the deployed application answers `0034` independently, and the commit it
names is `main`'s tip, so the deployment is current as well as the schema.

### Cancelled without inventing a status, and there was precedent

There is no `cancelled` in `CARD_STATUSES`, and the two available words both lie:
`halted` is reserved by CLAUDE.md 10 for the failure ceiling and this is not a
failure; `blocked` says somebody owes an answer and after the ruling nobody does.

**P2-19 already solved this.** It was `RETIRED, NOT COMPLETED, BY RULING R-054`,
carrying `status: shipped` with a journal evidence that says so in its **first
line**. APPLY-02 follows it exactly. Adding a sixth status would have changed the
validator, the portal, the digest and the card selector to record one card.

**The card's false sentence is left standing**, under R-127, with the correction
beside it: its notes still say *"Merging a migration file changes one text file
and changes no database"*, and still carry *"the applied ledger stands at 27 rows
with 0027 highest"*, which was already wrong the day it was written.

**Two things the ruling deliberately does not close**, named so cancelling the
card does not close them by accident: nothing notices when the integration applies
a migration, and the nine phase 3 gate conditions still cite APPLY-02 as their
deciding cause, which is a gate audit and belongs to TRIAGE.

---

## Step 2. AUT-9: both sides quoted, nothing resolved

**Pull request #225**, merged. `scripts/poc/run.sh` is untouched -
`git diff origin/main -- scripts/poc/run.sh` was empty - and no assertion was
weakened. The card stays `blocked_on: ivan`.

Both quotes are now **on the card**, verbatim and complete: acceptance case 4, the
defaults clause that says the same thing, the card's own title, and the three
paragraphs of CLAUDE.md 13 that govern the lock. The argument is in
`docs/reports/2026-09-06-executor-aut-9-case-4-against-claude-md-13.md`.

### The disagreement turned out to be two disagreements

Re-reading the code for the report found a second one I had not reported on
2026-09-05.

**Order and outcome.** CLAUDE.md 13 and the code test **age** first and reclaim a
stale lock after stopping its holder; the card tests `kill -0` first and honours a
live pid **whatever its age**.

**The margin.** The card's defaults say *"MARGIN IS TWICE THE CAP"*. Section 13
says *"a fifteen minute margin"* and `POC_LOCK_STALE_MARGIN_SECONDS=900` is fifteen
minutes, so **the code and section 13 agree and the card disagrees with both**:

| reading | a lock goes stale at |
|---|---|
| the code and section 13 | `7200s`, 2 hours |
| the card's defaults | `18900s`, 5 hours 15 minutes |

On the night the card was written about, the lock was held for **nine hours**, so
**the card's own margin would not have caught that incident either**.

### Which I believe is correct

**Section 13**, and the reasons are on the card and in the report: the card's own
title agrees with section 13 and contradicts its own defaults, and CLAUDE.md 5
says a `defaults` field fills silence rather than contradicting speech; section 13
was amended *after* the incident while the card was authored *during* it; the
card's reading has no bound at all; and the defaults' own concern, that a takeover
must not kill a working run, is already met by the identity check rather than by
honouring a lock forever.

**What the card gets right and should survive whatever is decided:** its premise
that a takeover must not signal a recycled pid. Section 13 spends a paragraph on
exactly that.

---

## Step 3. P3-39 carded, not built

**Pull request #226**, merged. Board only.

The drafts query is capped by PostgREST's row limit and orders `fired_at`
descending, so past the cap it drops **the oldest** drafts, and nothing compares
what came back against what exists. You named it as the same defect class as the
414 and it is: a bound the code does not know it hit.

**What was measured, so the next reader knows which figures are facts:**
`max_rows = 1000` in `supabase/config.toml`, **local stack only**; the read carries
no `.limit()` and no count, verified on `main` at `af9f592`; the order drops the
oldest; and **production holds zero `extraction_drafts`**, read read-only with
`Prefer: count=exact` returning `*/0` while `categories` returned `0-0/19` on the
same call shape, so the zero is a real count and not a failed request.

**What was not measured, and it is the figure that matters most:** the hosted
project's own row limit. Measuring it needs more rows than the cap and production
has none, so it is on the acceptance rather than assumed on the card. That is
P3-38's rule about `208` applied to this threshold.

The acceptance puts **the silence first**: the read must compare what came back
against what exists, so a short answer becomes a visible failure rather than a
shorter list. The defaults forbid the two convenient wrong answers, raising
`max_rows` and re-opening the embedded lines, and record that P3-38 measured the
embed to be capped per parent rather than across the result.

Priority `medium`, with the reason on the card so it can be argued with:
production holds zero drafts and the threshold is five times the one P3-38 closed.
**Fifty `select` calls in `lib/data` carry no explicit limit**; this card is the
review screen only and says so rather than pretending to cover them.

---

## Step 4. CI-01: the workflow stops floating

**Pull request #227.** Card shipped.

`version: latest` failed run 33810964883 on 2026-09-03 with *"Failed to resolve
latest Supabase CLI release: rate limit exceeded"*, before a single test ran, and
re-running it passed with no code change.

**The rate limit is the lesser half.** `latest` also makes the workflow
non-reproducible: the same commit can pass today and fail tomorrow because a
release in between changed behaviour, and the failure presents as the pull
request's fault. P3-33 already paid for that class, having to split `0030` from
`0031` because `supabase db reset` wraps each migration file in one transaction. A
token would have fixed only the rate limit, which is why the defaults forbid it.

### The version was derived, not picked

The defaults say to take the version that is green today rather than the newest,
and the temptation is real: `2.117.0` exists and looks current.

`npm view supabase dist-tags` answers `latest = 2.116.0`, published 2026-08-26 and
unchanged since; this repository's `package-lock.json` carries **no `supabase`
package** for the action to prefer, confirmed by grep, so every green run since
that date resolved `latest` to exactly `2.116.0`. **Pinning it changes nothing
about what runs**, which is what makes it the right pin. `2.117.0` turned out to
be a prerelease, currently `2.117.0-beta.21`.

**The action sha was derived the same way**, read out of the green run of
2026-09-05 rather than from the tag as it stands today:

    Download action repository 'supabase/setup-cli@v1'
    (SHA:ab058987d8d6c725971f6cf9d0b5c98467e30bd1)

That is one line beyond the acceptance, which asked only for the version.
`supabase/setup-cli` is a **third-party** action: a major tag on somebody else's
repository can be moved, and this workflow runs the whole suite. Pinning the sha
also changes nothing about what runs.

### The comment names what the pin is protecting

The acceptance asks for at minimum the transaction-per-file behaviour. Four are
named, so whoever raises the version knows what to re-prove rather than finding
out from a red run: `db reset` wraps each migration **file** in one transaction
(why `0030` and `0031` are separate, and why the applier has an enum pre-phase);
`db reset` replays from empty in **file order**; `supabase status -o env` prints
`API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` under those names; and the services
started come from `supabase/config.toml`, whose `max_rows` is load-bearing for
P3-38 and for the newly authored P3-39.

### The check reads the workflow, so the next one is refused rather than discovered

`npm run check:action-pins` covers two shapes: a `uses:` on a tag rather than a
commit sha, and a `version:` input set to a moving target. It fails first against
`main`'s file and against three further mutants, so each refusal is watched
separately:

| what was fed to it | first failure |
|---|---|
| `main`'s `quality.yml` | `FAIL uses supabase/setup-cli@v1, which is a floating tag` and `FAIL sets version: latest, which is a moving target` |
| an unlisted third-party action added | `FAIL uses some-vendor/some-action@v3` |
| an allow-list entry left behind | `FAIL ALLOWED_FLOATING names actions/upload-artifact@v4, which the workflow no longer uses` |
| the version moved back to `latest` | `FAIL sets version: latest` |

**A stale allow-list entry is a failure, not a pass.** An exemption for something
the file no longer uses would sit there covering whatever took its place.

### A default decided and written down

The three `actions/*` majors stay floating, with the reason in the allow-list. The
line drawn is **between a publisher's promise and a version that must be
resolved**: `actions/checkout@v4` is a major tag GitHub maintains on its own
repository and is fetched by ref, so neither of this card's two defects applies to
it. Pinning them would trade a floating tag for an ageing sha that nothing in this
repository would ever update, which is a different failure with no signal.

**The green run of this pull request is the evidence that `2.116.0` is usable**,
which is the acceptance's third clause and the only thing that could prove it.

---

## What this session did

| step | outcome | pull request |
|---|---|---|
| R-142, APPLY-02 cancelled | ruling written, card cancelled | #224 |
| AUT-9, both sides quoted | **stays blocked on ivan**, nothing built | #225 |
| P3-39 authored | carded, not built | #226 |
| CI-01 | shipped | #227 |

**One new check now runs on every pull request, unfiltered:**
`CI-01-ACTION-PINS-PROOF`, refusing a floating action reference. That makes six
added in two days.

### Two things that need you

1. **AUT-9 is the only thing waiting on a decision from this session's work.** Both
   quotes are on the card, the argument and what breaks under each reading are in
   `docs/reports/2026-09-06-executor-aut-9-case-4-against-claude-md-13.md`, and the
   margin disagreement is new since yesterday. Nothing is blocked behind it: cases
   1 and 3 are live and proved, and the only missing piece is case 2's SIGSTOP.
2. **`scripts/poc/install.sh` still has not been re-run**, from yesterday's
   dispatch. AUT-21, AUT-22, AUT-8 and BOARD-03 all changed `scripts/poc/run.sh`,
   a deployed copy under `/Users/ivan/rc-poc-bin`, and R-120 records that merging
   does not deploy it. AUT-21's drift check is now live and will say so in the run
   log, which is the only reason this is a line in a report rather than a silence.

### Findings reported and not acted on, under CLAUDE.md 3

- **`decisions/NEXT-RULING-ID` on `main` is stale by fourteen ids** while #207 and
  #210 are open. The counter did its job, because the collision is a conflict on
  one line, but a terminal that trusted it without checking the branches would
  have written `R-128` twice. `check:open-branch-ids` is what catches it.
- **The nine phase 3 gate conditions still name APPLY-02** as the single deciding
  cause for reading 0 of 9. That premise died with R-142 and correcting it is a
  gate audit, which is TRIAGE's under `DOCTRINE-TRIAGE` section 4.
- **Nothing notices when the Supabase integration applies a migration**, which is
  the gap APPLY-02 was pointing at. Cancelling the card removed the pointer, not
  the gap, and R-142 says so.
- **Five older pull requests are open** from the scheduled runs: #206, #207, #209,
  #210 and #223. They belong to POC and TRIAGE and this dispatch did not touch
  them.
- **Fifty `select` calls in `lib/data` carry no explicit limit.** P3-39 covers the
  review screen and names the rest as out of its scope.

No scope was authored beyond step 3.
