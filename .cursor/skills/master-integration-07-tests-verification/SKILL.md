---
name: master-integration-07-tests-verification
description: Creates an 8-agent read-only planning swarm for building a verification plan for latest master integration: unit tests, integration tests, build, lint, typecheck, Playwright, CSP, dev/prod smoke, and regression coverage.
---

# Master Integration 07 — Tests & Verification

## Goal

Plan the verification strategy required after integrating latest master into the local frontend branch. Subagents are read-only. Parent writes reports to `master-integration-plans/07-tests-verification/<NN>-<slug>-<date>.txt`.

Each subagent must turn findings into exact test instructions for the implementation LLM: files to update/add, mocked backend contracts, UI states to assert, commands to run, and pass/fail criteria.

## Pre-flight

Create `master-integration-plans/07-tests-verification/`. Include recent known green baseline if available: typecheck, test:ci, build, lint, dossier/scaffold validation, dev/prod smoke.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-unit-core`: Identify core unit tests for generation, orchestration, schemas, env, and model routing.
2. `02-stream-integration`: Identify chat stream and own-engine integration tests required after merge.
3. `03-builder-ui-tests`: Identify TSX/component tests covering local UI/UX that must stay green.
4. `04-preview-runtime-tests`: Identify preview, VM, quality-gate, and iframe smoke tests.
5. `05-dossier-scaffold-tests`: Identify dossier/scaffold validation and strict schema checks.
6. `06-e2e-browser`: Define Playwright dev/prod smoke, route coverage, API checks, and console/CSP assertions.
7. `07-lint-type-build`: Define exact order and interpretation for typecheck, build, lint warnings, and known non-blockers.
8. `08-regression-gaps`: Find missing tests likely needed because of latest master changes.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 07 Tests Verification — <agent>
Date: <YYYY-MM-DD>

## Required Checks
## Existing Tests
## Missing Coverage
## Frontend Behaviors To Assert
## Exact LLM Implementation Instructions
## Failure Triage Guide
## Exact Commands
## Pass Criteria
```

## After Agents

Synthesize a single ordered verification ladder from fastest checks to full runtime smoke.
