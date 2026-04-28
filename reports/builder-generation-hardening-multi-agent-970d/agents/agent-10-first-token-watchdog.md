## Agent 10 — First-token / reasoning watchdog

### What exists in code

| Plats | Innehåll |
|--------|-----------|
| `src/lib/gen/engine.ts` | Thinking/reasoning flags; **inga** `firstReasoningTokenAt` / watchdog |
| `src/lib/gen/stream/stream-format.ts` | `firstReasoningTokenAt` / `firstContentTokenAt`; `stream.summary` med `reasoningMs` / `outputMs`; 15s debug heartbeat under reasoning — **ingen** `>120s` policy eller `engine.first_token_slow` |

### Gap vs plan (`engine.first_token_slow`)

**Ingen** träff på `first_token_slow`. Planerad UI-signal är **inte** implementerad under det namnet.

### Confidence (%)

**~95%** att ingen 120s watchdog finns i nuvarande kod.

### Improvements

- Emit named event när `firstContentTokenAt === null` och elapsed > 120s i `createCodeGenSSEStream`.  
- Dokumentera att `VERIFIER_REPAIR_TIMEOUT_MS = 120_000` gäller **verifier-repair**, inte codegen stream.

**Model:** composer-2-fast (subagent)
