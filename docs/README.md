# Documentation Hub

`docs/` is the main home for human-readable documentation.

## Terminology (two layers — do not duplicate)

| Audience / topic | Canonical location | What it covers |
|------------------|-------------------|----------------|
| **Cursor / AI agents / product language** | `.cursor/rules/terminology.mdc` | Sajtmaskin vs Vercel vs v0, builder modes (`freeform` vs “Fritext”), **model lanes** vs **scaffold / v0-templates / Vercel-mall research**, naming in code. **Hur du öppnar filen i Cursor:** se `.cursor/README.md`. |
| **Repo layout & research pipeline** | `docs/architecture/structure-and-terminology.md` | Paths (`src/lib/templates/` vs scaffolds vs dossiers), renames, generated artifacts, mermaid data flow. |

**Rule:** Add new **UI/product** terms to `terminology.mdc`. Add new **folder / artifact** terms to `structure-and-terminology.md`. Link between them; avoid pasting the full glossary into random plans.

## Quick path (when `docs/` feels heavy)

1. This file → **Key navigation** table below.
2. `docs/architecture/engine-status.md` — current engine picture.
3. `docs/schemas/README.md` — which schema doc to open; then **one** schema file for your task.
4. `docs/ENV.md` — env topology when debugging deploy/local.

Everything else is deep reference, history, or plans.

**Folder map:** `architecture/` (system docs) · `schemas/` → [`schemas/README.md`](schemas/README.md) · `plans/` → [`plans/README.md`](plans/README.md) · `old/` (history; analyses under `old/analyses/`). Routing policy: [`architecture/documentation-lifecycle.md`](architecture/documentation-lifecycle.md).

## Source of truth policy

Human docs in this folder explain the system, but runtime truth still lives in
code.

Important code sources of truth include:

- `src/lib/templates/template-data.ts`
- `src/lib/db/schema.ts`
- `src/lib/validations/chatSchemas.ts`
- `src/lib/models/catalog.ts` — build profiles and model IDs (own engine)
- `config/ai_models/manifest.json` — committed defaults for own-engine models per profile, assist/polish defaults, token budgets, timeouts, workload metadata (`src/lib/ai-models/load-manifest.ts`; env overrides). Human guide: `config/ai_models/_READ_ME_FIRST.md`.
- `src/lib/models/selection.ts` — model resolution for requests
- `src/lib/v0/*` — legacy v0 helpers (SDK usage, errors, env); not the primary model catalog
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
| `model_trace_overlay.py` | Yes             | Focused helper that syncs GUI-facing model env vars in `.env.local` and opens the builder model-trace overlay.                    |
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
| Plans (all buckets) | `docs/plans/README.md` |
| Doc lifecycle / where to put drafts | `docs/architecture/documentation-lifecycle.md` |
| Plan / agent handoff index | `docs/architecture/agent-roadmap-and-handoff.md` |
| Terminology (product + code names) | `.cursor/rules/terminology.mdc` |
| Terminology (folders + research flow) | `docs/architecture/structure-and-terminology.md` |
| Engine architecture | `docs/architecture/engine-status.md` |
| Builder model routing | `docs/architecture/builder-model-routing-and-trace.md` |
| Builder entry flow | `docs/architecture/builder-entry-flow.md` |
| Preview / demoUrl / sandbox (own engine) | `docs/architecture/preview-and-sandbox-flow.md` |
| Vercel Sandbox credentials | `docs/architecture/vercel-sandbox-credentials.md` |
| Builder entry contract | `docs/schemas/builder-entry-contract.md` |
| Known issues & autofix | `docs/architecture/known-issues-and-fixes.md` |
| Env setup | `docs/ENV.md` |
| Scripts inventory + scaffolds overview | `docs/architecture/scripts-scaffolds-inventory.md` |
| Orchestrator protocol | `docs/architecture/orchestrator-run-protocol.md` |
| Orchestrator runs | `.cursor/orchestrator/run/` (local, cursorignored) |
