# Mental model

Tänk på Sajtmaskin som en kompilator för ett versionsstyrt webbprojekt:
användarens avsikt blir en policy, policy och kontext blir kod, och koden måste
bevisas användbar innan nästa steg.

## Från avsikt till version

1. **Prompt** är användarens instruktion för den aktuella rundan.
2. En **Deep Brief** strukturerar init. En **Snapshot-Brief** sammanfattar
   tidigare beslut för follow-up.
3. **Orchestration** samlar signalerna och väljer projektets byggunderlag.
4. **BuildSpec** är runtime-policyn för rundans scope, kvalitet, preview,
   verifiering och budget.
5. Core Rules och request-specifik Dynamic Context leder code generation.
6. **Normalize/finalize** gör mekaniska korrigeringar och kandidatkontroller
   före persist. Residual som kräver modellbedömning kan gå genom samma
   **RepairGate** redan här.
7. Resultatet sparas som en draft/version innan preview-handoff och den
   VM-baserade RenderGate/ReleaseGate.
8. Gaten kan promotera versionen, visa en Advisory, stoppa på en Blocker eller
   skicka ett verifierat kodfel till **RepairGate**.
9. RepairGate är den enda porten för modellbaserad repair både i finalize och
   efter en post-persist gate. Efter persist kan den lagra en revision-bunden
   repair-kandidat på samma target-version, som verifieras igen och uppdaterar
   versionen först när den accepteras.

Normal generation skapar en ny versionsrad. Historiska basversioner ska
bevaras, men “immutable version” är inte ett generellt runtimekontrakt:
target-version-repair och accepterad repair kan uppdatera en befintlig rad.

## Projektets byggdelar

| Begrepp        | Roll                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| **Scaffold**   | Projektets runtime-startpunkt: grundstruktur, beroenden och skyddade filer      |
| **Variant**    | Ett visuellt uttryck inom scaffold: typografi, tema, motiv och prompt hints     |
| **Capability** | En intentnyckel som beskriver en förmåga, exempelvis auth eller payments        |
| **Dossier**    | Ett capability-styrt byggblock med manifest, instruktioner och eventuella filer |

Capability styr dossier selection. Dossier-grupper i UI är bara presentation
och får inte fatta selection-beslut. En Template (v0-mall) i galleriet är en
annan produktväg och ska inte blandas ihop med scaffold eller dossier.

## Två operationer

**Init** skapar projektets grund och får välja scaffold, variant, route plan och
capabilities. **Follow-up** är ett delta på den befintliga graphen. Den ska
bevara grunden om användaren inte tydligt ber om redesign eller borttagning.

## Två fidelity-lägen

**F2** är design och preview. UI ska kunna upplevas utan att riktiga
integrationer är anslutna. **F3** är ett explicit integrations-, build- och
deploysteg med riktiga env-värden och striktare verifiering.

En **mock** är dossierns deklarerade F2-beteende, exempelvis seedad eller
förutsägbar data. En **placeholder** är ett ofarligt tillfälligt värde som gör
preview möjlig. Varken mock eller placeholder är bevis på att en integration är
konfigurerad för F3.

## Bevis och leverans

Finalize har kontroller före persist. Därefter avgör VM-gaten om den
persisterade versionen uppfyller aktuell policy. RenderGate bedömer F2;
ReleaseGate bedömer F3:s build- och releasekrav. Ett problem kan vara en synlig
Advisory eller en Blocker.

**Repair** ändrar en kandidat för att lösa ett verifierat fel och måste sedan
köra samma relevanta signal igen. Grönt utan verkligt bevis är false-green.

**Preview** är VM-runtime för iteration. **Deploy** publicerar en vald version
till hosting och ger en `liveUrl`. En `previewUrl` är aldrig automatiskt en
publicerad sajt.

## Var sanningen finns

Runtime owners och fördjupning:

- [`../architecture/system-overview.md`](../architecture/system-overview.md)
- [`../architecture/runtime-contracts.md`](../architecture/runtime-contracts.md)
- [`../architecture/code-map.md`](../architecture/code-map.md)
- [`init-and-follow-up.md`](init-and-follow-up.md)
- [`f2-and-f3.md`](f2-and-f3.md)
