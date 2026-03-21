# config/scripts

Offline and build-time TypeScript/Node helpers. **Not imported by the Next.js app.**

Prefer npm scripts from the repo root (`package.json` prefixes paths with `config/scripts/`). Python research scripts (Vercel scrape, shadcn.io mirror) live under **`scripts/README.md`** at the repo root.

| Area | npm examples |
|------|----------------|
| Research normalize (Zone 1 → 2) | **`research:normalize`** `-- --input <raw-dir>` → `research/normalized-catalog.json` |
| Generate dossiers (Zone 2 → dossiers) | **`research:generate-dossiers`** → `research/dossiers/<slug>/manifest.json` per scaffold family |
| Template library build (Zone 2 → artifacts) | **`template-library:build`**, **`template-library:embeddings`**, **`template-library:rebuild`** (reference catalog only — **not** v0 gallery) |
| Optional: also refresh v0 gallery vectors | **`template-library:rebuild:with-v0-gallery`** or run **`templates:embeddings`** separately |
| Local reference smoke (needs `OPENAI_API_KEY`) | **`template-library:smoke-search`** |
| Scaffold build pipeline | **`scaffolds:build`** (research + embeddings + validate), `scaffolds:embeddings`, `scaffolds:research`, `scaffolds:validate` |
| Generated JSON hygiene | **`verify:generated-paths`**, **`normalize:generated-paths`** (template-library + scaffold-research stubs under `src/lib/gen/`) |
| v0 gallery embeddings only | `templates:embeddings` → `src/lib/templates/template-embeddings.json` |
| Docs RAG | `docs:embeddings` |
| Eval | `eval` |
| Runtime library audit | `runtime-library:audit` |

All imports use `../../src/...` because this directory is **two levels** below the repo root.
