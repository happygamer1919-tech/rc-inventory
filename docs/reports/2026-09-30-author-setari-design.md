# Setări as an admin area: what RC has today, and what the owner asked for

**Role AUTHOR. 2026-09-30. Goal G69, part 1 of up to three. Docs only.**

This pull request adds this one file. It writes **no application code, no migration and no board
card**, and it allocates no id. It is the map that the build parts are drafted from, so that nobody
starts moving screens around before it is agreed what the sections are and which of them RC can
actually fill.

Everything below was read against `origin/main` at `6ed0487`.

---

## Nought. Where this came from, and the one thing that could not be read

The goal line for G69 asks for a comparison with another client's project, OsteoJP, and names a
directory inside it.

**That directory could not be read, and this run made exactly one attempt.** A single `ls` of the
path the goal names was refused by the permission gate, which allows this session only three
directories: the factory folder, the RC Inventory checkout, and the RC worktrees folder. There was
no retry, not in pieces, not through another tool, and not from another directory.

**This is not a misconfiguration and it is not something to work around.** The factory's own rules
say of RC Inventory that "it is not OsteoJP and not A&I. Nothing run from this folder touches those
projects", and the gate is that rule enforced. The same thing happened on goal G57 on 2026-09-24
and was ruled on then: the refusal was correct, the gate stays shut, and the report is written from
RC's own code. One further reason stands on its own: OsteoJP holds real patient data, so opening
that directory would be opening personal data belonging to somebody else's clients.

A question was filed asking how, if at all, the shape of that screen should reach us. **No answer
had arrived when this note was written, and the factory's `inputs/` folder holds no OsteoJP
material.** So the mapping below is built from two things only:

1. **Max's own list of sections**, quoted in the goal line. It is already a list of RC sections, so
   nothing is lost by not seeing the other screen: what was wanted is written down.
2. **RC's own code**, read file by file.

Where this note would otherwise have said "as the other system does it", it describes the shape the
goal already describes in words: **a sub-menu of sections, each section a card with a clear title,
the current values visible, and an edit form.**

---

## 1. What Setări is today, honestly

One screen, at `/setari`, with four blocks stacked down the page. No sub-menu, no sections, nothing
to click before you see everything. The blocks, in the order they appear:

| Block on screen | What it does today |
|---|---|
| **Categorii** | Lists every product category with its product count. Add a new one, rename an existing one. **No delete**, and that is deliberate: a category in use cannot be removed at the database level, and the product count on each row explains why. |
| **Model, serie și grosime** | Not a block of settings at all. It is a card holding one button, "Administrează lista", which leaves for its own screen at `/setari/tabla`. The reason is written in the code: 225 combinations of sheet and metal tile do not fit in a card on a shared page. |
| **Facturare** | The invoice series prefix, whether the year goes into the number, the default VAT rate, and Rapid Construct's own company details. One save button. Built in September under goal G65. |
| **Unități de măsură** | Every unit of measure with what it is used for and how many products use it. **Read only, and marked so on screen with a chip.** Its own comment says why: the set of units is fixed in the structure of the database, so a new unit is a numbered database change and not a row typed into a screen. Every saved quantity is read through the unit of its product, which is what makes this the safe answer rather than the lazy one. |

Two further facts about the screen as it stands:

- **The whole area is already the owner's.** The route `/setari` is declared owner only, so an
  account manager who opens it gets the Romanian refusal screen instead. **Anything added under
  `/setari/` inherits that guard**, because the rule matches on the start of the address. That is
  worth knowing before the build starts: the sections below need no new permission work of
  their own.
- **The menu entry describes the screen as it was, not as it is.** In the left menu, under
  "Configurare", Setări carries the one-line description "Categorii și unități de măsură". Facturare
  has lived there since it was built and is not mentioned. That line needs rewriting in whichever
  part lands first.

---

## 2. The target shape

