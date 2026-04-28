## Agent 17 — System prompt length observability

### Where logged

- `getSystemPromptLengths` i `src/lib/gen/system-prompt/compose.ts`.  
- `debugLog("prompt-cache", "System prompt lengths", ...)` i `create-chat-stream-post.ts` och `chat-message-stream-post.ts` efter prompt-dump.

### What devs should grep after a bad run

- `prompt-cache`, `System prompt lengths`, `getSystemPromptLengths`.

### Confidence (%)

Call-sites + DEBUG policy: **95%**. Att längd = provider-cache: **60%** (teckenräkning).

### Improvements

- Dokumentera `DEBUG=prompt-cache` i debug-hjälp.  
- Strukturerad telemetry i prod (inte bara `debugLog`).

**Model:** composer-2-fast (subagent)
