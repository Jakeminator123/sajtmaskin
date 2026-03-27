---
name: sajtmaskin-context
description: Sajtmaskin terminology and domain model; use docs/ for product architecture. For v0/Vercel/OpenAI/OpenClaw *API* routing see tooling-routing.mdc. Triggers: builder, scaffolds, v0-templates, deployments, demoUrl, chats, versions.
---

# Sajtmaskin Context

Use this skill to align decisions and wording with this repository's domain model.

## Quick start

1. `.cursor/rules/terminology.mdc` + **`docs/`** for how the product/repo is structured. **Backlog / öppna K-rader:** `docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`.
2. `.cursor/rules/tooling-routing.mdc` when you need **which MCP** for v0/Vercel/OpenAI/OpenClaw (not a substitute for reading `docs/`).
3. Same file for when to load this skill vs React best-practices.
4. Keep canonical product terminology in reasoning and responses.

## Terminology guardrails

**Canonical detail:** `.cursor/rules/terminology.mdc` (always loaded). Keep **Vercel**, **v0**, **Sajtmaskin**, and **demo sites** as separate layers.

Summary: **scaffold-driven** runtime (`src/lib/gen/scaffolds/`); **v0-templates** = product gallery (`src/lib/templates/`, landing **Template**); **Vercel mall** = research/dossiers/artifacts, not the gallery tab. No “operational lanes” triad. **Inbäddningar** (ML) ≠ **semantik** (HTML/a11y) — see terminology § embeddings vs semantics.

## MCP routing defaults

Route by domain:

- v0 API or generation behavior -> `v0` MCP server
- Vercel platform/deployments/env vars/docs -> `Vercel` MCP server
- OpenAI API/models/docs -> `openaiDeveloperDocs`
- OpenClaw install/config/channels/CLI -> `openclaw-docs`
- Own engine / runtime scaffolds -> read `src/lib/mcp/*` and `src/lib/gen/scaffolds/` in the repo (no MCP wrapper)

Prefer MCP for **those** platforms when available; web search as fallback.

## React/Next tasks

For React/Next/Node/performance tasks, proactively apply `vercel-react-best-practices`.

## Response behavior

- If the user writes Swedish, respond in Swedish unless they ask otherwise.
- Normalize common aliases to canonical names (`Varicell` -> `Vercel`, `Veenol` -> `v0`).

## Example trigger phrases

- "hur fungerar buildern"
- "vad är skillnaden på mall och scaffold"
- "varför använder vi demoUrl"
- "hur deployar vi till Vercel"
- "hur ska vi routa docs frågor"
