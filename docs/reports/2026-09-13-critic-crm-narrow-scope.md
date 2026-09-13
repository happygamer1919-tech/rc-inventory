# CRITIC report: the CRM narrow scope, P3-43, P3-45 and P3-46, read against handover Part 4.8

**Role:** CRITIC. **Date:** 2026-09-13 (UTC). **Worked from:** the new operator's task
queue, task G5 (`006-g5-critic-crm-narrow-scope`), run headless on a machine with no
Docker, no Supabase CLI and no production credentials. Findings only: no application
code, no board edit, no fix.

## In plain words

The leads feature the owner's handover asked for is live and matches what is on `main`.
All ten acceptance lines in handover Part 4.8 are confirmed. Nine are proved by a named
automated test that passed on the exact commit that was merged. The tenth (existing
customers became "Client") is proved by the database change checking itself when it ran
on the live database, which is the only place that line can be proved.

Nothing found blocks the team from using the feature tomorrow. Three small things are
worth knowing and are written up below as findings: the stage history is guaranteed by
the screens and not by the database itself, the "every row exactly once" check was run
on active customers only, and the board's proof entry for P3-43 still describes the
failing test run instead of the passing one.

## Cards read

| card | status on `main` | pull request | merge commit |
|---|---|---|---|
| P3-43 | shipped | #278, merged 2026-09-13T17:26:59Z | `682f70d` |
| P3-45 | shipped | #279, merged 2026-09-13T19:01:43Z | `9fc1579` |
| P3-46 | shipped | #280, merged 2026-09-13T20:24:57Z | `62772e3` |

No card status was changed by this session.

## Boot status report (CLAUDE.md section 1)

- Phase 2 board (`as_of` 2026-09-12T22:55:06Z): 102 cards. 68 shipped, 32 todo,
  2 blocked, 0 in_flight, 0 halted. Launch gate readiness 6/9. Next eligible by id:
  AUT-3.
- Phase 3 board, read too (RULE-05), `as_of` 2026-09-13T19:55:37Z: 93 cards, 55 shipped,
  38 todo. P3-43, P3-45 and P3-46 all read `shipped`.
- Open pull requests at start: 0.

## Step 1: `/api/health` against `origin/main`

    GET https://app.rapidconstruct.md/api/health
    {"commit":"62772e36bba6378acfe82f3048176b2dda538b2f","ledger_version":"0040","at":"2026-09-13T20:36:30.527Z"}

    git log origin/main -1 --format=%H
    62772e36bba6378acfe82f3048176b2dda538b2f

**MATCH.** Production runs the merge commit of #280, and `ledger_version` `"0040"` says
migrations 0038, 0039 and 0040 are all applied.

## Step 2: every 4.8 line, its test case, and the run that proved it

### The three green runs, on the head sha each pull request merged

| PR | head sha merged (`headRefOid`) | `quality` run | run `headSha` | conclusion | End to end |
|---|---|---|---|---|---|
| #278 | `83431b8f0eb5` | 34768963848 | `83431b8f0eb5` | success | 199 passed, 0 failed |
| #279 | `7f23f0ee8bd4` | 34774968984 | `7f23f0ee8bd4` | success | 207 passed, 0 failed |
| #280 | `9040585a46e9` | 34779253727 | `9040585a46e9` | success | 213 passed, 0 failed |

Read with `gh pr view <pr> --json headRefOid,statusCheckRollup` and
`gh run view <run> --json headSha,conclusion`. In each case the run's sha is the head
sha that merged, so no result is stale (section 3).

**Migration safety steps**, from `gh run view <run> --json jobs`:

- #278 and #279 (migrations 0038, 0039, 0040): "Refuse a migration that removes rows",
  "Apply every migration to a bare postgres, unmodified", "Prove the migration applier
  against the Docker shim" and "Prove every applier assertion can fail" all RAN and
  concluded success. No step skipped except "Upload Playwright report on failure".
- #280 (no migration): the two applier proof steps were skipped, which is correct for a
  pull request that touches no applier path (section 3.1, R-084 and PROVE-01).

**The tree on `main` today is the tree the last green run tested:**
`git diff --stat 9040585 62772e3` prints nothing. Run 34779253727 therefore ran every
P3-43, P3-45 and P3-46 case against exactly what production serves, and all eighteen
passed there, together with the four `cross-links.spec.ts` cases.

**Red first, conclusion checked:** 34767124117 on `7fb916c` (P3-43, tests only),
34772991914 on `57dda10` (P3-45, tests only) and 34777407962 on `bdf7aba` (P3-46, tests
only) each concluded `failure`. The claim that exactly the new cases failed in those
runs is the executors' and was not re-read line by line here.

