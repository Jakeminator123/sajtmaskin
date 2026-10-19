---
name: godnatt-bugg
description: Drive Sajtmaskin BUG-SWARM backlog items through fresh revalidation, isolated fix, independent review, PR, merge gate or draft-only Cloud evaluation, and cleanup. Use for $godnatt-bugg, /godnatt-bugg, "godnatt bugg", N autonomous backlog passes, admin-blocked evaluation drafts, or a scheduled tick resuming an armed full batch. Not for general audits or bugs outside BUG-SWARM-BACKLOG.md.
---

# Godnatt bugg

Normalt exakt ett säkert pass per task; en uttrycklig evaluation kör sina N
draft-only-pass sekventiellt i samma Cloud-task. Backloggen är hypoteser, inte
facit. Läs repo-rotens AGENTS.md och reglerna den routar till före åtgärd.

## Lägen

| Anrop | Betydelse |
|---|---|
| `$godnatt-bugg` / `/godnatt-bugg` | Pilot, count 1: implementation, commit, push och draft-PR; state spärrar ci-review, sign-off, merge och complete |
| `$godnatt-bugg N` | Avvisa: batchens authority måste vara bokstavlig (`full` eller `evaluation`) |
| `$godnatt-bugg evaluation N` | Cloud-/admintest: N unika kandidater, en branch + draft-PR per kandidat; ready, merge, PR-close och branch-delete förbjudna |
| `$godnatt-bugg full N` | N terminala pass med mandat att committa, pusha, skapa/uppdatera PR, merga efter hela repo-grinden och städa den mergade pass-branchen |
| `$godnatt-bugg full AUTHORIZATION` | Promovera en pausad pilot med dess privata capability; skapa ingen ny batch |
| `$godnatt-bugg scheduled` | Återuppta bara befintlig körbar full state; skapa/promovera aldrig och aldrig i sig merge-mandat |

- **Pilot:** `begin` returnerar en slumpad promotionCode som bara lagras som
  hash. Visa den för användaren och håll den utanför repo, PR och automation.
  Promotion kräver rätt run-id, capability och användarens uttryckliga
  full-mandat.
- **Evaluation:** varje PR är draft med adminvarning och mergeförbud i state,
  högst tre review/fix-pass. Ett pass är terminalt först efter godkänd review för
  aktuell head/base-SHA och betyder "utvärderings-PR skapad", aldrig "löst i
  master". Samma SM-id väljs aldrig två gånger. Körs som engångs-Cloud-task och
  aktiverar aldrig Desktop-automationen. Läs
  [cloud-evaluation.md](references/cloud-evaluation.md) först.
- **Full:** spärras tills live `config/agent-workflow.json` på GitHub-preview
  har `deliveryBranch: preview` och leasen har ett rollout-grant; lokal policy
  eller en draft-PR är inte aktivering (detaljer i state-referensen).
- **Inget läge** tillåter force-push, historikomskrivning, prod-datamutation,
  deploy, domänändring, hemlighetshantering eller borttagning av permanenta eller
  current worktrees.

`npm run test:godnatt-bugg` är on-demand (inte i `test:ci`, CI eller
`verify:pr`); kör det när du ändrar Godnatt-skripten.

## Stateverktyget

`run-state` nedan betyder
`node .agents/skills/godnatt-bugg/scripts/run-state.mjs`, kört från repo-roten.
State ligger i repots git-common-dir så att alla app-worktrees ser samma lease.
Spara runner-token från `acquire` privat och skicka den vid varje mutation;
state och status visar den aldrig i klartext. Aktiv lease eller cooldown:
avsluta. Utgången lease: inspektera GitHub, task, branch, worktrees och state
före explicit `recover`; ta aldrig över tyst. Alla kommandon, spärrar,
promotion och automationslivscykel:
[state-and-scheduling.md](references/state-and-scheduling.md).

## Ett säkert pass

### 1. Preflight

