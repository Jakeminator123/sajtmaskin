# MVP-säkerhet — kvarvarande lanseringskrav

Status: active
Ägare: Jakob för produkt-/driftbeslut; tilldelad agent för avgränsat arbete.
Ursprung: 2026-09-09. Konsoliderad 2026-11-05.

## Levererat

Google-koppling SM-079, wizard-RLS/ACL SM-078, kontolås före betalt arbete
och hostens releaseidentitet är byggda. Backloggens arkiv äger bugstatus;
beställ inte om dessa implementationer eller återställ publika wizardgrants.
Historiskt felkopplade Googlekonton repareras inte automatiskt av kodfixen.

Aktuell DB-identitet ägs av
[config/db-targets.json](../../../../config/db-targets.json):
Development/Preview → DEV, Production → PROD. Äldre planpåståenden om delad
preview/prod-DB är ersatta. Ingen DB-split, migration eller aktuell live-ACL/
ledgerstatus intygas av konsolideringen. CI/push är inte ett DB-apply-mandat.

## SM-080 är fortsatt lanseringsspärr

[Beslut 2026-09-18](../../../decisions/README.md) ger varje kundprojekt en
egen Fly Machine för install, verify och runtime. Kontrollplanet kan vara
delat; gästen får inte dela syskonfilsystem/processauktoritet, kontrollplans-
hemligheter eller den delade skrivbara cachen. Path-jail, filtrerad env eller
en gemensam non-root-användare är inte isolering. Ingen ny jail-omtagning.

Maskinläget är kod och backloggen antecknar ett driftbevis 2026-11-03 med
machine/configured:true. Det ersätter gammalt ”inte driftsatt”, men är inte
aktuell livekontroll eller E2E-isoleringsacceptans. Följ backloggens SM-080/M03.
Gästerna är 2 vCPU/4 GB. Pågår 2026-11-11: paket A krymper kontrollplanet
till performance-1x/2 GB och förstör gästen efter 25 min inaktivitet; paket B
bygger egen origin per chatt (M03). Beslutsrader i
[registret](../../../decisions/README.md). Volymtopologi, pooling/återanvändning
och kostnad kräver fortfarande pilotbevis.

Owners: [hostacceptans](../../../../preview-host/README.md),
[gästpilot](../../../../preview-host/guest/README.md),
[machine-runtime](../../../../preview-host/src/runtime/machine-runtime.js) och
[maskinägare](../../../../preview-host/src/machines/project-machines.js).
Samma Fly-volym kan inte bara delas mellan gäster; separera workspace,
paketcache, store och proxy enligt isoleringsägaren.

### Nödvändiga acceptansprov

I disponibel avsedd plattform med syntetiska data, A och B genom riktig
install/verify/dev samtidigt:

- Läs-/skrivförsök mot B och hoststore via absoluta/relativa paths, symlänkar
  och /proc nekas; B förblir oförändrat. A får inte läsa syntetisk hosthemlighet
  eller signalera B:s process.
- Skilj TCP-nåbarhet från behörighet: maskiner kan nå varandra över 6PN.
  Utan B:s token ska agenten neka fil/kommando/dev/proxyåtkomst; B:s dev-port
  lyssnar bara på loopback. Kontrollplanets preview, Machines-API och eventuell
  /.fly/api får inte vara åtkomliga utan avsedd nyckel. Full nätseparation
  utöver token kräver egen verifierad policy/arkitektur.
- Timeout, resursöverlast, restart, hibernate och destroy för A påverkar inte B
  eller lämnar processer/mounts/data åt nästa tenant. Godkänd proxy och
  paketinstallation fungerar; obevisad gästidentitet fail-closar utan shared-
  fallback. Spara faktisk käll-SHA, image, policy och nekanden.
- Browser-origin är separat fortfarande öppen: unik origin per chat, bindning
  av HTTP/WS-host till chat, DNS/TLS och övergång från gemensam origin måste
  bevisas. Separata Machines eller iframe-rendering ersätter inte detta.

## Övriga uttryckliga releasekrav

| Rest | Mottagare och kvarvarande bevis |
|---|---|
| SM-081 kostnad | Faktisk reservation/kostnadstak, andra betalda endpoints/repair/verifiering och uppskjuten avräkning. Kontolåset är inte maxkostnadsgaranti. Ägare: generation-admission/generation-lock och backloggen. |
| Kontolås i drift | Verifiera rätt ioredis-backend för de miljöer som faktiskt delar saldo. Upstash REST-rate-limit är separat; saknat Redis ska fail-closa. Aktuell DB-/miljömappning kommer först, gamla shared-DB-antaganden följer inte med. |
| Historiska Googlekonton | Bedöm kontohistorik och beslutad återställningsväg; ingen automatisk massnollning av legitima lösenord utifrån email_verified. |
| Vanlig kundresa | Registrering → gratisgenerering → ändring → creditköp → publicering, avbrott och retry med vanligt konto. Tidigare krav på minst 20 kontrollerade resor före liten pilot består tills ägaren uttryckligen ändrar det. Ett initprov är inte en hel resa. |
| Återställning/support | Verifierad väg för förlorat lösenord/konto. |
| Bolag/integritet | Ägaren bekräftar juridiskt namn/orgnr/postadress/support, avtal, lagringstider och överföringsmekanismer; inga uppfunna företag eller garantier. |
| Previewstabilitet | Verklig release-SHA, klassificerade blockers och kontrollerad samtidighet. Capture/burst och inspector ägs av backloggens `SM-072`/`SM-073` (verifieringsplanen avklarad 2026-11-11). |

## Driftgräns och avslut

Nya migrationer går via befintlig runner, rätt verifierat mål och separat
mandat; tillämpade filnamn ändras inte och rollback återinför inte publika
ACL-grants. App-/hostrollback kan återinföra kodrisk och är separat driftbeslut.
En grön app-preview visar inte vilken Fly-image eller DB-schema som används.

[BUG-SWARM-BACKLOG.md](../../../../BUG-SWARM-BACKLOG.md) äger SM-078–SM-081
och senare verkliga defekter. Denna plan är en releasechecklista, inte en
parallell buggkö. Ingen automatisk stängning av SM-080 eller annan
runtimeacceptans följer av Gitmerge, unit/guard-tester eller lyckad F2-init.
