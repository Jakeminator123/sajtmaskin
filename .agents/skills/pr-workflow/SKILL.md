---
name: pr-workflow
description: "Sajtmaskins lokala agent→branch→PR→review→merge-flöde. Använd vid skrivarbete, commit, push, PR, CI-fix, merge eller städning efter PR."
---

# PR-workflow

Värden ägs av `config/agent-workflow.json`. Default: vanlig repo-agent i den
öppna checkouten. Ingen tvingad worktree, inget branchnamnsprefix, ingen roll
om inte Jakob nämner en.

## 1. Starta

1. `npm run hooks:install` vid ny clone eller hookändring.
2. **Välj bas medvetet — de två är inte samma sak:**
   - *Leveransbas* = grenen PR:en ska mot. Default `preview`; utgå från
     `origin/preview` för vanligt utvecklingsarbete så att diffen inte saknar
     det som redan ligger i staging.
   - *Granskningsbas* = det du bevisar mot. `origin/master` när påståendet
     gäller **produktion** (backloggens «Bevis på `master`», prodrepro,
     promote-verifiering).

   Hämta den du faktiskt använder: `git fetch origin preview` respektive
   `git fetch origin master`. Frys basens SHA när flera kandidater eller
   agenter ska jämföras — annars mäts de mot olika underlag.
3. Jobba i den öppna checkouten, en skrivande session åt gången, i Codex
   eller Cursor. Worktree när Jakob ber om det — se `agent-worktree.mdc`.
4. Kontrollera öppna PR:er för samma owner om ändringen kan krocka.

Skyddade sökvägar är inte förbjudna. De ska inkludera rätt owner och följdytor
(schema, Backoffice, test, docs) och får full verifieringsprofil i CI.

## 2. Ändra owner först

Ändra körbar/deklarativ owner före schema, genererad projektion och prosa. Kör
`npm run verify:pr -- --plan` tidigt.

`strict` är formatkontrakt, inte automatisk runtime-enforcement. Läs
rapportens `runtimeStatus`.

## 3. Synka och verifiera

- `npm run sync:derived` när owners ändrats.
- `npm run verify:pr -- --plan` när diffen fått form och före push; direktpreview
  återanvänder `preview:prepare`-planen, övriga pushar planeras i hooken.
- Kör relevanta riktade kontroller och redovisa dem i PR:n. GitHub Actions
  publicerar required checks på varje head: tung profil för ready runtime,
  högrisk och `master`, explicit light-kvitto för safe docs (även preview-push)
  och vanliga drafts. Dossiermatrisen väljs av beroendekontraktet på PR och
  preview-push; schemalagd/manuell körning är komplett.
  Preview-genvägar kräver en grön föregående push för respektive workflow;
  pågående/fallerad/okänd bas kör full profil utan att ärva falskt grönt.
  Hela `test:ci`-sviten fördelas över fyra parallella jobb; `quality` kräver alla
  fyra. Samla kända rättningar före push. Att återgå till draft startar ingen
  ny CI-körning; en ny head eller ready-status verifieras som vanligt.
  Bare `npm run verify:pr` är frivillig felsökning/reproduktion, inte en extra
  lokal fullsvit. För CI-/verifieringsmotorn: `npm run test:workflow`,
  `npm run workflow:contract`, typecheck och berörda kontroller; fullsviten
  körs i CI. Lägg till riktade integrationstester när ändringen berör runtime.
- Fixa eller avfärda riktiga reviewfynd; kör om berörda riktade kontroller.

## 4. Leverera: direkt preview eller PR

Direktpreview: kör riktade kontroller enligt § 3 och commit:a exakta paths.
Kör `npm run bugpass -- --base <preview-SHA>` för prompt/schema. Starta en
**separat readonly-granskare med ny kontext**, utan föräldrachatt, i värdens
befintliga review-/subagentfunktion. Importera dess faktiska JSON och metadata
enligt [runbooken](../../../docs/runbooks/buggpass.md).
Författaren får inte utgöra sitt eget oberoende pass eller fylla i ett påhittat
tomt resultat. Granskarens befintliga behörigheter gäller; hooken ger ingen sandbox.

Triagera: acceptera och fixa, avfärda med konkret bevis eller skjut upp låg-impact
P2 med uppföljning. Fynd visar bedömd säkerhet i %, impact 1–5 och kort kommentar.
Vid fix: ny commit och samma bugpass-kommando; tidigare fynd/beslut länkas
automatiskt. Granska delta/integration, återanvänd oförändrat kvitto och stoppa
efter tre rundor för ägarbeslut. Ett uttryckligt godkännande från Jakob kan
medge en fjärde runda enligt runbooken, aldrig ett automatiskt omtag.
Ett nytt ägaruppdrag efter en helt klar review får en uttrycklig ny cykel
enligt runbooken; historiken behålls och hela diffen granskas igen.
Saknad/ofullständig review stoppar före push.