### The ten lines

Every case name below was read from the spec file on `main` at `62772e3` and found as a
`✓` line in the End to end log of the run named. No case in the three files carries
`test.skip`, `test.only` or `test.fixme`.

| 4.8 | what it requires | proving case(s), file:line on `main` | green in | verdict |
|---|---|---|---|---|
| 1 | Sidebar shows CRM; three cards Clienți, Leaduri, Proiecte | `crm-landing.spec.ts:177` "P3-46 (1): meniul are o singură intrare CRM în locul lui Clienți și Proiecte, iar ea deschide trei carduri colorate, în ordine" | 34779253727 | CONFIRMED |
| 2 | Each card reaches its destination; old /clienti and /proiecte resolve | `crm-landing.spec.ts:228` "P3-46 (2): Clienți ajunge la clienții de la etapa Client, Leaduri la restul, Proiecte la /proiecte neschimbat" and `crm-landing.spec.ts:285` "P3-46 (3): adresele de azi răspund cu același ecran, fără redirectare, cu CRM marcat în meniu" | 34779253727 | CONFIRMED |
| 3 | Client created at any stage from a form with the 4.4 fields | `leaduri.spec.ts:265` "P3-45 (1): formularul de lead creează un client la fiecare dintre cele cinci etape, cu fiecare câmp citit din rândurile stocate" | 34774968984, 34779253727 | CONFIRMED |
| 4 | De reluat without a follow-up date rejected in Romanian | `clients.spec.ts:447` "P3-43 (3): De reluat fără dată este refuzat în română și de baza de date, iar cu dată se salvează" and `leaduri.spec.ts:362` "P3-45 (2): De reluat fără dată este refuzat și din formularul de lead, fără niciun rând nou" | 34768963848 (P3-43), 34774968984, 34779253727 | CONFIRMED |
| 5 | Overdue sorts above not overdue | `leaduri.spec.ts:391` "P3-45 (3): cele întârziate primele, apoi cele de azi și viitoare, iar cele fără dată la urmă" | 34774968984, 34779253727 | CONFIRMED |
| 6 | Each of five stages filters to only that stage | `leaduri.spec.ts:439` "P3-45 (4): fiecare etapă filtrează la ea însăși, filtrul stă în URL, iar înapoi reface filtrul anterior" | 34774968984, 34779253727 | CONFIRMED |
| 7 | Leaduri has no client, Clienți only client, together every row once | `leaduri.spec.ts:564` "P3-45 (6): vederile Leaduri și Clienți împart lista fără rest și fără suprapunere, pe toate paginile", with `crm-landing.spec.ts:228` (P3-46 (2)) on the unscoped landed pages | 34774968984, 34779253727 | CONFIRMED, on active rows (finding F2) |
| 8 | Moving to Client leaves Leaduri, shows in Clienți, no copy, no new row | `leaduri.spec.ts:606` "P3-45 (7): conversia este o schimbare de etapă, cu același id, fără rând nou și cu un singur rând de istoric" | 34774968984, 34779253727 | CONFIRMED |
| 9 | Every stage change persisted with actor and timestamp | `clients.spec.ts:498` "P3-43 (4): o schimbare de etapă scrie exact un rând de istoric, iar aceeași etapă nu scrie niciunul"; also `leaduri.spec.ts:265` (first row from no stage) and `leaduri.spec.ts:606` (the move to client) | 34768963848, 34774968984, 34779253727 | CONFIRMED for every path the screens offer (finding F1) |
| 10 | Existing client rows carry stage client after the migration | NO END TO END CASE, and none is possible: the local stack creates its rows after every migration. Proved by the `DO` block in `supabase/migrations/0039_client_stage.sql` lines 93 to 102, which raises and rolls the file back if any row present after `add column stage ... not null default 'client'` (line 89) carries another stage; and by production reporting `ledger_version` `"0040"`, which cannot happen if 0039 rolled back. The second half (a new client is `cold`) is `clients.spec.ts:360` "P3-43 (1)(5)" | apply on production; 34768963848 for the second half | CONFIRMED, by the migration's self-assertion, not by a test case (see "Where the starting index was wrong") |

### How strong each proof is, read from the code rather than the case name

- **Line 1.** Asserts exactly one sidebar link labelled CRM, no sidebar link to /clienti
  or /proiecte, CRM placed where the two entries were, exactly three cards in order, and
  a colour dot beside each label that is actually painted, three distinct colours.
