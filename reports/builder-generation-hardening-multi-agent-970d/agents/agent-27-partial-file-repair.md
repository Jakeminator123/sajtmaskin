## Agent 27 — Partial-file repair loop

### Trigger conditions

Efter första preflight: issues vars meddelande matchar `isPartialFileOutputIssue` (`partial repair snippet`, `file excerpt instead of a complete file`, overlapping imports, nested import block). Kräver extraherbara filpaths.

### Latency impact

Per försök: `runLlmRepairGate` **60s** timeout + `runAutoFix`. Loop upp till `maxAttempts` (manifest default ofta **1**); vid `result.partial` → break. Lyckad repair → **hel** preflight igen.

### Confidence (%)

Trigger/latency-struktur: **~90%**.

### Improvements

- Alignera fler sanity-strängar om de ska räknas som partial.  
- Överväg >1 attempt när gate returnerar partial men innehåll förbättrats.

**Model:** composer-2-fast (subagent)
