# When to use the MCP servers

## Overview

The project has multiple MCP servers configured. Each serves a different purpose.
The local `sajtmaskin-mpc` server exposes **resources only** (no tools).
The external servers (v0, Vercel, shadcn, OpenAI) provide both docs and tools.

## Server quick reference

| Server               | What it provides                               | How to use                        |
|----------------------|------------------------------------------------|-----------------------------------|
| `sajtmaskin-mpc`     | Project docs, v0 prompt guide, architecture    | Read resources: `docs://local/*`  |
| `v0`                 | v0 code generation, chat management            | Use v0 tools directly             |
| `Vercel`             | Deployments, projects, logs, Vercel docs       | Use Vercel tools directly         |
| `openaiDeveloperDocs`| OpenAI API and model documentation             | Read resources                    |
| `shadcn`             | Component registry, browse, install            | Use shadcn tools directly         |

## When to use which

### Use `sajtmaskin-mpc` when:
- You need project-specific documentation (architecture, patterns, prompt strategies)
- You want the v0 prompt guide or AI SDK reference notes
- You need the error playbook

Access via resources: `docs://local/{name}` (e.g. `docs://local/quick-reference`)

### Use `v0` MCP when:
- Working with v0 Platform API
- Creating or managing v0 chats programmatically
- Generating code via v0

### Use `Vercel` MCP when:
- Managing deployments, projects, or environment variables
- Searching Vercel platform documentation
- Analyzing deployment logs

### Use `shadcn` MCP when:
- Looking up component props, variants, or APIs
- Installing new shadcn/ui components
- Browsing the component registry

### Use `openaiDeveloperDocs` when:
- Looking up OpenAI API endpoints, models, or parameters

## When NOT to use MCP servers
- When you already know the answer
- When working with the project source code directly (use codebase search)
- For simple code changes that don't require external documentation
