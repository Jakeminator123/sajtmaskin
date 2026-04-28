## Agent IF-05 — Follow-up merge / LLM-only paths

### Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| Medium | `src/lib/gen/stream/finalize-merge.ts:297-304` + `preflight-phase.ts:179-196` | Follow-up merge always returns empty `scaffoldDefaultsBlocked` / `missingEmittedEssentials`; init-only `LLM_ONLY_PATHS` missing-essential signal never fires on follow-up. | 95% |
| Medium | `src/lib/gen/version-manager.ts:245-288` + `structural-elements.ts:64-106` | Follow-up can keep a new `app/page.tsx` that is worse but not <50% shrink and still above the 200-char trivial gate. | 80% |
| Low | `src/lib/gen/version-manager.ts:240-242` | Merge map keys raw `f.path`; mixed slash paths can produce duplicate logical files. | 55% |
| Low | `src/lib/gen/stream/finalize-preflight.ts:157-166` | If both `app/page.tsx` and `src/app/page.tsx` exist, home gate checks first file in iteration order. | 60% |

### Evidence

```ts
return {
  filesJson: JSON.stringify(verbatimResult1.files),
  rejectedShrinks,
  rejectedStructural,
  scaffoldDefaultsBlocked: [],
  missingEmittedEssentials: [],
  crossFileStubs: crossFileResult.fixes,
};
```

### Suggested fixes

- Derive a follow-up equivalent of “essential-path regression” by comparing merged home file against previous files for `LLM_ONLY_PATHS`.
- For follow-up, reject overwrite of home if new content fails shared non-triviality/richness checks; keep previous or force repair.
- Normalize merge paths before map insertion; emit hard issue if both App Router home conventions exist.

**Model:** composer-2-fast (subagent)
