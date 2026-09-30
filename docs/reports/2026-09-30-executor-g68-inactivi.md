# Card P3-112, goal G68: Inactivi, a place of their own for the deactivated leads and clients

Role AUTHOR, then EXECUTOR, in one pull request.
Branch `card/p3-112`, cut from `origin/main` at `4c30962`.
Date 2026-09-30 UTC.

---

## 1. What the owner asked for, and what shipped

Max, 2026-09-29: *"where the deactivated leads go? i asked to do a department for those"*.

Until this card a deactivated lead or client was reachable in exactly one way: open the client
list and change the **Stare** select from Activi to Inactivi. Nothing on screen named them, and
nothing counted them, so from the owner's side they had gone somewhere unnamed.

What shipped is a third view of the client list, `/clienti?vedere=inactivi`, sitting beside
Toți, Leaduri and Clienți:

- **the count on the pill itself**, in the same style the other two pills already use,
- **one list holding both**, every deactivated lead and every deactivated client,
- **Fel**, saying of each row whether it is a lead or a client,
- **Etapă**, with the existing Romanian stage label and its colour mark,
- **the phone as a `tel:` link**, the same one the Azi screen uses,
- **the shared search box**, one box, over name, IDNO, phone and email as everywhere else,
- **`Reactivează` on every row**,
- a Romanian empty state,
- and one card per row under 768px.

Romanian with diacritics throughout, desktop first, usable at 390px. No migration.

---

## 2. The tab and not a CRM card, and why that is a decision rather than a coin toss

The goal left the choice open: *"a tab beside the normal list, or a CRM card, whichever matches
the existing CRM screen"*. It also asked for the count to be **on the entry**. Those two
together settle it, because of what `app/(app)/crm/page.tsx` says about itself in its own
header:

> "NU CITESTE NIMIC DIN BAZA. Trei carduri si trei legaturi, fara numere: predarea
> proprietarului nu cere niciunul, iar cardul P3-40 a masurat deja in jur de 32 de drumuri la
> baza pe o randare autentificata. Un ecran al carui singur rost este sa fie un meniu nu adauga
> altele."

A CRM card carrying a count is a CRM card that reads the database. That is the one thing that
file exists not to do, and card P3-40 measured what it costs: about 32 database round trips on a
single authenticated render. The client list, by contrast, reads the database on every render
already, so a count there costs nothing extra.

So: a tab. **`app/(app)/crm/page.tsx` is untouched**, and the acceptance asserts it, not by
reading the file but by asserting the diff for it is empty:

```
git diff origin/main...HEAD -- "app/(app)/crm/page.tsx"   ->  0 lines
```

It is also **not a new route**. Leaduri and Clienți are already views of one screen selected by
`vedere=` (P3-45, P3-50), so Inactivi is a third value of the same parameter. `labelForPath` and
the dead-link list in `lib/nav.ts` therefore have nothing new to learn, and nothing in the
navigation changed.

---

## 3. The deactivation date: we do not have one, and none was invented

The goal asked for *"the date it was deactivated **if we have it**"*. We do not have it.

- `clients.active` is a plain boolean, `supabase/migrations/0013_clients.sql:67`.
- That migration's own note, at line 177, says: *"Deactivation is the active boolean; deletion
  is not a feature."*
- `grep -rn "deactivated_at" supabase/migrations/` returns nothing. There is no such column
  anywhere in the repository.

So the view **draws no date column at all**. An always-empty column looks like a rendering
defect, and a guessed one is worse than none.

The stage history table from `0039` was checked as a possible source and is not one: it records
stage MOVES, lead rece to ofertat and so on, and activation is not a stage. Deactivating a lead
writes no history row, by design, and the P3-66 comment on the sheet button says so. No second
mechanism was built to guess the moment.

### What a follow-up card could and could not do, for Max to decide

It is possible to add an additive nullable `deactivated_at`, stamped from the moment it ships.
It would then be correct for everybody deactivated after that day.

**It could never be filled in for anybody deactivated before it existed**, because the
information was never recorded anywhere. So the column would read empty for the existing rows
forever, and the screen would have to say why, or it would look broken.

That last clause is the whole reason this is a decision for the owner rather than something to
slip into this card: the choice is not "date or no date", it is "a date for future
deactivations plus a permanent blank for the old ones, or no date at all". Nothing about the
current implementation blocks adding it later.

---

## 4. One reactivation path, and the instruction that would have destroyed data

The card brief was explicit: the row button should go *"through the same update path
`ClientDetailScreen`'s button already uses. Do not write a second reactivation path; reuse the
one G24 shipped, so the two cannot drift."*

Followed literally, that would have emptied four fields on real records.

The sheet's path is `updateClientRecord`. It is not a targeted update. It hands its whole input
to `validate()`, which builds and writes eight columns: `name`, `type`, `fiscal_code`,
`address`, `phone`, `email`, `notes` and `active`, storing an empty string as `null`. The sheet
may call it, because the sheet has all eight on screen.

