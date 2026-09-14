# AUTHOR report: the live-app review findings carded, P3-47 to P3-54

Role: AUTHOR. Date: 2026-09-14 (UTC). Branch: `card/p3-review-findings`, cut from
`origin/main` at d25fbf9. Board-only pull request: the only files changed are
`docs/board/rc-board-phase3.json` and this report.

## In plain words

On 2026-09-14 the owner had the live system read screen by screen and asked for every fix
to be written down. This change writes those fixes down as eight cards on the phase 3
board, ready to be built one at a time:

1. **Readable tabs** on a customer's page and a job's page (P3-47). Today the selected tab
   is black on black.
2. **What a lead wants, where it came from and who owns it** shown on the customer's page
   and in the leads list, and editable (P3-48).
3. **A Romanian file button and day-first dates** (P3-49). Waits for the documents card
   (P3-15). One open question for the owner, with a default.
4. **The leads view describes itself** and its main button adds a lead (P3-50).
5. **Romanian wording fixes**: 1 produs, not 1 produse; two sentences that read wrong; two
   notes meant for the builders (P3-51).
6. **Filters on one row** on the leads and jobs lists (P3-52).
7. **Legible white text on orange buttons** (P3-53).
8. **A Rapid Construct icon** in the browser tab (P3-54).

The documents upload itself (finding F3) is not carded again: it is already card P3-15.

No application code, no database change and no screen change is in this pull request.
It changes the plan, not the product.

## Boot status report, as printed before any write

Phase 2 board: 102 cards. 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch
gate 6/9. Next eligible: AUT-3.

Phase 3 board, read as well because CLAUDE.md section 1 names only phase 2 (known defect,
card RULE-05): 93 cards. 59 shipped, 34 todo, 0 blocked, 0 in_flight, 0 halted. Launch gate
0/9. Next eligible: CI-04. P3-15 was already eligible.

## Cards authored

| Card | Finding | Priority | depends_on | Named acceptance |
|---|---|---|---|---|
| P3-47 | F1 tabs | high | none | `tests/e2e/client-project-tabs.spec.ts`, new |
| P3-48 | F2 lead fields | high | none | `tests/e2e/leaduri.spec.ts`, new case |
| P3-49 | F4 file picker and dates | medium | P3-15 | `tests/e2e/romanian-file-date.spec.ts`, new, plus `inbound.spec.ts` |
| P3-50 | F5 Leaduri view | medium | none | `tests/e2e/leaduri.spec.ts`, new case, plus `crm-landing.spec.ts` and `headers.spec.ts` unmodified |
| P3-51 | F6 and F7 wording | medium | none | `tests/e2e/copy-fixes.spec.ts`, new, plus a grep and `dashboard.spec.ts` unmodified |
| P3-52 | F8 filters | low | none | `tests/e2e/list-filters-layout.spec.ts`, new, plus three specs unmodified |
| P3-53 | F9 button contrast | low | none | `tests/e2e/button-contrast.spec.ts`, new, plus two greps |
| P3-54 | F10 favicon | low | none | `tests/e2e/favicon.spec.ts`, new, plus `test -f app/favicon.ico` |

All eight: `status: todo`, `lane` and `home_lane` `in_flight` (as P3-44 and P3-46),
`owner_terminal: executor`, `gate: green_self_merge`, `blocked_on: null`, `evidence: null`,
`last_checkpoint` read from the clock at the edit. `question` is null on seven and set on
P3-49. Every card has `plain`, `defaults`, `depends_on` and machine-checkable `acceptance`.

## Ids

Each id from `npm run id:free`, run for real, one at a time, after the previous card was in
the working tree. Every answer was FREE, with 0 open pull requests: P3-47 (lane highest
P3-46), P3-48 (P3-47), P3-49 (P3-48), P3-50 (P3-49), P3-51 (P3-50), P3-52 (P3-51), P3-53
(P3-52), P3-54 (P3-53).

## Premises checked against the repository at d25fbf9, not transcribed

- F1: both tab rows render outside any card, on the dark page. The two other rows using the
  same classes (the Cost material filter in ProjectTabs, the version picker in
  DevizComparisonPanel) sit inside a white card and must not change. Measured: `rc-muted-2`
  on the page background 6.47:1, `rc-muted` 3.72:1.
- F2: `getClient` and `listClients` do not select source, interest or owner_id, and
  `updateClientRecord` never calls `validateLeaduri` (only create does). So the edit form
  cannot save the three fields even on the server. P3-48 fixes all four places.
