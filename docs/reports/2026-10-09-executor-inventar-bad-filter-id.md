# P3-208: bad category or supplier id in the Inventar address

Fault: `?categorie=abc` or `?furnizor=abc` went into `.eq` on a uuid column, the database refused it, and the page showed the error screen.

Change: `applyQueryFilter` (lib/data/product-page-read.ts) sends the all-zero uuid when the value is not a uuid, using the existing `looksLikeUuid`. The list is empty and the count is 0. Real read errors still throw.

Tests: tests/e2e/list-paging.spec.ts. The fake catalog now uses real uuids for categories. New cases: bad categorie, bad furnizor, valid uuid still filters.

Local: tsc, build, the 12 repo checks and the board validator pass. The spec needs the Playwright web server and Supabase env, so it runs in CI only.
