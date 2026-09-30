# Utilizatori in Setări: the accounts, shown and not touched

**Role AUTHOR, then EXECUTOR, in one run and one pull request. 2026-09-30. Goal G69 part 3 of three.
Card P3-114. No migration.**

The specification is `docs/reports/2026-09-30-author-setari-design.md`, section 4 Part 3, which
merged as pull request #378. This card builds into the shape card P3-113 actually shipped, pull
request #379, and not into the shape the note originally proposed. Everything below was read against
`origin/main` at `3b16964`.

---

## 1. What a person sees now

Setări has a fifth section in the sub-menu, labelled **Utilizatori**, last in the row. It is at its
own address, `/setari?sectiune=utilizatori`, and it is also on the bare `/setari` address under
"Toate setările" beside the four blocks that were already there.

The section is a table with four columns and a chip that says what it is:

| Column | What it holds |
|---|---|
| **Nume** | The person's name, or their email when the row has no name, or `Fără nume` |
| **Email** | The email address on the account |
| **Rol** | `Administrator` or `Operator` |
| **Stare** | A chip reading `Activ` or `Inactiv` |

Above the table, one sentence in Romanian:

> Un cont nou este creat de administrator în afara aplicației, odată cu datele de autentificare. Din
> acest ecran conturile se citesc, nu se modifică.

The card header carries the count through `plural`, so it reads "2 conturi în sistem" and would read
"21 de conturi în sistem" past nineteen, and a chip reading **Doar vizualizare**.

---

## 2. Which Romanian words were reused, and where they came from

**This is the part the task asked to be named explicitly, so it is named first.**

| On screen | Where the word came from | Why it was not chosen freshly |
|---|---|---|
| **Administrator** for `owner` | `ROLE_LABEL` in `lib/supabase/types.ts:11` | `components/layout/Topbar.tsx:40` has printed it on every screen since P2-02, and `tests/e2e/auth.spec.ts` asserts the top bar reads it |
| **Operator** for `account_manager` | `ROLE_LABEL` in `lib/supabase/types.ts:12` | Same map, same top bar. `tests/e2e/auth.spec.ts` asserts an account manager sees `Operator` |
| **Activ** and **Inactiv** | `components/clients/ClientsScreen.tsx:804-806` | The client list already shows this exact fact with this exact chip and these exact two tones, `ok` and `neutral` |
| **Doar vizualizare** | `components/settings/UnitSettings.tsx:54` | The units block on the same screen already carries it for the same meaning |
| **The name rule** | `ownerDisplayName` in `lib/data/clients.ts:300` | Full name, else email, else `Fără nume`. It is exported precisely because the client sheet, the assignee list and the note authors all read it |

The task warned that "the existing screens already call an account manager an operator in Romanian:
read what the app calls them today and match it, rather than coining a third word for the same
person." That is what happened: **`ROLE_LABEL` is imported, not copied and not re-invented.** The
section therefore cannot drift from the top bar, because there is one map.

**The stored value stays the English token.** `role` in the database is still `owner` or
`account_manager`, the `app_role` enum from migration 0001. The Romanian lives in the presentation
layer beside the other label maps, which is rule P2-01: an enum value is not interface text. The
acceptance measures this on the Rol cell rather than on the whole block, for a reason recorded in
`docs/LEARNINGS.md`: the block prints the test accounts' email addresses, and a negative text match
over the whole block could be defeated by an email that happens to contain the English word.

---

## 3. Nothing on this section can write, and it is measured rather than declared

The design note sent the role switch and the on and off control to a **fourth part**, with its own
reason: "a screen that can switch an account off deserves its own proof." Creating an account it
skipped entirely. So this card has **no write path anywhere**:

- **`lib/data/utilizatori.ts` has exactly one exported function and it is a read.** There is no
  action, no mutation, no `revalidate`.
- **The section renders zero controls.** The acceptance asserts
  `block.locator("input, select, textarea, button")` has count **0** and `block.locator("form")` has
  count **0**. That single measurement covers all three of the things the note deferred, because each
  of them would be one of those elements. It is the same measured form the units block already uses.
