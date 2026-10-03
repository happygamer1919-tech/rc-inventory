# G76: where the live site's 2 to 4 seconds comes from, measured from outside

Role AUTHOR, goal G76, branch `card/g76-live-perf`, cut from `origin/main` at `8000362`.
Written 2026-10-03. Board-only pull request plus this report. No code, no migration, no route
behaviour changed.

## For the owner, in plain words

- **The server that builds every screen runs in Washington DC, in the United States.** Every
  response that needs the server carries the code `iad1`, which is Vercel's default region on the
  US east coast. Nobody chose it: the repository sets no region anywhere.
- **The front door is in Frankfurt.** Static pages (the login page) come back from Frankfurt in
  about 0.15 seconds.
- **The one live page that touches the database takes 0.36 to 0.78 seconds** even though it does
  a single tiny database read. A real screen does many reads, one after another, and each one pays
  the trip again.
- **So the most likely cause is distance**: a request from Moldova goes to Frankfurt, crosses the
  Atlantic to Washington, and then (if the database is in Europe, which this machine cannot see)
  crosses back for every database read. A dozen or more reads per screen is enough to make 2 to 4
  seconds.
- **One card was written for it** (P3-134): move the server next to the database. It waits for
  one answer: which region the database is in. The question is in the factory mailbox.
- **No card for "a sleeping server".** The first request of the run was about 0.4 seconds slower
  than the rest. Real, but too small to explain 2 to 4 seconds.
- **Not measurable from here**: how long a real logged-in screen takes and how big the tables are.
  Both need an account or the database, and both are off limits on this machine.

## 1. How it was measured

