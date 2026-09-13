# AUTHOR report: P3-43 widened, P3-45 and P3-46 authored, the CRM narrow scope carded

Role: AUTHOR. Date: 2026-09-13 (UTC). Branch: `card/p3-43`, cut from `origin/main` at 50eb45c.
Board-only pull request: the only files changed are `docs/board/rc-board-phase3.json` and this report.

## In plain words

Rapid Construct need a place to put leads. This change writes that work down as three
cards on the phase 3 board, ready to be built in order:

1. **Stages on a client** (P3-43, updated). Every customer record gets one of five stages:
   Lead rece, În cultivare, De reluat, Ofertat, Client. A lead set to De reluat cannot be
   saved without a date to chase it on. Every stage change is remembered with who made it
   and when. Everyone already in the system becomes Client.
2. **The Leaduri list and the add-lead form** (P3-45, new). One list of every lead that is
   not yet a client. It can be narrowed to one stage or searched by name, and leads whose
   chase date has passed sit at the top. A short form adds a new lead.
3. **One CRM entry in the sidebar** (P3-46, new). It replaces the separate Clienți and
   Proiecte entries and opens a page with three big cards. Every existing link keeps working.

No application code, no database change and no screen change is in this pull request. It
changes the plan, not the product.

## Boot status report, as printed before any write

Phase 2 board: 102 cards. 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch
gate 6/9. Next eligible: AUT-3.

Phase 3 board, read as well because CLAUDE.md section 1 names only phase 2 (known defect,
card RULE-05): 91 cards. 52 shipped, 39 todo, 0 blocked, 0 in_flight, 0 halted. Launch gate
0/9. Next eligible: CI-04. P3-43 was eligible.

## Cards touched

| Card | Status at end | What happened |
|---|---|---|
| P3-43 | todo | Title, plain, acceptance and defaults rewritten to handover Part 4.2. A dated note appended. id, lane, home_lane, priority, owner_terminal, gate and depends_on untouched. |
| P3-45 | todo, new | Leaduri list and add-lead form, handover Part 4.4. depends_on P3-43. |
| P3-46 | todo, new | CRM sidebar entry and landing screen, handover Parts 4.3 and 4.6. depends_on P3-43 and P3-45. |

All three: `gate: green_self_merge`, `owner_terminal: executor`, `blocked_on: null`,
`question: null`, `evidence: null`.

### Acceptance mapped to the handover's Part 4.8

| 4.8 line | Card and clause |
|---|---|
| 1. Sidebar shows CRM with three cards | P3-46 clause 1 |
| 2. Each card reaches its destination, old URLs resolve | P3-46 clauses 2 and 3, guarded by 4, 5 and 7 |
| 3. Create at any stage with the 4.4 fields | P3-45 clause 1 |
| 4. De reluat refused without a date, in Romanian | P3-43 clause 3 (existing form and database), P3-45 clause 2 (new form) |
| 5. Overdue sorts first | P3-45 clause 3 |
| 6. Each stage filters to itself | P3-45 clause 4 |
| 7. Leaduri and Clienți partition the rows | P3-45 clause 6 |
| 8. Conversion is a stage change, no new row | P3-45 clause 7 |
| 9. Stage change persisted with actor and timestamp | P3-43 clause 4 |
| 10. Existing rows carry stage client | P3-43 clause 5 |

Named specs: `tests/e2e/clients.spec.ts` (P3-43, existing file, new cases);
`tests/e2e/leaduri.spec.ts` (P3-45, new file); `tests/e2e/crm-landing.spec.ts` (P3-46, new
file) plus `tests/e2e/cross-links.spec.ts` passing byte-unchanged.

## Ids

- `npm run id:free -- P3-45`: FREE, lane highest P3-44, 0 open pull requests.
- `npm run id:free -- P3-46`, run after P3-45 was in the working tree: FREE, lane highest P3-45.

## Premises checked against the repository at 50eb45c, not transcribed

- `public.clients` (0013) has no stage, follow-up, source, interest or owner column.
- `public.status_history` (0001) is polymorphic on `status_entity`. 0015 added `project` in a
  migration of its own. 0021's `set_project_status()` writes history in one transaction and
  writes nothing on an unchanged status.
