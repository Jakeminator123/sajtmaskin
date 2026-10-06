# Pågående agentarbete — 2026-10-06

Tillfällig samordningsstatus på Jakobs begäran. Datorbytet blev inte av;
SCHAFFOLDS, TESTER och BUGG-TMP har fått fortsättningsuppdrag. Samordnaren
äger huvudcheckouten och mergeordningen tills den uttryckligen lämnas över.
Uppdatera denna fil när läget ändras och ta bort den efter avslutad överlämning.

## Läget

Kodbas vid säkring: `preview` / `f9c5acea6bcab47223607d5b3c20b64c4db88381`.
Kodjobb och exakt Vercel-deployment är gröna. DB-pariteten visar samma 13
tidigare accepterade DEV/PROD-avvikelser; preview delar produktionsdatabas.
Ingen masterpromotion, DB-apply, envändring eller live-provideracceptans ingår.

- Dossiers: #1548–#1551, #1555, #1558, #1559 mergade; kärna, katalog, förenklat flöde,
  F3-kontroll och dokumentstädning. Extern ZIP-förteckning är FINAL från faktisk
  mergad `30291b80`, oberoende CLEAN enligt samordnaren 2026-10-06:
  `C:/Users/jakem/Documents/Sajtmaskin-arkiv/dossier-zip-reconcile-FINAL-30291b80.txt`.
  SHA-256 `BA2189376400D4B3BBFBBA86FD3DC84F609F777919A314C31F7B15432DBF9470`,
  276 payloadpaths/369 klassificerade rader. Original-ZIP är orörd; detta är en
  förteckning, inte en omskriven ZIP eller ett fristående byggbart paket.
- Bransch-agenten: #1552 mergad (`e37e4d83`), source-head `2863d782` har samma
  träd. Chatten är arkiverad. Ingen migration/backfill; tomma värden raderar inte bransch.
- TESTER: #1553, #1562, #1564 och #1574 mergade. Originalplanen är bevarad.
  Testreformen är DELLEVERERAD, inte färdig. Fortsättning i egen checkout
  `C:/Users/jakem/dev/projects/sajtmaskin-tester-restarbete`, branch
  `codex/test-registry-cleanup`, bas `eba1c590`: nu A3:s avgränsade
  registrytest-rensning. A4:s disposabla CI-miljö utreds läsande; inga lokala
  installationer eller verkliga DB-/browserflödesbevis ännu.
