# Superprompt-replay v1 (E02)

`superprompt-replay-v1.json` är en sanitär, providerfri **hypotes och specifikation**. `formatVersion` är 1, `synthetic` är true, `paidTestsAuthorized` är false och `status` är `specification_not_execution`.

Filen beskriver två påhittade fall, `C01-lounge` och `C02-campaign`, med jämförbara `brief`- och `sources`-fält (palett, typografi, intent, `sourceKind`, valt källutfall) och med deras verkliga ämnes- och stilskillnad kvar. Den är inte observerad modelloutput, inte ett kört replay och inte en kvalitetsbaslinje. En tidigare designupplevelse är inte förväntad kvalitet.

## Avgränsning

- Inga betalda tester, ingen databas, ingen provider och inga modellanrop hör till filen.
- Begärd och effektiv modell respektive effort får vara strängen `unknown` eller `null`. Saknat värde är inte en slutsats och får inte fyllas i.
- `selectedSourceOutcome: null` betyder oregistrerat. `not_attempted` betyder att urvalssteget inte kördes. Inget av dem bevisar att inspiration saknades.
- Effektiva modell-, reasoning- och pass-fält är null. Filen fabricerar inget mätt utfall.
- Klockslag, chat-id och versions-id är syntetiska. `environment` är `synthetic`. `deployment` och `commit` är `unknown`.

Varje fall har tre separata turer: `initial`, `followup-question` och `repair`, med egna `runId` men samma `versionId`. Följdfrågan är en fråga utan build-begäran. `parentRunId` för fråga och reparation pekar på initialturen. Reparationen behåller ursprungligt valt material och hela prosaavsikten. En export som bara tar den senaste raden per version förlorar därför ursprungsurvalet.

## Eval

Enda publika eval-ingången är `npm run eval`, beskriven i `src/lib/gen/eval/README.md`. Lägg inte till en replay-runner, ett `eval:*`-script eller en ny CLI för den här fixturen.

## Import

Providerfria enhetstester som redan finns får importera JSON-filen. Den här mappen lägger inte till test, runner eller codegen-prompt. Capability-flaggor är inte förberäknade här.
