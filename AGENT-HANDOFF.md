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

- Dossiers: #1551, #1555, #1558, #1559 mergade; kärna, katalog, förenklat flöde,
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
- Variantarbete: draft [#1571](https://github.com/Jakeminator123/sajtmaskin/pull/1571),
  local=remote `850053e81240d12c60cb2e49dcc64d12d87cef4d` på
  `codex/scaffold-explicit-variant`. Ursprunglig kod + exakta avbrutna teständringar
  är committade. Bevarandekvittot är 370 PASS/17 RED, no-cache TypeScript grön.
  SCHAFFOLDS äger nu rättningarna i 5996; kontrollera ny head före beslut.
- BUGG-TMP: Chromium-kandidaten är committad och pushad som draft
  [#1572](https://github.com/Jakeminator123/sajtmaskin/pull/1572), local=remote
  `e79dce40939d02c0c87f038ae4bf7f4d665b5178` på
  `codex/chromium-teardown-diagnostics`. Åtta filer och undersökningsdokument
  bevarade; 289 riktade tester gröna. INGEN READY/MERGE.

## Nästa steg — behåll ordningen

1. Slutför variantens samlade P1-runda: radbruten negation/beskrivning;
   faktisk råprompt och variantkvitto genom MCP/nonstream; råprompt i eval-runner.
   WIP MCP-mocks och preliminärt fontassert måste också färdigställas.
   Därefter oberoende delta/integrationsreview, full CI och exakt deployment.
2. Fyra scaffold-familjer kräver en samlad granskad indexkälla. Blob-indexet
   är gemensamt och kan påverka produktion; separat uttryckligt godkännande för
   live refresh saknas. Behåll befintlig OpenAI-nyckel, rotera eller visa den inte.
3. TESTER-rest A3/A4/A5/A6b/A7 finns i
   `docs/plans/active/2026-10-04-test-och-kontrollforenkling/`.
   A4 kräver isolerad DB/browser/providergräns; ingen delad-DB-genväg.
4. BUGG-TMP behöver oberoende review/CI och verkligt Vercel-previewprov av
   resursåtgång/samtidighet före merge; Linuxkvitto är inte liveacceptans.
5. Uppdatera slutlig ZIP-fillista/ordlista och externa startprompter. Den äldre
   `dossier-zip-reconcile-FINAL-b427c1a8.txt` är en HISTORISK snapshot, inte
   instruktion att skriva över nyare scaffold-/dossier-konsumenter.
6. Granska och leverera de lämpliga dependency-PR:erna #1566–#1570. De hade
   gröna checks vid denna inventering men kräver manuell granskning: paketen
   omfattas inte av nuvarande automerge-allowlist. Första tillåtna automatiska
   mergen är fortfarande obevisad; ändra inte allowlisten för att skapa ett kvitto.

## Säkring och ansvar

GitHub: färdiga leveranser finns i preview; ofärdigt arbete ligger i drafts.
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
