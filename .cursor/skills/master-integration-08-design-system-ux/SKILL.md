---
name: master-integration-08-design-system-ux
description: Creates an 8-agent read-only planning swarm for preserving local Apple-minimal frontend, UI, UX, design tokens, Swedish copy, responsive behavior, and interaction polish while integrating latest master.
---

# Master Integration 08 — Design System & UX

## Goal

Plan how to keep local frontend/UI/UX intact while accepting latest master backend/features. Subagents are read-only. Parent writes reports to `master-integration-plans/08-design-system-ux/<NN>-<slug>-<date>.txt`.

Each subagent must describe how to add required backend-driven capabilities into the existing design system with minimal new surface area: reuse current components, CSS variables/Tailwind tokens, short Swedish copy, existing motion patterns, and current spacing/radius.

## Pre-flight

Create `master-integration-plans/08-design-system-ux/`. Include design rules: CSS variables/Tailwind tokens only, preserve current palette/tokens, minimal Swedish copy, preview-first layout, no backend data-flow changes.

## Agents

Launch all 8 in parallel with `subagent_type: "explore"` and `readonly: true`.

1. `01-design-tokens`: Review globals, Tailwind, CSS variables, hardcoded colors, and master styling drift.
2. `02-landing-marketing`: Review landing, SEO pages, marketing surfaces, metadata, JSON-LD, and master changes.
3. `03-wizard-onboarding`: Review wizard, onboarding, scrape states, media steps, and microcopy.
4. `04-builder-chrome`: Review builder shell/header/chrome density and local Apple-minimal layout.
5. `05-chat-dock`: Review chat panel/dock/floating input, messages, tooling cards, and collapse behavior.
6. `06-preview-polish`: Review preview chrome, frame, empty/loading/error states, and device modes.
7. `07-accessibility-responsive`: Review keyboard, focus, ARIA, mobile/tablet, reduced motion, and touch targets.
8. `08-copy-content`: Review Swedish UI copy, error text, CTA labels, and master-introduced wording.

## Report Format

```text
SAJTMASKIN MASTER INTEGRATION PLAN — 08 Design System UX — <agent>
Date: <YYYY-MM-DD>

## UX To Preserve
## Master UI Changes To Inspect
## Token / Copy Risks
## Required UI Additions Without Redesign
## Exact LLM Implementation Instructions
## Recommended Merge Choices
## Visual Verification
## Do Not Break
```

## After Agents

Produce a design-preservation checklist to use during conflict resolution.
