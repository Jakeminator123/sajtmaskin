# Orchestration Signal Contract

Det här dokumentet beskriver **vilka signaltyper** builder-/own-engine-kedjan använder före, under och efter generation.

Syftet är att ge en enda, stabil karta över:

- vilken information som letas efter
- var den letas efter
- hur den används
- vilka felbilder som ofta uppstår

Det här är en **schema-/kontraktsöversikt**, inte full arkitekturtext. För flödesförklaring: se `docs/architecture/runtime-contracts.md` och `docs/architecture/llm-pipeline.md`.

## Signallager

| Lager | Vad som söks | Primära filer | Input | Output | Vanliga felbilder |
|---|---|---|---|---|---|
| Prompt formatting | minimal fallback-wrap (`MÅL` + `TILLGÄNGLIGHET`) när brief saknas | `src/lib/builder/prompt-assist/formatters.ts` | rå användarprompt | formatterad prompt + snabb addendum | torftig prompt förblir för lös, för lite domänstruktur |
| Brief (pre-codegen) | strukturerad site brief före kodgenerering | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief`, `tryGenerateServerAutoBrief`, `runClearRedesignDeltaBriefPhase` | rå prompt + assist-modellhint | structured brief | Assist Model är bara en hint till brief-lanen, inte en rewrite-agent. Ingen `/api/ai/chat`. |
| Deep brief | projektnamn, pages, sections, domainProfile, motionLevel, qualityBar, requestedCapabilities, visual identity, imagery, SEO, UI notes | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief` | rå prompt | structured brief | Kanonisk semantisk expansion för init. Brief-objektet via `meta.brief` konsumeras av `buildDynamicContext()`; brief-deriverad prose dubbleras inte i `customInstructions`. Server Auto-Brief körs som fallback när klienten saknar brief, även för strukturerade init-prompts. Vanliga follow-ups återkör inte Deep Brief-LLM:en — `buildFollowUpBriefFromSnapshot` rehydrerar Snapshot-Brief från `orchestration_snapshot.briefSummary` när `meta.brief` saknas. Undantag: `clear-redesign` kör `runClearRedesignDeltaBriefPhase` (samma schema, redesign-prior-context). `resolveFollowUpActiveBrief` faller till Snapshot-Brief för övriga lägen (`null` bara när snapshoten saknar `briefSummary`). |
| Scaffold keyword match | domänord för auth/ecommerce/blog/portfolio/website/app + brief-boost | `src/lib/gen/scaffolds/matcher.ts` | rå prompt + brief-context | scaffold-id + keyword scores | brief-pages boostar keyword-scores (+2 per matchande domän); kan stängas av med `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off` |
| Scaffold embedding match | semantisk likhet mot scaffold-embeddingar | `src/lib/gen/scaffolds/scaffold-search.ts`, merge i `matcher.ts` | berikad prompt (rå + brief-fragment) | top-K scaffold candidates + head-to-head mot keyword | generic override kräver cosine ≥ 0.45; non-generic: ≥ kwNorm × bias; `embeddingOverrideReason` loggas |
| Route plan | brief-routes (startpunkt) + gated prompt-patterns + scaffold-defaults + follow-up freeze + locale-alternate dedup | `src/lib/gen/route-plan/` | prompt + brief + scaffold + generationMode + locale (default `sv`) + `pageCountHint` (Byggval, init-only — vinner över sidantal-regexen) | `RoutePlan` | brief mergeas (ingen early-return); follow-up gatar patterns bakom `hasExplicitAddRouteIntent`; booking → `/booking`, auth → `/signup` + `/forgot-password` + `/login`; **`dedupePlannedRoutesInPlaceByLocale()` kollapsar `/blog↔/blogg`, `/contact↔/kontakt`, `/about↔/om`, `/services↔/tjanster` innan plan serialiseras till LLM:n (sedan 2026-04-21)** |
| Capability inference | snabb flaggning av produkt-/UI-capabilities samt named dossier-capabilities | `src/lib/gen/capability-inference.ts`, `src/lib/gen/capability-dossier-bridge.ts`; `src/lib/builder/follow-up-capability-detection.ts` + `follow-up-capability-vocabulary.ts` | rå prompt i både init och follow-up | `InferredCapabilities` + samma `requestedDossierCapabilities`/tiers i båda faserna | breda flags och named detector kompletterar varandra; scaffold-unlock är separat signal men regressionsmatrisen skyddar gränserna |
| Pre-generation contracts | persistence, auth, payment, integrations, env vars | `src/lib/gen/contract/pre-generation-contracts.ts` | prompt corpus + brief + capabilities | `PreGenerationContractContext` | SQLite/Stripe triggas i onödan, booking misstolkas som backendkrav |
| BuildSpec | change scope, quality tier, preview/verifier/context policy, token budgets | `src/lib/gen/build-spec/` (post-OMTAG-03 package) | prompt + route plan + contracts + scaffold + mode + scaffold-unlock signal + `complexityHint` (Byggval, init-only: `complex` → premium-golv + heavy context-bias, `simple` → lättare context-bias, demotar aldrig quality) | `BuildSpec` | för tung verify/context på enkla fall, för lätt på svåra; `normal` är nu standard för vanliga follow-ups medan `light` mest används för tydligt små lokala ändringar; major-change/scaffold-unlock från `shouldIgnorePersistedScaffoldForMatch` håller follow-ups borta från light/fast utan att auto-promota F3 |
| Dynamic context assembly | scaffold context, route plan, contracts, brief, theme, imagery, capability hints, registry-synkad men lokalt filtrerad shadcn-toolkit, capability-matchade UI Recipes (sökdrivna kandidater sedan Fas 4, `SAJTMASKIN_SHADCN_RESOLVER_SEARCH`, legacy-fallback vid flagga av/indexfel) | `src/lib/gen/system-prompt/` (post-OMTAG-03 package), `src/lib/gen/data/shadcn-toolkit-summary.ts`, `src/lib/gen/data/{shadcn-ui-recipes,shadcn-recipe-search}.ts`, `src/lib/gen/orchestrate/finalize-prompts.ts` (`sources`) | orchestration inputs inkl. `mediaCatalog` + `designReferences` | dynamic system prompt + pruning metadata + `sources[]` på `GenerationInputPackage` (`kind`/`id`/`origin`/`reason`/`authority`/`reachedPrompt`; `reachedPrompt` efter tokenbudget). Samma lista i stream-meta och `generation_telemetry.meta.sources` när den inte är tom. `## Brief-Locked Design Values` före scaffold variant när briefen bär designvärden. UI Recipes resolveras för varje request (init och follow-up) sedan B8 tog bort snabbspåret. Follow-ups compactar variant/toolkit/route bara när `BuildSpec` finns, `contextPolicy !== "heavy"`, `changeScope !== "redesign"` och `followUpIntent !== "clear-redesign"`. | rätt signaler finns men kommer för sent för scaffoldvalet |
| Dossier stream meta | exakt dossierlista + canonical capability-lista för finalize/autofix | `src/lib/gen/orchestrate.ts`, `src/lib/own-engine/session/own-engine-build-session.ts`, `src/lib/gen/stream/finalize-version/runner.ts` | `dossierRequestedCapabilities`, `dossierSelection.selected[]` | `selectedDossierIds` + `requestedCapabilities` i stream-meta | om bara selected capabilities sparas blir fallback-replay ofullständig; `selectedDossierIds` är primär policykälla och capability-listan är legacy/autofix-fallback |
| Källkvitto | vilka valda källor som överlevde tokenbudgeten | `src/lib/gen/orchestrate/source-receipt.ts`, `finalize-prompts.ts`, `persist-telemetry.ts` | variantreferens, UI Recipes, dossiers, `mediaCatalog`, designreferenser + `keptBlockKeys` | `sources[]` på paketet, dump-meta (`sourceCount`/`sourceKinds`) och `generation_telemetry.meta.sources` | media-katalogen är tom tills en anropare skickar `mediaCatalog`; designreferenser kvitteras ändå. Ändrar inte urval. |
| F3 build plan | filhärledd integration/spec från den exakta parent-versionen | `tier3-readiness-gate.ts`, `chat-message-stream/f3-readiness-gate.ts`, `system-prompt/sections/session-contracts.ts` | parent-versionens filer + snapshot/dossiers + explicit godkända providers i aktuell runda | `tier3BuildSpec` i F3 Dynamic Context; current approvals adderas, övriga prompt-kontrakt är fallback när filspec saknas/tom | gate-fel degraderar till legacy-fallback; fel parent blockeras av befintlig mismatch-/tenant-gate |
| Post-check analysis | route mismatch, sanity errors, Link-/use()-missbruk + advisory SEO-scan (endast error-log-rad; analytics/editorial/business-reviews borttagna 2026-07-23) | `src/lib/hooks/chat/post-checks-analysis.ts` | genererade filer + preflight/version context | strukturerade findings | bra site men fel readiness-/warning-semantik |
| Innehållsrevision (verdikt-/kvittoläsning) | om ett verdikt, kvitto eller en statusclaim gäller det innehåll som ligger i `files_json` NU | `src/lib/gen/verify/content-revision.ts`, `src/lib/db/services/generation-telemetry.ts`, `src/lib/db/promote-guard.ts`, `src/lib/gen/verify/stale-verification.ts` | `generation_telemetry.files_revision` (revisionen verdiktet bedömde) + `engine_versions.files_revision` (DB-genererad `md5(files_json)`) | `RevisionMatch`: `current` (verdiktet är ett svar) · `unknown` (ingen revision → fail-open) · `stale` (känd mismatch → overifierat) | Bakom flaggan `SAJTMASKIN_CONTENT_REVISION_GATE` (default av). Utan jämförelse kan ett verdikt för revision N läsas som svar om N+1 (false-green) eller blockera N+1 (false-red). Fallgropar: (a) stämpla ALDRIG om `files_revision` vid UPDATE — då skrivs dagens innehåll över gårdagens bevis och mismatchen blir osynlig; (b) `files_revision` (md5) är inte `hashFilesJson` (sha256), som äger repair-revisionsbindningen — värdena är per konstruktion olika |
| Defektsignatur | vilken **felklass** en rad i `engine_version_error_logs` tillhör, så samma fel går att räkna över tid och chattar | `src/lib/logging/version-defect-signature.ts`, applicerad i `src/lib/db/services/version-errors.ts` (`enrichEnginePayloads`) | radens `category` + `message` + `meta` | `meta.defect = { kind, signature, file?, line? }` på varje skriven rad; aggregeras av `dump-logs --kinds=defects` | Klassificeras på den **kanoniska skrivvägen** — en signatur som bara vissa av ett fyrtiotal producenter sätter går inte att räkna på. Signaturen utesluter radnummer med flit så en defekt inte nollställs när koden flyttar sig; filen ingår däremot, eftersom samma text i två filer är två defekter. Anropare som redan satt `meta.defect` får behålla sin. Säger inget om allvarlighet — vad som blockerar avgörs av gates |
| Finalize preflight cross-checks | saknade planerade routes + deterministisk href↔route-check | `src/lib/gen/stream/finalize-preflight.ts`, `src/lib/gen/verify/href-route-cross-check.ts` (sedan 2026-04-21) | merged files + `routePlan` + `actualRoutePaths` | `non_blocking_quality_warning`-rader i `engine_version_error_logs` + devLog `href-route.cross-check` | LLM emitterar `href="/blog/${slug}"` mot faktisk route `/blogg/[slug]` → mismatch flaggas med Levenshtein-suggestion. Hrefen normaliseras till pathname (query/hash strippas via `pathnameOnly()`) före matchning så `/about?ref=nav`, `/about#cta` och rena same-page-länkar (`/#hero`, `/?ref=nav`) inte triggar falska warnings |

