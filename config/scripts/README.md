# config/scripts

Offline and build-time TypeScript/Node helpers. **Not imported by the Next.js app.**

Prefer npm scripts from the repo root (`package.json` prefixes paths with `config/scripts/`). See `Scripts/README.md` for dev entrypoints.

| Area | npm examples |
|------|----------------|
| Generated JSON hygiene | **`verify:generated-paths`**, **`normalize:generated-paths`** (template-library + scaffold-research stubs under `src/lib/gen/`) |
| Gallery / marketing templates | `templates:embeddings` |
| Docs RAG | `docs:embeddings` |
| Eval | `eval` |
| Runtime library audit | `runtime-library:audit` |

All imports use `../../src/...` because this directory is **two levels** below the repo root.
