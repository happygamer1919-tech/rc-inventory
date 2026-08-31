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

### CRITIC: a day-long production 404 was the Vercel Framework Preset, twice wrong
**Tag:** infra
**ERROR:** Production answered 404 on every route for most of a day while the
repository was green: `quality` passed, the build succeeded, deployments
reported `state: success`, and the same commit ran correctly on localhost.
Nothing in the repository was wrong, so every hour spent reading the repository
was an hour spent in the wrong place. The cause was the Vercel project setting
**Framework Preset**, which was set to `Other` at project creation. With `Other`
selected Vercel does not apply the Next.js build output convention, so the
`.next` output is published as if it were a static directory and every
application route resolves to nothing. The first correction attempt made it
worse: the adjacent entry in the dropdown was clicked and the preset became
`NestJS`, which is a different framework whose output convention is also not
Next.js, so the 404 survived a change that looked like a fix.
**SOLUTION:** Ivan set **Framework Preset** to **Next.js** in the Vercel project
panel and redeployed; production began serving. RULE: a new Vercel project has
its Framework Preset verified explicitly, by reading the value back after
saving, before any deployment is treated as broken code. Two corollaries, both
paid for here. First, when CI is green and localhost is correct and production
is 404, the defect is in platform configuration, not in the repository, and the
repository is the wrong place to look. Second, the Framework Preset dropdown is
a misclick trap: `Next.js`, `NestJS` and `Nuxt.js` sit next to each other and
read alike at a glance, so the value is confirmed by reading it back, never by
remembering which entry was clicked.

### CRIT-10: a form with no action turns every named input into a query parameter
**Tag:** auth
**ERROR:** The login form was `<form onSubmit={...} noValidate>` with no
`action`, and its two inputs carried `name="email"` and `name="password"`. That
markup is correct once React has hydrated and completely wrong before it. Until
hydration attaches the React handler, the button is still a native
`type="submit"` control, so a click performs the browser's default submission:
because there is no `action`, the target is the current URL, and because the
method defaults to GET, every named input is serialised into the query string.
On production the browser navigated to
`/autentificare?email=<email>&password=<password>` with the password matching the
account password exactly. It reached the URL bar, browser history on a shared
warehouse machine, the edge access log, and the Referer of the next request. The
same race has a second face that is easier to notice and easier to misread: when
the click lands before hydration and nothing is serialised, the form appears to
do nothing at all. No error, no spinner, no network call. It was first seen as
"the account_manager cannot log in", which reproduced 2 times out of 3 and then
worked, which reads like a flaky password rather than a hydration race.
**SOLUTION:** Two changes, and shipping either one alone leaves half the defect.
First, remove the `name` attributes: React state already carries the values, so
the names did nothing except give a native submit something to serialise, and
without them there is nothing to leak no matter when the submit fires. `id` and
`autoComplete` stay, since those are what a password manager reads. Second, hold
a `hydrated` flag set in a `useEffect` and keep the submit button disabled until
it runs, so a premature click is visibly not-ready rather than silently dead; a
disabled submit button also blocks Enter-key implicit submission, which would
otherwise bypass the button entirely. RULE: any form whose submission is handled
in JavaScript must be safe to submit natively, because there is always a window
before hydration in which it will be. Either give it no named inputs, or give it
an `action` that handles the post honestly. And when a login "sometimes does
nothing" with no console error and no network call, suspect hydration before
suspecting the credential.

### CRIT-13: three clients write one cookie, so the flags go on all three
**Tag:** auth
**ERROR:** The Supabase session cookie on production was stored with
`secure: false`. It carries the access token and the refresh token, 2577 bytes
of it, so without the `Secure` attribute the browser would attach it to a plain
`http://` request to the same host. Nothing in the repository set any cookie
option: `createBrowserClient` and `createServerClient` were both called with two
arguments, so every attribute was a library default and nobody had ever decided
one.
**SOLUTION:** A single `COOKIE_OPTIONS` in `lib/supabase/cookies.ts`, imported by
all three clients that write that cookie: the browser client, the server client,
and the one inside `proxy.ts`. RULE: when several call sites write the SAME
cookie, its options belong in one shared constant, never set on the client that
happened to be edited. Setting them on one and not the others is worse than
setting none, because the cookie's attributes then depend on which request wrote
it last, which looks correct exactly often enough not to be checked. Two
findings worth keeping alongside it. `Secure` needs no environment branch:
browsers accept `Secure` cookies on `http://localhost` because localhost is a
secure context, and a branch on environment would have made production behave
differently from what the tests exercised. And `httpOnly` stays false on purpose,
because the `@supabase/ssr` browser client has to read the session out of the
cookie to refresh the token; that is an accepted risk, written down in
`docs/reports/critic-wave1.md` so it stays a decision rather than an oversight.

### CRIT-12: deleting the mock layer is not the same as deleting the claim
**Tag:** frontend
**ERROR:** The sidebar footer read "Previzualizare faza 1 / Date demonstrative,
un singur depozit" on production, on all eight authenticated screens, weeks
after the data became real. P2-06 had deleted `lib/mock` repo-wide and its
acceptance grep proved the module was gone, so the card was correct and green.
The label announcing that the data was demonstrative was not part of that grep
and survived it. The person being asked to trust a stock number was reading a
screen that told them the number was made up.
**SOLUTION:** Removed the block, since the topbar already names the warehouse
and a replacement line would only repeat it. RULE: when a card removes a
capability, grep for the WORDS that describe it, not only for the module that
implemented it. An acceptance that proves an import is gone proves nothing about
the sentence next to it. Found in the same pass and fixed with it: the settings
screen rendered `{categories.length} categorii`, which prints "1 categorii", and
one category is exactly what production has. Romanian has three numeral forms,
not two: 1 takes the singular, a number whose last two digits fall between 1 and
19 takes the bare plural, and everything else takes "de" plus the plural, so
"1 categorie", "3 categorii", "20 de categorii", and "119 categorii" but
"120 de categorii". That now lives in one `plural()` helper in
`lib/data/format.ts` rather than in an inline template string.

### CRIT-14: an acceptance line that outgrew its test
**Tag:** ci
**ERROR:** P2-06's acceptance said `dashboard.spec` covered "the same screens
against an empty database with no console error and no NaN on screen". It did
not. The spec's console-and-NaN case signed in as owner only, walked eight
screens against whatever the database happened to hold, and had no
empty-database case and no account_manager case anywhere in the file. The card's
EVIDENCE field was accurate the whole time; it says "against an arbitrary
database state", which is exactly what ran. Nobody lied. The acceptance was
written for a check that was then narrowed, and the two were never reconciled,
so the board carried a contract a stranger would have re-run and not found.
**SOLUTION:** Build what can be built honestly and withdraw what cannot. The
both-roles walk was buildable and now runs twice, with `/setari` kept in the
operator's list so the Romanian forbidden screen is checked rather than skipped.
The empty state was buildable in the form a real operator actually reaches, a
filter that matches nothing, and that case now asserts it. The empty-DATABASE
claim was withdrawn from the acceptance, because the only way to produce one is
to empty tables on the project the client is about to accept on, and a test suite
does not do destructive setup. The withdrawn sentence is quoted verbatim in
P2-06's notes so the edit adds a record instead of erasing one. RULE: when the
acceptance and the test disagree, the acceptance is what gets corrected, in
writing, with the old text preserved. And a role-gated application needs its
screen sweep run once per role: the account_manager screens here had never been
checked for console errors at all, and a wave-boundary review is not a
substitute for a test.

### CRIT-11: the test suite was writing into the client's production database
**Tag:** ci
**ERROR:** The Playwright suite runs green in CI against a local Supabase stack,
which is exactly what P2-07 built and it works. Run LOCALLY the same suite reads
`.env.local`, which pointed at the production project, so every local run wrote
real rows into the database production serves. It was visible on the client
domain: `/inventar` reported 128 active products and the first screen was
entirely e2e residue, `TEST-DASH-*`, `TEST-diacritic-*`, names like "Produs
tablou mt8ztoqf", under a single category called `TEST-Categorie`. Row counts at
the time of the review: products 296, inbound_orders 177, batches 129,
status_history 354. G9 asks Mihai to complete a full cycle on production himself,
on that screen.
**SOLUTION:** `scripts/assert-not-prod.mjs`, run from Playwright's `globalSetup`
so no spec can opt out, refusing the whole run when the environment points at a
production project ref. Three design rules, each for a specific failure mode, and
two of them were only proved right by testing the paths rather than the happy
case. The blocklist lives in a committed file rather than in the environment,
because a ref is already public in the browser bundle and an environment-sourced
list would be disabled by an empty environment; an empty blocklist exits 3
rather than passing, because a guard that allows everything when its list is
empty is worse than no guard; and both `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_URL` are checked, because a guard that reads one is bypassed by setting
the other. TWO BUGS THIS CARD SHIPPED WITH AND CAUGHT BEFORE MERGE, both found by
running every exit path instead of only the refusal. First, the presence check
originally required a parseable `<ref>.supabase.co` host, so the local stack at
`http://127.0.0.1:54321` fell into the empty-environment branch and would have
blocked CI on every run; presence now means "a URL is set at all". Second,
`global-setup.ts` used `import.meta.url` to locate the script, and Playwright
loads that file as CommonJS, so it threw "Cannot use 'import.meta' outside a
module" before ever calling the guard. The run still exited non-zero, so a
careless check would have recorded it as the refusal working. RULE: a guard is
tested on every branch it can take, not on the one you built it for. An exit code
that is right for the wrong reason is the most expensive kind of green.

### P2-10: a test that pinned a placeholder to the card that would remove it
**Tag:** ci
**ERROR:** `dashboard.spec` ended its memento case with
`await expect(page.getByTestId("alerts-empty")).toContainText("P2-10")`. It was
a good assertion when P2-06 wrote it: the alerts list was empty and the screen
said so by naming the card that would fill it, and the test proved the screen
was not inventing alerts it had never sent. Then P2-10 made sending real, the
copy stopped naming a future card, and the whole suite went red on a card that
had broken nothing. The four new reminder cases all passed in the same run; the
only failure was the old assertion describing a screen that no longer existed.
**SOLUTION:** the assertion was rewritten to hold the same meaning without
pinning the words: the page must not mention a card id at all, and the alerts
card must render exactly one of its two states, the row list or the empty
state, never both and never neither. It no longer assumes WHICH state, so it
does not quietly depend on what the tests before it left in the database.
The rewrite then failed on its first run, and it was right to. The page header
still read "Alertele se trimit din P2-10" one card above the list, so the screen
went on advertising unbuilt work after the work was built. The original
assertion could never have caught that: it only ever looked at the empty state
inside the alerts card, and the stale sentence was outside it.
RULE: an assertion on placeholder copy is an assertion with an expiry date, and
it expires on the card named in the copy. Assert the property the screen must
have (it shows one state, it does not advertise unbuilt work), not the sentence
it currently uses to have it. The property-shaped version covers the whole page
instead of the one element somebody remembered to pin.

### P2-10: what a local Supabase port collision costs, and what it does not
**Tag:** infra
**ERROR:** `supabase start` in this repo failed with `Bind for 0.0.0.0:54322
failed: port is already allocated`, and the CLI suggested
`supabase stop --project-id OsteoJP`. Another project's local stack was running
on this machine and holding 54321 and 54322. With no local stack, and with the
CRIT-11 guard correctly refusing to let the suite run against `.env.local`
(exit 2, `NEXT_PUBLIC_SUPABASE_URL arata catre proiectul Supabase de
PRODUCTIE`), there was no way to run the acceptance spec locally at all.
**SOLUTION:** the acceptance ran in CI, which provisions its own local stack,
replays every migration with `supabase db reset` and then runs the suite. That
is not a workaround, it is the environment the workflow exists to provide. What
was NOT done: stopping the other project's stack, and editing the committed
ports in `supabase/config.toml` to dodge the collision. The first breaks
somebody else's session, and the second is a permanent change to a shared file
to solve a temporary local condition. RULE: when the local environment is
occupied by work that is not yours, move the proof to CI rather than evicting
the occupant or rewriting shared configuration. And check the guard with the
environment the runner actually loads: a bare shell exits 4 on the
empty-environment branch, which proves nothing about whether the guard would
have caught a real production URL.

