# CRITIC: bug sweep of every screen shipped since 2026-09-14

Card: none. Goal G47, queue task `066-g47-critic-bug-sweep.md`.
Written 2026-09-22 by the CRITIC terminal on Max's machine.
Branch `card/critic-bug-sweep`, cut from `origin/main` at 8274b0a (PR #349, P3-91).

No application code, no migration and no board card changed in this pull request.
This is the report. POC queues the fixes afterwards, by severity.

---

## 0. What could and could not be driven, and what that means for every finding below

**The local stack does NOT reach a database on this machine. No screen could be driven by
hand. Production was never opened and no production row was ever read.**

What was checked, in order, before taking that decision:

1. **Environment files.** `find` over `/Users/sm33xy/Projects/rc-inventory` and every worktree
   under `/Users/sm33xy/Projects/rc-inventory-worktrees` found exactly one `.env*` file:
   `rc-inventory-worktrees/lb1-p3-54-favicon/.env.local`. Its own first three lines say what it
   is: *"P3-54 local proof only. Gitignored. Placeholder values, no credential: points at a
   local Supabase address that does not run on this machine, so no database is reached and the
   production guard cannot match it."* It carries two names only,
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the URL is a
   `http://127.0.0.1` address. There is no credential on this machine, and none was fetched.
2. **Docker and the Supabase CLI.** `which docker supabase` reports both "not found". This
   matches `KNOWN-FAILURES.md` line 41 and the project `CLAUDE.md`: the end to end suite and
   the applier proofs run only in CI.
3. **`npm run dev` was tried anyway**, with that placeholder file copied into this worktree.
   The server starts (Next.js 16.3.1, ready in 421 ms, no compile error), which is real
   evidence that every route compiles. But every route answers with the same 14,518 byte
   page, and its visible text is: *"Autentificare - Rapid Construct ... Introdu datele
   contului pentru a intra în sistemul de inventar."* `/`, `/azi`, `/clienti`,
   `/incarca-comanda` and `/inventar` all return the login screen, because the session cannot
   be established against a Supabase that is not there. **No application screen renders.**

**So the pivot in the task brief applies, and this is what the evidence below actually is:**

- Every finding marked **read** is a code read: the component, its server action, its data
  function and, where it matters, the migration that owns the column. Each one names
  `file:lines` so any reader can check the same lines. This is weaker than clicking the
  screen, and it is stated plainly on every finding.
- The shipped `tests/e2e/*.spec.ts` files were read as evidence of what is and is not
  covered. Three findings below (F15, F16, F17) are coverage gaps found that way.
- Nothing was driven at 1280 px or at 390 px. Phone findings are read from the `max-md:`
  classes in `components/ui/phone.ts` and the components that use them, not from a rendered
  page, and are marked "(phone, read only)".
- No screen was blocked badly enough to need its own mailbox question. The sweep covers all
  seven groups.

### The board

No board card was authored for this review. The precedent is the previous CRITIC pass,
PR #281 (G5), which changed exactly two files: `docs/LEARNINGS.md` and its report under
`docs/reports/`, and carried no card. `scripts/poc-free/check-board-edit.mjs` exempts any path
under `docs/` or `decisions/` (its `test: (p) => p.startsWith("docs/") || p.startsWith("decisions/")`),
so a board edit is neither required nor appropriate here. The same two paths are what
`.github/workflows/quality.yml` calls `docs_only`, so this pull request takes the P3-73
documentation fast path.

---

## Findings

Severity is one of **breaks work**, **wrong**, **cosmetic**, and is argued on each finding
rather than asserted.

---

### B1. Azi writes the stage name "De reluat" into the "Următorul pas" column

**Confirmed, and the one line summary is exactly right.**

- **Screen:** `/azi`, the "De sunat" table, column "Următorul pas".
- **Read:** `components/clients/AziScreen.tsx:156-164`, against
  `lib/data/clients-types.ts:34` and `lib/data/azi.ts:86-109`.
- **What happens:** the cell is
  `{r.nextAction ?? (r.dueFrom === "follow_up" ? "De reluat" : "-")}`.
  `dueFrom` is set to `"follow_up"` in `lib/data/azi.ts:93-95` for exactly the rows that reached
  the list with no `next_action_at`, purely on the De reluat stage plus a `follow_up_date` that
  is today or earlier. So a lead on which nobody ever typed a next step renders the literal
  string `De reluat` in the next-step column. That string is not a sentence somebody wrote: it is
  the stage label, `CLIENT_STAGE_LABEL.follow_up = "De reluat"` at
  `lib/data/clients-types.ts:34`. The same row already shows that stage everywhere else it
  appears, and the detail page shows it again under "Etapă".
- **What should happen:** the column should either be a dash, like the `next_action` branch just
  beside it, or a phrase that reads as an instruction rather than a state ("De sunat, fără pas
  scris" or similar). What it must not do is put a stage name in a column whose header promises
  a next step, because the operator then cannot tell a lead with a written step from one without.
- **Severity:** cosmetic. It misleads, it does not lose or corrupt anything, and every row it
  affects is on the list for the right reason.
- **File:** `components/clients/AziScreen.tsx:162`.

### B2. The notes box is at the bottom of the lead page, inside the last tab, not at the top

**Confirmed. The one line summary is right, and the goal it misses is quotable.**

- **Screen:** `/clienti/<id>`, the "Note" tab.
- **Read:** `components/clients/ClientTabs.tsx:52-58` and `:106-125`,
  `components/clients/ClientDetailScreen.tsx:158-269`,
  `components/clients/ClientNotesPanel.tsx:60-75`.
- **What happens:** `ClientDetailScreen` renders the whole "Date de identificare" card first,
  sixteen label and value rows plus the header and the Dezactivează button
  (`ClientDetailScreen.tsx:158-255`), and only then, in a `div` with `mt-5`, the tab strip
  (`:257-269`). `TABS` lists Note fifth and last (`ClientTabs.tsx:52-58`), and the default tab
  when no `?fila=` is present is `contacte` (`ClientTabs.tsx:95`). So reaching the box to write
  what was discussed costs one scroll past the identification card and one click on the fifth
  tab. Inside the tab the layout is right: `ClientNotesPanel` puts the form above the history
  (`:67-85`), which is what its own header comment promises.
- **What the goal asked for:** GOALS.md G45, quoted: *"On the lead and client page: a text box at
  the top ("Ce s-a discutat"), a "Salvează" button, and the list of notes below."* "At the top"
  plainly means the top of the page. What shipped is the top of a tab that is itself at the
  bottom.
- **Severity:** cosmetic. Nothing is wrong, nothing is lost, and the Azi screen gives the same
  form a one click route for the common case (`AziScreen.tsx:197-216`). The cost is that logging
  a call from the lead's own page, which is the other common case, takes three actions instead
  of one.
- **File:** `components/clients/ClientDetailScreen.tsx:257-269` and
  `components/clients/ClientTabs.tsx:52-58`.

---

### F3. Leaving "De reluat" clears the follow up date but leaves the next step date behind, so the lead comes back on Azi, overdue and in red

This is the sweep's most consequential finding, because it silently undoes the owner's own
decision of 2026-09-22 on two screens out of three.

- **Screens:** `/clienti?vedere=leaduri`, the lead's own page, and `/azi`.
- **Read:** `components/clients/ClientForm.tsx:112-128`,
  `lib/data/client-actions.ts:199-217`, `supabase/migrations/0057_lead_follow_up_date_cleared.sql:143-147`
  and `:227`, `supabase/migrations/0058_client_next_action.sql:148`, `lib/data/azi.ts:91-105`.
- **The path, step by step:**
  1. A lead is created at De reluat with a date, from the Lead nou form. `validateNextAction`
     has no `nextActionAt` from the form, so it takes its second branch
     (`client-actions.ts:210-212`) and writes that same date into `next_action_at` as well. This
     is the deliberate "setting one sets both" rule of P3-89, stated at
     `client-actions.ts:190-194`.
  2. Time passes; the date is now in the past. The lead shows "Întârziat" on the Leaduri list
     and appears on Azi. Both correct.
  3. The owner opens Modifică and moves the lead to În cultivare or Ofertat. At any stage other
     than follow_up the form hides the date box and sends `followUpDate: ""`
     (`ClientForm.tsx:112-114`), which is exactly the signal 0057 was written to read: the stored
     `follow_up_date` is set to null (`0057:145-147`). That half works.
  4. `next_action_at` is not sent, because the form only sends it when it differs from what was
     loaded (`ClientForm.tsx:123-127`) and the loaded value is that same old date. Nothing else
     clears it: 0057 does not touch `next_action_at`, and 0058 never clears it on a stage move.
- **What the operator then sees:**
  - On `/clienti?vedere=leaduri` the "Data de reluare" cell is now a dash and there is no
    "Întârziat" chip, because `overdue` in both list functions is `stage = 'follow_up' and
    follow_up_date < today` (`0057:227`, `0058:148`). Correct, and exactly what P3-88 promised.
  - On the same row the "Următorul pas" cell now prints that same old date with no text beside
    it (`ClientsScreen.tsx:446-451`), which reads as a next step nobody ever wrote.
  - On `/azi` the lead is back. `getAziList` takes `next_action_at` first
    (`lib/data/azi.ts:91-92`), finds it is in the past, and sets `overdue: true`
    (`:105`). The row is drawn in red with the "Întârziat" chip
    (`AziScreen.tsx:137`, `:175-179`) and its next step column shows "-", because
    `nextAction` is null and `dueFrom` is `next_action`, not `follow_up`.
- **What should happen:** the two dates should agree about what leaving De reluat means. Either
  the stage move clears `next_action_at` in the same call when it was only ever a mirror of the
  follow up date, or the form sends the cleared value, or the Azi screen applies the same
  "only at De reluat" rule the two list functions apply. This report does not choose between
  them; that is the fix card's decision.
- **Why it is not simply the intended behaviour:** the quoted reason for 0057, at
  `0057:17-18`, is the owner's own sentence: *"when you move a lead from De reluat to În
  cultivare or Ofertat, the date is not cleared and it says it is late."* After the fix, the
  date is cleared in one column and still says it is late on a screen built three cards later.
- **Severity:** wrong. Nothing is destroyed and the lead is recoverable ("Am sunat" on Azi sends
  an explicit empty step, `ClientNoteForm.tsx:59-61`, which does clear it), but the day's call
  list shows leads as overdue that the owner has explicitly decided are not.
- **Files:** `lib/data/azi.ts:91-105`, `components/clients/ClientForm.tsx:123-127`,
  `lib/data/client-actions.ts:210-212`.
- **Why no test caught it:** see F16.

### F4. A date field that is showing "Data nu este validă" does not block Salvează, and saving erases the stored date

- **Screens:** every form that carries a date. `Modifică` on a client or lead, `Lead nou`,
  `Proiect nou` and `Modifică` on a project, the manual intake form on `/adauga-manual`, the
  extraction review sheet on `/incarca-comanda`, and the note form's "Data următorului pas".
- **Read:** `components/ui/DateField.tsx:133-138` and `:151-153`,
  `components/clients/ClientForm.tsx:123-144`,
  `components/orders/InboundOrderForm.tsx:150-180`.
- **What happens:** `DateField.commit` parses on every keystroke and calls
  `onChange(iso ?? "")` (`DateField.tsx:137`). A partial or impossible date parses to null, so
  the parent's state becomes the empty string while the field itself shows the red
  `DATE_INVALID_MESSAGE` (`:210-218`). The invalid state is entirely local to `DateField`: no
  parent form is told, no submit button consults it. `ClientForm`'s Salvează is
  `disabled={pending}` and nothing more (`ClientForm.tsx:391`); `InboundOrderForm`'s
  `problems` list checks only that `expectedAt` is non-empty (`:145`).
- **The failure:** a lead at Ofertat has a next step on 01.10.2026. The owner opens Modifică,
  edits that date, mistypes one digit, sees the red line, and presses Salvează anyway, or does
  not notice the red line at all because it is below the fold of a 520px sheet. The form sends
  `nextActionAt: ""` (it now differs from the loaded value, so the guard at
  `ClientForm.tsx:123-127` lets it through), `validateNextAction` writes
  `next_action_at = null` (`client-actions.ts:209`), and the save reports success. The date the
  owner was trying to correct is gone, with no message about it.
- At De reluat the same mistake is caught, because the empty follow up date trips
  `FOLLOW_UP_DATE_REQUIRED` (`client-actions.ts:141-142`). Every other date field on every
  other form has no such backstop.
- **What should happen:** either the parent forms must refuse to submit while any date field is
  invalid, or `DateField` must distinguish "cleared on purpose" from "not a date yet" instead of
  reporting both as the empty string.
- **Severity:** wrong. It is a silent loss of a value somebody typed, which is the category the
  repo's own doctrine treats most seriously.
- **File:** `components/ui/DateField.tsx:133-138`, and every caller listed above.

### F5. "Retrimite" on the review queue throws away every refusal the action returns

- **Screen:** `/incarca-comanda`, the "Citire automată din document" list, the "Retrimite" button
  on a failed or partial document.
- **Read:** `components/orders/ExtractionReviewPanel.tsx:802-807`, against
  `lib/data/extraction-actions.ts:157-241`.
- **What happens:** the handler is four lines and discards the result:

  ```
  async function onRefire(orderId: string) {
    setRefiring(orderId);
    await refireExtraction(orderId);
    setRefiring(null);
    router.refresh();
  }
  ```

  `refireExtraction` returns a real `ActionResult` with five distinct Romanian refusals:
  "Sesiune expirată. Autentifică-te din nou." (`:159`), "Documentul nu mai există." (`:183`),
  "Ciorna a fost deja confirmată." (`:187`), `CANCELLED_REFUSAL` (`:191`), and the fire failure
  `fired.reason` (`:237`). None of them reaches the screen. The button simply goes back to
  saying "Retrimite".
- **Partially mitigated, and it matters where:** the fire failure path does write `status`,
  `error_code` and `reason` onto the draft row before returning (`:228-236`), so the refreshed
  card shows a new reason line. The four refusals that return *before* any write, which includes
  the realistic one of an expired session in a tab left open overnight, change nothing at all on
  screen. The operator presses the button, nothing happens, and presses it again.
- **Why this is worth a card:** this is the exact shape of Ivan's finding F21, which P3-85
  (PR #343) fixed for the upload path, where a fire that cannot start now says so at once in a
  red box (`ExtractionReviewPanel.tsx:788-796`, `OrderDocumentUpload.tsx:64-75`). The resend
  path beside it was left silent.
- **What should happen:** `onRefire` should keep the result and render the message in the same
  red box the upload path already uses.
- **Severity:** wrong, and close to breaks work for the expired session case, where the operator
  has no way to learn why the button does nothing.
- **File:** `components/orders/ExtractionReviewPanel.tsx:802-807`.

### F6. "Șterge filtrele" on the Leaduri view also leaves the Leaduri view

- **Screen:** `/clienti?vedere=leaduri`, the filters row.
- **Read:** `components/clients/ClientsScreen.tsx:133-134`, `:316-325`, `:202-235`.
- **What happens:** `filtered` is computed from the search text, the type, the status and the
  stage, and deliberately not from the view (`:133-134`), so on the Leaduri view the button
  appears as soon as a stage chip or the search box is used. Its handler is
  `router.push(pathname)` (`:319`), which drops every query parameter, `vedere` included. The
  operator, who asked to clear a stage chip, lands on the "Toți" view: the header changes from
  "Leaduri" to "Clienți", the subtitle changes, the primary button changes from Lead nou to
  Client nou, and the table changes from six columns to five.
- **What should happen:** the button should clear what it says it clears and keep the view, which
  is one line: push `pathname` plus the surviving `vedere`, the same way the stage chips already
  preserve it at `:257`.
- **Severity:** wrong. Nothing is lost, but the screen moves somewhere the operator did not ask
  to go, on a control whose whole promise is that it is safe.
- **File:** `components/clients/ClientsScreen.tsx:319`.

### F7. Browser Back leaves the Clienți search box showing a term the list is not filtered by

- **Screen:** `/clienti` and both of its views.
- **Read:** `components/clients/ClientsScreen.tsx:111`, `:117-122`, `:133-134`, and
  `app/(app)/clienti/page.tsx:58-72`.
- **What happens:** the search box is local state seeded once from the query
  (`useState(query.q)`, `:111`) and pushed to the URL on a 300 ms debounce whose dependency list
  is `[q]` only (`:117-122`). The page is a server component that re-renders with new props on
  navigation, but the client component instance is never remounted: `page.tsx` renders
  `<ClientsScreen ...>` with no `key` (`page.tsx:59`). So after the operator types "Ionescu",
  waits for the list to filter, and presses browser Back, `query.q` returns to the empty string
  and the list shows every client again, while the box still reads "Ionescu". `filtered` is
  computed from `query`, not from `q`, so "Șterge filtrele" disappears at the same moment, and
  there is no visible control that explains the mismatch.
- **What should happen:** the box should follow the URL, which is the rule this screen's own
  header comment sets out at `:10-12`: *"FIECARE FILTRU ESTE IN URL ... si butonul de inapoi o
  reface intocmai."* Back does not remake it.
- **Severity:** wrong, mild. No data is affected; the operator sees a list that disagrees with
  the box above it.
- **Note on scope:** the debounce pattern predates this review window (it is P3-06 work), but the
  Leaduri and Clienți views that inherit it are inside it, and the screen's own stated rule is
  the thing being broken.
- **File:** `components/clients/ClientsScreen.tsx:111` and `:117-122`.

### F8. A manual intake position with a product but no quantity is dropped at save, without a word

- **Screens:** `/adauga-manual`, and the typed order path at the bottom of `/incarca-comanda`.
- **Read:** `components/orders/InboundOrderForm.tsx:142-153` and `:161-179`,
  `components/orders/ManualOrderScreen.tsx:45-46`.
- **What happens:** `filledLines` keeps only rows with both a product and a positive quantity
  (`:142`). The only complaint about positions is raised when *every* row fails that test
  (`:146`). So an operator who adds four positions, fills three and leaves the quantity of the
  fourth empty, presses "Confirmă comanda" and gets a success screen. The fourth position is
  gone. Nothing says so: the only trace is the count in the success line, "Introdusă manual, cu
  3 poziții" (`ManualOrderScreen.tsx:45-46`), which an operator has no reason to audit against a
  number they never counted.
- **What should happen:** a half filled position should either be named in the `problems` list
  ("Poziția 4 nu are cantitate") or be reported in the confirmation. Dropping it in silence is
  the one thing it should not do.
- **Severity:** wrong. This is a real order on real stock, and the loss is invisible at the moment
  it happens.
- **File:** `components/orders/InboundOrderForm.tsx:142-146`.

---

### F9. The extraction review sheet was never brought to the phone

- **Screen:** `/incarca-comanda`, the sheet that opens behind the "Verifică" button. (phone, read
  only)
- **Read:** `components/orders/ExtractionReviewPanel.tsx:409` (the header grid),
  `:485-489` (the line grid), `:511-557` (the hand rolled inputs), against
  `components/ui/phone.ts` and `components/ui/primitives.tsx:64-79`.
- **What happens:** the header block is `grid grid-cols-4 gap-3` with no `max-md:` variant, and
  it holds six controls; the per line block is `grid grid-cols-[1fr_1fr_110px_110px] gap-2.5`,
  also with no `max-md:` variant, so 220px of that row is fixed whatever the screen is. At
  390px the two flexible columns are left roughly 70px each before the gaps. Every input and
  select in this sheet is written by hand rather than through the `Input` and `Select`
  primitives, so none of them picks up the `max-md:min-h-11 max-md:text-base` treatment that
  P3-65 gave the primitives: they are `py-1.5 text-[13px]`, well under the 44px target and under
  the 16px at which iOS Safari stops zooming the page on focus. The file has seven `max-md:`
  classes in total (`:678`, `:679`, `:686`, `:689`, `:726`, `:941`), all of them on the cancel
  block and the card header, none on the review form itself.
- **Why this is a gap rather than a decision:** the four phone cards, P3-60, P3-64, P3-65 and
  P3-67, set out to make the app usable on a phone, and `tests/e2e/phone-remainder.spec.ts`
  names the nine screens P3-67 swept. `/incarca-comanda` is not among them, and neither
  `phone-forms.spec.ts` nor `phone-lists.spec.ts` opens it.
- **Severity:** wrong on a phone, no effect at 1280. The house rule is desktop first, so this is
  not "breaks work", but it is the screen an operator is most likely to be standing in a yard
  holding.
- **File:** `components/orders/ExtractionReviewPanel.tsx:409` and `:485-489`.

### F10. The product form has no phone treatment at all, and Memento's threshold link leads straight into it

- **Screens:** `/inventar`, "Adaugă produs" and "Modifică produsul"; reached also from
  `/memento` by tapping a threshold. (phone, read only)
- **Read:** `components/inventory/ProductForm.tsx` (zero occurrences of `max-md` in the whole
  656 line file, measured with `grep -c`), specifically the panel at `:334-337`, against
  `components/clients/ClientForm.tsx:152-153` which uses `PHONE_SHEET`.
- **What happens:** the side panel is `w-[520px] h-full` with no `max-md:w-full`, so on a 390px
  screen it is 130px wider than the viewport. The close button is `w-8 h-8` with no
  `PHONE_CLOSE`. None of the field rows carries `PHONE_STACK`. `ClientForm` and `LeaduriForm`,
  the two panels built on the same pattern, carry all three.
- **The concrete route in:** `app/(app)/memento/page.tsx:120` links a threshold to
  `/inventar?produs=<sku>&camp=prag`, and `InventoryScreen` reads that and opens this very form
  with the threshold focused (`components/inventory/InventoryScreen.tsx:100`, `:113`, `:414`).
  Memento itself was made phone ready by P3-67. The screen it hands off to was not.
- **Why it is a gap and not an oversight nobody declared:** P3-65's own pull request title says
  "ProductForm not included" (PR #314). P3-67, which shipped as "the remaining screens on a
  phone" (PR #320), changed nine files and `ProductForm.tsx` is not one of them. Three later
  cards edited this file, P3-57, P3-59 and P3-61 (PRs #305, #308, #312), and none added a phone
  class. So the exclusion was declared once and then never picked up.
- **Severity:** wrong on a phone, no effect at 1280.
- **File:** `components/inventory/ProductForm.tsx:334-337` and the whole form body.

### F11. The sheet options admin table is a seven column table with no phone form

- **Screen:** `/setari/tabla`. (phone, read only)
- **Read:** `components/settings/SheetOptionsSettings.tsx:300-310` and the `Td` cells at
  `:341-370`, against `components/ui/phone.ts:44-50`.
- **What happens:** the table has seven columns and none of its `Td` elements carries a
  `data-label`, and no ancestor carries `PHONE_TABLE`, which is the mechanism every other list in
  the app uses to become one card per row under 768px. The file's single `max-md:` class is on
  the add form's grid (`:158`). At 390px the rows will squash or the card will scroll sideways.
- **Severity:** cosmetic. It is an owner only administration screen for a list of 225 rows, used
  from a desk, and the desktop layout is correct.
- **File:** `components/settings/SheetOptionsSettings.tsx:300`.

---

### F12. Romanian counts lose the "de" form above nineteen on the CRM and order screens

- **Screens:** the Clienți and Leaduri list header, the Azi list header, the review queue cards,
  the Documente tab footer, and both order confirmation lines.
- **Read:** `lib/data/format.ts:41-48` (the helper that gets it right), against
  `components/clients/ClientsScreen.tsx:192-199`, `components/clients/AziScreen.tsx:81-86`,
  `components/orders/ExtractionReviewPanel.tsx:909-912`,
  `components/documents/DocumentsPanel.tsx:426`,
  `components/orders/ManualOrderScreen.tsx:45-46`,
  `components/orders/UploadOrderScreen.tsx:45`.
- **What happens:** `plural(count, one, many)` implements the three Romanian forms correctly and
  its own comment explains why there are three (`format.ts:27-40`). Every screen P3-51 touched
  uses it: Setări, Inventar, Necesar, the dashboard, Memento. The screens above hand roll a two
  form ternary instead, so they print the plural without "de" past nineteen:

  | Screen | Shipped at 20 | Correct Romanian |
  |---|---|---|
  | Clienți header (`ClientsScreen.tsx:195`) | `20 leaduri` | `20 de leaduri` |
  | Clienți header (`ClientsScreen.tsx:198`) | `20 clienți` | `20 de clienți` |
  | Azi header (`AziScreen.tsx:83`) | `20 întârziați` | `20 de întârziați` |
  | Review queue (`ExtractionReviewPanel.tsx:910`) | `20 poziții citite` | `20 de poziții citite` |
  | Documente tab (`DocumentsPanel.tsx:426`) | `cele 20 documente` | `cele 20 de documente` |
  | Order confirmation (`ManualOrderScreen.tsx:46`) | `20 poziții` | `20 de poziții` |

  `AziScreen.tsx:82`, "20 de sunat", is correct as written and is not in the table: "de sunat" is
  a verb phrase, not a counted noun, so `plural` does not apply to it.
- **Severity:** cosmetic. This is the exact defect P3-51 (PR #302) was raised to remove, and the
  helper it built is sitting one import away in each of these files.
- **File:** the six call sites above.

### F13. Two chip colours fail the contrast rule the app already enforces on buttons

- **Screens:** every screen that shows a Chip. The orange tone appears on the client's Contacte
  tab ("Contact principal") and on the intake form ("Precompletat din document"); the warn tone
  appears on the review queue ("Parțial"), on Memento ("Sub prag") and on the dashboard.
- **Read:** `components/ui/primitives.tsx:86-93` and `:104-112`, `app/globals.css:12-49`,
  measured with the same WCAG formula `tests/e2e/button-contrast.spec.ts:76-84` uses.
- **Measured:**

  | Tone | Text on background | Ratio | AA 4.5:1 |
  |---|---|---|---|
  | orange | `#f06801` on `#fff5ea` | **2.92:1** | fails |
  | warn | `#b7791f` on `#fff8e6` | **3.44:1** | fails |
  | ok | `#1f7a45` on `#eefaf2` | 4.99:1 | passes |
  | danger | `#c92a2a` on `#fff0f0` | 4.93:1 | passes |
  | info | `#1e5fa8` on `#eef4fc` | 5.83:1 | passes |
  | neutral | `#6b6b73` on `#f7f7f8` | 4.93:1 | passes |
  | primary button | `#ffffff` on `#c25401` | 4.60:1 | passes, as P3-53 promised |
  | `text-rc-muted-2` hint | `#93939d` on `#ffffff` | **3.04:1** | fails |

  Chip text is `text-[12px] font-semibold` (`primitives.tsx:106`), which is not WCAG "large
  text" (that begins at 18.66px bold), so the 4.5:1 threshold is the one that applies.
- **Why P3-53 did not catch it:** the card scoped itself to white text on orange, and said so in
  the token comment: *"--color-rc-orange ramane neschimbat: marcajul din meniu, sublinierea
  taburilor si conturul de focus nu poarta text alb"* (`globals.css:19-21`). That is true, and
  it overlooked the case where the orange is the text rather than the background.
- **Severity:** cosmetic. Nothing is unreadable in good light; two labels are below the standard
  the app has otherwise adopted, and the owner raised contrast himself as finding F9.
- **File:** `components/ui/primitives.tsx:86-93` and `app/globals.css:15-38`.

### F14. Two different definitions of the same phone classes, and they have already drifted

- **Screen:** `/clienti`, both views, at 390px. (phone, read only)
- **Read:** `components/clients/ClientsScreen.tsx:71-80` against
  `components/ui/phone.ts:44-53`.
- **What happens:** `ClientsScreen` declares its own `PHONE_TABLE`, `PHONE_ROW`, `PHONE_CELL`,
  `PHONE_WIDE`, `PHONE_LINK` and `PHONE_CONTROL` as module constants, while
  `components/ui/phone.ts` exports constants of the same six names, which `AziScreen`,
  `ClientTabs`, `InboundOrderForm` and the rest import. Two of them already differ:

  | Name | `ClientsScreen.tsx` | `components/ui/phone.ts` |
  |---|---|---|
  | `PHONE_TABLE` padding | `px-5 pb-5` | `p-4` |
  | `PHONE_LINK` display | `max-md:flex` | `max-md:inline-flex` |

  So on a phone a Clienți row card sits in 20px of side padding and an Azi row card in 16px,
  for no stated reason, and a name link in a Clienți row is a block while the same link in an
  Azi row is inline.
- **What should happen:** `ClientsScreen` should import the shared constants, and any difference
  it genuinely needs should be a class added at the call site.
- **Severity:** cosmetic, plus a maintenance hazard: a change made to the shared file will not
  reach this screen, and nothing will report that.
- **File:** `components/clients/ClientsScreen.tsx:71-80`.

---

### F15. Coverage gap: no shipped test asserts that the screen shows a refusal when a resend fails

- **Read:** `tests/e2e/extraction-cancel-draft.spec.ts:353-368`,
  `tests/e2e/review.spec.ts:904-923`, `tests/e2e/extraction.spec.ts:1843-1891`.
- **What the specs actually assert:** the cancel spec proves the *server* refuses a resend on a
  cancelled draft, by replaying the server action request and reading its response body
  (`:367-368`), never by reading the screen. The other two specs click "Retrimite" and then check
  the payload that reached the webhook. No spec asks what the operator is told when a resend is
  refused, which is the precise reason F5 above could ship unnoticed.
- **Severity:** cosmetic as a coverage gap in its own right; its consequence is F5, which is
  rated there.
- **File:** `tests/e2e/extraction-cancel-draft.spec.ts:353-368`.

### F16. Coverage gap: the P3-88 tests never look at `next_action_at`

- **Read:** `tests/e2e/lead-follow-up-date-cleared.spec.ts:160-259`, and its `stored()` helper.
- **What the specs actually assert:** every assertion in the file is
  `toEqual({ stage, follow_up_date })`. The helper reads those two columns and no others, and
  the leads are created through REST rather than through the Lead nou form, so they never
  acquire the mirrored `next_action_at` the form writes. `lead-next-action.spec.ts` covers the
  "setting one sets both" rule at De reluat (`:231-256`) and the explicit clearing of both
  fields (`:258-289`), but never the transition between the two cards: leaving De reluat with a
  mirrored next step date in place. That single missing case is exactly F3.
- **Severity:** cosmetic as a coverage gap; its consequence is F3.
- **File:** `tests/e2e/lead-follow-up-date-cleared.spec.ts`.

### F17. Coverage gap: the contrast spec checks primary buttons only

- **Read:** `tests/e2e/button-contrast.spec.ts:104-161`.
- **What the spec actually asserts:** three tests, all about white labels on the primary button
  background plus the account initials circle in the top bar. No chip, no hint text, no
  secondary surface is measured. This is why F13 is invisible to CI.
- **Severity:** cosmetic; its consequence is F13.
- **File:** `tests/e2e/button-contrast.spec.ts`.

### F18. The document type check compares the browser's MIME string exactly, and an empty one refuses a valid PDF

- **Screen:** the "Atașează document" box on an order (`/comenzi`).
- **Read:** `components/orders/OrderDocumentUpload.tsx:16` and `:47-51`.
- **What happens:** the guard is
  `if (!ACCEPT.split(",").includes(file.type)) setError("Se acceptă doar PDF, PNG sau JPG.")`.
  `File.type` is whatever the operating system and browser agree on, and it is legitimately the
  empty string when the system has no mapping for the extension. `image/jpg`, which some systems
  emit, is also not in the list. In either case a valid document is refused before it is ever
  sent, with a message that says the file is the wrong kind when it is not.
- **Mitigation:** the server repeats the check, so nothing unsafe gets through either way, and
  the upload side of `lib/data/extraction-actions.ts:95-96` has the same shape. The equivalent
  guard on the documents tab does not have this problem: `DocumentsPanel` sends only the name
  and the size and lets the server decide from the extension
  (`components/documents/DocumentsPanel.tsx:129-139`, `lib/data/document-actions.ts:163-165`).
- **Confidence:** lower than the rest of this report. It is a known browser behaviour, not one
  measured here, because no file could be picked without a running screen. It is written up so
  the fix card can start by reproducing it rather than by finding it.
- **Severity:** cosmetic, and only on the machines where it occurs.
- **File:** `components/orders/OrderDocumentUpload.tsx:47`.

---

## Checked, no defect

One line per screen or area, so that silence in this report is a statement and not an omission.
Everything here was read at the level described in section 0: the component, its server action,
and the shipped spec that names it.

### Group 1, leads and clients (PRs #277 to #281, #287 to #289, #299, #301 to #303, #313, #346 to #349)

- **`/crm` landing, three cards (#280).** Reads nothing from the database by design and says so
  (`app/(app)/crm/page.tsx:3-7`); the colour is beside the label and never instead of it; the
  three destinations use the query parameters P3-45 shipped. Stacks on a phone
  (`:51`), proven by `phone-remainder.spec.ts:372`. No defect.
- **Client stage schema and the five stages (#278).** `CLIENT_STAGES` and `CLIENT_STAGE_LABEL`
  are the single source for both the form and the chips (`lib/data/clients-types.ts:28-40`);
  the stage is never written on the generic update path, only through `set_client_stage`, and
  the reason is recorded at `lib/data/client-actions.ts:15-21`. No defect.
- **Leaduri list and Lead nou form (#279).** Fields match the handover list in its order; the
  form has no write path of its own and goes through `createClientRecord`
  (`LeaduriForm.tsx:14-17`); Salvează is disabled while pending (`:257`); Escape closes
  (`:60-66`). The only issues found on this screen are F6, F7, F12 and F14, all listed above.
- **Client and project tabs on the dark page (#288, F1).** The active tab is an underlined
  white label, the inactive ones `text-rc-muted-2` on the dark page
  (`ClientTabs.tsx:116-120`); the tab lives in the URL so it can be sent as a link and Back
  works (`:100-104`, `:92-95`); an unknown `?fila=` falls back to the first tab rather than
  erroring (`:93-95`). No defect.
- **Interes, Sursă and Responsabil on the client page and in the list (#289, F2).** Shown on the
  detail card under a capability gate (`ClientDetailScreen.tsx:229-239`), editable through
  Modifică, and sent only when changed so an unrelated save cannot overwrite them
  (`ClientForm.tsx:115-119`, `client-actions.ts:365-369`). A responsible person whose profile was
  deactivated keeps their option in the select, with the reason written down
  (`ClientForm.tsx:70-76`). A responsible person whose profile the viewer cannot read renders as
  "Alt membru al echipei" rather than an id or a blank
  (`ClientDetailScreen.tsx:124-128`). No defect.
- **Button contrast (#299, F9).** The primary button is `#c25401`, white on it measures 4.60:1
  and the hover 5.80:1, both above 4.5:1, and the token carries its own measurements
  (`globals.css:17-23`). The card did what it said. Chips are a separate matter, F13.
- **Filters on one row (#301, F8).** An explicit four column grid with an `auto` final column so
  the clear button cannot push the selects onto a second line, and the reason is recorded
  (`ClientsScreen.tsx:276-282`). Collapses to one column under 768px. No defect in the layout;
  the button's behaviour is F6.
- **Romanian grammar and builder notes (#302, F6 and F7).** The `plural` helper is correct for
  all three Romanian forms and its comment explains why there are three
  (`format.ts:27-48`). Where it is used it is right. Where it is not used is F12.
- **Leaduri view text (#303, F5).** The view has its own title, subtitle and primary button, and
  Client nou is deliberately absent from it with the reason written down
  (`ClientsScreen.tsx:143-147`). No defect.
- **De reluat date clearing (#346, P3-88).** The migration clears the date only on a move away
  from `follow_up` with no date passed, removes no rows, replaces two function bodies with
  identical signatures, and its own header sets all of that out
  (`0057:6-15`, `:143-147`). `overdue` is narrowed correctly (`:227`). The card itself is
  correct; what the next two cards then did to it is F3.
- **Next step on every lead and client (#347, P3-89).** Columns added under a capability gate so
  the two minute window between code and migration cannot break a save
  (`client-actions.ts:284-286`); one date box at De reluat, two elsewhere, consistently in the
  form, the note form and the detail card; a field not sent means "do not touch". No defect of
  its own; F3 and F4 are about its interaction with other cards.
- **Notes timeline (#348, P3-90).** Notes and stage moves in one list, newest first; an empty note
  is refused in Romanian both in the action and by a check constraint
  (`client-actions.ts:433-434`, `:470`); the write order is chosen so a second press cannot
  double anything, and the reasoning is written out (`:415-420`); the account manager sees the
  history and not the form, because the database would refuse them
  (`ClientNotesPanel.tsx:18-19`). No defect.
- **Azi screen (#349, P3-91).** The list reads every page rather than the first 25 and says why
  (`azi.ts:12-14`); a lead brought in only by its follow up date drops off once a note exists
  from that day or later, which is what makes "Am sunat" work (`azi.ts:22-27`, `:132-163`);
  the owner filter lives in the URL and an unknown id shows everything rather than nothing
  (`app/(app)/azi/page.tsx:30-33`); "Am sunat" only appears for the owner, because the database
  would refuse anyone else (`:40-42`). Findings B1, F3 and F12 above.
- **Client detail page and the ClientForm sheet.** Escape closes, the overlay closes, Salvează is
  disabled while pending, a missing value renders as a dash rather than an empty cell with the
  reason written down (`ClientDetailScreen.tsx:51-53`). The one real risk on this form is F4.
- **The five ClientTabs panels.** Contacte, Proiecte, Consum materiale, Documente and Note each
  render their own empty state with a Romanian hint; the Consum total says in words when it is
  partial because some issues have no project, rather than quietly under reporting
  (`ClientTabs.tsx:321-330`). No defect.
- **`/proiecte` client linkage.** Project rows on the client page link to the project and the
  "Vezi toate ieșirile" link carries the client filter (`ClientTabs.tsx:313-320`). No defect.

### Group 2, manual intake and uploads (PRs #282, #283, #290, #291, #295, #307, #321, #325, #343, #344)

- **Both intake date fields (#282, #283).** #282 correctly found its own card's premise false and
  said so rather than building on it. The date in words under each field is present, follows the
  field, and is absent when the field is empty, with the reason written down
  (`InboundOrderForm.tsx:47-64`). No defect.
- **Romanian file picker and date field everywhere (#307, P3-49).** The native file input and the
  native date input are both `display: none` rather than shrunk, and both files record the
  measurement behind that choice (`FilePicker.tsx:17-21`, `DateField.tsx:20-25`). The Romanian
  parser reads day first on every browser, accepts the stored ISO form as well, and inserts the
  dots as you type without fighting the backspace key (`DateField.tsx:61-95`). The calendar is
  still reachable through `showPicker()` with a click fallback (`:140-149`). The parsing is
  right; what the empty result then does to the parent form is F4.
- **Favicon (#295).** `app/favicon.ico` and `app/icon.png` both exist, and
  `favicon.spec.ts` proves the route answers to a visitor with no session. No defect.
- **Page count at upload and the 100 page refusal (#290).** Counted from the file bytes at upload,
  labelled on screen as our count so it cannot be read as the model's
  (`ExtractionReviewPanel.tsx:645-665`). No defect.
- **Document link uses only `NEXT_PUBLIC_SITE_URL` (#291).** Enforced by its own check script,
  `npm run check:document-url`, and by `document-url.spec.ts`. No defect.
- **Missing webhook fails an upload visibly (#321, F3) and #343 (F21).** The upload path shows the
  refusal and keeps the document, and the panel refreshes so the failed card appears under the
  message (`ExtractionReviewPanel.tsx:788-796`; `extraction-actions.ts:128-141`). Correct on the
  upload path. The resend path beside it is F5.
- **Numeric coercion, empty string and boolean to null (#325, F2).** Enforced by
  `npm run check:numeric-field` and `extraction-webhook-number-coercion.spec.ts`. Backend only,
  no user facing surface, nothing to drive. No defect.
- **Callback secret compared without stray whitespace (#344, F22).** Enforced by
  `npm run check:callback-secret`. Backend only; confirmed by reading that it changes no
  response text and no screen. No defect, and no user facing change, as the task asked me to
  confirm.
- **`/adauga-manual`.** Supplier datalist, currency, the two dates, positions with a fixed unit
  taken from the product, and a footer that explains why the MDL total is not a conversion
  (`InboundOrderForm.tsx:364-381`). Correct except F8 and F4.

### Group 3, extraction review and documents (PRs #285, #292, #293, #318, #322, #327, #328, #330, #335, #336, #337, #340, #342)

- **Every pending draft is read page by page, a short answer is refused (#285, P3-39).** No defect.
- **A code-less digital partial with lines is stored with our reconciliation code; without lines
  it is refused (#292, P3-55).** Enforced by `npm run check:reconciliation`. No defect.
- **Documente tab on client and project pages (#293, P3-15).** The client sends only the file name
  and the size; the server checks both before issuing a signed upload token, the bucket applies
  its own limits, and the server checks again what actually arrived, all three steps commented in
  place (`DocumentsPanel.tsx:127-158`, `document-actions.ts:163-165`, `:221`). A 200 MB file is
  therefore refused before any transfer. No defect.
- **Document downloads need an active profile (#318, P3-70) and client, project and document reads
  need one (#336, P3-81).** Storage policy plus table policies; proven by
  `document-download-security.spec.ts` and `active-profile-table-reads.spec.ts`. No defect.
- **The model's own diagnostic block, in Romanian (#322, F5).** Inside a closed `details` on the
  draft row rather than inside the review sheet, and the reason that sheet would have been the
  wrong place is written out (`ExtractionReviewPanel.tsx:96-113`). Absence is printed as
  "not reported" rather than hidden, so a missing field is distinguishable from a field that does
  not exist (`:72-75`). No defect.
- **Line math checked against quantity times unit price (#327, F7).** Enforced by
  `npm run check:reconciliation` and `extraction-line-math-consistency.spec.ts`; the line's own
  total source is shown read only beside it (`:169-196`). No defect.
- **Unknown callback keys are logged and warned, never refused (#328, F9).** Enforced by
  `npm run check:callback-keys`. No defect.
- **`orderWithDocument` names a failed render instead of reporting zero rows (#330, F16).**
  No defect.
- **A derived line total routes a document to partial by itself (#335, F6).** The screen says in
  one sentence that the move was ours, so the operator does not go looking for a reader error
  that does not exist (`ExtractionReviewPanel.tsx:898-905`). No defect.
- **A quantity only delivery note is accepted, not failed (#337, F17).** The note on the card is
  derived through the same condition the reconciliation uses, so it cannot appear on a refused
  document or be missing from an accepted one, and that is stated
  (`ExtractionReviewPanel.tsx:913-920`, `:51-62`). No defect.
- **Unknown VAT flag stores `anchor_unknown` (#340, F8).** No defect.
- **Cancel a draft (#342, F20).** The confirmation step is inside the card rather than a browser
  dialog, and the reason is written down (`:641-644`); a cancelled draft is kept, listed in a
  closed section with who cancelled it and why, and offered no button to undo
  (`:718-754`); the button is offered in every state including "În lucru", for the stated reason
  that a test document should not have to wait for a reply to leave the list (`:962-965`);
  only the owner sees it, because the action would refuse anyone else
  (`app/(app)/incarca-comanda/page.tsx:44-46`). No defect.
- **The review queue card in each state.** `extracted` offers "Verifică", `partial` offers
  "Verifică" and "Retrimite", `failed` offers "Retrimite", a failed scan offers "Vezi antetul"
  and deliberately not "Verifică" so no acceptance path is implied, and the reason is written out
  at `:940-956`. `cancelled` offers nothing. Correct. The "Retrimite" handler is F5, the phone
  layout is F9.
- **#345 (F21 report).** Documentation only, no screen, skipped as the task instructed.

### Group 4, inventory (PRs #304, #305, #306, #308, #312, #315, #316)

- **One picture per product (#304, P3-56).** The file does not pass through a server action; the
  server prepares a signed upload, the browser uploads directly, the server confirms what
  arrived (`ProductForm.tsx:277-305`). A product created by a press whose image then failed is
  remembered in `savedId`, so the next press updates that product instead of creating a second
  one (`:177-181`, `:262-264`), which is exactly the double press trap. The panel shows a plain
  `<img>` and not `next/image` because the URL is signed and expires, with the reason written
  down (`ProductPanel.tsx:321-328`), and a broken image falls back to a Romanian sentence rather
  than a broken icon (`:333-338`). No defect.
- **Model, Serie and Grosime picker (#305, P3-57).** The three lists derive from one another, so a
  combination that is not in the list cannot be chosen; choosing a thickness fills the name, the
  unit, the category and the supplier, and all of them stay editable (`ProductForm.tsx:204-222`).
  A model without a series or a thickness is refused by the server. No defect.
- **Dasterum prices prefill (#306, P3-58).** A suggestion, not a rule: the note under the field
  disappears the moment the value stops being the list's (`ProductForm.tsx:152-160`). No defect.
- **Editable on an existing product (#308, P3-59).** The saved combination is the initial state
  and nothing more: opening the form does not rewrite the name, unit, category, supplier or
  price, and that is stated (`ProductForm.tsx:112-118`). "Fără model" clears the combination.
  When the option list is empty the field is absent and the stored combination is left alone
  (`:246-257`). No defect.
- **Locked field hints (#312, P3-61).** Serie and Grosime carry both a disabled style and a
  Romanian hint saying which field to fill first (`ProductForm.tsx:321-329`, `:398`, `:419`).
  No defect.
- **Options admin screen (#315, P3-68).** A retired combination is no longer offered, with one
  exception, the combination the edited product already carries, so the form opens with it
  selected (`ProductForm.tsx:123-135`). The admin list uses `plural` correctly
  (`SheetOptionsSettings.tsx:269-270`) and is reachable from `/setari`
  (`app/(app)/setari/page.tsx:54`). Desktop layout correct; the phone layout is F11.
- **80 verified roofing materials (#316, P3-69).** A data migration with no screen of its own, as
  the task noted. The product list that shows them was read instead: `InventoryScreen` filters
  and paginates on the server, uses `plural` correctly (`:244-245`), and carries eleven
  `max-md:` classes. No defect.

### Group 5, reminders (PR #284)

- **Memento stoc, threshold reachable from the row (#284, P3-42).** The row carries a link to the
  product sheet opened on the threshold field, not a second form, and the reason a link cannot
  become a second writer is stated (`app/(app)/memento/page.tsx:14-17`). A viewer who cannot
  write sees the value and no link (`:117-130`). `plural` used correctly in three places
  (`:79`, `:163`, `:165`). The screen is correct; where it lands is F10.

### Group 6, phone layout (PRs #310, #311, #314, #320)

- **Shell (#310).** Sidebar becomes a drawer under 768px; three tests in `phone-shell.spec.ts`
  cover the login screen, the drawer and the top bar at its longest title. No defect found by
  reading.
- **Lists (#311).** One card per row under 768px, same DOM rather than a hidden copy so the specs'
  row counts do not double, and the reason is written down
  (`ClientsScreen.tsx:65-70`). No defect, apart from the duplicated constants, F14.
- **Forms and detail panels (#314).** `components/ui/phone.ts` is the single home for these
  classes and the components that import it are consistent. `ProductForm` was excluded by name
  and never picked up: F10.
- **Remaining screens (#320).** Nine screens swept and each proved by a named test in
  `phone-remainder.spec.ts`. The screens it did not reach are F9, F10 and F11.
- **Method note.** As stated in section 0, no screen was rendered at 390px. Every phone statement
  here is read from the `max-md:` classes present or absent in the source. A defect that only a
  rendered page would show, for example a specific element overflowing by a few pixels, would not
  have been found by this sweep and is not claimed either way.

### Group 7, reactivation (PR #313)

- **A deactivated lead or client comes back from its own page (#313, P3-66).** The button lives on
  the card header where the state is shown, not at the end of the Modifică form behind the
  Inactivi filter, and the reason is written out (`ClientDetailScreen.tsx:87-95`). It sends the
  identity fields with only `active` inverted, and deliberately does not send the stage, date,
  source, interest or owner, so pressing it cannot move the stage or write a history row
  (`:101-110`). The confirmation is a `role="status"` line under the header, where the press
  happened, and it stays until the next press, because the app has no toasts and the comment says
  so (`:92-95`, `:176-184`). A refusal is a `role="alert"` line in the same place
  (`:185-193`). The empty Activi list says the deactivated ones are hidden and offers a button to
  the Inactivi filter, in every view (`ClientsScreen.tsx:328-369`). Proven by three tests in
  `reactivate-lead.spec.ts`. No defect.

---

## What this report did not do

- **Production was never opened and no production row was ever read.** No credential exists on
  this machine and none was fetched. The "local stack will not run" pivot in section 0 was taken
  as a code read, not as a reason to look at the live site.
- **No application code, no migration and no board card acceptance was written.** The fixes are
  POC's to queue, by severity. In the author's reading the order by consequence is F3, F4, F5,
  F8, then F6, F7, F9, F10, then the cosmetic ones.
- **Nothing was clicked.** Every finding above names the lines a reader can check for themselves,
  and the confidence of each is stated on the finding rather than assumed from the report as a
  whole.
