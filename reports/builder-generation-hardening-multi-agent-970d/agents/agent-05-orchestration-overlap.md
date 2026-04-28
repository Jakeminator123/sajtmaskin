## Agent 05 — Orchestration overlap risks

### Components touched

| Fil | Roll |
|-----|------|
| `orchestrate.ts` | Huvudentry: prepare context, scaffold, generation package |
| `orchestrate/scaffold-variant-resolver.ts` | Variant vs orchestrate |
| `system-prompt/build-dynamic-context.ts` | Dynamisk prompt; variant-fallback måste synkas med orchestrate |
| `stream/finalize-version/runner.ts` | Finalize-orchestrator |
| `stream/finalize-version/verifier-phase.ts` | Verifier + fixer |
| `stream/finalize-version/partial-file.ts` | Partial repair + autofix igen |
| `verify/repair-loop.ts` / `server-verify.ts` | Separat repair-loop |

### Where duplicate repair/verify could stack latency

- Flera `runLlmFixer`-banor i rad (syntax → verifier → partial).  
- `runAutoFix` upprepas efter fixer.  
- Två repair-världar: finalize vs `verify/repair-loop` om båda triggas.  
- Verifier re-run efter fix.

### Confidence (%)

**78%** — bygger på doc + grep; full runner-rad-för-rad ej verifierad i subagent.

### Improvements

- En repair-gate; färre call-sites till `runLlmFixer`.  
- Single path för scaffold/variant in i dynamisk kontext.  
- Telemetri: antal `runLlmFixer` per `versionId`.

**Model:** composer-2-fast (subagent)
