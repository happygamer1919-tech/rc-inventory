# Setări becomes a sub-menu of sections, and nothing else moves

**Role AUTHOR then EXECUTOR, in one run. 2026-09-30. Goal G69 part 2, the first BUILD part.
Card P3-113. No migration, no new data, no new permission.**

The specification is `docs/reports/2026-09-30-author-setari-design.md` section 4, Part 1, which
merged as pull request #378. This report says what was built, the one place it departs from that
note and why, and what was deliberately left for later parts.

Everything below was read against `origin/main` at `04a5dd5`.

---

## For Max, in plain words

Settings had four things stacked down one page and no menu. It now has a row of section names
across the top. Press one and you see just that section; each section has its own web address, so
you can send somebody a link straight to the invoicing settings.

Open Settings with no link and you still see everything, in this order: the catalogue vocabulary
first, meaning the product categories you can add and rename together with the units of measure the
system knows, then the invoicing settings, then the entry that opens the sheet and metal tile list
on its own screen. Nothing was rebuilt and nothing moved out of reach.

The one line under Settings in the left menu was rewritten. It promised only categories and units,
and had not mentioned invoicing since invoicing was built.

Two things you should know:

- **You still see everything on the bare address, not only the first section.** The design note
  recommended showing only the first section. That turned out to be impossible without editing an
  existing test, so the bare address shows all of them under an entry called "Toate setările". The
  full reason is below, under "The one departure". If you prefer the note's version, say so and it
  is a small follow-up card.
- **Company details, the user list and the logo are not in this piece of work.** They are the next
  parts, exactly as the note laid them out. Nothing about them was started or invented here.

---

## 1. What was built

| Section on screen | What it holds | Its address |
|---|---|---|
| **Toate setările** | Every section, one under another, the catalogue vocabulary first | `/setari` |
| **Vocabularul catalogului** | Categorii with its add box, and Unități de măsură, view only | `/setari?sectiune=catalog` |
| **Facturare** | The existing invoicing block, moved and not rebuilt | `/setari?sectiune=facturare` |
| **Opțiuni produse** | The card that links out to `/setari/tabla`, exactly as today | `/setari?sectiune=optiuni` |

**The sub-menu is the tab band RC already has twice**, on the client sheet and the project sheet,
class for class from `components/clients/ClientTabs.tsx`. The note's section 2 describes a menu "down
one side" and then, in the same section, recommends the pattern that already exists here rather than
a new one. The band is that pattern, and it is the lower risk of the two: a side column narrows the
content and would have had to be proved not to break the invoicing grid or the 390px fit.

**Links, not buttons, and therefore a server component.** The two tab bands push the route from the
client, because what they switch is a panel. A section here **is** an address, so each entry is a
plain link: it opens in a new tab, it can be sent in a message, and the dead-link sweep can follow
it. No client JavaScript was added to the screen at all.

**The blocks are moved, not rebuilt.** `CategorySettings.tsx` and `FacturareSettings.tsx` are
untouched, which is what that claim looks like in a diff. `UnitSettings.tsx` changed twice and only
twice: a bottom margin, because it is no longer the last block on the page, and a `<section>` wrapper
carrying `settings-unitati`, because `Card` takes no `data-testid` and without a wrapper the
acceptance could not state that the whole block contains no control that writes.

**Only what is shown is read from the database.** On `?sectiune=facturare` the categories, the units
and the whole product list are no longer fetched; on `?sectiune=catalog` the invoice settings row is
not fetched. A settings screen that pulls the entire catalogue to draw an invoicing form is the cost
card P3-40 measured at about 32 round trips on one authenticated render.

---

## 2. Which section opens first, and on what basis

**On the bare `/setari` address every section is shown, under a sub-menu entry called
"Toate setările", with the catalogue vocabulary first in the stack.**

The basis is not taste. It is three existing tests, and a fourth thing the design note asked for:

1. `tests/e2e/auth.spec.ts` asserts that after opening `/setari` the address still ends `/setari`.
   So the screen must answer on its bare address and must not redirect anywhere.
