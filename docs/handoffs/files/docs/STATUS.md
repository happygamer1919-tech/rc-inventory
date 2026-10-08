# STATUS - RC Inventory

Rapid Construct's stock and customer system. Everything on screen is in Romanian.
**New round of fixes (2026-09-14)** from a review of the live app. Real leads are in the system now, so every change waits for your OK before it goes live.

**Updated 2026-10-06 late night (CYAN): on track. Seven fixes are open, three need your OK. The work machine needs a restart from you**

| | |
|---|---|
| Live site | https://app.rapidconstruct.md |
| Board | `:4307` |
| Client | Rapid Construct, Chisinau (Mihai) |
| Handed over | by Ivan, 2026-09-12 |

## Done
- **A manager now sees the real owner of every task and can give a task to any colleague (2026-10-06).**
  It is merged and live, and the live site reports the new database version. One read-only database
  function was added and no row was changed.
- **Project and material imports now stop with a Romanian message when a database read fails (2026-10-06).**
  Before, a failed read could let the import carry on with wrong data. It is merged. No database change.
- **A Romanian spreadsheet with one foreign name now keeps its Romanian letters (2026-10-06).** One
  odd name no longer spoils the accents of the whole file. It is merged. No database change.
- **A product's movement history now reads every row, newest first (2026-10-06).** It no longer stops
  at 1000 rows. It is merged and the live site matches the newest version. No database change.
- **The incoming orders list and the home screen now read past 1000 orders (2026-10-06).** No order
  shows twice between pages, and the product list loads a little faster. It is merged. No database change.
- **The tasks screen got three small repairs (2026-10-06).** A bad date in the address no longer filters,
  the silent cancel button is gone, and date filters move once. It is merged. No database change.
- **A buyer typed in at the counter during a walk-in sale is now saved as a client (2026-10-06).** The
  sale shows on that client's page afterwards. It is merged. No database change.
- **The Azi screen now says "nothing to do" only when there are no calls and no tasks (2026-10-06).**
  It is merged and live. No database change.
- **The projects download now carries the client, and the import matches on it (2026-10-06).** A
  project goes back in under the same client it came out with. It is merged. No database change.
- **The Ieșire type is now locked while a slip saves (2026-10-06).** You can no longer switch it
  halfway through a save. It is merged and live. No database change.
- **A half-typed task date no longer clears the due date quietly (2026-10-06).** It is merged and
  live. No database change.
- **A half-filled line in a walk-in sale is now refused with a clear message (2026-10-06).** A line with
  a product but no quantity is no longer dropped quietly. It is merged. No database change.
- **Saving a task now writes only the fields you changed (2026-10-06).** Editing one field no longer
  overwrites the others with old values. It is merged and live. No database change.
- **Walk-in sale prices now keep their cents (2026-10-06).** A price is shown and saved exactly as
  typed, with the bani. It is merged. No database change.
- **The task list now reads every task, not just the first 1000 (2026-10-06).** It is merged. No
  database change.
- **Lead and client downloads and imports now carry the next-step date (2026-10-06).** The date for the
  next call travels in the file both ways. It is merged. No database change.
- **The client import now recognises rows that have no email (2026-10-06).** It matches them by name
  and phone, so a repeat is skipped instead of added twice. It is merged. No database change.
- **A test now proves a downloaded number reads back in as the same number (2026-10-05).** It is
  merged. It changes nothing on screen. No database change.
- **Every active client can now be picked, even past 1000 clients (2026-10-05).** Before, some were
  silently missing from the project filter, the project form, the Ieșire buyer, tasks and invoices.
  It is merged. No database change.
- **A task owner with no full name now shows their email (2026-10-05).** It used to show an empty
  name. It is merged. No database change.
- **Editing a task tied to a closed project or switched-off client now shows the name (2026-10-05).**
  It used to show an empty box. It is merged and live. No database change.
- **A walk-in sale now shows on the buyer's client page (2026-10-05).** It appears under "Consum
  materiale". It is merged and live. No database change.
- **Pressing Escape in a dropdown now closes only the list (2026-10-05).** The form and the text you
  typed stay. It is merged. No database change.
- **Downloaded lists can no longer run a cell as a formula (2026-10-05).** Phone and company numbers
  stay text in Excel. It is merged and live. No database change.
- **The error file from a client import now shows the whole row (2026-10-05).** Each unreadable row
  carries all its details, and the row numbers match Excel. It is merged. No database change.
- **Downloaded lists now open correctly in Excel on Romanian and Russian Windows (2026-10-05).**
  Columns split properly and decimals keep their comma. It is merged. No database change.
- **The home screen now shows the client's name for a walk-in sale (2026-10-05).** It used to say
  "Fără proiect". This is the fifth fix from the bug check. It is merged. No database change.
- **A switched-off staff account can no longer reach the lines of an Ieșire (2026-10-05).** One database
  rule was added and no row was changed. It is live, and the live site reports the new database version.
- **The bad phone or email import fix is live (2026-10-04).** A phone number or email that cannot be
  read is refused with a reason in Romanian. No database change.
