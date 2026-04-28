## Agent 23 — Generationslogg paths

### Env vars

- `GENERATIONSLOGG`: måste vara truthy **och** `NODE_ENV !== "production"` för skrivning (`isGenerationLogEnabled`).

### Typical folder layout

- `logs/generationslogg/<runId>/timeline.ndjson`, `summary.md`, `meta.json`, …  
- `logs/generationslogg/_latest.txt`, `_index/chat-to-run.json`  
- `logs/site-observability/<chatId>/`

### Confidence (%)

**~95%** för path + gate.

### Improvements

- Synka `docs/ENV.md` retention (15 vs "3" i doc om mismatch).  
- Operativt: börja alltid med `timeline.ndjson`.

**Model:** composer-2-fast (subagent)
