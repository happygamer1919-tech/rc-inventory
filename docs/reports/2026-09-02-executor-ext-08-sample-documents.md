# EXECUTOR, 2026-09-02: EXT-08, the four sample documents and the failure contract

Card **EXT-08**. Branch `card/ext-08`. Worktree `/Users/ivan/rc-inventory-exec`.
No migration. No database write. One production **storage** write, journalled in
`docs/PRODUCTION-WRITES.md`.

---

## 1. The short version, for Andre

**The failure contract was not met, and it was not close.** Supabase Storage
answers `400` to all three conditions, and it uses the **same** machine-readable
code, `InvalidJWT`, for an expired link and for a broken one, which is exactly the
distinction that was asked for. A route now sits in front of it and translates,
once, into a fixed contract: `docs/contracts/document-url.md`.

| condition | Storage today | through our route |
|---|---|---|
| expired token | `400`, `code: InvalidJWT` | **`400`, `code: EXPIRED_TOKEN`** |
| invalid token | `400`, `code: InvalidJWT` | **`401`, `code: INVALID_TOKEN`** |
| object not found | `400`, `code: NoSuchKey`, real status buried in the body | **`404`, `code: OBJECT_NOT_FOUND`** |

**No path anywhere returned `text/html`, in either layer**, and that was checked
on more than the three: the public-object route, the authenticated-object route,
the sign route with the token omitted, an unknown storage route, the project root
and an unknown top-level path all answered JSON. That is the one part of the
contract Storage already held.

## 2. What was measured, verbatim

Probed against the real project on 2026-09-02. Tokens redacted; the project
origin is written `<PROJECT>`. Volatile transport headers (`date`, `cf-ray`,
`set-cookie`, `alt-svc`, `connection`, `cf-cache-status`) are dropped; nothing
else is.

### 2.1 Expired token, direct on Storage

```http
GET <PROJECT>/storage/v1/object/sign/rc-docs/_samples/andre/_probe-1788360942866.pdf?token=<JWT>

HTTP/1.1 400 Bad Request
content-length: 110
content-type: application/json; charset=utf-8
sb-gateway-mode: direct
sb-gateway-version: 1
sb-project-ref: bwhzatwwjqmyfesfnisa

{"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim timestamp check failed","code":"InvalidJWT"}
```

### 2.2 Invalid token, direct on Storage

Signature tampered with, payload untouched, so `exp` is still in the future.

```http
GET <PROJECT>/storage/v1/object/sign/rc-docs/_samples/andre/_probe-1788360942866.pdf?token=<JWT>

HTTP/1.1 400 Bad Request
content-length: 103
content-type: application/json; charset=utf-8
sb-gateway-mode: direct
sb-gateway-version: 1
sb-project-ref: bwhzatwwjqmyfesfnisa

{"statusCode":"400","error":"InvalidJWT","message":"signature verification failed","code":"InvalidJWT"}
```

### 2.3 Object not found, direct on Storage

A still-valid token whose object was deleted underneath it. That is the only way
Storage answers `NoSuchKey` on a signed URL: `createSignedUrl` refuses to sign a
path that does not exist, returning `StorageApiError: Object not found` with
`status: 400`, so a never-existed object never gets a URL at all.

```http
GET <PROJECT>/storage/v1/object/sign/rc-docs/_samples/andre/_probe-1788360942866.pdf?token=<JWT>&cb=1788360949127

HTTP/1.1 400 Bad Request
content-length: 88
content-type: application/json; charset=utf-8
sb-gateway-mode: direct
sb-gateway-version: 1
sb-project-ref: bwhzatwwjqmyfesfnisa

{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
```

### 2.4 Two other things the probe found, both worth knowing

**A deleted object was served `200` with its old bytes from the CDN.** The first
probe deleted the object and re-fetched the same URL without a cache-buster:
`200 OK`, `cf-cache-status: HIT`, `x-smart-cdn: true`, and the file came back. The
cache-busted request one minute later gave the `NoSuchKey` above. **A document
deleted from the bucket stays retrievable through a live signed URL for as long
as the CDN holds it.** Nothing in this card changes that, and no card exists for
it. It matters for a supplier document only if one is ever deleted, which policy
0002 deliberately makes impossible for every application role.

**A token signed for one object, used against another, is a fourth shape.**
`{"statusCode":"400","error":"InvalidSignature","code":"InvalidSignature"}`.
The route maps it to `INVALID_TOKEN`, which is correct: the link is broken, not
expired.

## 3. What was built

- **`app/api/documents/[...path]/route.ts`** - the route. Forwards to Storage,
  streams the bytes on success, and on failure never forwards the upstream body.
  Needs no secret: `NEXT_PUBLIC_SUPABASE_URL` is the only variable it reads, and
  authorisation stays entirely with the signed token, so the route cannot grant
  access the link does not already grant.
- **`app/api/documents/route.ts`** - the bare prefix, so Next's HTML 404 page
  cannot appear on it.
- **`lib/data/document-url.ts`** - the code table, the URL rewriter, and the
  classifier.
- **`proxy.ts`** - `/api/documents` added to `isPublic()`. See section 5.
- **`lib/data/extraction-fire.ts`** - `document_url` now carries the route URL.
  See section 6.
- **`docs/contracts/document-url.md`** - the contract, for the other side.
- **`tests/e2e/document-url.spec.ts`** - eight cases, in `quality`.
- **`scripts/poc-free/check-document-url-contract.mjs`** - 22 cases, in `quality`.
- **`scripts/ext/serve-sample-documents.mjs`** - uploads the samples, signs them
  and re-captures everything above on demand.

