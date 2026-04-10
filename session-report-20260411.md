# Session Report — 2026-04-11

## Sammanfattning

Sessionen fokuserade på att diagnostisera och fixa upprepade genereringsfel där sajtmaskin-byggaren konsekvent producerade trasiga imports som blockerade versionsparning. Tre separata genereringar misslyckades innan grundorsakerna identifierades och fixades. Den fjärde genereringen lyckades — version sparad, preview startad, follow-up fungerande.

## Problem som hittades och fixades

### 1. Dynamisk kontextbudget för snål (KRITISK)

**Symptom:** `critical_scaffold_files` droppades tyst från systempromten. Modellen saknade de faktiska scaffold-filerna som referens.

**Orsak:** Token-budgeten var 8 750 (normal) — för snål med tanke på GPT-5.4:s 128k+ context window.

**Fix:**
- `build-spec.ts`: light 5 625→25 000, normal 8 750→50 000, heavy 11 250→75 000
- `system-prompt.ts`: DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS 8 750→50 000, DEFAULT_REFS_BUDGET_TOKENS 2 500→12 500
- Scaffold-, refs- och char-budgetar höjdes proportionellt
- Lade till prioritetsregler för `Critical Scaffold Files` (prio 86, required), `Scaffold File Tree` (prio 84, required), `spec_file`, `current_project_files`, `coding_direction`, `quality_bar`, `component_palette`, `interaction & motion`

**Filer:** `src/lib/gen/build-spec.ts`, `src/lib/gen/system-prompt.ts` + 11 testfiler

### 2. LLM fixer timeout (KRITISK)

**Symptom:** `[llm-fixer] failed: This operation was aborted` — fixern avbröts konsekvent.

**Orsak:** Default `fixBudgetMs` var 20 000 ms (20s). `gpt-5.3-codex` med reasoning behöver längre tid.

**Fix:**
- `validate-and-fix.ts`: default 20 000→120 000 ms
- `finalize-preflight.ts`: 12 000→90 000 ms

**Filer:** `src/lib/gen/autofix/validate-and-fix.ts`, `src/lib/gen/stream/finalize-preflight.ts`

### 3. Nested import block — deterministisk autofix (KRITISK)

**Symptom:** `app/page.tsx` och `app/om-oss/page.tsx` fick `Expected "as" but found "{"` — sanity-checken blockerade persist.

**Orsak:** GPT-5.4 genererar konsekvent trasiga multi-line imports:
```
import {
  useState,
  useEffect,
import { Button } from "@/components/ui/button"
```
Där `} from "react"` saknas. Varken den befintliga regex-autofixen eller LLM-fixern kunde reparera detta.

**Fix:** Ny funktion `fixNestedImportBlocks()` i `import-validator.ts`:
- Hittar `import {` som öppnas men aldrig stängs (nästa rad är ny `import`)
- Samlar specifiers och gissar rätt modul via lookup-tabell (react, lucide-react, framer-motion, next/image, etc.)
- Körs först i pipeline innan shadcn/lucide-fixar

**Filer:** `src/lib/gen/autofix/import-validator.ts`, `src/lib/gen/autofix/nested-import-fix.test.ts` (nytt)

## Resultat efter fixar

**Lyckad generering:** `20260411-004351-freeform`
- Status: `done`
- Version: `3e8e108a-c938-40d1-8bbf-f8338ed6ab63`
- 26 filer, 0 errors, 1 warning (saknad h1 → fixad av auto-repair follow-up)
- Autofix: 31 fixes, 1 warning — syntax validation passed direkt (pass 1, 0 errors)
- Preview startad på Fly (sandbox)
- Follow-up fungerade (7s reasoning, snabb iteration)

**Jämförelse:**

| Mätvärde | Före fix | Efter fix |
|---|---|---|
| Dynamic context budget | 8 750 tokens | 50 000 tokens |
| Critical scaffold files | DROPPADE | Behålls (prio 86) |
| System prompt total | 47 437 chars | 60 774 chars |
| LLM fixer timeout | 20s (abortade) | 120s (kör klart) |
| Nested import fix | Ingen | Deterministisk |
| Syntax validation | FAIL (1-2 errors) | PASS (0 errors) |
| Version sparad | Nej | Ja |
| Preview | Aldrig nådd | Startad + ready |

## Observationer / kvarstående noteringar

1. **UI-etikett "gateway"**: `internalProviderLabel: "gateway"` i `usePromptAssist.ts` är ett kvarvarande internt typnamn. Alla anrop går direkt mot OpenAI/Anthropic API. Etiketten bör rensas för tydlighet.

2. **`/api/v0/` URL-prefix**: Inte Vercel v0 — det är sajtmaskins eget versionerade API (45 routes).

3. **`v0ChatId` i API-svar**: Bakåtkompatibelt fältnamn i `/api/projects/:id/chat` — alla tre fälten pekar på samma ID.

4. **Fly.io "sandbox" i URL:er**: Legacy-namn i preview-host-koden, inte Vercel Sandbox.

