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
**SUPERSEDED 2026-09-02 BY CARD RULE-02, and the entry is kept because a deleted
lesson looks like a lesson nobody learned.** The namespacing half is gone: there
is one flat namespace and one allocator, `decisions/NEXT-RULING-ID`, read and
advanced in the same commit as the ruling, per CLAUDE.md section 8b. A prefix
would have made collisions structurally impossible and would have forked a
namespace that ninety rulings and every cross reference already used. What
survives unchanged is the second half: an old ruling is never edited, and no id
is ever renumbered to make a check pass. Card AUT-19 carried the same correction
into `docs/DOCTRINE-TRIAGE.md` section 2.

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

### Un import de VALOARE dintr-un modul care atinge clientul Supabase de server rupe build-ul, un import de TIP nu
**Tag:** frontend
**ERROR:** `npm run build` a cazut cu "You're importing a component that needs
`next/headers`" si a listat lantul complet: `lib/supabase/server.ts [Client
Component Browser]` -> `lib/data/deviz.ts` -> `components/projects/DevizPanel.tsx`.
Componentul de client importa `isPastValidity`, o functie de doua randuri fara
nicio dependenta, din acelasi fisier care exporta si tipurile `Deviz` si
`DevizSummary`. Tipurile nu erau problema: `ProjectTabs.tsx` importa de ani de
zile `ProjectMaterials` din `lib/data/projects-list.ts`, care importa acelasi
client de server, si nu a rupt niciodata nimic.
**SOLUTION:** un `import type` este STERS la compilare si nu trage modulul in
graf; un import de valoare din acelasi fisier il trage intreg, cu tot cu
`next/headers`. Functia pura s-a mutat in `lib/data/deviz-types.ts`, un modul
care nu importa nimic, iar tipurile au ramas unde erau, importate cu `import
type`. Regula: intr-un modul de citiri care deschide o conexiune, NU se pune si
o functie pura pe care o cheama un ecran. Predicatele si etichetele stau in
fisierul `-types`, care ramane citibil de amandoua partile granitei.

### Un rand de seed nu poate fi scris direct in starea finala cand un declansator apara tranzitia
**Tag:** data
**ERROR:** `scripts/seed-test-deviz.mjs` avea nevoie de un deviz EMIS cu doua
linii pe el, pentru ca specul P3-13b sa poata verifica refuzul care vine din
baza. Scris asa cum arata rezultatul, cu `status: "sent"` in acelasi upsert cu
liniile, el nu se poate insera: `deviz_lines_require_draft` din migratia 0025
refuza orice INSERT de linie pe un deviz care nu mai este ciorna, si o face
inainte sa conteze cine scrie.
**SOLUTION:** seed-ul face acelasi drum pe care il face un om prin ecran: creeaza
devizul ciorna, scrie liniile, si abia apoi il emite printr-un al doilea upsert.
Regula: cand o tabela are un declansator de tranzitie, un script de seed nu
descrie starea finala, ci reproduce SECVENTA care duce la ea. Un seed care
ocoleste declansatorul ar semăna cu date pe care aplicatia nu le-ar fi putut
produce, si testul de deasupra lor ar verifica un sistem care nu exista.

### getAttribute nu coboara in copii, deci un testid pe rand si o valoare pe celula citesc null
**Tag:** frontend
**ERROR:** deviz.spec citea totalul cu
`page.getByTestId("deviz-total").getAttribute("data-value-mdl")` si primea 0 in
loc de 770. Ecranul afisa numarul corect, iar randul exista: raportul spunea
`Expected: 770, Received: 0`, ceea ce arata ca o eroare de aritmetica si nu ca
o eroare de selectare. Acelasi tipar pe deviz-subtotal si deviz-adaos.
**SOLUTION:** `data-testid="deviz-total"` statea pe `<tr>` iar
`data-value-mdl` pe `<Td>`-ul dinauntru. `getAttribute` citeste atributul
elementului potrivit si nu se uita in descendenti, deci returneaza null, iar
`Number(null)` este 0 si nu NaN, deci esecul arata ca un total gresit calculat.
Regula: cand un test citeste o valoare printr-un atribut de date, testid-ul si
atributul stau pe ACELASI element. Zero este o valoare plauzibila pentru un
total, si de asta acest defect nu se citeste din mesajul de eroare.

### un embed catre-unu care ajunge ca tablou face sa dispara fiecare testid construit din campurile lui
**Tag:** data
**ERROR:** Sase cazuri din deviz.spec au cazut cu `element(s) not found` pe
`deviz-line-quoted-TEST-DEVIZ-01`, `deviz-line-unit-TEST-DEVIZ-01` si altele,
desi randurile `deviz-line` existau si erau in numar corect.
**SOLUTION:** liniile citesc produsul dintr-un embed imbricat pe doua niveluri,
`devize -> deviz_lines -> products`, si codul il trata numai ca obiect:
`row.products?.sku ?? "-"`. Daca embed-ul ajunge ca tablou cu un element,
fiecare camp lipseste tacut, sku devine "-", iar fiecare `data-testid` construit
din sku isi schimba numele in loc sa lipseasca vizibil. Normalizat intr-o
singura functie. Regula: un `?? "-"` pe un camp care intra intr-un testid sau
intr-o cheie ascunde defectul in loc sa il raporteze, si costul se plateste
la primul esec de test care spune "not found" despre un element pe care il vezi
pe ecran.

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
### Un `data-testid` pe un component de prezentare care nu isi imprastie propurile dispare in tacere

**Tag:** frontend

**ERROR:** Opt teste din `tests/e2e/deviz.spec.ts` au picat in CI si local pe
timeout, fiecare asteptand un locator care nu se rezolva niciodata:
`getByTestId('deviz-line-quoted-TEST-DEVIZ-01')`, `getByTestId('deviz-total')`,
`getByTestId('deviz-line-unit-...')`. Prima ipoteza a fost ca lipsesc datele de
seed, pentru ca esecul arata exact ca un ecran gol. Nu lipseau: pasul de seed din
`quality.yml` s-a incheiat cu succes, jurnalul rularii 33385467677 contine
`seed-deviz: gata`, iar instantaneul de pagina din artefactul Playwright arata
tabelul complet randat, cu "100 MDL" in celula Pret ofertat si "770 MDL" la
Total. Ecranul era corect. Atributele nu existau.

Cauza: `Td` si `Th` din `components/ui/primitives.tsx` isi destructurau exact
trei propuri, `children`, `align` si `className`, si nu imprastiau nimic altceva
pe elementul `<td>`. Orice `data-testid` sau `data-value-mdl` scris pe `<Td>` era
inghitit. `DevizPanel.tsx` este primul component care a pus testid-uri pe `Td`,
deci defectul a fost latent pana atunci: `ProjectTabs.tsx` isi pune aceleasi
atribute pe `<tr>` si pe `<div>` brute, si de aceea testele de cost ale lui P3-11
trec.

`tsc --noEmit` a trecut curat peste tot codul acesta. **Un nume de atribut JSX
care contine o cratima nu este verificat fata de tipul propurilor**, deci
TypeScript nu are cum sa raporteze un `data-testid` trimis unui component care nu
il accepta. Regula exista pentru atributele HTML personalizate si aici lucreaza
impotriva ta.

**SOLUTION:** `Td` si `Th` primesc `...rest` si il imprastie pe element, cu tipul
largit la `React.TdHTMLAttributes<HTMLTableCellElement>` si respectiv
`React.ThHTMLAttributes`. `Button`, in acelasi fisier, facea deja exact asta;
inconsecventa intre primitive era intreaga problema.

RULE: **un component de prezentare care infasoara un element HTML isi imprastie
propurile necunoscute pe el, sau nu primeste niciodata un `data-*`.** Alegerea se
face o data, cand primitiva este scrisa, pentru ca a doua oara se face dupa opt
teste picate.

RULE: **cand un test pica pe un locator, citeste intai instantaneul de pagina din
artefactul Playwright, nu logul.** Logul spune doar ce se astepta. Instantaneul
spune ce era pe ecran, iar diferenta dintre "textul este acolo si atributul nu"
si "nu este nimic acolo" separa un defect de randare de un defect de date, care
au cauze complet diferite si nu se ating.

RULE: **un pas de seed care raporteaza succes este o dovada, nu o presupunere.**
Ipoteza mostenita spunea ca esecul din CI vine dintr-un seed care nu a rulat.
Verificarea a durat un grep in jurnalul rularii si a aratat contrariul, ceea ce a
mutat cautarea de la infrastructura la cod inainte sa fie pierdut timp pe ordinea
pasilor din workflow.
### `Number('0x' + <sir base36>)` este NaN aproape intotdeauna, si un IDNO "unic pe rulare" devine o constanta

**Tag:** ci

**ERROR:** Gasit pe 2026-08-31 in timpul lui P3-13b, NEREPARAT, si nu tine de acel
card. `tests/e2e/clients.spec.ts:21` construieste un token de rulare cu
`Date.now().toString(36)`, iar linia 30 incearca sa scoata din el un IDNO unic:

    String(1000000000000 + (Number(`0x${RUN.slice(-4)}`) || 1) * 100 + seed).slice(0, 13)

Base36 foloseste cifrele 0-9 si literele a-z. Hexazecimalul foloseste 0-9 si a-f.
Cand ultimele patru caractere ale tokenului contin o litera de la g in sus, si la
marcajele de timp de acum contin aproape mereu una, `Number('0x...')` intoarce
NaN, `|| 1` intra in functiune si expresia se prabuseste la aceeasi valoare la
fiecare rulare: 1000000000101, 1000000000102 si asa mai departe. Douazeci din
douazeci de esantioane luate in ziua descoperirii au cazut pe varianta de rezerva.

IDNO-ul are o constrangere de unicitate, deci a doua rulare pe ACEEASI baza de
date este refuzata cu "IDNO duplicat", clientul nu se mai creeaza si cinci teste
din `clients.spec.ts` pica pe `getByTestId('client-detail')` care nu mai apare.

DE CE NU S-A VAZUT PANA ACUM: in `quality` fiecare rulare porneste o stiva
Supabase noua, deci nu exista niciodata o a doua rulare pe aceeasi baza. Defectul
apare numai pe o stiva locala persistenta, adica exact acolo unde un om ruleaza
suita de doua ori la rand ca sa verifice o reparatie.

**SOLUTION:** Nereparat deliberat: CLAUDE.md sectiunea 3 spune ca un defect
observat in trecere devine un card sau o intrare aici, nu un commit tacut intr-un
PR care poarta alt card. Reparatia este sa nu se mai treaca un sir base36 printr-o
parsare hexazecimala: fie tokenul se genereaza direct in hex
(`Date.now().toString(16)`), fie cifrele se scot din token cu o functie care nu
poate da NaN, si in ambele cazuri varianta de rezerva `|| 1` trebuie sa devina
zgomotoasa, pentru ca ea este cea care a transformat un defect intr-o tacere.

RULE: **o valoare de rezerva pe o cale care nu ar trebui sa fie atinsa niciodata
trebuie sa arunce sau sa raporteze, nu sa returneze o constanta plauzibila.**
`|| 1` a facut din "parsarea a esuat" un IDNO valid, si asta a mutat esecul la
sase luni distanta, in alt fisier, pe alta masina.

RULE: **un test care isi construieste propria unicitate trebuie sa fie rulat de
doua ori la rand pe aceeasi baza de date inainte sa fie crezut.** Un CI care
provizioneaza o baza noua la fiecare rulare nu poate distinge un token unic de
unul constant, si nu il poate distinge tocmai pentru ca este curat.

### `npm install --package-lock-only` rescrie arbori de dependinte optionale care nu au legatura cu modificarea

**Tag:** ci

**ERROR:** Declararea lui `@next/env` ca devDependency are nevoie de o singura linie
noua in `package-lock.json`, in `packages[""].devDependencies`, pentru ca intrarea
`node_modules/@next/env` exista deja acolo la 16.3.1 ca dependinta a lui next.
`npm install --package-lock-only` a produs in schimb un diff de 67 de randuri: pe
langa linia necesara, a re-expandat sase pachete de sub
`@tailwindcss/oxide-wasm32-wasi` (@emnapi/core, @emnapi/runtime, @emnapi/wasi-threads,
@napi-rs/wasm-runtime, @tybys/wasm-util, tslib), care nu au nicio legatura cu
modificarea.

Un diff de 67 de randuri intr-un fisier blocat este un diff pe care nimeni nu il
citeste. Exact acolo trece neobservata o schimbare reala de versiune.

**SOLUTION:** Diff-ul a fost dat inapoi si linia necesara scrisa de mana, apoi
`npm ci` a fost rulat ca sa dovedeasca faptul ca fisierul blocat este in continuare
consistent, pentru ca `npm ci` este ce ruleaza CI si el refuza un lock nepotrivit cu
package.json.

RULE: **dupa orice comanda npm care atinge fisierul blocat, citeste diff-ul si
pastreaza numai ce tine de modificare.** Un fisier blocat este un artefact generat,
dar asta nu il scuteste de review: este si singura evidenta a ceea ce se instaleaza
efectiv.

RULE: **`npm ci` este proba, nu `npm install`.** Ele nu fac acelasi lucru: `install`
repara pe tacute un lock inconsistent, `ci` cade. Daca CI ruleaza `ci`, atunci `ci`
este comanda cu care se verifica local, altfel se descopera diferenta in CI.
### Un corp de functie `language sql` este validat la CREATE, deci nu poate folosi o eticheta de enum adaugata in aceeasi tranzactie

**Tag:** data

**ERROR:** Cele treisprezece migratii ale fazei 3 nu pot fi aplicate ca o singura
tranzactie. Pe shim, prima rulare curata a cazut la 0021:

    ERROR:  unsafe use of new value "project" of enum type status_entity
    HINT:   New enum values must be committed before they can be used.

`0015` ruleaza `alter type public.status_entity add value if not exists 'project'`.
`0021` creeaza `project_status_history`, care este **`language sql`**, si al carei
corp numeste `'project'`. Un corp `language sql` este parsat si VALIDAT la CREATE,
deci eticheta este FOLOSITA in tranzactia care a adaugat-o, si serverul refuza.

CE FACE DIFERENTA SI ESTE INVIZIBIL LA CITIRE: `set_project_status`, din acelasi
fisier, numeste si el `'project'` si NU cade, pentru ca este `language plpgsql`,
iar corpul unui plpgsql nu este validat atat de adanc la creare. Doua functii, in
acelasi fisier, cu aceeasi constanta, si numai una este o problema.

**SOLUTION:** Adaugarile de enum se comit intr-o pre-faza a lor, si nimic altceva
nu calatoreste cu ele: un fisier intra in pre-faza numai daca adauga o eticheta,
poate contine numai `AlterEnumStmt` si `SelectStmt`, si fiecare adaugare trebuie sa
poarte `IF NOT EXISTS`. Ce poate supravietui unei anulari a lotului principal este
atunci exact un lucru, o eticheta de enum nefolosita, care nu refera nimic si se
re-adauga ca no-op.

RULE: **un lot de migratii care adauga o eticheta de enum SI o foloseste nu poate
fi o singura tranzactie, si asta se descopera pe un container, nu pe productie.**
Regula serverului nu are exceptii si nu depinde de cat de sigur pare fisierul.

RULE: **cauta diferenta intre `language sql` si `language plpgsql` inainte de a
crede ca doua utilizari identice ale unei constante se comporta la fel.** Prima
este validata la creare, a doua nu.

### `pg_get_function_identity_arguments` intoarce si NUMELE parametrilor, si o poarta care nu potriveste trece in tacere

**Tag:** data

**ERROR:** Doua verificari din `scripts/apply-pending-migrations.mjs` comparau
semnatura unei functii cu sirul `'text, text, text, jsonb'`. Functia are parametri
numiti, deci `pg_get_function_identity_arguments` intoarce
`'p_reference text, p_client_name text, p_project_name text, p_lines jsonb'`, care
nu se potriveste niciodata.

AFIRMATIA A CAZUT ZGOMOTOS SI POARTA A CAZUT IN TACERE, si a doua este cea grava.
Poarta care trebuia sa verifice ca functia de patru argumente nu are obiecte
dependente inainte ca `0018` sa o stearga nu a gasit-o si a raportat linistit
"the four-argument function is not present, nothing to drop", in timp ce functia
era acolo. O poarta care sare peste verificare arata identic cu o poarta care a
trecut.

**SOLUTION:** Se compara tipurile si numai tipurile:
`array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) as t), ', ')`.

RULE: **o poarta care poate sa nu gaseasca subiectul trebuie sa trateze "nu am
gasit" ca esec sau sa il raporteze ca atare, niciodata ca trecere.** Ambele
verificari de aici au fost gasite de mutatii, nu de citire.

### O mutatie care nu muteaza nimic raporteaza acelasi verde ca un control care functioneaza

**Tag:** ci

**ERROR:** Testul de mutatie care trebuia sa dovedeasca poarta lui `0018` inlocuia
textul `drop function if exists public.create_outbound_issue(text, text, text, jsonb);`
cu un comentariu, folosind un `String.replace` cu un sir. `0018` CITEAZA acelasi
statement in propriul antet de comentariu, cu douazeci de randuri mai sus, iar
`replace` cu un sir inlocuieste PRIMA aparitie. Mutatia a comentat un comentariu,
statementul real a rulat, si proba a trecut fara sa fi probat nimic.

**SOLUTION:** Ancorat la inceput de rand, cu `/^drop function .../m`, si harnasamentul
refuza acum o mutatie a carei iesire este egala cu intrarea.

RULE: **un test de mutatie trebuie sa verifice ca a mutat ceva.** Altfel esecul pe
care il previne apare chiar in interiorul lui, si aceea este singura verificare pe
care nimeni nu o mai verifica.
### O ruta care intoarce 200 nu este un ecran verificat, daca 200 vine de la pagina de autentificare

**Tag:** ci

**ERROR:** Dupa aplicarea migratiilor pe productie (P3-27), verificarea ceruta era
ca cele patru rute CRM sa intoarca 200 cu continut real si nu cu ecranul de
asteptare. Toate patru au intors 200:

    /clienti /proiecte /inventar /comenzi   ->  200

Rezultatul este GOL. Rutele sunt aparate de autentificare, iar neautentificat ele
redirectioneaza catre `/autentificare`, care este pagina care a intors de fapt
acel 200:

    curl -L /clienti  ->  https://www.rapidconstructmd.com/autentificare
                          <title>Autentificare - Rapid Construct</title>

Un 200 dupa redirectare masoara ultima pagina din lant, nu pe cea ceruta. Cu
`curl` fara `-L` s-ar fi vazut 307, care ar fi spus adevarul; cu `-L` codul arata
exact ca succesul cautat.

**SOLUTION:** Verificarea a fost raportata ca NEFACUTA, nu ca trecuta, pentru ca
nu exista credentiale de productie in `phase2.env` cu care sa se deschida o
sesiune. In locul ei s-a dovedit ce se putea dovedi fara sesiune: PostgREST
raspunde `42501` insufficient_privilege pe tabelele noi si NU `PGRST205` "table
not found in schema cache", ceea ce spune doua lucruri deodata, ca stratul de API
vede tabelele si ca `anon` nu are niciun drept pe ele.

RULE: **cand verifici o ruta aparata, verifica si UNDE ai ajuns, nu doar codul.**
`--url-effective`, sau cere codul FARA sa urmezi redirectarile si asteapta 307.

RULE: **spune ca o verificare nu s-a facut, in loc sa raportezi masuratoarea care
seamana cu ea.** Un 200 de la pagina de login raportat ca ecran verificat este mai
rau decat o casuta nebifata, pentru ca nimeni nu se mai intoarce la ea.

Vezi si intrarea despre cele doua redirectari care se arata una pe alta, unde
acelasi lucru a ascuns un defect: site-ul parea sanatos oricui NU era autentificat.

### A silent success is worse than a loud failure, and an unresolved symlink produced one
**Tag:** infra
**ERROR:** `node scripts/poc/ask.mjs open ...` printed nothing, wrote nothing,
sent nothing, and exited 0. `ask.sh` read that zero as "the question was asked",
logged "asked, waiting until ...", waited out the whole deadline against a
question that had never been sent, and then blocked the card on an owner who had
never been contacted.

The cause was the entry-point guard, in the idiom this repository already uses in
`eligible.mjs` and `plain-digest.mjs`:

    const RUN_DIRECTLY = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

`import.meta.url` is ALREADY SYMLINK-RESOLVED. `process.argv[1]` is not. On macOS
`/var` is a symlink to `/private/var`, so the same file invoked through a path
under `/var` (every `mktemp -d` on this machine) compares unequal to itself. The
guard says "I am not the entry point", `main()` never runs, and node exits 0
because nothing failed.

**SOLUTION:** Resolve BOTH sides before comparing:

    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

RULE: **an entry-point guard that decides it is not the entry point must not exit
0 silently.** Exit 0 is the code every caller reads as success, and a module that
does nothing at all is indistinguishable from one that did the job.

RULE: **never compare a resolved path against an unresolved one.**
`import.meta.url`, `__filename` and `realpath` are resolved; `process.argv[1]`,
`$0` and anything a user typed are not.

RULE, AND THIS IS THE ONE THAT GENERALISES: **when a zero exit is the whole
evidence that something external happened, check for the ARTEFACT instead.**
`ask.sh` now refuses to wait unless the open-question record exists on disk. The
exit code says a process ended without complaining; the file says the work
happened.

`scripts/poc/eligible.mjs`, `scripts/poc/plain-digest.mjs` and
`scripts/poc/notify.mjs` still carry the unresolved form. None of them is reached
through a symlinked path today, so this is recorded rather than swept: fixing
three files that are not broken is scope, and the next person to move one of them
under `/var` needs to find this entry.

### The 60 second responder eats a ruling before the inbox reader can see it
**Tag:** infra
**ERROR:** `scripts/poc/responder.sh` acknowledges the Telegram offset for EVERY
message it read in a poll, including the ones it classified `ruling` and
deliberately did not act on:

    # Acknowledge everything read this poll, including messages that were ignored,
    # so an ignored message is not reclassified forever.
    tg_get "getUpdates?offset=$((HIGHEST + 1))&limit=1"

Acknowledging an offset DELETES those updates on Telegram's side. `inbox.mjs`
runs at the start of a work run, three hours later at most, calls
`getUpdates?limit=100`, and gets nothing. So `R P2-12 default` sent at any moment
while the responder is running is consumed by the responder, classified as a
ruling, logged as "not answered here", and destroyed. The ruling never becomes a
ruling and the card stays blocked.

The comment above the acknowledgement is right about ignored messages and wrong
about rulings: an ignored message must not be reclassified forever, but a ruling
has not been HANDLED yet by anyone.

**SOLUTION:** Not fixed here. It belongs to whoever owns the ruling path, and
CLAUDE.md section 3 says a defect noticed in passing becomes an entry or a card,
not a quiet extra commit. The fix is one of two shapes: either the responder
spools ruling-form messages to disk the way ASK-01 spools answers, and
`inbox.mjs` reads the spool instead of the network, or the responder stops
acknowledging past the lowest ruling it saw.

RULE: **`getUpdates` is destructive, so exactly one process may read a bot.** Two
pollers do not share a queue, they race for it, and the loser never learns that
it lost. ASK-01 is built on this rule rather than around it: `ask.sh` does not
poll Telegram at all, it reads a spool the one existing reader writes.

### The credential guard refused the commit that added the file it was named after
**Tag:** infra
**ERROR:** `scripts/poc/inbox.mjs` refuses to commit when the staged diff matches:

    /eyJ[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-[A-Za-z0-9]|re_[A-Za-z0-9]|bot[0-9]{8}:/

None of those alternatives is anchored. `sk-[A-Za-z0-9]` matches the MIDDLE of
`test-ask-digest.sh`, and `re_[A-Za-z0-9]` matches the middle of
`features_are_re_enabled`. Adding a file called `scripts/poc/test-ask-digest.sh`
therefore made every board card and every ruling that names it look like a
credential. The check fired 20 times on the commit that introduced the file, all
20 on the filename.

A guard that refuses a legitimate commit is a guard that gets switched off, and a
switched-off guard is worse than no guard, because the file still says it is
protected.

**SOLUTION:** In `scripts/poc/ask.sh` the same shapes are anchored at a
non-alphanumeric, non-underscore boundary and fenced as `EXTRACT-BEGIN
credential-shapes`, so `scripts/poc/test-ask-digest.sh` exercises them in BOTH
directions:

    (^|[^A-Za-z0-9_])(eyJ[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-[A-Za-z0-9]|re_[A-Za-z0-9]|bot[0-9]{8}:)

The anchor loses nothing real: in a diff a credential is preceded by `+`, `-`,
`"`, `=` or a space, all of which match it. The underscore has to be in the
excluded class as well, or `features_are_re_enabled` still matches.

