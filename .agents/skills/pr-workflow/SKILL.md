---
name: pr-workflow
description: "Sajtmaskins agent→branch→PR→review→merge-flöde. Använd vid skrivarbete, commit, push, PR, CI-fix, merge eller städning efter PR."
---

# PR-workflow

Värden ägs av `config/agent-workflow.json`; mandat och förbud av `git.mdc`;
mergegrind av `pr-merge.mdc`. Default: vanlig repo-agent i den öppna checkouten,
ingen tvingad worktree, inget branchprefix och ingen roll om inte Jakob nämner en.

## 1. Starta

Vid ny chatt: `npm run handoff:list`. Tom lista kräver inget mer. Finns handoff,
följ [val/läsning/kvittens](../../../docs/runbooks/agent-handoff.md); läs inte
innehåll före Jakobs val. Samma runbook äger temporär agentcache och avslut.

1. `npm run hooks:install` vid ny clone eller hookändring.
2. **Välj bas medvetet — de två är inte samma sak:**
   - *Leveransbas* = grenen PR:en ska mot, default `preview`. Branchen utgår
     normalt från färsk `origin/preview`, även när buggen är ett
     produktionspåstående, så att diffen har det som redan ligger i staging.
   - *Granskningsbas* = det du bevisar mot: `origin/master` när påståendet gäller
     produktion (backloggens «Bevis på `master`», prodrepro, promote). Läs den
     read-only (`git show origin/master:<sökväg>`); bygg inte branchen på den.

   Undantag: en uttryckligen beställd nödfix i produktion utgår från färsk
   `origin/master`, så orelaterat staging-arbete inte följer med (§ 4b).

   Hämta den du använder och frys basens SHA när flera kandidater eller agenter
   ska jämföras.
3. En skrivande session per checkout, i Codex eller Cursor. Worktree när Jakob
   ber om det (`agent-worktree.mdc`).
4. Kontrollera öppna PR:er för samma owner om ändringen kan krocka.

Skyddade sökvägar är inte förbjudna: ta med owner och följdytor (schema,
Backoffice, test, docs); CI kör full profil.

## 2. Ändra owner först

Körbar/deklarativ owner före schema, genererad projektion och prosa. Kör
`npm run verify:pr -- --plan` tidigt. `strict` är formatkontrakt, inte
runtime-enforcement; läs rapportens `runtimeStatus`.

## 3. Synka och verifiera

- `npm run sync:derived` när owners ändrats.
- `npm run verify:pr -- --plan` när diffen fått form och före push; direktpreview
  återanvänder `preview:prepare`-planen, den uttryckliga hotfix-PR-vägen nedan
  återanvänder `hotfix:prepare`, övriga pushar planeras i hooken.
- Kör relevanta riktade kontroller och redovisa dem i PR:n. Bare
  `npm run verify:pr` är frivillig felsökning, inte en extra lokal fullsvit. För
  CI-/verifieringsmotorn: `npm run test:workflow`, `npm run workflow:contract`,
  typecheck och berörda integrationstester.
- GitHub Actions publicerar required checks på varje head: tung profil för ready
  runtime, högrisk och `master`; explicit light-kvitto för safe docs (även
  preview-push) och vanliga drafts. Dossiermatrisen körs bara vid promote (PR
  mot `master`), veckovis och manuellt; PR och push mot `preview` skjuter upp
  den (ägarbeslut 2026-10-22).
  Preview-genvägar kräver grön föregående push för respektive workflow; okänd,
  pågående eller fallerad bas kör full profil. `test:ci` delas på fyra
  parallella jobb som `quality` kräver. Återgång till draft startar ingen ny
  körning. Samla kända rättningar före push.
- Grönt kvitto: varje PR-körning skriver head, bas och testat träd som
  annotation på `scope`. `ready_for_review`/`reopened` med samma head, bas och
  träd som en grön full körning, och en preview-push vars träd är identiskt med
  den mergade PR:ens gröna fulla körning, publicerar lätta required checks i
  stället för att köra samma träd igen (`scripts/workflow/ci-receipt.mjs`).
  Rött, okänt eller avvikande träd kör full profil; `master` är alltid full.
