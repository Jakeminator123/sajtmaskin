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
  F3-kontroll och dokumentstädning. Extern ZIP-förteckning behöver ännu uppdateras
  mot slutlig scaffold-integrerad kod. Original-ZIP är orörd.
- Bransch-agenten: #1552 mergad (`e37e4d83`), source-head `2863d782` har samma
  träd. Chatten är arkiverad. Ingen migration/backfill; tomma värden raderar inte bransch.
- TESTER: #1553, #1562, #1564 mergade. Originalets elva plandokument bevarade.
  Testreformen är DELLEVERERAD, inte färdig. Fortsättning i egen checkout
  `C:/Users/jakem/dev/projects/sajtmaskin-tester-restarbete`, branch
  `codex/test-control-rest`: först A5-testmiljö och A6b-bevisad dubbelkörning.
- SCHAFFOLDS: #1563 (effektiv intent) och #1565 (ruttanpassat promptinventarium)
  mergade. #1554/#1557/#1560/#1561 är pushade familje-drafts, inte mergade.
- Variantarbete: [#1571](https://github.com/Jakeminator123/sajtmaskin/pull/1571)
  är mergad 2026-10-06 till `30291b80fbaec32e7913a2b3de3e3901b7f9b179`.
  Mergeträdet är identiskt med granskad head `c3b5024a50f010e7d792304c8b9d79c32683e20c`.
  Variantfixen ska inte göras om; de fyra scaffold-familjerna återstår separat.
- BUGG-TMP: [#1572](https://github.com/Jakeminator123/sajtmaskin/pull/1572) är READY,
  inte mergad. Historisk bevarad head är `e79dce40939d02c0c87f038ae4bf7f4d665b5178`
  på `codex/chromium-teardown-diagnostics`; kod och undersökningsdokument finns kvar.
  Review av den senare kandidaten är CLEAN, runtimeblobbarna är oförändrade och
  289 riktade tester är gröna. CI är grön på `955238cc`; Vercel-livebevis återstår.

## Nästa steg — behåll ordningen

1. Variantens samlade P1-runda är levererad via #1571 på `30291b80`.
   Fortsätt de fyra familje-PR:erna #1554/#1557/#1560/#1561 från denna bas;
   de är ännu inte mergade och har separat granskning och indexberoende nedan.
2. Fyra scaffold-familjer kräver en samlad granskad indexkälla. Blob-indexet
   är gemensamt och kan påverka produktion; separat uttryckligt godkännande för
   live refresh saknas. Behåll befintlig OpenAI-nyckel, rotera eller visa den inte.
3. TESTER-rest A3/A4/A5/A6b/A7 finns i
   `docs/plans/active/2026-10-04-test-och-kontrollforenkling/`.
   A4 kräver isolerad DB/browser/providergräns; ingen delad-DB-genväg.
4. BUGG-TMP har oberoende review och grön CI på `955238cc`, men beslut om
   minsta säkra Vercel-previewprov av resursåtgång/samtidighet återstår före merge.
   Linuxkvitto är inte liveacceptans; delad DB/Blob får inte användas som testfixture.
5. Uppdatera slutlig ZIP-fillista/ordlista och externa startprompter. Den äldre
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
