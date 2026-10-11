# Agentarbete: preview först, produktion separat

Körordning: [PR-workflow](../../.agents/skills/pr-workflow/SKILL.md). Mergekrav:
[pr-merge.mdc](../../.cursor/rules/pr-merge.mdc).

Jobba från färsk `origin/preview`. Kör riktade kontroller och commit:a exakt
uppgiftens paths. `npm run bugpass -- --base <preview-SHA>` förbereder ett uppdrag
för en separat readonly-granskare med ny kontext. Importera dess verkliga
resultat, triagera och fixa före push. Ingen WSL eller särskild CLI krävs.
`npm run preview:prepare` kräver aktuell godtagbar review och kör endast plan,
inte tester. Redovisa faktiskt körda riktade kontroller enligt PR-workflow.
Fråga därefter Jakob "Är du säker på att du vill pusha?" med exakt SHA;
`npm run preview:push -- --confirm <SHA>` får bara förmedla hans faktiska svar.
Pre-push-hooken kontrollerar review-/plankvittot utan modellstart eller tester.
Ingen extra AI-review körs efter push. CI/deploy verifieras
separat efter push. Se [Buggpass](github-pr-review-automation.md)
för lokal/server-side gräns och den kvarvarande PR-vägen.
För direktpreview får Jakobs befintliga adminundantag användas efter
SHA-bekräftelsen. Om den lokala granskaren inte kan starta används PR-vägen;
ingen sandbox-bypass, uppluckring för andra användare eller Master-ändring.

Vid PR: kör lokal plan och riktade kontroller; GitHub
Actions äger full verifiering. Safe docs och vanliga drafts får ett explicit
light-kvitto, medan ready kod, beroenden och osäker klassificering får full
profil. Draft→ready och ny head startar rätt profil; stale körningar avbryts.

GitHubs live rulesets, required checks, reviews och trådstatus avgör om PR:n är
mergebar. Relevant oberoende review krävs för kod. Säkerhet, betalning, databas
och CI-behörigheter kräver riktad review och ett ownerbeslut i PR:n. Ett vanligt
koduppdrag är inte mergemandat, men ett uttryckligt villkorat mandat behöver
inte efterfrågas igen när dess native villkor uppfyllts.

Native auto-merge används endast för allowlistade Dependabot-patchar som den
betrodda default-branch-controllern har innehållsvaliderat. Övriga PR:ar använder
GitHubs vanliga manuella merge. Ingen PR-head-kod får skrivtoken eller
produktionshemligheter.

Produktion uppdateras via separat promote-PR till `master`, extra varning och ny
bekräftelse. Preview och Development delar DEV; Production använder PROD enligt
[`config/db-targets.json`](../../config/db-targets.json). Merge/CI/deploy applicerar inget
schema. DB-apply och produktionsdata kräver eget uttryckligt mandat.
