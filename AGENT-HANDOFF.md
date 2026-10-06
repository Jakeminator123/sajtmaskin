# Pågående agentarbete — 2026-10-06

Tillfällig samordningsstatus på Jakobs begäran. Datorbytet blev inte av.
Samordnaren i **Dokumentera Master-promotion** äger huvudcheckouten och
mergeordningen; TESTER arbetar vidare i egen checkout. Läs aktuell GitHub-status
före nästa åtgärd. Ta bort denna tillfälliga fil efter avslutad överlämning.

## Levererat och kvarvarande arbete

- **Dossiers:** #1548–#1551, #1555, #1558 och #1559 är mergade: återanvändbar
  integrationskärna, katalog, enklare flöde, F3-kontroll och dokumentstädning.
  En senare kompatibilitetskontroll inför #1570 fann två serverägare som
  kontrollerade befintlig Blob-nyckel men inte skickade den explicit till SDK:n.
  Uppföljningen #1577 är mergad på `72de69a8` och binder dossierns list/upload och
  malluppladdarens två uploads till samma normaliserade befintliga token.
  Genererade projekt använder redan `@vercel/blob: ^2`; problemet är därför
  relevant även utan root-uppgraderingen. Ingen nyckel, env eller provider ändras.
  Oberoende kod-/integrationsreview är CLEAN, full PR-CI 4:20 och alla 21
  dossierbyggen 6:17 är gröna. Exakt merge-deployment är READY; post-CI 3:41
  har endast samma 13 paritetsrader (noll delta). #1570 behöver fortfarande
  verifiering av själva dependency-uppgraderingen i den samlade kandidaten nedan.
- **TESTER:** #1553, #1562, #1564, #1574 och #1576 är mergade. Originalets elva
  plandokument finns kvar. #1574 tar bort bevisad dubbelkörning utan att minska
  det fulla CI-urvalet; #1576 tar bort historiska antal/rubriklås men bevarar
  registry-/parser-/länkskydd. Testreformen är fortfarande **dellevererad**.
  Fortsättning: återstående A3-kandidater, riktig isolerad A4-persistensharness
  följd av övriga kritiska flöden, A6b-slutbeslut och A7-slutacceptans i
  `docs/plans/active/2026-10-04-test-och-kontrollforenkling/`.
  Checkout: `C:/Users/jakem/dev/projects/sajtmaskin-tester-restarbete`.
- **SCHAFFOLDS:** #1563, #1565, #1571 och den samlade familjeleveransen #1575
  är mergade. #1575 innehåller ärliga okopplade auth-/app-/marketingdemos och
  en gemensam produktkatalog med lokal kundvagn. Alla 21 keyless dossierbyggen
  passerade (6:15), liksom full PR-CI (4:29) och exakt Vercel-deployment.
  #1554/#1557/#1560/#1561 är stängda som ersatta, inte separat mergade.
  De fyra originalbrancherna är raderade lokalt och på remote efter SHA-kontroll.
  Originalcommits är verifierat hämtbara via PR-heads och ingår i #1575:s
  sourcehistorik. Hashverifierade fixtures är bevarade; chatten är arkiverad.
- **BUGG-TMP:** #1572 är mergad till preview på `0fb453660`; PR-CI 4:34 och
  exakt deployment är gröna. Den smala Chromium-flaggmitigeringen och
  diagnostiken är levererade. Lokal Linux-/resursverifiering är inte Vercel-
  liveacceptans: routespecifik allocation/deadline, cross-isolate-last och
  verklig `/tmp`-budget återstår. `SM-072` är inte stängd. Chatten är arkiverad.
- **Bransch:** #1552 är mergad (`e37e4d83`). Tomma värden raderar inte tidigare
  bransch; ingen migration eller backfill. Chatten är arkiverad.

## ZIP och ordlista

Originalet `sajtmaskin-genereringslab-v2.zip` är orört. Det är ett historiskt
visualiserings-/råmaterialpaket, inte aktuell repo-owner eller fristående
byggbart checkout. Den nya selektiva förteckningen från faktisk merge `72de69a8`
finns i `C:/Users/jakem/Documents/Sajtmaskin-arkiv/dossier-zip-reconcile-FINAL-72de69a8.txt`:
277 payloadpaths / 424 klassificerade rader, SHA-256
`60CB815A71AC1F3CE4F570F686006A50DDEB275BB5CCAF0775BC0310FEADBC58`.
Generatorns scope/hard-stops är granskade. Slutkvittots aktuella bevisstatus finns
i externa `dossier-terminal-handoff-pr.md`. Jämfört med FINAL-30291 är enda befintliga
payloadändringen Blob-serverhjälparen, plus ett nytt dossierregressionstest.
Fyra externa ordliste-/startpromptfiler är uppdaterade. Använd inte äldre
kvitton för att skriva över nyare kod. Visualiseringsytans HTML/JSON/PDF är
inte ombyggda.

