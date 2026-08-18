# Designläge och integrationsbygge

Designläge och integrationsbygge är två olika kontrakt. Designläget
prioriterar trovärdig design och snabb iteration. Integrationsbygget
prioriterar riktiga integrationer, build och deploybarhet.

De är **versions- och gate-lanes**, inte ett svartvitt mognadsbetyg på hela
sajten. Demo/live/planerad avgörs per Byggblock. En OpenAI-chatt kan därför
vara live i en integrationsversion samtidigt som tre andra Kopplade Byggblock
fortfarande är planerade eller kör demo. Ett lyckat integrationsbygge ska inte
förändra chattens visuella design; det byter wiring och verifieringskrav.

|                  | Designläge / designversion (`fidelity2`)    | Integrationsbygge / integrationsversion (`fidelity3`) |
| ---------------- | ------------------------------------------- | ----------------------------------------------------- |
| Syfte            | Design och preview                          | Integration, build och deploy                         |
| Start            | Normalt läge för generation                 | Explicit användarhandling                             |
| Data/integration | Demo eller ofarlig placeholder får användas | Riktig provider-kod; riktiga värden när de finns, annars ärlig degradering enligt enforcement |
| Gate             | RenderGate (`designPreview`)                | ReleaseGate (`integrationsBuild`)                     |
| Resultat         | Itererbar designversion                     | Separat integrationsversion                           |

## Integrationsbygget är explicit

Ord som Stripe, auth eller databas i en prompt får nominera capabilities och
förbereda en yta i designläget. De får inte automatiskt flytta projektet till
ett integrationsbygge. Övergången sker genom det explicita
finalize-design-/integrationsflödet.

Det skyddar både användarens avsikt och projektets scope. En designfråga om en
checkout ska inte oavsiktligt kräva secrets, server-wiring och en full release.

## Mocks och placeholders i designläget

Ett valt Kopplat Byggblocks effektiva demoläge beskriver hur dess visuella yta
fungerar i designläget. Det läses ur manifestets `mock`-policy; utelämnat fält
betyder `none`. Preview kan också få pipeline-skapade, ofarliga
placeholdervärden för valda dossiers.

Designlägets fallback ska:

- visa den avsedda upplevelsen utan livekonfiguration,
- vara tydligt skild från konfigurerad integration,
- aldrig persistera previewvärden som riktiga projektvärden,
- aldrig användas som bevis på release-readiness.

## Vad "Bygg integrationer" gör

Klicket utgår från den valda designversionen och läser vilka Byggblock som
kräver integrationsbygge, planerades i designläget och ännu saknar filbevis.
Designläget har sparat både capability och exakt dossier-id, så `auth` +
Supabase fortsätter som `supabase-auth` i integrationsbygget.

1. Product Postcheck och versionens filer kontrolleras.
2. Parent-versionens redan byggda integrationer och de planerade dossier-id:na
   blir en gemensam `Tier3BuildSpec`.
3. Build-enforced nycklar valideras. Projektvärden används när de finns;
   katalogens tillåtna placeholders kan bära demoläge. En build-nyckel utan
   vare sig riktigt värde eller tillåten placeholder stoppar före codegen.
4. Finns minst ett planerat, obyggt Byggblock låses dess capability + exakta
   dossier-id i snapshoten och en LLM-runda i integrationsläget bygger
   provider-koden, server-routes och UI-wiring mot den oförändrade
   designversionen.
5. Den nya `integrations`-versionen måste passera ReleaseGate.

Om inga planerade integrationer återstår och ingen annan integration kräver en
LLM-runda skapas i stället en byte-för-byte integrationsfork och bara
ReleaseGate körs. Den deterministiska vägen betyder alltså "inget återstår att
bygga", inte "nycklarna råkar vara feature-runtime".

## Riktiga integrationer i integrationsbygget

Integrationsbygget installerar integrationernas riktiga provider-/serverkod.
Projektets riktiga env-värden används när de finns; `feature-runtime` och
`warn-only` får fortfarande degradera ärligt till demo/self-disable tills
värdet sparas i Byggblock-panelen. Dossiermanifestens enforcement avgör vilka
saknade nycklar som blockerar build. ReleaseGate kör den ordnade lane som ägs
av `config/ai_models/manifest.json#qualityGateTiers` och
`src/lib/gen/verify/quality-gate-checks.ts`, plus relevanta
env-/capabilitykrav.

Det skapas alltid en separat `integrations`-version. Designversionen muteras
eller märks aldrig om till integrationsversion i efterhand.

## RenderGate och ReleaseGate

RenderGate svarar på: kan designversionen starta och rendera ärligt? Vissa
typecheck-fynd kan vara Advisory i designläget om de inte innebär render-risk.

ReleaseGate svarar på: kan integrationsversionen byggas och publiceras med sina
verkliga krav? Varje checkutfall klassas av runtime som Advisory, Blocker eller
icke-reparerbart tooling-/konfigurationsfel.

Den här filen förklarar semantik, inte en andra checklista. Exakta checks och
ordning ska läsas från owner-källorna ovan och den genererade policyreferensen
när den finns på master.

## Legacy-alias: F2 och F3

**F2** och **F3** är utfasade användarbegrepp. De lever kvar som kodalias:

| Legacy-ord | Använd i stället | Kodidentifierare som behålls |
| ---------- | ---------------- | ---------------------------- |
| F2 | designläge / designversion | `fidelity2`, `lifecycleStage: "design"`, `designPreview` |
| F3 | integrationsbygge / integrationsversion | `fidelity3`, `lifecycleStage: "integrations"`, `integrationsBuild` |
| Kräver F3 | Kräver integrationsbygge | `requiresF3`, `dossierRequiresF3()` |

Filnamnet `f2-and-f3.md` behålls så att befintliga länkar fortsätter att peka
hit. Se [glossaryn](../architecture/glossary.md) för mappningen.

Fördjupning:

- [`../architecture/runtime-contracts.md`](../architecture/runtime-contracts.md)
- [`../contracts/env-flow.md`](../contracts/env-flow.md)
- [`../architecture/llm-pipeline.md`](../architecture/llm-pipeline.md)