### P2-10: mocking a service at the transport, not at the branch
**Tag:** backend
**ERROR:** No defect, recorded because the obvious implementation was the wrong
one and the reason is worth keeping. The card asked for an acceptance run "with
Resend mocked", and the cheapest way to get it is a branch inside the sender:
if some test variable is set, pretend the send worked. That branch would have
made the test green while leaving untested exactly the code that can fail in
production: the request, the headers, the parsing of the response, and the
handling of a non-2xx status. The one thing the test proves would then be the
one thing production never runs.
**SOLUTION:** a `RESEND_BASE_URL` environment variable, defaulting to the real
host, pointed at a small HTTP server on 127.0.0.1 that Playwright starts
alongside the dev server. The application makes its real `fetch` and has no
idea a test is running. The failure case is requested through message content:
the product's SKU carries a marker, the SKU is in the email body because the
card requires it there, and the mock answers 500. RULE: mock a service at its
transport boundary, not with a branch in your own code. A base URL is
configuration; an `if (TEST)` is a second implementation that nobody runs in
production and everybody trusts in CI.

### P2-12: a send-only API key cannot answer a verification question
**Tag:** infra
**ERROR:** P2-12's acceptance needs the Resend dashboard to show the client
domain verified. `GET https://api.resend.com/domains` with the key from the
environment answered `This API key is restricted to only send emails`. The key
is a sending-only restricted key, which is the right key for the application to
hold and the wrong key for asking a question about configuration. Nothing was
broken and nothing was misconfigured; the credential simply had a smaller scope
than the check assumed.
**SOLUTION:** get what public DNS can prove independently, and block precisely
on what is left. All three records Resend asks for are present and correctly
placed: SPF TXT at `send.rapidconstructmd.com`, MX at the same name pointing at
`feedback-smtp.eu-west-1.amazonses.com`, and the DKIM key at
`resend._domainkey.rapidconstructmd.com`. That is necessary and it is not
sufficient: only Resend can say whether IT has checked them. The card was
blocked on Ivan with the three record names, types and values written out, so
the answer is a one-line dashboard read rather than an investigation.
RULE: when an acceptance line needs a credential, check the SCOPE of the one
you hold before assuming the check can run at all, and note that the sending
identity is usually a `send.` subdomain rather than the root, so a lookup at the
root finds nothing and reads like a missing record.

### P2-12: redirects that are same-origin by construction need no canonical URL variable
**Tag:** frontend
**ERROR:** No defect. The card requires a canonical URL environment variable
that every absolute URL is built from, and the honest finding was that the
application builds no absolute URLs at all. Every redirect in `proxy.ts` is
`request.nextUrl.clone()` with only the pathname changed, so a redirect from
the client domain lands on the client domain because of how it is built, not
because of how it is configured. The P2-10 reminder email carries no link.
Adding the variable would have created a value nothing reads.
**SOLUTION:** verify the property the card actually wants (a redirect never
leaves the host it was requested from) rather than shipping the mechanism the
card guessed would be needed, and record when the mechanism becomes necessary:
the first absolute URL, which is the reminder sender switch or the metadata
work in P2-11. RULE: an unread environment variable is not neutral. It goes
stale silently and the next reader believes it. Build the variable at the first
consumer, and until then write down why there is none.

### A dispatch that names a tool or path this repo does not have is a halt, not an improvise
**Tag:** ci
**ERROR:** A session dispatch instructed the migration apply as "run
check-pending-migrations.mjs, apply with drizzle-kit migrate inside a
transaction, print the journal entry, confirm the journal timestamp is forward
of 0005". None of that exists here. There is no
`scripts/check-pending-migrations.mjs`. There is no drizzle: not in
`package.json`, not in `node_modules`, not as a directory. There is no drizzle
journal, and `supabase_migrations.schema_migrations` carries `version`,
`statements` and `name` with no timestamp column at all, so the timestamp
comparison it asked for could not be performed on any file. The dispatch was
describing a different project's mechanics.
The failure mode this invites is the dangerous one: improvise something
drizzle-shaped, report it in the vocabulary the dispatch used, and hand back a
report that reads as though the requested procedure ran. Nobody would catch it,
because the report would match the instruction word for word.
**SOLUTION:** verify the named mechanics against the repo BEFORE executing, and
when they are absent, say so in the report and run the procedure this repo
actually documents. Here that was CLAUDE.md section 8.5: pre-check with literal
counts, apply in one transaction, post-check the table list with RLS state,
policy counts and enums, journal all three into the card evidence. The
pre-check is also what caught that 0006 had already been applied by someone
else, which a `drizzle-kit migrate` invented on the spot would have missed.
RULE: an instruction naming a tool, path or table is a claim about the repo,
and a claim about the repo is checkable. Check it, then execute. Substituting a
lookalike and reporting in the requested vocabulary is worse than halting,
because it destroys the reader's ability to tell the two apart.

### Never delete a remote branch without asserting the merge actually landed
**Tag:** ci
**ERROR:** An ad-hoc merge loop closed pull requests #29 and #30 and deleted
their branches while reporting them merged. They were not merged: both show
`state CLOSED, mergedAt never`. The work survived only because it was pushed
again and re-landed as #32 and #33. Had nobody noticed, two steps of the POC
would have been deleted from the remote with the board recording them as
shipped, and the loss would have surfaced days later as code that the history
says exists and the tree does not contain.
The harness `merge_when_green` path never had this bug. The ad-hoc loop was
written to move faster than it, and the thing it skipped was the assertion.
**SOLUTION:** use the harness merge path. When a merge must be driven by hand,
the delete is conditional on proof, never on the exit code of the merge command:
read back `mergedAt` (or the merge commit sha) and only then remove the branch.
`gh pr merge --delete-branch` reports success for the close-and-delete even when
the merge itself did not happen. RULE: deletion is the one step with no undo, so
it is the one step that gets a separate assertion. Prove the thing landed by
reading the state back, not by trusting the command that was supposed to land it.

### A dry run must never acknowledge a Telegram update offset
**Tag:** infra
**ERROR:** The Telegram inbox reader consumes updates with `getUpdates`, and
`getUpdates` is destructive by design: passing an `offset` acknowledges every
update below it and the server will never send them again. A dry-run inspection
that calls it with an offset therefore does not inspect the inbox, it empties
it. The messages are gone, no error is raised, and the next real run finds a
clean queue and reports that there was nothing to answer.
**SOLUTION:** a dry run reads without acknowledging: call `getUpdates` with no
offset, or with the offset the previous real run already committed, and never
advance the stored offset. Only the real path advances it, and only after the
messages have been processed and persisted. RULE: read-only means read-only at
the level of the REMOTE system, not at the level of your own filesystem. An API
call that mutates server-side cursor state is a write however little it changes
locally, and "dry run" is a promise to the operator about their data, not a
description of your intent.

### Ruling ids are namespaced by author, and a collision is an authoring defect
**Tag:** ci
**ERROR:** A dispatch asked for rulings R-011 through R-015. R-011 already
existed: POC-BUILDER had committed "R-011 - TELEGRAM_CHAT_ID was stale" earlier
the same day. Two sessions were writing into one `decisions/inbox.md` from one
shared id space, and neither could see the other's uncommitted work. The
tempting resolutions are both wrong: overwriting the existing R-011 destroys a
committed decision, and editing it to say something else violates this file's
own rule that an old ruling is never edited.
**SOLUTION:** ids are namespaced by author. Strategy issues `R-nnn`,
POC-BUILDER issues `P-nnn`, CRITIC issues `C-nnn`. A collision inside one
namespace is an authoring defect and is fixed by renumbering the NEW entry,
never by touching the old one, and the shift is written into every renumbered
entry so a reader is not left reconstructing it. The five in that dispatch
landed as R-012 through R-016 with the mapping stated in each.
RULE: a shared append-only file needs a per-author key or it needs a lock, and
a lock across sessions that cannot see each other is not available. Namespacing
is the cheap fix, and "renumber the new one, never edit the old one" is the rule
that keeps the history readable when it happens anyway.

### A guard that covers only one execution path is not a guard
**Tag:** ci
**ERROR:** CRIT-11 built `scripts/assert-not-prod.mjs` to stop the Playwright
suite writing into the client's production project, and closed the card on six
exit paths exercised LOCALLY. The card read as though the defect was closed.
What was never exercised anywhere was the guard's REFUSAL in CI. The guard does
run there, because `globalSetup` runs before every Playwright invocation, but CI
always resolves to a local stack, so only the pass path has ever executed there.
A green run proves the guard does not block a legitimate suite. It proves
nothing about whether it would stop an illegitimate one.
The failure this leaves open is not today's configuration, which forensics
confirmed is safe: CI starts its own stack, references no repository secret, and
the repository has none. It is the next edit. Someone adds a secret and wires
`NEXT_PUBLIC_SUPABASE_URL` to it for a preview environment, and the first thing
that tells anyone the guard did not stop it is rows appearing on the client's
screen.
**SOLUTION:** name a guard after what it ENFORCES, not after where it was
tested, and prove it on every path that can reach the target. For this one that
means a deliberate failing run in CI: a job step that points the environment at
a production ref and asserts the suite refuses, so the refusal branch is
exercised by the same workflow that would otherwise silently stop enforcing it.
RULE: "tested locally" and "enforced everywhere" are different claims and a card
that makes the first must not be written as though it made the second. The path
you did not test is the path the regression arrives on.

### An unexplained row count change in client production is a defect, not an observation
**Tag:** data
**ERROR:** A session report flagged that the production product count had moved
from 304 to 305 and wrote: "One more product arrived from somewhere after the
CRIT-11 guard landed. Not investigated, not in scope, flagged." Two things were
wrong with that. The claim about WHEN it happened was asserted on no evidence,
and it turned out to be false: the row predates the guard by two hours and forty
one minutes and was created by the CRITIC's own documented live concurrency
test. And "not investigated, not in scope" is not available for this class of
finding. An unexplained write to the database a client is about to accept on is
either a guard that failed or a fact nobody has established, and both are
defects.
The whole investigation was three queries: the newest `created_at` in the table,
the merge timestamp of the guard, and a comparison. It took less time than
writing the sentence that deferred it.
**SOLUTION:** when a count in client production moves and the reason is not
already known, that is a card or an immediate investigation, never a line in a
report that hands the question to whoever reads it next. Establish WHEN before
asserting anything about it: a timestamp comparison against the guard's own
merge commit answers "did our protection fail" in one query, and the answer
governs whether anything else matters. RULE: never date an event you have not
timed. "It happened after X" is a claim, and in a report about client data it is
the claim the whole finding rests on.

### CRIT-15: proving a refusal in CI without letting the suite reach production
**Tag:** ci
**ERROR:** No defect. Recorded because the obvious way to prove the guard works
in CI is the dangerous one, and the reasoning is worth keeping. The instinct is
to point the Playwright suite at a production URL in a CI step and assert the
run fails. That test is exactly as safe as the guard it is testing: if the guard
has already broken, which is the single scenario the card exists to detect, the
suite starts and writes rows into the client's project. The test would then
report the defect by causing it.
**SOLUTION:** run the guard as its own process and assert its exit code.
`node scripts/assert-not-prod.mjs` with a production ref in the environment must
exit 2, and the step fails the job on anything else. Nothing else starts, no
browser launches, no client connects, and the proof is identical because the
guard is the thing under test. The ref needed no secret: it is already committed
in `scripts/production-refs.mjs` and already public in every browser bundle, and
the comment there explains why.
The static half is separate and both are required: one check proves the guard
refuses, the other proves nothing in the workflow points at production in the
first place. A future edit has to defeat both, one to make CI target production
and another to stop the guard noticing.
The static half also asserts the single line that makes the guard exist at all,
`globalSetup` in `playwright.config.ts`. Deleting it disables the guard for
every spec and breaks nothing visibly, so it was proved to fail on a copy with
that line removed.
RULE: to test a safety mechanism, exercise the mechanism, not the disaster it
prevents. If your proof requires the unsafe thing to actually be attempted, you
have written a test that is only safe while it is unnecessary.

### Verify before escalating: "pasted output only" applies to counts, not only to applies
**Tag:** ci
**ERROR:** A terminal report carried an unverified line: the production product
count had moved from 304 to 305, "one more product arrived from somewhere after
the CRIT-11 guard landed", flagged and not investigated. That sentence was
escalated into the headline of the next dispatch, as a suspected guard failure
with client data at stake, without anyone first demanding the one query that
would settle it.
It was false. The row predates the guard by two hours and forty one minutes and
was created by the CRITIC's own documented live concurrency test. The whole
investigation was three queries: newest `created_at`, the guard's merge
timestamp, and a comparison.
Two failures stacked, and the second is the expensive one. The terminal asserted
a date it had not checked. Then the claim was promoted rather than checked, and
a dispatch was built on top of it: highest-priority forensics, a reopened card,
and a ruling drafted against a premise nobody had tested.
**SOLUTION:** the standing rule for migrations, that an apply is only believed
with its pre-check and post-check output pasted, is not about migrations. It is
about **counts and states of the client's database**, whoever reports them and
whatever they are reporting. A row count, a "this changed", a "this appeared" is
a claim about production and carries the same evidentiary bar as an apply: the
query and its output, or it is not yet a fact.
RULE: escalation multiplies whatever it carries, including the errors. Before a
report becomes a dispatch premise, demand the output. It is cheaper to ask for
one query than to build a day of work on a sentence nobody ran.

