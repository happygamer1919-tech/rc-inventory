# LEARNINGS

Every defect discovered while working a card, written down once so it is not
paid for twice.

**The rule (CLAUDE.md section 9):** before reporting any card done, append every
ERROR/SOLUTION pair discovered while working it. A card that hit no defects
appends nothing and says so in its notes. A card that hit three appends three.

**Format:**

```
### <short title>
**Tag:** frontend | backend | data | infra | auth | ci
**ERROR:** what broke, concretely, including what it looked like on screen or
in the output.
**SOLUTION:** what fixed it, and the rule that prevents the next instance.
```

Append at the bottom, under the phase heading. Never edit or delete an existing
entry: a learning that turned out to be wrong gets a new entry correcting it,
because the wrong belief is itself the thing worth recording.

---

## Phase 1 (preview, closed 2026-08-19)

Six defects, all found by driving the screen rather than by reading the code.
That is the pattern worth carrying into phase 2: every one of these typechecked
and built clean.

### Invisible white-on-white table columns
**Tag:** frontend
**ERROR:** The product drill-down side panel rendered white text on a white
surface, so the LOT and CANTITATE columns were completely invisible. The rows
were present in the DOM with correct data and the page looked like it had a
rendering bug or missing data. `body` carries the white foreground colour, and
the panel set only `bg-rc-white` without setting a foreground, so the text
inherited white onto white.
**SOLUTION:** Set an explicit foreground colour on the panel container, then
audit every other white-surface element in the app; all of them now carry an
explicit colour. RULE: a component that sets a background must set a foreground
in the same rule. Inheriting one half of a colour pair from `body` works until
someone puts the component on a different surface.

### Diacritics-sensitive search finds nothing
**Tag:** frontend
**ERROR:** Typing `tigla` in the inventory search returned zero results while
the catalogue plainly showed `Tigla` spelled with its diacritics. The search
looked broken, and to an operator a search that returns nothing for a product
they can see is worse than no search. Operators type fast and without
diacritics; the comparison was byte-exact against text that carries them.
**SOLUTION:** Normalise BOTH sides with NFD and strip combining marks before
comparing. Verified that `tigla`, `Tigla`, `sindrila` and `vata` all match their
diacritic spellings. RULE: in a Romanian UI, every text comparison a human types
into is diacritics-insensitive by default. This applies to phase 2 database
queries too, not only client-side filters.

### Combobox clipped to a sliver by an overflow ancestor
**Tag:** frontend
**ERROR:** The searchable product dropdown was absolutely positioned inside the
outbound line table, whose `overflow-x-auto` clipped the open list to a sliver a
few pixels tall. The control looked broken rather than misplaced, and no console
error appeared: an ancestor's overflow silently clips an absolutely positioned
descendant.
**SOLUTION:** Render the list through a portal to `document.body` with fixed
positioning, reposition on scroll and resize, and teach the outside-click
handler to recognise the portalled list as inside the component. RULE: any
floating layer (dropdown, popover, tooltip, menu) portals to the body. An
absolutely positioned overlay inside a scroll container is a clipping bug
waiting for a narrower viewport.

### PDF column collision from guessed character widths
**Tag:** data
**ERROR:** In the generated supplier confirmation PDFs, right-aligned numeric
columns collided with the text to their left. The width helper estimated
character width with a single average value, so a row of narrow digits and a row
of wide capitals computed the same width and only one of them was right.
**SOLUTION:** Use the real Helvetica and Helvetica-Bold advance-width metrics
per character instead of an average. RULE: never estimate text width when the
font's own metric table is available. An estimate that is right on the sample
row is wrong on the row nobody looked at.

