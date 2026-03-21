# Scripts (dev & build entrypoints)

Small **Node** helpers wired into `npm run dev|build|start` and day-to-day template sync. They live at repo root as `Scripts/` (capital **S**) so they stay distinct from `config/scripts/` (offline helpers).

| Script | Purpose |
|--------|---------|
| `next-runner.mjs` | Wraps `next dev` / `build` / `start` with repo env conventions. |
| `refresh-token.mjs` | Dev token refresh (`predev`). |
| `db-init.mjs` | Local DB bootstrap (`predev`, `db:init`). |
| `run-migrations.ts` | SQL migrations (`db:migrate`). |
| `generate-site-cli.ts` | Local CLI wrapper around `src/lib/mcp/generate-site.ts` for prompt → preview runs from PowerShell/npm. |
| `sync-v0-templates.mjs` | Sync **v0 gallery** template metadata (`src/lib/templates/`) used by the product UI. |
| `validate-templates.mjs` | Validates synced gallery template data. |
| `scan-repo-health.mjs` | Heuristic scan for leaked machine paths, legacy path segments, merge markers (`npm run scan:repo-health`). Use `--all` for the whole workspace. |

## Generated JSON (stubs)

Runtime loads `src/lib/gen/template-library/*.json`, `scaffold-embeddings.json`, and `scaffold-research.generated.json`. After changing **registry**, scaffold manifests, or **`research/dossiers/`**, regenerate and validate:

```bash
npm run scaffolds:build
```

After other manual edits to those JSON blobs, run:

```bash
npm run verify:generated-paths
npm run normalize:generated-paths   # if paths need normalizing
```

Offline TypeScript that powers `scaffolds:*`, `templates:embeddings`, `docs:embeddings`, etc. lives in **`config/scripts/`** — see `config/scripts/README.md`.

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

## Terminology: v0 gallery vs Vercel templates vs runtime scaffolds

- **v0 gallery templates** — what `templates:sync` / `src/lib/templates/` describe: browse cards, often animation-heavy single pages or small apps from v0.dev; they steer the *initial prompt*, not committed starter code in this repo.
- **Vercel templates** — public starters on vercel.com/templates (external ecosystem); not the same as v0 gallery JSON.
- **Runtime scaffolds** — hand-authored starters under `src/lib/gen/scaffolds/` that the own-engine uses as real base code.

## Recovery PowerShell (optional)

If present under `Scripts/recovery/`, see historical notes in git history; paths in docs may still say `scripts/recovery/`.
