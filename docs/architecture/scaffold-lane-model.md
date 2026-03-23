# Scaffold Lane Model (2026-03)

Canonical model for how external templates flow into Sajtmaskins runtime.

## Three zones

```
Zone 1: RAW (outside repo or          Zone 2: NORMALIZED (in repo)         Zone 3: RUNTIME (in repo)
        local-only cache)
─────────────────────────────         ──────────────────────────────       ────────────────────────────
  Vercel scrape output                  research/normalized-catalog.json    src/lib/gen/scaffolds/
  git clone mirrors                     scaffold-research.generated.json    src/lib/gen/template-library/
  ingestion_report.json                 template-library.generated.json     scaffold-embeddings.json
  summary.json                          template-library.generated.json
  raw HTML / metadata.json              template-library-embeddings.json
                                        (all committed, cursorignored)
  ────────────────────────────
  NOT committed. NOT indexed.
  Prefer a sibling folder such as
  ../vercel-scrape/ for Vercel intake.
  Auxiliary mirrors may also live in
  local-only gitignored paths.
```

## Data flow

```
┌──────────────────┐
│  External source │  `scripts/hamta_sidor.py` / vercel_template_cli.py / manual URL list
│  (Vercel, shadcn │
│   GitHub, …)     │
└────────┬─────────┘
         │  --output <path-outside-repo>
         │  --skip-download (metadata first)
         v
┌──────────────────┐
│  Zone 1: RAW     │  summary.json, ingestion_report.json, metadata.json per entry,
│  (outside repo)  │  optional shallow clones under <path-outside-repo>/<slug>/repo/
└────────┬─────────┘
         │  npm run research:normalize
         │  reads raw summary + cloned repos → classifies, scores, extracts signals
         v
┌──────────────────┐
│  Zone 2: NORM.   │  research/normalized-catalog.json  (small, committed)
│  (in repo)       │
│  Build scripts:  │  npm run scaffolds:build
│    scaffolds:    │    → scaffold-research.generated.json
│    research      │    → scaffold-embeddings.json
│                  │
│  Build scripts:  │  npm run template-library:build (new)
│    template-lib  │    → template-library.generated.json
│                  │    → template-library-embeddings.json
└────────┬─────────┘
         │  Promotion (manual or assisted decision)
         │  A normalized entry with promotionDecision = "runtime_scaffold_candidate"
         │  gets a new manifest.ts authored under src/lib/gen/scaffolds/<id>/
         v
┌──────────────────┐
│  Zone 3: RUNTIME │  registry.ts imports manifests
│  (in repo)       │  matchScaffoldWithEmbeddings() selects scaffold at generation time
│                  │  system-prompt.ts ranks template references
└────────┬─────────┘
         │  At generation time the resolved scaffold + research + template references
         │  are serialized into the generation context (buildSystemPrompt / buildDynamicContext),
         │  not passed directly to the builder UI.
         v
┌──────────────────┐
│  Generation      │  AI model receives scaffold code + research + references as prompt context
│  context →       │  Model generates the working project
│  working project │  Autofix, preview, iteration
└──────────────────┘
```

## Canonical paths

| Zone | Path | Committed | Cursor-indexed |
|------|------|-----------|----------------|
| Raw | `<repo-parent>/vercel-scrape/` (e.g. `../vercel-scrape/`, `~/vercel-scrape/`) | No | No |
| Raw (alt) | `_template_refs/`, `_sidor/` | No (gitignored) | No |
| Normalized | `research/normalized-catalog.json` | Yes | No (cursorignored) |
| Normalized | `research/README.md` | Yes | No (cursorignored via `research/`) |
| Artifacts | `src/lib/gen/template-library/template-library.generated.json` | Yes | No (cursorignored) |
| Artifacts | `src/lib/gen/template-library/template-library-embeddings.json` | Yes | No (cursorignored) |
| Artifacts | `src/lib/gen/scaffolds/scaffold-research.generated.json` | Yes | No (cursorignored) |
| Artifacts | `src/lib/gen/scaffolds/scaffold-embeddings.json` | Yes | No (cursorignored) |
| Runtime | `src/lib/gen/scaffolds/<family>/manifest.ts` | Yes | Yes |
| Runtime | `src/lib/gen/scaffolds/registry.ts` | Yes | Yes |

## npm scripts (target state)

| Script | Purpose |
|--------|---------|
| `research:normalize` | Zone 1 → Zone 2: reads raw scrape output, writes `research/normalized-catalog.json` |
| `scaffolds:research` | Generates minimal `scaffold-research.generated.json` stubs from registry (no dossier dependency) |
| `template-library:build` | Zone 2 → artifacts: reads normalized catalog, writes `template-library.generated.json` |
| `template-library:embeddings` | Generates `template-library-embeddings.json` from the catalog |
| `scaffolds:embeddings` | Generates `scaffold-embeddings.json` for runtime matching |
| `scaffolds:embeddings` | Generates `scaffold-embeddings.json` for runtime matching |
| `scaffolds:validate` | Validates all scaffold manifests |
| `scaffolds:build` | research stubs + embeddings + validate in sequence |
| `verify:generated-paths` | Ensures no machine-specific paths in committed JSON |

## Shadcn.io mirror (~150 repos) vs runtime

The `_template_refs/shadcn-io-mirror/` tree (from `mirror_shadcn_io_templates.py`) is **Zone 1 raw cache**, same lane as optional Vercel clones: useful for **offline research** and future curation, **not** wired into scaffold selection or the shadcn/ui components under `src/components/ui/` at dev time. For a concise operator summary see `docs/handoffs/local-operator-guide.md`.

## Key rules

1. **Raw Vercel scrape data stays outside the git root when practical.** The simplest default is a sibling folder like `../vercel-scrape/`. Auxiliary mirrors like `_template_refs/` are acceptable local-only caches inside the repo as long as they remain gitignored/cursorignored. The repo only receives the small, normalized catalog.
2. **Normalized catalog is the single bridge.** All downstream build scripts read from `research/normalized-catalog.json`, never from raw HTML or clone directories.
3. **Promotion is explicit.** A normalized entry does not become a runtime scaffold automatically. It must be promoted to `src/lib/gen/scaffolds/<id>/manifest.ts` and registered in `registry.ts`. The first phase should produce scaffold candidates and dossiers; full replacement of current runtime scaffolds comes after verification.
4. **IDs are stable.** The `id` field in normalized entries, dossier manifests, `referenceTemplates`, and `template-library.generated.json` must all use the same key scheme so lookups in `system-prompt.ts` resolve correctly.
5. **Path hygiene.** All committed JSON must pass `npm run verify:generated-paths` before merge. No `C:\Users\…` or other machine-specific paths.
6. **Runtime scaffolds feed generation context, not the builder UI directly.** The resolved scaffold is serialized into the system prompt via `buildSystemPrompt()` / `buildDynamicContext()`. The builder UI only sees the scaffold as a selection/display label. See `research/README.md` and `src/lib/gen/scaffolds/README.md` for the authoritative separation between research and runtime.
7. **Source grouping and repo-type grouping are different things.** Zone 1 Vercel scrape output should usually keep source-aligned folders like `saas/`, `ecommerce/`, `blog/` so the intake is traceable to Vercel. Cross-cutting labels like `boilerplate`, `starter_kit`, `full_app`, and `runtime_scaffold_candidate` are added later in `research/normalized-catalog.json`, not by renaming raw folders.