### A test for a safety guard must not be able to cause the defect it tests
**Tag:** ci
**ERROR:** No defect shipped, recorded because the obvious design was the
dangerous one and it was nearly built. CRIT-15 needed to prove that the
production guard refuses on the CI path. The instinct is to point the Playwright
suite at a production URL in a CI step and assert the run fails.
That test is exactly as safe as the guard it tests. If the guard has already
broken, which is the single scenario the card exists to detect, the suite starts
and writes rows into the client's project. The test reports the defect **by
causing it**, and it is only safe while it is unnecessary.
**SOLUTION:** run the guard as its own process and assert its exit code.
`node scripts/assert-not-prod.mjs` with a production ref in the environment must
exit 2, and the step fails the job on anything else. Nothing else starts, no
browser launches, no client connects, and the proof is identical because the
guard IS the thing under test. The ref needed no secret: it is already committed
in `scripts/production-refs.mjs` and already public in every browser bundle.
RULE: to test a safety mechanism, exercise the mechanism, never the disaster it
prevents. If the proof requires the unsafe thing to actually be attempted, the
test has the same failure mode as the system.

### A credential-firewall card belongs after every card that needs the credentials it revokes
**Tag:** infra
**ERROR:** P2-13 revokes the migration-apply grant, rotates every credential and
retires the dev accounts. P2-15 deletes the e2e residue from production. Both
were sequenced ahead of P2-08, P2-09 and P2-11, which are the remaining build
cards, and P2-08 in particular still needs a migration to store extraction
drafts. Following the board as authored would have rotated the credentials and
revoked the grant while cards that require both were still unbuilt, and the next
session would have hit a card it could not work through a door it had just
locked behind itself.
The ordering was correct when it was written. Domain work and handover sat at
the end of the build, and the build tail was short. Then P2-08 was parked on a
third party for days while everything around it shipped, and the tail outlived
the assumption.
**SOLUTION:** the firewall card depends on the last card that needs what it
revokes, expressed as a `depends_on` edge rather than as a position in the list.
P2-15 now depends on P2-09 and P2-11; P2-13 depends on P2-15. An edge is checked
by the validator on every commit; a position in a list is checked by whoever
happens to notice.
RULE: a card that removes a capability is ordered by the capability, not by the
calendar. Ask what the card takes away, find every card that needs it, and make
those the dependencies. And when a card sits parked on someone else long enough
to change the shape of the tail, re-examine the edges that assumed the old shape.

### P2-08a: a machine endpoint behind an auth redirect answers 200 to everything
**Tag:** backend
**ERROR:** Every case of `extraction.spec` except the first failed, all of them
receiving `200` where they expected `202`, `400` or `401`. The most useful
failure was case 4: it posts a **deliberately wrong secret** and still got 200.
The route's very first statement is the secret check, so a wrong secret
returning 200 meant the request was never reaching the route at all.
It was `proxy.ts`. The callback is a machine endpoint: Make posts to it with no
session and no cookie, so the middleware treated it as an unauthenticated
request to a protected route and redirected it to `/autentificare`. Playwright's
`APIRequestContext` follows redirects by default, so the test received the login
page, which is a perfectly good `200`.
The dangerous shape is what this would have looked like in production. Make
posts, gets a `200`, records a successful delivery, and never retries. Nothing
is stored, nothing errors, and the only symptom is drafts that never appear.
**SOLUTION:** the route is added to the middleware's public set, with a comment
saying that "public" here means only "the proxy does not redirect it". Its
authentication is the shared secret the contract specifies, checked by the route
on its first line, before the body is even parsed.
RULE: a machine endpoint and a human route need different gates, and a
middleware written for humans will silently convert the machine's error codes
into a login page. When an endpoint answers 200 to a request that should be
rejected, suspect the layer in front of it before the code inside it. And a test
client that follows redirects will hide exactly this, so the assertion that
caught it was the one expecting a FAILURE.

### A suite that only asserts the happy path cannot see a silent success
**Tag:** ci
**ERROR:** The concrete instance is recorded above as "P2-08a: a machine
endpoint behind an auth redirect answers 200 to everything", and this entry is
the general rule it produced, written separately because the rule is worth more
than the instance. A machine endpoint sitting behind a redirect returns a
perfectly good `200` to its caller while doing nothing at all. Make would post a
callback, read success, record a delivery and never retry. Every document would
be lost, silently, one at a time, and the only symptom on our side would be
drafts that never appear. **A suite that checks only what a correct call returns
cannot see this class of defect**, because the wrong answer and the right answer
are the same three digits. The assertion that caught it was case 4 of
`extraction.spec`, which posts a **deliberately wrong secret** and expects `401`:
a wrong secret answering `200` can only mean the request never reached the code
that checks secrets.
**SOLUTION:** assert the failure cases, not only the success cases, and give
them equal weight in the acceptance line rather than treating them as extras.
For every machine endpoint the suite asserts at least: the wrong credential, the
missing credential, the malformed payload, and the payload that violates the
contract. RULE: a success code proves nothing on its own, because the layers in
front of your code can produce it too. What proves the code ran is a failure the
code alone knows how to produce. Design the suite so at least one case can only
pass if the handler itself executed.

### A migration post-check that counts objects will not see a grant
**Tag:** data
**ERROR:** Migration 0008 created two tables and left `anon` holding `SELECT` on
both, because Supabase grants table privileges to `anon` and `authenticated` at
**CREATE TABLE time** from project-level default privileges, and 0001's
`revoke all ... from anon` ran once against the tables that existed then. The
phase 3 post-check required by CLAUDE.md 8.5 asks for the table list, the
`rls_enabled` flag, the policy count and the enum list. **Every one of those was
correct.** The schema counted right and was reachable by a role that should not
have been able to reach it. RLS was holding, so nothing leaked, but the grant is
the FIRST of the two layers and a table with one where every sibling has two is
protected less.
**SOLUTION:** the post-check now asks a reachability question as well as a
counting question, on every apply, for every object the migration created:

```sql
select c.relname,
       has_table_privilege('anon', c.oid, 'SELECT')          as anon_can_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
```

The expected answer is `anon_can_read = false` on **every** row, not on the new
ones. RULE: count what a migration created, then ask who can reach it. The two
questions have different answers and only the second one is about safety. The
same applies to a migration that creates a FUNCTION rather than a table, where
the reachability question is `has_function_privilege('anon', ..., 'EXECUTE')`
and the trap is different: a new function is executable by `PUBLIC` by default,
`anon` is a member of `PUBLIC`, and a default privilege that revokes from `anon`
by name does not touch the grant `anon` holds through `PUBLIC`.

### The card that says "confirm creates the order" against a schema that said the opposite
**Tag:** data
**ERROR:** P2-09's acceptance says confirm CREATES the real inbound order, while
the lane P2-08a shipped uploads a document onto an inbound order that already
exists, so `extraction_drafts.order_id` was in practice an `inbound_orders.id`.
Building confirm on top of that would have created a second order for every
document, and a foreign key added in either direction would have frozen the
wrong reading into a migration.
**SOLUTION:** migration 0008 deliberately left `order_id` without a foreign key
and wrote the ambiguity into its own header instead of guessing. Migration 0010
settles it in one place: `order_id` is the extraction idempotency key and never
an order id, the draft records the order it became, and a draft whose id already
names an existing order is excluded from the review list rather than offered for
a duplicate. THE RULE: when two shipped cards imply opposite schema meanings,
the migration that notices it records the conflict and adds no constraint; the
card that owns the decision settles it, and it settles it in SQL where both
readings can no longer coexist.

### "Consumed" is not a synonym for "deleted"
**Tag:** data
**ERROR:** P2-09 says the confirmed draft is "consumed rather than left behind".
Reading that as DELETE would have thrown away `_meta`, which exists so a wrong
extraction can be explained rather than argued about, and it would have put a
DELETE statement in a migration, which CLAUDE.md 8.6 forbids auto-applying at
all.
**SOLUTION:** consumed is marked: `confirmed_inbound_order_id` plus
`confirmed_at`, a check constraint keeping the pair honest, and the review list
filtering on the column. The draft leaves the queue, points at the order it
became, and cannot be confirmed twice. THE RULE: before writing a DELETE to
satisfy a word in an acceptance line, check whether marking satisfies the same
sentence. It usually does, it keeps the evidence, and it keeps the migration
appliable without an owner in the chair.

### A re-fire that cleared callback_at made the receiver call a replacement a first answer
**Tag:** backend
**ERROR:** `review.spec` case 6 failed in CI with `Expected: 200, Received: 202`.
The re-fire control re-posted the same `order_id`, as the contract requires, and
the callback answering it came back 202 accepted instead of 200 duplicate. The
draft was replaced correctly, so nothing looked wrong on screen: only the status
code lied, and it lied to Make, which is the one reader that acts on it.
**SOLUTION:** `refireExtraction` was clearing `callback_at` together with
`status`, `error_code` and `reason` so the screen would show "in lucru" instead
of a stale failure. But the receiver derives 202-against-200 from `callback_at`
alone, and the contract defines a duplicate on `order_id`, not on how many times
we fired. Clearing it made re-fire the single path that could silently reset the
idempotency counter. Only `status`, `error_code` and `reason` are cleared now;
the screen reads "in lucru" from `status` being null and never needed the
timestamp. Rule: before clearing a field to change what a SCREEN shows, find out
which MACHINE reads it. A field that two readers interpret differently is not a
display flag.

### The eu-west-1 session pooler answers on aws-1, and the repository already said so
**Tag:** infra
**ERROR:** applying 0010, `aws-0-eu-west-1.pooler.supabase.com` resolved and
accepted TCP, then rejected the login with
`FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`. Read as a credential
failure it would have sent the card to `blocked_on: ivan` for a password
rotation that was never wrong.
**SOLUTION:** the host was the wrong one, and the right one was already written
down twice: the 0001 apply journal on the board and an existing `docs/LEARNINGS.md`
entry both name `aws-1-eu-west-1.pooler.supabase.com` as the host that answers.
CLAUDE.md 8.4 forbids guessing a hostname, and reading one back out of a
committed journal is not guessing. Rule: when a derived connection is refused,
search this repository for the same error before touching the credential. This
project has hit it once already and paid for the answer.

### A referential action can break a CHECK constraint the application never violates
**Tag:** data
**ERROR:** Migration 0010 added `confirmed_inbound_order_id` with
`on delete set null`, and next to it a CHECK saying the two confirmation columns
are either both null or both set. Read as a statement about what the application
writes, it is exactly right: a draft must not claim to have produced an order
without saying when. Read as a statement about the row, it is false, because the
column is not only written by the application. Deleting an inbound order fires
the referential action, which NULLs the pointer while `confirmed_at` stays, and
the row the constraint calls impossible now exists. PostgreSQL refuses the
delete with `23514` and rolls back the whole transaction that attempted it.
Nothing in CI would have caught it: no test deletes an inbound order, and the
one file that does, `scripts/reset-test-data.sql`, is **parsed** in CI rather
than executed. The first run would have been the owner, in the SQL editor,
against production, on the day before first real data.
**SOLUTION:** the constraint was replaced (0011) with the implication rather
than the equivalence: `confirmed_inbound_order_id is null or confirmed_at is not
null`. A row that names an order carries a time; a row whose order was deleted
keeps the time, which is the honest record - the draft WAS confirmed and the
order it became is gone. Everything that asks "has this been confirmed" now
reads `confirmed_at`, which nothing but a confirm writes, instead of a pointer a
delete elsewhere can erase.
RULE: before writing a CHECK across two columns, ask what else can write either
of them. A foreign key with `on delete set null` or `on delete set default` is a
second author, and a constraint that assumes the application is the only one is
a delete that fails somewhere far away, long after the migration is applied.

### A socket reset is not a test failure, and the fix is not a retry policy
**Tag:** ci
**ERROR:** `review.spec` case 4 failed in CI with `apiRequestContext.post: read
ECONNRESET` before a single assertion had run. The other sixty cases passed, the
same case had passed in the previous run, and the dev server logged nothing. The
tempting reading is "flaky test, re-run it", and the tempting fix is `retries: 1`
in the Playwright config. Both are wrong here, and the config says why in as many
words: a retry hides a race between requests, and a race in a stock system is a
wrong number in a warehouse.
**SOLUTION:** the failure is at the transport, not in the assertion: a Node HTTP
server closes an idle keep-alive socket after five seconds, and a client that
writes to it at that instant reads a reset. `maxRetries` on the individual
request retries **only `ECONNRESET`** and never on a response code, so a `200`
where a `401` was expected still fails exactly as loudly. `retries` stays `0`.
RULE: read what actually failed before deciding what to repair. A failure with
no assertion in it is a failure of the harness or the transport, and the repair
belongs there, at the narrowest scope that covers it. A suite-wide retry would
have bought the same green while hiding every real race the suite exists to
catch.

