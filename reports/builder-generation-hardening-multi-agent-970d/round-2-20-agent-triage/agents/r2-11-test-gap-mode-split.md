## R2-11 — Test gap for mode split

### Verdict

Tests cover `deriveFollowUpStateFromInputs` and merge predicate behavior, but **not** the full `prepareGenerationContext` / `finalizeOrchestrationPrompts` split where `persistedScaffoldId` + `previousFilesCount: 0` can produce init BuildSpec and follow-up dynamic prompt.

### Evidence

- `follow-up-predicate.test.ts` covers scaffold + zero files as non-follow-up.
- `finalizeOrchestrationPrompts` still uses `generationMode ?? (persistedScaffoldId ? "followUp" : "init")`.
- `buildFollowUpOrchestrationInput` can send `generationMode: undefined` when `hasFollowUpBase` is false.

### Severity / confidence

**P2 / 88%**. Test gap reinforces the R2-01 `mode-split` cluster.

### Minimal fix idea

Add a regression test under `src/lib/gen/orchestrate.test.ts` (or adjacent new test) asserting finalized prompt mode matches base mode for `persistedScaffoldId` + `previousFilesCount: 0`.

### Triage tags

`mode-split`, `tests`, `corroborates:r2-01`

**Model:** composer-2-fast (subagent)