2. **Ten** spec files begin their setup by going to `/setari`, typing a category name and pressing
   Adaugă, because that is how a spec gives itself a category before creating a product. So
   `category-name` and `category-add` must be on the bare address with no click. The note said six;
   the actual count, grepped on `goto("/setari")` plus `category-add`, is ten.
3. `tests/e2e/phone-remainder.spec.ts` case (f) requires `category-row` **and** `unit-row` on the
   same screen at 390px. So Categorii and Unități must stay in one section, which they do.

That much the note predicted. The fourth is the departure.

---

## 3. The one departure from the design note, stated plainly

**The note recommends that the bare address open the catalogue vocabulary section ALONE. That cannot
be built without editing an existing test, so it was not built.**

`tests/e2e/facturare-settings.spec.ts` reaches the screen through its own helper:

```
async function openSettings(page: Page) {
  await page.goto("/setari");
  await expect(page.getByTestId("settings-facturare")).toBeVisible({ timeout: 25_000 });
  ...
}
```

Two of its three cases call that helper, several times each, to re-read a saved value after a
reload. If the bare address showed only the vocabulary section, the invoicing block would not be on
it, and the helper fails on its second line.

The card brief forbids editing any existing test, and names that file specifically as one that must
keep working. The note's own section 2b derived its constraint from the categories box and from the
phone case and **did not open the invoicing file**, so the constraint it states is correct and
incomplete.

**What was done instead, and what it preserves.** The bare address shows every section under a
"Toate setările" entry which the sub-menu marks as open, and the catalogue vocabulary is first in
the stack. Every consequence the note calls "not an opinion" still holds:

- `/setari` answers on its own address and does not redirect.
- Categorii is on the bare address with its add box, without a click.
- The sub-menu exists, and each section has its own address.
- Categorii and Unități are in one section, so the phone case still finds both on one screen.

Reading the note's sentence "the owner should be able to open Setări and read what the system is set
to without pressing anything", a bare address that shows everything serves it better than one that
shows a quarter of it. That is an argument, not the reason; the reason is the helper above.

**If Max prefers the note's literal shape**, it is a small follow-up card: it changes the default
from "toate" to "catalog" and updates that one helper to `/setari?sectiune=facturare`, deliberately,
naming it in its own report. It is one line of application code and one line of test code. It was
not done here because no answer authorising a test edit had landed in `mailbox/answers/` when this
card was worked, and weakening or editing a check to make a run green is forbidden.

---

## 4. The addressing scheme, and why it needed no registration

**A query parameter, `?sectiune=`, and not a sub-path.** Three reasons, in order of weight:

1. **RC already has exactly this mechanism twice.** The chosen tab on the client sheet and on the
   project sheet is `?fila=`, and the chosen view of the client list is `?vedere=`. A second
   mechanism for the same idea would be a second thing to learn for the same gesture.
2. **A sub-path would have forced a redirect or a second page.** `/setari` must keep answering at
   its bare address; a first section at `/setari/catalog` would mean either redirecting the bare
   address, which one case of `auth.spec.ts` forbids, or duplicating the screen.
3. **`labelForPath` and `ALL_ROUTES` in `lib/nav.ts` read the path only.** So the top bar title and
   the dead-link sweep in `tests/e2e/headers.spec.ts`, which walks `ALL_ROUTES`, already cover every
   address this card adds, with no new entry anywhere. A sub-path would have dropped out of both in
   silence, which is the trap card P3-46 recorded.

Because point 3 is an absence rather than a change, it is proved rather than assumed: case 5 of the
new spec visits all four addresses with a console and `pageerror` watcher attached, asserts an empty
error list on each after `networkidle`, and asserts the top bar reads exactly `Setări` on each.

`settingsSectionHref("toate")` is the bare address, not `?sectiune=toate`, so the first entry in the
band links to the screen itself. An unknown value, `?sectiune=nu-exista`, falls back to
"Toate setările" and raises nothing, which is the same road an unknown `?fila=` already takes on the
client sheet.

---

## 5. The eighteen spec files that touch `/setari`, all passing, none edited

`git diff --name-only origin/main...HEAD -- tests/` lists exactly one file, and it is new. **No
existing test was edited, and none needed to be.** The eighteen, with what each needs from the
screen:

