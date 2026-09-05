# EXECUTOR, run 20260905-040005: AUT-20

**Role:** EXECUTOR
**Run:** `20260905-040005`, unattended, CLAUDE.md section 13
**Worktree:** `/Users/ivan/rc-inventory-poc-run`, branched from `origin/main` at `23f34b3`
**Cap:** 45 minutes wall clock. Run started 2026-09-05T08:01Z.

---

## 1. Boot

Board `docs/board/rc-board-phase2.json`, `as_of 2026-09-05T02:35:00Z`.

| status | count |
|---|---|
| todo | 26 |
| in_flight | 1 (AUT-3) |
| blocked | 3 |
| halted | 0 |
| shipped | 50 |

Launch gate **6/9**. G4, G7, G9 fail.

Blocked: `P2-08b` on andre, `P2-14` on client, `MIG-01` on ivan.

Next eligible card: **`AUT-20`**, 24 eligible in total.

Claims held by another actor: `APPLY-02` by `harness`, taken 2026-09-05T05:50:52Z, 2h10m old and inside the 6 hour window. Off limits this run and not taken. It is not a card on the phase 2 board.

## 2. Cards touched

One card. **`AUT-20`, shipped**, PR **#212**.

The 45 minute cap against a `quality` check that costs 18 to 25 minutes leaves room for one card, which is the arithmetic `AUT-22` exists to make the harness do for itself. One card was claimed, worked and merged rather than two started and neither finished.

### What the card said

`scripts/poc/test-chat-classify.sh` was red on `main` and named in no step of `.github/workflows/quality.yml`, so the responder classifier had been unproven for as long as anyone could measure. Acceptance was two clauses: make the test exit 0 with the current red quoted first and reproduced at `origin/main`, and wire it into `quality` with a name comment.

### The red, reproduced at origin/main before any edit

```
FAIL the five outcomes, in order: expected [ignored,empty,ruling,ruling,question], got [ignored,empty,ruling,ruling,answer]
FAIL the owner question carries its text through: expected [what is left to do before launch], got [WRONG-COUNT-0]
PASS the refusal is logged with its reason
PASS the ignored log names the sender it refused
PASS with no owner configured, nothing is accepted
PASS an unreadable poll produces no rows rather than a guess

AUT-6 ACCEPTANCE FAILED     exit 1
```

Byte for byte the string the card quotes. The second failure is downstream of the first.

### Which side was wrong: the TEST. The classifier was right on all five messages.

The card's defaults say to fix whichever side the evidence names, and to cite the ruling when a committed change moved the classifier and left the test behind. One did.

**ASK-01**, 2026-09-01, CLAUDE.md section 14, added the `answer` outcome to `scripts/poc/chat-classify.mjs` and with it two spool directories the classifier both **reads and writes**: the ask spool (`ASK_DIR`, `--asks`) and the ruling spool (`RULING_DIR`, `--rulings`), each defaulting to a real directory under `/Users/ivan/rc-poc-logs`. This test was written for AUT-6, before either existed, and passed neither flag.

**It read live state, and that is the whole red.** `/Users/ivan/rc-poc-logs/asks/open/` holds exactly one file, `P3-11C.json`, left there on 2026-09-01. ASK-01 routing rule 3: with exactly one question outstanding, any text at all is the answer to it. The fifth fixture message is ordinary owner text, so it was routed `answer`. Correctly, every time. The test's verdict was a fact about a file in a log directory.

**In CI the unchanged test would have gone green for an equally accidental reason.** `openQuestions` on a non-existent directory returns `[]`, nothing is outstanding, rule 3 does not fire. Wiring it in as it stood would have bought a step that proves nothing, which is the same defect the card is about wearing a green badge instead of a red one.

## 3. The finding this card did not know about, and it is the serious half

**The test was WRITING into the channel the owner makes decisions through.**

Every run spooled, into the real directories, not fixtures:

```
/Users/ivan/rc-poc-logs/rulings/pending/3.json   {"update_id":3,"from_id":999,"text":"R P2-13 default"}
/Users/ivan/rc-poc-logs/rulings/pending/4.json   {"update_id":4,"from_id":999,"text":"R P2-13: take the second option"}
/Users/ivan/rc-poc-logs/asks/answers/P3-11C.json {"card_id":"P3-11C","verdict":"instruction","text":"what is left to do before launch","route":"only_open"}
```

`rulings/pending/` is where `inbox.mjs` reads decisions the owner made. `asks/answers/` is where `ask.sh` reads the answer a blocked role is waiting on.

