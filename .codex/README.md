# Codex i Sajtmaskin

Den här katalogen är projektets Codex-lager. Cursor-reglerna ligger kvar i
`.cursor/`, medan Codex automatiskt läser `AGENTS.md` från repo-roten och den
här `.codex/config.toml` när projektet är trusted.

Projektets Codex-default är GPT-5.6 Sol med `high` reasoning för huvudtråd och
spawnade agenter. En explicit agentprofil vinner; Godnatt behåller Sol `xhigh`
för investigator/reviewer och Sol `high` för worker.

## Behörighet

- Det här trusted personliga projektet använder den säkra interaktiva
  standarden `approval_policy = "on-request"` och
  `sandbox_mode = "workspace-write"`.
- Inställningen gäller när en ny Codex-uppgift startas från projektet. En redan
  startad uppgift med host-managed sandbox kan fortfarande kräva värdens
  godkännanden; dess behörighetsprofil kan inte bytas mitt i körningen.
- Bredare åtkomst är ett uttryckligt undantag för den aktuella uppgiften, inte
  projektets default. Branch-, worktree-, verifierings- och
  destructive-action-reglerna gäller alltid.
- Webbsökning använder `cached` som säkrare default. Autentisering och tokens
  ligger utanför repot.

## Så här ska projektet öppnas

- Cursor: File → Open Folder på `C:\Users\jakob\dev\projects\sajtmaskin`.
  `C:\Users\jakob\dev\projects\sajtmaskin` är läs-, test- och kontrollankare
  på `master`. Normalt skrivarbete sker i uppgiftens egen worktree/branch enligt
  `pr-workflow`, aldrig direkt i huvudcheckouten.
- Primary folder i det sparade lokala Codex-projektet `sajtmaskin` är samma
  repo-root: `C:\Users\jakob\dev\projects\sajtmaskin`. Registreringen gör inte
  huvudcheckouten till en skrivyta.
- Starta nya Codex-chattar från projektet `sajtmaskin`. Allt skrivarbete sker
  i en egen Codex-worktree/branch per uppgift, baserad på färsk
  `origin/master` — inte i huvudcheckouten.
- Samma regel gäller när Cursor är stängt och Codex arbetar ensamt. Öppna då
  Codex-worktreet i önskad editor eller terminal och arbeta färdigt där.
- Handoff till `Local` görs bara när huvudcheckouten är verifierat ren och ingen
  annan process äger den. En branch får bara vara utcheckad i en worktree åt
  gången, och bara en aktör ansvarar för merge.

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
- Worktrees: `.worktreeinclude` kopierar inga ignorerade maskinlokala filer som
  default. `npm run worktree:setup` skapar bara `.cursor/mcp.json` från den
  spårade, publika `.cursor/mcp.json.example`.
- Secrets: lägg inte tokens i `.codex/config.toml`. GitHub går via `gh`/SSH
  eller Codex/GitHub-connectorn. Behöver ett worktree verkligen runtime-env,
  skapa en minimal worktree-lokal fil uttryckligen och committa den aldrig.

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
