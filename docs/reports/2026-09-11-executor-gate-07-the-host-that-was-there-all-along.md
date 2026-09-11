# EXECUTOR, 2026-09-11: GATE-07. The host was there all along, and three sessions looked at the wrong one

**Role:** EXECUTOR. **Date:** 2026-09-11 UTC. **Input:** an owner dispatch of four
numbered steps.

**Branch:** `card/gate-07`, cut from `origin/main` at `fd1964a`.
**Card:** `GATE-07` shipped. **Rulings:** `R-193`, `R-194`.
**Gate:** `G8` re-measured and resolved on that measurement.
**No migration was added.** No credential was read; no signed URL or token was
generated, printed or echoed. The `.com` domain and its DNS were not touched.

---

## 1. STEP 0. Verification

| | |
|---|---|
| `origin/main` at boot | `6ca0ded3703608176dcd470e8db5fa8d9dbeb7ee` |
| open PRs at boot | 1, `#274`, this session's own |
| `GET https://app.rapidconstruct.md/api/health` | **200**, 0.97s, no redirects |
| body | `{"commit":"6ca0ded...","ledger_version":"0036","at":"2026-09-11T15:31:38.257Z"}` |
| commit vs main | **exact match** |

**The host `check:deployed-commit` targeted**, quoted from
`scripts/poc-free/check-deployed-commit.mjs:64`:

    const ORIGIN = (args.origin || process.env.RC_HEALTH_ORIGIN || "https://www.rapidconstructmd.com")

**`G8`'s recorded evidence** named `rapidconstructmd.com`,
`www.rapidconstructmd.com` and `rc-inventory-iota.vercel.app`, and carried its own
refutation from 2026-09-08: *"THIS CONDITION IS FALSE ON THE WIRE AND ITS STATE IS
NOT FLIPPED... A reader taking the phase 2 count of 6 of 9 at face value is
reading one condition that stopped being true on 2026-09-07."* It ended with an
escalation: *"which host is meant to serve the inventory application."*

**That escalation had an answer for four days and nobody here knew it.**

---

## 2. STEP 1. The repoint

`check:deployed-commit` now defaults to `https://app.rapidconstruct.md`. The old
default is **quoted in place, not deleted**, because rulings R-176, R-177 and
R-178 were all written about it, and R-178 predicted exactly what was happening:
the guard *"defaults to a host that can never satisfy it, so its next refusal will
be spurious and will invite a workaround."*

**It passes for the first time since the domain moved:**

    npm run check:deployed-commit -- --commit origin/main
      health route  https://app.rapidconstruct.md/api/health
      applying at   fd1964a91140
      live commit   fd1964a91140
      ledger        0037
      OK: production is running exactly the commit being applied against.

**Two domains, one letter apart in conversation and not the same thing.**
`rapidconstructmd.com` is the **marketing** site and is correct as it is.
`rapidconstruct.md` is the company domain and `app.` on it is this platform. Every
line this pull request **adds** that mentions the `.com` is quoted superseded text
or the sentence warning the next reader. No DNS file, no `vercel.json`, no domain
configuration is in the diff, asserted by a grep over the added lines.

### G8, re-measured 2026-09-11T15:39:10Z, read-only, no credential

| clause | result |
|---|---|
| 1, `P2-12` landed | unchanged, shipped 2026-08-26 |
| 2, the domain serves this application | `/api/health` returns commit `fd1964a911…`, `ledger_version` `0037` — main's head |
| 3, 200 over HTTPS with a valid certificate | `http 200`, `ssl_verify_result 0`, 0 redirects; `CN=app.rapidconstruct.md`, Let's Encrypt `YR1`, valid to 2026-12-10 |
| 4, auth redirects land on the same host | `GET /` → `307` → `https://app.rapidconstruct.md/autentificare` → `200`, **same host** |

**All four hold. The state stays `pass` and is now honestly evidenced rather than
stale.** The 2026-09-08 block is kept, not deleted: it is the record of the four
days in which this condition read `pass` and was false, and R-177's finding about
the rubric is not retracted by a measurement.

### A side effect worth more than the card

**Knowing the host made a migration apply OBSERVABLE for the first time in this
repository.** `0037` merged with `#274` at `15:37:05Z`; the health route reported
`ledger_version` `0037` at `15:37:45Z`. **Forty seconds.** `APPLY-LOG.md` now
carries before-and-after readings where the `0035` and `0036` entries say `NOT YET
OBSERVED` because no terminal knew a host it could ask. Those two entries are left
alone: back-filling them would make the file claim those sessions knew something
they did not.

