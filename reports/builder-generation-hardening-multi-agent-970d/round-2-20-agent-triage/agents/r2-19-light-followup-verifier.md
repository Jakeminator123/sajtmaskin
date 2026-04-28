# R2-19 — Light follow-up verifier policy

## Verdict

Partly confirmed: `light_followup_fast_policy` intentionally skips deep path, and verifier is tied to deep path. Scope is narrow: follow-up + fast verification + light context + copy/local-layout, with imagery/repair forcing deep path.

## Evidence

- `resolveFinalizePathPolicy` returns `runDeepPath: false` for that light follow-up combination.
- `resolveVerifierPassPolicy` returns `run: false` when `!finalizePath.runDeepPath`.
- Tests assert `runVerifierPass` is not called for light follow-up fast policy.

## Severity / confidence

- Severity: P3 / policy review, not clear bug.
- Confidence: 90% behavior, 60% product impact.

## Minimal fix

If stricter F2 is desired, decouple verifier from image/materialization deep path or add cheap verifier for light follow-ups.

## Triage tags

`policy-fast-path`, `repair`, `low-confidence`

**Model:** composer-2-fast (subagent)
