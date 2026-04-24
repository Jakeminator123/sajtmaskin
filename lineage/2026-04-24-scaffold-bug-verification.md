# Scaffold bug verification — 2026-04-24

Verifikation av påstådda buggar från snabba modeller mot faktisk kod, plus åtgärd där det var meningsfullt. Linear är fortsatt source of truth för status; det här dokumentet är en frusen ögonblicksbild av verifikationen.

**Detta dokument täcker två vågor**: våg 1 (SAJ-34→45 + B1/B2/B3) och våg 2 (SAJ-46→57). Se "Våg 2"-sektionen längst ned.

## Källor som gicks igenom

- **Våg 1:** Linear-issues SAJ-34 → SAJ-45 (12 st) + B1 / B2 / B3 (extern modell-rapport om `KEYWORD_MATCH=off`, sv-locale routes, SEO-defaults).
- **Våg 2:** Linear-issues SAJ-46 → SAJ-57 (12 st nya, varav 5 dubletter mot våg 1).
- **Lokala agent-rapporter** (`.cursor/bugs/2026-04-24_*`) saknas på denna disk eftersom `.cursor/bugs/*` är gitignored — innehållet finns dock i sin helhet i Linear-issue-bodies. `lineage/2026-04-24-scaffold-bug-findings*.md` fanns aldrig lokalt heller.

## Resultat

| ID | Verdict | Status | Fil |
|----|---------|--------|------|
| SAJ-34 | Bugg (mindre dok) — fixad | Done | `src/lib/gen/scaffolds/README.md` |
| SAJ-35 | Bugg (telemetri) — fixad | Done | `src/lib/gen/scaffolds/scaffold-search.ts` |
| SAJ-36 | Tech debt — fixad (ta bort oanvända options) | Done | `matcher.ts` + `orchestrate.ts` |
| SAJ-37 | Bekräftad — kvar öppen (kräver pipeline-plumbing) | Backlog | `scaffold-aware-retry.ts` ↔ `preflight-phase.ts` |
| SAJ-38 | Bekräftad — delvis fixad (param borttagen, schema-fix kvarstår) | Backlog | `scaffold-aware-retry.ts` |
| SAJ-39 | Bugg — fixad (konservativ multi-line guard) | Done | `seo-defaults.ts` |
| SAJ-40 | Bekräftad — fixad (loud error för kända id) | Done | `load-scaffold-files.ts` |
| SAJ-41 | Bekräftad — fixad (hints → prefix) | Done | `scaffold-search.ts` |
| SAJ-42 | Bekräftad — kvar öppen (samma scope som SAJ-37) | Backlog | `scaffold-aware-retry.ts` ↔ `preflight-phase.ts` |
| SAJ-43 | Bekräftad — kvar öppen (kräver konventionsbeslut) | Backlog | `scaffold-manifest-validation.ts` ↔ `seo-defaults.ts` |
| SAJ-44 | Subtil tech debt — kvar öppen (kräver design) | Backlog | `matcher.ts` |
| SAJ-45 | **NOT-A-BUG** — påståendet felaktigt | Canceled | `serialize.ts` (verifierat OK) |
| B1 | Bugg — fixad (`defaultScaffoldForIntent("app")` → app-shell) | n/a | `matcher.ts` |
| B2 | Bekräftad — INTE fixad (svensk locale-routing kräver mapping-tabell) | n/a | `serialize.ts:routePathToScaffoldNeedle` |
| B3 | Bekräftad — fixad (env-driven URL + warn om placeholder) | n/a | `seo-defaults.ts` |

## Quick verifikation per fix

### SAJ-34 — README inconsistency
- `BASE_SCAFFOLDS` har 9 entries (verifierat genom att räkna manifests-imports i `registry.ts:27-37`).
- README ingressen sa korrekt 9. Tabellraden om `registry.ts` sa felaktigt "10 manifests".
- Fix: ändrat till "9 manifests" + explicit `BASE_SCAFFOLDS`-pekare.

### SAJ-35 — embedding telemetry skew
- `embeddingInput = expandQuery(query)` truncas till 7000 chars.
- `debugLog` loggade `queryChars: query.length` (originalsträngen, inte den embedade).
- Fix: lägg till `embeddingInputChars` + `truncated: boolean`.

### SAJ-36 — unused matchScaffoldAuto options
- `options.generationMode` och `options.brief` deklarerade men aldrig lästa i body.
- Fix: ta bort båda från typen + call-site i `orchestrate.ts`. Variant-resolver tar redan `generationMode` separat med tydlig semantik.

### SAJ-38 — historical retry success ignorerar currentId
- Schema saknar `scaffold_retry_from_id`-kolumn → omöjligt att filtrera per pivot-par utan migration.
- Fix: ta bort den oanvända `currentId`-parametern + dokumentera begränsningen i JSDoc.
- Issue stannar i Backlog för uppföljande schema-fix om pair-stat blir prioriterat.

