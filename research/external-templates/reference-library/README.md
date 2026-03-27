# External Reference Library

This folder stores curated external reference dossiers derived from raw template
research, local datasets, and cloned repos.

It belongs to the research lane, not the runtime lane.

## Purpose

- Give agents a cleaner, smaller, and more trustworthy external reference layer.
- Separate raw discovery noise from curated reusable knowledge.
- Support future scaffold upgrades without turning full external repos into
  direct runtime dependencies.

## Structure

- `catalog.json` full audit output
- `catalog.md` human summary
- `schema.template-manifest.json` shape of each reference dossier manifest
- `dossiers/<template-id>/manifest.json`
- `dossiers/<template-id>/summary.md`
- `dossiers/<template-id>/selected_files/*.md`

### Minimal / trimmed checkouts

The `dossiers/` tree may be **empty or partial** in some commits (catalog can still list audited templates with `verdict: research_only` and `curatedTemplates: 0`). That keeps the repo smaller; runtime scaffolds do not read this folder directly. To repopulate curated dossiers, run the template-library pipeline from repo root, for example `npm run template-library:build` (and related `template-library:*` scripts in `package.json`).

## Important boundary

This folder does not directly power runtime scaffolds.
It is a curated reference layer for improving them over time.

Runtime generation still uses:

- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/serialize.ts`

Promotion into runtime should happen only after evaluation, not automatically
when a reference dossier is generated.

## Upstream inputs

Typical upstream inputs include:

- canonical raw discovery under `research/external-templates/raw-discovery/current/`
- local repo cache under `research/external-templates/repo-cache/`
- legacy `_sidor` datasets only through normalized import or transitional fallback

The curation/build scripts should prefer the repo-local cache and canonical raw
discovery lane. Legacy desktop paths are migration inputs, not the preferred
steady state.