## 4. The defect this card found in itself, and why the test caught it

The first classifier switched on the body's `code` field. It was written from the
captures above, which all carry one.

**The Supabase storage server in the local stack does not send `code` at all.**

```
hosted  {"statusCode":"400","error":"InvalidJWT","message":"...","code":"InvalidJWT"}
local   {"statusCode":"400","error":"InvalidJWT","message":"..."}
```

Both token cases therefore fell through to the unrecognised branch and answered
`502` instead of `400` and `401`. Two of the eight end-to-end cases failed on the
first local run, which is how it was found.

**The inverse of that mistake would have been caught by nothing.** A classifier
keyed only on what the local server sends passes CI forever and fails against the
hosted project, and CI has no access to the hosted project and must not have any.
`scripts/poc-free/check-document-url-contract.mjs` closes that half: it replays
the captured bodies of **both** deployments, plus the code-to-status pairing, with
no network at all.

## 5. The proxy exception is part of the contract, not a convenience

`proxy.ts` protects every path by default and redirects a request with no session
to `/login`. Make has no session. Without the `/api/documents` entry in
`isPublic()`, **every failure on this route would be a 307 to an HTML login page,
and a client that follows redirects would get `200 text/html`** - the exact
response the contract forbids, on every failure at once.

The proxy matcher already excludes paths ending in `.pdf`, so today most of these
requests never reach the proxy anyway. That is not something to rely on: an
object with no extension, or a different one, does reach it. Case 6 of the spec
uses a path with no extension for exactly that reason.

## 6. `document_url` in production now goes through the route, and that was a
decision

The card says to put a route in front of Storage if the contract does not hold.
It does not hold. `lib/data/extraction-fire.ts` previously sent Make the raw
Supabase signed URL.

**Leaving it that way would have made the contract true for the four sample
documents and false for every real one**, which is worse than not having it: the
other side would program against it and it would fail in production only. The
shape, bucket, path, token and TTL are unchanged; only the origin moves. The
production TTL stays 15 minutes. The six fields of the fire payload are unchanged
and `tests/e2e/extraction.spec.ts` still asserts exactly those six.

## 7. The four documents

Uploaded to `rc-docs` under `_samples/andre/`. Signed through
`createSignedUrl`, the same call the application uses, TTL **7200 seconds**.

| file | bytes | sha256 |
|---|---|---|
| `aviz-scan-matnord-0021884.pdf` | 270251 | `822caa0d5a81d754ef941d9b73de5f3cbc47b552ecbecf6ec2488a9896887d02` |
| `confirmare-comanda-mpc-8842 (2).pdf` | 46714 | `fb53aa9e925684d9e1d32431dd1110bd950f8cf1f46b4e2498fe662af485cbe7` |
| `factura-betonmix-4417 (2).pdf` | 46457 | `5639ce76378504ac2151707a9b66c78588782b63a68fd861597876e5272aa645` |
| `factura-tehnocom-0009312.pdf` | 53243 | `fafca5c2c863dba2c503474a6d749c714fc4c5e0bd0f410cef0820ac05bbd465` |

**No line count, no total and no page count for any of them appears in this
report, in the board, or in anything sent to Andre.** The point of the set is
that the extractor produces them unaided, and an expected value sent alongside
the file cannot be taken back.

**One note on the three-page invoice, which is about how to WRITE an acceptance
rather than about what the answer is.** The hardest defect in that document is a
description tail that belongs to one line sitting after both a repeated page
header and a carry-forward row, so it is separated from its own line by two
structures. If it misattaches, the result is a corrupted product NAME on a
document where every number still reconciles, and **no total-based check can see
it**. Any acceptance written against that document asserts the affected line's
name, not only its figures.

## 8. The links are not live until this merges, and that is captured too

Re-running the capture against `https://www.rapidconstructmd.com` before this
branch is deployed returns, for all three conditions:

```http
HTTP/1.1 404 Not Found
content-type: text/html; charset=utf-8
x-matched-path: /404
server: Vercel

<!DOCTYPE html><html data-dpl-id="dpl_7aTVsP3xjHLQ4kRF2v5T3eHZv9ek" lang="ro">...
```

Next's own 404 page: HTML, on every failure path. It is included here because it
is the most concise possible statement of what this card is for, and because it
is the exact state the eight-case spec exists to make impossible to return to.

**The working links go to Andre after this merges and Vercel deploys**, from a
re-run of `scripts/ext/serve-sample-documents.mjs`, together with the
route-level captures of the same three conditions. They are not committed here
because a two-hour token committed now is an expired token by the time anybody
reads it.

## 9. Acceptance, run

```
$ npx playwright test document-url.spec.ts --project=chromium
  8 passed (8.8s)

$ npm run check:document-url
  check-document-url-contract: 22 cazuri, toate trec.

$ npx tsc --noEmit
  (exit 0)
```

The eight cases: valid link serves the bytes; expired is 400 `EXPIRED_TOKEN`;
tampered is 401 `INVALID_TOKEN`; deleted object is 404 `OBJECT_NOT_FOUND`; no
token is 401 and not a redirect; a path with no extension is 401 and not a
redirect; the bare prefix is 404 JSON and not Next's page; a non-GET method is
405 JSON. Every failure case additionally asserts `application/json` and the
absence of `<!doctype` and `<html` in the body.