### A cleanup script only knows the schema it was written against
**Tag:** data
**ERROR:** Found while working P2-09, recorded rather than fixed because the
file belongs to another card. `scripts/reset-test-data.sql` selects the rows to
delete with `where sku like 'TEST-%'`, which was every test product when it was
written. P2-09's review lane creates flagged products from unmatched extracted
names, and their SKUs are `EXT-<slug>-<hex>`. The reset does not match them, so
every acceptance run leaves catalogue rows behind; worse, the inbound orders
those lines belong to then contain a product that is not in the delete set, so
the order is classified "mixed" and is not deleted either. The file is correct
against the schema of the day it was authored and quietly incomplete against the
one that exists now, and its own post-check would still report zero, because it
counts what it selected.
**SOLUTION:** written onto the P2-15 card, which owns the script and has not run
yet, so it can be corrected before the owner executes it. RULE: a cleanup
selector is a claim about what test data looks like, and it goes stale the moment
a card adds a new way to create a row. Every card that introduces a new row
shape checks the reset script for it, and a post-check that counts only what the
script selected cannot notice the gap.

### CRIT-16: a success message that lives inside the thing success deletes
**Tag:** frontend
**ERROR:** `review.spec` case 2 failed in CI with `review-created` never
appearing, while cases 1 and 3, which confirm in exactly the same way, passed.
The failure snapshot settled it: the catalogue already carried the flagged
product that confirm creates and the list showed no drafts pending, so **the
confirm had succeeded and only the message was missing.** Confirm consumes the
draft; a consumed draft leaves the review list on the next refresh; and the
review form, with its success message inside it, is rendered inside that draft's
row. `router.refresh()` therefore unmounted the message it was meant to show.
Whether the assertion saw it depended on which arrived first, so the case passed
on a quiet machine and failed on a busy one. What the operator would have seen:
press confirm, something flickers, and the screen is an empty document list. The
order exists and there is no way to know it from the screen.
**SOLUTION:** the confirmation moved up into the panel, above the list, and the
form reports the result upward instead of rendering it. The panel outlives the
draft, so the message survives exactly the refresh that removes the row. The
assertion now demands both facts **at once** — the draft card is gone AND the
success panel is visible — because either one alone is what let this through.
RULE: a component that reports the outcome of an action must outlive the thing
the action destroys. When a success handler refreshes a list, ask what unmounts
as a result, and never let the answer include the element carrying the good
news. And when a test asserts a message appears after an action that also
removes something, assert the removal in the same breath: a lone
"message appeared" assertion is a race with a coin-flip you will win most days.

### A PR that is BEHIND main cannot merge, and retrying it forever is not waiting
**Tag:** ci
**ERROR:** The POC harness opened ruling PR #44, saw `quality` green, called
`gh pr merge`, and got refused. It logged "merge call failed, leaving it open"
and moved on. Every subsequent run repeated the identical failure. Three runs
later the PR was still open, `main` had advanced past it, and it had degraded
from `BEHIND` to conflicting, at which point no automated recovery was possible
and a ruling had to be recovered by hand onto a fresh branch. The same failure
had already been hit and fixed manually on PR #33 a day earlier, and the lesson
was never written down, so the harness repeated it.
**SOLUTION:** Branch protection on `main` sets `required_status_checks.strict`,
which means a branch must be up to date with `main` before it can merge, no
matter how green it is. `gh pr merge` will not do that for you. Treat
`mergeStateStatus` as a first-class branch in any merge helper: `DIRTY` needs a
human, and `BEHIND` needs `gh pr update-branch` followed by re-waiting for the
new head sha, once, before giving up. A merge helper that special-cases only
`DIRTY` will retry an impossible merge forever and call it patience.

### A wait budget that counts sleeps does not bound wall clock
**Tag:** infra
**ERROR:** `merge_when_green` had a 900 second budget implemented as
`MWG_WAITED=$((MWG_WAITED + 30))` once per iteration, assuming each iteration
cost the 30 seconds it slept. The two `gh` calls at the top of the loop have no
timeout. On 2026-08-27 those calls became slow, each iteration cost about 135
seconds instead of 30, and the loop ran for 67 minutes 45 seconds against its
15 minute budget, inside a run capped at 45 minutes, before EXECUTOR had started
at all.
**SOLUTION:** Bound a wait by a deadline computed from the clock
(`deadline=$(( $(date +%s) + budget ))`, loop `while [ "$(date +%s)" -lt "$deadline" ]`),
never by accumulating the durations you intended to sleep. Separately, wrap every
network call inside such a loop in its own timeout; bash has none and macOS
ships no `timeout(1)`, so run the call in the background and kill it if it
overruns. A budget that assumes the body is fast is not a budget.

### Measuring only the default branch makes a working run look idle
**Tag:** ci
**ERROR:** The harness computed `cards_touched` by diffing the board before and
after against `origin/main`. Three consecutive scheduled runs each worked P2-09
hard, writing migration `0010`, `lib/data/extraction*.ts`, a seven case
Playwright spec and a draft PR, and every one of them reported
`cards touched: none` and a digest saying `SHIPPED THIS RUN: none`. The work was
real and was on an unmerged branch, so `main` never moved. From the outside a
run that built for 45 minutes was indistinguishable from a run that did nothing,
and the defect was reported as "the harness identified work and did not do it"
when it had in fact done the work.
**SOLUTION:** An unattended run must report what it did, not only what landed.
Read the card branches as well as the default branch, mark branch work
distinctly (`<id>:branch:<status>`), and give it its own heading in the report.
Then add the inverse rule as a hard invariant: a run that had an eligible card
and shipped nothing writes an escalation naming the card and the reason, every
time. Silence about an eligible card is a defect, never a normal outcome.

### AUT-1: a bare catch turned a missing import into a missing file
**Tag:** ci
**ERROR:** The digest reported `REPORT: none committed` about a report that was
sitting on disk in the directory it had just been told to read. The lookup was
correct, the regex matched the filename when tested on its own, and the path
resolved to the right worktree. The function called `fs.readdirSync(dir)` inside
`try { } catch { return null; }`, and `notify.mjs` imports `readFileSync` by
name and never binds `fs`. So the call threw a `ReferenceError`, the bare catch
swallowed it, and the function returned the value that means "the directory is
not there". **Nothing in CI would have caught it:** `notify.mjs` is the digest
sender and the Playwright suite never runs it, so the only symptom would have
been a digest quietly saying no report existed, on every run, forever.
**SOLUTION:** import `readdirSync` by name like every other binding in the file,
and narrow the catch to the one error that is an expected outcome:
`if (error && error.code === "ENOENT") return null; throw error;`
RULE: a bare `catch` that returns a normal-looking value converts every
programming error inside the `try` into that value. Catch the condition you
meant, by code, and rethrow the rest. And when a lookup returns "not found" for
something you can see with `ls`, suspect the catch before the query.

### An unbound variable in a heredoc empties the file and the run keeps going
**Tag:** infra
**ERROR:** `run.sh` builds EXECUTOR's prompt with `cat > "$PROMPT_FILE" <<PROMPT_EOF`
and a claim-lease line was added to it that interpolated `$CLAIM_SKIPPED`. That
variable is assigned about fifty lines further down. Under `set -u` the
expansion failed, the heredoc aborted at that line, and `$PROMPT_FILE` was left
**zero bytes**. The script has no `set -e`, so it continued and ran
`claude -p "$(cat "$PROMPT_FILE")"` with an empty prompt. Claude answered
`Error: Input must be provided either through stdin or as a prompt argument when
using --print` and exited 1. The harness logged `EXECUTOR finished, exit 1` and
carried on to send a digest, so the run looked like a model failure when in fact
EXECUTOR had never been given anything to do.
**SOLUTION:** Compute every variable a heredoc interpolates **before** the
heredoc, not merely before it is used. `set -u` turns an ordering mistake into a
silently truncated file rather than an error you can see. Then assert the
artefact: `[ ! -s "$PROMPT_FILE" ]` and refuse to invoke, with a message saying
this is a defect in the script rather than a failure of the run. A generated
input that is empty must never be passed to the thing it was generated for.

### P2-15: a delete set that classified its own residue as somebody else's data
**Tag:** data
**ERROR:** `scripts/reset-test-data.sql` identified test rows by
`products.sku like 'TEST-%'`, which was every test product on the day it was
written. P2-09's review lane then began creating flagged products with SKUs
shaped `EXT-<slug>-<hex>`, and they did not match. The second-order effect is
the one worth keeping: the inbound order created by confirming an extracted
document has lines pointing **only** at those products, so under the old
definition it had a line pointing at a product outside the delete set, which
made it **mixed**, and mixed orders are left alone **by design**. One acceptance
run therefore left behind a product, an order, its lines and its history row,
and every one of them was protected by the rule that exists to protect real
data. **The post-check still printed zero**, because a post-check that counts
what the selector selected can only ever confirm the selector agrees with
itself.
Separately, `extraction_drafts` and `extraction_draft_lines` arrived in
migration 0008, after this file was authored, and nothing in it had ever touched
them. Those rows are visible on screen: the review panel lists them, so
production would have opened with a list of `TEST-` documents waiting for the
client to verify.
**SOLUTION:** the selector resolves in stages and the second marker is
**evidence rather than a name pattern**: `EXT-` is also what real use creates
after launch, so a product is in scope only when it sits on an order that a
*seed draft* became, and a seed draft is one carrying the suite's own filename
marker, or attached to an order already in the delete set, or confirmed into
one. The order test is then applied against the full product set, so an order
made only of test-originated `EXT-` products is wholly test-originated and goes,
while a genuinely mixed one is still never deleted.
RULE: a cleanup selector is a claim about what test data looks like, and it goes
stale the moment a card adds a new way to create a row. Every card that
introduces a new row shape checks the reset script for it. And when a delete set
and its verification share one definition, the verification cannot fail: prove
the set from the other end, by counting what the new shape produces and looking
for it afterwards by name.

### P2-19: three merge-conflict markers were committed to main inside LEARNINGS.md
**Tag:** infra
**ERROR:** `docs/LEARNINGS.md` on `main` carried six live conflict marker lines,
`<<<<<<< HEAD`, `=======` and `>>>>>>> origin/main`, one pair nested inside
another. All three learnings entries were present and complete; only the markers
were left behind, so nothing read as obviously broken and nothing failed. **No
check would ever have caught it:** the `quality` job typechecks, builds,
validates both boards and parses two SQL files, and none of those opens a
markdown document. The file is append-only by convention, so the next role to
follow section 9 would have appended underneath a dangling `>>>>>>>` and made it
worse.
**SOLUTION:** the six lines were stripped and the three entries verified intact
by name. RULE: a conflict resolved by hand is verified by grepping the resolved
file for marker lines before the commit, not by reading the part you were
looking at. And a repository whose doctrine lives in prose needs one check that
reads prose: any tracked text file containing a line that starts with `<<<<<<< `
or `>>>>>>> ` is a failed merge, wherever it is.

### P2-19: a grep cannot tell a SQL statement from a quoted string
**Tag:** data
**ERROR:** `scripts/ledger-rows-0010-0012.sql` writes three bookkeeping rows and
embeds each migration's own text in the `statements` column, so its text
contains `DROP`, `DELETE`, `ALTER TABLE` and `on delete set null`. Read by grep,
or by eye, the file looks like something CLAUDE.md 8.6 forbids a terminal from
applying. It is not: every one of those words sits inside a `$mig$`-quoted
string literal and none of them is a statement.
**SOLUTION:** parse it. `pgsql-parser` is the real PostgreSQL grammar, needs no
connection, and reports the file as 8 statements: one `TransactionStmt`, four
`SelectStmt`, three `InsertStmt`, all three inserts targeting
`supabase_migrations.schema_migrations`. RULE: the destructive-statement stop in
8.6 is a question about statements, so it is answered by a parser and never by a
text search. A grep can only produce a false alarm here, and a false alarm on
that rule is as expensive as a miss, because it parks a safe file on the owner.

