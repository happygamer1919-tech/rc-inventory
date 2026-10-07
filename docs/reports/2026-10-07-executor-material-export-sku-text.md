# Executor report: P3-190 materials export SKU as text

The materials export now writes the SKU with csvText (lib/data/material-export-types.ts). The import already unwraps it through parseCsv. Spec: tests/e2e/material-export-sku.spec.ts. tsc, build, board validator and the card, board, id and residue checks pass locally; the Playwright spec needs the CI web server and runs there.
