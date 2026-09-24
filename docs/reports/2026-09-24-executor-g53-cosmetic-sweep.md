# EXECUTOR report - P3-98, goal G53, the cosmetic sweep

**Role:** AUTHOR first, then EXECUTOR. One card, one branch (`card/p3-98`), one pull request.
**Date:** 2026-09-24 (UTC).
**Card:** P3-98, on `docs/board/rc-board-phase3.json`, id allocated with `npm run id:free -- P3-98`
(answered FREE, lane highest P3-97, zero open pull requests read from the GitHub API).
**Branch cut from:** `origin/main` at `4510a08`.

---

## 0. Boot, as CLAUDE.md section 1 requires

| Board | shipped | todo | blocked | halted | total | launch gate |
|---|---|---|---|---|---|---|
| `docs/board/rc-board-phase2.json` | 68 | 32 | 2 | 0 | 102 | 0/9 |
| `docs/board/rc-board-phase3.json` | 113 | 32 | 1 | 0 | 146 | 0/9 |

Next eligible card by the repository's own ordering (`scripts/poc/card-order.mjs`): **P3-14**, on
phase 3. The task for goal G53 directs a new card instead, and that card is P3-98, authored here.
Both phase boards were read, per the known defect RULE-05 that CLAUDE.md section 1 names only
phase 2.

---

## 1. What the goal asked for, quoted

> **B1 + F12 + F13 + F17 + F18, cosmetic.** Azi shows a blank, not the stage name, when no step text
> exists; Romanian counts above nineteen take the "de" form everywhere ("20 de produse"); the two
> chip colours reach 4.5:1 and the contrast spec covers chips; the document type check accepts an
> empty browser MIME on a `.pdf` extension.

All five are delivered in this pull request. Nothing else is.

---

## 2. B1. The Azi next step column stops printing a stage name

**Read first:** `components/clients/AziScreen.tsx`, `lib/data/clients-types.ts:34`,
`lib/data/azi.ts:86-109`.

The cell was `{r.nextAction ?? (r.dueFrom === "follow_up" ? "De reluat" : "-")}`. `De reluat` is not
a sentence anybody wrote: it is `CLIENT_STAGE_LABEL.follow_up`, the stage label, in a column whose
header promises a next step. The operator could not tell a lead with a written step from one
without.

**The repair is the dash**, because the goal line says a blank and offers no instruction phrase to
invent. The cell is now `{r.nextAction ?? "-"}`, which is the same dash the branch beside it already
showed.

**What did not change, and the acceptance case proves each one:** `dueFrom` itself, and every rule
in `lib/data/azi.ts:93-95` that decides which rows reach the list. A De reluat lead whose date is
today or earlier still appears, still in the right order, still red when overdue, still carrying the
`Întârziat` chip on its own date.

**A test that encoded the defect.** `tests/e2e/azi-screen.spec.ts` carried
`await expect(r.getByTestId("azi-next-action")).toHaveText("De reluat")`. That assertion is changed
to `"-"`. Under the three laws in the close-out block, a test that encodes a bug is fixed by fixing
the bug, and the assertion is not deleted, only corrected, with the reason written beside it.

**New case:** `B1: un lead De reluat fără pas scris arată liniuță, unul cu pas își arată textul, iar
ordinea rămâne`. It holds both halves in one case on purpose: split apart, neither would say
anything about the distinction the column exists to make.

---

## 3. F12. Seven hand rolled two form plurals become the three form rule

`lib/data/format.ts:41-48` has implemented the three Romanian forms correctly since CRIT-12, and its
own comment explains why there are three. Seven call sites did not use it.

| Screen | File | At 20, shipped | At 20, now |
|---|---|---|---|
| Clienți header | `components/clients/ClientsScreen.tsx` | `20 leaduri` | `20 de leaduri` |
| Clienți header | `components/clients/ClientsScreen.tsx` | `20 clienți` | `20 de clienți` |
| Azi header | `components/clients/AziScreen.tsx` | `20 întârziați` | `20 de întârziați` |
| Review queue | `components/orders/ExtractionReviewPanel.tsx` | `20 poziții citite` | `20 de poziții citite` |
| Documente tab | `components/documents/DocumentsPanel.tsx` | `cele 20 documente` | `cele 20 de documente` |
| Manual order confirmation | `components/orders/ManualOrderScreen.tsx` | `20 poziții` | `20 de poziții` |
| Upload order confirmation | `components/orders/UploadOrderScreen.tsx` | `20 poziții` | `20 de poziții` |

