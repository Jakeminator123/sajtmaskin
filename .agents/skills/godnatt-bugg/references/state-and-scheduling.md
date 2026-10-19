# State, lease och schemaläggning

`run-state` = `node .agents/skills/godnatt-bugg/scripts/run-state.mjs` (bara
Node-standardbibliotek). State ligger i `<git-common-dir>/codex/godnatt-bugg/state.json`
så att nya app-worktrees ser samma batch; `GODNATT_BUGG_STATE_DIR` bara i
isolerade tester.

## Batch och authorization

    run-state begin --count 1 --mode pilot --automation-id godnatt-bugg
    run-state begin --count 9 --mode full --automation-id godnatt-bugg
    run-state begin --count 2 --mode evaluation

Pilot kräver count 1; evaluation och full har count 1–25. Evaluation kan aldrig
promoveras eller nå merge-stage. Standard: cooldown 5 minuter, lease 240 minuter.

Full begin, pilot-promote och full acquire läser GitHubs aktuella preview-tip och
`config/agent-workflow.json` på den refen: `deliveryBranch` måste vara
`preview`. Saknat bevis, API-fel eller gammal master-policy stoppar full-läget;
lokala filer/flaggor ersätter inte live-beviset. Pilot och evaluation kan skapa
draft-only-underlag utan att armera full eller automation.

Arbetsmutationer i full kräver ett verifierat rollout-grant bundet till den
aktiva leasen. En aktiv v3/v4-lease utan det får inte fortsätta genom migration:
behåll originaltask/worktree, pausa eller gör explicit `release` med rätt token
och orsak, och `acquire` därefter med färsk live-policy. Historik, current och
reviewantal bevaras; ingen automatisk takeover eller reset.

State lagrar bara SHA-256 av pilotens capability, så en scheduled runner kan inte
promovera själv. När användaren uttryckligen godkänner hela grinden:

    run-state promote --run-id RUN_ID --authorization PROMOTION_CODE --reason "ägaren anropade godnatt-bugg full för denna run"

Promote fungerar bara på pausad pilot, konsumerar capabilityn och byter till
full. Scheduled får aldrig köra begin eller promote och aldrig återuppta en
evaluation-run.

## Lease

    run-state status
    run-state acquire

Bara `acquire` lämnar ut token; state lagrar tokenhash och svar maskerar privata
leaseuppgifter. Historisk v3-klartextlease hashmigreras till v5 under lås utan
att status eller lease återställs; motstridigt hash/token-bevis stoppar. En
aktiv lease tas aldrig över. Aktiv lease, cooldown, paused och completed har
egna exit paths så att en tick kan avsluta utan parallellt arbete.

Mutexlåset raderas aldrig automatiskt för att det är gammalt: inspektera
processen och återställ uttryckligt och separat. Stale lease: kontrollera PR,
task, branch, worktree och senaste state först:

    run-state recover --run-id RUN_ID --reason "verifierad avbruten runner; inga processer eller mutationer pågår"
    run-state acquire

## Kandidat och stages

    run-state queue
    run-state claim --token TOKEN --sm-id SM-022
    run-state stage --token TOKEN --name <stage>
    run-state stage --token TOKEN --name worktree-ready --branch fix/sm-022-cleanup --worktree ABSOLUTE_APP_WORKTREE
    run-state stage --token TOKEN --name draft-pr --pr 123
    run-state review --token TOKEN --source independent-agent --reviewer-model gpt-5.6-sol --reviewer REVIEW_TASK_ID --verdict clean --reviewed-sha 40_HEX_HEAD_SHA --reviewed-base-sha 40_HEX_PREVIEW_BASE_SHA --note "inga trovärdiga fynd"

Full flyttar exakt ett stage i taget i ordningen `verified` → `investigated` →
`worktree-ready` → `implemented` → `reviewed` → `draft-pr` → `ci-review`
(review) → `ready-to-merge` → `merged` → `cleanup`. Pilot stannar vid `draft-pr` efter
GitHub-verifierad draft. Evaluation registrerar draft/adminspärren på
`draft-pr`, granskar där och slutförs därifrån:

    run-state complete --token TOKEN --outcome draft-fix --evidence "PR #123 verifierad draft/adminspärrad och omergad"

State spärrar:

- bakåtsteg och hopp; pilot och evaluation efter draft-pr;
- evaluation-draft utan exakta titel-/body-/admin-/mergeförbudsmarkörer;
- evaluation-complete och ready-to-merge utan clean/findings-fixed review på
  aktuell head/base-SHA;