### P2-19: a check that has never failed is a check nobody has tested
**Tag:** ci
**ERROR:** The first version of `npm run check:ledger-rows` compared the
generated file against the committed one and then parsed it. Mutating the
committed file to prove the parse checks worked only ever tripped the diff
check, which runs first, so checks 3 through 6 exited before executing. They
were green on every run and had never been exercised once.
**SOLUTION:** mutate the **generator**, regenerate, and check. Generator and file
then agree, the diff check passes, and the parse checks are the ones under test:
appending a real `delete` and a `commit;` makes check 3 report `DeleteStmt`
outside the allowed set and check 6 report
`["TRANS_STMT_BEGIN","TRANS_STMT_COMMIT"]`, exit 1. RULE: to test an assertion
that sits behind an earlier gate, satisfy the gate first. Mutating the input at
the wrong layer proves the gate works and says nothing about the assertion.

### A timeout guessed from intuition kills the thing it was meant to protect
**Tag:** infra
**ERROR:** The conversational responder capped each answer at 120 seconds, a
number chosen because it sounded generous. Measured against the real repository,
a plain question ("how many jobs are left") took **158 seconds** end to end, and
the longer opening question took longer still. Every honest answer would have
been killed at 120 seconds and replaced by the fallback line "I could not answer
that one", so the feature would have appeared broken while working correctly.
The same file also hardcoded a stale-lock threshold of 600 seconds while the
worst case healthy poll was 3 answers times 120 seconds, or 900 seconds: a slow
but working poll would have had its lock stolen by the next poll, and two
pollers would have answered at once.
**SOLUTION:** Measure before choosing a timeout, and measure against the real
input rather than a toy one. Then derive every dependent limit from it instead
of hardcoding a second guess: the stale-lock threshold is now
`timeout * max_per_poll + buffer`, so it cannot drift below the worst case when
either input changes. A guessed timeout is a silent failure generator, because
the artefact it produces is an error message rather than an obviously missing
result.

### launchctl bootout kills the job it is replacing, and a failed bootstrap can leave half an install
**Tag:** infra
**ERROR:** `scripts/poc/install.sh` does `launchctl bootout` then `bootstrap` so
a reinstall replaces a definition rather than layering on it. Run while a work
run was in flight, the bootout **terminated the running job**: an EXECUTOR 36
minutes into its work died and the log recorded `EXECUTOR finished, exit 143`,
which reads as a model failure rather than as somebody reinstalling underneath
it. The bootstrap that followed then failed with `Bootstrap failed: 5:
Input/output error`, and because that path called `exit 1`, the script returned
before installing the **second** agent at all. A reinstall that looked like it
had run had silently deployed half of itself, and the responder kept running its
old timeout.
**SOLUTION:** An installer that replaces a running service must refuse while
that service is working: check the run lock and exit non-zero, with `--force`
for the case where the operator means it. And a multi-agent installer must not
abandon agent two because agent one failed to bootstrap: record the failures,
install everything, and report at the end with a non-zero exit. Partial installs
are worse than failed ones, because nothing looks wrong.

### A card id in a commit message is not a card
**Tag:** infra
**ERROR:** Three PRs merged to `main` under the ids AUT-5 and AUT-6, including a
558-line Telegram responder. Neither id exists on any board, and `git log -S`
over `docs/board/` proves neither was ever on one. The board reported 32 cards
while the repository carried work from at least 34, and one of those non-cards
changed the behaviour of a shipped card (AUT-4's triage sections stopped
reaching the digest). None of it carried `plain`, `acceptance` or `evidence`,
because there was no card to carry them on.
**SOLUTION:** Retro-author the missing cards so the board matches the
repository, then close the hole: the board validator checks cards that exist, so
it can never catch a commit that asserts an id with no card behind it. The check
that catches this is a CI step that reads every card-id prefix in the commit
messages on `main` and asserts each one resolves to a card on a board. Rule: a
validator that only inspects the artefact cannot detect the artefact's absence,
so anything mandatory needs a check on the *reference* side too.

### A sleep-based watchdog measures awake time, not wall clock
**Tag:** infra
**ERROR:** `scripts/poc/run.sh` enforces its 45-minute cap with a background
`sleep "$POC_MAX_SECONDS"` that TERMs the model process when it returns. Run
20260827-220052 took the lock at 02:00:52Z and was still alive and still holding
it at 09:53Z, nearly 8 hours later, with the `sleep 2700` process still resident.
On macOS a sleeping timer does not advance while the system is suspended, so an
overnight run on a laptop that suspends measures awake seconds and calls them
wall clock. The compounding failure is worse than the overrun: CLAUDE.md 13 says
a run never starts while `run.lock` exists, so one overrunning run silently
consumed the 01:00 and 04:00 slots as well.
**SOLUTION:** Never count down to a deadline, compare against it. Store
`date +%s` at start and have the watchdog poll a short interval against
`start + POC_MAX_SECONDS`, which reads the clock instead of racing it and is
therefore immune to suspension. Pair it with lock staleness: a lock older than
the cap plus a margin is abandoned, not honoured. Rule: any timeout that must
hold across a suspend/resume boundary is a deadline comparison, never a sleep.

### A debug flag defeats a script's own secret discipline, and a secret in a URL is public to the machine
**Tag:** infra
**ERROR:** Two separate exposures of `TELEGRAM_BOT_TOKEN`, found on 2026-08-27
while verifying that the chat poller was reaching Telegram.

**First, the debug flag.** `scripts/poc/responder.sh` is written so that no
Telegram URL is ever echoed, because the Telegram API carries the bot token in
the URL path. Running it as `bash -x` to check it was polling printed the whole
`curl` command line, token included, into the session. Worse, the same trace
printed `TELEGRAM_BOT_TOKEN=<value>` from the `. "$POC_SECRETS_FILE"` line:
**sourcing a secrets file under `set -x` traces every assignment in it**, so one
debug flag dumps the entire file, not just the variable being investigated. The
script's careful "never echo a value" discipline was irrelevant, because the
trace is produced by the shell rather than by the script.

**Second, the process table.** Even with tracing off,
`curl "https://.../bot<token>/getUpdates"` places the token in the process
arguments, where **any process on the machine can read it from `ps aux`** for as
long as the call runs. No amount of care inside the script prevents that,
because argv is published by the kernel, not by the script.

**SOLUTION:** For the URL, `curl --config -` and feed the URL through a here-doc
on stdin. It reaches curl as configuration rather than as an argument, so it is
in no argv, no process table entry and no trace. For the trace, suppress `set -x`
explicitly across the whole secrets block and every command that expands a
secret, capturing the prior state and restoring it:

```
case "$-" in *x*) WAS_X=yes; set +x ;; *) WAS_X=no ;; esac
...
[ "$WAS_X" = yes ] && set -x
```

Record presence as a `NAME=set` string built inside the suppression, so the
later `[ -n "$SECRET" ]` check never expands a value into a traced command word.

Verified after the fix by running `bash -x` on the real script and grepping the
trace for every secret in the file: zero occurrences of the bot token, the
service role key, the database password, the Resend key and the rest. The only
match is `TELEGRAM_OWNER_ID`, which ruling R-006 records as not a credential.

The general rule: **a secret's exposure is a property of where it is placed, not
of how carefully the surrounding code is written.** Put it on stdin, never in an
argument, and assume any script may one day be run with tracing on.

### launchd ProcessType Background throttles a poller into uselessness
**Tag:** infra
**ERROR:** The chat responder was installed with `StartInterval` 60 and
`ProcessType` `Background`, on the reasoning that a background poller is a
background job. Measured over a day, the real gaps between polls were **18, 32
and 38 minutes**, not 60 seconds. `ProcessType Background` places the job in a
low quality-of-service class that macOS throttles aggressively, and
`StartInterval` is a floor rather than a guarantee: launchd is free to run the
job later, and under that QoS it does. A user asking the bot a question would
have waited half an hour for an answer and concluded it was broken, while every
log line said the poller was healthy.
**SOLUTION:** Set `ProcessType` to `Interactive` for anything a human waits on,
and `LowPriorityIO` to false alongside it. Measured again immediately after:
polls at 61, 61, 61 and 61 seconds. Pick `ProcessType` from **who is waiting**,
not from whether the work feels like background work: a job nobody waits on can
be `Background`, and a job somebody is sitting in front of cannot.

Two related things worth separating when reading such a gap. Long gaps while the
machine is asleep are not this defect and are not fixable here: launchd cannot
run a job on a sleeping Mac, and a poller should not be keeping it awake. Only
the gaps recorded while the machine was demonstrably awake are evidence.

### CRIT-17: two redirects pointing at each other, and only for a signed-in user
**Tag:** auth
**ERROR:** Production answered `ERR_TOO_MANY_REDIRECTS` after a successful
sign-in. `proxy.ts` evaluated "authenticated and on the login page, so go to
`/`" BEFORE "no active profiles row, so go to the login page". Any session whose
profile lookup came back empty bounced between the two forever. **The site looked
healthy to anyone not signed in**, which is why nothing caught it: unauthenticated,
`/` answers 307 to `/autentificare` and `/autentificare` answers 200, on both
hosts, and every existing auth test signs in as an account that HAS a profile.
The one state that loops was the one state no test could reach, because the seed
script only ever created accounts complete with their profile row.
**SOLUTION:** resolve the profile before any branch decides where the request
goes, and **rewrite** to a dedicated screen instead of redirecting. RULE: a
refusal that the refused user can trigger again by following it must be a
rewrite, never a redirect. The 403 screen already worked that way and had a
comment saying why; the profile branch did not, and that is the whole defect.
Second rule, for tests: a seed that only produces valid accounts cannot test what
happens to an invalid one. The state a guard exists to catch has to be seedable
on purpose.

### CRIT-17: an unbound error made a broken policy look like a deleted account
**Tag:** auth
**ERROR:** `const { data: profile } = await supabase.from("profiles")...` left
`error` unbound. A PostgREST failure, a changed RLS policy and a genuinely
missing row all produced `profile === null` and all took the same branch. An
infrastructure fault would have been reported to the user as a fact about their
account, and to nobody at all in the logs.
**SOLUTION:** bind the error and separate the two. `PGRST116` is PostgREST's
code for "single() matched no row", which is the expected absence; anything else
is logged as a defect. The refusal stays identical for both, because entering
with an unknown role is worse than not entering. RULE: destructuring only `data`
from a client that also returns `error` converts every failure into the empty
case. If the empty case triggers a user-visible decision, bind the error.

### The lock did not skip those three windows, launchd never started them
**Tag:** infra
**ERROR:** Run `20260827-220052` held `run.lock` from 02:00:52Z to 11:06:54Z and
the 01:00, 04:00 and 07:00 windows produced nothing. The obvious reading, and
the one carried into the card, is that each of those runs started, found the
lock, logged its refusal and exited 0. **That is not what happened.** `run.sh`
opens `/Users/ivan/rc-poc-logs/<run-id>.log` and tees into it BEFORE it tests the
lock, so a refused run leaves a log file behind by construction. There is no
`20260828-*` artifact of any kind: no log, no prompt, no board snapshot. Those
three invocations of `run.sh` never happened at all.

Two mechanisms, both launchd's and neither the lock's. A `StartCalendarInterval`
that comes due while the job is already running is dropped rather than queued,
because launchd will not run a second instance of a label. And `pmset -g log`
accounts for 29853 of those 31300 seconds with the machine asleep, so the
firings that landed during sleep coalesce into one on wake, which then hits the
first rule anyway.
**SOLUTION:** the fix for a lost window is the cap, not the lock. A run that
ends on time frees the label and the next window fires normally; stale lock
reclaim is the backstop for a lock whose process is already gone, and it cannot
by itself recover a window launchd never scheduled. RULE, more general than this
harness: before building the fix for a silent gap, prove which component was
silent. "The refusal path ran and said nothing" and "the process never started"
look identical from the outside and have opposite repairs. The artifact a
component writes unconditionally is the cheapest way to tell them apart.

### The leftover sweep does not know about the branch TRIAGE opens
**Tag:** infra
**ERROR:** Noticed while fixing the TRIAGE checkpoint, not fixed there. The
start-of-run leftover sweep in `run.sh` merges open PRs whose head branch starts
with `poc/state-` or `poc/ruling-`. TRIAGE opens its PR on `triage/<run-id>`,
which matches neither. PR #83, carrying eight rulings, was opened at 10:57:07Z on
2026-08-28 and was still open days later with no run ever looking at it. The
checkpoint added on 2026-08-28 means the next such PR is at least *named* in the
run log; nothing yet merges it.
**SOLUTION:** not applied here, on `CLAUDE.md` section 3: the PR does what the
card says and nothing else. Recorded so it becomes a card rather than a quiet
extra commit. RULE: a prefix list that has to agree with a branch name invented
somewhere else is a coupling nobody can see. The branch is now mandated in the
TRIAGE prompt and held in one variable, so the sweep can be taught it in one
line once there is a card for that line.

