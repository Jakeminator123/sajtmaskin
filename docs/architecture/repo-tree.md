# Repo-träd — snabb orientering

**Syfte:** Var ligger vad i **rot** och några viktiga undermappar — för agenter och människor som ska navigera utan att läsa hela [repository-and-platform.md](./repository-and-platform.md). Detta är **orientering**, inte policy; se [documentation-lifecycle.md](./documentation-lifecycle.md) för doc-regler.

## Rotmappar (en rad vardera)

| Mapp | Roll |
|------|------|
| `src/` | Next.js App Router, API-routes, UI, domänlogik. Egen motor: `src/lib/gen/`. |
| `config/` | Kanonisk konfiguration (promptfragment, `ai_models`, `env-policy`, m.m.) — [`config/README.md`](../../config/README.md). |
| `config/dashboard/` | Stöddata för backoffice-appen — bara domänkartan [`config/dashboard/domain-map.json`](../../config/dashboard/domain-map.json) (mappnamnet `dashboard/` är legacy; **importeras inte** av Next.js). Streamlit-ytan startas med `npm run backoffice`. |
| `config/control-plane/` | Maskinläsbar **control-plane**: registries (`schema-registry.json` + `policy-registry.json`) som mappar var varje schema/policy/rule/runtime-authority bor, om den är runtime-wired och om den får flyttas. Valideras av `npm run control-plane:check`. Karta: [`docs/architecture/schema-policy-map.md`](./schema-policy-map.md). |
| `docs/` | Mänsklig dokumentation; ingång [`docs/README.md`](../README.md). Kanonisk arkitektur i `docs/architecture/`, backlog i `docs/plans/active/`. |
| `backoffice/` | Konsoliderad **backoffice** (Streamlit). Startas från repo-roten via `npm run backoffice` (`python sajtmaskin_backoffice.py`); sidkod i `backoffice/pages/`. |
| `preview-host/` | Preview-host: runtime, verify och workspace-livscykel för previews — [`preview-host/README.md`](../../preview-host/README.md). |
| `data/` | Lokal **persistent lagring** för appen (default `DATA_DIR` / uploads / ev. sqlite). Innehåller även dossier-systemet: `data/dossiers/{hard,soft}/<id>/` (committed manifests + instructions + components) samt `data/template-references/{repos,_metadata}/` (gitignored input till AI-kuration). Se [`dossier-system.md`](./dossier-system.md). |
| `logs/` | Lokal loggutdata (oftast tom i git, ignorerad). `logs/generationslogg/` behaller de 5 senaste korningarna; `summary.md` kan valfritt unignoras i `.cursorignore` for agentlasning utan att indexera hela loggtradet. |
| `e2e/` | Playwright m.m. — [`e2e/README.md`](../../e2e/README.md). |
| `drizzle/` | Genererade Drizzle DB-migrationsartefakter (`meta/`). Config: `drizzle.config.ts`. |
| `scripts/` | Node/Python-hjälp — [`scripts/README.md`](../../scripts/README.md). Den konsoliderade backoffice-appen startas från repo-roten via `npm run backoffice` (`python sajtmaskin_backoffice.py`). Undermappar: `db/`, `dev/`, `embeddings/`, `v0-templates/`, `scaffolds/`, `eval/`, `deps/`, `audit/`, `env/`, `domains/`, `dossiers/`, `observability/`, `plans/`, `shadcn/`, `typography/`, `canvas/`, `debug/`, `cursor/`. |
| `infra/` | OpenClaw m.m. — [`infra/README.md`](../../infra/README.md). |
| `services/` | Hjälpprocesser (t.ex. inspector worker). |
| `public/` | Next.js statiska assets (branding, bilder, ikoner, video). |
| `_parkering/` | Medveten **parkeringsyta** — ej indexerad/sökt, men får läsas direkt vid behov — [`_parkering/README.md`](../../_parkering/README.md). |
| `.cursor/` | Cursor-regler, skills, repo-lokala slash-kommandon och README — [`.cursor/README.md`](../../.cursor/README.md). |

**Rotfiler (kort):** [`AGENTS.md`](../../AGENTS.md) (agentpekare) · [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) (öppna P1/P2-buggsanning) · `sajtmaskin_backoffice.py` (backoffice-entry). Kanoniska env-skript ligger under `scripts/env/`.

## Kanonisk struktur (filträd + logik)

Ett ställe för "var ligger vad och varför". Filträd (rensat 2026-06-22):

