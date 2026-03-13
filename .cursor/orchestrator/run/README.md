# Orchestrator Run Folders

Create one dated folder per execution:

- `2026-03-13-bug-recheck-sweep`
- `2026-03-13-landing-v2-audit`
- `2026-03-13-builder-phase-3-followup`

Minimum expected contents:

- `ROADMAP.md`
- `ORCHESTRATOR_LOG.md`
- `track-plans/` for larger runs
- `workloads/`
- `agent-logs/`
- `verification/`
- `FINAL_SWEEP.md`
- `FINAL_REPORT.md`

Optional supporting directories:

- `context/raw-input/`
- `context/compiled-input/`
- `artifacts/`

Keep old runs in this folder. Do not create a second active `runs/` root elsewhere.
This folder is intended to be local and gitignored apart from this `README.md`.
