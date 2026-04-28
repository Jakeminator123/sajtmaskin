## Agent IF-07 — Repair pass vs follow-up behavior

### Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| High | `src/lib/gen/stream/finalize-version/policy.ts:46-47`, `fast-path.ts:278-287` | `repairPassIndex > 0` disables finalize verifier. Intended policy, but second finalize passes can ship without verifier-model signal. | 95% |
| High | `src/lib/providers/own-engine/generation-stream.ts:341-346`, `version-errors.ts:185-188` | `repairPassIndex` is `1` for every in-place repair, not monotonic. Stale error pruning only deletes rows with lower index, so old same-index errors can survive a later successful repair. | 88% |
| Medium | `src/lib/api/engine/chats/chat-message-stream-post.ts:1208-1211` | `targetVersionId` is only set for `metaPromptSourceKind === "autofix"`. Ordinary follow-up creates new version and should not be confused with repair. | 90% |

### Evidence

```ts
if (repairPassIndex > 0) {
  return { run: false, reason: "repair_pass" };
}
```

```ts
repairPassIndex: targetVersionId ? 1 : 0,
```

### Suggested fixes

1. Make repair pass index monotonic per `versionId`.
2. Or prune stale rows by `logPassId` / pass family, not only `< currentRepairPassIndex`.
3. Decide whether repair passes need a cheap verifier subset.

**Model:** composer-2-fast (subagent)
