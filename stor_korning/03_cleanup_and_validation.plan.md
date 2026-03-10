# Plan 03: Cleanup, Rename, and Validation

## Goal

Clean up obsolete proxy-oriented code and align names/docs with the new local
engine MCP topology.

## Tasks

- Rename references from generated-code wording to engine wording where it
  improves clarity.
- Update Cursor rules/docs that route users and agents to the project-local
  engine MCP server.
- Remove unused proxy-only code if it is no longer referenced:
  - local MCP auth helper
  - local MCP API routes
  - proxy-specific env entries
- Update the work log with what changed and what was validated.

## Validation

- Run lints on changed files
- Re-scan for stale references
- Summarize residual risks

## Status

- [x] Update docs and naming
- [x] Remove unused proxy pieces
- [x] Run validation
- [x] Finalize work log
