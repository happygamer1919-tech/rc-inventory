# EXECUTOR, 2026-08-28: the login redirect loop

**Role:** EXECUTOR. **Card:** CRIT-17. **PR:** #87, merged.

Committed per AUT-1 and section 9b.

---

## 1. What was reported

The owner could not log in. `rc-inventory-iota.vercel.app` answered
`ERR_TOO_MANY_REDIRECTS` after a successful sign-in, with a screenshot of the
Chrome error page.

## 2. How it was diagnosed, in order

**Nothing was guessed from the error name.** `ERR_TOO_MANY_REDIRECTS` says a
loop exists and says nothing about where.

1. **Read `proxy.ts` first.** Two redirect branches pointed at each other:
   "authenticated and on the login page, so go to `/`" was evaluated BEFORE
   "no active `profiles` row, so go to the login page".
2. **Checked the unauthenticated path live**, on both hosts, because a loop that
   also hit signed-out visitors would be a different defect:

   ```
   https://rc-inventory-iota.vercel.app/               307 -> /autentificare
   https://rc-inventory-iota.vercel.app/autentificare  200
   https://www.rapidconstructmd.com/                   307 -> /autentificare
   https://www.rapidconstructmd.com/autentificare      200
   ```

   Clean. So the loop needs a session, and the branch pair above is the only
   session-carrying loop in the code.
3. **Ruled out the obvious alternative before committing to the answer.** A
   canonical-host redirect from the vercel.app host to the client domain would
   produce the same symptom on that host only. There is none: `next.config.ts`
   sets headers and nothing else, and `NEXT_PUBLIC_SITE_URL` is used in exactly
   one place, to build the extraction callback URL. Cookie options set no
   `domain`, so a cross-host cookie problem was out too.
4. **Checked the RLS policy** that the failing query depends on.
   `profiles_select` allows `id = auth.uid()`, so any authenticated user can
   read their own row. The policy was not the cause.

**The owner confirmed the cause the same day**, independently: the account had
no role assigned, and assigning one restored access. That is exactly the state
the code analysis predicted.

## 3. What shipped

- **The profile is resolved once, before any branch decides where the request
  goes.** A session is usable only together with its profile.
- **A session with no active profile is rewritten, never redirected**, to a
  Romanian screen at `/cont-fara-acces`. A rewrite keeps the requested URL and
  cannot loop from any route, including the login page. The 403 screen already
  worked this way, with a comment saying why; the profile branch did not.
- **That screen sits outside the `(app)` group**, like the login screen, so no
  sidebar and no role badge are rendered around an account that has neither.
- **It carries a sign-out control.** Without one, the only escape from a session
  that leads nowhere is clearing cookies in the browser, which is what the owner
  had to do.

**A second defect fixed in the same line.** The query discarded its error, so a
broken RLS policy, a network fault and a genuinely missing row all produced
`profile === null` and all took the looping branch. An infrastructure fault
would have been reported to the user as a fact about their account, and to
nobody at all in the logs. `PGRST116` is the expected absence; anything else is
now logged. The refusal is unchanged, because entering with an unknown role is
worse than not entering.

## 4. Acceptance

`tests/e2e/auth.spec.ts`, describe block "Cont fara profil activ", four cases,
green in quality run **33166966085**, whole suite **72 passed in 5.9m**:

```
14 > nu intra in bucla de redirectari si vede un ecran romanesc   1.5s
15 > orice ruta protejata da acelasi ecran, nu o redirectare      1.5s
16 > poate iesi din cont, deci sesiunea nu il tine captiv         1.2s
17 > un cont cu profil activ nu este atins de reparatie           2.2s
```

**The state they drive is real, not simulated.** The run step "Seed the three
test accounts" succeeded: `scripts/seed-test-accounts.mjs` now creates a third
auth user and deliberately writes no `profiles` row, and deletes a row left by
an earlier run so the test cannot pass vacuously.

Case 1 counts redirect responses and fails at five or more. Asserting only on
the final screen would have passed before the fix as well, whenever the browser
happened to stop on the good side of the loop.

## 5. What this card did NOT do

**It granted no account any access.** An account with no `profiles` row still
cannot enter; it now learns that in one clear screen instead of a loop. The
owner's access was restored by assigning the role, which is data and was his.

## 6. Deviations flagged

1. **The e2e suite was not run locally.** The only Supabase stack running on this
   machine belongs to another project, and the suite is never pointed anywhere
   else. Proven in CI instead, which is where P2-07 put it. The production guard
   was confirmed still wired first: `npm run check:no-prod-target`, 5 checks.
2. **The card was authored at `in_flight` and flipped to `shipped` in a second
   commit on the same branch**, because the evidence is a CI run that cannot be
   cited before it runs.
3. **The claim PR was closed rather than merged.** CRIT-17 shipped before the
   lease could land, so it would have protected nothing and left a stale claim.
   Same reasoning as the P2-19 and AUT-7 claims the day before.
4. **`docs/LEARNINGS.md` conflicted on merge**, two independent appends. Both
   sides kept, main's first. Verified the way the entry committed the day before
   says to verify it: grepped the resolved file for marker lines, then checked
   both sides present by name.
5. **The PR went `BEHIND` or `DIRTY` three times** while open, because the
   harness lane merges to `main` frequently. Each round cost a branch update and
   a full re-run. Not a defect, but it is why a card of this size took four CI
   runs.

## 7. Two things carried forward, neither of them this card's

- **`TELEGRAM_BOT_TOKEN` is leaked and not yet rotated.** POC-BUILDER's report,
  committed to `main` in #89, records it: a `bash -x` trace printed the token.
  Zero files and zero commits contain it; it exists in a session transcript that
  cannot be scrubbed. Both causes are closed in code. **The rotation is the
  owner's and is outstanding.**
- **PR #83 is an open TRIAGE rulings PR**, `R-039..R-046`, carrying
  `docs/reports/2026-08-28-triage-first-unassisted-pass.md`. That is the event
  AUT-3's acceptance names. **It was deliberately not merged by this terminal:**
  rulings are the TRIAGE and POC lane, it edits the board, and its eight rulings
  have not been read here. AUT-3 ships when it lands.

## 8. State at the end

**33 cards:** 27 shipped, 3 blocked, 2 todo, 1 in flight. **Gates 6/9**, failing
G4, G7, G9. **Next eligible: `no eligible card`.**

Blocked on people: P2-08b on Andre, P2-14 on the client, P2-15 and P2-19 on
Ivan. AUT-3 waits on PR #83 landing.
