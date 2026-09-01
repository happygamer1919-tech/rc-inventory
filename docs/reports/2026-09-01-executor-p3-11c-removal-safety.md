# EXECUTOR, 2026-09-01: P3-11c, the removal-direction guard

Card **P3-11c**. Branch `card/p3-11c`. **Shipped.** No production connection.

---

## 1. Two outages, one defect, two directions

| | what happened | guard |
|---|---|---|
| **INC-05**, 2026-08-31 | code **merged** reading schema not yet **applied** | `check:pending-schema-reads` |
| **INC-06**, 2026-09-01 | migration **applied** removing schema still being **read** | `check:removal-safety`, built here |

`check:pending-schema-reads` guards additive drift **and never could guard the
other direction**: it compares merged code against the pending register, and in a
removal the reading code is already on main while the register is about to be
cleared. It asks "does this code read something not yet there?", which is the
wrong question when something is being taken away.

```
npm run prove:schema-direction
  6 of 6 passed
EXIT=0
```

Both incidents are reconstructed as fixtures and **each fails its own guard on
demand**. Neither had ever failed anywhere except production.

## 2. Enumeration is against the TABLE, and the fixture proves it

During P3-05b a search for `supplier_name` with `grep -v extraction` skipped
`lib/data/extraction-actions.ts:269`, a write to the **products** table living in
a file named for extraction. The exclusion existed to filter out
`extraction_drafts.supplier_name`, a genuinely different column, and it hid a real
reader. That reader shipped and took production down.

So the check finds **every file that touches the table**, by the table's name,
with no exclusions, and only then looks inside those files for the object being
removed. The INC-06 fixture deliberately places its reader in a file named for
extraction, and a third assertion proves the reader was **named in the output**.
If that ever passes silently, the enumeration has gone back to filtering by
filename.

## 3. The ordering rule, as a machine condition

```
additive migration  -> applies BEFORE the code that reads it merges
removal migration   -> applies AFTER  the code that stops reading it is
                       merged AND DEPLOYED
```

The applier now refuses a removal batch **twice over**, both proven:

- **exit 2** while any reader remains on main, from `check:removal-safety`;
- **exit 2** on production while the deploy is unconfirmed, becoming **exit 0**
  only when the operator states `RC_DEPLOY_CONFIRMED=yes`.

Both are proven through a new **dry-run mode** that evaluates every gate and exits
before the first `psql` call, so a fixture tree can never reach a database. That
is what let the production-only gate be tested without weakening the rule that
path overrides are otherwise shim-only.

## 4. THE DEPLOYED HALF IS NOT ASSERTED, AND IS NOT FAKED

**This is the open question and it is with the owner.**

The rule says *deployed*, not merged. The applier cannot see a deployment:

- `VERCEL_TOKEN` **is declared in the permitted secret read and is empty**, so the
  deployments API is not reachable;
- production exposes no endpoint reporting the commit it is serving.

Inventing a substitute for "deployed" is the exact class of guess that produced
INC-06, so nothing was invented. The applier asserts the **merged** half and
**refuses** on the deployed half unless an operator states the deploy has landed,
which is recorded in the journal as a statement rather than a check.

Asked through `scripts/poc/ask.sh` on this card, Telegram message 33. My
recommendation is **(a) a small public endpoint reporting the commit the live site
is running**: no new credential, it is the deployed build reporting its own
identity rather than a proxy for it, and it works for any host.

**On silence, nothing is blocked except unattended removals.** The current
behaviour is already safe.

## 5. Three defects found while building this, all one class

Every one is the same shape as the pending-register regex from P3-04b: **tooling
that folds a card id must fold both sides of every comparison.**

1. **`ask.mjs` upper-cased the card id** and then looked for it verbatim on the
   board. `ask.sh` sent the question to Telegram and then died with
   `no board named P3-11C`, leaving the owner a question with no card it could be
   written onto. Found by using it.
2. **The same defect in `inbox.mjs` rejected the owner's own rulings.** The ruling
   form is upper-cased and compared to a set of verbatim board ids, so
   `R P3-11a default` answered `no card P3-11A on the board`. **Every card with a
   lower-case suffix was unrulable**: P3-04b, P3-05b, P3-11a through P3-11d,
   P3-13b, P3-13c. That is the owner's decision channel refusing his decisions,
   and it is fixed here because §4b makes `ask.sh` load-bearing for every card.
3. **My own fixture harness** passed absolute override paths through
   `path.join(ROOT, ...)`, producing directories that do not exist, which
   `existsSync` filtered away silently, leaving the check scanning nothing and
   reporting **OK**. That is the same silent-pass shape this card exists to stop,
   so the check now **exits 2 rather than reporting OK** when it has no source
   directory to scan.

## 6. Wired into `quality`

`check:removal-safety` and `prove:schema-direction` are both their own steps.
Neither is path-filtered: they are cheap, and R-084's exemption covers one step
only.
