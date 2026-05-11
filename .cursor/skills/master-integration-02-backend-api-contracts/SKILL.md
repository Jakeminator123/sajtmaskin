---
name: master-integration-02-backend-api-contracts
description: Creates an 8-agent read-only planning swarm for preserving and wiring latest master backend/API behavior into the existing frontend. Use when integrating backend routes, chat stream contracts, schemas, media upload, auth, credits, domains, or API response changes from master.
---

# Master Integration 02 — Backend API Contracts

## Goal

Launch 8 parallel read-only subagents that plan how latest `origin/master` backend/API changes should integrate with current frontend UI/UX. Subagents do not edit code. Parent writes reports to `master-integration-plans/02-backend-api-contracts/<NN>-<slug>-<date>.txt`.

Each subagent must identify new or changed backend contracts and translate them into exact frontend work: API client changes, state fields, loading/error states, buttons, menu choices, copy, and tests. Preserve the existing visual design and interaction model unless a backend capability requires a new surface.

## Pre-flight

1. Fetch remote and note merge-base.
2. Create `master-integration-plans/02-backend-api-contracts/`.
3. Include current dirty tree context in each prompt.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-chat-stream-routes`: Review `/api/engine/chats/*stream*`, stream schemas, SSE events, and frontend chat consumers.
2. `02-chat-crud-routes`: Review chat init/messages/versions/files/readiness routes and their UI hooks.
3. `03-media-upload`: Review media upload/library routes, image popup, file upload zone, and orchestration media catalog.
4. `04-auth-user-session`: Review auth/me/login/logout/register behavior and frontend auth assumptions.
5. `05-credits-payments`: Review credits, Stripe, pricing, checkout, and UI affordances.
6. `06-domains-deployments`: Review domain/deployment APIs, `/api/v0/*`, deploy UI, and publish flow contracts.
7. `07-validation-schemas`: Review zod/AJV schemas, validation errors, and whether UI handles new response shapes.
8. `08-error-rate-limit`: Review error envelopes, rate limits, server exceptions, and user-facing recovery paths.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 02 Backend API Contracts — <agent>
Date: <YYYY-MM-DD>

## Master Changes To Preserve
## Frontend Consumers
## Contract Risks
## Required Adaptations
## New Buttons / Choices / UI States
## Exact LLM Implementation Instructions
## Tests / Runtime Checks
## Do Not Break
```

## After Agents

Synthesize a backend-contract checklist before any code merge.
