# Runtime scaffolds

Hand-authored starter projects under `*/manifest.ts`, registered in `registry.ts`. These are the **real base code** the model extends — separate from the **v0 gallery** (`src/lib/templates/`) and separate from any **Vercel.com template** marketing pages.

## Generated JSON (optional overrides)

| File | Role |
|------|------|
| `scaffold-embeddings.json` | Precomputed vectors for `searchScaffolds()` / embedding-based matching. Empty ⇒ semantic auto-match is disabled; keyword `matcher.ts` still applies. |
| `scaffold-research.generated.json` | Optional per-scaffold `qualityChecklist` / `research` overrides. Empty object ⇒ manifests use only what is in each `manifest.ts`. |

## Core modules

| File | Role |
|------|------|
| `registry.ts` | Scaffold manifests. |
| `matcher.ts` | Keyword routing when embeddings are empty or as fallback. |
| `serialize.ts` | `serializeScaffoldForPrompt()`. |
| `scaffold-search.ts` | Embedding search when `scaffold-embeddings.json` has rows. |
| `scaffold-research.ts` | Merges `scaffold-research.generated.json` onto manifests. |

## Regenerating scaffold embeddings (optional)

When you change scaffolds and want semantic matching again, run a small script that calls `generateScaffoldEmbeddings()` from `scaffold-embeddings-core.ts` with `OPENAI_API_KEY`, or reintroduce a thin `config/scripts` helper — the previous bulk pipeline was removed.
