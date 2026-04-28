# Agent IF-09 — Builder UI init/follow-up bugs

## Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| Medium | `src/lib/hooks/chat/useSendMessage.ts` vs `useCreateChat.ts` | Non-streaming follow-up fallback does not sync `previewPending`, while init fallback does. JSON fallback can leave preview lifecycle stale. | 72% |
| Low-Med | `useSendMessage.ts` vs `useCreateChat.ts` | Init with pending brief can send raw user text; follow-ups use `formatPrompt(messageText)`. Asymmetric shaping can affect server classification. | 58% |
| Low | `useBuilderDerivedState.ts`, `useSendMessage.ts` | `activeVersionId = selectedVersionId || latestVersionId`; narrow render timing edge can base follow-up on a different version than user expected. | 48% |

## Evidence

- `handleNonStreamingSend` resolves preview URL and refreshes, but does not call `setPreviewPending`.
- `handleNonStreamingCreate` reads `previewPending` from response/latestVersion and calls `setPreviewPending`.
- SSE `done` path does set `previewPending`; the bug is fallback-specific.

## Suggested fixes

1. Mirror init fallback: derive `previewPending` from follow-up JSON response and call `setPreviewPending?.(...)`.
2. If a live non-shim preview URL is applied, clear pending consistently.

**Model:** composer-2-fast (subagent)
