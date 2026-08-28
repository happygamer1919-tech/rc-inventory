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