### Hardcoded dashboard count
**Tag:** data
**ERROR:** The dashboard product count was written as the literal `26`, which
happened to be correct at that moment and is exactly what the card forbade. Any
change to the catalogue would have left the dashboard confidently reporting a
stale number, with no error and nothing to notice.
**SOLUTION:** Replaced with `PRODUCTS.length`. RULE: a number displayed to a
user is derived from the data at render time, never transcribed from it. In
phase 2 this hardens further: every dashboard number is computed from the
database at request time, and P2-06's acceptance greps the repository to prove
the mock module is gone rather than merely unused.

### Stat card wrap breaking the row rhythm
**Tag:** frontend
**ERROR:** The total stock value wrapped to two lines because the currency
label did not fit, which made one stat card taller than its neighbours and broke
the alignment of the whole dashboard row. References, dates and money in the two
narrow bottom tables wrapped mid-value for the same reason.
**SOLUTION:** Render the currency as a smaller suffix so the value fits on one
line, and stop mid-value wrapping in the narrow tables. RULE: a fixed-height row
of cards needs its longest realistic value tested, not its sample value. Check
the widest case (largest number, longest reference, longest supplier name)
before calling a layout done.

---

## Phase 2 (build, opened 2026-08-25)

### P2-01: an RLS policy that reads the role table recurses forever
**Tag:** auth
**ERROR:** Not hit, avoided by design, and recorded because the next person to
add a table will hit it. The obvious way to write a role-gated policy is
`using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'))`.
On every table but `profiles` that works. On `profiles` itself the policy has to
read `profiles` to decide whether the caller may read `profiles`, which
re-enters the same policy, and PostgreSQL aborts the query with an infinite
recursion error. On Supabase it surfaces as a login that hangs or a role that
reads back null, not as an obvious database error.
**SOLUTION:** One `security definer` function, `public.current_app_role()`, that
reads `profiles` as its owner and therefore bypasses RLS, plus a thin
`public.is_owner()` on top of it. Every policy calls the function instead of
querying the table, so no policy ever re-enters itself. `search_path` is pinned
on both functions so a caller cannot redirect them. RULE: a role-gated policy
never queries the role table inline. It calls the definer function. On
`profiles` the self-read is `id = auth.uid()`, which needs no lookup at all.

### P2-01: a CREATE EXTENSION line that buys nothing and can fail
**Tag:** data
**ERROR:** The migration opened with
`create extension if not exists pgcrypto with schema extensions;`, written out
of habit to guarantee `gen_random_uuid()`. It guarantees nothing that was not
already true and introduces two ways to fail an apply: a project without an
`extensions` schema, and a role without privilege to create extensions.
**SOLUTION:** Deleted. `gen_random_uuid()` has been a core function since
PostgreSQL 13 and every Supabase project runs 15 or later. RULE: every statement
in a migration is a statement that can fail during Ivan's apply. A line that
does not change the outcome is not neutral, it is added risk, and the migration
rule means each failure costs a round trip through a person.

### P2-07: a schema that works because of a setting made outside it
**Tag:** data
**ERROR:** Migration 0001 ends with a grants block naming exactly two roles:
`revoke ... from anon` and `grant ... to authenticated`. It never grants
anything to `service_role`. On the eu-west-1 project this was invisible, because
Supabase configures `ALTER DEFAULT PRIVILEGES` so every table created there is
granted to `service_role` at `CREATE TABLE`. Everything worked, and appeared to
work because of itself. It did not: it worked because of a project-level setting
made before any of this code existed. The first time those same migrations were
replayed from empty against a second database, the seed failed on its first
write with `permission denied for table profiles (42501)`.
**SOLUTION:** A new numbered migration (0001 is applied and is never edited)
granting `service_role` explicitly, re-asserting `authenticated` rather than
assuming it, and setting `ALTER DEFAULT PRIVILEGES` so the same omission cannot
recur at 0006. Note that `service_role` bypassing RLS did not help: PostgreSQL
checks the **GRANT first and RLS second**, so bypassing row security is not the
same as having table privileges. RULE: a migration must grant every privilege it
depends on, to every role that needs it. If you cannot recreate the schema on a
blank database and have it work, you do not have a schema, you have a schema
plus a machine.