- **Inventar and the Ieșiri list now show 50 rows at a time (2026-10-05).** There are page buttons
  ("Pagina 2 din 7"), and the stock total is added up only for the products on the open page. It is
  live. Search and the stock-level filter still read the whole list first, because doing it
  properly would need a database change. No database change.
- **A walk-in sale no longer makes every client page warn about a missing project (2026-10-05).**
  One database rule was replaced and no row was changed. It is live, and the database change has
  been applied (the live site now reports the new version).
- **Importing a big file now checks for repeats against all clients (2026-10-05).** If the client list
  cannot be read, the import stops with a clear message instead of guessing. It is live. No database
  change.
- **The import preview now lists the new rows it will add (2026-10-05).** Each row shows the values
  as they were read, so a wrong number is visible before you confirm. It is merged. No database
  change.
- **Quantities on a walk-in sale now show their decimals (2026-10-04).** This is the fourth fix from
  the bug check. It is live. No database change.
- **Spreadsheet files saved by Excel now import with the right accents (2026-10-04).** This is the
  third fix from the bug check. A file with broken letters is refused instead of saved wrong. It is
  live. No database change.
- **The Azi screen no longer says "nothing to do" when tasks are due (2026-10-04).** This is the second
  fix from the bug check. When nobody needs a call today but tasks are due, the empty message now says
  so for calls only. It is merged. No database change.
- **Prices and budgets written like 250.000 now import correctly (2026-10-04).** This is the first
  fix from the bug check. Before, such a number was saved a thousand times too small (250). Now it
  is saved as 250 000, and a number that cannot be read for sure is refused with the row error you
  already had. It is live. No database change.
- **Long lists now read the whole table correctly, but still show every row (2026-10-04).** This was
  the second speed follow-up. Products, stock and Ieșiri are read in safe pieces, so nothing is cut
  at 1000 rows and the stock numbers stay right. It is live. It does NOT show one page at a time
  and the product screen still adds up every batch: an earlier version of this line said the lists
  load only the rows on screen, and that was wrong (bug check, 2026-10-04). Pages of 50 with page
  buttons, and stock added up only for the products on the open page, are built on card P3-153 and
  are now live too (2026-10-05, see the top of this list).
- **Each screen now checks who you are once instead of two or three times (2026-10-04).** This is
  the first of the two follow-up speed fixes. It is live, and who can see what did not change. All
  617 automatic tests passed.
- **The Dublin move is proven on the real site (2026-10-03).** Ten timed visits out of ten were
  served from Dublin, and the answer time for a simple check dropped from about 566 to 217
  milliseconds.
- **The server now runs in Dublin, next to the database (2026-10-03).** It sat in Washington while
  the database is in Ireland, so every screen paid for a trip across the ocean. One setting
  moved it. No database change. The timing check that proves the gain is running now.
- **Every list can now be downloaded as a spreadsheet (2026-10-03).** Leaduri, Clienți, Proiecte and
  Inventar each have an "Exportă CSV" button that saves what you are looking at, in a form that can be
  read straight back in. That closes the whole spreadsheet piece of Ivan's list.
- **Spreadsheet import now works for clients, projects and materials (2026-10-03).** Same steps for each:
  download a model file, upload yours, see a preview of what will come in, and get a list of the rows
  that cannot be read, with the reason. The lead import you already had was brought up to the same
  standard. Euros and lei are refused on the preview with a clear message, as explained below.
- **The "Sarcini" tasks are live (2026-10-03).** A tasks tab in the CRM with filters and sorting, a
  tasks panel on each lead, client and project, and a "due today" section on the Azi screen. This
  finishes Ivan's fourth item.
- **Selling to a walk-in client is now on screen (2026-10-01).** The Ieșire form asks "Proiect" or
  "Client direct". A client can be created on the spot, with a pickup date and the lines. The list, the
  Ieșire page and the stock history all show which kind it was, and the list can be filtered by it.
- **The groundwork for selling straight to a walk-in client is live (2026-09-30).** An Ieșire can now
  be one of two kinds: to a project as before, or to a client who collects from the warehouse with no
  project behind it. Stock comes off the batches identically either way. Nothing on screen offers it
  yet, that is the next piece. Making an invoice from an Ieșire was affected along the way and was put
  right before this went live.
- **The speed measurements are done, and they point away from the app (2026-09-30).** Moving between
  sections was timed ten times each on a clean test copy. Every section came in around a fifth of a
  second: the dashboard 175, Inventar 180, Ieșiri 123, CRM 104, Facturi 120, Setări 182. Ivan reports
  two to four seconds on the real site, so the difference is not the screens themselves but something
  between them and him: the real data volumes, the hosting, or the connection. These numbers are the
  floor to measure against, and nothing was changed yet. To know what the real site does, someone
  with access needs to run the same timing there; that is a thing only you or Ivan can do.
- **Ivan's four items are planned in full (2026-09-30).** Seventeen pieces of work written up
  before any code, plus the formal decision covering the walk-in client sales. Eight places were
  found where Ivan's request does not match how the system actually works, each settled with a
  sensible default rather than guessed at. One of them is worth a word with him, see below.
