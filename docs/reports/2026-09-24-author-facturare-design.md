# Facturare: a design report, written before anything is built

Role AUTHOR. Card: none, and deliberately none. Date 2026-09-24.

**Nothing is built from this report.** It exists so that Max can decide. It adds no application
code, no migration, no board card and no ruling. It ends with six questions, not with a plan to
start work. The last section says what a card would have to say once those questions are answered,
and that card is not authored here.

Where this came from: Ivan, relayed by Max on 2026-09-24, "create a section for invoicing, like we
did for OsteoJP". Goal G57 in the factory's own goal list.

---

## Nought. Where the material in this report came from, and what could not be read

This matters more than it usually would, because the brief asked for a comparison with another
system and that comparison could not be made.

### What was read, and it is the whole basis of sections 1, 3 and 4

Every path below is in this repository and was read in full or in the part that matters:

- `components/outbound/OutboundScreen.tsx`, the Ieșiri materiale screen
- `lib/data/outbound-types.ts`, `lib/data/outbound.ts`, `lib/data/outbound-actions.ts`
- `lib/data/deviz-types.ts`, `lib/data/deviz.ts`
- `supabase/migrations/0025_deviz.sql`, the estimate tables, read closely as the pattern to copy
- `supabase/migrations/0013_clients.sql`, the client record and its IDNO
- `supabase/migrations/0044_documents.sql`, the document store
- `lib/data/clients-types.ts`, `lib/data/clients.ts`, `lib/data/projects-types.ts`
- `lib/nav.ts` and `components/layout/Sidebar.tsx`, the menu
- `lib/data/format.ts`, how money is printed today
- `lib/reminders/resend.ts`, how email is sent today
- `lib/data/reconciliation.ts` and `lib/data/extraction-types.ts`, where VAT already appears
- `package.json`, for what the project can and cannot do without a new dependency

### What could NOT be read, and what that costs

**No file in OsteoJP was opened.** The brief named seven paths there and the first one refused:

    ls /Users/sm33xy/Projects/OsteoJP/apps/web/lib/invoices

    ls in '/Users/sm33xy/Projects/OsteoJP/apps/web/lib/invoices' was blocked. For security,
    Claude Code may only list files in the allowed working directories for this session.

That is a session working-directory gate. It is not a file permission, not a missing folder and not
anything about OsteoJP. The brief says to stop at that point rather than retry in pieces or through
another tool, so there was one attempt and then a stop. The factory question
`mailbox/questions/q083-g57-osteojp-read-denied.md` records it. YELLOW hit the same gate on the same
day while preparing the task, so this is the second time.

The paths that were therefore NOT read, and that this report does not draw on, are:

- `apps/web/lib/invoices`
- `apps/web/lib/integrations/invoicexpress`
- `apps/web/app/api/inngest/invoicexpress`
- `docs/pdf-templates/invoice-fatura-recibo.html`
- `docs/pdf-templates/osteojp-invoice-template.pdf`
- `supabase/migrations`, for its invoice tables
- `apps/web/app`, for the Faturação screen

No screenshot of the OsteoJP screens was available to this run either. Nothing was placed in the
factory's `inputs/` folder, and the browser was not opened.

**So the honest statement of provenance is this.** Everything in sections 1, 3 and 4 comes from RC's
own code, read today. Everything in section 2 is about Moldova and could never have come from
OsteoJP at all. The only thing taken from OsteoJP is the SHAPE OF ITS SCREEN, and it is taken from
Max's own one-line description of it rather than from its code:

> a sidebar entry, a date range, a state filter, a location filter, an invoice list, and the words
> "Emissão via InvoiceXpress, pagamento via IfThenPay/Stripe"

Section 3 copies that shape, minus the location filter, for the reason given there.

**What the refused read actually cost, stated plainly rather than conveniently.** It cost craft
details, not decisions. OsteoJP would have shown how a finished invoicing feature stores its
numbering series, how it keeps a cancelled invoice, how it fills a PDF template, and how it queues
and retries the issuing step. Those are worth copying and cheaper to copy than to reinvent. None of
them is a decision Max has to make, and none of them blocks any of the six questions in section 5.
What OsteoJP could not have helped with is the one genuinely hard part, which is section 2.

---

## 1. What an RC invoice is built from

### The short answer

An RC invoice is an **Ieșire** with prices, a client's fiscal identity, VAT, and a number that an
accountant will accept. RC already has the first half of that and none of the second half.

### What already exists and is genuinely ready

RC records an **Ieșire** (an outbound release of materials to a building site). One Ieșire is:

- a reference in the form `IES-2026-0001`
- a **project**, which is required, and through the project exactly one **client**
- a date it was issued, and a date it was shipped
- a state, `În așteptare expediere` or `Expediată`
- a list of **lines**, and each line is one product with a quantity, the product's unit of measure,
  and a **sale price in MDL**

