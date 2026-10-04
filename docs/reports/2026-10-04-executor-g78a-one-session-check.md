# P3-135: one session check per request (goal G78a)

Role AUTHOR then EXECUTOR, one pull request. Date 2026-10-04.

## In plain words

Each screen used to check who you are two or three times before showing anything:
once at the door (the proxy), once in the frame around every screen (the layout),
and once more in most screens. Each check is two trips to the database side. Now the
door checks once and hands a sealed note to the rest of the request, so the frame
and the screen do not ask again. Nobody can fake the note: it is signed with a key
only the server has, and it expires after a minute. Without a valid note, the old
full check runs exactly as before. Who can see what does not change.

## Where the reads were (before, on origin/main a92cd85)

| Place | file:line | Calls |
|---|---|---|
| Proxy, every request | `proxy.ts:131` `auth.getUser()`, `proxy.ts:159` `from("profiles")` | 2 |
| App layout, every logged-in screen | `app/(app)/layout.tsx:19` `getSessionUser()`, which runs `lib/supabase/server.ts:46` `auth.getUser()` and `lib/supabase/server.ts:50` `from("profiles")` | 2 |
| Screens that call `getSessionUser()` again | `app/(app)/azi/page.tsx:28`, `clienti/page.tsx:56`, `clienti/[id]/page.tsx:70`, `iesiri/page.tsx:27`, `incarca-comanda/page.tsx:35`, `inventar/page.tsx:31`, `memento/page.tsx:57`, `proiecte/page.tsx:29`, `proiecte/[id]/page.tsx:91`, `sarcini/page.tsx:75`, `setari/page.tsx:98` | 2 more each |
| Panel loaders (server actions on open) | `lib/data/outbound-detail.ts:17`, `lib/data/inbound-detail.ts:12`, `lib/data/product-detail.ts:67` | 2 each, plus the proxy's 2 for the action request |

The G76 report said "three screens" repeat the read. On main today it is eleven
screens: every one listed above calls `getSessionUser()` beside the layout.

## What changed

1. `lib/supabase/server.ts`: `getSessionUser()` is wrapped in React `cache()`. The
   layout and the screen render in the same request and now share one result. In a
   server action or a route handler `cache()` stores nothing and the function runs as
   before.
2. `lib/supabase/session-handoff.ts` (new): signs and verifies the handoff header
   `x-rc-session` with HMAC SHA-256, keyed from `SUPABASE_SERVICE_ROLE_KEY` (a server
   secret already required in every environment, `lib/env-required.ts`), with a
   message prefix of its own and a 60 second expiry. Verification uses
   `crypto.subtle.verify` (constant time) and checks the shape: id, a known role,
   email and name as string or null.
3. `proxy.ts`: the one profile read now selects `role, active, email, full_name`
   (same single call, two more columns). On the pass-through branch only, after every
   redirect, rewrite and role check has run unchanged, the proxy deletes any
   client-sent `x-rc-session` and sets a signed one. Redirect and rewrite branches set
   nothing.
4. `getSessionUser()` first verifies that header. Valid: it returns the handed-over
   user with zero calls. Absent, expired, malformed or wrongly signed: the full check
   (`auth.getUser()` then `profiles`, refuse an inactive or missing profile) runs as
   before, unchanged.

## Why the proxy's read could be shared safely

A request header can be sent by anyone, and a path excluded by the proxy matcher
(for example a URL ending in `.png`) reaches the render without passing through the
proxy. An unsigned header would therefore be a role escalation. The signature closes
that: a client has no key, so a forged or edited header fails verification and falls
back to the full check. The layout's "second defence" stays: when the proxy did not
run, there is no valid header and the layout checks for itself.

## Nothing weakened

- `getUser()` is still the verifying call, in the proxy and in the fallback.
  `getSession()` is used nowhere.
- Every redirect and rewrite target and every role condition in `proxy.ts` is
  unchanged, line for line; only the select list and the header block were added.
- The layout still redirects to `LOGIN_PATH` when `getSessionUser()` returns null.
- The handed-over user is exactly what the proxy proved on this request: a verified
  token and an active profile row. A missing or inactive profile never reaches the
  pass-through branch, so it is never signed.
- The data reads still use the request's own cookie session under RLS; the handoff
  carries identity for the UI and action checks, not database rights.
- No e2e spec was edited. No migration.

## Calls per screen, before and after

Counted from the code, not instrumented: this machine has no database and no Docker.
"Calls" are auth-server plus database round trips for the session only; each screen's
own data reads are unchanged and not counted here.

| Screen | Before: proxy | Before: layout | Before: screen | Before shared | After: proxy | After: layout | After: screen | After shared |
|---|---|---|---|---|---|---|---|---|
| Tablou de bord (`/`) | 2 | 2 | 0 | 4 | 2 | 0 | 0 | 2 |
| Inventar | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| Ieșiri materiale | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| CRM | 2 | 2 | 0 | 4 | 2 | 0 | 0 | 2 |
| Clienți, Client | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| Proiecte, Proiect | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| Azi, Memento, Sarcini | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| Încarcă comandă | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| Facturi | 2 | 2 | 0 | 4 | 2 | 0 | 0 | 2 |
| Setări | 2 | 2 | 2 | 6 | 2 | 0 | 0 | 2 |
| Panel open (outbound, inbound, product) | 2 | n/a | 2 | 4 | 2 | n/a | 0 | 2 |

The shared calls drop from 4 (6 on the eleven repeating screens) to 2, the proxy's
own. If `SUPABASE_SERVICE_ROLE_KEY` were ever absent, the proxy signs nothing and the
render falls back to one cached full read: 4, still below the old 6.

## Proof of the signature locally

A throwaway script (not committed) imported `lib/supabase/session-handoff.ts` with a
dummy key and printed: round trip with Romanian diacritics in the name `true`; a token
with the role edited to owner and the old signature rejected `true`; a damaged
signature rejected `true`; garbage tokens rejected `true`; a token past its expiry
rejected `true`; the header value is plain ASCII `true`.

## Commands run locally (all exit 0)

`npx tsc --noEmit`, `npm run build`, `npm run check:card-ids`, `npm run check:unique-ids`,
`npm run check:open-branch-ids`, `npm run check:no-destructive-migration`,
`npm run check:conflict-residue`, `npm run check:categories`, `npm run check:ledger-rows`,
`npm run check:no-prod-target`, `npm run check:pending-schema-reads`,
`npm run check:removal-safety`, `npm run check:assertion-register`,
`npm run check:board-clock`, board validator. `npm run check:board-edit` passes once the
card is flipped to shipped in this pull request. The e2e suite and the P3-117 perf step
need the local Supabase stack and run only in CI.

## Not done here

- The unsigned `x-rc-role` and `x-rc-user-id` headers the proxy already set are read
  by nothing. They are left as they were: removing them is not this card.