- **Rapid Construct's own details now have their own section (2026-09-30).** A "Date firmă" section
  in Setări showing everything in one place: the company name, IDNO, address, bank and IBAN that were
  already saved, plus the three you approved today, the VAT registration code, the phone and the
  email. The three new ones start empty and nothing that worked before changed. This finishes the
  Setări rebuild you asked for yesterday.
- **The last ten items from the check-through are fixed (2026-09-30).** Invoice dates and numbers
  now use the Chisinau day rather than the server's clock, so nothing lands on the wrong date late
  at night. The money figure on the Facturi screen is labelled and counts only real invoices, not
  drafts and cancelled ones. A client with no IDNO gets a warning. Lines keep the order they had on
  the Ieșire. A paid date cannot come before the invoice. An invoice number no longer gets a double
  hyphen when the year is switched off. And the lead import summary can no longer lose a row from
  its counts. Every item the check-through raised is now closed.
- **You can now see who has access to the system (2026-09-30).** A "Utilizatori" section in Setări
  lists every account with its role and whether it is switched on. It is to read only: changing an
  account still happens outside the screen, and making that editable would be its own piece of work.
  This completes the Setări rebuild.
- **Setări is now a proper settings screen with sections (2026-09-29).** Like the OsteoJP admin area
  you pointed at: a sub-menu down the side, and the four blocks Setări already had moved into their
  own sections rather than sitting in one long page. The remaining sections come next.
- **Deactivated leads and clients have a place of their own now (2026-09-29).** You asked for a
  department for them. There is an "Inactivi" entry in the CRM area showing how many there are,
  listing every one with the date it was switched off, a search box, and the bring-back button on
  each row. The normal lists still keep them out of the way. It works on a phone too.
- **The four invoicing holes that could produce a wrong invoice are closed (2026-09-29).** An
  issued invoice can no longer be pushed back to draft, so nothing about it unfreezes. The line
  total on screen now matches the one saved, to the ban. A second invoice for the same Ieșire is
  refused by the database itself, so two people acting at the same moment cannot both succeed. And
  a failed save now leaves nothing behind instead of a numberless, lineless invoice nobody could
  remove. The dates on an issued invoice are frozen too. This added rules to the database and
  changed nothing already stored.
- **The second check-through is written (2026-09-29).** Eighteen items found, none of them serious
  enough to stop anyone working: ten are wrong-but-survivable, eight are cosmetic. Sixteen are in
  the new invoicing work and two in the lead import. The ones worth knowing about: an issued
  invoice can be pushed back to draft through a route the screens do not offer, which then unlocks
  everything about it; dates on issuing and cancelling use the server's clock rather than Chisinau
  time, which can put an invoice on the wrong day for a few hours each night; a line total on
  screen can be one ban below the one that is saved; two invoices could be made from the same
  Ieșire if two people act at the same moment; and the single money figure on the Facturi screen
  adds drafts and cancelled invoices into one unlabelled total. Fixes get queued next, worst first.
- **Invoicing is finished and live (2026-09-28).** The last part: you can start an invoice from
  scratch or from an Ieșire, with its lines and prices copied across. The invoice page shows both
  parties, the lines, the VAT and the totals in lei. You can save it as a draft, issue it (which
  gives it its number and locks the lines), mark it paid, or cancel it with a reason. A cancelled
  invoice keeps its number and nothing is ever deleted. Printing and the state e-Factura system are
  deliberately not in this round. Worth trying on one invoice to see whether it matches how you
  actually work.
- **Invoicing, part two of three, is live (2026-09-28).** There is now a "Facturi" entry in the menu
  and a list screen behind it: a date range starting on the current month, a filter by state, a
  filter by client, and a search by number or client name. It will be empty until invoices can be
  created, which is part three. A line under the list says plainly that printing and e-Factura are
  still to come.
- **Invoicing, part one of three, is live (2026-09-28).** The groundwork: the system can now hold
  invoices and their lines, and Setări has a Facturare block where you set Rapid Construct's own
  details (name, IDNO, address, bank, IBAN), the invoice number prefix and the VAT rate. The rate
  starts at 20 percent and is marked as needing your accountant's confirmation. Nothing is visible
  on a screen for issuing invoices yet; that is parts two and three. This added to the database and
  changed nothing that was already there.
- **The "Produse sub prag" box on the dashboard is now a preview (2026-09-27).** It shows the four
  most urgent products, the fourth fading out so it reads as a list that carries on, and a button
  underneath saying "Vezi toate" with the total count, going to the same full list as before. With
  four or fewer products there is no fade and no button. Worth a look on your dashboard.
- **The "worked-out total" rule is proven, and it was never actually broken (2026-09-27).** Ivan
  worried the rule that holds a document for review when a line total looks calculated rather than
  printed had never been tested. It had been, since 18 September; that is now written down so nobody
  wonders again, and the one test case genuinely missing has been added. What has still never
  happened is a real supplier document setting it off, which waits on the reading service sending
  one. You also have a read-only question you can run yourself to check whether it ever has.
