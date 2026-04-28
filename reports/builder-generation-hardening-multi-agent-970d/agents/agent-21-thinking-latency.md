## Agent 21 — Thinking flag and latency

### Defaults

- Server-side default thinking-flagga (se `docs/ENV.md` + `getDefaultThinkingEnabled()`).  
- Stream API AND:ar med `thinkingByTier` generator.  
- `generateCode` → provider `reasoningEffort` / Anthropic thinking.

### Link to long reasoning phase

Reasoning ökar wall-clock; SSE emitterar `thinking`; tokens i `done`-payload.

### Confidence (%)

Kodkoppling thinking↔latency: **~90%**. Ingen numerisk "confidence %" i stream.

### Improvements

- Runbook: dubbel gate (toggle + tier manifest).  
- Observability: reasoning tokens i dashboard.

**Model:** composer-2-fast (subagent)