1. Kräv ett Codex-appisolerat worktree; kör aldrig i huvudcheckouten
   ([`.codex/README.md`](../../../.codex/README.md)). Appens worktree är både
   kontrollplan och implementationsträd: skapa inget sibling-worktree och ta
   aldrig bort det själv; Desktop äger teardown och retention.
2. Kontrollera cwd, `git status`, branch och `git worktree list`.
3. Läs reglerna för git, workflow, worktrees och merge. Läs inte hela
   `BUG-SWARM-BACKLOG.md`: `run-state queue` ger okryssade `## Aktiv kö`-rader
   och `rg -n "SM-NNN" BUG-SWARM-BACKLOG.md` visar vald rad.
4. Hämta origin/preview (leverans) och origin/master (produktionsbevis). Ingen
   automatisk reset, merge, rebase eller sync-master.
5. Läs öppna PR:er (labels, head-branch, paths) och undvik överlapp.
6. `run-state queue` och `run-state acquire`. Busy, cooldown, paused eller
   completed: ingen mutation; följ automationslivscykeln. Evaluation får vänta ut
   `state.notBefore` och sedan reacquire, aldrig sänka cooldownen.

### 2. Välj en kandidat

En okryssad rad under exakt `## Aktiv kö`, rangordnad efter tydlig repro eller
kodankare, begränsad blast radius, testbarhet, få schema-/policy-/prodberoenden
och sist prioritet. Hoppa över rader som kräver ägarbeslut, kund-/prodbevis,
domänpolicy, hemligheter, irreversibel migration eller mer än cirka 40 filer.
Claima först efter valet: `run-state claim --token TOKEN --sm-id SM-NNN`.

### 3. Revalidera oberoende

Snapshots skrivs till fil, aldrig in i chatten. `.cursor/tmp/` är gitignorerad
och läses inte av snapshoten:

    node .agents/skills/godnatt-bugg/scripts/repo-snapshot.mjs --out .cursor/tmp/godnatt/<steg>-before.json
    node .agents/skills/godnatt-bugg/scripts/repo-snapshot.mjs compare <before.json> <after.json> [--pass-branch <branch>]

Snapshoten täcker HEAD, ref-tips, reflog, staged/unstaged, status, ospårade
filhashar och worktree-lista inklusive sibling-worktrees. Saknat eller oläsbart
sibling-bevis och äldre snapshot utan den täckningen är stopp, aldrig clean.
Snapshotta även relevant GitHub PR-/kommentar-/review-state read-only.

Starta `godnatt_investigator` (skrivskyddad, profil
`.codex/agents/godnatt-investigator.toml`) med backloggraden ordagrant,
origin/master-SHA för produktionspåståendet, origin/preview-SHA för leverans,
app-worktree-path och krav på verdict `relevant`, `already-resolved`,
`reclassify` eller `blocked`. Kontrollera beviset själv och flytta state
sekventiellt till `verified` och `investigated`. Ta efter-snapshots och jämför:

- `pass-mutation` eller `unclassified-change` är stopp; reviewn räknas inte.
- `external-change` kräver inspektion: en annan agents ref/worktree bevisar
  inte att utredaren skrev. Ändrad leveransbas eller annat reviewunderlag kräver
  färsk bas och ny granskning. GitHub-mutation måste attribueras; oklar orsak är
  stopp.
- Före steg 4 får app-worktreet ha konsekvent detached HEAD; efter
  worktree-ready ska jämförelsen ange registrerad `passBranch`.

Verdict: `relevant` → fortsätt. `already-resolved` / `reclassify` → minimal
backlogg-PR med commit-/testbevis respektive precis klassning och nästa steg.
`blocked` → `skip` för kandidatproblem, `pause` för batchproblem; gissa inte.
I full räknas already-resolved och reclassify först efter mergad PR och
cleanup-handoff; i evaluation bara att den adminspärrade draft-PR:n skapats och
reviewats.