`inbox.mjs` still carries the unanchored form. It is recorded here rather than
fixed, per CLAUDE.md section 3: it stages `decisions/inbox.md` and the board, and
only a ruling or a card edit that quotes one of these filenames would trip it, so
the exposure is a refused ruling rather than a leaked secret. Whoever touches
that file next should copy the anchored form from `ask.sh`.

RULE: **a guard is TWO claims, and the one nobody tests is "it lets the good case
through".** Assert both directions or the first false positive turns the guard
off permanently.

RULE: **a secret-shaped regex must be anchored at a token boundary.** `sk-`,
`re_` and `gho_` are all common substrings of ordinary English and ordinary
identifiers.

### Un aplicator care nu isi vede propria treaba trebuie sa CADA, niciodata sa raporteze curat

**Tag:** infra

**ERROR:** `scripts/apply-pending-migrations.mjs` citea registrul de asteptare cu
tiparul `card de aplicare\s+[A-Z0-9-]+`. Id-ul de card `P3-04b` are un `b` mic,
deci NU se potrivea. Registrul se parsa la ZERO fisiere in asteptare in timp ce
linia lui statea acolo, la vedere:

    - `0026_drop_outbound_free_text.sql`, card de aplicare P3-04b

Si atunci scriptul lua ramura de oprire scrisa special pentru cazul in care nu mai
este nimic de aplicat:

    zero pending migrations. The register is empty, so production is already current.
    Nothing was executed and nothing was written.
    EXIT=0

