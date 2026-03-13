---
name: orchestrator-run
description: Plan and execute documented multi-agent work using the repository's orchestrator run protocol. Use when the user asks for an orchestrator agent, run automation, sequential workloads, roadmap-driven delegation, agent logs, verification handoff, or a final sweep.
---

# Orchestrator Run

Use this skill for long, structured, multi-step execution that should be tracked in a dated run folder.

## Quick start

1. Read `.cursor/orchestrator/PROTOCOL.md`.
2. Use `.cursor/rules/terminology.mdc` for canonical run terms.
3. Treat `run automation` as a legacy alias for the same flow.
4. Create or continue a dated folder in `.cursor/orchestrator/run/`.

## Non-negotiable rules

- Document every meaningful step in the run folder.
- Default to sequential agents, not parallel agents.
- Validate each workload before starting the next one.
- Let the orchestrator agent perform minor cleanup fixes between workloads when needed.
- End every run with `FINAL_SWEEP.md` and `FINAL_REPORT.md`.

## Cost-aware delegation

When the run is broad, prefer three tiers:

1. Tier 1 `orchestrator agent` owns the roadmap and sequencing.
2. Tier 2 `track leads` own `track plan` files for major workstreams.
3. Tier 3 micro-workers handle small, narrow tasks with minimal context.

Default to about `3` to `6` track plans before spawning many small workers. This
usually lowers token cost because tier-3 agents do not need the full repo story.

## Required run artifacts

Each orchestrator run should maintain:

- `ROADMAP.md`
- `ORCHESTRATOR_LOG.md`
- optional `track-plans/` for tier-2 coordination
- one workload file per step in `workloads/`
- one agent log per delegated step in `agent-logs/`
- one verification note per completed step in `verification/`
- `FINAL_SWEEP.md`
- `FINAL_REPORT.md`

Use `context/raw-input/`, `context/compiled-input/`, and `artifacts/` when they help preserve the execution trail.

## Workflow

1. Clarify goal, inputs, and model preferences.
2. Scan the repo before freezing the roadmap.
3. Split work into sequential workloads with acceptance criteria.
4. Delegate one workload at a time.
5. Verify, patch small issues, and record what happened.
6. Run the final sweep before closeout.
7. Promote durable conclusions into normal repository docs when appropriate.

## Output behavior

- Keep names stable: `orchestrator run`, `orchestrator agent`, `run roadmap`, `agent log`, `final sweep`.
- Use `track plan` for the intermediate tier instead of inventing new names mid-run.
- Keep old completed runs under `.cursor/orchestrator/run/`; do not create a second archive root.
- Treat `.cursor/automation/` as legacy reference only unless the user explicitly asks to inspect it.
