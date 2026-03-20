# config/scripts

Offline and build-time TypeScript/Node helpers. **Not imported by the Next.js app.**

Prefer npm scripts from the repo root (`package.json` prefixes paths with `config/scripts/`). Typical flows are documented in `Scripts/README.md` and `scaffold-pipeline/README.md`.

| Area | npm examples |
|------|----------------|
| Template library + dossiers | `template-library:import`, `hydrate-cache`, `build`, `embeddings`, **`verify:generated-paths`**, **`normalize:generated-paths`** |
| Runtime scaffolds | `scaffolds:embeddings`, `curate`, `promote`, `test-matching` |
| Gallery / marketing templates | `templates:embeddings` |
| Docs RAG | `docs:embeddings` |
| Eval | `eval` |
| Reference repo clones | run `node config/scripts/sync-scaffold-refs.mjs` |

All imports use `../../src/...` because this directory is **two levels** below the repo root.