**A sub-menu of sections down one side of the screen. Choosing a section shows that section as a
card with a clear title, the values currently saved shown as text, and a form to change them.** The
owner should be able to open Setări and read what the system is set to without pressing anything,
and press one thing to change one thing. Nothing hides behind a save dialog and nothing is
discovered by scrolling past it.

RC already has this pattern twice, on the client page and on the project page: a row of tabs where
**the chosen tab is part of the address**, so a section can be sent as a link and the browser's back
button works. The same approach is the cheap one here, and it is the one this note recommends. No
new component library, no new dependency.

### 2b. The one constraint that decides the shape, and it is worth knowing before anything is built

**About eighteen automated tests open `/setari` today, and several of them use it as a tool rather
than as a subject.** Six test files begin their setup by going to `/setari`, typing a category name
into the box and pressing Adaugă, because that is how a test gives itself a category before it
creates a product. Others check that the orange "Doar administrator" chip on that screen is
readable, that an account manager gets the refusal screen there, and that on a phone the categories
and the units both become cards.

Two consequences, and they are not opinions:

1. **`/setari` must keep answering at its own address and must not send the browser somewhere
   else.** One test asserts that after opening `/setari` the address is still `/setari`. A redirect
   into a first section would fail it.
2. **Categorii must still be visible, with its add box, on the bare `/setari` address, without a
   click.** Otherwise six unrelated test files stop being able to set themselves up, and the cost of
   this goal lands on tests that have nothing to do with it.

**So the recommended shape is: the sub-menu appears, and the section it opens on is the catalogue
vocabulary one, which is Categorii together with Unități de măsură in a single section.** Those two
belong together anyway: both are the vocabulary the catalogue is written in, one editable and one
fixed, and keeping them in one section means the phone test that expects both on the same screen
also keeps passing. Every other section is reached from the sub-menu.

This is a recommendation, not a rule, and question 5 below puts it to Max. If he prefers Date firmă
to be the section that opens first, that is a fine answer; it simply means the build part also
updates those six setup helpers, and that should be a decision rather than a surprise.

---

## 3. Section by section: the mapping

The five sections the goal names, then a sixth thing that is already in the same corner of the menu.
The verdict column is the answer to "is this built or not".

| Section, as it would read on screen | Where its data lives | Verdict |
|---|---|---|
| **Date firmă** | The invoice settings row, which already exists | **KEPT**, reusing that row, with up to four fields added |
| **Utilizatori** | The profiles table, which already exists | **KEPT for showing. Adding a user is SKIPPED** for now |
| **Facturare** | The same invoice settings row | **KEPT. A move, not a rebuild** |
| **Opțiuni produse** | The sheet options table and its own screen | **KEPT as a section that links out**, exactly as today |
| **Depozite sau locații** | Nowhere. No such data exists | **SKIPPED** |
| **Memento stoc** (not asked for) | Per product thresholds, its own screen | **Left alone**, mentioned only so nobody wonders |

### Date firmă. KEPT, and the existing row is reused rather than copied

Max's list for this section is: name, IDNO, TVA code, address, bank, IBAN, phone, email, and a logo
if it is cheap.

**Five of those nine already exist and are already editable on screen today**, in the Facturare
block, under the heading "Datele Rapid Construct, care apar pe factură". By the labels the owner
sees, they are:

| Wanted | Exists today | Label on screen now |
|---|---|---|
| Name | **yes** | Denumirea firmei |
| IDNO | **yes** | IDNO |
| Address | **yes** | Adresa |
| Bank | **yes** | Banca |
| IBAN | **yes** | IBAN |
| TVA code | **no** | not on screen anywhere |
| Phone | **no** | not on screen anywhere |
| Email | **no** | not on screen anywhere |
| Logo | **no** | not on screen anywhere |

**The existing row is reused and is not duplicated, and that is the goal's own instruction.** The
reason is worth writing down plainly: two places holding one company's IDNO is exactly how they come
to disagree, and the one that is wrong is always the one that got printed. Date firmă therefore
reads and writes the same single row the Facturare block already reads and writes. There is no second
table, no copy, and no "company profile" alongside it.