- **Line 2.** Clienți and Leaduri are clicked from /crm, and every row on the landed
  page (asserted non-empty) is read back from the database: all `client`, or none
  `client`. Then narrowed to a fixture of one lead and one client. The six old addresses
  each answer 200, land on the exact requested address, and show their heading and ready
  element.
- **Line 3.** All five stages, through the add-lead form, every one of the ten 4.4 fields
  read back from the stored row, the contact person from `public.contacts`, one history
  row from no stage with the owner's user id and a timestamp.
- **Line 4.** On both forms: the Romanian message is on screen, the raw `23514` is not,
  and no stored value changed (P3-43) or no row was created (P3-45). The database also
  refuses a direct write with `23514`.
- **Line 5.** Names deliberately sort opposite to dates; overdue, today, upcoming, no
  date, in that order; only the overdue row is marked; today is computed in
  Europe/Chisinau.
- **Line 6.** A fixture with one row at every stage; each of the four lead chips
  returns exactly its row, stage read from the database; the fifth stage, `client`, is
  reached through the Clienți view and returns exactly the client row. Scoped by a
  per-run search tag so other runs' rows cannot interfere.
- **Line 7.** Thirty rows, six per stage, over two pages; ids collected from every page;
  Leaduri 24 with no `client`, Clienți 6 all `client`, empty intersection, union equal to
  the unfiltered list.
- **Line 8.** The same id moves from Leaduri to Clienți, the total client row count is
  unchanged, exactly one new history row `quoted` to `client` with the actor.
- **Line 9.** Through the existing form: exactly one row with client id, from, to, actor
  and a parseable timestamp; the same stage saved again writes none. Through the add-lead
  form and the conversion, as above.
- **Line 10.** See the table. `ADD COLUMN ... NOT NULL DEFAULT 'client'` fills every
  existing row in that statement, and the `DO` block refuses to commit the file otherwise.

### Where the starting index was wrong

The task's starting index mapped line 10 to `tests/e2e/clients.spec.ts`. That file proves
only the second half (a new client stores `cold`). The first half has no test case and
the P3-43 card's own acceptance says so in terms ("THE END TO END SUITE CANNOT PROVE THE
FIRST HALF OF THIS LINE"), as does PR #278's body and a comment at `clients.spec.ts:229`.
Nothing was overclaimed by the executor; the index was simply looser than the card.

Line 6's index is also slightly generous: the five-stage filter is four chips plus the
Clienți view, not five chips. The card's acceptance names that design, and case 6 proves
the Clienți view is exactly stage `client`, so the line holds.

## Step 3: what the executors flagged themselves

Read from `docs/reports/2026-09-13-executor-p3-43-schema.md`,
`2026-09-13-executor-p3-45-leaduri.md` and `2026-09-13-executor-p3-46-crm-landing.md`
(the filenames are as drafted) and from the bodies of #278, #279 and #280.

**P3-43**

- The merge was held for the owner's approval (`q003-approve-g2-merge.md`), then merged.
- First implementation run 34768243619 failed at the bare-postgres apply: the older
  `assertions/0016_projects.sql` pinned the whole `status_entity` label list. Repaired
  by pinning the first three labels there and the full four-label set in
  `assertions/0038_status_entity_client.sql`. Read here as a repair at the cause, not a
  weakening: the same set is still pinned, by the file that changed it.
- The board flip rode in the pull request although the task asked to wait for the apply;
  `check:board-edit` and section 2 require it.
- The red-before ran in CI, not locally, with the card at `shipped` on the tests-only
  head so End to end would be reached.
- Branch `card/p3-43-schema`, because `card/p3-43` carried #277.
- `client_stage_history()` exists in SQL only; no screen shows stage history (handover
  4.7 excludes a timeline).

**P3-45**

- The red arm exposed three defects in the new test itself, fixed before the green run:
  PostgREST's 206 on a partial counted read, a search fragment in the wrong word order,
  and a "no row created" check that could never match. Read here: the 206 change accepts
  a correct response rather than loosening a check, and the other two make the case
  stricter.
- Decisions taken without asking: a required `p_first` flag on a four-parameter
  `set_client_stage`, so the first history row exists without breaking P3-43's case that
  pins zero rows on create; the column is `owner_id` because `owner` is the admin role;
  the add-lead form keeps a follow-up date at any stage; the contact person is saved as
  the primary contact; a lead's type is `company`, the column default.
- Noticed and not touched: P3-43's board evidence still reads "RED ARM ONLY" (finding F3).