- 0016's column comment reads "THE PIPELINE IS NOT A STATE MACHINE IN THIS PHASE. Any status
  may be set from any other."
- `hasPhase3Schema()` probes only `public.projects`, so a clients migration cannot break it
  and cannot answer for the stage column. The cards require a column probe of its own.
- `check:no-destructive-migration` accepts `UpdateStmt`, `AlterEnumStmt`, `AlterTableStmt` and
  `DoStmt`. Migrations 0021 and 0026 already self-assert with `raise exception`.
- Local migration assertion files run after every migration has applied, so they cannot see
  rows that existed before one. P3-43 therefore asks for an in-migration DO block to prove
  "existing rows become client", and says the end to end suite cannot prove it.
- Highest migration file: 0037.
- `/clienti` already reads `q`, `tip`, `stare` and `pagina`; `stare` means active or inactive.
  P3-45 proposes `vedere` and `etapa` for the new filters.
- `public.contacts` (0014) exists with `client_id` and `name`, so "contact person" is a contact row.
- `lib/nav.ts`: the group is titled `Relații` and holds exactly `/clienti` (`Clienți`) and
  `/proiecte` (`Proiecte`). The handover called it simply "a nav group".
- `labelForPath` is called by `components/layout/Topbar.tsx` and `ALL_ROUTES` is looped over by
  `tests/e2e/headers.spec.ts`. Both derive from the sidebar list, so removing the two entries
  would silently change the top bar title and drop both routes from that spec. P3-46 guards both.
- `lead=` appears in 19 files under `app/` and `components/`. The handover said about 14.
- The six secondary surface files named by handover 4.6 and all nine specs named in P3-46 exist.
  No `/crm` route exists.

## Decisions the AUTHOR took, recorded in the cards

- **Diacritics over the handover's spelling.** The handover writes "In cultivare", "Clienti",
  "vizita". CLAUDE.md section 11 wins, so on-screen labels are `În cultivare`, `Clienți`,
  `Vizită`. Database tokens stay as the handover wrote them.
- **cross-links.spec.ts stays unmodified.** The brief named it both as the home for new
  old-URL cases and as a spec that must pass unmodified. Both cannot hold. It stays
  byte-identical (checked with `git diff --exit-code`), and new cases go in `crm-landing.spec.ts`.
- **Priority `high` on the two new cards.** P3-43 keeps `medium` by instruction.
- **No open question.** Nothing needed the owner, so no `question` field and no mailbox question.

## Commands run and results

| Command | Result |
|---|---|
| `node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json` | exit 0 before each of the four commits, three PASS, 0 violations |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:card-ids` | exit 0, every card id on the record resolves |
| `npm run check:board-edit` | exit 0, no code changed, board-only |
| `npm run check:unique-ids` | exit 0, 208 card ids, 195 ruling ids, unique |
| `npm run check:open-branch-ids` | exit 0, 0 open pull requests |
| `npm run check:no-destructive-migration` | exit 0, 0 migration files |
| `npm run check:conflict-residue` | exit 0 |
| `npm run check:categories` | exit 0 |
| `npm run check:ledger-rows` | exit 0 |
| `npm run check:no-prod-target` | exit 0 |
| `npm run check:pending-schema-reads` | exit 0, nothing pending |
| `npm run check:removal-safety` | exit 0, nothing pending |
| `npm run check:assertion-register` | exit 0 |
| staged diff scanned for credential-shaped values before every commit | no match |
| em and en dash count in every diff | 0 |

The end to end suite and the applier proofs need Docker and a local Supabase stack, which
this machine does not have. They run in `quality` on the pull request.

## Defects found

None in the repository. `docs/LEARNINGS.md` is untouched, per CLAUDE.md section 9: a card that
hit no defects appends nothing and says so.

## State at the end

The next session picks up P3-43, the lowest id of the three and eligible now. P3-45 becomes
eligible when P3-43 ships, and P3-46 when both have. P3-43 and P3-45 each add migrations, and
merging a migration applies it to production within about two minutes (CLAUDE.md section 8.0).
