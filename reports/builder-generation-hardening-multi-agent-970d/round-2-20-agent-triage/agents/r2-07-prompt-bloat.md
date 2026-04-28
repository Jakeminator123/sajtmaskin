## R2-07 — Follow-up handoff cap order and meta brief

### Verdict

Validated.

### Findings

| Finding | Severity | Confidence | Tags |
|---------|----------|------------|------|
| Handoff cap runs before continuity/file-context wrapping, so final user payload can be larger than the intended handoff cap. | P2 | High | prompt-budget |
| `meta.brief` replaces snapshot-derived brief when present. | P2 | High | snapshot, prompt-budget |

### Evidence

- `chat-message-stream-post.ts`: `orchestratePromptMessage(... hardCap ...)` runs before `prependOrchestrationContinuityToFollowUp`, file context, wrappers, and attachment hydration.
- `follow-up-orchestration-input.ts`: `brief: params.parsedMeta.brief ?? buildFollowUpBriefFromSnapshot(...)`.

### Minimal fix idea

Reserve wrapper/file-context overhead before handoff cap, or run a final total payload budget after wrapping. On follow-up, merge/ignore client `meta.brief` except explicit redesign/delta paths.

### Triage tags

`prompt-budget`, `snapshot`

**Model:** composer-2-fast
