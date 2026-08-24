---
name: pr-workflow
description: "Sajtmaskins enda lokala agent→branch→PR→review→merge-flöde. Använd vid skrivarbete, commit, push, PR, CI-fix, merge eller städning efter PR."
---

# PR-workflow

Detaljerade värden ägs av `config/agent-workflow.json`; detta är körordningen.

## 1. Starta rätt

1. Kör `npm run hooks:install` idempotent; konflikt med en främmande hook är ett
   stopp, inte ett lyckat skydd.
2. `git fetch origin master`.
3. Builder skapar egen worktree och kortlivad `fix/`, `feat/`, `docs/` eller
   `chore/` från exakt `origin/master`.
4. Direkt master är inte normal agentväg, inte ens för docs/regler. Break-glass
   kräver Jakobs uttryckliga mandat för just incidenten och dokumenterad orsak.
5. Kontrollera öppna PR:er för samma canonical owner eller delade projektioner.

Skyddade sökvägar är **inte förbjudna**. De betyder att ändringen måste omfatta
rätt owner och alla faktiska följdytor — till exempel schema, Backoffice,
generator, test och dokumentation — och får den fulla verifieringsprofilen.

## 2. Ändra owner först

Ändra körbar/deklarativ owner före schema, genererad projektion och prosa. Kör
`npm run verify:pr -- --plan` tidigt: rapporten visar protected paths,
control-plane-owners, Backoffice-sidor och kommandon för hela diffen.

`strict` betyder formatkontrakt, inte automatiskt runtime-enforcement. Läs
rapportens `runtimeStatus`. Manuella validators rapporteras men körs inte tyst.

## 3. Synka och verifiera

- Kör skrivande generatorer uttryckligt med `npm run sync:derived` när deras
  owners ändrats. `verify:pr` gör inga tracked source-edits, men validators får
  uppdatera lokala gitignorerade cacheartefakter, exempelvis lintcache.
- Kör `npm run verify:pr` före push. Protected diff väljer full lokal profil.
- Kör ett oberoende readonly Sol-pass på den färdiga diffen. Fixa eller
  verifierbart avfärda riktiga fynd; kör sedan om verifieringen.

Vid flera parallella agenter ska kandidatbrancherna undvika delade statusfiler,
backlog, canvas och andra genererade projektioner. En utsedd integrationsagent
samordnar owners, porterar de verifierade ändringarna till färsk master och
regenererar de delade artefakterna en gång i integrations-PR:n. Välj aldrig en
äldre generated-/statusfil i en konflikt.

## 4. PR och väntan

1. Commit:a exakta paths och push utan force.
2. Öppna draft-PR med repots template. Behåll worktreet medan CI/review kan
   kräva nya commits.
3. Efter varje ny head-SHA: kör lokal verifiering + review igen. GitHubs
   `review-window` väntar minst sju minuter från den nya SHA-körningen.
4. Läs checks, reviews, inline-kommentarer, PR-kommentarer och annotations.
   Varje konkret fynd ska vara fixat, loggat eller verifierbart avfärdat.
5. Vänta tills `quality`, `backoffice-tests`, `schema-drift`, `build`, Vercel
   (grön/absent) och reviewkvittona är klara. `review-window` ska fortfarande
   vara pending: den väntar med flit på din slutliga sign-off.

## 5. Ready, merge och städ

När övriga checks/reviews ovan är klara och P0/P1=0: posta den SHA-exakta
`merge:ready`-kommentaren och sätt labeln. Vänta därefter tills den betrodda,
head-bundna `review-window` har verifierat kommentarförfattare, live head/base,
merge-base och ordningen och blivit grön. Sen bot, ny commit, borttagen label
eller flyttad master gör grinden röd/pending igen. Steward följer
`pr-merge.mdc`, mergar en PR i taget, hämtar live master och omvärderar alla
kvarvarande PR-diffar efter varje merge. Merge måste bindas till förväntad
head-SHA; post-merge-kontrollerna ska sedan köras på den nya master-SHA:n.

Efter merge/close: verifiera att allt finns på remote och hämta färsk master.
Kör först `npm run tidy` från en worktree som ska behållas och kräv att exakt
målyta rapporteras som `FRI` (ingen öppen PR, rent träd och exakt Git-/PR-
mergebevis). Först då får du från en annan worktree köra säker
`npm run worktree:remove -- <sökväg>`, följt av `npm run tidy:apply`. Om
GitHub/tidy inte kan bevisa `FRI`: bevara och stoppa. Rör aldrig `BRA`,
`rescue/*` eller en arbetsyta som fortfarande äger en öppen PR.
