# EXECUTOR report, run 20260827-160337

**Role:** EXECUTOR (unattended scheduled run)
**Run id:** 20260827-160337
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, detached at `origin/main` = `3420435`
**Wall clock:** started 16:03 EDT, report written 16:35 EDT, inside the 45 minute cap.

---

## 1. Boot status report

Board `docs/board/rc-board-phase2.json`, `as_of` 2026-08-27T18:05:00Z, 31 cards.

| status | count |
|---|---|
| shipped | 25 |
| blocked | 3 |
| todo | 2 |
| in_flight | 1 |
| halted | 0 |

Launch gate: **6/9 passed**. Failing: G4 (AI extraction live round trip), G7
(reminders email, `blocked_on: ivan`), G9 (Mihai acceptance).

**Next eligible card: `no eligible card`.**

Card by card, so nobody has to re-derive it:

- `P2-13` is `todo` with `blocked_on: null`, but `depends_on` is P2-15 and
  P2-08b, and both are `blocked`. Not eligible.
- `P2-14` is `todo` with `blocked_on: client`, and its dependency P2-13 is not
  shipped. Not eligible twice over.
- `P2-15` blocked on ivan, `P2-08b` blocked on andre, `P2-19` blocked on ivan.
- `AUT-3` is `in_flight` by ruling R-036. Its acceptance is this chain firing
  unassisted, so it is deliberately out of the eligible queue and an unattended
  run must not pick it up.

`claims` in `docs/poc/state.json` was `{}` at boot. **No card was skipped for a
lease this run.** The two escalations sitting in that file both name claims that
have since been released.

Cards outside this board that appear in recent history (AUT-5, AUT-6, AUT-7) are
the POC-BUILDER terminal's work and carry no card on the phase 2 board. PR #76
(AUT-7) is open on `card/aut-7` and was not touched.

---

## 2. What this run did

**No card was worked, because no card was eligible.** Per CLAUDE.md section 13,
a dry board means CRITIC rather than idle work or invented work, so this run
re-ran the shipped cards' named acceptance lines against `origin/main` at
`3420435` and reports what held and what could not be checked here.

**Cards touched: none. Board not edited. No migration authored or applied. No
application code written.** The only file this run adds is this report.

---

## 3. Acceptance re-run: what passed

Every line below was executed in this worktree at `3420435`. Exit codes are
observed, not assumed.

| card | acceptance re-run | result |
|---|---|---|
| (all) | `node docs/board/validate-board.mjs docs/board/rc-board-phase2.json` | **exit 0**, `PASS (0 violations)` |
| P2-01 | `test -f supabase/migrations/0001_phase2_schema.sql` | **exit 0** |
| P2-01 | `npx tsc --noEmit` | **exit 0** |
| P2-06 | `grep -rn "@/lib/mock" app components lib` | **exit 1**, no match, mock module is gone |
| P2-06, P2-11, P2-16 | `npm run build` | **exit 0** |
| P2-11 | `test -f docs/migrations/APPLY-LOG.md` | **exit 0** |
| P2-12 | `curl -sS -L https://rapidconstructmd.com/` | **200**, 2 redirects, `ssl_verify_result 0` |
| P2-12 | apex without follow | **308** to `https://www.rapidconstructmd.com/`, `ssl_verify_result 0` |
| P2-12 | `https://www.rapidconstructmd.com/` | **307** to the login route, `ssl_verify_result 0` |
| P2-16 | `npm run build && npx tsc --noEmit && git status --porcelain` | **exit 0 and printed nothing.** The tree is clean after a build |
| P2-17 | `node scripts/poc-free/check-categories.mjs` | **exit 0**, 8 checks passed, 18 categories, no `TEST-Categorie` |
| P2-15 | `node scripts/poc-free/parse-reset-sql.mjs` | **exit 0**, 8 checks passed, 11 statements parsed |
| P2-19 | `node scripts/poc-free/build-ledger-rows.mjs --check` | **exit 0**, 8 statements, 3 inserts, one BEGIN and no COMMIT |
| AUT-1 | `test -d docs/reports` | **exit 0** |
| AUT-1 | `grep -c 'docs/reports/' CLAUDE.md` | **3**, at least 1 required |
| AUT-2 | `test -f docs/DOCTRINE-TRIAGE.md` | **exit 0** |
| AUT-2 | all six required sections by heading | **present**: ratify or overturn with the test used, convert findings into rulings, detect stale `depends_on` and resequence, audit launch gates, author follow-on cards, the escalation test |
| AUT-4 | `node scripts/poc/notify.mjs --dry-run true` | **exit 0**, digest rendered, nothing sent |
| CRIT-11 | `node scripts/assert-not-prod.mjs` with a production ref present | **exit 2** with the Romanian refusal naming the guard |
| CRIT-12 | `grep -rn 'Previzualizare faza 1\|Date demonstrative' components app` | **exit 1**, no match |
| CRIT-15 | `node scripts/poc-free/check-no-prod-target.mjs` | **exit 0**, 5 checks passed, guard still wired into `playwright.config.ts` |

