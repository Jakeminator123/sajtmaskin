# External Template Research

This folder is the canonical external-template research lane.

## Canonical sub-areas

- `raw-discovery/`
  Canonical local intake for raw discovery data. It is still noisy and
  non-runtime, but all discovery sources should normalize here first.
- `repo-cache/`
  Local-only shallow clone cache used during curation so the builder does not
  depend on workstation-specific desktop clone paths. It may contain many repo
  folders and should be read as a local repo mirror, not a runtime cache.
- `reference-library/`
  Curated external reference dossiers used to improve prompts, embeddings, and
  internal scaffold evolution.

## Input policy

- `C:\Users\jakem\Desktop\_sidor\vercel_usecase_next_react_templates` remains a
  legacy external dataset. Keep it outside the repo.
- `vercel_templates_levels/` is tooling around discovery, not a parallel data
  silo. Its Playwright scraper should write into `raw-discovery/current/`.
- This lane is for public Vercel Templates research, not for product-facing v0
  gallery templates.
- `scripts/import-template-discovery.ts` is the migration bridge from legacy
  summary files into the canonical raw-discovery location.

## Important boundary

Neither of these folders is the runtime scaffold registry.

Runtime generation still depends on:

- `src/lib/gen/scaffolds/`
- `src/lib/gen/template-library/`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
