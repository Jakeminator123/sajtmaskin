# Repo-träd — snabb orientering

**Syfte:** Var ligger vad i **rot** och några viktiga undermappar — för agenter och människor som ska navigera utan att läsa hela [repository-and-platform.md](./repository-and-platform.md). Detta är **orientering**, inte policy; se [documentation-lifecycle.md](./documentation-lifecycle.md) för doc-regler.

## Rotmappar (en rad vardera)

| Mapp | Roll |
|------|------|
| `src/` | Next.js App Router, API-routes, UI, domänlogik. Egen motor: `src/lib/gen/`. |
| `config/` | Kanonisk konfiguration (promptfragment, `ai_models`, `env-policy`, m.m.) — [`config/README.md`](../../config/README.md). |
| `config/dashboard/` | Valfri **Streamlit**-GUI (`app.py`) för att redigera/överblicka samma material — **importeras inte** av Next.js. Karta: [`config/dashboard/domain-map.json`](../../config/dashboard/domain-map.json). |
| `docs/` | Mänsklig dokumentation; ingång [`docs/README.md`](../README.md). |
| `research/` | Icke-runtime: mall-discovery, dossiers, rådata. [`research/README.md`](../../research/README.md). |
| `data/` | Lokal **persistent lagring** för appen (default `DATA_DIR` / uploads / ev. sqlite). Se [`docs/ENV.md`](../ENV.md). Ofta gitignorerad innehållsmässigt. |
| `logs/` | Lokal loggutdata (oftast tom i git, ignorerad). |
| `e2e/` | Playwright m.m. — [`e2e/README.md`](../../e2e/README.md). |
| `scripts/` | Node/Python-hjälp — [`scripts/README.md`](../../scripts/README.md). |
| `tools/` | Verktyg utanför runtime (t.ex. doc-browser) — [`tools/README.md`](../../tools/README.md). |
| `infra/` | OpenClaw m.m. — [`infra/README.md`](../../infra/README.md). |
| `services/` | Hjälpprocesser (t.ex. inspector worker). |
| `tests/` | Tester utanför `src/` där så är upplagt. |
| `.cursor/` | Cursor-regler, skills, README — [`.cursor/README.md`](../../.cursor/README.md). |

**Rotfiler (kort):** [`AGENTS.md`](../../AGENTS.md) (agentpekare) · [`ARBETSANTECKNINGAR.txt`](../../ARBETSANTECKNINGAR.txt) (arkiv/minneslista, ej backlog).

## Två olika “data” (förväxla inte)

| Plats | Vad det är |
|-------|------------|
| **`data/`** (repo-rot) | Appens filsystem: uploads, databaser, prompt-dumps — styrs av `DATA_DIR` / [`docs/ENV.md`](../ENV.md). |
| **`src/lib/gen/data/`** | **Genererad** KB-/stöddata för codegen (TS, ev. stor JSON) — inte samma som rot-`data/`. Se [`src/lib/gen/data/README.md`](../../src/lib/gen/data/README.md). |

## Mer djup

- **Mappar, pipelines, integrationer:** [repository-and-platform.md](./repository-and-platform.md)
- **Config-detaljer per vy:** [`config/dashboard/domain-map.json`](../../config/dashboard/domain-map.json)
- **Arbetsflöden (agenter):** [`docs/contributing/agent-workflows.md`](../contributing/agent-workflows.md)
