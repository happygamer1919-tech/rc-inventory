# CRITIC: bug sweep of every screen shipped since 2026-09-14

Card: none. Goal G47, queue task `066-g47-critic-bug-sweep.md`.
Written 2026-09-22 by the CRITIC terminal on Max's machine.
Branch `card/critic-bug-sweep`, cut from `origin/main` at 8274b0a (PR #349, P3-91).

No application code, no migration and no board card changed in this pull request.
This is the report. POC queues the fixes afterwards, by severity.

---

## 0. What could and could not be driven, and what that means for every finding below

**The local stack does NOT reach a database on this machine. No screen could be driven by
hand. Production was never opened and no production row was ever read.**

What was checked, in order, before taking that decision:

1. **Environment files.** `find` over `/Users/sm33xy/Projects/rc-inventory` and every worktree
   under `/Users/sm33xy/Projects/rc-inventory-worktrees` found exactly one `.env*` file:
   `rc-inventory-worktrees/lb1-p3-54-favicon/.env.local`. Its own first three lines say what it
   is: *"P3-54 local proof only. Gitignored. Placeholder values, no credential: points at a
   local Supabase address that does not run on this machine, so no database is reached and the
   production guard cannot match it."* It carries two names only,
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the URL is a
   `http://127.0.0.1` address. There is no credential on this machine, and none was fetched.
2. **Docker and the Supabase CLI.** `which docker supabase` reports both "not found". This
   matches `KNOWN-FAILURES.md` line 41 and the project `CLAUDE.md`: the end to end suite and
   the applier proofs run only in CI.
3. **`npm run dev` was tried anyway**, with that placeholder file copied into this worktree.
   The server starts (Next.js 16.3.1, ready in 421 ms, no compile error), which is real
   evidence that every route compiles. But every route answers with the same 14,518 byte
   page, and its visible text is: *"Autentificare - Rapid Construct ... Introdu datele
   contului pentru a intra în sistemul de inventar."* `/`, `/azi`, `/clienti`,
   `/incarca-comanda` and `/inventar` all return the login screen, because the session cannot
   be established against a Supabase that is not there. **No application screen renders.**

**So the pivot in the task brief applies, and this is what the evidence below actually is:**

- Every finding marked **read** is a code read: the component, its server action, its data
  function and, where it matters, the migration that owns the column. Each one names
  `file:lines` so any reader can check the same lines. This is weaker than clicking the
  screen, and it is stated plainly on every finding.
- The shipped `tests/e2e/*.spec.ts` files were read as evidence of what is and is not
  covered. Two findings below (F9, F10) are coverage gaps found that way.
- Nothing was driven at 1280 px or at 390 px. Phone findings are read from the `max-md:`
  classes in `components/ui/phone.ts` and the components that use them, not from a rendered
  page, and are marked "(phone, read only)".
- No screen was blocked badly enough to need its own mailbox question. The sweep covers all
  seven groups.

### The board

No board card was authored for this review. The precedent is the previous CRITIC pass,
PR #281 (G5), which changed exactly two files: `docs/LEARNINGS.md` and its report under
`docs/reports/`, and carried no card. `scripts/poc-free/check-board-edit.mjs` exempts any path
under `docs/` or `decisions/` (its `test: (p) => p.startsWith("docs/") || p.startsWith("decisions/")`),
so a board edit is neither required nor appropriate here. The same two paths are what
`.github/workflows/quality.yml` calls `docs_only`, so this pull request takes the P3-73
documentation fast path.

---

## Findings

Severity is one of **breaks work**, **wrong**, **cosmetic**, and is argued on each finding
rather than asserted.

---

<!-- FINDINGS GO HERE -->

---

## Checked, no defect

<!-- CHECKED LIST GOES HERE -->
