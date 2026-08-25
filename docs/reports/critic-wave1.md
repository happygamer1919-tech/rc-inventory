# CRITIC - Wave 1 boundary review

**Role:** CRITIC
**Date:** 2026-08-26
**Scope:** P2-01 through P2-07, all seven shipped. Production at
`https://www.rapidconstructmd.com`.
**Method:** every acceptance line re-run as written, live schema read read-only
under R-001, and a defect hunt driven from the browser and from the API rather
than from the code.

Evidence for every claim below is under the session scratchpad at
`critic-wave1/`: `dz-www.json`, `probe.log`, `probe2.log`, `sweep.log`,
`live-schema.txt`, `shots/`.

---

## 1. Defect zero: production login

**Verdict: PASS on the client domain. NOT VERIFIABLE on the vercel.app host.**

| Step | Result | Evidence |
|---|---|---|
| apex over HTTPS | 308 to `www`, certificate valid | `curl -w %{ssl_verify_result}` = 0 |
| `www` root | 200, lands on `/autentificare` | `dz-www.json` step `root` |
| Romanian login screen renders | yes, `login-form` visible, copy Romanian with diacritics | `shots/www-...-02-login.png` |
| owner signs in | lands on `/`, topbar reads `Administrator` | `shots/www-...-03-owner-dashboard.png` |
| owner opens `/setari` | 200, no forbidden screen | `shots/www-...-04-owner-setari.png` |
| owner signs out | back to `/autentificare` | `shots/www-...-05-owner-signout.png` |
| account_manager signs in | lands on `/`, topbar reads `Operator` | `shots/www-...-03-account_manager-dashboard.png` |
| account_manager at `/setari` | 200, Romanian forbidden screen, URL stays `/setari` | `shots/www-...-04-account_manager-setari.png` |
| account_manager signs out | back to `/autentificare` | `shots/www-...-05-account_manager-signout.png` |
| protected route after sign out | redirects to `/autentificare` | `dz-www.json` step `post-signout-protected` |
| console errors across the run | 0 | `dz-www.json` step `console` |

The vercel.app host could not be exercised. The project alias
`rc-inventory-ivan-bong-420-s-projects.vercel.app` answers 302 to
`vercel.com/sso-api` for any client that is not signed in to the Vercel team,
because Vercel Deployment Protection is on for it. A headless browser therefore
never reaches the application. Two consequences worth carrying forward:

- The bare `rc-inventory.vercel.app` is a different owner's project, not this
  one. Anyone testing that host is testing someone else's site.
- P2-12's defaults say "THE OLD vercel.app HOST KEEPS WORKING and is not
  redirected away in this card". As of today it does not work for anyone outside
  the Vercel team, so that fallback does not exist. P2-12 should either turn the
  protection off deliberately or drop the assumption.

---

## 2. Acceptance re-run, P2-01 to P2-07

All seven pass, and all seven are machine-checkable as written. See the table in
the session report handed to the owner.

Two observations that are not failures but are worth recording:

- **P2-07's evidence names the wrong run.** The card cites run `32885233792`,
  which is the run for `f5dfb07`. The head sha of PR #12 at merge was `ebb709d`.
  A run does exist for that head sha, `32885909149`, it concludes success, and
  its job ran all fifteen steps including `End to end`, so the merge was
  legitimately green and the acceptance holds. The recorded reference is simply
  one commit behind, and a stranger following the acceptance line ("the run URL
  for the PR head sha") would not find the run it names.
- **P2-06's acceptance claims coverage the test does not have.** See CRIT-14.

---

## 3. Journal versus live schema

**No drift.** Read-only, `information_schema` and the catalog only,
`default_transaction_read_only = on` on every statement, connectivity proven
with `SELECT 1` before anything else per CLAUDE.md 8.4.

| Object | Journal claims | Live | Missing | Extra |
|---|---|---|---|---|
| tables | 11 | 11 | none | none |
| enums | 6 | 6 | none | none |
| enum labels | as journalled | identical, same order | none | none |
| functions | 8 | 8 | none | none |
| policies | 44 | 44 | none | none |
| triggers | 7 | 7 | none | none |
| explicit indexes | 13 | 13 | none | none |
| all indexes | 13 explicit | 30 | none | 17 implicit, from primary key and unique constraints in 0001 |
| storage buckets | 1 (`rc-docs`) | 1, private, 10 MB, pdf/png/jpeg | none | none |
| RLS enabled | 11 statements | 11 of 11 tables | none | none |
| tables with zero policies | 0 | 0 | none | none |

The 17 extra indexes are not drift. They are the indexes PostgreSQL creates for
the primary key and unique constraints declared in 0001, and the P2-01 journal
already counted them ("INDEXES 30, 13 explicit plus primary key and unique
constraint indexes").

Grants, checked through `pg_class.relacl` rather than
`information_schema.role_table_grants`, which under-reports for a non-superuser:
all 11 tables carry both `authenticated` and `service_role`, which is migration
0005 doing its job. **`anon` holds no table grant at all**, which is the correct
posture and is what makes the anonymous reads below fail closed.

---

## 4. What the defect hunt proved sound

Recorded because a boundary review that only lists failures is not a review.

**Auth edges.**
- Unauthenticated request to any protected route: redirect to `/autentificare`.
- Corrupted session cookie: clean redirect to login, 200, zero page errors, no
  stack trace on screen.
- Session revoked elsewhere (`signOut({scope:'global'})`): the next request is
  ejected to login immediately. `proxy.ts` calls `getUser()`, which validates
  against the auth server, so a revoked session does not linger until the access
  token expires. This is the difference between `getUser` and `getSession` and
  it is worth the round trip.
- Role header spoof: a manager sending `x-rc-role: owner` still gets the
  forbidden screen. The proxy overwrites the header from the database on every
  request, so the header is output, never input.

**RLS, verified with real sessions rather than by reading the policies.**
- Anonymous client, all 11 tables: `42501` on every select and on insert. Zero
  rows, zero leaks.
- An unparseable bearer token: `PGRST301`, refused.
- account_manager sees exactly one row in `profiles`, its own. The owner sees
  two. `profiles_select` is `(id = auth.uid()) OR is_owner()`, and it holds.
- account_manager writes to `products`, `categories`, `units` and `profiles`:
  all refused, either `42501` or zero rows affected.
- account_manager attempting to promote itself to `owner`: refused, role
  unchanged afterwards.
- The refusals are at the database, not only in the UI, which is what G2
  requires.

**Stock math.**
- 129 products carry movement, from 129 batch rows and 36 outbound lines.
- `product_available_stock` matches a hand-computed `sum(batches) -
  sum(outbound_lines)` for **every** one of them. Zero mismatches.
- Zero products at negative stock.
- Zero outbound lines against a product with no batch.
- A batch cannot be conjured: `batches.inbound_order_id` and
  `batches.order_line_id` are both NOT NULL with foreign keys, so stock can only
  enter through the inbound path. A direct insert fails `23502`.
- `outbound_lines_quantity_positive` and `batches_quantity_positive` close the
  negative-quantity route, which would otherwise have inflated stock through the
  subtraction in `product_available_stock`.

**Concurrency, tested live rather than reasoned about.**
- Two simultaneous issues of the entire stock (10 of 10), fired from two
  different sessions: exactly one succeeded, stock landed at 0, never negative.
- Two simultaneous issues that each fit alone but not together (6 and 6 against
  10): exactly one succeeded, stock landed at 4.
- The `pg_advisory_xact_lock` in migration 0004 does what its comment claims.

**Romanian copy.** Every application string on all eight screens is Romanian
with correct comma-below diacritics. No cedilla-form characters. No English
leaked from Supabase. No NaN, no Infinity, no stray `undefined`. No clipped or
truncated text at 1440x900. The English words the scan flagged
(`stock`, `edit`, `create`) are all inside e2e test data SKUs, not UI copy,
which is CRIT-11 rather than a copy defect.

**Empty states.** Present and Romanian where reachable: filtered catalog
("Niciun produs nu se potrivește"), categories, inbound list, outbound list,
thresholds, sent alerts, dashboard, per-product batches and movements. The
list-level ones cannot be rendered on production today because the lists are not
empty, which is itself CRIT-11.

**Console.** Zero console errors, zero page errors and zero HTTP 4xx/5xx across
all eight routes, for both roles.

---

## 5. Taste items

Not defects. No card, recorded so the decision is deliberate rather than
forgotten.

1. **`/iesiri` is a form with no list.** Issues appear on `/comenzi`, so an
   operator who has just created a bon has to change screen to see it. Defensible
   (P2-05 scoped it that way) but it is an extra click on the most repeated
   action in the warehouse.
2. **Reference numbers are computed from the current maximum.** Two operators
   creating an issue in the same second can generate the same `IES-YYYY-NNNN`.
   The unique constraint catches it and the Romanian message says to try again,
   so nothing corrupts, but the operator is shown a failure that is not theirs. A
   sequence would remove the case entirely.
3. **The session cookie is readable from page JavaScript.** `httpOnly` is false
   because `@supabase/ssr`'s browser client has to read the session, so this
   cannot be fixed without leaving the library. Naming it so it is an accepted
   risk rather than an oversight. The `secure` flag is a different matter and is
   CRIT-13.
4. **`components/ui/Placeholder.tsx` is dead code.** No route renders it since
   P2-06. It still says "Ecran în construcție".
5. **The catalog renders every product in one table.** 128 rows today, fine.
   There is no pagination, so this screen degrades as the real catalog grows.
6. **No password recovery path.** The login screen says to contact the
   administrator. Deliberate, since there is no signup page and accounts are made
   by hand, but it means a forgotten password is a support call to Ivan.
7. **The default Next.js 404 is English** ("This page could not be found"). Not
   raised as a card because P2-11 already names Romanian 404 and 500 pages in its
   scope.
8. **No CSP, X-Frame-Options, X-Content-Type-Options or Referrer-Policy** on
   production responses; only HSTS, which comes from Vercel. Not raised as a card
   because P2-11 already names security headers in its scope.

**Taste item count: 8.**

---

## 6. Cards raised

| id | title | severity |
|---|---|---|
| CRIT-10 | Login form submits natively before hydration and puts the password in the URL | critical |
| CRIT-11 | The e2e suite writes into the production Supabase project | high |
| CRIT-12 | Production chrome still claims the data is a phase 1 preview | high |
| CRIT-13 | Session cookie is written without the Secure attribute | medium |
| CRIT-14 | P2-06 acceptance claims an empty-database case the spec never runs | medium |
