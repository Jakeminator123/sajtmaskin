# B3 — källkvitto: vad nådde faktiskt prompten

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: **implementerad** (#1035).

## Problemet

En generering kan i dag inte förklaras i efterhand. `GenerationInputPackage`
(`src/lib/gen/generation-input-package.ts:36-41, 124-126`) sparar `promptSize` och
`variantTemplateId` — men inte:

- vilka UI Recipes som valdes, från vilken källa (officiell shadcn eller
  shadcnblocks Pro) och om riktig källkod eller bara metadata följde med,
- vilka dossiers som valdes och för vilken capability,
- vilken variant-addendumpost som gav utdragen och med vilken status
  (`hit` / `disabled` / ZIP-fallback),
- vad som föll bort i tokenbudgeteringen efter att det valts.

Konsekvensen: när en sajt ser generisk ut går det inte att svara på om det berodde
på varianten, på en återkommande template-referens, på ett UI Recipe eller på att
inget av det ens nådde prompten. Det gör både B4 och B5 omöjliga att utvärdera.

Ytan finns redan. `backoffice/pages/selection_rationale.py` heter «Selection
Rationale — varför valdes detta?» och läser redan senaste
`generation-input-package.json` samt telemetri (rad 143-173, 223, 339, 423). Den
saknar bara data.

## Uppgift

Utöka det som redan sparas per generering med ett källkvitto, och visa det i
Selection Rationale.

Krav:

- Lägg till ett `sources`-fält i `GenerationInputPackage` med en post per vald
  källa: `kind` (`variant-reference` | `ui-recipe` | `dossier` | `media`), `id`,
  `origin` (t.ex. `shadcn-official` / `shadcnblocks` / `blob-template`),
  `reason` (varför den valdes), `authority` (`krav` | `mönster` | `inspiration`)
  och `reachedPrompt` (bool, satt **efter** tokenbudgeteringen).
- `reachedPrompt` är hela poängen: en källa som valdes men prunades bort ska syfta
  som vald-men-utesluten, inte försvinna.
- Sätt fältet i den kanoniska ägaren: `src/lib/gen/orchestrate/finalize-prompts.ts`
  har redan alla delarna i handen (`variantTemplateInspiration`, `base.uiRecipes`,
  `base.dossierSelection`, `mediaCatalog`). Bygg det där, inte i konsumenterna.
- Visa kvittot i `selection_rationale.py` som en tabell i den befintliga
  «Scaffold-/variantval»-sektionen. Ingen ny Backoffice-sida, ingen ny flik.
- Håll det litet: inga kodutdrag i kvittot, bara ID, källa, skäl och status.

## Vad som INTE ingår

- Ingen ny DB-tabell och ingen migration. Prompt-dumpen +
  `generation_telemetry` räcker för första versionen.
- Ingen ny yta i buildern eller chatten. Det här är ett ägar-/utvecklarverktyg.
- Ändra inte urvalslogiken. Det här mäter, det styr inte.
- Logga inte prompttexten. `promptSize` är redan måttet.

## Verifiering

- `npm run typecheck` + riktad vitest på
  `src/lib/gen/orchestrate/generation-package.test.ts` och
  `src/lib/gen/system-prompt/budget.test.ts`.
- Ett test som visar att en källa som prunas av budgeten får
  `reachedPrompt: false` och ändå finns med i kvittot.
- Kör en riktig init-generering och verifiera att kvittot syns i Selection
  Rationale — inte bara att fältet finns i typen.
- `npm run docs:generate` + `docs:check` om schemat projiceras.

## Klart när

Två genereringar av samma prompt går att jämföra källa för källa, och frågan
«använde den här sajten något jag betalar för?» går att svara på utan att gissa.
