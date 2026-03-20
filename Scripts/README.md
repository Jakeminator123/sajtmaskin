# Scripts (dev & build entrypoints)

Small **Node** helpers wired into `npm run dev|build|start` and day-to-day template sync. They live at repo root as `Scripts/` (capital **S**) so they stay distinct from `config/scripts/` (offline pipeline).

| Script | Purpose |
|--------|---------|
| `next-runner.mjs` | Wraps `next dev` / `build` / `start` with repo env conventions. |
| `refresh-token.mjs` | Dev token refresh (`predev`). |
| `db-init.mjs` | Local DB bootstrap (`predev`, `db:init`). |
| `run-migrations.ts` | SQL migrations (`db:migrate`). |
| `generate-site-cli.ts` | Local CLI wrapper around `src/lib/mcp/generate-site.ts` for prompt -> preview runs from PowerShell/npm. |
| `sync-v0-templates.mjs` | Sync v0/Vercel-facing template metadata used by the product. |
| `validate-templates.mjs` | Validates synced template data. |

## Offline pipeline (embeddings, dossiers, scaffolds)

Heavy research/build steps moved to **`config/scripts/`**. Use npm scripts (paths already updated):

```bash
npm run verify:generated-paths
npm run template-library:build
npm run template-library:embeddings
npm run scaffolds:embeddings
npm run scaffolds:promote -- --help
```

If `verify:generated-paths` fails after a bad merge, run `npm run normalize:generated-paths` (see `docs/README.md` → Generated JSON hygiene).

Full narrative commands and ordering: **`config/scripts/README.md`** and **`scaffold-pipeline/README.md`**.

## Reference repo clones (GitHub mirrors)

```bash
node config/scripts/sync-scaffold-refs.mjs
node config/scripts/sync-scaffold-refs.mjs --force
node config/scripts/sync-scaffold-refs.mjs --only=nextjs-saas-starter,ibelick-nim
```

## AI defaults → `.env.local`

See **`config/README.md`** and `config/profiles/ai.defaults.ini`. Quick print:

```bash
npm run config:env-print
```

## Local MCP generate-site wrapper

Use this instead of trying to run `src/lib/mcp/generate-site.ts` directly:

```bash
npm run mcp:generate-site -- --prompt "Bygg en enkel frisörsida"
npm run mcp:generate-site -- "Bygg en enkel frisörsida"
npm run mcp:generate-site -- --prompt-file .\\prompt.txt --json
```

Why:
- `src/lib/mcp/generate-site.ts` is a library module, not a shell command.
- PowerShell cannot execute a raw `.ts` file directly.
- The wrapper loads the module via `tsx`, parses CLI flags, and prints a usable result summary.

## Interactive Python menu (whole pipeline)

```bash
python scaffold-pipeline/scripts/scaffold-pipeline.py
```

## Recovery PowerShell (optional)

If present under `Scripts/recovery/`, see historical notes in git history; paths in docs may still say `scripts/recovery/`.