**The seventh is `UploadOrderScreen.tsx`**, which the critic report names in the same breath as the
manual one. It was read as the task directed, it holds the identical hand rolled ternary over a
counted noun, and it is repaired the same way. Said here as the task asked.

**`AziScreen`'s "de sunat" line is deliberately untouched.** The report is explicit: "de sunat" is a
verb phrase, not a counted noun, so `plural` does not apply. The two branches that produced the
identical string (`rows.length === 1 ? "1 de sunat" : \`${rows.length} de sunat\``) are collapsed
into one, which changes no character of what appears on screen, and the acceptance case asserts the
displayed form rather than the code shape. No wording anywhere is changed beyond the singular and
plural form itself: these are the same sentences, correctly agreed.

**Acceptance:** `tests/e2e/romanian-counts.spec.ts`, seven cases. The Romanian rule is
re-implemented in the spec rather than imported from the application, the same convention
`tests/e2e/copy-fixes.spec.ts` follows for P3-51, so the test does not check the application with
the application's own function. **No table is emptied and no row is deleted to reach any number:**
where a count has to pass nineteen for the "de" form to appear, it is reached by ADDING rows. The
Leaduri case creates twenty leads carrying a search term of their own, so the filtered count is
exactly twenty; the review queue case posts a callback with twenty lines.

---

## 4. F13. The orange and amber chip tones reach 4.5:1

**Measured with the same WCAG 2.1 formula `tests/e2e/button-contrast.spec.ts:67-84` uses**, first
verified to reproduce every number in the critic report exactly (2.92, 3.44, 4.99, 4.93, 5.83, 4.93,
4.60 and 3.04, all eight identical), so the numbers below are on the same scale as the report's.

| Tone | Text on background | Before | After | AA 4.5:1 |
|---|---|---|---|---|
| **orange chip** | `#f06801` -> `#b34e00` on `#fff5ea` | **2.92:1** | **4.87:1** | now passes |
| **warn chip** | `#b7791f` -> `#96600f` on `#fff8e6` | **3.44:1** | **4.98:1** | now passes |
| ok | `#1f7a45` on `#eefaf2` | 4.99:1 | 4.99:1 | unchanged |
| danger | `#c92a2a` on `#fff0f0` | 4.93:1 | 4.93:1 | unchanged |
| info | `#1e5fa8` on `#eef4fc` | 5.83:1 | 5.83:1 | unchanged |
| neutral | `#6b6b73` on `#f7f7f8` | 4.93:1 | 4.93:1 | unchanged |
| primary button | `#ffffff` on `#c25401` | 4.60:1 | 4.60:1 | unchanged |
| primary button, hover | `#ffffff` on `#a84900` | 5.80:1 | 5.80:1 | unchanged |

Chip text is `text-[12px] font-semibold`, which is not WCAG large text (that begins at 18.66px
bold), so 4.5:1 is the threshold that applies, not 3:1.

**Both new colours keep the hue to the degree.** `#f06801` and `#b34e00` are both hue 26; `#b7791f`
and `#96600f` are both hue 36. Only the lightness moves, so the chips stay recognisably orange and
amber and the backgrounds stay pale and unchanged.

**Two new tokens, rather than moving an existing one**, and each existing token is left exactly as
it was for a stated reason:

- `--color-rc-orange` is the menu marker, the tab underline and the focus outline, and P3-53
  recorded in `app/globals.css:18-21` that none of those carries white text. Untouched.
- `--color-rc-orange-deep` is the link colour on eleven screens (`app/(app)/page.tsx`,
  `components/documents/DocumentsPanel.tsx`, `components/projects/*`, and more). Darkening it would
  restyle links this card was not asked to touch. Untouched.
- `--color-rc-warn` is a background swatch (`bg-rc-warn` on the CRM colour dot and the lead stage
  dot) and a border as well as a text colour. Untouched.