---

## 3. STEPS 2 and 3

**`R-193`, the doctrine**: a control that has never executed is not a control, and
reading correctly in an editor or existing in an enum is not evidence that it
fires. Three instances. One is the counterparty's four alert modules and **this
repository cannot check it**, recorded as the owner's report. One is measured:
`unreadable_document` sat in the enum, the copy, the screen and the tests with no
branch emitting it. **The third is the inverse of how it reads**, and that is why
it belongs: the derivation never overrode the sender's code, R-190 measured that
it could not, and the belief that it did survived until an execution settled it.
The consequence is a bar, not a sentiment: **four mutants, which is the existing
bar, and it stays.**

**`R-194`, the counterparty position**, and contract section 5.4 carries all
three. A transport failure is not a status and leaves a record at neither end; we
depend on their handler and this is the record of the dependency. A retry may only
resend bytes that already exist, and **seven extractions of one file returning
seven distinct unit prices on one line** is why a re-run retry delivers a
different document under the first one's identity. The signed URL TTL is a
security position and no retry schedule may drive it upward.

**THE TTL NUMBER IS NOT IN THIS REPOSITORY AND THE SESSION DID NOT GUESS IT.** The
dispatch says it *"stays at two hours"*. Read from source:

| path | value |
|---|---|
| `lib/data/extraction-fire.ts` | **fifteen minutes** |
| `lib/data/inbound-actions.ts` | **fifteen minutes** |
| `scripts/ext/serve-sample-documents.mjs` | **twenty-four hours** |

Two hours is what the sample script used **until the owner's own ruling R-096
raised it to twenty-four** on 2026-09-03, for the four test fixtures only, with
production explicitly left at fifteen minutes. The two readings move the number in
opposite directions, so the number is escalated and **the direction binds now**.

---

## 4. What this corrects in my own earlier record

**`P3-40` and the 2026-09-11 report both said there was no deployed instance this
session could reach.** True of the two hosts they knew, false about the world.
Both are corrected in place with the original quoted, and both now carry the live
measurement:

    GET https://app.rapidconstruct.md/api/health      0.38 to 0.69s TTFB, ten samples
    GET https://app.rapidconstruct.md/autentificare   0.16 to 0.47s TTFB, five samples

`/autentificare` is a static prerender and touches no database; `/api/health` is
one round trip. The client-to-edge leg subtracts out, leaving **roughly 0.25s**.
**It confirms the direction of the local finding and licenses no multiplication**:
round trips inside one invocation do not each pay a fresh connection. The
authenticated measurement is still owed.

---

## 5. Deviations, flagged and not self-ratified

1. **The dispatch's TTL number matches no value in this repository.** Recorded and
   escalated rather than resolved. The security position it states is adopted in
   full.
2. **One instance in `R-193` is the inverse of its own sentence.** Our derivation
   never overrode the sender's code. Recorded as an instance of the doctrine under
   both readings, with R-190's measurement cited, rather than corrected into
   something the owner did not say.
3. **EXECUTOR wrote two more rulings**, which is POC's work. Fourth session
   running.
4. **I corrected two committed artefacts of my own from earlier today**, `P3-40`
   and the EXT-26 report. Neither is a card being worked; both carried a false
   premise that would have stopped the next session measuring.
5. **My pre-push gate loop ran `check:deployed-commit` bare and manufactured a
   red.** CI never invokes it that way: only `prove:deployed-commit` runs in
   `quality`, and the check itself is called by the migration applier with an
   explicit `--commit`. Run bare it defaults to `HEAD`, which on a feature branch
   production has correctly never seen. **The refusal was right and my invocation
   was wrong** — the mirror image of yesterday's defect, where I ran too few
   gates.

**Nothing in this section is ratified here.**

---

## 6. State at the end

Phase 2: **6 of 9**, and one of the six is now true rather than stale.
Phase 3: **0 of 9**.

**What the next session should know first:**

1. **The platform is at `app.rapidconstruct.md`** and `/api/health` answers the
   commit and the ledger version with no credential. Three sessions measured the
   wrong hosts; nobody needs to again.
2. **`EXT-25` is still the highest-value unworked card**, and it now owes Andre
   three things rather than one: the `unreadable_document` emitter change, the
   `EXT-26` precedence, and `R-194`'s retry position.
3. **The TTL number is owed by the owner.**
4. **`P2-13`'s parking still has a condition nothing enforces:** it holds only
   while no real client data is entered.
