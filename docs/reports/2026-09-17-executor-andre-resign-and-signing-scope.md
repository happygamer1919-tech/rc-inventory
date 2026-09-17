# EXECUTOR: the fresh re-sign of the Andre regression set, and why signing gets no journal row

**Role:** EXECUTOR
**Date:** 2026-09-17
**Branch:** `board/20260917b-andre-resign`, cut from `origin/main` at `d4d593d`
**Files changed:** this report, and nothing else. The reasoning for the missing
`docs/PRODUCTION-WRITES.md` row is in Part 3.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `d4d593d`:

- **Cards:** todo 32, in_flight 0, blocked 2 (`P2-08b` on andre, `P2-14` on client), halted 0, shipped 68
- **Launch gate:** **6/9**
- **Next eligible card,** by `scripts/poc/card-order.mjs`: **AUT-3**, "Add the TRIAGE role to the POC chain". Not worked, because this dispatch names its steps.

Phase 3 board, `as_of` 2026-09-17T21:02:00Z: todo 32, blocked 1, shipped 89, gate 0/9.

---

## PART 1. What the rulings actually say

### The TTL, from R-096

> *"The sample document signed URL TTL is raised from two hours to twenty-four,
> for the four permanent test documents only."*

and, naming the mechanism rather than the prose:

> *"`scripts/ext/serve-sample-documents.mjs` signs at `TTL_SECONDS`, which becomes
> `24 * 60 * 60`."*

**So the TTL is 86400 seconds.** R-096's 2026-09-15 amendment widened the scope
off the count and onto the prefix:

> *"The scope of this ruling is every document under `_samples/andre`, which on
> 2026-09-15 is six documents, and not a fixed count of four."*

Today that prefix holds seven. The amendment is why seven is not a deviation.

### The scope, from R-206

Its closed list, verbatim:

> 1. sourcing `/Users/ivan/rc-secrets/phase2.env`, values never printed, CLAUDE.md
>    8.3 otherwise unchanged
> 2. listing objects under `rc-docs/_samples/andre`
> 3. uploading under that prefix **without overwrite**
> 4. creating signed URLs under that prefix at the TTL R-096 sets
> 5. writing the matching `docs/PRODUCTION-WRITES.md` row, which R-055 requires

**Item 4 is this dispatch, so there is no STOP.** Item 2 is the listing in Part 2.
Item 1 is how the environment was read. R-206 also fixes the boundary:

> **"WHAT IS NOT COVERED IS EVERYTHING ELSE"**, and **"COVERAGE ENDS AT CLOSE
> UNDER R-199."**

### R-199, which is why the signature had to be fresh

Condition one requires the regression to run *"against a FRESH re-sign"*. The
previous links, issued 2026-09-15, expired 2026-09-16T13:16:31Z and
2026-09-16T16:01:17Z. There were no live links to this prefix when this dispatch
started, which is exactly the state that makes a re-sign necessary rather than
convenient.

---

## PART 2. The signing

### Step 3. The prefix, listed before anything was signed

Sourced with `set -o allexport; . /Users/ivan/rc-secrets/phase2.env; set +o allexport`,
CLAUDE.md 8.3. No value was printed, logged or written anywhere; the run printed
the two variable names and the word `set`.

**Seven objects, and all three named sizes match:**

| object | bytes | expected |
|---|---|---|
| `aviz-scan-matnord-0021884.pdf` | 270251 | |
| `aviz-silvamat-0044213.pdf` | **45942** | **45942, matches** |
| `confirmare-comanda-lumicast-5531.pdf` | **36958** | **36958, matches** |
| `confirmare-comanda-mpc-8842-2.pdf` | 46714 | |
| `factura-betonmix-4417-2.pdf` | 46457 | |
| `factura-nordavex-0002718.pdf` | **37525** | **37525, matches** |
| `factura-tehnocom-0009312.pdf` | 53243 | |

**All present: yes. No size changed.** The three assertions are evaluated inside
the script, before it signs anything, and it exits 3 without signing if any fails.
The terminal does not read the grid and decide.

### Steps 4 and 5. One pass, one expiry

| | |
|---|---|
| objects signed | **7 of 7** |
| TTL | **86400 seconds**, per R-096 |
| issued | `2026-09-17T21:53:11.077Z` |
| **expires** | **`2026-09-18T21:53:11.077Z`** |
| file | `/Users/ivan/rc-samples/ANDRE-SAMPLES-2026-09-17b.md` |
| mode | **`-rw-------`** (0600) |
| lines | 15 total, 7 of them links |

