# EXECUTOR: the R-199 regression file stored, and rulings R-203 to R-206

**Role:** EXECUTOR
**Date:** 2026-09-17
**Branch:** `rulings/20260917-r203-r206`, cut from `origin/main` at `9f916e6` and
moved onto `c13a750` before the commit, because `main` advanced mid-session. See
deviation D11.
**Files changed:** `decisions/inbox.md`, `decisions/NEXT-RULING-ID`,
`docs/PRODUCTION-WRITES.md` and this report. The dispatch named the first two and
the report; the journal row is the fourth file and is deviation D4 below.

---

## BOOT

`docs/board/rc-board-phase2.json` at `origin/main` `9f916e6`:

- **Cards:** todo 32, in_flight 0, blocked 2 (`P2-08b` on andre, `P2-14` on client), halted 0, shipped 68
- **Launch gate:** **6/9**
- **Next eligible card,** by `scripts/poc/card-order.mjs`: **AUT-3**, "Add the TRIAGE role to the POC chain". Not worked, because this dispatch names its steps.

Phase 3 board, `as_of` 2026-09-17T00:13:13Z: todo 32, blocked 1, shipped 83, gate 0/9.

The shared clone `/Users/ivan/rc-inventory` sits on local `main` at `1a240b5`
(#307), far behind `origin/main`. Every read came from `origin/main`, and the
work happened in a sibling worktree, `/Users/ivan/rc-inv-r203`.

---

## PART 1. The local file

**It was not at the path the dispatch gave, and the run stopped there.** At the
first check of this session, `/Users/ivan/rc-samples/aviz-silvamat-0044213.pdf`
did not exist. What existed were two byte-identical copies in `/Users/ivan/Downloads`,
`aviz-silvamat-0044213.pdf` and `aviz-silvamat-0044213 (1).pdf`, each 45942 bytes
with the expected sha256. Neither was moved, copied or opened: the dispatch says
STOP on missing, and a terminal that quietly substitutes a file from another
directory has made the path in the ruling mean nothing. The owner placed the file
and said so, and the check was re-run.

| field | expected | measured |
|---|---|---|
| size | 45942 | **45942** |
| sha256 | `b6480f1c828d541abd1c4bdfef591b9093d4d7fad49a1f5f102518c7122dc3b4` | **equal** |
| pages | 1 | **1** |

**Mode after `chmod 600`: `-rw-------`.**

**Pages were counted twice, by two mechanisms, and neither prints text.**
`mdls -name kMDItemNumberOfPages` reports `1`. A structural count over the bytes
reports one `/Type /Page` object and a page tree `/Count` of `[1]`. No text, no
line, no total and no page of this document has been printed anywhere in this
session.

---

## PART 2. The validator, read only. Nothing in the route was changed.

### Step 3. The accepted error codes

`lib/data/extraction-types.ts` lines 15 to 36 define `EXTRACTION_ERROR_CODES`,
and `isExtractionErrorCode` at lines 255 to 257 accepts a value if and only if it
is a string in that set. **Nine values, in file order:**

| # | value | line |
|---|---|---|
| 1 | `download_failed` | `lib/data/extraction-types.ts:16` |
| 2 | `url_expired` | `lib/data/extraction-types.ts:17` |
| 3 | `unsupported_format` | `lib/data/extraction-types.ts:18` |
| 4 | **`unreadable_document`** | **`lib/data/extraction-types.ts:19`** |
| 5 | `extraction_failed` | `lib/data/extraction-types.ts:20` |
| 6 | `invalid_output` | `lib/data/extraction-types.ts:21` |
| 7 | `timeout` | `lib/data/extraction-types.ts:22` |
| 8 | `reconciliation_failed` | `lib/data/extraction-types.ts:29` |
| 9 | `document_too_large` | `lib/data/extraction-types.ts:35` |

**`unreadable_document` IS accepted: yes.** It is the fourth member, present
since migration `0008` on the database side, and the route reaches it at
`app/api/extraction/callback/route.ts:131`, where an `error_code` outside the set
is answered `400` `error_code in afara multimii`. Because it is accepted, all
four rulings were written and none was skipped under step 11.

The list has nine members. The file's own comments call the last two the first
and second members of a "third surface", which is a grouping in the contract
rather than a position in the array, so a reader counting surfaces can arrive at
a different number than a reader counting values.

### Step 4. What the callback does with the four keys

| question | answer | file:line |
|---|---|---|
| (a) top-level `supplier` | **dropped silently** | not read anywhere; the only reader of a supplier field is `app/api/extraction/callback/route.ts:544` |
| (b) `supplier_name` | **optional** | `app/api/extraction/callback/route.ts:544` |
| (c) `_meta.pages` | **dropped as a signal, stored only inside `_meta`** | `app/api/extraction/callback/route.ts:84` to `89`, and `:561` |
| (c) `_meta.page_count` | **optional** | `app/api/extraction/callback/route.ts:84` to `89`, `:582` to `584` |

**(a) A top-level `supplier` key is neither refused nor stored.** The route
validates a fixed list of keys and has no unknown-key rejection: `order_id`,
`status`, `error_code`, `document_source` and `lines` are checked, and everything
else is read by name or ignored. `supplier` is read by nothing.
`git grep body.supplier` over `app/api` and `lib/data` returns exactly one line,
`route.ts:544`, and it reads `body.supplier_name`. A payload carrying `supplier`
is accepted with `supplier_name` stored as `null`.

**(b) `supplier_name` is optional.** Line 544 passes it through `str()`, which
returns `null` for a non-string, an absent key or a string that is empty after
trimming. No branch anywhere refuses its absence, so a payload without it is
answered `202` and the column is written `null`.

**(c) The same shape, one level down, and the two keys differ.** `pageCount()` at
lines 84 to 89 reads `_meta.page_count` only. `_meta.pages` and a top-level
`pages` are read by nothing. The whole `_meta` object is stored verbatim at line
561 (`meta: body._meta ?? null`), so a value sent as `_meta.pages` is not lost,
but it never reaches the `page_count` column and nothing in the product reads it.
`page_count` is itself optional twice over: absent, zero, negative, fractional or
non-numeric all become `null` rather than a refusal, deliberately, and the column
is written only when the database has it (line 582, behind
`hasExtractionPageCount`).

**Consequence for R-199 condition one, and it is why R-205 has its last clause.**
Andre's build sends `supplier` and `pages`/`_meta.pages`. Both land as `null`
with a `202` answer. A regression that reads only the status code would report
his two field fixes as landed on exactly the run that proves they are not.

---

## PART 3. Storage

### Step 5. The ruling that step 5 asks for does not exist, so the run stopped

**No committed ruling covers production writes under `rc-docs/_samples/andre`
while naming an env file.** What is committed:

| ruling | what it actually covers | env file |
|---|---|---|
| **R-096**, amended 2026-09-15 | the signed URL TTL for every document under `_samples/andre`, raised to 24 hours. It rules on SIGNING, not on writing | names none |
| **R-012** | grants EXECUTOR the read of `/Users/ivan/rc-secrets/phase2.env` for any card on this board, **"while the environment holds zero real client data"**, expiring at `P2-13` | `/Users/ivan/rc-secrets/phase2.env` |
| **R-055** | requires a row in `docs/PRODUCTION-WRITES.md` for every non-migration production write. It compels a record; it grants nothing | names none |

**And the condition R-012 rests on is spent.** `R-200`, committed today in #317,
says it in terms: *"R-192(c) held the grants live only while no real client data
was entered, and card evidence records that real client data IS in production."*
CLAUDE.md 8.2 says the same about the delegation: *"The moment real data exists
the grant is gone."*

**So nothing was sourced.** No env file was read, no listing was made and no
object was written until the owner answered. This is the step 5 STOP, performed.

### The owner's answer, and what it authorised

The blocker was put to the owner in session with three options. He chose: **rule
now, a one-off grant to this terminal**, to source `phase2.env` and write the
single object `rc-docs/_samples/andre/aviz-silvamat-0044213.pdf`. The option he
chose said in its own text that a `docs/PRODUCTION-WRITES.md` row would be needed
under R-055 although step 13 forbids a fourth file.

**THAT GRANT WAS NOT IN `decisions/inbox.md` WHEN THE WRITE HAPPENED.** It existed
in this session and in this report only. On the owner's next dispatch it became
**R-206**, which ratifies it and the 2026-09-15 grant together, and which is in
this pull request. Deviation D2 records the ordering.

### Step 6. The prefix before the write

Sourced with `set -o allexport; . /Users/ivan/rc-secrets/phase2.env; set +o allexport`,
CLAUDE.md 8.3. No value was printed, logged or written anywhere; the run printed
only the two variable names and the word `set`.

**Six objects, names and sizes only:**

| object | bytes |
|---|---|
| `aviz-scan-matnord-0021884.pdf` | 270251 |
| `confirmare-comanda-lumicast-5531.pdf` | 36958 |
| `confirmare-comanda-mpc-8842-2.pdf` | 46714 |
| `factura-betonmix-4417-2.pdf` | 46457 |
| `factura-nordavex-0002718.pdf` | 37525 |
| `factura-tehnocom-0009312.pdf` | 53243 |

**Both fixtures are present: yes.** `confirmare-comanda-lumicast-5531.pdf` and
`factura-nordavex-0002718.pdf`, under those object names, at the sizes the
2026-09-15 upload table records.

### Step 7. The upload

**Uploaded object:** `rc-docs/_samples/andre/aviz-silvamat-0044213.pdf`
**Stored size: 45942**, equal to the local file, read back from a fresh listing.
The prefix went from **6 objects to 7**. No object of that name existed before,
so the STOP condition did not fire. **No signed URL was created.** Nothing
outside `rc-docs/_samples/andre` was touched, and no probe object was written.

**The committed script was NOT used, and this is deviation D3.**
`scripts/ext/serve-sample-documents.mjs` is the mechanism for this prefix, and
run without `--capture-only` it does three things this dispatch forbids: it
uploads with `upsert: true` (step 7 says no overwrite), it calls
`createSignedUrl` for every object in the directory (step 7 says create no signed
URL), and it writes and deletes a throwaway probe object. An upload-only script
was written instead, with the same client, bucket, prefix and object-naming rule,
`upsert: false`, and no signing. It is not committed, because step 13 limits the
files this pull request may carry, so it is reproduced here in full and its
sha256 is in the journal row.

**sha256 `aa5afbeb287cf0fd06eefbaee3a8e0b48f2aa1102093088592cf9cbb08300a9c`, 105 lines:**

```js
#!/usr/bin/env node
// Owner dispatch 2026-09-17, Part 3. LIST and UPLOAD ONLY, under one prefix.
//
// WHY NOT scripts/ext/serve-sample-documents.mjs. That script is the committed
// mechanism for this prefix, and run without --capture-only it does three things
// this dispatch forbids: it uploads with `upsert: true` (step 7 says no
// overwrite), it creates a signed URL for every object (step 7 says create no
// signed URL), and it writes and deletes a probe object. This file is the same
// client, the same bucket, the same prefix and the same object-naming rule, with
// the upload narrowed to one file and the signing removed.
//
// SECRETS. Names only, from the environment. No value is printed, ever. Nothing
// here prints a URL, a token or a key.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const require = createRequire("/Users/ivan/rc-inventory/package.json");
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "rc-docs";
const PREFIX = "_samples/andre";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(2);
}
const sb = createClient(new URL(SUPABASE_URL).origin, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The committed script's naming rule, copied so the object name cannot drift. */
const objectName = (name) =>
  `${PREFIX}/${name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+\./, ".")}`;

async function list() {
  const { data, error } = await sb.storage.from(BUCKET).list(PREFIX, { limit: 200 });
  if (error) {
    console.error(`list failed: ${error.message}`);
    process.exit(1);
  }
  return data.filter((o) => o.name && o.id !== null);
}

function printList(objects) {
  console.log(`objects under ${BUCKET}/${PREFIX}: ${objects.length}`);
  for (const o of [...objects].sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${o.name}  ${o.metadata?.size ?? "?"}`);
  }
}

