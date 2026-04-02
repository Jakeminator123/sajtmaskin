# Repository, terminologi och plattformsintegrationer

**Senast uppdaterad:** 2026-03-27

## Terminologi (mappar och lager)

**Kanonisk ordlista:** [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc) (v0-templates vs Vercel-mall, buildern, fidelity, own-engine, m.m.). **Mappar och research-flöde** — tabellen nedan; duplicera inte hela ordlistan här.

## Dokumentationslivscykel

| Status | Mapp |
|--------|------|
| `active` | `docs/plans/active/` |
| `avklarat` | `docs/plans/avklarat/` |

Osäkra utkast kan ligga som egna filer under `active/` tills de flyttas till `avklarat/` (ingen separat review-mapp).

`docs/architecture/` = **kanoniska översikter** (det här dokumentet + syskonfiler). Tillfälliga utkast ska inte lägga sig som parallella sanningar — se [`documentation-lifecycle.md`](./documentation-lifecycle.md).

## Repo-hygien

- **Git** bestämmer vad som följer med clone/PR; stora lokala kataloger (`logs/`, `data/`) är ofta ignorerade.
- **`.cursorignore`** styr indexering i Cursor — inte samma som git.
Detalj: [`.cursor/rules/repo-env-indexing.mdc`](../../.cursor/rules/repo-env-indexing.mdc) (ignore-filer, workspace).

## Skript och scaffolds

- **NPM**-skript: se rot `package.json` och [`scripts/README.md`](../../scripts/README.md).
- **Hjälpverktyg utanför runtime** (doc-browser, m.m.): [`tools/README.md`](../../tools/README.md).
- **Research-skript** (`scripts/template-library/hamta_sidor_branch_emil.py`, `scripts/manual/vercel_template_cli.py`, m.m.): påverkar **inte** produktion direkt — se [`scripts/README.md`](../../scripts/README.md).
- **Env-verktyg** (`scripts/env/manage_env.py`, `scripts/env/model_trace_overlay.py`): kanoniska entrypoints.
- **Scaffold-manifest**: `src/lib/gen/scaffolds/`.

## Kända fel och autofix

Autofix-steg (use client, imports, metadata, esbuild, …): kod `src/lib/gen/autofix/`.

## v0 — tre kvarvarande betydelser

Own-engine är **enda** codegen-väg. `v0-sdk`, `src/lib/v0/` och `V0_API_KEY` är borttagna. Kvarvarande `v0` i repot faller i tre kategorier (detaljer: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc)):

1. **API-versionering** — `/api/v0/...` är Sajtmaskins HTTP-API v0, inte leverantören V0.
2. **Naming debt** — symboler som `v0ChatId`, `v0EnrichmentContext`, `v0Stream.ts` m.fl. kvarstår historiskt; interna namn rensas löpande, payload-/DB-nycklar bryts inte utan migrationsplan.
3. **Template-källa** — mallgalleriet läser genererad katalog i `src/lib/templates/`; `scripts/template-library/sync-v0-templates.mjs` föredrar lokala `templates_v0/out`-manifest och faller annars tillbaka till v0.app-discovery.

## Vercel Templates / Playwright / scorefolds

- Discovery pipeline, Playwright-spec, koppling till scaffold-kandidater: [`e2e/README.md`](../../e2e/README.md), [`research/external-templates/README.md`](../../research/external-templates/README.md), [`scripts/README.md`](../../scripts/README.md).

## Inspector / Playwright worker

Lokal capture: `services/inspector-worker/`, `npm run inspector:*` (se rot `package.json`).

## Övrigt

- **Config dashboard (Streamlit)** vs `docs/`: `config/dashboard/` (se `config/dashboard/domain-map.json`).
- **D-ID / avatar**: `src/app/api/avatar` (rutter enligt produkt).
- **Orchestrator i Cursor**: borttaget; äldre planhistorik i git under `docs/plans/avklarat/` (se [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).
