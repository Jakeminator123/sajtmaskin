# Vercel Templates Levels

## Purpose

This folder is a tooling wrapper around discovery and validation work for public
Vercel templates. It is not a parallel data silo.

The canonical research lane lives under `research/external-templates/`.

See also `TEMPLATE_INTAKE_POLICY.md` for the locked checkbox strategy,
DevTools notes, and the boundary between Vercel Templates, v0 templates, and
runtime scaffolds.

## Levels

### Level 1: Discovery

Use Playwright to collect template-page signals and normalize them into the
canonical raw-discovery contract.

```bash
npm run references:discover
npm run references:discover:second-pass
npm run references:discover:full
```

Outputs land in:

- `research/external-templates/raw-discovery/current/summary.json`
- `research/external-templates/raw-discovery/current/catalog.json`
- `research/external-templates/raw-discovery/current/source-metadata.json`

### Level 2: Repo hydration + curation

Populate the local shallow clone cache, then rebuild the curated reference
library and runtime artifacts.

```bash
npm run template-library:hydrate-cache
npm run template-library:build
npm run template-library:embeddings
```

Outputs:

- `research/external-templates/repo-cache/` (local only, ignored)
- `research/external-templates/reference-library/`
- `src/lib/gen/template-library/template-library.generated.json`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`

`repo-cache/` here means a local shallow clone mirror of third-party repos. It
is not an application runtime cache like Redis or Supabase.

### Level 3: Sandbox verification

Reserved for future top-template validation with full installs/builds in an
isolated environment. This should stay selective and should not be the default
curation path.

## Legacy desktop dataset

`C:\Users\jakem\Desktop\_sidor\vercel_usecase_next_react_templates` remains a
legacy external input.

Policy:

1. Keep it outside the repo.
2. Import only its `summary.json` into canonical raw discovery when needed.
3. Prefer the repo-local shallow clone cache over direct desktop repo reads.
4. Do not confuse this legacy Vercel Templates dataset with product-facing v0
   gallery templates.

Use:

```bash
npm run template-library:import-legacy
```

## Rules

1. Do not commit cloned third-party repos.
2. Do not run `install` or `build` during Level 2 cache hydration.
3. Do not promote external templates directly into runtime scaffolds.
4. Commit only curated/runtime artifacts, not raw discovery dumps or repo cache.
