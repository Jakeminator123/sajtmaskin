# Sajtmaskin — kvarvarande uppgifter (konsoliderad)

Konsoliderad från tidigare halvfärdiga planer och listor.
Detta är den enda listan att följa framåt.

## Planerade förbättringar (kräver kodarbete)

- [ ] Keyword taxonomy consolidation (6-stegsplan, centralisera keywords till `config/keyword-taxonomy.json`)
- [ ] shadcn Nivå 2: Blocks-metadata som section recipes
- [ ] shadcn Nivå 3: `registry:font` för fonthantering
- [ ] Scaffold-specifik toolkit-lista per scaffold
- [ ] Komponentpool per scaffold
- [ ] Nya scaffolds: AI-chat, docs-site, realtime-app
- [ ] Template guidance v1.75 (selectedFiles-excerpts)
- [ ] Template guidance v2 (global template-library search i runtime)

## Uppskjutet (inget blockerar)

- [ ] Konsolidera dashboards (stor Python-refaktor)
- [ ] Template-library pipeline: hydrate repo-cache
- [ ] Dossier-manifests: `recommendedScaffoldFamilies` -> `recommendedScaffoldIds`
- [ ] `searchTemplateLibrary()` exporterad men oanvänd i runtime
- [ ] `BUILD_INTENT_GUIDANCE` dubblett
- [ ] Fallback-guidance (MOTION/VISUAL/QUALITY) i `promptAssist.ts`
- [ ] Automatisk baseline-uppdatering (CI/script)

## Operativt / miljö

- [ ] WSS/HMR till Fly: WebSocket-proxy tappar connection
- [ ] Hydration error overlay på landningssidan
- [ ] Utred varför bildmaterialisering fortfarande fallerar trots satt `UNSPLASH_ACCESS_KEY`

## Noterat (inte uppgifter)

- `@/hooks/use-mobile` och `@/hooks/use-toast` behålls som bakåtkompatibel fallback.
- `useDeploymentStatus` använder `/api/v0/` (naming debt, ej trasigt).
- `useIntegrationStatus` har `previewUrl` i dependency-array för re-trigger (funktionellt korrekt).
