# Agentarbete: preview först, produktion separat

Körordning: [PR-workflow](../../.agents/skills/pr-workflow/SKILL.md).
Mergekrav: [pr-merge.mdc](../../.cursor/rules/pr-merge.mdc).
Värden/checks: [agent-workflow.json](../../config/agent-workflow.json).

Jobba i den öppna checkouten från färsk `origin/preview`; worktree och
Scout/Builder/Steward är opt-in. Godnatt har egna isoleringskrav.
`origin/master` används för produktionspåståenden. `verify:pr --plan` väljer
preview och visar riktade kontroller. CI kör tung profil eller light-kvitto;
full lokal verify krävs när verifieringsmotorn ändras.

| Syfte | Väg |
|---|---|
| Vanlig leverans | Separat mergeuppdrag; manuell squash till preview med expected head |
| Produktion | Promote-PR till master; extra bekräftelse efter varning, manuell expected-head-merge |
| CI-trust roots | Separat dokumenterad ägarbootstrap och oberoende review; manuell merge |
| Ancestry-synk | Dedikerad preview-PR vars head innehåller båda tipsen; separat uppdrag, merge-commit |

Efter varje merge hämtas ny preview och återstående PR:ers refs, diffar,
checks och review omvärderas. Ready-label, grön CI och externa reviewkvitton
ger inget mergemandat. Ingen `--auto` eller `--admin` används.

`review-window` observerar CI, säkerhet, deployment, proveniens och live refs.
Den bevisar inte oberoende review. Den skriver checks och tar bort stale labels,
men utför inga merges eller post-merge-dispatches. Trust-root-filer ger en
avsiktlig bootstrap-spärr; övriga checks och review gäller även där.

Promote skapar en kortlivad `promote/<datum>`-gren. Använd aldrig preview som
PR-head mot master, eftersom auto-delete annars kan radera staging.
Efter squash-release kan preview sakna masters nya commit; synka då via den
dedikerade merge-commit-vägen i merge-regeln före nästa promote.

Preview delar produktions-DB. Startup, Git-posthooks och CI applicerar inte
schema, migrationer eller prestandaindex; livekontroller verifierar målidentitet
och läser. DB-apply kräver separat uttryckligt mandat. En kodrevert återställer
inte databasändringar.

GitHub rulesets, bypasser och merge methods är externa owners och läses live.
Repo-policyn ersätter inte native skydd. Expected head skyddar mot head-race,
men base måste läsas direkt före merge. Undvik parallella mergare och verifiera
mergecommittens CI/deployment. Misslyckad efterkontroll innebär inte att PR:n
ska mergas igen. Cursor-dashboardens mergare styrs separat från repot.

Rapportera head/base, verifiering, reviewkälla, berörda följdytor och kvarvarande
risk. Produktion och DB-apply behåller sina egna uttryckliga mandat.
