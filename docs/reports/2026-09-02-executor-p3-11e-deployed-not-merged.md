# EXECUTOR, 2026-09-02: P3-11e, deployed is asserted, not stated

Card **P3-11e**. Branch `card/p3-11e`. One migration **authored**, `0028_applied_ledger_version.sql`, **not applied**. No production write.

---

## 1. What this closes

INC-06: a removal migration was applied against a database whose **live code was still reading** the removed object. Six screens answered 500.

The ordering rule, as `check-removal-safety.mjs` states it:

```
an ADDITIVE migration applies BEFORE the code that reads it merges
a REMOVAL migration applies AFTER the code that stops reading it is merged
                         AND DEPLOYED
```

P3-11c shipped the **merged** half. The **deployed** half had no proof at all, so the applier asked the operator to type this instead:

```
REFUSED. This batch removes schema and the DEPLOY cannot be verified from here.
...
If you have confirmed the deploy carrying that code is live, re-run with
  RC_DEPLOY_CONFIRMED=yes
and the confirmation is recorded in the journal as an operator statement.
```

**An operator statement is exactly the guess that produced INC-06.** It is now gone, and it is not kept as a fallback: a statement that survives beside a machine check is the one that gets used at three in the morning.

## 2. How, with no Vercel credential

`VERCEL_GIT_COMMIT_SHA` is exposed by the platform **to the application** at build time, so the deployment can state its own commit with no credential anywhere. **No Vercel API, no `VERCEL_TOKEN`**, on the owner's instruction, and the reason survives restating: this **survives P2-13's credential revocation**, and a check that dies when the keys rotate is a check that dies on the day it matters.

- **`app/api/health/route.ts`** - public, JSON, `no-store`. Returns `commit`, `ledger_version`, `at`. Nothing else: a health route is the one endpoint everybody adds one more field to.
- **`proxy.ts`** - `/api/health` added to `isPublic()`. Without it the applier reads an HTML login page instead of a commit, refuses forever, and for the wrong reason. One of the eleven proved refusals is exactly that case, and it names `proxy.ts` in its own output.
- **`scripts/poc-free/check-deployed-commit.mjs`** - asks the health route, then asks git.

## 3. The question it asks, and why that one

```
git merge-base --is-ancestor <commit being applied against> <live commit>
```

If the live commit **contains** the tree being applied, then every line in that tree is already live, including the line that stopped reading the removed object. That is stronger than "my deploy finished": it is false when production is running something older, and false when production is running something unrelated.

**Every failure is a refusal.** Unreachable, redirected, HTML, 5xx, unparseable, no commit, blank commit, a commit git has never heard of, a commit that is not a descendant. There is no path on which not knowing is treated as yes, because *"I could not tell, so I assumed it was fine"* is a one-sentence description of INC-06.

## 4. The ledger version, and the trap it walked into

The card asks for the applied ledger version alongside the commit. Only the database knows it: the repository says what **should** be applied.

`supabase_migrations` is not exposed through PostgREST and must not be - exposing a schema to read one number makes every table in it reachable forever after. So `0028` adds `public.applied_ledger_version()`, `SECURITY DEFINER`, `search_path` pinned, **revoked from PUBLIC, anon and authenticated, granted to `service_role` only**. PostgreSQL grants EXECUTE to PUBLIC by default, so the revoke is what makes the grant mean what it says, and `assertions/0028_applied_ledger_version.sql` reads the ACL out of `pg_proc` to keep it that way. It asserts the **grant**, never the **call**: on postgres 17.6.1.106 an `anon` call to a function it lacks EXECUTE on crashes the backend, so a negative test that called would take the database down instead of failing.

**Then `check:pending-schema-reads` refused the health route, correctly.** INC-05's guard saw a merged file naming an object that is not applied:

```
check-pending-schema-reads: COD DE APLICATIE CARE CITESTE SCHEMA NEAPLICATA
  app/api/health/route.ts
      numeste functia applied_ledger_version
```

