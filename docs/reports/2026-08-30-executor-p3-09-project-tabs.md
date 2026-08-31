# EXECUTOR: P3-09, the project detail tabs. The opposite shape on purpose, and a placeholder that outlived its replacement.

**Date:** 2026-08-30
**Role:** EXECUTOR
**Branch:** `card/p3-09-project-tabs`, cut from `origin/main` at `8e2a78e`
**Card:** P3-09
**Migration files added:** `supabase/migrations/0023_project_material_summary.sql`

---

## 0. Boot

Phase 3 board read at `8e2a78e`. **P3-09** is the lowest-id eligible card,
`depends_on [P3-07, P3-04]`, both shipped. Claimed as `executor` through PR #119
before the work began.

---

## 1. The opposite shape from P3-08, on purpose

`public.client_material_summary` in 0022 ranks **products by quantity**.
`public.project_material_summary` in 0023 lists **issues, newest first**.

They look like the same function and they answer different questions:

- The **client** tab answers "what does this customer use". Products, ranked.
- The **project** tab answers "what went to this site and when". Issues, in time
  order.

**One shape would answer neither well**, and P3-09 asks for "newest first" in
terms. Both keep the same two structural rules: at most five rows, and **one
total covering everything rather than only the rows shown**.

**An issue with no lines still appears**, with a zero quantity. It happens: a bon
created and not yet filled. Vanishing would make the count on this tab disagree
with the orders screen, and a reader would trust the wrong one.

---

## 2. A placeholder that outlived its replacement

P3-07 rendered a five-row history preview in the right column of the project
detail, with a comment saying P3-09 would give it a tab. When the tab arrived,
**both existed, and both used `data-testid="history-row"`.**

The P3-07 spec asserts `toHaveCount(3)` on that testid. With both rendering it
would have counted **six** and failed for a reason that has nothing to do with
either card.

The preview is removed and the sibling spec is updated in the same pull request:
it now clicks through to the Istoric tab. **A placeholder that outlives its
replacement is not harmless. It is a second source of the same rows**, and the
first thing to notice it is a count that is exactly double.

Caught by reading the testid before pushing, not by CI.

---

## 3. The leak assertion, again

The fixture gives **another project** a single issue dated **later than every one
of these** and carrying **9000 units** against this project's 280. If the filter
were wrong that issue would both **lead the list** and **dominate the total**, so
one assertion catches two different mistakes.

That is the third card in a row where the fixture's job is to make a wrong join
unmissable rather than merely detectable.

---

## 4. Checks

| check | result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:migrations` | exit 0, 23 files, 9 assertion files passed |
| `node docs/board/validate-board.mjs` | PASS, 0 violations |
| `npm run check:conflict-residue` | 3 checks passed |
| APPLY-LOG pending register | 23 files, 11 pending, each in exactly one place |
| em dash or en dash in any file touched | zero |
| secret staged | none |

---

## 5. Production writes

**None.** One new pending line, no apply entry, no row in
`docs/PRODUCTION-WRITES.md`.

---

## 6. Learnings appended

**None.** The duplicate-testid problem in section 2 is recorded on the card
rather than as a general rule, because it is one instance of something already
written down: P3-07's own notes said the preview was a substitute until this
card. The lesson is to read the note, and the note was there.

---

## 7. Next

Next eligible: **P3-10**, cross-linking, `depends_on [P3-08, P3-09, P3-05]`, all
now shipped. It is also the card **P3-04b and P3-05b are gated behind**, so
shipping it makes the two drop cards eligible for the first time. Next free
migration number: **0024**.
