# Agentarbete: preview först, produktion separat

Körordningen ägs av [PR-workflow](../../.agents/skills/pr-workflow/SKILL.md),
mergekraven av [pr-merge.mdc](../../.cursor/rules/pr-merge.mdc), värden och
checks av [config/agent-workflow.json](../../config/agent-workflow.json).
Denna guide förklarar ansvar och undantag; den är ingen andra checklista.

## Lokalt arbete

Jobba normalt i den öppna checkouten, i Codex eller Cursor. Worktree och
Scout/Builder/Steward används bara när Jakob beställer dem. Godnatt är ett
uttryckligt opt-in med sina egna isoleringskrav, inte standard för andra jobb.

Vanligt utvecklingsarbete utgår från färsk `origin/preview`. Använd
`origin/master` som granskningsbas bara för produktionspåståenden.
`verify:pr --plan` väljer preview som default och visar riktade kontroller;
CI väljer fail-closed tung profil eller ett explicit light-kvitto.
Full lokal verify krävs när själva verifieringsmotorn ändras.
Installera repots hooks vid färsk clone eller workflowändring.

Bevara andras ändringar. En PR per avgränsat ägarskap; överlappande PR:er
hanteras seriellt. Efter varje merge hämtas ny preview och återstående
diffar, head/base, checks och review omvärderas.

## Mergevägar

| Syfte | Väg |
|---|---|
| Vanlig leverans till preview | Separat mergeuppdrag och den betrodda `merge:execute`-controllern; squash |
| Produktion | Promote-PR till master, extra bekräftelse efter produktionsvarningen; manuell expected-head-merge |
| CI-trust-root-bootstrap | Separat ägarbeslut; manuell expected-head-merge till preview |
| Ancestry-synk efter release | Dedikerad synk-PR till preview, uttryckligt merge-commit-uppdrag; manuell expected-head-merge, aldrig squash |

Ingen generell admin-, UI- eller API-fallback för vanliga PR:er. De manuella
undantagen ersätter inte CI, oberoende bugggranskning, färskt head/base,
tidsgolv, triage eller DB-riskkontroll.

Preview och produktion delar databas. Även SQL-fri preview-merge eller
CI-dispatch kan starta jobb mot produktions-DB; en kodrevert återställer inte
databasändringar. Okända eller otillåtna dataeffekter är stopp.

## Granskning är inte CI

Oberoende bugggranskning är arbetsmetoden. Modellen väljs enligt
[subagent-models.mdc](../../.cursor/rules/subagent-models.mdc); ”Sol” är inte
procedurnamnet. Författaren är inte sin egen oberoende granskare.

`review-window` verifierar CI, säkerhet, deployment, proveniens och live
head/base. Den väntar inte på `merge:ready` och bevisar inte oberoende review.
Externa reviewkvitton är optional; neutral, quota, skip och stale är inte pass.
Konkreta externa fynd måste ändå triageras. Den betalda API-workflowen är
pensionerad; historiska parsers och manuell runner är inte automatisk review.

Kommentar före `merge:ready`-label och slutligt mänskligt mandat följer
`pr-merge.mdc`. Finalcontrollern återläser evidensen live och serialiserar
preview-merges. Ingen PR blir mergegodkänd bara för att en check är grön.

## Ancestry-synk efter en release

Promote skapar en kortlivad `promote/<datum>`-gren från preview, aldrig en PR
med preview som head: GitHub kan annars radera staging vid auto-delete.
Kommandot skapar PR, inte release eller dold master→preview-synk.
Osläppt innehåll avgörs av faktisk träddiff.

Efter squash-release saknar preview masters nya tip. Bered då en separat
branch från färsk preview som tar in master med merge-commit. Head ska
innehålla båda live tipsen och inga blandade featureändringar. Begär separat
manuell expected-head-merge med merge-commit, utan `--admin` eller
`merge:execute`. Verifiera efteråt master-ancestry och CI på nya preview.

GitHub måste tillåta merge-commit; verifiera live `allow_merge_commit` och
målgrenens ruleset före denna väg. Repot tillät metoden vid kontroll
2026-10-02. Trust-root-diff kräver dessutom bootstrapbeslut.

## Särskilt spår för CI-trust roots

`manualMergePathPrefixes` och det oberoende golvet i workflow-kontraktet
hindrar PR-kod från att godkänna sin egen controller/scope/policy-ändring.
Nuvarande och tidigare namn räknas vid rename. Sådana PR:er går inte genom
vanlig `merge:execute`; de behöver separat dokumenterad ägarbootstrap.
Röd/pending CI, blockerande fynd och okända DB-effekter får inte bypassas.

## Live inställningar och kvarvarande gränser

GitHub rulesets och merge methods är externa owners. Repo-projektioner,
CODEOWNERS eller gamla snapshots bevisar inte live enforcement. Native skydd
har inte skärpts i denna förenkling; ägarbeslutet om lösa skydd behålls.
Expected head låser head, men GitHub saknar motsvarande atomiskt base-SHA-lås.
Färsk base-läsning och serialisering minskar, men stänger inte, base-racet.

Cursor-dashboardens PR-mergare är en separat automation. Repo-regler kan inte
stänga av den; quota/neutral är inte bevis för avstängning. Undvik parallella
mergare innan preview-controllern används.

Efter controllermerge invalideras gammal base-evidens och `ci.yml` dispatchas
på preview, eftersom `GITHUB_TOKEN`-merge inte normalt startar push-workflows.
`POST_MERGE_VERIFICATION_FAILED` betyder att PR:n redan är mergad men
efterkontrollen föll: reparera/rerun efterkontrollen, merga inte samma PR igen.
`db-blob-sync-check.yml` är separat master-ägd; det gör inte andra DB-jobb
master-only.

Rapportera faktisk branch/head/base, verifiering, reviewkälla, berörda
Backoffice-/schema-/policyföljder och kvarvarande risk. Produktion och DB-apply
kräver fortfarande sina egna uttryckliga mandat.