That line is the invoice line. There is no work to do to invent one. `outbound_lines` already
carries `product_id`, `quantity` and `sale_price_mdl`, and the product supplies the code, the name
and the unit. An invoice line is that row plus arithmetic.

A second, closer model already exists and is the one to copy: the **deviz** (the estimate). It is
worth describing because whoever builds Facturare should build it as a sibling of the deviz rather
than as something new:

- it belongs to a project
- it has versions, and one version number cannot be used twice on one project
- it has states stored as English words in the database and shown as Romanian words on screen:
  `Ciornă`, `Emis`, `Acceptat`, `Respins`, `Expirat`
- **a draft can be edited and nothing past draft can be**, and that is enforced by the database
  itself, not by the screen. The screen only greys the buttons out so the operator does not walk
  into a refusal.
- **a line's price is frozen when the line is written.** The catalogue price of today is read
  separately and shown next to it, so the operator can see that a product got more expensive without
  the estimate silently changing under a client who already holds a copy of it.
- the foot of it adds up as `Subtotal`, `Adaos`, `Total`, and that arithmetic lives in ONE function
  that both the list and the detail page call, so two screens cannot show two different totals
- money is rounded to the ban exactly once per displayed figure, because a column that does not add
  up is a document nobody signs

Every one of those six properties is the right property for an invoice, and five of them are more
important on an invoice than on an estimate. **The frozen price is the load-bearing one.** An
invoice whose total changes because a catalogue price changed is not an invoice.

Two more useful things already exist:

- `document_kind` already includes the value `factura`, and the `rc-docs` document store already
  accepts PDF files up to 20 MB under a client folder and a project folder. An issued invoice's PDF
  has somewhere to live, today, with no new storage work.
- email sending through Resend already works, never throws, and reports its own failures as a
  reason rather than breaking the caller. Sending an invoice to a client is a small piece of work,
  not a new capability.

### What is missing today, item by item

This is the real content of this section. Each item is a thing somebody has to decide or build.

**1. VAT does not exist anywhere on the selling side.** This is the largest gap. The word TVA
appears in exactly two places in the whole system, and both are on the BUYING side: when RC reads a
supplier's invoice, the extraction records a VAT rate and a VAT amount, and the reconciliation code
checks that the lines plus VAT add up to the printed total. So the system already understands VAT
arithmetic. It has simply never had to produce it. The deviz has no VAT column at all: its total is
subtotal plus margin, full stop. An invoice cannot work that way.

**2. The client record has an IDNO but nothing else an invoice needs.** `clients.fiscal_code` holds
the IDNO, it is unique among the clients that have one, and it is deliberately free text with no
format check, because an IDNO copied off a real contract is the truth and a regex that rejects a
valid one is worse than no check. Good. But an invoice in Moldova also needs, at minimum, the
client's registered address and, if they are a VAT payer, their VAT registration code, which is a
different number from the IDNO. Address exists. **The VAT code does not exist as a field.** Bank
details do not exist as a field either, on the client or on Rapid Construct itself.

**3. Rapid Construct's own details are nowhere in the system.** An invoice has two parties on it.
RC's own name, IDNO, VAT code, registered address, bank and IBAN are not stored anywhere. There is
no settings table holding the issuer. That is a small piece of work and it is easy to forget until
the first PDF comes out with a blank half.

**4. A price on an Ieșire line is optional.** `sale_price_mdl` is nullable, the create path accepts
an empty price and writes null, and the screen does not require one. This is correct for what an
Ieșire is today: it is a stock movement to a building site, and releasing ten bags of cement to
your own site does not have a price. It means an invoice cannot be built from an arbitrary Ieșire.
Either the invoice screen refuses an Ieșire with unpriced lines and says so in Romanian, or the
operator fills the prices in while creating the invoice. That is a decision, and it is the kind that
is cheap now and expensive later.

**5. Money is printed to the whole leu.** `formatMoney` rounds to zero decimal places. That is right
for a stock valuation on a dashboard and wrong for an invoice, where 1 234,56 MDL is the amount owed
and 1 235 MDL is a different amount. Invoice screens and the PDF need a two decimal format. The
underlying figures are stored with decimals, so this is a display fix, not a data fix.

**6. There is no PDF capability at all.** The project has fifteen dependencies and none of them
makes a PDF. PDF appears in the codebase only in the sense of reading one that a supplier uploaded,
to count its pages. Producing a document is new work and section 2 puts a number on it.

**7. Nothing in the system knows about e-Factura.** There is no mention of it, of the State Tax
Service, or of any electronic signature, anywhere. Section 2 is about that.

