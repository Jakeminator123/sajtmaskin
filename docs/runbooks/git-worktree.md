# Runbook: git worktree för agenter

**Mål:** låta flera agenter arbeta parallellt utan att sabotera varandras HEAD i huvudcheckouten.

Kanonisk regel (kort och alltid påslagen): [`.cursor/rules/agent-worktree.mdc`](../../.cursor/rules/agent-worktree.mdc). Den här filen har de långa recepten och bakgrunden — reglerna gäller även om du aldrig läser hit.

## Varför

Huvudcheckouten delas av användaren och alla agenter. `git checkout`/`git switch` flyttar HEAD **globalt**. En delad checkout har **en** HEAD, **ett** index och **ett** working tree.

## Tillåtet i huvudcheckouten

- läsa filer, `git status`, `git diff`, `git log`, `git fetch`
- köra typecheck/test mot aktuell HEAD
- `git stash push -m "namn" -- <filer>` vid räddning

Push sker från uppgiftens egen utcheckade branch och bara för exakt aktuell
HEAD. Huvudcheckouten ska inte användas som genväg för att pusha andra refs.

Huvudcheckouten är läs-/testankare. Allt normalt agentskrivarbete, även
docs/regler, går via egen worktree, branch och PR enligt
[`config/agent-workflow.json`](../../config/agent-workflow.json).

## Vem behöver en worktree?

Rollen äger frågan. Säg inte «gå till eget worktree» till varje agent.

| Roll    | Worktree?                                                                           |
| ------- | ----------------------------------------------------------------------------------- |
| Scout   | Nej                                                                                 |
| Builder | Ja, från färsk `origin/master`, därefter `npm run worktree:link`. Även docs/regler. |
| Steward | Nej för merge (`gh` räcker). Ja bara vid konflikt.                                  |

`node_modules` används hela tiden (typecheck, test, dev). Det finns **en** riktig installation — i huvudcheckouten. En worktree utan länk måste annars köra `npm ci` (~flera minuter). Ändra inte `package.json` i två Builder-säten samtidigt: de delar samma installation.

## Skapa en worktree

Bredvid repo-roten, aldrig under `.cursor/`. Namn: `sajtmaskin-<säte>-<kort>`, till exempel `..\sajtmaskin-a-hoist`.

```powershell
git fetch origin master
git worktree add ..\sajtmaskin-feat-X -b feat/X origin/master
Set-Location ..\sajtmaskin-feat-X
npm run worktree:link -- ..\sajtmaskin-feat-X
# jobba, kör verify:pr, öppna draft-PR och behåll worktreet för fixrundor
# först efter merge/close och verifierad remote-status:
Set-Location ..\sajtmaskin
npm run tidy # målytan måste uttryckligen stå som FRI
npm run worktree:remove -- ..\sajtmaskin-feat-X
npm run tidy:apply
```

`npm run worktree:link` kopierar också `.cursor/mcp.json`. Manuell omsync: `pwsh -File scripts/cursor/sync-mcp-json.ps1 -AllWorktrees`.

### Vitest i länkad worktree

Vitest kan inte starta forks-arbetare genom en junction-länkad `node_modules` — körningen dör med `Failed to start … worker` / `Timeout waiting for worker to respond` innan något test hunnit starta.

`scripts/dev/linked-worktree-vitest-pool.ts` slår automatiskt på `pool: "threads"` + `fileParallelism: false` när `node_modules` är en symlink/junction. Alla tre Vitest-configarna importerar den. CI har en riktig installation och tar inte den grenen.

`--pool=threads` ensamt räcker **inte** (verifierat 2026-08-19). Explicit override finns kvar:

```powershell
npx vitest run --pool=threads --no-file-parallelism <sökväg>
```

Räkna med ~40 s miljöuppsättning per fil i worktree, så kör riktat. `--poolOptions.*` finns inte som CLI-flagga i vår vitest-version.

### Basen `origin/master` är inte valfri

Utelämnar du den sista referensen baserar git branchen på **huvudcheckoutens HEAD i det ögonblicket**. Står ägaren på en lokal commit som ännu inte är pushad — eller som inte är verifierad — ärver agentens branch den, tyst.

