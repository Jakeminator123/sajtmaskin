# State, lease och schemaläggning

Stateverktyget använder bara Node-standardbibliotek. Normalt lagras state här:

    <git-common-dir>/codex/godnatt-bugg/state.json

Nya app-worktrees ser därför samma batch. Sätt GODNATT_BUGG_STATE_DIR endast i
isolerade tester.

## Batch och authorization

Skapa exakt en pilot och spara promotionCode från stdout utanför repo/PR:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs begin --count 1 --mode pilot --automation-id godnatt-bugg

Skapa en uttryckligen armerad full batch:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs begin --count 9 --mode full --automation-id godnatt-bugg

Skapa en explicit draft-only Cloud-utvärdering:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs begin --count 2 --mode evaluation

Tillåtna mode är pilot, evaluation och full. Pilot kräver count 1. Evaluation
och full har count 1–25. Evaluation kan aldrig promoveras eller nå merge-stage.
Standard-cooldown är 5 minuter och standard-lease 240 minuter.

Full begin, pilot-promote och full acquire läser GitHubs aktuella preview-tip
och `config/agent-workflow.json` på den refen. `deliveryBranch` måste vara
`preview`; saknat bevis, API-fel eller gammal master-policy stoppar full-läget.
Lokala filer/flaggor kan inte ersätta live-beviset. Pilot och evaluation kan
fortsatt skapa draft-only-underlag utan att armera full eller automation.

Arbetsmutationer kräver också ett verifierat rollout-grant bundet till den
aktiva full-leasen. En redan aktiv v3/v4-lease utan det beviset får inte
fortsätta genom migration. Behåll originaltask/worktree: pausa eller gör
explicit release med rätt token och orsak, och acquire därefter med färsk
live-policyvalidering. Historik/current/reviewantal bevaras; ingen automatisk
lease-takeover eller reset är tillåten. Pilot/evaluation påverkas inte.

State lagrar bara SHA-256-hashen av pilotens slumpade capability. En scheduled
runner kan därför inte läsa state och själv promovera piloten. När användaren
uttryckligen godkänner hela grinden:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs promote --run-id RUN_ID --authorization PROMOTION_CODE --reason "ägaren anropade godnatt-bugg full för denna run"

Promote fungerar bara på pausad pilot, konsumerar capabilityn och byter till
full. Scheduled får aldrig köra begin eller promote och får inte återuppta en
evaluation-run; den tillhör en engångs-Cloud-task.

## En runner

Läs state och ta lease:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs status
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs acquire

Spara token från acquire-svaret privat; bara acquire lämnar ut den. State lagrar
endast tokenhash och status/mutationssvar maskerar privata leaseuppgifter.
Historisk v3-klartextlease hashmigreras till v5 under lås utan att status eller lease
återställs; även historik redigeras. Motstridigt hash/token-bevis stoppar
framsteg. En aktiv lease får aldrig tas över; utgången lease kräver fortsatt
uttrycklig recover och inspektion.
Aktiv lease, cooldown, paused och completed har
egna exit paths så att en tick kan avsluta utan parallellt arbete.

Mutexlåset får aldrig automatiskt raderas bara för att det är gammalt. Vid
kvarlämnat lås: inspektera processen och gör en uttrycklig, separat återställning;
ingen runner får ta över en möjlig aktiv process.

Stale lease får inte tas över automatiskt. Kontrollera först PR, task, branch,
worktree och senaste state:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs recover --run-id RUN_ID --reason "verifierad avbruten runner; inga processer eller mutationer pågår"
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs acquire

## Kandidat och stages

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs queue
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs claim --token TOKEN --sm-id SM-022

Flytta exakt ett stage i taget i full mode:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name verified
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name investigated
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name worktree-ready --branch fix/sm-022-cleanup --worktree ABSOLUTE_APP_WORKTREE
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name implemented
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name reviewed
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name draft-pr --pr 123
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name ci-review
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs review --token TOKEN --source independent-agent --reviewer-model gpt-5.6-sol --reviewer REVIEW_TASK_ID --verdict clean --reviewed-sha 40_HEX_HEAD_SHA --reviewed-base-sha 40_HEX_PREVIEW_BASE_SHA --note "inga trovärdiga fynd"
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name ready-to-merge
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name merged
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name cleanup

Pilot registrerar samma PR först efter GitHub-verifiering att den fortfarande
är draft och stannar därefter vid `draft-pr`:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name draft-pr --pr 123

Evaluation registrerar draft/adminspärren på draft-pr-staget och stannar där:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs stage --token TOKEN --name draft-pr --pr 123
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs review --token TOKEN --source independent-agent --reviewer-model gpt-5.6-sol --reviewer REVIEW_TASK_ID --verdict clean --reviewed-sha 40_HEX_HEAD_SHA --reviewed-base-sha 40_HEX_PREVIEW_BASE_SHA --note "inga trovärdiga fynd"
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs complete --token TOKEN --outcome draft-fix --evidence "PR #123 verifierad draft/adminspärrad och omergad"

State spärrar:

- bakåtsteg och hopp,
- pilot och evaluation efter draft-pr,
- evaluation-draft utan exakta titel-/body-/admin-/mergeförbudsmarkörer,
- evaluation-complete utan clean/findings-fixed review på aktuell head/base-SHA,
- återval av ett SM-id som redan skippats eller slutförts i batchen,
- ogiltig/ändrad branch, worktree eller PR,
- saknad 40-hex head/merge-SHA,
- ready-to-merge utan clean/findings-fixed review på aktuell head/base,
- fler än tre PR-reviewpass,
- full-complete före cleanup och evaluation-complete utanför draft-pr,
- mutation efter worktree-ready från annan cwd än registrerad app-worktree.

