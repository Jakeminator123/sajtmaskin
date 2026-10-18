# Runbook: git worktree

Worktrees är **valfria**. Default är att jobba i den öppna checkouten.

Kanonisk kortregel: [`.cursor/rules/agent-worktree.mdc`](../../.cursor/rules/agent-worktree.mdc).

## När

När Jakob ber om en isolerad yta, exempelvis för parallella skribenter.
Codex och Cursor arbetar annars i den öppna checkouten, en skrivande session
åt gången. Andra agenter får läsa samma checkout.

## Skapa

Bredvid repo-roten, aldrig under `.cursor/`:

```powershell
git fetch origin
git worktree add ..\sajtmaskin-<kort> -b <branch> origin/preview
npm run worktree:setup -- ..\sajtmaskin-<kort>
```

Vanligt utvecklingsarbete utgår från `origin/preview`. Använd `origin/master`
bara när påståendet gäller produktion.

`worktree:setup` kopierar bara uttryckligt listade, icke-känsliga filer från
`.worktreeinclude` (tom som default) och seedar `.cursor/mcp.json` från den
spårade `.cursor/mcp.json.example`. Den kopierar aldrig huvudcheckoutens
live-MCP eller `.env.local`, skapar **ingen** `node_modules`-junction och
vägrar ytor inuti checkouten (`.cursor/worktrees` inkluderat). Behöver du
tester i worktreet:

```powershell
Set-Location ..\sajtmaskin-<kort>
npm ci
npm run hooks:install
```

Kör repokommandon i den nya checkouten med dess Node-pin. I Codex används
appens worktree-funktion för apphanterade ytor; skapa inte en andra manuell
worktree för samma uppdrag.

`npm run worktree:link` junctionar mot huvudcheckoutens `node_modules`. Det
är snabbare men **sabbar Vitest** (fork-workers och `chdir` på Windows).
Använd det inte.

## Ta bort och hantera Windows-lås

Apphanterade Codex-worktrees arkiveras genom appens worktree-funktion efter
terminal PR och verifierad remote-status. Kommandona nedan gäller manuella
repo-worktrees. Rör inte en annan aktiv agents yta.

Aldrig rå `git worktree remove` — den kan följa en gammal junction och tömma
huvudcheckoutens `node_modules`.

```powershell
npm run tidy
npm run worktree:remove -- ..\sajtmaskin-<kort>
```

Wrappern kopplar loss ev. länkar först. `--force` kräver
`SAJTMASKIN_DISCARD_REASON` och att ingen PR är öppen.

En befintlig app-isolerad checkout följer samma arbetsregler. En långlivad
worktree som behöver skyddas använder git-configen
`sajtmaskin.protectedWorktree`.

På Windows: om katalogen eller `.git` är låst, identifiera processen med
exekverbarsökväg, kommando, parent och starttid. Stäng bara den terminal,
dev-server eller editor som faktiskt håller den berörda ytan och som får
stängas. Döda inte alla `node.exe` och flytta inte en aktiv checkout.
