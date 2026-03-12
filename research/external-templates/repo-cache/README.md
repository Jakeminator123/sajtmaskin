# Repo Cache

This folder is a local-only shallow clone cache for external template repos.

Despite the name, this is not a runtime cache like Redis, Upstash, or Supabase
caching. It is just a local mirror of third-party repos for research-time
inspection.

## Purpose

- decouple `build-template-library.ts` from workstation-specific `_sidor` clone paths
- keep repo inspection reproducible without committing third-party repos
- provide a fast Level-2 hydration step before dossier generation

## Rules

- This folder is ignored by git.
- Only shallow clones belong here.
- Do not run `install` or `build` inside these repos as part of cache hydration.
- Full sandbox verification still belongs in a later validation step.

## Populate it

```bash
npm run template-library:hydrate-cache
```

By default the script reads the canonical raw discovery summary from
`research/external-templates/raw-discovery/current/summary.json` and clones any
missing GitHub repos into this cache.

If you want the human policy for which external Vercel Templates should enter
this lane, see `vercel_templates_levels/TEMPLATE_INTAKE_POLICY.md`.
