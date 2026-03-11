# v0 Vercel Agents

This folder belongs to the research lane, not the runtime lane.

## Two-lane model

- `Runtime lane`
  Uses `src/lib/gen/scaffolds/` as the only scaffold registry used directly by generation.
- `Research lane`
  Uses this folder plus curated generated artifacts to improve prompts, docs context, and future scaffold upgrades.

Inside the research lane, this folder now focuses on documentation helpers:

- `official_docs/` for agent-facing notes about official documentation and MCP-backed doc sources.

The curated external reference library moved to:

- `research/external-templates/reference-library/`

This folder is not the runtime scaffold registry.

## Production boundary

Vercel production should not depend on raw `_sidor` data, local browser helpers,
or MCP availability at runtime.

Production should read only the committed, curated derivatives:

- `src/lib/gen/template-library/`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/scaffolds/`

MCP-backed docs and local browser helpers are best used during research,
curation, and build-time improvements.

## Intended flow

1. Crawl or sync raw references outside the runtime path.
2. Normalize and validate those references into `research/external-templates/reference-library/`.
3. Use `official_docs/` for authoritative behavior and API guidance.
4. Promote the strongest template references into internal scaffold improvements.
5. Keep runtime scaffolds separate from the research lane.

## Related paths

- `src/lib/gen/scaffolds/`
- `src/lib/gen/template-library/`
- `research/external-templates/`
- `tools/doc-browser/`
