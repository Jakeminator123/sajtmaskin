---
status: active
owner: unassigned
created: 2026-07-13
topic: Användarsajternas env — en kanonisk yta + möjlighet att sätta riktiga värden i F2 innan bygge (så preview inte fallbackar till mock/demo)
source: Kodläsning via explore-subagent 2026-07-13 (ProjectEnvVarsPanel, BuilderShellContent, tier3-readiness-gate, env-local.ts, project-env-vars.ts, env-flow-f2-mute.mdc) + prod-/logg-session chat 747636c8
---

# Användarsajternas env — konsolidering + F2-värden

## TL;DR

Den **kanoniska lagringen finns redan** (`project_data.meta.projectEnvVars`, krypterad,
läst/skriven via `/api/v0/projects/[projectId]/env-vars`). Problemet är inte lagringen
utan att det finns **~10–14 separata ytor** som sätter, mockar, dokumenterar eller pekar
mot env — och att den enda riktiga CRUD-panelen (`ProjectEnvVarsPanel`) är **medvetet
gömd i F2** (`lifecycleStage !== "integrations"`). Därför upplevs det "plottrigt", och
därför fallbackar preview till mock/demo i F2: användaren *kan inte* mata in riktiga
värden förrän efter "Bygg integrationer".

Detta är en **plan, ingen implementation.** En bit (att slå på F2-env-inmatning) rör
en befintlig medveten policy (`env-flow-f2-mute.mdc`) och kräver därför ditt beslut.

> **Ägarbeslut 2026-07-13 (chat):** F2-env-inmatning ÄR beslutad — men via
> **Byggblock-panelen** (inline maskerade inputs i expanderade hard-dossier-rader,
> F2+F3), inte via A1/A2-panelvarianterna nedan. Levereras i PR 1
> (`feat/byggblock-status-nycklar`) tillsammans med ny statusmodell
> (`planned`/`blocked-build`/`built-demo`/`built-live`); `env-flow-f2-mute.mdc` är
> omskriven där. B (kravytan → panelen) och panel-degraderingen tas i PR 2.

## Nuläge (verifierat mot kod)

### Kanonisk kärna (ska bevaras)

| Lager | Fil | Roll |
|---|---|---|
| Lagring | `src/lib/db/schema.ts` (243–255) → `project_data.meta` jsonb | Ingen separat env-tabell |
| Läs/skriv | `src/lib/project-env-vars.ts` (140–242) | `meta.projectEnvVars[] = {id,key,value,sensitive}` |
| Kryptering | `src/lib/crypto/env-var-cipher.ts` | `ENV_VAR_ENCRYPTION_KEY`, `enc:`-prefix |
| API | `src/app/api/v0/projects/[projectId]/env-vars/route.ts` | GET/POST/DELETE, ägarskapskoll — **stage-agnostisk** |
| Preview-runtime | `src/lib/gen/preview/env-local.ts` (248–320) | Merge: harmless → tier3-stub → project-preview → **user (`projectEnvVars`)** → generated |
| Deploy | `src/app/api/v0/deployments/route.ts` (905–1014) | Synkar endast sparade `projectEnvVars` till Vercel |

**Viktig konsekvens:** `env-local.ts` lägger redan `user`-lagret (`projectEnvVars`)
**över** placeholders/mock i F2 (274–296). Så om värden *fanns* i F2 skulle preview
använda dem — det som saknas är UI-åtkomst, inte runtime-stöd.

### Varför det blir mock/demo i F2

`src/lib/gen/preview/env-local.ts` (198–213, 305–319) seedar per vald dossier-nyckel ett
`dossierMockPreviewEnvValue` → `*_placeholder_preview_not_real`. Det är designat så att
preview ska **boota utan riktiga nycklar**. Bra som default — men idag är det enda
alternativet i F2 eftersom det inte går att skriva riktiga värden där.

### CRUD-panelen är F3-gated

`src/app/builder/BuilderShellContent.tsx` (811–831):

```text
lifecycleStage === "integrations"  → <ProjectEnvVarsPanel />   (F3)
annars                             → <div> "Env-variabler: auto-hanterade i env.example …" (F2)
```

### De överlappande ytorna ("plottrigt")

1. `ProjectEnvVarsPanel` (F3) — primär CRUD
2. `F3RequirementsSurface` — **parallell** inline-editor efter 412 (samma API)
3. `F3PlaceholderToggle` — `allowPlaceholdersInF3` meta-flagga
4. `env.example` i filträdet — auto-regenererad dok (skrivs över, ej lagring)
5. Pipeline-`.env.local` i `files_json` — dossier-placeholders
6. Modell-emitterad `.env.local` — högsta merge-prioritet i preview
7. Placeholder-kataloger `40-harmless` + `41-tier3-stub`
8. F2 dossier-mock-seed (`*_placeholder_preview_not_real`)
9. Preview-VM `.env.local` (sammanslagning)
10. Deploy → Vercel env-sync
11. Pek-ytor: `LaunchReadinessCard`, `BuildPlanCard`, `IntegrationSetupWizard`, `MessageList`
12. Chat-verktyg `requestEnvVar`/`suggestIntegration` (mutade i F2)
13. Manuell `env.example` → `.env.local` (dokumenterad i header)
14. Dossier-manifest `envVars[]` (styr *vilka* nycklar/enforcement, inte värden)

