# Orchestration Signal Contract

Det här dokumentet beskriver **vilka signaltyper** builder-/own-engine-kedjan använder före, under och efter generation.

Syftet är att ge en enda, stabil karta över:

- vilken information som letas efter
- var den letas efter
- hur den används
- vilka felbilder som ofta uppstår

Det här är en **schema-/kontraktsöversikt**, inte full arkitekturtext. För flödesförklaring: se `docs/architecture/llm-signal-flow.md`.

## Signallager

| Lager | Vad som söks | Primära filer | Input | Output | Vanliga felbilder |
|---|---|---|---|---|---|
| Prompt formatting | minimal fallback-wrap (`MÅL` + `TILLGÄNGLIGHET`) när brief saknas | `src/lib/builder/prompt-assist/formatters.ts` | rå användarprompt | formatterad prompt + snabb addendum | torftig prompt förblir för lös, för lite domänstruktur |
| Prompt assist | bättre språk, tydligare scope, bättre instruktionstäthet | `src/lib/builder/prompt-assist/runner.ts`, `/api/ai/chat` | rå prompt + build intent | förbättrad prompt | lägger till för lite struktur eller för mycket scope |
| Deep brief | projektnamn, pages, sections, domainProfile, motionLevel, qualityBar, requestedCapabilities, visual identity, imagery, SEO, UI notes | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief` | rå prompt | structured brief | Kanonisk semantisk expansion för init. Brief-objektet via `meta.brief` konsumeras av `buildDynamicContext()`; brief-deriverad prose dubbleras inte i `customInstructions`. Server Auto-Brief körs som fallback när klienten saknar brief, även för strukturerade init-prompts. Follow-ups återkör inte Deep Brief-LLM:en — `buildFollowUpBriefFromSnapshot` rehydrerar en minimal snapshot-brief från `orchestration_snapshot.briefSummary` (requestedCapabilities, domainProfile-slug, visualDirection.styleKeywords, toneAndVoice, qualityBar, motionLevel, colorPalette, typography) när `meta.brief` saknas. |
| Scaffold keyword match | domänord för auth/ecommerce/blog/portfolio/website/app + brief-boost | `src/lib/gen/scaffolds/matcher.ts` | rå prompt + brief-context | scaffold-id + keyword scores | brief-pages boostar keyword-scores (+2 per matchande domän); kan stängas av med `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off` |
| Scaffold embedding match | semantisk likhet mot scaffold-embeddingar | `src/lib/gen/scaffolds/scaffold-search.ts`, merge i `matcher.ts` | berikad prompt (rå + brief-fragment) | top-K scaffold candidates + head-to-head mot keyword | generic override kräver cosine ≥ 0.45; non-generic: ≥ kwNorm × bias; `embeddingOverrideReason` loggas |
| Route plan | brief-routes (startpunkt) + gated prompt-patterns + scaffold-defaults + follow-up freeze + locale-alternate dedup | `src/lib/gen/route-plan.ts` | prompt + brief + scaffold + generationMode + locale (default `sv`) | `RoutePlan` | brief mergeas (ingen early-return); follow-up gatar patterns bakom `hasExplicitAddRouteIntent`; booking → `/booking`, auth → `/signup` + `/forgot-password` + `/login`; **`dedupePlannedRoutesInPlaceByLocale()` kollapsar `/blog↔/blogg`, `/contact↔/kontakt`, `/about↔/om`, `/services↔/tjanster` innan plan serialiseras till LLM:n (sedan 2026-04-21)** |
| Capability inference | motion, 3D, charts, database, auth, app shell, forms, ecommerce, premium visuals | `src/lib/gen/capability-inference.ts` | prompt | `InferredCapabilities` | falska positiva på ecommerce/app shell/database |
| Pre-generation contracts | persistence, auth, payment, integrations, env vars | `src/lib/gen/contract/pre-generation-contracts.ts` | prompt corpus + brief + capabilities + confirmed answers | `PreGenerationContractContext` | SQLite/Stripe triggas i onödan, booking misstolkas som backendkrav |
| BuildSpec | change scope, quality tier, preview/verifier/context policy, token budgets | `src/lib/gen/build-spec/` (post-OMTAG-03 package) | prompt + route plan + contracts + scaffold + mode | `BuildSpec` | för tung verify/context på enkla fall, för lätt på svåra; `normal` är nu standard för vanliga follow-ups medan `light` mest används för tydligt små lokala ändringar |
| Dynamic context assembly | scaffold context, route plan, contracts, brief, theme, imagery, capability hints, registry-synkad men lokalt filtrerad shadcn-toolkit, capability-matchade component references | `src/lib/gen/system-prompt/` (post-OMTAG-03 package), `src/lib/gen/data/shadcn-toolkit-summary.ts`, `src/lib/gen/data/shadcn-example-loader.ts` | orchestration inputs | dynamic system prompt + pruning metadata; `## Brief-Locked Design Values` före scaffold variant när briefen bär designvärden | rätt signaler finns men kommer för sent för scaffoldvalet |
| Post-check analysis | SEO, analytics, editorial packs, workflows, route mismatch, sanity errors | `src/lib/hooks/chat/post-checks-analysis.ts` | genererade filer + preflight/version context | strukturerade findings | bra site men fel readiness-/warning-semantik |
| Finalize preflight cross-checks | saknade planerade routes + deterministisk href↔route-check | `src/lib/gen/stream/finalize-preflight.ts`, `src/lib/gen/verify/href-route-cross-check.ts` (sedan 2026-04-21) | merged files + `routePlan` + `actualRoutePaths` | `non_blocking_quality_warning`-rader i `engine_version_error_logs` + devLog `href-route.cross-check` | LLM emitterar `href="/blog/${slug}"` mot faktisk route `/blogg/[slug]` → mismatch flaggas med Levenshtein-suggestion. Hrefen normaliseras till pathname (query/hash strippas via `pathnameOnly()`) före matchning så `/about?ref=nav`, `/about#cta` och rena same-page-länkar (`/#hero`, `/?ref=nav`) inte triggar falska warnings |

