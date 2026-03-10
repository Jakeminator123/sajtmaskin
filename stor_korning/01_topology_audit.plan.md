# Plan 01: Local MCP Topology Audit

## Goal

Replace the current project-specific MCP topology that routes local MCP traffic
through Next.js HTTP endpoints with a direct local engine/server topology.

## Why

- `services/mcp/generated-code-server.ts` was configured as a local stdio MCP
  server, but it proxied back into app routes with an API key.
- That mixes local-agent concerns with app/runtime concerns.
- The own engine path is already local-first; the MCP layer should match that.

## Scope

- Confirm current local vs remote MCP topology.
- Confirm recent agent changes that affect scaffold persistence and finalize flow.
- Define the target naming structure for project-local MCP servers.
- Create a small execution log in `stor_korning/WORKLOG.md`.

## Validation

- Confirm the audited findings in code.
- Confirm the new plan sequence before implementation.

## Status

- [x] Confirm current MCP topology
- [x] Confirm recent agent changes in engine/scaffold persistence
- [x] Define next implementation phases
