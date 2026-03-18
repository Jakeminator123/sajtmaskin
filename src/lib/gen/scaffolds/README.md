# Runtime Scaffolds (partially cursorignored)

The scaffold manifests and code are indexed, but the large generated/embedding
files are cursorignored. Agents can read this README for context.

## Cursorignored files

| File | Size | What it is |
|------|------|-----------|
| `scaffold-embeddings.json` | ~2 MB | OpenAI vectors for each scaffold. Used by `matchScaffoldWithEmbeddings()` in auto mode. |
| `scaffold-research.generated.json` | ~1 MB | Per-scaffold `qualityChecklist` and `research` (upgradeTargets, referenceTemplates). Generated from dossiers by `scripts/build-template-library.ts`. |

## Indexed files (readable by agents)

| File | What it does |
|------|-------------|
| `registry.ts` | The 10 scaffold manifests. Single source of truth. |
| `types.ts` | `ScaffoldManifest`, `ScaffoldFile`, `ScaffoldResearchMetadata` types. |
| `matcher.ts` | Keyword-based scaffold matching (fallback for embedding search). |
| `serialize.ts` | `serializeScaffoldForPrompt()` — turns a scaffold into system prompt text. |
| `scaffold-search.ts` | Embedding-based `matchScaffoldWithEmbeddings()`. |
| `scaffold-scoring.ts` | Telemetry-based boost/penalize for generic scaffolds. |
| `scaffold-aware-retry.ts` | Picks alternative scaffold if generation fails. |
| `scaffold-research.ts` | Loads `scaffold-research.generated.json` overrides. |

## The 10 scaffolds

`base-nextjs`, `landing-page`, `saas-landing`, `portfolio`, `blog`,
`dashboard`, `auth-pages`, `ecommerce`, `content-site`, `app-shell`.

Each has a directory with `manifest.ts` (metadata + files) and template files.

## Runtime flow

1. `orchestrate.ts` resolves scaffold (auto/manual/off)
2. `serializeScaffoldForPrompt()` turns it into prompt text
3. `scaffold-research.generated.json` adds quality checklist + reference templates
4. Everything goes into `buildSystemPrompt()` as scaffold context