### SAJ-39 — multi-line metadata regex
- `${key}:\s*([^\n,]+)` capture stannar vid första `\n` eller `,`.
- För template literals (`` `${PRODUCT}` `` med radbrytning), objekt-expressions (`{ default: "x" }`) eller trailing-comments → bryter den enriched metadata-blocken med syntaxfel.
- Fix: returnera fallback om värdet ser obalanserat ut (mismatched backticks/braces). Konservativt — vi avstår enrich i osäkra fall.

### SAJ-40 — silent empty file list
- `loadScaffoldFiles` returnerade `[]` om `files/`-katalogen saknades.
- Fix: hardcodad `KNOWN_SCAFFOLD_IDS`-set (matchar registry); för kända id → loud `console.error` med cwd + path; för okända id → `[]` OK. Hardcoded för att undvika circular import (registry → manifests → load-scaffold-files).

### SAJ-41 — bilingual hints clipped by truncation
- `expandQuery` byggde `${query}\n\nRelated search terms: ${hints}` (suffix), sedan `slice(0, 7000)` → hints clipped vid lång prompt+brief.
- Fix: hints flyttade till **prefix**. Korta + deterministiska → tål alltid att ligga först. Truncation slår nu på query-svansen.

### B1 — KEYWORD_MATCH=off + app intent → fel scaffold
- `defaultScaffoldForIntent` hade gren för `website|template` → landing-page; allt annat → base-nextjs (inklusive `app`).
- Med `KEYWORD_MATCH=off` returnerar `matchScaffold` direkt baseline → app-intent fastnade på base-nextjs när embeddings var otillgängliga / under threshold.
- Fix: lägg till explicit `app` → app-shell-gren.

### B3 — example.com läcka
- `SEO_DEFAULT_SITE_URL = "https://example.com"` hardcodad i robots.ts/sitemap.ts/opengraph-image.tsx + metadataBase.
- Mitigerat tidigare av `PLACEHOLDER_REPLACEMENT_INSTRUCTIONS` i serialize-prompt — men beroende av att LLM lyder.
- Fix: läs från `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL` (env), fallback till `https://example.com` + sentinel-baserad warn så det syns i logs när vi ligger på placeholder.

## Verifikation

- `npm run typecheck` → 0 errors.
- `npx vitest run src/lib/gen` → 904/904 passed (102 test files).
- `npx eslint src/lib/gen/scaffolds src/lib/gen/orchestrate.ts` → 0 errors, 0 warnings.

## Kvar att göra (utanför scope för dagens fix-pass)

- **SAJ-37 + SAJ-42 (gemensam):** plumba `scaffoldQueryContext` (eller serialiserad brief-fragment) genom orchestrate → buildSpec → finalize-version → preflight-phase → `inferScaffoldRetrySuggestion`. Låt retry-hjärnan kalla `matchScaffoldAuto` i st.f. `matchScaffold` + `searchScaffolds` separat.
- **SAJ-43:** beslut — sträng `app/`-konvention eller utvidgad validering till `src/app/`-paritet. Måste matchas över `validateScaffoldManifest`, `seo-defaults.ts` och `CRITICAL_PATH_PATTERNS`.
- **SAJ-44:** beslut — score:a kvNorm mot exakt samma text som `matchScaffold` selekterade på, eller separera "user-only diagnostic" från "override-styrka".
- **SAJ-38 fortsättning:** schema-migration `scaffold_retry_from_id` om vi vill ha pair-statistik.
- **B2:** svensk locale-route-mapping i `routePathToScaffoldNeedle` (`/blogg` → blog, `/butik` → ecommerce, etc.). Kräver locale-medvetet routing-koncept.

## Filer rörda i våg 1

```
src/lib/gen/scaffolds/README.md
src/lib/gen/scaffolds/scaffold-search.ts
src/lib/gen/scaffolds/matcher.ts
src/lib/gen/scaffolds/scaffold-aware-retry.ts
src/lib/gen/scaffolds/seo-defaults.ts
src/lib/gen/scaffolds/load-scaffold-files.ts
src/lib/gen/orchestrate.ts
```

---

# Våg 2 — SAJ-46 → SAJ-57

12 nya issues skapade efter våg 1. Hit rate på unika fynd: **7/7 = 100 %**. 5 är dubletter mot våg 1, vilket faktiskt stärker tilltron — flera oberoende agentkörningar landade på samma observationer.

## Resultat