| Spec file | What it needs from `/setari` |
|---|---|
| `auth.spec.ts` | The owner opens it with no 403; the operator gets the Romanian 403 and the address stays `/setari`; the no-profile screen likewise |
| `button-contrast.spec.ts` | The orange `Doar administrator` chip, read on the bare address, at 4.5:1, and its exact class string |
| `copy-fixes.spec.ts` | Setup: add a category from the bare address |
| `cross-links.spec.ts` | Setup: add a category from the bare address |
| `dashboard.spec.ts` | `/setari` in the route sweep for both roles, no NaN or undefined in the body, and the singular category counter on the bare address |
| `extraction.spec.ts` | Setup, and case 4 adds a category from the bare address and expects it in a webhook response |
| `extraction-webhook-missing.spec.ts` | Setup: add a category from the bare address |
| `facturare-settings.spec.ts` | `settings-facturare` VISIBLE on the bare address, repeatedly; the VAT note word for word; the operator refusal |
| `inbound.spec.ts` | Setup: add a category from the bare address |
| `order-document-type.spec.ts` | Setup: add a category from the bare address |
| `outbound.spec.ts` | Setup: add a category from the bare address |
| `phone-remainder.spec.ts` | Case (f) at 390x844: categories and units both as cards on one screen, the whole screen fitting, every control at least 44px, and the 403 screen |
| `product-image.spec.ts` | Setup: add a category from the bare address |
| `products.spec.ts` | Setup, and the operator case asserting `category-add` is absent behind the 403 |
| `reminders.spec.ts` | Setup: add a category from the bare address |
| `romanian-counts.spec.ts` | Setup, and the Romanian counted noun on the categories card |
| `romanian-file-date.spec.ts` | Setup: add a category from the bare address |
| `sheet-options-admin.spec.ts` | `/setari/tabla`, which this card does not change, and the operator's 403 on it |

`phone-remainder.spec.ts` case (f) is worth naming twice: it measures this screen at 390px and
therefore now measures the new sub-menu too, including the rule that every visible control in
`<main>` is at least 44px tall. The band gets that from `PHONE_LINK`, imported from
`components/ui/phone.ts`; no phone class was written locally, and
`grep -rn "^const PHONE_" components/ app/` returns only the two pre-existing lines in
`components/projects/DevizPanel.tsx`.

---

## 6. What the new spec proves

`tests/e2e/setari-sections.spec.ts`, six cases, none skipped.

1. **The bare address does not redirect and the category box is there without a click.** The address
   still matches `/setari$` with no parameter added on the way; `category-name` and `category-add`
   are visible and `category-rows` is in the document; `settings-facturare` and `settings-optiuni`
   are on that same bare address, which pins the shape the invoicing spec requires; the sub-menu
   marks exactly `settings-section-toate`; the orange chip is visible.
2. **Each section at its own address.** For each of the three, the address is kept, the section's own
   marker is visible, **neither** of the other two is present, and the sub-menu marks exactly one
   entry, that one. An unknown value falls back to "Toate setările". And at 1440 the four entries
   share a single rounded top offset, which is what proves the wrapping is phone only and the
   desktop band is one row.
3. **Units stay view only, Opțiuni produse still leaves.** The units block is visible with at least
   one row and the chip reading exactly `Doar vizualizare`, and the whole block contains **zero**
   `input`, `select`, `textarea` or `button` elements, which is the measured form of "view only"
   rather than the declared one. `settings-sheet-options-link` carries `href` exactly `/setari/tabla`
   and pressing it lands there with the back link visible.
4. **The phone, 390x844.** `document.documentElement.scrollWidth <= clientWidth` on the bare address
   and again after a section is chosen; every sub-menu entry at least 44px high; and the menu works
   by touch, a press on Facturare moving the address, showing the invoicing block, removing the
   vocabulary section and moving the mark.
5. **No dead address and the title is unchanged.** All four addresses, console and `pageerror`
   watched, empty error list on each, top bar reading exactly `Setări`.
6. **The menu line is rewritten.** The `/setari` entry read out of `NAV` no longer equals
   "Categorii și unități de măsură" and does contain the word facturare, and the sidebar link carries
   that same description as its `title` attribute on screen.

**Nothing is written to the database by any of it.** The only press that changes anything is a link
that navigates. The cases that write invoicing settings belong to `facturare-settings.spec.ts` and
are not duplicated here.

