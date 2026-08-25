---
name: godnatt-bugg
description: Drive one or more Sajtmaskin BUG-SWARM backlog items from fresh revalidation through isolated implementation, independent review, pull request, merge gate or draft-only Cloud evaluation, cleanup, and cooldown. Use when the user invokes $godnatt-bugg, writes /godnatt-bugg or "godnatt bugg", asks for one or N autonomous backlog bug passes, requests a Cloud evaluation with admin-blocked draft PRs, or when a scheduled Godnatt-bugg tick resumes an armed full batch. Do not use for general audits or bugs outside BUG-SWARM-BACKLOG.md.
---

# Godnatt bugg

Orkestrera normalt exakt ett säkert pass per task. En uttrycklig evaluation-run
är undantaget: kör dess N draft-only-pass sekventiellt i samma Cloud-task för
att testa cooldown och kandidatrotation utan merge-authority. Behandla
backloggen som hypoteser, inte facit. Läs alltid repo-rotens AGENTS.md och de
regler som den routar till innan någon åtgärd.

## Tolka kommandot

- $godnatt-bugg eller /godnatt-bugg: skapa ett pilotpass med count 1.
- $godnatt-bugg N utan ordet full eller evaluation: avvisa och förklara att
  batchens authority måste vara bokstavlig.
- $godnatt-bugg evaluation N: skapa en Cloud-/adminutvärdering med N separata
  draft-PR-pass. Commit, push och draft-PR är tillåtna; ready-for-review,
  sign-off, merge, PR-close och branch-delete är förbjudna.
- $godnatt-bugg full N: skapa en full batch med N terminala pass.
- $godnatt-bugg full AUTHORIZATION: promovera en pausad pilot med dess privata
  capability; skapa inte en ny batch.
- $godnatt-bugg scheduled: skapa eller promovera aldrig en batch; återuppta bara
  befintlig full state när den är körbar.

Pilot tillåter implementation, commit, push och draft-PR men state spärrar
ci-review, sign-off, merge och complete. Pilot-begin returnerar en slumpad
promotionCode som inte lagras i klartext. Visa den för användaren och håll den
utanför repo, PR och automation. Promotion kräver rätt run-id, capability och
användarens uttryckliga full-mandat.

Evaluation är ett uttryckligt men begränsat admin-testmandat. Det tillåter N
unika kandidater i samma Cloud-task, en dedikerad branch och en draft-PR per
kandidat samt högst tre review/fix-pass per PR. Varje PR måste vara draft,
innehålla adminvarningen och bära mergeförbud i state. Ett evaluation-pass
räknas terminalt först efter en godkänd review för aktuell head-SHA; det betyder
"utvärderings-PR skapad", aldrig "buggen är löst i master". State tillåter
aldrig evaluation förbi draft-pr och vägrar återvälja ett SM-id som redan
behandlats i batchen.

Full är användarens uttryckliga mandat att för just den batchen committa, pusha,
skapa/uppdatera PR, merga efter hela repo-grinden och städa den mergade
pass-branchen så långt appens worktree-livscykel medger. Inget läge tillåter
force-push, historikomskrivning, prod-datamutation, deploy, domänändring,
hemlighetshantering eller borttagning av permanenta/current worktrees.

Ett scheduled-anrop är aldrig i sig merge-mandat. Det får bara fortsätta den
full-batch och count som användaren redan har armerat. Evaluation körs som en
engångs-Cloud-task och får aldrig aktivera Desktop-automationen.

## Använd stateverktyget

Kör statekommandon från repo-roten:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs queue
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs begin --count 1 --mode pilot --automation-id godnatt-bugg
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs begin --count N --mode evaluation
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs begin --count N --mode full --automation-id godnatt-bugg
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs status
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs acquire

State ligger i repots delade git-common-dir så att nya app-worktrees ser samma
lease. Spara runner-token från acquire och skicka den vid varje mutation. Vid
aktiv lease eller cooldown: avsluta. Vid utgången lease: inspektera GitHub,
taskstatus, branch, worktrees och state före explicit recover. Ta aldrig över
tyst.

Se [state-and-scheduling.md](references/state-and-scheduling.md) för samtliga
kommandon, promotion och automationslivscykel. Läs
[cloud-evaluation.md](references/cloud-evaluation.md) före en Cloud-utvärdering.

