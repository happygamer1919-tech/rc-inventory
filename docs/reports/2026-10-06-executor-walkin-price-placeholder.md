# P3-187 walk-in price box suggests the exact value

- Defect: the placeholder of the walk-in price box used `formatNumber`, which rounds to whole lei (12,50 showed 13). P3-163 had fixed the totals and missed this.
- Change: new `formatNumberExact` in `lib/data/format.ts`; `OutboundDirectClientForm.tsx` uses it for the placeholder. `OutboundProjectForm.tsx` untouched (R-215). Nothing about saving the price changed.
- Test: new case in `tests/e2e/outbound-direct-client.spec.ts` (`casuta de pret sugereaza valoarea exacta a produsului, 12,50 si nu 13`). The seeded test product now has a value of 12,50 (was 10).
- Local gates: tsc, build, board validator and the 12 check scripts passed (check:board-edit reports "not a pull request" before the PR exists). The end to end spec runs only in CI.
