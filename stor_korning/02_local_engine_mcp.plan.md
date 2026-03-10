# Plan 02: Direct Local Engine MCP

## Goal

Create a direct local MCP server for the own engine so project-specific MCP
operations no longer depend on app HTTP routes or a generated-code API key.

## Tasks

- Extract shared local engine access helpers for:
  - generate files lookup
  - manifest lookup
  - single-file lookup
  - preview/sandbox runtime creation
- Create a new local MCP server entrypoint with a clearer engine-centric name.
- Point `.cursor/mcp.json` to the new local server.
- Keep external documentation/platform MCP servers separate from local ones.

## Desired End State

- Local project server: direct stdio -> local engine libs
- External docs/platform servers: remote MCP endpoints
- No local MCP dependency on `SAJTMASKIN_BASE_URL`
- No local MCP dependency on `MCP_GENERATED_CODE_API_KEY`

## Validation

- Type/lint validation on the new helper and server
- Tool surface still covers generation, manifest, file, files, runtime

## Status

- [x] Extract local engine access helpers
- [x] Create direct engine MCP server
- [x] Update `.cursor/mcp.json`
- [x] Validate new local topology