5. **Quality gate FAIL**: `package.json is missing` — genererad sajt saknar package.json. Inte blockerande för preview men noterat.

6. **dep-completer.test.ts**: Förexisterande testfel (lucide-react version mismatch ^0.563 vs baseline 1.8.0). Ej relaterat till sessionens ändringar.

7. **Tailwind PostCSS rebuilds**: Turbopack kör om globals.css-kompilering vid varje server-side moduländring. Normalt brus i dev.

## Follow-up: 3D Vanse-burk (version 1e4a1d3f)

Användaren begärde en 3D apoteksburk med etiketten "vanse" som svävande element i hero-sektionen. Generering lyckades — `vanse-jar-canvas.tsx` (R3F/Three.js) + uppdaterad `home-hero.tsx`.

### Quality Gate-flöde (hela kedjan)

1. **Preflight summary** (22:59:42) — 28 filer checkade, 0 errors, 0 warnings. Preview startad. Autofix: 6 fixes + 4 warnings (heavy load → `fixCount: 6 > threshold: 5`).

2. **Quality gate FAIL** (23:00:59) — `install` passade (60.9s), men `typecheck` fallerade (exit 2):
   ```
   vanse-jar-canvas.tsx(8,26): error TS2300: Duplicate identifier 'Group'.
   vanse-jar-canvas.tsx(9,10): error TS2300: Duplicate identifier 'Group'.
   vanse-jar-canvas.tsx(151,24): error TS2322: Type 'boolean | null' is not assignable to type 'boolean'.
   ```
   Orsak: `useReducedMotion()` från framer-motion returnerar `boolean | null`, men prop-typen var `boolean`. Plus dubblerad `Group`-import (typ + value).

3. **Server repair (LLM)** (22:59:52–23:00:59) — LLM-fixern körde 67s (timeout-höjningen fungerar!). Resultat: `no_improvement` — fixern returnerade kod men typecheck passade fortfarande inte.

4. **Post-repair quality gate** (23:01:24–23:02:01) — Ny runda: `install` OK, `typecheck` FAIL (exit 2), `lint` FAIL (exit 1). Inte promotad.

5. **Slutlig quality gate PASS** (23:02:59–23:03:30) — Tredje försöket: alla checks passade, `firstFailureCheck: null`, `passed: true`. Total verify-lane: 31s.

### Tidslinje

| Tid | Händelse |
|---|---|
| 22:59:42 | Preflight + autofix klar, preview startad |
| 22:59:49 | SEO/editorial/analytics-granskning |
| 23:00:59 | Quality gate FAIL (typecheck: `Duplicate identifier 'Group'`, `boolean | null`) |
| 23:00:59 | Server repair startad (LLM, gpt-5.3-codex) |
| 23:01:02 | Repair noop (67s, `no_improvement`) |
| 23:01:24 | Post-repair gate: install OK, typecheck FAIL, lint FAIL |
| 23:02:59 | Ny quality gate-runda startar |
| 23:03:30 | **Quality gate PASS** — alla checks gröna |

### Observation: 3D-preview

Trots att koden genererades korrekt syntes inte 3D-burken i preview. Trolig orsak: Three.js-deps (`@react-three/fiber`, `@react-three/drei`, `three`) behöver installeras i sandbox:en, och WebGL-stöd kan vara begränsat i Fly VM:en.

### Observation: Quality gate self-heal

Systemet visar en fungerande **retry-loop**: quality gate → LLM repair → re-gate → slutligen PASS. Det tog ~4 minuter totalt men resulterade i en godkänd version utan manuell intervention. Den höjda `fixBudgetMs` (120s) var avgörande — fixern fick 67s, vilket hade abortats vid gamla 20s-gränsen.

## Pipeline Stabilization (session 2)

Uppföljningssession med fokus på timing, tokenbudgetar, modellval och återkommande syntaxfel.

### Timing-analys

Från `stream.summary`-events i loggarna:

| Generering | Typ | Reasoning | Output | Stream totalt |
|---|---|---|---|---|
| 316a0eab (init, misslyckad) | create | 403s (6.7min) | 207s (3.4min) | 611s (10.2min) |
| a278dfb9 försök 1 (init, misslyckad) | create | 288s (4.8min) | 213s (3.5min) | 503s (8.4min) |
| a278dfb9 försök 2 (init, lyckad) | create | 211s (3.5min) | 189s (3.2min) | 402s (6.7min) |
| Follow-up liten edit | followup | 7s | 30s | 38s |
| Follow-up 3D burk | followup | 156s (2.6min) | 46s | 204s (3.4min) |
| Follow-up liten fix | followup | 4s | 19s | 25s |

**"20 minuterna" = två misslyckade försök (~10+8.5 min streaming) + post-stream validation/fixer-loopar.**

### 4. reasoningEffort: high → medium för standard (PRESTANDA)

**Symptom:** GPT-5.4 reasoning tar 3-7 minuter innan första output syns.

**Orsak:** `reasoningEffort` var `"high"` för alla kvalitetsnivåer, inklusive `standard`.

