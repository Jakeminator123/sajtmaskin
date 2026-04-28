## R2-15 — clear-redesign semantics

### Verdict

Doc/code mismatch: scaffold + variant unlock on `clear-redesign`, but route freeze does not receive `followUpIntent`.

### Evidence

- `lockedVariantForFollowUp` releases variant for `clear-redesign`.
- `buildRoutePlan` takes `generationMode` / `existingRoutePaths`, not `followUpIntent`.
- Terminology says routes frozen except `clear-redesign`; target doc says routes frozen unless explicit add/remove.

### Severity / confidence

P2 / medium-high. Confidence: ~85% behavior, ~75% product undesired.

### Minimal fix

Choose: thread `followUpIntent` into route plan and relax freeze for clear-redesign, or update terminology/docs to say routes remain frozen.

### Triage tags

`route-freeze`, `doc-code-drift`, `clear-redesign`

**Model:** composer-2-fast (subagent)
