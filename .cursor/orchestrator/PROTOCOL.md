# Orchestrator Run Protocol

This file is the canonical protocol for repository-local multi-agent execution.

## Core terms

- `orchestrator run`: one dated execution folder in `.cursor/orchestrator/run/`
- `orchestrator agent`: the coordinating agent that plans, delegates, validates, and performs minor fixes between steps
- `run roadmap`: the per-run plan file `ROADMAP.md`
- `track plan`: an optional tier-2 plan file that groups related micro-workloads under one narrower coordinator
- `agent log`: the per-workload log written by the executing agent
- `final sweep`: the closing audit for dead code, ghost routes, stale files, leftover artifacts, and documentation drift

## Canonical root

All new run artifacts must live under:

`.cursor/orchestrator/run/<YYYY-MM-DD>-<slug>/`

Rules:

- When a run is complete, archive it to `.cursor/orchestrator/archive/` so `run/` stays lean and indexing tokens stay low.
- Do not create new run outputs under `.cursor/automation/`.
- Treat `/orchestrator` and `/automation` as the valid startup aliases for beginning an `orchestrator run`.
- If an older automation folder contains useful history, treat it as reference input only.

## Startup trigger behavior

If the user's message starts with `/orchestrator` or `/automation`:

- assume they want to enter the orchestrator-run system immediately
- do not require them to restate the whole protocol
- treat the slash-prefixed opener as part of the prompt contract for this workflow
- begin with a short intention summary describing what the orchestrator agent is about to do
- ask only the minimum clarifying questions needed to make the run safe and well-scoped

## Required run structure

Each run folder should contain:

```text
.cursor/orchestrator/run/<YYYY-MM-DD>-<slug>/
  ROADMAP.md
  ORCHESTRATOR_LOG.md
  context/
    raw-input/
    compiled-input/
  track-plans/
    01-<slug>.md
  workloads/
    01-01-<slug>.md
  agent-logs/
    01-01-<slug>.md
  verification/
    01-01-<slug>.md
  artifacts/
  FINAL_SWEEP.md
  FINAL_REPORT.md
```

Use the nearest useful subset when the run is smaller, but keep the same naming.

## Phase 0: Pre-flight (when starting `/orchestrator` or `/automation`)

Before creating a new run folder:

1. Run `powershell -File ".cursor/orchestrator/scripts/archive-completed-runs.ps1"` from the repo root.
2. This archives any completed run in `run/` to `.cursor/orchestrator/archive/<YYYY-MM-DD>-<slug>-<HHMMSS>/`.
3. The script also appends a compact entry to `.cursor/orchestrator/run-summaries.md`.
4. This keeps `run/` lean and avoids indexing old runs.

## Phase 1: Interactive intake

Before autonomous execution:

1. Confirm the end goal and intended outcome.
2. Collect all user-provided input files and contextual constraints.
3. Ask whether raw input should be normalized into `context/compiled-input/`.
4. Ask for model preference if the run will delegate to subagents.
5. Scan the target project before planning.
6. Summarize scope, likely risks, and expected effort.
7. Ask any clarifying questions needed to avoid misaligned workloads.

Do not start autonomous delegation until the goal is clear enough to survive without more user questions.

## Phase 2: Planning and scaffolding

The `orchestrator agent` must:

1. Create the dated run folder.
2. Write `ROADMAP.md` with scope, assumptions, risks, workload order, and acceptance criteria.
3. Start `ORCHESTRATOR_LOG.md` as a running ledger of decisions, delegations, and manual fixes.
4. Create one workload file per sequential step in `workloads/`.
5. Ensure each workload explicitly points back to `ROADMAP.md`.

Documentation is mandatory. If a decision changes execution, record it in the run folder the same turn.

## Optional tiered delegation

Use a three-tier model when the run is large enough that the orchestrator would
otherwise push too much context into every agent.

### Tier 1: Orchestrator

The top-level orchestrator agent owns:

