# Repo-träd — snabb orientering

**Syfte:** Var ligger vad i **rot** och några viktiga undermappar — för agenter och människor som ska navigera utan att läsa hela [repository-and-platform.md](./repository-and-platform.md). Detta är **orientering**, inte policy; se [documentation-lifecycle.md](./documentation-lifecycle.md) för doc-regler.

## Rotmappar (en rad vardera)

| Mapp | Roll |
|------|------|
| `src/` | Next.js App Router, API-routes, UI, domänlogik. Egen motor: `src/lib/gen/`. |
| `config/` | Kanonisk konfiguration (promptfragment, `ai_models`, `env-policy`, m.m.) — [`config/README.md`](../../config/README.md). |
| `config/dashboard/` | Valfri **Streamlit**-GUI (`app.py`) för att redigera/överblicka samma material — **importeras inte** av Next.js. Detta är konfigurations-/översiktspanelen. Karta: [`config/dashboard/domain-map.json`](../../config/dashboard/domain-map.json). |
| `docs/` | Mänsklig dokumentation; ingång [`docs/README.md`](../README.md). Kanonisk arkitektur i `docs/architecture/`, backlog i `docs/plans/active/`. |
| `research/` | Icke-runtime: äldre research/experiment och eventuella kvarvarande lokala arkiv. Den kanoniska external-template-pipelinen ligger inte här längre. |
| `data/` | Lokal **persistent lagring** för appen (default `DATA_DIR` / uploads / ev. sqlite) plus kanonisk dossier-pipeline under `data/dossiers/` (committed manifests + gitignored `_raw/`, `_index/`, `_repo-cache/`). Se [`docs/ENV.md`](../ENV.md). |
| `logs/` | Lokal loggutdata (oftast tom i git, ignorerad). `logs/generationslogg/` behaller de 3 senaste korningarna; `summary.md` kan valfritt unignoras i `.cursorignore` for agentlasning utan att indexera hela loggtradet. |
| `e2e/` | Playwright m.m. — [`e2e/README.md`](../../e2e/README.md). |
| `scripts/` | Node/Python-hjälp — [`scripts/README.md`](../../scripts/README.md). Den konsoliderade backoffice-appen startas från repo-roten via `npm run backoffice` (`python sajtmaskin_backoffice.py`). Undermappar: `db/`, `dev/`, `embeddings/`, `template-library/`, `v0-templates/`, `scaffolds/`, `eval/`, `deps/`, `audit/`, `env/`. |
| `archive/` | Icke-aktiva labb m.m. — [`archive/README.md`](../../archive/README.md) (t.ex. tidigare `scripts/labs/testning_scarf/`). |
| `infra/` | OpenClaw m.m. — [`infra/README.md`](../../infra/README.md). |
| `services/` | Hjälpprocesser (t.ex. inspector worker). |
| `tests/` | Tester utanför `src/` där så är upplagt. |
| `isolated_tests/` | Vitest-integrationstester som kräver isolation från `src/`-trädets tsconfig. |
| `templates_v0/` | Lokalt nedladdade v0-mallar: Python-skript, ZIP-arkiv, bilder och metadata — [`templates_v0/README.txt`](../../templates_v0/README.txt). Data (out/, downloads/) är gitignorerat. |
| `.cursor/` | Cursor-regler, skills, repo-lokala slash-kommandon och README — [`.cursor/README.md`](../../.cursor/README.md). |

**Rotfiler (kort):** [`AGENTS.md`](../../AGENTS.md) (agentpekare) · [`ARBETSANTECKNINGAR.txt`](../../ARBETSANTECKNINGAR.txt) (arkiv/minneslista, ej backlog). Kanoniska env-skript ligger under `scripts/env/`.

## `.cursorignore` (varför vissa sökvägar “saknas” i index)

