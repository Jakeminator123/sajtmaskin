---
name: sajtmaskin-context
description: Quick domain/context skill for Sajtmaskin. Use when working on builder, preview, scaffolds, own-engine, templates, sandbox, deploy, or terminology-sensitive tasks.
---

# Sajtmaskin Context

## Read first

1. `docs/architecture/glossary.md` — canonical glossary
2. `.cursor/rules/terminology.mdc` — quick confusion table
3. `docs/README.md` — doc navigation
4. `docs/plans/README.md` + `5-steg.txt` — status and decisions

## Guardrails

- `v0-mallar` / Mallar-tab (`src/lib/templates`) ≠ `template-library` (`src/lib/gen/template-library`) ≠ Vercel-mallar (`data/external-template-pipeline/`).
- Runtime scaffolds (`src/lib/gen/scaffolds/`) ≠ v0-mallar ≠ Vercel-mallar.
- `/api/v0/` = API versioning, not the external v0 provider.
- VM / `preview_host` (Fly.io) is primary live-preview. `sandbox` = mostly legacy naming.
- Own-engine behavior: read code + canonical docs, don't guess.
- Runtime truth lives in code; docs explain structure and intent.

## Response behavior

- Reply in Swedish if the user writes Swedish.
- Normalize aliases: `Varicell` → `Vercel`, `Vo` → `v0`.