**IESIREA 0 ESTE PROBLEMA, NU EXPRESIA REGULATA.** Un lot gol si un lot aplicat cu
succes arata identic din afara: amandoua ies cu 0, amandoua spun ca baza este la
zi, si niciunul nu scrie nimic in jurnal pentru ca nu are ce. Un card ar fi fost
raportat livrat, cu migratia neaplicata, iar urmatorul care ar fi citit registrul
ar fi crezut ca schema contine ceva ce nu contine. Exact forma lui INC-05, ajunsa
prin alta usa.

Toate id-urile de card cu sufix mic erau atinse: P3-04b, P3-05b, P2-08b, si asa mai
departe. Suita prindea starea (`headers.spec.ts` cere ca fiecare migratie sa fie
fie aplicata, fie in registru), dar aplicatorul nu, si el este cel care actioneaza.

**SOLUTION:** Doua lucruri, si al doilea este cel care conteaza.

1. Tiparul acceptat este `[A-Za-z0-9-]+`, in toate cele trei copii ale lui:
   aplicatorul, `check-pending-schema-reads.mjs` si `headers.spec.ts`.
2. **NUMARUL DE LINII DIN REGISTRU ESTE AFIRMAT FATA DE NUMARUL DE FISIERE
   PARSATE**, inainte de orice oprire pe "nimic de aplicat". Liniile se numara cu
   un tipar deliberat larg, care intreaba doar daca o linie ARATA ca o intrare de
   registru, si se compara cu ce a extras tiparul strict. O linie care arata a
   intrare si nu s-a parsat este un defect al scriptului, nu o linie de sarit, si
   scriptul refuza cu exit 4 numind linia.

ORDINEA ESTE JUMATATE DIN REPARATIE. Prima varianta a pus verificarea DUPA oprirea
pe zero, deci exact cazul pe care il apara scurtcircuita pe langa ea si scriptul
raporta in continuare "already current". O paza asezata dupa ramura pe care o
apara nu este o paza.

RULE: **cand o unealta nu gaseste nimic de facut, distinge intre "nu este nimic"
si "nu am putut vedea".** Prima este un raspuns, a doua este un esec, si daca ies
amandoua cu acelasi cod nimeni nu le va deosebi vreodata la 3 dimineata.

RULE: **cand un tipar strict decide ce se executa, tine-l langa un tipar larg care
decide doar ce ARATA a treaba, si afirma ca sunt de acord.** Diferenta dintre ele
este exact multimea lucrurilor pe care unealta le va rata in tacere.

### INC-06: aplicat inainte de fuzionat, care este INC-05 exact pe dos

**Tag:** infra

**ERROR:** Pe 2026-09-01 sase ecrane de productie au raspuns 500: /setari,
/inventar, /iesiri, /adauga-manual, /incarca-comanda si /proiecte/[id]. Toate
cheama listProducts.

Migratia 0027 sterge products.supplier_name si a fost APLICATA pe productie la
13:58, sub cardul P3-05b. Codul care nu mai cere acea coloana traieste in ACELASI
card, si PR-ul lui nu era fuzionat. Codul desfasurat de pe main cerea in
continuare supplier_name in lista de coloane din lib/data/products.ts, coloana nu
mai exista, PostgREST a raspuns 42703 si ecranele au raspuns 500.

**ESTE INC-05 INTORS PE DOS, SI ASTA ESTE INTREGUL INVATAMANT.** INC-05: cod
fuzionat inainte ca migratia sa fie aplicata. INC-06: migratie aplicata inainte ca
codul sa fie fuzionat. Aceeasi cauza, doua ordini. `npm run check:pending-schema-reads`,
construita dupa INC-05, apara O SINGURA directie: refuza cod care citeste schema
NEAPLICATA. Nu are ce sa spuna despre schema aplicata pe care codul desfasurat inca
o citeste ca si cum ar fi acolo.

A INRAUTATIT-O O A DOUA CAPCANA, deja numita in CLAUDE.md sectiunea 3: PR-ul cu
reparatia era CONFLICTUAL cu main, iar un PR conflictual nu declanseaza NICIUN
workflow. Impingerea reparatiei nu a pornit nicio rulare, `gh pr checks` arata in
continuare verdele unei sha vechi, si nimic nu a semnalat ca reparatia nu se misca.
Incidenta a durat cat a durat pentru ca sculele aratau sanatate.

**SOLUTION:** Reparatia imediata este fuzionarea PR-ului care poarta codul, si ea
nu poate fi grabita: verificarea trebuie sa ruleze pe sha-ul rezolvat. Nu s-a
readaugat coloana pe productie, desi ar fi fost mai rapid, pentru ca ar fi fost o a
doua scriere nejurnalizata care ar fi facut jurnalul sa minta si ar fi cerut inca o
migratie ca sa fie desfacuta, pentru un sistem cu zero produse si zero clienti.

RULE: **o migratie care STERGE ceva se aplica DUPA ce codul care nu mai citeste acel
ceva este pe main si desfasurat. O migratie care ADAUGA ceva se aplica INAINTE.**
Directia depinde de semn, si a fost invatata o data in fiecare sens, cu o incidenta
de fiecare data.

RULE: **inainte de a aplica o migratie distructiva, verifica ce cere CODUL DE PE
main, nu ce cere codul din arborele de lucru.** `git show origin/main:<fisier>` este
comanda. Arborele de lucru contine reparatia; utilizatorii primesc main.

RULE: **un PR conflictual nu ruleaza nimic, si asta se verifica inainte de a te
baza pe el ca pe o reparatie.** `gh pr view --json mergeStateStatus` spune DIRTY.
Sectiunea 3 numeste deja capcana pentru fuzionari; aceasta intrare o numeste si
pentru asteptarea unei reparatii.

### A card-id scanner that stops at the first token skips the second and third
**Tag:** ci
**ERROR:** The first draft of `scripts/poc-free/check-card-ids.mjs` matched
commit subjects with `/^(ID)\s*:/`, taking one id per subject. Real subjects on
`main` carry more than one: `AUT-12, AUT-13, AUT-14: ...`, `ASK-01, DIGEST-01:
...`, `GUARD-01, REC-02: ...`, `P3-04b, P3-05b: ...`. Every id after the first
went unread. The check would have reported OK while looking at roughly a third
fewer ids than it claimed, which is the same silence the card exists to remove.
**SOLUTION:** Take the whole prefix before the first colon, split it on commas
and whitespace, and resolve every token that matches the card-id shape. The rule:
when a check reports a count, the count must be of what it actually inspected,
and a scanner whose regex is anchored to the start of a line is inspecting one
token out of however many are there. A self-test case now asserts exactly this,
with a two-id subject whose SECOND id is the unresolvable one.

### A matcher that fails to match reports as no work, not as an error
**Tag:** ci
**ERROR:** **FOURTH instance of one defect, and it is now named as a class.**

1. The pending-register regex excluded lowercase card ids and reported nothing
   pending.
2. `inbox.mjs` upper-cased a card id before comparing it against verbatim board
   ids and matched none.
3. The `grep -v` extraction filter dropped a line that was a real reader and
   reported the removal safe.
4. **2026-09-02, and the worst placement of the four: inside the guard that
   protects production.** Three assertions in
   `scripts/poc-free/local-db/prove-applier.mjs` read a one-column `psql` boolean
   with `(out.stdout || "").includes("t")`. `psql` prints the COLUMN NAME above
   the value and every one of those columns is named **`untouched`**, which
   contains a `t`. The three `...and the database is untouched` assertions were
   true whatever the database said and had **never once been capable of failing**.
   In the same audit, `outbound-destination-backfill` and `supplier-backfill`
   turned out to sit in the applier's assertion list with `raise notice` as their
   only statement: **no `raise exception` on any path**, so they could not fail
   either, and they were counted in "N assertions passed" and in the row written
   to `docs/PRODUCTION-WRITES.md`.

In all four the check ran, produced an empty or unconditional result, and that
result was read as "there is nothing wrong" rather than as "this did not work".
None of the four was red anywhere.

**SOLUTION, TWO RULES, THE SECOND GENERAL.**

**Any matcher whose empty result means "nothing to do" asserts its input count
against its match count and fails when they diverge.** A scanner that reads 220
subjects and resolves 0 ids is broken, not clean, and it is the only one that can
tell the difference.

**ANY CHECK WHOSE PASSING PATH IS REACHABLE WITHOUT THE CONDITION BEING TRUE IS
NOT A CHECK.** That covers all four and it covers shapes the first rule does not:
a boolean parsed by substring out of formatted output, an assertion body with no
failing branch, a mutant that dies on import, an `await` on a condition that was
already true. The test that finds them is to ask **what would have to be true for
this to fail**, and if the answer is "nothing", it is decoration.

**AN ASSERTION WITH NO FAILING CASE IS DELETED OR FIXED, NEVER LEFT.**
`docs/ASSERTION-REGISTER.md` names every assertion and refusal in the four guards
together with the case that proves it can fail, and
`npm run check:assertion-register` fails the build when one arrives without one.

### Keying on a response field that only one deployment sends
**Tag:** backend
**ERROR:** The EXT-08 classifier switched on the `code` field of a Supabase
Storage error body, written from captures taken against the hosted project, which
sends it. The storage server in the local Supabase stack, which is the one CI
runs, does not send `code` at all: only `statusCode`, `error` and `message`. Both
token cases fell through to the unrecognised branch and answered 502 where the
contract requires 400 and 401. Two of eight end-to-end cases failed on the first
local run.
**SOLUTION:** Key on `error` and `statusCode`, which both deployments send, and
accept `code` as a bonus where it exists. The rule that generalises: **when two
deployments of the same service are in play and only one is reachable from CI,
the fields the unreachable one sends must be replayed from captured bodies in a
check that needs no network.** The inverse of this bug, a classifier keyed only on
what the local server sends, would have passed CI forever and failed only in
production, with nothing turning red. `scripts/poc-free/check-document-url-contract.mjs`
replays both shapes for exactly that reason.

### A CDN can serve a deleted object through a still-valid signed URL
**Tag:** infra
**ERROR:** While probing the not-found path, the probe object was deleted and the
same signed URL re-fetched. The response was `200 OK` with the original bytes,
`cf-cache-status: HIT`, `x-smart-cdn: true`. The `404` shape only appeared on a
cache-busted request a minute later.
**SOLUTION:** Nothing was changed: bucket policy 0002 grants DELETE to no
application role precisely so a document behind an order cannot vanish. It is
recorded because a probe that had used the plain URL would have concluded that
Supabase serves deleted objects forever, and a probe that had used only the
cache-busted URL would never have learned this. **When probing a cached edge, run
both the plain and the cache-busted request and report the difference; either one
alone tells a story that is wrong in a different direction.**

### Node 20 in CI cannot import a .ts file, and the fix is not to bump Node
**Tag:** ci
**ERROR:** `scripts/poc-free/check-document-url-contract.mjs` imported the
classifier from `lib/data/document-url.ts`. It ran locally on node 22.22, which
strips type annotations by default since 22.18, and it failed in `quality` with
`TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"`, because
the workflow pins `node-version: 20`. The check had passed every local run.
**SOLUTION:** The pure logic moved to `lib/data/document-url-contract.mjs`, plain
ESM with a hand-written `.d.mts` beside it, imported by both the TypeScript route
and the node check. **The tempting fix was to raise `node-version` in the
workflow, and it was the wrong one:** that changes the runtime for all twenty-two
steps of the job for a reason that has nothing to do with any of them, and a
green afterwards would be a green on a different environment than the one the
last hundred merges were proved on. The rule: **when a local run and CI disagree,
find which environment difference explains it before changing either, and prefer
the change whose blast radius is one file.** Proved under the real version with
`docker run --rm -v "$PWD:/w:ro" -w /w node:20-alpine node <script>` before the
second push.

### The same Node 20 gap again, one layer up: supabase-js needs a global WebSocket
**Tag:** ci
**ERROR:** `tests/e2e/document-url.spec.ts` built its storage fixtures with
`@supabase/supabase-js`. It passed every local run on node 22.22 and failed all
four storage-touching cases in `quality` with `Error: Node.js detected but native
WebSocket not found.` The client constructs a realtime client that needs a global
`WebSocket`; node 22 has one, **node 20 does not**, and the workflow pins node 20.
Other files in the repository use the same client under node 20 without trouble,
so "supabase-js works in CI" was true and still did not cover this construction.
**SOLUTION:** The spec drives Supabase Storage over its HTTP API with plain
`fetch`: `POST /storage/v1/object/<bucket>/<path>` to upload, `POST
/storage/v1/object/sign/<bucket>/<path>` to sign, `DELETE` to remove. The signing
path is identical either way. **This was not only a fix.** The contract under test
is an HTTP contract, so a test that exercises it over HTTP checks what the other
side actually sees rather than what a client library makes of it. The rule:
**when the thing under test is a wire contract, drive it on the wire**, and a
client library in the test is a second implementation that can pass while the
contract fails. Second instance of the node 20 gap in one card, which is why the
version divergence itself is now the first thing checked when local and CI
disagree.

