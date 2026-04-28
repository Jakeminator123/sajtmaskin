## R2-04 — status projection UI validation

### Verdict

**Validated.** Product UI uses DB-backed `releaseState` / `verificationState` through `resolveEngineVersionDisplayStatus`; `selectVersionStatus` from event-bus projection is not used in builder UI.

### Evidence

- `BuilderShellContent.tsx` computes `activeVersionStatus` from version row fields.
- `VersionHistory.tsx` computes row badges the same way.
- Repo search: `selectVersionStatus` appears in definition/tests/docs, not product UI.

### Severity / confidence

- Severity: **P2** (stale/wrong status labels; not no-status failure).
- Confidence: **92%**.

### Minimal fix idea

Expose/stream version events to UI and map them through `selectVersionStatus(events)`, with DB row status as fallback until event hydration.

### Triage tags

`status-truth`, `ui`, `event-bus`, `db-flags`

**Model:** composer-2-fast (subagent)