## Mergeordning och bevisgränser

1. #1576 är mergad på `f68d1837e80585f67d4fc70bad317fc0450c6353`.
   Granskad source-head och mergeträdet är identiska; full PR-CI 4:51,
   sex required checks och exakt deployment är gröna. Post-CI 4:50 har endast
   oförändrad paritet; exakt merge-deployment är READY.
2. Dependency-PR:erna #1566, #1569, #1568, #1567 och #1570 återanvänds i en
   samlad kandidat på `codex/dependency-compat-integration`, från `72de69a8`.
   Normalmerge av alla fem sourcecommits ger exakt fem manifeständringar och
   35 ändrade locknoder (1 162 totalt), oberoende integrationsreview CLEAN på
   kodhead `68b04e34`. Inga extra uppgraderingar eller nya installationsskript.
   npm ci, 62 körda riktade tester (23 OS-villkorade skips), full typecheck,
   baselinekontroller, dossiers 23/23, docslinks, plan och diffcheck är gröna.
   Aktuell native CI/deployment krävs före merge; original-PR:erna stängs
   först när ersättningen är terminal. Ingen av
   dessa fem ingår i automerge-allowlisten. Första verkliga tillåtna botmergen är
   fortfarande obevisad; utvidga inte allowlisten för att skapa ett kvitto.
3. Scaffold-ID:n är oförändrade och valt ID hydrateras till deployad registry
   och aktuella filer. Source-only-leveransen är därför klar. Sex ändrade
   indexinputs kan fortfarande ha gamla semantiska vektorer: landing-page,
   saas-landing, dashboard, auth-pages, ecommerce och app-shell. Förbättrad
   ranking är inte bevisad. Shared Blob-/API-refresh kräver separat beslut;
   cache saknar normal TTL/inputhash-enforcement och CLI-invalidation är lokal.
4. Preview delar produktionsdatabas. Post-CI till och med #1577 visar samma
   13 accepterade DEV/PROD-paritetsavvikelser, verifierat noll delta mellan dem.
   Dessa körningar är röda på paritet, inte helgröna. Ingen DB-apply,
   masterpromotion, envändring eller live-provideracceptans ingår. Behåll
   befintlig OpenAI-nyckel; visa eller rotera den inte.

## Säkring och städning

Färdigt arbete finns i preview och PR-historiken. En PR bevisar inte att senare
lokala ändringar har pushats: kontrollera head och dirty-status före flytt.
Privata råunderlag är inte publicerade på GitHub.

- Scaffold-underlag: 289 filer med exakt hashverifierad extern kopia i
  `C:/Users/jakem/Documents/Sajtmaskin-arkiv/scaffold-family-recovery-2026-10-06/`.
- BUGG-TMP: 30 råunderlag hashverifierade i
  `C:/Users/jakem/Documents/Sajtmaskin-arkiv/bugg-tmp-capture-recovery-2026-10-06/`.
  Appen har arkiverat chatten och tagit bort worktree `6d7d`; backupen är
  hashkontrollerad efteråt och koden finns i PR/preview.
- TESTER-e1e8 avregistrerades efter verifierad backup av 41 filer. Aktiva
  TESTER-checkouten ska behållas. Appen har arkiverat scaffold-worktree `5996`;
  död Git-registrering är prunad men en oregistrerad katalogrest lämnas orörd.
  Åtta ytterligare terminala lokala branchrefs är raderade med exakt SHA-bevis;
  PR-heads finns kvar. Inga stashes eller BRA/rescue är raderade.
  Historiska `builder-branch` och `sand-oc` är bevarade på remote och i befintliga
  verifierade arkivtaggar; de saknar det terminala PR/head-bevis som delete-hooken
  kräver. Den spärren kringgås inte för att få en tom branchlista.
- `C:/Users/jakem/Documents/Sajtmaskin-agent-transfer-2026-10-05/` är endast
  en partiell flyttkopia; färdig Git-bundle/slutmanifest saknas. Den är inte
  ensam återställningskälla.

Ny agent: hämta aktuell preview/PR-head, läs AGENTS.md och pr-workflow,
verifiera Node-pin (vid snapshot 22.23.1) och samordna en egen skrivyta.
Extern mergeinstruktion finns i
`C:/Users/jakem/Documents/Sajtmaskin-arkiv/merge-agent-startprompt-2026-10-06.txt`.
Samordnaren mergar nu; ingen separat extern mergeagent har startats.
