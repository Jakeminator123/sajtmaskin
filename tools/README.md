# `tools/` — hjälpverktyg (ej app-runtime)

| Sökväg | Syfte |
|--------|--------|
| [`doc-browser/`](./doc-browser/) | Lokala Python-skript mot v0/Vercel-dokumentation (`ask_v0.py`, `ask_vercel.py`) — **valfritt** för utvecklare; produktion använder inte detta. |
| (repo) [`scripts/env/manage_env.py`](../scripts/env/manage_env.py) | Kanonisk env-CLI (audit/sync); se [`docs/ENV.md`](../docs/ENV.md). |

**Borttaget:** tidigare **`tools/mcp/`** (lokala MCP-servrar för egen motor/scaffold). Använd **plattforms-MCP** enligt `.cursor/mcp.json.example` och läs kod under `src/lib/mcp/*`, `src/lib/gen/scaffolds/` samt projektets egna regler och docs för hur repo-flödena fungerar.
