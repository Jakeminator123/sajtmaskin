# STATUS — Plan 11 (unified repair → scaffold-required-files-check + variant-lock + capability-modify-existing)

**Branch:** `plan-11-unified-repair`
**Base:** `master @ 1c445da` (pre-plan-11)
**Wave:** 5 (parallel with plan-10)
**Status:** READY FOR PR
**Date:** 2026-04-24

## Sammanfattning

Plan 11 omdefinierades efter `STATUS-INVESTIGATE-PAGETSX-LOSS.md`: i stället för
det ursprungliga vaga "samla LLM-repair i tydlig väg" levererar denna PR
fix-recipes för tre samrelaterade open questions:

| Bug | Open Q | Vad | Var |
| --- | --- | --- | --- |
| 1 | #5 | Hard gate mot saknad/trivial `app/page.tsx` + count-parity-assertion + telemetry-hardening | `finalize-preflight.ts` |
| 2 | #8 | `scaffoldVariantId` på `OrchestrationBase` + default-variant-fallback när `priorVariantId` saknas | `orchestrate.ts`, `scaffold-variants/{registry,matcher}.ts` |
| 3 | #12 | `capability-modify` intent-mode + `MODIFY_REFERENCE_MARKERS` + dossier-shell-suppression + "modify this" hint i system-prompt | `follow-up-capability-detection.ts`, `follow-up-clarification.ts`, `system-prompt/sections/dossiers.ts`, `chat-message-stream-post.ts` |

**Original plan-11-scope** ("samla LLM-repair") gjordes inte — efter plan 05
har `runRepairLoop`-entrypoint redan konsoliderats. Eventuell shape-differens
mot autofix-lanen får plan 12 ta.

## Bug 1 — page.tsx-loss safety net

### Rotsorsak (från investigation)

`LLM_ONLY_PATHS = new Set(["app/page.tsx", "src/app/page.tsx"])` i
`src/lib/gen/stream/finalize-merge.ts` filtrerar avsiktligt bort scaffoldens
`page.tsx` så LLM:n tvingas skriva en ny — men ingen safety-net om LLM:n
missar. Verifierat skadeläge i runs `1fa58609` + `b71dafb3`: 6 filer på disk,
tom `<main>`, 0 sektioner, sajten "fungerade" men var blank.

### Vad som ändrades

- `src/lib/gen/stream/finalize-preflight.ts`:
  - Ny konstant `HOME_PAGE_MIN_RENDERED_CHARS = 200` + helpers
    `measureRenderedContentLength`, `findHomePageFile`,
    `buildMissingHomeRouteIssue`.
  - `runFinalizePreflight` reser nu en `code_structure_failure`-issue (severity
    `error`) om `app/page.tsx`/`src/app/page.tsx` saknas eller har <200
    renderade tecken efter `completeProjectFiles`-bygget. Blockerar persist.
  - Count-parity-assertion: `preflightFileCount !== JSON.parse(nextFilesJson).length`
    → emit `code_structure_failure` så silent 26→6-drift inte längre slipper
    igenom.
  - Telemetry-hardening: `preflight.summary` loggar nu både `filesChecked`,
    `persistedFilesCount` och `hasHomeRouteBlock` så framtida diskrepans är
    1-grep-bort.

### Tester

- `src/lib/gen/stream/finalize-preflight.test.ts`:
  - `RICH_PAGE_CONTENT`-konstant (>200 renderade chars) introducerad så
    befintliga tester inte trigger den nya gaten.
  - 3 nya regression-tester:
    1. blockerar persist när LLM utelämnar `app/page.tsx` helt
    2. blockerar persist när home route har trivial content (`<main></main>`)
    3. emitterar parity-error endast vid faktisk drift (sanity i happy path)
- `src/lib/gen/stream/finalize-version.test.ts`: 31 occurrences av trivial
  page-content uppgraderade till en variant som klarar 200-char-tröskeln.

## Bug 2 — scaffoldVariant locked between init/follow-up

### Rotsorsak

`OrchestrationBase` saknade `scaffoldVariantId`. På follow-ups var
`priorVariantId` ofta `null` (snapshot-fältet fanns redan i
`engine_chats.orchestration_snapshot` men kunde sköljas till `null` av
shallow merge), och `lockedVariantForFollowUp` returnerade `null` →
`pickScaffoldVariant` valde fritt → `corporate-grid` → `warm-local`-flippar
mid-chat.

