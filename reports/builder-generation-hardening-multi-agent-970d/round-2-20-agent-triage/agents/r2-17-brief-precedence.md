## R2-17 — parsed meta brief vs snapshot brief

### Verdict

Validated, but first-party UI mitigates it. Server lets client `meta.brief`
win over snapshot-derived follow-up brief; official follow-up UI does not send
`meta.brief`.

### Evidence

| File | Evidence |
|------|----------|
| `src/lib/api/engine/chats/follow-up-orchestration-input.ts` | `parsedMeta.brief ?? buildFollowUpBriefFromSnapshot(...)` |
| `src/lib/hooks/chat/useSendMessage.ts` | follow-up prompt meta intentionally does not resend init brief |
| `src/lib/api/engine/chats/follow-up-orchestration-input.test.ts` | tests allow a parsed meta brief fixture |

### Severity / confidence

P2 / medium. Confidence high for code path, medium for production frequency.

### Minimal fix idea

When `hasFollowUpBase` is true, ignore client `parsedMeta.brief` except
for explicit server-owned delta paths such as clear-redesign.

### Triage tags

`snapshot-integrity`, `prompt-budget`

**Model:** composer-2-fast (subagent)
