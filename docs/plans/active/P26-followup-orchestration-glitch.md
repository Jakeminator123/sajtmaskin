# P26 — Follow-up Orchestration Glitch Remediation

**Status:** in progress (autonom körning startad 2026-04-21 ~03:30)
**Owner:** Cursor agent (Claude Opus 4.7)
**Origin:** Empirisk testkörning av builder med Tänker-modellen, chatId `cdc23879-f4c1-4398-b91b-5e1af020e34c`

## TL;DR

På en oskyldig follow-up (`"Byt bild til len elefant. GÖr också hela bakgrunden mörk fast som att det regnar animatiskt också"`) flippade systemet:

- `landing-page → app-shell`
- `website → app`
- `warm-local → immersive-dark`

På en bildbyte. Follow-ups är inte hårt länkade till sitt projekt — vi fixar det.

## Root cause

`matchScaffoldAuto` matas med `optimizedMessage` (~30 000 tecken med all filkontext) istället för användarens råa text. Embedding-API:t fail:ar med `400 max 8192 tokens`. Keyword-fallback ser APP_KEYWORDS i filkontexten → `app-shell`. Detta promotar build_intent från `website` till `app`. Variant-locken släpper när scaffold byts.

```mermaid
flowchart TD
    rawMsg["raw message: 100 tecken"] --> orchestrate["orchestratePromptMessage"]
    orchestrate --> optimizedMsg["optimizedMessage: 30k tecken"]
    optimizedMsg --> matcher["matchScaffoldAuto(prompt = optimizedMessage)"]
    matcher --> embedding["openai.embeddings.create"]
    embedding -->|"30k chars over 8192 tokens"| failed["400 Invalid input"]
    failed --> kw["keyword fallback pa optimizedMessage"]
    kw -->|"file context har APP_KEYWORDS"| appShell["app-shell"]
    appShell --> intentPromote["website to app"]
    intentPromote --> wrongVariant["Variant lock breakar"]
    wrongVariant --> brokenProject["Projektet ar oigenkannligt"]
```

## Evidens

- Loggrad: `[scaffold] Embedding API call failed { 400 max 8192 tokens, queryChars: 30917 }`
- Loggrad: `[scaffold] scaffold_semantic_unavailable { fallbackScaffoldId: 'app-shell', method: 'keyword' }`
- Loggrad: `[orchestrate] scaffold_drift { briefNominated: 'landing-page' (0.98), finalPick: 'app-shell', pickMethod: 'picker_override' }`
- Loggrad: `[orchestrate] build_intent_promoted { from: 'website', to: 'app' }`

## PR-paket

### PR1 — Root cause + defenses (P0, branch: `fix/P26-pr1-scaffold-match-raw-message`)

A1+A2+A3+C som ett sammanhängande paket.

**A1.** `src/lib/api/engine/chats/chat-message-stream-post.ts` (~rad 753) + `src/lib/gen/orchestrate.ts` (rad 422-430): lägg till `scaffoldMatchPrompt` (raw `message`) som separat fält i `OrchestrationInput`. `matchScaffoldAuto`, `buildScaffoldPrompt` och `expandQuery` använder den korta strängen för embedding + keyword. `optimizedMessage` används fortfarande för LLM-prompten.

**A2.** `src/lib/gen/orchestrate.ts` (rad 383-446): när `generationMode === "followUp"` OCH `ignorePersistedScaffold === false` OCH `persistedScaffoldId` finns → early return persistedScaffold innan `matchScaffoldAuto` körs alls. Logga `[orchestrate] scaffold_locked_to_persisted`.

**A3.** `src/lib/gen/orchestrate.ts` (rad 507-522): block `build_intent_promoted` när `resolvedMode === "followUp"` och `persistedBuildIntent` är non-app. Logga `intent_promotion_blocked_followup`.

**C.** `src/lib/gen/scaffolds/scaffold-search.ts` (rad 152-184): klipp `expandQuery(query)` till max 7000 tecken före `openai.embeddings.create`. Logga `embedding_query_truncated`.

### PR2 — Variant lock fork-safe (P1, branch: `fix/P26-pr2-variant-lock-fork`)

