# Documentation Hub

`docs/` is the main home for human-readable documentation.

## Main areas

- **`docs/architecture/`** — Canonical system overviews, engine status,
  generation pipeline, builder prompt layer, agent handoff, known issues,
  quickstarts, and webhook docs.
- **`docs/schemas/`** — Human docs for schemas, model/build profiles, scaffold
  contracts, and UI parts.
- **`docs/plans/`** — Planning material split by lifecycle:
  `active/`, `review-needed/`, `archived/`.
  Currently one active plan: `17-repo-separation-and-independence.md`.
- **`docs/analyses/`** — Active investigations and reference analyses.
  Completed analyses are moved to `docs/old/analyses/`.
- **`docs/old/`** — Historical, superseded, or completed material kept for
  traceability. Cursorignored to reduce indexing noise.

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

| File                     | Committed       | Purpose                                                                                                                            |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `config/env-policy.json` | Yes             | Shared policy: classification, target rules, known-empty-ok lists. Consumed by `manage_env.py` and `src/lib/env-audit.ts`.         |
| `src/lib/env.ts`         | Yes             | Zod schema declaring every env var the app can read.                                                                               |
| `src/lib/env-audit.ts`   | Yes             | Runtime audit logic that loads `config/env-policy.json`.                                                                           |
| `ENV.md`                 | Yes             | Human-readable overview of env topology, critical keys, and setup instructions.                                                    |
| `.env.local`             | No (gitignored) | Local development values.                                                                                                          |
| `.env.production`        | No (gitignored) | Reference copy of production-like values.                                                                                          |
| `manage_env.py`          | Yes             | Canonical env CLI: interactive control panel + status/add/set/push/pull/audit (`--strict`) + `reconcile` for Vercel drift cleanup. |
| `check_env.py`           | Yes             | Backward-compatible wrapper that forwards to `manage_env.py audit`.                                                                |

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
- raw discovery under `research/external-templates/raw-discovery/current/`
- local shallow clone cache under `research/external-templates/repo-cache/`
- raw local `_sidor` datasets

## Key navigation

| What you need | Where to look |
|---|---|
| Current active plans | `docs/plans/active/` |
| Plan status index | `docs/architecture/agent-roadmap-and-handoff.md` |
| Engine architecture | `docs/architecture/engine-status.md` |
| Known issues & autofix | `docs/architecture/known-issues-and-fixes.md` |
| Env setup | `ENV.md` (root) |
| Orchestrator protocol | `docs/architecture/orchestrator-run-protocol.md` |
| Orchestrator runs | `.cursor/orchestrator/run/` (local, cursorignored) |
