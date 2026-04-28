## Agent 16 — Plan ↔ repo file mapping

### Table: todo id → files → risk

| Todo | Primära filer | Risk |
|------|---------------|------|
| fix-scaffold-truncation | `serialize.ts`, ev. `orchestrate.ts` | Asymmetrisk trunkering |
| shrink-dynamic-context | `build-dynamic-context.ts`, `budget.ts`, `tokens.ts`, `token-budgets.ts` | Påverkar alla prompts |
| fix-home-route-recovery | `finalize-preflight.ts`, `finalize-merge.ts` | Recovery vs trivial gate-förväxling |
| autofix-heavy-load-gate | `pre-phases.ts`, `runner.ts`, `persist-side-effects.ts` | Dubbel event-semantik |
| html-element-jsx-fixer | `dom-builtin-jsx-fixer.ts` (finns) | Regex-risk |
| first-token-watchdog | `stream-format.ts` / ny — **ingen** `first_token_slow` idag | Ny implementation |
| verify-with-prompt-dump | `prompt-dump.ts`, stream entrypoints | Lokalt/gitignored |

### Ordering recommendation

1. shrink-dynamic-context + fix-scaffold-truncation (signal + storlek)  
2. dom-fixer / heavy-load policy  
3. home recovery utökning  
4. prompt-dump verifiering  
5. first-token watchdog sist eller parallellt

### Confidence plan completeness (%)

**~75–85%** — watchdog saknar entydig kod-anchor.

### Improvements

- Specificera watchdog-mätetal (SSE TTFB vs reasoning-end).

**Model:** composer-2-fast (subagent)