## Kör ett säkert pass

### 1. Preflight

1. Kräv ett Codex-appisolerat worktree för passet. Kör aldrig i
   C:\Users\jakem\dev\projects\sajtmaskin eller den permanenta Codex-checkouten.
2. Kontrollera cwd, git status, aktuell branch och git worktree list.
3. Läs AGENTS.md, BUG-SWARM-BACKLOG.md och reglerna för git, workflow,
   worktrees, Bugbot och merge.
4. Kör git fetch origin master. Kör inte automatisk reset, merge, rebase eller
   sync-master.
5. Läs öppna PR:er med labels, head-branch och paths. Avstå från överlapp.
6. Kör queue och acquire. Vid busy/cooldown/paused/completed: gör ingen mutation
   och följ automationslivscykeln. I evaluation får samma Cloud-task vänta ut
   `state.notBefore` och sedan reacquire; den får inte sänka cooldownen.

Appens worktree är både kontrollplan och passets dedikerade implementationsträd.
Skapa inte ett andra sibling-worktree: en scheduled task har normalt bara
skrivrätt i det app-worktree den fått. Agenten får aldrig själv ta bort detta
current worktree; Desktop äger teardown/retention.

### 2. Välj en kandidat

Välj bara en okryssad rad under exakt Aktiv kö. Rangordna efter:

1. tydlig reproduktion eller kodankare,
2. begränsad blast radius,
3. stark testbarhet,
4. få schema/policy/prod-beroenden,
5. högre prioritet när övrigt är lika.

Hoppa över kandidat som kräver ägarbeslut, kund-/prod-bevis, domänpolicy,
hemligheter, irreversibel migration eller ett orimligt stort pass. Ett normalt
pass bör inte beröra mer än ungefär 40 filer. Claima först när valet är gjort:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs claim --token TOKEN --sm-id SM-NNN

### 3. Revalidera oberoende

Kör repo-snapshot.mjs och behåll hela JSON-objektet i tasken. Det täcker HEAD,
branch/ref-tips, reflog, staged/unstaged, status, ospårade filhashar och
worktree-lista. Snapshotta även relevant GitHub PR/comment/review-state via
read-only API. Starta godnatt_investigator med backloggraden ordagrant, origin/master-SHA,
app-worktree-path och krav på verdict relevant, already-resolved, reclassify
eller blocked.

Utredaren är skrivskyddad och kör GPT-5.6 sol xhigh enligt
`.cursor/rules/subagent-models.mdc`. Kontrollera dess bevis själv. Flytta
state sekventiellt till verified och investigated. Kör samma lokala och GitHub-
snapshots efteråt och kräv identisk state. Vid mutation från den påstått
skrivskyddade agenten: pausa och räkna inte resultatet som oberoende.

- relevant: fortsätt.
- already-resolved: gör en minimal backlogg-PR med commit-/testbevis.
- reclassify: gör en minimal backlogg-PR med precis klassning och nästa steg.
- blocked: använd skip för kandidatproblem, pause för batchproblem. Gissa inte.

I full mode räknas already-resolved och reclassify först efter mergad PR och
cleanup-handoff. I evaluation räknas bara att motsvarande adminspärrade
draft-PR har skapats och reviewats; master-raden är fortsatt olöst.

### 4. Förbered pass-worktreet

Kräv ren app-worktree utan användarändringar. Skapa unik pass-branch från färsk
origin/master i samma worktree:

    git switch -c fix/sm-NNN-kort-slug origin/master

Använd feat/docs/chore-prefix endast när klassningen faktiskt kräver det.
Verifiera exakt branch, absolut cwd och base-SHA. Registrera samma path:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name worktree-ready --branch fix/sm-NNN-kort-slug --worktree ABSOLUTE_CURRENT_PATH

State kräver tillåten branchprefix och absolut path. Branch, worktree och
PR-nummer blir immutable efter registrering.

### 5. Implementera med worker-underagent

Ta före-snapshot av git status/diff och worktree-lista. Starta godnatt_worker i
passets app-worktree med exakt cwd, branch, brief och acceptance criteria.
Workern kör GPT-5.6 sol high och lämnar diffen ocommittad.

