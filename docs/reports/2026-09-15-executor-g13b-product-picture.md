# EXECUTOR report, 2026-09-15, card P3-56, one picture per product

**Role:** AUTHOR (card written), then EXECUTOR (card built), in one pull request, as the
operator factory task for goal G13b asks. **Session:** the operator's task queue, on the
owner's machine (no Docker, no Supabase CLI, no production credentials).
**Branch:** `card/p3-56`. **Pull request:** #304. **State:** open, merge held for the owner:
real client data is in production, and merging applies migration 0045 to the live database
(CLAUDE.md 8.0).

## Boot status at the start

- Phase 2 board: 68 shipped, 32 todo, 2 blocked, 0 in flight, 0 halted. Launch gate 0/9.
- Phase 3 board: 72 shipped, 32 todo, 0 in flight, blocked or halted. Launch gate 0/9.
- Next eligible by the board: AUT-3 (phase 2), P3-14 (phase 3). Worked instead: the new card
  P3-56, authored here, because the owner's goal G13b names it.

## Cards touched

| card | status at start | status in this pull request |
|---|---|---|
| P3-56 | did not exist | authored `todo`, then `in_flight`, then `shipped` with evidence PR #304 |

## What changes for Rapid Construct, once merged

Whoever adds or edits a product can attach one photo of it, JPG, JPEG, PNG or WEBP, up to
10 MB, in the new "Imagine produs" field. The photo appears full width at the bottom of the
product's side panel, under Mișcări. A new photo replaces the old one and the old file is
removed from storage. A product without a photo says "Nicio imagine pentru acest produs.".
A wrong type or a file over 10 MB is refused in Romanian and nothing is saved. Nothing changes
on the live site until the pull request merges.

## AUTHOR step

- `npm run id:free -- P3-56`: FREE, lane highest P3-55 (P3-55 already sits on a branch).
- Card appended to `docs/board/rc-board-phase3.json` with `plain`, `defaults` quoting the task's
  "Where, exactly" and "The fix" sections and the source (GOALS.md G13b, owner, 2026-09-14),
  `depends_on: ["P3-15"]`, and an acceptance naming `tests/e2e/product-image.spec.ts`.
- Validator exit 0, `check:card-ids` exit 0. Commit `fcba3c3`.

**Three facts checked before writing the card, all recorded in its defaults and notes:**

1. **The bucket already accepts the three picture types.** `0044_documents.sql` set `rc-docs`
   to eight types, `image/jpeg`, `image/png` and `image/webp` among them, and 20 MB. The
   widening the task asked for was already true, so the migration asserts it and does not
   rewrite the bucket row.
2. **A second `rc_docs_*` delete policy would break the P3-15 assertions.**
   `scripts/poc-free/local-db/assertions/0044_documents.sql` pins the exact four-policy set
   `rc_docs_delete, rc_docs_insert, rc_docs_select, rc_docs_update`, and every assertion file
   runs against the finished schema. So `rc_docs_delete` itself is widened with `ALTER POLICY`,
   which the task allowed. Its existing `client/` and `project/` clauses, which the 0044
   assertion checks with `position(...)`, are kept.
3. **P3-15's own download link does not use `/api/documents`** (its header says so). This card
   is the first screen to read a file through that route, which already serves any `rc-docs`
   object on its token and which `proxy.ts` already lets through. The route is not edited.

## What was built

- `supabase/migrations/0045_product_image.sql`: `products.image_path text null`; check
  constraint `products_image_path_shape` (`product/<own id>/<uuid>.<jpg|jpeg|png|webp>`);
  `alter policy rc_docs_delete` to owner-only under `client/`, `project/` and `product/`; a DO
  block that fails the file unless `rc-docs` is private, at least 10 MB and accepts the three
  image types. No DROP TABLE, TRUNCATE or DELETE, no row written.