| ID | Verdict | Status | Fil / åtgärd |
|----|---------|--------|--------------|
| SAJ-46 | Duplicate av SAJ-56 | Duplicate | (samma fix) |
| SAJ-47 | Duplicate av SAJ-36 | Duplicate | (redan fixat i våg 1) |
| SAJ-48 | Duplicate av SAJ-34 | Duplicate | (redan fixat i våg 1) |
| SAJ-49 | Designval — INTE fixat | Backlog | `scaffold-scoring.ts` (null `previewSuccess` = miss) |
| SAJ-50 | Bekräftad — fixad | Done | `scaffold-search.ts` — AbortController-fallback |
| SAJ-51 | Duplicate av SAJ-36 | Duplicate | (redan fixat i våg 1) |
| SAJ-52 | Bekräftad — fixad | Done | `scaffold-embeddings-core.ts` — `?.` på `upgradeTargets` + `referenceTemplates` |
| SAJ-53 | Bekräftad — fixad | Done | `scaffold-scoring.ts` — räkna `agreement` som embedding |
| SAJ-54 | Bekräftad — fixad | Done | `scaffold-search.ts` — logga orphan-id + i errorMessage |
| SAJ-55 | Bekräftad död kod — INTE borttaget | Backlog | `scaffold-scoring.ts` — kräver produktbeslut (wire/keep/delete) |
| SAJ-56 | Bekräftad — fixad | Done | `scaffold-eval.ts` — pass `queryContext` + `capabilities` till matcher |
| SAJ-57 | **KRITISK** — dokumenterad, INTE fixad (kräver upstream) | Backlog | `persist-telemetry.ts` — `scaffoldRetryUsed` alltid false → invaliderar SAJ-38 |

## Quick verifikation per fix (våg 2)

### SAJ-50 — embedding-timeout fallback
- `createEmbeddingAbortSignal` returnerade `undefined` om `AbortSignal.timeout` saknades → ingen timeout trots dokumenterad 5s-budget.
- Fix: lägg till `AbortController` + `setTimeout(...).unref?.()`-fallback. Modern Node tar fortfarande snabb-vägen.

### SAJ-52 — optional chaining bug
- `${scaffold.research?.upgradeTargets.join("; ") ?? ""}` saknade `?.` på `upgradeTargets`. Throw om `research` finns men `upgradeTargets` undefined.
- Fix: `?.` på `upgradeTargets?.join` och `referenceTemplates?.map`.

### SAJ-53 — agreement-räkning i scoring
- `embeddingSelections` ökade bara på `selectionMethod === "embedding"`, inte `"agreement"`. `embeddingShare` underskattade semantik-bidrag.
- Fix: räkna båda `embedding` + `agreement`.

### SAJ-54 — orphan embedding-id-log
- `registry_mismatch` returnerade tom resultatlista men sa inte vilka id:n som var orphan.
- Fix: samla `orphanScoredIds`, `warnLog` med top-3 + inkludera dem i `errorMessage` för diagnostics-konsumenter.

### SAJ-56 / SAJ-46 — eval saknade context
- `runScaffoldSelectionEval` skickade bara `useEmbeddings: true` → eval mätte sanitized matcher-väg.
- Fix: ScaffoldEvalCase fick optional `queryContext` + `capabilities` härleds alltid via `inferCapabilities(prompt)`.

### SAJ-57 — KRITISK telemetri-bug (dokumenterad, ej fixad)
- `persist-telemetry.ts:166` hardcodar `scaffoldRetryUsed: false`.
- **Konsekvens:** `getHistoricalRetrySuccess` (SAJ-38) returnerar **alltid `null`**. Min våg 1-fix där var i praktiken bara dokumentation.
- **Konsekvens:** `scaffold-scoring.retryCount` alltid `0` → `retryRate` permanent 0.
- Roten: `persist-telemetry` ser bara raden som SUGGERAR retry, inte den nästa generation som ANVÄNDER förslaget. Att sätta `Boolean(scaffoldRetry)` skulle invertera kolumnens semantik tyst.
- Riktig fix kräver upstream signal (chat-repair-pipen behöver flagga "denna generation är ett retry-försök"). Lagt detaljerad TODO i `persist-telemetry.ts:165-179` + uppdaterat SAJ-38 JSDoc att hänvisa hit.

### SAJ-49 — null `previewSuccess`-räkning (ej fixad)
- `totalGenerations += 1` för alla rader, `successCount += 1` bara när `previewSuccess === true`. Null räknas som miss.
- Min bedömning: troligen avsiktligt — pessimistisk bias är säkrare för ranking. Tre alternativ dokumenterade i Linear-kommentar. Kräver produktbeslut.

### SAJ-55 — död kod (ej fixad)
- `getScaffoldBoost` + `computeScaffoldScores` har **noll** call-sites.
- Tre vägar dokumenterade: wire upp / backoffice-only / ta bort. Konsekvens av val knyts till SAJ-57 (även om scoring kopplas in är `retryRate` = 0 tills SAJ-57 fixas).

## Filer rörda i våg 2

```
src/lib/gen/scaffolds/scaffold-search.ts          (SAJ-50, SAJ-54)
src/lib/gen/scaffolds/scaffold-embeddings-core.ts (SAJ-52)
src/lib/gen/scaffolds/scaffold-scoring.ts         (SAJ-53)
src/lib/gen/scaffolds/scaffold-eval.ts            (SAJ-46/56)
src/lib/gen/scaffolds/scaffold-aware-retry.ts     (SAJ-38 JSDoc-uppdatering)
src/lib/gen/stream/finalize-version/persist-telemetry.ts (SAJ-57 dokumentation)
```

## Verifikation efter våg 2

- `npm run typecheck` → 0 errors
- `npx vitest run src/lib/gen` → 904/904 passed (102 testfiler)
- `eslint` på alla rörda filer → 0 errors
