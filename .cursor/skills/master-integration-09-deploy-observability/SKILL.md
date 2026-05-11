---
name: master-integration-09-deploy-observability
description: Creates an 8-agent read-only planning swarm for integrating latest master deploy, domains, Vercel, observability, analytics, logging, CSP, security headers, and production-readiness changes.
---

# Master Integration 09 — Deploy & Observability

## Goal

Plan production-readiness integration for latest master while preserving local frontend behavior. Subagents are read-only. Parent writes reports to `master-integration-plans/09-deploy-observability/<NN>-<slug>-<date>.txt`.

Each subagent must translate deploy/observability changes into concrete frontend and operator UX requirements: publish buttons, domain states, setup warnings, analytics toggles, error messages, logs links, and production smoke checks.

## Pre-flight

Create `master-integration-plans/09-deploy-observability/`. Agents must avoid exposing secrets and must not recommend committing local `.vercel/` state or real `.env` secrets.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-vercel-deploy`: Review deploy routes, Vercel project/env/domain APIs, and latest master deploy changes.
2. `02-domain-publish`: Review domain suggestions, linking, verify, pricing, save flows, and frontend publish UI.
3. `03-security-csp`: Review `src/proxy.ts`, CSP, nonce, security headers, CORS, and local/prod differences.
4. `04-analytics-tracking`: Review analytics tracker, Vercel Analytics/Speed Insights, local suppression, and production rendering.
5. `05-generation-logs`: Review generation log writer, event bus, run logs, and master repo identity changes.
6. `06-error-observability`: Review error-log RAG, frontlogs, metrics, prompt logs, and admin observability.
7. `07-webhooks-cron`: Review webhooks, cron routes, template embeddings cron, Stripe/Vercel webhook compatibility.
8. `08-production-smoke`: Define deployment smoke plan, including routes, APIs, CSP report checks, and preview/deploy handoff.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 09 Deploy Observability — <agent>
Date: <YYYY-MM-DD>

## Production Changes In Master
## Local Behavior To Preserve
## Security / Secret Risks
## Required Deploy / Observability UI
## Exact LLM Implementation Instructions
## Deploy Verification
## Observability Checks
## Do Not Commit
```

## After Agents

Synthesize a production readiness checklist for the final merge commit/PR.
