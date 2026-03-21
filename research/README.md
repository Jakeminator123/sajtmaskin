# Research Lane

Non-runtime research inputs and curated reference material.

Runtime code never imports from this directory. Instead, build scripts
under `config/scripts/` read dossiers and raw discovery data here and
produce generated artifacts committed under `src/lib/gen/`.

## Directory structure

```
research/
  dossiers/            Curated per-template reference packages
  raw-discovery/       Raw scraping / discovery output (noisy, not canonical)
```

## Dossiers

A dossier is a curated reference package for one external template or
project. Each dossier lives in its own subdirectory with:

- `manifest.json` -- structured metadata (id, title, category, quality score,
  strengths, optional scaffoldId for scaffold enrichment)
- `summary.md` -- human-readable analysis

Dossiers feed into two generated artifacts:

| Artifact | Path | Build command |
|----------|------|---------------|
| scaffold-research.generated.json | `src/lib/gen/scaffolds/` | `npm run scaffolds:research` |
| template-library.generated.json | `src/lib/gen/template-library/` | (future) |

## Adding a new dossier

1. Create `research/dossiers/<slug>/manifest.json` with id, title, categorySlug, qualityScore, strengths, scaffoldId, qualityChecklist, upgradeTargets.
2. Optionally add `summary.md` with deeper analysis.
3. Run `npm run scaffolds:build` to regenerate embeddings + research artifacts.

## Raw discovery

`raw-discovery/` holds unprocessed scraping output. Promote useful entries
to `dossiers/` after manual review. This data is never used directly by
runtime or build scripts.