## Viktiga observationer

### 1. Deep brief påverkar scaffoldval och route-plan

Briefen är den **kanoniska semantiska expansionen** för init. Brief-objektet skickas via `meta.brief` och konsumeras av `buildDynamicContext()`. Brief-deriverad prose sammanfogas inte längre med `customInstructions` — `customInstructions` bär enbart användarens egna instruktioner. Server Auto-Brief (`shouldRunServerAutoBrief`) körs som fallback när klienten inte skickar brief; den hoppar bara över audit, technical/preserved payload och follow-up, inte strukturerade init-prompts. **Follow-ups återkör inte Deep Brief-LLM:en** — när `meta.brief` saknas hydreras en minimal snapshot-brief (requestedCapabilities, domainProfile-slug, visualDirection.styleKeywords, toneAndVoice, qualityBar, motionLevel, colorPalette, typography, projectTitle, brandName) från `orchestration_snapshot.briefSummary` via `buildFollowUpBriefFromSnapshot()`. Följ-upen förlitar sig alltså på persisted scaffold, snapshot-brief och tidigare filer.

Briefen matar in i scaffoldmatchningen via `ScaffoldQueryContext` (pages, styleKeywords, domainHints → keyword-boost + berikad embedding-prompt). Route-planen mergear brief-routes som startpunkt, inte override. Se `docs/architecture/component-library-policy.md` för komponentbibliotekspolicy.

### 2. Keyword och embeddings körs parallellt; merge-policy jämför signalerna

`matchScaffoldAuto()` startar embedding-sökning direkt och beräknar keyword-signalen parallellt i samma server-side orkestreringspass; resultatet mergeas sedan innan scaffoldvalet bestäms.

I samma orkestreringspass hämtas nu registry/community-komponentreferenser parallellt med auto-matchningen så scaffoldval och referensunderlag inte blockar varandra sekventiellt.

- **Keyword** ger ett snabbt scaffold-förslag (eller intent-baseline om `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off`).
- **Embedding** får **utmana** även icke-generiska keyword-val när cosinuslikheden är tillräckligt hög och säkerhetsgarder (`canUseEmbeddingOverride`) passerar. Jämförelsen mot keyword-styrka skalar rå keyword-poäng mot `SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS` (standard ~0,82 — **lägre värde** ⇒ embeddings får lättare vinna mot starka keyword-träffar).

Det finns en **golv-tröskel** (`EMBEDDING_MIN_SCORE` = 0.35 i `matcher.ts`) under vilken embedding aldrig vinner. För generiska keyword-val (landing-page / base-nextjs) krävs `GENERIC_EMBEDDING_MIN_SCORE` = 0.45. Override-anledningen loggas som `embeddingOverrideReason` i scaffold-meta.

### 3. Capability-lagret är ett hint-lager, inte domänsanning

`capability-inference.ts` är snabbt och användbart, men grunt. Det bör inte ensam få skapa starka backend-/betalningskontrakt.

Capability-lagret används nu också som en follow-up-signal:

- capability-heavy önskemål (t.ex. 3D, karusell, större visuella effekter) kan hindra att follow-upen degraderas till den allra lättaste context-/verification-banan
- det gör inte capability inference till ett nytt primärt sanningslager, men minskar risken att ambitiösa visual/product-ändringar feltolkas som små lokala tweaks

### 4. Contract-lagret är flernivåigt

`pre-generation-contracts.ts` har i praktiken minst fyra nivåer:

1. corpusbygge
2. inferens
3. defaults/fallbacks
4. confirmed answers/clarifications

## Kodsanning

Om detta dokument och koden skulle motsäga varandra gäller alltid koden. Primära sanningsfiler:

- `src/lib/builder/prompt-assist/` (post-OMTAG-03 package)
- `src/lib/builder/site-brief-generation.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/scaffold-search.ts`
- `src/lib/gen/route-plan.ts`
- `src/lib/gen/capability-inference.ts`
- `src/lib/gen/contract/pre-generation-contracts.ts`
- `src/lib/gen/build-spec/` (post-OMTAG-03 package)
- `src/lib/gen/system-prompt/` (post-OMTAG-03 package)
- `src/lib/hooks/chat/post-checks-analysis.ts`

## När detta dokument uppdateras

Uppdatera dokumentet när:

- ett nytt signallager tillkommer
- ett lager byter ansvar eller input/output
- capability-/contract-/route-planlogiken ändras materiellt
- sanity-severity-policy ändras (unresolved imports, saknad package.json)
