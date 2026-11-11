# Claude Code i detta repo

Claude Code ska bete sig som en Cursor-agent här. Cursor-filerna är källan;
Claude-lagret är en projektion som `npm run claude:sync` skriver och
`npm run check:agent-context` låser mot drift.

| Cursor (källa)                                  | Claude Code                                          | Hur                                                                               |
| ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `AGENTS.md`                                     | `CLAUDE.md` → `@AGENTS.md`                           | Finns `CLAUDE.md` läser Claude inte `AGENTS.md` självt; importen krävs.           |
| `.cursor/rules/*.mdc` alwaysApply               | `.claude/rules/<namn>.md` utan `paths`               | Laddas vid start.                                                                 |
| `.cursor/rules/*.mdc` med `globs`               | `.claude/rules/<namn>.md` med `paths`                | Laddas när Claude rör en matchande fil. `[param]` blir `*`.                       |
| `.cursor/rules/*.mdc` bara beskrivning          | `.claude/rules/cursor-regelindex.md`                 | Index; regeln läses vid behov som i Cursor.                                       |
| `.cursorignore`                                 | `permissions.deny` `Read(...)`                       | Blockerar Read/Edit/Grep och även `cat` i skalet.                                 |
| `.cursor/permissions.json` `terminalAllowlist`  | `permissions.allow` `Bash(...)`/`PowerShell(...)`    | Samma prefixsemantik (`prefix*`).                                                 |
| `.cursor/permissions.json` `mcpAllowlist`       | `permissions.allow` `mcp__...`                       |                                                                                   |
| `.cursor/permissions.json` `block_instructions` | `permissions.ask` (`CLAUDE_ASK_RULES`)               | Fråga bara för promote, `db:*` och agentkonfig (ägarbeslut 2026-11-11).           |
| `.cursor/mcp.json.example`                      | `.mcp.json`                                          | Samma servrar; OAuth via `/mcp`. `cmd`-wrappade skript startas med `node` direkt. |
| `.cursor/hooks.json` commit-/worktree-guard     | `hooks.PreToolUse` → `.claude/hooks/shell-guard.mjs` | Adapter på varje skalanrop; deny = exit 2.                                        |
| `.cursor/hooks.json` mcp-secret-read-guard      | `hooks.PreToolUse` → `.claude/hooks/read-guard.mjs`  | Adaptern läser filen själv; samma `decide`.                                       |

## Medvetet inte speglat

- `bash-och-pwsh.mdc`: testat mot Claudes verktyg 2026-10-22. PowerShell-verktyget
  är pwsh 7 (inte 5.1), `&&` och UTF-8 fungerar; det som kvarstod står i
  `CLAUDE.md` § Skal.
- `heredoc-guard`: Claudes Bash-verktyg är Git Bash där heredoc är giltigt;
  commit-guarden nekar ändå `$(...)` i skrivande git.
- MCP-servern `v0` (legacy) och Cursor-plugins (`.cursor/settings.json`).
  `.mcp.json` är spårad och får aldrig innehålla tokens.

## Handskrivet

`CLAUDE.md`, den här filen och `.claude/hooks/`. Hela `.claude/settings.json`
genereras; fråga-regler, `env` och hookkopplingen är konstanter i
`scripts/dev/sync-claude-config.mjs`, så en borttagen grind blir drift i CI.
Maskinlokala godkännanden hamnar i den gitignorerade `.claude/settings.local.json`.
