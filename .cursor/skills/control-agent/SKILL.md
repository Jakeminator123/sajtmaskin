---
name: control-agent
description: Run a lightweight sentry review of the current in-progress workstream. Use when the user says `/control-agent`, asks for a quick second opinion on recent implementation work, or wants the `workstream-sentry` agent to inspect the latest diff with a short handoff.
---

# Control Agent

Use this skill to activate the project-local `workstream-sentry` review flow.

## Purpose

This workflow is for **in-progress workstream review**, not for orchestrator runs
 and not for final workload verification.

It should feel like:

- "take the latest implementation work"
- "build a short handoff from the current context"
- "run the sentry reviewer"
- "report findings briefly"

## Keep It Separate

Do **not** mix this flow up with other `.cursor` systems:

- not `orchestrator-run`
- not `verifier`
- not `debugger`

Use `workstream-sentry` specifically for a focused second-pass review of the
current ongoing work.

## Activation

Use this skill when:

- the user writes `/control-agent`
- the user asks for a quick review of the latest work
- the user wants a bug-hunt pass on the current diff before moving on

## Workflow

1. Identify the current workstream from recent chat context and current diff.
2. Build a short handoff containing:
   - what was just changed
   - the main files touched
   - expected new behavior
   - any known tradeoffs or unfinished areas
3. Launch the `workstream-sentry` agent with that handoff.
4. Return findings first.
5. If there are no findings, say that explicitly.
6. Do not fix issues inside this workflow. This flow is for read-only bug suggestions only.
7. If the caller wants local retention, keep ephemeral material under `.cursor/control-agent/run/` and archive it later to `.cursor/control-agent/archive/`, while only the short index in `.cursor/control-agent/review-summaries.md` remains visible in normal repo context.

## Context Budget

Use only the context needed for the current workstream:

- recent implementation summary from this chat
- current diff / changed files
- local diagnostics or fast verification results when relevant

Do not dump the entire repo story into the sentry review unless the workstream
really spans that much surface.

## Output Shape

Use a short summary:

- whether the sentry review found issues
- the main findings, if any
- whether it looks safe to continue
- no fixes, no edits, no commits from the sentry pass itself
