---
name: sajtmaskin-context
description: Quick domain/context skill for Sajtmaskin. Use when working on builder, preview, scaffolds, own-engine, templates, sandbox, deploy, or terminology-sensitive tasks.
---

# Sajtmaskin Context

Use this skill to stay aligned with Sajtmaskin's domain language and canonical docs.

## Read first

1. `.cursor/rules/terminology.mdc` - canonical product/code terminology
2. `docs/README.md` - canonical doc navigation
3. `docs/plans/active/PROJECT-STATE-AND-DIRECTION.md` - active backlog and decisions

## Core guardrails

- Keep Sajtmaskin terminology consistent.
- Do not confuse builderns `v0-mallar` / `Mallar` / mallgalleri in `src/lib/templates` with `template-library` in `src/lib/gen/template-library` or with Vercel-mallar / externa referenser under `data/external-template-pipeline/`.
- Do not confuse runtime scaffolds under `src/lib/gen/scaffolds/` with either `v0-mallar` or externa Vercel-mallar.
- `/api/v0/` is API versioning, not automatically the external v0 provider.
- Own-engine behavior should be understood from repo code and canonical docs, not guessed.

## Preview / generation guardrails

- VM / `preview_host` via Fly.io is the primary live-preview path for own-engine right now.
- Treat `sandbox` mostly as legacy naming, shared tier-2 contract, or fallback path unless the code clearly refers to actual Vercel Sandbox behavior.
- Legacy shim preview is fallback or diagnostic only unless explicitly required.
- Runtime truth lives in code; docs explain structure and intent.

## Response behavior

- Reply in Swedish if the user writes Swedish, unless they ask otherwise.
- Normalize common aliases carefully: `Varicell` -> `Vercel`, `Vo` -> `v0`.

## Typical triggers

- builder
- sandbox
- preview
- fidelity
- own-engine
- scaffold
- mallgalleri
- template-library
- Vercel template
- deploy
- demoUrl
