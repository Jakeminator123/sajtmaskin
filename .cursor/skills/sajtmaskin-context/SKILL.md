---
name: sajtmaskin-context
description: Sajtmaskin terminology and domain model; docs/ for architecture. MCP routing in tooling-routing.mdc. Triggers: builder, scaffolds, v0-templates, Vercel-mall research, preview, deploy, demoUrl.
---

# Sajtmaskin Context

Use this skill to align decisions and wording with this repository's domain model.

## Quick start

1. **`.cursor/rules/terminology.mdc`** — kanonisk produktordlista (v0-templates vs **Vercel-mall**, buildern, fidelity, own-engine, sandbox, m.m.).
2. **`docs/`** — arkitektur och policy: [`docs/README.md`](../../../docs/README.md), [`docs/architecture/repo-tree.md`](../../../docs/architecture/repo-tree.md), [`docs/architecture/documentation-lifecycle.md`](../../../docs/architecture/documentation-lifecycle.md).
3. **Backlog:** [`docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`](../../../docs/plans/active/PROJECT-STATE-AND-DIRECTION.md).
4. **`.cursor/rules/tooling-routing.mdc`** — vilken MCP för v0/Vercel/OpenAI/OpenClaw API (ersätter inte att läsa `docs/`).
5. **Konfiguration som styr beteende:** [`config/README.md`](../../../config/README.md) (rot under `config/`).

Keep canonical terminology in reasoning and responses.

## Terminology guardrails

**Canonical:** `terminology.mdc` (always loaded). Skilj **Sajtmaskin** (appen), **Vercel** (hosting/plattform), **v0** (mall-API/SDK, legacy codegen-väg), **own-engine** (nuvarande codegen).

- **v0-templates** — «Mall» på startsidan, `src/lib/templates/`; inte samma som **Vercel-mall** (research under `research/external-templates/`).
- **Scaffolds** — runtime under `src/lib/gen/scaffolds/`.
- **Inbäddningar** (ML) ≠ **semantik** (HTML/a11y) — se `terminology.mdc`.

## MCP routing defaults

- v0 API / mallflöde → `v0` MCP server  
- Vercel platform / deployments / env → `Vercel` MCP server  
- OpenAI API / docs → `openaiDeveloperDocs`  
- OpenClaw → `openclaw-docs`  
- Own-engine / generation / scaffolds → läs repo (`src/lib/gen/`, ev. `src/lib/mcp/*`) — ingen generisk MCP-wrapper för hela motorn  

Prefer MCP for those platforms when available; web search as fallback.

## React/Next tasks

Use `vercel-react-best-practices` when editing many TSX components.

## Response behavior

- User writes Swedish → reply in Swedish unless they ask otherwise.
- Normalize aliases → `Varicell` → **Vercel**, `Veenol` → **v0** (`terminology.mdc`).

## Example trigger phrases

- "hur fungerar buildern"
- "skillnad mellan v0-mall och Vercel-mall"
- "vad är skillnaden på mall och scaffold"
- "varför använder vi demoUrl"
- "hur deployar vi till Vercel"
