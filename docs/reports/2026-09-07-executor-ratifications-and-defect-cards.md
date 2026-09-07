# EXECUTOR, 2026-09-07. Ratifications recorded, backlog verified, defect cards authored.

Role: **EXECUTOR**. Working narrative, written as the session runs and committed
with the work it describes, per CLAUDE.md 9b.

---

## 0. Boot and verification. Nothing below was taken from the dispatch on trust.

`git fetch --all --prune`, then read.

| what | value |
|---|---|
| `origin/main` | `d318c4ba54a9e864ad92c38af47c02e54c961037` (`BOARD: close the 2026-09-07 session report (#253)`) |
| local `main` in the shared clone | `af9f592`, stale by 5 commits, untouched |
| my working copy | a fresh worktree at `/Users/ivan/rc-inv-orange`, detached from `origin/main`, so no other terminal's checkout moves under this one |

### The three boards, as the files state them

| board | cards | by status | launch gate |
|---|---|---|---|
| `rc-board.json`, phase 1 preview | 13 | 13 shipped | **9 of 9 pass** |
| `rc-board-phase2.json`, phase 2 build | 81 | 65 shipped, 12 todo, 3 blocked, 1 in_flight | **6 of 9 pass**, G4, G7 and G9 fail |
| `rc-board-phase3.json`, phase 3 CRM and density | 72 | 43 shipped, 29 todo | **0 of 9 pass** |

Phase 2's three failing conditions are G4 (AI extraction live end to end per the
Andre contract), G7 (reminders fire a Resend email on a threshold crossing) and
G9 (Mihai completes one full cycle himself on production). The blocked cards are
`P2-08b` on Andre, `P2-14` on the client, and `MIG-01` on Ivan.

The next eligible card on the phase 2 board at boot was `LEARN-01`. The dispatch
directs this session elsewhere, and says so.

### Open pull requests: 14, none of them mine

Every one is authored by the same GitHub account, so authorship does not
separate them. Provenance is read from the branch prefix and the commit author,
which does.

| # | branch | card | commit author | age at boot | merge state |
|---|---|---|---|---|---|
| 249 | `poc/state-20260907-070002` | none, harness state | happygamer1919-tech | 6.0h | BEHIND, mergeable |
| 248 | `triage/20260907-070002` | none, R-158 to R-162 | TRIAGE | 6.3h | **DIRTY** |
| 245 | `triage/20260907-040001` | none, R-154 to R-157 | IvanBong420 | 9.3h | **DIRTY** |
| 244 | `report/20260907-040001` | none, run report | IvanBong420 | 9.7h | BEHIND, mergeable |
| 242 | `triage/20260907-010004` | none, R-149 to R-153 | IvanBong420 | 12.4h | **DIRTY** |
| 241 | `report/20260907-010004` | none, run report | rc-executor | 12.7h | BEHIND, mergeable |
| **240** | **`card/ext-11`** | **EXT-11** | IvanBong420 | 12.8h | **DIRTY**, 6 commits, last pushed 11:08Z today |
| 238 | `triage/20260906-220005` | none, R-144 to R-148 | IvanBong420 | 14.7h | **DIRTY** |
| **237** | **`card/ext-10-outcome`** | **EXT-10 follow-on** | IvanBong420 | 15.3h | BEHIND, mergeable |
| 223 | `poc/state-20260906-040016` | none, harness state | POC | 31.8h | **DIRTY** |
| 210 | `triage/20260905-010004` | none, R-135 to R-141 | IvanBong420 | 60.0h | **DIRTY** |
| 209 | `poc/report-20260905-010004` | none, run report | IvanBong420 | 60.4h | **DIRTY** |
| 207 | `triage/20260904-220003` | none, R-128 to R-134 | IvanBong420 | 62.9h | **DIRTY** |
| 206 | `poc/report-20260904-220003` | none, run report | happygamer1919-tech | 63.7h | BEHIND, mergeable |

**What the other terminal holds: two card branches, and only one of them is
live.** `#240` is `EXT-11`, pushed to five hours before this session booted, and
it is the branch the dispatch tells me to skip. `#237` is an `EXT-10` follow-on,
untouched for fifteen hours. **The other twelve are unattended-run artefacts**,
not another interactive terminal: six harness state and report branches and six
`TRIAGE` rulings branches, eight of which conflict with `main` and therefore
trigger no workflows at all, which is why they have accumulated.

