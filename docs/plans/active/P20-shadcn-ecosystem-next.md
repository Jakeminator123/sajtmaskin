# P20 — shadcn-ekosystem: inkrementellt vs enhetlig pipeline

Status: Active (strategisk uppföljning)
Skapad: 2026-04-15
Prioritet: Medel (beror på genereringskvalitet och underhållsbehov)

## Bakgrund

Tidigare fanns en tänkt uppdelning i **faser** (t.ex. blocks/recipes, sedan `registry:font`, sedan scaffold-specifik toolkit). Dessa kan drivas **fristående** som små leveranser — men de riskerar också att bli tre parallella halvfärdiga spår om de inte binds till samma **kontrakt** mot generatorn.

## Inkrementellt (”36h i repot”-stil)

Kort, fokuserat arbete som matchar checklistan i `Kvarvarande-uppgifter.md`:

1. **Blocks → section recipes** — metadata eller små recept så genereringen kan välja sektioner konsekvent.
2. **`registry:font`** — tydlig fontkedja i samma anda som shadcn-registret (färre manuella fontbeslut i prompt). Font-register (`google-font-registry.ts`) levererat; upstream `registry:font`-integration kvar.
3. ~~**Scaffold-toolkit + komponentpool**~~ — **KLART** (`65921ac53`): `buildRegistryDrivenShadcnToolkitSummary` tar `ScaffoldToolkitContext`, grupperar "Primary" vs "Also available".

Detta ger snabb effekt om varje steg **valideras** mot minst en riktig generation + importlint.

## Större, mer sofistikerat spår (längre horisont)

Ett mer enhetligt sätt än tre lösa tickets:

1. **Ett manifest** som generatorn och preview kan enas om: vilka komponenter, vilka alias (`@/components/ui/*`), vilka fonts, vilka blocks finns i vilken scaffold.
2. **Verifiering före finalize** — missmatch mellan LLM-output och tillgänglig UI-yta fångas tidigt (samma filosofi som `verify` i övriga flöden).
3. **Uppströmssynk** — regelbunden eller CI-driven uppdatering mot shadcn-registret / projektets `components.json`, så drift inte blir “manuell cherry-pick”.
4. **Agentstöd** — repo har redan verktyg kring shadcn (t.ex. MCP/registries i editor-miljö); att låta **sökning av komponenter** och **recept** vara data-drivet minskar promptbrus.

Detta är **inte** motsatsen till de tre nivåerna — det är ramen som gör att nivå 2–3 inte divergerar.

## Rekommenderad ordning

- Om **stabilitet** är viktigast: gör blocks/recipes **först** med hård validering, sedan fonts, sedan pool per scaffold.
- Om **underhåll** är viktigast: börja med manifest + verify-hook, sedan fyll på recipes.

## Koppling till andra aktiva planer

- **P17** (bildmaterialisering) och **P18** (preview) påverkar *hur* UI upplevs men ändrar inte shadcn-kontraktet.
- **P19** (ingress) kan påverka *vilken* kod som körs — viktigt att inte blanda ihop UI-regress med innehålls-ingress.
