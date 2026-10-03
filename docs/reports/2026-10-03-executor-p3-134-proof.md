# P3-134 proof: production now runs in Dublin and the health read is 217 ms

Role EXECUTOR, card P3-134, branch `card/p3-134-proof`, cut from `origin/main` at `1f3e461`.
Written 2026-10-03. Board and report only. No code, no migration, no route changed.

## For the owner, in plain words

- **The move worked.** The server that builds the pages now runs in Dublin, next to the database in
  Ireland. All ten test requests came back stamped `dub1`. None came from Washington.
- **The database read is about 2.6 times faster.** The one-read health check went from 566 ms to
  217 ms (median of requests 2 to 10).
- **The login redirect did not change**, as expected. It runs at the Frankfurt edge and was already
  about 150 ms.
- **What this does not show:** how fast a real logged-in screen is. That needs a login and is not
  measurable from the factory machine. If the screens still feel slow, the next card is the number
  of database calls per screen.

## Acceptance

- (a) PASSED. Ten GETs of `/api/health`, status 200 each, every `x-vercel-id` is `fra1::dub1::<id>`.
- (b) PASSED. Median `time_total` of requests 2 to 10 is 217 ms, limit 300 ms, baseline 566 ms.
- (c) PASSED. The diff touches only `docs/`: no path under `app/`, `components/`, `lib/`, `proxy.ts`
  or `supabase/migrations/`.
- (d) Board validator exit 0 on all three boards.

## Method

Same as G76: Node `https.get`, `agent: false` (fresh DNS, TCP and TLS per request), body discarded,
no cookie, no login, no redirect followed. Deviation: the region was read from the same Node run
instead of ten separate `curl -D -` calls, because the factory allows only one curl form. The
script was `tmp-measure.mjs` in the worktree and is not committed. Same office machine as the
baseline. Run at 2026-10-03 23:25:59 to 23:26:10 UTC.

## /api/health, ten requests (ms)

| # | tls | ttfb | total | x-vercel-id |
| --- | --- | --- | --- | --- |
| 1 | 109 | 273 | 277 | fra1::dub1::hs2wm-... |
| 2 | 94 | 381 | 382 | fra1::dub1::bbrlj-... |
| 3 | 91 | 218 | 220 | fra1::dub1::nc2z9-... |
| 4 | 81 | 211 | 212 | fra1::dub1::gnzdn-... |
| 5 | 89 | 209 | 210 | fra1::dub1::zrk6t-... |
| 6 | 92 | 217 | 217 | fra1::dub1::p6snd-... |
| 7 | 92 | 235 | 235 | fra1::dub1::s9gbr-... |
| 8 | 80 | 207 | 208 | fra1::dub1::zfbl7-... |
| 9 | 90 | 225 | 226 | fra1::dub1::vhml8-... |
| 10 | 93 | 213 | 214 | fra1::dub1::fkm6r-... |

Median total of requests 2 to 10: **217 ms**.

## Before and after

| Measure | Before (G76, iad1) | After (dub1) |
| --- | --- | --- |
| Function region | iad1 (Washington) | dub1 (Dublin) |
| /api/health median total, requests 2 to 10 | 566 ms | 217 ms |
| /api/health first request | 776 to 962 ms | 277 ms |
| /api/health warm server time (ttfb minus tls) | 285 to 480 ms | about 120 to 145 ms |

## Six screens, unauthenticated, three runs (total ms)

All return 307 to `/autentificare` from the edge. This is the redirect, not the screen.

| Screen | Path | Before | After |
| --- | --- | --- | --- |
| Tablou de bord | `/` | 208, 137, 149 | 154, 142, 147 |
| Inventar | `/inventar` | 151, 159, 156 | 153, 149, 133 |
| Ieșiri materiale | `/iesiri` | 149, 140, 148 | 151, 152, 159 |
| CRM | `/crm` | 145, 161, 142 | 137, 158, 153 |
| Facturi | `/facturare` | 148, 155, 147 | 160, 138, 163 |
| Setări | `/setari` | 161, 166, 233 | 154, 159, 134 |

No change, as expected: these never reach a function.

## Extraction routes

The region applies to every function. No request or response changed, only latency, so Andre's side
was not told and does not need to be.
