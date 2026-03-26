---
name: sajtmaskin-context
description: Apply Sajtmaskin project context, terminology, and MCP routing rules for v0, Vercel, OpenAI, and OpenClaw questions. Use when tasks mention builder flow, generation architecture, scaffolds, v0-templates, deployments, demoUrl, chats, versions, or external docs lookup.
---

# Sajtmaskin Context

Use this skill to align decisions and wording with this repository's domain model.

## Quick start

1. Read these project rules first:
   - `.cursor/rules/terminology.mdc`
   - `.cursor/rules/mcp-docs-routing.mdc`
   - `.cursor/rules/skills-routing.mdc`
2. Keep canonical product terminology in all reasoning and responses.
3. **Project documentation** (architecture, plans, how Sajtmaskin works): read **`docs/`** and repo files — there is no MCP that replaces that.
4. For **external platform** APIs (v0, Vercel, OpenAI, OpenClaw product docs), route to the matching MCP server before generic web search when the server is configured.

## Terminology guardrails

**Canonical detail:** `.cursor/rules/terminology.mdc` (always loaded). Keep **Vercel**, **v0**, **Sajtmaskin**, and **demo sites** as separate layers.

Summary: **scaffold-driven** runtime (`src/lib/gen/scaffolds/`); **v0-templates** = product gallery (`src/lib/templates/`, landing **Template**); **Vercel mall** = research/dossiers/artifacts, not the gallery tab. No “operational lanes” triad. **Inbäddningar** (ML) ≠ **semantik** (HTML/a11y) — see terminology § embeddings vs semantics.

## MCP routing defaults

Route by domain:

- v0 API or generation behavior -> `v0` MCP server
- Vercel platform/deployments/env vars/docs -> `Vercel` MCP server
- OpenAI API/models/docs -> `openaiDeveloperDocs`
- Own engine runtime/manifests/generated files -> `sajtmaskin-engine`
- Internal scaffolds/manifests/comparison -> `sajtmaskin-scaffolds`
- OpenClaw install/config/channels/CLI -> `openclaw-docs`

Prefer MCP for **those** platforms when available. Use web search as fallback. (Local `sajtmaskin-engine` / `sajtmaskin-scaffolds` are optional dev helpers — not a full project wiki.)

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