## Viktiga observationer

### 1. Deep brief påverkar scaffoldval och route-plan

Briefen är den **kanoniska semantiska expansionen** för init. Brief-objektet skickas via `meta.brief` och konsumeras av `buildDynamicContext()`. Brief-deriverad prose sammanfogas inte längre med `customInstructions` — `customInstructions` bär enbart användarens egna instruktioner. Server Auto-Brief (`shouldRunServerAutoBrief`) körs som fallback när klienten inte skickar brief; den hoppar bara över audit, technical/preserved payload och follow-up, inte strukturerade init-prompts. **Vanliga follow-ups återkör inte Deep Brief-LLM:en** — när `meta.brief` saknas hydreras Snapshot-Brief från `orchestration_snapshot.briefSummary` via `buildFollowUpBriefFromSnapshot()`. Undantag: `clear-redesign` kör delta-brief (samma `siteBriefSchema`, `formatPriorDesignContext` med `intent: "clear-redesign"`). Övriga lägen får Snapshot-Brief (`null` bara när snapshoten saknar `briefSummary`). Följ-upen förlitar sig på persisted scaffold, Snapshot-Brief eller den nyskrivna delta-briefen, plus tidigare filer.

Briefen matar in i scaffoldmatchningen via `ScaffoldQueryContext` (pages, styleKeywords, domainHints → keyword-boost + berikad embedding-prompt). Route-planen mergear brief-routes som startpunkt, inte override. Se [`docs/contracts/component-library.md`](../contracts/component-library.md) för komponentbibliotekspolicy.