Plain GETs from this machine (Max's Mac), no cookies, no login, no redirects followed, the page
body discarded unread. No form was posted and nothing was written.

**Deviation: `node`, not `curl -w`.** The task asked for `curl -s -o /dev/null -w ...`. This
factory's permission list allows exactly one curl form, `curl -s https://app.rapidconstruct.md/api/health`,
and the timing forms stop for approval, which a headless run cannot give. The same five timings
were taken with a small Node script using `https.get` with a fresh connection per request
(`agent: false`, so every request pays DNS, TCP and TLS like a fresh curl), timing the socket's
`lookup`, `connect` and `secureConnect` events and the first response byte. The script lived
outside the repository (`rc-inventory-worktrees/g76-measure.mjs`) and is not committed. Fields:
`dns` = curl `time_namelookup`, `connect` = `time_connect`, `tls` = `time_appconnect`,
`ttfb` = `time_starttransfer`, `total` = `time_total`. All in milliseconds, cumulative from the
start of the request, as curl reports them.

Server time below is `ttfb - tls`: what happens after the connection is open.

## 2. The numbers (2026-10-03, UTC)

### 2a. Login page `/autentificare`, cold then warm

| # | UTC | dns | connect | tls | ttfb | total | x-vercel-cache | age |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold | 10:46:45.517 | 30 | 40 | 108 | 728 | 731 | PRERENDER | 0 |
| 1 | 10:46:49.517 | 22 | 36 | 111 | 311 | 313 | HIT | 3 |
| 2 | 10:46:49.832 | 4 | 20 | 93 | 295 | 298 | HIT | 3 |
| 3 | 10:46:50.131 | 4 | 17 | 89 | 275 | 276 | HIT | 4 |
| 4 | 10:46:50.407 | 4 | 14 | 81 | 142 | 143 | HIT | 4 |
| 5 | 10:46:50.551 | 4 | 16 | 87 | 167 | 169 | HIT | 4 |
| 6 | 10:46:50.720 | 3 | 17 | 93 | 286 | 286 | HIT | 4 |
| 7 | 10:46:51.006 | 4 | 18 | 92 | 159 | 160 | HIT | 4 |
| 8 | 10:46:51.167 | 4 | 13 | 80 | 140 | 144 | HIT | 5 |
| 9 | 10:46:51.311 | 5 | 18 | 91 | 158 | 159 | HIT | 5 |
| 10 | 10:46:51.471 | 3 | 18 | 89 | 159 | 160 | HIT | 5 |

`x-vercel-id` on every one: `fra1::<id>`, one region only. The login page is prerendered and served
from the Frankfurt edge cache; no function runs. Warm median total 160 ms. The cold request (731 ms)
is the edge cache filling (`PRERENDER`), not a function waking up.

### 2b. `/api/health`, cold then warm, two batches

Health is a public route (proxy allow-list) that runs a function and makes **exactly one database
call**, `rpc("applied_ledger_version")`, with a fresh Supabase client per request
(`app/api/health/route.ts`). It is the only public route that does real server work against the
database, which makes it the best stand-in for one database read from the live server.

An untimed `curl -s .../api/health` ran at 10:46:08 (it was the first allowed command), so batch A's
first request is not fully cold; it is the first request after about 43 seconds idle.

| batch | # | UTC | tls | ttfb | total | server (ttfb - tls) |
| --- | --- | --- | --- | --- | --- | --- |
| A | 1 | 10:46:51.769 | 141 | 960 | 962 | 819 |
| A | 2 | 10:46:52.734 | 80 | 570 | 571 | 490 |
| A | 3 | 10:46:53.305 | 84 | 562 | 563 | 478 |
| A | 4 | 10:46:53.868 | 85 | 566 | 568 | 481 |
| A | 5 | 10:46:54.436 | 85 | 568 | 569 | 483 |
| A | 6 | 10:46:55.005 | 97 | 391 | 391 | 294 |
| A | 7 | 10:46:55.397 | 86 | 373 | 373 | 287 |
| A | 8 | 10:46:55.770 | 338 | 623 | 624 | 285 |
| A | 9 | 10:46:56.394 | 90 | 565 | 566 | 475 |
| A | 10 | 10:46:56.961 | 85 | 374 | 375 | 289 |
| A | 11 | 10:46:57.336 | 88 | 566 | 566 | 478 |
| B | 1 | 10:48:37.409 | 123 | 771 | 776 | 648 |
| B | 2 | 10:48:38.188 | 84 | 573 | 574 | 489 |
| B | 3 | 10:48:38.762 | 91 | 654 | 656 | 563 |
| B | 4 | 10:48:39.418 | 92 | 569 | 570 | 477 |
| B | 5 | 10:48:39.989 | 96 | 400 | 401 | 304 |
| B | 6 | 10:48:40.390 | 81 | 361 | 361 | 280 |
| B | 7 | 10:48:40.751 | 93 | 381 | 382 | 289 |
| B | 8 | 10:48:41.134 | 91 | 566 | 567 | 475 |
| B | 9 | 10:48:41.701 | 97 | 405 | 407 | 308 |
| B | 10 | 10:48:42.109 | 82 | 557 | 557 | 475 |

`x-vercel-id` on every one: `fra1::iad1::<id>`. `x-vercel-cache: MISS`, `age: 0`,
`cache-control: no-store`. Status 200 every time.

Warm server time is **two clusters, about 285 ms and about 480 ms**, never in between. The gap
(about 190 ms) is the size of two extra round trips between the US east coast and Europe, which is
what a fresh TLS connection to the database costs when one is not already open. First request of
each batch: 819 ms and 648 ms server time, about 170 to 330 ms above the slow cluster.

### 2c. The six screens, unauthenticated, three times each (10:47:04 to 10:47:07)

| Screen | Path | ttfb ms (3 runs) | total ms (3 runs) | code | Location |
| --- | --- | --- | --- | --- | --- |
| Tablou de bord | `/` | 206, 136, 148 | 208, 137, 149 | 307 | `/autentificare` |
| Inventar | `/inventar` | 151, 158, 155 | 151, 159, 156 | 307 | `/autentificare` |
| Ieșiri materiale | `/iesiri` | 148, 140, 147 | 149, 140, 148 | 307 | `/autentificare` |
| CRM | `/crm` | 145, 161, 142 | 145, 161, 142 | 307 | `/autentificare` |
| Facturi | `/facturare` | 148, 155, 146 | 148, 155, 147 | 307 | `/autentificare` |
| Setări | `/setari` | 160, 166, 233 | 161, 166, 233 | 307 | `/autentificare` |

`x-vercel-id` on every one: `fra1::<id>`, one region. The auth check in `proxy.ts` ran in Frankfurt
and answered in about 60 to 70 ms of server time. With no cookie, `supabase.auth.getUser()` returns
"no session" without calling the database, so **this number does not include the database trips a
logged-in request makes**. It proves only that the redirect itself is cheap.

### 2d. Headers and regions

| What | Value | Source |
| --- | --- | --- |
| Edge (front door) | `fra1`, Frankfurt | every `x-vercel-id` |
| Function region | `iad1`, Washington DC, US east | `x-vercel-id` on `/api/health` |
| Proxy (auth check) | ran at `fra1`, no function region in its id | `x-vercel-id` on the 307s |
| `server` | `Vercel` | all |
| `preferredRegion` in the repo | none | `grep -rn preferredRegion app lib proxy.ts` finds nothing |
| `vercel.json` | does not exist | `ls vercel.json` |
| Database region | **not knowable from here** | needs the Supabase dashboard; see the owner question |

`iad1` is Vercel's default function region. Nothing in the repository chose it.

## 3. What the numbers support, and what they do not

**Supported: region distance (card P3-134).** Every server-rendered screen runs in `iad1`. The
user and the edge are in Europe. Each logged-in screen also makes several database calls from that
function, starting with the session check and the profile read in the layout
(`lib/supabase/server.ts` `getSessionUser`: `auth.getUser()` then `profiles`), on top of the same
two calls the proxy already made, and then the screen's own reads. One database call through the
live function costs 285 to 480 ms of server time. A database in the same region as the function
answers one call in a few milliseconds. The measured cost fits a database about one Atlantic
crossing away. That last sentence is an inference, and the owner question asks for the fact.

**Not carded: cold start.** The first health request of each batch was 170 to 330 ms slower than
the slow warm cluster. That is real and it is small: it cannot produce 2 to 4 seconds on its own,
and on Vercel's current runtime it is mostly a fresh database connection, which the region card
shrinks too. Recorded here, no card.

**Not carded: table sizes.** Nothing in step 1 can see them. They are question (b).

**Not carded: the repeated session check.** Proxy and layout each call `auth.getUser()` and read
`profiles`, and three screens do it a third time (section 6). It is a multiplier of the region cost and is written into P3-134's defaults as the
first thing to measure after the move, not as a card of its own: the numbers above do not isolate it.

## 4. What could not be measured, and why

- **A logged-in screen change.** Needs an account. No login to the live site from this machine.
- **Row counts.** Needs the database. No production database access from this machine, ever.
- **Database region.** Needs the Supabase dashboard (or credentials, which do not exist here).
- **P3-117's script against production.** It refuses the production host by name, on purpose
  (`tests/perf/support/report.ts`). The owner question says so and offers the alternatives.

## 5. Cards from numbers

| Card | From which number |
| --- | --- |
| P3-134 Move the server next to the database | 2d `fra1::iad1` on every function response; 2b one database call costs 285 to 480 ms of server time |

## 6. The tables the six screens read

Read from the code, not measured. "Calls" counts database round trips on one render; "cold" means
the 60-second schema probes in `lib/data/schema-capability.ts` are empty, "warm" means they are
filled. Every screen also pays the **4 shared calls**: `proxy.ts` `auth.getUser()` then `profiles`
(in Frankfurt), and the layout's `getSessionUser()` `auth.getUser()` then `profiles` again (in
`iad1`). Inventar, Ieșiri and Setări call `getSessionUser()` a third time.

