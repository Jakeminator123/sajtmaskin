---
id: gm-akt-5-3b-route-hard-clamp
status: done
created: 2026-06-20
parent: gm-omrade-05-followup-och-preview-kontrakt
blocked_by: 5-1 (FollowUpContract på master) + 5-3 (#168 wire:ar orchestrate→input.followUpContract; route lämnades som drift-signal)
risk: medium
owner_files:
  - src/lib/gen/orchestrate.ts
  - src/lib/gen/route-plan/index.ts
  - src/lib/gen/followup-freeze.stability.test.ts
---

# 5-3b — Route HARD-CLAMP + explicit route-removal (neutral follow-up tappar aldrig en route tyst)

**Område 5** · Wave 2 · [nivå-2](../05-followup-och-preview-kontrakt.md) · bygger på **5-1** (`FollowUpContract`, #165) **+ 5-3** (#168 — `orchestrate` läser `input.followUpContract`).

## Numrering (löst 2026-06-20)
Detta är den **coach-prioriterade slicen efter #168** som [nivå-2-planen](../05-followup-och-preview-kontrakt.md) pekade ut: *hård route-clamp + explicit route-removal*. **Numrerad `5-3b`** som komplettering av **5-3**:s route-frys (frysta routes blir floor, ej bara drift-signal). `5-6`-sloten förblir `previewSessionId`. **Kollision löst 2026-06-20** — byggd & mergad som **#172** (squash `3f0d4c0a7`).

## Mål
En **neutral** follow-up får **aldrig tyst tappa** en route som basversionen hade. Kontraktets frysta routes (`routePlan.existingRoutePaths` + `existingShellRoutePaths`) ska gälla som **floor** (golv): en fryst route som saknas i den resolverade planen **återinförs**. **Två undantag** bevarar avsiktlig förändring:
1. **clear-redesign** (`ignorePersistedScaffoldForMatch`) — en genuin omdesign får bygga om route-planen.
2. **Explicit route-removal** — användaren bad uttryckligen att ta bort en route → den får tas bort.

Smal PR: bara route-clampen. **Inte** capability (5-5), finalize, preview-session eller F1-delta-brief.

## Bakgrund (verifierat i kod mot master-HEAD `f19a18348`)

| Yta | Frys-mekanism före 5-3b | Status efter 5-3b |
|---|---|---|
| Scaffold | `enforceFollowUpScaffoldFreeze` (clampar) | oförändrad |
| Variant | `enforceFollowUpVariantFreeze` (clampar) | oförändrad |
| **Route** | `detectFollowUpRouteDrift` — **endast drift-signal** (`followup_freeze_drift`, inkl. shell-routes); **ingen clamp** | **clampar** (denna slice) |

**Gapet (#168):** route var medvetet kvar som signal-only. JSDoc:en motiverade det med att en hård clamp "needs the builder's internal `explicitRouteRemovals` context (a broader grip than 5-3's narrow scope)". Den kontexten **finns redan exporterad** — se nedan — så gapet kan stängas utan att uppfinna någon ny signal.

### Kanonisk route-removal-signal (ägare)
**`collectExplicitRouteRemovals(prompt, buildIntent, existingPaths)` — ägare: `src/lib/gen/route-plan/planning-helpers.ts`.** Det är den signal `buildRoutePlan` redan använder för att hedra avsiktlig borttagning (`route-plan-builder.ts:51-53,150-157`). Den kräver ett borttagnings-**verb** (`remove|delete|drop|ta bort|plocka bort|radera`) plus antingen ett explicit `/path`-omnämnande eller route/sida-kontext, och returnerar `Set<string>` av normaliserade paths att ta bort.

**Ingen ny signal införd.** Verifierat: ingen `toolIntent`/`route_remove`/`route_add`/`section_add`-mekanism finns i koden (0 träffar; `src/app/api/prompt/**` existerar inte). Follow-up-klassificeraren (`classifyFollowUpIntent`) uttrycker `neutral`/`clear-redesign`/`clear-refine`/`capability-*`/`ambiguous-*` — **inte** route-removal. Route-removal ägs alltså entydigt av `collectExplicitRouteRemovals`. 5-3b lyfter den in i `route-plan/index.ts`-barreln och **konsumerar ägaren** (signal-gate: ändra ägaren, inte konsumenten).

### Varför clampen behövs trots att `buildRoutePlan` redan fryser
`existingShellRoutePaths ⊆ existingRoutePaths` (shell = befintliga routes vars filinnehåll är en shell-sida) och `buildRoutePlan` får `existingRoutePaths` → den bevarar redan routes i normalvägen. Clampen är därför **kontrakts-auktoritativ safety-net**, exakt som scaffold/variant-clampen backar upp `persistedScaffoldId`/`lockedVariantForFollowUp`. Den garanterar att kontraktets frysta routes överlever oavsett: locale-dedupe som droppar en fryst variant (`/blogg` vs `/blog`), en lossy `existingRoutePaths`-extraktion, eller framtida regression i `buildRoutePlan`. Golvet är **kontraktet**, inte planerarens interna logik.

## Design
Ren helper `enforceFollowUpRouteFreeze` (speglar `enforceFollowUpScaffoldFreeze`/`enforceFollowUpVariantFreeze`): tar redan-resolverade värden, returnerar beslut, beteende-neutral när inget driftat.

```
frozenAll       = norm(existingRoutePaths ∪ existingShellRoutePaths)
missing         = frozenAll \ resolvedRoutePaths
restoredPaths   = missing \ explicitRouteRemovals      // tyst tappade → återinförs
allowedRemoval  = missing ∩ explicitRouteRemovals      // avsiktligt borttagna → lämnas
clamped         = restoredPaths.length > 0
```

**Integration i `resolveOrchestrationBase`** (efter `buildRoutePlan`, före `deriveBuildSpec` så BuildSpec/orchestrationContract/scaffoldContext ser de återinförda routsen):
- behåll `detectFollowUpRouteDrift`-telemetrin (drift loggas fortfarande);
- beräkna `explicitRouteRemovals` via `collectExplicitRouteRemovals(routePlanPrompt ?? prompt, effectiveBuildIntent, frozenAll)` — samma prompt/intent som `buildRoutePlan`;
- kör `enforceFollowUpRouteFreeze`; vid `clamped` → `upsert`:a de saknade frysta routsen tillbaka i `routePlan.routes` och emit:a clamp-telemetri (`followup_freeze_drift`, `clamped:true`, `restoredPaths`);
- **defensivt:** hela clamp-blocket i `try/catch` — ett clamp/telemetri-fel får **aldrig** krascha generering (#168-mönstret).

**Antaganden (medvetna):**
- **Frozen = floor, inte ceiling.** En neutral follow-up som lägger till en **ny** route påverkas inte — clampen återinför bara saknade frysta routes, den strippar aldrig tillägg.
- `routePlan.siteType` räknas **inte** om efter restore (beräknas i `buildRoutePlan`). En återinförd route kan i sällsynta fall korsa en site-type-tröskel; safety-net-frekvensen gör det försumbart och en återinförd fryst route gör bucketen om något *mer* korrekt. Noterat snarare än fixat (skulle kräva export av `inferSiteType`).

## Steg (stabilitetstest FÖRST)
1. **`followup-freeze.stability.test.ts` (utökas; rött före fix):**
   - **unit `enforceFollowUpRouteFreeze`:** tyst tappad fryst route (existing) → `restoredPaths` innehåller den, `clamped:true`. Samma för en tappad **shell**-route (`restoredShellPaths`). Explicit borttagen route → `allowedRemovalPaths`, **ej** restored. clear-redesign → no-op. Additiv route → golv-routes restored men tillägget orört. Trailing-slash-okänslig.
   - **integration `resolveOrchestrationBase`:** neutral follow-up där kontraktet fryser en route som planen tappar → den finns i `base.routePlan.routes` efter clampen (täck både existing och shell). Prompt "ta bort /x" → `/x` finns **inte** i planen (explicit removal hedras). clear-redesign → ingen restore.
2. **Implementera** helper + integration enligt Design.
3. **Grönt** + befintliga 5-3-route-tester orörda.

## Acceptans / tester
- `followup-freeze.stability.test.ts`: alla fall gröna; minst ett bevisar tyst-tappad route clampas tillbaka, minst ett bevisar explicit removal hedras, ett bevisar clear-redesign-undantaget, ett bevisar additiv route tillåts.
- Befintliga `orchestrate`-/route-plan-tester gröna.
- `typecheck`/`lint` 0; `check-unicode-regex` om regex rörts (ingen ny regex införd — `collectExplicitRouteRemovals` återanvänds).
- **Beteende-neutralt i normalvägen:** ingen tappad fryst route → ingen ändring (clampen är korrigerande).

## Guardrails
- **Smal:** bara route-clampen. Capability/finalize/preview-session/F1 = andra slices.
- Eget worktree (`..\sajtmaskin-omr5-6`, branch `feat/omr5-route-hard-clamp`), **draft-PR** (orchestrate = codegen-kärna + protected path → PR-mergaren `NEEDS_HUMAN` väntat).
- Builder-coexistence: rör inte preview/heartbeat/`/api/engine`.
- Ny signal **inte** införd — kanonisk `collectExplicitRouteRemovals` konsumeras från sin ägare. Om route-removal hade visat sig ha oklart canonical-ägarskap → flagga blocker, inte gissa.
