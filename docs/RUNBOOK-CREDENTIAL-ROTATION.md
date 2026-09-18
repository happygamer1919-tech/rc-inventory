# Credential rotation runbook (card P2-13)

**Authored 2026-09-18 by AUTHOR for goal G33. Every box below starts unticked.**
Nobody has rotated anything yet. This file is the checklist; rotation day is when
it is worked.

**Who works it: Max, the platform owner.** See "Who is the owner now" below.
Max ticks each box in this file (change `- [ ]` to `- [x]`) and commits it, so
the finished state is recorded in the repository and not in anyone's memory.
P2-13 ships only when every box is ticked:

    grep -c "^- \[ \]" docs/RUNBOOK-CREDENTIAL-ROTATION.md    must print 0
    grep -c "^- \[x\]" docs/RUNBOOK-CREDENTIAL-ROTATION.md    must print the full item count

**THIS FILE NEVER CONTAINS A CREDENTIAL VALUE.** Variable names, places and
steps only. If you copy a new key, paste it straight into the Vercel or Supabase
box it belongs in. Never paste it here, into a chat, into a board field, into a
commit, or into a terminal. If a value ever lands somewhere it should not,
treat it as leaked and rotate it again (CLAUDE.md section 7).

**Do it in one sitting.** P2-13's own recommendation: one checklist, one
session, every box, so there is no window where some old keys still work and
nobody can say which.

---

## Who is the owner now

**Added 2026-09-18 by ruling R-207, a correction under CLAUDE.md section 9c.**
The true statement comes first. The superseded one stays below it, quoted, and
is not deleted.

**THE TRUE STATEMENT.** As of 2026-09-17, **Max is the platform owner.** Ivan's
own words, relayed by Max: "the whole platform is yours." So:

1. **Every "Ivan" in this runbook's approval steps now reads "Max".** Wherever
   P2-13's card text says Ivan executes, Ivan ticks, Ivan approves, or a pull
   request returns to Ivan, read Max.
2. **The automatic merge script Max runs, `scratchpad/auto-merge.sh`, is Max's
   own decision as owner.** It is not a delegation from Ivan and it does not
   rest on any terminal grant this runbook revokes. Whether it keeps running
   after rotation day is Max's call alone.
3. **Ivan's terminals keep their GitHub access and keep opening pull requests.**
   This runbook revokes terminal-held DATABASE and service credentials. It never
   revokes, and never suggests revoking, any terminal's or any person's GitHub
   access. No step below touches GitHub permissions.

**THE SUPERSEDED SENTENCE, KEPT.** P2-13's `plain` field on
`docs/board/rc-board-phase2.json` says:

> *"It is also the moment the workshop loses the right to approve its own work:
> from then on nothing reaches the live system without Ivan, and no automated
> helper can change the database at all, for any reason."*

**Corrected by ruling R-207.** "Without Ivan" is superseded: from 2026-09-17 it
reads "without Max". The rest of the sentence stands. The card's title ("executed
by Ivan"), its question ("Only Ivan can perform it") and its defaults ("Ivan
ticks boxes", "IVAN-ONLY FROM THEN ON") are corrected the same way and are left
as written on the board, because this task does not edit P2-13's text.

---

## Before you start: what you need open

