# B2 — färre parallella sanningar

Utförare: 2. Beroende: respektive kodpaket eller uttrycklig fristående tilldelning.
Status: se [körbordet](../00-master-plan.md).

## Ändring

- Använd befintligt `config/control-plane/` som index, inte ny runtime-policy.
  Kod/deklarativ owner först; konsument och validator därefter, docs sist.
- `config/user_degraded_env.txt` har en Backoffice-editor men ingen runtime-loader.
  Konsolidera texten med rätt env-kontrakt och ta bort onödig egen editor om
  ingen egen produktnytta återstår. Gör ingen implicit ändring i env-beteendet.
- Rätta aktuell `src/lib/gen/README.md`, `docs/architecture/llm-pipeline.md`
  och missvisande stegkommentarer när implementationen är fast. Exempel från
  basen: preview beskrivs som HTML/shims; engine-kommentaren och finalize-kontraktet
  anger olika ordning; init/followup bygger fan-in manuellt trots förenklad docbild.
- Håll mänsklig översikt tunn. Ta bort duplicerad steg-/fältbeskrivning och
  ersatt historik; skapa inte en permanent manual av denna plan.
- Ändra genererade vyer via deras generator bara när owner ändrats.
  `declared-only` är inte i sig en raderingssignal: tooling kan vara konsument.

## Klart och verifiering

En pekare per konkret beslut, inga konkurrerande definitioner. Uppdatera
Backoffice-registrering/schema/domänkarta om en sida tas bort. Kör då
`backoffice:test`; annars docs-/registerkontroller som berörs. Typkontroll behövs
om TypeScript ändras, inte för ren prosa. Länkar och genererade referenser ska stämma.

## Resultat

Ej startad. Lista borttagna dubbletter/editorer samt kvarvarande canonical owners.