CLI:n återläser live PR för PR-/review-/merge-/complete-steg. Basen måste vara
preview; nummer, head-branch, head-SHA och aktuell lokal branch/HEAD måste
matcha registreringen. Initialt krävs öppen draft i alla lägen. Full går vidare
först efter faktisk ready-övergång och räknar pass först efter verifierad merge.
Evaluation kräver färskt öppet draft-/adminbevis även vid complete. Flaggor och
fri `--evidence`-text är inte bevis; API-fel eller äldre ofullständig registrering
stoppar framsteg utan att historik skrivs om. Live base-SHA hämtas från aktuell
preview-ref, aldrig PR-API:ets historiska `base.sha`.

Vid legitim ändring av head eller preview-bas före ready: återregistrera det
aktuella draft-pr- eller ci-review-staget och kör ny granskning. Efter
ready-to-merge krävs det explicita återsteget:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs re-review --token TOKEN --reason "preview flyttades; nya SHA kräver omgranskning"

Detta är det enda kontrollerade återsteget: samma PR/branch/worktree bevaras,
ny live-evidence registreras och gamla reviews ogiltigförklaras. Trepassgränsen
och historiken nollställs aldrig. Kör nya tester och head/base-bunden review
innan nästa ready; API-fel eller ändrad identitet är stopp.

En migrerad v3/v4-full-run i ci-review eller senare kan sakna base-bundna leveransbevis. För
kontrollerad räddning krävs samma original-worktree, branch, PR och head, och
att PR:n åter är öppen draft mot preview:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs rebaseline-legacy --token TOKEN --reason "inspekterad v3-run återregistreras som draft"

Gamla base-lösa reviews blir ogiltiga men historik och förbrukade reviewpass
bevaras. Nytt draft-bevis påstås aldrig vara historiskt bevis. Master-PR, mergad
PR, annan worktree eller annan head får inte rebindas eller återställas tyst.

Review source: independent-agent, bugbot, bugbot-local, codex eller manual.
`pr-ai-review` är pensionerad: äldre historik får läsas, inga nya pass registreras.
Review verdict: clean, findings-fixed eller blocked. `--reviewed-sha` och
`--reviewed-base-sha` är obligatoriska påståenden om granskarens faktiska diff;
de måste matcha live PR, aktuell preview-tip och registreringen. SHA hämtas
inte som ersättning för en föråldrad review. Ange faktisk modell/reviewer.

Förnya legitimt långt arbete:

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs heartbeat --token TOKEN

Räkna full-pass först efter verifierad merge till preview och cleanup-ready-handoff.
Detta är leveransbevis, inte produktionsrelease; master kräver separat promote.

Cleanup och complete återläser mergad PR, ren registrerad worktree med exakt
PR-head, lyckad `git ls-remote` utan remote pass-ref och GitHub-ancestry från
mergecommiten till live preview. Identisk tip eller verifierad descendant
godtas; rewind/divergence/oklart bevis stoppar. Git-/nätverksfel stoppar;
enbart fri text eller en gammal PR-snapshot räcker inte. Desktop-teardown sker
efter terminalt pass och är inte något stateverktyget har verifierat.

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs complete --token TOKEN --outcome fixed --evidence "PR #123 merged; remote absent and clean registered worktree ready for Desktop handoff"

Outcome: fixed, already-resolved eller reclassified.

Evaluation-outcome: draft-fix, draft-already-resolved eller
draft-reclassified. `completedPasses` räknar terminala pass i valt mode;
`mergedPasses` och `draftPasses` skiljer faktiskt mergade full-pass från
adminspärrade evaluation-drafts. Evaluation sätter samma cooldown mellan pass,
men samma Cloud-task får reacquire efter `notBefore` och välja ett nytt SM-id.

## Skip, pause, resume och release

    node .agents/skills/godnatt-bugg/scripts/run-state.mjs skip --token TOKEN --reason "kräver prod-reproduktion"
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs pause --token TOKEN --reason "pilot-PR #123 väntar på explicit full-mandat"
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs resume --run-id RUN_ID --reason "blockeraren är löst; behåll befintligt mode"
    node .agents/skills/godnatt-bugg/scripts/run-state.mjs release --token TOKEN --reason "kontrollerad handoff"

Skip minskar inte remaining. Resume behåller mode och kan alltså inte göra en
pilot mergebar. Efter worktree-ready är skip förbjudet; använd pause och bevara
branch/PR. Release bevarar current/stage men släpper runner-leasen.

## Desktop-automation

Automationens stabila id är godnatt-bugg. Den ska vara projektbunden,
worktree-isolerad och initialt PAUSED. Modell: gpt-5.6-sol. Reasoning: xhigh.
Femminuterstickens prompt:

    Use $godnatt-bugg scheduled to resume exactly one safe pass. Never begin or promote a batch. Pause this automation when state is paused, completed, or missing.

Aktivera först när användaren skapat en full batch. Pilot körs interaktivt och
evaluation i Cloud med automation fortsatt pausad. State-cooldown garanterar
minst fem minuter mellan pass; fasta tickar ger normalt 5–10 minuter efter
föregående cleanup.

Varje tick gör högst ett pass. Vid busy/cooldown avslutar den. Vid missing eller
completed sätter den automationen PAUSED och arkiverar sin task. Vid paused
sätter den automationen PAUSED men behåller tasken när current finns: resume
måste ske i originaltaskens immutable worktree. En ny scheduled-worktree får
aldrig rebindas till en pausad branch. Detta förhindrar både no-op-runs och att
samma branch försöker checkas ut i två worktrees.

Skapa/uppdatera aldrig genom rå automationsfil eller egen schematext i repot.
Använd Desktop automation-API/UI och projektet `sajtmaskin`. Lokala
scheduled tasks kräver att app och maskin är igång.
