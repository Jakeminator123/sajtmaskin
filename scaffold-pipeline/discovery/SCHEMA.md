# Raw Discovery Schema

This folder is the canonical raw-discovery lane for external template research.

It is still noisy research input, not runtime truth, but every discovery source
should normalize into the same local contract before curation runs.

## Canonical local files

- `current/summary.json`
  Grouped raw template records keyed by `category_slug`. This is the canonical
  builder input for `scripts/build-template-library.ts`.
- `current/catalog.json`
  Flattened audit-friendly view with source metadata and one entry per template.
- `current/source-metadata.json`
  Provenance for the current dataset, including whether it came from the legacy
  `_sidor` dataset or the Playwright scraper.
- `schema.summary.json`
  JSON Schema for each grouped `summary.json` dataset.

## Required record fields

Each template record must include:

- `category_slug`
- `category_name`
- `template_url`
- `title`
- `description`
- `repo_url`
- `demo_url`
- `framework_match`
- `framework_reason`
- `stack_tags`
- `important_lines`

## Notes

- `repo_url` and `demo_url` may be `null` when the source cannot verify them.
- `stack_tags` and `important_lines` may be empty arrays, but the keys should
  still be present after normalization.
- Playwright discovery should write to `current/` directly instead of creating a
  parallel metadata silo.
- Legacy `_sidor` imports should also be normalized into `current/`, while the
  original desktop dataset remains outside the repo.
