# P0 protected-path smal eval v4 — 2026-04-27

> Smal P0-eval, **inte** full baseline/gate. Körningen verifierar bara att `app/api/placeholder/route.ts` inte längre fäller eval när `SCAFFOLD_PROTECTED_PATHS` droppar LLM-versionen och eval-runnern mäter canonical payload.

## Run

- Repo: `C:\Users\jakem\dev\projects\sajtmaskin`
- HEAD: `671cbddd4 docs(plans): add follow-up-vs-autorepair lane-collision plan (active)` + lokala P0/eval-harness-ändringar innan commit
- Command: `npm run eval:gate -- --prompts restaurant,booking-service,multi-page-brochure,consultant-landing`
- Model: `gpt-5.4`
- Result: `WARNING` (exit 0)
- Scope: 4 prompts, protected-path regression only

## Summary

| Metric | Result |
|---|---:|
| Prompts | 4 |
| Passed | 3/4 |
| Avg score | 91% |
| Avg time | 157.9s |
| Gate result | WARNING |
| Blocking failures | 1/4 |

## Prompt Results

| Prompt | Status | Score | Remaining blockers | Protected route.ts? |
|---|---|---:|---|---|
| restaurant | PASS | 91% | none | Dropped from canonical eval input |
| booking-service | FAIL | 80% | `project-sanity`, `tier2-readiness` | Dropped from canonical eval input |
| multi-page-brochure | PASS | 95% | none | Dropped from canonical eval input |
| consultant-landing | PASS | 97% | none | Dropped from canonical eval input |

## Remaining Failure

`booking-service` no longer fails on `app/api/placeholder/route.ts`. Its remaining blockers are real canonical issues:

- `components/booking-flow.tsx`: unresolved local import `@/components/date`
- `components/booking-flow.tsx`: unresolved local import `@/components/icon`
- `app/layout.tsx`: imported third-party package `@vercel/analytics` is used but not pinned in `package.json`

These belong to the next P1 track: canonical import/dependency readiness.

## Conclusion

P0 is closed for the protected-path class:

- `SCAFFOLD_PROTECTED_PATHS` drops `app/api/placeholder/route.ts` in the runtime/preflight path.
- Eval now measures canonical `preflight.filesJson` for blocking checks instead of raw/autofixed LLM output.
- `app/api/placeholder/route.ts` is no longer a blocking eval error when the guard drops the LLM emission.