```
repo/
├── src/                  Next.js App Router + API + UI; egen motor i src/lib/gen/, src/lib/own-engine/, src/lib/providers/own-engine/
├── config/               kanonisk config: ai_models/, prompt-core/, env-policy.json, scaffold-variants/, control-plane/ (schema+policy-registries), dashboard/domain-map.json (load-bearing; namnet legacy)
├── data/                 lokal lagring + dossiers/{hard,soft}/ (committad); runs/ + prompt-dumps/ + observability/ är gitignorade runtime-artefakter
├── docs/                 mänsklig dokumentation (träd nedan)
├── scripts/              Node/Python-hjälp (package.json = sanning för npm-namn; scripts/README.md = karta)
├── backoffice/           Streamlit-backoffice (npm run backoffice → sajtmaskin_backoffice.py)
├── preview-host/         preview-host runtime/verify/workspace-livscykel
├── services/             hjälpprocesser (inspector-worker, port 3310)
├── e2e/                  Playwright: deploy/ (aktiv, opt-in, skippas utan env) + vercel-templates/ (legacy referens, ej CI)
├── infra/                OpenClaw m.m.
├── drizzle/              genererade DB-migrationsartefakter
├── templates_v0/         builderns Mallar-tab (v0-mallar); out/ + downloads/ gitignorade
├── _parkering/           medveten parkeringsyta (ej indexerad, fortf. i git)
└── .cursor/              regler, skills, slash-kommandon

docs/
├── README.md             NAV — enda fulla navtabellen
├── architecture/         kanonisk systembeskrivning + glossary + repo-tree + db-cascade-graph + documentation-lifecycle (+ _archived/)
├── schemas/              människoläsbara kontrakt + strict/ (maskin-scheman; dossier/health/LLM-telemetri AJV-validerade i CI)
├── plans/
│   ├── active/           ENDA aktiva ytan = README.md (router). Ingen drivlinje just nu (stabilisering klar)
│   ├── archived/         vilande / parkerat / reverterat (kan återupptas)
│   └── avklarat/         klart/mergat (historik) — t.ex. grandmaster/, bug-swarm/
├── archive/              icke-plan-historik (status/)
├── operating/            driftdokument: cheatsheets + incidents/
├── contracts/            lätt kontraktsindex (schema/policy/regel/beslut)
├── handoffs/             daterade agent-handoffs (historik)
├── llm/ · evals/ · howto/ · external-pipelines/ · agent-reports/   ämnesdocs
└── old/                  pekare → git-historik
```

**Var ska nytt innehåll ligga? (beslutslogik)**

| Innehåll | Plats |
|---|---|
| Bug / öppen risk / observation | [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) — **enda buggsanningen** |
| Aktiv plan / spår-router | `docs/plans/active/README.md` (väv in; skapa inte filzoo) |
| Klar/mergad plan | `docs/plans/avklarat/` |
| Parkerad / reverterad plan | `docs/plans/archived/` |
| Kanonisk arkitektur / diagram | `docs/architecture/` |
| Maskinläsbart kontrakt | `docs/schemas/strict/` (backa med kod + ev. AJV-test) |
| Incidentrapport / postmortem | `docs/operating/incidents/` |
| Status-ögonblicksbild | `docs/archive/status/` |
| Runtime-kod (motor) | `src/lib/gen/`, `src/lib/own-engine/`, `src/lib/providers/own-engine/` |
| npm-script | `package.json` (sanning) + entry under `scripts/<domän>/` |
| Term / begrepp | `docs/architecture/glossary.md` (registrera; duplicera inte) |

**Princip:** kod är source of truth; docs speglar. En sanning, ett ställe — länka, duplicera inte. `archived` ≠ `avklarat` (parkerat vs klart). Genererade CI-artefakter (`docs/canvases/`) är **inte** arkiv.

## `.cursorignore` (varför vissa sökvägar “saknas” i index)

Cursor indexerar inte allt under repo-rot. **Byt normalt inte ut ignore-listan** bara för att en agent ska “se” innehåll — särskilt inte `.env*`, byggartefakter eller stora dumps. För orientering: denna fil + README i respektive mapp (`_parkering/`, `infra/`, `e2e/`, m.fl.) beskriver *vad* som finns. Genererade men committade filer under t.ex. `src/lib/gen/` kan vara ignorerade i index men **aktiva** i bygget — verifiera med `package.json`-scripts och importer, inte med “syns i sök”.

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
