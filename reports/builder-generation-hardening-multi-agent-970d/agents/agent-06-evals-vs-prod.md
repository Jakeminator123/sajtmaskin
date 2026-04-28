## Agent 06 — Evals vs production drift

### What evals likely cover / skip

| System | Covers | Skips |
|--------|--------|--------|
| `scaffolds:eval` / scaffold-eval | Scaffold-val | Full codegen, merge, preview |
| Codegen eval (`src/lib/gen/eval/`) | ~15 prompts, `prepareGenerationContext` + `generateCode`, statiska checks | Nordtak-liknande prompts, follow-up, lång historik, riktig preview-UX |
| Vitest runnar | Gate-logik | Ingen riktig LLM-svit |

### Hypotheses for good evals + bad Nordtak

1. Olika eval-yta (scaffold grön, codegen röd).  
2. Smalt fixture-set.  
3. Modell/routing/env skiljer prod.  
4. Baseline/gate toleranser följer modellnedgång.  
5. Init vs follow-up.  
6. Trunkerade prompt-dumps ≠ eval-fixtures.

### Confidence (%)

| Påstående | % |
|-----------|---|
| Tre separata eval-spår | **95** |
| Nordtak utanför fixtures | **70** (plausible) |

### Improvements

- Reproducerbara case nära verkliga failures.  
- Golden hash av composed system prompt per känt case.  
- Follow-up harness.  
- Tydlig rapport: scaffold-eval ≠ e2e.

**Model:** composer-2-fast (subagent)