- **None of the words `Salvează`, `Adaugă`, `Dezactivează`, `Activează`, `Șterge` appears** in the
  block.

**No disabled button was built for "add an account" either.** The note's own reasoning, and this
repository's twice-applied answer: a control that can never succeed is worse than no control. That
is why categories have no delete (the foreign key is `on delete restrict`) and why units have no add
(the set is fixed by the `unit_code` enum). **The sentence is the answer.** The note says why it
works, and it is worth quoting because it is the whole justification for spending a line of screen on
it: "a screen that explains its own limit does not generate a support question."

Creating an account was skipped with its reasons intact: nothing in RC creates accounts today, there
is no signup page on purpose, the `profiles` table comment says accounts are made by hand in the
dashboard alongside the sign in, and the operation would run through the privileged service key.
**That key was not used, not sought and not referenced.** There is none on this machine, none may be
fetched, and none is needed for this card.

---

## 4. Why this needed no new access, verified rather than assumed

Read in `supabase/migrations/0001_phase2_schema.sql`:

- **`profiles`** (line 92) carries `id`, `email`, `full_name`, `role`, `active`, `created_at`,
  `updated_at`. Every one of the four facts on screen was already there.
- **`app_role`** has exactly two values. There is no third role to label.
- **`profiles_select`** (line 445) is `for select to authenticated using (id = auth.uid() or
  public.is_owner())`. The owner already sees every row.
- **`/setari` is already owner only**, refused for `account_manager` in `proxy.ts`, and anything under
  that path inherits the guard because the rule matches on the start of the address.

So the complete list reaches exactly the person who is already allowed to open the screen, **with
nothing added**. The system already depends on this read: `listClientOwnerChoices` in
`lib/data/clients.ts:284` reads the same table for the list of people a lead can be assigned to.

**No policy was added, no probe for one was added, no migration was written.**
`git diff --name-only origin/main...HEAD` lists no path under `supabase/migrations/` and no `.sql`
file at all. A grep over the diff for `create policy`, `service_role`, `serviceRole` and
`SUPABASE_SERVICE` returns nothing.

**The read reuses the existing pattern rather than inventing a second one.**
`lib/data/utilizatori.ts` calls the same `createClient` from `lib/supabase/server.ts` and the same
`from("profiles").select(...)` that `lib/data/clients.ts` already uses, and imports
`ownerDisplayName` from it rather than writing a second name rule. **The one difference is deliberate
and is recorded in the file:** the assignee list filters `.eq("active", true)`, and this section must
not, because a switched-off account is precisely the thing it exists to show.

---

## 5. The one existing file that changed, and why it was not a choice

**The eighteen spec files that touched this screen before P3-113 are byte-identical to `main`.**
`git diff --name-only origin/main...HEAD -- tests/` lists exactly two paths:
`tests/e2e/setari-utilizatori.spec.ts`, which is new, and `tests/e2e/setari-sections.spec.ts`, which
is **P3-113's own acceptance spec from this same goal**, the nineteenth file to open this screen
rather than one of the eighteen the design note counted.

Two lines changed in it, and neither was a preference.

**First, the compiler demanded it.** `SECTION_MARKER` is typed
`Record<Exclude<SettingsSectionId, "toate">, string>`. Adding a fifth section made
`npx tsc --noEmit` fail:

```
tests/e2e/setari-sections.spec.ts(42,7): error TS2741: Property 'utilizatori' is missing in type
'{ catalog: string; facturare: string; optiuni: string; }' but required in type
'Record<"catalog" | "facturare" | "optiuni" | "utilizatori", string>'.
```

`tsconfig.json` includes `**/*.ts` with only `node_modules` excluded, so **`tests/` is part of the
type check and this is a build failure, not a test opinion.** That is the same property card P3-33
recorded about `UNIT_MEANING` and called a property rather than a nuisance: the type refuses to
compile until somebody says how the new member is recognised. Naming the fifth marker makes that
file's case (2) measure **more** than before, because it now also proves `settings-utilizatori` is
absent from `catalog`, `facturare` and `optiuni`.