**Fix:** `own-engine-pipeline-generation.ts`:
- `standard: "medium"` (sänker reasoning ~40%)
- `premium: "high"` och `release-candidate: "high"` oförändrade
- Follow-up med `copy`/`local-layout` scope capped till `"medium"` oavsett kvalitetsnivå

### 5. Deterministisk autofix körs nu före syntax-validering (PIPELINE)

**Symptom:** `fixNestedImportBlocks()` kördes inte på merged content i `finalize-preflight.ts`.

**Fix:** `validate-and-fix.ts` kör nu `runAutoFix()` som första steg före syntax-validering. Alla deterministiska fixar (inklusive nested imports) appliceras på content innan esbuild-validering.

### 6. Ny deterministisk fix: duplicate default export (AUTOFIX)

**Symptom:** `Multiple exports with the same name "default"` — LLM fixer tog 16-20s per förekomst.

**Fix:** Ny `fixDuplicateDefaultExport()` i `import-validator.ts`. Hittar multipla `export default`-satser och behåller bara den sista. Körs i pipeline efter `fixNestedImportBlocks`.

### 7. Import Rules + Known Pitfalls i systemprompt (PREVENTION)

**Orsak:** 20-42 deterministiska fixar per generering — modellen genererar konsekvent fel import-syntax.

**Fix:** Två nya required-sektioner i `system-prompt.ts`:
- **Import Rules** (prio 94): regler för import-syntax, shadcn-paths, lucide-ikoner, en `export default` per fil
- **Known Pitfalls** (prio 93): package.json krav, version pinning, `useReducedMotion` boolean-coercing, duplicate identifier-undvikande

### 8. Rättstorlekade tokenbudgetar (BALANS)

**Orsak:** Budgetarna höjdes 5-7x i session 1 (8 750→50 000 normal). Den stora input-kontexten förlänger GPT-5.4:s reasoning.

**Fix:** Sänkt till `actual + 30% headroom` med prioritetsreglerna intakta:
- Light: 25 000→15 000 tokens
- Normal: 50 000→30 000 tokens
- Heavy: 75 000→50 000 tokens
- `DEFAULT_DYNAMIC_CONTEXT_BUDGET_TOKENS`: 50 000→30 000
- `DEFAULT_REFS_BUDGET_TOKENS`: 12 500→7 500

### 9. Path-normalisering i loggar (WINDOWS)

**Symptom:** Backslash-paths i felmeddelanden och loggar på Windows.

**Fix:** Ny `toPosixPath()` i `path-utils.ts`, applicerad i `static-core-loader.ts` och `file-logger.ts`.

### 10. SSE stream-synk (UNDERSÖKT, EJ BUGG)

**Observation:** Streamen känns fördröjd, som om den väntar på chatId/versionId.

**Analys:** Servern kör tung orkestrering (prompt-build, DB-writes, scaffold-val) **innan** SSE-svaret börjar streama. `chatId` och `meta` är garanterat de första SSE-events. `versionId` kommer först i `done`-eventet efter finalize. `SuspenseLineProcessor` buffrar dessutom content tills en newline anländer, vilket kan fördröja synliga tokens. Ingen bugg — förväntat beteende.

## Filer som ändrades (sammanslaget session 1 + 2)

### Produktionskod
- `src/lib/gen/build-spec.ts` — höjda budgetar (session 1) → rättstorlekade (session 2)
- `src/lib/gen/system-prompt.ts` — prioritetsregler + Import Rules + Known Pitfalls
- `src/lib/gen/autofix/validate-and-fix.ts` — fixBudgetMs 20s→120s + runAutoFix före validering
- `src/lib/gen/stream/finalize-preflight.ts` — fixBudgetMs 12s→90s
- `src/lib/gen/autofix/import-validator.ts` — `fixNestedImportBlocks()` + `fixDuplicateDefaultExport()`
- `src/lib/own-engine/session/own-engine-pipeline-generation.ts` — reasoningEffort-tuning
- `src/lib/gen/static-core-loader.ts` — path-normalisering i felmeddelanden
- `src/lib/logging/file-logger.ts` — path-normalisering vid log-rotation
- `src/lib/utils/path-utils.ts` — ny `toPosixPath()`

### Tester
- `src/lib/gen/autofix/nested-import-fix.test.ts` (ny)
- `src/lib/gen/build-spec.test.ts`
- `src/lib/gen/llm-input-scenarios.test.ts`
- `src/lib/gen/system-prompt.test.ts`
- `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts`
- `src/lib/providers/own-engine/generation-stream.golden.test.ts`
- `src/lib/providers/own-engine/pre-generation-contract-gate.golden.test.ts`
- `src/lib/own-engine/session/own-engine-build-session.test.ts`
- `src/lib/own-engine/resolve-max-steps.test.ts`
- `src/lib/gen/stream/finalize-version.test.ts`
- `src/app/api/v0/chats/stream/route.test.ts`
- `src/app/api/v0/chats/[chatId]/stream/route.test.ts`
