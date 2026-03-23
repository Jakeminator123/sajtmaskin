# Runtime Scaffolds (partially cursorignored)

The scaffold manifests and code are indexed, but the large generated/embedding
files are cursorignored. Agents can read this README for context.

## Cursorignored files

| File | Size | What it is |
|------|------|-----------|
| `scaffold-embeddings.json` | ~2 MB | OpenAI vectors for each scaffold. Used by `matchScaffoldWithEmbeddings()` in auto mode. |
| `scaffold-research.generated.json` | ~1 MB | Per-scaffold `qualityChecklist` and `research` (upgradeTargets, referenceTemplates). Generated from dossiers by `npm run scaffolds:research`. |

## Indexed files (readable by agents)

| File | What it does |
|------|-------------|
| `registry.ts` | The 10 scaffold manifests. Single source of truth. |
| `types.ts` | `ScaffoldManifest`, `ScaffoldFile`, `ScaffoldResearchMetadata` types. |
| `matcher.ts` | Keyword-based scaffold matching (primary), with embedding fallback. |
| `serialize.ts` | `serializeScaffoldForPrompt()` — turns a scaffold into system prompt text. |
| `scaffold-search.ts` | Embedding-based semantic search for scaffolds. |
| `scaffold-scoring.ts` | Telemetry-based boost/penalize for generic scaffolds. |
| `scaffold-aware-retry.ts` | Picks alternative scaffold if generation fails. |
| `scaffold-research.ts` | Loads `scaffold-research.generated.json` overrides. |
| `scaffold-embeddings-core.ts` | Embedding generation logic used by `npm run scaffolds:embeddings`. |

## The 10 scaffolds

`base-nextjs`, `landing-page`, `saas-landing`, `portfolio`, `blog`,
`dashboard`, `auth-pages`, `ecommerce`, `content-site`, `app-shell`.

Each has a directory with `manifest.ts` (metadata + files) and template files.

## Build commands

| Command | What it does |
|---------|-------------|
| `npm run scaffolds:validate` | Validate manifest structure |
| `npm run scaffolds:embeddings` | Regenerate scaffold-embeddings.json from registry |
| `npm run scaffolds:research` | Rebuild scaffold-research.generated.json from dossiers |
| `npm run scaffolds:build` | Run research + embeddings + validate in sequence |

## Runtime flow

1. `orchestrate.ts` resolves scaffold (auto/manual/off)
2. `serializeScaffoldForPrompt()` turns it into prompt text
3. `scaffold-research.generated.json` adds quality checklist + reference templates
4. Everything goes into `buildSystemPrompt()` as scaffold context

## Research lane

Scaffold enrichment data (dossiers, raw discovery) lives under `research/`
at the repo root. This is a build-time source, not a runtime dependency.
Run `npm run scaffolds:build` after adding or updating dossiers.
