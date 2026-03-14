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

When a run is complete (FINAL_SWEEP + FINAL_REPORT done), archive it with `powershell -File ".cursor/orchestrator/scripts/archive-completed-runs.ps1" -RunName "<YYYY-MM-DD>-<slug>"`. This moves it to `.cursor/orchestrator/archive/<YYYY-MM-DD>-<slug>-<HHMMSS>/`, appends a summary to `.cursor/orchestrator/run-summaries.md`, and keeps `run/` lean.

This folder is intended to be local and gitignored apart from this `README.md`.