- Fixa eller avfärda riktiga reviewfynd; kör om berörda riktade kontroller.

## 4. Leverera: direkt preview eller PR

**Direktpreview** (kommandon och återanvändning:
[buggpass-runbooken](../../../docs/runbooks/buggpass.md)):

1. Riktade kontroller enligt § 3; commit:a exakta paths. En committad diff som
   CI klassar `safe-docs-only` behöver inget bugpass-kvitto, men plan, bas och
   SHA-bekräftelse gäller. Andras ostageade Markdown-planer får ligga kvar;
   granskning, plan och push gäller committad HEAD.
2. `npm run bugpass -- --base <preview-SHA>` ger prompt/schema. Starta en
   **separat readonly-granskare med ny kontext**, utan föräldrachatt, i värdens
   review-/subagentfunktion och importera dess faktiska JSON och metadata.
   Författaren får aldrig utgöra sitt eget oberoende pass eller fylla i ett
   påhittat tomt resultat. Granskarens befintliga behörigheter gäller; hooken
   ger ingen sandbox.
3. Triagera: fixa, avfärda med konkret bevis eller skjut upp låg-impact P2 med
   uppföljning (fynd anger säkerhet i %, impact 1–5 och kommentar). Efter fix: ny
   commit och samma kommando; delta och integration granskas, oförändrat kvitto
   återanvänds. Stopp efter tre rundor för ägarbeslut; bara Jakobs uttryckliga
   godkännande medger en fjärde, och ett nytt ägaruppdrag efter klar review ger
   en ny cykel med hela diffen. Saknad eller ofullständig review stoppar före
   push.
4. `npm run preview:prepare` verifierar kvittot och kör planen en gång;
   `npm run preview:push -- --dry-run` kontrollerar beredskap. Fråga Jakob
   **Är du säker på att du vill pusha?** med exakt SHA, och kör efter svaret
   `npm run preview:push -- --confirm <full SHA>`. Ingen force/delete och ingen
   ny AI-körning efter push. Läs push-CI och Vercel READY separat.

Direktpreview ger ingen produktions-, DB- eller mergebehörighet. Jakobs
GitHub-adminundantag för preview får användas efter SHA-bekräftelsen
(ägarbeslut 2026-10-08) när inloggningen och undantaget faktiskt gäller; ändra
aldrig ruleset, force/delete-skydd eller master för det. Saknas fungerande
oberoende granskare: använd PR-vägen. Fabricera aldrig ett kvitto.

**PR-vägen** (spårbar diskussion eller native mergegrind):

1. Commit:a exakta paths och pusha utan force. Nya PR:er mot `preview`, med
   repots template när Jakob ber om PR.
2. GitHubs required checks och reviews avgör mergebarhet för aktuell head och
   integrationsbas. Kör om riktade kontroller lokalt bara när ett fynd eller en
   ändring motiverar det.
3. Varje konkret fynd ska vara fixat, loggat eller avfärdat. Återanvänd befintlig
   reviewer; starta inte Codex/API som parallellt obligatoriskt pass. Saknad eller
   neutral review är okänd, inte grön. Samla fynd före rättningsrundan; ny head
   kräver ett aktuellt kvitto för deltat och dess integration, inte omgranskning
   av oförändrad kod. Redovisa vilket fynd eller vilken check som blockerar.

## 4b. Promote till produktion

`master` är produktionsgrenen; `main` finns inte. Policyflaggorna
`directPreview.allowed` och `directMaster.allowed` anger tekniskt tillgängliga
vägar, inte självständigt agentmandat. Direktpush och PR till `preview` stöds
båda enligt § 4. Produktion beslutas av Jakob.

