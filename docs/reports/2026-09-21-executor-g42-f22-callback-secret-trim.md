# P3-86: the callback secret is compared without stray whitespace (Ivan F22)

Role AUTHOR (the card), then EXECUTOR (the build), in one pull request. Run date 2026-09-21.
Operator factory goal G42.

## In plain words

The reading service proves who it is with a shared password each time it sends us a document's
results. If the stored copy of that password had a stray space or a line break at the end, every
call was refused, and nothing on our side said why. Now the spaces around it are ignored, so such
a copy works. Every wrong password is still refused exactly as before. The comparison is also now
done in a way that does not leak timing hints to someone guessing. Andre's side changes nothing.

## Boot report

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in_flight, 0 halted. Launch gate 0/9 (counted
  from `launch_gate.conditions` with status `pass`). Lowest eligible card AUT-3.
- Phase 3 board (read too, RULE-05): 102 shipped, 32 todo. Lowest eligible card P3-14.
- This card was assigned directly by the owner's goal G42. Id from `npm run id:free -- P3-86`:
  FREE, lane highest P3-85, zero open pull requests. `origin/main` was d69c2dd (G40's P3-85 merged).

## The premise was slightly off

F22 said "trim both sides before the constant-time compare". There was no constant-time compare:
both sites compared with a plain `provided !== expected`, which stops at the first differing
character. This card does both halves: it trims, and it compares the SHA-256 digests of the two
trimmed strings with `timingSafeEqual`. Digests are always 32 bytes, so `timingSafeEqual` never
throws on a length mismatch and the secret's length does not leak. The route runs on the Node
runtime (it exports only `dynamic = "force-dynamic"`, no `runtime = "edge"`), so `node:crypto` is
available.

## What changed

- `lib/data/callback-secret.mjs` (+ `callback-secret.d.mts`): `secretMatches(expected, provided)`.
  False when `expected` is not a string or is empty after trim, or `provided` is not a string;
  otherwise `timingSafeEqual(sha256(expected.trim()), sha256(provided.trim()))`. Only surrounding
  whitespace is ignored; inner whitespace counts; case sensitive. Comments in Romanian, ASCII.
- `app/api/extraction/callback/route.ts`: one import line, and in `POST` and `GET` the four-part
  condition becomes `!secretMatches(expected, provided)`. The 401 body `{ error: "secret invalid" }`,
  the status `CALLBACK_CODES.badSecret` and the check's position (first thing) are unchanged.
  Nothing else in the file changed.
- `scripts/poc-free/check-callback-secret.mjs`, `npm run check:callback-secret`, and a new step
  `Check the callback secret comparison` in `.github/workflows/quality.yml`, right after
  `Check the callback key allowlist`, in the same comment style, not path-filtered, no `paths:` key,
  job name `quality` untouched.
- `docs/board/rc-board-phase3.json`: card P3-86 authored, in_flight, then shipped with evidence.

## Places the sibling check appears, and what was mirrored

`git grep -n "check:callback-keys"` hits:

- `package.json`: mirrored (new script line next to it).
- `.github/workflows/quality.yml`: mirrored (new step next to it).
- `tests/e2e/extraction-key-allowlist.spec.ts:17`: a comment about that check only; not mirrored,
  no spec is edited.
- `docs/board/rc-board-phase3.json` card evidence and acceptance: excluded by the task.
- `docs/reports/*.md`: historical reports; not rewritten.

## check:callback-secret output (tail)

```
7. martorul: comparatia veche pe cazul cu spatii
  martor  vechea regula refuza copia cu rand nou: true; acum se potriveste

8. ruta foloseste regula in ambele locuri
  ok    export async function POST exista: asteptat true, primit true
  ok    export async function POST cheama secretMatches(: asteptat true, primit true
  ok    export async function GET exista: asteptat true, primit true
  ok    export async function GET cheama secretMatches(: asteptat true, primit true
  ok    textul `provided !== expected` nu mai apare in ruta: asteptat false, primit false

check-callback-secret: 34 cazuri, toate trec.
```

## Commands run locally, each exit 0

`npm run check:callback-secret` (34 cases), `npm run check:callback-keys`,
`npm run check:numeric-field`, `npx tsc --noEmit`, `npm run build`, the board validator on all
three boards before every commit, `check:card-ids`, `check:unique-ids`, `check:open-branch-ids`,
`check:no-destructive-migration`, `check:conflict-residue`, `check:categories`, `check:ledger-rows`,
`check:no-prod-target`, `check:pending-schema-reads`, `check:removal-safety`,
`check:assertion-register`. `check:board-edit` refused while the card was in_flight, as it should,
and is rerun after the shipped flip is committed.

## Left for CI

This machine has no Docker and no Supabase CLI. The End to end step (every spec in `tests/e2e`,
including `extraction.spec.ts`, which posts with the real test secret and expects 401 on a wrong
one) runs only in the `quality` check on the pull request. No spec was edited.

## Secrets

No secret value was read, printed or written. The check uses obviously fake literals and never
reads the environment. `MAKE_CALLBACK_SECRET` appears only as a name. How the secret is stored,
named or rotated is not touched.

## Andre

Andre told: no. The secret he sends is unchanged; the route now also accepts it when the stored
copy has stray spaces or a newline around it, and refuses every other wrong secret exactly as
before.

## Learnings

Nothing broke while working this card, so `docs/LEARNINGS.md` gets no entry.

## Merge

No self-merge: real client data is in production (factory close-out step 8). The owner is asked to
approve through the factory mailbox once `quality` is green on the head sha and
`npm run checks:state` exits 0.