### Numbering series

**Today RC numbers an Ieșire by reading the highest existing reference and adding one.** The
function reads the last `IES-2026-NNNN`, takes the number, adds one, and pads it to four digits. If
two operators create an Ieșire in the same second, one of them gets a Romanian message saying a
release with that reference already exists and asking them to try again.

**That is acceptable for an Ieșire and it is not acceptable for an invoice.** An Ieșire reference is
an internal label. An invoice number is a legal object: an accountant needs the series to be
continuous, with no gaps and no duplicates, and "try again" produces a gap every time it happens. If
invoice numbers are allocated by RC at all, they have to be allocated by the database in a way that
cannot produce two of the same number and cannot silently skip one.

The deviz already shows the pattern for the "cannot produce two" half: one version number per
project, enforced by a unique constraint, so a wrong answer fails loudly instead of quietly writing
two rows that both claim to be version 1. An invoice series needs the same thing plus a guarantee
about gaps, and the gap guarantee is the harder one, because a failed attempt that has already taken
a number leaves a hole.

**And this may not be RC's decision to make at all.** See section 2 and question 5: under Moldova's
e-Factura system the number and series of a fiscal invoice are allocated by the state system, not by
the seller's software. If RC issues through e-Factura, RC does not choose the number. If RC issues
only internal documents, RC chooses the format and the accountant has to accept it. Those are two
completely different pieces of work, and question 1 decides which one gets built.

### The states

Four states, matching what Max asked for, stored as English words in the database and shown as
Romanian on screen, exactly as the deviz and the project statuses already do:

| Stored | On screen | What it means |
|---|---|---|
| `draft` | `Ciornă` | Being prepared. Freely editable. Not a document yet, and not counted anywhere. |
| `issued` | `Emisă` | Issued to the client. Frozen. The client holds a copy. |
| `paid` | `Plătită` | Paid. Still frozen. |
| `cancelled` | `Anulată` | Cancelled. Still on the list, still readable, still numbered. |

The one rule that matters: **only a `Ciornă` can be edited.** Once it is `Emisă`, the client holds a
copy, and a document that changes after the other party has it is a dispute rather than a document.
This has to be enforced by the database, the way the deviz enforces it, and not by the screen. The
screen disables the buttons so nobody meets a raw refusal, but the screen is a courtesy and the
database is the guarantee. That distinction is already written into this project and should not be
re-litigated.

A correction to an issued invoice is therefore not an edit. It is a cancellation plus a new invoice,
or a credit note, and a credit note is a separate decision that this report deliberately leaves out
of scope rather than inventing.

### THE RULE: AN INVOICE IS NEVER DELETED

**Nothing is ever deleted. An invoice is cancelled, never removed.** This is not a preference and it
is not a nicety. It is this repository's doctrine, it is written into the rules that bind every
piece of work here, and on invoices it is also the thing an accountant and a tax inspector require:
a numbered series with a document missing from the middle of it is a problem, and a numbered series
with a document marked cancelled is normal bookkeeping.

Concretely, three things follow, and they should be in the card whenever a card is written:

1. The invoice tables carry **no delete permission for any role**, owner included. That is how
   `outbound_issues` and `devize` already work, and the document store's single deliberate
   exception, which lets an owner delete a file uploaded to the wrong client, must NOT be extended
   to invoices.
2. **A cancelled invoice keeps its number.** The number is not returned to the pool and not reused.
   The list shows it as `Anulată`.
3. **Test invoices are cancelled, not deleted**, like all other test data here. If Facturare is
   ever demonstrated on the live system with made-up figures, those invoices are cancelled
   afterwards and stay visible. Anyone who finds this inconvenient is asking for the rule to be
   broken, and the rule is the point.

---

## 2. The Moldova question, stated plainly

### The problem in four sentences

OsteoJP is in Portugal. It issues invoices through InvoiceXpress and takes payment through
IfThenPay and Stripe. **Rapid Construct is in Moldova, and not one of those three providers issues a
Moldovan fiscal invoice.** So the part of OsteoJP that would have been most useful to copy is
precisely the part that cannot be copied, and the choice below is a choice RC has to make from
scratch.

In Moldova the invoice of record goes through **e-Factura**, the state system run by the State Tax
Service. That is the thing OsteoJP has no equivalent of: in Portugal the invoice is issued by a
private provider that reports to the state, and in Moldova the invoice is issued by the state
system itself.

### What must be checked with the accountant before any option is chosen

**This report is written by someone reading code, not by a Moldovan accountant, and the following
three things decide the whole question.** They are stated here as questions rather than as facts on
purpose, and question 2 in section 5 is the one that gets them answered.