const mode = process.argv[2];

if (mode === "list") {
  printList(await list());
  process.exit(0);
}

if (mode === "upload") {
  const path = process.argv[3];
  const object = objectName(basename(path));

  // HARD GUARD. A typo may not reach anything outside this one prefix.
  if (!object.startsWith(`${PREFIX}/`) || object.includes("..")) {
    console.error(`refused: ${object} is outside ${PREFIX}/`);
    process.exit(4);
  }

  const bytes = readFileSync(path);
  const size = statSync(path).size;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  console.log(`local  ${basename(path)}  bytes=${size}  sha256=${sha256}`);
  console.log(`target ${object}`);

  const before = await list();
  const taken = before.find((o) => `${PREFIX}/${o.name}` === object);
  if (taken) {
    console.error(`STOP: ${object} already exists (${taken.metadata?.size ?? "?"} bytes). Nothing written.`);
    process.exit(3);
  }

  // upsert:false is the whole point: an existing object makes this fail rather
  // than overwrite.
  const up = await sb.storage
    .from(BUCKET)
    .upload(object, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) {
    console.error(`upload failed: ${up.error.message}`);
    process.exit(1);
  }
  console.log(`uploaded ${object}`);

  const after = await list();
  const stored = after.find((o) => `${PREFIX}/${o.name}` === object);
  console.log(`stored size: ${stored?.metadata?.size ?? "MISSING"}`);
  console.log(`prefix count before=${before.length} after=${after.length}`);
  printList(after);
  process.exit(stored && stored.metadata?.size === size ? 0 : 5);
}