- SCHAFFOLDS: #1563 (effektiv intent) och #1565 (ruttanpassat promptinventarium)
  mergade. #1554/#1557/#1560/#1561 är bevarade familje-drafts, ersatta av samlad
  source-only-kandidat [#1575](https://github.com/Jakeminator123/sajtmaskin/pull/1575).
  Två kod-CLEAN-reviews, grön full CI, 21/21 keyless dossierbyggen och exakt READY-
  deployment finns på tidigare head `6c4e3035`; kandidaten synkas nu en gång till
  #1572-basen `0fb45366` och kräver headbunden integrationsreview/CI/deployment.
  Familjerna är inte mergade. Samordnaren äger merge; originalrefs/fixtures behålls.
- Variantarbete: [#1571](https://github.com/Jakeminator123/sajtmaskin/pull/1571)
  är mergad 2026-10-06 till `30291b80fbaec32e7913a2b3de3e3901b7f9b179`.
  Mergeträdet är identiskt med granskad head `c3b5024a50f010e7d792304c8b9d79c32683e20c`.
  Variantfixen ska inte göras om; de fyra scaffold-familjerna återstår separat.
- BUGG-TMP: [#1572](https://github.com/Jakeminator123/sajtmaskin/pull/1572) är READY,
  inte mergad. Samordningen har bedömt den smala flaggmitigeringen och diagnostiken
  som previewkandidat efter oberoende lokalt owner-/mutex-/resurskvitto: fem rena
  native avslut, tio bilder/WebGL-pixlar, inga oväntade processöverlevare/OOM.
  Runtime-/test-/reproblobbarna är oförändrade från kodhead `e79dce409`, och
  289 riktade tester samt CI på tidigare head `955238cc` är gröna. Kandidaten
  synkas samlat till #1574-basen `eba1c590` och får ny headbunden review/CI/deployment
  före eventuellt mergebeslut. Vercel-live-/resursacceptans och `SM-072` är öppna;
  ingen fastställd produktionsrotorsak eller masterpromotion ingår.

## Nästa steg — behåll ordningen

1. Variantens samlade P1-runda är levererad via #1571 på `30291b80`.
   Slutför #1575:s samlade synk/bounded review mot `0fb45366`, markera READY
   när kod/review är fryst och verifiera full native CI/exakt deployment.
   Samordnaren mergar. Stäng inte de fyra originaldrafts förrän ersättningen är
   terminal och deras proof/refs/fixtures bevarade.
2. Source-only-leverans av #1575 är godkänd med normala review/CI/deploymentvillkor;
   indexrefresh är inte en extra correctness-mergegate. Alla tio scaffold-ID:n
   är oförändrade och valt ID hydrateras till deployad registry/nya filer.
   Sex indexinputs är ändrade: landing-page, saas-landing, dashboard, auth-pages,
   ecommerce, app-shell. Stale vektorer kan påverka fuzzy ranking/override;
   förbättrad ranking eller full liveacceptans är inte bevisad. Shared Blob/API-
   refresh saknar separat godkännande. Cache saknar normal TTL/inputhash-enforcement,
   CLI-invalidation är processlokal. Behåll OpenAI-nyckeln, rotera eller visa den inte.
3. TESTER-rest A3/A4/A5/A6b/A7 finns i
   `docs/plans/active/2026-10-04-test-och-kontrollforenkling/`.
   A4 kräver isolerad DB/browser/providergräns; ingen delad-DB-genväg.
4. BUGG-TMP:s samordnade preview-mitigering behöver aktuell bassynk, blobbundet
   integrations-/docreview och full native CI/exakt deployment på nya headen.
   Ny Vercel-resurs krävs inte före denna smala previewkandidatur. Linuxkvittot
   är inte liveacceptans: routespecifik allocation/deadline, cross-isolate-last
   och verklig `/tmp`-budget kvarstår. Delad DB/Blob är inte testfixture, ingen
   ny liveåtgärd är beviljad och hela `SM-072` får inte stängas.
5. Slutlig ZIP-fillista är verifierad enligt kvittot ovan. Samordnaren uppdaterar
   externa startprompter separat. Den äldre
   `dossier-zip-reconcile-FINAL-b427c1a8.txt` är en HISTORISK snapshot, inte
   instruktion att skriva över nyare scaffold-/dossier-konsumenter.
6. Granska och leverera de lämpliga dependency-PR:erna #1566–#1570. De hade
   gröna checks vid denna inventering men kräver manuell granskning: paketen
   omfattas inte av nuvarande automerge-allowlist. Första tillåtna automatiska
   mergen är fortfarande obevisad; ändra inte allowlisten för att skapa ett kvitto.

## Säkring och ansvar

GitHub: färdiga leveranser finns i preview och säkrade baslinjer i egna PR:er.
Pågående rättningar finns även lokalt i de namngivna worktreen tills de pushats;
en befintlig PR bevisar inte att författarens senaste arbete är fjärrsäkrat.
Flyttkopieringen till `C:/Users/jakem/Documents/Sajtmaskin-agent-transfer-2026-10-05/`
avbröts. Där finns endast en partiell arkivkopia; Git-bundle, slutmanifest och
färdigverifierad flyttbackup saknas. Använd den inte som enda återställningskälla.
Originalunderlagen finns kvar i `C:/Users/jakem/Documents/Sajtmaskin-arkiv/`,
respektive aktiva worktree och de lokala Codex-chattarna. Privata dialoger och
råa underlag ska inte publiceras i GitHub-repot.

Ny agent: hämta aktuell preview och PR-head, läs AGENTS.md och pr-workflow,
verifiera Node-pin (vid snapshot Node 22.23.1) och samordna egen skrivyta.
Merge-instruktion med mandat och kö finns externt i
`C:/Users/jakem/Documents/Sajtmaskin-arkiv/merge-agent-startprompt-2026-10-06.txt`.
5996 och BUGG-TMP:s 6d7d behålls tills deras PR:er är terminala. TESTER-e1e8 är
avregistrerad först efter SHA-verifierad backup; dess 41 filer ligger i arkivet.
Inga stashes, BRA/rescue eller andra agenters arbete har raderats.