That row is, by its own design, a table with exactly one row, enforced by the database rather than by
a convention, so there is nothing to choose between and nothing to keep in step. Reading it is open
to any signed in account; changing it is the owner's alone, refused by the database and not only by
the screen. Both of those properties carry over to the new section for free.

**What the three missing text fields would cost:** three additive, optional columns on that same
one row table, each empty for the existing row, so nothing that works today changes. Named plainly,
they would be **the VAT registration code, the phone and the email**. The migration is not written
here and must not be: this is a docs only pull request, and in this repository merging a migration
applies it to the live database within about two minutes. One further point in favour of these
three: the earlier invoice design note already identified the client's VAT registration code as a
separate number from the IDNO, so the same distinction on Rapid Construct's own side is consistent
rather than new.

**The logo is the one item this note does not recommend doing in the first build.** It is not hard
and it is not free. RC already stores pictures privately and shows them through short lived signed
links, which is how a product photograph works, so the mechanism exists and a logo would follow it.
But a logo is only worth having once something puts it on a document, and the invoice PDF is not
built yet. Question 1 below puts this to Max, with the recommendation that the logo waits until
there is a document to print it on.

### Utilizatori. KEPT for showing. Adding a user is SKIPPED, and here is exactly why

**What can be shown today, with no new permission and no new access of any kind:**

The profiles table already carries, for every account: **the email, the full name, the role, whether
the account is active, and when it was created.** Two roles exist and no more: owner and account
manager. So a section listing every account with its name, its email, its role in Romanian, and an
active or inactive marker is **a plain read of data the system already holds**.

**And the owner already sees all of it.** The rule on that table says a person sees their own row,
and the owner sees every row. Since the whole Setări area is owner only already, this section shows
the complete list to exactly the person allowed to open the screen, with nothing added. The system
already relies on this: the list of people a client can be assigned to is read from this same
table today.

**Changing a role, or switching an account off, is also already permitted at the database level** to
the owner, so those two actions are buildable without touching permissions. Whether they should be
in the first build is question 2 below; the recommendation is that they wait one part, so that the
first thing that ships is a screen that only reads.

**Adding a new user is a different matter, and it is skipped.** Creating an account means creating a
sign in, which is a privileged operation against the authentication service, not a row typed into a
table. Two facts decide it:

- **Nothing in RC does this today.** There is no signup page anywhere, on purpose, and the code that
  creates accounts does not exist. The comment on the table says how accounts are made: by hand, in
  the Supabase dashboard, alongside the sign in.
- **It would need the privileged service key.** That key already exists in production, so strictly
  speaking **no new secret would have to be created**, and this note says so rather than pretending
  otherwise. But no terminal here holds it, may fetch it, or can test against it, and turning a
  screen button into an account creator is a new privileged path that deserves its own decision
  rather than arriving inside a settings screen.

**So the honest recommendation is: show the accounts, do not create them from here.** The section
carries one plain Romanian sentence saying that a new account is set up by the administrator outside
the application, so that nobody looks for a button that is not there. This is the same courtesy the
Unități block already pays, and it works: a screen that explains its own limit does not generate a
support question.

### Facturare. KEPT. A move, not a rebuild

The series prefix, the year in the number, and the default VAT rate are built, working, and already
on this screen. This section is **the same block, shown under the new sub-menu**, and it should stay
one save button over one form.

Two things must survive the move and should be named so they are not lost in a tidy up:

- **The note beside the VAT rate**, which reads "De confirmat cu contabilul." It is not decoration.
  Nobody on the building side has an accountant's answer about what rate applies to construction
  materials in Moldova, and a screen showing 20 per cent with no note would present a guess
  as a fact.
- **The Romanian line that appears when the invoice structure is not yet applied** to whichever
  database the application is pointed at. It is the reason the screen degrades instead of falling
  over, and it is checked by a test.