- The **Vercel** dashboard, logged in, on the RC Inventory project
  (live at https://app.rapidconstruct.md).
- The **Supabase** dashboard, logged in, on the RC Inventory production project.
- The **Resend** dashboard, for the email sender step.
- This file, in an editor, to tick boxes as you go.
- A helper terminal (any Claude session) that can make the one pull request at
  the end which ticks these boxes and edits `CLAUDE.md`. It needs no credential
  for that; it only edits files.

**Where the settings live, in plain words:**

- **Vercel environment variables:** open the project, click **Settings**, then
  **Environment Variables**. Each variable has a name (for example
  `SUPABASE_SERVICE_ROLE_KEY`) and a hidden value. To change one: click the
  three dots next to it, **Edit**, paste the new value, **Save**. Changing a
  variable does not affect the live site until it is redeployed: go to
  **Deployments**, click the three dots on the newest production deployment,
  **Redeploy**.
- **Supabase keys:** open the project, click **Project Settings** (the gear at
  the bottom left), then **API Keys**. The database password is under
  **Project Settings**, then **Database**.

---

## Part 1. Preconditions: tick these BEFORE any credential is rotated

These are checks, not changes. If one cannot be ticked, stop: rotating first
would remove access that the unticked item still needs.

- [ ] **The Andre connection is closed under R-199, so rotation may start (R-200).** R-200 says rotation happens only after that close and on no other trigger. The close was announced by Ivan on 2026-09-17 around 15:50 (relayed by Max). Re-confirm on the day that nothing has re-opened it.
- [ ] **Every migration file is recorded as applied (R-072, corrected by R-095 and R-130).** On rotation day, look at the highest numbered file under `supabase/migrations/` THAT DAY, and confirm every file up to it has an APPLIED entry in `docs/migrations/APPLY-LOG.md` and that its Pending section is empty. Do not rely on any count written anywhere earlier: re-check against the files as they are on the day. Because the register records what a terminal applied and not what production holds (R-130, CLAUDE.md 8.0), also confirm the applied ledger read on the day agrees with it.
- [ ] **P3-35 has shipped, OR a dated ruling says its four launch conditions are unreachable (R-095).** P3-35 is the read-only check of the phase 3 schema against production, and four phase 3 launch conditions wait on it. It was still `todo` on `docs/board/rc-board-phase3.json` when this runbook was written (2026-09-18). After rotation no terminal can take that read, so check P3-35's status on `docs/board/rc-board-phase3.json` on the day: tick this only if it says `shipped`, or if a ruling in `decisions/inbox.md` dated on or before the day rules those four conditions unreachable.
- [ ] **The unshipped-card count is written down and the owner has been told what it means (R-157).** On rotation day, count every card whose status is not `shipped` across `docs/board/rc-board.json`, `docs/board/rc-board-phase2.json` and `docs/board/rc-board-phase3.json`, and write the number here: ______. After this checklist every one of those cards' pull requests comes back to the owner (Max) for approval (CLAUDE.md 8.7: "Deleting section 3.1 returns every PR to Ivan", which now reads Max, per R-207). It is a count, not a threshold: the right number is the owner's to judge. For scale only, and NOT the number to write: on 2026-09-18 the count was 67.
- [ ] **The cards P2-13 depends on are settled.** P2-08b (the live extraction round trip) and MIG-01 (whether the Supabase integration keeps applying merged migrations to production) are shipped or decided, and GATE-03 is shipped. Without MIG-01 decided, the rewritten CLAUDE.md section 8 in Part 4 would describe a mechanism whose fate is open.
- [ ] **Every seeded test row carries the cancelled flag, and none was deleted (P2-07 convention).** Before real data arrives, confirm each test row made during the build is marked cancelled or inactive, never deleted. The P2-21 detector (enumerates our own rows from committed sources) is the tool for this once it ships; until then this is a manual check in the Supabase table view. The one deliberate exception is `scripts/reset-test-data.sql`, an owner-run cleanup file that says so in its own header.
- [ ] **The proof `npm run prove:anon-write-refused` will stop being runnable after today, and that is intended (R-173).** It reads the secrets file, which Part 3 revokes. Its committed evidence stays valid; it just cannot be re-run on demand. A later reader who finds it failing should read this line instead of concluding the proof is broken.

---

## Part 2. Rotate the credentials

**How to rotate one value, the same every time:** make a new value in the
service that owns it, paste it into the matching Vercel environment variable,
redeploy, confirm the site works, and only then delete or revoke the old value.

**Checking the site works after each change:** open
https://app.rapidconstruct.md, log in, open the stock list. Also open
https://app.rapidconstruct.md/api/health and check it answers.

### Must rotate

- [ ] **Rotate `SUPABASE_SERVICE_ROLE_KEY` (R-001 item c).** In Supabase: **Project Settings**, **API Keys**. If the page shows the newer "secret" keys, click **Create new secret key**, copy it, paste it into the Vercel variable `SUPABASE_SERVICE_ROLE_KEY`, redeploy, check the site, then come back and delete the old secret key. If the page only shows the older "service_role" key, rotating it means rotating the project's JWT secret (**Project Settings**, **JWT Keys**), which ALSO changes the anon key: in that case update both `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel before redeploying.
- [ ] **Rotate `VERCEL_TOKEN`.** In Vercel: click your avatar, **Account Settings**, **Tokens**. Delete every token that a build terminal used (the one named for RC Inventory or created during the build). Create a new one only if you personally need it, and keep it only in your own password manager. No terminal gets a copy.
- [ ] **Rotate `SUPABASE_DB_PASSWORD` (R-001 item b).** In Supabase: **Project Settings**, **Database**, **Reset database password**. Let it generate one, store it only in your own password manager. The live app does not use this password, so nothing in Vercel changes. It is the password terminals used to connect directly; rotating it is what actually ends that access.

### Owner's decision on each (tick once decided, and write which)

Each of these was handled during the build. For each one, rotate it or decide
not to, write the decision on the line, and tick.

- [ ] **Supabase anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).** Decision: rotate / keep: ______. This key is public by design (the browser uses it), so rotating it is optional unless the service role rotation above already changed it. If rotated: new value into the Vercel variable, redeploy.
- [ ] **`MAKE_CALLBACK_SECRET`.** Decision: rotate / keep: ______. This is the password Andre's Make scenario sends when it posts results back to us. If rotated, the new value must go into BOTH the Vercel variable and Andre's scenario at the same moment, or document reading stops. Andre is a live partner: tell him before, and note in the rotation pull request whether he was told.
- [ ] **`X-RC-Secret` (stored in Vercel as `MAKE_WEBHOOK_SECRET`).** Decision: rotate / keep: ______. `X-RC-Secret` is the header our app sends to Andre's scenario; its value is the Vercel variable `MAKE_WEBHOOK_SECRET`. Same rule as above: change both sides together, and tell Andre first.
- [ ] **`RESEND_API_KEY`.** Decision: rotate / keep: ______. In Resend: **API Keys**, create a new key, paste into the Vercel variable `RESEND_API_KEY`, redeploy, then delete the old key in Resend.

