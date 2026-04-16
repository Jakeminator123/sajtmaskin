# Sajtmaskin — kvarvarande uppgifter (kanonisk lista)

Senast uppdaterad: 2026-04-15 (Repair/verify worldclass-pass: delad loop, manifeststyrda gate-tiers, warm repair, utökad partial-file retry, repair-accept/timeout, verify install fallback + node_modules sharing).

## Öppna punkter

| # | Område | Beskrivning | Prio | P-fil |
|---|--------|-------------|------|-------|
| 1 | shadcn | Nivå 2: Blocks-metadata / section recipes — undersök om upstream `registry:block` kan bli sektionsval i generatorn | Medel | P20 |
| 2 | shadcn | Nivå 3: `registry:font` — konsolidera upstream font-format med nuvarande `fontPairings` + `google-font-registry.ts` | Medel | P20 |
| 3 | Ingress | Old-content ingress hardening — bevisa ingresspunkter, sedan små fixar | Medel-hög | P19 |
| 4 | Eval | Automatisk baseline-uppdatering (CI/script för eval-svit) | Låg | — |

## Avklarat denna session (2026-04-15)

| Vad | Commit |
|-----|--------|
| Repair/verify worldclass-pass: delad `runRepairLoop`, warm repair (targeted filer + imports) | 2026-04-15 |
| Quality-gate tiers flyttade till `manifest.json` (`qualityGateTiers`) | 2026-04-15 |
| Partial-file repair: manifeststyrt antal försök + `partial-file-repair.outcome` telemetry | 2026-04-15 |
| Transparent serverrepair: `repair_available`, `repaired_files_json`, `accept-repair` API, SSE `version-repair-available` | 2026-04-15 |
| Auto-accept timeout för pending repair via `repairAcceptTimeoutMinutes` | 2026-04-15 |
| Structured repair context: `RepairErrorManifest` med filgruppering + beroendeprioritering | 2026-04-15 |
| Preview-host verify: primär install utan `--legacy-peer-deps`, fallback endast vid peer-konflikt | 2026-04-15 |
| Preview-host verify: fingerprint-baserad `node_modules`-delning live↔verify (`install-cache-share`) | 2026-04-15 |
| jsx-checker: `import type { … }` räknas nu som import — undviker lucide/Three `Group`-kollision | 2026-04-15 |
| P17: Unsplash felklassning (401/429/network/timeout) | `e75325c9d` |
| Font-register: 75 Google Fonts, autofix whitelist, importnamn i prompt | `c28be72db` |
| Scaffold-aware komponentpool (`## Your Toolkit` per scaffold) | `65921ac53` |
| `BUILD_INTENT_GUIDANCE` dubblett löst (extraherad till `intent-guidance.ts`) | `b89147172` |
| Scaffold-specifik toolkit + komponentpool per scaffold | `65921ac53` |
| WSS/HMR till Fly — löst (stabil) | redan i drift |
| P18: Landing-varning verifierad och stängd (Three/Fiber Clock-deprecation) | denna session |
| Template-library pipeline: hydrate repo-cache | redan i drift |
| Dossier-manifests: `recommendedScaffoldFamilies` → `recommendedScaffoldIds` | redan i drift |
| Schema-docs uppdaterade (README, scaffold-contract, glossary) | `7bdcc766c`, `5001347af` |
| Planfiler konsoliderade, `halvfärdiga_filer/` borttagen | `fb53a87ea` |

## Strykt (bekräftat inte uppgifter)

- ~~Fallback-guidance (MOTION/VISUAL/QUALITY)~~ — aktiv motion-inference-logik, inte ett problem att fixa
- ~~Konsolidera dashboards~~ — redan gjort: `sajtmaskin_backoffice.py` → `backoffice/` (legacy-stubbar forwärdar)
- ~~themeTokens aktivare i prompten~~ — redan aktiv via `formatThemeTokenLines()` i `system-prompt.ts`
- ~~Keyword taxonomy consolidation~~ — keywords kan fasas ut helt
- ~~Cart-provider cross-file-kedja~~ — låg prio, möjligen löst
- ~~Nya scaffolds~~ — inte aktuellt
- ~~Template guidance v1.75 / v2~~ — struket, konceptet dokumenterat
- ~~`searchTemplateLibrary()` oanvänd~~ — ingår i ovan

## Noterat (inte uppgifter)

- `@/hooks/use-mobile` och `@/hooks/use-toast` behålls som bakåtkompatibel fallback.
- `useDeploymentStatus` använder `/api/v0/` (naming debt, ej trasigt).
- `useIntegrationStatus` har `previewUrl` i dependency-array för re-trigger (funktionellt korrekt).
- Fas 2 worldclass-pass är genomfört (kod + docs + schemas + backoffice sync).
- P18 är nu stängd: varningen var Three/Fiber deprecation (inte bekräftad hydration-bugg i egen kod).
- PartialFileOutputError har nu en retry-mekanism (1 LLM-repair-försök, 60 s timeout) istället för hård abort.
