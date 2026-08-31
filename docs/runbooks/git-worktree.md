# Runbook: git worktree

Worktrees är **valfria**. Default är att jobba i den öppna checkouten.

Kanonisk kortregel: [`.cursor/rules/agent-worktree.mdc`](../../.cursor/rules/agent-worktree.mdc).

## När

Flera agenter som ska skriva samtidigt, eller när Jakob ber om en isolerad yta.

## Skapa

Bredvid repo-roten, aldrig under `.cursor/`:

```powershell
git fetch origin master
git worktree add ..\sajtmaskin-<kort> -b <branch> origin/master
npm run worktree:setup -- ..\sajtmaskin-<kort>
```

`worktree:setup` kopierar `.worktreeinclude` (`.env.local`, `mcp.json`). Den
skapar **ingen** `node_modules`-junction. Behöver du tester i worktreet:

```powershell
npm ci
```

`npm run worktree:link` junctionar mot huvudcheckoutens `node_modules`. Det
är snabbare men **sabbar Vitest** (fork-workers och `chdir` på Windows).
Använd det inte.

## Ta bort

Aldrig rå `git worktree remove` — den kan följa en gammal junction och tömma
huvudcheckoutens `node_modules`.

```powershell
npm run tidy
npm run worktree:remove -- ..\sajtmaskin-<kort>
```

Wrappern kopplar loss ev. länkar först. `--force` kräver
`SAJTMASKIN_DISCARD_REASON` och att ingen PR är öppen.

## Codex

Codex har en egen permanent kopia. Sökväg: [`.codex/README.md`](../../.codex/README.md).
Ta inte bort den med `worktree:remove`.
