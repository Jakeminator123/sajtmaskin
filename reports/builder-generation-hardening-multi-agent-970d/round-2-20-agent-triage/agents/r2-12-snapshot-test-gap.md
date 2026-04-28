## R2-12 — Snapshot null-clobber test gap

### Verdict

Confirmed test gap. Existing snapshot merge tests cover overlay, race handling, `buildSpec`, variant/scaffold null guards, and follow-up brief extraction. They do **not** cover `next.briefSummary === null` overwriting prior `briefSummary`.

### Evidence

- `mergePersistedOrchestrationSnapshots`: shallow spread plus special cases only for variant/scaffold/buildSpec.
- `sanitizeOrchestrationSnapshotForStorage` keeps `null`.
- Add regression test in `src/lib/gen/orchestration-snapshot.test.ts`.

### Severity / confidence

Medium-high; high confidence in mechanism, medium confidence in frequency.

### Minimal fix idea

If previous `briefSummary` is object and next `briefSummary` is null, preserve previous. Add a test asserting `buildFollowUpBriefFromSnapshot(merged)` still returns requested capabilities.

### Triage tags

`snapshot-integrity`, `test-gap`, `snapshot`

**Model:** composer-2-fast (subagent)
