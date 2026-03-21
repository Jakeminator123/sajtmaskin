# Tre nivåer: Sajtmaskin-app, motor, användarens sajt

Det här dokumentet svarar på frågan: *ska shadcn och liknande källor bara finnas i grundmallar för slutanvändare, eller också i själva Sajtmaskin — och kan användare “använda det manuellt”?*

## 1. Sajtmaskin-appen (din produkt)

**Ja — här ska shadcn vara riktig kod.**

- `components.json` i projektroten styr CLI-setup.
- Officiellt flöde: `npx shadcn@latest init` / `add` — komponentkod hamnar i repo (t.ex. under `src/components/ui/`).
- Byggarens egna skärmar: sammansatta block under `src/components/builder/` (och liknande), ovanpå samma UI-bas.

Det här är **inte** bara dokumentation: det är runtime-UI för dig som bygger produkten.

## 2. Motorn (generering, prompts, registry)

**Ja — här ska shadcn vara *kunskap och styrning*.**

I repot finns redan t.ex.:

- `src/lib/shadcn-registry-service.ts` — hämtning/cache av registry-data  
- `src/lib/shadcn-registry-utils.ts` — bl.a. `buildShadcnBlockPrompt`  
- `src/lib/gen/context/registry-enricher.ts` — koppling mot registry  
- Builder-komponenter som låter användaren välja block (`UnifiedElementPicker`, `UiElementPicker`, …)

Här handlar det om **regler, snippets, importmönster och promptkontext** så att modellen bygger rätt — inte om att dumpa hela externa repos i varje generation.

## 3. Användarens genererade hemsida

**Ja, men selektivt — via interna scaffolds och bara nödvändiga delar.**

- Startkoden ska vara **liten, intern och säker att ändra** (se befintlig scaffold-princip i projektet).
- **Inte:** hela shadcn-biblioteket eller slumpmässiga templates in-checkade som “användarens app”.
- **Ja:** scaffold kompatibel med shadcn/Tailwind/Next, plus de komponenter som faktiskt behövs för den genererade sidan.

Kort: för slutkundens sajt är **intern startkod + utvalda mönster** viktigare än “npm install shadcn” i abstract.

## “Manuellt” för användare

Det som redan liknar *manuell användning* i produkten är **block-/UI-val i buildern** kopplat till registry och prompts — alltså kuraterade val, inte fri klipp-och-klistra från hela internet.

Om du vill gå längre (t.ex. tydlig **resurslista** eller hjälpartiklar med länkar till shadcn.io-kategorier):

- Lägg det i **produkt-UX eller docs** (t.ex. `docs/`), inte som gigantiska in-checkade mall-repos.
- Externa fynd som inte är runtime-kod kan samlas som **dossiers** enligt `WORKFLOW_nedladdning_mappar.md`.

## Fel vs rätt modell (sammanfattning)

| Fel | Rätt |
|-----|------|
| Bara skriva att ni gillar shadcn | shadcn som faktisk kod i appen där UI byggs |
| Hoppas modellen “fattar” | Motor känner registry/snippets/promptar |
| Dumpa hela mallbibliotek i varje användarprojekt | Interna scaffolds + nödvändiga komponenter |

## Framtida steg (valfritt)

Egen **shadcn registry** för interna block är möjlig längre fram (officiellt fortfarande experimentellt) när ni har stabila interna komponenter — bra när ni vill distribuera egna snippets konsekvent.
