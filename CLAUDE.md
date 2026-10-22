@AGENTS.md

# Claude Code

Samma arbetsregler som Cursor och Codex. `.claude/rules/`, `permissions.allow`
/`deny` och `.mcp.json` är projektion av Cursor-filerna: redigera källan och kör
`npm run claude:sync`. Lager och skäl: [.claude/README.md](.claude/README.md).

## Skal (testat 2026-10-22)

- PowerShell-verktyget är pwsh 7 (UTF-8, `&&` fungerar); Bash-verktyget är Git Bash.
- Commit: skriv meddelandet till fil och kör `git commit -F <fil>`. Heredoc eller
  `$(...)` i skrivande git nekas av repots grindar via `.claude/hooks/shell-guard.mjs`.
- `[chatId]`-sökvägar: `-LiteralPath` i PowerShell, `[[]chatId[]]` i Glob; Read
  och Grep tar exakt sökväg.
- JSON/citattecken till `node -e` från PowerShell går sönder: skriv ett skript
  eller kör i Bash.
- Node-kod som startar npm/npx på Windows: `shell: process.platform === "win32"`;
  git förblir shell-fritt.

## Claude-specifikt

- Worktree: aldrig `EnterWorktree` eller agentisolering `worktree` (hamnar i repot,
  junction-fälla). Följ `agent-worktree.mdc`.
- Skills: `.agents/skills/<namn>/SKILL.md`. `/automat`, `/logg` m.fl. = läs
  `.cursor/commands/<namn>.md`.
- Bug-koll utan ChatGPT-flik: oberoende readonly-subagent mot exakt head
  (`pr-merge.mdc` punkt 4).
- Modellnivåer i `subagent-models.mdc`: sol → Opus, terra → Sonnet, luna → Haiku.
- MCP-servrarna kräver OAuth via `/mcp`. Supabase är read-only; svara aldrig på en
  prod-fråga från `supabase` (DEV).
