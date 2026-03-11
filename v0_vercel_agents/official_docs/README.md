# Official Docs

This folder is a thin agent-facing layer for official documentation sources.

Use MCP documentation sources as the primary truth whenever possible:

- OpenAI docs MCP
- Vercel docs MCP
- OpenClaw docs MCP
- Any repo-specific docs MCP already configured in the project

This folder should contain lightweight guidance only:

- aliases
- query notes
- source maps
- doc usage hints

Do not copy large documentation trees here unless a specific offline snapshot is required.

## Existing related helpers

- `v0_vercel_agent/talk_to_v0_doc/`
- `v0_vercel_agent/talk_to_vercel_doc/`

Those remain local research helpers for short, open-ended questions when the
user is already logged in. This folder is the stable, curated layer that future
agents should depend on.

## Production note

The deployed app should not assume MCP servers are callable at runtime.

Use MCP-backed documentation during:

- research
- curation
- embedding generation
- scaffold upgrades

Then commit the small, derived artifacts that production can actually read.
