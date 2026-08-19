# Runbook: git worktree för agenter

**Mål:** låta flera agenter arbeta parallellt utan att sabotera varandras HEAD i huvudcheckouten.

Kanonisk regel (kort och alltid påslagen): [`.cursor/rules/agent-worktree.mdc`](../../.cursor/rules/agent-worktree.mdc). Den här filen har de långa recepten och bakgrunden — reglerna gäller även om du aldrig läser hit.

## Varför

Huvudcheckouten delas av användaren och alla agenter. `git checkout`/`git switch` flyttar HEAD **globalt**. En delad checkout har **en** HEAD, **ett** index och **ett** working tree.

## Tillåtet i huvudcheckouten

- läsa filer, `git status`, `git diff`, `git log`, `git fetch`
- köra typecheck/test mot aktuell HEAD
- `git push origin <local>:<remote>` om användaren bett om push
- `git stash push -m "namn" -- <filer>` vid räddning
- små docs-/regel-landningar direkt på `master` enligt [`.cursor/rules/git.mdc`](../../.cursor/rules/git.mdc) — då behövs ingen worktree

## Vem behöver en worktree?

Rollen äger frågan. Säg inte «gå till eget worktree» till varje agent.

| Roll | Worktree? |
|---|---|
| Scout | Nej |
| Builder | Ja, från `origin/master`, därefter `npm run worktree:link`. Undantag: docs/regel-genvägen i `git.mdc` (huvudcheckouten). |
| Steward | Nej för merge (`gh` räcker). Ja bara vid konflikt. |

`node_modules` används hela tiden (typecheck, test, dev). Det finns **en** riktig installation — i huvudcheckouten. En worktree utan länk måste annars köra `npm ci` (~flera minuter). Ändra inte `package.json` i två Builder-säten samtidigt: de delar samma installation.

## Skapa en worktree

Bredvid repo-roten, aldrig under `.cursor/`. Namn: `sajtmaskin-<säte>-<kort>`, till exempel `..\sajtmaskin-a-hoist`.

```powershell
git worktree add ..\sajtmaskin-feat-X -b feat/X origin/master
Set-Location ..\sajtmaskin-feat-X
# jobba, testa, commit/push vid OK
Set-Location ..\sajtmaskin
npm run worktree:remove -- ..\sajtmaskin-feat-X
```

Saknar worktreen MCP-config: `pwsh -File scripts/cursor/sync-mcp-json.ps1` (se [`local-tooling-mcp.mdc`](../../.cursor/rules/local-tooling-mcp.mdc)).

### Vitest behöver `--no-file-parallelism` här

Vitest kan inte starta sina arbetare i en worktree vars `node_modules` är en junction till huvudcheckouten — körningen dör med `Failed to start … worker` / `Timeout waiting for worker to respond` innan något test hunnit starta, vilket ser ut som ett trasigt testbibliotek snarare än ett miljöproblem.

**Det är parallelismen som är problemet, inte poolen.** Att bara byta till `--pool=threads` räcker inte (verifierat 2026-08-19: samma timeout). Receptet som fungerar:

```powershell
npx vitest run --pool=threads --no-file-parallelism <sökväg>
```

Räkna med ~40 s enbart för miljöuppsättningen per fil, så kör riktat och inte hela sviten. `--poolOptions.*` finns inte som CLI-flagga i vår vitest-version. CI har en riktig `node_modules` och berörs inte — den är fortfarande den auktoritativa signalen.

### Basen `origin/master` är inte valfri

Utelämnar du den sista referensen baserar git branchen på **huvudcheckoutens HEAD i det ögonblicket**. Står ägaren på en lokal commit som ännu inte är pushad — eller som inte är verifierad — ärver agentens branch den, tyst.

Det inträffade 2026-08-17: en parallell agents `fix/eval-provider-error` fick merge-base `efc2eb89d`, en commit som fanns bara lokalt när worktreen skapades. Utfallet var ofarligt (commiten var grön och pushades direkt), men mekaniken var tur, inte design. Alla recept i repot saknade basen tills de rättades samma dag.

Två saker som **inte** är risken, så du inte vaktar fel:

- **Ocommitterade ändringar läcker aldrig.** `git worktree add` checkar ut från en commit; ägarens smutsiga arbetskopia är osynlig för nya worktrees.
- **`origin/master` behöver inte vara färskt hämtat** för att skydda mot lokalt spill, men kör `git fetch origin` först om du vill starta på trunkens senaste läge.

Motsvarande skydd i andra ledet: låt aldrig overifierade commits ligga kvar på lokal `master`. Antingen är de gröna och pushade, eller så hör de på en egen branch.

## Städa alltid med `npm run worktree:remove`

Kommandot kopplar loss eventuella länkar **innan** det kör `git worktree remove`, och vägrar köra mot huvudcheckouten eller mot en katalog som inte är en registrerad worktree. Ett bart `git worktree remove` är bara säkert när du vet att worktreen saknar länkar — och det vet du sällan.

Utan `--force` vägrar det också om worktreen har ocommittat eller ospårat innehåll, precis som `git worktree remove` gör, och lämnar då länkarna orörda. Rädda i så fall med `git stash push -u -m ...` innan du kör om.

## Junction-fällan

En färsk worktree saknar `node_modules`. Att länka den till huvudcheckoutens sparar flera minuters `npm ci` — men `git worktree remove --force` **följer junctionen och tömmer länkens mål**, alltså huvudcheckoutens `node_modules`. Symptomet kommer senare och ser ut som ett trasigt repo: `ERR_MODULE_NOT_FOUND: Cannot find package 'dotenv'`. (Inträffade 2026-07-27.)

```powershell
npm run worktree:link -- ..\sajtmaskin-feat-X   # junction till huvudcheckoutens node_modules
npm run worktree:remove -- ..\sajtmaskin-feat-X # kopplar loss länken först, sedan git worktree remove
```

Måste du göra det för hand är ordningen hela poängen: `cmd /c rmdir node_modules` (tar bort LÄNKEN, rör inte målet) **före** `git worktree remove`.

Har det redan hänt: `npm ci` i huvudcheckouten återställer (~4 min). Inget spårat innehåll går förlorat — `node_modules` är gitignorerad.

## Flera agenter samtidigt

- **Max en git-mutator i huvudcheckouten.** Alla andra som ska committa/pusha/branch:a gör det i egen worktree — aldrig `switch`/`merge`/`pull`/`reset` i den delade checkouten medan någon annan är aktiv.
- **En merge-agent landar allt.** Övriga agenter lämnar antingen en pushad worktree-branch + PR, eller en ocommittad diff som merge-agenten tar. Stage bara **egna** filer (`git add <path>`), aldrig `git add -A` i delad tree.
- **HEAD kan flyttas under dig** av en parallell process — en branch som "försvinner" är oftast redan mergad, inte tappad. Verifiera med `git log`/`gh pr view` innan du tror att arbete gått förlorat; rädda ocommittat med `git stash push -m ... -- <filer>`.

## Om regeln brutits

Stoppa. Kör `git status`. Rädda ändringar med `git stash push -u -m "rescue-<kort>-<tid>"`. Rapportera branch, stash-namn och ändrade filer.
