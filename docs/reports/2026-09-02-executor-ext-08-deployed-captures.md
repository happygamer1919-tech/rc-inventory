# EXECUTOR, 2026-09-02: EXT-08 deployed, the three failure paths captured in production

Follow-up to `docs/reports/2026-09-02-executor-ext-08-sample-documents.md`, which
ships the route and says in its section 8 that the route-level captures come
after the deploy. #159 merged, Vercel deployed, and these are they.

**The contract holds in production.** Verbatim, tokens redacted, volatile
per-request headers (`x-vercel-id`, `x-vercel-cache`, `content-encoding`,
`transfer-encoding`) dropped and nothing else.

---

## 1. The answer, in three lines

| condition | HTTP | `content-type` | `code` |
|---|---|---|---|
| expired token | **400** | `application/json; charset=utf-8` | `EXPIRED_TOKEN` |
| invalid token | **401** | `application/json; charset=utf-8` | `INVALID_TOKEN` |
| object not found | **404** | `application/json; charset=utf-8` | `OBJECT_NOT_FOUND` |

Compare with what the storage layer answers underneath, measured the same day:
**`400` for all three, and the same code `InvalidJWT` for expired and for
tampered.** That is the distinction Andre could not make, and it is made now.

## 2. The control: a valid link serves the document

```
$ curl -sS -o out.pdf -w "%{http_code} %{content_type} %{size_download}\n" "<the tehnocom link>"
200 application/pdf 53243

$ shasum -a 256 out.pdf
fafca5c2c863dba2c503474a6d749c714fc4c5e0bd0f410cef0820ac05bbd465
```

Byte for byte the sha256 recorded in the parent report's section 7. The document
that comes back through the route is the document that was uploaded.

## 3. The captures

### jeton EXPIRAT, prin ruta
```http
GET https://www.rapidconstructmd.com/api/documents/rc-docs/_samples/andre/_probe-1788369960890.pdf?token=<JWT>

HTTP/1.1 400 Bad Request
cache-control: no-store
content-security-policy: frame-ancestors 'none'
content-type: application/json; charset=utf-8
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
referrer-policy: strict-origin-when-cross-origin
server: Vercel
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
x-matched-path: /api/documents/[...path]

{"code":"EXPIRED_TOKEN","error":"Legatura a expirat. Cere una noua; documentul este intact.","document_url_contract":"docs/contracts/document-url.md"}
```

### jeton INVALID, prin ruta
```http
GET https://www.rapidconstructmd.com/api/documents/rc-docs/_samples/andre/_probe-1788369960890.pdf?token=<JWT>

HTTP/1.1 401 Unauthorized
cache-control: no-store
content-security-policy: frame-ancestors 'none'
content-type: application/json; charset=utf-8
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
referrer-policy: strict-origin-when-cross-origin
server: Vercel
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
x-matched-path: /api/documents/[...path]

{"code":"INVALID_TOKEN","error":"Jeton invalid. Legatura este stricata, nu expirata.","document_url_contract":"docs/contracts/document-url.md"}
```

### OBIECT INEXISTENT, prin ruta
```http
GET https://www.rapidconstructmd.com/api/documents/rc-docs/_samples/andre/_probe-1788369960890.pdf?token=<JWT>

HTTP/1.1 404 Not Found
cache-control: no-store
content-security-policy: frame-ancestors 'none'
content-type: application/json; charset=utf-8
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
referrer-policy: strict-origin-when-cross-origin
server: Vercel
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
x-matched-path: /api/documents/[...path]

{"code":"OBJECT_NOT_FOUND","error":"Obiectul nu exista la calea aceasta.","document_url_contract":"docs/contracts/document-url.md"}
```

### fara jeton, prin ruta
```http
GET https://www.rapidconstructmd.com/api/documents/rc-docs/_samples/andre/_probe-1788369960890.pdf

HTTP/1.1 401 Unauthorized
cache-control: no-store
content-security-policy: frame-ancestors 'none'
content-type: application/json; charset=utf-8
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
referrer-policy: strict-origin-when-cross-origin
server: Vercel
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
x-matched-path: /api/documents/[...path]

{"code":"INVALID_TOKEN","error":"Jeton absent.","document_url_contract":"docs/contracts/document-url.md"}
```

## 4. What is not in this file

**The four working links.** They carry a live two-hour token, and a token
committed to a repository is an expired token by the time anybody reads it, and a
live one for anybody who reads it sooner. They go to Andre directly.

**Regenerating them costs one command**, and it re-captures everything above at
the same time:

```
set -o allexport; . /Users/ivan/rc-secrets/phase2.env; set +o allexport
node scripts/ext/serve-sample-documents.mjs
```

Add `--capture-only` to skip re-uploading the four documents, and
`--origin=<url>` to point the capture at somewhere other than production.

**No line counts, no totals and no page counts** for any of the four documents,
here or anywhere sent to Andre. The point of the set is that the extractor
produces them unaided.