Av dessa är **1 + API + lagring** den enda kanoniska värde-vägen. 4–9 är runtime/mock/dok.
2–3, 11–12 är overlays/pek-ytor. Målet är att göra kanon **synlig och enda inmatningsytan**,
och degradera resten till konsumenter/pekare.

## Förslag (åtgärder + motivering)

### A. Gör en enda env-editor tillgänglig redan i F2 (kärnönskemålet)

**Åtgärd:** Lyft mount-gaten i `BuilderShellContent.tsx` (811) så `ProjectEnvVarsPanel`
(eller en avskalad "Miljövariabler"-flik) finns i `design` (F2), inte bara `integrations`.
Ingen ändring i storage/API/preview-merge behövs — de är redan stage-agnostiska och
`env-local.ts` prioriterar redan `user`-värden över mock.

**Motivering:** Detta är precis vad du bad om — "sätt riktiga värden i F2 innan bygge så
de inte fallbackar till mock/demo". Eftersom preview redan mergar `projectEnvVars` över
placeholders löser en ren UI-ändring 90 % av problemet.

**~~Beslut krävs (paus)~~ — AVGJORT, se ägarbeslutet i TL;DR:** F2-env-inmatning
levereras via **Byggblock-panelen** (inline maskerade inputs per hard-dossier-rad, PR 1
`feat/byggblock-status-nycklar`), och `env-flow-f2-mute.mdc` skrivs om där. De tidigare
alternativen A1 (opt-in-knapp till `ProjectEnvVarsPanel` i F2) och A2 (hela panelen i F2)
är **superseded** och ska inte implementeras — chat-tystnaden (`requestEnvVar`-mute)
behålls oförändrad.

### B. Degradera parallell-editorn till samma panel

**Åtgärd:** Låt `F3RequirementsSurface` (inline-fält efter finalize-design 412) **deep-linka
till** eller återanvända `ProjectEnvVarsPanel` i stället för att vara en andra editor.
`LaunchReadinessCard`/`BuildPlanCard`/`IntegrationSetupWizard`/`MessageList` pekar redan mot
panelen via `openProjectEnvVarsPanel` — säkerställ att *alla* gör det (ingen egen input).

**Motivering:** Två separata editorer mot samma API = drift och förvirring. En yta att lära sig.

### C. Märk env.example tydligt som "dokumentation, ej värde-källa"

**Åtgärd:** I filträds-/kodvyn, märk `env.example` som auto-genererad och icke-kanonisk
(kort badge/rad), så den inte förväxlas med platsen där man sätter värden.

**Motivering:** `env.example` regenereras vid varje generering (`project-env-file.ts`) —
att skriva där är verkningslöst. Idag ser den ut som en redigerbar env-fil.

### D. Behåll mock-seed som fallback, inte som enda väg

**Åtgärd:** Ingen ändring i `env-local.ts` mock-seed — men den ska bara gälla för nycklar
**utan** användarsatt värde. (Verifiera att `user`-lagret vinner även för dossier-mockade
nycklar i F2; kod indikerar ja, men lägg ett test.)

**Motivering:** Preview måste fortsätta boota för användare som *inte* fyllt i något.
Riktiga värden ska bara vinna när de finns.

## Föreslagen ordning

| Fas | Innehåll | Risk | Yta |
|---|---|---|---|
| 1 — Beslut | ~~Välj A1/A2~~ **Avgjort:** Byggblock-panel-vägen (ägarbeslutet i TL;DR); `env-flow-f2-mute.mdc` skrivs om i PR 1 | — | Regel-doc |
| 2 — UI | Levereras i PR 1 `feat/byggblock-status-nycklar` (inline-inputs i Byggblock-panelen, inte `ProjectEnvVarsPanel`) | Låg (ingen storage-ändring) | PR 1 |
| 3 — Konsolidering | `F3RequirementsSurface` → återanvänd panelen; alla pek-ytor deep-linkar | Medel | 3–5 filer |
| 4 — Klarhet | env.example-badge (C) + F2 `user`-vinner-test (D) | Låg | 2–3 filer + test |

## Explicit icke-mål

- Ingen ny env-tabell eller ny kryptering (`ENV_VAR_ENCRYPTION_KEY` bevaras — annars blir
  sparade värden odekrypterbara, se `project-phase-priorities.mdc`).
- Ingen ändring av deploy→Vercel-syncen (den läser redan enbart kanon).
- Ta inte bort placeholder/mock-seed — degradera den bara till fallback.

## Öppna frågor till dig

1. ~~A1 eller A2?~~ **Avgjord** — Byggblock-panel-vägen (ägarbeslutet i TL;DR).
2. Ska riktiga F2-värden trigga preview-VM-restart automatiskt (redan mekanik via
   `project-env-vars-updated` i `useBuilderVmPreview.ts` 195–209) eller bara vid nästa bygge?
