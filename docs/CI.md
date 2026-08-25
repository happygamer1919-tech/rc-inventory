# CI

Every pull request and every push to `main` runs the `quality` workflow
(`.github/workflows/quality.yml`) as a single job named `quality`.

Steps:

1. Checkout
2. Setup Node 20 with npm cache
3. `npm ci`
4. `npx tsc --noEmit`
5. `npm run build`
6. `node docs/board/validate-board.mjs docs/board/rc-board.json`

The branch protection status check name is exactly `quality`.

## No lint step

There is deliberately no lint step and no `lint` script in `package.json`.
Next.js 16 removed the `next lint` command, and `eslint-config-next@16`
bundles typescript-eslint, which throws `does not support TS 7.0` against
this repo's `typescript@^7` (upstream: typescript-eslint#10940). Since 26 of
33 source files are `.ts`/`.tsx`, a linter that cannot parse TypeScript
would not be worth running.

Revisit with `oxlint`, which parses TypeScript natively and does not depend
on the TypeScript compiler API.