**I hold none of them.** Under the ratified reading of AUT-23 the producer gate
is on my own in-flight work, so this session starts at zero of three.

---

## 1. The six ratifications, recorded

Four needed no action beyond being written down. Three carried work.

1. **Hold at three of my own.** Ratified as read. Continued.
2. **GATE-03 touching P2-13's card was a checklist edit, not the execution of
   P2-13.** Ratified as read.
3. **`Total deviz` is the material subtotal, adaos excluded.** Arithmetic
   ratified, **label overturned.** Carried below.
4. **Stopping with the board not dry.** Ratified as read.
5. **EXT-12 shipped on an acceptance whose first clause is impossible.** Ship
   ratified, **record not ratified.** Carried below.
6. **Six ids on P2-13's checklist where GATE-03 names one.** Ratified, with the
   blast radius to be stated in the card body. Carried below.

### 3. The label, overturned

`P3-13c` shipped a four-number foot on the Comparatie tab whose first number is
labelled `Total deviz` and whose value excludes the adaos. The owner's ruling:
*"Rename the column so it names what it sums. Total materiale or equivalent
Romanian. The word deviz must not head a column that excludes adaos."*

The rename is **code**, so under CLAUDE.md 2 it is a card and not a quiet edit.
**`P3-13d` is authored** for it, with the new label fixed in its defaults as
`Total materiale estimate`: the owner's word plus the two that separate it from
`Total emis` beside it, which is also materials. `P3-13c` keeps the vocabulary it
was authored with and carries a notes block recording the overturn, per
CLAUDE.md 9c.

`P3-12`'s `Total deviz acceptat` is **not** touched. That total INCLUDES the
adaos, so its name is correct and the ruling does not reach it.

### 5. EXT-12's acceptance, rewritten

The acceptance now states what was actually run and passed: the three owner
numbers named once in `lib/data/extraction-budget.mjs`, the acknowledgement clock
reading `ACK_TIMEOUT_MS` from the same module and staying at 15 seconds,
`npm run prove:extraction-budget` at 13 of 13, section 4.4a of the contract, and
the three-clock survey by file and line.

The impossible clause is **quoted at the foot of the same field and marked
impossible**, not deleted, under CLAUDE.md 9c. It is impossible in both halves:
there is no line count at fire time, because section 3 of the contract fixes the
request payload at six fields and the count is the result of the extraction; and
the timeout named in `extraction-fire.ts` is the acknowledgement clock rather
than the extraction budget.

Nothing about the shipped code changed and no evidence field was edited.

### 6. P2-13's blast radius, in plain terms

`plain` now says, without a single id in it, that this is the moment the workshop
loses the right to approve its own work and no automated helper can change the
database at all.

`notes` carries the enumeration the owner asked for. **Seven rulings die at this
card**, and the acceptance already carries a tickable box for each:

| # | ruling | what ends |
|---|---|---|
| 1 | R-001, 2026-08-25 | the migration-apply delegation to EXECUTOR |
| 2 | R-007 | the single permitted secrets read, on a **narrower** window that its box confirms rather than closes |
| 3 | R-047 | executing a DELETE-class script that proves its own outcome |
| 4 | R-049, 2026-08-28 | the original self-merge grant, documentation paths |
| 5 | R-056, 2026-08-28 | that grant extended to AUTHOR |
| 6 | R-059, 2026-08-30 | that grant widened to every path, four roles |
| 7 | R-082, 2026-08-31 | the migration-applier grant |

**Six of the seven reached the acceptance after authoring**, which is the finding
the block records. R-095 added the R-082 box on 2026-09-02; GATE-03 on 2026-09-07
found R-082 was the only grant named by id and added the other six.

---

## 2. Backlog verification. Both files exist on `main`.

The dispatch asked whether two uncarded items still have files behind them.
**Both do.** Neither was deleted, so neither backlog item closes with a note.

### a. The 4096 guard belonging in `send()`

**File: `scripts/poc/notify.mjs`. Exists on `main`.**

`TELEGRAM_MAX = 4096` is defined at line 52. The only other occurrences of that
identifier in the file are lines 616 and 617, **inside a comment block quoting
the code DIG-01 removed**. `send()` begins at line 640 and applies no cap.

