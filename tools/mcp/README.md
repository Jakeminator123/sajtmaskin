# Local MCP Servers

This folder contains repo-local MCP server code used by Cursor and other local
agent workflows.

These servers are configured in `.cursor/mcp.json`, but the executable server
code lives here so it stays separate from Cursor-specific configuration and
separate from product runtime services.

Current servers:

- `engine-server.ts` - local own-engine generation, manifests, files, runtime URLs
- `scaffold-server.ts` - inspect internal runtime scaffolds, files, tags, and comparisons