Added instead: `--color-rc-orange-chip: #b34e00` and `--color-rc-warn-chip: #96600f`, used by the
chip and by nothing else. Every chip background and every chip border is unchanged.

---

## 5. F17. The contrast spec now measures every chip tone

`tests/e2e/button-contrast.spec.ts` was three tests about white labels on the primary button plus
the account initials circle. No chip was measured, which is exactly why F13 was invisible to CI.

**The three existing tests are unchanged**, byte for byte, and still pass. Three cases are added:

1. the orange chip on `/setari` ("Doar administrator"), measured on the element the application
   itself renders;
2. the amber chip on `/memento` ("N sub prag"), the same;
3. all six tones at once.

**Why the third case renders rather than navigates.** Four of the six tones have no guaranteed place
on any screen: `info` appears only on an issued quote, `danger` and `ok` only where the data happens
to put them, and a spec that had to create a project, a quote and a stock-out to measure a colour
would be a slow and fragile way to measure a colour. The third case therefore renders one chip per
tone **in the real page, with the real stylesheet**, from the application's own class strings, and
measures what the browser computed. The bridge between that and the real component is the first
assertion in the case: the real chip's `class` attribute must equal `CHIP_BASE` plus its tone, so
the rendering cannot drift from `Chip` without the case failing first and saying so.

**That is why `components/ui/chip-tones.ts` exists.** The class map moved out of
`components/ui/primitives.tsx` into a plain module with no React in it, so the spec can import it
rather than re-typing six class strings that could fall silently out of step. `primitives.tsx`
re-exports `ChipTone`, `CHIP_BASE`, `CHIP_TONES` and `CHIP_TONE_NAMES`, so no other file in the
application changes.

**The red arm.** The task asks that the new assertions be seen to fail on today's `main` colours.
They were pushed first, on the same branch and in the same session, ahead of the colour change. See
section 8 for the run and what it reported.

**Out of scope, recorded for a follow-up card:** the `text-rc-muted-2` hint colour measures
**3.04:1** (`#93939d` on `#ffffff`), below the 4.5:1 threshold. The goal names the two chip colours,
so it is not touched here. It wants a card of its own.

---

## 6. F18. A valid PDF is no longer refused when the browser reports no MIME type

### 6a. Reproduced first, and the reproduction changed the test

The critic report rated its own confidence on F18 lower than the rest and asked the fix card to
start by reproducing it. It was reproduced, and the first thing the reproduction produced was a
correction to the obvious way of writing the test.

**`setInputFiles({ mimeType: "" })` does NOT produce a file with an empty type.** Measured on
Chromium through Playwright 1.62.1: Playwright fills the type in from the extension, and on
`factura.pdf` it produces exactly `application/pdf`, which is the case that already worked. A test
written that way would have gone green against the unrepaired guard and proved nothing.

What does reproduce it is building the file in the page, `new File([octets], name)` with no third
argument, and placing it on the input through a `DataTransfer` followed by a bubbling `change`
event. Measured: `input.files[0].type` is the empty string and the application's own `onChange`
receives it. The acceptance case asserts that premise about itself before it asserts anything about
the screen, so it cannot pass down some other path.

### 6b. The repair reaches one step further than the report's line, and here is why

The report's line is `components/orders/OrderDocumentUpload.tsx:47`, and the goal says the server
side check stays exactly as it is. Both are respected. But a repair confined to the message would
have delivered nothing, and that is a measurement, not an opinion:

- `uploadOrderDocument` (`lib/data/inbound-actions.ts:178`) repeats the same exact string comparison
  against the same three types.
- A `File` whose `type` is the empty string arrives at a server action as **`application/octet-stream`**.
  Measured, not assumed: a file with no type was posted through `FormData` from Chromium to a local
  server, the part header read `Content-Type: application/octet-stream`, and `formData()` on the
  other side returned a `File` with that type.
- So the server would have refused it, with the same Romanian sentence, and the operator would have
  been exactly where he started, only later.

**The repair is therefore to take the type to its canonical form before sending**, inside the one
box the goal names:

- an alias the browser did give is corrected (`image/jpg` -> `image/jpeg`);
- a type the browser did NOT give is read from the extension, which is what the operating system
  would have done had it known the extension, and is the same thing `DocumentsPanel` and
  `lib/data/document-actions.ts:163-165` already do for the Documente tab;
