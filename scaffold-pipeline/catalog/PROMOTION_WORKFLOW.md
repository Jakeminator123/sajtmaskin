# Promotion Workflow

## Goal

Turn a curated external reference into a better internal runtime scaffold without creating a parallel scaffold system.

## Steps

1. Audit raw template data and repo quality.
2. Normalize it into a dossier with verified repo signals, selected files, and scaffold-family recommendations.
3. Compare the dossier against the existing internal scaffold family it best fits.
4. Extract reusable structure, not whole projects.
5. Update the internal scaffold manifest in `src/lib/gen/scaffolds/`.
6. Refresh scaffold research metadata and scaffold embeddings.
7. Re-run scaffold regression prompts and sanity checks before promotion.

## Minimum promotion checks

- Verified Next.js or React implementation from repo files
- Clear fit to an existing scaffold family
- Useful selected files with real structural value
- No broken or misleading repo URL
- No dependence on raw monorepo noise
- Resulting scaffold still passes scaffold manifest validation and project sanity expectations

## What not to promote directly

- Full monorepos
- Repo clones with bad or ambiguous source URLs
- Templates that only add marketing copy without structural value
- Frameworks that do not match the internal runtime stack