The file names the work itself, in its own comment above the constant:

> *"It stays as a named number for whoever adds the cap to send(), which is where
> it belongs and where it still does not exist."*

Carded as **`DIG-02`**.

`scripts/poc/chat-send.mjs` has the same constant at line 14 and **does** apply
it, at lines 50 to 51, by truncating. That is a different file answering a
different question and `DIG-02`'s defaults scope it out unless sharing the
splitter is free.

### b. The unhardened `import.meta.url` guard in `eligible.mjs`

**File: `scripts/poc/eligible.mjs`. Exists on `main`.** Lines 200 to 201:

```js
const RUN_DIRECTLY =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
```

**Measured, not reasoned about.** Same file, same board, two invocations:

```
$ node scripts/poc/eligible.mjs --board docs/board/rc-board-phase2.json --actor probe
{ "eligible": [ { "id": "LEARN-01", ... 
exit=0

$ ln -s /Users/ivan/rc-inv-orange/scripts/poc "$SCRATCH/link/poc"
$ node "$SCRATCH/link/poc/eligible.mjs" --board /Users/ivan/rc-inv-orange/docs/board/rc-board-phase2.json --actor probe
exit=0
```

The second printed **nothing** and exited **0**. That is the silent exit-0 whose
first instance is recorded in `notify.mjs`'s own comment, still live in the file
the unattended run asks *which card to work*.

**Three more files carry the same unhardened form**, found by the same grep:
`plain-digest.mjs:338`, `boards.mjs:141`, `claims.mjs:292`. `ask.mjs` and
`notify.mjs` are already hardened and are where the shared helper comes from.

Carded as **`GUARD-06`**. All four sites are in the one card, because the check
the card adds would refuse the other three and a check landed beside three known
violations is a check with an allow list on its first day.

---

## 3. The two defect cards

### a. `RULE-10`. The board-edit check fires at the wrong moment.

`check:board-edit` reads `base..head` and asks whether a card's status *changed*.
CLAUDE.md 2 is about **commit order**: flip the card first, so the board never
shows a card being worked as untouched. A diff cannot see an order.

It has broken three times: `DIG-01`, `P3-18`, `EXT-12`. `EXT-12`'s own notes
already name what separates them from `GATE-03` and `P3-13c`, which were flipped
correctly in the same session: where the work **started at the board** the flip
happened, and where it started by **reading code** to verify a premise, the flip
was never reached.

This is the shape `docs/reports/2026-09-07-executor-rule-09-and-the-wrong-moment.md`
section 2 surveys, and its named cure is *move the check to where the property
binds*. `RULE-09` did exactly that for id allocation. `RULE-10` does it here: a
check that reads the branch **commit by commit**, refusing when the first commit
touching a code path is not preceded by the status flip, with a replay that must
refuse the three real instances and pass the two correct ones.

`check:board-edit` is **not** replaced. It catches a different failure and is
still the only thing standing in front of the `#195` incident.

### b. `CI-02`. Node 22 local against node 20 on the runner.

**Measured on this machine, 2026-09-07:** `node -v` prints `v22.22.3`.
`.github/workflows/quality.yml` line 30 pins `node-version: '20'`. There is
**no `engines` key** in `package.json` and **no `.nvmrc`** in the repository.

Node 22 strips TypeScript type annotations from a `.ts` import and node 20 does
not, which is the `ERR_UNKNOWN_FILE_EXTENSION` that killed `EXT-12`'s first CI
run after `EXT-08` had already met it. The local run says green; the runner is
where it fails.

`CI-02` pins `engines.node` and `.nvmrc` to **20**, per the owner's instruction
not to raise the runner, and adds `check:node-version` to compare all three
sources. The two files are not the deliverable; the check that keeps them
together is.

---

## 4. State at the end of this section

