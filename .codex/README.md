# Codex i Sajtmaskin

Den här katalogen är projektets Codex-lager. Cursor-reglerna ligger kvar i
`.cursor/`, medan Codex automatiskt läser `AGENTS.md` från repo-roten och den
här `.codex/config.toml` när projektet är trusted.

## Så här ska projektet öppnas

- Primary folder i Codex ska vara `C:\Users\jakem\dev\projects\sajtmaskin`.
- Starta nya Codex-chattar från projektet, inte från en genererad
  `Documents\Codex\...`-mapp.
- För parallellt arbete: använd Codex Worktree eller explicit `git worktree`,
  samma princip som Cursor-regeln `agent-worktree.mdc`.

## Cursor-paritet

- Repo-regler: `AGENTS.md` pekar vidare till `docs/` och `.cursor/rules/`.
- Ignorering: `.cursorignore` gäller Cursor. Codex har ingen repo-lokal
  `.codexignore`; använd `.gitignore` och var selektiv med vilka filer du ber
  Codex läsa.
- Worktrees: `.worktreeinclude` kopierar bara utvalda ignorerade lokala filer
  till Codex-hanterade worktrees.
- Secrets: lägg inte tokens i `.codex/config.toml`. GitHub går via `gh`/SSH
  eller Codex/GitHub-connectorn. Runtime-env ligger lokalt i `.env.local`.

## Vanliga kommandon

```text
npm run dev
npm run typecheck
npm run lint
npm run test:ci
npm run scaffolds:validate
npm run dossiers:validate-all
npm run backoffice
```

Vid konstiga Next/Turbopack-fel:

```text
npm run dev:clean
```
