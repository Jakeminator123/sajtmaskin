# Raw Discovery

This folder contains the canonical local raw-discovery intake for
external-template scrape and import workflows.

Typical properties:

- partial metadata
- scrape artifacts
- broken line wrapping
- mixed marketing and technical text
- inconsistent repo coverage

Use this folder for triage, audit, and discovery only.

Do not treat it as:

- a curated reference library
- a runtime scaffold registry
- a committed source of truth for prompts or embeddings

## Current convention

- `current/summary.json` is the canonical raw-discovery input for reference-dossier curation.
- `current/catalog.json` and `current/source-metadata.json` provide flattened
  audit and provenance views for the same dataset.
- `SCHEMA.md` and `schema.summary.json` describe the normalization contract.

Terminology note:

- These files describe external template discovery, not Sajtmaskin template
  gallery items.
- The discovery layer is upstream research input, not a runtime scaffold
  registry.

## Sources

- Playwright discovery from `vercel_templates_levels/tests/scrape-catalog.spec.ts`
- legacy `_sidor` summary imports via `scripts/import-template-discovery.ts`