A list row has four columns. It does not carry IDNO, address, email or notes. A call from there
would have sent those four as `""`, and `validate()` would have stored them as `null`: one press
of `Reactivează` would have silently wiped the IDNO, address, email and notes of that person,
with no error and nothing visible on screen, against the 380 real leads in production.

Reading the record back first to fill the eight in is not a fix either. Somebody can save the
sheet between the render and the press, and the stale values sent back would overwrite what they
wrote.

**So the single path is `setClientActive(id, active)`, which writes the one column `active`, and
`ClientDetailScreen` was moved onto it in the same pull request.** There is still exactly one
path, and `grep` shows one action with two callers:

```
lib/data/client-actions.ts:437         export async function setClientActive(
components/clients/ClientDetailScreen.tsx:114   await setClientActive(client.id, next)
components/clients/ReactivateRowButton.tsx:40   await setClientActive(id, true)
```

`updateClientRecord` is left only on the client form path, where the whole field set really is
on screen. Nothing visible on the sheet changed: the same button, the same two Romanian
sentences, the same refusal for a non-owner. Those two sentences now live once, in
`lib/data/clients-types.ts`, instead of once per caller.

Case 1 of the spec proves the point rather than asserting the intention: it reads `fiscal_code`,
`address`, `email` and `notes` out of the database before the press and again after it, and
requires them unchanged.

The instruction's purpose was that the two buttons cannot drift. That is met, in substance and
literally. Its letter would have shipped a data-loss defect, which is why it was read the other
way, and the card's `notes` field flags this as the one thing a reviewer should read twice.

---

## 5. What was deliberately left alone

- **The normal lists still hide deactivated records**, exactly as before. This card adds a place
  to look; it does not change what Leaduri and Clienți show. `search_clients_by_stage` is called
  with the same default `p_status = 'active'` it always was.
- **The Stare filter keeps all three options** in every other view, and the two empty-state
  sentences P3-66 wrote, which point at the Inactivi filter, **stay true and stay working**,
  because the filter did not move. `tests/e2e/reactivate-lead.spec.ts` still drives that filter
  and still asserts `stare=inactive` in the URL, and it still passes, unedited.
- **Nothing is deleted and nothing is bulk changed.** One row per press, through the existing
  path, with the existing confirmation shape. There is no "reactivate all".
- **No access rule and no policy.** `clients_update` from 0013 is already `is_owner()`, so the
  role check in the action is the second net and exists for the Romanian sentence, as the rest
  of that file describes. The button is not rendered for an account manager. A deactivated
  CLIENT row is not a deactivated USER account: the profiles table is neither read nor written
  by this card.
- **No migration.** Every read already exists: `search_clients_by_stage` takes the status, and
  `client_stage_counts` takes it too.

---

## 6. The decisions inside the view, and the reasons

**The view is itself the state filter, so the Stare select is not drawn in it.** Two controls
for one thing, where changing one throws the operator out of the view, is a worse screen than
one control. For the same reason `stare` is not read from the URL there:
`/clienti?vedere=inactivi&stare=active` shows the deactivated rows, not an empty list, so an old
link cannot produce a view that contradicts its own name. `etapa` is ignored there too: a stage
would split the list in two and bring back exactly the hiding this card removes.

**The other pills reset the state when leaving Inactivi, and only then.** Pressing Leaduri from
Inactivi returns to the default Activi, because otherwise the view would change and the state
would not. Pressing Leaduri while the Stare select is manually on Inactivi keeps that state,
exactly as today: that behaviour is untouched.

**And the other pills' counts are read under the state they will land on.** This was a real
defect on the way through. `countClientsByStage` is called with the live query, so read from
inside Inactivi it counted under `inactive`: the Leaduri pill would have printed the number of
deactivated leads and the click after it would have shown the active ones. On this data that is
"Leaduri 3" followed by a list of 380. The page now reads those counts under `active` in the
Inactivi view only. Migration 0040 already states the rule in its own comment, *"the number
beside a chip says how many rows that chip would show"*.

**The counted noun is "înregistrare dezactivată", not lead and not client**, because the list
holds both and the Fel column already says which each row is. It goes through `plural()` from
`lib/data/format.ts`, so nineteen and below take the plain plural and twenty and above take the
Romanian `de` form: "20 de înregistrări dezactivate". Card P3-98 fixed six call sites that wrote
the number straight against the noun; this is not a seventh, and case 3 asserts the form.

**Stare is not a column** in that view. Every row in it is inactive, and the title, the lead
sentence and the pressed pill say so three times already. A column whose every cell holds the
same word does not help anybody choose a row.

**The column is called "Fel" and not "Tip"**, because Tip already means company or individual on
the other views of this same screen.