### P2-07: the value of replaying migrations somewhere they have never run
**Tag:** ci
**ERROR:** Nothing was broken on production, and nothing would have been until
the day someone stood up a second environment: a staging project, a restored
backup, a new region. At that point the failure would arrive during whatever
urgent thing motivated the second environment.
**SOLUTION:** CI now runs `supabase db reset` against a local stack on every PR,
replaying every migration from empty in file order, which is the same order Ivan
applies them by hand. The very first run found the grants defect above. RULE:
migrations that have only ever run against one database are untested
migrations, however many times they have succeeded there. The check is cheap and
it pays for itself on the first finding.

### P2-05: a combobox that silently empties a field the operator filled correctly
**Tag:** frontend
**ERROR:** Phase 1's `Combobox` commits free text on blur only when the typed
text does **not** match an existing option:
`if (creatable && query && !options.some(o => o.label === query)) onChange(query)`.
When it *does* match, the branch is skipped and **nothing is committed**, so
the value stays empty. With fixed mock data nobody ever typed a name that
already existed, so it never showed. With real data it shows on the second
issue: the operator types a client they used yesterday, clicks away, the field
silently empties and the form says "Completează clientul". A field that erases
itself after being filled correctly is the worst kind of defect, because the
operator concludes they made the mistake.
**SOLUTION:** An exact label match now selects that option; only genuinely new
text takes the creatable path. RULE: the "already exists" branch of an
autocomplete must select, never no-op. And when reusing a component across a
data change, re-check every branch whose condition the old data could never
satisfy.

### P2-05: unique SKUs are not unique test data
**Tag:** ci
**ERROR:** The outbound spec gave every product a per-run unique SKU but a
**shared name** (`Produs ieșire lower`). The combobox searches by *name*, and
test data is never deleted, so each run's search matched the previous runs'
products and `.first()` picked the oldest one, already drained of stock by an
earlier run. The failure surfaced three runs later as "stock is 6, expected 60",
and looked exactly like a triple-submit concurrency bug. It was not: three
separate runs had each issued 18 against the same stale row, which a database
query showed in one line.
**SOLUTION:** The run id goes in the **name** as well as the SKU, and the picker
now asserts `toHaveCount(1)` before selecting, so an ambiguous match fails
immediately instead of silently choosing. RULE: in a suite that never deletes,
every field a test *searches by* must carry the run id, not just the primary
key. And when a test reports impossible data, query the database before
theorising about races.

### P2-05: a cleanup hook whose cost grows with history will fail eventually
**Tag:** ci
**ERROR:** products.spec had an `afterAll` that walked every `TEST-` product and
deactivated them one at a time. It was fine when that spec was the only one
creating products. Once inbound.spec and outbound.spec added theirs, the loop
outgrew the 45 second hook timeout, and Playwright attributes a hook failure to
the **last test in the file**, so a passing test was reported as the failure for
two full-suite runs while the code it checked was never at fault.
**SOLUTION:** The hook is gone. Test rows are marked **at creation** by the
`TEST-` prefix, which is what the convention actually asks for, and the
inventory screen's visibility filter keeps them out of the way. RULE: never
write a cleanup step whose runtime scales with the database's history. Mark on
the way in; do not sweep on the way out.

### P2-04: a `"use server"` file may export only async functions
**Tag:** backend
**ERROR:** The inbound actions module exported its constants alongside its
actions: `DOCS_BUCKET`, `ACCEPTED_MIME`, `MAX_DOC_BYTES`. The build failed with
`Only async functions are allowed to be exported in a "use server" file`, and
the knock-on error was worse than the cause: because the module failed to
compile, every importer reported `Export createInboundOrder doesn't exist in
target module`, which points at a function that is right there.
**SOLUTION:** Constants and types moved to a plain module both sides import.
RULE: every export of a `"use server"` file becomes a callable network endpoint,
so the restriction is not arbitrary. Types are fine (they are erased); values
are not. When an import error claims a function does not exist, check whether
its module compiled at all before looking at the function.

