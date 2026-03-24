# Cursor-konfiguration i detta repo

## Terminologidokument (produkt- och kodnamn)

**Fil:** [rules/terminology.mdc](rules/terminology.mdc)

**Så hittar du den i Cursor:**

1. **Projektfilträdet:** öppna `.cursor/rules/terminology.mdc`.
2. **Cursor Settings → Rules / Project rules:** regeln laddas som `alwaysApply` (beskrivning: *Product terminology and concepts*).
3. I chat kan du skriva **`@terminology`** eller **`@.cursor/rules/terminology.mdc`** för att bifoga filen.

För **mappar, Vercel-mall/research och v0-templates vs scaffold** (inte hela produktordlistan), se
`docs/architecture/structure-and-terminology.md` och `docs/README.md` § Terminology.

## MCP-servrar (`mcp.json`)

| Server | Typ | Syfte |
|--------|-----|--------|
| `v0`, `Vercel`, `openaiDeveloperDocs` | Remote (URL) | Plattforms-API resp. officiell OpenAI-docs. |
| **`sajtmaskin-engine`** | Lokal stdio | Own engine **utan** att gå via Next.js HTTP: generera sajt, läsa manifest/filer, skapa preview/sandbox-runtime. Start: `npx tsx tools/mcp/engine-server.ts`. |
| **`sajtmaskin-scaffolds`** | Lokal stdio | De **interna runtime-scaffolds** (~10 st): lista, detaljer, filinnehåll, sök taggar, jämför två scaffolds. Start: `npx tsx tools/mcp/scaffold-server.ts`. |

Mer routingregler för agenter: `rules/MCP-Servers.mdc` och `rules/mcp-docs-routing.mdc`.

**OBS:** **v0-templates** (`src/lib/templates/`) är *inte* samma sak som **runtime scaffolds** — se terminologidokumentet (inkl. särskiljning *inbäddningar* vs *semantik*).
