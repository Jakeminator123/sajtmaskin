---
name: sajtmaskin-context
description: Apply Sajtmaskin project context, terminology, and MCP routing rules for v0, Vercel, OpenAI, and OpenClaw questions. Use when tasks mention builder flow, generation architecture, scaffolds, template gallery, deployments, demoUrl, chats, versions, or external docs lookup.
---

# Sajtmaskin Context

Use this skill to align decisions and wording with this repository's domain model.

## Quick start

1. Read these project rules first:
   - `.cursor/rules/terminology.mdc`
   - `.cursor/rules/mcp-docs-routing.mdc`
   - `.cursor/rules/react-node-skill-routing.mdc`
2. Keep canonical product terminology in all reasoning and responses.
3. Route external platform/documentation questions to the correct MCP server before generic web search.

## Terminology guardrails

- Treat **Vercel**, **v0**, **Sajtmaskin**, and **demo sites** as separate layers.
- Distinguish:
  - `template gallery item` (`src/lib/templates/`) as product/UI discovery
  - `runtime scaffold` (`src/lib/gen/scaffolds/`) as internal generation starter
  - `Vercel template` as external ecosystem starter
- Do not call internal scaffolds only "templates" without qualifier.
- Do not describe template gallery entries as Vercel templates unless explicitly referring to upstream source.

## Generation lanes

- Use two-lane model:
  - Runtime lane: scaffold-driven generation flow
  - Research lane: curated external reference data and generated artifacts
- Do not describe the template gallery as a third runtime generation lane.

## MCP routing defaults

Route by domain:

- v0 API or generation behavior -> `v0` MCP server
- Vercel platform/deployments/env vars/docs -> `Vercel` MCP server
- OpenAI API/models/docs -> `openaiDeveloperDocs`
- Own engine runtime/manifests/generated files -> `sajtmaskin-engine`
- Internal scaffolds/manifests/comparison -> `sajtmaskin-scaffolds`
- OpenClaw install/config/channels/CLI -> `openclaw-docs`

Prefer MCP docs/tools first. Use web search as fallback.

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