**The target file name was free**, so no letter suffix was needed. The name is
`ANDRE-SAMPLES-2026-09-17b.md` exactly as the dispatch gave it. The script refuses
to run at all if the output path already exists, so an existing file could not
have been overwritten.

**ONE PASS MEANS ONE `createSignedUrls` CALL, NOT SEVEN `createSignedUrl` CALLS.**
The batch form signs every path in a single request, so all seven links share one
issue moment and therefore one expiry. Signing them in a loop would have produced
seven expiries milliseconds apart and there would be no single timestamp to
report, which is what the dispatch asked for.

**NO URL AND NO TOKEN REACHED THE TERMINAL.** The script writes the links straight
into the output file, chmod 600 at write time, and prints only counts, timestamps
and the path. That was checked afterwards rather than assumed: the captured stdout
contains zero occurrences of `token=`.

### The roles written beside each link

The file carries one line per object: name, role in the regression, expiry, link.
**Every role is taken from the committed record, not composed for this file:**

| object | role | source |
|---|---|---|
| `aviz-silvamat-0044213.pdf` | the R-199 item "digital invoice with line items and no printed grand total"; expected `failed`, `unreadable_document`, `digital`, `lines []` | R-205 |
| `factura-nordavex-0002718.pdf` | fixture, **sums** arm: sound printed header, line sum outside the 0.07 tolerance; expected `reconciliation_failed`, arm `line_sum_missed` | `docs/reports/2026-09-15-executor-orange-andre-fixtures.md` |
| `confirmare-comanda-lumicast-5531.pdf` | fixture, **lines** arm: one line with no line total, header otherwise sound; expected `unreadable_document`, arm `line_total_missing` | same report |
| `aviz-scan-matnord-0021884.pdf` | the scan, 7 lines, reconciles clean; the R-199 scan arm | `docs/contracts/extraction-v2.md` tolerance table; the EXT-15 comment in `route.ts` naming a probe PDF with no text layer |
| `factura-tehnocom-0009312.pdf` | digital original, 54 lines, clean; the `order_ref` counter-example where `TG 0009312` splits into series and number | contract, sections on `order_ref` and the tolerance table |
| `confirmare-comanda-mpc-8842-2.pdf` | digital original, 6 lines, clean | contract tolerance table |
| `factura-betonmix-4417-2.pdf` | digital original, 5 lines, carries the 0.01 VAT rounding residue | contract tolerance table |

### The mechanism, and why the committed script was not used

`scripts/ext/serve-sample-documents.mjs` is the committed mechanism for this
prefix and **it is forbidden here**, for three reasons that are each a clause of
this dispatch: run without `--capture-only` it uploads every PDF with
`upsert: true`, and in **either** mode it writes and deletes a throwaway probe
object. A sign-only script was written instead: `storage.list` and
`storage.createSignedUrls` are the only two Supabase calls it makes.

**sha256 `2763812e8ff6fca0918aa8bf4c016c3bbcf570769626f2a195a836418df8755b`, 156
lines.** It is not committed, because this pull request is docs only and the
script is a one-off; the sha256 identifies the bytes that ran.

**Nothing was uploaded, nothing was upserted, no probe object was written, and no
object was modified or deleted.** The prefix held seven objects before the run and
seven after, with identical sizes.

---

## PART 3. The record

### R-055 does not require a row for this run, and that is a reading rather than an assumption

**R-055's operative sentence:**

> *"every non-migration **write to the production database** gets a row in it,
> before the PR that performs the write is merged."*

**`CLAUDE.md` 8.8 carries the same mandate in the same terms:** *"a terminal
**write** with no row in one of them is a violation."*

**Signing performs no write.** `createSignedUrls` mints a token over an object
path. It creates nothing, modifies nothing, deletes nothing, and sends no mutating
request. Two of R-055's six fields have no meaning for it: `rows affected` would be
0 forever, and there is no outcome for an assertion to prove.

**The precedent that looks like a counter-example is not one.** The 2026-09-08
`GATE-01` row is described in `docs/PRODUCTION-WRITES.md` as *"the attempted-write
row, which is the first one that wrote nothing"*, and its subject is three INSERTs
that PostgreSQL refused. An attempted write is a write that was sent. Nothing was
sent here.

