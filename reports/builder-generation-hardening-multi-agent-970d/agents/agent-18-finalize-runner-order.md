## Agent 18 — Finalize runner phase order

### Ordered list

0. codegen wall-clock  
1. URL expand  
2. Autofix pre-phase  
3. validateAndFix (syntax / warm TSC / ESLint)  
4. Materialize images (deep path)  
5. Verifier (+ optional fixer + rerun)  
6. Preflight (+ partial-file repair → **second** preflight)  
7. Persist + side effects

### Latency hotspots

Sekventiell summa: verifier LLM, syntax/TSC, partial-file + dubbel preflight.

### Confidence (%)

Ordning: **95%**. Dominant step utan trace: **60–70%**.

### Improvements

- Instrumentera per-steg P95.  
- Minska staplade LLM-varv (single repair gate).

**Model:** composer-2-fast (subagent)