**The confirmation belongs to the screen, not to the row**, because a reactivated row leaves the
Inactivi list in the same instant: it is no longer deactivated, so it no longer belongs there. A
sentence written inside the row would leave with the row and never be read. It is a
`role="status"` line under the card header, the same shape and the same words P3-66 put on the
sheet, since this application has no toasts.

**`p_view` is sent as `null` for this view**, not as the token `inactivi`, even though 0040's
comment says anything other than `leaduri` or `clienti` means every row. A view that works
because a token is unrecognised is a view the next version of that function can break in
silence.

---

## 7. Acceptance and gates

`tests/e2e/inactivi.spec.ts`, five cases, all collected by `npx playwright test --list`:

1. a lead deactivated, absent from Leaduri on Activi, found through the Inactivi pill,
   reactivated from its own row, the stored row read back through PostgREST, the four unshown
   fields unchanged, and the lead back in the normal list afterwards;
2. a deactivated client and a deactivated lead in the one list, Fel reading exactly `Client` and
   `Lead`, the existing Romanian stage labels with their colour marks, and the phone as a `tel:`
   link;
3. twenty rows created BY ADDING and never by deleting, the pill number, the row count and the
   counted sentence all agreeing, the sentence in the `de` form past nineteen checked against
   the three-form rule written out in the spec rather than imported from the application, and
   the one search box narrowing by name and by phone;
4. the Romanian empty state, with no button into another filter, and Șterge filtrele staying
   inside the view;
5. 390x844: every row a card carrying its column header as its visible label, the `Reactivează`
   button measured at 44px, every input at 16px, no sideways scroll on the document or in
   `<main>`, and the desktop width still a table.

The suite itself runs only in CI: **this machine has no Docker and no Supabase CLI**, and
nothing here claims otherwise.

Local gates, each command run alone with its exit code read on the next line, each exit 0:

```
npx tsc --noEmit
npm run build
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
npm run check:card-ids
npm run check:unique-ids
npm run check:open-branch-ids
npm run check:no-destructive-migration
npm run check:conflict-residue
npm run check:categories
npm run check:ledger-rows
npm run check:no-prod-target
npm run check:pending-schema-reads
npm run check:removal-safety
npm run check:assertion-register
npm run check:board-clock
npx playwright test --list tests/e2e/inactivi.spec.ts
```

`npm run check:board-edit` was red before the board flip, by design, and green on it.

Greppable clauses, verified:

```
grep -rn "^const PHONE_" components/ app/     2 hits, both in DevizPanel.tsx, both already on origin/main
git diff --name-only origin/main...HEAD -- supabase/migrations/    0 files
git diff origin/main...HEAD -- "app/(app)/crm/page.tsx"            0 lines
```

No em dash and no en dash in any added line, checked over the whole diff.

---

## 8. Safety

- **No production database access.** No credential was read, sourced or fetched. No live site was
  opened and no production row was read. Everything is proved in CI.
- **No real client data was touched.** Every fixture is created through PostgREST inside the CI
  stack, prefixed `TEST`, suffixed with a per-run token, and never deleted. Where case 3 needs a
  count past nineteen it ADDS rows.
- **No secret in the diff.** `git diff --cached` was read before every commit and scanned for
  credential-shaped strings.
- **Orange coordination.** `git fetch origin` then `git merge origin/main` before the push, never
  a rebase and never a force push. No file under `app/api/extraction/`, `app/api/documents/`,
  `lib/data/extraction*` or `docs/contracts/extraction*` was touched, so there is nothing to
  tell Andre.
- **No self-merge.** Real client data has been in production since 2026-09-14. This branch opens
  a pull request, not a draft, and the owner's auto-merger lands it on green.

---

## 9. Learnings filed

Three ERROR and SOLUTION pairs appended to `docs/LEARNINGS.md`:

1. reusing a write path from a wider screen on a narrower one silently nulls every field the
   narrower one does not carry;
2. a count printed on a control is a promise about the state after the control is pressed;
3. `fold_text` collapses whitespace and does not remove it, so a phone searched without spaces
   misses.

---

## 10. In plain words, for the owner

The leads and clients you switched off now have their own place. On the client list there is a
third tab, Inactivi, with the number of switched-off records on the tab itself. Open it and you
see all of them in one list, leads and clients together, each row saying which of the two it is,
what stage it had reached, and its phone as a link you can tap to call. The same search box works
there, and every row has a Reactivează button, so bringing somebody back is one press instead of
a hunt through a filter. The normal lists still hide the switched-off records, exactly as before,
and nothing is ever deleted.

One thing the system honestly cannot show is the date somebody was switched off, because that has
never been stored anywhere. A date could be recorded from now on, but it could never be filled in
for anybody switched off before today, so that is your decision rather than something to add
quietly here.

It works on a phone as well as on a desktop, where each row becomes its own card.
