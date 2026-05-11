---
name: master-integration-04-builder-ui-state
description: Creates an 8-agent read-only planning swarm for integrating latest master with the existing builder frontend, preserving Apple-minimal UI/UX, chat dock behavior, wizard flow, builder state, details drawer, and prompt actions.
---

# Master Integration 04 — Builder UI & State

## Goal

Plan how to merge latest master while preserving local builder UI/UX and wiring any new backend capabilities into it. Subagents are read-only. Parent writes reports to `master-integration-plans/04-builder-ui-state/<NN>-<slug>-<date>.txt`.

Each subagent must list every required builder-facing addition from master: new actions, buttons, dropdown choices, badges, drawer content, state transitions, API payload fields, and user-facing copy. Prefer adding capabilities into existing surfaces over creating new chrome.

## Pre-flight

Create `master-integration-plans/04-builder-ui-state/` and include current branch, master SHA, and local design policy: Apple-minimal, CSS variables, Swedish short copy, preview-first builder.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-builder-shell`: Review `src/app/builder/BuilderShellContent.tsx`, layout, chat/preview balance, and master UI changes.
2. `02-builder-state`: Review `useBuilderState`, `useBuilderPageController`, action hooks, and new backend state fields.
3. `03-prompt-actions`: Review prompt submit, follow-up base, clarification, suggestions, and stream lifecycle.
4. `04-intake-wizard`: Review `IntakeWizard`, onboarding flow, brief payload, scrape/media data, and server auto-brief handoff.
5. `05-chat-interface`: Review `ChatInterface`, message list, tooling cards, follow-up badges, and streaming UX.
6. `06-drawers-disclosure`: Review `BuilderDetailsDrawer`, `BuilderDisclosurePill`, drawers, popups, and collapsed/expanded surfaces.
7. `07-header-launch`: Review builder header, readiness, deploy/publish actions, credits/domain links, and master additions.
8. `08-ui-state-tests`: Review builder UI tests and identify exact updates needed after merge.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 04 Builder UI & State — <agent>
Date: <YYYY-MM-DD>

## UI/UX To Preserve
## New Master Capabilities To Surface
## State/Props Impact
## Required Buttons / Choices / Copy
## Exact LLM Implementation Instructions
## Merge Conflict Plan
## Test Plan
## Do Not Break
```

## After Agents

Produce a UI preservation checklist before resolving any builder conflicts.