### P2-04: `server-only` breaks on a value import, not a type import
**Tag:** frontend
**ERROR:** A client component imported `INBOUND_STATUS_LABEL` from the reads
module, which starts with `import "server-only"`. The build failed with
`'server-only' cannot be imported from a Client Component module`. The confusing
part is that the same file's *types* had been imported from server modules all
along without complaint.
**SOLUTION:** `import type` is erased at compile time, so it never pulls the
module into the client bundle; a value import does. The labels and shared types
moved to `lib/data/inbound-types.ts`, which imports nothing from the server.
RULE: put anything a client component might need (labels, enums-as-constants,
shared types) in a server-free module from the start. The split is not
organisation, it is the difference between building and not.

### P2-04: an empty `<tbody>` is "hidden" to Playwright
**Tag:** ci
**ERROR:** `await expect(page.getByTestId("inbound-batches")).toBeVisible()`
failed against `<tbody data-testid="inbound-batches"></tbody>`. The element was
in the DOM and correctly rendered; an empty tbody just has zero height, and
Playwright's visibility check is geometric.
**SOLUTION:** Assert on the containing panel for presence and on
`toHaveCount(0)` for emptiness. RULE: never assert visibility on a container
whose whole purpose is to be empty in the case under test. Assert the count.

### P2-04: `window.open` after an `await` opens a dead tab
**Tag:** frontend
**ERROR:** The document button called a server action to mint a short-lived
signed URL, then `window.open(url)`. The popup opened and stayed on
`about:blank` forever: the call no longer counts as user-initiated once it
happens after an await, so the navigation is dropped. On screen the button
appears to work and produces a blank tab, with no error anywhere.
**SOLUTION:** Render a real `<a href>` once the signed URL arrives, in two
explicit steps. It also fixes things the popup was quietly breaking: keyboard
access, copying the link, and middle-click. RULE: a URL that does not exist
until after a round trip belongs in an anchor, not in `window.open`.

### P2-04: a test that passes alone and fails in the suite is a threshold, not luck
**Tag:** ci
**ERROR:** The account_manager settings-refusal test passed on its own and
failed once inside the full suite, then passed again. The suite forbids retries,
so re-running was not an answer.
**SOLUTION:** The refusal is served by a proxy **rewrite** to `/acces-interzis`,
a route the dev server may compile on first request. Under full-suite load that
compile plus the role query crossed the 10 second default expect timeout. The
assertion now carries an explicit 25 second timeout with the reason written next
to it, and the suite was run twice end to end to confirm. RULE: when a test
fails only under load, find which threshold it crossed and set that threshold
deliberately. Raising a timeout you can explain is engineering; adding a retry
you cannot explain is hiding a race.

### P2-03: navigating away cancels a server action mid-flight
**Tag:** ci
**ERROR:** A test helper clicked the form's submit button and returned
immediately; the test then called `page.goto("/inventar")` and asserted the new
row existed. It did not. The server action was still running when the navigation
tore the page down, so the insert never completed. The identical flow passed in
the next test, which happened to assert on the current page instead of
navigating, so the suite reported one failure that looked like a data bug and
was a timing bug in the harness.
**SOLUTION:** The helper now waits for the submit to *settle*, meaning either the
form panel closed (success) or the error box appeared (failure), before
returning. RULE: a helper that submits must not return until the submission has
resolved one way or the other. Waiting for a fixed timeout would paper over it;
waiting for either outcome is what makes the duplicate-SKU test and the
happy-path test share one helper.

