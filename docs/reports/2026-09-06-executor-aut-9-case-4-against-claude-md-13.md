# EXECUTOR, 2026-09-06: AUT-9's case 4 against CLAUDE.md section 13, both quoted in full

**Role:** EXECUTOR. **Card:** `AUT-9`, phase 2 board, `blocked_on: ivan`.

**This report resolves nothing and builds nothing.** The dispatch of 2026-09-06
says so in terms: quote both sides in full, say which I believe is correct and
why, say what breaks under each reading, and leave the card blocked with the two
quotes on it. That is what this is.

---

## 1. The card, quoted verbatim

### Acceptance case 4, in full

> (4) a run.lock whose recorded pid IS alive is honoured whatever its age, the
> refusal is written to the run log where a reader can see it, and the script
> exits 0 per CLAUDE.md section 13.

### The defaults clause that says the same thing, in full

> **A LIVE PID BEATS AN OLD TIMESTAMP.** The stale-lock takeover checks kill -0 on
> the recorded pid FIRST and honours the lock whatever its age when the pid is
> alive. A long-running live run is the cap's problem, not the lock's, and a
> takeover that kills a working run to fix a bookkeeping rule has made things
> worse.

### The card's title, which is the third thing it says, in full

> The run cap measures wall clock against a deadline, and a lock whose owner is
> gone is not honoured forever.

---

## 2. CLAUDE.md section 13, quoted in full

The three paragraphs that govern the lock, complete and unedited:

> **A run never starts if `/Users/ivan/rc-poc-logs/run.lock` exists, unless that
> lock is stale.** It logs the refusal and exits 0. Two runs sharing the run
> worktree would corrupt each other's work.
>
> The refusal is only correct while the holder is inside the budget it declared.
> The lock records the holder's own `cap_seconds`, and a lock older than that plus
> a fifteen minute margin is wreckage rather than a running peer: the next run
> reclaims it, says so loudly in its log, and takes it. Amended 2026-08-28, after
> run `20260827-220052` held the lock for nine hours and the 01:00, 04:00 and
> 07:00 windows silently did not happen.
>
> Reclaiming stops the holder before taking the lock, process group included, so
> the model process the dead run started does not carry on unsupervised. **It
> checks identity before it signals anything**: a pid recorded hours ago may since
> have been recycled, and killing whatever now answers to that number would be a
> worse fault than the one being repaired. A pid that is alive but is not this
> harness is left alone and the lock is reclaimed around it.

---

## 3. What the code does today, read rather than remembered

`scripts/poc/run.sh`, verified on 2026-09-06 at `af9f592`:

    LOCK_AGE=$(( RUN_STARTED_AT - LOCK_STARTED ))
    LOCK_STALE_AT=$(( LOCK_CAP + POC_LOCK_STALE_MARGIN_SECONDS ))

    if [ "$LOCK_AGE" -lt "$LOCK_STALE_AT" ]; then
      log "run $RUN_ID refused: lock held by run ${LOCK_RUN:-unknown}, pid ${LOCK_PID:-unknown}"
      ...
      log "exit 0, this is a refusal and not a failure"
      exit 0
    fi

**Age is tested first.** Only past the threshold does the reclaim run, and there
`kill -0` decides *how* to reclaim, never *whether* to. A live pid whose command
line matches `run.sh` has its process group stopped; a live pid that is **not**
this harness is left unsignalled and the lock is reclaimed around it, which is
section 13's sentence implemented word for word.

`POC_LOCK_STALE_MARGIN_SECONDS=900`.

---

## 4. The disagreement is two disagreements, and the second one is new

I reported one on 2026-09-05. Reading the code again for this report found a
second.

### 4a. Order and outcome

| | tests first | a live pid past the threshold |
|---|---|---|
| CLAUDE.md 13, and the code | **age** | reclaimed, after stopping it |
| AUT-9 case 4 and its defaults | **`kill -0`** | **honoured, whatever its age** |

### 4b. The margin, which I did not name yesterday

The card's defaults say:

> **MARGIN IS TWICE THE CAP**, and it is a constant with the reason written next
> to it, not a literal buried in a condition.

Section 13 says **"a fifteen minute margin"**. The code says
`POC_LOCK_STALE_MARGIN_SECONDS=900`, which is fifteen minutes, so the code and
section 13 agree and the card disagrees with both.

The gap is not cosmetic. The lock records the holder's own declared
`cap_seconds`, which is `POC_RUN_TOTAL_CAP_SECONDS`, currently
`2700 + 1800 + 900 * 2 = 6300` seconds:

