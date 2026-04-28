## Agent 04 — Dynamic vs static prompt growth

### Key constants / budgets

| Konstant / källa | Värde / beteende |
|------------------|-------------------|
| Static core | `compose.ts` → `getStaticCoreFromWorkspace()`; kommentar ~8–10k tokens |
| `DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS` | `30_000` (`budget.ts`) |
| Effektiv dynamisk budget | `Math.max(900, buildSpec?.tokenBudgets.systemContextTokens ?? DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS)` |
| Pruning | Block priority; required kan trunkeras; icke-required droppas först |
| `DEFAULT_LIGHTWEIGHT_SCAFFOLD_CHARS` | `20_000` i `serialize.ts` — fallback när `maxChars` saknas |

### How inspirational scaffold budget works

- Init + icke-heavy → `"inspirational"`; follow-up eller heavy → `"structural"` (`orchestrate.ts`).
- **Inspirational:** `## Layout & Theme Files` byggd av `renderSelectedScaffoldFiles(..., Math.min(maxChars, 4_000))` — **layout hårdkapat till max 4k tecken** oavsett större `maxChars`.

### Confidence shrinking dynamic helps first-token (%)

**Ingen kod anger %-förbättring.** Heuristiskt: mindre prompt → ofta bättre TTFT; **subjektiv 40–55%** att sänka dynamisk/sektion-storlek hjälper märkbart om flaskhals är modellprefill, inte output-cap.

### Improvements

1. Harmoniera `DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS` vs `token-budgets` när `systemContextTokens` saknas.  
2. Dokumentera inspirational **4k**-tak vs `scaffoldChars`.  
3. Telemetri vid prune (vilka block som föll).

**Model:** composer-2-fast (subagent)