1. **Is Rapid Construct registered for VAT?** If yes, it issues a `factură fiscală` and VAT is on
   every invoice. If not, it issues a simpler invoice with no VAT. The whole shape of the feature
   changes on this answer, and nobody on the build side knows it.
2. **Is e-Factura mandatory for Rapid Construct's sales, today?** As far as this report can
   establish, it is required for sales to public and budget-funded institutions and has been
   extending in phases toward wider mandatory use. Whether it currently binds a private
   construction supplier selling to private clients is exactly the kind of thing that changes by
   government decision and must be confirmed rather than assumed.
3. **Can Rapid Construct lawfully print its own invoice numbers?** A fiscal invoice in Moldova has
   historically been a controlled form, with its series obtained from the tax service or
   self-printed only under authorisation. If that still holds, then option (a) below is NOT a legal
   invoice, whatever it looks like on paper, and calling it one would be the single most expensive
   mistake available in this whole design.

**If the answer to 3 is that RC cannot print its own fiscal numbers, option (a) does not disappear,
but it stops being an invoicing feature and becomes a payment request feature.** That is still
useful, and it is described honestly as such below.

### The three options

Effort is given in developer-days, estimated from this codebase by somebody who has just read it.
Money is given as what drives the cost rather than as a figure, because a figure would be invented:
the licence prices, the signature certificate cost and the accountant's fee all have to come from a
quote, and question 2 asks for them.

---

#### Option (a): internal invoices, PDF only, nothing sent to the state

RC creates the document, numbers it, produces a PDF, and emails or prints it. Nothing leaves for the
State Tax Service. The accountant takes the PDF and does whatever they already do.

**Effort: about 6 to 9 developer-days.** One migration, one list screen, one detail screen, one
create flow, a PDF, and the tests this repository requires for all of it. The PDF is the largest
single piece, because the project has no PDF capability today and one has to be chosen and added.

**Cost: essentially only build time.** No licence, no state registration, no electronic signature,
no third party.

**What it does NOT do, and this is the important part:**

- **It probably does not produce a legal fiscal invoice.** See check 3 above. If RC cannot print its
  own fiscal series, this produces a `factură de plată` or a proformă: a document that correctly
  tells a client what they owe and that is not the tax document. The real fiscal invoice still gets
  issued somewhere else, by hand.
- **It therefore probably means every invoice is entered twice**, once in RC and once wherever the
  real invoice is issued. Two systems holding the same numbers with nothing reconciling them is how
  the numbers start disagreeing.
- It reports nothing to the state and answers nothing that the state asks for.
- It knows nothing about whether the client paid.

**When it is the right answer anyway:** when RC's job is to tell the client what they owe and the
accountant's job is the fiscal document. That is a perfectly coherent division of labour, it is
probably what happens today on paper, and it is by far the cheapest way to make the site useful. It
just has to be NAMED honestly on screen, as a payment request rather than as a fiscal invoice, or
somebody will rely on it as something it is not.

---

#### Option (b): an export file the operator uploads to e-Factura by hand

RC does everything in option (a), and adds a button that produces a file in the format e-Factura
accepts. The operator signs in to the state system, uploads the file, and the state system issues
the real invoice and allocates the real number. Then the operator writes that number back into RC,
or RC keeps its own number and records the state one beside it.

**Effort: about 9 to 14 developer-days**, so roughly 3 to 5 days on top of option (a). The extra
work is the export format itself and getting it exactly right, which means somebody has to obtain
the current specification and, realistically, fail a few uploads before it is accepted. The
uncertainty in that range is honest: an export format nobody on the team has seen is not something
to quote tightly.

**Cost: build time, plus an electronic signature for whoever signs in.** In Moldova that means a
mobile signature or a token from a certification centre, per person, with a periodic renewal. Modest
but real, and it is a per-person cost, so it matters whether one person or three will be issuing.

**What it does NOT do:**

- **It does not remove the manual step.** Somebody signs in and uploads, every time, or in batches.
- It does not remove the two-numbers problem, it manages it: RC's number and the state's number both
  exist and have to be kept next to each other deliberately.
- It does not tell RC whether the client paid.
- It leaves a real gap between the moment RC says `Emisă` and the moment the state system actually
  issues, and the screen has to be honest about that gap rather than claiming the invoice is issued
  when it is only exported.

**When it is the right answer:** when the invoice volume is low enough that a human upload is not a
burden, but the invoice genuinely has to reach the state. For a construction supplier issuing a
handful of invoices a week this is very likely the sweet spot.

---

#### Option (c): a direct e-Factura integration

RC talks to the state system's interface directly. RC sends the invoice, the state system issues it,
returns its number and its status, and RC records both. No human upload.

