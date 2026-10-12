# 2026-10-12 executor report: P3-265, CI minutes cut

## In plain words

The automatic test runs on GitHub were using up the monthly allowance (90% of
3,000 minutes on 2026-10-12). The long tests now run once, when a change is
marked ready, instead of on every save and again after the merge. The quick
checks still run every time.

## What changed

- `.github/workflows/quality.yml`
  - `pull_request` types listed: `opened`, `synchronize`, `reopened`,
    `ready_for_review`.
  - Every step `docs_scope` already gated (thirteen, the P3-117 perf baseline
    included) now also needs `github.event_name == 'pull_request' &&
    github.event.pull_request.draft != true`. So drafts and pushes to `main` skip
    Build, the migration apply, both applier proofs, the local Supabase block,
    seeds, Playwright, End to end, the perf baseline and the report upload.
  - New step `Cache Playwright browsers` (`actions/cache` pinned to sha
    `0057852bfaa89a56745cba8c7296529d2fc39830`, the `v4` tag on 2026-10-12),
    path `~/.cache/ms-playwright`, key on `package-lock.json`, same gate.
    `setup-node` already caches npm. No Docker image cache.
  - New step `Prove the check-state reporter refuses a draft green`
    (`npm run prove:pr-state`), not filtered.
  - No workflow `paths:` key.
- `scripts/poc-free/pr-check-state.mjs`: exits 1 on a green while the pull
  request is a draft, and on a green whose run started before the last
  `ready_for_review` event. Both are checked before the staleness check.
- `scripts/poc-free/prove-pr-state.mjs` and six fixtures: 10 cases, all pass.
- `checks:state` now reads the NEWEST `quality` entry in the rollup. After
  `gh pr ready` the rollup holds two entries for the same sha, draft run first;
  the old `find` read the draft run and refused #507 although its ready run had
  passed. Found on this pull request, fixed in the second push.
- `CLAUDE.md` 3.1: item 1 under R-084 now requires a run started while the pull
  request was not a draft; the old sentence is quoted under 9c. New subsection
  for the third filter. The P3-73 heading "GATES TWELVE STEPS" is quoted and
  marked false since P3-117 (thirteen; fourteen with the cache step).
- Board: card P3-265 on `docs/board/rc-board-phase3.json`.

## Why checks:state changed (not in the brief)

A draft run's green stays attached to the head sha for a few seconds after
`gh pr ready`. The factory auto-merger polls every 60 seconds and would have
merged on it. Without this, the doctrine sentence "only a non-draft run whose
heavy steps ran authorises a merge" would not be true in practice.

Known limit: rerunning a draft run after marking ready keeps the draft payload
and starts after the ready event, so the timing test does not catch it. Written
into CLAUDE.md 3.1: do not rerun a draft run after ready.

## Baseline minutes (before)

`gh run list --workflow quality.yml --limit 600`, runs created from
2026-10-05T00:00Z, wall minutes from start to last update:

| event | runs | total min | avg min |
|---|---|---|---|
| all | 452 | 13698 | 30.3 |
| pull_request | 372 | 10793 | 29.0 |
| pull_request cancelled | 80 | 2358 | 29.5 |
| pull_request failure | 124 | 2165 | 17.5 |
| pull_request success | 168 | 6270 | 37.3 |
| push | 80 | 2905 | 36.3 |

After numbers are in the pull request body (measured on this pull request's
draft run, its ready run, the throwaway draft and the first push to main).

## Local gates

See the pull request body for each command and its exit code. No step here
needs a database except the ones that only run in CI (migration apply, applier
proofs, End to end).
