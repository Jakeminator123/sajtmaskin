# Orchestrator

`.cursor/orchestrator/PROTOCOL.md` is the source of truth for repository-local
multi-agent execution.

Use this area for:

- the canonical `orchestrator run` workflow
- dated run folders under `.cursor/orchestrator/run/`
- optional `track plan` templates for tiered delegation
- stable terminology for roadmap, agent logs, verification, and final sweep
- local cleanup scripts for stale run folders

Rules:

- New run artifacts go in `.cursor/orchestrator/run/<YYYY-MM-DD>-<slug>/`
- Completed runs stay under `run/`; the dated folder is the archive record
- For larger efforts, use `track-plans/` plus cheaper tier-3 micro-workloads
- `.cursor/automation/` is legacy input/history and should not receive new runs
- `run automation` is still accepted as a legacy alias for starting the same flow

Local cleanup:

- Preview stale runs older than five days:
  `powershell -File ".cursor/orchestrator/scripts/prune-old-runs.ps1" -Days 5 -WhatIf`
- Remove them:
  `powershell -File ".cursor/orchestrator/scripts/prune-old-runs.ps1" -Days 5`
