# Documentation Hub

This repository now uses `docs/` as the main home for human-readable
documentation.

## Main areas

- `docs/schemas/`
  Canonical human docs for important schemas, model/build-profile mappings, and
  scaffold contracts.
- `docs/llm/`
  AI, prompt, gateway, and own-engine strategy notes.
- `docs/plans/`
  Implementation plans that are still worth keeping as active reference.
- `docs/analyses/`
  Broader analysis, matrix, and polish notes.
- `docs/old/`
  Historical, superseded, or uncertain material kept for reference.

## Source of truth policy

Human docs in this folder explain the system, but runtime truth still lives in
code.

Important code sources of truth include:

- `src/lib/db/schema.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/v0/models.ts`
- `src/lib/v0/modelSelection.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/template-library/types.ts`
- `package.json`

## Production boundary

The deployed app on Vercel should read committed artifacts and runtime code, not
local research helpers.

Good production inputs:

- files committed under `docs/`
- generated JSON committed in `src/lib/gen/template-library/`
- generated scaffold research metadata in
  `src/lib/gen/scaffolds/scaffold-research.generated.json`
- runtime manifests and code under `src/`

Not runtime dependencies:

- MCP server availability
- browser-driven doc helpers in `v0_vercel_agent/`
- raw local `_sidor` datasets

## Migration note

Older docs that used to live in `LLM/`, `plans/`, `scheman/`, root notes, or
ad-hoc archive folders have been moved here or archived under `docs/old/`.
