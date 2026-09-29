# CRITIC: second bug sweep, everything merged since PR #350, Facturare first

Card: none. Goal G66, queue task `0xx-g66-critic-bug-sweep-2.md`.
Written 2026-09-29 by the CRITIC terminal on Max's machine.
Branch `card/critic-bug-sweep-2`, cut from `origin/main` at ce37fc1 (PR #374, P3-110).

No application code, no migration and no test changed in this pull request. This is the
report. POC queues the fixes afterwards, worst first.

**The finding numbers in this report are G1 to G16.** The first sweep
(`docs/reports/2026-09-22-critic-bug-sweep.md`) used B1, B2 and F1 to F18. G is for goal G66
and no number is reused.

---

## 0. What could and could not be driven, and what that makes the evidence below

**The local stack still does NOT reach a database on this machine. No screen could be driven
by hand. Production was never opened and no production row was ever read.**

The one step re-check asked for by the brief, run at the start of this session:

```
ls -a | grep -i env                                   -> nothing
find . -maxdepth 2 -name "*.env*" -not -path node_modules -> nothing
ls /Users/sm33xy/Projects/rc-inventory/.env*          -> no matches found
which docker supabase                                 -> docker not found, supabase not found
```

The single placeholder file the first sweep found, `rc-inventory-worktrees/lb1-p3-54-favicon/.env.local`,
is gone; there is now no `.env*` anywhere in the primary checkout or in this worktree, and
Docker and the Supabase CLI are still absent. So nothing has appeared since 2026-09-22 that
would let a screen render, and the first sweep's section 0 stands word for word:

> "**The local stack does NOT reach a database on this machine. No screen could be driven by
> hand. Production was never opened and no production row was ever read.**"

`npm run dev` was NOT tried again. The first sweep already established that it starts, that
every route compiles, and that every address answers with the login screen because no session
can be established against a Supabase that is not there. Repeating a settled negative would
have spent the run on it.

**So the pivot in the task brief applies, and this is what the evidence below actually is:**

- Every finding marked **read** is a code read. Each names `file:lines` so any reader can check
  the same lines. **A read is weaker than clicking the screen**, and that is stated on every
  finding rather than assumed.
- One finding, **G4**, is marked **measured**: the arithmetic divergence it reports was
  reproduced with `node -e` against the exact rounding rule the trigger uses. That is stronger
  than a read and weaker than a screen.
- The shipped `tests/e2e/facturare-*.spec.ts` files were read as evidence of what is and is not
  covered. Three findings (**G9, G10, G11**) are coverage gaps found that way.
- Anything about pixels or phone layout is read from the `max-md:` classes in
  `components/ui/phone.ts` and the components that use them, and is marked "(phone, read only)".
- Everything that can only be settled by a person clicking is in the last section, written for
  Max, one line each.

### The board

No board card was authored. The precedent is the previous two CRITIC passes (PR #281 for G5,
and G47's sweep), which carried no card, and `scripts/poc-free/check-board-edit.mjs` exempts
any path under `docs/`. The same paths are what `.github/workflows/quality.yml` calls
`docs_only`, so this pull request takes the P3-73 documentation fast path.

---

## Findings

Severity is one of **breaks work**, **wrong**, **cosmetic**, and is argued on each finding
rather than asserted.

---

### G1. An issued invoice can be pushed back to `ciornă` in one request, and then everything about it unfreezes

**This is the sweep's most consequential finding.** The migration that owns invoices states, in
its own words, that the database is the guarantee and the screen is only a courtesy. For the
freeze that claim is not true.

- **Screen:** none. This is reachable only by a request built by hand, by any signed in account
  with an active profile.
- **Read:** `supabase/migrations/0063_invoices.sql:510-543` (the guard),
  `:303-318` (the constraints it leans on), `:697-739` (the line guard),
  `:1011-1017` (the update policy that lets any active profile write any invoice).
- **What happens, in two steps:**
  1. `invoices_require_draft_to_edit` returns early when `old.status = 'draft'`
     (`0063:515-517`). Past draft it compares fifteen columns and raises if any changed
     (`0063:519-539`). **`status` is not one of the fifteen**, deliberately, because an issued
     invoice has to be able to become paid or cancelled (`0063:484-494`). But the list does not
     say *which* statuses, so `PATCH /invoices?id=eq.X {"status":"draft"}` on an issued invoice
     changes nothing else and is permitted. The two constraints that might have caught it do
     not: `invoices_numbered_past_draft` reads `status = 'draft' or number is not null`
     (`0063:307`) and is satisfied by the first half, and
     `invoices_cancel_reason_only_when_cancelled` (`0063:317-318`) is satisfied because an
     issued invoice has no cancel reason.
  2. The invoice is now a draft. On the next update `old.status = 'draft'`, so the guard
     returns at `0063:516` before comparing anything, and **the number, the series, the client,
     the project, the dates, the notes and all three stored totals become writable**.
     `invoice_lines_require_draft` reads the parent's *current* status (`0063:717-723`), which
     is now `draft`, so lines can be edited and new ones added too.
- **What should happen:** the guard should permit `status` to move only forward through the
  pipeline the enum documents (`draft -> issued -> paid`, and `issued -> cancelled`), and refuse
  any move back to `draft`. That is one extra branch in a function that already exists.
- **Severity: wrong.** Not "breaks work": nothing in the shipped interface does this, the
  Facturare screens offer no control that could, and `facturare-actions.ts` never writes
  `status: "draft"`. What is wrong is that the file's central promise, quoted in its own header
  at `0063:481-482` and repeated in `facturare-actions.ts:154-158`, is a promise the file does
  not keep. Every other guarantee on these tables (no delete, the counter being unwritable) was
  built with two independent locks, privileges and policies. This one has a door.
- **File:** `supabase/migrations/0063_invoices.sql:510-543`.

### G2. Cancelling a draft takes the series and the issue date from the server's UTC clock, not from Chișinău

- **Screen:** `/facturare/<id>`, the "Anulează factura" button on a draft.
- **Read:** `lib/data/facturare-actions.ts:637-642`, against
  `supabase/migrations/0063_invoices.sql:812` and `:748-762`, and against
  `lib/data/facturare-actions.ts:537-545`.
- **What happens:** cancelling a draft must first issue it, because no status past draft may
  carry a null number. `cancelInvoice` does that with
  `await issueInvoice(invoiceId.trim(), "", "")` (`facturare-actions.ts:639`): **an empty issue
  date**. `issueInvoice` turns an empty string into `null` (`:499`), the RPC receives
  `p_issue_date: null`, and `issue_invoice` falls back to
  `v_issue date := coalesce(p_issue_date, current_date)` (`0063:812`). `current_date` is the
  date on the database server, which is UTC. Chișinău is UTC+2 or UTC+3, so for the first two
  or three hours of every Chișinău day `current_date` is **yesterday**. `v_issue` then decides
  two things: the `issue_date` written on the invoice, and, through
  `public.invoice_series_for` (`0063:748-762`), **which series it is numbered in**.
- **The concrete failure:** a draft cancelled at 00:30 Chișinău on 1 January 2027 is stamped
  `issue_date = 2026-12-31` and takes the next number in series `RC-2026`, not `RC-2027`. It
  then appears on the December list, in the closed year's series, under a number nobody
  expected to be issued.
- **Why this is a defect and not a design choice:** every other path in this feature is careful
  about exactly this. `FacturaScreen.doIssue` passes `invoice.issueDate ?? today` where `today`
  is `chisinauToday()` read on the server (`FacturaScreen.tsx:132`, `:109-111`).
  `markInvoicePaid` writes noon UTC rather than midnight and its comment explains why in four
  lines (`facturare-actions.ts:537-545`). `facturare-list-types.ts:89-100` refuses `new Date(string)`
  for the same reason. The cancel path is the one place the rule was not applied.
- **What should happen:** `cancelInvoice` should pass the Chișinău day, the same way `doIssue`
  does. It is one argument.
- **Severity: wrong.** It is silent, it is rare (a few hours a day), and at a year boundary it
  puts a document in the wrong legal series.
- **File:** `lib/data/facturare-actions.ts:639`.

### G3. Clearing the "Data emiterii" box and pressing Emite reaches the same UTC clock

- **Screen:** `/facturare/nou` and `/facturare/<id>/modifica`, the "Data emiterii" box.
- **Read:** `components/facturare/FacturaEditor.tsx:263`, `:199-215`, `:355-360`;
  `lib/data/facturare-actions.ts:499-505`; `supabase/migrations/0063_invoices.sql:812`.
- **What happens:** the box opens filled with `chisinauToday()` (`facturare-create.ts:225`,
  `:241`), which is right. But it is an ordinary editable field, and **nothing refuses an empty
  one**: the `problems` list at `FacturaEditor.tsx:199-215` checks the client, the VAT rate,
  every line and `anyInvalid` (a *partly* typed date), and never checks that the issue date is
  present. `onIssue` then calls `issueInvoice(id, issueDate, dueDate)` with an empty string
  (`:263`), and the invoice lands on `current_date` exactly as in G2.
- **What should happen:** either the issue date is required before Emite, in the same list as
  the other refusals, or the server fills a missing one with the Chișinău day rather than
  letting the database fall back to UTC. The second is the better fix because it also closes G2.
- **Severity: wrong.** Same consequence as G2, reached deliberately rather than by a code path
  the operator cannot see, so it is rarer but it is on the main create screen.
- **File:** `components/facturare/FacturaEditor.tsx:263` and `lib/data/facturare-actions.ts:499`.

### G4. The line total shown while composing an invoice can be one ban below the one that is stored

**Measured, not only read.**

- **Screen:** `/facturare/nou` and `/facturare/<id>/modifica`, the "Total linie" column and the
  Subtotal, TVA and Total de plată footer.
- **Read:** `components/facturare/FacturaEditor.tsx:104-107` (`round2`), `:190-197` (the
  preview), against `supabase/migrations/0063_invoices.sql:623-641` (the trigger).
- **What happens:** the editor computes the preview with
  `Math.round((value + Number.EPSILON) * 100) / 100` over JavaScript binary floats. The database
  computes the stored figure with PostgreSQL `round(numeric, 2)` over exact decimal arithmetic,
  which rounds half away from zero. The file's own header promises these agree:

  > "Aritmetica de mai jos ROTUNJESTE IN ACEEASI ORDINE ca declansatorul, o data pe figura,
  > tocmai ca numarul de pe ecran sa nu difere de cel scris"
  > (`FacturaEditor.tsx:27-30`)

  The *order* does match. The *arithmetic* cannot, because a quantity and a price that are exact
  in decimal are not exact in binary. `Number.EPSILON` does not rescue it: it is about 2.2e-16
  and it is added **before** the multiplication by 100, so for any value above about 1 it is
  orders of magnitude smaller than that value's own floating point step and changes nothing.
- **The measured case**, run in this session with `node -e` against the trigger's rule:

  | quantity | unit price | editor shows | database stores |
  |---|---|---|---|
  | 0,333 | 1000,00 | 333,00 | 333,00 |
  | 1,005 | 1,00 | 1,01 | 1,01 |
  | **8,165** | **1,00** | **8,16** | **8,17** |
  | 1234,565 | 1,00 | 1234,57 | 1234,57 |

  Both of the owner's own examples (0,333 and 1000) agree, which is why this has not been seen.
  `8.165 x 1` does not: `8.165` is stored in binary as slightly less than 8.165, so
  `Math.round(816.4999...)` is 816, while PostgreSQL rounds the exact decimal 8.165 up to 8.17.
  Quantity takes three decimals (`numeric(14,3)`, `0063:356`) and price two, so a product landing
  exactly on half a ban is an ordinary occurrence, not a contrived one.
- **What should happen:** the preview should be computed on integers (bani, and thousandths of a
  unit) rather than on floats, so that it reproduces the trigger exactly. Failing that, the
  screen should stop promising that it matches.
- **Severity: wrong.** The operator sees one number while composing and a different one on the
  issued document, with no warning, and the difference is exactly the ban that makes a column
  fail to add up.
- **File:** `components/facturare/FacturaEditor.tsx:104-107`.

### G5. Two invoices can be made for the same Ieșire, because the check that forbids it is a read with nothing behind it

- **Screen:** `/facturare/nou?iesire=<id>`, reached from the Ieșire panel on `/comenzi`.
- **Read:** `lib/data/facturare-create.ts:154-182` (the check),
  `lib/data/facturare-actions.ts:373-405` (the write), and
  `supabase/migrations/0063_invoices.sql:236`, `:295-319` (what the database constrains).
- **What happens:** "Există deja o factură pentru această ieșire" is decided by
  `getIssueInvoiceability`, which SELECTs non-cancelled invoices with that `outbound_issue_id`
  and refuses if it finds one (`facturare-create.ts:154-182`). That is a read. The write,
  `saveInvoiceDraft`, validates only the *shape* of `outboundIssueId` (`facturare-actions.ts:374-377`)
  and then inserts, **without re-asking the question**. And the database has no constraint to
  catch it: `invoices.outbound_issue_id` is an ordinary nullable foreign key
  (`0063:236`) with an index but no unique constraint, and the unique constraint that does exist
  is on `(series, number)` (`0063:299`).
- **The concrete failure:** two tabs open on `/facturare/nou?iesire=X`, or one tab left open
  while a colleague invoices the same Ieșire, and both presses succeed. Two invoices now exist
  for one delivery, both issuable, both numbered, and **neither can be deleted**: the only way
  out is to cancel one with a reason, which consumes a second number in the series.
- **What should happen:** this is the same class of problem the numbering was built to avoid,
  and the migration's own header says so in terms (`0063:176-191`): a read followed by a write is
  not a guard. Either a partial unique index on `outbound_issue_id where status <> 'cancelled'`,
  or the check repeated inside the insert path, would close it.
- **Severity: wrong.** It needs two operators or two tabs, the same precondition as every
  concurrency item the owner listed, and the damage is permanent because nothing here deletes.
- **File:** `lib/data/facturare-actions.ts:373-405`.

### G6. A failed save can leave a numberless, lineless invoice on the list that nobody can remove

- **Screen:** `/facturare/nou`, "Salvează ciorna" and "Emite factura".
- **Read:** `lib/data/facturare-actions.ts:379-405` (the create path) and `:439-471` (the edit
  path), against `supabase/migrations/0063_invoices.sql:911-923` and `:966-970` (no delete, for
  anyone).
- **What happens:** saving a new invoice is **two separate PostgREST requests and not one
  transaction**: the invoice header is inserted first (`:379-396`), and the lines are inserted
  afterwards (`:398-401`). If the second request fails, the function returns a refusal, but the
  invoice row is already committed. The screen shows the error and the operator presses again,
  which creates a **second** invoice. The first survives with zero lines, totals of 0, and no
  number, and appears on `/facturare` for the month, because a draft's list date is its creation
  day (`facturare-list.ts:97`). Nothing can remove it: there is no delete privilege and no delete
  policy on `public.invoices` for any role, owner included (`0063:911-923`, `:966-970`), and the
  only route out is to cancel it with a reason, which first issues it and therefore **spends a
  real number on a document that was never composed**.
  The edit path has the same shape: the header update and each line write are separate requests
  (`:439-466`), so a refusal part way through leaves some lines written and some not.
- **What should happen:** the create should be one database function, the way issuing is, so that
  a failure leaves nothing behind. Short of that, a draft with no lines should be reusable rather
  than abandoned: the create path could look for the caller's own empty draft before inserting
  another.
- **Severity: wrong.** It needs a failure to trigger, which is not the common case. But the
  consequence is unusually bad for this feature specifically, because "nothing is ever deleted"
  means the debris is permanent and the cheapest cleanup burns a number out of a legal series.
- **File:** `lib/data/facturare-actions.ts:379-405`.

### G7. The only money figure on the Facturi screen adds drafts and cancelled invoices into one unlabelled total

- **Screen:** `/facturare`, the line under the table.
- **Read:** `components/facturare/FacturiScreen.tsx:386-406`, `lib/data/facturare-list.ts:141`,
  `:156-164`, and `tests/e2e/facturare-list.spec.ts:501-503`.
- **What happens:** the footer draws two things and no label between them: the count on the
  left, and `formatMoneyExact(sumMdl)` on the right (`FacturiScreen.tsx:396-404`). `sumMdl` is
  `rows.reduce((total, row) => total + row.totalMdl, 0)` over whatever passed the filters
  (`facturare-list.ts:162`), and the default state filter is empty, meaning **Toate stările**
  (`facturare-list.ts:141`, `facturare-list-types.ts:25`). So the figure an operator reads for a
  month counts drafts, which are not documents and have no number, and cancelled invoices, which
  are the declaration that the money is **not** owed. The shipped test asserts exactly this and
  states the arithmetic: "120 + 60 + 12 + 24 = 216" over four invoices in four states
  (`facturare-list.spec.ts:501-503`), so it is deliberate, tested behaviour.
- **What should happen:** the figure is honest as "the sum of the rows you are looking at" and
  the design report is right that the screen needs a total. What it lacks is the word. Either the
  footer says what it is summing ("Total pe rândurile afișate"), or it shows the live total
  separately from the cancelled one. The page's own lead sentence is
  "Facturile emise clienților, pe perioada, pe stare și pe client."
  (`app/(app)/facturare/page.tsx:23`), which promises issued invoices and then shows a total over
  all four states.
- **Severity: wrong.** Nothing is stored incorrectly. But this is the one number on the screen an
  owner will read as "what we billed this month", and for any month containing a cancellation it
  is not that number.
- **File:** `components/facturare/FacturiScreen.tsx:396-404`.

### G8. The invoice number named in the Emite confirmation is a guess, and the screen presents it as a fact

- **Screen:** `/facturare/<id>` and `/facturare/nou`, the sentence inside the Emite confirmation.
- **Read:** `components/facturare/FacturaScreen.tsx:254-258`,
  `components/facturare/FacturaEditor.tsx:591-595`,
  `lib/data/facturare-create.ts:83-109`.
- **What happens:** the confirmation reads "Factura primește numărul RC-2026-00007, următorul din
  serie". That string comes from `nextInvoiceNumberText`, which reads the counter row once when
  the **page** was rendered (`facturare-create.ts:83-96`, `:105-109`). It is correct at that
  instant and stale afterwards. Two operators with the page open are both promised the same
  number and one of them gets a different one; the same is true for one operator who left the
  page open while a colleague issued something.
  There is a second, quieter version of the same gap: the prediction is always made for
  **today's** series (`facturare-create.ts:108`), while the editor lets the operator set any
  issue date. Back-dating an invoice to December therefore shows a number from the current
  year's counter and allocates one from the previous year's.
- **What should happen:** the allocation itself is right and this finding does not touch it. The
  sentence should either drop the number, which the code already supports (both screens have a
  branch for an empty `nextNumberText`), or say it is the next number *at the moment the page was
  opened*. The paragraph directly under it already explains that the database allocates the
  number; it is the sentence above that overclaims.
- **Severity: cosmetic.** The number that lands is always correct, and the screen refreshes to
  show it. What is lost is trust: an operator who has once been shown 7 and given 8 stops reading
  the sentence, and that sentence is the deliberate one-sentence pause before an irreversible
  action.
- **File:** `components/facturare/FacturaScreen.tsx:257`.

### G9. Coverage gap: no test issues the same draft twice at the same moment, which is the double click the owner asked about

- **Read:** `tests/e2e/facturare-data.spec.ts:319-359` (test 2) and `:281-284` (the sequential
  half of test 1).
- **What is covered:** test 2 fires five `issue_invoice` calls through `Promise.all` over **five
  different drafts** and asserts five distinct consecutive numbers and a counter that advanced
  exactly five times (`:336-358`). That is a real concurrency proof and it is strong: five HTTP
  requests means five database sessions, which is the thing a single psql session cannot show.
  Test 1 issues the *same* invoice twice and asserts the second is refused (`:281-284`), but the
  second call happens after the first has returned.
- **What is not covered:** two concurrent calls on **one** draft. That is the literal double
  click, and it is the only case that exercises the migration's load bearing claim: the loser
  increments the counter, then fails the `update ... where status = 'draft'`, and the increment
  must roll back with the failed transaction (`0063:841-867`). Reading the function, it does:
  the whole RPC is one statement, so the exception discards the increment. But that is a read of
  a claim, and it is the claim the entire counter-instead-of-sequence decision was made for
  (`0063:166-191`). **Nothing proves it.**
- **What should happen:** one test, the same shape as test 2, firing two `issue()` calls on one
  id through `Promise.all`, asserting that exactly one succeeds, that the other's refusal is the
  restrict violation, and above all that the counter advanced by **one** and not by two.
- **Severity: wrong** (as a coverage gap, not as a live defect). The behaviour appears correct
  on a read; what is missing is the proof that would catch it if it ever stopped being correct.
- **File:** `tests/e2e/facturare-data.spec.ts:319`.

### G10. Coverage gap: the no-edit-after-issue test never tries the one column that would get through

- **Read:** `tests/e2e/facturare-data.spec.ts:361-445`, in particular `:401-412`.
- **What is covered:** the test is named "baza refuză o modificare pe o factură emisă, plătită
  sau anulată, și pe liniile ei", and for each of the three states it tries `notes`,
  `project_id`, `number` and `total_mdl` on the invoice and `quantity` and `unit_price_mdl` on
  the line, plus adding a new line, and asserts every one is refused with the Romanian reason
  (`:401-428`). It even carries a witness to prove the trigger is not simply a wall (`:371-382`).
- **What is not covered:** `{"status": "draft"}`. That is the exact request G1 describes, it is
  permitted, and it unlocks all six of the columns the test just proved were locked. The test's
  name claims the freeze; the test proves the freeze **for the columns somebody thought to
  list**. That is the difference the brief asks to be reported.
- **What should happen:** add `status: "draft"` to the refusal loop at `:401-406`. That line
  fails today, which is the point: it is the test that would have found G1.
- **Severity: wrong** (as a coverage gap). It is the reason G1 shipped.
- **File:** `tests/e2e/facturare-data.spec.ts:401-412`.

### G11. Coverage gap: nothing tests the two write paths that are not transactions

- **Read:** `tests/e2e/facturare-create.spec.ts:487-1187` (the whole file) against
  `lib/data/facturare-actions.ts:379-405` and `:439-466`.
- **What happens:** the create spec drives the happy paths thoroughly, and drives the two
  refusals on the Ieșire button (test 6, `:992`). No test exercises what happens when the second
  of the two writes in `saveInvoiceDraft` fails, and none exercises two saves of the same Ieșire.
  Those are G5 and G6, and both are invisible to the suite as it stands.
- **What should happen:** these are awkward to test through a browser and natural to test at the
  data layer, where `facturare-data.spec.ts` already works: two `POST /invoices` with the same
  `outbound_issue_id`, asserting the second is refused, would be four lines and would fail today.
- **Severity: cosmetic** (as a coverage gap). The findings it would have caught are already
  written above; this records that the suite would not notice a regression in either.
- **File:** `tests/e2e/facturare-create.spec.ts`.

### G12. The client's missing IDNO is silent, while the supplier's missing details get a warning line

- **Screen:** `/facturare/<id>`, the Client card.
- **Read:** `components/facturare/FacturaScreen.tsx:404-415` (the supplier), `:434` (the client),
  `:653-676` (`Pair`).
- **What happens:** when Rapid Construct's own details are blank, the Furnizor card draws an
  explicit orange line: "Datele furnizorului nu sunt completate. Se completează în Setări, la
  Facturare." (`:409-415`). When the **client's** IDNO is blank, the Client card draws the same
  grey "Nu este completat" it draws for a missing address (`:434`, `:672`), and nothing stops or
  marks the invoice. Both halves of a fiscal document need an IDNO; only one half says so.
- **What should happen:** at minimum the same visible line on the client side, pointing at the
  client's own record. Whether a missing client IDNO should *block* issuing is an accountant's
  question and belongs with the three e-Factura options in
  `docs/reports/2026-09-24-author-facturare-design.md` section 2, not with a terminal's judgement.
- **Severity: cosmetic.** Nothing is lost or miscomputed. The cost is that the invoice looks
  complete on screen while missing a field the state's system will want.
- **File:** `components/facturare/FacturaScreen.tsx:434`.

### G13. The invoice made from an Ieșire re-sorts its lines alphabetically, and its own comment says it does not

- **Screen:** `/facturare/nou?iesire=<id>`, the Poziții table.
- **Read:** `lib/data/facturare-create.ts:422-439`.
- **What happens:** the comment immediately above the code says the lines come
  "in ordinea in care baza le da" (`:422-425`). The code then ends with
  `.sort((a, b) => a.productName.localeCompare(b.productName, "ro"))` (`:439`), which reorders
  them alphabetically by product name. An operator comparing the delivery note to the invoice
  reads the same lines in two different orders, and a line whose product name could not be read
  sorts to the top with an empty name.
- **What should happen:** pick one and make the comment agree. The Ieșire's own order is the
  defensible choice, because the invoice is the document that follows the delivery.
- **Severity: cosmetic.** No figure changes and no line is lost.
- **File:** `lib/data/facturare-create.ts:439`.

### G14. `paid_at` accepts any day, including one before the invoice existed

- **Screen:** `/facturare/<id>`, "Marchează plătită", the Data plății box.
- **Read:** `lib/data/facturare-actions.ts:203-207` (`parseDay`), `:551-577`.
- **What happens:** the box opens on today (`FacturaScreen.tsx:222`), which is right, but
  `parseDay` checks only the shape `YYYY-MM-DD` (`:206`). Nothing compares the day to
  `issue_date`, to today, or to anything else, and the database has no constraint on `paid_at`
  either. So an invoice issued today can be recorded as paid in 2019, or in 2031.
- **What should happen:** refuse a payment day before the issue date, and refuse one in the
  future, with the Romanian sentence beside the field. Both are one comparison.
- **Severity: cosmetic.** It is a typo trap, not a silent one: the day the operator typed is the
  day that is stored and shown, so a wrong one is visible in the Istoric.
- **File:** `lib/data/facturare-actions.ts:551-554`.

### G15. Turning the year off while keeping the default prefix produces a double hyphen in every number

- **Screen:** `/setari`, the Facturare block, and thereafter every invoice number.
- **Read:** `lib/data/facturare-types.ts:69-72`,
  `supabase/migrations/0063_invoices.sql:103`, `:755-759`, `:136`.
- **What happens:** the default prefix is `RC-` (`0063:103`), and `invoice_series_for` appends
  the year only when `number_includes_year` is true (`0063:755-759`). With the year turned off
  the series is the bare `RC-`, and `invoiceNumberText` joins series and number with another
  hyphen (`facturare-types.ts:71`), giving `RC--00001`. The only constraint on the prefix is that
  it is not blank (`0063:136`).
- **Mitigating:** `invoiceNumberExample` applies the same rule, so the Setări screen shows
  `RC--00001` in its preview *before* the setting is saved. An owner who reads the example will
  see it.
- **What should happen:** collapse a doubled separator when composing the number, or say beside
  the checkbox that the prefix should not end in a hyphen when the year is off.
- **Severity: cosmetic.** It is ugly, it is visible before it is committed, and it cannot be
  fixed on invoices already issued, since a number is frozen.
- **File:** `lib/data/facturare-types.ts:71`.

### G16. The six stamp columns are writable on an issued invoice

- **Screen:** none. Reachable only by a request built by hand, by any active profile.
- **Read:** `supabase/migrations/0063_invoices.sql:519-534` (the fifteen guarded columns),
  `:574-597` (the stamper).
- **What happens:** the guard's list deliberately omits `issued_by`, `issued_at`, `paid_by`,
  `paid_at`, `cancelled_by` and `cancelled_at`, on the stated ground that
  `invoices_stamp_status` writes them (`0063:491-494`). But that function only fills a stamp when
  it is **null** (`:579-587`), so it never corrects one. An already stamped `issued_at` can be
  rewritten to any timestamp by a plain UPDATE, and the Istoric on the invoice screen is built
  entirely from these six columns (`facturare-detail.ts:170-175`).
- **What should happen:** guard the six the same way the other fifteen are guarded, allowing a
  write only where the old value is null.
- **Severity: cosmetic.** `issue_date`, the date a client reads on the document, is properly
  frozen; these six are the audit trail, not the document. Recorded because it is the same shape
  of hole as G1 and would sensibly be fixed in the same card.
- **File:** `supabase/migrations/0063_invoices.sql:519-534`.

---

## The nine things the owner asked to be tried on Facturare

GOALS.md G66. Each is marked **[database]** answered by reading the database rules,
**[tests]** answered by reading the shipped tests, or **[person]** needing somebody to click.
None is skipped.

**1. Emit twice fast (double click). [database] and [tests], and one gap.**
Safe, on a read, at three independent levels. The screen disables both Emite buttons while a
call is in flight (`FacturaScreen.tsx:267`, `FacturaEditor.tsx:604`). `issue_invoice` refuses a
non-draft on its third check (`0063:825-828`). And if two calls somehow overlap, the loser's
`update invoices ... where id = ... and status = 'draft'` matches no row, `v_row.id` is null, and
the function raises, rolling its own counter increment back with it (`0063:852-867`). **No test
covers the concurrent version of this: see G9.**

**2. Two tabs emitting at once, the number must not repeat or skip. [database] and [tests].**
Holds, and this is the best built part of the feature. The allocation is one statement,
`update ... returning`, which takes a row lock; the second transaction blocks on that row, then
re-reads it under READ COMMITTED and continues from the value the first left (`0063:841-845`, and
the reasoning at `:176-191`). A counter row rather than a sequence, specifically so that a failed
transaction rolls its allocation back and leaves no hole (`0063:166-174`).
`invoices_number_unique_per_series` (`0063:299`) would turn any failure of that reasoning into a
loud refusal rather than two invoices numbered 7. Proved by `facturare-data.spec.ts:319-359`,
five parallel HTTP calls, five distinct consecutive numbers, counter advanced exactly five times.
**But see G8: the number the confirmation sentence promises is read at page render and two tabs
are promised the same one.** The allocation is right; the prediction is not.

**3. Cancel then emit another, number kept, no gap. [database] and [tests].**
Holds. Nothing in `issue_invoice` reads a cancelled row, looks for a free number or decrements a
counter (`0063:794-796`). Proved directly by `facturare-data.spec.ts:286-308`: invoice 2 is
cancelled, keeps number 2, keeps its `issued_at`, and the next issue takes 3 and not 2.
**Related finding G2:** cancelling a *draft* first issues it, and that path takes its date and
series from the UTC clock.

**4. An invoice from an Ieșire with a line without price. [database], answered in the code.**
Refused before the screen opens, with a sentence that says what such an Ieșire usually is:
"Ieșirea are o poziție fără preț unitar, deci nu poate fi facturată. O eliberare netarifată este
de obicei către un șantier propriu." (`facturare-create.ts:184-194`). Note that a price of
**zero** is not a missing price and is allowed through deliberately
(`facturare-actions.ts:191-195`). Covered by `facturare-create.spec.ts:992`.
**Related finding G5:** the neighbouring refusal, "there is already an invoice for this Ieșire",
is a read with no constraint behind it and two tabs defeat it.

**5. Edit after emit must be refused. [database] and [tests], and it is the source of G1.**
`invoices_require_draft_to_edit` refuses any change to fifteen columns once the invoice is past
draft, with a Romanian message and errcode `restrict_violation` (`0063:510-543`), and
`invoice_lines_require_draft` covers both editing and **adding** a line (`0063:697-739`).
`facturare-actions.ts` refuses first and in better Romanian, as a courtesy on top (`:419`,
`:218-244`). Well proved by `facturare-data.spec.ts:361-445` for issued, paid and cancelled, and
again through the browser by `facturare-create.spec.ts:722-741`.
**The refusal has one door: `status` itself is not guarded, so an issued invoice can be pushed
back to draft and then edited freely. That is G1, and G10 is why no test caught it.**

**6. VAT and totals to two decimals with odd quantities (0,333 and 1000). [database] and
measured.** The rounding **order** is right and is the order that makes a printed column add up:
the line subtotal is rounded, the VAT is computed from the **already rounded** subtotal and
rounded in its turn, and the invoice foot is a sum of figures that are already rounded
(`0063:623-641`, and the reasoning at `:617-621`). **Rounding happens once per figure and on the
subtotal side of the VAT calculation, not twice in a chain**, which is the failure the brief
asked about and it is not present. The stored figures are therefore right, and at the owner's own
example (0,333 x 1000 = 333,00, VAT 66,60, total 399,60) the screen agrees with them.
**What is wrong is the screen's preview at other values: see G4, measured, 8,165 x 1,00 shows
8,16 and stores 8,17.**

**7. A client without IDNO. [database] and read.** Nothing refuses it: `invoices.client_id` only
requires a client row (`0063:229`), and no constraint anywhere mentions `fiscal_code`. The screen
shows "Nu este completat" in grey. **See G12:** the supplier's missing details get a warning
line and the client's do not.

**8. A deactivated account. [tests], thoroughly, and it holds.**
`facturare-data.spec.ts:519-563` creates a fresh account, proves it can read an invoice while
active, deactivates it, and then proves: reads answer 200 with **zero rows** rather than an
error, the settings read is empty too, a write is refused, and `issue_invoice` is refused.
That last one is the important half, because the function is SECURITY DEFINER and would otherwise
be a way around the policies; it takes the authorization decision itself on its first line
(`0063:815-818`). The empty-rather-than-error distinction also means the screen shows an empty
list and a 404, **not** the misleading "Facturarea nu este încă activă" message, because
`hasFacturareSettings` keys off the presence of an error and not the row count
(`schema-capability.ts:1167-1180`). Unsigned visitors are refused at both doors
(`facturare-data.spec.ts:565-573`).

**9. The period filter at month edges. [database] and read, and it holds.**
This is careful work and no defect was found in it. `chisinauToday()` is read once per request on
the server and passed down, so the server's day and the browser's day cannot disagree in one
render (`app/(app)/facturare/page.tsx:36`, and its comment at `:9-13`). `monthRange` works on
strings and UTC only, never on local time, and takes the last day of a month as day 0 of the next
one, so February and leap years are right (`facturare-list-types.ts:89-112`). A draft has no issue
date, so its list day is its **creation** day converted to Chișinău, and the database query is
given a day of margin at each end with the exact comparison done afterwards in JavaScript
(`facturare-list.ts:127-133`, `:150`). A half-cleared box falls back to the month end rather than
asking for the whole database, and a reversed period is swapped rather than showing an
unexplained empty state (`facturare-list-types.ts:137-139`). Covered by
`facturare-list.spec.ts:361`.
**[person]** One thing here cannot be settled by reading: whether the server process actually
runs in UTC. Every conclusion above about `current_date` in G2 and G3 assumes it does, which is
the Supabase default and what `markInvoicePaid`'s own comment assumes
(`facturare-actions.ts:537-545`). It is in the list for Max.

**10. The phone layout. [person], mostly.** Read only, see the "checked, no defect" group below.

---

## Checked, no defect

Grouped, so silence is not ambiguity. Everything here was read and nothing wrong was found.

### Group 1, the invoice database (PR #372, migration 0063)

- **Nothing is deleted, and it is locked twice.** No DELETE privilege is granted to any role on
  any of the four tables and no delete policy exists (`0063:911-923`, `:966-970`), and section 11
  re-checks both on every run (`:1052-1096`). Proved through the owner account, the strongest
  role, by `facturare-data.spec.ts:575-604`.
- **The counter is unwritable by anything but `issue_invoice`.** `authenticated` gets SELECT and
  nothing else (`0063:921`), asserted at `:1079-1082` and proved by an attempted PATCH at
  `facturare-data.spec.ts:310-316`.
- **The migration removes nothing.** No DROP TABLE, TRUNCATE, DELETE, DROP COLUMN or UPDATE of an
  existing row. The single INSERT is `on conflict do nothing` (`0063:155-156`).
- **The unit price is frozen on the line and nothing refreshes it from the catalogue**
  (`0063:367-379`). Proved by moving a catalogue price under an issued invoice,
  `facturare-data.spec.ts:447-503`.
- **Function grants revoke from `public` first, not from `anon`**, which is the trap that would
  otherwise leave anon reaching the function through PUBLIC (`0063:925-934`).
- **The `state_system_number` and `state_system_status` columns are present, nullable and
  untouched**, and nothing reads or writes them, which is correct until Max chooses one of the
  three e-Factura options.
- The four stamped moments are never cleared when the status moves on, which is right: a
  cancelled invoice that was issued on the 3rd was still issued on the 3rd (`0063:563-572`).
- `invoice_lines_sync_invoice_totals` is SECURITY DEFINER for a stated and correct reason, and it
  writes only the three computed columns of the one invoice whose line was just written
  (`0063:644-680`).

### Group 2, the Facturi list (PR #373)

- Every filter is in the URL, so a filtered list is a shareable link and Back restores it
  (`facturare-list-types.ts:126-150`).
- A bad `client=` in the address is ignored rather than passed to PostgREST, where it would have
  produced 22P02 and made the screen claim Facturare is not active (`facturare-list-types.ts:75-81`).
- The screen filters and sums nothing; the numbers come from the data layer, so the totals line
  cannot disagree with the rows above it (`FacturiScreen.tsx:12-16`).
- Romanian counts take the "de" form above nineteen, `plural(count, "factură", "facturi")`
  (`FacturiScreen.tsx:192`, `:399`), asserted at `facturare-list.spec.ts:524-531`. This was
  finding F12 of the first sweep and it is fixed here.
- A draft shows "Fără număr" rather than an empty cell or an invented number
  (`FacturaScreen.tsx:91`, `facturare-list.spec.ts:581`).
- The four status chips reuse the four tones the app already contrast-checks, so nothing new was
  added to `button-contrast.spec.ts` (`FacturaScreen.tsx:80-87`).
- The client filter lists only clients who have at least one invoice, deliberately
  (`facturare-list.ts:213-224`).

### Group 3, the invoice screen and the create flow (PR #374)

- **The line about what is not built is still accurate and is still on both screens.**
  "Tipărirea și e-Factura urmează." (`FacturaScreen.tsx:96`, `:639-641`, and the same constant on
  the list). The PDF, printing and e-Factura wait on Max choosing one of the three Moldova options
  in `docs/reports/2026-09-24-author-facturare-design.md` section 2. **Not a defect**, and the
  brief asked for confirmation that the line is still true. It is.
- No delete control exists in any state, and `facturare-create.spec.ts:869-990` proves it twice:
  once by sweeping every test id on the rendered screens, once by reading the data layer for a
  call that could delete.
- Actions are driven from one table, `invoiceActionsFor`, read by both the screen and the spec
  (`facturare-detail-types.ts:144-153`). Nothing is drawn greyed out only to refuse, which is the
  defect cards P3-61 and P3-98 were raised for.
- Emite asks first, in one sentence, before the irreversible step, on both screens
  (`FacturaScreen.tsx:249-285`, `FacturaEditor.tsx:586-622`). (The number inside that sentence is
  G8; the pause itself is right.)
- Cancelling requires a reason, keeps it and shows it (`FacturaScreen.tsx:342-354`, `:600-609`).
- A saved line cannot be silently dropped: the server compares stored ids against sent ids and
  refuses with an explanation rather than accepting a shorter list
  (`facturare-actions.ts:426-437`), and the screen disables the remove button with the reason in
  its title and a full sentence under the table (`FacturaEditor.tsx:502-534`).
- A draft loaded for editing takes its VAT rate from **its own saved lines** and not from the
  current setting, so a setting changed since does not silently rewrite an existing invoice
  (`facturare-create.ts:356-361`).
- Totals are never computed in the detail read and never sent to the database from the screen;
  the stored figures are displayed as they are (`facturare-detail.ts:17-20`).
- A cancelled invoice does **not** block its Ieșire from being invoiced again, and the reasoning
  is written down (`facturare-create.ts:118-126`).
- Three distinct read outcomes, `pending` / `missing` / `ok`, so the window before the migration
  applies does not turn every invoice into a 404 (`facturare-detail.ts:114-117`).
- Romanian database messages are translated by **errcode** rather than shown raw, because the
  schema's own messages carry no diacritics on purpose (`facturare-actions.ts:209-244`). The four
  codes mapped (23001, 42501, 23514, 02000/P0002) are the right SQLSTATEs for what 0063 raises.
- Embedded rows are sorted explicitly by `sort_order` and then by id, because PostgREST promises
  no order for an embedded row (`facturare-detail.ts:165-168`).
- Decimal commas are accepted in every numeric field, which is how numbers are written on a
  Romanian document (`facturare-actions.ts:54-62`, `:180-201`).

### Group 4, no em dash and no en dash

`grep -P '[\x{2013}\x{2014}]'` over `lib/data/facturare-*.ts`, `components/facturare/` and
`supabase/migrations/0063_invoices.sql` returns nothing. Clean.

### Group 5, the `lead=` trap

`lead=` appears on `PageHeader` throughout the new screens
(`app/(app)/facturare/page.tsx:40`, `FacturaScreen.tsx:173`, `FacturaEditor.tsx:280`) and is the
PageHeader prop meaning "lead paragraph" (`components/ui/primitives.tsx:259-270`). **Not a
defect.** Recorded so the next sweep does not report it.

### Group 6, phone layout (phone, read only)

All three Facturare screens import the shared classes from `components/ui/phone.ts` rather than
writing their own `max-md:` strings: `FacturiScreen.tsx`, `FacturaScreen.tsx` and
`FacturaEditor.tsx` each use `PHONE_TABLE`, `PHONE_ROW`, `PHONE_CELL`, `PHONE_STACK`,
`PHONE_CONTROL` and `PHONE_TAP`. That is what finding F14 of the first sweep asked for and PR
#361 delivered, and the new screens were built on it rather than around it. Tap targets carry
`PHONE_TAP`, the two-column party cards carry `PHONE_STACK`, and both tables carry `PHONE_TABLE`
so rows render as cards. `facturare-create.spec.ts:1153` and `facturare-list.spec.ts:620` both
assert 390x844 with no sideways scroll and 44px targets.
**Nothing here was rendered.** Whether it looks right is in the list for Max.

---

## Needs a person to click, for Max

Each of these takes a minute on the live app and settles something no amount of reading can.
None of them requires a developer.

1. **Open two browser tabs on the same draft invoice and press "Emite factura" in both.**
   Expected: one succeeds, the other says the invoice is no longer a draft. Check the number the
   first one got, then issue one more invoice and check it is the very next number with no gap.
   (This is G9, the untested case.)
2. **Open `/facturare/nou?iesire=<X>` in two tabs for the same Ieșire and save both.**
   Expected, if G5 is right: **two** invoices now exist for one delivery. That is the failure.
3. **On the create screen, type quantity `8,165` and unit price `1`.** Read the "Total linie"
   cell, then save and open the invoice. If the cell said 8,16 lei and the saved line says 8,17
   lei, G4 is confirmed on a real screen.
4. **Clear the "Data emiterii" box completely, then press Emite.** Check what date the issued
   invoice carries. If it is today, G3 is not reachable; if it is empty or refused, better still.
5. **After 00:00 and before 03:00 Chișinău time, cancel a draft invoice**, then look at the date
   and the series on the result. This is the only way to see G2 without waiting for New Year.
   If nobody wants to stay up, item 4 above tests the same clock through an easier door.
6. **Look at the total under the Facturi list for a month that contains a cancelled invoice.**
   Ask whether that figure is the one you would read as "what we billed". (G7.)
7. **Open an invoice for a client who has no IDNO.** Check whether anything on screen tells you
   it is missing. (G12.)
8. **Open `/facturare`, an invoice and the create screen on a real phone**, not a resized
   browser. Check nothing scrolls sideways, that every button can be hit with a thumb, and that
   the Poziții tables read as cards rather than as a squeezed table.
9. **Make an invoice from an Ieșire that has four or five lines**, and compare the line order on
   the invoice to the line order on the delivery note. (G13.)
10. **Ask Ivan, or check the Supabase project settings, what timezone the database server runs
    in.** Everything in G2 and G3 assumes UTC. If it is set to Europe/Chisinau, both findings
    shrink to nothing and should be closed.

---

## What this report did not do

- It did not open the live site, did not read a production row, and did not fetch or hold a
  credential. There are none on this machine.
- It did not fix anything. Not one line of application code, not one test, not one migration.
- It did not render a single screen, so every visual judgement above is a read of a class name
  and is marked as such.
- It did not review `app/api/extraction/**`, `app/api/documents/**` or `lib/data/extraction*`
  beyond what the merged list required, since that is Orange's track.
- It did not report the known-unbuilt items (PDF, printing, e-Factura) as defects, per the brief.
</content>
</invoke>