**Effort: about 20 to 35 developer-days, and the spread is the honest part.** The build is not the
hard bit. The hard bits are, in order: getting access at all, which means registration and an
agreement with the State Tax Service rather than signing up on a website; handling an electronic
signature from a server, which is a different and much harder problem than a person signing in a
browser, and may require a hardware token or a specific service; and testing against a system you
cannot reset. On top of that this project has no Docker and no database tooling on the machine it is
developed on, so an integration with an external state system cannot be exercised locally at all and
every attempt costs a CI run.

**Cost: build time, plus registration, plus a server-side signing arrangement, plus ongoing
maintenance.** The maintenance is the part people forget: a state interface changes when the state
decides, on the state's timetable, and when it changes an invoicing system that depends on it stops
working until somebody fixes it. That is a standing commitment, not a one-off cost.

**What it does NOT do:**

- **It does not handle payment.** Nothing in any of these three options does. e-Factura issues
  invoices; it does not take money. Whether a paid invoice gets matched to a bank payment is a
  separate question and it is question 6.
- It does not remove the need for the accountant.
- It does not become cheaper if RC issues few invoices. It costs roughly the same to build for five
  invoices a month as for five hundred, which is the whole argument against it at low volume.

**When it is the right answer:** when the volume is high enough that a manual upload per invoice is
a real cost, or when a rule requires it. Not before.

---

### A note on payment, since OsteoJP's description mentions it

OsteoJP takes card payment through IfThenPay and Stripe. **That is a separate feature from
invoicing and it is not in scope for any of the three options above.** It is worth saying so
explicitly, because "like OsteoJP" could reasonably be read as including it. A construction supplier
invoicing companies on terms is a bank transfer business, not a card business, and building card
payment for it would be building the wrong thing. If RC ever needs to know that an invoice was paid,
question 6 is where that starts, and the cheap answer there is a person ticking a box.

### What this report recommends, and why it is only a recommendation

**Option (b), and build it as option (a) first.** The reasoning is that (a) and (b) are not really
alternatives: (b) is (a) plus an export. So building (a) is not a bet, it is the first part of (b)
either way, and it delivers something useful on its own in about a week. Then the export gets added
once somebody has answered check 3 and obtained the format.

Option (c) should not be started until somebody can say that the manual upload in (b) is actually
costing real time. Choosing it now would be choosing the most expensive and most fragile option on
the basis of a volume nobody has measured.

**This is not the decision.** It is question 1 in section 5 and it is Max's, and the recommendation
above is worth exactly as much as the answers to the three checks, which nobody on the build side
has.

---

## 3. The screens

Four screens. Romanian throughout, with proper diacritics. Desktop first, and each of them has to
work at 390 pixels wide, which is the rule the phone-layout work established and which every screen
built since has had to meet. Each is described by what it shows and what the operator can do, not by
how it would be coded.

### The menu entry

A new group in the sidebar, **`Facturare`**, below `Stoc` and above `Configurare`. Not inside
`Stoc`, because an invoice is not a stock question, and not inside `Relații`, because that group is
about people rather than documents.

One entry to begin with, `Facturi`, described as `Facturile emise clienților`. The menu is generated
from one list in one file, which is also what the dead-link check reads, so adding it is one entry
in one place.

**Nothing appears in the menu that cannot be used yet.** That is an existing rule here and it
matters for this feature specifically: a `Facturare` entry that opens an empty screen teaches Mihai
that the section does not work, and he will stop opening it.

### Screen 1: the list, `Facturi`

This is the screen from Max's description of OsteoJP's Faturação, adapted.

**What it shows.** One row per invoice, newest first:

| Column | Content |
|---|---|
| `Număr` | The invoice number |
| `Data` | The issue date |
| `Client` | The client's name, a link to the client |
| `Proiect` | The project, a link to the project |
| `Total` | The total with VAT, in MDL, to two decimals |
| `Stare` | `Ciornă`, `Emisă`, `Plătită` or `Anulată`, as a coloured chip |

**What the operator can do.**

- **Filter by date range.** Two date boxes, `De la` and `Până la`, defaulting to the current month.
  This is the first filter on OsteoJP's screen and it is first here for the same reason: almost
  every invoicing question is a question about a period.
- **Filter by state.** `Toate`, `Ciornă`, `Emisă`, `Plătită`, `Anulată`. Default `Toate`.
- **Search** in one box, over the invoice number and the client name. One box, not several, which
  is how the client list already searches and it should not be re-invented here.
- **See the totals of what is currently filtered**, in a foot row: how many invoices, and the sum.
  An invoicing screen without a total for the visible period makes the operator reach for a
  calculator, which is the thing the system exists to remove.
- **Open any invoice**, by clicking its row.
- **Press `Factură nouă`**, which goes to screen 3.