Nothing in the offline set regressed.

---

## 4. Acceptance NOT re-run, and why

**The nine Playwright specs were not run:** `auth.spec.ts`, `products.spec.ts`,
`inbound.spec.ts`, `outbound.spec.ts`, `dashboard.spec.ts`, `extraction.spec.ts`,
`review.spec.ts`, `reminders.spec.ts`, `headers.spec.ts`. Those carry the named
acceptance for P2-02, P2-03, P2-04, P2-05, P2-06, P2-08a, P2-09, P2-10, P2-11,
P2-18, CRIT-10, CRIT-12, CRIT-13, CRIT-14 and CRIT-16.

Two independent reasons, and both are worth reading:

1. **The suite refuses to start in this environment, correctly.** The scheduled
   run's process environment carries `NEXT_PUBLIC_SUPABASE_URL` pointing at the
   production project, so `scripts/assert-not-prod.mjs` exits 2 and
   `globalSetup` throws. That is CRIT-11's guard doing exactly its job. See
   finding 2 for the consequence.
2. **It would not have finished inside the cap.** Nine specs with a dev server
   start, begun at minute 30 of a 45 minute run, is work this run could not
   finish and merge, and a half-run suite reported as evidence is worse than an
   honest gap.

A local Supabase stack IS answering on `127.0.0.1:54321` (HTTP 200), so a
future run pointed at it could execute the suite. This run did not repoint the
environment, because doing so would have disarmed the one guard that stops a
test suite writing into the client's database, and doing that unattended at
minute 30 is not a trade worth making.

**These acceptance lines are therefore unverified by this run. They are not
reported as passing.** They last passed in CI on their own cards' PRs.

---

## 5. Findings

### FINDING 1 (high): the scheduled run hands the EXECUTOR model process the entire secrets file

`scripts/poc/run.sh` lines 85 to 88 source `/Users/ivan/rc-secrets/phase2.env`
with `set -o allexport`, and `claude -p` at line 380 inherits that environment
with no stripping. Verified by name only, no value read or printed: this run's
process holds `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`RESEND_API_KEY`, `VERCEL_TOKEN`, `MAKE_WEBHOOK_URL`, `MAKE_CALLBACK_SECRET`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_ID`.

**Why this is a finding and not just an observation.** CLAUDE.md 8.3 grants one
permitted read, and 8.2 scopes the whole grant to applying migrations while the
database holds zero real client data. The harness performs that read
unconditionally, four times a day, for 45 minutes at a time, on runs like this
one that apply no migration and need none of it. 8.7 then requires P2-13 to
confirm "no terminal-held copies remain", and today every scheduled run is a
terminal holding copies.

**The fix already exists in this repository.** AUT-6's responder invokes the
model with `env -u` so the secrets are absent rather than merely forbidden, on
the stated principle that a prompt saying do not read is a request while an
absent variable is a property. The executor step does not do this. The harness
needs the values for its own Telegram and merge steps, which run in bash, not
inside the model process, so stripping them from the child is available without
losing anything.

**Recommended default:** strip the credential set from the `claude -p` child
with `env -u`, keeping only what the executor genuinely needs, and re-export the
full set only for a step that is applying a migration. `TELEGRAM_BOT_TOKEN` and
`VERCEL_TOKEN` in particular have no executor use at all.

**This is a POC-BUILDER file.** AUT-3's `defaults` says the harness files belong
to that terminal and coordination is through committed files only, so this run
did not edit `run.sh`. It is written down here instead, which is the coordination
channel.

### FINDING 2 (medium): no scheduled run can ever re-run a named e2e acceptance

Direct consequence of finding 1. Because the production `NEXT_PUBLIC_SUPABASE_URL`
is in the environment of every scheduled run, CRIT-11's guard refuses the
Playwright suite in every scheduled run, permanently. The guard is right and must
not be weakened. What is wrong is that the harness puts the value there in the
first place.

