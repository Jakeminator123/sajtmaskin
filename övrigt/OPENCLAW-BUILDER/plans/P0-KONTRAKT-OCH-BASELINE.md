# P0 — kontrakt och baseline

## Mål

Skapa mätbarhet och ett stabilt jobbkontrakt utan att ändra generationsutfall.

## Leveranser

- benchmarkset med representativa init/follow-up/F2/F3/importfall
- maskinläsbar lane- och jobstatus
- kanonisk `BuilderJobSpec`-typ och strikt schema
- hash/receipt för `GenerationInputPackage`
- durable job/lease-design med idempotency
- central budgetpolicy
- feature flags: `classic`, `openclaw_shadow`, `openclaw_candidate`
- audit event-kontrakt och redactionpolicy
- capability/status-UI som visar OpenClaws verkliga åtkomst

## Arbetssteg

1. Mät classic-flödet på ett versionspinnat testset.
2. Dokumentera exakt seam mellan generation package och own-engine.
3. Definiera jobbets identitet, tillståndsmaskin och terminala utfall.
4. Definiera CAS, retry och cancel.
5. Definiera vilka befintliga owners varje jobbresultat måste passera.
6. Lägg telemetry utan att skicka jobb till OpenClaw.
7. Säkerhetsgranska schema och loggredaction.

## Acceptans

- inget produktionsutfall ändrat när alla nya flaggor är av
- samma prompt/base kan reproduceras med samma package-/source-receipt-hash
- stale, retry och cancel har entydiga terminala tillstånd
- telemetry kan följa prompt→package→codegen→finalize→gate
- inga råa hemligheter eller fulla filer i driftloggar

## Stoppskäl

- två konkurrerande owners för BuildSpec/jobstate
- base kan inte bindas till både version och revision
- idempotency kan inte bevisas
- oklar retention av projektartefakter
