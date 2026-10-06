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
  Uppföljningen på `codex/blob-token-owner` binder dossierns list/upload och
  malluppladdarens två uploads till samma normaliserade befintliga token.
  Genererade projekt använder redan `@vercel/blob: ^2`; problemet är därför
  relevant även utan root-uppgraderingen. Ingen nyckel, env eller provider ändras.
  Lokal rättningsreview är CLEAN; aktuell integrationsreview, native CI och
  deployment måste verifieras före merge. #1570 väntar på denna rättning.
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
  Originalrefs och hashverifierade fixtures är bevarade.
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
byggbart checkout. Den granskade selektiva förteckningen på `30291b80` finns i
`C:/Users/jakem/Documents/Sajtmaskin-arkiv/dossier-zip-reconcile-FINAL-30291b80.txt`:
276 payloadpaths / 369 klassificerade rader, SHA-256
`BA2189376400D4B3BBFBBA86FD3DC84F609F777919A314C31F7B15432DBF9470`.
Det kvittot gäller den angivna snapshoten. Efter Blob-uppföljningens faktiska
merge ska samordnaren skapa ett nytt headbundet kvitto och uppdatera externa
ordliste-/startpromptfiler; använd inte äldre kvitton för att skriva över nyare
kod. Visualiseringsytans HTML/JSON/PDF är inte ombyggda.

## Mergeordning och bevisgränser

1. #1576 är mergad på `f68d1837e80585f67d4fc70bad317fc0450c6353`.
   Granskad source-head och mergeträdet är identiska; full PR-CI 4:51,
   sex required checks och exakt deployment är gröna. Efterkontroller på
   merge-SHA startade. Slutför Blob-uppföljningen ovan från denna bas.
2. Dependency-PR:erna #1566, #1569, #1568 och #1567 har en första oberoende
   granskning utan fynd, men behöver aktuell bassynk, relevanta kontroller och
   native mergevillkor. #1570 har explicit HOLD tills Blob-rättningen levererats
   och dess egen integrationsverifiering är klar. Ingen av dessa fem ingår i
   automerge-allowlisten. Första verkliga tillåtna Dependabot-auto-mergen är
   fortfarande obevisad; utvidga inte allowlisten för att skapa ett kvitto.
3. Scaffold-ID:n är oförändrade och valt ID hydrateras till deployad registry
   och aktuella filer. Source-only-leveransen är därför klar. Sex ändrade
   indexinputs kan fortfarande ha gamla semantiska vektorer: landing-page,
   saas-landing, dashboard, auth-pages, ecommerce och app-shell. Förbättrad
   ranking är inte bevisad. Shared Blob-/API-refresh kräver separat beslut;
   cache saknar normal TTL/inputhash-enforcement och CLI-invalidation är lokal.
4. Preview delar produktionsdatabas. Post-CI för #1574/#1572/#1575 visar samma
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
  Worktree `6d7d` är ren/terminal men behålls tills säker app-arkivering finns.
- TESTER-e1e8 avregistrerades efter verifierad backup av 41 filer. Aktiva
  TESTER-checkouten ska behållas; scaffold-worktree `5996` inväntar slutlig
  ref-/worktreestädning. Inga stashes, BRA/rescue eller andras arbete raderas.
- `C:/Users/jakem/Documents/Sajtmaskin-agent-transfer-2026-10-05/` är endast
  en partiell flyttkopia; färdig Git-bundle/slutmanifest saknas. Den är inte
  ensam återställningskälla.

Ny agent: hämta aktuell preview/PR-head, läs AGENTS.md och pr-workflow,
verifiera Node-pin (vid snapshot 22.23.1) och samordna en egen skrivyta.
Extern mergeinstruktion finns i
`C:/Users/jakem/Documents/Sajtmaskin-arkiv/merge-agent-startprompt-2026-10-06.txt`.
Samordnaren mergar nu; ingen separat extern mergeagent har startats.
