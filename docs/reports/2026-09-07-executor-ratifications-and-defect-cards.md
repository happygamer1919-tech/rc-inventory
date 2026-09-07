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