Since Date firmă and Facturare read the same one row, the split between them is **presentational
only**: Date firmă holds who Rapid Construct is, Facturare holds how its invoices are numbered and
taxed. That is a good split for a reader and it costs nothing, but the build must keep in mind that
two forms now write to one row, so **each form saves only its own fields** and never writes back a
blank over the other's.

### Opțiuni produse. KEPT, as a section that links out, and the reason is kept with it

This is the existing Model, serie și grosime screen: 225 combinations of sheet and metal tile, each
with its own price, added and retired by the owner.

**It becomes a section in the sub-menu, and that section links out to its own screen, exactly as the
card on the page does today.** The reason is already written in the code and has not stopped being
true: 225 rows do not fit in a card on a shared page. Pulling that list inside the new menu would
make the settings area the slowest screen in the application and would gain nothing.

What changes is only the way there: instead of a card floating in the middle of a stack, it is a
named entry in the sub-menu, and the screen it opens already has an "Înapoi la Setări" link back.

### Depozite sau locații. SKIPPED, and this was searched for rather than assumed

The goal says to include this **only if RC already has such data**. It does not.

The whole of the database structure, the data layer, the screens and the boards were searched for a
warehouse, a location, a depot or a stock place. **There is no such table, no such column, and no
such field.** What the search did turn up is the opposite: a decision, already recorded in two
places, that RC is one warehouse. The inventory screen says it in its own opening comment, that
there is a single warehouse and therefore no location column; the invoice list says it again, that
there is no location filter on that screen and the design note explains why.

**So this section is not built and is not invented.** A Depozite section on a system with one
warehouse would be an empty page with a heading, and an empty page with a heading teaches the owner
that the settings area is padded. If Rapid Construct ever runs a second store, that is a change to
how stock is counted, not a settings screen, and it would be a goal of its own.

### Memento stoc, which nobody asked about

Worth one line so it is not a loose end. There is a second screen in the same menu group,
"Memento stoc", holding per product thresholds and the alerts they trigger. It is **not** part of
this goal and this note does not move it. It is per product data rather than a system setting, so it
belongs where it is, beside the catalogue rather than inside Setări. Noted only so that the next
reader does not wonder whether it was missed.

---

## 4. What each part would be, and their order

Three parts after this note, each its own pull request, each its own card. **None of them carries a
migration except part 2, and part 2 only carries one if Max says yes to any of the three missing
text fields.**

**Part 1. The sub-menu, and nothing else moves.**
Build the section menu and the section frame on `/setari`. Move the four blocks that already exist
into sections: the catalogue vocabulary one, which opens first and holds Categorii together with
Unități de măsură; Facturare; and Opțiuni produse as the entry that links out. Rewrite the left
menu's one line description of Setări, which still says "Categorii și unități de măsură". Romanian
with diacritics, phone layout included, desktop unchanged above the phone width. **No new data, no
migration, no new permission.** Its proof is that every existing test that opens this screen still
passes, plus new checks that each section is reachable by its own address and that the categories
box is still on the bare address.

**Part 2. Date firmă, and the only part that can carry a migration.**
Add the Date firmă section, reading and writing the row that already exists. If Max wants the VAT
registration code, the phone or the email, this part adds them as **additive, optional columns, one
per field, on that same one row table**, with the existing Facturare block untouched. The migration
would be the next number in sequence, and the owner is told before it merges, because merging it
changes the live database. **If Max wants none of the three, this part carries no migration at all**
and is simply a second view of fields that already exist. The logo is not in this part.

**Part 3. Utilizatori, read only.**
Add the Utilizatori section: every account with its name, its email, its role in Romanian, and
whether it is active, plus the one Romanian sentence saying a new account is created by the
administrator outside the application. **No migration**, no new permission, and no writing. If Max
answers question 2 by asking for the role switch and the on and off control, those are a fourth part
rather than an extension of this one, because a screen that can switch an account off deserves its
own proof.

**The order matters in one specific way:** part 1 must land before parts 2 and 3, because both of
them add a section to a menu that part 1 creates. Parts 2 and 3 are independent of each other and
either can go first.

---

## 5. The questions only Max can answer

