# External Template Research

This folder holds the external-template research lane.

## Canonical sub-areas

- `raw-discovery/`
  Noisy local scrape/discovery output. Useful for triage and auditing, not a
  source of runtime truth.
- `reference-library/`
  Curated external reference dossiers used to improve prompts, embeddings, and
  internal scaffold evolution.

## Important boundary

Neither of these folders is the runtime scaffold registry.

Runtime generation still depends on:

- `src/lib/gen/scaffolds/`
- `src/lib/gen/template-library/`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