### A boolean read out of psql output that matched the column header
**Tag:** ci
**ERROR:** Four assertions in `scripts/poc-free/local-db/prove-applier.mjs` read a
one-column boolean with `(out.stdout || "").includes("t")`. `psql` prints the
COLUMN NAME above the value, and every one of those columns is named `untouched`
- which contains a `t`. The three `...and the database is untouched` assertions
were therefore **true whatever the database said**, and had never once been
capable of failing. They had been reported as passing on every run since the
proof was written.
**SOLUTION:** `booleanFrom()` takes the value from the line before the `(N rows)`
marker and returns `null` for a shape it cannot parse, which the callers treat as
a hard failure. **It surfaced only because APPLY-01 added the first case that
expects FALSE**, and that is the general point: a boolean assertion whose two
outcomes have never both been exercised is an assertion with one outcome. The
rule: **when a check reads a value out of formatted human output, the parse must
be anchored to the format, not to a substring** - a column header, a NOTICE line,
a units suffix and a row count are all in that stream and all of them contain
letters somebody's `includes()` is looking for.

### Waiting on a condition that was already true is not waiting
**Tag:** ci
**ERROR:** `tests/e2e/project-budget.spec.ts` accepted a deviz through the screen
and then waited for `deviz-locked` before reading the project detail page.
`deviz-locked` renders for **any** status other than `draft`, so it was already
true after the preceding *send*. The wait returned instantly, the detail page was
read before the acceptance reached the database, and the screen correctly
reported no accepted deviz. Three of seven cases failed and the failure looked
like a defect in the screen under test rather than in the test.
**SOLUTION:** Wait on the condition that becomes true **only** after the
transition. From `accepted` there is no onward transition, so the status buttons
disappear: `toHaveCount(0)` on `deviz-status-accepted`, plus the row chip reading
`Acceptat`. The rule: **an await whose condition already holds before the action
is a synchronous statement wearing an await, and it makes the next assertion race
the database.** Before waiting on a selector, ask what it looked like one step
earlier; if the answer is "the same", it is the wrong selector.

### The same migration file passes psql and fails `supabase db reset`
**Tag:** data
**ERROR:** `0030_units_tonne_litre.sql` added two `unit_code` enum labels and then
inserted the matching `public.units` rows, with an explicit `commit;` between the
two halves, because **a newly added enum label cannot be used in the transaction
that added it** (PostgreSQL `55P04`). It applied cleanly through
`scripts/apply-pending-migrations.mjs` and through the Docker shim
(`npm run check:migrations`), because both feed the file to `psql`, which honours
that commit. It **failed** under `supabase db reset`:

```
ERROR: unsafe use of new value "t" of enum type unit_code (SQLSTATE 55P04)
At statement: 3   insert into public.units (code, sort_order) values ('t', 8),
```

`supabase db reset` wraps **each migration file in one transaction of its own**
and swallows the explicit commit. The file worked in both places it had been
tested and broke in the one place it had not - and that place is the runner CI
uses to build the end-to-end stack.
**SOLUTION:** Split it. `0030` adds the labels, `0031` adds the rows. **Two files
are two transactions under all three runners**, with no special case anywhere.
The rule: **a migration is not proven until it has been applied by every runner
that will ever apply it**, and this repository has three - the applier, the shim,
and `supabase db reset`. They disagree about transaction boundaries, which is
exactly the property an enum addition is sensitive to. When a file needs a
statement to be committed before the next one, the boundary is a **file
boundary**, because that is the only one all three agree on.

### An instruction that helps a model on a clean input is a recipe for a consistent wrong answer on one it cannot read
**Tag:** data
**ERROR:** Andre's extraction prompt told the model to verify that quantity times
unit price equals the line total. On a digital document that is a useful
self-check and it catches a misread digit. On a **scan the model could not read**,
the same instruction became a rule for **fabricating a self-consistent triple**:
pick a quantity, pick a price, multiply, and the line passes its own check.

The scan path returned **four wrong lines in seven**. Every one multiplied out
correctly. Status came back `extracted`, not `failed`, and `confidence` came back
`1.0`. Nothing in the payload was internally inconsistent, so nothing downstream
had anything to notice: the arithmetic agreed with itself, the status claimed
success, and the reliability number claimed certainty.

**It was caught only because the model read the TOTALS correctly and the LINES
wrong**, so the line sum disagreed with the printed total. Had it invented lines
that happened to sum to the total, every check in the chain would have passed.
**SOLUTION:** three rules, and the first is the general one.

**An instruction to a model is a specification of what its output must LOOK LIKE,
never a guarantee of what its output MEANS.** Every consistency rule handed to a
model is also a template for a plausible answer, and the more precisely the rule
is stated the more convincingly the fabrication satisfies it. Before adding one,
ask what it would produce on an input the model cannot read at all.

**Reconciliation belongs on OUR side of the wire and not only in the extractor.**
A control that lives inside the scenario is bypassed by a scenario rebuild, a
second ingest path, or a manual upload. Card EXT-16.

**A scan-sourced document never auto-accepts, reconciled or not.** Reconciliation
is a test of arithmetic, not of reading. Card EXT-17.

**Already in `docs/LEARNINGS.md` from a different direction, and this is the same
wall approached from the other side:** any control that depends on a model
noticing its own uncertainty is not a control. `confidence` returned `1.0` on the
document with four invented lines, which is why card EXT-14 removes it rather
than displaying it.

### The pending migration list said pending, and production said applied
**Tag:** data
**ERROR:** `docs/migrations/APPLY-LOG.md` lists `0028_applied_ledger_version.sql`,
`0029_category_paints.sql`, `0030_units_tonne_litre.sql` and
`0031_units_tonne_litre_rows.sql` as pending, each with the card that will apply
it. Production has all four. Read on 2026-09-03 against project
`bwhzatwwjqmyfesfnisa`: `applied_ledger_version()` returns `"0031"`, `categories`
holds nineteen active rows including `Vopsele, lacuri și solvenți` at
`sort_order` 19, and `units` holds `t` and `l`.

The cost was not theoretical. `/Users/ivan/rc-samples/ANDRE-STATUS.md`, written
the same day, tells the extraction counterparty that the category and the two
units "land when the pending migration batch is applied to production, which is a
separate owner-run step". That sentence was true when it was written against the
repository and false about the system. He was told to wait for something that had
already happened.

**SOLUTION:** the entries owed to `APPLY-LOG.md` are still owed, and they need
the evidence of the apply that actually ran, which is not reconstructable after
the fact by whoever notices the gap.

**THE RULE. A REPOSITORY RECORDS WHAT SHOULD BE APPLIED AND ONLY THE DATABASE
KNOWS WHAT IS.** Migration `0028` exists precisely to close that gap: it exposes
`applied_ledger_version()` so the applied version can be read at run time rather
than inferred from files. It was in the pending list while being the thing that
answers the question the pending list was getting wrong. **Before telling anyone
outside this repository that something is waiting on a migration, call that
function.** One request, no credentials beyond the service key already in the
environment, and it is the only authority on the answer.

### A stale clone made a merged file look like it had never existed
**Tag:** infra
**ERROR:** `scripts/ext/serve-sample-documents.mjs` was reported as possibly
absent and the working copy agreed: `ls` said no such directory, and
`grep -r document_source` over the whole tree returned nothing at all. Both were
artefacts of `/Users/ivan/rc-inventory` sitting on a `main` **sixteen commits
behind `origin/main`**. The script had been merged in `#159`. On a check of
history rather than of the tree, `git log --all -- '*serve-sample-documents*'`
found it immediately.

**SOLUTION:** the verification was run in a fresh worktree at `origin/main`, and
`scripts/ext/serve-sample-documents.mjs` was there.

**THE RULE, AND IT IS SHARPER THAN "PULL FIRST". A GREP THAT RETURNS NOTHING IS
THE ONE RESULT A STALE CHECKOUT CAN FORGE.** A wrong line of code looks wrong; an
absent file looks like a fact about the project. The instruction being followed
was "the path is a claim, verify it", and the stale tree returned a confident,
verifiable-looking **disproof** of a true claim. `git fetch` then
`git rev-list --count HEAD..origin/main` costs one second and belongs **before**
any conclusion of the form "this does not exist", never after.

### Three open PRs and the committed counter all pointed at the same ruling id
**Tag:** ci
**ERROR:** `decisions/NEXT-RULING-ID` on `origin/main` held `R-087`. Section 8b
says to take that id. `R-087` through `R-095` were each **already written as a
different decision** on an open pull request: `#172` claims `R-087` to `R-091`,
`#157` claims through `R-095`. Taking `R-087` as section 8b instructs would have
produced exactly the collision section 8b exists to prevent, and produced it
knowingly.

**SOLUTION:** `R-096`, the first id no open branch had written, with the
deviation stated in the ruling body and in the commit message rather than left
for a reader to discover in a conflict. `check:unique-ids` is green because it
only requires the counter to be ahead of the highest id written.

**THE RULE. THE COUNTER CONVERTS AN INVISIBLE RACE INTO A CONFLICT, WHICH IS NOT
THE SAME AS RESERVING AN ID.** A counter on `main` is only accurate about
allocations that have merged. Where the mechanism has already failed visibly, the
loud signal it was built to produce has nothing left to teach, and reproducing it
on purpose just makes one number name two decisions. **Before taking the id the
counter hands you, check the branches: `git show origin/<branch>:decisions/NEXT-RULING-ID`
across the open PRs takes one loop and tells you whether the counter is describing
the present.** Deviating is defensible. Deviating silently is not.

### A capability gate named by a literal string sends the next card to the wrong gate
**Tag:** ci
**ERROR:** `scripts/poc-free/check-pending-schema-reads.mjs` held
`const GUARD = 'hasPhase3Schema'` and asked only whether a source file CONTAINS
that string. The rule is deliberately crude, which is fine, but the crudeness was
attached to ONE gate's name. EXT-09 added a column on an existing phase 2 table,
`extraction_drafts.page_count`, which `hasPhase3Schema` says nothing about: that
gate answers whether the phase 3 TABLES are applied, and 0033 can be applied
before or after them. The cheapest way to make the check green was therefore to
import the WRONG gate. The check would have passed, the callback route would
still have written a column production did not have, PostgREST would have
returned 42703, and Make retries on 5xx, so it would have been a loop rather than
one failure.
**SOLUTION:** the gate list is derived from `lib/data/schema-capability.ts` by
pattern, so a third gate is covered without editing the check, and the count is
VERIFIED: zero gates found means the pattern stopped matching, and the check
exits 2 rather than reporting every guarded file as unguarded.
**The rule:** a check that names one implementation of a concept tests that
implementation, not the concept. When the concept can have a second instance,
the check enumerates instances instead of naming one, and refuses to report when
it enumerates none.

### `add column if not exists` made a guard hunt for a column named `if`
**Tag:** ci
**ERROR:** the same check extracted pending column names with
`/alter\s+table\s+public\.(\w+)\s+add\s+column\s+(\w+)/gi`. Migration 0032 writes
`add column if not exists page_count integer`, so the capture was the word `if`.
The check then searched every file under `lib/`, `app/` and `components/` for the
token `if` and reported **52 violations**, one per file, each saying
`numeste coloana if`. Nothing was wrong with any of them.
**SOLUTION:** the pattern now allows the optional `(?:if\s+not\s+exists\s+)?`
before the column name. The document_source migration on another branch hit the
identical defect independently, which is how a one-character-class omission cost two cards.
**The rule:** a regex over SQL must accept every optional clause the grammar
allows at that position, and the failure to do so is not a miss, it is a WRONG
CAPTURE, which is worse. A miss reports nothing; a wrong capture reports a wall
of findings, and a mass refusal read as a discovery is the worst output a check
can produce: either somebody spends an hour on it, or they stop believing the
check, and the second one is permanent.

### A local e2e suite can be blocked by another project's Supabase stack
**Tag:** infra
**ERROR:** `supabase db reset` for rc-inventory failed with
`Bind for 0.0.0.0:54322 failed: port is already allocated`. The OsteoJP stack
holds 54322 on this machine. Two further mismatches sat behind it:
`supabase/config.toml` on main names 54321 and 54322 while the working
`.env.local` names 54421, so the rc-inventory stack that was up was half up, kong
on 54421 with no database container at all; and `.env.local` carries eight
variables of which `SUPABASE_SERVICE_ROLE_KEY` is not one, so the extraction
callback route would have returned 500 and every case in the spec would have
failed for a reason unrelated to the card.
**SOLUTION:** the before-and-after proof was moved onto the runner, by splitting
the branch so the tests land in one commit and the implementation in the next.
The two `quality` runs on the pull request are then the two results, produced by
the acceptance command itself rather than described in prose.
**The rule:** when a card's acceptance cannot run locally for reasons that are
not the card's, do not weaken the acceptance to fit the machine. Move it to a
machine that can run it, and say in the pull request which obstacles were hit, so
the next card does not rediscover all three.