**The 2026-09-15 run C is not a counter-example either**, although it was a
`--capture-only` signing run: it wrote and deleted a probe object, so it had a
write to journal. This run has none, because the probe is precisely what this
dispatch forbade.

**So: no row. The report alone.** Flagged rather than silent, because there is a
real argument the other way: the file says it answers *"what has a terminal pointed
at production"*, and a signing run does point at production. **If the owner wants
signing logged on that broader reading, that is an amendment to R-055 and a
sentence in `CLAUDE.md` 8.8, not a row a terminal should invent.** R-206 lists
signing (item 4) and the journal row (item 5) as separate permissions and couples
neither to the other; its word is "the **matching** row", and there is no write
here to match.

---

## VERIFICATION

Each exit code captured on its own line, no pipe between a command and its status.

**Baseline, on `d4d593d` with a clean tree, before this report existed:**

    node docs/board/validate-board.mjs (all three boards)   rc=0
    npm run check:unique-ids                                rc=0
    npm run check:open-branch-ids                           rc=0
    npm run check:conflict-residue                          rc=0
    npm run check:board-edit                                rc=0
    npm run check:card-ids                                  rc=0
    npm run check:board-clock                               rc=0
    control: validate-board.mjs on a file that is not a board   rc=1

**Final, on `d4d593d` with this report present**, which is the tree the pull
request proposes and therefore the run that counts:

    node docs/board/validate-board.mjs (all three boards)   rc=0
    npm run check:unique-ids                                rc=0
    npm run check:open-branch-ids                           rc=0
    npm run check:conflict-residue                          rc=0
    npm run check:board-edit                                rc=0
    npm run check:card-ids                                  rc=0
    npm run check:board-clock                               rc=0
    control: validate-board.mjs on a file that is not a board   rc=1

`check-card-ids: OK, every card id on the record resolves to a card.`
`check-conflict-residue: 3 checks passed, no conflict residue in the tree.`

**The control is why the seven greens mean anything.** Seven checks reporting
`rc=0` says nothing until one of them has been seen to refuse, and the control
run refuses a file that is not a board.

**This report carries no URL, no token and no key.** That was checked rather than
assumed, and the result is stated as it is rather than as a tidy zero. The strings
`http`, `eyJ` and `token=` DO occur in this file: here, and in the Part 2 sentence
describing the same check. They are the patterns that were searched for, quoted.
The project ref and the storage host occur nowhere. **No line of this file is a
link or a credential**, which is the claim that matters, and a grep for a scheme
followed by two slashes returns nothing.

---

## DEVIATIONS, every one flagged

**D1. The committed signing script was not used.** Reason in Part 2: it upserts
and it writes a probe object, and this dispatch forbids both. The replacement is
sign-only, is not committed, and is identified by sha256 above. This is the same
class of deviation as D3 of the 2026-09-17 report on rulings R-203 to R-206.

**D2. No `docs/PRODUCTION-WRITES.md` row, on the reading in Part 3.** The
judgment is recorded there in full, with the argument against it, so a reader who
disagrees can see exactly what was decided and on what basis.

**D3. The expiry is computed, not decoded.** `2026-09-18T21:53:11.077Z` is the
moment the batch call was issued plus 86400 seconds, taken from this machine's
clock. It is not read back out of the token, because reading the token would mean
handling it. The two can differ by the request's own latency and by any clock
skew, so the reported expiry is accurate to about a second rather than to the
millisecond its own precision implies.

**D4. One batched call rather than seven.** Recorded because the committed script
signs in a loop and a reader comparing the two would otherwise see a difference
with no reason attached. The reason is the dispatch's own words: "in one pass" and
"the single expiry timestamp".

---

## STATE AT THE END

- **Seven live links, expiring `2026-09-18T21:53:11.077Z`**, in
  `/Users/ivan/rc-samples/ANDRE-SAMPLES-2026-09-17b.md`, mode 0600, outside the
  repository. No key, token or signed URL appears in this report or in any commit.
- **R-199 condition one now has its fresh re-sign.** What it still needs is the
  run itself, against the validator, and R-205 governs what counts as a pass:
  `supplier_name` and `_meta.page_count` populated on the stored draft, never a
  2xx alone.
- The prefix holds seven objects, unchanged by this session.
- Next eligible card is unchanged: **AUT-3**.
