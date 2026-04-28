## R2-02 — `briefSummary` + shallow snapshot merge

### Verdict

**Partly confirmed.** Follow-up can create stream meta with `briefSummary: null`, and snapshot merge is shallow, so a later null can overwrite prior non-null summary. Nuance: init also often omits `metaBrief`, so some chats may never seed the field.

### Evidence

| Area | Evidence |
|------|----------|
| Meta builder | `extractBriefSummary(input.metaBrief)` returns `null` when omitted. |
| Follow-up call | `buildOwnEngineGenerationStreamMeta` called without `metaBrief`. |
| Init call | Same omission pattern observed. |
| Snapshot merge | `mergePersistedOrchestrationSnapshots` uses `{ ...base, ...next }`; no `briefSummary` guard. |
| Snapshot-Brief | `buildFollowUpBriefFromSnapshot` depends on snapshot `briefSummary`. |

### Severity / confidence

**P1/P2 hybrid**, confidence **high** on mechanism, **medium** on production frequency.

### Minimal fix

Keep prior non-null `briefSummary` when `next.briefSummary == null`, and/or pass the effective brief into stream meta on init/follow-up.

### Triage tags

`snapshot-integrity`, `snapshot`, `repair`, `mode-split`

**Model:** composer-2-fast