**P3-46**

- No route was deleted or moved, so the redirects handover 4.3 allowed for were not
  needed.
- The two old sidebar entries moved into a `CRM_SCREENS` list so the top bar titles and
  `ALL_ROUTES` keep /clienti and /proiecte; CRM stays highlighted on those screens.
- **Card colours were chosen by the executor**, because the handover names none:
  Clienți green, Leaduri amber, Proiecte blue.
- Noticed and not touched: by the id sort, AUT-3 (phase 2) and CI-04 (phase 3) were the
  lowest eligible cards; the operator named P3-43, P3-45 and P3-46 instead.

## Findings

None blocks the owner from trusting the feature. None was fixed here.

**F1. Line 9 is guaranteed by the application, not by the database.** Every screen that
changes a stage goes through `public.set_client_stage`, which writes the history row in
the same transaction, and the three cases above prove it. But nothing in the database
stops a direct write to `clients.stage`: `supabase/migrations/0039_client_stage.sql`
lines 150 to 152 say so ("nothing at the database forces a caller to use it"), the same
limit 0021 accepted for projects, and `clients.spec.ts:477` shows a direct PATCH of
`stage` reaching the check constraint, so the column is writable. The update policy on
`public.clients` is owner-only (0013), so only a signed-in owner account calling the
database API directly, outside the screens, could move a stage without a history row.
Recommended default: card it for later (a trigger, or a column grant plus a
security-definer writer), not today.

**F2. Line 7 was proved on active customers only.** Case P3-45 (6) builds all thirty
rows active and reads the three lists under the default "active" filter. Deactivated
customers are covered by the counts case P3-45 (5) under `stare=toate`, but no case shows
that Leaduri and Clienți partition the list when deactivated rows are included. Both
views go through the same `search_clients_by_stage` predicate, so the risk is low.
Recommended default: add the `stare=toate` variant to case 6 the next time that spec is
touched.

**F3. P3-43's board evidence on `main` is stale, against section 6.** Its `evidence.ref`
still opens "RED ARM ONLY, NOT THE SHIP HEAD" and describes the tests-only head
`7fb916c`, although #278 merged green on `83431b8` with run 34768963848. A stranger
reading the card cannot re-verify the ship from it. P3-45 and P3-46 are weaker in a
smaller way: their evidence names the red run and defers the green run id to the pull
request body, where it is (34774968984 and 34779253727). Recommended default: a small
AUTHOR card that rewrites the three `evidence` refs to the green run ids above. Not done
here, because a board may only change in the pull request that carries the card's work
(section 2) and CRITIC writes findings only.

**F4. This report cannot self-merge.** Section 3.1 grants self-merge to EXECUTOR,
AUTHOR, POC-BUILDER and TRIAGE. CRITIC is not in that table. The task said to ask rather
than guess past that, so the pull request carrying this report is left open on green and
the owner is asked in the factory mailbox.

## Commands run, and results

- `curl -s https://app.rapidconstruct.md/api/health`: commit `62772e3`, ledger `0040`.
- `git log origin/main -1 --format=%H`: `62772e3`. Match.
- `gh pr view 278|279|280 --json headRefOid,mergeCommit,statusCheckRollup,body`.
- `gh run view 34768963848|34774968984|34779253727 --json headSha,conclusion,jobs` and
  `--log`, searched for every P3-43, P3-45, P3-46 and cross-links case and the totals.
- `gh run view 34767124117|34772991914|34777407962 --json headSha,conclusion`: all
  `failure`, on the tests-only heads.
- `git diff --stat 9040585 62772e3`: empty.
- Read: the three specs, the three card entries on the phase 3 board, migration 0039,
  `lib/data/client-actions.ts` (stage writes), `components/clients/ClientForm.tsx`,
  `docs/migrations/APPLY-LOG.md` entries for 0038 to 0040, handover Part 4.

Not run: the Playwright suite and the migration proofs, which need Docker and a local
Supabase stack this machine does not have. Nothing here needed them: this pass reads the
results of runs that already happened.

## Defects found, cross-referenced to docs/LEARNINGS.md

No entry appended. F1 to F3 are gaps in coverage and record-keeping on shipped cards, not
errors this session hit and solved; they are recorded here and in the owner's mailbox.

## State at the end

- The CRM narrow scope is confirmed on production.
- This report rides in its own pull request on branch `critic/crm-narrow-scope-20260913`,
  left open on green for the owner to merge (F4).
- Next for whoever picks up: an AUTHOR card for F3, and optionally cards for F1 and F2.
