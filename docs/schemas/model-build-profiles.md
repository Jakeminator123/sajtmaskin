# Model and build profiles

Det här dokumentet beskriver den stabila mentala modellen för builderns
modellval. Exakta profiler, modell-ID:n, envnycklar och defaults genereras från
manifestet och ska inte kopieras hit.

## Canonical ownership

| Faktatyp | Ägare |
| --- | --- |
| Tillåtna profiler, defaults och phase routing | [`config/ai_models/manifest.json`](../../config/ai_models/manifest.json) |
| Validering av manifestet | [`load-manifest.ts`](../../src/lib/ai-models/load-manifest.ts) |
| Requestvalidering och inkommande alias | [`chatSchemas.ts`](../../src/lib/validations/chatSchemas.ts) |
| Runtimeval per fas | [`phase-routing.ts`](../../src/lib/models/phase-routing.ts) och [`selection.ts`](../../src/lib/models/selection.ts) |
| Genererad mänsklig referens | [`models.generated.md`](../generated/models.generated.md) |

Vid konflikt vinner ägaren för den konkreta faktatypen. Den genererade
referensen är en projektion och detta dokument är endast en mental modell.

## Separata valytor

Buildern har tre modellrelaterade lanes och en separat flagga:

1. **Build profile** väljer generationens profil och runtime-routing.
2. **Prompt assist** förbättrar eller strukturerar användarens prompt före
   generation.
3. **Polish** är en billig, textbaserad omskrivning.
4. **Thinking** påverkar reasoning för de faser där manifestet tillåter det men
   skapar inte en ny profil eller lane.

Profil-ID, providerkodade assist-modeller och konkreta provider-ID:n är olika
typer. De får inte skickas mellan ytor utan den kanoniska normaliseringen.

## Resolution

Det stabila flödet är:

1. Requestschemat accepterar ett kanoniskt profil-ID eller ett uttryckligen
   stött compatibility-alias.
2. Selection normaliserar till en kanonisk profil.
3. Phase routing väljer modell och reasoningpolicy för aktuell
   generationsfas.
4. Providerlagret skapar rätt klient för det konkreta modell-ID:t.
5. Env-override får endast påverka de fält som manifestet deklarerar som
   overridebara.

Compatibility-alias är en inputgräns. De ska inte bli nya kanoniska profiler
eller återberättas som nuvarande defaults i docs.

## Ändringsregel

När modellpolicyn ändras:

1. ändra manifest/runtimeägaren,
2. uppdatera validator eller compatibility-mappning om kontraktet kräver det,
3. kör `npm run docs:generate`,
4. kör `npm run docs:check` och relevanta modell-/routingtester,
5. uppdatera denna fil endast om den stabila mentala modellen förändras.

Aktuell profil- och modelltabell finns i
[`../generated/models.generated.md`](../generated/models.generated.md). Envpolicy
finns i [`../generated/policies.generated.md`](../generated/policies.generated.md)
och [`../ENV.md`](../ENV.md).
