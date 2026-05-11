---
name: master-integration-05-preview-runtime
description: Creates an 8-agent read-only planning swarm for integrating latest master preview, VM, iframe, postMessage, preview-session, quality-gate, and runtime verification changes without breaking the local preview-first UX.
---

# Master Integration 05 — Preview Runtime

## Goal

Plan merge of preview/VM/runtime behavior from latest master into local preview-first frontend. Preserve local iframe postMessage build-out, lifecycle telemetry, and Apple-minimal preview chrome. Parent writes reports to `master-integration-plans/05-preview-runtime/<NN>-<slug>-<date>.txt`.

Each subagent must translate runtime/backend changes into exact preview UI work: frame attributes, lifecycle calls, status badges, retry/refresh controls, error states, telemetry hooks, and smoke checks. Do not open live `/builder` sessions while a user may be generating.

## Pre-flight

Create `master-integration-plans/05-preview-runtime/`. Include rule: use canonical terms `preview`, `VM`, `preview_host`; avoid introducing new `sandbox` naming except legacy paths.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-preview-panel`: Review `src/components/builder/preview-panel/PreviewPanel.tsx` and master changes to preview state.
2. `02-preview-frame`: Review iframe frame, device modes, CSP/sandbox attributes, postMessage handlers, and hydration/runtime risks.
3. `03-preview-chrome`: Review preview toolbar/chrome, routes, refresh, code view, and local token styling.
4. `04-preview-hooks`: Review preview panel hooks, render failure reporting, route resolution, and lifecycle telemetry.
5. `05-preview-session-api`: Review preview-session, heartbeat, hibernate, destroy, status APIs and frontend calls.
6. `06-vm-preview-host`: Review `preview-host/`, VM lifecycle, warm checks, and generated project runtime assumptions.
7. `07-quality-gate-runtime`: Review F2/F3 checks, preview quality gate, server verify, and UI readiness display.
8. `08-csp-analytics-runtime`: Review CSP, nonce, JSON-LD, Vercel Analytics, local `next start`, and production smoke requirements.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 05 Preview Runtime — <agent>
Date: <YYYY-MM-DD>

## Master Runtime Changes
## Local Preview UX To Preserve
## Coupling Points
## Required Preview UI / Controls
## Exact LLM Implementation Instructions
## Failure Modes
## Verification Matrix
## Do Not Break
```

## After Agents

Synthesize one runtime smoke matrix covering dev, production local, and enforced CSP.