- återval av ett SM-id som redan skippats eller slutförts i batchen;
- ogiltig/ändrad branch, worktree eller PR; saknad 40-hex head-/merge-SHA;
- fler än tre PR-reviewpass;
- full-complete före cleanup och evaluation-complete utanför draft-pr;
- mutation efter worktree-ready från annan cwd än registrerad app-worktree.

CLI:n återläser live PR för PR-/review-/merge-/complete-steg: base preview och
matchande nummer, head-branch, head-SHA och lokal branch/HEAD. Initialt krävs
öppen draft i alla lägen; full går vidare först efter faktisk ready-övergång och
räknar pass först efter verifierad merge. Flaggor och fri `--evidence`-text är
inte bevis; API-fel eller ofullständig registrering stoppar utan att historik
skrivs om. Live base-SHA hämtas från aktuell preview-ref, aldrig PR-API:ets
historiska `base.sha`.

Ändrad head eller preview-bas före ready: återregistrera aktuellt draft-pr- eller
ci-review-stage och granska om. Efter ready-to-merge är detta enda återsteget:

    run-state re-review --token TOKEN --reason "preview flyttades; nya SHA kräver omgranskning"

Samma PR/branch/worktree bevaras, ny live-evidence registreras och gamla reviews
ogiltigförklaras; trepassgränsen och historiken nollställs aldrig.

En migrerad v3/v4-full-run i ci-review eller senare utan base-bundna
leveransbevis kan räddas om original-worktree, branch, PR och head är samma och
PR:n åter är öppen draft mot preview:

    run-state rebaseline-legacy --token TOKEN --reason "inspekterad v3-run återregistreras som draft"

Gamla base-lösa reviews blir ogiltiga; historik och förbrukade pass bevaras.
Master-PR, mergad PR, annan worktree eller annan head rebindas aldrig.

Review source: `independent-agent`, `bugbot`, `bugbot-local`, `codex` eller
`manual` (`pr-ai-review` är pensionerad). Verdict: `clean`, `findings-fixed` eller
`blocked`. `--reviewed-sha` och `--reviewed-base-sha` är obligatoriska påståenden
om granskarens faktiska diff och måste matcha live PR, preview-tip och
registrering. Ange faktisk modell/reviewer.

Förnya legitimt långt arbete med `run-state heartbeat --token TOKEN`.

Cleanup och complete återläser landning, remote-absence och worktree enligt
[pr-merge-cleanup.md](pr-merge-cleanup.md); det är leveransbevis, inte
produktionsrelease eller verifierad Desktop-teardown.

    run-state complete --token TOKEN --outcome fixed --evidence "PR #123 merged; remote absent and clean registered worktree ready for Desktop handoff"

Full-outcome: `fixed`, `already-resolved`, `reclassified`. Evaluation-outcome:
`draft-fix`, `draft-already-resolved`, `draft-reclassified`. `completedPasses`
räknar terminala pass i valt mode; `mergedPasses` och `draftPasses` skiljer dem
åt. Evaluation har samma cooldown men samma Cloud-task får reacquire efter
`notBefore` och välja ett nytt SM-id.

## Skip, pause, resume och release

    run-state skip --token TOKEN --reason "kräver prod-reproduktion"
    run-state pause --token TOKEN --reason "pilot-PR #123 väntar på explicit full-mandat"
    run-state resume --run-id RUN_ID --reason "blockeraren är löst; behåll befintligt mode"
    run-state release --token TOKEN --reason "kontrollerad handoff"

Skip minskar inte remaining och är förbjudet efter worktree-ready (pausa och
bevara branch/PR). Resume behåller mode och kan inte göra en pilot mergebar.
Release bevarar current/stage men släpper leasen.

## Desktop-automation

Stabilt id `godnatt-bugg`, projektbunden, worktree-isolerad och initialt PAUSED.
Modell `gpt-5.6-sol`, reasoning `xhigh`. Prompt för femminuterstick:

    Use $godnatt-bugg scheduled to resume exactly one safe pass. Never begin or promote a batch. Pause this automation when state is paused, completed, or missing.

Aktivera först när användaren skapat en full batch; pilot körs interaktivt och
evaluation i Cloud med automationen pausad. Varje tick gör högst ett pass;
reaktion per state står i SKILL.md steg 10.

Skapa/uppdatera aldrig via rå automationsfil eller schematext i repot; använd
Desktop automation-API/UI och projektet `sajtmaskin`. Lokala scheduled tasks
kräver att app och maskin är igång.
