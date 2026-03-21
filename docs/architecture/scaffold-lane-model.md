# Scaffold Lane Model (2026-03)

Canonical model for how external templates flow into Sajtmaskins runtime.

## Three zones

```
Zone 1: RAW (outside repo)            Zone 2: NORMALIZED (in repo)         Zone 3: RUNTIME (in repo)
─────────────────────────────         ──────────────────────────────       ────────────────────────────
  Vercel scrape output                  research/dossiers/<slug>/           src/lib/gen/scaffolds/
  git clone mirrors                     research/normalized-catalog.json    src/lib/gen/template-library/
  ingestion_report.json                 scaffold-research.generated.json    scaffold-embeddings.json
  summary.json                          template-library.generated.json
  raw HTML / metadata.json              template-library-embeddings.json
                                        (all committed, cursorignored)
  ────────────────────────────
  NOT committed. NOT indexed.
  Lives in a separate directory
  outside the workspace, or in
  local-only gitignored paths.
```

## Data flow

```
┌──────────────────┐
│  External source │  hamta_sidor.py / vercel_template_cli.py / manual URL list
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
         │  npm run research:normalize (new)
         │  reads raw summary + cloned repos → classifies, scores, extracts signals
         v
┌──────────────────┐
│  Zone 2: NORM.   │  research/normalized-catalog.json  (small, committed)
│  (in repo)       │  research/dossiers/<slug>/manifest.json + notes
│                  │
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
| Raw | `<outside-repo>/…` (e.g. `~/vercel-scrape/`) | No | No |
| Raw (alt) | `_template_refs/`, `_sidor/` | No (gitignored) | No |
| Normalized | `research/normalized-catalog.json` | Yes | No (cursorignored) |
| Normalized | `research/dossiers/<slug>/manifest.json` | Yes | No (cursorignored via `research/`) |
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
| `template-library:build` | Zone 2 → artifacts: reads normalized catalog, writes `template-library.generated.json` |
| `template-library:embeddings` | Generates `template-library-embeddings.json` from the catalog |
| `scaffolds:research` | Reads dossiers, writes `scaffold-research.generated.json` |
| `scaffolds:embeddings` | Generates `scaffold-embeddings.json` for runtime matching |
| `scaffolds:validate` | Validates all scaffold manifests |
| `scaffolds:build` | Runs `scaffolds:research` → `scaffolds:embeddings` → `scaffolds:validate` |
| `verify:generated-paths` | Ensures no machine-specific paths in committed JSON |

## Key rules

1. **Raw data never enters the repo.** Scrapers write to a path outside the workspace (or to a gitignored local dir). The repo only receives the small, normalized catalog.
2. **Normalized catalog is the single bridge.** All downstream build scripts read from `research/normalized-catalog.json` and `research/dossiers/`, never from raw HTML or clone directories.
3. **Promotion is explicit.** A normalized entry does not become a runtime scaffold automatically. It must be promoted to `src/lib/gen/scaffolds/<id>/manifest.ts` and registered in `registry.ts`. The first phase should produce scaffold candidates and dossiers; full replacement of current runtime scaffolds comes after verification.
4. **IDs are stable.** The `id` field in normalized entries, dossier manifests, `referenceTemplates`, and `template-library.generated.json` must all use the same key scheme so lookups in `system-prompt.ts` resolve correctly.
5. **Path hygiene.** All committed JSON must pass `npm run verify:generated-paths` before merge. No `C:\Users\…` or other machine-specific paths.
6. **Runtime scaffolds feed generation context, not the builder UI directly.** The resolved scaffold is serialized into the system prompt via `buildSystemPrompt()` / `buildDynamicContext()`. The builder UI only sees the scaffold as a selection/display label. See `research/README.md` and `src/lib/gen/scaffolds/README.md` for the authoritative separation between research and runtime.