### A SQL assertion that reads a frozen temporary table on both sides cannot fail
**Tag:** data
**ERROR:** `scripts/reset-test-data.sql` printed `PRE MIXED left alone` and
`POST MIXED left alone` and both read `count(*) from rc_reset_mixed`, a
temporary table resolved before the first DELETE. The two numbers were equal
whatever the run did, including a run that deleted every mixed order. The check
that existed to protect the one class of data the file does not own could not
detect the thing it was for.
**SOLUTION:** An after-check must be counted against the LIVE tables, never
against the snapshot the before-check came from. The rule that catches the next
one: for every assertion, ask what edit to the DELETE block would make it fail,
and if the honest answer is "none", it is decoration. RST-01 proves each
assertion by running a mutated copy of the file that breaks exactly that
assertion and confirming the non-zero exit.

### CASE does not protect a literal cast from constant folding
**Tag:** data
**ERROR:** The obvious pure-SQL way to raise from a plain SELECT,
`select case when ok then 'PASS' else 'message'::int::text end`, raises on the
PASSING path too. PostgreSQL constant-folds `'message'::int` at planning time,
so an unreachable branch still errors. Verified on PostgreSQL 16.15:
`select case when true then 'ok'::text else ('boom')::int::text end` fails with
`invalid input syntax for type integer: "boom"`.
**SOLUTION:** Make the cast target non-constant, so the planner cannot fold it:
build the message from a subquery over a table, for example
`(select string_agg(name, '; ') from rc_reset_assertions where not passed)::int::text`.
The rule: any deliberate-failure expression in an unreachable branch must depend
on a relation, never on a literal.

### AND binds tighter than OR, so appending "and false" half-neuters a DELETE
**Tag:** data
**ERROR:** While building a negative test, a DELETE with an `A or B` WHERE
clause was neutered by appending ` and false` to the end. That parses as
`A or (B and false)`, so the `A` branch still ran and deleted 2 of 3 rows. The
test still went red, for the wrong reason, and the first reading of the result
was that a trigger had eaten the rows.
**SOLUTION:** Neuter a multi-branch predicate by prefixing `where false and (`
and closing the parenthesis, never by appending to the tail. The general rule:
when a result is surprising, suspect the instrument before the subject. There
was no trigger; `pg_trigger` was checked and confirmed it.

### Supabase migrations run on plain postgres with a five-object shim
**Tag:** infra
**ERROR:** This repository's schema had never been applied by any tool: P2-15
shipped SQL with the card admitting "there is no PostgreSQL binary and no
running Docker on this machine, so no parser has seen this SQL". The migrations
reference `auth.users`, `auth.uid()`, `storage.buckets` and the `anon`,
`authenticated` and `service_role` roles, none of which exist on a stock
`postgres:16` image, so applying them there fails immediately.
**SOLUTION:** All twelve migrations 0001 to 0012 apply UNMODIFIED onto stock
`postgres:16` after a shim that creates: roles `anon`, `authenticated`,
`service_role`; schemas `auth` and `storage`; table `auth.users`; functions
`auth.uid()` and `auth.role()`; tables `storage.buckets` and `storage.objects`.
That makes the whole schema reproducible locally with no credentials and no
Supabase project, which is what lets a destructive script be proven before it is
handed to the owner. Note `docker cp` kills Docker Desktop on this machine: bind
mount the repo read only and feed psql on stdin instead.

### Chat is not authority, and three dispatches in one day were written against a record that did not exist
**Tag:** infra
**ERROR:** On 2026-08-28 the owner ran `scripts/reset-test-data.sql` against the
client's database, read the grids, and the outcome was ratified in the strategy
chat. None of it was committed. Three consecutive dispatches were then written
against that uncommitted record and **every one of them carried a premise the
repository did not support.** Landing PR #83 was dispatched as CONFLICTING and 7
behind when `origin` had already been merged into by a broken resolution nobody
validated. RST-01 was dispatched with P2-15 having run, its grids "in the board
evidence", and "the ledger execution ruling ratified 2026-08-28" as the
authority to run eleven DELETE statements against production: P2-15 was
`blocked` with `evidence: null`, and `decisions/inbox.md` ended at R-046 with no
such ruling. REC-01 was dispatched to close PR #83 unmerged when #83 was already
MERGED and `c97e48e` was its own squash-merge commit. One action was refused,
RST-01's step 4, and the refusal was correct. One further step, REC-01's step 5,
was inapplicable rather than refused.
**SOLUTION:** the rule was already in this repository twice, in the
`decisions/inbox.md` preamble and in `CLAUDE.md` 9b, and it is the same sentence
both times: if it is not committed, the next session cannot see it. R-050 writes
it into `docs/DOCTRINE-TRIAGE.md` as a rule of the role: **a ratification is not
a ratification until it is a committed line with an id.** It binds TRIAGE
hardest because TRIAGE is stateless and arrives with no memory of any
conversation, so anything uncommitted is invisible to it by construction. RULE:
verify every dispatched premise against the repository before building on it,
and treat a premise that cannot be verified as absent rather than as probably
fine. Verifying cost nothing all three times, and once it was the difference
between refusing an irreversible delete and performing one.

### A stripped conflict marker leaves its tail behind as file content, and a marker grep cannot see it
**Tag:** infra
**ERROR:** `docs/LEARNINGS.md` carried two lines of pure wreckage from an old
conflict resolution: ` poc/19-harness-caps` at line 1536, sitting between two
unrelated entries, and ` main` as the final line of the file. Whoever resolved
the conflict deleted the `<<<<<<< `, `======= ` and `>>>>>>> ` characters and
left the branch names behind, so they became ordinary content. Grepping for
`<<<<<<<` finds nothing and the file reads clean to a skim. This is the same
failure that made the board JSON at `555b725` unparseable and stranded PR #83,
found in a second file two days later.
**SOLUTION:** removed both lines. RULE: a conflict marker grep proves nothing.
Search for the **tails** instead, the branch and ref names, anchored to the
start of a line: `main`, `HEAD`, and anything matching `card/`, `poc/`,
`triage/`, `board/` or `report/` alone on its own line. A file with a parser
(the board JSON) fails loudly when this happens; a file without one (a Markdown
document) carries it silently until someone reads that exact line.

### The forecast in a dispatch is not the acceptance, and a destructive run must not be gated on it
**Tag:** data
**ERROR:** RST-01 step 4 was dispatched with the expectation "3 CRITIC-RACE
products and 1 TEST- category removed, everything else already 0". The run
deleted **20 rows**: also 2 inbound_orders, 2 outbound_issues, 2 order_lines, 2
outbound_lines, 2 batches and 6 status_history rows. The CRITIC's concurrency
test had not only created three products, it had issued their stock twice, so a
whole descendant tree hung off them that nobody had forecast.
**SOLUTION:** Nothing needed fixing, and that is the point. Every extra row
entered the delete set through the `not exists` clause, which admits an order
only when NO line points outside the set; `PRE MIXED 0`, assertion 20 and the
five orphan checks proved nothing real was touched. Had the run been gated on
the forecast, a terminal would have had to decide on the spot whether sixteen
unpredicted rows were safe to delete, which is exactly the judgement R-047
forbids. The rule: **gate a destructive run on assertions the script evaluates,
never on a predicted row count.** A forecast that turns out wrong should change
nothing about whether the run was safe.

### Check a "did it commit despite failing?" condition mechanically, not by reading
**Tag:** data
**ERROR:** RST-01's halt condition was "if the script commits despite an
assertion failing". That is a claim about output, and reading a 20-row grid to
confirm 20 PASS is exactly the eyeball judgement the assertion harness exists to
replace.
**SOLUTION:** Assert it: `PASS=20, FAIL=0, one COMMIT line, zero "RESET
ABORTED", psql exit 0`, all four checked with `grep -c` and compared to
expected values. The rule generalises: when a halt condition is a statement
about tool output, express it as a command whose exit status answers it.

### A project ref is not a secret, and the repo says so in writing
**Tag:** infra
**ERROR:** Reporting a production run risks either leaking a credential or
redacting so much that the record cannot be verified by anyone else.
**SOLUTION:** `scripts/production-refs.mjs` settles the line explicitly: a
project ref "is not a secret: NEXT_PUBLIC_SUPABASE_URL carries it into the
JavaScript bundle sent to every browser". So the ref, the pooler host, the port
and the user shape are all nameable in a report and a board field, and only the
values behind `SUPABASE_DB_PASSWORD` and the keys are not. Pass the password
through `PGPASSWORD` rather than a connection string so it cannot surface in an
error message, and filter tool output with `sed` on the value before printing.

### The branch that wrote the stripped-tail rule broke it twenty minutes later
**Tag:** infra
**ERROR:** PR #94 added the entry above titled "A stripped conflict marker leaves
its tail behind as file content", removed the two tails it named, and wrote the
rule: search for the tails, not the markers. Its very next commit, the `main`
merge at `9010980`, produced four fresh tails across two files:
` board/aut-12-14-authorization-grants` and ` main` twice in this file, and an
`as_of` pair in `docs/board/rc-board-phase2.json`. The board one did not parse and
turned `quality` red at the Validate boards step. The three markdown ones were
silent, and one of them restored the exact final-line tail the same branch had
just deleted.
**SOLUTION:** Resolved by hand, and no content was lost on either side, verified
rather than asserted: `### ` headings counted against both merge parents (86 and
87 in, 89 out, none missing), and the board parsed and its card ids, statuses and
gate count compared against both parents. RULE: **a rule written in a document
does not enforce itself, and the author of a rule is not exempt from it.** This
is the entry that answers "why is the guard a script and not a paragraph". The
paragraph existed, was freshly written, was written by the person who then broke
it, and cost twenty minutes to become false. `npm run check:conflict-residue`,
shipped by GUARD-01 in the entry above, is what the paragraph could not be.

### A conflict resolution that strips the marker characters is invisible to every check
**Tag:** infra
**ERROR:** Three resolutions reached this repository carrying residue and nothing
caught any of them, because in all three the resolver deleted the marker
CHARACTERS and left the tails as file content. `555b725` produced a board JSON
that did not parse. `d66a28e` put ` poc/19-harness-caps` and ` main` into this
file at lines 1536 and 1636, where markdown has no parser to offend, and they sat
on `main` through four subsequent merges. PR #94 produced four more from the
GitHub web editor. `grep '<<<<<<<'` finds nothing in any of them: the characters
it looks for are exactly the ones the bad resolution deleted.
**SOLUTION:** `npm run check:conflict-residue`, in `quality` on every push. The
signature is precise rather than heuristic: `<<<<<<< branch` is seven markers, a
space and the ref, so deleting the markers leaves exactly ` branch`, a line whose
ENTIRE content is whitespace plus a bare git ref. RULE: when a check can be
defeated by deleting the thing it greps for, the check is the wrong shape. Look
for what the damage leaves behind, not for what it removes.

### A guard that cannot tell a quotation from the bug forbids writing about the bug
**Tag:** infra
**ERROR:** The conflict-residue guard's first draft would have failed on
`docs/reports/2026-08-28-executor-land-triage-83.md`, which QUOTES the residue it
describes, including intact `<<<<<<<` markers. A guard like that makes every
incident report unwritable, so the next incident goes undocumented.
**SOLUTION:** Skip fenced code blocks for the text checks, and verify the split
is real before relying on it rather than assuming it. Measured across the tree:
all three incidents occurred outside a fence, and every quotation of them is
inside one. RULE: before adding a content check, grep the repository for what it
would flag TODAY. If it flags the documentation of the problem, the rule needs a
context, not a suppression list.

### JSON.parse accepts duplicate keys silently and keeps the last one
**Tag:** data
**ERROR:** Delete a conflict's marker tails by hand and keep both sides, and a
JSON file is left holding the same key twice. It parses. `JSON.parse` takes the
LAST occurrence with no warning, so the file is valid, the board validator is
green, and the board is quietly reporting whichever half of the conflict happened
to be second. PR #94's board carries exactly this: two `as_of` keys. Marker
checks pass on it; only a duplicate-key check sees it.
**SOLUTION:** Parse `docs/**/*.json` with a small recursive-descent parser that
records a duplicate key and its line rather than collapsing it. `JSON.parse` has
already discarded the duplicate by the time any reviver runs, so a reviver cannot
do this. RULE: "it parses" is not "it is what was intended", and the gap between
those two is exactly where a half-finished merge lives.

### A ruling number that is free on main can still be owned by an open PR
**Tag:** infra
**ERROR:** `decisions/inbox.md` on `main` ended at R-048, so R-049 to R-051
looked free. PR #94 was open and authored exactly those three. Taking them would
have forced that lane to renumber on merge, which is the collision R-012 already
ruled on when it shifted four rulings rather than edit an existing one.
**SOLUTION:** Before claiming an append-only id, check the open PRs as well as
`main`: `gh pr diff <n> | grep -oE '^\+### R-[0-9]+'`. Number after theirs and
leave the gap; it closes when they land, and a permanent gap is cheaper than
forcing another lane to rewrite committed text. The same applies to migration
numbers and to any monotonically increasing id in a shared file.

