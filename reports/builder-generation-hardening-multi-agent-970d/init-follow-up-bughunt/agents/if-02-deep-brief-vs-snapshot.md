## Agent IF-02 — Deep Brief vs Snapshot-Brief

### Findings (severity, file:line, bug/risk, confidence %)

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| High | `src/lib/own-engine/session/own-engine-build-session.ts`, `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/gen/orchestration-snapshot.ts` | Follow-up SSE meta can include `briefSummary: null`; shallow snapshot merge can overwrite a prior non-null brief summary and break Snapshot-Brief continuity. | 92% |
| Medium | `src/lib/api/engine/chats/chat-message-stream-post.ts` | `clear-redesign` uses the full server auto-brief path; this may be intended, but it is heavier than a narrow delta brief. | 85% |
| Low | `src/lib/api/engine/chats/follow-up-orchestration-input.ts`, `src/lib/api/engine/chats/parse-chat-request-meta.ts` | Any client-supplied `meta.brief` can override the snapshot-derived brief on follow-up. | 70% |

### Evidence

`buildOwnEngineGenerationStreamMeta` sets:

```ts
briefSummary: extractBriefSummary(input.metaBrief)
```

If follow-up does not pass `metaBrief`, this becomes `null`. `mergePersistedOrchestrationSnapshots` shallow-merges `{ ...base, ...next }`, so a new null wins over existing snapshot data.

### Suggested fixes

- Omit `briefSummary` from stream meta when it is null, or preserve prior non-null `briefSummary` in snapshot merge.
- On follow-up, pass the actual snapshot-derived brief into stream meta if it was used in prompt assembly.
- Treat client `meta.brief` as privileged; ignore it for normal follow-up unless a clear redesign path explicitly permits it.

**Model:** composer-2-fast (subagent)
