# Documentation Hub

This repository now uses `docs/` as the main home for human-readable
documentation.

## Main areas

- `docs/architecture/`
  Canonical structure, terminology, and major system-boundary overviews.
  Notable docs:
  `structure-and-terminology.md`, `generation-loop-and-error-memory.md`,
  `project-settings-and-builder-questions.md`,
  `documentation-lifecycle.md`, `agent-roadmap-and-handoff.md`
- `docs/schemas/`
  Canonical human docs for important schemas, model/build-profile mappings, and
  scaffold contracts.
- `docs/llm/`
  AI, prompt, gateway, and own-engine strategy notes.
- `docs/plans/`
  Planning material split by lifecycle state:
  `active/`, `review-needed/`, and `archived/`.
- `docs/analyses/`
  Broader analysis, matrix, and polish notes.
- `docs/old/`
  Historical, superseded, or uncertain material kept for reference.

## Source of truth policy

Human docs in this folder explain the system, but runtime truth still lives in
code.

Important code sources of truth include:

- `src/lib/templates/template-data.ts`
- `src/lib/db/schema.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/v0/models.ts`
- `src/lib/v0/modelSelection.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/template-library/types.ts`
- `package.json`

### Environment variable management

| File | Committed | Purpose |
|------|-----------|---------|
| `config/env-policy.json` | Yes | Shared policy: classification, target rules, known-empty-ok lists. Consumed by both `check_env.py` and `src/lib/env-audit.ts`. |
| `src/lib/env.ts` | Yes | Zod schema declaring every env var the app can read. |
| `src/lib/env-audit.ts` | Yes | Runtime audit logic that loads `config/env-policy.json`. |
| `ENV.md` | Yes | Human-readable overview of env topology, critical keys, and setup instructions. |
| `.env.local` | No (gitignored) | Local development values. |
| `.env.production` | No (gitignored) | Reference copy of production-like values. |
| `check_env.py` | Yes | Read-only CLI audit comparing local files against Vercel. |
| `manage_env.py` | Yes | Interactive control panel: status, add, set, push, pull, audit. |

When adding a new env var: add it to `src/lib/env.ts` (schema), then to
`config/env-policy.json` (classification + target rules), and optionally to
`ENV.md` if it is critical or frequently asked about.

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
- browser-driven doc helpers in `tools/doc-browser/`
- raw discovery under `research/external-templates/raw-discovery/`
- raw local `_sidor` datasets

## Migration note

Older docs that used to live in `LLM/`, `plans/`, `scheman/`, root notes, or
ad-hoc archive folders have been moved here or archived under `docs/old/`.

The plan system is also being normalized into explicit lifecycle buckets. See
`docs/architecture/documentation-lifecycle.md` and
`docs/architecture/agent-roadmap-and-handoff.md` for the current routing and
status map.
