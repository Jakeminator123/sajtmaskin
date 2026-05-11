---
name: master-integration-10-masterplan-synthesis
description: Creates an 8-agent read-only planning swarm that turns all master-integration subagent reports into one actionable masterplan for safely merging latest origin/master into the existing frontend branch.
---

# Master Integration 10 — Masterplan Synthesis

## Goal

After running the other `master-integration-*` skills, launch 8 read-only synthesis agents that convert the reports into one executable masterplan. Subagents do not edit code. Parent writes reports to `master-integration-plans/10-masterplan-synthesis/<NN>-<slug>-<date>.txt`.

Each synthesis agent must convert earlier reports into a clear implementation brief for a later LLM: ordered frontend tasks, backend contract wiring, required buttons/choices, files to touch, acceptance criteria, verification commands, and explicit UI/UX preservation rules.

## Pre-flight

1. Create `master-integration-plans/10-masterplan-synthesis/`.
2. Gather all existing reports under `master-integration-plans/01-*` through `09-*`.
3. If earlier reports are missing, agents must clearly mark assumptions.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-executive-plan`: Produce the top-level integration strategy and sequencing.
2. `02-conflict-resolution-playbook`: Produce file-by-file conflict policy: take master, take ours, or manually merge.
3. `03-porting-backlog`: Convert required local UI/UX/postMessage/shrink-retry preservation into an implementation backlog.
4. `04-master-feature-backlog`: Convert new master features into acceptance criteria and frontend wiring tasks.
5. `05-verification-ladder`: Combine all test/runtime checks into one ordered command ladder.
6. `06-risk-register`: Create a severity-ranked risk register with mitigation and rollback notes.
7. `07-commit-pr-plan`: Propose commit boundaries, files to exclude, PR summary, and review notes.
8. `08-final-masterplan-draft`: Draft the final `MASTER-INTEGRATION-MASTERPLAN.md` content from all reports.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 10 Masterplan Synthesis — <agent>
Date: <YYYY-MM-DD>

## Inputs Read
## Synthesis
## Ordered Plan
## Exact LLM Implementation Brief
## Acceptance Criteria
## Risks / Mitigations
## Final Recommendations
```

## After Agents

Parent should assemble `master-integration-plans/MASTER-INTEGRATION-MASTERPLAN.md` only after user asks to synthesize or run the masterplan step. Do not execute merge operations from this skill alone.
