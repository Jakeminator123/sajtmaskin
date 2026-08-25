# Utvärdering och rollout

## Benchmark

Bygg ett versionspinnat testset med minst följande grupper:

- enkla F2-landningssidor
- innehållsrika websites
- flerroute-appar
- följdändringar som ska bevara befintlig design
- tydlig redesign som får låsa upp variant/scaffold
- dossiers i soft/mock
- hårda F3-integrationer
- importerade repos
- 3D/media
- avsiktliga build-/runtimefel

Varje testfall sparar prompt, base snapshot, GenerationInputPackage-hash,
modellane, seed när tillgänglig och exakt plattform-SHA.

## Jämförelse

Kör minst:

1. Classic pipeline.
2. Classic + read-only OpenClaw-plan, planen ignoreras.
3. OpenClaw candidate med samma modellklass och budget.
4. Blind kvalitetsbedömning utan att granskaren vet vilken lane som byggt.

## Mätetal

### Kvalitet

- första godkända preview
- route-/kravuppfyllelse
- visuell och funktionell blindbedömning
- preservation vid follow-up
- dossier-/env-/providerkontrakt
- antal repairvarv
- verifierings- och releaseutfall

### Prestanda och kostnad

- p50/p95 till första synliga preview
- p50/p95 till terminal versionstatus
- modellturns och tool calls
- input/outputtokens
- kostnad per accepterad version
- timeout, OOM och worker-restart

### Säkerhet

- cross-tenant-händelser: måste vara noll
- secret exposure: måste vara noll
- stale/double persist: måste vara noll
- nekade verktygsanrop
- prompt-injection-testutfall
- cleanup- och leasefel

## Föreslagna launch gates

Exakta numeriska trösklar ska fastställas efter P0-baseline. Följande är fasta:

- noll tenant- eller secretincidenter
- ingen försämring av stale-base/idempotency
- agentkandidat passerar samma finalize/gates som classic
- kill switch och fallback är verifierade i skarpt liknande miljö
- audit kan förklara varje ändrad fil och varje verktygsanrop

Kvalitetsvinst måste bedömas per kategori. Ett bättre medelvärde får inte dölja
att follow-up preservation eller F3 blivit sämre.

## Rolloutordning

1. Intern shadow planner.
2. Intern offline candidate utan persist.
3. Intern draftversion bakom explicit flagg.
4. Opt-in för enkla F2-initbyggen.
5. Liten procentstyrd F2-trafik med automatisk classic fallback.
6. Vanliga follow-ups när preservation/CAS är stabilt.
7. Flerroute och tyngre appar.
8. Imported repos och F3 sist.

## Automatisk fallback

Fallback till classic när:

- buildern inte startar inom budget
- jobtoken/lease blir ogiltig
- tool broker ger policyfel som inte kan lösas
- två preview-/repairvarv är förbrukade
- candidate submit är stale
- sandbox/checkinfrastruktur är unavailable

Ett stale-jobb får inte automatiskt köra classic mot en ny base utan att
huvudappen skapar ett nytt, användarsynligt generationsförsök.

## Rollback

- stäng feature flag
- återkalla Builder-audience/tokens
- cancel alla aktiva leases
- låt sandboxes dö efter TTL
- behåll senaste promoted version oförändrad
- behåll agentkandidater som auditerbara men icke-promoted artifacts enligt
  retentionpolicy
- Sajtagenten fortsätter fungera på sin oförändrade minimalprofil
