## Agent 24 — Comparing two bad runs (methodology)

### What to diff when logs exist

- Två `logs/generationslogg/<runId>/`: jämför `timeline.ndjson` (ordning + `type`), `summary.md`, `meta.json`.  
- Prompt: kopiera `data/prompt-dumps/...` per körning eller hasha `generation-input-package.json`.  
- Samma `lineageHash` ⇒ samma orchestration-input-fingerprint; skillnad nedströms ⇒ non-determinism / repair / provider.

### What cannot be done in this workspace

Ingen `logs/generationslogg/`, inga sparade per-run dumps → **ingen** faktisk A/B på dina två senaste körningar här.

### Confidence (%)

Med två fulla run-mappar: **80–90%** på pipeline-diff. I detta workspace: **10–25%** för era specifika runs.

### Improvements

- `GENERATIONSLOGG=1` + arkivera run-mappar före LRU.  
- Tidsstämplade prompt-dumps per `runId`.

**Model:** composer-2-fast (subagent)