**Ingen längdgräns och ingen hemsida/app-skillnad (B8, 2026-08-18).** Fram till dess tog korta hemsideprompter (≤ 420 tecken) ett snabbspår — `simpleWebsitePath` — som hoppade över Auto Brief, scaffold-embeddings, UI Recipes och dossier-selektion. Appar avvisades alltid från spåret och fick därför hela vägen. Spåret är borttaget: ett fritextbygge får samma berikning oavsett promptlängd och oavsett `buildIntent`. Rollback vid latens-/kostnadsregression sker med `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1` respektive `SAJTMASKIN_DOSSIER_PIPELINE=false`, inte genom att återinföra en längdgräns. Verbatim-import (`POST /api/template`) är en egen väg och berörs inte.

### 2. Keyword och embeddings körs parallellt; merge-policy jämför signalerna

`matchScaffoldAuto()` startar embedding-sökning direkt och beräknar keyword-signalen parallellt i samma server-side orkestreringspass; resultatet mergeas sedan innan scaffoldvalet bestäms.

I samma orkestreringspass hämtas nu UI Recipes parallellt med auto-matchningen så scaffoldval och referensunderlag inte blockar varandra sekventiellt.

- **Keyword** ger ett snabbt scaffold-förslag (eller intent-baseline om `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off`).
- **Embedding** får **utmana** även icke-generiska keyword-val när cosinuslikheden är tillräckligt hög och säkerhetsgarder (`canUseEmbeddingOverride`) passerar. Jämförelsen mot keyword-styrka skalar rå keyword-poäng mot `SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS` (standard ~0,82 — **lägre värde** ⇒ embeddings får lättare vinna mot starka keyword-träffar).