**It has already happened for real.** `/Users/ivan/rc-poc-logs/rulings/consumed/` holds `3.json` and `4.json`, the same two fixture files, dated 2026-09-04 07:38. `inbox.mjs` consumed two fabricated rulings out of the live spool. Nobody sent them; a test fixture did.

Read against CLAUDE.md section 13, that is a message which was never sent by `TELEGRAM_OWNER_ID` reaching the ruling path. The identity check in the classifier was never bypassed: the fixture simply declares `from_id: 999` and the test sets `TELEGRAM_OWNER_ID=999`, so the classifier did exactly what it was told. The boundary that failed is the one between a test and the machine it runs on.

**What I did about it, and what I did not.** The three files this run produced were **moved**, not deleted, into `/Users/ivan/rc-poc-logs/quarantine-aut-20-20260905/`, and both live spools were confirmed empty afterwards. Moving rather than deleting because nothing is lost that way, and out of the spool rather than left there because a fabricated ruling sitting in `pending/` gets consumed on the next cycle. Nothing under version control was touched.

The 2026-09-04 consumed pair is **recorded here and left alone**. It is history, it is not mine to rewrite, and whether it produced anything downstream is a question for whoever reads `inbox.mjs` output for that day.

**This is reported and not blocked**, per CLAUDE.md section 4b: a defect already fixed is not a block. The fix ships in this card because it is the same fix.

## 4. What shipped

`scripts/poc/test-chat-classify.sh`:

- every invocation passes `--asks` and `--rulings` at directories under the test's own `mktemp -d`, routed through one `classify()` helper so no call site can forget a flag
- **the isolation is asserted rather than assumed**: the answer must land in the fixture ask spool, and both rulings must land in the fixture ruling spool. A future edit that drops a flag fails here, in the same run, instead of in somebody's log directory
- **ASK-01 rule 3 is pinned on purpose**, against a second fixture spool holding one open question, so the behaviour that caused the red is now covered deliberately
- the header explains all of it, the write half included

Six assertions became nine, all green, exit 0.

`.github/workflows/quality.yml`: one step, beside its four siblings, `- name: Prove the responder classifier  # AUT-6-AUT-20-CLASSIFY-PROOF`. `grep -c` prints 2. **Unfiltered**, per the card defaults and CLAUDE.md section 3.1, which permits exactly two filtered steps and names both.

**`scripts/poc/chat-classify.mjs` is not touched.** Not one line. That is the correct outcome under the card's own narrowness argument: the security property held the whole time, and the thing measuring it was broken.

`docs/LEARNINGS.md`: two entries. A test that reads and writes a live spool. A test file with no runner.

## 5. Escalated

Nothing. No card blocked, no question asked, no default applied that the card did not pre-authorise. The one judgement call, which side to fix, was decided by evidence the defaults name explicitly (a committed ruling changed the classifier) rather than by the tie-breaker.

## 6. What the next run should pick up first

**`AUT-21`** is next eligible by id after AUT-20, and it is close to this one: a scheduled run reports when its deployed copy of the harness differs from the repository. CLAUDE.md section 15 requires `install.sh` to be re-run after any change to `run.sh`, `responder.sh` or `digest.sh`, and nothing checks it. **This card did not change any of those three**, so no reinstall is owed by this run.

Two things worth an AUTHOR's attention, neither of which is a card I may write:

1. **A third instance of "a proof script with no runner" should stop being fixed by hand.** `check:assertion-register` catches an assertion with no failing case; nothing catches a whole test file with no step. The mechanical version is a check comparing the `scripts/poc/test-*` listing against the step list in `quality.yml`. AUT-20's own notes said the same thing about a third instance; this is the second.
2. **The live-spool default is a repository-wide shape, not a one-file bug.** `chat-classify.mjs`, `ask.mjs` and `ruling-spool.mjs` all default to a real path under `/Users/ivan/rc-poc-logs`. Any future test of any of them inherits the same trap. A check that refuses a `scripts/poc/test-*.sh` which invokes one of those modules without passing its directory flag would close the class.

`AUT-22`, two cards further down, is the arithmetic this run had to do by hand: 45 minute cap, 18 to 25 minute check, therefore one card. It is worth its priority.

## 7. Discipline

- Branch `card/aut-20` from `origin/main` at `23f34b3`. One card, one branch, one PR.
- Board validator green before every commit. It caught a derived `lane` on the first board write and that was fixed before the commit, not after.
- `as_of` and `last_checkpoint` were first written as `08:14Z` while the clock read `08:06Z`, from a stale reading taken at boot. Corrected to the real commit moment in the report commit. `BOARD-02` is the card that makes this machine-checkable, and it is still `todo`.
- No push to `main`, no force push, no migration, no database contacted, no secret read, printed, logged or committed. `git diff --cached` scanned before each commit.
