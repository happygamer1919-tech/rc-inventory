# Contract: the document URL and its three failure paths

**Card EXT-08. Written 2026-09-02 by EXECUTOR. Every status and body below was
MEASURED against the real project on that date, not read from documentation.**

This is the contract the extraction side programs against. It covers the URL that
carries a supplier document from Rapid Construct to the extractor, and it exists
because Make reports a non-document response as a data error and captures the
body: without a stable contract, an EXPIRED link and a BROKEN link arrive on the
other side as the same event.

---

## 1. The URL

```
https://www.rapidconstructmd.com/api/documents/<bucket>/<object path>?token=<jwt>
```

Same bucket, same object path, same token and same TTL as the Supabase signed
URL it is built from. Only the origin and the path prefix differ:
`/storage/v1/object/sign/` becomes `/api/documents/`. The TTL is the `exp` claim
inside the token and nothing on our side changes it.

`document_url` in the extraction fire payload (`docs/contracts/extraction-v2.md`
section 3) is this URL. The six fields of that body are unchanged.

## 2. Success

`200`, the bytes, with the object's own `content-type` and `content-length`, plus
`cache-control: private, no-store`.

## 3. The three failure paths

| condition | HTTP | `code` |
|---|---|---|
| the token has expired | **400** | `EXPIRED_TOKEN` |
| the token is invalid, absent, tampered with, or signed for a different object | **401** | `INVALID_TOKEN` |
| the token is good and the object is not there | **404** | `OBJECT_NOT_FOUND` |

Body, always:

```json
{
  "code": "EXPIRED_TOKEN",
  "error": "Legatura a expirat. Cere una noua; documentul este intact.",
  "document_url_contract": "docs/contracts/document-url.md"
}
```

**`code` is the field to switch on.** `error` is Romanian prose for a human
reading a Make execution log and it may be reworded without a card. `code` may
not: it changes only through a card, and `scripts/poc-free/check-document-url-contract.mjs`
fails CI if the code-to-status pairing above moves.

**`content-type` is `application/json; charset=utf-8` on every response this
route produces, success or failure. There is no path on which it returns
`text/html`.** That is asserted by eight cases in
`tests/e2e/document-url.spec.ts`, which runs in `quality` on every pull request.

## 4. Two more statuses, named so the set is closed

| condition | HTTP | `code` |
|---|---|---|
| a method other than GET | 405 | `METHOD_NOT_ALLOWED` |
| Supabase Storage is unreachable, times out, redirects, answers 5xx, or answers something this route does not recognise | 502 | `UPSTREAM_UNAVAILABLE` |

**`UPSTREAM_UNAVAILABLE` is deliberately not one of the three.** A body shape the
route has never seen is not guessed into `INVALID_TOKEN`: an unrecognised
response has to look unrecognised, or a future change at Supabase becomes a
silently mis-reported document. It is also the only status here that means
**retry is reasonable**. The three above do not: none of them will succeed on a
second attempt with the same URL.

## 5. Why this route exists at all, in one table

What Supabase Storage returns for the same three conditions, measured on the
production project 2026-09-02 (full captures with headers in
`docs/reports/2026-09-02-executor-ext-08-sample-documents.md`):

| condition | Supabase HTTP | Supabase body |
|---|---|---|
| expired | `400` | `{"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim timestamp check failed","code":"InvalidJWT"}` |
| tampered | `400` | `{"statusCode":"400","error":"InvalidJWT","message":"signature verification failed","code":"InvalidJWT"}` |
| object missing | `400` | `{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}` |

Three things are wrong with that for this purpose.

1. **Every failure is `400`.** A missing object never reads as `404`; its real
   status is buried in a string field inside the body.
2. **Expired and tampered carry the SAME machine-readable code, `InvalidJWT`.**
   The only thing that separates them is `message`, which is free text emitted by
   the `jose` library and changes when that library changes. That distinction is
   precisely the question the extraction side needs answered.
3. **The `code` field is not on every deployment.** The Supabase storage server
   in the local stack, which is the one CI runs, omits it entirely and sends only
   `statusCode`, `error` and `message`. A consumer keying on `code` works against
   the hosted project and silently fails against any other.

The route resolves 2 by reading the `exp` claim out of the token itself rather
than the upstream message text, and 3 by keying on `error` and `statusCode`,
which both deployments send.

## 6. The one thing that is not obvious and is load-bearing

`proxy.ts` protects every path by default and redirects a request with no session
to `/login`, which is HTML. Make has no session. **The `/api/documents` entry in
`isPublic()` is therefore part of this contract, not a convenience**: without it
every failure on this route becomes a 307 to a login page, and a client that
follows redirects gets `200 text/html`. Case 6 of `tests/e2e/document-url.spec.ts`
holds that line, deliberately using a path with no `.pdf` extension, because the
proxy matcher already excludes `.pdf` and would hide the regression on any
ordinary document.