**What it deliberately does NOT have: a location filter.** OsteoJP filters by location because a
clinic has several of them. Rapid Construct has one place of business, and the equivalent axis here
is the project, which is already a column and already searchable. A filter that always has one
option is a control that teaches the operator to ignore controls.

### Screen 2: creating an invoice from an Ieșire

The path that should be the normal one, because it is the one where the data already exists.

**Where it starts.** On the Ieșiri materiale screen and on an Ieșire's own page, a button:
`Emite factură`. It is only enabled when the Ieșire can actually be invoiced, and when it is
disabled it says why in Romanian, next to the button, rather than just being grey. Two reasons it
would be disabled: the Ieșire has lines with no price, or an invoice already exists for it.

**What the operator sees.** A draft invoice, already filled in from the Ieșire:

- the client and the project, read from the Ieșire, not typed
- one invoice line per Ieșire line: product code, name, quantity, unit, unit price, line total
- a VAT rate, prefilled from whatever question 4 decides
- `Subtotal`, `TVA`, `Total de plată` in the foot
- the issue date, defaulting to today, and a payment due date

**What the operator can do.** Change quantities and prices, remove a line, add a line that was not
on the Ieșire (a delivery charge is the obvious one), write a note that appears on the invoice, then
either `Salvează ciornă` or `Emite factura`.

**The one thing this screen must be honest about.** `Emite factura` is the point of no return, and
the screen has to say so before it happens, not after: once issued, the invoice cannot be edited,
only cancelled. A plain Romanian confirmation that says that, and says the number that is about to
be allocated, is the whole safeguard. This is the moment the operator will be in a hurry, and it is
the moment the system has to slow them down by exactly one sentence.

**A second, manual path** for an invoice with no Ieșire behind it, reached from `Factură nouă` on
the list. Same screen, but the client, the project and every line are chosen by hand. It is needed,
because not everything invoiced is a material release, and it is the lesser path: the Ieșire path is
the one that cannot get the quantities wrong.

### Screen 3: the invoice page

One invoice, read mostly.

**What it shows.** The number and the state at the top. Who it is to, with the client's name, IDNO,
address and a link to their record. Which project. The dates, issued and due. The lines, as a table
that becomes a stack of cards on a phone, which is how every other table in this system already
behaves. The foot: `Subtotal`, `TVA`, `Total de plată`. Any note. And a history of what happened to
it and when, which the system already has a mechanism for and which invoices should use rather than
inventing a second one.

**What the operator can do, depending on the state.**

- On a `Ciornă`: edit it, or issue it, or discard it. A draft that was never issued and never
  numbered is the only thing here that may genuinely be thrown away, because it was never a
  document.
- On an `Emisă`: download the PDF, email it to the client, mark it `Plătită`, or cancel it.
- On a `Plătită`: download the PDF, email it. Nothing else.
- On an `Anulată`: download the PDF, and read it. Nothing else. It stays on the list.
- **On nothing at all: delete.** There is no delete button on this screen in any state, and that is
  the visible half of the rule in section 1.

Cancelling asks for a reason in one free-text box, and the reason is kept and shown. An invoice
marked cancelled with nobody knowing why is a question somebody has to answer six months later
from memory.

### Screen 4: the PDF

One page, printable, in Romanian, and it is the thing the client actually receives.

It carries: Rapid Construct's own details as the issuer, including IDNO, VAT code where applicable,
address, bank and IBAN; the client's details including IDNO and address; the invoice number and
dates; the lines with quantity, unit, unit price, line total; `Subtotal`, `TVA`, `Total de plată`;
the total in words, which is conventional on a Moldovan invoice and which an accountant will ask for
if it is missing; the payment details; and signature blocks.

**A cancelled invoice's PDF is still available and is marked `ANULATĂ` across it.** Somebody will
have the original, and the copy in the system has to be able to disagree with it out loud.

Two practical notes. The PDF has to be stored rather than regenerated on demand, because a document
regenerated next year from a changed template is not the document the client received: the
`rc-docs` store already accepts PDFs under a client folder and already has `factura` as a document
kind, so this costs no new storage design. And the money on it is printed to two decimals, which
today's money formatter does not do.

---

## 4. The migration it would need

**Described, not written.** This pull request adds no file under the migrations folder, and the
description below is deliberately not in a form that could be pasted in and applied. Whoever writes
it writes it as a card, with the owner told first, because in this repository merging a migration
applies it to the live database within about two minutes.

**Additive only. No `DROP TABLE`, no `TRUNCATE`, no `DELETE`, not one row removed.** Every existing
table keeps every column it has. Nothing below changes anything that exists except by adding to it.

### What it would add

**One new type, for the states.** Four values: `draft`, `issued`, `paid`, `cancelled`. English in
the database, Romanian on screen, exactly as the estimate statuses and the project statuses already
work. The Romanian words live in the presentation layer and have no business in the schema.