**Second, a hand-written copy of a value the constant already carries.** Case (5) read
`expect(addresses.length).toBe(4)`. The same file already reads that number from
`SETTINGS_SECTIONS.length` in two other places. It now reads it there too, so the case sweeps **every
address the screen has** for console errors rather than the first four.

**Neither edit deletes a test, skips a case, loosens a threshold or adds an escape.** Both add a
fact. The alternative was to leave Utilizatori out of the sub-menu, which would not have been the
section Part 3 asked for. This is written into the card's `defaults (h)`, its `notes`, the commit
message and the pull request body rather than left for a reader to find.

**One thing was noticed in that file and deliberately not touched:** the failure message on line 152
still reads "sub-meniul nu are patru intrari" while the count is now five. It is a string that only
prints on failure, and editing it would have made the claim "two lines" false for no gain.

---

## 6. What was deliberately not built, and on whose reasoning

| Not built | Whose decision, and why |
|---|---|
| Changing a role | The note's Part 3: a fourth part, "because a screen that can switch an account off deserves its own proof" |
| Switching an account on or off | Same. Both are already permitted to the owner at the database level, so both are buildable; neither is in this card |
| Creating an account | The note's question 2, recommended default **no**: no signup page exists on purpose, nothing in RC creates accounts, and it needs the privileged service key |
| A disabled "add account" button | This card. A control that can never succeed is worse than none; the sentence is the answer |
| `created_at` as a fifth column | This card. The note's section 3 observes the column exists; **Part 3, which is the specification, does not ask for it.** One line of work whenever somebody wants it |
| A new sort order (owners first, inactive last) | This card. The assignee list's order is name under Romanian collation, and role and state are on every row anyway |
| Touching the left menu's description | This card. It reads "Categorii, unități, facturare și opțiuni de produs" and describes what the administrator can **change**. Utilizatori changes nothing, so no sentence became false. Recorded so the next reader knows it was considered, not missed |

---

## 7. STILL AHEAD, and the task asked for this in writing

- **Date firmă.** The design note's section 4 Part 2. It is **the only part of goal G69 that can
  carry a migration**, and it does so only if Max wants any of the three missing company fields: the
  **VAT registration code**, the **phone** and the **email**. Five of the nine fields he listed are
  already on screen and already saved, in the Facturare block. **This part waits on Max deciding
  whether he wants those three extra fields**, which is question 4 of the note. If he wants none of
  them, that part carries no migration at all and is simply a second view of fields that exist.
- **The logo.** The note's question 1, recommended default **not yet**: it would appear nowhere
  today, because the invoice PDF that is the only document that would carry it is not built. Revisit
  it in the same piece of work that puts it on a page.
- **A fourth part, only if Max asks for it:** the role switch and the on and off control for an
  existing account. Both already permitted to the owner at the database level.

**Depozite sau locații stays refused**, on the note's own search: RC is one warehouse, that decision
is recorded in the code in two places, and an empty settings page with a heading would be worse than
no page.

---

## 8. The phone, and the rest of the screen

- Each account becomes a **card** below 768px through `PHONE_TABLE`, `PHONE_ROW`, `PHONE_CELL` and
  `PHONE_WIDE`, **imported from `components/ui/phone.ts` and never written locally**. Card P3-100
  swept eleven files into that one file and this card does not reopen it:
  `grep -rn "^const PHONE_" components/ app/` returns only the two pre-existing lines in
  `components/projects/DevizPanel.tsx`, which this card did not touch.
- The **email takes the full card width and wraps** rather than being cut, because an email is the
  longest string on the row.
- **Above 768px nothing changes**, because every one of those classes carries `max-md`.
- The acceptance measures `document.documentElement.scrollWidth <= clientWidth` at 390x844 on the
  section's own address **and** on the bare address, and that every sub-menu entry, the fifth
  included, is at least 44px tall.
- **`/setari` still does not redirect** and `category-name` and `category-add` are still on the bare
  address **without a click**, which is how ten test files give themselves a category before creating
  a product. The acceptance asserts both.