### 4. Förbered pass-branchen

Kräv rent app-worktree utan användarändringar. Skapa unik branch från färsk
origin/preview i samma worktree. Är felet redan fixat där implementeras det inte
igen bara för att master inte är promotad.

    git switch -c fix/sm-NNN-kort-slug origin/preview
    run-state stage --token TOKEN --name worktree-ready --branch fix/sm-NNN-kort-slug --worktree ABSOLUTE_CURRENT_PATH

feat/docs/chore-prefix bara när klassningen kräver det. Verifiera branch,
absolut cwd och base-SHA. Branch, worktree och PR-nummer blir immutable efter
registrering.

### 5. Implementera med worker

Ta före-snapshot. Starta `godnatt_worker` i passets worktree med exakt cwd,
branch, brief och acceptance criteria; diffen lämnas ocommittad. Agentens
`sandbox_mode` är ingen egen säkerhetsgräns när förälderns behörighet är bredare;
app-worktreet är gränsen. Efteråt: verifiera cwd, branch och worktree-lista och
pausa vid mutation utanför pass-worktreet eller oväntat git-state.

Kräv röd-före/grön-efter, countertest i motsatt riktning för
guard/filter/policy-gränser, fokuserade tester och tillämpliga repo-checks,
kontroll av backoffice, schema, policies, migrations, auth, cache och callers,
samt separata falsifierbara nya fynd utan scope-glidning. Flytta till
`implemented` först efter att du inspekterat faktisk diff och testlogg.

### 6. Granska och rätta

Nya snapshots till fil. Starta `godnatt_reviewer` skrivskyddat mot hela
branchdiffen inklusive ospårade filer. Triagera varje P0/P1/P2; låt workern
rätta eller gör små tydliga korrigeringar själv och upprepa tills inga
trovärdiga P0/P1 återstår. Jämför snapshots som i steg 3; har reviewern faktiskt
muterat Git/GitHub: pausa, kassera reviewn som oberoende och bevara diffen. Ny
base/head ogiltigförklarar SHA-känslig review. Fel som diffen orsakar fixas;
orelaterade falsifierbara fel får en ny SM-rad med tydliga bevis, aldrig en
andra fix i passet. Externa botfynd triageras; ingen automatisk betald
API-review. Flytta till `reviewed`.

### 7. Commit, bugggranskning och draft-PR

Följ kanoniska git-/PR-regler. Kör tester och oberoende bugggranskning på
komplett diff före push; återanvänd ett fullgott reviewer-pass i stället för ett
identiskt extra. Kör om SHA-känslig buggkoll efter varje ny commit. Pusha och
skapa draft-PR mot preview; sätt backloggradens PR-referens och gör
same-PR-arkivering (raden lämnar Aktiv kö bara genom PR:n som mergas).

Registrera med `run-state stage --token TOKEN --name draft-pr --pr PR`; CLI:n
läser PR-beviset själv från GitHub.

- **Pilot:** pausa här, pausa automationen och visa PR, run-id och promotionCode.
  Nästa stage kräver giltig capability-promotion.
- **Evaluation:** verifiera draft och de exakta adminmarkörerna i titel/body
  (cloud-evaluation) före registrering. Lägg befintlig `do-not-merge`- eller
  `admin-review-required`-label, skapa ingen ny; state återläser label och
  markörer. Kontrollera dem igen före complete.

### 8. Review, högst tre pass

- **Full:** gör PR:n ready och följ [pr-merge-cleanup.md](references/pr-merge-cleanup.md).
  GitHubs required checks och reviews är teknisk sanning; ny head eller
  integrationsbas gör äldre resultat stale.
- **Evaluation:** håll draft. Låt normal automation granska, annars oberoende
  readonly bugggranskning. Efter ny commit: registrera draft-pr-staget med aktuell
  SHA och granska om. Aldrig ready, aldrig merge.

