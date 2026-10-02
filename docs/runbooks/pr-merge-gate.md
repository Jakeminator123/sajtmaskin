# PR-merge-grinden: varför den finns

Operativ owner är [pr-merge.mdc](../../.cursor/rules/pr-merge.mdc).
Körordning: [PR-workflow](../../.agents/skills/pr-workflow/SKILL.md).
Checks, tidsgolv och trust roots: [agent-workflow.json](../../config/agent-workflow.json).
Sammanhang och manuella undantag: [agent-workflow](agent-workflow.md).
Git är historik; äldre incidentlösningar är inte nya mergemandat.

## CI, review och mandat är olika bevis

`quality`, `backoffice-tests`, `schema-drift`, `build` och övriga policychecks
bevisar sina tekniska kontrakt för aktuell head. `review-window` kontrollerar
required CI, säkerhet, deployment, live head/base och tids-/provenienskrav.
Den kan bli grön före ready-label och är inte bevis för oberoende review.

Oberoende bugggranskning kräver en separat granskare och triage av konkreta
fynd. Modellval är inte procedurnamn. Externa Cursor-/Codex-/Bugbot-kvitton är
opportunistisk evidens: bara success räknas som utförd review, aldrig neutral,
quota, skip eller stale. Saknat kvitto blockerar inte CI och ger inte merge-
behörighet. Egen attest ersätter inte en separat granskare.

Den automatiska betalda API-review-workflowen är pensionerad. Historiska
konto-/API-kvitton och deras parsers kan läsas som data; en manuell runner finns
kvar men får inte återinföras som automatisk eventväg utan nytt ägarbeslut.
Se [granskningsflödet](github-pr-review-automation.md).

## Kommentar före label

Ready-kommentaren binder till exakt aktuell head och base. Label-eventet
återläser levande refs; en gammal PR-base eller tidigare grön check räcker inte.
Fel ordning, ny head/base eller senare fynd gör ready-evidensen stale.
Därför skrivs kommentaren före labeln, efter kontroller och oberoende review.
`merge:ready` krävs för finalkommandot, inte för grön `review-window`.

## Varför final merge är ett betrott issue_comment-kommando

Vanlig preview-merge utförs av default-branch-kod, inte PR-head-kod med
skrivtoken. En verifierad mänsklig OWNER/MEMBER/COLLABORATOR måste ge ett
färskt SHA-bundet finalmandat. Författarskap eller grön CI räcker inte.

Controllern återläser live checks, reviews och kommentarer, kräver mandat
senare än evidensen, jämför en fingerprint över ett settle-fönster och läser
base/compare igen före expected-head-squash. Redigerade äldre reviewfynd
räknas med sina serverbundna uppdateringstider. Den exakta logiken och testerna
ägs av [trusted-review-window.mjs](../../scripts/ci/trusted-review-window.mjs).

Checknamn eller GitHub Actions-appidentitet är inte tillräcklig proveniens:
andra workflows kan publicera liknande namn. Controllern verifierar deklarerad
ägar-workflow, PR/head, event, senaste tillämpliga run/attempt samt jobb/steg-
bindning. Steglösa custom checks ersätter inte canonical core-jobb.

## Produktion, bootstrap och synk

Controllern tar preview, aldrig master. Produktion kräver promote-PR, varning
och extra uttrycklig bekräftelse efter varningen, följt av manuell merge.
CI-trust roots kräver separat ägarbootstrap; kontrollern godkänner inte sin
egen förändring. Ancestry-synk efter release kräver separat preview-PR och
manuell expected-head-merge med merge-commit, aldrig squash/merge:execute.

Undantagen ersätter inte CI, review, tidsgolv eller DB-riskkontroll. Ingen
generell admin-fallback finns. Preview delar produktions-DB och kan köra
prodjobb även utan ny SQL; en kodrevert återställer inte DB-effekter.

## Vad GitHub inte bevisar

Native rulesets, bypasser och merge methods måste läsas live. En expected-
projektion i repot är inte runtime enforcement. Befintliga lösa skydd
skärps inte automatiskt av dessa regler. Manuell synk kräver att GitHub faktiskt
tillåter merge-commit.

Expected head skyddar mot head-race, inte atomiskt base-race. Serialisering
och sista base-läsning minskar risken, men gör inte UI/API kryptografiskt
likvärdigt med controllern. Cursor-dashboardens mergare ligger utanför repo-
regler; usage limit är inte en avstängning.

Efter lyckad merge kan efterkontrollen fallera trots att PR:n redan är
terminal. Kör då om/reparera efterkontrollen; försök inte merga PR:n igen.
