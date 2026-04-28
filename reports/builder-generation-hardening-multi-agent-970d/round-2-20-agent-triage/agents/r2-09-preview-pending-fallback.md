## R2-09 — previewPending fallback

### Verdict

**Bug confirmed.** Non-streaming follow-up fallback (`useSendMessage`) does not apply `previewPending`, while init fallback (`useCreateChat`) does.

### Evidence

| File | Evidence |
|------|----------|
| `src/lib/hooks/chat/useCreateChat.ts` | derives `previewPending` from response and calls `setPreviewPending` |
| `src/lib/hooks/chat/useSendMessage.ts` | fallback handler updates preview URL/messages but no `setPreviewPending` |
| `messages/route.ts` | response includes `previewPending` / `latestVersion.previewPending` |

### Severity / confidence

P3, **88%**. Affects network fallback path, not normal SSE path.

### Minimal fix

Mirror init fallback: derive pending from `data` and `latestVersion`, then call `setPreviewPending?.(...)`.

### Triage tags

`ui-lifecycle`, `ui`, `follow-up`

**Model:** composer-2-fast (subagent)