- the file is sent with that type.

**The server side check is untouched and nothing is loosened.** It still refuses everything that is
not a PDF, a PNG or a JPEG, and the bucket still applies its own limits from migration 0044. **A
type the browser did give and that is not accepted stays refused: the extension cannot rescue it**,
which is why a `.txt` declared `text/plain` is still turned away. A genuinely wrong kind with no
type at all, a `.exe`, is refused too, because its extension is not one of the four.

A consequence worth naming: the page count and the MIME type that reach the extraction webhook are
now the real ones for such a file, where before the upload never got that far.

**Out of scope, recorded for a follow-up card:** `lib/data/extraction-actions.ts:95-96` holds the
identically shaped exact MIME comparison for the upload box on `/incarca-comanda`. The goal names
the one box, so it is not touched here. It wants a card of its own.

---

## 7. The two findings this card recorded and did not fix

Written as one line each, as the task asked, for follow-up cards:

1. **`text-rc-muted-2` measures 3.04:1** (`#93939d` on `#ffffff`), below the 4.5:1 the app enforces
   elsewhere, and it is the hint colour under every page title and on several small captions.
2. **`lib/data/extraction-actions.ts:95-96` compares the browser's MIME string exactly**, the same
   shape as F18, so the same valid PDF is refused by the upload box on `/incarca-comanda`.

---

## 8. CI, in order

To be resumed when the runs conclude. The first push is a deliberate red arm and the pull request is
opened as a **draft**, because the owner auto-merger merges on the first green and does not merge a
draft (`docs/LEARNINGS.md`, the P3-97 entry).

---

## 9. Local gates

This machine has no Docker and no Supabase CLI, so the end to end suite and the applier proofs run
only in CI. Everything that needs no database was run here. Each command was run alone, with no
pipe, and its exit code read on the next line, per CLAUDE.md section 6.

To be completed in section 8's resume.

---

## 10. What changed, by path

| Path | Why |
|---|---|
| `components/clients/AziScreen.tsx` | B1, the dash; F12, the overdue counter |
| `components/clients/ClientsScreen.tsx` | F12, both header counters |
| `components/orders/ExtractionReviewPanel.tsx` | F12, the kept line counter |
| `components/documents/DocumentsPanel.tsx` | F12, the Vezi toate link |
| `components/orders/ManualOrderScreen.tsx` | F12, the confirmation line |
| `components/orders/UploadOrderScreen.tsx` | F12, the confirmation line (the seventh site) |
| `components/ui/chip-tones.ts` | new: the chip class map, importable by the spec (F17) |
| `components/ui/primitives.tsx` | F17, `Chip` reads the map and re-exports the names |
| `app/globals.css` | F13, two chip text tokens added beside the untouched ones |
| `components/orders/OrderDocumentUpload.tsx` | F18, the guard and the canonical type |
| `tests/e2e/azi-screen.spec.ts` | B1, the new case and the corrected assertion |
| `tests/e2e/romanian-counts.spec.ts` | new: F12, seven cases |
| `tests/e2e/button-contrast.spec.ts` | F13 and F17, three cases added, three unchanged |
| `tests/e2e/order-document-type.spec.ts` | new: F18, four cases |
| `docs/board/rc-board-phase3.json` | the card |
| `docs/LEARNINGS.md` | the ERROR/SOLUTION pairs |
| `docs/reports/2026-09-24-executor-g53-cosmetic-sweep.md` | this file |

**No file under `supabase/migrations/` is added or changed.** No migration was needed and none was
written.

---

## 11. Rules held

- Romanian on screen with proper diacritics; no English string reaches the UI. Desktop first, and
  the 390px layout is untouched: this card changes text and colour, not layout.
- No em dash and no en dash anywhere in the diff.
- The `lead=` grep trap was respected: nothing was renamed or swept on the word lead, and the
  `PageHeader` prop is untouched.
- The phone class duplication (goal G56) was not touched.
- Test data is never deleted, and no table is emptied to reach a number.
- No self-merge. Real client data has been in production since 2026-09-14, so the close-out block's
  step 8 revokes the CLAUDE.md section 3.1 grant on every path.