**One new table for the invoice.** Its own identifier; the invoice number and its series; the client
and the project, both as real references rather than as copied text, both refusing to be orphaned;
the state, defaulting to `draft`; the currency, pinned to MDL for this phase exactly as the estimate
pins it, because every calculation in this system sums MDL and storing a currency the arithmetic
ignores is a wrong number waiting to happen; the issue date and the due date; the VAT rate, if
question 4 says it belongs on the invoice; the note; a link to the Ieșire it came from, which is
allowed to be empty because a manual invoice has none; a link to the stored PDF; a place for the
state system's own number and status, which stays empty under option (a) and is the whole point
under (b) and (c); who created it and when.

Plus the constraints that make wrong data impossible rather than merely unlikely: the invoice number
unique within its series, so two invoices cannot claim one number; a refusal of a negative total.

**One new table for the invoice lines.** Each line: which invoice, which product, the quantity, the
unit price frozen at the moment the line is written, an optional free-text description for a line
that is not a catalogue product, a sort order, and the VAT rate if question 4 puts it on the line
rather than on the invoice.

**The frozen price is the point of the whole table and it should be commented as such.** The
estimate already does this and explains why in its own migration: the quoted price is a snapshot
written once, and nothing refreshes it from the catalogue. On an invoice that is not a nicety, it is
the difference between a document and a guess.

**One thing that guarantees the numbering.** What this is depends entirely on question 1. If RC
allocates its own numbers, it needs something that hands out the next number in a series under a
lock, inside the same transaction that writes the invoice, so that two operators pressing the button
at the same moment cannot receive the same number. The way an Ieșire reference is allocated today,
by reading the highest one and adding one in application code, must NOT be copied here: it can hand
the same number to two people, and its current answer to that is a Romanian message asking the
operator to try again, which on an invoice series produces a gap. If instead the state system
allocates the number, this piece does not exist at all and the column simply records what the state
returned.

**Database-enforced rules that only a draft may change.** Two of them, one on the invoice and one
on its lines, in the same shape the estimate already uses: an attempt to edit an issued, paid or
cancelled invoice is refused by the database. The screen disables the buttons, but the screen is a
courtesy and the database is the guarantee.

**No delete permission, for any role, on either table.** This is the enforceable half of the rule in
section 1. The owner-only delete that exists on documents, for a file uploaded to the wrong client,
is not extended here.

**A small number of additions to existing tables, each optional and each defaulting to empty**, so
that no existing row becomes invalid and nothing that works today stops working:

- the client's VAT registration code, which is a different number from the IDNO it already has
- somewhere to keep Rapid Construct's own issuer details, which could be a settings row rather than
  a new table
- one more value on the existing entity-history type, so that an invoice's state changes can use the
  history mechanism the system already has instead of a second one

### What it would not do

It would not touch the estimate tables, the Ieșire tables, the products, the projects or anything in
the extraction track. It would not drop a constraint. It would not renumber anything. And it would
not be merged without the owner being told first, in the terms this repository already requires:
the pull request names every migration path it adds, and somebody says out loud what changes in the
live database.

---

## 5. The questions only Max, Mihai or Ivan can answer

Eight questions. Each has a recommended default and the reason for it. None of them can be answered
from the code, which is why they are here and why nothing is built until they are answered.

---

**1. Which of the three e-Factura options?**

*Recommended default: build option (a) now and plan option (b) next.* They are not alternatives:
(b) is (a) plus an export step, so (a) is not a bet and is delivered in about a week. Option (c) is
twenty to thirty-five days, needs registration with the State Tax Service and a server-side
electronic signature, and carries a permanent maintenance commitment. Nobody has measured a volume
that justifies it. **Conditional on question 3: if RC cannot lawfully print its own invoice
numbers, then what gets built under (a) is named a payment request on screen, not a fiscal
invoice.**

---

**2. Does Rapid Construct issue invoices today, and with what?**

*Recommended default: assume yes, on paper or in a spreadsheet, and find out exactly what before
writing a line of code.* This is the cheapest question here and the one most likely to change the
design. If there is already software, RC may need to export to it rather than replace it, and
replacing it would be building a second source of truth for numbers that have to agree. If it is a
spreadsheet, the invoice number format is already established and RC should continue the series
rather than start a new one. **Ask Mihai to send one recent invoice with the client's details
covered up.** One real example answers this question, question 4 and question 5 at once, and is
worth more than any amount of design.

---

**3. Is Rapid Construct VAT registered, is e-Factura mandatory for its sales, and can it print its
own invoice numbers?**

