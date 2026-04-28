## Agent IF-06 — Follow-up history and prompt bloat

### Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| Medium | `follow-up-orchestration-input.ts:75-77`, `parse-chat-request-meta.ts:86` | Any full client `meta.brief` replaces minimal snapshot brief. A full init Deep Brief can replay into follow-up dynamic context. | 85% |
| Medium | `chat-message-stream-post.ts:372-376`, `orchestration-snapshot.ts:264-326` | User turn gets continuity wrapper while system also gets snapshot-derived brief. Redundant design signals and tokens. | 80% |
| Medium | `chat-message-stream-post.ts:353-363`, `promptOrchestration.ts:383-388` | Prompt handoff caps apply to raw message before file context / continuity / attachments inflate the final user message. | 82% |
| Low | `chat-message-stream-post.ts:173-186` | Older assistant turns are compressed; older user turns stay full-length. | 72% |

### Evidence

- `brief: parsedMeta.brief ?? buildFollowUpBriefFromSnapshot(...)`.
- Follow-up file context can be built with `maxChars` up to `140_000`.
- `buildBoundedChatHistory` compresses older assistant messages only.

### Suggested fixes

1. For follow-up, ignore full `meta.brief` except explicit clear-redesign / delta cases.
2. Apply one cap after the final follow-up user payload is assembled.
3. Compress older user messages too, or summarize both old roles consistently.

**Model:** composer-2-fast (subagent)
