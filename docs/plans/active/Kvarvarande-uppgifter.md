# Sajtmaskin — kvarvarande uppgifter (kanonisk lista)

Flyttad från `halvfärdiga_filer/` (2026-04-15). Uppdaterad 2026-04-15 efter genomgång.
**Smala spår med egen fil:** se `README.md` i denna mapp (P17–P20).

## Planerade förbättringar (kräver kodarbete)

- [ ] shadcn Nivå 2: Blocks-metadata som section recipes — upstream stöder `registry:block` med `registryDependencies` och `target`-fält; undersök om blocks kan bli det "smartare lagret" för sektionsval i generatorn (se P20)
- [ ] shadcn Nivå 3: `registry:font` för fonthantering — upstream har nu `registry:font` med `font.family`, `font.variable`, `font.selector`, `font.dependency`; borde konsolideras med nuvarande fontlogik (variant `fontPairings` + CSS-variabler)
- [x] ~~Scaffold-specifik toolkit-lista per scaffold~~ — implementerat: `buildRegistryDrivenShadcnToolkitSummary` tar nu `ScaffoldToolkitContext` (scaffoldId + sectionInventory); grupperar "Primary for this scaffold" vs "Also available"
- [x] ~~Komponentpool per scaffold~~ — ingår i ovan; `## Your Toolkit` filtreras nu via `SCAFFOLD_PRIMARY_GROUPS` + `SECTION_TO_GROUPS`

## Uppskjutet (inget blockerar)

- [ ] Konsolidera dashboards (stor Python-refaktor)
- [x] Template-library pipeline: hydrate repo-cache
- [x] Dossier-manifests: `recommendedScaffoldFamilies` -> `recommendedScaffoldIds`
- [x] ~~`BUILD_INTENT_GUIDANCE` dubblett~~ — löst: extraherad till `intent-guidance.ts` (`b89147172`)
- [ ] Fallback-guidance (MOTION/VISUAL/QUALITY) i `promptAssist.ts`
- [ ] Automatisk baseline-uppdatering (CI/script)

## Operativt / miljö

(Se dedikerade P-filer: **P17** för Unsplash-diagnostik, **P18** för hydration-varning.)

- [x] ~~WSS/HMR till Fly~~ — löst (Fly-proxyn stabil)
- [ ] Hydration-varning på landningssidan — troligen relaterad till 3D-bibliotek (Three.js/liknande); se P18
- [x] ~~Utred Unsplash-materialisering~~ — felklassning implementerad i P17 (`e75325c9d`)

## Borttaget (efter genomgång)

Följande togs bort medvetet:
- ~~Keyword taxonomy consolidation~~ — keywords kan komma att fasas ut helt
- ~~Cart-provider cross-file-kedja~~ — låg prioritet, möjligen redan löst
- ~~Nya scaffolds (AI-chat, docs-site, realtime-app)~~ — inte aktuellt nu
- ~~Template guidance v1.75 (selectedFiles-excerpts)~~ — stryks
- ~~Template guidance v2 (global template-library search)~~ — principen: `searchTemplateLibrary()` finns men är oanvänd i runtime; v2 = koppla den till orchestration så att prompt+brief driver sökning mot hela template-library (semantisk + keyword), top-K träffar → guidance. Stryks som task men konceptet dokumenteras
- ~~`searchTemplateLibrary()` exporterad men oanvänd~~ — ingår i resonemanget ovan

## Noterat (inte uppgifter)

- `@/hooks/use-mobile` och `@/hooks/use-toast` behålls som bakåtkompatibel fallback.
- `useDeploymentStatus` använder `/api/v0/` (naming debt, ej trasigt).
- `useIntegrationStatus` har `previewUrl` i dependency-array för re-trigger (funktionellt korrekt).