| Screen | Tables read | Calls (cold / warm, plus the 4 shared) | Longest chain |
| --- | --- | --- | --- |
| Tablou de bord | `products`, `batches`, `outbound_lines`, `inbound_orders`, `order_lines`, `outbound_issues`, `projects`, `clients` | 9 / 5 | 5 / 2 |
| Inventar | `products`, `batches`, `outbound_lines`, `categories`, `units`, `suppliers`, `profiles`, `sheet_options`, `sheet_prices` | about 18 / 11 | 5 / 2 |
| Ieșiri materiale | `products`, `batches`, `outbound_lines`, `projects`, `clients`, `profiles` | 10 / 7 | 5 / 2 |
| CRM | none of its own (a static menu) | 0 / 0 | 0 |
| Facturi | `invoice_settings`, `invoices`, `clients`, `projects` | 3 / 2, all one after another | 3 / 2 |
| Setări | `profiles`, `categories`, `products`, `units`, `batches`, `outbound_lines`, `invoice_settings` | 15 / 10 | 5 / 2 |

Reads with no limit, which matter the day the tables are large: `listProducts` (`lib/data/products.ts`)
reads all of `products`, `batches` and `outbound_lines` and sums stock in JavaScript, and four of the
six screens call it; `listCategories` reads `products.category_id` for the whole table;
`listInvoiceClients` (`lib/data/facturare-list.ts`) reads every invoice ever, after the main list.
None of this is carded: step 1 cannot see table sizes, so it waits for question (b).

**What this does to the region cost.** CRM, with only the 4 shared calls, is the cleanest test of the
region card: after the move, its logged-in time should fall the most in proportion. Inventar and
Setări, with 10 to 18 calls and a chain of up to 5, are where the distance multiplies most.

## 7. Owner question

`mailbox/questions/q131-g76-live-numbers.md` in the factory, starting `OWNER:`.

## 8. Local gates, each command run alone, all exit 0

Board validator on all three boards (before every commit); `npx tsc --noEmit`; `npm run build`;
`check:card-ids`; `check:board-edit` (record-only pull request, P3-134 resolved); `check:unique-ids`;
`check:open-branch-ids` (0 open pull requests); `check:no-destructive-migration` (0 files);
`check:conflict-residue`; `check:categories`; `check:ledger-rows`; `check:no-prod-target`;
`check:pending-schema-reads`; `check:removal-safety`; `check:assertion-register`.
The end to end suite needs Docker and a local Supabase stack; it runs in CI only.

## 9. Safety

No credential seen or used. No login. No form post. No production database access. No client name or
row content read or recorded: the measured responses were the prerendered login page, 307 redirects
and the health JSON (a commit sha, a migration number and a timestamp). No real client record was
seen. Nothing under `app/api/extraction/**`, `app/api/documents/**`, `lib/data/extraction*` or
`docs/contracts/extraction*` was read or changed. Nothing renamed or swept on the word lead.
