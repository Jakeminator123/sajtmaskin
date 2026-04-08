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
| Prompt formatting | sektioner, stilord, constraints, URL:er, tillgänglighetskrav | `src/lib/builder/promptAssist.ts` | rå användarprompt | formatterad prompt + snabb addendum | torftig prompt förblir för lös, för lite domänstruktur |
| Prompt assist | bättre språk, tydligare scope, bättre instruktionstäthet | `src/lib/builder/promptAssist.ts`, `/api/ai/chat` | rå prompt + build intent | förbättrad prompt | lägger till för lite struktur eller för mycket scope |
| Deep brief | projektnamn, pages, sections, visual identity, imagery, SEO, UI notes | `src/lib/builder/site-brief-generation.ts`, `/api/ai/brief` | rå prompt | structured brief | modellen producerar bra brief men scaffoldvalet använder den inte fullt ut |
| Scaffold keyword match | domänord för auth/ecommerce/blog/portfolio/website/app | `src/lib/gen/scaffolds/matcher.ts` | rå prompt | scaffold-id + keyword scores | fel scaffold väljs för tidigt; kan stängas av med `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off` (experimenter) |
| Scaffold embedding match | semantisk likhet mot scaffold-embeddingar | `src/lib/gen/scaffolds/scaffold-search.ts`, merge i `matcher.ts` | rå prompt (med query expansion) | top-K scaffold candidates + head-to-head mot keyword | svag query-expansion, API-nyckel saknas, eller garder blockerar t.ex. `auth-pages` |
| Route plan | explicita sidor, brief-pages, scaffold-default routes, route removals | `src/lib/gen/route-plan.ts` | prompt + brief + scaffold + generationMode | `RoutePlan` | `/om` + `/about`, felaktiga ecom-routes, route-freeze i follow-ups |
| Capability inference | motion, 3D, charts, database, auth, app shell, forms, ecommerce, premium visuals | `src/lib/gen/capability-inference.ts` | prompt | `InferredCapabilities` | falska positiva på ecommerce/app shell/database |
| Pre-generation contracts | persistence, auth, payment, integrations, env vars | `src/lib/gen/contract/pre-generation-contracts.ts` | prompt corpus + brief + capabilities + confirmed answers | `PreGenerationContractContext` | SQLite/Stripe triggas i onödan, booking misstolkas som backendkrav |
| BuildSpec | change scope, quality tier, preview/verifier/context policy, token budgets | `src/lib/gen/build-spec.ts` | prompt + route plan + contracts + scaffold + mode | `BuildSpec` | för tung verify/context på enkla fall, för lätt på svåra |
| Dynamic context assembly | scaffold context, route plan, contracts, brief, theme, imagery, capability hints | `src/lib/gen/system-prompt.ts` | orchestration inputs | dynamic system prompt + pruning metadata | rätt signaler finns men kommer för sent för scaffoldvalet |
| Post-check analysis | SEO, analytics, editorial packs, workflows, route mismatch, sanity errors | `src/lib/hooks/chat/post-checks-analysis.ts` | genererade filer + preflight/version context | strukturerade findings | bra site men fel readiness-/warning-semantik |

## Viktiga observationer

### 1. Deep brief och scaffold lever inte på samma nivå

Briefen kan bli mycket bättre än scaffoldvalet. I nuvarande kedja används briefen starkt för:

- pages
- sections
- visual direction
- imagery
- SEO

men scaffoldmatchningen kör fortfarande främst på råprompten.

### 2. Keyword och embeddings körs parallellt; merge-policy jämför signalerna

`matchScaffoldAuto()` startar embedding-sökning direkt (samma väntan som tidigare, men keyword beräknas samtidigt på klienten) och hämtar top-K semantiska träffar.

- **Keyword** ger ett snabbt scaffold-förslag (eller intent-baseline om `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off`).
- **Embedding** får **utmana** även icke-generiska keyword-val när cosinuslikheden är tillräckligt hög och säkerhetsgarder (`canUseEmbeddingOverride`) passerar. Jämförelsen mot keyword-styrka skalar rå keyword-poäng mot `SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS` (standard ~0,82 — **lägre värde** ⇒ embeddings får lättare vinna mot starka keyword-träffar).

Det finns fortfarande en **golv-tröskel** (`EMBEDDING_MIN_SCORE` i `matcher.ts`) under vilken embedding aldrig vinner.

### 3. Capability-lagret är ett hint-lager, inte domänsanning

`capability-inference.ts` är snabbt och användbart, men grunt. Det bör inte ensam få skapa starka backend-/betalningskontrakt.

### 4. Contract-lagret är flernivåigt

`pre-generation-contracts.ts` har i praktiken minst fyra nivåer:

1. corpusbygge
2. inferens
3. defaults/fallbacks
4. confirmed answers/clarifications

## Kodsanning

Om detta dokument och koden skulle motsäga varandra gäller alltid koden. Primära sanningsfiler:

- `src/lib/builder/promptAssist.ts`
- `src/lib/builder/site-brief-generation.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/scaffold-search.ts`
- `src/lib/gen/route-plan.ts`
- `src/lib/gen/capability-inference.ts`
- `src/lib/gen/contract/pre-generation-contracts.ts`
- `src/lib/gen/build-spec.ts`
- `src/lib/gen/system-prompt.ts`
- `src/lib/hooks/chat/post-checks-analysis.ts`

## När detta dokument uppdateras

Uppdatera dokumentet när:

- ett nytt signallager tillkommer
- ett lager byter ansvar eller input/output
- briefen börjar påverka scaffoldval direkt
- capability-/contract-/route-planlogiken ändras materiellt
