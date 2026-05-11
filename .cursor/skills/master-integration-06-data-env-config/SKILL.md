---
name: master-integration-06-data-env-config
description: Creates an 8-agent read-only planning swarm for integrating latest master data, database, env, config, model manifest, package scripts, and strict schema changes while preserving local verified configuration.
---

# Master Integration 06 — Data, Env & Config

## Goal

Plan safe integration of master changes in config/env/data schemas and runtime configuration. Subagents do not edit. Parent writes reports to `master-integration-plans/06-data-env-config/<NN>-<slug>-<date>.txt`.

Each subagent must explain how config/schema/env changes affect the frontend: feature flags, model choices, validation messages, disabled states, setup warnings, and docs. Never include real secrets in reports.

## Pre-flight

Create `master-integration-plans/06-data-env-config/`. Agents must read `docs/ENV.md`, `src/lib/env.ts`, and `config/env-policy.json` before making env recommendations.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-env-policy`: Review env schema, env policy, docs/ENV, examples, and removed/added keys from master.
2. `02-config-models`: Review `src/lib/config.ts`, `config/ai_models/`, model selection tests, and provider routing changes.
3. `03-package-scripts`: Review `package.json`, lockfile implications, dev/build/test scripts, and shell quoting risks.
4. `04-database-client`: Review DB client/schema/migrations/init scripts and master database behavior changes.
5. `05-observability-data`: Review `data/runs`, generation logs, event schemas, and generated log files that should not be committed.
6. `06-strict-schemas`: Review `docs/schemas/strict/`, AJV validation, dossier/scaffold schemas, and TS parity.
7. `07-shadcn-registry`: Review shadcn registry sync, generated registry data, and UI component dependencies.
8. `08-ci-dx`: Review CI/workflow scripts, preflight checks, lint/test settings, and developer workflow after merge.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 06 Data Env Config — <agent>
Date: <YYYY-MM-DD>

## Master Changes
## Local Changes / Dirty Files
## Compatibility Risks
## Files To Update
## Frontend Impact / UI States
## Exact LLM Implementation Instructions
## Verification Commands
## Commit / Ignore Guidance
```

## After Agents

Produce a config migration checklist and a list of files that must not be committed.