**Why it matters beyond this run:** section 6 says no acceptance, no ship. Any
future card whose acceptance is a named spec cannot be shipped by an unattended
run under the current harness, because the run cannot execute its own acceptance.
That is a structural ceiling on autonomy, and it is invisible until a card needs
it.

**Recommended default:** fix finding 1, and point the executor's environment at
the local stack on `127.0.0.1:54321` for test purposes only, so the guard passes
honestly rather than being bypassed.

### FINDING 3 (low): AUT-4's four-section triage block is not in the digest Ivan receives

`node scripts/poc/notify.mjs --dry-run true` rendered the AUT-5 plain digest:
five sections, 143 words, no card ids, no PR numbers. AUT-4's acceptance is
written against the four named triage sections, which now live in the full
digest that AUT-5 deliberately stops sending to him.

This looks intentional rather than broken. AUT-5's own commit message is "the
digest Ivan can act on, and a full one he never sees". Recording it so the next
audit of AUT-4's acceptance does not read the plain digest and conclude the card
regressed. **No action recommended beyond noting it on AUT-4.**

The dry run also reported `5 card(s) have no plain field, titles used and gap
flagged` and one jargon fallback on the word "migration". AUT-7, open as PR #76,
is the card that adds the `plain` field, so this closes itself when #76 lands.

### FINDING 4 (low): the harness state branch is cut from a possibly stale `origin/main`

`run.sh` line 664 does `git checkout -b "$STATE_BRANCH" origin/main` without a
fetch immediately before it. `origin/main` in the run worktree is whatever the
fetch at run start left. Any PR the executor merged during the run is therefore
absent from the state branch's base, and a state PR that edits
`docs/poc/state.json` on a stale base can conflict with, or silently omit, an
escalation the executor appended to that same file earlier in the run.

**This is why this run did not append its findings to `docs/poc/state.json`.**
The escalation clause in section 13 is scoped to a card question the card's
`defaults` do not answer, and this run has no card to block: there was no
eligible card. Writing CRITIC findings into `state.json` would have risked
breaking the harness's own state PR for no rule that required it. The findings
are in this committed report instead, which is the section 9b artefact TRIAGE
reads.

**Recommended default:** `git fetch origin --prune` immediately before the state
branch is cut. One line, removes the whole class.

**Open question for TRIAGE:** should CRITIC findings from a dry-board run reach
`state.json` so the digest carries them, or is the committed report enough? This
run took the second reading. If the first is wanted, finding 4 must be fixed
first.

---

## 6. PRs

- **Opened this run:** the PR carrying this report. Number recorded in the
  commit trailer and in the run log.
- **Merged this run:** that same PR, on a green `quality` check verified for its
  head sha.
- **Not touched:** PR #76 (AUT-7), open on `card/aut-7`, another terminal's work.

No migration files were added by this run.

---

## 7. Escalations

None written to `docs/poc/state.json`, for the reason given in finding 4.

Four findings above carry a recommended default and are addressed to TRIAGE,
which boots after this report is committed and reads it as its input. Findings 1
and 2 are the ones that matter; they are one defect and its consequence, and
they sit in a file this role is not allowed to edit.

---

## 8. What the next run should pick up first

1. **Nothing on the board is eligible, and that will not change without a
   human.** P2-13 needs P2-15 (ivan) and P2-08b (andre). P2-14 needs P2-13 and
   the client. P2-19 needs ivan. A run that boots and finds this same state
   should go straight to CRITIC again rather than reporting silence.
2. **AUT-3 closes on this run, or it does not.** Its acceptance is a scheduled
   run producing a TRIAGE rulings PR with no human input. This report is the
   input that step needs, and it is committed before the executor exits, which
   is the whole point of section 9b. If TRIAGE produces a PR from it, AUT-3 is
   shipped with this run log as evidence. If it does not, that is a harness
   defect and becomes its own card, not a question for Ivan.
3. **Findings 1 and 2 are the highest-value work available.** They are POC-BUILDER
   work on `scripts/poc/run.sh`, and they gate whether any future card with a
   named spec can ever be shipped unattended.
4. **The Playwright suite has not been re-run against `main` outside CI.** A
   local stack is up on `127.0.0.1:54321`. A run with the environment corrected
   per finding 1 could execute all nine specs and give the next gate audit
   something firmer than "it was green on its own PR".
