---
name: master-integration-01-git-delta-scope
description: Creates an 8-agent read-only planning swarm for integrating latest origin/master into frontend/christopher without losing local frontend UI/UX. Use when planning master merge scope, commit graph comparison, conflict inventory, or safe integration order.
---

# Master Integration 01 — Git Delta & Scope

Use this skill before merging latest `origin/master` into `frontend/christopher`.

## Goal

Launch 8 parallel read-only subagents that map the Git delta, likely conflicts, and safe merge sequencing. No agent edits code. Each subagent returns a `.txt` report body; the parent writes it to `master-integration-plans/01-git-delta-scope/<NN>-<slug>-<date>.txt`.

Every report must be written as instructions for a later implementation LLM: exact files to inspect/change, frontend contracts affected by master, UI/UX areas that must stay visually unchanged, and verification commands.

## Pre-flight

1. Fetch remote: `git fetch origin`.
2. Record: `git rev-parse HEAD`, `git rev-parse origin/master`, `git rev-list --left-right --count HEAD...origin/master`.
3. Create `master-integration-plans/01-git-delta-scope/`.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-commit-graph`: Compare branch history, merge-base, ahead/behind counts, and categorize new master commits by subsystem.
2. `02-conflict-forecast`: Forecast likely file conflicts from `git diff --name-status HEAD...origin/master` and current dirty files.
3. `03-local-uncommitted-scope`: Classify current modified/untracked files into integration-critical, generated/log noise, review artifacts, or unrelated.
4. `04-merge-order`: Propose safe commit/stash/merge order for dirty tree using `commit_first` policy.
5. `05-port-ours-policy`: List files where local UI/UX or postMessage behavior must be preserved and ported into master structures.
6. `06-master-new-features`: Summarize new master features that must be retained and verified after merge.
7. `07-risk-map`: Identify top conflict/regression risks with owner area and required verification.
8. `08-command-plan`: Produce exact non-destructive command sequence for final integration.

## Report Format

Each report must include:

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 01 Git Delta & Scope — <agent>
Date: <YYYY-MM-DD>

## Scope
## Evidence
## Findings
## Recommended Actions
## Exact LLM Implementation Instructions
## Verification Needed
## Do Not Break
```

## After Agents

Read all 8 reports and summarize unresolved questions, then wait for user approval before executing a merge.
