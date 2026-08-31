# Codex i Sajtmaskin

Den här katalogen är projektets Codex-lager. Cursor-reglerna ligger kvar i
`.cursor/`, medan Codex automatiskt läser `AGENTS.md` från repo-roten och den
här `.codex/config.toml` när projektet är trusted.

Projektets Codex-default är GPT-5.6 Sol med `high` reasoning för huvudtråd och
spawnade agenter. En explicit agentprofil vinner; Godnatt behåller Sol `xhigh`
för investigator/reviewer och Sol `high` för worker.

## Behörighet

- Det här trusted personliga projektet använder avsiktligt
  `approval_policy = "never"` och `sandbox_mode = "danger-full-access"`.
- Inställningen gäller när en ny Codex-uppgift startas från projektet. En redan
  startad uppgift med host-managed sandbox kan fortfarande kräva värdens
  godkännanden; dess behörighetsprofil kan inte bytas mitt i körningen.
- Full filsystemsåtkomst breddar inte uppdragets mandat. Branch-, worktree-,
  verifierings- och destructive-action-reglerna gäller fortfarande.
- Webbsökning är `live`; autentisering och tokens ligger fortfarande utanför
  repot.

## Så här ska projektet öppnas

- Cursor öppnas via `sajtmaskin.code-workspace` i
  `C:\Users\jakob\dev\projects\sajtmaskin`. Det är den vanliga arbetsytan.
  Worktree är valfritt.
- Primary folder i det sparade Codex-projektet `sajtmaskin` är den separata
  Codex-kopian `C:\Users\jakob\Documents\ChatGPT\sajtmasin` på ankarbranchen
  `codex/workspace`.
- `codex/workspace` är ett återanvändbart projektankare, inte en featurebranch.
  `tidy` skyddar namnet; ta inte bort Codex-kopian som `FRI`.
- Starta nya Codex-chattar från projektet `sajtmaskin`. Jobba i den öppna
  kopian eller en valfri branch från färsk `origin/master`.
- Efter mergad PR behålls projektankaret på `codex/workspace`; nästa arbete
  startas från färsk `origin/master`.

## Windows-skal (pwsh 7)

Codex Desktop på Windows startar ofta **Windows PowerShell 5.1** (`powershell.exe`)
trots att `pwsh` 7 är installerat. 5.1 skriver
`Copyright (C) Microsoft Corporation` / `aka.ms/pscore6` och förstår inte `&&`.

- Riktig exe: `C:\Program Files\PowerShell\7\pwsh.exe` (MSI/winget, inte Store).
- User PATH ska ha den mappen **före** `WindowsApps` (0-byte alias).
- `PWSH` injiceras via `shell_environment_policy.set` i `config.toml`.
- Kör kommandon som `& $env:PWSH -NoLogo -NoProfile -Command '…'` om skalet är 5.1.
- `[windows] sandbox = "elevated"` är avsiktligt; aliaset i WindowsApps failar där.

## Cursor-paritet

- Repo-regler: `AGENTS.md` pekar vidare till `docs/` och `.cursor/rules/`.
- Ignorering: `.cursorignore` gäller Cursor. Codex har ingen repo-lokal
  `.codexignore`; använd `.gitignore` och var selektiv med vilka filer du ber
  Codex läsa.
- Worktrees: `.worktreeinclude` kopierar `.env.local` och `.cursor/mcp.json`
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
$godnatt-bugg evaluation 2
$godnatt-bugg full 2
$godnatt-bugg full 9
```

Utan antal är kommandot pilot: en draft-PR skapas men state spärrar merge.
Bara den bokstavliga formen `$godnatt-bugg full N` är batch-/merge-mandat;
ett ensamt antal avvisas. Pilotpromotion kräver en slumpad capability som bara
visas för användaren och följer ändå hela repots PR-grind.
State och lease ligger i repots delade git-metadata så att isolerade Codex
Desktop-worktrees inte dubbelstartar samma batch.

`$godnatt-bugg evaluation N` är ett separat Cloud-/admin-testläge: det får
committa, pusha och skapa N unika draft-PR:er men kan aldrig gå vidare till
ready-for-review, sign-off, merge eller branch-delete. Varje pass kräver
adminvarning, mergeförbud och färsk review på aktuell SHA. Samma SM-id kan inte
väljas två gånger i batchen, även om den första draft-PR:n ännu inte är mergad.

Varje pass använder automationstaskens eget app-isolerade worktree; inga
nested/sibling-worktrees skapas. Desktop-automationen `godnatt-bugg` hålls
pausad tills en full batch armeras. Den anropar bara `$godnatt-bugg scheduled`,
får aldrig skapa/promovera en batch och pausar sig vid missing/paused/completed.