Vanligt arbete går till `preview`, även Dependabot (`target-branch` i
`.github/dependabot.yml`). När Jakob ber om release («merga preview till
master», «promota», «släpp skarpt») kör `npm run promote` (`promote:dry` visar
planen). Den skapar en kortlivad `promote/<datum>`-gren vid previews tip via
GitHubs refs-API och öppnar PR mot `master` med träddiff, båda SHA:na och
produktionsvarning. Head-grenen får **aldrig** vara `preview`:
`delete_branch_on_merge` raderade staging 2026-09-08. Kommandot mergar aldrig;
därefter gäller `pr-merge.mdc` med gröna checks, bugkoll/triage och uttrycklig
ägarbekräftelse.

Nöd-PR eller nödpush till `master` är ett separat, uttryckligt ägaruppdrag för
exakt ändring och leveransväg. Följ `pr-merge.mdc`: befintliga GitHub-grindar
och mandat gäller, inga rulesets ändras och inget force-/raderingsmandat
följer med. Återför nödfixen till `preview` via separat synk-PR.

**Isolerad hotfix-PR från färsk master:** arbeta på en oskyddad featuregren.
Återanvänd ett aktuellt oberoende Buggpass för exakt masterbas och HEAD; importera
den verkliga granskningen enligt § 4, inte ett nytt obligatoriskt AI-pass.
Den betrodda agentvärden läser Jakobs faktiska uppdrag och skriver en lokal
mandatpost med `version: 1`, `kind: "master-hotfix-feature-pr-push"`,
`repository: "Jakeminator123/sajtmaskin"`, `baseRef: "refs/heads/master"`,
fulla `base`/`head`, `destinationRef: "refs/heads/<feature>"`, konkret `scope`
och `source: { kind: "host-user-message", threadId, messageId }` från den
verkliga användarinstruktionen. Ett lokalt JSON/hash eller en kopierad uppgift
autentiserar inte människan; samma värdtillit gäller som för previewbekräftelsen.

Kör `npm run hotfix:prepare -- --destination refs/heads/<feature> --approval <mandate.json>`.
Det fryser repo/worktree, exakt origin-URL, färsk master, HEAD/träd, featuretip,
mandat, review/triage och verifieringskontrakt och kör en enda committad plan.
`npm run hotfix:push -- --dry-run` kontrollerar samma fakta igen. När ägarens
mandat täcker exakt resultat körs `npm run hotfix:push -- --confirm <full SHA>`;
fråga inte igen om samma giltiga mandat redan har lästs. Wrappern pushar bara
en featuregren, aldrig master, och hooken nekar stale/trasigt kvitto även under
CI/skip. Kvitton lagras under Git-common-dir, bundna till arbetsytan.

Öppna sedan PR mot master: full CI, dossiermatris, mergegrind och separat
previewåterföring gäller. Master kan ändras mellan sista läsningen och
featurepushen; de två remotereferenserna kan inte låsas atomiskt lokalt.
Verifiera därför aktuell integrationsbas och strict checks före merge.

En squash-release ger master en commit som saknas i `preview`. Före nästa
promote: synkbranch från färsk preview som tar in master med merge-commit, PR mot
preview och separat merge med merge-commit (inte squash eller auto-merge) enligt
`pr-merge.mdc`. Ingen blandad feature-PR. Releasetext avgörs av träddiff.

## 5. Merge och städ

Mandat enligt `pr-merge.mdc` punkt 4 (stående för vanlig PR till `preview`
efter gröna checks och MERGE från bug-koll eller oberoende review; annars
uttryckligt): `gh pr merge --squash --match-head-commit <granskad head>`.

Efter merge: kör först `npm run tidy` och kräv att ytan rapporteras som `FRI`.
Först då: `npm run worktree:remove -- <sökväg>`. Lämna huvudcheckouten på
`preview`, inte `master`, så nästa chatt ärver leveransbasen.

Vid överlämning: publicera en kort handoff med chattnamn och aktuellt kvitto
enligt runbooken ovan. Frisläpp cachen; nästa agents läskvittens rensar den.
Handoff-kvittens är aldrig ett bevis på merge eller mandat att radera grenar.
