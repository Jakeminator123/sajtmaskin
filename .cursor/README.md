# Cursor-konfiguration i detta repo

## Agent: var börja?

Se [`docs/README.md`](../docs/README.md) — enda fulla navtabellen. Snabb ordning: `docs/README.md` → `docs/architecture/repo-tree.md` → `docs/plans/README.md` → `rules/terminology.mdc`.

## Workspace (en rot, samma verktygsinställningar)

- Öppna projektet med **`sajtmaskin.code-workspace`** i repots rot (en mapp: `.`), eller öppna själva **`sajtmaskin`**-mappen. Workspace-filen är **gitignorerad** (lokala inställningar). Om repot har en mall **`sajtmaskin.code-workspace.example`**, kopiera den till **`sajtmaskin.code-workspace`**; annars räcker det att öppna mappen eller skapa en enkel workspace-fil som pekar på **``.`**. Lägg inte till globala Cursor-sökvägar (t.ex. `%USERPROFILE%\.cursor\plans`, worktrees) som extra workspace-mappar om du vill undvika brus i Problems (markdownlint, sökning, m.m.).
- **Standard nu:** öppna huvudcheckouten `…\sajtmaskin` på `master` i ett eget fönster. Om du **medvetet** skapar ett separat worktree för isolering, öppna bara den checkouten i sitt eget fönster och ta bort worktreet när det inte längre bär unikt arbete.
- **VS Code / Cursor-delade** inställningar: **`.vscode/settings.json`**. **`sajtmaskin.code-workspace`** innehåller samma `settings`-block så att beteendet matchar oavsett om du öppnar mappen eller workspace-filen.
- **Endast Cursor**: **`.cursor/settings.json`** (t.ex. Vercel-plugin). Den ersätter inte `.vscode` för vanliga tillägg; håll verktygsignorer synkade mellan **`.vscode/settings.json`** och **`sajtmaskin.code-workspace`**.
- Markdown-projektkonfiguration: **`.markdownlint.json`**, **`.markdownlintignore`**. Filer *utanför* repot kräver i regel **User Settings** (`markdownlint.ignore`) eller att de inte ingår i workspace.

## Projektregler (`.cursor/rules/*.mdc`)

| Regel | Syfte (kort) |
|--------|----------------|
| [terminology.mdc](rules/terminology.mdc) | Snabb förväxlingstabell; pekar till glossaryn |
| [session-git-docs.mdc](rules/session-git-docs.mdc) | Git-hygien, parallellt arbete, docs/plans-livscykel |
| [repo-env-indexing.mdc](rules/repo-env-indexing.mdc) | Workspace, `.env*`, cursorignored paths |
| [llm-pipeline-docs-sync.mdc](rules/llm-pipeline-docs-sync.mdc) | Synka kod ↔ docs vid LLM-pipeline-ändringar |
| [platform-quirks.mdc](rules/platform-quirks.mdc) | PowerShell, Sandbox, Playwright, streams, git-commit |

I chat: bifoga en regel med `@` + sökväg, t.ex. `@.cursor/rules/terminology.mdc`.

## Terminologi

**Kanonisk ordlista:** [`docs/architecture/glossary.md`](../docs/architecture/glossary.md) — alla ~100 begrepp med livscykelstatus, namnskuggor, fasindelning.

**Snabb förväxlingstabell:** [rules/terminology.mdc](rules/terminology.mdc) — kort version med de vanligaste felen.

I chat: `@terminology` eller `@.cursor/rules/terminology.mdc`.

## Slash-kommandon (`.cursor/commands/*.md`)

- `/avslutning` = städning inom scope, docs-/schema-/dashboard-sync, verifiering och därefter commit + push.
- `/slut` = stäng ett helt arbetsspår: review-fixar, konsolidera kördokument, slutöversikt, verifiera och ship:a.

## Flera agenter / parallellt arbete

- Jobba i huvudcheckouten på `master` med en git-root per fönster.
- Separera commits: docs, tooling och kod i egna commits.
- Verifiera före push: `npm run typecheck` + `npx vitest run`.
- **Konfliktzoner** (stäm av om två spår rör dessa samtidigt): `src/lib/gen/*`, `src/lib/providers/own-engine/*`, `src/lib/hooks/chat/*`, `src/lib/env.ts`, `src/lib/config.ts`, kanoniska arkitekturdocs.

## MCP (`mcp.json`)

Valfria **plattforms-MCP** (v0, Vercel, OpenAI-docs; ev. `openclaw-docs` på användarnivå). **Hur Sajtmaskin fungerar** läses i **`docs/`**, `.cursor/rules/` och `sajtmaskin-context`-skillen.

**GitHub:** `.cursor/mcp.json` är **ignorerad**; kopiera `.cursor/mcp.json.example` → `.cursor/mcp.json`.