### A dispatch cited a report filename that does not exist, and the report does
**Tag:** infra
**ERROR:** An owner dispatch instructed "read section 4 of
`docs/reports/2026-08-28-executor-crm-board-halt.md`". That file exists at no
commit, on no branch, in no worktree: `git log --all --name-only` for the
pattern returns nothing and `find` over the repository returns nothing. Under
the halt-on-a-false-premise rule that reads as an absent premise, and the
instruction was step 0d of four, blocking the whole deviz reconciliation.
**SOLUTION:** The content was on `main` the whole time, in
`docs/reports/2026-08-28-executor-phase-3-crm-preflight.md`, whose section 4 is
titled "The deviz addendum against the authored card: the delta". A wrong
filename is not an absent artefact. RULE: before treating a cited file as
missing, search for its CONTENT and not only its NAME. Two commands settle it:
`ls docs/reports/` for the same date and role, then a grep for a distinctive
phrase from the citation ("deviz addendum", "twelve differences") across
`docs/`. Halting on a typo costs a session; the check costs ten seconds. The
same shape has now appeared three times in this repository, and it is the mirror
of the chat-is-not-authority failure rather than a repeat of it: there the
record did not exist, here it did and was misnamed.

### A wrong acceptance line does not fail, it certifies
**Tag:** data
**ERROR:** Card P3-18's acceptance asserted that a project `in lucru` is
EXCLUDED from the material requirement even when it carries a deviz. The owner
addendum includes it. An executor working that card would have written the
Playwright assertion the card named, watched it pass, shipped the card green,
and produced a procurement screen that omits the largest committed demand on the
board. Nothing in the pipeline would have gone red at any point. The same card
also summed estimate quantities with no subtraction of what had already been
issued, which over-orders by exactly the amount already delivered.
**SOLUTION:** Both were caught by a preflight that compared the authored cards
against the owner's spec BEFORE the wave started, and they were fixed on the
board rather than in review. RULE: a machine-checkable acceptance line is only
as good as the spec it was written from, and it is the one artefact whose being
wrong produces a GREEN result. When a card's acceptance and a later owner
instruction disagree, that is not a detail to reconcile during the build. It is
a board edit and a ruling, done first, because the build cannot detect it. The
strong signal to look for: an acceptance line that asserts something is EXCLUDED
or ABSENT. An assertion of absence is the one that silently keeps passing while
the requirement changes underneath it.

### A rule that waits on a third party is a rule that never fires
**Tag:** infra
**ERROR:** The phase 3 board's doctrine said the board was worked by nobody
until the phase 2 launch gate reached 9 of 9, and that a terminal picking a P3
card before then had made a mistake and should stop. The phase 2 gate is at 6 of
9, and all three open conditions are downstream of a third party: G4 needs the
extraction round trip, P2-08b is `blocked` on Andre, and G9 needs the client to
complete a cycle that is itself downstream of G4. The gate cannot reach 9 of 9
on any timetable this repository controls, so the sequencing rule did not mean
"phase 3 comes later", it meant "phase 3 happens when somebody outside the
project gets round to something else". What was queued behind it was client and
project management, the owner's primary complaint about the platform.
**SOLUTION:** The owner opened phase 3 by dispatch, which is the owner ruling
the sentence had reserved the decision for, and the harness half of it was kept:
the unattended runs still read the phase 2 board by path. RULE: when writing a
sequencing rule, check whether its unblock condition is inside this project's
control. If it is not, the rule needs an explicit escape or a named owner
decision, or it will quietly become a permanent block that nobody rereads. Write
the escape at authoring time, when the condition is fresh, rather than
discovering it as a halt weeks later.

### The Supabase shim is what rots, not the migrations it applies
**Tag:** ci
**ERROR:** `npm run check:migrations` applies every migration to a bare
`postgres:16` after a shim that creates the objects Supabase provides. The
AUT-14 card defaults said in capitals that it must NOT be added to the quality
workflow, because CI already applies the same files to a real stack through
`supabase start` and `supabase db reset`, so a second weaker application buys
nothing. That reasoning is correct about the migrations and weighs the wrong
artefact.
**SOLUTION:** The step does not guard the migrations, which are already guarded.
It guards `shim.sql`. The day a migration references a Supabase object the shim
lacks, `supabase db reset` still passes, because a real stack has every object;
the local tool silently stops working, and nobody finds out until the next
session that needs it, offline, with no credentials, in the middle of proving a
destructive statement. RULE: when deciding whether a check earns its place in
CI, ask what it guards rather than what it asserts. Two checks can assert the
same fact and guard different artefacts. The general form is already in this
workflow, in the comment on the board validator: a board nobody works is exactly
the board that rots, and the same is true of a tool nobody exercises.

### pg_isready on the unix socket says ready to the server that is about to be shut down
**Tag:** ci
**ERROR:** `npm run check:migrations` passed locally every time and failed on the
first GitHub runner it met, mid-way through the first file:

```
docker server 28.0.4
FAILED: shim.sql
FATAL:  terminating connection due to administrator command
server closed the connection unexpectedly
```

The readiness loop probed with `docker exec <c> pg_isready -U postgres`, which
connects over the unix socket, and broke on the first success. **The official
`postgres` image starts two servers.** Its entrypoint runs a temporary one so
initdb can create the database and run init scripts, then shuts it down and
starts the real one. From the image's own `docker-entrypoint.sh`:

```
# start socket-only postgresql server for setting up or running scripts
# does not listen on external TCP/IP and waits until start finishes
set -- "$@" -c listen_addresses='' -p "${PGPORT:-5432}"
```

A socket probe cannot tell the two apart, so the loop reported ready against the
temporary server and the shutdown landed in the middle of the migrations.
Container logs show the sequence in about 220ms: temp server "ready to accept
connections", then "shutting down", then "PostgreSQL init process complete",
then the real server ready. **Locally the image was warm and the window was
missed on every run**, which is how this class of race reaches CI rather than a
laptop.

**SOLUTION:** Probe over TCP: `pg_isready --host 127.0.0.1 --port 5432`. The
temporary server is started with `listen_addresses=''`, so only the real one can
satisfy it. psql itself still connects over the unix socket, where local
connections are trusted and no password is needed; only the readiness question
goes over TCP. Measured on this machine: the socket probe answers ready roughly
0.3s before the TCP probe does, and the shutdown falls inside that gap. RULE: a
readiness probe must be answerable ONLY by the thing you are waiting for. Where a
service starts a private bootstrap instance on the same host, a probe on the
shared channel is not a readiness check, it is a coin flip whose bias depends on
how warm the image is. Adding a retry around the failure would have hidden this
rather than fixed it: the connection loss was a true report about a server that
was genuinely going away.

### The shim made "anon holds nothing" vacuously true, and only a mutation found it
**Tag:** data
**ERROR:** `scripts/poc-free/local-db/assertions/0013_clients.sql` asserts that
`anon` holds no privilege on `public.clients`, which is the security property
every migration in this repository has spent a paragraph on. It passed. Then it
was checked by DELETING the `revoke all on table public.clients from anon` line
from the migration and re-running: **still exit 0**. The assertion was not
checking anything.

Two separate causes, and both matter:

1. **The shim did not reproduce Supabase project-level default privileges.** A
   Supabase project sets `ALTER DEFAULT PRIVILEGES` so anon, authenticated and
   service_role are granted on every table created in `public` at CREATE TABLE
   time. On a bare `postgres:16` anon is granted nothing, so "anon holds
   nothing" was true for every table whether or not any migration said so, and
   0001's whole GRANTS section was being validated against a database where it
   could not fail.
2. **Even with that fixed, deleting the line still passes, and correctly.**
   Migration 0009 already ran `alter default privileges for role postgres in
   schema public revoke all on tables from anon`, so every table created after
   0009 starts closed. 0013's explicit revoke is a no-op.

**SOLUTION:** The shim now carries the three `ALTER DEFAULT PRIVILEGES` grants,
with a comment saying it is the least obvious object in the file and why. The
mutation test was corrected to the one that actually exercises the assertion:
**add `grant select on public.clients to anon`**, which fails as it should. The
redundant revoke stays in the migration with a comment saying it is a no-op,
that 0009 is what closes this, and why it is kept anyway: if a future migration
re-grants the anon default privilege, every table that declared its own revoke
is still closed and every table that relied on 0009 is open.

RULE: **a mutation test must remove the thing the assertion is about, and
"remove the line" is not always that thing.** Deleting a redundant line proves
nothing when a different file already enforces the property. When a mutation
comes back green, the first question is whether the assertion is weak, and the
second is whether the mutation was. Both were, here, and the second one taught
more: it is how anyone learned that 0013's revoke has been decoration since
0009.

RULE: **a local test double must reproduce the AMBIENT state of the real
system, not only its objects.** Default privileges, ambient grants and
role memberships are invisible in a schema dump and are exactly the ground a
security assertion stands on. A double that omits them turns every negative
security assertion into a tautology.

### An invariant written when two things were always the same becomes a lie the day they split
**Tag:** ci
**ERROR:** `tests/e2e/headers.spec.ts` test 5, added by R-013, asserted that
every file in `supabase/migrations/` has an entry in
`docs/migrations/APPLY-LOG.md`. It was correct for four days and it turned red on
the first migration that was merged without being applied:

```
Error: migratia 0013_clients.sql nu are intrare in APPLY-LOG.md
```

Nothing was wrong with the migration or with the log. **The test encoded an
assumption that was true when it was written and had just stopped being true**:
that a merged migration is an applied migration. R-062 split those on the same
day, deliberately, and the test had no way to know.

**SOLUTION:** The log gained a PENDING register, in a fixed machine-read line
format naming the file and the card that will apply it, and the test now asserts
that every migration file is in **exactly one** of the two places. **That is
stronger than what it replaced, not weaker.** The old version could not detect a
file that was listed as applied and had not been; the new one fails a file in
both places, a file in neither, and a pending line naming a file that does not
exist. Each of the three was proved to fail before the change was pushed.

RULE: when a rule change splits one concept into two, **grep the test suite for
the old concept before pushing**, because a test is the place an obsolete
assumption survives longest: it keeps passing, so nobody rereads it, and the day
it fails it looks like a defect in the new work rather than a stale premise in
the old check. The tell is a test that asserts a one-to-one correspondence
between two sets that a ruling has just made one-to-many.

RULE: **when an invariant has to be relaxed to let new work through, look for
the version that is stronger rather than the version that is weaker.** "Every
file is in exactly one of two places" costs the same to write as "every file is
in one place, or skip it", and one of them still catches the failure the rule was
built for.

### A CHECK constraint that evaluates to NULL is satisfied, so a null guard inside one does nothing
**Tag:** data
**ERROR:** `0016_projects.sql` writes the date-order rule as

```sql
constraint projects_dates_in_order check (
  start_date is null
  or planned_end_date is null
  or planned_end_date >= start_date
)
```

The two guards were written so that a lead with a start date and no estimated
end could still save, which is the ordinary case the table exists for. Deleting
them was then run as a mutation against the assertion file, expecting a failure,
and **it passed**.

The guards are redundant. **In SQL, a CHECK constraint is violated only when it
evaluates to FALSE; NULL is accepted.** `planned_end_date >= start_date` with
either side NULL evaluates to NULL, so the bare comparison already admits every
row the guards were written to admit. This is the opposite of a WHERE clause,
which discards NULL, and it is why the same expression means different things in
the two places.

**SOLUTION:** The guards are kept, with a comment in the migration saying they
are redundant, that a NULL-valued CHECK is satisfied, and why they stay anyway:
three-valued logic is the thing a reader is most likely to get wrong about this
constraint, and a rule that reads the way it behaves is worth two clauses the
planner discards. The mutation was corrected to the one that actually tests the
constraint, **inverting the comparison**, which is caught.

RULE: **a null guard inside a CHECK is documentation, not enforcement.** If a
column combination must be rejected when one side is missing, the CHECK has to
say so positively (`num_nonnulls(a, b) <> 1`, or a NOT NULL, or an explicit
`is not null and ...`), because the natural way to write it accepts the row.
This is the second no-op found by mutation testing in this wave, after the
redundant `revoke ... from anon` on P3-01, and both were found the same way:
**delete the line and require the check to fail.** A defensive line that nothing
notices the absence of is either redundant or unproven, and the two need
different responses.

### A test that re-implements the thing it tests proves the reimplementation
**Tag:** data
**ERROR:** The P3-04 backfill is a single UPDATE inside migration 0017. It meets
zero rows on a fresh container, so the assertion file built a fixture of ten
typed destinations and then ran **its own copy of the UPDATE**, character for
character, against them. Every branch passed.