**A4.** `src/lib/gen/stream/finalize-version.ts` (~rad 1286): säkerställ att `orchestration_snapshot.variantId` ALLTID skrivs vid `site.done` (även init), så följande follow-up alltid har `priorVariantId`. `src/lib/gen/scaffold-variants/matcher.ts` + `src/lib/gen/orchestrate.ts` (rad 686-707): tightening av lock-logiken.

### PR3 — Quality-gate readiness probe (P1, branch: `fix/P26-pr3-quality-gate-readiness`)

**B.** `src/lib/gen/verify/server-verify.ts` + quality-gate route under `src/app/api/engine/chats/[chatId]/`: kräv `HEAD https://vm-fly-jakem.fly.dev/<chatId>/` returnerar 200 + första route-render slutfört innan gate startar. Backoff 30s @ 1s, fail-soft.

### PR4 — HMR-spam mitigation (P2, branch: `fix/P26-pr4-hmr-spam`)

**D.** `preview-host/src/runtime.js` (rad 411-440, 1154-1166): utöka `NEXT_CONFIG_ENV_SNIPPET` så Turbopack-HMR också tystas. Stub `/_next/webpack-hmr` med 404. Builder-UI: filtrera bort `webpack-hmr`-konsolfel i preview-iframens diagnostikmottagning.

### PR5 — rawMessage logging (P2, branch: `fix/P26-pr5-raw-message-logging`)

**E.** `src/lib/api/engine/chats/chat-message-stream-post.ts` (rad 880-892): lägg `rawMessage` (truncated 500 chars) bredvid `message` i `comm.request.followup`-loggen.

### PR6 — Bygg nu UX (P2, branch: `fix/P26-pr6-bygg-nu-ux`)

**F.** `src/components/builder/preview-panel/PreviewPanelF3Trigger.tsx` + `src/app/api/engine/chats/[chatId]/finalize-design/route.ts`: byt label till "Bygg integrationer", visa toast med saknade env-vars vid 412, disable knappen om inga Tier-3 integrationer detekterats.

### PR7 — Backoffice scaffold_lifecycle FileNotFound (P2, branch: `fix/P26-pr7-backoffice-build-template-path`)

Användaren rapporterade traceback:

```
FileNotFoundError: 'C:\\Users\\jakem\\dev\\projects\\sajtmaskin\\scripts\\template-library\\build-template-library.ts'
```

Filen är borttagen (sannolikt i `561acad3a fix(scripts): restore v0-template sync killed by template-library cleanup`). `backoffice/pages/scaffold_lifecycle.py` (`_build_template_library_path`, `_scan_scaffold_dependencies`) refererar fortfarande till gamla pathen. Antingen uppdatera path eller tolerera att filen saknas.

### PR8 — Dossier re-embed (P2, branch: `chore/P26-pr8-dossier-reembed`)

Om PR7 eller andra ändringar lägger nya dossierfiler eller flyttar paths: kör om embeddings via befintligt script i `scripts/dossiers/` så semantisk index är uppdaterat.

### PR9 — 3D Three Fiber dossier (P3, branch: `feat/P26-pr9-three-fiber-dossier`)

**G.** Skapa `data/dossiers/soft/3d-canvas-react-three-fiber/manifest.json` + `instructions.md` med best practices: `dynamic({ ssr: false })`, `<ErrorBoundary>`, mobile-fallback, `renderer.dispose()`, `useReducedMotion`-respekt. Triggers: `3d`, `three`, `webgl`, `animerad`, `roterande`. Re-embed via PR8.

## Verifiering per PR

Alla PR:s måste klara:

- `npx tsc --noEmit` (0 fel)
- Befintliga vitest-tester relevanta för rörda filer (ex `src/lib/gen/scaffolds/matcher.test.ts`)

## Pushing

Branches skapas lokalt med commits. **INGEN push till origin görs av agenten** — användaren granskar och pushar/öppnar PR själv.

## Status

Se TodoWrite-listan i agent-sessionen för aktuell progress. Slutsammanfattning skrivs sist i denna fil.

---

## Implementationslogg

### 2026-04-21 03:30 — Plan etablerad

Initial planfil skapad. Branches kommer skapas under PR1 nedan.