- **When a document fails, the review screen now shows both reasons (2026-09-27).** On a real
  Matnord order the reading service gave one reason and our own check gave a different one, and only
  the first was shown. Now the service's message comes first, then one line in Romanian saying what
  our own check found, so nobody is left guessing which of the two applies.
- **A delivery note with quantities but no prices finally reaches your people (2026-09-27).** You
  decided on 18 September that these should be accepted, and that part was built, but the reading
  service was labelling them "could not be read" first and that label won, so the operator still
  saw "Eșuat". Your choice of the quick fix is now live: when such a document arrives carrying line
  items with quantities, it is treated as readable and goes to review. Nothing changed on the
  partner's side.
- **Sending a document to be read a second time no longer leaves a duplicate (2026-09-26).**
  Pressing "Retrimite" used to leave the first attempt sitting in the waiting list, so the same
  document appeared twice. Now the old one is marked as replaced and stays readable from the new
  one, but is out of the waiting list and out of every count. Nothing is deleted.
- **Units a supplier writes that the system does not know are handled properly now (2026-09-26).**
  "Litri" is understood on its own. For any other word, the operator answers once for that supplier
  and it is remembered, instead of being asked again on every document. A line that arrives with a
  quantity of zero now says on screen that it is not going into stock. Note: "set" was not added as
  a unit, because an earlier decision on this project says packaging words are never units.
- **"Importă leaduri" is live (2026-09-24).** A button next to "Lead nou" opens a four-step screen:
  upload a spreadsheet, say which column is which, see how many are new and how many you already
  have, then import. It never deletes and never overwrites, duplicates are skipped unless you
  choose to fill in blanks only, and at the end you get a file listing anything it could not read
  and why. This is the job you did by hand in the database in September, now a screen anyone can
  use. Worth trying on a small file first.