### P2-03: PostgREST returns `numeric` as a string
**Tag:** data
**ERROR:** `threshold` and `unit_value_mdl` are `numeric(14,3)` and
`numeric(14,2)`. PostgREST serialises `numeric` as a **string**, not a number, so
it does not lose precision. Read straight into arithmetic, `stock * unitValueMdl`
would produce string concatenation or `NaN` rather than a total, and the stock
value column would quietly show nonsense.
**SOLUTION:** One `toNumber()` at the mapping boundary, applied to every numeric
column as rows are converted into the app's own type. RULE: convert at the edge,
once, where the database row becomes an application object. Never let a raw
PostgREST row reach a component, because the shape it returns is not the shape
TypeScript claims it is.

### P2-02: `process.env[name]` is never inlined into a client bundle
**Tag:** frontend
**ERROR:** The Supabase env reader used a helper, `readVar(name)`, doing
`process.env[name]`. Next replaces only **literally written**
`process.env.NEXT_PUBLIC_X` references at build time; a computed lookup survives
into the browser as a property read on an object that has nothing in it. The
code typechecked, built clean, and worked on the server. In the browser
`createClient()` threw before issuing a single request, the throw was caught by
the form's own error handler, and the screen showed the generic Romanian
fallback "Autentificarea a eșuat." No network request, no console error, no clue.
**SOLUTION:** Read the two variables into module constants with fully literal
member access, and validate the constants. RULE: any `NEXT_PUBLIC_*` value that
client code will read must be written out literally, once, at module scope. A
"nice" generic env helper is exactly the wrong abstraction here, because the
thing being abstracted is a compile-time text substitution.

### P2-02: Next 16 blocks cross-origin dev assets, and it looks like a dead page
**Tag:** ci
**ERROR:** Playwright's `baseURL` was `http://127.0.0.1:3100` while the Next dev
server considers itself `localhost`. Next 16 blocks cross-origin requests to
`/_next/*` dev resources by default, so **every JavaScript chunk returned 403**.
The page still server-rendered perfectly and every element was present and
visible, so assertions on content passed. React never hydrated, so no button had
a handler: the login form simply did nothing, with no error anywhere on the
page. Eight tests failed on navigation timeouts that pointed at auth.
**SOLUTION:** Request from the same host the server answers on:
`http://localhost:${PORT}`. The alternative, `allowedDevOrigins` in
`next.config.ts`, adds application configuration to fix a test-harness choice.
RULE: when a page renders but nothing is clickable, check the network for failed
`/_next/static/chunks/*` before debugging application logic, and read the dev
server's own stdout, which said exactly what was wrong in plain words while the
browser console only showed anonymous 403s.

### P2-02: the `middleware` file convention is deprecated in Next 16
**Tag:** frontend
**ERROR:** `middleware.ts` still works but prints a deprecation warning on every
dev start and every build: `The "middleware" file convention is deprecated.
Please use "proxy" instead.` A warning nobody fixes on day one is a warning
everybody stops reading by day thirty, and it was on a brand new file.
**SOLUTION:** Renamed to `proxy.ts` and the exported function from `middleware`
to `proxy`. Same matcher, same behaviour, no warning. RULE: fix a deprecation the
day the file is created, not the day it breaks.

### R-001: the stored Supabase URL is not the project origin
**Tag:** infra
**ERROR:** `NEXT_PUBLIC_SUPABASE_URL` in `/Users/ivan/rc-secrets/phase2.env` is
`https://<ref>.supabase.co/rest/v1/`, not `https://<ref>.supabase.co`. Every
piece of code that appends an endpoint to it builds a broken URL. The auth admin
API answered `Invalid path specified in request URL`, which names neither the
variable nor the extra path and reads like a wrong endpoint rather than a wrong
base. Copied verbatim into `.env.local` it would have broken supabase-js in
every card after P2-02, and the failure would have surfaced as a login that
does not work rather than as a configuration error.
**SOLUTION:** Derive the origin instead of trusting the stored value:
`https://${REF}.supabase.co`, where `REF` is already being extracted from the
same variable for the database user. Diagnose a suspect secret without printing
it: string length, scheme prefix, suffix test, trailing-CR test, and
`od -c` on the last few bytes said exactly what was wrong while showing nothing
sensitive. RULE: a secret you cannot print is still a secret you can measure.
**Open item: the Vercel environment probably carries the same value, and P2-12
depends on it being right.**

