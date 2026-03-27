# Repository, terminologi och plattformsintegrationer

**Senast uppdaterad:** 2026-03-27

## Terminologi (mappar och lager)

**Kompakt ordlista (lager, kod vs UI, lanes):** [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc). **På-disk-tabell** (scaffold / v0-templates / research / artifacts) finns där — duplicera inte här.

Djupare filstruktur och pipeline: [arkiv `structure-and-terminology.md`](./archive/pre-2026-03-consolidation/structure-and-terminology.md).

## Dokumentationslivscykel

| Status | Mapp |
|--------|------|
| `active` | `docs/plans/active/` |
| `review-needed` | `docs/plans/review-needed/` |
| `avklarat` | `docs/plans/avklarat/` |

`docs/architecture/` = **kanoniska översikter** (det här dokumentet + syskonfiler). Tillfälliga utkast ska inte lägga sig som parallella sanningar — se arkiv `documentation-lifecycle.md`.

## Repo-hygien

- **Git** bestämmer vad som följer med clone/PR; stora lokala kataloger (`logs/`, `data/`) är ofta ignorerade.
- **`.cursorignore`** styr indexering i Cursor — inte samma som git.
Detalj: arkiv `repo-hygiene.md`.

## Skript och scaffolds

- **NPM**-skript: se rot `package.json` och [`scripts/README.md`](../../scripts/README.md).
- **Research-skript** (`hamta_sidor_branch_emil.py`, `vercel_template_cli.py`, m.m.): påverkar **inte** produktion direkt — se arkiv `scripts-scaffolds-inventory.md`.
- **Scaffold-manifest**: `src/lib/gen/scaffolds/`.

## Kända fel och autofix

Autofix-steg (use client, imports, metadata, esbuild, …): arkiv `known-issues-and-fixes.md` + kod `src/lib/gen/autofix/`.

## v0 — soft deprecation

- Own-engine är **enda** codegen-streamen.
- `V0_FALLBACK_BUILDER` styr bara **preview-preferens** för v0-hostad `demoUrl`.
- API under `src/app/api/v0/` används fortfarande för mall/CRUD — se arkiv `v0-soft-deprecation.md`.

## Vercel Templates / Playwright / scorefolds

- Discovery pipeline, Playwright-spec, koppling till scaffold-kandidater: arkiv `vercel-templates-discovery.md`, `vercel-templates-playwright-scaffold-integration.txt`, `scraped-scorefolds-pipeline.md`.

## Inspector / Playwright worker

Lokal capture: arkiv `inspector-worker-quickstart.md`.

## Övrigt

- **Config dashboard (Streamlit)** vs `docs/`: arkiv `config-dashboard-sources.md`.
- **D-ID / avatar test route**: arkiv `did-avatar-test-route.md`.
- **Orchestrator i Cursor**: borttaget — kort notis i arkiv `orchestrator-run-protocol.md`; äldre planhistorik i git under `docs/plans/avklarat/` (se [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).
