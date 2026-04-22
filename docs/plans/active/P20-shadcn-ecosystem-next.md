# P20 — shadcn-ekosystem: inkrementellt vs enhetlig pipeline

Status: Active (Nivå 1 + 2 + 3 KLARA 2026-04-20)
Skapad: 2026-04-15
Prioritet: Låg (alla tre nivåer levererade som shrink-MVP; full uppströms `registry:font`-ingestion kvar som framtida arbete men inte längre blockerande)

## Bakgrund

Tidigare fanns en tänkt uppdelning i **faser** (t.ex. blocks/recipes, sedan `registry:font`, sedan scaffold-specifik toolkit). Dessa kan drivas **fristående** som små leveranser — men de riskerar också att bli tre parallella halvfärdiga spår om de inte binds till samma **kontrakt** mot generatorn.

## Inkrementellt (”36h i repot”-stil)

Kort, fokuserat arbete som matchar checklistan i `Kvarvarande-uppgifter.md`:

1. ~~**Blocks → section recipes**~~ — **KLART (shrink-leverans) 2026-04-20** (`6c9b20b25`): `selectCandidates()` i `community-registry-fetch.ts` använder DJB-hash av `prompt::sectionType::namespace` istället för `Math.random()`. Samma prompt → samma section-recipes över reruns. Subagent-rekommendation från P29-utredning levererad utan att introducera deterministisk-bara-recept-yta.
2. **`registry:font`** — tydlig fontkedja i samma anda som shadcn-registret (färre manuella fontbeslut i prompt). Font-register (`google-font-registry.ts`) levererat; upstream `registry:font`-integration kvar.
   - **Status:** Shrink-MVP klar 2026-04-20 — `scripts/typography/validate-font-pairings.ts` (`npm run typography:validate-pairings`) validerar att varje fontnamn i scaffold-variants `fontPairings` matchar en post i `google-font-registry.ts`. Pure-funktionsdel täckt av `scripts/typography/validate-font-pairings.test.ts`. Drift-detektering finns nu på plats; full uppströms `registry:font`-ingestion är fortsatt framtida arbete men ej längre blockerande.
   - Initial körning hittade en (1) verklig drift: `config/scaffold-variants/blog/editorial-serif.json` refererar `Source Sans 3` som inte finns i registret. Lämnad orörd för orchestrator-beslut (lägg till font i registret eller byt referens i variant).
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
