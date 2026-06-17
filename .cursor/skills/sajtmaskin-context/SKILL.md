---
name: sajtmaskin-context
description: Quick domain/context skill for Sajtmaskin. Use when working on builder, preview, scaffolds, own-engine, templates, sandbox, deploy, or terminology-sensitive tasks.
---

# Sajtmaskin Context

## Read first

1. `docs/architecture/glossary.md` — canonical glossary (slim, ~100 termer)
2. `.cursor/rules/terminology.mdc` — confusion table + signal ownership
3. `docs/architecture/llm-flow-target-worldclass.md` — **målbild** för LLM-flödet (3-fasmodell, single repair gate, init/follow-up som distinkta operationer)
4. `docs/README.md` — doc navigation
5. `docs/plans/active/README.md` — aktiva planer + aktuella öppna punkter (koncentrat)

## Guardrails

- `v0-mallar` / Mallar-tab ≠ `template-library` ≠ Vercel-mallar.
- Runtime scaffolds (`src/lib/gen/scaffolds/`) ≠ v0-mallar ≠ Vercel-mallar.
- `/api/v0/` = API versioning, not the external v0 provider.
- VM / `preview_host` (Fly.io) is primary live-preview. `sandbox` = mostly legacy naming.
- Own-engine behavior: read code + canonical docs, don't guess.

## Source of truth hierarchy

1. **Code** — always wins when docs disagree.
2. **`docs/schemas/strict/*.schema.json`** — machine-readable contracts (must match TS types).
3. **`docs/schemas/*.md`** — human-readable contracts (explain intent behind code).
4. **`docs/architecture/*.md`** — system structure docs.
5. **`backoffice/`** + `sajtmaskin_backoffice.py` — Streamlit operational panels (must reflect actual runtime, not aspiration).

When changing pipeline code: verify that schemas, strict schemas, and backoffice panels still reflect reality.

## Response behavior

- Reply in Swedish if the user writes Swedish.