Five, each with a recommended default, so that nothing waits on an answer that could be assumed and
corrected later.

**1. Is the logo wanted at all?**
It would appear nowhere today. The invoice PDF, which is the only document that would carry it, is
not built. Storing it is straightforward, since RC already keeps pictures privately, but it is work
that shows the owner nothing until there is a document.
**Recommended default: not yet. Revisit it when the invoice PDF is built, and add it then, in the
same piece of work that puts it on the page.**

**2. Is adding a user in scope, given that no terminal may hold a credential?**
Showing the accounts is free. Creating one is a privileged operation against the sign in service.
The key it needs already exists in production, so nothing new would have to be created, but no
terminal here can hold it or test against it, and a settings screen quietly gaining the power to
create logins is a decision rather than a detail.
**Recommended default: no. Show the accounts, and say on screen in one Romanian sentence that a new
account is set up by the administrator outside the application. If Max wants role changes and an on
and off switch for an existing account, both are already permitted to the owner at the database
level and can be a small fourth part.**

**3. Should Unități de măsură stay read only?**
Its own comment records why it is: the set of units is fixed in the structure of the database, so a
new unit is a numbered database change, and every saved quantity is read through the unit
of its product.
**Recommended default: yes, stay read only, with the chip and the sentence that explain it. This is
the same answer a comparable question got when goal G59 was narrowed, and it was the right one:
a button that always fails is worse than a button that does not exist.**

**4. Which fields of Date firmă does Rapid Construct actually need?**
Three are missing and each is one small addition: the VAT registration code, the phone and the
email. There is no harm in adding all three and no benefit in adding one that stays empty forever.
Worth asking Mihai rather than guessing, since he is the one who knows what has to appear
on a document.
**Recommended default: add all three. They are one change together, and a company that invoices will
want all three sooner or later. If Mihai says Rapid Construct is not VAT registered, then the VAT
code is dropped and the other two still go in.**

**5. Which section should Setări open on?**
The recommendation in this note is the catalogue vocabulary one, Categorii together with Unități,
because six unrelated test files use that box to set themselves up and one test asserts that the
address does not change when the screen opens. Opening on Date firmă instead is perfectly
reasonable and slightly nicer to read; it simply means part 1 also updates those six setup helpers.
**Recommended default: open on Categorii and Unități, and revisit once the area is in use. If Max
prefers Date firmă, say so and part 1 does the extra work deliberately rather than discovering it in
a red test run.**

---

## Summary for Max, in plain words

Setări today is one page with four things stacked on it and no menu. What was asked for is a menu of
sections with each section showing what is set and letting you change it. **Four of the five sections
asked for can be built, and one cannot, because the data for it does not exist.**

- **Date firmă**: five of the nine fields you listed are already on the screen and already saved,
  in the Facturare block. Three more are small additions. The logo is the only one worth waiting on,
  until there is an invoice document to print it on. **The existing company details are reused, not
  copied**, so Rapid Construct's IDNO stays in one place.
- **Utilizatori**: the accounts, their role, and whether each is switched on can all be shown today
  with no new access at all. **Creating a new account is not built from here**, because that is a
  privileged operation on the sign in system and this machine holds no keys.
- **Facturare**: already built. It moves under the new menu. Nothing is rebuilt.
- **Opțiuni produse**: already built and already has its own screen, because 225 rows do not fit in
  a card. It stays its own screen and becomes an entry in the menu.
- **Depozite sau locații**: **does not exist and is not invented.** RC is one warehouse, and that is
  recorded in the code in two places. An empty settings page with a heading would be worse
  than no page.

**The other system could not be read.** One attempt was made and the permission gate refused it, as
it is built to and as it already did once in September. Nothing was retried. This map is therefore
written from your own list of sections, which was already a list of RC sections, and from RC's own
code. Nothing was guessed from a screen nobody here has seen.

**Three build parts follow, in order, and only one of them can touch the live database**, and only
then if you want the three missing company fields. You are told before that one merges.

Role AUTHOR.
