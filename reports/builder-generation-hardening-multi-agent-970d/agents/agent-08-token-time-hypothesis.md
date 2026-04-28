## Agent 08 — Token/time hypothesis

### Facts from repo

| Source | What it says |
|--------|----------------|
| `promptLimits.test.ts` | `MAX_CHAT_SYSTEM_CHARS` default **600_000** (chat-historik / orchestration cap — ej samma som engine output) |
| `manifest.json` `engineMaxOutputTokens` | Default **131072** (env-override beskrivs i manifest + `docs/ENV.md`) |
| `routeTimeouts` | `engineRouteMaxDurationSeconds` default **800**; `streamSafetyTimeoutMs` **840000** |

### Why 250s reasoning is not maxTokens

- `engineMaxOutputTokens` begränsar **completion length**, inte väggklocka för reasoning.  
- 250s **under** 800/840s default → sannolikt **inte** stream safety som primär förklaring utan provider/modell/reasoning.  
- Stor systemprompt → **first-token latency**, inte nödvändigtvis “tokens slut”.

### Confidence (%)

| Claim | % |
|-------|---|
| Repo-siffror | **~100** |
| 250s ≠ maxTokens (koncept) | **~85** |
| Rotorsak utan runtime-loggar | **låg** |

### Improvements (observability)

- Emit resolved caps + route timeouts per run.  
- Timeline: start → first token → last token; reasoning vs completion om API exponerar.  
- Pre-send char/token estimates vs caps.

**Model:** composer-2-fast (subagent)
