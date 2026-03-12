# Current State — 2026-03-12T03:05:28.1806590+01:00

## Canonical flow now

1. Discovery is normalized into `research/external-templates/raw-discovery/current/`.
2. Repo hydration happens in `research/external-templates/repo-cache/`.
3. Curation writes dossiers to `research/external-templates/reference-library/`.
4. Runtime-facing generated artifacts still land in:
   - `src/lib/gen/template-library/template-library.generated.json`
   - `src/lib/gen/scaffolds/scaffold-research.generated.json`

## Active inputs

### Playwright discovery

`vercel_templates_levels/tests/scrape-catalog.spec.ts` is active and now writes
builder-compatible raw discovery data, not just a thin catalog prototype.
The supporting filter-panel notes in `next_sidan_skrapning.txt` have now been
captured in `vercel_templates_levels/TEMPLATE_INTAKE_POLICY.md`, so DevTools
findings are no longer just ad-hoc chat context.

Main commands:

```bash
npm run references:discover
npm run references:discover:full
```

### Legacy desktop dataset

`C:\Users\jakem\Desktop\_sidor\vercel_usecase_next_react_templates` is still a
valid migration input, but it is now explicitly treated as legacy external data.

Main command:

```bash
npm run template-library:import-legacy
```

## Repo hydration step

`scripts/hydrate-template-library-cache.ts` is now the preferred bridge between
raw discovery and dossier generation.

Main command:

```bash
npm run template-library:hydrate-cache
```

This keeps `build-template-library.ts` from depending on desktop clone paths as
its preferred steady state.

Many folders under `research/external-templates/repo-cache/` are expected.
That folder is a local shallow clone mirror of external repos, not an app-level
cache in the Redis/Upstash/Supabase sense.

## Remaining boundaries

- `_sidor` stays outside the repo.
- `vercel_templates_levels/` remains tooling, not canonical stored data.
- `vercel_templates_levels/TEMPLATE_INTAKE_POLICY.md` is the locked filter and
  boundary policy for Vercel Templates intake.
- Runtime scaffolds are still the 10 internal families under `src/lib/gen/scaffolds/`.
- Promotion from external references into runtime scaffolds is still manual.

## Current promotion stance

After regenerating the curated library and scaffold research on `2026-03-12`,
there is no strong evidence yet for adding a brand new runtime scaffold family.
The broader external categories now map into existing families such as
`dashboard`, `app-shell`, `content-site`, `landing-page`, `saas-landing`, and
`auth-pages`, so the next step should remain selective manual promotion rather
than automatic scaffold expansion.
