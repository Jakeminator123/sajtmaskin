# Eval baseline after revert - 2026-04-27

## Run

- Repo: `C:\Users\jakem\dev\projects\sajtmaskin`
- Eval worktree: `C:\Users\jakem\dev\projects\sajtmaskin-eval`
- Commit: `4de2fabd2 fix(verifier): support scoped paths in hash-navigation details`
- Typecheck: `npm run typecheck` passed on `master`
- Eval command: `npm run eval:gate`
- Eval result: `FAIL` (exit code 1)
- Baseline file: `src/lib/gen/eval/eval-baseline.json`
- Baseline update: not performed

## Summary

| Metric | 2026-03-18 baseline | 2026-04-27 after revert | Delta |
|---|---:|---:|---:|
| Passed prompts | 14/15 | 2/15 | -12 |
| Avg score | 95.36% | 76% | -20.5% relative |
| Avg time | 67.3s | 165.5s | +98.2s |
| Gate | pass-ish baseline | FAIL | regression remains |

Conclusion: regression remains after revert. The gate failure is not a single-prompt flake; 13/15 prompts have blocking failures and 12 prompts regressed from PASS to FAIL versus the March baseline.

## Prompt Results

| Prompt | Baseline | Current | Status | Score delta |
|---|---:|---:|---|---:|
| coffee-shop | PASS 93.8% | FAIL 73.4% | PASS -> FAIL | -20.4pp |
| dashboard | PASS 93.8% | FAIL 72.7% | PASS -> FAIL | -21.1pp |
| portfolio | PASS 93.8% | PASS 85.7% | PASS | -8.0pp |
| blog | PASS 96.3% | PASS 94.5% | PASS | -1.7pp |
| pricing | PASS 100.0% | FAIL 78.2% | PASS -> FAIL | -21.8pp |
| auth | PASS 100.0% | FAIL 77.7% | PASS -> FAIL | -22.3pp |
| ecommerce | PASS 100.0% | FAIL 72.7% | PASS -> FAIL | -27.3pp |
| restaurant | PASS 93.8% | FAIL 72.6% | PASS -> FAIL | -21.2pp |
| agency | PASS 100.0% | FAIL 75.2% | PASS -> FAIL | -24.8pp |
| settings | PASS 100.0% | FAIL 70.0% | PASS -> FAIL | -30.0pp |
| booking-service | FAIL 83.3% | FAIL 71.5% | FAIL | -11.8pp |
| multi-page-brochure | PASS 100.0% | FAIL 80.0% | PASS -> FAIL | -20.0pp |
| saas-dashboard | PASS 87.5% | FAIL 67.3% | PASS -> FAIL | -20.2pp |
| content-heavy-blog | PASS 94.6% | FAIL 73.1% | PASS -> FAIL | -21.5pp |
| consultant-landing | PASS 93.8% | FAIL 73.1% | PASS -> FAIL | -20.6pp |

## Blocking Check Counts

| Blocking check | Count |
|---|---:|
| tier2-readiness | 12 |
| syntax | 7 |
| project-sanity | 6 |
| required-files | 2 |

## Top Blocker Clusters

| Cluster | Prompts | Evidence |
|---|---:|---|
| Generated `app/api/placeholder/route.ts` contains TSX/CSS-like syntax (`Expected ">" but found "style"`) | 6 | coffee-shop, restaurant, agency, booking-service, multi-page-brochure, consultant-landing |
| Unresolved local component imports | 4 | `@/components/icon` in dashboard/saas-dashboard, `@/components/cart-drawer` in ecommerce, `@/components/date` in booking-service |
| Missing required home route / incomplete file set | 2 | ecommerce and settings missing `app/page.tsx`; both also report missing `package.json` for dependency readiness |
| Other generated syntax errors outside placeholder route | 3 | pricing (`Unexpected "}"`), booking-service (`Expected "from" but found "-"`), consultant-landing (`Expected "}"` / `Expected "("`) |
| Dependency readiness failures | 1 | content-heavy-blog imports unpinned `@vercel/analytics`, `mdx`, `next-mdx-remote` |

## Failed Prompt Details

| Prompt | Blocking checks | Main issue |
|---|---|---|
| coffee-shop | tier2-readiness, syntax | `app/api/placeholder/route.ts` syntax error |
| dashboard | project-sanity, tier2-readiness | unresolved `@/components/icon` |
| pricing | syntax | syntax errors in `app/page.tsx` and `app/support/page.tsx` |
| auth | tier2-readiness | home route renders trivial content |
| ecommerce | project-sanity, tier2-readiness, required-files | missing `app/page.tsx`, unresolved `@/components/cart-drawer`, missing `package.json` |
| restaurant | tier2-readiness, syntax | `app/api/placeholder/route.ts` syntax error |
| agency | tier2-readiness, syntax | `app/api/placeholder/route.ts` syntax error |
| settings | project-sanity, tier2-readiness, required-files | missing `app/page.tsx`, missing `package.json` |
| booking-service | project-sanity, tier2-readiness, syntax | unresolved `@/components/date`, syntax errors |
| multi-page-brochure | tier2-readiness, syntax | `app/api/placeholder/route.ts` syntax error |
| saas-dashboard | project-sanity, tier2-readiness | unresolved `@/components/icon` |
| content-heavy-blog | project-sanity, tier2-readiness | unpinned third-party dependencies |
| consultant-landing | tier2-readiness, syntax | `app/api/placeholder/route.ts` plus other syntax errors |

## Gate Output Excerpt

```text
Model: gpt-5.4 | Total: 15 | Passed: 2 | Avg Score: 76% | Avg Time: 165.5s
Blocking failures: 13/15 | Top blockers: tier2-readiness (12), syntax (7), project-sanity (6), required-files (2)
Overall avg score delta: -20.5%
Gate result: FAIL
Gate failed: regression detected.
```

## Next Step

Recommended first hotfix target: investigate why `app/api/placeholder/route.ts` is emitted or merged with TSX/CSS-like content. It appears in 6 failing prompts and likely explains the largest deterministic cluster.
