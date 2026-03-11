# MCP Sources

Use MCP-backed documentation as the primary truth before falling back to local notes.

## Preferred sources

- `project-0-sajtmaskin-Vercel-*`
  Use for Vercel platform behavior, deployment flows, docs search, runtime logs, and deployment metadata.

- `project-0-sajtmaskin-openaiDeveloperDocs-*`
  Use for OpenAI platform docs, SDK behavior, and API details.

- `openclaw-docs`
  Use for OpenClaw installation, configuration, agents, and MCP questions.

## Local helpers

- `v0_vercel_agent/talk_to_v0_doc/`
- `v0_vercel_agent/talk_to_vercel_doc/`

These are browser-based research helpers, not production integrations.
They are best for short, open-ended questions when the user is already logged in
to the relevant docs "Ask AI" experience.

## Source priority

1. MCP-backed official docs
2. Local curated notes in `official_docs/`
3. Local browser doc helpers for quick exploratory questions
4. Curated external template dossiers in `template_library/`
5. Raw `_sidor` research only when a higher-quality source is missing

## Why MCP is still better

MCP-backed docs are better than raw `_sidor` for official behavior because they are:

- more current
- less noisy
- easier to search precisely
- closer to authoritative platform truth

Use `_sidor` mainly for example code, structure, and scaffold inspiration.
Use MCP docs for product rules, API behavior, and platform details.

If the local browser helper is needed but the login/session may be missing,
ask the user to reopen or confirm the relevant account session first.
