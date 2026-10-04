---
status: active
owner: Codex, på Jakobs uttryckliga uppdrag
created: 2026-10-04
---

# Dossier-förenkling — hela leveransen

## Mål och avgränsning

Hårda dossiers ska vara återanvändbar kod och kontext som hjälper befintliga
LLM-flöden med återkommande integrationer, inte paket som påtvingar ett
kundprojekt fel router, sessioner, datalager eller implementationsmetod.
Förenkla tolkning och montering utan att förlora säkerhetskontrakt och nyttig kod.

Detta är ett samlat dossieruppdrag, inte bara första delsteget. Scaffolds väntar
enligt ägarens svar. Ingen ZIP-bulkimport, ny agent/LLM-fas, ny extern tjänst,
beroendeuppgradering, provideroperation, DB-/env-ändring eller masterpromotion.
Jakob har 2026-10-04 gett uttryckligt förhandsvillkorat mandat att skapa/pusha
PR:er och merga hela dossierleveransen till preview när oberoende granskning,
required checks och deployment är gröna. Ingen masterpromotion eller DB-åtgärd.

## Startläge och arbetsordning

- Live `preview`: `44f4338316289ec409b5049d5069557dfc33ec39`.
- Återanvänd dossierkärnan i [PR #1548](https://github.com/Jakeminator123/sajtmaskin/pull/1548),
  reviewed head `b765e2f38185bca51f96b861abb7217d1321cd1d`; mergad till preview
  på `65e28f6097c756c9c78a54a22ae5533b81040848`. Postmerge kod-CI grön
  (4:01), Vercel READY (1:47); samma accepterade DB-paritetsdrift kvarstår.
- Ny arbetsbranch: `codex/dossier-simplification`, utgår från denna head.
- En skrivande session i huvudcheckouten. Innehåll, runtimeägare, legacy och
  testbevis kartläggs parallellt; implementationer integreras sekventiellt.
- Dela leveransen i avgränsade PR:er efter ownerberoenden. Ny integrationsbas
  fryses och ändringsdelta granskas; oförändrade blobkvitton återanvänds.
- Nya arkitektur-/produktbeslut, osäker radering eller oväntad diff över cirka
  40 filer är stoppunkt, inte skäl att tänja ett delsteg.

## Checklista och konkreta klarkriterier

- [x] Frys startbas, kontrollera ren checkout, öppen kärn-PR och Node/Volta.
- [x] Inventera aktuell hard-katalog: implementerad metod, användningsgräns,
  konfiguration, instruktioner, sourcefiler och faktiskt acceptansbevis.
- [x] Besluta minsta gemensamma informationsmodell. Manifest/providerägande,
  `envVars`, F2/F3 och presence behåller varsin befintlig semantik; inga nya
  dubbla readinessägare. Metadata får bara tillkomma med wired konsument.
- [x] Implementera en intern samlad integrationsvy i befintlig pipeline och
  använd den i träffade prompt-/monteringskonsumenter, inklusive båda motorvägar.
  D2/D3 är lokalt implementerat; CI/review/leverans återstår och kvitteras nedan.
- [ ] Koppla projektets faktiska provider-/paket-/filbevis till användningsgräns
  före kodinjektion. Stödd implementation, anpassningsbehov och okänt/ostött
  fall ska få ärliga, testbara utfall; ingen gissad full kompatibilitet.
- [ ] Skilj skyddad återanvändbar kärna från projektanpassning med befintlig
  `verbatim`/`rewritable`-mekanism. Bevara signering, behörighet, hemlighetsskydd,
  konfigurationsfallback, exports och fungerande uppföljningar.
- [ ] Rensa motsägelsefull och föråldrad hard-vägledning. Användningsgräns,
  integration och `Avoid` ska faktiskt nå modellen i enhetlig, begränsad form;
  behåll 480-teckenskyddet och knappen Bygg integrationer.
- [ ] Ta bort bevisat döda interna owners/wrappers/fallbacks. Skydda aktiv
  snapshotkompatibilitet; ingen route-/feature-/migrationsradering utan rätt
  användningsbevis och ägarbeslut. Git, inte backupdocs, bevarar borttagen kod.
- [ ] Synka typer/schema/validator/registry, Backoffice och curator där de
  konsumerar ändrat kontrakt. Inga fält som bara dokumenteras men inte fungerar.
- [ ] Regenerera kartor och dokumentprojektioner från aktuella owners; ersätt
  stale aktiv prosa och planer. Dokumentera ansvar och begränsningar, inte en
  parallell kopia av implementationen.
- [ ] Visa RED/GREEN och integration: kompatibelt projekt, befintlig annan
  provider, metod som inte stöds, fil-/middlewarekonflikt, okända förutsättningar,
  F2/F3, follow-up/repair, exakt presence och konfigurations-/verifieringsstatus.
- [ ] Kör plan och riktade kontroller lokalt med Node enligt package/Volta och
  max fyra workers. Full CI, isolerade DB-/stabilitetstester och samtliga
  keyless dossierbyggen verifieras på aktuell PR-head, utan tung lokal dubbelbuild.
- [ ] Samla oberoende reviewfynd före rättning; granska rättningsdelta och
  integration. Alla native required checks, reviews, trådar och deployment
  ska vara aktuella. Redovisa verklig CI-tid och kvarvarande hinder.
- [ ] Verifiera terminalt PR-/fjärrläge innan slutstädning. En grön öppen PR
  räknas inte som mergad eller produktionslevererad.

## Vad offlinebevis inte får påstå

Typecheck, keyless build och HTTP200 är inte live provideracceptans. Förnya
inte `lastVerified` eller accepted-status för att få grön freshness. Ändrade
providerbytes behöver nya relevanta bevis; liveprov med kostnad, credentials
eller externa writes kräver eget mandat. En sådan lucka ska redovisas öppet,
inte gömmas bakom en avbockad checklista.

## Etapper och uppskattning

1. Återanvänd och merga den redan verifierade kärn-PR:n efter färsk native
   attestering. Terminologi/ZIP-handoff utanför checkouten.
2. Gemensam dossierinformation och konsumenter: konfigurationsvägledning och
   providersteg utan nya readiness-/acceptansägare; samlad promptprojektion.
3. Projektgränser och kompatibilitetsutfall före injektion; bevara exakta val,
   snapshotkompatibilitet och båda motorvägar.
4. Katalog/instruktioner och kärna kontra anpassning. Samla ändringarna efter
   owner, inte en bulkimport. Ändra inte Clerk-säkerhetspolicyn i smyg.
5. Bevisat död kod, ärliga statusord, aktuella docs och verifieringsmatris.
6. Review, aktuell full CI/deployment, previewmerge och terminal slutstädning.

Preliminär uppskattning: 3–6 timmars aktivt arbete, cirka 30–90 minuter
ytterligare CI-/reviewväntan beroende på rättningsrundor. Det är en uppskattning,
inte ett löfte eller ett verifieringskvitto. Scaffolds är nästa separata uppdrag
och ska påminnas om i sluthandoff när checklistan faktiskt är avslutad.

## Avslut

Planen får stängas först när varje punkt har verifierat utfall eller ett
uttryckligt ägarbeslut om ändrad avgränsning. Vid leverans vävs en rad in i
avklarat-indexet och detaljplanen tas bort enligt dokumentationslivscykeln.
