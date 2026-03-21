# Repo Hygiene

This document defines which large paths should stay committed, which should stay
local-only, and which should be evaluated for later extraction from this repo.

## Why the repo feels large

- **Historical note:** the old `scaffold-pipeline/` tree was removed. Dossiers now live under
  `research/dossiers/` as build-time enrichment data. Build scripts produce generated artifacts
  committed under `src/lib/gen/scaffolds/` and `src/lib/gen/template-library/`.
- **Lane model (2026-03):** raw scrape output and clone mirrors live **outside the repo**;
  only a small normalized catalog (`research/normalized-catalog.json`) and dossiers enter the repo.
  See `docs/architecture/scaffold-lane-model.md` for the full three-zone model.
- **Still true:** large media, generated JSON, and docs can add weight — keep them classified below.

## Classification

| Status | Paths | Why |
|------|------|------|
| `keep` | `src/`, `docs/`, `public/video/` | App/runtime code, canonical docs, and currently used product assets. |
| `keep` | `src/lib/gen/template-library/`, `src/lib/gen/scaffolds/`, `src/lib/gen/data/docs-embeddings.json` | Runtime code imports these generated artifacts directly. Keep them committed even when some large generated JSON files are excluded from Cursor indexing. |
| `keep` | `research/dossiers/`, `research/README.md` | Build-time enrichment layer for scaffold research artifacts. |
| `local-only` | `_template_refs/`, `_sidor/`, `research/raw-discovery/` | Local datasets / clone mirrors; not required for the runtime app. |
| `outside-repo` | Raw scrape output, shallow clones (e.g. `~/vercel-scrape/`) | New canonical location for Zone 1 data; never committed, never indexed. |
| `keep` | `research/normalized-catalog.json` | Small normalized bridge from Zone 1 → Zone 2; committed but cursorignored. |
| `archive` | `docs/plans/archived/`, `docs/old/` | Useful historical context, but low-value for day-to-day indexing. |
| `archive` | `docs/old/2026-03-holding-area/next-sidan-skrapning.txt` | Historical intake notes kept as a final holding-area reference, not active guidance. |

## Ignore policy

### Git ignore

`gitignore` should keep accidental local artifacts out of commits:

- clone mirrors and local research caches
- workstation-specific helper folders like `_template_refs/`
- reproducible reports like `data/scaffold-candidates-curated.json`
- one-off intake notes once they have been archived under `docs/old/`

Do not add `src/lib/gen/` or `public/video/` to `.gitignore` unless runtime code
stops reading those files.

Adding a path to `.gitignore` does not remove an already tracked file. Use a
separate cleanup change if you later decide to untrack an existing artifact.

### Cursor ignore

`cursorignore` should be more aggressive than `.gitignore`.

It is safe to exclude:

- local research lanes
- archived docs
- machine-generated JSON that is runtime-read but rarely hand-edited
- large report/reference files that can be opened directly when needed
- local orchestrator run history and other short-lived execution traces

This keeps search and AI context focused on source code and canonical docs.

Important distinction:

- `cursorignore` is an indexing/noise-control tool, not a statement that a file is unimportant.
- Large generated artifacts under `src/lib/gen/` can stay committed and runtime-critical while still being good candidates for `cursorignore`.
- When a task actually depends on one of those files, prefer reading it directly instead of removing it from `cursorignore` by default.

## Safe local cleanup

Optional local-only folders (not required for `npm run dev`):

- `_template_refs/`

After you hand-edit `src/lib/gen/template-library/*.json` or scaffold research stubs:

```bash
npm run verify:generated-paths
```

Until then, the best cost/benefit move is to reduce indexing noise first and
avoid adding more local-only artifacts to Git.