- F4: two native file inputs (OrderDocumentUpload, used on three screens, and
  ExtractionReviewPanel). EIGHT native date inputs in five files, not the two the review
  named. The review's line numbers 209 and 217 are now 230 and 239. Chromium draws "Choose
  File", "No file chosen" and "mm/dd/yyyy" outside the page text, so a text search would
  pass on the broken screen. P3-49's acceptance therefore asserts on the controls, under an
  English browser language, as the P3-41 case already does.
- F5: the "breadcrumb" is the top bar title from `labelForPath`, which reads the path only,
  never the query string. The subtitle is a `lead=` prop (the lead paragraph trap).
- F6 and F7: `plural()` already exists in lib/data/format.ts with the full Romanian rule.
  Necesar also reads wrong at exactly 1. **The review misquoted one string**: the source
  says "se tastează întâi" (typed), not "testează" (tested). The real builder note in that
  box is "Documentul se salvează real". P3-51 quotes the source.
- F8: Inventar uses an explicit CSS grid. Leaduri and Proiecte use `flex flex-wrap` with
  `w-full` fields, which is why they stack. No existing layout assertion for Inventar.
- F9: **neither existing darker orange is enough.** White on `rc-orange-deep` is 3.14:1 and
  on `rc-orange-dark` 3.16:1, so a new token is needed. The lightest shade of the same
  orange that reaches 4.5:1 is #c25401 (4.60:1). Four buttons already use black text on
  orange (7.26:1) and are left alone.
- F10: the only brand asset is `public/brand/rapid-construct-logo.png`, a 752 by 331
  wordmark. The card crops its roof outline and asks the owner rather than inventing a mark
  if that is unreadable. `proxy.ts` already lets `favicon.ico` and `.png` through.

## Decisions the AUTHOR took, recorded in the cards

- **P3-49 carries a question, and status stays todo.** On 2026-09-13 PURPLE's answer to
  q005 kept the browser's date box and declined a Romanian day.month.year box (its option
  B). F4 now asks for that box. The card states both options and recommends the
  replacement, keeping the calendar and P3-41's written-out date. It also says what happens
  if nobody answers. It cannot be picked before P3-15 ships, so nothing is parked. The same
  question is filed for the owner as factory mailbox q009.
- **All eight date fields and all file inputs, not only the two screens named.** Section 11
  allows no English on any screen, and the browser behaviour is identical everywhere.
- **P3-49 depends on P3-15**, because the documents upload is one of the places the picker
  goes.
- **P3-50 removes Client nou from the Leaduri view header.** A lead becomes a client by a
  stage change, so a second create path there invites duplicates.
- **P3-51 proves the singular through the Inventar search.** Tests never empty a table.
- **P3-52 writes its own Inventar layout assertion as the control**, since none exists.
- **Every spec that must not change is pinned with `git diff --exit-code origin/main`.**

## Commands run and results

| Command | Result |
|---|---|
| `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json` | exit 0 before each commit, three PASS, 0 violations |
| `npm run check:board-clock` | exit 0, all 169 phase 3 timestamps at or before the commit |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:card-ids` | exit 0 |
| `npm run check:board-edit` | exit 0, no code changed, 8 card ids resolved |
| `npm run check:unique-ids` | exit 0, 216 card ids, 195 ruling ids, unique |
| `npm run check:open-branch-ids` | exit 0, 0 open pull requests |
| `npm run check:no-destructive-migration` | exit 0, 0 migration files |
| `npm run check:conflict-residue` | exit 0, run again after staging this report |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0, nothing pending |
| `npm run check:removal-safety` | exit 0, nothing pending |
| `npm run check:assertion-register` | exit 0 |
| staged diff scanned for credential-shaped values and em or en dashes before every commit | no match |

The end to end suite and the applier proofs need Docker and a local Supabase stack, which
this machine does not have. They run in `quality` on the pull request.

## Defects found

None in the repository. `docs/LEARNINGS.md` is untouched, per CLAUDE.md section 9: a card
that hit no defects appends nothing and says so. Two things in the review itself are
corrected in the cards rather than logged as defects: the misquoted "testează", and the
claim that `rc-orange-deep` could be enough.

## Merge

This pull request does not self-merge. Real client data has been in production since
2026-09-14. The operator's standing rule is that no pull request self-merges, whatever it
touches, so it ends at an owner question once `quality` is green.

## State at the end

P3-47 and P3-48 are the first to build: both are eligible as soon as this merges, and
neither changes the database. P3-49 waits on P3-15, which adds a migration, and merging a
migration applies it to production within about two minutes (CLAUDE.md section 8.0).