Custom-agentens sandbox_mode är inte en separat säkerhetsgräns när förälderns
live permissions är bredare. App-worktreets sandbox är den riktiga gränsen.
Efter workern: verifiera cwd/branch/worktree-lista igen och pausa vid mutation
utanför pass-worktreet eller oväntat git-state.

Kräv:

- röd-före/grön-efter-reproduktion,
- countertest i motsatt riktning för guard/filter/policy-gränser,
- fokuserade tester och tillämpliga repo-checks,
- kontroll av backoffice, schema, policies, migrations, auth, cache och callers,
- separata falsifierbara nya fynd utan scope-glidning.

Flytta till implemented först efter rootens inspektion av faktisk diff/testlogg.

### 6. Granska och rätta

Kör repo-snapshot.mjs och read-only GitHub-snapshot igen. Starta
godnatt_reviewer skrivskyddat mot hela branchdiffen inklusive ospårade
filer. Rootagenten triagerar varje P0/P1/P2. Låt workern rätta eller gör små
tydliga korrigeringar själv. Kör om tester/reviewer tills inga trovärdiga P0/P1
återstår. Kör identiska efter-snapshots. Om reviewer-agenten ändrat HEAD, refs,
reflog, staged/unstaged, untracked, worktrees eller GitHub-state: pausa, kassera
reviewn som oberoende och bevara diffen för handoff.

Nya fel som diffen orsakar måste fixas. Orelaterade falsifierbara fel får en ny
stabil SM-rad endast med tydliga bevis; starta inte en andra fix i samma pass.
Reviewer-passet ersätter inte repots Cursor Bugbot/PR AI-gate. Flytta till
reviewed.

### 7. Commit, Bugbot och draft-PR

Följ kanoniska git-/PR-regler. Kör tester och obligatorisk lokal Bugbot på
komplett diff före PR/push när den är tillgänglig. Kör om SHA-känslig buggkoll
efter varje ny commit.

Commitera avsiktligt, pusha och skapa draft-PR mot master. Sätt backloggradens
PR-referens och gör same-PR-arkivering enligt BUG-SWARM-BACKLOG.md. Fixed-raden
lämnar bara Aktiv kö genom PR:n som faktiskt mergas.

I full mode, registrera PR och exakt 40-teckens head-SHA:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name draft-pr --pr PR --sha FULL_HEAD_SHA

I pilot: verifiera via GitHub att PR:n är draft och registrera beviset explicit:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name draft-pr --pr PR --sha FULL_HEAD_SHA --is-draft true

Pausa sedan här, pausa automationen och visa PR, run-id samt promotionCode.
State tillåter inte nästa stage utan verifierat draft-bevis och giltig
capability-promotion.

I evaluation: verifiera via GitHub att PR:n är draft och att titel/body har de
exakta adminmarkörerna. Registrera därefter spärrarna tillsammans med PR/SHA:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name draft-pr --pr PR --sha FULL_HEAD_SHA --is-draft true --merge-forbidden true --admin-review-required true --pr-title-prefix "[DO NOT MERGE — ADMIN REVIEW REQUIRED]" --pr-body-marker "AUTOMATED GODNATT-BUGG EVALUATION."

Lägg befintlig `do-not-merge` eller `admin-review-required`-label om den finns
och registrera den med `--blocking-label LABEL`. Skapa ingen repo-label för
testet. Kontrollera draft/adminmarkörerna på nytt före evaluation-complete.

### 8. Review-fönster och högst tre PR-reviewpass

I full mode: gör PR:n ready och följ
[pr-merge-cleanup.md](references/pr-merge-cleanup.md). Repots gräns är 7
minuter från den aktuella head-körningens jobbstart; required check
review-window är teknisk sanning och startas om av ny head-SHA.

I evaluation: håll PR:n i draft. Låt normal automation reviewa; fall tillbaka
till lokal Bugbot/manuell bugggranskning enligt repots ordning om en användbar
review saknas. Registrera reviewn medan stage förblir draft-pr. Efter ny commit
uppdaterar du samma draft-pr-stage med aktuell SHA och reviewar om. Sätt aldrig
`merge:ready`, sign-off eller ready-for-review.

Vänta icke-blockerande. Läs reviews, inline-kommentarer, checks och labels för
aktuell head-SHA. Följ fallbackordningen om extern review uteblir. Registrera
varje komplett PR-review/Bugbot-pass i state:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs review --token TOKEN --source SOURCE --verdict clean --sha FULL_HEAD_SHA --note "triage"