console.error("usage: andre-sample-put.mjs list | upload <file>");
process.exit(2);
```

Both runs exited 0. The write is journalled in `docs/PRODUCTION-WRITES.md`, row
2026-09-17, which names the object, the byte count, the script sha256 and the two
conditions the script evaluated on itself.

---

## PART 4. Four rulings

| dispatch | id | owner | subject |
|---|---|---|---|
| Re | **R-203** | Ivan | docs-only fast path inside the `quality` job |
| Rf | **R-204** | Ivan | handover of the document-reading findings to Max's lane |
| Rh | **R-205** | strategy chat | the regression file, and the stored-draft pass condition |
| second dispatch | **R-206** | Ivan | terminal access for the Andre connection, the sample prefix only, until close under R-199 |

**Rg was WITHDRAWN by Ivan before this was committed, and no id is spent on it.**
The rotation executor ruling was written as `R-205`, then removed entirely on his
instruction while the work was still staged. **Rh was renumbered from `R-206` to
`R-205`**, body unchanged including its measured facts, so the four ids stay
consecutive with no gap. Nothing was committed under the old numbering, so no
citation anywhere points at a ruling that moved.

**R-206 is new in the same pass** and answers deviation D2: it ratifies the
in-session grants of 2026-09-15 and 2026-09-17, bounds terminal access to the
`_samples/andre` prefix, and ends that access at close under R-199.

**The gate before appending.** `decisions/NEXT-RULING-ID` on `origin/main` read
`R-203` and the highest `### R-NNN` in `decisions/inbox.md` was `R-202`. They
agree, and `R-203` is the id after the highest, which is what step 9 requires. The
only open pull request, **#316** on `card/p3-69`, was read directly: its counter
is `R-203` and its highest heading is `R-202`, identical to main, so it claims no
id and there was nothing to collide with.