Det inträffade 2026-08-17: en parallell agents `fix/eval-provider-error` fick merge-base `efc2eb89d`, en commit som fanns bara lokalt när worktreen skapades. Utfallet var ofarligt (commiten var grön och pushades direkt), men mekaniken var tur, inte design. Alla recept i repot saknade basen tills de rättades samma dag.

Två saker som **inte** är risken, så du inte vaktar fel:

- **Ocommitterade ändringar läcker aldrig.** `git worktree add` checkar ut från en commit; ägarens smutsiga arbetskopia är osynlig för nya worktrees.
- **En explicit remote-bas skyddar mot lokalt spill, men en gammal remote-bas
  är ändå inte godtagbar.** Kör alltid `git fetch origin` först och skapa sedan
  worktreet från färska `origin/master`. Om fetch eller ancestrykontrollen
  misslyckas ska agenten stanna, inte gissa.

Motsvarande skydd i andra ledet: gör inga normala agentcommits på lokal
`master`. Direkt master är endast owner break-glass för en uttrycklig incident.

## Städa bara efter `tidy` → `FRI`

Kör först `npm run tidy` från en yta som ska behållas. Exakt målyta måste
rapporteras som `FRI`: ingen öppen PR, rent träd och exakt Git-ancestry eller
squash-PR med samma branch/head-SHA. Om GitHub inte kan läsas är ytan upptagen,
fail-closed.

Först därefter kopplar `npm run worktree:remove -- <sökväg>` loss eventuella
länkar **innan** det tar bort den registrerade worktreen. Kör aldrig ett bart
`git worktree remove`; hooken blockerar det eftersom wrappern är den enda
kanoniska junction-säkra vägen.

Städa inte när PR:n bara är skapad. Buildern äger nya head-SHA:er tills PR:n är
mergad eller stängd. Kräv först `FRI`, kör sedan den säkra borttagningen och
avsluta med `npm run tidy:apply`.

Utan `--force` kräver wrappern samma `FRI`-bevis igen och vägrar smutsigt
innehåll. `--force` är bara för uttryckligt kasserade kandidater: GitHub måste
fortfarande bevisa att ingen PR är öppen och
`SAJTMASKIN_DISCARD_REASON` måste beskriva beslutet. Rädda annars med
`git stash push -u -m ...`; använd inte force som genväg.

## Junction-fällan

En färsk worktree saknar `node_modules`. Att länka den till huvudcheckoutens sparar flera minuters `npm ci` — men `git worktree remove --force` **följer junctionen och tömmer länkens mål**, alltså huvudcheckoutens `node_modules`. Symptomet kommer senare och ser ut som ett trasigt repo: `ERR_MODULE_NOT_FOUND: Cannot find package 'dotenv'`. (Inträffade 2026-07-27.)

```powershell
npm run worktree:link -- ..\sajtmaskin-feat-X   # junction till huvudcheckoutens node_modules
npm run worktree:remove -- ..\sajtmaskin-feat-X # kopplar loss länken först, sedan git worktree remove
```

Gör inte teardown för hand. Om wrappern stoppar ska du bevara ytan och utreda
orsaken; kringgå inte skyddet med `rmdir` eller rå `git worktree remove`.

Har det redan hänt: `npm ci` i huvudcheckouten återställer (~4 min). Inget spårat innehåll går förlorat — `node_modules` är gitignorerad.

## Flera agenter samtidigt

- **Huvudcheckouten är ankare.** Agenter som ska committa/pusha/branch:a gör det
  i egen worktree — aldrig `switch`/`merge`/`pull`/`reset` i den delade
  checkouten medan någon annan är aktiv.
- **En merge-agent landar allt.** Övriga agenter lämnar antingen en pushad worktree-branch + PR, eller en ocommittad diff som merge-agenten tar. Stage bara **egna** filer (`git add <path>`), aldrig `git add -A` i delad tree.
- **HEAD kan flyttas under dig** av en parallell process — en branch som "försvinner" är oftast redan mergad, inte tappad. Verifiera med `git log`/`gh pr view` innan du tror att arbete gått förlorat; rädda ocommittat med `git stash push -m ... -- <filer>`.

## Om regeln brutits

Stoppa. Kör `git status`. Rädda ändringar med `git stash push -u -m "rescue-<kort>-<tid>"`. Rapportera branch, stash-namn och ändrade filer.
