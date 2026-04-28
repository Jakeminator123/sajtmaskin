## R2-06 — Follow-up home regression

### Verdict

**Partly validated.** Follow-up merge always returns empty `missingEmittedEssentials`, so init-only essential-path signal does not cover home regression. A rich page can be replaced if raw shrink and structural guards do not catch it and the new content is above the 200 rendered-char gate.

### Evidence

- `finalize-merge.ts`: follow-up branch returns `missingEmittedEssentials: []`.
- `version-manager.ts`: shrink threshold uses raw file length `< 50%`; structural guard only tracks selected element kinds.
- `finalize-preflight.ts`: home gate only checks missing/trivial content, not richness relative to previous version.

### Severity / confidence

P2. Confidence **85%** for mechanism, **60-70%** for practical frequency.

### Minimal fix

Add home-specific follow-up guard for `LLM_ONLY_PATHS`: compare rendered body length / structural richness to prior file and reject/block major regression.

### Triage tags

`merge-home`, `merge-regression`, `follow-up`, `LLM_ONLY_PATHS`

**Model:** composer-2-fast (subagent)
