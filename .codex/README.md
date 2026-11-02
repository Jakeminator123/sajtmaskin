# Codex i Sajtmaskin

Projektets Codex-lager. Codex läser `AGENTS.md` från repo-roten och
`.codex/config.toml` när projektet är trusted; arbetssättet (`AGENTS.md`,
`pr-workflow`, `.cursor/rules/`) är gemensamt med Cursor. Default är GPT-5.6 Sol
med `high` reasoning för huvudtråd och spawnade agenter; en explicit agentprofil
vinner. Modellregler och ChatGPT-webbens granskningsmandat:
[subagent-models.mdc](../.cursor/rules/subagent-models.mdc).

## Behörighet

Värdena ägs av `.codex/config.toml`. Ändras de där ska listan ändras i samma
diff — `npm run workflow:contract` jämför filerna.

- `approval_policy = "on-request"` — behåll denna projektpolicy. Den betyder
  inte godkännande före varje kommando; när och hur godkännande krävs avgörs
  av den effektiva sessionspolicyn. Sänk den aldrig till `never`.
- `sandbox_mode = "danger-full-access"` — projektinställning enligt ägarbeslut
  2026-09-11, inte ett löfte om en startad sessions behörigheter. Repots
  mandat och grindar (git-hooks, `verify:pr`, PR-grinden) gäller fortfarande.
- `web_search = "live"` — färska svar före cachens säkerhet.
- `model_verbosity = "low"` — korta svar.
- Värden kan ersätta projektets inställningar med en hanterad sandbox och
  automatisk eller mänsklig godkännandegranskning. Läs aktuell sessionspolicy;
  anta aldrig att dessa repovärden ger full åtkomst eller en mänsklig fråga.
  Branch-, worktree-, verifierings- och destructive-action-reglerna gäller alltid.
  Autentisering och tokens ligger utanför repot.

## Buggpass före push

Flödet ägs av `pr-workflow` § 4 och
[Buggpass-runbooken](../docs/runbooks/buggpass.md). Codex-specifikt: instruktionen
att bara läsa är ingen OS-sandbox, och saknas en lämplig separat granskare i värden
stoppas publiceringen — ingen full-access-fallback.

## Arbetsyta

Repo-roten är samma mapp för båda verktygen; skriv ingen maskinspecifik sökväg
här. Arbetsyta enligt `git.mdc`, worktrees enligt
[agent-worktree.mdc](../.cursor/rules/agent-worktree.mdc) och bas enligt
`pr-workflow` § 1.2 (branch från `origin/preview`, `origin/master` bara som
produktionsbevis). Vid handoff/branchbyte: kontrollera lokala ändringar och vem
som skriver i ytan; bara en aktör ansvarar för en merge.

Ignorering: `.cursorignore` gäller Cursor; Codex har ingen `.codexignore`, så var
selektiv med vad du läser. `.worktreeinclude` kopierar inga ignorerade
maskinlokala filer; `npm run worktree:setup` skapar bara `.cursor/mcp.json` från
den publika mallen. Inga tokens i `.codex/config.toml`; GitHub går via `gh`/SSH
eller connectorn. Behöver ett worktree runtime-env: skapa en minimal lokal fil
uttryckligen och committa den aldrig.

## Windows-skal (pwsh 7)

Codex Desktop startar ofta Windows PowerShell 5.1 (`Copyright (C) Microsoft
Corporation` / `aka.ms/pscore6`, förstår inte `&&`). Riktig exe:
`C:\Program Files\PowerShell\7\pwsh.exe` (MSI/winget), före `WindowsApps` i User
PATH. `PWSH` injiceras via `shell_environment_policy.set`; om skalet är 5.1, kör
`& $env:PWSH -NoLogo -NoProfile -Command '…'`. `[windows] sandbox = "elevated"`
är avsiktligt (aliaset i WindowsApps failar där).

RTK behöver den icke-hemliga sökvägsvariabeln `CLAUDE_CONFIG_DIR`. Värdet
konfigureras globalt; projektets filter måste också tillåta den eftersom
include-listan tillämpas efter globala `set`-värden. Agenter ska inte behöva
sätta variabeln manuellt per kommando.

`shell_environment_policy.filters` behåller de icke-hemliga `SystemDrive` och
`ProgramData`; saknas de hamnar systemcache i en bokstavlig `%SystemDrive%`-mapp
under arbetskatalogen (inte projektdata, committa aldrig). Kontrollera med
`Test-Path Env:SystemDrive` och `Test-Path Env:ProgramData`; en startad session
kan behöva laddas om. Startar inte `rg`: kontrollera `Get-Command rg -All`
(WinGet-länk före Codex bundlade exe) och använd fungerande exe explicit eller
`git grep`; ändra inte system-PATH och installera inte om automatiskt.
