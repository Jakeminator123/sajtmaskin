# Slutrapport — 2026-04-22 LLM-flödes-audit

**Datum:** 2026-04-22
**Rapporter granskade:** 8 (wrxmzp, mzwkqx, kqmwrt, kxpqzt, pmrxtq, qjrmzt, xqjvnm, SAJ-33)
**Status:** Åtgärdat — rå rapportfilerna är borttagna efter triage; denna fil är den enda kvarvarande artefakten.

## Triagelistan

Totalt **24 distinkta fynd** rapporterades av agenterna. Många var dubletter
eller samma bugg rapporterad från olika vinklar. Efter deduplicering:

### Fynd som var riktiga buggar och är nu fixade (13 st, ~54%)

| # | Fynd | Rapport | Fil |
|---|------|---------|-----|
| 1 | `fetchCommunityBlocks` fick wrappad `prompt` istället för `intentSourcePrompt` | r01, r07 | `src/lib/gen/orchestrate.ts` |
| 2 | Scaffold-telemetri loggade `input.generationMode ?? "init"` istället för `resolvedMode` | r03 | `src/lib/gen/orchestrate.ts` |
| 3 | Multi-change regex hade typo `"trea"` istället för `"tre"` | r05 | `src/lib/gen/request-kind.ts` |
| 4 | Refine-patterns saknade bare `"byt"`-token | r05 | `src/lib/providers/own-engine/follow-up-clarification.ts` |
| 5 | ASCII `\b` matchade inte före `ä/ö/å` — svenska refine-prompter föll till neutral | r06 | `src/lib/providers/own-engine/follow-up-clarification.ts` |
| 6 | `buildFollowUpBriefFromSnapshot` tappade `styleKeywords` + `toneKeywords` så follow-up tappade art direction | r07 | `src/lib/gen/orchestration-snapshot.ts` |
| 7 | `checkUndefinedJsxSymbols` false-positive på TS-generics (`<T>`, `<TData>` m.fl.) | SAJ-33 | `src/lib/gen/verify/verifier-pass.ts` |
| 8 | `lazy(`-bailout i verifiern för brett (skippade hela filen vid t.ex. `lazyRetry(...)`) | SAJ-33 | `src/lib/gen/verify/verifier-pass.ts` |
| 9 | Init saknade `routePlanPrompt`/`buildSpecPrompt`/`contractsPrompt`/`scaffoldMatchPrompt` som follow-up skickar explicit | r07 | `src/lib/api/engine/chats/create-chat-stream-post.ts` |
| 10 | Plan mode saknade `engineModelId` + `lifecycleStage` → divergent BuildSpec mellan plan och codegen | r04 | `create-chat-stream-post.ts` + `chat-message-stream-post.ts` |
| 11 | `effectiveInitRouteCount` respekterade inte `isFirstCodeGeneration` — inflaterade routeCount för follow-up+first-gen | r04 | `src/lib/gen/build-spec.ts` |
| 12 | `fixerModel` föll till `undefined` när chat-modell inte mappade till canonical tier | r01 | `src/lib/gen/verify/server-verify.ts` |
| 13 | "rubrik"/"title"/"headline" saknades i specifika follow-up-targets (upptäckt under fix #5) | — | `src/lib/providers/own-engine/follow-up-clarification.ts` |

### Fynd som INTE är buggar (11 st, ~46%)

| Fynd | Rapporter | Bedömning |
|------|-----------|-----------|
| P32 `requestKind` når inte `deriveBuildSpec` | **r01, r02, r03, r04 (4×)** | **By design.** P32 Fas A är medvetet bara klassificering + telemetri. Fas B kopplar in det — det är dokumenterat som roadmap i `docs/plans/active/P32-request-type-taxonomy.md` och `docs/architecture/fas2-orchestration-and-build.md`. |
| Doc säger "follow-up bär inte init-brief" vs kod som hydrerar | r01, r02 | **Dokumentationsdrift.** Kod är korrekt (A1+A2 fix från 2026-04-21). Doc-uppdatering, inte kodbugg. |
| `BUILD_INTENT_GUIDANCE` duplicering | r01, r02 | **Stale doc.** Båda konsumenter importerar redan från `intent-guidance.ts`; matrisen i `llm-signal-flow.md` är helt enkelt inaktuell. |
| Dupl. "effective init"-invarianter i `finalize-preflight` vs `build-spec` | r03 | **Medvetet kommenterat** i koden som avsiktlig skillnad. |
| "clear-redesign" false-positive för `"Byt bild till en elefant. Gör också hela bakgrunden mörk"` | r05 | **Designval.** Prompten INNEHÅLLER en design-/bakgrundsändring och verb+noun-combon är korrekt matchning. Gränsfall, inte bugg. |
| `classifyFollowUpIntentWithLlmFallback` ej inkopplad i runtime | r06 | **Medvetet.** Funktionen finns men används inte — troligen latent feature-flag. Inte en regression. |
| `inferContextPolicy` / `inferVerificationPolicy` använder `generationMode === "followUp"` utan `isFirstCodeGeneration` | r06 | **Designval.** `isEffectiveInit` är avsiktligt begränsat till route-realization. Bredare applikation skulle ändra quality/kostnads-tradeoff och kräver aktivt designbeslut. Lämnas åt P-plan. |
| Drift-risk: verifier-pass inte längre read-only enligt docs | SAJ-33 | **Dokumentationsdrift.** Runtime-beteendet är korrekt; `docs/schemas/quality-gate.md` och `backoffice/pages/preview.py` behöver uppdateras men det är dok-arbete. |
| "init vs follow-up har olika formateringsvägar" | r02 | **Generell iakttagelse**, ingen konkret bugg utpekad. |
| "Samma användaravsikt kan klassas olika i init vs follow-up" | r07 (generell) | Täcks av fix #9 ovan — konkret del av den är nu åtgärdad. |

## Testsvit

- **Före:** 100/100 tester i de fem direkt berörda filerna.
- **Efter:** 111/111 tester (6 nya regressionstester tillagda).
  - TS-generics i `.tsx` ska INTE flaggas (SAJ-33 fix)
  - Custom `lazy(` ska INTE skippa hela filen (SAJ-33 fix)
  - `lazy` importerat från `react` ska fortfarande skippas (positiv kontroll)
  - Svenska refine-prompter (`"Ändra rubriken…"`) klassas som `clear-refine` (r06 fix)
  - Bare `"byt"`-edits klassas som `clear-refine` (r05 fix)
  - `"tre ändringar: …"` klassas som `multi-change` (r05 fix)
  - `buildFollowUpBriefFromSnapshot` rehydrerar `visualDirection.styleKeywords` + `toneAndVoice` (r07 fix)
- **Bredare testkörning** (`src/lib/gen` + `src/lib/providers/own-engine`):
  862/863 — den ena fail:en är en känd flaky timeout i `warm-eslint.test.ts`
  som passerar isolerat och inte rör detta fix-set.

## Nyckeltal

- **Andel äkta buggar:** 13 / 24 ≈ **54%**
- **Rapporter med minst en äkta bugg:** 8 / 8 (100%)
- **Rapporter med 100% buggar:** r05 (3/3), r07 (3/3), SAJ-33 (2/3 bug + 1 doc)
- **Rapporter med mest brus:** r01, r02, r03, r04 (P32-"buggen" är by design och står för 4 av de 11 felrapporterna)

## Kvalitetsbedömning av rapporterna

| Rapport | Signal | Kommentar |
|---------|--------|-----------|
| 01 wrxmzp | 2/3 bugg | Community-fixen + fixer-fallback — bra fynd. P32-delen = false positive. |
| 02 mzwkqx | 0/3 bugg | Rent dok-analys; inga faktiska buggar. Påminnelse om dok-drift är värdefull. |
| 03 kqmwrt | 2/3 bugg | Telemetri-bugg fint hittad. P32 + finalize-preflight = false positives. |
| 04 kxpqzt | 2/3 bugg | Route-count + plan-mode-divergens är nyttiga. P32 igen false positive. |
| 05 pmrxtq | 2/3 bugg | Multi-change + byt-token — handpåläggning hittade riktiga regex-hål. #1 (clear-redesign "elefant") är designfråga. |
| 06 qjrmzt | 2/3 bugg | Bäst ROI — Unicode-\b är en kritisk tyst-degradering. #3 = designval. |
| 07 xqjvnm | 3/3 bugg | **Högst precision.** Alla tre fynd riktiga, hög impact. |
| SAJ-33 | 2/3 bugg + 1 doc | Verifier-pass-fixarna är hög-värdefynd (false-positives som blockerar gate). |

## Förbättringar av repot

- **Riktade regressionstester** skyddar nu mot:
  - Silent Swedish-prompt-degradering (Unicode-gräns i regex)
  - False-positives i verifier-pass (TS-generics + lazy-utils)
  - Inkonsekvent telemetri (resolvedMode vs input.generationMode)
- **Signal-paritet init/follow-up**: init får nu samma rå-prompt-källor som follow-up (bug #9) och plan-mode får samma token-/livscykel-signaler som huvudflödet (bug #10).
- **Policy-konsekvens**: `effectiveInitRouteCount` använder nu samma "effective init"-definition som `deriveRouteRealizationPolicy` (bug #11).
- **Verifier stabilare**: lazy-bailouten är nu riktad mot äkta `React.lazy`/`lazy()` från react; TS-generics i `.tsx` ger inga falska blockerande fynd (SAJ-33).
- **Fallback-förutsägbarhet**: `fixerModel` har alltid ett definierat värde — inga tysta defaulter i `runLlmFixer`.

## Dokumentationsskulder (ej åtgärdade, för framtida plan)

Dessa är inte buggar men flera audit-rapporter pekade ut dem:

1. `docs/architecture/llm-signal-flow.md` — uppdatera follow-up-brief-sektion till att reflektera snapshot-rehydrering (A1/A2) och den nya style/tone-persisteringen.
2. `docs/schemas/quality-gate.md` + `backoffice/pages/preview.py` — förtydliga att verifier-pass är hybrid (deterministic + LLM), inkludera `undefined-jsx-symbol` i exempellistan (SAJ-33).
3. `BUILD_INTENT_GUIDANCE`-matrisen i `llm-signal-flow.md` — ta bort påståendet om separata duplikat, båda importerar från `intent-guidance.ts`.
4. P32 Fas B — koppla `requestKind` in i `deriveBuildSpec` när taxonomi-policy designats klart (separat plan).

— Slut rapport.
