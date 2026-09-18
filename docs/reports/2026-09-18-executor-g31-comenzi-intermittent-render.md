# EXECUTOR report, 2026-09-18: P3-77, the /comenzi "0 rows" in orderWithDocument (F16)

Role: AUTHOR (card P3-77), then EXECUTOR, one pull request (#330), branch `card/p3-77`.
Source: operator factory task 050, goal G31, Ivan's finding F16.

Boot status at start: phase 2 had 68 shipped, 32 todo and 2 blocked. Phase 3 had 92 shipped,
32 todo and 1 blocked. Neither board lists launch gates. The next eligible card by the board was
P3-14; this session worked P3-77 in the owner's queue order.

## In plain words

An automatic test sometimes claimed the orders list had lost a new order. In fact the whole page
had failed to load that one time. The test now says at once which of the two happened, with the
error code, so the real cause gets caught next time. Nothing changes in the app Rapid Construct
uses. No database change.

## The cause

`/comenzi` is a `force-dynamic` Server Component. It reads the list ONCE, on the server, and
nothing on the page reads it again (no polling, no client fetch). So once the page has loaded, the
DOM the test polls with `toHaveCount(1)` cannot change. "0 rows for 20 s while the order existed"
therefore means the one render was not the list. It was either:

- the error screen (`app/error.tsx`, "Ceva nu a mers"), which any failed read in
  `listInboundOrders` or `listOutboundIssues` produces, since both throw, or
- a redirect to the login screen, which is what a failed session check produces (`proxy.ts` and the
  `(app)` layout).

The helper then waited its full 20 s on a page that could not change and reported `0 rows`. That
reads like a list that lost an order.

**What made that one render fail on Ivan's scratch stack on 2026-09-17 cannot be recovered from any
record on this machine**: no trace, no dev server log and no database from that run. It is not
guessed here. The fix makes the next occurrence name it: the test fails at once with the error
digest, and Next's dev server prints the real error with the same digest to the `[WebServer]`
output of the same Playwright run.

## Evidence

This machine has no Docker and no Supabase CLI. So a mock Supabase (auth user, profiles and
`inbound_orders`, with every list read logged) was run on 127.0.0.1, with the real app in `next dev`
pointed at it, driven by real Chromium. The scratch scripts were kept outside the repository and not
committed.

| lead | test | result |
|---|---|---|
| Stale cached list (Next fetch cache, force-dynamic not honoured) | create an order in the mock, then a full `page.goto("/comenzi")`, 50 rounds | 51 list reads for 51 navigations; the new order shown 50 of 50. **Ruled out.** |
| `router.refresh()` fired by the upload widget at the moment `doc-done` shows, colliding with `page.goto` | refresh then goto, 30 rounds with no gap and 30 with a 40 ms gap | 0 misses, 0 interrupted navigations. **Ruled out.** |
| Read-after-write through replicas or pooling | read `lib/supabase/server.ts`, `client.ts`, `env.ts` | one Supabase URL, no read routing of any kind. The local stack has no replicas. **Ruled out.** |
| `revalidatePath("/comenzi")` (three call sites) | reading | it clears cached data and the client router cache. A full document navigation to a `force-dynamic` page reads fresh anyway. **Neither cause nor fix.** |
| `page.goto` being a client transition | reading | `page.goto` is a browser navigation and never goes through the Next router. **Ruled out.** |
| One failed read in the render | the mock fails the next list read with `57014 statement timeout` | the page is "Ceva nu a mers" with 0 inbound rows, and it stays that way however long you wait. **Exactly the symptom.** |
| CI history | `gh run view --log-failed` on the last 100 failed quality runs | 0 contain the `inbound-item` signature. Seen only once, on a scratch stack that keeps test data between runs. |

The guard was run against the same mock:

```
no session: guard failed in 5416 ms: /comenzi a fost redirectionat, sesiunea nu mai era valida
healthy: guard passed in 215 ms
failed read: guard failed in 165 ms: /comenzi a randat ecranul de eroare, nu lista (digest 4100350560).
```

and the dev server logged the cause under that same digest:

```
⨯ Error: Nu s-au putut citi comenzile de intrare: canceling statement due to statement timeout
    at listInboundOrders (lib/data/inbound.ts:90:20)
  digest: '4100350560'
```

## The change

`tests/e2e/extraction.spec.ts`, `orderWithDocument` only. After `page.goto("/comenzi")` it:
1. asserts the URL is `/comenzi` (a login redirect fails here, named);
2. waits for the inbound counter OR the error screen. It waits for the counter, not the list,
   because an empty `<ul>` has zero height and Playwright never counts it as visible;
3. throws `/comenzi a randat ecranul de eroare, nu lista (digest …)` if the error screen rendered.

The 20 s `toHaveCount(1)` is unchanged. There is no retry, no longer timeout and no extra wait. No
application code changed, no migration, and no off-limits path was touched.

## Acceptance

1. **Ten consecutive runs, retries off.** A temporary quality step on this branch ran
   `npx playwright test tests/e2e/extraction.spec.ts --project=chromium --grep "1\. trimiterea poarta" --repeat-each=10 --retries=0`.
   Run **35352389767**, head `95b5f42`: **10 passed (2.5m)**, each full case 12.6 s to 14.2 s
   (product, order, upload and the /comenzi read together). The step was removed in the next commit,
   so permanent CI time does not grow. These runs happened **in CI, not locally**: this machine has
   no database stack. The same run's End to end step, which includes every extraction spec, was
   green.
2. The guard is in the helper (`grep -c error-screen` is 1) and the 20 s wait is unchanged.
3. The End to end step on the final head sha: see the PR checks.

Local, each exit 0: `npx tsc --noEmit`, `npm run build`, the board validator on all three boards
before every commit, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`. `check:board-edit` refused while the card was in_flight, as designed,
and passed after the flip.

## What I could not do

- Reproduce the failure itself. It needs a database, which this machine does not have, and in 100
  failed CI runs it never showed. The ten-run proof shows the path is healthy on a fresh stack. It
  cannot show what went wrong once on Ivan's machine.
- Name the trigger of that one failed render. Candidates worth a look if it happens again, none of
  them proven: a transient connection error between the dev server and the local API gateway, or a
  statement timeout on a scratch database grown large from runs that never delete test data. The
  next occurrence will print the actual one.

## Merge

No self-merge (real client data in production). An `OWNER:` approval question is filed in the
factory mailbox once `quality` is green on the final head sha.

`docs/LEARNINGS.md`: one entry added ("Waiting on a server-rendered list that never refetches turns
a failed page into 0 rows").