När granskningen är klar: `npm run preview:prepare` verifierar kvittot och kör
befintlig plan en gång (inga tester eller modeller). `npm run preview:push --
--dry-run` kontrollerar beredskap utan push. Fråga sedan Jakob **Är du säker på
att du vill pusha?** med exakt SHA. Efter svaret: `npm run preview:push --
--confirm <full SHA>`. Wrappern och hooken kontrollerar aktuell bas, head,
review/triage och plan. Ingen force/delete, ingen ny AI-körning efter push.
Läs push-CI och Vercel READY separat; lokala kontroller ersätter inte dessa.
Detta ger inte produktions-, DB- eller mergebehörighet. För direktpreview får
Jakobs befintliga GitHub-adminundantag användas efter SHA-bekräftelsen
(ägarbeslut 2026-10-08). Kontrollera aktuell inloggning och att undantaget
gäller preview; ändra inte ruleset, force/delete-skydd eller Master för detta.
Om värden saknar fungerande oberoende review: använd PR-vägen med en fungerande
granskare och native checks. Fabricera aldrig ett lokalt kvitto för att komma förbi.

PR-vägen finns kvar när spårbar diskussion/native mergegrind behövs:

1. Commit:a exakta paths och push utan force. Nya PR:ar mot `preview`.
2. Öppna PR med repots template när Jakob ber om det.
3. Efter ny head-SHA: låt GitHubs required checks och reviews avgöra mergebarhet
   för den SHA:n och aktuell integrationsbas. Kör om berörda riktade kontroller
   lokalt bara när ett fynd eller en ändring motiverar det.
4. Läs checks, reviews och kommentarer. Varje konkret fynd ska vara fixat,
   loggat eller avfärdat.

På PR-vägen återanvänds befintlig reviewer först. Starta inte Codex/API som
parallellt obligatoriskt pass. Saknad/neutral review är okänd, inte grön;
författaragenten väljer en ersättare om den ordinarie inte kan slutföra.

Samla verifierade fynd i en review innan rättningsrundan. Efter rättningar
granskas ändringsdeltat och dess integration; återanvänd tidigare review för
oförändrad kod när blob-/trädidentitet kan visas. Ny head kräver ett aktuellt
reviewkvitto, inte att hela PR:n granskas om från början. Redovisa konkret
vilket fynd eller vilken required check som fortfarande blockerar.

## 4b. Promote till produktion

Allt arbete går till `preview`. Produktion uppdateras genom en separat
promote-PR — inklusive Dependabot, som numera riktar sina PR:ar mot `preview`
via `target-branch` i `.github/dependabot.yml`.

Kör `npm run promote` när Jakob ber om att släppa till produktion («merga
preview till master», «promota», «släpp skarpt»). Kommandot hämtar origin,
listar vad som skiljer, skapar en kortlivad `promote/<datum>`-gren vid previews
tip via GitHubs refs-API (rör inte din checkout) och öppnar PR:en mot `master`
med faktisk träddiff, båda SHA:na och produktionsvarningen. `npm run promote:dry`
visar vad som skulle hända.

Head-grenen får **aldrig** vara `preview`: repot har `delete_branch_on_merge`,
så en promote med staging som head raderar staging vid merge. Det hände
2026-09-08 och grenen fick återskapas manuellt.

Kommandot mergar aldrig till `master`. Efter PR:en gäller `pr-merge.mdc` som
vanligt: gröna required checks på promote-headen, bugkoll/triage och uttrycklig
ägarbekräftelse efter produktionsvarningen.

En squash-release ger master en ny commit som inte finns i `preview`
efteråt. Promote synkar inte serverside. Saknas master: bered en synkbranch
från färsk preview som tar in master med merge-commit; öppna PR mot preview
och begär separat merge med merge-commit (inte squash eller auto-merge) enligt
synkvägen i `pr-merge.mdc`, innan nästa promote.
Samma CI/review gäller; ingen blandad feature-PR. Dry-run skriver
inga remote-refs. Osläppt innehåll och releasetext avgörs av faktisk träddiff,
inte squashad commithistorik.

## 5. Merge och städ

När Jakob ger ett uttryckligt eller förhandsvillkorat mergemandat: följ
`pr-merge.mdc` och använd `gh pr merge --squash --match-head-commit` med den
granskade headen när native villkor är uppfyllda. Bara den allowlistade
Dependabot-vägen får aktivera native auto-merge. Använd aldrig `--admin` och
merga inte på eget bevåg. Innan en promote-PR
mergas till master: varna att det går till produktion och vänta på extra
bekräftelse i samma chatt. Den mergen är manuell. `preview` är en delad
remote-gren, inte trunk och inte builder-ytan.

Efter merge: kör först `npm run tidy` och kräv att ytan rapporteras som `FRI`.
Först då: `npm run worktree:remove -- <sökväg>`. Rör aldrig `BRA` eller
`rescue/*`. Lämna huvudcheckouten på `preview` efteråt — inte på `master` —
så nästa chatt ärver leveransbasen.
