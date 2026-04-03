# External Template Pipeline Data

This folder is the canonical mutable data root for the external-template
pipeline.

## Subdirectories

- `scrape-cache/current/` — latest Python scrape output
- `raw-discovery/current/` — canonical imported discovery dataset
- `repo-cache/` — shallow GitHub repo cache used by build
- `reference-library/` — generated dossiers and curated reference library docs
- `reports/` — generated curation-only reports such as scaffold candidates

## Important boundary

This folder is **not** the runtime scaffold registry.

Runtime scaffold code still lives in:

- `src/lib/gen/scaffolds/`

Runtime generated artifacts consumed by the app live in:

- `src/lib/gen/template-library/*.json`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/scaffold-embeddings.json`

## Canonical orchestration

Use:

```bash
npm run template-pipeline:refresh
```

or:

```bash
py scripts/template-library/full_template_refresh.py
```