### R-001: both pooler hostnames resolve, so DNS proves nothing
**Tag:** infra
**ERROR:** `aws-0-eu-west-1.pooler.supabase.com` and
`aws-1-eu-west-1.pooler.supabase.com` both resolve in DNS. A resolution check
was used to pick the host, which picked the wrong one. `aws-0` then accepted the
TCP connection and the TLS handshake before failing at authentication with
`FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`, which reads like bad
credentials and is really a project that lives on the other pooler.
**SOLUTION:** `SELECT 1`, which is the whole reason CLAUDE.md 8.4 requires
proving connectivity before any migration work. RULE: a hostname that resolves
is not a host that serves you. Prove the connection with a query, not with
`host` or `ping`, and read an authentication error as a possible wrong-endpoint
error before assuming the credential is wrong.

### R-001: `set -e` in a sourced helper swallows the error you came for
**Tag:** infra
**ERROR:** The connection helper set `-euo pipefail` for its own safety. Because
it is `source`d, those options applied to the calling script too, so the first
failing `OUT="$(psql ...)"` killed the script at the assignment. The result was
a script that printed the header, printed nothing else, and exited 2, having
discarded the psql error message it existed to capture.
**SOLUTION:** `set +e` immediately after sourcing, then capture the status
explicitly. RULE: a script whose job is to report a failure must not run under
`set -e` at the point of failure, and `source` propagates shell options into the
caller. Diagnostic scripts turn `-e` off on purpose.

### R-001: the pre-check is what catches an already-applied migration
**Tag:** data
**ERROR:** Migration 0001 had already been applied by Ivan between the wave 1
report and this session. Running the apply blind would have failed on
`type "app_role" already exists` with no explanation of why, and the obvious
next move under time pressure is to start editing the migration file to make the
error go away, which corrupts a file that is already live.
**SOLUTION:** The mandated phase 1 pre-check counted the database's existing
tables, enums and policies before touching anything, and reported 11/6/41
against a file claiming to create 11/6/41. The apply was then attempted anyway
rather than skipped, so the outcome is recorded rather than assumed, and it
rolled back whole because the file wraps itself in one transaction. RULE: never
edit a migration to make an apply error disappear. Count first, and if the count
says the objects exist, switch from applying to verifying and diff the live
schema against the file.

### P2-01: a migration nothing in this repo is allowed to execute
**Tag:** infra
**ERROR:** CLAUDE.md section 8 forbids any terminal here from connecting to a
database, and this machine has no local PostgreSQL. So a 30KB hand-written SQL
file was about to be handed to a person to paste into a production SQL editor
having never been parsed by anything.
**SOLUTION:** Two mitigations, and neither is a substitute for the other. First,
a structural linter that parses the text and executes nothing
(`scratchpad/lint-migration.mjs`): it counts tables against
`ENABLE ROW LEVEL SECURITY` lines, and checks that every policy, index, trigger
and foreign key names a table created in the same file, that every enum column
names an enum created in the same file, and that every `public.fn()` call
resolves. It caught nothing this time and would have caught a renamed table
instantly. Second, the file is wrapped in one explicit `begin` / `commit`, so a
syntax error rolls the whole apply back rather than leaving half a schema
behind. RULE: state the verification limit in the PR rather than letting a green
acceptance line imply the SQL was run. The acceptance here proves the file
exists and the repository typechecks. It does not prove the SQL parses, and
saying so is the difference between a checked file and a trusted one.