**Stop-regel respekterad:** ingen DB-migration. `engine_versions`-schemat har
ingen generic `metadata: jsonb`-kolumn så vi sparade INTE en ny kolumn.
Snapshot-mekanismen i `engine_chats.orchestration_snapshot` (jsonb) räcker —
problemet var att läsningen inte hade en stabil fallback.

### Vad som ändrades

- `src/lib/gen/scaffold-variants/registry.ts`: ny export
  `getDefaultVariantForScaffold(scaffoldId)` — returnerar variant flaggad
  `default: true` annars första alfabetiskt.
- `src/lib/gen/scaffold-variants/matcher.ts`: när `priorVariantId` saknas
  (och intent inte är `clear-redesign`) faller `lockedVariantForFollowUp`
  tillbaka till `getDefaultVariantForScaffold` istället för `null`. Loggas
  som `variant_lock_fallback` (ny event-type, vid sidan av `variant_lock_skip`).
- `src/lib/gen/orchestrate.ts`: `OrchestrationBase` har nu
  `scaffoldVariantId: string | null` populerat från `input.persistedVariantId`.
  Telemetry-spårbarhet `prior → locked → final` utan ny kolumn.

### Tester

- `src/lib/gen/scaffold-variants/matcher.test.ts`:
  - Befintligt test som väntade `null` när `priorVariantId` saknas
    uppdaterat: nu väntar default-variant.
  - Ny test: `clear-redesign`-intent returnerar fortfarande `null` även när
    `priorVariantId` saknas (escape-hatch bevarad).

## Bug 3 — capability-modify-existing

### Rotsorsak

Plan 06:s `detectFollowUpCapabilities` klassade "gör pricken till en
3D-kaffekopp …" som `capability-add` → `selectDossiersForRequest`
re-injicerade `three-fiber-canvas`-shellen + error-boundary ovanpå den
fungerande `floating-coffee-overlay.tsx`. Användaren refererade till EN
EXISTING capability ("pricken" = den befintliga 3D-bubblan) men pipelinen
saknade vokabulär för anaforisk referens.

### Vad som ändrades

- `src/lib/gen/follow-up-intent-types.ts`: ny `FollowUpIntentMode`-värde
  `capability-modify`. Registreras i `FOLLOW_UP_INTENT_MODES`-set.
- `src/lib/builder/follow-up-capability-detection.ts`:
  - Ny pattern-array `MODIFY_REFERENCE_MARKERS` (Unicode-aware
    look-arounds): substantiv (`pricken`, `bubblan`, `figuren`, `scenen`,
    `kuben`, `sfären`, `formen`, `ikonen`, `elementet`, `widgeten`),
    `3d-grej(j)en/saken/modellen/figuren/elementet`, demonstrativ +
    transformations-verb (`gör den till X`, `byt ut den mot Y`,
    `ändra den så att`, `den där/som/jag har gjort`),
    `befintliga/existerande/nuvarande X`, samt smal engelsk täckning
    (`turn it into`, `change it to`, `make the X into`).
  - `FollowUpCapabilityDetection` har nu `referencesExistingCapability:
    boolean` + `modifyReferenceMatches: string[]`.
  - Detektionen tillåter modify-reference som egen detection-trigger så
    `byt ut den mot en 3d-kaffekopp` (utan add-verb, utan refine-verb)
    fortfarande når dossier-grenen — annars hade fallit till `clear-refine`.
  - Flagga sätts bara när BÅDE en capability och en modify-referens fanns
    — bara `byt ut den mot något snyggare` (ingen capability-noun) faller
    fortfarande till refine.
- `src/lib/providers/own-engine/follow-up-clarification.ts`:
  `classifyFollowUpIntent` returnerar `capability-modify` när
  `referencesExistingCapability` är true. `capability-add`-grenen
  oförändrad i övrigt.
- `src/lib/api/engine/chats/chat-message-stream-post.ts`:
  - När `followUpIntent === "capability-modify"`: suppressar
    `requestedDossierCapabilities` + `requestedCapabilityTiers` (både i
    plan-mode och codegen-orchestration) så `selectDossiersForRequest`
    inte injicerar shell på nytt.
  - Skickar i stället `capabilityModifyHint: { capabilityIds, references }`
    via orchestration → buildDynamicContext → ny renderare i `dossiers.ts`.
