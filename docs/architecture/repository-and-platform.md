# Repository, terminologi och plattformsintegrationer

**Senast uppdaterad:** 2026-04-08

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
Detalj: [`.cursor/rules/repo-router.mdc`](../../.cursor/rules/repo-router.mdc) (ignore-filer, workspace).

## Skript och scaffolds

- **NPM**-skript: se rot `package.json` och [`scripts/README.md`](../../scripts/README.md).
- Äldre helperreferenser under `tools/` (t.ex. `doc-browser`) är historiska; nuvarande repo har ingen aktiv `tools/`-mapp i trädet.
- **Research-skript** (`scripts/template-library/hamta_sidor_branch_emil.py`, `scripts/template-library/full_template_refresh.py`, m.m.): påverkar **inte** produktion direkt — se [`scripts/README.md`](../../scripts/README.md).
- **Env-verktyg** (`scripts/env/manage_env.py`, `scripts/env/model_trace_overlay.py`): kanoniska entrypoints.
- **Scaffold-manifest**: `src/lib/gen/scaffolds/`.
- **Prompt-dump-status** delas via `backoffice/shared.py`.

### Tre separata mallspår

1. **`v0-mallar` / builderns Mallar-tab**
   - källa: `templates_v0/*`
   - genererade runtimefiler: `src/lib/templates/*`
   - används i builderns mallkatalog och mallsök
   - embeddings: `src/lib/templates/template-embeddings.json`

2. **Vercel-mallar / externa referenser**
   - dossier-system v2: `data/dossiers/{hard,soft}/<id>/` (committed manifests + instructions + components) och `data/dossiers/_index/capability-map.json`
   - input till AI-kuration: `data/template-references/{repos,_metadata}/` (gitignored, klonade Vercel-template-repos)
   - embeddings: `src/lib/gen/template-library/template-library-embeddings.json`

3. **Scaffolds**
   - källa: interna `manifest.ts`-filer under `src/lib/gen/scaffolds/*`
   - används direkt av own-engine som runtime-startpunkter för codegen
   - embeddings: `src/lib/gen/scaffolds/scaffold-embeddings.json`

## Kända fel och autofix

Autofix-steg (use client, imports, metadata, esbuild, …): kod `src/lib/gen/autofix/`.

## v0 — tre kvarvarande betydelser

Own-engine är **enda** codegen-väg. `v0-sdk`, `src/lib/v0/` och `V0_API_KEY` är borttagna. Kvarvarande `v0` i repot faller i tre kategorier (detaljer: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc)):

1. **API-versionering** — `/api/v0/...` är Sajtmaskins HTTP-API v0, inte leverantören V0.
2. **Naming debt** — symboler som `v0ChatId`, `v0EnrichmentContext`, `v0Stream.ts` m.fl. kvarstår historiskt; interna namn rensas löpande, payload-/DB-nycklar bryts inte utan migrationsplan.
3. **Template-källa** — builderns `v0-mallar` läser genererad katalog i `src/lib/templates/`; `scripts/v0-templates/sync-v0-templates.mjs` läser enbart lokala `templates_v0/out`-manifest (ingen online-hämtning). `templates_v0/` innehåller lokalt nedladdade ZIP-arkiv, bilder och metadata för alla mallar. När en lokal ZIP finns i `templates_v0/downloads/` initierar builderns mallflöde own-engine direkt från repo-filerna i arkivet; detta är separat från Vercel-mallar / externa referenser.

## Vercel Templates / extern intake (legacy — borttagen)

- Den gamla Vercel-mall-discovery-pipen (npm-scripten `references:discover*` / `template-library:*` / `dossiers:enrich` + Playwright-specs under `e2e/vercel-templates/`) togs bort 2026-04-17; referens-specsen, som låg kvar utan CI som manuell referens, raderades 2026-06-22. Git-historiken har receptet. Bakgrund: [`scripts/README.md`](../../scripts/README.md), [`e2e/README.md`](../../e2e/README.md), [`../schemas/external-template-pipeline-contract.md`](../schemas/external-template-pipeline-contract.md).
- `data/dossiers/{hard,soft}/<id>/` är den kanoniska dossier-platsen (v2 sedan 2026-04-20). Runtime own-engine läser manifests direkt och matchar `brief.requestedCapabilities` 1:1 mot dossiers via `selectDossiersForRequest()` i `orchestrate.ts` → `## Available Dossiers` + `## Selected Dossier Instructions` + `## Dossier Files To Emit Verbatim` i system prompt. **Inga embeddings, ingen domain-veto, inga cap.** Tre exempel ligger i poolen; resten av den auto-curated v1-poolen ligger i `archive/dossiers-legacy-2026-04-20/` (gitignored). Se [dossier-system.md](./dossier-system.md).

## Inspector / Playwright worker

Lokal capture: `services/inspector-worker/`, `npm run inspector:*` (se rot `package.json`).

## Övrigt

- **Konsoliderad backoffice (Streamlit)**: kanonisk start är `npm run backoffice` (kör `scripts/dev/run-python.mjs` → `python sajtmaskin_backoffice.py`, plattformsoberoende). Direktanrop `python(3) sajtmaskin_backoffice.py` fungerar också. Entrypointen relauncherar via `streamlit run`. Kod och sidmoduler ligger under `backoffice/` och täcker både konfigurationspanel, overhead/admin och artifacts/pipeline.
- **Delad dashboardlogik**: `backoffice/shared.py` är den kanoniska helperkällan för prompt-dumps, manifest, autofix-/quality-inställningar, repo-paths och scaffold-/pipelinehelpers.
- **Dashboardkarta**: `config/dashboard/domain-map.json` beskriver vilka kanoniska paths, docs och codeReaders varje vy hör till (mappnamnet `dashboard/` är legacy; bara domänkartan bor kvar där).
- **Cursor slash-kommandon**: repo-lokala kommandon kan ligga i `.cursor/commands/` och användas via `/...` i Cursor-chatten, t.ex. `/avslutning` för slutstädning/sync/verify/ship.
- **OpenClaw / Sajtagenten**: användarytan nere till höger lever i `src/components/openclaw/` och `src/app/api/openclaw/`. Det är en separat assistent-/agentyta, inte builderns own-engine.
- **D-ID / avatar**: isolerad pilotyta under `src/app/avatar/`, med bridge-rutter i `src/app/api/did/` och komponenter i `src/components/avatar/`. `D-ID` är medvetet avskilt från den vanliga widgeten tills ett separat beslut tas om bredare inbäddning.
- **Orchestrator i Cursor**: borttaget; äldre planhistorik i git under `docs/plans/avklarat/` (se [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).
