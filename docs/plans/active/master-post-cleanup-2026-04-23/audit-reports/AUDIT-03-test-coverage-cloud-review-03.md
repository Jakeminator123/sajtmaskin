# AUDIT-03 — Test-coverage (wave 5)

**Agent:** cloud-review-03 (READ-ONLY)  
**Bas:** `git diff 1c445da15..HEAD --name-only -- '*.test.ts'` + manuell genomgång av motsvarande implementation.

## Tabell: acceptanskriterium → testfil → status

| # | Kriterium (PROMPT-10 / 11) | Primär testfil (ev. stöd) | Status |
|---|---------------------------|---------------------------|--------|
| **P10-1** | Observatorie-routing: events med `chatId` hamnar i per-run, inte i `_unrouted/<bucket>/` i onödan | `generation-log-writer.test.ts` (`binds site.chatId to the latest run…`) | **⚠️** |
| **P10-2** | `writeGenerationLogEntry` / mkdir — inga `ENOENT` vid `_unrouted/...` | — | **❌** |
| **P10-3** | Init F2: ren preflight (`errors: 0`) → quality-gate/post-finalize server-verify hoppas (`design_preview_skip_verify`) + policy loggas | `generation-stream-post-finalize.test.ts` (`resolvePostFinalizeServerVerifyDecision`, `server verify policy logging`) | **✅** |
| **P10-3b** | Counter: F3-init kör fortfarande verify | samma fil (`still runs verify for clean fidelity3 init`) | **✅** |
| **P10-4** | `auto_repair` räknas separat i per-chat `history` (`autoRepairCount` vs `followupCount`) | `generation-log-writer.test.ts` | **✅** |
| **P10-5** | Latency: `sajtmaskin_phase_duration_ms` / fasuppsättning / `observePhase` m.m. | `metrics.test.ts` | **✅** |
| **P10-6** | LRU/behörig prune av generationslogg-körningar (MAX_RUN_DIRS) | `generation-log-writer.test.ts` | **✅** |
| **P10-7** | LRU-prune av `_unrouted/<bucket>/` (MAX_UNROUTED_BUCKETS i `generation-log-writer.ts`) | — | **❌** |
| **P11-B1a** | Saknad `app/page.tsx` / `src/app/page.tsx` → blockerar | `finalize-preflight.test.ts` (LLM missar helt) | **✅** |
| **P11-B1b** | Trivial tom / “blank” hemsida (≈&lt;200 tecken renderat) → blockerar, inte bara helt saknad fil | `finalize-preflight.test.ts` (trivial `<main></main>`) | **✅** (se lucka: path) |
| **P11-B1c** | `src/app/page.tsx` som alternativ path samma regel | — | **❌** |
| **P11-B1d** | Preflight file-count vs `filesJson` parity — **vederbörlig felväg** vid drift | `finalize-preflight.test.ts` (endast happy path: ingen parity-error) | **⚠️** |
| **P11-B1e** | (c) Preview bootstrap samma file-set som preflight | — i wave-5 `.test.ts`-diff | **❌** |
| **P11-B1f** | Telemetry: `filesChecked` / persisted count (via preflight) | indirekt via parity-fält i samma preflight-kedja; inget dedikerat event-test i diff | **⚠️** |
| **P11-B2** | Variant låst över följande följdupp (inte bara init→fu1) | `matcher.test.ts` (två `clear-refine` i rad + null-fallback) | **✅** |
| **P11-B3a** | `capability-modify` när modify-markör + capability-signal | `follow-up-capability-detection.test.ts` + `follow-up-clarification.test.ts` | **✅** |
| **P11-B3b** | Ingen re-injection: `renderCapabilityModifyHintBlock` | `dossiers.test.ts` | **✅** |
| **P11-B3c** | Counter: färsk `capability-add` utan modify-token | samma + clarification | **✅** |

**Tecken:** **✅** = tydlig regression som kör förväntat utfall; **⚠️** = delvis / endast indirekt; **❌** = saknas.

## Kontrollfrågor (per kriterium)

| Fråga | Kort svar |
|--------|-----------|
| Kör något test faktiskt *fix-pathen* med förväntat resultat? | Ja för preflight home-gate, variant-lock, capability-modify/add, post-finalize verify-skip, metrics, history-räkning, chatId-binding. |
| Finns *counter-test* (utan fix / motsatt policy)? | Ofta ja (t.ex. F3 kör verify; fresh add → capability-add; `referencesExistingCapability: false`). Undantag: ingen negativ fil-paritet; ingen explicit “preflight errors → ingen skip” för P10-3. |
| Edge cases (tom input, null, gränser)? | Delvis: `dossiers` (null/empty refs), `detectFollowUpCapabilities` (tom sträng), metrics (NaN/negativa durations). Ingen `src/app/page.tsx` trivial variant. |

