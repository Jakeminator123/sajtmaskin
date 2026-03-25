# Cursor-konfiguration i detta repo

## Workspace (en rot, samma verktygsinställningar)

- Öppna projektet med **`sajtmaskin.code-workspace`** i repots rot (en mapp: `.`), eller öppna själva **`sajtmaskin`**-mappen. Filen är **gitignorerad** (lokala inställningar); efter klon: kopiera **`sajtmaskin.code-workspace.example`** → **`sajtmaskin.code-workspace`**. Lägg inte till globala Cursor-sökvägar (t.ex. `%USERPROFILE%\.cursor\plans`, worktrees) som extra workspace-mappar om du vill undvika brus i Problems (markdownlint, sökning, m.m.).
- **VS Code / Cursor-delade** inställningar: **`.vscode/settings.json`**. **`sajtmaskin.code-workspace`** innehåller samma `settings`-block så att beteendet matchar oavsett om du öppnar mappen eller workspace-filen.
- **Endast Cursor**: **`.cursor/settings.json`** (t.ex. Vercel-plugin). Den ersätter inte `.vscode` för vanliga tillägg; håll verktygsignorer synkade mellan **`.vscode/settings.json`** och **`sajtmaskin.code-workspace`**.
- Markdown-projektkonfiguration: **`.markdownlint.json`**, **`.markdownlintignore`**. Filer *utanför* repot kräver i regel **User Settings** (`markdownlint.ignore`) eller att de inte ingår i workspace.

Agentregel (always-on): [rules/workspace-hygiene.mdc](rules/workspace-hygiene.mdc).

## Terminologidokument (produkt- och kodnamn)

**Fil:** [rules/terminology.mdc](rules/terminology.mdc)

**Så hittar du den i Cursor:**

1. **Projektfilträdet:** öppna `.cursor/rules/terminology.mdc`.
2. **Cursor Settings → Rules / Project rules:** regeln laddas som `alwaysApply` (beskrivning: *Product terminology and concepts*).
3. I chat kan du skriva **`@terminology`** eller **`@.cursor/rules/terminology.mdc`** för att bifoga filen.

För **mappar, Vercel-mall/research och v0-templates vs scaffold** (inte hela produktordlistan), se
`docs/architecture/structure-and-terminology.md` och `docs/README.md` § Terminology.

För **Djup brief vs orchestrator-run**, **runtime vs MCP** och **scaffold/dossier/artifact** i en sida: `docs/contributing/agent-workflows.md`.

## MCP-servrar (`mcp.json`)

**GitHub:** `.cursor/mcp.json` är **ignorerad** i git (kan få hemligheter vid URL-auth eller framtida fält). Kopiera mallen:

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
```

| Server | Typ | Syfte |
|--------|-----|--------|
| `v0`, `Vercel`, `openaiDeveloperDocs` | Remote (URL) | Plattforms-API resp. officiell OpenAI-docs. |
| **`sajtmaskin-engine`** | Lokal stdio | Own engine **utan** att gå via Next.js HTTP: generera sajt, läsa manifest/filer, skapa preview/sandbox-runtime. Start: `npx tsx tools/mcp/engine-server.ts`. |
| **`sajtmaskin-scaffolds`** | Lokal stdio | De **interna runtime-scaffolds** (~10 st): lista, detaljer, filinnehåll, sök taggar, jämför två scaffolds. Start: `npx tsx tools/mcp/scaffold-server.ts`. |

Mer routingregler för agenter: `rules/MCP-Servers.mdc` och `rules/mcp-docs-routing.mdc`.

**OBS:** **v0-templates** (`src/lib/templates/`) är *inte* samma sak som **runtime scaffolds** — se terminologidokumentet (inkl. särskiljning *inbäddningar* vs *semantik*).