- **The plan for invoicing is written (2026-09-24).** Nothing was built, on purpose. It sets out
  what an RC invoice would be made from, what is missing today (VAT on the selling side, Rapid
  Construct's own company details, two client fields, and a way to produce a PDF), what the screens
  would look like, and the Moldova problem. It ends with the decisions listed under Blocked below.
- **The Proiecte list now behaves on a phone like the Clienti list does (2026-09-24).** It had the
  same two faults the check-through only ever reported on Clienti, so it had never been fixed. At
  the same time the phone layout rules, which were copied separately into ten screens and had
  drifted apart in eight of them, became one shared set, so they cannot drift again.
- **The "Ce s-a discutat" box is now the first thing on a lead or client page (2026-09-24).** It
  used to sit in a tab at the bottom where nobody found it. The box and the history of what
  happened now sit above the row of tabs. This was the last of the eight fixes from the
  check-through, so that whole list is finished.
- **Four small annoyances from the check-through are fixed (2026-09-24).** The Azi page no longer
  writes the stage name where the next step belongs, seven Romanian counts now read correctly
  above nineteen ("20 de produse"), two labels that were hard to read are darkened enough to read
  properly, and a PDF is no longer refused when the browser fails to name the file type.
- **The document review sheet and the product form now work on a phone (2026-09-24).** The last
  two screens the phone work had missed. Fields fit, the two buttons stack instead of running off
  the edge, and a document can actually be confirmed from a phone. The phone layout rules also
  stopped being copied into each screen separately, which is what let them drift apart.
- **Pressing "Șterge filtrele" on Leaduri no longer sends you to a different list, and the
  search box always matches what is shown, even after using the browser's Back button
  (2026-09-24).** Fourth fix from the check-through.
- **A manual order line with a product but no quantity is now refused by name, not dropped
  silently (2026-09-23).** Third fix from the afternoon's check-through, held up overnight by
  the flaky check, now live.
- **The automatic test run no longer fails a random, unrelated test each time (2026-09-23).**
  Found and fixed the actual cause; the checks below should now be reliable.
- **"Retrimite" on the document review screen now shows why a resend was refused (2026-09-22).**
  The second fix from the afternoon's check-through.
- **The Azi "late lead" gap is fixed, and a bad date can no longer silently erase a saved one
  (2026-09-22).** The first fix from the afternoon's check-through.
- **A full check-through of everything shipped since 2026-09-14 is written (2026-09-22).** It
  found 18 real problems, worth reading through, none of them serious enough to stop work but
  two worth your attention: this morning's "no longer shows as late" fix does not fully reach the
  new "Azi" page, so a lead that leaves "De reluat" can still show up there as overdue in red;
  and on some forms, typing a date wrong and pressing save can quietly erase the date that was
  already there instead of stopping you. No fixes are built yet; they get queued next, worst
  first.
- **A new "Azi" page is live (2026-09-22).** One list of everyone due today or overdue, worst
  first, with a tap-to-call phone number and a one-click "Am sunat" button that opens the note
  box and clears the reminder.
- **A "Ce s-a discutat" note box on every lead and client is live (2026-09-22).** Write a short
  note each time you speak to someone; notes list newest first with who wrote them and when,
  alongside the stage history, so it reads as one timeline.
- **A "next step" on every lead and client is live (2026-09-22).** A date and a short note (for
  example "trimit oferta") right under the stage, shown and sortable on the Leaduri list.
- **A lead moved past "De reluat" no longer shows as late (2026-09-22).** Your note: moving a
  lead to "În cultivare" or "Ofertat" kept the old call-back date, so the list wrongly called it
  late. Now that date is cleared when the lead moves on (unless a new one is typed), and only
  leads still in "De reluat" show "Întârziat".
- **The short report on documents that failed quietly since 2026-09-14 is written (2026-09-21).**
  It explains what confirming one of those would do, and comes with a read-only list you can run
  yourself in the Supabase editor when you want it. Nothing changed in the live app for this one.
- **A small security fix on the secret the document reader sends back is live (2026-09-21).**
  Extra spaces around the secret no longer make a correct one get refused. Nothing changes on the
  partner's side and no database change; the live site matches the latest version.
- **If the automatic reading of an uploaded document cannot start, the upload screen now says so
  (2026-09-21).** It used to fail quietly. The file stays saved and the message says why, in
  plain Romanian. No database change; the live site matches the latest version.
- **You can now drop a test or junk document from the review screen (2026-09-21).** A button
  "Renunță la document" with a confirm step. The document is kept and marked, never deleted, and
  it stops showing in the waiting list. It added one small database change, adding only, and the
  live site matches the latest version.
- **A half-read document with an unclear tax flag now records why, instead of just being marked
  unclear (2026-09-21).** This was the last item on the whole list. It is live, and the live site
  matches the latest version.
- **A delivery note with quantities but no prices is now accepted, not rejected (2026-09-18).**
  Quantities are kept, the price is left blank, and it goes to review with a note in Romanian.
- **A switched-off staff account can no longer read client or project records, or upload files
  (2026-09-18).** A follow-up to the earlier document security fix.
- **A document whose total was worked out rather than printed now sends itself to you for
  review, instead of being missed (2026-09-18).**
- **The five extra details the document reader already sends are now kept, not thrown away
  (2026-09-18).**
- **A step-by-step checklist for rotating your passwords and keys has been written for you
  (2026-09-18).** You still make the actual change yourself in the browser when you are ready;
  no terminal touches a password or a key.
- **Behind-the-scenes rulebook notes were tidied up, second and last round (2026-09-18).**
- **The document-reading service can send a new kind of information without anything breaking
  (2026-09-18).**
- **The Comenzi (orders) list no longer sometimes shows blank on load (2026-09-18).**
- **Every line read from a document is now checked that the quantity times the price adds up,
  and kept as read, never silently changed (2026-09-18).**
- **A number field from an extracted document no longer gets stuck empty by mistake (2026-09-17).**
- **When an upload cannot be read automatically, the reason is now shown in Romanian (2026-09-17).**
- **A failed upload now shows a clear message instead of failing silently (2026-09-17).**
- **The whole app now works on a phone screen, part 4 of 4, all done (2026-09-17).** The
  dashboard, stock reminders and every remaining screen now fit a phone.
- **A security gap on uploaded documents is closed (2026-09-17).** A document link can no longer
  be opened by someone who should not see it.
- **80 new materials are loaded into the system (2026-09-17).** Metal roof tiles, ceramic roof
  tiles, bitumen shingles and gutter systems, at their supplier prices, checked against the real
  supplier documents.
- **You can now manage the roofing models, series, thicknesses and prices yourself (2026-09-17).**
  A new screen under Setări lets you add a combination, change its price, or retire one so it
  stops being offered on new products.
- **The product, client, lead, project and order forms now work on a phone, part 3 of 4 (2026-09-16).**
  Fields stack, buttons stay reachable, and nothing scrolls sideways.
- **Bringing a deactivated lead or client back is now obvious (2026-09-16).** A "bring back" button
  sits right on its own page, and the list tells you when it is hiding inactive ones, with a link
  to see them.
- **Serie and Grosime now say why they are locked (2026-09-16).** A short note tells you to pick
  the model first.
- **The four list screens now show one card per row on a phone, part 2 of 4 (2026-09-16).**
- **The app now works on a phone screen, part 1 of 4 (2026-09-16).** Sign-in, the side menu and
  the top bar; on a phone the menu hides behind a button instead of squeezing the screen.
- **You can now change Model / Serie / Grosime on a product you already created (2026-09-16).**
- **File and date boxes now write Romanian on every browser (2026-09-16).** No more English
  wording like "Choose File", and dates show day.month.year everywhere.
- **The real Dasterum prices are loaded (2026-09-15).** All 194 verified prices now prefill
  automatically when a roofing sheet combination is picked.
- **Roofing and profiled sheet products now use a model, series and thickness picker (2026-09-15).**
  Picking them fills in the name, unit and price fields automatically.
- **Every product can now have its own picture (2026-09-15).** Added or replaced when creating or
  editing a product, shown at the bottom of the product panel.
- **The Leaduri page now has its own text (2026-09-15).** Its own subtitle and top bar, and the
  main button reads "Lead nou" instead of "Client nou".
- **Grammar fixed and builder notes rewritten for plain Romanian (2026-09-15).** "1 produse" and
  the odd sentence under Contacte are corrected, and internal notes on Comenzi and the upload
  page no longer show to the operator.
- **Search and filters on Leaduri and Proiecte now sit on one row (2026-09-15).**
- **The white text on orange buttons is now easy to read (2026-09-15).**
- **The browser tab now shows the Rapid Construct icon (2026-09-15).**
- **The upload button on Documente is live (2026-09-15).** Contracts, invoices and photos can
  now be added on a client or project page. Files can only be deleted from this feature's own
  folders, never the partner's incoming order documents.
- **A lead's Interes, Sursă and Responsabil are visible and editable now (2026-09-14).** On
  the lead's own page and in the Leaduri list, not just on the add form.
- **Tabs on client and project pages are readable now (2026-09-14).** The selected tab and
  the others show up clearly on the dark page.
- **The eight fixes from your review are now on the plan (2026-09-14).** Each one is being
  built next, one at a time.
- **380 real leads imported (2026-09-14).** Every person from Rapid Construct's spreadsheet is now a
  lead at Lead rece, with their phone and the type of work they want.
- **Extra: half-read documents from the partner are kept for review (2026-09-14).** A document the
  extraction service only partly read is no longer thrown away.
- **Extra: the document review screen shows every waiting document (2026-09-13).** It no longer
  hides the oldest ones when there are many.
- **Extra: the reminder level can be changed from the reminders list (2026-09-13).** No need to
  open the product first.
- **Extra: the chosen delivery date is written out in Romanian (2026-09-13).** Under both date
  boxes on the delivery form, so a day typed in the wrong order is easy to spot.
- **Step 5: the final check confirms the leads work is correct (2026-09-13).** All ten points
  from the handover were checked against the live site and match.
- **Step 4: the CRM menu entry is live (2026-09-13).** One menu entry opens three big buttons:
  Clienti, Leaduri, Proiecte. Old links keep working.
- **Step 3: the Leaduri screen is live (2026-09-13).** A list of leads with a filter per stage,
  overdue follow-ups on top, search by name, and an add-lead form.
- **Step 2: every client has a stage and a history of stage changes (2026-09-13).** Existing
  clients were all marked as clients. Nothing was removed.
- **Step 1: the leads work was planned on the task board (2026-09-13).**

## In Progress
- **Seven fixes are open now, none has changed the live site yet (2026-10-06, late night).** The two
  newest are the stock-taking fix, which carries a database change, and the client import
  instructions fix. The rest: the stock batches fix, the walk-in buyer picker, the walk-in invoice fix,
  the older walk-in buyer try (still a draft) and the two test repairs. Their checks are running. The
  live site still matches the newest version. The notes below are older and out of date.
- **A sixth fix is open (2026-10-06, night).** The client import instructions now state the repeat rule
  correctly. Its checks are running. No database change. The other five are still open and none has
  changed the live site yet.
- **Eight new small fixes are written and queued (2026-10-06, night).** They cover import dates, the
  walk-in price hint, the empty orders message, client picking past 1000, material file codes, import
  row numbers, Romanian plurals and stable page reads. Three more jobs are running now: landing the
  stock batches fix, two test repairs and a stock-taking fix. None has changed the live site yet.
- **A fifth fix is open, and its checks are running (2026-10-06, night).** It makes two tests check what
  they claim: the task owner name and email cases, and the Azi empty message. It changes nothing on screen
  and has no database change. The stock batches fix is still waiting on its checks too.
- **Four fixes are open, none has changed the live site yet (2026-10-06, night).** The task owner names
  fix went live (see Done). Open now: the stock batches fix for switched-off accounts (the work machine
  is merging it), the walk-in buyer picker, the walk-in invoice fix and the older walk-in buyer try.
  All four were brought up to date with the newest version. The notes below are older and out of date.
- **Four fixes are open now, none has changed the live site yet (2026-10-06, evening).** They are the
  stock batches fix for switched-off accounts, the walk-in buyer picker, the walk-in invoice fix and the
  older walk-in buyer try (still a draft). The work machine is running two jobs: one to merge the
  stock batches fix and one to bring the others up to date. The notes below are older and out of date.
- **Six fixes are open now, none has changed the live site yet (2026-10-06, late afternoon).** They are
  the task owner names fix, the stock batches fix for switched-off accounts, the walk-in invoice fix,
  the walk-in buyer picker, the older walk-in buyer try (still a draft) and a new one: project and
  material imports now stop with a Romanian message when a read fails. The work machine is running the
  job that lands the task owner names and stock batches fixes right now, and a second job to land the
  walk-in invoice fix is waiting behind it. The notes below are older and out of date.
- **A sixth fix was just submitted (2026-10-06, afternoon).** A Romanian spreadsheet that has one foreign
  name in it keeps its Romanian letters. Its checks are running. No database change. Four of the open
  fixes carry a database change and still need your OK, and the full disk is stopping the job that would
  bring them up to date.
- **Five fixes are open now, none has changed the live site yet (2026-10-06, midday).** They are the
  walk-in buyer picker (no database change) and four with a database change: switched-off accounts and
  stock batches, the walk-in invoice fix, the task owner names fix and the older walk-in buyer try.
  The four database ones go in order and each needs your OK. The product history fix went live
  (see Done).
- **A fifth fix is open and its checks passed (2026-10-06, night).** A switched-off account can no longer
  read or add stock batches or status history. It adds a database rule and removes nothing, so it
  needs your OK before it goes live. The live site still matches the newest version.
- **Four fixes are open now, none has changed the live site yet (2026-10-06, night).** They are the
  walk-in buyer picker, the walk-in invoice fix, the task owner names fix and the older walk-in buyer
  try. The last three carry a database change and need your OK. The incoming orders fix went live
  (see Done), and the work machine is still bringing the open ones up to date.
- **A fourth fix was just submitted (2026-10-06).** The walk-in buyer picker now shows phone and company
  number, and handles two buyers with the same name. Its checks are running. No database change.
- **Three fixes are open now, none has changed the live site yet (2026-10-06, evening).** They are the
  task owner names fix, the walk-in invoice fix and the older walk-in buyer try. All three carry a
  database change and go in order, each needing your OK. The walk-in invoice fix and the older buyer
  try are behind newer changes and need bringing up to date first. The newer walk-in buyer try
  has gone live (see Done). The older notes below are out of date.
- **Older note (2026-10-06, morning).** The live site and
  the newest version match. The task owner names fix (third try) is running its checks and lands by
  itself when they pass. The walk-in invoice fix failed its checks and is behind newer changes. The
  walk-in buyer is behind too. The Azi message, the lead import source and the tasks screen repairs
  are waiting on their checks. The count above of eight or nine open fixes is out of date.
- **A third try at the task owner names fix was just submitted (2026-10-06).** An account manager sees
  the real owner of every task and can give a task to any active colleague. It adds one read-only
  database function and removes nothing. Its checks are running, and it lands by itself when they
  pass, so no OK is needed from you for this one.
- **A fix for walk-in sales that could not be invoiced was just submitted (2026-10-06).** The server
  and the database now refuse that case clearly. It adds one database rule, and its checks are
  starting. It is the ninth open fix, and it will need your OK before it goes live.
- **Three new fixes were submitted and their checks are running (2026-10-06).** The Azi screen now says
  "nothing to do" only when there are no calls and no tasks, a repeat in the lead import fills the
  source only when the file brought one, and the tasks screen gets three small repairs (a bad date in
  the address no longer filters, no silent cancel button, date filters move once). None has changed
  the live site yet. No database change.
- **The work machine is bringing the stale fixes up to date now (2026-10-06).** One job is running
  that updates the open fixes to the newest version so their checks can run again. Eight fixes are
  open and most are behind. The newest-first version of that job stopped without finishing, so the
  first one is the one still running.
- **Eight fixes are open at once, none has changed the live site yet (2026-10-06).** The client import
  fix, the walk-in prices fix and saving only the changed task fields have since gone live. Five of
  the eight are now up to date with the newest version (the Azi message, half-filled walk-in lines,
  the half-typed task date, the Ieșire type lock and task owner names), so their checks can run.
  Three are still behind (the lead import source, the tasks screen repairs and the walk-in buyer).
  Some had their checks cancelled and need a fresh run: half-filled walk-in lines, the half-typed
  task date and the Ieșire type lock. Two failed their checks and fell behind newer changes: task owner names and
  the next-step date in downloads. The walk-in buyer passed its checks earlier but also fell
  behind newer changes, so it needs bringing up to date before your OK can land it. (The
  next-step date in downloads has since gone through.) Only task
  owner names and the walk-in buyer carry a database change.
- **The Azi "nothing to do" fix failed its checks (2026-10-05, late night).** It also fell behind newer
  changes, so a fix job is needed before it can go live. No database change.
- **The tasks list reading every task passed its checks (2026-10-05).** It has fallen behind newer
  changes and needs bringing up to date before it can go live.
- **Three fixes were submitted but their checks were cancelled (2026-10-05, night).** They are: saving
  only the task fields you changed, the Ieșire type locking while a slip saves, and a half-typed task
  date no longer clearing the due date silently. They also fell behind newer changes and need
  bringing up to date before the checks can run again. None has changed the live site yet. No
  database change.
- **The next-step date in lead and client downloads failed its checks again (2026-10-05).** It only goes
  live once its checks pass, and a fix job is next. No database change.
- **Task owner names for managers is submitted but its checks failed (2026-10-05).** It adds one database
  rule that removes nothing. It also needs the walk-in buyer change (see Blocked) to go live first,
  because the two database changes have to go in order. It will need its own OK after that. A second
  try was submitted this evening and its checks failed again.
- **One more finished fix has no OK to go yet (2026-10-05).** The import that showed three decimals
  stopped before any change: the team found the problem it was meant to fix is not real, and changing
  it would risk reading 250.000 as 250. It waits for a decision, nothing is touched.
- **One more finished fix is held back (2026-10-05).** Showing a switched-off owner's name in
  downloads waits until the open ones above are done: only one may be open at a time.
- **Seventh fix from the bug check is built and its checks passed (2026-10-04).** An account manager
  will be able to add a new walk-in buyer on the spot. It adds a database rule and removes nothing.
  Its checks passed and it waits for your OK, see Blocked.
- **The work machine's "did it actually save anything" check is fixed (2026-10-04).** It no longer
  marks a finished job as failed by mistake. It does not touch the app.

A separate team is fixing document handling behind the scenes; not part of your review list, so
it is not counted here.

## Blocked
- **Three database changes wait for your word (2026-10-06, late night).** The team asks you to say yes
  to the older walk-in buyer try and "merge 452" for the stock batches fix, and to allow one refused
  push for the walk-in invoice fix. The new stock-taking fix also carries a database change and will
  need its own OK. None removes a row. The team suggests yes to all.
- **The work machine's helpers need a restart when no job is running (2026-10-06, night).** Two repairs
  to how jobs are chained and checked are written but only take effect after a restart. The helper
  could not run its self-checks here, so please run them once before restarting. It does not touch the
  app.
- **Two database changes wait for your word (2026-10-06, late night).** All four open fixes were
  brought up to date with the newest version and the team left you a note with the details. The stock
  batches fix for switched-off accounts: you already said yes, so say "merge 452" and it lands once its
  checks, still running, are green. The older walk-in buyer try replaces one database rule in one step and removes no rows, so
  the safety gate will not merge it alone. It is now renumbered and up to date, and the team suggests
  yes. One push for the walk-in invoice fix was also refused by the safety gate and needs you to allow it.
- **The Mac's disk has room again (2026-10-06, evening).** About 73 GB is free, so jobs can start. The
  earlier full-disk problem is over.
- **The walk-in buyer database change also drops and recreates one rule (2026-10-06).** The safety
  gate will not merge it alone. The rule is replaced in one step and no rows are touched, and its
  number is already taken, so it needs renumbering. The team suggests yes. Tell the team yes in chat
  and it gets brought up to date.
- **One change to the live database waits for your OK (2026-10-05).** An account manager adding a new
  walk-in buyer on the spot. It replaces one database rule and removes no rows, but it changes the
  real database as soon as it is merged, so it is held for you. Its checks passed and the team
  suggests yes. The task owner names fix is stuck behind it, so your yes here unblocks both. That
  second fix adds one more database rule and removes nothing, and it will need its own OK.
- **A repair to the work machine's job runner is written but not tested (2026-10-05).** The helper was
  not allowed to run its two self-checks, so the old runner stays in place until someone runs them.
  It does not touch the app. It asked you to run the two self-checks before it is swapped in.
- **The work machine's safety gate blocked three jobs (2026-10-05).** It refused the command that
  sets up a work copy of the app, so those jobs could not start. The team says the fix is on the
  task side: the jobs get written again with plain, one-step commands, and no change to your
  settings is needed yet. The Excel download job turned out to be merged already.
- **Otherwise nothing is waiting on you.** Two extra numbers would help the speed work but do not hold it
  up: the row counts of a few tables (Supabase table editor) and the loading times of the six
  screens in Chrome on the real site.
- **One point is worth raising with Ivan, but it holds nothing up (2026-09-30).** His
  request says the system should accept euros, lei and Moldovan lei. It only accepts Moldovan lei,
  and that is a deliberate decision from early on: one currency per document, no conversion, no
  mixed totals. The database itself refuses anything else. The import screens will therefore reject
  euros and lei clearly on the preview, with a message saying why, rather than accepting them and
  failing later. If euros and lei are genuinely wanted, that is a bigger change needing its own
  decision, not a setting, and it would have to answer what a total even means when one document
  holds two currencies.
- **One thing would still genuinely help: click through invoicing yourself.** This machine cannot run a copy of your system with a database, so the check-through
  was done by reading the code rather than by using the screens. That is real work and it found
  eighteen things, but it cannot tell you whether the screens feel right. Issuing one invoice by
  hand would settle in five minutes what reading cannot.
- **Also worth doing when convenient, but neither holds the
  work up: check with your accountant whether the VAT rate should be the 20 percent being used as
  the starting point and whether Rapid Construct may print its own invoice numbers, and, if you can,
  send one invoice RC has already issued with the client's details covered up. That one document
  would settle the numbering and the layout instead of them being guessed. Printing and the state
  e-Factura system are deliberately left out of this round.

## Next
- **Making the app faster (Ivan, 2026-09-30).** Moving between sections takes two to four seconds on
  the real site. The test copy takes about a fifth of a second, so the cause is outside the screens.
  All three fixes are done and live. Next is to time the real site again to see the gain.
- **Fixes found by the bug check (2026-10-04).** A list of about two dozen small fixes is queued, one
  at a time. The first one, import numbers, is live. Still to come, for example: big import files
  that hang, and bad phone or email values in an import being refused.
- **Changing your passwords and keys is left for Ivan, much later (2026-09-18).** The
  step-by-step checklist is already written and waiting.