Tillåtna källor och verdicts valideras. State stoppar pass fyra. Varje ny commit
kräver att ci-review-stagets SHA uppdateras och att en ny godkänd review
registreras för den SHA:n. Efter tre reviewpass: pausa vid kvarvarande fynd
eller rött check; taket är aldrig merge-tillåtelse.

I full mode: flytta till ci-review och sedan ready-to-merge. State kräver en
clean eller findings-fixed review för exakt aktuell head-SHA. I evaluation:
slutför draft-passet direkt från draft-pr efter motsvarande review:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs complete --token TOKEN --outcome draft-fix --evidence "PR #123 är verifierat draft/adminspärrad och omergad"

Tillåtna evaluation-outcomes är `draft-fix`, `draft-already-resolved` och
`draft-reclassified`.

### 9. Sign-off och merge

I full mode: vänta först på övriga required checks, Vercel och reviewfynd.
Posta därefter sign-off + `merge:ready`; den betrodda `review-window` blir grön
först när live head/base, signeraridentitet och ordning är verifierade. Merga
sedan endast när hela pr-merge.mdc är uppfylld: rätt base, ej draft, mergeable,
inga blockerande reviews/trådar/labels, P0/P1=0 och stabil head/base.

Läs övriga PR:er på nytt. Om base/head ändras: kör om alla SHA-känsliga gates.
Verifiera PR state och origin/master efter merge. Registrera exakt merge-SHA:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name merged --merge-sha FULL_MERGE_SHA

### 10. Cleanup-handoff och nästa pass

Ta aldrig bort current app-worktree med worktree-script eller rå git. Desktop
äger det. Efter verifierad merge:

1. git fetch origin master.
2. Bevisa landningen med antingen `merge-base --is-ancestor` eller en mergad
   GitHub-PR vars `headRefName` och `headRefOid` exakt matchar PASS_BRANCH och
   dess lokala SHA. Detta andra bevis krävs efter squash-merge; ett API-fel är
   stopp, aldrig godkänt.
3. Radera remote pass-branch bara om den fortfarande finns och ett av de exakta
   mergebevisen är grönt; använd aldrig force.
4. Lämna den utcheckade lokala branchen till appens worktree-teardown.
5. Flytta state till cleanup och complete med PR/merge-SHA som evidence.

Först complete minskar remaining. Vid kvarvarande pass sätter state minst fem
minuters cooldown och nästa automationstick får ett nytt app-worktree från
senaste master.

När state blir paused: pausa automationen men arkivera inte tasken om current
finns; worktree/branch är immutable och måste återupptas i originaltasken.
Om task/worktree försvunnit: försök inte rebind i en ny tick utan blockera för
manuell branch/PR-räddning. När state blir completed: pausa automationen och
arkivera tasken. Låt inte en femminuterstick skapa no-op tasks. Vid cooldown:
arkivera avslutat pass och låt nästa tick få nytt worktree. Vid running: behåll
task och automation aktiva. Aktivera igen endast vid uttrycklig resume/full.

Evaluation har ingen merge-cleanup. Efter varje verifierat draft-complete:

1. lämna PR:n öppen och draft;
2. lämna remote-branchen kvar för admin;
3. verifiera att inget mergats eller markerats ready;
4. vänta ut femminuters-cooldown;
5. hämta färsk origin/master och skapa nästa unika pass-branch i samma rena
   Cloud-worktree.

När evaluation blir completed: avsluta Cloud-tasken med en tabell över alla
pass och explicit bekräftelse att ingen PR mergats. Desktop-automationen ska
fortfarande vara pausad.

## Stoppa säkert

Pausa om:

- required check är röd/oklar eller P0/P1 kvarstår,
- branch/worktree/base/head/merge-SHA inte kan bevisas,
- protected-path-review eller oberoende buggkoll saknas,
- blockerande label finns,
- current/permanent worktree riskerar cleanup,
- worker rört sig utanför pass-worktreet,
- mänskligt beslut, prod-bevis, hemlighet eller irreversibel åtgärd krävs.

Rapportera run-id, SM-id, mode, stage, PR, branch/worktree, tester, reviewkälla
och antal reviewpass, blockerare, automationsstatus och exakt säkert nästa steg.
