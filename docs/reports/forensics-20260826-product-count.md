# Forensics: the "+1 product" flag, and what CI actually resolves to

**Date:** 2026-08-26
**Role:** EXECUTOR
**Method:** read-only against the live project under ruling R-012,
`default_transaction_read_only = on` on every statement, `SELECT 1` proven
first; plus the committed workflow and the log of a real CI run.

---

## Verdict, up front

**There was no unexplained write.** The row I flagged predates the CRIT-11 guard
by two hours and forty-one minutes, and it was created by the CRITIC's own
documented live concurrency test. **Zero rows have been written to the
production project since CRIT-11 merged**, in any table.

**CI does not point at production and cannot.** It starts its own Supabase
stack, exports that stack's URL and keys, references no repository secret, and
the repository has no secrets at all.

**The real gap is narrower than the one that was suspected, and it is real.**
The guard's *refusal* branch has never been exercised in CI. Nothing in the
repository proves that a future workflow edit introducing a production URL would
be stopped. That is what CRIT-15 exists for.

---

## 1. The correction I owe

The 2026-08-26 EXECUTOR report flagged, as deviation 5:

> `public.categories` holds 305 products, up from 304 at the last count. One
> more product arrived from somewhere after the CRIT-11 guard landed. Not
> investigated, not in scope, flagged.

**The second sentence is wrong.** The row did not arrive after the guard landed.

| fact | value |
|---|---|
| newest product row in the project | `CRITIC-RACE-1787702980667` |
| its `created_at` | `2026-08-26 00:09:40.851+00` |
| CRIT-11 merge commit `aef3c54` | `2026-08-26 02:50:44+00` |
| gap | the row predates the guard by **2h 41m** |
| products created after the merge | **0** |

The count did move from 304 to 305, and the movement is explained: the 305th row
is `CRITIC-RACE-*`, created by the CRITIC's live concurrency testing at the wave
1 boundary. That testing is documented in `docs/reports/critic-wave1.md` under
"Concurrency, tested live rather than reasoned about": two simultaneous issues
of the entire stock, fired from two different sessions. It needed a product to
race on, so it made one.

I compared a count I read to a count written on a card, saw a difference, and
reported it as a write of unknown origin without checking the timestamp that
would have settled it in one query. Flagging it was right. Flagging it with an
assertion about *when* it happened, on no evidence, was not.

## 2. Every table, and when it was last written

```
products         rows=305   newest=2026-08-26 00:09:40.851+00
categories       rows=1     newest=2026-08-25 16:57:13.457996+00
inbound_orders   rows=181   newest=2026-08-26 00:00:55.293415+00
order_lines      rows=181   newest=2026-08-26 00:00:55.293415+00
batches          rows=133   newest=2026-08-26 00:00:58.282512+00
outbound_issues  rows=38    newest=2026-08-25 23:08:00.129433+00
outbound_lines   rows=38    newest=2026-08-25 23:08:00.129433+00
status_history   rows=364   newest=2026-08-26 00:00:58.282512+00
reminders        rows=0     newest=no rows
```

**Every single one predates `2026-08-26 02:50:44+00`.** The guard has held on
every table, not only on the one that was counted.

`reminders` holding zero rows is the same fact reported at the P2-10 verification:
no threshold crossing has ever happened on production, which is why no `Netrimis`
has ever been written there.

## 3. `products` has no `created_by`, so authorship is not answerable

The forensics were asked for as `id, sku, created_at, created_by`. **`products`
has no `created_by` column.** Its columns are:

```
id, sku, name, category_id, unit, threshold, unit_value_mdl,
supplier_name, needs_review, active, created_at, updated_at
```

`created_by` exists on `inbound_orders` and `outbound_issues` only, and both
are `ON DELETE SET NULL` against `auth.users`, so P2-13 will null them when it
retires the dev accounts. Authorship of a product row is therefore not
recoverable from the schema today and will be less recoverable later. It is
inferable from the SKU prefix, which is how every row above was attributed, and
that inference works only because the suite marks what it creates.

## 4. What CI resolves to

**A local stack. Every time. There is no other option available to it.**

The workflow starts its own Supabase and reads the credentials back out of it:

```yaml
      - name: Launch database, auth and storage
        run: supabase start

      - name: Export local Supabase credentials
        run: |
          set -euo pipefail
          supabase status -o env > /tmp/supabase.env
          source /tmp/supabase.env
          {
            echo "SUPABASE_URL=${API_URL}"
            echo "SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}"
            echo "NEXT_PUBLIC_SUPABASE_URL=${API_URL}"
            echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}"
          } >> "$GITHUB_ENV"
```

`API_URL`, `SERVICE_ROLE_KEY` and `ANON_KEY` are the local stack's own. They are
the fixed published demo keys and they open nothing outside the runner.

**No repository secret is referenced anywhere in the workflow**, and
`gh secret list` and `gh variable list` both return empty: the repository has no
secrets and no variables configured. There is no production credential on the
runner to misuse.

**Proven empirically, not only by reading the YAML.** From the log of run
`33010883734`:

```
Started supabase local development setup.
│ Project URL │ http://127.0.0.1:54321            │
  SUPABASE_URL: http://127.0.0.1:54321
  NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
```

**Plain verdict: CI does not write to production, and cannot.**

## 5. Where the guard runs, verbatim

One invocation site, and it covers every Playwright run on every path.

`playwright.config.ts`:

```ts
  globalSetup: "./tests/e2e/global-setup.ts",
```

`tests/e2e/global-setup.ts`:

```ts
export default function assertNotProduction() {
  const script = resolve(process.cwd(), "scripts/assert-not-prod.mjs");

  const run = spawnSync(process.execPath, [script], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  if (run.status !== 0) {
    throw new Error(
      `Suita a fost oprita de scripts/assert-not-prod.mjs (cod ${run.status}). Vezi mesajul de mai sus.`,
    );
  }
}
```

`globalSetup` runs before every Playwright invocation, so the guard **executes**
on both the local path and the CI path. That was the design intent and it is
what CRIT-11 built: a fixture could be forgotten by a new spec; `globalSetup`
cannot.

## 6. So what is actually unproven

The guard **runs** on both paths. Its **refusal** has only ever been observed on
one.

- **Locally**, all six exit paths were exercised and recorded in CRIT-11's
  evidence: refusal on a production ref (2), pass on the local stack (0), pass on
  a different hosted project (0), refusal on an empty environment (4), refusal on
  an empty blocklist (3), and refusal when the ref is moved into `SUPABASE_URL`
  only (2).
- **In CI**, only the pass path has ever run, because the environment there is
  always the local stack. A green `quality` run proves the guard does not block
  a legitimate run. It proves nothing about whether the guard would stop an
  illegitimate one.

The failure this leaves open is not today's configuration. It is a future edit:
someone adds a repository secret and wires `NEXT_PUBLIC_SUPABASE_URL` to it, for
a preview environment or a smoke test, and the first thing that tells anyone the
guard did not stop it is rows appearing on the client's screen. The guard is
correct today and nothing in CI would notice if it stopped being correct.

**That is CRIT-15**, and it is a narrower card than "CI writes to production",
which is false.