- `scripts/poc-free/local-db/assertions/0045_product_image.sql`: column shape and no default;
  the constraint accepts all four extensions and refuses another product's folder, a file
  name, gif, pdf, `client/`, `..` and an empty string; the policy text names all three folders;
  an account manager deletes nothing; the owner deletes a `product/` object and not an
  `inbound/` one.
- `docs/migrations/APPLY-LOG.md`: pending line `0045_product_image.sql`, card de aplicare P3-56.
- `lib/data/schema-capability.ts`: `hasProductImage`, same shape as the other probes.
- `lib/data/product-image-types.ts` (new): 10 MB limit, the four extensions, the Romanian
  messages, `productImageProblem`; content signatures re-exported from `documents-types.ts`.
- `lib/data/product-actions.ts`: `createProduct` and `updateProduct` refuse a bad picture
  before any write (before `resolveSupplier`, which can create a supplier) and return the
  product id; `prepareProductImageUpload` and `confirmProductImage` do P3-15's three steps
  (server check and signed upload for the chosen path, direct browser upload, server check of
  real size and first bytes, then the row). On replace the row moves first, the old object is
  removed second.
- `lib/data/product-detail.ts`: the panel detail carries the picture state (inactive, none,
  ready with a relative `/api/documents/...` link from `toDocumentUrl`, or failed).
- `components/inventory/ProductForm.tsx`: the "Imagine produs" field with a Romanian picker, on
  create and edit; a failure after the product saved keeps the form open and the next press
  updates the saved product rather than creating a duplicate.
- `components/inventory/ProductPanel.tsx`: the bottom block, full width, last section.
- `components/inventory/InventoryScreen.tsx`, `app/(app)/inventar/page.tsx`: `imagesActive`.
- `tests/e2e/product-image.spec.ts` (new): the card's five cases.

**Defaults applied, logged in the card notes:** (a) bucket asserted not rewritten; (b) policy
altered not added; (c) three-step upload; (d) save first, attach second; (e) row first, old
object second; (f) path constraint; (g) no field and no block before 0045 lands.

## Commands run locally, all exit 0

`npx tsc --noEmit`; `npm run build`; board validator on all three boards; `check:card-ids`;
`check:unique-ids`; `check:open-branch-ids`; `check:no-destructive-migration` (1 file, 11
statements, every kind classified); `check:conflict-residue`; `check:categories`;
`check:ledger-rows`; `check:no-prod-target`; `check:pending-schema-reads`;
`check:removal-safety`; `check:assertion-register`; `check:board-clock` and `check:board-edit`
after the ship flip.

**Left for CI (no Docker and no Supabase CLI here):** the end to end suite with
`product-image.spec.ts`, `check:migrations` (0045 plus its assertion file on a bare postgres),
`prove:applier` and `prove:assertions`. The quality run on the head sha, its id and whether the
migration steps RAN are recorded in the pull request and the owner question.

## CI runs

- Run 35025352161 on `0af76c0` (first push, card still `in_flight`): failed at "Refuse a code
  pull request whose board edit is missing". Expected; the known signature in the factory's
  KNOWN-FAILURES.md. The ship flip on `c0a8d12` answers it.
- Run 35025464643 on `c0a8d12`: failed at "Apply every migration to a bare postgres,
  unmodified". Migration 0045 APPLIED; its assertion file failed with `permission denied for
  table objects`. Repair attempt 1: the file lacked the `grant delete on storage.objects to
  authenticated` that the 0044 assertion file carries inside its own transaction. Same line
  and reason added; nothing loosened.

## Learnings

One entry appended to `docs/LEARNINGS.md`: "A storage delete in a local-db assertion needs its
own grant, every file".

## Left for the owner

Approve the merge of pull request #304 in chat. Merging applies migration 0045 to the live
database within about two minutes: products gain an empty picture field with a path check,
the owner-only storage delete rule also covers product pictures, and `rc-docs` is confirmed,
not changed, to accept JPEG, PNG and WEBP.