### A migration numbering GAP is refused by the applier, and CLAUDE.md does not say so
**Tag:** data
**ERROR:** EXT-09 took number **0033** and deliberately left 0032 free, because
0032 was held by an open pull request on another branch and a duplicate number
looked worse than a hole. The reasoning was written into the migration header
and the pull request, and it cited CLAUDE.md 8.1, which asks for
"four-digit zero-padded, monotonically increasing" and says nothing about gaps.
**Everything applied fine.** `npm run check:migrations` passed, 32 files against
a bare `postgres:16`, 15 assertion files. `npx tsc --noEmit` passed. The dry run
of the applier passed. What failed was `npm run prove:applier`, at **9 of 16**,
with the clean-pass proof rolling the whole batch back:

    ASSERTION FAILED [ledger-no-gaps-ends-at-highest]:
    ledger holds 32 rows, expected 33 with no gaps

`scripts/apply-pending-migrations.mjs` asserts, in SQL, inside the transaction,
that **every integer from 1 to the highest is present exactly once**. With 0001
to 0031 plus 0033 the ledger holds 32 and the assertion wants 33, so the batch
cannot be applied at all. Six further proofs then failed as downstream noise,
which made the output look like six problems instead of one.
**SOLUTION:** renumbered to 0032. `prove:applier` went to **16 of 16**. The
collision with the other branch is real and is stated in the migration header
instead of avoided, because **git will not report it**: the two file names differ,
so both would simply land, both numbered 0032. `check:migrations` and
`prove:applier` fail loudly on the duplicate, so it cannot ship unnoticed, but
nothing warns at merge time.
**The rule, and it has two halves.** First: **migration numbers are contiguous
here, not merely increasing**, and CLAUDE.md 8.1 does not say so while the
applier enforces it. When a document and a running check disagree about a rule,
**the check is the rule** and the document is the thing that is out of date.
Second: a number taken on another unmerged branch is not free, and the collision
is invisible to git whenever the two files have different names. Say it out loud
in the file, because the next reader's only other warning is a red proof.

### A branch whose migration is numbered above an unmerged one goes red until the lower number lands
**Tag:** ci
**ERROR:** `P3-33` numbered its migrations `0030` and `0031` on the assumption
that `P3-34`'s `0029` would land first, which the board's `depends_on` edge
required. Until it did, the applier saw a pending batch ending at `0031` with
`0029` absent, and `ledger-no-gaps-ends-at-highest` rolled **every** case back.
`prove:applier` reported `0 of 16`, including the clean pass, so the failure
looked total and unrelated to the change. `EXT-15` hit the identical shape a day
later with `0032` above an unmerged `0030`/`0031`.
**SOLUTION:** **This is the assertion working, not a flake, and no re-run will
ever clear it.** The ledger genuinely has a gap; the only thing that closes it is
merging the lower number. Two rules follow:

**Migration-carrying pull requests merge in migration-number order**, which the
board's `depends_on` edges already encode where the cards are ordered. When a
branch is cut, merge `main` into it *before* choosing a number, so the number is
chosen against what has actually landed.

**Do not re-run CI on a red `prove:applier` hoping it turns green.** An hour was
lost that way on a conflicting pull request that was triggering zero workflows,
and this failure reads the same from the outside: total, sudden, and nothing to
do with the diff. Read which assertion raised. `ledger-no-gaps-ends-at-highest`
naming a number your branch does not contain is a merge-order problem, not a
test problem.

### A capability probe on a different connection answers a different question
**Tag:** backend
**ERROR:** `hasExtractionDocumentSource` built its own **session** client to
probe whether `extraction_drafts.document_source` exists. The extraction callback
is a **machine endpoint** authenticated by a shared secret, with no session, and
the RLS policies on that table are `to authenticated`. The probe got a permission
refusal, which has nothing to do with whether the column exists, read it as
"absent", and the gate answered **no forever on the one path that mattered** -
silently disabling the whole feature on the endpoint it was written for. The
end-to-end cases failed with `document_source: null` on a database that had the
column.
**SOLUTION:** The probe takes the caller's client as a parameter, so it asks on
**the same connection that will do the read**. The rule: **a capability probe is
only meaningful on the connection whose capability is in question.** Anon,
authenticated and `service_role` see different schemas through PostgREST, so
"does this column exist" is not one question - it is one question per role, and
an error from the wrong role is indistinguishable from an absent column.

### An extractor that captures the wrong token invents an object and searches for it everywhere
**Tag:** ci
**ERROR:** `check-pending-schema-reads` matched added columns with
`alter\s+table\s+public\.(\w+)\s+add\s+column\s+(\w+)`. Migration `0032` writes
`add column if not exists document_source text`, so the capture was the word
**`if`**. The check then looked for a column named `if` in every source file,
found it in nearly all of them, and reported the entire application as reading
unapplied schema: *"lib/data/dashboard.ts numeste coloana if"*. Confident,
specific, and about nothing. The `create table` pattern three lines above already
handled `if not exists`; this one did not.
**SOLUTION:** The pattern accepts the clause, and - the durable half - **a
captured object name that is a SQL keyword now stops the run instead of being
searched for.** This is the mirror of the class `docs/LEARNINGS.md` already
names: not a check whose *passing* path is reachable without the condition, but
one whose *failing* path is. **The mirror is worse**, because a false green is
ignored once and a false red is ignored forever. Any extractor that produces a
NAME which is then used to search should validate that the name is plausible
before trusting it.