The guard's usual remedy is `hasPhase3Schema`, and it does not apply here: that gate answers a different question, and a gate for `0028` **would itself be a function in an unapplied migration** - the trap `schema-capability.ts`'s own header names. So this is an `EXEMPT` entry with its reason written down, which is what that list is for. The route's `rpc` call is inside a `try`, any error becomes `null`, and `null` reads as *"I do not know"* and never as *"none"*. **A health route that crashes is worse than useless**: it is the one endpoint somebody queries precisely when everything else is broken.

**The applier does not depend on the ledger field at all.** It decides on `commit`, which touches no database. The version number is reported because the owner asked for it.

## 5. The migration is portable, and that was not free

`language sql` bodies are resolved at CREATE time, so the first draft could not be applied to the bare `postgres:16` shim that `npm run check:migrations` runs every migration against - that shim has no `supabase_migrations` schema:

```
ERROR:  relation "supabase_migrations.schema_migrations" does not exist
```

It is `plpgsql` with a `to_regclass` guard now. **A migration that can only be parsed against production is a migration whose first real test is production.**

## 6. Acceptance, run

```
$ npm run prove:deployed-commit
  ok    CONTROL: production running exactly HEAD is accepted
  ok    CONTROL: production ahead of the applied commit is accepted, it contains it
  ok    REFUSES when production is BEHIND the commit being applied. This is INC-06
  ok    REFUSES a live commit the repository does not know
  ok    REFUSES when no commit is reported
  ok    REFUSES when the reported commit is blank
  ok    REFUSES an HTML body, which is what a login page is
  ok    REFUSES a redirect, and names proxy.ts isPublic() as the cause
  ok    REFUSES a 5xx from the health route
  ok    REFUSES a body that does not parse
  ok    REFUSES when the health route is unreachable, rather than assuming yes
  ok    FINAL CONTROL: the accepting case still accepts after all of the above
  prove-deployed-commit: every refusal fires and every control passes.

$ npm run check:migrations       28 applied to a bare postgres:16, 12 assertion files passed
$ npm run prove:applier          14 of 14 proofs passed
$ npm run check:removal-safety   OK, 1 pending migration(s), no reader remains on main
$ npm run check:pending-schema-reads
                                 OK, 1 pending, 12 files exempt with a reason
$ npx tsc --noEmit               exit 0
```

**The check itself is deliberately not run in CI**, and must not be: a pull request branch is not deployed and never will be, so it would fail on every green run and be switched off within a week. What runs in CI is the **proof that its refusals fire**, against a fake health route on loopback, each paired with a control that must pass on the same harness.

### The mistake made building that proof

The first version drove the check with `spawnSync` while the fake health route ran **in the same process**. `spawnSync` blocks the event loop, so the server could never accept the connection: every case timed out, and **every refusal "passed" for the wrong reason** - including the controls, which is how it was caught. It is async now, and the accepting control is re-run **last**, after every refusal, so a harness that breaks part-way through cannot leave eleven refusals passing on a dead server.

## 7. Against real production, right now

```
$ node scripts/poc-free/check-deployed-commit.mjs
  health route  https://www.rapidconstructmd.com/api/health
  applying at   da791ac60c27

REFUSED. The deployed half cannot be proven, so nothing may be applied.
The health route answered 307, a redirect.
Location: /autentificare
That is the authentication proxy, not the route.
```

Correct, and the diagnosis is exact: the route is not deployed yet, so the request is caught by the authentication proxy. It will answer once this merges and Vercel deploys.

## 8. Not in this pull request

**`0028` is authored and merged, not applied.** Merging a migration file changes one text file in a git repository and changes nothing in any database. It is registered in `docs/migrations/APPLY-LOG.md` under card P3-11e, and the apply is a separate act with its own three phases and its own journal.
