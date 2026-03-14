# Orchestrator

`.cursor/orchestrator/PROTOCOL.md` is the source of truth for repository-local
multi-agent execution.

Use this area for:

- the canonical `orchestrator run` workflow
- dated run folders under `.cursor/orchestrator/run/`
- archived completed runs under `.cursor/orchestrator/archive/`
- optional `track plan` templates for tiered delegation
- stable terminology for roadmap, agent logs, verification, and final sweep
- local cleanup scripts for stale run folders

Rules:

- New run artifacts go in `.cursor/orchestrator/run/<YYYY-MM-DD>-<slug>/`
- Completed runs should be moved out of `run/` with `archive-completed-runs.ps1`
- For larger efforts, use `track-plans/` plus cheaper tier-3 micro-workloads
- `.cursor/automation/` is legacy input/history and should not receive new runs
- `/orchestrator` and `/automation` both start the same flow

Local cleanup:

- Archive completed runs before a new orchestrator session:
  `powershell -File ".cursor/orchestrator/scripts/archive-completed-runs.ps1"`
- Archive one named completed run:
  `powershell -File ".cursor/orchestrator/scripts/archive-completed-runs.ps1" -RunName "2026-03-13-example-run"`
- Preview stale runs older than five days:
  `powershell -File ".cursor/orchestrator/scripts/prune-old-runs.ps1" -Days 5 -WhatIf`
- Remove them:
  `powershell -File ".cursor/orchestrator/scripts/prune-old-runs.ps1" -Days 5`