Det finns en **golv-tröskel** (`EMBEDDING_MIN_SCORE` = 0.35 i `matcher.ts`) under vilken embedding aldrig vinner. För generiska keyword-val (landing-page / base-nextjs) krävs `GENERIC_EMBEDDING_MIN_SCORE` = 0.45. Override-anledningen loggas som `embeddingOverrideReason` i scaffold-meta.

### 3. Capability-lagret är ett hint-lager, inte domänsanning

`capability-inference.ts` är snabbt och användbart, men grunt. Det bör inte ensam få skapa starka backend-/betalningskontrakt.

Capability-lagret används nu också som en follow-up-signal:

- capability-heavy önskemål (t.ex. 3D, karusell, större visuella effekter) kan hindra att follow-upen degraderas till den allra lättaste context-/verification-banan
- major-change-signaler (spel/canvas/physics/score/collision) kan släppa scaffold-låset via `shouldIgnorePersistedScaffoldForMatch`; `deriveBuildSpec` får samma unlock-signal och väljer minst normal context + standard verification, men F3 (`fidelity3`) kräver fortsatt explicit trigger
- det gör inte capability inference till ett nytt primärt sanningslager, men minskar risken att ambitiösa visual/product-ändringar feltolkas som små lokala tweaks

### 4. Contract-lagret är flernivåigt