- `ROADMAP.md`
- overall acceptance criteria
- sequencing between tracks
- validation between stages

### Tier 2: Track leads

For broader runs, split the roadmap into roughly `3` to `6` `track plan` files
inside `track-plans/`.

Each track lead agent should:

- receive only the roadmap plus the relevant track plan
- own one coherent problem area
- break its scope into `2` to `8` narrow micro-workloads
- aggregate findings so tier-3 agents do not need the full run context

### Tier 3: Micro-workers

Tier-3 agents should handle the smallest practical unit of work:

- one bug family
- one route family
- one UI slice
- one focused refactor
- one validation/fix loop

Keep their prompt narrow and acceptance criteria explicit. This is the main
token-saving layer.

### Model guidance

- Tier 1: use the default orchestrator model for cross-cutting reasoning
- Tier 2: prefer a faster model unless the track has major architecture decisions
- Tier 3: default to the fastest practical model for narrow, well-specified tasks

If the run is small, skip tier 2 entirely and stay with the normal two-level
orchestrator -> workload pattern.

## Phase 3: Sequential execution

Default to one agent at a time unless the user explicitly asks for parallelization.

For each workload:

1. Launch the agent with the workload file plus any required context.
2. Require the agent to write an `agent log`.
3. Validate the result before moving on.
4. Write a verification note in `verification/`.
5. If validation fails, fix or re-run before continuing.
6. If the orchestrator agent makes a minor fix directly, record it in `ORCHESTRATOR_LOG.md`.

Never leave an unverified workload as "good enough" if later steps depend on it.

## Phase 4: Final sweep

Every completed run must end with `FINAL_SWEEP.md`.

The final sweep checks for:

- dead code introduced or left behind by the run
- ghost routes, stale imports, or orphaned files
- temporary artifacts that should not survive
- documentation drift between code, rules, and human docs
- remaining lint, type, test, or build failures that the run should reasonably catch

## Phase 5: Closeout

Close the run by writing `FINAL_REPORT.md` with:

- planned scope versus delivered scope
- status per workload
- important deviations or follow-up risks
- verification summary
- final disposition of any unresolved items

If the run produces durable knowledge, promote that knowledge into the normal repository docs in the same turn.

Then **archive the completed run**:

1. Run `powershell -File ".cursor/orchestrator/scripts/archive-completed-runs.ps1" -RunName "<YYYY-MM-DD>-<slug>"`.
2. The script moves the run folder to `.cursor/orchestrator/archive/<YYYY-MM-DD>-<slug>-<HHMMSS>/` (add timestamp so multiple runs per day are unique).
3. The script appends a short summary to `.cursor/orchestrator/run-summaries.md`. This file stays indexed so other agents can quickly see recent runs without loading full archives.
4. The archive folder is cursor-ignored and git-ignored; use exact paths when you need to read archived content.

### Run summary format (for `run-summaries.md`)

```markdown
## <YYYY-MM-DD>-<slug> (archived <YYYY-MM-DD> <HH:MM>)
- **Scope:** One-line description of what the run delivered.
- **Workloads:** N completed, M verified.
- **Key outcomes:** 2–4 bullet points.
- **Archive path:** `.cursor/orchestrator/archive/<YYYY-MM-DD>-<slug>-<HHMMSS>/`
```

Keep each entry under ~15 lines. Agents can read `run-summaries.md` for context, then open specific archive paths if needed.

## Local retention

Run folders are local execution artifacts and should stay out of normal Git history.

- Keep `.cursor/orchestrator/run/` gitignored except for the tracked `README.md`
- Archive completed runs to `.cursor/orchestrator/archive/` (cursor-ignored and git-ignored)
- Prefer promoting durable conclusions into `docs/` instead of keeping long-term knowledge only in old runs
- Use `.cursor/orchestrator/scripts/prune-old-runs.ps1` to remove stale archived folders older than the chosen retention window (update the script to target `archive/` instead of `run/`)