Five cards authored, all `todo`, none worked: `P3-13d` on the phase 3 board,
`RULE-10`, `CI-02`, `DIG-02` and `GUARD-06` on the phase 2 board. Ids allocated
through `npm run id:free`, which reported each free across `main`, all 14 open
pull request branches and this working tree. `GUARD-03` came back **CLAIMED** on
`triage/20260904-220003` (#207) and `GUARD-06` was taken instead, exactly as
`RULE-09` designed.

All three boards validate at 0 violations.

---

## 5. `EXT-21`. The state endpoint. Shipped, `#255`.

`app/api/state/route.ts`. An unauthenticated GET returns the **active** category
names, the unit enum as `code` plus Romanian label, and the applied ledger
version read from the database. `force-dynamic`, `cache-control: no-store`, one
object, service-role read.

**503 and never 200 with empty lists.** A poller cannot tell *we accept nothing*
from *I could not look*, and the first of those readings is the one that made
Andre hold back three safe values for a day.

**The service-role client, not the anon one, and that is not a shortcut.**
Migration `0001` grants `select` on `categories` and `units` to `authenticated`
only. An anon read would return an **empty list rather than an error**, which is
precisely the silent lie this card removes.

**`proxy.ts` gains one line**, beside `/api/health` and `/api/documents`: without
it the middleware answers 307 to `/login` and a redirect-following client reads
200 and `text/html`.

**Two new steps in `quality`, neither path filtered.**
`check:state-endpoint` refuses a table outside `[categories, units]`, a function
outside `[applied_ledger_version]`, fewer `active` filters than selects, a
missing `no-store`, a missing `force-dynamic`, a route it cannot read, and a
route that selects from nothing. `prove:state-endpoint` is 9 of 9, every refusal
built by **mutating the shipped route** rather than by writing a fixture that
resembles it.

### The acceptance clause that could not be run, and what was done about it

Case 4 asked for *"a category deactivated through the settings screen"*.
**Nothing in the product writes `categories.active`.** The column exists, `NOT
NULL DEFAULT true` since `0001`, and is read by `listCategories`.
`CategorySettings.tsx` offers add and rename and says in its own header that it
deliberately offers nothing else. `product-actions.ts` has `createCategory` and
`renameCategory` and no `setCategoryActive`. Grepped across `app`, `components`,
`lib`, `tests` and `scripts`: the only writer anywhere is a fixture insert in
`prove-applier.mjs`.

**Corrected, not deleted.** The clause is quoted on the card under CLAUDE.md 9c
and marked. The property it exists to prove, *that the response reads the
database and not a constant*, is proved by **adding** a category through the same
screen and seeing it one request later on the same server and the same build.
That is also the incident's own direction: 2026-09-03 was a **new** category and
two **new** units being invisible, not a retired one lingering. The `active` half
stays guarded statically.

**Recorded and not carded:** there is no way to deactivate a category anywhere in
the product. That is a gap in the settings screen, and the dispatch forbade
authoring scope beyond the cards it named, so no card was written for it.

## 6. `P3-13d`. The label, renamed. `#256`.

`Total deviz` becomes **`Total materiale estimate`** in the Comparatie foot. The
two extra words are not decoration: `Total emis` sits beside it and is also
materials, so the axis the foot draws is estimated against issued.

**The number did not change.** The four assertions on
`comparison-total-deviz`'s `data-value-mdl` (1310, 200, 0) are untouched. The
spec now also asserts the **absence** of the exact string `Total deviz`, because
asserting only the new label would let both live side by side. The adaos sentence
is reworded to name both sides in one sentence and keeps its testid.

`P3-12`'s `Total deviz acceptat` is untouched: that total **includes** the adaos,
so the word heads a column that contains what it implies.

## 7. `EXT-13`. Retention off, and the map that was missing a row.

Two artefacts, no code.

**`docs/contracts/extraction-v2.md` section 4c** states retention-off as a
**required condition** of the integration, names what is retained without it
(the extracted content plus a conversation object per request) and whose data it
is, and says plainly that we cannot verify it: there is no `OPENAI_*` name
anywhere in this repository, in `lib/env-required.ts` or on the strip list in
`scripts/poc/secret-names.sh`. Andre sets the flag; Ivan relays the confirmation;
until it lands, the map assumes retention persists.

**`docs/DATA-MAP.md` is new.** Eleven rows in two tables. Seven for supplier
document content: Supabase Storage `rc-docs`, `extraction_drafts`, the accepted
order and product tables, Make, **the model provider**, this git repository, and
Vercel request logs. Four for client data that is not document content: Resend,
Telegram, Supabase Auth, and the model behind every terminal working this
repository.

**Five rows read NOT KNOWN, and each names who owes the answer.** Rows 4 and 5
are owed by **Andre** through Ivan. Rows 7, 8 and 11 are Vercel, Resend and
Anthropic account settings that only **Ivan** can read. The card required an
explicit statement where the answer is not known; a sweep that found nothing
would have been the suspicious outcome.

### The finding worth more than the flag

**The principle was already written down, one section along, and was pointed at
the wrong party.** Section 9 of the contract has refused a third-party conversion
sub-processor since the contract was frozen, under R-015:

> *"A converter sees every supplier invoice in full, so adding one is a
> data-sharing decision about the client's commercial information and needs an
> owner ruling naming the service."*

**The model sees exactly the same thing.** The argument was applied to a service
we might have **added** while the one already in the path went unexamined,
because it arrived with the extractor rather than as a choice of ours. That is a
fact about how the integration was assembled, not about who ends up holding the
data. R-015 is quoted in both new documents rather than retracted.

---

## 8. Verified on production, read-only, and one of the two answers is bad

Neither of these was asked for. Both were found by pointing a `curl` at the
production host while working `GATE-01`, which needs the production origin, and
both are recorded because a terminal that measures something load-bearing and
does not write it down has produced nothing.

### 8a. `EXT-21` is live and correct on production

```
GET https://rc-inventory-iota.vercel.app/api/state
200, cache-control: no-store, max-age=0, must-revalidate
{"categories":["Cimenturi și mortare", ... 19 entries ... ,"Vopsele, lacuri și solvenți"],
 "units":[{"code":"m2","label":"m²"}, ... ,{"code":"t","label":"t"},{"code":"l","label":"l"}],
 "ledger_version":"0035","at":"2026-09-07T19:04:14.662Z"}
```

**Nineteen categories, nine units including `t` and `l`.** Those two units and the
nineteenth category are exactly the three values Andre held back for a day
because a document we wrote told him they were not there yet. He can now ask
production instead. This is a deployed answer, not a CI claim.

### 8b. THE CLIENT DOMAIN NO LONGER SERVES THIS APPLICATION

Measured 19:36 UTC, read-only, no session and no credential:

```
dig +short rapidconstructmd.com A            185.199.108.153 .109 .110 .111
dig +short www.rapidconstructmd.com CNAME    happygamer1919-tech.github.io.
GET https://rapidconstructmd.com/                        200, server: GitHub.com
GET https://www.rapidconstructmd.com/autentificare       404
GET https://www.rapidconstructmd.com/api/health          404
```

Those four addresses are **GitHub Pages**. The page served is a Rapid Construct
**marketing site**, `last-modified: 2026-09-07T18:22:59Z`, deployed the same day
this was measured.

**On 2026-08-27 the G8 evidence recorded the opposite, and it was true then:**
apex 308 to www, www 307 to `/autentificare` then 200, www a CNAME to
`f1f222f4a6887f64.vercel-dns-016.com`, apex an A record on the Vercel anycast
address. Both halves of that DNS have changed.

**Nothing is down.** `https://rc-inventory-iota.vercel.app/api/health` answers 200
with commit `1805d3d` and `ledger_version` `0035`, which is `main`'s head. The
**domain** moved; the product did not.

**A second finding rides on the first.** P2-12's defaults say, under R-004, that
Deployment Protection stays enabled and **no `vercel.app` host serves an
anonymous request**. The *project alias* still behaves that way
(`rc-inventory-ivan-bong-420-s-projects.vercel.app` answers 302 to
`vercel.com/sso-api`). **`rc-inventory-iota.vercel.app` is a different alias, it
answers anonymously, and it is the host the owner was using on 2026-08-28 when
CRIT-17 was raised**, so this is unlikely to be new. The CRITIC's wave 1 finding
tested the project alias and could not have seen it.

**What it blocks if it is not deliberate.** G9 needs Mihai to complete a cycle on
production and P2-14 is that card. `check:deployed-commit` defaults its origin to
`https://www.rapidconstructmd.com/api/health`, which now answers 404 from GitHub
Pages, so the applier's deployed-commit guard would refuse for the wrong reason
on its next run.

**It may be deliberate and this terminal cannot tell.** A marketing site at the
apex on the same day is a plausible owner decision and the app may be meant to
move to a subdomain. Every name tried under the domain resolves to one wildcard
address, `100.127.132.229`, so no subdomain serves it today.

**G8's `state` was NOT flipped.** The measurement is written into the gate's
`notes` and the state left at `pass`. Flipping a launch gate is a
launch-readiness decision, DOCTRINE-TRIAGE section 4 gives the gate audit to
TRIAGE, and this dispatch scoped authoring to the cards it named. The
recommendation is Ivan's to make: point a host at the Vercel project and
re-verify, or record that the public URL has changed and rewrite this condition
and `check-deployed-commit`'s default origin to match.

## 9. `GATE-01` was not started, and why

It is the next card in board order after `EXT-13`, skipping `EXT-11`. It was
**not** picked up.

Its acceptance needs a **write against the production project with the public
anon key**. The key is genuinely public and the card is right about that, but the
only sources for it are `/Users/ivan/rc-secrets`, which CLAUDE.md 7 puts out of
bounds for reads, or the production JavaScript bundle, and **the host that would
have served that bundle is now a GitHub Pages marketing site**. The card's
premise, that it needs nothing new from anyone, was true when it was authored and
is not true this afternoon.

Beyond that, the card is an unauthorised-write attempt against a live client
database. It is designed to be refused and a refusal is the pass, but it is the
one action in this session that reaches the client's production system, and the
finding above means the ground it stands on moved today. It is left `todo`,
unmodified, for a session that can start from a known production origin.

## 10. Deviations, for explicit ratification. Not self-ratified.

1. **`EXT-21`'s acceptance case 4 was corrected rather than blocked on.** It asked
   for a category *deactivated* through the settings screen; nothing in the
   product writes `categories.active`. The clause is quoted and marked on the
   card under CLAUDE.md 9c and the property it exists to prove is proved by
   *adding* a category through the same screen. This board's own doctrine says
   *correcting a stale acceptance line* is decided and written down rather than
   asked, which is the authority relied on. **The other reading, blocking the
   card on a settings control that does not exist, was available.**

2. **A gap was found and deliberately not carded.** There is no way to deactivate
   a category anywhere in the product. Step 6 forbade authoring scope beyond the
   cards named in steps 3 and 4, so it is recorded on `EXT-21`'s notes and here
   instead of becoming a card.

3. **`GUARD-06` covers four files where the backlog item named one.** The item
   named `eligible.mjs`. `plain-digest.mjs`, `boards.mjs` and `claims.mjs` carry
   the identical unhardened comparison, and the check the card adds would refuse
   all three, so a card fixing one would land a check beside three known
   violations. **Flagged because it is wider than the item as the owner phrased
   it.**

4. **`P3-13d`'s label is `Total materiale estimate`, not `Total materiale`.** The
   ruling allowed an equivalent. `Total emis` sits beside it and is also
   materials, so the axis being drawn is estimated against issued and the bare
   form would name the wrong one. **Flagged because it is not the owner's exact
   words.**

5. **G8's measurement was written to the gate and its state was left at `pass`.**
   Both halves are a judgement: recording it is EXECUTOR's evidence duty, and not
   flipping it is a refusal to make a launch-readiness call outside this role and
   this dispatch. **Flagged because the other reading, flipping it to `fail` on
   the wire evidence, is available and defensible.**

6. **One self-inflicted defect, corrected in the open.** The conflict resolver
   that rebuilt the phase 3 board on `card/ext-21` took its timestamp from the
   wrong argument and wrote `as_of` as the literal string `"x"`.
   `validate-board.mjs` does not type `as_of` as a date and passed at 0
   violations; `check:board-clock` caught it in `quality`. Corrected by a forward
   commit, never a force push. **The process lesson is that the local check set
   was run against the code commit and not against the merge commit that
   introduced the value.**

## 11. State at the end

**Merged this session:** `#254` the ratifications and five authored cards, `#255`
`EXT-21`, `#257` `EXT-13`. **Open and mine:** `#256` `P3-13d`, green on an
earlier head and re-running after its second merge of `main`, and the pull
request carrying this report.

**Authored and untouched, all `todo`:** `RULE-10`, `CI-02`, `DIG-02`,
`GUARD-06` on the phase 2 board.

**What the next session should pick up first:** the G8 question in section 8b,
because it is the owner's to answer and three other things wait behind it. Then
`GATE-01`, once the production origin is known again.
