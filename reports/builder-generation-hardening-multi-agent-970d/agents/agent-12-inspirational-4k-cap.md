## Agent 12 — Inspirational scaffold cap mismatch

### Code facts

- `orchestrate.ts`: `scaffoldBudgetChars` från `buildSpec.tokenBudgets.scaffoldChars` (t.ex. light **24k**).  
- `serialize.ts` inspirational: `renderSelectedScaffoldFiles(layoutAndStyleFiles, **Math.min(maxChars, 4_000)**)` — **layout block max 4k** oavsett 20k/24k yttre budget.

### Why shrinking DEFAULT_LIGHTWEIGHT alone may not help layout block

Prod sätter `maxChars` från BuildSpec; inspirational layout är **hårdklippt** till 4k. Sänka `DEFAULT_LIGHTWEIGHT_SCAFFOLD_CHARS` påverkar inte den taket.

### Confidence (%)

**~95%**

### Improvements

- Separat budget `inspirationalLayoutChars` eller procent av `maxChars`.  
- Tester som visar att öka `maxChars` >4000 faktiskt ökar layout-innehåll om det är önskat.

**Model:** composer-2-fast (subagent)
