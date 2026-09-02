# EXECUTOR, 2026-09-02: P3-11b, the installer is proved by installing and invoking

Card **P3-11b**. Branch `card/p3-11b`. No migration, no database, no secret read,
no production write.

---

## 1. The card's premise about the code was stale. Its premise about the machine was exactly right.

**Verified before writing anything**, per the standing rule that a handed-over
fact is re-derived from the live system rather than transcribed:

```
$ ls /Users/ivan/rc-poc-bin/
responder.sh   run.sh

$ bash /Users/ivan/rc-poc-bin/digest.sh --force
bash: /Users/ivan/rc-poc-bin/digest.sh: No such file or directory
```

But:

```
$ git log --oneline -S"SOURCE_DIGEST" -- scripts/poc/install.sh
7f66002 ASK-01, DIGEST-01: a role asks Ivan and blocks on the answer, and the digest arrives on his clock (#149)
```

**`install.sh` on `main` already installed the digest.** #149 added those lines in
the same commit that shipped `digest.sh`. So the card as titled - "install.sh
installs digest.sh and its launchd agent" - describes work that was already done.

**The card's own default names the real thing, one level up:**

> THE DEFECT IS THAT SHIPPED IS NOT INSTALLED, AND IT IS THE SAME CLASS AS
> MERGED IS NOT APPLIED.

The installer had the lines and had **never been run**. Writing the lines again
would have changed nothing. Making the gap fail is the card.

## 2. What makes it fail now

`scripts/poc/test-install.sh` installs into a **temporary prefix** and then
**invokes what it installed**, at its installed path, with `--force`. It runs in
`quality` on every pull request as **Prove the installer by installing and
invoking**. A change that drops a file from the installer goes red.

No `launchctl`, no `plutil`, no network, no credentials: the digest's one HTTPS
call goes through the documented `POC_DIGEST_OUTBOX` seam, the same seam
`test-ask-digest.sh` uses, and the secrets file is a temporary one holding two
fake values that open nothing. It never writes under `/Users/ivan`, and one of
its assertions is exactly that.

## 3. The installer is one list now

Three agents were three copy-pasted blocks of eight lines. Adding a fourth meant
remembering eight lines in three places, and the failure mode of forgetting one
is an installer that **reports success having deployed part of itself** - which
has already happened here, in a different form, on 2026-08-27.

`POC_MANIFEST` is one table of `LABEL|SOURCE|DESTINATION|MODE|DESCRIPTION` and
every loop derives from it: the pre-flight existence check, the install, the
lint, the bootstrap.

**The installer asserts its own installed count against the row count.** A loop
that reads zero rows installs nothing and reports every step it did not take as a
step that did not fail. That is the class `docs/LEARNINGS.md` names.

## 4. The other file the installer missed, which the card told me to look for

> LOOK FOR OTHER FILES THE INSTALLER MISSES while the card is open

**The rulings spool directories.** P3-11a, shipped earlier today, added
`rulings/pending` and `rulings/consumed`, and its module creates them on first
write. That is **precisely** the race the installer's own comment about `asks/`
exists to prevent:

> the process that WRITES an answer into it is chat-classify.mjs, which runs
> inside the responder and must never be the thing that creates a directory it
> then races another poll to fill.

The same sentence is true of the ruling spool word for word. Both are in the
derived list now, and six spool directories are asserted after the install.

## 5. Two portability changes, both required by the acceptance rather than chosen

**`POC_INSTALL_ROOT`.** Every path was a literal under `/Users/ivan`, so the only
way to find out whether the installer worked was to run it over the owner's live
installation. That is why nobody ran it. The default is unchanged: a real install
is still `bash scripts/poc/install.sh` with no environment at all.

**`digest.sh`'s `PATH` now prepends instead of replacing.** launchd hands a job a
minimal `PATH` with neither node nor git in it, which is why those directories
are named literally, and on the Mac they still win in the same order. What
changed is the `:$PATH` at the end. Replacing `PATH` outright meant the script
could only ever run on one machine, so on a Linux runner node is under
`/opt/hostedtoolcache`, the digest dies at `node`, and the invocation half of
this card's acceptance could not run at all. **An installer proved only by an
invocation that cannot run is the same gap one level up.**

## 6. Acceptance, run, on both environments

```
$ bash scripts/poc/test-install.sh
  ...
  ok    install.sh exits 0 into a temporary prefix
  ok    every manifest row was installed, and the installer counted them itself
  ok    installed run.sh / responder.sh / digest.sh
  ok    installed com.ai.rc-poc.plist / -chat.plist / -digest.plist
  ok    the installed digest is executable
  ok    spool directory rc-poc-logs/rulings/pending exists after the install
  ok    spool directory rc-poc-logs/rulings/consumed exists after the install
  ok    the digest plist names the installed digest path
  ok    the digest agent is scheduled at 8:00
  ok    the digest agent is scheduled at 19:00
  ok    the INSTALLED digest runs from its installed path and exits 0
  ok    the installed digest PRODUCED a digest, 1182 bytes
  ...
  all installer assertions passed        (27 assertions, exit 0)
```

**And on the CI environment itself**, because a proof that only runs here is the
defect this card is about:

```
$ docker run --rm -v <clone>:/w -w /w node:20-bookworm bash scripts/poc/test-install.sh
  ok    the INSTALLED digest runs from its installed path and exits 0
  ok    the installed digest PRODUCED a digest, 661 bytes
  all installer assertions passed
```

## 7. The failing half, and the mistake made building it

The mutant is `install.sh` with the two digest rows removed from the manifest -
exactly the shape it had before #149. Against it: the work harness still
installs, no digest is installed, and invoking the digest it did not install
fails.

**The first attempt built that mutant with `grep -v`, and it was wrong.**
Removing the two digest rows also removed the **last line of the `POC_MANIFEST`
string**, which is where its closing quote lives. The string swallowed everything
after it and the mutant died on a syntax error at line 112. **A mutant that dies
on line 112 installs no digest either**, so the assertion it exists to fail would
have passed while proving nothing.

That is the same defect class `docs/LEARNINGS.md` records as a matcher whose
partial result reads as success, and it is the second time today it has shown up
in a new costume. The mutant is built by parsing now, and it is asserted to
**parse** and to **run and still install the work harness** before it is asserted
to lack a digest.

## 8. The real install is still a separate deliberate act

The command is `bash scripts/poc/install.sh`, run from `main` after this and
P3-11a have merged, so that the `responder.sh` it deploys is the one carrying the
ruling spool. A check that overwrote the thing it is checking would not be a
check, which is why the acceptance uses a temporary prefix and why this step is
not folded into it.
