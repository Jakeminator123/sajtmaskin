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

## Godnatt-bugg

Repo-skillen `.agents/skills/godnatt-bugg/` driver ett BUG-SWARM-fynd i taget
genom färsk revalidering, app-isolerat pass-worktree, implementation, oberoende
review, draft-PR, repo-gate, merge och säker cleanup. Den använder tre
projektprofiler:

- `.codex/agents/godnatt-investigator.toml` — skrivskyddad GPT-5.6 sol xhigh.
- `.codex/agents/godnatt-worker.toml` — avgränsad GPT-5.6 sol high i angivet
  app-worktree.
- `.codex/agents/godnatt-reviewer.toml` — skrivskyddad GPT-5.6 sol xhigh.

Native skill-anrop använder dollarformen. Slashformen förstås som vanligt
språk:

```text
$godnatt-bugg
$godnatt-bugg full 2
$godnatt-bugg full 9
```

Utan antal är kommandot pilot: en draft-PR skapas men state spärrar merge.
Bara den bokstavliga formen `$godnatt-bugg full N` är batch-/merge-mandat;
ett ensamt antal avvisas. Pilotpromotion kräver en slumpad capability som bara
visas för användaren och följer ändå hela repots PR-grind.
State och lease ligger i repots delade git-metadata så att isolerade Codex
Desktop-worktrees inte dubbelstartar samma batch.

Varje pass använder automationstaskens eget app-isolerade worktree; inga
nested/sibling-worktrees skapas. Desktop-automationen `godnatt-bugg` hålls
pausad tills en full batch armeras. Den anropar bara `$godnatt-bugg scheduled`,
får aldrig skapa/promovera en batch och pausar sig vid missing/paused/completed.