| reading | a lock goes stale at |
|---|---|
| the code and section 13 | `6300 + 900` = **7200s, 2 hours** |
| the card's defaults | `6300 + 12600` = **18900s, 5 hours 15 minutes** |

So even on its own terms the card would let a hung run hold three windows before
anything reclaimed it. On the night the card was written about, the lock was held
for **nine hours**, so the card's own margin would not have caught that incident
either, and its case 4 would never have reclaimed it at all.

---

## 5. Which I believe is correct, and why

**Section 13, and it is not close.** Four reasons, in the order they weigh.

1. **The card's own title agrees with section 13 and contradicts its own
   defaults.** "A lock whose owner is gone is not honoured forever" is a statement
   about a dead owner, which is what section 13 reclaims. CLAUDE.md 5 is explicit
   that a `defaults` field "fills silence, it does not contradict speech", and
   here it contradicts the title above it.
2. **Section 13 was amended after the incident; the card was authored during it.**
   Both are dated 2026-08-28 and both are about run `20260827-220052`. Section 13
   carries the amendment note in its own text and names what the incident cost:
   three windows that "silently did not happen". A rule written with the outcome
   in front of it outranks one written while it was still being diagnosed.
3. **The card's reading has no bound.** "Honoured whatever its age" means a run
   whose process is alive but wedged holds the lock until a human notices. That is
   precisely the nine-hour hang, and the mechanism the card proposes would have
   permitted it indefinitely.
4. **The defaults' own argument is answered by the code as written.** They say "a
   takeover that kills a working run to fix a bookkeeping rule has made things
   worse". The code does not kill a working run: it kills one that has been
   running for its declared budget **plus two hours**, and it refuses to signal
   anything that is not this harness. The concern is real and it is already met by
   the identity check, not by honouring the lock forever.

**What the card gets right, and it should survive whatever is decided.** Its
premise, that a takeover must not signal a recycled pid, is correct and is the
sentence section 13 spends a paragraph on. Nothing here argues against that half.

---

## 6. What breaks under each reading

### If case 4 is implemented as written

- **The nine-hour hang comes back**, unbounded. A wedged run holds the lock for as
  long as its process is alive, and the only recovery is a human on the machine.
  That is the outcome section 13 was amended to prevent, quoted above with the
  three windows it cost.
- **Two currently green assertions go red**, in `scripts/poc/test-harness-caps.sh`
  section 3: `a 30000s old lock is reclaimed` and `the new run took the lock and
  recorded the reclaim`. A 30000-second-old lock with a live pid would then have
  to be honoured.
- **CLAUDE.md 13 must be amended in the same pull request**, or the file and the
  code say opposite things, which is the failure BOARD-03 just corrected one layer
  up.
- **The margin question has to be answered too.** Two hours or five and a quarter,
  and the card and section 13 give different numbers.

### If section 13 is upheld and case 4 is rewritten

- **Nothing in the code changes.** Cases 1 and 3 are implemented and proved today,
  and the TRIAGE watchdog the defaults ask for is already deadline-based.
- **The card's acceptance has to be edited**, which is a board decision and the
  reason this is on the owner's desk rather than mine.
- **One thing is genuinely still missing:** case 2's SIGSTOP. The existing proof
  models a suspend by moving the clock, with a `date` shim adding 3600 seconds to
  a real watchdog and a real victim. That tests the property directly, because
  `date +%s` advances across a suspend and `sleep` does not. A SIGSTOP case tests
  something adjacent, a stopped victim still being killable, and it is one case in
  a file that already exists.
- **`npm run check:run-cap` does not exist and should not be created.** Cases 1
  and 3 already live in `scripts/poc/test-harness-caps.sh`, which is wired into
  `quality` as `# HARNESS-CAP-PROOF`. A second harness would be a duplicate of
  proofs that already run on every pull request, and this repository has recorded
  the two-copies failure three times in the last week.

---

## 7. What I did not do

I did not resolve it, did not build it, did not touch `scripts/poc/run.sh`, and
did not weaken any assertion to make an answer convenient. The card stays
`blocked_on: ivan` with both quotes on it, added by this pull request so a reader
meets them on the card rather than having to open two files.

**The recommendation on the card is unchanged from 2026-09-05:** rewrite case 4 to
match section 13, point the acceptance at `test-harness-caps.sh` where cases 1 and
3 already live, and the only new work is case 2. This report adds the margin
disagreement to what that rewrite has to settle.