Vänta icke-blockerande och läs reviews, inline-kommentarer, checks och labels för
aktuell head. Registrera varje komplett oberoende pass:

    run-state review --token TOKEN --source independent-agent --reviewer-model gpt-5.6-sol --reviewer REVIEW_TASK_ID --verdict clean --reviewed-sha FULL_HEAD_SHA --reviewed-base-sha FULL_PREVIEW_BASE_SHA --note "triage"

Granskaren anger fryst head och live preview-base-SHA, inte PR-API:ets
historiska basefält. Ny head/base kräver omregistrerat stage och ny godkänd
granskning (efter ready-to-merge: `re-review`). State stoppar pass fyra; efter
tre pass med kvarvarande fynd eller rött check: pausa — taket är aldrig
merge-tillåtelse.

Full går `ci-review` → `ready-to-merge` med clean eller findings-fixed review för
exakt head/base. Evaluation slutförs direkt från draft-pr med outcome
`draft-fix`, `draft-already-resolved` eller `draft-reclassified`:

    run-state complete --token TOKEN --outcome draft-fix --evidence "PR #123 är verifierat draft/adminspärrad och omergad"

### 9. Merge (bara full)

Invänta required checks, Vercel och oberoende review; GitHub-status bevisar inte
review, så läs reviews och trådar separat. Ett i förväg villkorat finalmandat
gäller när native villkor uppfylls. Följ preview-vägen i `pr-merge.mdc`: rätt
base, ej draft, mergeable, inga blockerande reviews/trådar/labels, P0/P1 = 0 och
stabil head/base. Läs övriga PR:er igen; ändrad base/head kräver omkörning av
alla SHA-känsliga gates. Verifiera PR-state och origin/preview efter merge;
master uppdateras aldrig här. Preview kan köra jobb mot delad produktions-DB:
okända effekter eller otillåtna datawrites är stopp. Registrera exakt merge-SHA
med `run-state stage --token TOKEN --name merged`.

### 10. Cleanup-handoff och nästa pass

Full: kör cleanup-funktionen i [pr-merge-cleanup.md](references/pr-merge-cleanup.md)
(landningsbevis, lease-bunden remote-delete, aldrig force), lämna lokal branch
och current worktree till appens teardown och flytta state till `cleanup` och
`complete`. Complete betyder cleanup-ready-handoff, inte att Desktop raderat
worktreet. Först complete minskar remaining; vid kvarvarande pass sätter state
minst fem minuters cooldown.

Automation: paused → pausa automationen men behåll tasken när current finns
(återupptas bara i originaltasken; en ny tick får aldrig rebinda). Försvunnen
task/worktree → blockera för manuell branch-/PR-räddning. Completed → pausa
automationen och arkivera tasken. Cooldown → arkivera passet; nästa tick får nytt
worktree från senaste preview. Running → behåll task och automation. Återaktivera
bara vid uttrycklig resume/full.

Evaluation har ingen merge-cleanup: lämna PR:n öppen som draft och
remote-branchen kvar, verifiera att inget mergats eller markerats ready, vänta ut
cooldown, hämta färsk origin/preview och origin/master och skapa nästa branch i
samma rena Cloud-worktree. Vid completed: avsluta med en tabell över alla pass och
explicit bekräftelse att ingen PR mergats; Desktop-automationen förblir pausad.

## Stoppa säkert

Pausa om required check är röd/oklar eller P0/P1 kvarstår; branch, worktree,
base, head eller merge-SHA inte kan bevisas; protected-path-review eller
oberoende buggkoll saknas; blockerande label finns; current/permanent worktree
riskerar cleanup; workern rört sig utanför pass-worktreet; eller mänskligt
beslut, prodbevis, hemlighet eller irreversibel åtgärd krävs.

Rapportera run-id, SM-id, mode, stage, PR, branch/worktree, tester, reviewkälla
och antal reviewpass, blockerare, automationsstatus och exakt nästa säkra steg.