- **The account manager still gets exactly today's refusal.** `tests/e2e/auth.spec.ts` already
  asserts it; this card asserts it again in its own spec, deliberately, because it adds a read of the
  accounts table to this screen and therefore owes its own proof that it opened nothing to anybody.
  The refusal is a rewrite and not a redirect, so the address stays `/setari` and there is no loop.

---

## 9. No real person in a fixture

**Accounts are people, and this was treated as the constraint it is.**

- The spec reads the suite's account emails out of `TEST_OWNER_EMAIL` and `TEST_MANAGER_EMAIL`
  through `tests/e2e/support/accounts.ts`. **It carries no literal email address and no invented
  name.**
- **No email appears** in this report, in the board card, in any commit message or in the pull
  request body.
- The third provisioned account, `noProfileAccount`, has a valid sign in and **no row in
  `profiles`** by design (CRIT-17). It is therefore deliberately not asserted to be in the list:
  requiring it would have been a false statement about the table.
- **The live site was never opened and no production row was read.** REAL CLIENT DATA IS IN
  PRODUCTION. Everything is proved in CI.

---

## 10. What was run, and what could not be

Each command run alone, with no pipe, so the exit code is the command's own (CLAUDE.md section 6).

**Green locally, exit 0 every one:** `npx tsc --noEmit`; `npm run build`, whose route list still
carries `/setari` and `/setari/tabla`; `node docs/board/validate-board.mjs` on all three boards,
before every commit; `check:card-ids`; `check:board-edit`; `check:unique-ids`;
`check:open-branch-ids`; `check:no-destructive-migration`; `check:conflict-residue`;
`check:categories`; `check:ledger-rows`; `check:no-prod-target`; `check:pending-schema-reads`;
`check:removal-safety`; `check:assertion-register`; `check:board-clock`. `npx playwright test
tests/e2e/setari-utilizatori.spec.ts --list` collected five cases.

**`check:board-clock` failed once and the failure is in `docs/LEARNINGS.md`:** the card's
`last_checkpoint` and `evidence.at` had been written a few minutes ahead of the clock, and that check
reads the commit that wrote the board as its basis. Corrected by moving both behind the commit and
amending.

**Could not run here, and this is not a skip:** the end to end suite. **This machine has no Docker
and no Supabase CLI**, so every Playwright case runs only in CI, and nothing above claims otherwise.

**No production access of any kind.** No credential was sourced, no live URL opened, no production
row read. Environment variable **names** only.

**Orange coordination:** `git fetch origin` then `git merge origin/main` before every push, never a
rebase and never a force push. **No file under `app/api/extraction/`, `app/api/documents/`,
`lib/data/extraction*` or `docs/contracts/extraction*` was touched**, so there is nothing to tell
Andre.

**The pull request is NOT a draft.** The owner's auto-merger cannot merge a draft, and card P3-102
sat stranded overnight for exactly that reason. This run does not merge by hand.

---

## Summary for Max, in plain words

Settings now has a **Utilizatori** section. It lists every account the system has: the person's name,
their email, whether they are an **Administrator** or an **Operator**, and whether the account is
switched on. Those two Romanian words are the ones your system already uses in the top bar; nothing
new was invented to name the same people twice.

**It is a list to read and nothing else.** You cannot change somebody's role from it, you cannot
switch an account off, and you cannot create one. That is on purpose: a screen that can switch
somebody's access off should be built and proved on its own, not slipped into a settings page. The
section says in one plain sentence that a new account is set up by the administrator outside the
application, together with the sign in details, so nobody hunts for a button that is not there.

**Nothing was added to the database and nobody gained access to anything.** The information was
already there and you could already see it; it simply had no screen. There is no migration in this
pull request, so merging it changes nothing in the live database.

**Two things are still ahead on this goal.** **Date firmă** is the next part and it waits on you:
five of the nine company fields you listed are already on screen and saved, and three are missing,
the VAT registration code, the phone and the email. If you want them, that part carries one small
database change and you are told before it merges. If you want none of them, it carries none. **The
logo** waits until there is an invoice document to print it on, which is not built yet.

Role AUTHOR, then EXECUTOR.
