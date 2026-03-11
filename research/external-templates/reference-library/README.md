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

- raw discovery under `research/external-templates/raw-discovery/`
- local `_sidor`-style datasets
- cloned reference repos discovered from public template pages

The curation/build scripts may prefer repo-local paths before falling back to an
older desktop path convention.
