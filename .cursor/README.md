# Cursor-konfiguration i detta repo

## Workspace (en rot, samma verktygsinställningar)

- Öppna projektet med **`sajtmaskin.code-workspace`** i repots rot (en mapp: `.`), eller öppna själva **`sajtmaskin`**-mappen. Workspace-filen är **gitignorerad** (lokala inställningar). Om repot har en mall **`sajtmaskin.code-workspace.example`**, kopiera den till **`sajtmaskin.code-workspace`**; annars räcker det att öppna mappen eller skapa en enkel workspace-fil som pekar på **``.`**. Lägg inte till globala Cursor-sökvägar (t.ex. `%USERPROFILE%\.cursor\plans`, worktrees) som extra workspace-mappar om du vill undvika brus i Problems (markdownlint, sökning, m.m.).
- **VS Code / Cursor-delade** inställningar: **`.vscode/settings.json`**. **`sajtmaskin.code-workspace`** innehåller samma `settings`-block så att beteendet matchar oavsett om du öppnar mappen eller workspace-filen.
- **Endast Cursor**: **`.cursor/settings.json`** (t.ex. Vercel-plugin). Den ersätter inte `.vscode` för vanliga tillägg; håll verktygsignorer synkade mellan **`.vscode/settings.json`** och **`sajtmaskin.code-workspace`**.
- Markdown-projektkonfiguration: **`.markdownlint.json`**, **`.markdownlintignore`**. Filer *utanför* repot kräver i regel **User Settings** (`markdownlint.ignore`) eller att de inte ingår i workspace.

## Always-on projektregler (`.cursor/rules/*.mdc`)

Alla nedan har `alwaysApply: true` och laddas i **Cursor → Settings → Rules / Project rules**. I chat: bifoga en regel med `@` + sökväg, t.ex. `@.cursor/rules/terminology.mdc`.

| Regel | Syfte (kort) |
|--------|----------------|
| [terminology.mdc](rules/terminology.mdc) | Stack, lager, kod vs UI, scaffold/v0-templates, lanes |
| [session-git-docs.mdc](rules/session-git-docs.mdc) | `/sluta`, intent board, push, parallellt arbete, docs/plans-livscykel |
| [tooling-routing.mdc](rules/tooling-routing.mdc) | MCP-tabell + skills (sajtmaskin-context, react best practices) |
| [repo-env-indexing.mdc](rules/repo-env-indexing.mdc) | Workspace, `.env*`, cursorignored paths |
| [platform-quirks.mdc](rules/platform-quirks.mdc) | PowerShell, Sandbox, Playwright, streams, git-commit |

## Terminologidokument (produkt- och kodnamn)

**Fil:** [rules/terminology.mdc](rules/terminology.mdc)

**Så hittar du den i Cursor:**

1. **Projektfilträdet:** öppna `.cursor/rules/terminology.mdc`.
2. **Cursor Settings → Rules / Project rules:** regeln laddas som `alwaysApply` (beskrivning: *Product terminology and concepts*).
3. I chat kan du skriva **`@terminology`** eller **`@.cursor/rules/terminology.mdc`** för att bifoga filen.

För **mappar, Vercel-mall/research och v0-templates vs scaffold** (inte hela produktordlistan), se
`docs/architecture/repository-and-platform.md` (och vid behov arkiv `docs/architecture/archive/pre-2026-03-consolidation/structure-and-terminology.md`) samt `docs/README.md` § Terminology.

**Aktiv backlog / K-rader / Plan 17:** `docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`.

För **Djup brief vs större arbets­paket**, **runtime vs MCP** och **scaffold/dossier/artifact** i en sida: `docs/contributing/agent-workflows.md`.

## MCP (`mcp.json`)

Valfria **plattforms-MCP** (v0, Vercel, OpenAI-docs; ev. `openclaw-docs` på användarnivå). **Hur Sajtmaskin fungerar** läses i **`docs/`** och `.cursor/rules/` — se `rules/tooling-routing.mdc` för tabell.

**GitHub:** `.cursor/mcp.json` är **ignorerad**; kopiera `.cursor/mcp.json.example` → `.cursor/mcp.json`.

**OBS:** **v0-templates** (`src/lib/templates/`) är *inte* samma som **runtime scaffolds** — se `terminology.mdc`.
