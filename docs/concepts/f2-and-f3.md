# F2 och F3

F2 och F3 är två olika kontrakt. F2 prioriterar trovärdig design och snabb
iteration. F3 prioriterar riktiga integrationer, build och deploybarhet.

|                  | F2 / `fidelity2`                            | F3 / `fidelity3`                  |
| ---------------- | ------------------------------------------- | --------------------------------- |
| Syfte            | Design och preview                          | Integration, build och deploy     |
| Start            | Normalt läge för generation                 | Explicit användarhandling         |
| Data/integration | Mock eller ofarlig placeholder får användas | Riktiga providers och env-värden  |
| Gate             | RenderGate (`designPreview`)                | ReleaseGate (`integrationsBuild`) |
| Resultat         | Itererbar designversion                     | Separat integrationsversion       |

## F3 är explicit

Ord som Stripe, auth eller databas i en prompt får nominera capabilities och
förbereda en F2-yta. De får inte automatiskt flytta projektet till F3.
Övergången sker genom det explicita finalize-design-/integrationsflödet.

Det skyddar både användarens avsikt och projektets scope. En designfråga om en
checkout ska inte oavsiktligt kräva secrets, server-wiring och en full release.

## Mocks och placeholders i F2

Ett valt hard-dossier deklarerar hur dess visuella yta fungerar i F2 genom
manifestets `mock`-policy. Preview kan också få pipeline-skapade, ofarliga
placeholdervärden för valda dossiers.

F2-fallbacken ska:

- visa den avsedda upplevelsen utan riktiga nycklar,
- vara tydligt skild från konfigurerad integration,
- aldrig persistera previewvärden som riktiga projektvärden,
- aldrig användas som bevis på release-readiness.

## Riktiga integrationer i F3

F3 använder projektets riktiga env-värden och integrationernas serverfiler.
Dossiermanifestens enforcement avgör vilka saknade nycklar som blockerar build.
ReleaseGate kör den ordnade lane som ägs av
`config/ai_models/manifest.json#qualityGateTiers` och
`src/lib/gen/verify/quality-gate-checks.ts`, plus relevanta
env-/capabilitykrav.

Om inga build-blocking nycklar behövs skapas ändå en separat
`integrations`-version. F2-versionen ska inte muteras eller märkas som F3 i
efterhand.

## RenderGate och ReleaseGate

RenderGate svarar på: kan designversionen starta och rendera ärligt? Vissa
typecheck-fynd kan vara Advisory i F2 om de inte innebär render-risk.

ReleaseGate svarar på: kan integrationsversionen byggas och publiceras med sina
verkliga krav? Varje checkutfall klassas av runtime som Advisory, Blocker eller
icke-reparerbart tooling-/konfigurationsfel.

Den här filen förklarar semantik, inte en andra checklista. Exakta checks och
ordning ska läsas från owner-källorna ovan och den genererade policyreferensen
när den finns på master.

Fördjupning:

- [`../architecture/runtime-contracts.md`](../architecture/runtime-contracts.md)
- [`../contracts/env-flow.md`](../contracts/env-flow.md)
- [`../architecture/llm-pipeline.md`](../architecture/llm-pipeline.md)