### Dev accounts

- [ ] **Rotate the password of both dev accounts before they are retired (R-003, CRIT-10 log exposure).** The accounts are `owner@rc-inventory.local` and `manager@rc-inventory.local`. In Supabase: **Authentication**, **Users**, find each, and set a new password (or send a reset). Reason: before CRIT-10, the login form put the password in the web address, so it sits in Vercel's request logs. Treat the whole Vercel log retention period as the time it was exposed; the fix stopped new leaks but cannot erase old log lines. Rotating makes the logged value worthless.

### Email and the real owner account

- [ ] **Set `RESEND_FROM` in the Vercel production environment (item e).** It must be a sender on the verified Resend identity, which is the `send.` subdomain and NOT the root domain (for example a sender at send.rapidconstructmd.com). In Vercel add or edit `RESEND_FROM`, Production, save, redeploy. Until it is set, stock reminders go out from Resend's onboarding address.
- [ ] **Create the real owner account, and confirm `owner_reminder_recipients()` returns it (item f).** In Supabase: **Authentication**, **Users**, **Add user**, with the real owner's email, then give it the owner role the app uses. Then in **SQL Editor** run `select * from owner_reminder_recipients();` and confirm the real owner's address is in the result. Today it returns only the seeded dev account on `rc-inventory.local`, a domain that does not exist, so stock reminders go to nobody.

---

## Part 3. Remove every copy a terminal ever held

Each place is its own box so none is forgotten. "Remove" means delete the file
or the lines; the keys are already worthless after Part 2, and this makes sure
nothing old is left lying around to be confused with the new ones.

