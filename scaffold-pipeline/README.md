# Scaffold Pipeline

This folder consolidates the entire scaffold creation funnel — from raw
template discovery to curated dossiers. The pipeline feeds into the runtime
scaffolds at `src/lib/gen/scaffolds/` and generated artifacts at
`src/lib/gen/template-library/`.

Terminology note:

- Treat this folder as research infrastructure.
- Use `runtime scaffold`, `Vercel template`, `reference dossier`, and
  `generated research artifact` as defined in
  `docs/architecture/structure-and-terminology.md`.
- Do not call the dossier/catalog layer a second runtime scaffold registry.

## Folder structure

```
scaffold-pipeline/
├── discovery/          Raw scrape data from vercel.com/templates (mostly gitignored)
├── repo-cache/         Shallow clones of external repos (gitignored, created by hydrate step)
├── dossiers/           53 curated reference packages (manifest.json + summary.md + selected_files/)
├── catalog/            Full catalog output: catalog.json, catalog.md, evaluation checklist
└── scripts/            Pipeline orchestration scripts
    ├── scaffold-pipeline.py   Interactive menu for the full pipeline
    └── hamta_sidor.py         Legacy page download helper
```
## Pipeline flow

```
1. Discovery     → scaffold-pipeline/discovery/
2. Hydrate       → scaffold-pipeline/repo-cache/
3. Build         → scaffold-pipeline/dossiers/ + catalog/
4. Embeddings    → src/lib/gen/template-library/ + src/lib/gen/scaffolds/
5. Runtime       → src/lib/gen/scaffolds/registry.ts (10 scaffolds)
```

## How to run

**Quick (one command, no Python needed):**

```bash
npm run scaffold-pipeline          # hydrate + build + embeddings + test
npm run scaffold-pipeline:full     # scrape vercel.com first, then full pipeline
```

**Interactive menu (all steps individually):**

```bash
python scaffold-pipeline/scripts/scaffold-pipeline.py
```

**Test matching only (no rebuild):**

```bash
npm run scaffolds:test-matching
```

## Build scripts (in scripts/)

| Script | What it does |
|--------|-------------|
| `scripts/build-template-library.ts` | Analyzes repos, creates dossiers and generated JSON |
| `scripts/template-library-discovery.ts` | Playwright scraper for vercel.com/templates |
| `scripts/generate-scaffold-embeddings.ts` | OpenAI embeddings for the 10 runtime scaffolds |
| `scripts/promote-to-scaffold.ts` | Promotes a dossier into a runtime scaffold |
| `scripts/curate-scaffold-candidates.ts` | Curates scaffold candidates from catalog |

## Relationship to runtime scaffolds

This folder is **research input** — it does not power runtime generation directly.

Runtime generation uses:
- `src/lib/gen/scaffolds/registry.ts` — the 10 scaffold manifests
- `src/lib/gen/scaffolds/scaffold-embeddings.json` — embedding vectors for auto-matching
- `src/lib/gen/scaffolds/scaffold-research.generated.json` — quality checklists derived from dossiers
- `src/lib/gen/template-library/` — template reference data and embeddings