Cursor indexerar inte allt under repo-rot. **Byt normalt inte ut ignore-listan** bara för att en agent ska “se” innehåll — särskilt inte `.env*`, byggartefakter eller stora dumps. För orientering: denna fil + README i respektive mapp (`archive/`, `research/`, `data/`, m.fl.) beskriver *vad* som finns. Genererade men committade filer under t.ex. `src/lib/gen/` kan vara ignorerade i index men **aktiva** i bygget — verifiera med `package.json`-scripts och importer, inte med “syns i sök”.

`docs/plans/avklarat/` är **inte** uttryckligen ignorerad här (historik ska kunna indexeras i Cursor); motsvarande rad finns inte i `.gitignore` heller. `data/prompt-dumps/*` och `output/generations/` följer samma idé som `.gitignore` (dumps och generationslogg bort från index, undantag för README där det finns).

## Mentala repo-zoner (kod)

| Zon | Typiska sökvägar |
|-----|------------------|
| **Builder UI** | `src/app/builder/*`, `src/components/builder/*`, `src/components/ai-elements/*` (importer per fil, t.ex. `@/components/ai-elements/message` — ingen committad root-barrel) |
| **Preview runtime / livscykel** | `src/lib/builder/preview-session/*`, `src/components/builder/preview-panel/*`, `src/lib/gen/preview/*` (ingen barrel-`index`; shim-URL: `preview/legacy/compatibility-shim`, HTML för `/api/preview-render`: `preview/build-preview-document`) |
| **Generation engine** | `src/lib/gen/stream/*`, `src/lib/providers/own-engine/*`, `src/lib/own-engine/*` |
| **DB / versioner / diagnostik** | `src/lib/db/*` — Postgres via Drizzle; **DB CRUD** i `src/lib/db/services/<domän>.ts` (importera t.ex. `@/lib/db/services/projects`, inte en gemensam barrel). Även `preview-diagnostics`, `eval`. |
| **HTTP API** | `src/app/api/engine/chats/*` (chat-yta sedan P29 Fas 1B 2026-04-20), `src/app/api/v0/*` (kvarvarande Class C: deployments/projects/integrations), övriga `src/app/api/*` |

## Viktiga `src/lib/`-områden

| Plats | Roll |
|-------|------|
| `src/lib/own-engine/` + `src/lib/providers/own-engine/` | Den kanoniska **produktbanan** för egen motor: sessioner, streams, plan-mode, contract-gate och providerkopplingar. |
| `src/lib/gen/` | Delad **genereringskärna**: scaffold-matchning, orchestration, system prompts, autofix, finalize, merge, previewförberedelser. |
| `src/lib/mcp/` | Programmatisk **adapteryta** runt own-engine-resultat: köra generation utan builder-UI, bygga preview/VM-runtime, läsa filer/versioner för verktyg och lokala runtime-flöden. |
| `src/lib/shadcn/` | Shadcn/ui registry-logik samlad: URL-parser, cache, service, types, utils. Importera härifrån direkt (inga kvarvarande `shadcn-registry-*.ts` root-shims). |

## Två olika “data” (förväxla inte)

| Plats | Vad det är |
|-------|------------|
| **`data/`** (repo-rot) | Appens filsystem: uploads, databaser, prompt-dumps — styrs av `DATA_DIR` / [`docs/ENV.md`](../ENV.md). |
| **`src/lib/gen/data/`** | **Genererad** KB-/stöddata för codegen (TS, ev. stor JSON) — inte samma som rot-`data/`. Se [`src/lib/gen/data/README.md`](../../src/lib/gen/data/README.md). |

## Mer djup

- **Mappar, pipelines, integrationer:** [repository-and-platform.md](./repository-and-platform.md)
- **Config-detaljer per vy:** [`config/dashboard/domain-map.json`](../../config/dashboard/domain-map.json)
- **Arbetsflöden (agenter):** [`.cursor/README.md`](../../.cursor/README.md) § Flera agenter