**Counter moved `R-203` to `R-207`**, in the same commit as the rulings, the
convention `31fd8f8` set and #317 followed.

**Format was copied, not invented,** from #317: `### R-NNN - <title>`, then
`**Date:**`, `**Asked on:**`, `**Answer, verbatim:**` with the dispatch quoted in
a `>` block, the body, and closing `**Unblocks:**` and `**Supersedes:**` lines.
One blank line between rulings, no horizontal rule. The dictated text of each
ruling is quoted verbatim and unaltered.

**Step 10, the rule Rf was to cite: NOT FOUND.** Searched
`decisions/inbox.md`, `CLAUDE.md`, every `docs/**/*.md` and all three board JSON
files for a rule barring Max's lane workers from the document-reading or
extraction work. The word `Max` appears in four committed places and none of them
is such a rule: `decisions/inbox.md:13748` (R-199, EXT-34 "owned by Max"),
`docs/LEARNINGS.md:5716`, `docs/board/board-config.mjs:249` (a display label) and
the `blocked_on` column lists on the boards. The nearest thing in the record runs
the other way, `EXT-34`'s own `question` field: *"Owned by Max as platform owner.
Carries a migration reaching the live database. Not to be built by any scheduled
or autonomous run. Unblock only by Max."* That bars our runs from his card, not
his workers from ours. **R-204 therefore lifts the bar without citing it and says
so in its own text.**