## Specifika hål (från gransknings-briefen)

| Hål | Bedömning |
|-----|------------|
| **Bug 1:** &lt;200 tecken *och* `src/app/page.tsx` | Trivial-fallet täcker låg-innehållsregeln på `app/page.tsx` endast. Separat test för `src/app/page.tsx` + samma gate saknas. |
| **Bug 2:** Flera följdupp | `lockedVariantForFollowUp` anropas två gånger i rad — täcker; ingen scenario med `capability-add`-intent över flera steg (frivillig fördjupning). |
| **Bug 3:** “gör om den” (kort, utan capability-noun) | Ingen exakt sträng. Nära: `byt ut den mot något snyggare` i `follow-up-capability-detection.test.ts` — **intent-klassificering** för “gör om den” i `follow-up-clarification.test.ts` saknas. |
| **Bug 3:** “lägg till en **till** 3D-grej” (add-verb + capability) | Saknas; risk för fel routing modify vs add. |
| **Plan 10:** LRU av `_unrouted/<bucket>/` | `lruPruneSubdirs` + `MAX_UNROUTED_BUCKETS` finns i produktion; **inget test** som skapar &gt;10 buckets och förväntar avlastning. |

## Övriga diffade `*.test.ts` (kort notis)

| Fil | Koppling wave 5 |
|-----|-----------------|
| `finalize-version.test.ts` | Täcker finalize-kedja / SAJ-25 prune m.m.; inte tydlig “preview bootstrap samma set som preflight” (P11-B1e) i granskad diff. |
| `own-engine-build-session.test.ts` | Pekar `requiredFiles: ["app/page.tsx"]`; ingen ny Bug 1-regression. |

## Saknade tester (förslag: namn + scenario)

1. **`finalize-preflight` — `plan-11 bug 1: trivial home route under src/app/page.tsx blocks like app/page.tsx`**  
   Samma &lt;200 tecken / trivial innehåll, path `src/app/page.tsx`.
2. **`finalize-preflight` — `plan-11 bug 1: count parity emits error when nextFilesJson length drifts from completeProjectFiles`**  
   Mocka så `persistedFileCount !== preflightFileCount` (eller tvinga fel gren i `finalize-preflight.ts` rad ~679).
3. **`generation-stream-post` / `post-finalize-policies` — `fidelity2 init with preflight errors does not get design_preview_skip_verify`**  
   Säkerställer att skip bara gäller “ren” preflight enligt PROMPT-10.
4. **`generation-log-writer` — `lruPruneSubdirs prunes _unrouted when bucket count exceeds MAX_UNROUTED_BUCKETS`**  
   Flera mappar under `_unrouted/`, verifiera att äldsta rensas (eller att cap hålls).
5. **`(integration eller finalize-version)` — preview file list matches preflight `filesJson` count after gate**  
   Täcker P11-B1e om önskat som automatiserat.
6. **`follow-up-clarification` — `gör om den` does not classify as capability-modify`** (eller avsett intent: t.ex. `clear-redesign` / `clear-refine`).  
7. **`follow-up-capability-detection` + `follow-up-clarification` — `lägg till en till 3D-grej` → capability-add, modify refs false**  
   Särskiljer “till” (ännu en) från modify-markörer.

## Sammanfattning: räcker coverage för att plan 12 ska vila på wave 5?

**Delvis ja med två betydande luckor att stänga innan man litar blint på regressionssviten mot wave 5-målen:**

- **Måste prioriteras:** (1) negativ **count-parity**-väg, (2) **F2 init + preflight-fel** ska *inte* tyst hoppa quality-gate om policyn så kräver, (3) **LRU ` _unrouted/`** i test om beteendet ska vara en del av “routing-fix”-garantin.
- **Bör kompletteras:** `src/app/page.tsx` trivial path; **“gör om den”** / **“lägg till en till 3D-grej”** för Bug 3-routing; eventuell **preview/bootstrap-paritet** (P11-B1e) om det fortfarande är en öppen produktrisk.

Övrig Bug 1/2/3- och P10-telemetry/verify-skip-täckning är **tillräckligt stark** för att plan 12 kan byggas vidare, under förutsättning att ovanstående gap accepteras medvetet eller adresseras i en snäv test-PR.

## Klart-kriterium (enligt brief)

- **PR öppnad:** utförs av orkestrering/människa; denna fil är endast audit-leverans.