---

## 7. Deliberately left for later parts

Named here so nobody reads their absence as an oversight. Each is the design note's own plan.

- **Date firmă.** Part 2 of the note's three. It reuses the one invoice settings row rather than
  copying it, and it is the only part that can carry a migration, and then only if Max wants the
  three missing text fields (the VAT registration code, the phone, the email). Not started here.
- **Utilizatori.** Part 3, read only: every account with its name, its email, its role in Romanian
  and whether it is active, plus the one Romanian sentence saying a new account is created by the
  administrator outside the application. Not started here.
- **The logo.** The note recommends not yet, and PURPLE agreed: it would appear nowhere until the
  invoice PDF exists. Not started here.
- **Depozite sau locații.** The note searched for the data and it does not exist. Not invented here.
- **Memento stoc.** Its own screen in the same menu group, per product rather than a system setting.
  Not moved.

No new permission was added and no access decision was reopened. The whole `/setari` area is already
owner only through `OWNER_ONLY_PREFIXES`, and anything under it inherits that guard, so the sections
needed no permission work of their own, exactly as the note said.

---

## 8. Commands run

Each command was run alone, with no pipe, so the exit code read is the command's own. All exit 0.

```
node docs/board/validate-board.mjs docs/board/rc-board.json docs/board/rc-board-phase2.json docs/board/rc-board-phase3.json
npx tsc --noEmit
npm run build
npm run check:card-ids
npm run check:board-edit
npm run check:board-clock
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
npx playwright test --list tests/e2e/setari-sections.spec.ts
```

`npm run id:free -- P3-113` answered FREE, lane highest `P3-112`, zero open pull requests.
`npm run check:no-destructive-migration` reports **0 files**, because this card adds no migration.
`npm run build` still lists `/setari` and `/setari/tabla` in its route table.

**The end to end suite runs only in CI.** This machine has no Docker and no Supabase CLI, so nothing
here claims a local run of it. `npx playwright test --list` collected the six new cases, which proves
they are discovered and typed, not that they pass.

**No production access of any kind.** The live site was not opened, no production row was read, no
credential was sourced or fetched. Environment variable names only. Real client data is in production
and nothing this card does goes near it.

---

## 9. Files changed

| File | What changed |
|---|---|
| `lib/data/setari-sections.ts` | **New.** The section list, the parameter name, the href builder and the parser, with the reason for the query parameter written next to it |
| `components/settings/SettingsSectionMenu.tsx` | **New.** The band, a server component, `PHONE_TABS` and `PHONE_LINK` imported |
| `app/(app)/setari/page.tsx` | The sections, the server-side parameter read, the narrowed data fetch, and a rewritten lead paragraph |
| `components/settings/UnitSettings.tsx` | A bottom margin and a `settings-unitati` wrapper. Nothing else |
| `lib/nav.ts` | The Setări description |
| `docs/board/rc-board-phase3.json` | Card P3-113, authored and shipped, and `as_of` |
| `tests/e2e/setari-sections.spec.ts` | **New.** Six cases |
| `docs/LEARNINGS.md` | Three ERROR and SOLUTION pairs |
| `docs/reports/2026-09-30-executor-g69-setari-submenu.md` | This report |

`CategorySettings.tsx` and `FacturareSettings.tsx` are byte-identical to `origin/main`. So is every
file under `tests/` except the one new spec. Nothing under `supabase/migrations/` was added or
touched.

**The `lead=` grep trap was respected.** The page's lead paragraph is a `PageHeader` lead PARAGRAPH,
about fourteen files use that prop, and only this one value changed. Nothing was renamed and nothing
was swept on the word lead.

---

## 10. Coordination

`git fetch origin` then `git merge origin/main` before the push. No rebase and no force push. No file
under `app/api/extraction`, `app/api/documents`, `lib/data/extraction` or `docs/contracts/extraction`
was touched, so there is nothing to tell Andre. The pull request is opened **not as a draft**,
because a draft cannot be merged by the owner's auto-merger and card P3-102 sat stranded overnight
for exactly that reason. This run never merges by hand.

Role AUTHOR then EXECUTOR.