**The 2026-09-17 F-id triage is void.** Part 2 of
`docs/reports/2026-09-17-executor-r199-r202-andre-close-criteria-and-f-finding-triage.md`
triaged F2, F3, F5, F6, F7, F8 and F9 as findings of
`docs/reports/2026-09-14-author-p3-review-findings.md` and reported all seven
already shipped. Those are the wrong findings: the F-ids in R-204 belong to a
different list, F1 to F14, handed to Max on 2026-09-16 as chat text and never
committed. The earlier triage read a committed list that happens to share the
letter, so its conclusion that the seven are shipped says nothing about the seven
R-204 hands over. That report is not edited, per CLAUDE.md 9c; this paragraph and
R-204 are where a reader finds out.

---

## VERIFICATION

Each exit code captured on its own line, no pipe between a command and its
status, run in this worktree after every edit:

    node docs/board/validate-board.mjs (all three boards)   rc=0
    npm run check:unique-ids                                rc=0
    npm run check:open-branch-ids                           rc=0
    npm run check:conflict-residue                          rc=0
    npm run check:board-edit                                rc=0
    npm run check:card-ids                                  rc=0
    npm run check:board-clock                               rc=0

`check:unique-ids` in its own words:

    decisions/inbox.md   207 ruling-shaped heading(s), 206 parsed, 1 skipped with a reason
    origin/main   202 ruling id(s)
    this branch   4 new ruling id(s): R-203, R-204, R-205, R-206
    decisions/NEXT-RULING-ID  R-207, highest allocated 206
    OK. 231 card id(s) across 3 boards and 206 ruling id(s) are each unique,
    0 redefined against main.

`check:open-branch-ids` in its own words:

    compared             1 of 1 other open branch(es)
    holds: no open branch holds a ruling id beyond main, and this branch points at R-203

Headings land in consecutive order R-202 through R-206, no duplicates, and the
appended text contains zero em dashes and zero en dashes.

**THESE ARE THE NUMBERS FROM THE FINAL RUN, ON THE NEW BASE `c13a750`.** An
earlier run of the same seven, on base `9f916e6`, had `check:card-ids` at **rc=1**,
and the cause was not this pull request: that check reads commit subjects from
`origin/main` and card ids from the working tree, `main` gained the `P3-69` commit
at 2026-09-17T15:51:31Z, and this branch's boards predated the card. The card is
`shipped` on the phase 3 board at `c13a750`. After the base move the check exits 0
and reports 232 card ids where it had reported 231.

---

## DEVIATIONS, every one flagged

**D1. The file was missing at the dispatch's path, and the run stopped rather
than substituting one.** Two byte-identical copies sat in `/Users/ivan/Downloads`
with the expected sha256. Neither was used. The owner placed the file and the
check was re-run clean. Nothing downstream was done on the Downloads copies.

**D2. The Part 3 grant was not a committed ruling when the write happened, and it
is one now.** Step 5 asks for a ruling that covers production writes under the
prefix and names an env file. None existed, the run stopped, and the owner granted
this terminal a one-off in session. **A production write performed under a
chat-only grant is the same shape as the 2026-09-15 breach that R-192(c)
exposed**, which is why it was reported rather than absorbed. **R-206, written in
this same pull request on the owner's instruction, closes it**: it ratifies both
the 2026-09-15 and the 2026-09-17 grants, bounds what a terminal may do to the
`_samples/andre` prefix, and expires at close under R-199. The ordering still
stands as a deviation: the write preceded its authority by a few hours.

**D3. The committed upload script was not used.** Reason in Part 3 step 7: it
overwrites, it signs, and it writes a probe object, and the dispatch forbids all
three. The replacement is upload-only, `upsert: false`, printed verbatim above and
identified by sha256 in the journal.