Then the migration was mutated. **Three mutations of the matching rule came back
green**: matching on the project name alone instead of the client-and-project
pair, removing the `having count(*) = 1` ambiguity guard, and removing the
idempotency guard. None of them touched the assertion file, so none of them
changed a single character of what the test executed. The test was proving its
own copy, and the copy was correct.

**SOLUTION:** The backfill became a function,
`public.backfill_outbound_project_ids()`, created and called once by the
migration. The assertion calls that function. A change to the matching rule in
the migration now changes what the test proves, and all three mutations are
caught.

It is a better migration for a second reason that has nothing to do with
testing: the reconciliation pass will want to re-run the backfill after a human
adds the missing clients and projects, and **a statement buried inside an
applied migration cannot be re-run.**

RULE: **when a test cannot reach the code under test, moving the code is the
fix, not copying it.** A duplicated statement in a test is indistinguishable
from a correct test on the day it is written and stops tracking the original the
first time either changes. The tell is a test that contains a substring of the
production file. If a statement needs exercising, make it a named callable
thing; if it cannot be made callable, the test is documentation and should say
so rather than look like proof.

### A mutation that did not apply is indistinguishable from an assertion that does not bite
**Tag:** ci
**ERROR:** Mutation testing here works by copying the tree, editing a migration
with a regex, and requiring the check to fail. **A regex that silently matches
nothing produces an unchanged file, a passing run, and a "NOT CAUGHT" line that
looks exactly like a weak assertion.** It happened four times across P3-01 and
P3-04, and one of them cost a real investigation into an assertion that turned
out to be fine: the file had been re-indented by an earlier refactor and the
pattern no longer matched.

**SOLUTION:** The mutation runner snapshots the file before editing and refuses
to score the result if the bytes are unchanged:

```bash
snapshot() { cp "$1" "$SP/before"; MUTATED_FILE="$1"; }
expect_fail() {
  if cmp -s "$SP/before" "$MUTATED_FILE"; then
    echo "MUTATION DID NOT APPLY: $1 (the file is unchanged, so this scores nothing)"
    FAILURES=$((FAILURES + 1)); return
  fi
  ...
}
```

It found two stale patterns on the first run after being added.

RULE: **a negative test needs a positive precondition.** Any harness that proves
something by breaking it must first prove it broke it. The general form: when a
test's setup can silently no-op, the test reports on the setup and not on the
subject, and it reports success either way.

### `<>` against a possibly-NULL column is not an inequality test
**Tag:** data
**ERROR:** The P3-04 write-path assertion checked that the new issue recorded
its project with `if got.project_id <> 'd0000000-...' then raise`. Mutating 0018
to write `null` instead of the project id **passed**. `NULL <> 'x'` evaluates to
NULL, the `IF` does not fire, and a write path that recorded nothing at all
satisfied a check written to catch exactly that.

A second, worse instance in the same file: a "this should have failed" raise was
written INSIDE a block whose handler was `when sqlstate 'P0001'`. Bare `raise
exception` defaults to errcode P0001, which is the same code
`create_outbound_issue` uses for its own refusals, **so the check's own alarm was
caught by the check's own handler** and two mutations passed.

**SOLUTION:** `is distinct from` for any comparison whose operand can be NULL,
and a boolean flag set inside the handler with the assertion made after the
block:

```sql
refused := false;
begin
  perform something_that_should_fail();
exception when sqlstate 'P0001' then refused := true;
end;
if not refused then raise exception '...'; end if;
```

RULE: **in PL/pgSQL, never raise a failure from inside the block that catches
failures, and never compare a nullable value with `<>`.** Both produce a check
that passes on the exact input it was written to reject. Both were found by
mutation and neither would ever have been found by reading, because both read
correctly.

### A containment assertion on a panel that holds a `<select>` passes for every value
**Tag:** frontend
**ERROR:** The P3-07 status panel holds a chip showing the current status AND a
`<select>` whose options are all six status labels. The spec asserted
`expect(getByTestId("project-status-panel")).toContainText("Contract")` after
choosing Contract.

**That assertion passes before the click.** The panel already contains the text
"Contract", as an `<option>`. So the spec never waited for anything, the three
status changes raced against each other and against `router.refresh()`, and CI
reported two history rows where three were expected:

```
Error: expect(locator).toHaveCount(expected) failed
Expected: 3
Received: 2
```

The failing assertion was the row count at the end. **The defective assertions
were the three that passed.**

**SOLUTION:** The chip got its own `data-testid` and the spec asserts
`toHaveText` on it, which is exact rather than contained and scoped to the one
element that actually reflects state. The same click also exposed a second
defect: the change handler guarded with `if (next === project.status) return`,
and `project.status` is a prop that is stale between the write and the refresh,
so a second change inside that window was silently dropped. The guard is gone;
`set_project_status` already returns `changed=false` for a no-op, so the rule
lives in one place.

RULE: **`toContainText` on a container that includes a control is not an
assertion about state, it is an assertion about the control's options.** Scope
state assertions to the element that renders the state, and prefer `toHaveText`
over `toContainText` when the expected value is the whole content. The tell is a
test that passes suspiciously fast, and the symptom appears somewhere else
entirely: a later count, in a later step, with no obvious link to the assertion
that lied.

RULE: **never guard a write on a prop that the write is about to change.**
Between submitting and re-rendering, the component holds the old value, so the
guard rejects exactly the second action a user takes in a hurry. Let the server
decide and return what happened.

### A UNION cannot be ordered by an alias introduced inside one of its branches
**Tag:** data
**ERROR:** `public.client_material_summary` returns the top product rows and one
total row, and ordered them so the total sorts last:

```sql
select ..., 'row'::text as row_kind from ranked where rn <= 5
union all
select ..., 'total'::text from ranked
order by row_kind desc, quantity desc nulls last
```

PostgreSQL refused it: `ERROR: column "row_kind" does not exist`. The `ORDER BY`
of a set operation is evaluated against the OUTPUT of the union, whose columns
are named by the FIRST branch's positional list, and an alias declared inside a
branch is not visible to it. The same query orders fine without the `UNION`,
which is what makes it surprising.

**SOLUTION:** Wrap the union in a subquery and order outside it. Ordering by
output column POSITION (`order by 7, 5 desc`) also works and is worse to read:
the day somebody adds a column, a positional order silently sorts by something
else.

RULE: **an `ORDER BY` attached to a set operation sees the union's output, not
either branch's scope.** When a union needs a computed sort key, the key belongs
in a wrapping select. The tell is an error naming a column that is plainly right
there in the SQL.

### A UNION ALL wrapped for ordering loses its column names unless the first branch aliases them
**Tag:** data
**ERROR:** `0024_project_material_cost.sql` returns a total row and two
breakdowns from one `union all`, and the ordering has to sit on a wrapper
because an `ORDER BY` on a set operation cannot see an alias declared inside a
branch. That wrapper was written as `select u.row_kind, u.label, ... from (
<three branches> ) u`, and the first branch began `select 'total'::text,
null::text, ...` with no aliases. PostgreSQL names a set operation's output
columns after the FIRST branch, so `u.row_kind` referred to a column actually
named `?column?` and the function would not have been created at all.
**SOLUTION:** alias every column of the FIRST branch of a `union all` whenever
the union is wrapped and the wrapper names columns. The later branches do not
need aliases and naming them would suggest, falsely, that they contribute names.
The rule that prevents the next instance: if a subquery alias appears anywhere
outside the union, read the first branch and check that every column in it has a
name that was written rather than inferred.

### OLD read inside a boolean expression in an INSERT-or-UPDATE plpgsql trigger
**Tag:** data
**ERROR:** A `before insert or update` row trigger written as
`if tg_op = 'INSERT' or old.status is distinct from 'accepted' then` looks
guarded and is not. plpgsql raises `record "old" is not assigned yet` the moment
the field is read on an INSERT, and SQL does not promise to short-circuit an
`OR`, so the guard on the left of the operator does not reliably stop the read
on the right. The same hazard hides inside a `case when tg_op = 'INSERT' then
new.deviz_id else old.deviz_id end`, which reads as lazy and is not something to
rely on.
**SOLUTION:** Read `OLD` only inside an explicit `if tg_op = 'UPDATE' then`
branch, never inside a boolean expression or a CASE that also mentions `tg_op`.
The rule that prevents the next instance: in a trigger function that serves more
than one operation, the `tg_op` test is a STATEMENT, not a term. Caught by
reading, before the file reached the parser.

### string_agg ordered by relname puts deviz_lines before devize
**Tag:** data
**ERROR:** An assertion comparing `string_agg(c.relname || '=' || c.relrowsecurity, ',' order by c.relname)` against `'devize=true,deviz_lines=true'` failed in `quality` with
`ERROR: P3-13: expected rowsecurity true on both tables, found deviz_lines=true,devize=true`.
Both tables were correct. The expected string was in the wrong order. The
container's collation ignores the underscore, so `deviz_lines` is compared as
`devizelines` and sorts BEFORE `devize`, which is the opposite of what a byte
comparison and of what a reader's eye both say.
**SOLUTION:** Order the expected literal the way the database orders it, and say
in a comment why it looks wrong. The rule that prevents the next instance: an
assertion that aggregates several rows into one string is asserting the sort
order too, whether or not it meant to. Either pin the order the database
actually produces, or aggregate into a set and compare membership.

### An assertion seeded a unit that is not in the enum
**Tag:** data
**ERROR:** `insert into public.products (..., unit, ...) values (..., 'buc', ...)`
in an assertion file failed with
`ERROR: invalid input value for enum unit_code: "buc"`. `public.unit_code` is
`(m2, lm, pcs, bag, kg, roll, m3)`. `buc` is the Romanian LABEL for `pcs`.
**SOLUTION:** Seed the stored token, never the label. The rule that prevents the
next instance: this schema stores English enum tokens and keeps Romanian in the
presentation layer, per the P2-01 convention. Any Romanian word appearing in a
SQL file is therefore a comment, a table name, or a defect. Test fixtures are
the easiest place to forget that, because everything else about them is written
in the language of the screen.

### Merged is not applied, and the deployed code did not know the difference
**Tag:** infra
**ERROR:** On 2026-08-31 the production site returned 500 on every screen,
including the dashboard, at the client domain. Nothing was wrong with any
migration, any conflict resolution or any test.

Thirteen phase 3 migrations were **written, proven and merged**, and **none had
been applied**. The application code merged alongside them read the new schema
unconditionally:

```
listProducts       -> select ..., supplier_id, ...   (added by 0019, pending)
listOutboundIssues -> select ..., project_id, ...    (added by 0017, pending)
```

PostgREST answers 42703 for a column that does not exist, both readers throw, and
the dashboard is the first page that calls them. Reproduced exactly by applying
only 0001 to 0012 to a container and running the two SELECTs the deployed code
sends.

**Ten card reports said "exists in the code and not on the live site" and treated
it as harmless.** It is the opposite of harmless: the CODE is on the live site,
and it read a schema that was not.

**NOTHING IN CI COULD HAVE CAUGHT IT.** Every check runs against a database with
ALL migrations applied: the AUT-14 shim applies every file, and `supabase db
reset` applies every file. **CI cannot see the difference between the merged
schema and the applied schema**, so a green pipeline said nothing about the thing
that was about to break.

**SOLUTION:** Three parts, and the third is the one that matters.

1. `lib/data/schema-capability.ts`, a memoised probe: one PostgREST read of
   `public.projects`, cached 60 seconds, answering "is the phase 3 schema here?".
   It probes through PostgREST and not through a SQL function, because a function
   would itself be in an unapplied migration and could not answer the question
   exactly when the question matters.
2. Every reader and writer that touches phase 3 objects either asks the probe and
   **reads only what exists**, or renders `SchemaPending`, a Romanian screen
   saying the section is not active on this database yet. The day P3-27 applies,
   everything lights up with no deploy.
3. `npm run check:pending-schema-reads`, in the quality job: it reads the pending
   register in `docs/migrations/APPLY-LOG.md`, extracts every table, column and
   function those files add, and **fails any file under `lib/`, `app/` or
   `components/` that names one without going past the probe.** It stops asking
   about a migration the moment the register stops listing it.

RULE: **a merged migration and an applied migration are different facts, and
application code must be written against the second one.** In any project where
the two can diverge, the deployed code has to tolerate the older schema, and
something outside CI has to enforce it, because CI runs on the newer one by
construction.

RULE: **when a pipeline provisions its own database from the same files it is
testing, it is testing the future, not production.** That is usually what you
want and it is exactly the blind spot here. The register of what is actually
applied is the only artefact that knows the truth, so the check has to read the
register.