- [ ] **The secrets file `/Users/ivan/rc-secrets/phase2.env` on Ivan's machine.** Deleted, or emptied of every value (R-001 item d). This is the file every terminal grant read from.
- [ ] **Local `.env.local` files, in every checkout and every worktree** of this repository on Ivan's machine and on Max's machine (for example the main checkout and every folder under `rc-inventory-worktrees`). Deleted or emptied of values.
- [ ] **Any other `.env` file** that ever held one of the names in Part 2 (`.env`, `.env.production`, `.env.development`, copies in Downloads or on the desktop). Deleted.
- [ ] **Shell history** on every machine a terminal ran on: `~/.zsh_history` and `~/.bash_history`. Any line containing a key value, a database connection string or a `PGPASSWORD=` setting is deleted (or the history file is cleared).
- [ ] **Scratchpad files**: any `scratchpad/` folder, notes files, and temporary files a session wrote. Searched for the names in Part 2 and cleaned of any value found next to them.
- [ ] **Anything pasted into a chat**: Claude sessions (their saved transcripts under `~/.claude/projects/` on each machine), Telegram (including the project bot chat), email, WhatsApp or any other messenger. Messages that contain a value are deleted where the app allows it. The values are already rotated, so this is housekeeping, not the protection.
- [ ] **Command line tool logins on each machine**: the Vercel CLI and Supabase CLI login files, if either was ever logged in by a build terminal. Log out (`vercel logout`, `supabase logout`), which also deletes the stored token.

---

## Part 4. End every terminal grant, by name

CLAUDE.md 8.7 requires these to be revoked in writing, not just by rotating
keys. Each ruling below said in its own text that P2-13 ends it. Each is its own
box because a checklist that names some grants and leaves the rest to a general
phrase ends up revoking some (GATE-03). These boxes are ticked in the same pull
request that edits `CLAUDE.md`, approved by Max.

- [ ] **R-001, the migration-apply delegation to EXECUTOR: revoked.** CLAUDE.md section 8 is reverted to owner-only applies, with no database connection from any terminal. This also revokes the single permitted read of `/Users/ivan/rc-secrets/phase2.env` in section 8.3 (R-001 item a). The owner-only wording names Max, per R-207, and describes the Supabase integration as MIG-01 decided, so the rewritten section is true about this repository.
- [ ] **R-007, the one-shot secrets read for migration 0006: confirmed already closed.** Its own text ended it the moment 0006 was journalled, a narrower window than P2-13. Confirm 0006 is journalled in `docs/migrations/APPLY-LOG.md`. Nothing to revoke; this box confirms the window shut.
- [ ] **R-012, the board-wide secrets read that superseded R-007: revoked.** It was granted "until P2-13" and rests on zero real client data. It ends with section 8.3 in the box above; tick this to record it by name.
- [ ] **R-047, the grant to execute a DELETE-class script that proves its own outcome: revoked.** The exception in CLAUDE.md section 8.6 ("The one exception, added 2026-08-28 by ruling R-047") is marked revoked.
- [ ] **R-082, the migration-applier grant (`scripts/apply-pending-migrations.mjs` run by a terminal): revoked.** The second exception in CLAUDE.md section 8.6 is marked revoked, named by id and not left to the general phrase "reverting section 8".
- [ ] **R-049, the original self-merge grant on documentation-shaped paths: revoked**, by deleting (or marking revoked under section 9c) CLAUDE.md section 3.1.
- [ ] **R-056, which extended that self-merge grant to AUTHOR: revoked** with section 3.1.
- [ ] **R-059, which widened self-merge to every path for EXECUTOR, AUTHOR, POC-BUILDER and TRIAGE: revoked** with section 3.1. From here every terminal pull request waits for Max's approval. This does NOT touch `scratchpad/auto-merge.sh`, which is Max's own decision as owner (R-207), and does NOT touch anyone's GitHub access.
- [ ] **R-206, the Andre sample-prefix access: confirmed already closed.** Its coverage ended at close under R-199. Nothing to revoke; this box confirms it.

---

## Part 5. Finish

- [ ] **The site works on the new keys.** https://app.rapidconstruct.md loads, the real owner account can log in, the stock list opens, and https://app.rapidconstruct.md/api/health answers.
- [ ] **This file is committed with every box ticked, in one pull request with the CLAUDE.md edits, approved by Max.** Before committing, `grep -c "^- \[ \]" docs/RUNBOOK-CREDENTIAL-ROTATION.md` prints 0. Nothing in the pull request contains a credential value: read the diff before approving it.
