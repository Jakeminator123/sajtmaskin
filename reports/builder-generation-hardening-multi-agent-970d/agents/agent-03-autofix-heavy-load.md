## Agent 03 — autofix_heavy_load gating

### Where emitted

| Plats | Vad som händer |
|--------|----------------|
| **`pre-phases.ts`** | Efter `runAutoFix`: `autoFixHeavyLoad = autoFixFixCount > 5`. Om sant: `devLogAppend("in-progress", { type: "autofix.heavy_load", ... })`. |
| **`persist-side-effects.ts`** | Vid `autoFixHeavyLoad` läggs en **preflight warning** till (`meta.event: "autofix_heavy_load"`) — annan kanal än dev-loggens `autofix.heavy_load`. |
| **`generation-log-writer.ts`** | Projicerar bus-händelser med nyckeln `"autofix.heavy_load"` till generationslogg. |

### Current behavior vs ideal gate

| Aspekt | Nu | Ideal gate (plan) |
|--------|-----|-------------------|
| **Verifier / repair-loop** | `autoFixHeavyLoad` påverkar **inte** `hasVerificationBlockingErrors`. Verifier körs utan heavy-load-villkor. | Heavy load som signal för eskalation / hoppa verifier-pass tills repair. |
| **`check-autofix-load.mjs`** | Batch/CI mot frekvens — **inte** runtime-gate på samma körning. | — |

### Confidence (%)

**~95%** — Emission och avsaknad av koppling till verifier-gate är direktläsbar i koden.

### Improvements

1. **En tydlig policy** om heavy load ska vara telemetri vs mjuk/hård gate — koppla `autoFixHeavyLoad` explicit i `runner` / fast-path.  
2. **Namnkonsistens**: `autofix.heavy_load` (devLog) vs `autofix_heavy_load` (preflight `meta.event`).  
3. Minska triggers uppströms (prompt/import-checklist) per befintliga planer.

**Model:** composer-2-fast (subagent)
