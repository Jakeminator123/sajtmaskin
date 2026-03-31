# External Template Research

This folder is the canonical external-template research lane. Repo context (mappar, mallar vs scaffold): [`docs/architecture/repository-and-platform.md`](../../docs/architecture/repository-and-platform.md).

## Canonical sub-areas

- `raw-discovery/`
  Canonical local intake for raw discovery data. It is still noisy and
  non-runtime, but all discovery sources should normalize here first.
- `repo-cache/`
  Local-only shallow clone cache used during curation so the builder does not
  depend on workstation-specific desktop clone paths. It may contain many repo
  folders and should be read as a local repo mirror, not a runtime cache.
- `reference-library/`
  Curated external reference dossiers used to improve prompts, embeddings, and
  internal scaffold evolution.

## Intake tools (three paths, one lane)

All of these scrape or normalize **vercel.com/templates** for **research** — not
builder **Mall** / v0 gallery templates (see `.cursor/rules/terminology.mdc`).

| Tool | Mechanism | Default output | Canonical merge into `raw-discovery/current/` |
|------|-----------|----------------|--------------------------------------------------|
| **`e2e/vercel-templates/`** | Playwright spec + `npm run references:discover*` (tracked) | Writes under `raw-discovery/current/` when run | See `e2e/README.md`; legacy `vercel_templates_levels/` optional local |
| **`scripts/template-library/hamta_sidor_branch_emil.py`** | Python (`requests` + BeautifulSoup), richer per-template folders + `summary.json` plus preferred `summary-cleaned.json`; flag `--legacy-wide-use-cases` reproduces the old wide category list | **Outside repo:** sibling dir `../vercel-scrape`, `../vercel-scrape-fresh`, or `SAJTMASKIN_VERCEL_SCRAPE_DIR` | Run `scripts/template-library/import-template-discovery.ts --from=<path/to/folder-or-summary>`; if both summaries exist, `summary-cleaned.json` wins |

**Kanonisk Playwright-spec** = `e2e/vercel-templates/scrape-catalog.spec.ts` (tracked). **Legacy** `vercel_templates_levels/` i roten kan finnas **lokalt** (gitignored); ta bort om du inte behöver gamla anteckningar.

## Non-canon — do not use as product truth

These must **not** drive builder/runtime behavior, embedding curation, or “how many categories Sajtmaskin has”:

- **`vercel_templates_levels/`** — optional local legacy folder; **not** tracked; ignore for canonical pipelines.
- **`--legacy-wide-use-cases`** on `scripts/template-library/hamta_sidor_branch_emil.py` — historical wide Vercel slug list (~25) for comparison/research only.
- **Removed** `scripts/hamta_sidor.py` — do not re-add a wrapper entrypoint.

**Separate concepts (easy to confuse):** (1) Vercel Templates **scrape slugs** (`USE_CASES_CORE` = 12 + 2 extended), (2) **eval regression prompts** (`EVAL_PROMPTS` = 15 in `src/lib/gen/eval/prompts.ts`), (3) **scorecard dimensions** (5 in `src/lib/gen/eval/scorecard.ts`), (4) **internal runtime scaffolds** (`src/lib/gen/scaffolds/registry.ts` — `BASE_SCAFFOLDS`, unrelated to scrape slug count). Removing the old Python wrapper or ignoring `vercel_templates_levels/` does **not** change eval prompts or embeddings code paths.

## Input policy

- `C:\Users\jakem\Desktop\_sidor\vercel_usecase_next_react_templates` remains a
  legacy external dataset. Keep it outside the repo.
- `e2e/vercel-templates/` is the **tracked** Playwright tooling; `vercel_templates_levels/` is optional **local** legacy;
  it is **gitignored** and listed in **`.cursorignore`** (indexing noise control).
  When present, discovery output should land under `raw-discovery/current/`. See
  `e2e/README.md` och [`scripts/README.md`](../../scripts/README.md) (template-library / discovery).
- This lane is for public Vercel Templates research, not for product-facing v0
  gallery templates.
- `scripts/template-library/import-template-discovery.ts` is the migration bridge from external
  scrape outputs (prefer `summary-cleaned.json`) and older legacy summary files
  into the canonical raw-discovery location.

## Important boundary

Neither of these folders is the runtime scaffold registry.

Runtime generation still depends on:

- `src/lib/gen/scaffolds/`
- `src/lib/gen/template-library/`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`

## Local cleanup

The heaviest local folder in this lane is usually `repo-cache/`.

That folder, along with `raw-discovery/current/`, can be removed locally and
rebuilt from scripts when needed. Cleanup/keep guidance: [`docs/architecture/documentation-lifecycle.md`](../../docs/architecture/documentation-lifecycle.md) och [`docs/architecture/repository-and-platform.md`](../../docs/architecture/repository-and-platform.md).
