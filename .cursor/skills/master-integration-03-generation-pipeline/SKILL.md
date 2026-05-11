---
name: master-integration-03-generation-pipeline
description: Creates an 8-agent read-only planning swarm for integrating latest master generation, own-engine, orchestration, prompt, dossier, scaffold, autofix, verifier, and finalize pipeline changes with the local frontend branch.
---

# Master Integration 03 — Generation Pipeline

## Goal

Plan integration of all latest master generation/backend intelligence changes while preserving local build-out, shrink retry, verifier feedback, preview, and UI expectations. Subagents are read-only. Parent writes reports to `master-integration-plans/03-generation-pipeline/<NN>-<slug>-<date>.txt`.

Each subagent must convert pipeline changes into precise frontend-facing requirements: stream events, progress labels, repair/finalize states, capability toggles, prompt actions, and verification UI that must be wired without redesigning the current experience.

## Pre-flight

1. Create `master-integration-plans/03-generation-pipeline/`.
2. Include `origin/master` SHA, `HEAD` SHA, and known local policy: `port_ours` for local UI/UX plus postMessage build-out behavior.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-orchestrate`: Review `src/lib/gen/orchestrate*`, follow-up contracts, build intent, quality inheritance, and route planning.
2. `02-system-prompt`: Review `src/lib/gen/system-prompt/`, dynamic context, media catalog, build-out request, and token budget ordering.
3. `03-build-spec-contracts`: Review build-spec derivation, route contracts, capability detection, and app/website promotion guards.
4. `04-scaffolds-variants`: Review scaffold manifests, matcher, embeddings, keyword banks, and variant locks.
5. `05-dossiers-capabilities`: Review dossiers, strict schema validation, capability maps, and env var requirements.
6. `06-finalize-preflight`: Review finalize preflight, shell pages, required file gates, count parity, and local postMessage scripts.
7. `07-autofix-verifier`: Review mechanical autofix, LLM-fix, verifier findings, quality-gate checks, and repair retry behavior.
8. `08-own-engine-provider`: Review own-engine provider stream lifecycle, golden tests, model routing, shrink retry, and emitted events.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 03 Generation Pipeline — <agent>
Date: <YYYY-MM-DD>

## Master Pipeline Changes
## Local Behaviors To Preserve
## Merge/Port Plan
## Frontend Wiring / UI Surface Needed
## Exact LLM Implementation Instructions
## Regression Risks
## Required Tests
## Open Questions
```

## After Agents

Create a dependency-ordered plan from prompt/orchestration through finalize/preview.