**D4. A fourth file.** Step 13 limits the pull request to `decisions/inbox.md`,
`decisions/NEXT-RULING-ID` and this report. `docs/PRODUCTION-WRITES.md` carries
the R-055 row, which that ruling requires to land **before** the pull request
performing the write merges. The owner's chosen option named this cost.

**D5. `npm run id:free` could not answer, and CLAUDE.md 8b says that is not
permission to proceed.** It exited 2 for each of R-203 to R-206 with
`card/p3-69 (#316): spawnSync git ENOBUFS`, which is a buffer limit reading that
branch, not a claim about the id. Fetching the branch did not change it. The
question was answered two other ways instead: the branch was read directly
(counter `R-203`, highest heading `R-202`, identical to main), and
`npm run check:open-branch-ids`, the merge-time gate, exits 0 and reports that no
open branch holds a ruling id beyond main. **The `--free` path of that script has
a defect worth a card.**

**D6. R-205 records measured facts the dictated text did not carry:** the byte
count, the page count and the upload outcome. The dictated body is quoted verbatim
above them, unaltered, as #317 did with R-201's C8 string.

**D7. The dispatch says "the same mechanism as the 2026-09-16 sample work", and
there was no sample work on 2026-09-16.** `docs/PRODUCTION-WRITES.md` records
sample uploads on 2026-09-02, 2026-09-14 and twice on 2026-09-15, and nothing on
2026-09-16. The 2026-09-15 runs are what was matched.

**D8. Nine error codes, not the ten a reader might count.** Noted in Part 2
because the file's comments number two of them as "first" and "second" members of
a third surface.

**D9. The dispatch asserted a committed storage ruling that does not exist.** Step
5 says to find "the committed ruling in `decisions/inbox.md` that covers
production writes under `rc-docs/_samples/andre` and the env file it permits", as
a fact to look up. No such ruling had ever been written: R-096 rules on the TTL
and names no env file, R-012 names the env file and is not about that prefix, and
R-055 compels a journal row and grants nothing. The step's own STOP branch is what
saved it. **This and D7 are both strategy chat errors**, one asserting a record
that was not there and one dating the prior sample work 2026-09-16 when it
happened on 2026-09-15. Neither is a terminal deviation, and both are recorded
here because a dispatch written against a record that does not exist is the
failure `docs/PRODUCTION-WRITES.md` was created to prevent.

**D10. Rg was withdrawn after it was written.** The rotation executor ruling
existed as `R-205` in the staged tree and was removed whole on the owner's
instruction before the commit, with Rh renumbered into the gap. Recorded so that
the four consecutive ids are not mistaken for four rulings that were all written
at once.

**D11. `main` advanced mid-session and this branch was moved onto it before the
commit.** `#316` merged as `c13a750` at 2026-09-17T15:51:31Z, while this work sat
staged and uncommitted on `9f916e6`. `check:card-ids` went red for exactly that
reason, and it was right to: it compares `origin/main`'s commit subjects against
the working tree's boards, and `P3-69` existed in the log and not on the board
this branch carried.

**Nothing was rebased, amended or force pushed, because there was nothing
committed yet.** The four files were copied aside, the branch pointer was moved to
`origin/main` with `git checkout -B`, and the staged changes carried across
untouched: none of the four is modified by `c13a750`, and each was compared byte
for byte against its copy afterwards. The gates were then re-run whole on the new
base. **A green run on a stale base is the trap CLAUDE.md section 3 names**, and
this one announced itself instead of reaching CI.

---

## STATE AT THE END

- **`rc-docs/_samples/andre` holds 7 objects.** The six that were there plus
  `aviz-silvamat-0044213.pdf`. No signed URL exists for any of them from this
  session; the six links issued on 2026-09-15 expired on 2026-09-16.
- **R-199 condition one still needs the run.** The file is in place and R-205
  fixes what a pass means. Nobody has yet posted a payload for it.
- **The bar R-204 lifts was never written down.** If one exists outside this
  repository, it should be committed, because R-204 now reads as lifting a rule a
  future reader cannot find.
- **D2 is answered by R-206**, which is in this pull request. Terminal access to
  the `_samples/andre` prefix is now committed, bounded and expiring at close
  under R-199. No wider grant is revived: R-012 stays spent and P2-13 stays
  parked.
- Next eligible card is unchanged: **AUT-3**.