- `src/lib/gen/orchestrate.ts`: `capabilityModifyHint` på
  `OrchestrationInput` + `OrchestrationBase`, propagerad till
  `DynamicContextOptions`.
- `src/lib/gen/system-prompt/sections/dossiers.ts`: ny export
  `renderCapabilityModifyHintBlock` — emitterar `## Modify Existing
  Capability — Do NOT Re-Inject Dossier Shell`-block med detected
  capability-ids, reference-tokens, och konkreta instruktioner ("locate
  the scene/feature file", "modify in place", "do NOT emit a fresh shell").
- `src/lib/gen/system-prompt/build-dynamic-context.ts`: kallar nya
  renderaren direkt efter `renderDossierBlocks` så LLM:n alltid ser
  modify-direktivet på exakt platsen där dossier-poolen normalt skulle stå.
- `src/lib/gen/orchestrate/generation-package.ts`: `OrchestrationBaseLike`
  utvidgad med `capabilityModifyHint` (typecheck-konsistens).

### Tester

- `src/lib/builder/follow-up-capability-detection.test.ts`: 6 nya tester
  i ny describe-block, inkl. svensk + engelsk täckning, negativa fall
  (capability-add bevarad, refine bevarad).
- `src/lib/providers/own-engine/follow-up-clarification.test.ts`: 3 nya
  tester för `classifyFollowUpIntent`-utfallet.
- `src/lib/gen/system-prompt/sections/dossiers.test.ts` (NY fil): 4 tester
  för `renderCapabilityModifyHintBlock`.

## Filer rörda (20)

```
M src/lib/api/engine/chats/chat-message-stream-post.ts
M src/lib/builder/follow-up-capability-detection.test.ts
M src/lib/builder/follow-up-capability-detection.ts
M src/lib/gen/follow-up-intent-types.ts
M src/lib/gen/orchestrate.ts
M src/lib/gen/orchestrate/generation-package.ts
M src/lib/gen/scaffold-variants/index.ts
M src/lib/gen/scaffold-variants/matcher.test.ts
M src/lib/gen/scaffold-variants/matcher.ts
M src/lib/gen/scaffold-variants/registry.ts
M src/lib/gen/stream/finalize-preflight.test.ts
M src/lib/gen/stream/finalize-preflight.ts
M src/lib/gen/stream/finalize-version.test.ts
M src/lib/gen/system-prompt/build-dynamic-context.ts
M src/lib/gen/system-prompt/sections/dossiers.ts
M src/lib/gen/system-prompt/types.ts
M src/lib/own-engine/session/own-engine-build-session.test.ts
M src/lib/providers/own-engine/follow-up-clarification.test.ts
M src/lib/providers/own-engine/follow-up-clarification.ts
?? src/lib/gen/system-prompt/sections/dossiers.test.ts
```

Inga plan-10-filer rörda
(`generation-log-writer.ts`/`metrics.ts`/`server-verify.ts`).
Inga plan-12-filer rörda (`promptOrchestration.ts`).

## Verifiering

| Steg | Resultat |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors |
| `npx vitest run` (full svit) | 220 files / 1603 tests passed |
| `node scripts/dev/check-unicode-regex.mjs` | OK — inga dangerous `\b` |

13 nya regression-tester över de tre buggarna (3 + 3 + 7) — överstiger
acceptanskravet på "5+".

## Open follow-ups (för senare planer)

- Plan 12 kan dokumentera/städa eventuell shape-differens mellan
  `runRepairLoop` och autofix-lanen om man vill formalisera bug 1:s
  count-parity som ett gemensamt invariant.
- Bug 2:s telemetry skulle gynnas av en `prior → locked → final`-tracer
  i `version.created`-event så man enkelt kan se vilken variant som
  faktiskt skickades till LLM:n vs den lockade. Inte gjort här —
  hör hemma i en observability-PR.
- Bug 3:s `MODIFY_REFERENCE_MARKERS` är medvetet smal för svenska — om
  vi ser engelska prompts dyka upp i produktion får vi utöka den
  engelska sektionen. Stop-regeln "om regex inte räcker, lämna åt
  plan 12" har INTE triggats; regex räcker för alla observerade fall.