### A card branch pushed with no pull request is work that the board reports as never started
**Tag:** ci
**ERROR:** Run `20260903-220002` booted, read `docs/board/rc-board-phase2.json`,
and was handed `AUT-15` as the lowest-id eligible card because its status on
`main` was `todo`. The card was in fact **finished**: branch `card/aut-15` existed
on `origin` at `f5c5066`, carrying the corrected `docs/DOCTRINE-TRIAGE.md`
paragraph, the board flip to `in_flight`, and a commit message quoting the failing
acceptance run. No pull request had ever been opened for it, so nothing on `main`
knew. `gh pr list --head card/aut-15` returned `[]`. The board said `todo`, the
digest would have said not started, and the next run would have redone the work
from scratch and produced a second branch for one card.
**The silence rule fired and it was not enough, which is the part worth keeping.**
Run `20260903-070005` wrote the escalation `AUT-15:branch:in_flight`, so the
harness knew. That escalation sits in `docs/poc/state.json`, and the two things a
later run actually reads to decide what to work, the board's `status` field and
`gh pr list`, both still said the card had never been started. A correct record in
a third place did not stop the wrong record in the first two from being acted on.
**SOLUTION:** This run added no new commit to the doctrine file: it read the
existing branch, confirmed the acceptance passed on it, merged `origin/main` INTO
the branch (a merge, never a rebase, because section 3 forbids rewriting a card
branch's history), and finished the card from there. **The durable half is the
detection rule: a card branch is only visible to the board through its pull
request, so a leftover-work sweep must look at BRANCHES, not only at open pull
requests, and the run that leaves work on a branch must open the pull request
before it ends.** An open pull request with no merge is loud: it appears in
`gh pr list`, in `gh pr status` and in every review queue. A pushed branch with no
pull request is silent in all of them. Before taking a card, check
`git ls-remote --heads origin card/<id>`; the answer costs one round trip and the
alternative is redoing work that was already finished.

### Three components, three copies of one path, and the owner's answer channel refusing his answers
**Tag:** infra
**ERROR:** `scripts/poc/run.sh`, `scripts/poc/inbox.mjs` and `scripts/poc/notify.mjs`
each independently hardcoded `docs/board/rc-board-phase2.json`, while every
unattended run since 2026-08-30 worked the phase 3 board. Three separate
failures, all silent, all looking like normal operation:
the Telegram reader answered `R P3-27 default` with `no card P3-27 on the board`,
so the owner's own decision channel refused his decisions on the oldest
unanswered question in the repository;
the digest counted shipped cards and read the launch gate off a board nobody was
working, so it reported one gate figure that silently meant the first board;
and the eligible-card selector, the silence rule and the claim writer all
computed against that same board, which is how a claim on `AUT-10` came to be
written at the end of a run that spent its time on `P3-11`.
**Nothing was red at any point.** A hardcoded path does not fail, it answers
about the wrong thing, and every one of those three components produced
plausible output the whole time.
**SOLUTION:** `scripts/poc/boards.mjs` is now the only place a board file is
named, and every component resolves against the set. **The rule: when a second
instance of a kind of thing appears (a second board, a second environment, a
second queue), the list of them becomes a module before the second consumer is
written, not after the third one is found to be blind.** Repointing the old
constant at the new board would have moved the blindness rather than removed it.
The test that guards it greps the live components for a board filename, because
the property being protected is that there is exactly one place, and a test that
only checks behaviour cannot see a fourth copy arriving.

### A deployed shell script and a worktree-read module do not upgrade together
**Tag:** infra
**ERROR:** `run.sh`, `responder.sh` and `digest.sh` are deployed copies under
`/Users/ivan/rc-poc-bin`, while every `.mjs` beside them is read out of a
worktree checked out at `origin/main`. So a change that alters how a shell script
calls a module ships the two halves at different moments: for one merge window a
NEW script calls an OLD parser. Passing the board set as one space separated
`--board "a b"` argument made the old parser treat the whole string as a single
path, and `test-install.sh` caught it as `the board did not parse`.
**SOLUTION:** Repeated `--board` flags instead of one packed value. An old parser
keeps the last flag and renders that board alone, which is exactly what it did
before; a new parser collects them all. **The rule: when two halves of a system
upgrade at different times, choose the argument shape whose OLD reading is the
old behaviour rather than an error.** Both shell scripts also fall back to the
phase boards present in the commit when `boards.mjs` is absent from it, and log
that they did, so a main that predates the change costs a log line rather than
every scheduled window until the merge lands.

### Folding an id on the way in and not on the way out makes a lease that protects nothing
**Tag:** infra
**ERROR:** `scripts/poc/claim.sh` upper-cased the card id it was handed
(`tr '[:lower:]' '[:upper:]'`) and wrote that into the claims map. `eligible.mjs`
then looked the claim up by the board's own spelling, verbatim. For every card
with a lower-case suffix (`P3-04b`, `P3-11a`, `P3-13c`) the two never met: the
claim was written, reported as taken, and honoured by nobody. The command printed
success. This is the fourth instance of one defect class in this repository, after
the pending-register regex, `ask.mjs`, and the inbox reader's own card set.
**SOLUTION:** The writer resolves the typed id against the board set and stores
the board's spelling; the reader folds both sides so leases already in the file
still match. **The rule, restated because it keeps being paid for: tooling that
folds an id must fold BOTH SIDES of every comparison, and the place to do it is
where the id is RESOLVED against a source of truth, once, rather than at each
comparison.** An id that resolves to nothing is now refused and named, because a
lease on a card that does not exist parks nothing and hides a typo.

### A push cancels the check that is running, so a green is never inherited across a correction
**Tag:** ci
**ERROR:** PR #186's `quality` run reached its last step, End to end, with all
twenty one preceding steps green. Two commits were then pushed to correct a
factual error in the run's report. The workflow's concurrency group cancelled the
run in flight, so its conclusion is `cancelled`: not a failure, not a success, and
attached to a sha nobody would merge anyway. The branch went from one step short
of a green to no concluded run at all, and the second push cost a second one.
**SOLUTION:** Nothing here argues against correcting a report, which is
mandatory. **The rule is to know the price: a push to a branch kills the check
running on it, so batch every edit you know you need into ONE push, and make it
before the check is nearly done rather than while it is finishing.** This is the
same trap CLAUDE.md section 3 names from the other side. There the danger is
reading a green that belongs to an earlier sha; here it is destroying a green
that was about to belong to this one. Both are the same fact: a check result
belongs to a sha, and pushing makes a new one.

### Second instance: an instruction not to invent a self-consistent total was ignored three runs of three
**Tag:** data
**ERROR:** The prompt forbade the model from constructing a quantity, a unit
price and a line total that agree with each other when it cannot actually read
all three. **It did it anyway, on three runs out of three.** Andre's Matnord scan,
7 lines, printed total **50,336.40** excluding VAT, produced three different line
sums across three runs: **49035.40**, **39242.00**, **38429.40**. Every one of the
three arrived with `status: extracted` and `reason: null`, which is the payload
shape meaning "read cleanly, nothing to report".

The tolerance for a 7-line document is `max(0.05, 0.01 * 7)` = **0.07**. The three
miss it by **1300.93**, **11094.33** and **11906.93**.

**The three runs disagree with EACH OTHER by up to 10606.00**, on one unchanged
page, against a tolerance of 0.07. That is five orders of magnitude past the
tolerance, and it is the part that matters: a reading that drifted would cluster.
Three readings of the same page that disagree with each other by that much are
not one reading with noise on it, they are three separate fabrications.

**THIS IS THE SECOND CONTROL OF THIS SHAPE TO FAIL, AND THAT IS THE ENTRY.** The
first was `confidence`, which returned **1.0** on a document with four invented
lines, and which card EXT-14 removes rather than displays. The two failures are
the same failure wearing different clothes:

| the control | what it asks the model to do | what it returned |
|---|---|---|
| `confidence` | report how sure it is | `1.0`, on four invented lines |
| "do not construct a self-consistent total you cannot read" | notice it is about to invent, and stop | three fabrications, three runs, all `extracted`, all `reason: null` |

**SOLUTION, and it is a generalisation rather than a fix to either instance.**

**A CONTROL THAT DEPENDS ON THE MODEL NOTICING IT HAS MISREAD IS NOT A LAYER, AND
IT MUST NOT BE COUNTED AS ONE IN ANY CARD, CONTRACT, GATE OR REPORT.**

Not "is a weak layer". **Not a layer.** It contributes zero to a defence-in-depth
argument and it must be worth zero when the layers are counted, because a
protection that reads as present and is absent is worse than an acknowledged gap:
the gap gets a card and the phantom gets a tick.

**The test to apply before writing any such instruction or field**, and it is one
question: **would obeying this correctly require the model to know something it
does not know?** Noticing that you misread a digit requires knowing the digit. If
the answer is yes, it is `confidence` with a new name, however procedural the
wording looks.

**An instruction to a model specifies what its output must LOOK LIKE, never what
its output MEANS.** Already in this file from the first instance, and the reason
this one was predictable: **the more precisely a consistency rule is stated, the
more convincingly a fabrication satisfies it.** "Make the lines sum to the total"
is also a template for inventing lines that sum to the total.

**Where the real control goes: on our side of the wire, in arithmetic we perform.**
Card EXT-16 reconciles the line sum against the printed total in our validator,
against a number we read, and it is not asking the model anything. That is a
layer. The three fixtures above are its test cases, and they are committed as
observed rather than rounded, with no fourth invented sum added to make the set
look tidier.

### A migration reaches production on merge, with no applier, no journal and no human
**Tag:** infra
**ERROR:** `docs/migrations/APPLY-LOG.md` listed `0028` to `0031` as pending while
production reported them applied. Every card report said "authored and merged,
**NOT applied**". No commit, no journal row, no actor. The obvious reading was
that somebody applied them and failed to write it down.

**Nobody did.** A **`Supabase Preview` check, from the GitHub app `supabase`,
runs on every push to `main`** and points at the production project. It applies
merged migrations. Its check output carries no title and no summary, so it says
nothing about what it did.

**IT WAS CONFIRMED BY PREDICTION, WITH A CONTROL, AND THAT IS WHY THIS ENTRY IS
NOT SPECULATION.** Two migrations both numbered `0032` existed on the same day:
`0032_extraction_draft_page_count.sql` on PR #180 and
`0032_extraction_document_source.sql` on PR #177. Before merging either:

    applied_ledger_version()           "0031"
    extraction_drafts.page_count       42703, absent
    extraction_drafts.document_source  42703, absent

PR #180 was merged. PR #177 was left open. Within two minutes:

    applied_ledger_version()           "0032"
    extraction_drafts.page_count       PRESENT
    extraction_drafts.document_source  still absent

**The unmerged twin is the control.** Same day, same register, same shape, and
only the merged one landed.

**SOLUTION, and it is not a fix, it is a correction to what everyone believed.**

**"Merging a migration file changes one text file in a git repository and changes
nothing in any database" IS FALSE IN THIS REPOSITORY.** That sentence is in
CLAUDE.md 3.1, it is the entire basis of the self-merge grant separating merge
from apply, and it was true when written. It is not true now. **On this repo, on
this integration, MERGE IS APPLY.**

Everything downstream of that sentence needs re-reading:

- **R-082's applier is not the only path to production, it is the path a terminal
  takes.** `scripts/apply-pending-migrations.mjs` runs one transaction, records
  the register, asserts in SQL and commits only on all-pass. **The integration
  does none of that** and needs no permission from anyone.
- **8.6's destructive-statement stop protects nothing here.** A merged migration
  containing `DROP TABLE` applies on merge. Every terminal would have obeyed the
  rule and the table would be gone anyway.
- **8.8 is broken by a party it does not describe.** It says a production write
  with no row in one of the two journals is a violation. It is written for
  terminals. This writer is not one.
- **The pending register cannot be trusted as a statement about production.** It
  is a statement about what a terminal has applied, which is a different and much
  smaller set.

**The rule.** **A repository's doctrine describes the actors it knows about. Before
relying on a control, ask what ELSE can perform the action it controls** - an
integration, a bot, a scheduled job, a console someone can click. A control that
binds every actor you thought of, and there is a writer you did not, is not a
weaker control; it is an inventory error, and the gap is invisible precisely
because every actor you audit is compliant.

**How it was found, which is the reusable part:** by reading production and the
repository and refusing to reconcile them by assumption. The register said
pending, production said applied, and the temptation was to write four journal
entries and move on. The entries would have been fiction, and the actual defect -
an unaudited write path - would have stayed hidden behind them.

### A proof script that copies the live board inherits today's board as an unstated precondition
**Tag:** ci
**ERROR:** `scripts/poc/test-ask-digest.sh` case 6 asserts the digest is **silent
when nothing is outstanding**, and it builds its fixture by copying the **live**
`docs/board/rc-board-phase2.json`. `digest.mjs` counts a card that is
`status: blocked` with `blocked_on: "ivan"` as an outstanding question, and it is
right to: that is an owner action nobody else can discharge.

Card `MIG-01` was then authored `blocked_on: ivan`, **exactly as CLAUDE.md section
4 requires** of a decision a terminal may not make, and **three assertions turned
red**:

### A gate that goes red when the doctrine is obeyed trains terminals out of obeying it
**Tag:** ci
**ERROR:** Card `MIG-01` was authored `blocked_on: ivan` with a structured
decision-needed question, which is **exactly what CLAUDE.md section 4 requires**
of a decision a terminal may not make. Three assertions in
`scripts/poc/test-ask-digest.sh` turned red:

    FAIL  the first run sent 1 digest(s) with nothing outstanding
    FAIL  an unchanged board produced 3 digest(s)
    FAIL  the digest kept nagging after the question was answered

**The card was correct. The digest was correct. The fixture was wrong.** The
assertion had held only while the live board happened to contain no card blocked
on Ivan, and it contained none: checked against `origin/main`, the count was
**zero**. The test had been passing by luck since it was written.

**SOLUTION:** the fixture is neutralised after the copy. Every card that is
blocked on Ivan has its `status`, `blocked_on` and `question` cleared, so the
baseline is a genuinely quiet board rather than whatever the board looks like
today. Cases 7a to 7d, which each introduce ONE of the four conditions into the
same fixture and assert the digest speaks, need that quiet baseline too, so this
makes them honest as well as case 6.

**THE RULE, AND IT HAS TWO HALVES.**

**A fixture copied from live data carries every property that data happens to
have**, including the ones nobody chose and nobody wrote down. A test built that
way does not fail when the code breaks; it fails when the data moves. Copy live
data into a fixture only after neutralising the properties the assertion depends
on, and say in the fixture which ones those are.

**And the sharper half: A GATE THAT GOES RED WHEN THE DOCTRINE IS OBEYED IS WORSE
THAN NO GATE.** Section 4 says a card a terminal cannot decide goes
`blocked_on: ivan`. Doing that turned `quality` red. The next terminal to meet
this learns that blocking a card correctly costs it a red build, and the cheap way
out is to not block the card. **When a check punishes correct behaviour, fix the
check immediately** - it is training every future run against the rule it was
built to protect.

`digest.mjs` counts a card that is `status: blocked` with `blocked_on: "ivan"` as
an outstanding question, and **it is right to**: that is an owner action nobody
else can discharge. Case 6 builds its "nothing outstanding" fixture by copying the
**live** board, and the number of cards blocked on Ivan on `origin/main` was
**zero**, so the assertion had been passing on that and nothing else.

**The card was correct. The digest was correct. The fixture was wrong.** Proven
rather than assumed: `digest.mjs decide` returned `send: true` with reason
`"a question is outstanding"` against the branch board, and `send: false` against
the same board with `MIG-01` removed.

**SOLUTION: THE FIXTURE WAS FIXED AND THE CARD WAS NOT, and the direction is the
entire lesson.** The fixture now clears `status`, `blocked_on` and `question` on
any card blocked on Ivan, and **reports what it did** — a silent fixture edit
would be the same defect one layer down.

**THE CHEAP EXIT WAS TO DROP `MIG-01`'s `blocked_on`.** It would have gone green
in seconds, cost nothing visible, and left a card that a terminal may not decide
sitting in `todo` as though it could. **That is the outcome this entry exists to
make unthinkable.**

**The rule.** **A check that punishes correct behaviour is not a strict check, it
is a broken one, and it must be fixed the moment it is found.** Every hour it
stands, it teaches the next terminal that following the rule costs a red build
and that the way out is to stop following the rule. A gate is supposed to make the
correct path the cheap path; when it inverts that, it is actively training against
the doctrine it was built to protect.

**How to tell this case from an ordinary failure**, because "the check is wrong"
is also what every terminal with a real bug wants to believe: ask whether the
thing that turned it red is **required** by a rule written down somewhere. Section
4 requires `blocked_on` on an undecidable card. If obeying a written rule is what
made the gate red, the gate is wrong. If it is your code that made it red, it is
not.

### A diff against an unmerged branch tip was read as a revert, and it produced four rulings and two cards
**Tag:** ci
**ERROR:** TRIAGE run `20260903-220002` reported, as the central finding of its
run, that pull request `#183` had reverted committed content from `main`: 317
lines of `docs/migrations/APPLY-LOG.md`, ruling `R-098`, two cards, three
learnings, a contract section and a test fixture. The inventory was stated as
"every line verified with `git diff b25dc75 origin/main`, nothing inferred", and
the report asserted "`main` was `b25dc75` at that moment". None of it had
happened. `b25dc75` is the tip of `board/dispatch-20260903`, open as pull request
`#181`, and it has never merged. The diff was between an unmerged branch tip and
`main`, and **in that direction everything the pull request ADDS appears as a
deletion**. On the strength of it the run wrote `R-099` and `R-100`, authored
`RESTORE-01` to restore content that was never removed, and authored `GUARD-02`
against a class of failure with no live instance. Every command in the report ran
and printed what the report says it printed. The reasoning on top of them was the
part that failed.
**SOLUTION:** `git diff A B` is symmetric in appearance and asymmetric in
meaning, and it never says whether `A` was ever reachable from `B`. **Any claim
that `main` lost content names the commit it lost it in and proves that commit is
an ancestor of `main` before the claim is written:**

```
git merge-base --is-ancestor <sha> origin/main && echo YES || echo NO
git branch -a --contains <sha>
```

The first returned `NO` and the second returned only the open pull request's own
branch. Both cost one round trip and neither had ever been run in this
repository. The second confirming step, when the accused commit is a merge, is to
diff the merge against the parent it is accused of discarding, not against some
other tree: `git diff --stat 29afb21^2 29afb21` returned two files and eight
deleted lines, which were the branch's own intended edits. Ruled as `R-103`.

### Four pull requests sat outside `main` for days and the ids on them had already collided
**Tag:** ci
**ERROR:** On 2026-09-04 four pull requests were open and unlanded: `#157`,
`#172`, `#181` and `#184`. Three conflicted with `main`, which per `CLAUDE.md`
section 3 means they triggered zero workflows, so every check result attached to
them belonged to a commit nobody was proposing to merge. Between them they held
fifteen ruling ids, eleven cards, and the fix for a journal that currently tells
a reader six migrations are pending when production has applied at least four of
them. **The ids had already collided with each other and no check could see it:**
`R-090` and `R-091` mean different things on `#157` and `#172`, and `R-098` means
different things on `#181` and `#184`. `check:unique-ids` compares each branch's
headings against `origin/main`, where none of those ids exists, so all four
passed, and any two of them landing makes the ambiguity permanent.
**SOLUTION:** Two halves, and the second is the durable one. The instance is card
`RST-05`, which lands all four as one reconciliation, because two pairs collide
and resolving one at a time means redoing the next against it. The rule is
`R-107`: **a ruling that has never been on `main` is not history and may be
re-allocated a fresh id before it lands, and which side keeps the id is decided
by MERGE ORDER, never by merit.** Section 8b's "no id is ever renumbered" protects
what is committed to the trunk, and a branch is a proposal rather than history.
Merge order is observable; merit is arguable, and the failure being guarded
against is a terminal weighing two texts at 2am. The class fixes already exist and
are still unworked: `RST-02` is the sweep that never selected a triage branch, and
`AUT-18` is the census that would have named all four the same night.


### A stale green does not need a conflict: BEHIND reads exactly the same
**Tag:** ci
**ERROR:** Run `20260904-040001` booted onto PR #186, inherited from the run
three hours earlier, and `gh pr checks` reported `quality pass`. It was not a
merge that could be made. `npm run checks:state 186` printed `head 80d4128 /
mergeStateStatus BEHIND / quality SUCCESS / STALE, NOT GREEN`. The pull request
did not conflict with `main` at any point and never had. `main` had simply moved
under it, and branch protection on `main` sets `required_status_checks.strict`,
so the recorded run was not the run that would decide the merge. Every prior
instance of this trap in this repository, including the six-screen outage the
rule in CLAUDE.md section 3 was written from, was a CONFLICTING pull request,
where the tell is that zero workflows were triggered. `BEHIND` triggers nothing
either, produces the identical `quality pass`, and arrives by a completely
different route: nobody has to touch the branch for it to happen, because it is
caused by somebody else's merge.
**SOLUTION:** `mergeStateStatus` is read for its VALUE, not for whether it says
`DIRTY`. `npm run checks:state <pr>` already had this right and refuses `BEHIND`
and `DIRTY` alike, which is why it caught this one. **The rule: a green is
trusted only when the check's head sha is the sha that will merge, and the only
thing that proves that is `mergeStateStatus CLEAN`.** The fix in both cases is
the same and it is the one in R-052: merge `origin/main` into the branch
LOCALLY, run the board validator and the conflict-residue check before the
commit, push, and wait for a run on the new sha. Here it resolved with no
conflict at all, ten insertions in one file, and the pull request went from
STALE to `CLEAN` and merged as `d4915a8`.

### A selector that sorts filenames is not a selector that sorts by time
**Tag:** infra
**ERROR:** The scheduled run chose the report for its review step with
`git ls-tree -r --name-only origin/main -- docs/reports/ | sort | tail -1`. Three
things were wrong in two lines and none of them could be seen from the output,
because the output is always a plausible path. It sorted FILENAMES, so two
reports carrying the same date were ordered by their slug and the one committed
second could sort first. It read `origin/main` only, so a report riding in an
unmerged pull request was invisible, which is the exact state a card whose
acceptance failed leaves behind. And it never asked what the previous review had
already consumed, so on 2026-08-31 the run re-reviewed a report that had been
triaged in full the run before and merged as PR #131, producing a second set of
ids about one file on a green pull request with nothing erroring.
**SOLUTION:** Order by commit, not by name: `git log --format=%H <range> -- <dir>`
then `git show --name-only` per commit. Read the branch as well as the remote, by
selecting over `origin/main..HEAD` before `origin/main`. Compare the result
against the state file the review step already writes. The rule: when a pipeline
picks "the newest" of anything, the sort key must be the thing that makes it
newest. A filename is a label, and a label is only ordered by time as long as
nobody names two things on the same day.

### A test that copies the pipe under test proves the copy
**Tag:** ci
**ERROR:** `scripts/poc/run.sh` takes a lock, sources a secrets file and invokes
a model, so it cannot run in CI, and the selection logic was three commands
inline in the middle of it. A test written against a copy of that pipe would have
passed forever while the real pipe drifted.
**SOLUTION:** The block is fenced with `# EXTRACT-BEGIN triage-selector` and
`# EXTRACT-END triage-selector`, and `scripts/poc/test-harness-caps.sh` lifts it
verbatim with its existing `extract` helper, which treats a missing fence as a
hard failure rather than an empty extraction that would pass every assertion.
The rule that makes this work: fence the logic and extract it, and separately run
the OLD implementation on the same fixture and REQUIRE IT TO FAIL. A guard nobody
has watched fail is a guard nobody has tested.

## A read whose error is discarded renders as "there is nothing there"

**Found 2026-09-04, by card EXT-18's test lane, confirmed by a probe with a
control. Carded as `P3-38`.**

`lib/data/extraction.ts` asks PostgREST for the lines of **every** pending draft
in one request:

    .in("order_id", pending.map((r) => String(r.order_id)))

Past a couple of hundred pending drafts the id list makes the URL longer than the
gateway will accept. Measured against the local stack, bisected:

    50 ids   -> 200
    150 ids  -> 200
    208 ids  -> 200
    209 ids  -> 414 URI Too Long

The code destructures `const { data: lines } = await ...` and **never reads
`error`**. So the 414 produces `lines === undefined`, an empty per-order map, and
**every draft on the review screen renders with zero line items**. Nothing is
red. The operator sees a screen that says, in effect, "none of these documents
had anything written on them."

**The url length is the trigger. The discarded error is the defect.** A screen
that cannot tell *"no lines"* from *"I could not read the lines"* will find
another way to say the wrong one. Fixing the batching alone would leave the next
unread error exactly as quiet.

**It is invisible in CI by construction.** Every run starts from
`supabase db reset`, so the pending-draft count never leaves single digits. It
needs an installation that has been running for a while, which is the only kind
the client will ever have.

**The lane that found it is worth keeping for the same reason.** Eight full runs
against one persistent local stack is closer to a real installation than any
single CI run is, and the failure it produced looked at first like a regression
in the diff. It was not. Baseline against the unchanged tree before blaming the
diff, and when a "flaky" failure appears only after several runs, count the rows.

### A test that extracts a fenced block must fail hard when the fence is gone
**Tag:** ci
**ERROR:** `scripts/poc/test-pr-census.sh` was written with the same helper
shape as `test-harness-caps.sh`: `CENSUS=$(extract pr-census)`, where `extract`
prints a FATAL message and calls `exit 1` if the fence is missing. Run against a
`run.sh` with no fence, the test did not stop. Command substitution runs the
function in a SUBSHELL, so `exit 1` killed only that subshell; the variable was
set to the FATAL text, the block was never sourced, and the suite carried on and
reported `FAIL: 20 assertion(s) failed` from twenty unrelated assertions. A
deleted fence is one defect and it presented as twenty.
**SOLUTION:** the helper writes to a path the caller already knows and RETURNS a
status; the caller runs `extract pr-census || exit 1` outside any substitution.
The same input now prints the FATAL line and exits 1. RULE: a shell helper whose
failure must stop the program never runs inside `$(...)`, because `exit` in a
subshell is `return` with extra steps.

### The census must count an unknown commit time as old, not as new
**Tag:** infra
**ERROR:** the pull request census decides whether a head commit predates the
run, and escalates a not-green pull request only when it does. The first draft
left the epoch empty when neither git nor GitHub could resolve the sha, and an
empty string compared as newer than the run start, so an unresolvable head sha
silently suppressed its own escalation.
**SOLUTION:** an unresolvable commit time is pinned to 0, which reads as older
than every run and therefore escalates. RULE: when a missing input decides
between reporting and staying quiet, the missing case reports. A census that
fails quiet is the thing it was built to replace.

### A card acceptance that greps for an absent phrase forbids quoting it, even when the doctrine style says quote it
**Tag:** ci
**ERROR:** AUT-19's replacement text for `docs/DOCTRINE-TRIAGE.md` section 2 was
first written in the style CLAUDE.md section 9c prescribes for a superseded
doctrine sentence: the old wording quoted verbatim, marked false, left in place.
That made `grep -c 'namespaced by author' docs/DOCTRINE-TRIAGE.md` print 1, and
the card's own acceptance clause 1 requires 0. The two instructions pull in
opposite directions on the same paragraph.
**SOLUTION:** the acceptance wins, because it is the machine-checkable half and
a card does not ship on a clause it fails. The supersession is stated in full
without reproducing either forbidden string: what the old rule told a session to
do, why it is gone, the ruling that recorded it, and a sentence addressed to a
reader arriving with the old wording in hand. RULE: when a card's acceptance
greps for the ABSENCE of a phrase, section 9c's quote-the-false-sentence style
is unavailable for that phrase, and the supersession is written as description
rather than as quotation. 9c's purpose survives, its literal form does not.

### A test that reads and writes a live spool goes red for reasons that are not in the repository, and writes decisions nobody made
**Tag:** ci
**ERROR:** `scripts/poc/test-chat-classify.sh` was AUT-6's acceptance and had
been red on `main` for as long as anyone could measure, failing with
`expected [ignored,empty,ruling,ruling,question], got [ignored,empty,ruling,ruling,answer]`.
The classifier was right on every message. ASK-01 later gave
`scripts/poc/chat-classify.mjs` two spool directories it both READS and WRITES,
the ask spool and the ruling spool, each defaulting to a real path under
`/Users/ivan/rc-poc-logs`, plus `--asks` and `--rulings` flags to point them
elsewhere. The test predates ASK-01 and never passed either flag. So its verdict
depended on machine state: `/Users/ivan/rc-poc-logs/asks/open/` held exactly one
outstanding question, ASK-01's rule 3 says ordinary text with exactly one
question outstanding IS the answer to it, and the fifth fixture message was
correctly routed as `answer`. In CI, where that directory does not exist, the
same test would have gone green for an equally accidental reason. The half
nobody had noticed is that it also WROTE: each run spooled the fixture's two
ruling messages, `R P2-13 default` and `R P2-13: take the second option`, into
the real pending ruling spool where `inbox.mjs` reads them as decisions the
owner made, and spooled the fifth message into the real answer spool as an owner
instruction against whichever card was outstanding. `rulings/consumed/` held both
fixture files dated 2026-09-04, so `inbox.mjs` had already picked them up once.
**SOLUTION:** the TEST was corrected, not the classifier, because a committed
change (ASK-01, and CLAUDE.md section 14) altered the behaviour and the test was
never updated. Every invocation now passes `--asks` and `--rulings` at
directories under its own `mktemp -d`, routed through one `classify()` helper so
no future call site can forget a flag, and the isolation is itself asserted: the
answer must land in the fixture spool and both rulings must land in the fixture
ruling spool. ASK-01's rule 3 is now pinned deliberately against a second
fixture spool holding one question, instead of arriving by accident from a
directory nobody controls. RULE: a test whose subject takes a `--dir` flag
passes that flag on EVERY invocation, and asserts that the artefact landed in
the directory it named. A default that points at production state makes the test
a writer to production state, and a test that writes to the channel the owner
makes decisions through is worse than a test that does not run.

### A test file with no runner is a check that reports as passing by never existing
**Tag:** ci
**ERROR:** `scripts/poc/test-chat-classify.sh` was named in no step of
`.github/workflows/quality.yml`, while its four siblings
(`test-harness-caps.sh`, `test-install.sh`, `test-ask-digest.sh`,
`test-board-set.sh`) were each wired in by name with a comment tag. Nothing in
`quality` measured the responder classifier, so its red was invisible from every
run log; the gap was only findable by reading the workflow against the directory
listing. `npm run check:assertion-register` catches an assertion with no failing
case, which is a different class and did not apply.
**SOLUTION:** the step was added, unfiltered, next to its siblings and tagged
`# AUT-6-AUT-20-CLASSIFY-PROOF`. RULE: a proof script ships wired into `quality`
in the same pull request that creates it, because a proof nothing invokes is
indistinguishable in every report from a proof that passes. If a third instance
of this class appears, the fix is a check that compares the `scripts/poc/test-*`
listing against the step list rather than a third manual wiring.

### A PostgREST `.in()` filter is a URL, so an id list that grows with the client's data eventually gets a 414 nobody reads
**Tag:** backend
**ERROR:** `listReviewDrafts` asked for every pending draft's lines in one
request, `extraction_draft_lines?select=...&order_id=in.(<one uuid per pending
draft>)`. A uuid plus its comma costs 37 bytes of URL, so the request line grew
with the number of documents the client had waiting. Measured twice on a local
stack: 128 ids returned 200 at 4819 bytes and 256 returned 414 at 9555 bytes,
and an earlier bisection put the boundary at 208 accepted, 209 refused. The code
destructured `const { data: lines }` and never looked at `error`, so a 414 left
`lines` undefined, the per-order map empty, and EVERY draft rendered with zero
line items. The review screen is where Mihai checks a scan against the paper, so
the failure mode was the last control in the extraction chain quietly showing
nothing. **It is invisible in CI by construction**: every run starts from
`supabase db reset`, so the pending count never leaves single digits. It needs an
installation that has been running, which is the installation the client has.
**SOLUTION:** the lines now arrive as a PostgREST embedded resource in the same
request as the drafts, so there is no id list to grow: `extraction_draft_lines`
carries a real foreign key to `extraction_drafts.order_id` (migration 0008) and
PostgREST expresses the join itself. The sibling read against `inbound_orders`
cannot be embedded, because `extraction_drafts.order_id` deliberately carries no
foreign key to it, so that one batches through `ID_LIST_BATCH_SIZE` in
`lib/data/id-list.ts`, one named constant with both measurements beside it. All
three reads now read `error` and throw. RULE, and it is two rules: **a filter
whose value list grows with the data is a URL that grows with the data**, so
prefer the embedded join and batch only where no relationship exists; and **an
unread `error` on a list read is the same defect class as a matcher whose empty
result means nothing to do** - the screen could not tell "this document has no
lines" from "I could not read the lines", and neither could the operator.

**AND THE EMBED IS NOT ONLY ABOUT THE URL, WHICH WAS MEASURED RATHER THAN
ASSUMED.** `max_rows = 1000` in `supabase/config.toml` caps a flat list across
the WHOLE result: two drafts of 600 lines each, asked for as one flat query,
returned 1000 rows and lost 200 without saying so. The same two drafts asked for
as an embedded resource returned 600 and 600. **The cap applies per parent on an
embed and to the whole set on a flat list**, so batching the id list would have
traded a loud 414 for a silent truncation spread across drafts, which is the same
defect one level quieter.

### A test that seeds an ADDITIONAL number of rows breaks on run two of a persistent lane
**Tag:** ci
**ERROR:** the P3-38 acceptance needs more pending drafts than the request
refusal threshold, which is a few hundred. Seeding "add 288 rows" would have put
576 there on the second run and 864 on the third, and the drafts query is capped
at `max_rows = 1000` by `supabase/config.toml`: past that the case's own draft
falls outside the response and the test goes red for a reason that is not its
own. CI never sees this because CI resets, but the local lane this defect was
found on does not.
**SOLUTION:** the helper tops up to a TARGET rather than adding a quantity: it
counts what is already pending through `Prefer: count=exact` and inserts only the
difference. RULE: a seeding helper on a shared or persistent database states the
end state it wants, never the amount it adds. The same rule is why the refusal
threshold is MEASURED at test time by probing the same PostgREST the application
uses, rather than written into the test: 208 was measured on one stack on one
day, and a number copied into a test is a fact about a machine that has since
changed.
### JavaScript string replace eats `$'`, and it silently mangled a shell script it was inserting
**Tag:** ci
**ERROR:** inserting a block into `scripts/poc/run.sh` with
`s.replace(anchor, anchor + block)` produced a file that failed `bash -n` at a
line 500 lines away from the insertion. The block contained
`grep -oE '[0-9]+$'`, and in a string replacement JavaScript reads `$'` as the
special pattern meaning "the portion of the string after the match". The `$'`
was replaced by the whole rest of the file, which unbalanced a quote in an
unrelated `node -e` heredoc and moved the reported error somewhere the change had
not touched.
**SOLUTION:** pass a FUNCTION as the replacement, `s.replace(anchor, () => anchor
+ block)`, where no `$` pattern is interpreted. RULE: any programmatic file edit
whose replacement text is data rather than a pattern uses a function replacement.
And the second half of the rule is what caught it: **`bash -n` was run
immediately after the insertion**, so the corruption was found in seconds rather
than at 22:00 by a scheduled run that could not parse its own harness.

### A decision function that logs cannot also print its verdict, when the log IS stdout
**Tag:** infra
**ERROR:** `gate_decision` in `scripts/poc/run.sh` was first written to `echo`
its verdict, read by the caller as `set -- $(gate_decision)`. `log()` in that
file writes to stdout, because the run's stdout is the run log. So on the
fail-open branch, which is the one branch that logs, the captured output was the
log line followed by the verdict, and `$1` parsed as a timestamp instead of
`open`. The gate would have failed to open on exactly the path whose whole
purpose is to open.
**SOLUTION:** the function sets two globals, `GATE_VERDICT` and `GATE_COUNT`, and
prints nothing. RULE: in a script where `log` writes to stdout, a function that
logs must not also return a value through stdout. Either it returns through a
global, or it logs to a file descriptor the caller is not capturing, and the
first is simpler and has no second thing to remember.

### A bash function called before its definition is a command not found, and the run had already logged three normal lines by then
**Tag:** infra
**ERROR:** the AUT-21 drift block was first inserted into `scripts/poc/run.sh`
after the `EXTRACT-END checkpoint` fence, at line 465, while its call site sat at
line 387. `bash -n` passed, because parsing a script does not resolve function
names. The failure would only have appeared at 22:00, in a scheduled run, as
`drift_detect: command not found` on a line that had already logged three
ordinary-looking lines above it.
**SOLUTION:** the block moved up beside the deadline helpers, before every call
site, with a comment at the call site saying why the definition is not next to it.
RULE: in a long shell script, `bash -n` proves syntax and proves nothing about
order. A block that defines functions goes above its first caller, and the check
that catches a violation is running the thing, not parsing it.

### The one permitted secrets read answered the question the card was asking, and the answer was that the card was wrong
**Tag:** data
**ERROR:** APPLY-02 said six merged migrations, 0028 to 0033, had never been
applied to production, and named itself the single deciding cause for all nine
phase 3 launch conditions reading 0 of 9. Building it would have meant running an
applier against production. `applied_ledger_version()` over PostgREST, read-only,
answered `"0034"`, and the health route answered `"0034"` independently. All six
were live, applied by the Supabase GitHub integration that R-124 documents, and
the pending register was already empty. The card was authored the same day R-124
landed and its notes quote the sentence R-124 disproved.
**SOLUTION:** two read-only calls, before any write path was opened, turned a
production-touching card into a blocked one with the evidence on it. RULE, and it
is the second time this file records it: **before acting on a card that says
something about production, ask production.** The repository says what should be
applied; only the database says what is. The read costs one HTTP request and the
permitted secrets read that CLAUDE.md 8.3 already grants for exactly this work.
### `$(extract ...)` runs the extractor in a subshell, so its hard failure became seventeen soft ones
**Tag:** ci
**ERROR:** `scripts/poc/test-harness-caps.sh` lifts fenced blocks out of
`run.sh` with `SELECTION=$(extract work-selection)`. The `extract` helper calls
`exit 1` when the fence is missing, which is correct, but command substitution
runs it in a **subshell**: the exit killed the subshell, `SELECTION` came back
empty, `source ""` failed, and all eleven cases then failed one by one against
nothing. Run against the pre-change `run.sh` the output was `17 assertion(s)
failed` with no line saying the fence was gone.
**SOLUTION:** the caller checks that the extraction produced a non-empty file and
fails hard with the fence named. `scripts/poc/test-pr-census.sh` already carried
this warning in its own header, having hit it first, and the fix there was to have
`extract` write to a path the caller already knows and return a status. RULE: a
helper whose failure mode is `exit` cannot be called through `$(...)`. Either it
returns a status and writes to a known path, or the caller checks the result. A
lesson recorded in one test file is not a lesson until the next test file that
needs it has it too.

### The GitHub API says DIRTY where the documentation says CONFLICTING
**Tag:** ci
**ERROR:** AUT-22 asks a run to prefer an inherited pull request whose
`mergeStateStatus` is `BEHIND` or `CONFLICTING`. `CONFLICTING` is the name in the
field's documentation. The value the API actually returns for a pull request that
conflicts with `main` is **`DIRTY`**, which this session saw directly: PR #214
reported `mergeStateStatus DIRTY` and `npm run checks:state` printed it. A
selection matching only the documented name would have compiled, passed a test
written from the same documentation, and never fired in production.
**SOLUTION:** both strings are accepted and each has its own case. RULE: when a
card names an API value, check what the API returns before matching on it. The
documentation names the concept; the wire names the value, and only one of those
is what the code will meet.

### Two lists that agree today are one credential surviving tomorrow
**Tag:** infra
**ERROR:** `scripts/poc/responder.sh` stripped ten credential names from its model
child with `env -u`, written out at the call site. `scripts/poc/run.sh` needed the
same strip at its own `claude -p` and had none at all: every scheduled EXECUTOR
carried every credential in the secrets file, four times a night, whether or not
that run went near a database. The obvious fix was to copy the responder's line
into `run.sh`, which would have been two lists agreeing on the day they were
written and drifting apart every day after. The failure mode of that drift is a
credential quietly surviving in one process while the other is clean, and nobody
notices because both look right in isolation.
**SOLUTION:** `scripts/poc/secret-names.sh` holds the list once, both scripts
source it from their worktree, and the responder's inline copy is **deleted**
rather than left beside it. `npm run check:executor-env` asserts both call sites
go through the shared list AND that neither carries an inline `env -u NAME -u`
sequence any more. RULE, and this repository has now paid for it three times
(AUT-16's path lists, AUT-21's manifest, this): a list that two scripts need is a
file, never a paragraph in each of them. The check that makes it stick is the one
that refuses the second copy, not the one that verifies the first.

### A check that reads a list and compares it to another list proves the two lists agree
**Tag:** ci
**ERROR:** the obvious shape for "the model process does not carry these
credentials" is to read the strip list and assert the expected names are on it.
That passes whenever the two lists match, including when the strip is never
applied, when the call site was reverted, and when `env -u` was handed no
arguments at all.
**SOLUTION:** `check:executor-env` **runs the strip**. Every name on the list is
set to a dummy value in the checking process, `printenv` is spawned as the child
in place of `claude` through the same `env -u` arguments, and what comes back is
what the model would have carried. Three further assertions close the ways it
could still pass while measuring nothing: the child must report a **non-empty**
environment, the argument count must be exactly two per name, and the check drops
one name from its own arguments and requires that name to **reach** the child.
RULE: a check about what a process carries spawns a process. Anything else is a
statement about the source, and the source is not where the failure lives.

### A save path that rebuilds an object from a literal deletes every field nobody remembered
**Tag:** frontend
**ERROR:** the board portal's card modal built its saved card as a fresh object
listing the eleven fields the modal edits. Every other field on the card was
therefore **deleted on save**: `plain`, `depends_on`, `acceptance`, `defaults` and
`question`. Saving one card in the portal and pasting the export back produced a
board `docs/board/validate-board.mjs` rejects, and **the in-app validator reported
it clean**, because it did not check those five either. The portal's whole purpose
is to tell the reader whether a paste-back would pass, and it was answering about
a card it had just emptied.
**SOLUTION:** the save path merges: `nextCardFrom(existing, edits)` clones the old
card and overwrites the edited keys. RULE: **the fix for a dropped field is never
to list the field.** Enumerating the five missing today fixes today and breaks
again the next time the contract grows a field, which is exactly how this
happened. A merge is correct for every field that will ever exist. The same rule
caught the in-app validator: it now checks the five, so the two validators agree
about what a committable card is.

### Proving a browser file under node needs a seam, and the seam is one branch at the bottom
**Tag:** ci
**ERROR:** `docs/board/board-app.js` is an IIFE that reads its seed from the DOM
at load, attaches listeners, and boots. Nothing escapes the closure, so a check
could not call its save path at all. Loading it under node with a `document` stub
got as far as `render()` and died on `Cannot set properties of null (setting
'innerHTML')`, which proves nothing about any field.
**SOLUTION:** the file's last statement branches on `typeof module`: under node it
exports its functions and does not boot; in a browser `module` does not exist, so
the rendered page takes the else branch and boots exactly as before. The file is
inlined verbatim into the artifact, so **the thing the check drives is the thing
that ships**. RULE: a check for a browser file drives the real file behind a
guarded export, never a copy of its logic. And a second rule the same card
produced: **when the pre-change file cannot be driven at all, assert on its
source** for the one thing that can be read there. Here that is a single
assignment, `var next =`, and whether it is an object literal; against the old
file that names all five dropped fields, where a bare "did not load" would have
proved only that the file changed.
### A timestamp read from the previous timestamp drifts, and nobody wants to be the one who moves it back
**Tag:** data
**ERROR:** the phase 3 board's `as_of` ran 3, 21, 62, 150, 226, 300, 398, 467,
521, 557 and 554 minutes ahead of the commit that carried it, across eleven
consecutive commits. Every session set it by reading the PREVIOUS `as_of` and
moving it forward a little, because correcting it makes the number jump backwards
on a board whose whole purpose is to say when it last told the truth. No session
wanted to be the one that moved it back, so each added to the error. By the end
the board claimed it had been updated nine hours before it actually was.
**SOLUTION:** `npm run check:board-clock` refuses any board timestamp ahead of the
commit that wrote it: sixty minutes of slack on `as_of`, because a board is
written before it is committed, and **zero** on every per-card `last_checkpoint`
and `evidence.at`, because a checkpoint in the future has no honest reading. The
bound is one-directional: only *ahead* is an error, so honest commits are never
caught and the threshold never has to be loosened. RULE: **a field whose next
value is computed from its previous value is a field that drifts.** The fix is
never a tolerance and never deleting the field; it is a check that compares it
against something outside itself, which here is git.

### The session that built the drift check committed the drift twice while building it
**Tag:** data
**ERROR:** the first run of `check:board-clock` against `main` found exactly one
violation, and it belonged to the session that had just written the check:
`AUT-9.last_checkpoint = 2026-09-05T19:10:00Z`, a round number chosen by hand, 30
minutes ahead of its own commit. The second was on a still-open pull request from
the same session: `as_of`, `last_checkpoint` and `evidence.at` all at
`2026-09-05T20:30:00Z`, **109 minutes ahead**. Both were written after reading the
card that describes this exact failure.
**SOLUTION:** both corrected, the historical one to the commit time of the commit
that wrote it and the in-flight one to a real clock, each with a note on the card
saying it was corrected and from what. RULE, and it is about people and not about
code: **a round number in a timestamp field is a number nobody read.** `19:10:00Z`
and `20:30:00Z` are not clock readings. If a value ends in `:00:00Z` and was not
copied from something, it was invented. The second rule is the one the correction
notes enforce: **a corrected value that presents itself as always having been
right teaches the next reader nothing.**