`pre-generation-contracts.ts` har i praktiken minst fyra nivåer:

1. corpusbygge
2. inferens
3. defaults/fallbacks
4. confirmed answers/clarifications

### 5. Ett verdikt gäller ett innehåll, inte ett `versionId`

Samma `engine_versions`-rad skrivs om av user-edit (`/files`), server-repair
(`targetVersionId`-rewrite) och autofix. `versionId` är alltså ingen
innehållsidentitet, och därför kan inget lager svara på "gäller det här kvittot
filerna som ligger nu?" utan en innehållsrevision.

Primitiven finns sedan 2026-07-29: `engine_versions.files_revision` är
DB-genererad (`md5(files_json)`, `GENERATED ALWAYS ... STORED` — ingen skrivare
kan glömma den) och `generation_telemetry.files_revision` bär den revision
verdiktet faktiskt bedömde. Jämförelsen är flaggad
(`SAJTMASKIN_CONTENT_REVISION_GATE`, default av) och har tre lägen:

| Läge | Betyder | Effekt |
|---|---|---|
| `current` | verdiktets revision ÄR innehållets | verdiktet är ett svar (dagens semantik) |
| `unknown` | revision saknas på någon sida (rad före steg 2, versionslös rad, flagga av) | dagens fail-open, aldrig blockerande |
| `stale` | båda revisionerna kända och olika | **känd mismatch**: "ingen gate har körts för det här innehållet" |

Konsekvenserna per läsare: promote-guarden svarar retrybart `indeterminate`
(`staleRevision`) i stället för att släppa igenom eller terminal-faila — symmetriskt
för `passed` och `failed`; runtime-ready-kvittot stämplar bara rader vars revision
matchar innehållet VM:en servar (och cachen nycklas på revision); en terminal
bus-status som beskriver äldre innehåll degraderas i `/version-status`
(`stale_content_revision` → amber "Degraderad", aldrig grön "Klar"). Frekvensen av
känd mismatch mäts via `sajtmaskin_content_revision_mismatch_total{surface,verdict}`.

Två saker får inte göras: stämpla om `files_revision` på en befintlig
telemetrirad (det tillverkar en falsk matchning), och antag inte att
`files_revision` (md5) och `hashFilesJson` (sha256, repair-revisionsbindningens
`baseFilesHash`) har samma värde.

## Kodsanning

Om detta dokument och koden skulle motsäga varandra gäller alltid koden. Primära sanningsfiler:

- `src/lib/builder/prompt-assist/` (post-OMTAG-03 package)
- `src/lib/builder/site-brief-generation.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/scaffold-search.ts`
- `src/lib/gen/route-plan/`
- `src/lib/gen/capability-inference.ts`
- `src/lib/gen/contract/pre-generation-contracts.ts`
- `src/lib/gen/build-spec/` (post-OMTAG-03 package)
- `src/lib/gen/system-prompt/` (post-OMTAG-03 package)
- `src/lib/hooks/chat/post-checks-analysis.ts`
- `src/lib/gen/verify/content-revision.ts` (innehållsrevisionens flagga + klassificering)

## När detta dokument uppdateras

Uppdatera dokumentet när:

- ett nytt signallager tillkommer
- ett lager byter ansvar eller input/output
- capability-/contract-/route-planlogiken ändras materiellt
- sanity-severity-policy ändras (unresolved imports, saknad package.json)
