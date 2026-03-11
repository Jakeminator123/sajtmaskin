# Template Library

This folder stores curated template dossiers derived from the raw Vercel
template dataset and local cloned repos.

It belongs to the research lane, not the runtime lane.

## Purpose

- Give agents a cleaner, smaller, more trustworthy template reference layer.
- Separate raw research data from curated reusable knowledge.
- Support future scaffold upgrades without turning raw repo clones into runtime assets.

## Structure

- `catalog.json` full audit output
- `catalog.md` human summary
- `schema.template-manifest.json` shape of each dossier manifest
- `dossiers/<template-id>/manifest.json`
- `dossiers/<template-id>/summary.md`
- `dossiers/<template-id>/selected_files/*.md`

## Important boundary

This folder does not directly power runtime scaffolds.
It is a curated reference layer for improving them over time.

Runtime generation still uses:

- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/serialize.ts`

Promotion into runtime should happen only after evaluation, not automatically when a template dossier is generated.

## Raw data location

The raw `_sidor` dataset is expected to stay local and gitignored.

Preferred locations for local work:

- `_sidor/vercel_usecase_next_react_templates`
- `research/_sidor/vercel_usecase_next_react_templates`

The build script will prefer those repo-local paths before falling back to an
older desktop path convention.
