# Orchestrator Run Protocol

This repository now treats `.cursor/orchestrator/` as the canonical home for
repository-local multi-agent execution traces.

## Purpose

Use an `orchestrator run` when work needs:

- a scoped roadmap before implementation
- delegated agent workloads with explicit handoff
- verification between steps
- a durable audit trail of what changed and why

## Startup aliases

Use these as compact entry phrases for the same system:

- `/orchestrator`
- `/automation`
- `run automation` (legacy)

When one of these appears at the start of the chat, the agent should treat it as
enough signal to enter the orchestrator-run workflow, respond with a short
intention summary, and ask only the clarifying questions needed to scope the run.

## Canonical storage

All new runs live under:

`.cursor/orchestrator/run/<YYYY-MM-DD>-<slug>/`

Each dated folder is both the active workspace and the archive record for that
run. There is no second archive root for completed runs.

## Required run artifacts

Each orchestrator run should maintain:

- `ROADMAP.md`
- `ORCHESTRATOR_LOG.md`
- optional `track-plans/` when the run is broad enough to justify an intermediate coordination layer
- `workloads/`
- `agent-logs/`
- `verification/`
- `FINAL_SWEEP.md`
- `FINAL_REPORT.md`

Optional support areas include `context/raw-input/`, `context/compiled-input/`,
and `artifacts/`.

## Execution model

The `orchestrator agent` owns the run. It should:

1. understand the goal and scan the repo
2. write the run roadmap and workload files
3. delegate one workload at a time by default
4. validate each step before the next one begins
5. apply minor fixes directly when needed to keep the sequence moving
6. close with a `final sweep`

The `final sweep` explicitly looks for dead code, ghost routes, stale files,
temporary artifacts, and documentation drift left behind by the run.

## Cost-aware hierarchy

For smaller runs, a normal two-level flow is enough:

- orchestrator -> workloads

For broader runs, use three levels:

1. tier 1 `orchestrator agent`
2. tier 2 `track plan` owners
3. tier 3 micro-workers

This works well when the orchestrator can split the run into about `3` to `6`
track plans. Each track lead then translates one wider problem area into smaller
micro-workloads for cheaper agents with narrower context windows.

Why this is useful:

- the top level keeps architectural coherence
- the middle level absorbs domain context once instead of repeating it
- the bottom level can run smaller prompts and usually cheaper models

The trade-off is extra coordination overhead. Use the third tier only when the
run is large enough that repeated full-context prompts would cost more than the
added handoff docs.

## Relationship to `docs/plans/`

`docs/plans/` remains the home for durable human planning artifacts that need a
lifecycle state such as `active`, `review-needed`, or `archived`.

`.cursor/orchestrator/run/` is different:

- it stores execution traces and handoff artifacts
- it is tied to a specific run date and scope
- it should not be treated as a substitute for canonical architecture docs

If an orchestrator run produces lasting product or architecture knowledge,
promote that knowledge into `docs/` in the same work session.

## Retention

Run folders under `.cursor/orchestrator/run/` should be treated as local working
artifacts rather than permanent Git history.

- keep the run root gitignored apart from the tracked `README.md`
- promote durable conclusions into `docs/`
- prune stale dated runs locally with the retention script when they are no
  longer useful

Default local cleanup command:

```powershell
powershell -File ".cursor/orchestrator/scripts/prune-old-runs.ps1" -Days 5 -WhatIf
```

## Legacy note

Older `run automation` material under `.cursor/automation/` is now legacy. It
may still be useful as reference input, but new runs should not write there.
