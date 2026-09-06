# Claim leases, one file each

Card CLAIM-01, 2026-09-06.

Each live claim is one file in this directory, named for the card and spelled
exactly as the board spells it:

```
docs/poc/claims/AUT-9.json
```

```json
{
  "card": "AUT-9",
  "claimed_by": "executor",
  "claimed_at": "2026-09-06T15:39:26Z"
}
```

A **release deletes the file**. There is no released-state to record: a lease
that is not held is a lease that is not written down.

## Why a directory and not one object

Claims used to live in a single `claims` object inside `docs/poc/state.json`.
Two branches cut from one base, each claiming a **different** card, each rewrote
that object. The first merged clean. The second **conflicted, through the JSON**:
the `HEAD` side kept its claim's opening brace and the incoming side kept its
claim's closing brace, so a resolution that deleted only the marker characters
left a claims map that did not parse. That is the file the harness reads before
it picks a card.

Two different actors claiming two different cards at the same time is not an edge
case. It is the **normal operation** of a lease shared by a headless harness and
a human terminal that cannot see each other.

One file per claim makes two simultaneous claims two **adds of different paths**,
which git merges without overlap by construction, with no merge driver for
anybody to configure. A release is a **deletion**, which merges the same way.

## What still reads `state.json`

`scripts/poc/run.sh` writes the harness's own claim into `state.claims`, and
`run.sh` is a deployed copy: `scripts/poc/install.sh` puts it in `POC_BIN_DIR`
and installing is an owner action. So `scripts/poc/claims.mjs` reads the
**union** of this directory and that object, with this directory winning. When
the harness has been reinstalled from a `run.sh` that writes here, the legacy
read can go, and the condition for removing it is that sentence.

## Expiry

Six hours, defined once in `scripts/poc/claims.mjs` as `CLAIM_TTL_SECONDS` and
unchanged by this card. An expired file is **ignored on read** and deleted by
whoever next claims or releases that card. A writer that swept its neighbours
would put every claim back into one diff and re-create the collision.

## Commands

```
scripts/poc/claim.sh claim   AUT-9 executor
scripts/poc/claim.sh release AUT-9 executor
scripts/poc/claim.sh check   AUT-9        # exit 3 when claimed
scripts/poc/claim.sh list
```

`check` and `list` write nothing. `claim` and `release` land through a pull
request, like every other change under `docs/poc/`.

**A claim only protects a card once it is on `main`.** That is the latency half
of CLAIM-01 and it is not fixed here; the card records why, and what is used
instead.