*Recommended default: get all three from the accountant in writing before building, and treat the
third as the one that can invalidate the plan.* These are the three checks in section 2. The first
decides whether VAT appears at all. The second decides whether option (a) is a temporary
convenience or a permanent arrangement. The third decides whether what gets built is an invoice or
a payment request, and it is the only question in this report whose wrong answer would mean
throwing work away. The accountant answers all three in one conversation.

---

**4. Is VAT per line or per invoice?**

*Recommended default: per line in the database, one rate for the whole invoice on screen.* Storing
it per line costs nothing now and cannot be added cheaply later, because retro-fitting a per-line
rate onto issued invoices means deciding what rate the existing ones had. Showing one rate keeps the
screen simple while Rapid Construct sells one kind of thing. If a mixed-rate invoice ever appears,
the data already supports it and only the screen changes. **This needs the accountant's confirmation
of which rate applies to construction materials**, and that is a question for them and not for this
report.

---

**5. What must the numbering series look like for the accountant?**

*Recommended default: ask, do not choose, and continue whatever series already exists.* A format
like `RC-2026-0001` is a reasonable guess and a guess is the wrong instrument: the accountant may
need a specific prefix, a specific width, a series that restarts each year or one that never
restarts, and if RC already issues invoices then the series is already running and must not be
restarted from one. What is NOT negotiable, whoever chooses the format, is that the series has no
gaps and no duplicates, which section 4 covers. **Also ask whether one series is enough**, since a
second series is cheap to support now and awkward to add later.

---

**6. Does a paid invoice have to be matched to a bank payment?**

*Recommended default: no, not in the first version. A person ticks `Plătită` and the system records
who and when.* Real bank matching means either a bank connection or importing statements, plus
rules for partial payments, overpayments and payments that cover several invoices. That is a feature
of its own, comparable in size to the whole of option (a). A tick box, with a date and a name
against it, answers the question the owner actually asks, which is whether this invoice has been
paid. **Worth asking Mihai one thing though: are invoices often paid in part?** If they are, a tick
box is the wrong shape from the start, and a paid-amount field costs almost nothing to add now.

---

**7. Who signs an invoice and who sends it?**

*Recommended default: any signed-in user may create and issue; the system records who did; sending
by email is a button the operator presses rather than something automatic.* RC already has a
distinction between an owner and an account manager, so a narrower rule is possible if it is wanted.
Automatic sending is the thing to avoid in a first version: an invoice that emails itself the
instant it is issued removes the last moment at which somebody can notice it is wrong. **The real
question underneath is whether anyone other than Mihai will issue invoices.** If not, a role rule
is ceremony; if yes, it should be decided now, because who may issue a document is awkward to
retro-fit.

---

**8. Should a card be authored for this, and when?**

*Recommended default: yes, one card for option (a) only, authored after questions 1 to 5 have
answers, and not before.* This report deliberately authored no card, because a card carries a
machine-checkable acceptance and there is no way to write one for an invoice whose numbering format,
VAT treatment and legal status are all open. Question 3 could still change what gets built. Once
those answers exist, the work splits naturally into three cards: the migration and the data layer;
the list and the invoice page; the create flow and the PDF. **The migration card is the one that
needs Max told before it merges**, because merging it changes the live database within about two
minutes.

---

## Summary for Max, in plain words

RC already has most of the ingredients. An Ieșire has a client, a project, products, quantities and
prices, and the estimate feature already shows how to freeze prices, keep versions, lock a document
once it leaves, and total it up correctly. Copying that pattern is straightforward work.

What is genuinely missing is smaller than it looks: VAT on the selling side, RC's own company
details, a couple of client fields, two decimal places on money, and a way to make a PDF.

**The one real problem is that Moldova is not Portugal.** OsteoJP issues through a Portuguese
provider, and Moldova issues through the state's e-Factura system. So the interesting half of
OsteoJP cannot be copied, and RC has a choice to make instead: an internal document only, an export
that somebody uploads by hand, or a direct connection to the state system. They cost roughly one
week, two weeks, and one to two months.

**The recommendation is to build the cheapest one first, because the middle option is the cheapest
one plus an export step, so nothing is wasted.**

**Before any of it, three facts are needed from the accountant**, and one of them can change the
plan: whether RC is VAT registered, whether e-Factura is mandatory for its sales, and whether RC may
print its own invoice numbers at all. If the last answer is no, then the quick version is not an
invoice, it is a payment request, and it should say so on screen.

**And one thing is worth more than the rest of this report put together: one real invoice that
Rapid Construct has already issued, with the client's details covered up.** It answers the numbering
question, the VAT question and the layout question at the same time, and it is the difference
between building what is needed and building what was guessed.

Nothing is built until Max answers.

---

Role AUTHOR. No application code, no migration, no board card, no ruling. One report.
