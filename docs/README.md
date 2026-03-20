# Documentation Hub

`docs/` is the main home for human-readable documentation.

## Main areas

- **`docs/architecture/`** — Canonical system overviews, engine status,
  generation pipeline, builder prompt layer, builder entry flow, terminology,
  agent coordination, agent handoff, known issues, quickstarts, webhook docs,
  prompt tree, and v0 deprecation plan.
- **`docs/schemas/`** — Human docs for stable contracts: model/build profiles,
  builder entry, scaffold manifests, persisted UI parts, and important data or
  validation surfaces.
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
- `src/lib/models/catalog.ts`
- `src/lib/models/selection.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/scaffold-manifest-validation.ts`
- `src/lib/gen/template-library/types.ts`
- `package.json`

### Environment variable management

| File                     | Committed       | Purpose                                                                                                                            |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `config/env-policy.json` | Yes             | Shared policy: classification, target rules, known-empty-ok lists. Consumed by `manage_env.py` and `src/lib/env-audit.ts`.         |
| `config/profiles/*.ini`  | Yes (defaults)  | Optional staging layer for AI model/token env vars; emit with `npm run config:env-print` → paste into `.env.local`. See `config/README.md`. |
| `src/lib/env.ts`         | Yes             | Zod schema declaring every env var the app can read.                                                                               |
| `src/lib/env-audit.ts`   | Yes             | Runtime audit logic that loads `config/env-policy.json`.                                                                           |
| `docs/ENV.md`            | Yes             | Human-readable overview of env topology, critical keys, and setup instructions.                                                    |
| `.env.local`             | No (gitignored) | Local development values.                                                                                                          |
| `.env.production`        | No (gitignored) | Reference copy of production-like values.                                                                                          |
| `manage_env.py`          | Yes             | Canonical env CLI: interactive control panel + status/add/set/push/pull/audit (`--strict`) + `reconcile` for Vercel drift cleanup. |
| `model_trace_overlay.py` | Yes             | Focused helper that syncs GUI-facing model env vars in `.env.local` and opens the builder model-trace overlay.                    |
| `check_env.py`           | Yes             | Backward-compatible wrapper that forwards to `manage_env.py audit`.                                                                |

When adding a new env var: add it to `src/lib/env.ts` (schema), then to
`config/env-policy.json` (classification + target rules), and optionally to
`docs/ENV.md` if it is critical or frequently asked about.

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
- raw discovery under `scaffold-pipeline/discovery/`
- local shallow clone cache under `scaffold-pipeline/repo-cache/`
- raw local `_sidor` datasets

## Key navigation

| What you need | Where to look |
|---|---|
| Terminology and agent coordination | `docs/architecture/structure-and-terminology.md` |
| Current active plans | `docs/plans/active/` |
| Plan status index | `docs/architecture/agent-roadmap-and-handoff.md` |
| Engine architecture | `docs/architecture/engine-status.md` |
| Own Engine vs V0 map | `docs/architecture/own-engine-vs-v0.md` |
| Builder model routing | `docs/architecture/builder-model-routing-and-trace.md` |
| Builder entry flow | `docs/architecture/builder-entry-flow.md` |
| Schema index | `docs/schemas/README.md` |
| Builder entry contract | `docs/schemas/builder-entry-contract.md` |
| Known issues & autofix | `docs/architecture/known-issues-and-fixes.md` |
| Env setup | `docs/ENV.md` |
| Orchestrator protocol | `docs/architecture/orchestrator-run-protocol.md` |
| Orchestrator runs | `.cursor/orchestrator/run/` (local, cursorignored) |
