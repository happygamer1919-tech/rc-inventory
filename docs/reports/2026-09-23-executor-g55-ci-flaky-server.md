# EXECUTOR report, 2026-09-23, card P3-95 (goal G55)

**The suite stops losing one random test per run to the development server restarting itself.**

Branch `card/p3-95`. No migration. No application code. No test file touched.

## In plain words, for the owner

The automated check that runs before anything reaches the live site has been failing one test per
run, and a different test each time. Nothing was wrong with those tests or with the work being
checked. The suite runs the app on a builder's copy of the server, the kind meant for somebody
typing code, and that kind of server is allowed to restart itself when it runs short of memory.
It did exactly that, once, near the end of every long run, and whatever the check happened to be
doing at that second died with it.

The suite now runs a built copy of the app instead, the same kind that serves the live site. That
copy has no permission to restart itself, so a red result means a real fault again. It costs about
ten extra seconds per run, and it should give back more than that, because a built copy answers
without stopping to compile.

## The evidence, found before anything was changed

The signature is one line, and it is in every affected run EXACTLY ONCE:

```
[WebServer] ⚠ Server is approaching the used memory threshold, restarting...
```

In all four runs the very next line of the log is the failing case.

| run | attempt | restart warning at | failing case, the next line | case no. | suite |
|---|---|---|---|---|---|
| 35805338724 (PR #352, P3-93) | 1 | 02:06:48.70 | `roofing-product-picker.spec.ts:219` | 374 | 390 passed, 1 failed, 51.7m |
| 35814037940 (PR #353, P3-94) | 1 | 04:03:31.87 | `sheet-options-admin.spec.ts:241` | 385 | 394 passed, 1 failed, 38.3m |
| 35814037940 | 2 | 04:59:50.48 | `romanian-file-date.spec.ts:300` | 374 | 394 passed, 1 failed, 52.5m |
| 35814037940 | 3 | 05:57:37.63 | `romanian-file-date.spec.ts:396` | 375 | 394 passed, 1 failed, 51.8m |

A different case every time, always between 374 and 385 of 395. That is a resource that runs out
late in a serial run, not a case that is wrong.

The other lines the goal quoted are consequences of the same event, not separate faults:

- `Failed to find Server Action "...". This request might be from an older or newer deployment.`
  The action id was minted by the compilation that just died; the process that came back never
  saw it.
- `Failed to fetch` and `net::ERR_CONNECTION_REFUSED`: the socket closed with the process.
- `The destination stream closed early`: this one appears MANY times per run, including in runs
  that pass, and it is NOT the signature. It was checked rather than assumed: in attempt 3 it
  appears at 05:13, 05:14, 05:32, 05:37, 05:43, 05:50, 05:56 and elsewhere with no failure
  anywhere near it. Only the memory-threshold line lands next to a failure.

### The cause is in Next, and it is development-mode only

`node_modules/next/dist/server/lib/utils.js`:

```js
function getMemoryRestartStats(isDev, devMemoryThresholdRestart, getHeapStatistics) {
    if (!isDev || !devMemoryThresholdRestart) {
        return undefined;
    }
    const heapStatistics = getHeapStatistics();
    if (heapStatistics.used_heap_size > 0.8 * heapStatistics.heap_size_limit) {
        return heapStatistics;
    }
    return undefined;
}
```

and `node_modules/next/dist/server/lib/start-server.js`, in the `finally` of every request:

```js
const memoryRestartStats = getMemoryRestartStats(isDev, devMemoryThresholdRestart, v8.getHeapStatistics);
if (memoryRestartStats) {
    log.warn(`Server is approaching the used memory threshold, restarting...`);
    ...
    process.exit(RESTART_EXIT_CODE);
}
```

Three things follow, and all three match the observed behaviour. It cannot happen at all on a
production server (`isDev` false). It happens once per process, which is why there is exactly one
lost case per run. It happens late, because the heap has to fill first, and a development server
serving about 400 sequential requests over roughly 52 minutes fills it by holding on to every
route it compiled on demand.

### The suspect the goal named first was checked first, and it is wrong

`workers: 1` has been set in `playwright.config.ts` since long before this, and
`fullyParallel: false` with it. The suite was already fully serial in one worker process. Lowering
workers was not available as a fix because there was nothing to lower.

There is no readiness race either: the failures are not at the start of the run, where a server
that was not ready yet would put them, but at case 374 of 395.

## The fix

The main `chromium` project, which runs 394 of the 395 cases, now serves a production build
through `next start` in its own `NEXT_DIST_DIR`, exactly the shape the `productie` server has used
since P2-11:

```
NEXT_DIST_DIR=.next-main npm run build && NEXT_DIST_DIR=.next-main npx next start --port 3100
```

This is option 1 of the four the task listed, and it is the most literal reading of the goal's own
"serve the built app rather than the dev server in CI". It removes the behaviour rather than
raising the bar it trips over.

### Why this project is different from the fara-webhook precedent

The `fara-webhook` server's own comment rejects a second production build as "minutes of CI for
nothing", and for that server it was right: it proves one narrow thing, that a missing webhook
address is refused loudly, and nothing about that case can depend on a production build. This is
the MAIN project, running 394 cases across roughly 52 minutes, and development mode's own
instability IS the defect being fixed. The comment's cost estimate has also been measured since
and no longer holds; both halves are corrected in the same commit rather than left to contradict
the file around them. That server stays in development mode, deliberately: one spec, no memory
pressure, and its mode changes nothing about what it proves.

### The CI cost, measured rather than guessed

About 10 seconds. From the `Build` step of run 35814037940:

```
05:04:09.7  > next build
05:04:10.1  ▲ Next.js 16.3.1 (Turbopack)
05:04:17.4  ✓ Compiled successfully in 7.0s
05:04:20.1  Route (app)
```

10.4 seconds end to end with Turbopack. Playwright starts its `webServer` entries one after the
other (the plugin setup tasks run in sequence), so the cost is additive rather than hidden. It is
expected to be repaid several times over by a server that answers without compiling: compare
attempt 1 at 38.3 minutes, whose dev server had warm caches, with attempts 2 and 3 at 52.5 and
51.8 minutes. The observed delta is recorded below.

### The one timeout that changes, and why it is not a retry in disguise

The main `webServer`'s own startup budget goes from 120000 to 300000 ms. That server now performs
a build before it can answer, which is the same work the `productie` server does, so it gets the
same budget that server has carried since P2-11 without ever exhausting it. The 120000 was sized
for a server that boots without compiling anything.

No other timeout moves. The suite's `timeout: 45_000`, `expect.timeout: 10_000` and the other four
`webServer` timeouts are untouched, and `retries: 0` stays. No test file is touched at all: no
assertion, no skip condition, no retry count.

### The options that were rejected, with the reason

- **One build shared between the main and productie servers.** Rejected on fact, not preference:
  `NEXT_PUBLIC_SITE_URL` is inlined at build time and the two servers answer on different origins
  (3100 and 3101). One build cannot carry both truthfully. `NEXT_PUBLIC_SITE_URL` is read in
  `lib/data/extraction-fire.ts` to build the document link every extraction fire sends, so a build
  carrying the other server's origin would not be a harmless difference. The two builds together
  cost about 20 seconds.
- **`experimental.devMemoryThresholdRestart: false`.** This flag DOES exist in this Next version
  (`node_modules/next/dist/server/lib/router-server.js:192`), so it was checked rather than
  assumed away. Rejected twice over: `next.config.ts` carries an explicit doctrine against
  experimental flags, written for P2-11 with its reason beside it ("un steag experimental pe primul
  sistem de productie al unui client este un pariu cu afacerea altcuiva"), and the flag switches
  off the safety valve rather than removing the growth that opens it. The server would then run
  past 80 percent of its heap limit instead of restarting, which trades one failure mode for a
  worse one.
- **`NODE_OPTIONS=--max-old-space-size=...`.** `ubuntu-latest` has 16 GB, so there is headroom, but
  this postpones the same event rather than removing it: the trigger is a fraction of the limit,
  not a fixed number, so a bigger heap means a later restart in a suite that only gets longer. The
  goal asks for the root.

## What was NOT changed

- No test file, in any project. No assertion, skip condition or retry count.
- No `retries` anywhere, globally or per project or per test.
- No test, expect, or project timeout raised. The single `webServer` startup budget that changes
  is justified above against an observed build time.
- The `productie` and `fara-webhook` servers keep their own commands, their own separate build
  directories and their own origins.
- `supabase/config.toml`, the migration apply steps and the seed scripts.
- `.github/workflows/quality.yml` is not edited at all. The fix sits entirely in
  `playwright.config.ts`, which is where the server that misbehaves is configured.

## Local gates, each exit 0

`npx tsc --noEmit`, `npm run build`, the board validator on all three boards, `check:card-ids`,
`check:board-edit`, `check:unique-ids`, `check:open-branch-ids`, `check:no-destructive-migration`
(0 files), `check:conflict-residue` (run after `git add`), `check:categories`,
`check:ledger-rows`, `check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`, `check:board-clock`, and `npx playwright test --list`, which collects
391 tests in 57 files across the three projects unchanged.

The suite itself cannot run on this machine: no Docker, no Supabase CLI. The production build was
proved locally with `npm run build`; the new `webServer` command is the `productie` server's
command with a different port and a different build directory, and CI is where it is proved.

## Proof: five consecutive green full runs on one commit

PENDING. Filled in by the final commit on this branch, with the run ids, the attempt numbers, the
mechanism used to trigger each, the suite duration of each, and the confirmation that none of them
printed the memory-threshold line.

Note on sequencing, stated plainly rather than glossed: the five proof runs are taken on the sha
that carries the fix, and the commit that writes their ids into this file necessarily creates a
sixth sha, which gets its own full green run before the merge. The proof is five runs on one
commit; this paragraph exists so nobody has to reconcile six run ids with a five-run acceptance.

## Left for the owner

The merge. Real client data has been in production since 2026-09-14, so nothing self merges here,
whatever it touches. An approval question goes to Max in the factory mailbox once the runs are in.
