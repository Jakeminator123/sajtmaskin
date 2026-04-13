# Testrapport: E-handels-generering 2026-04-13

Prompt: "Bygg en webshop för ett svenskt kafferosteri. Produktkatalog med filtreringsmöjligheter, kundvagn, och en snygg hero med rosteri-känsla. Mörkt tema."

Modell: gpt-5.4 (max-tier), Thinking: av, Bildgenerering: på, Scaffold: ecommerce

## Template Guidance (v1 + v1.5) — fungerade

- `templateGuidanceEnabled: true`
- `scaffoldId: "ecommerce"`
- Rerankade IDs: `ecommerce-your-next-store-commerce-with-next-js-and-stripe`, `ecommerce-whop-saas-template`
- Guidance injicerades i `## Scaffold Research Priorities` i systemprompten
- Ingen `selectedFiles`/excerpt-läcka
- Prompt dump bekräftar att reranking valde baserat på prompt-matchning (inte blint de 2 första)

## Sessionens tre generationsloggar

Alla tillhör samma chatt (`bb0ccffa`), samma version (`677dbb3c`):

| # | Logg-ID | Typ | Tid | Vad som hände |
|---|---------|-----|-----|---------------|
| 1 | `013830-freeform` | create (init) | 23:38 | Orkestreringsstart. Template guidance aktiverades. Contract gate upptäckte Stripe + SQLite → tom output (`done_empty_output`). Väntade på användarens svar. |
| 2 | `014203-freeform` | followUp | 23:42 | Användaren svarade. Full kodgenerering (235s output, 269s total). 12 filer. 72 autofix, 1 syntaxfel → LLM-fix. Version skapades. |
| 3 | `014924-freeform` | followUp | 23:49 | Server-verify/repair-pass. Typecheck-fel → LLM-fixer genererade 2 reparerade filer (54s). Samma version uppdaterades. |

Alltså INTE två separata sajter — en sajt i tre pass: contract gate → kodgenerering → repair.

## Vad som gick fel i genereringen

### 1. Contract gate blockerade init (befintligt beteende)

Prompten triggar Stripe + SQLite + 2 integrations-signaler. Systemet ställer en klargörande fråga
innan det genererar kod. Genereringen stannar tills användaren svarar.

Trolig orsak: `inferPreGenerationContracts` i `pre-generation-contracts.ts` är aggressiv på
e-handels-prompter — även "bara en webshop med kundvagn" tolkas som "needs payment + database".

Konsekvens: init-körningen hade `generationKind: "create"` men LLM:en producerade tomt svar.
När användaren svarade blev nästa körning `generationKind: "followUp"`, vilket betyder att
template guidance (som är init-only) troligen inte injicerades i den faktiska kodgenereringen.
Guidance fanns i prompt-dumpen från init-orkestreringen (23:38:32) men follow-up-körningen
(23:42:03) kan ha kört utan den.

OBS: detta är en viktig insikt — contract gate kan i praktiken "äta upp" init-banan och tvinga
kodgenereringen att köras som follow-up, vilket gör att init-only features (som template guidance)
missas. Bör undersökas.

### 2. 72 mekaniska autofix-reparationer (heavy load)

LLM:en producerade ovanligt många importfel. 38 av 72 fixar var saknade imports (`Link`, `Image`,
`Button`, `Badge` etc.). 4 var saknade `export default`.

Trolig orsak: modellen (gpt-5.4 / max-tier) genererade stora mängder kod (261L page.tsx, 180L
store-data.ts, 108L product-filters.tsx) utan att hålla reda på import-deklarationer. Inte
nödvändigtvis relaterat till template guidance — detta är ett generellt import-disciplin-problem.

### 3. Cart-provider-kedjan (cross-file dependency) — huvudproblem

LLM:en skapade `useCart()`-hook och `StoreProduct`-typ som används i 4 filer
men aldrig importeras korrekt:

- `components/add-to-cart-button.tsx` → `useCart()` saknas
- `components/cart-summary.tsx` → `useCart()` saknas
- `components/cart-page-client.tsx` → `useCart()` saknas
- `components/cart-provider.tsx` → `StoreProduct` saknas + `CartContextValue` dubbel-deklaration

Dessutom: `CartDrawer` (i `site-header.tsx` → `layout.tsx`) anropar `useCart()`, men
`CartProvider` wrappas aldrig runt appen i `layout.tsx`. LLM:en skapade cart-provider-hooken
och cart-drawer-komponenten men glömde att lägga `<CartProvider>` runt `{children}` i root layout.

Verifier hittade 7 blockerande signaler (pass 1), kvar 4 efter repair (pass 2).

Vid lokal körning (`npm run dev` på den exporterade koden) kraschade sidan direkt med:
`Error: useCart must be used within CartProvider` på GET / (500).

### 4. Thinking var av — trolig rotorsak till cross-file-inkonsistenser

Agentloggen visar `Thinking: av` trots att `.env.local` har `SAJTMASKIN_DEFAULT_THINKING=true`.
Möjlig orsak: klienten (builder-UI) skickade explicit `thinking: false` som override, eller att
follow-up-banan tvingade av thinking.

Utan thinking genererar modellen filer sekventiellt utan att planera cross-file-beroenden i förväg.
Med thinking hade modellen troligen resonnerat:
- "Jag skapar CartProvider-context → den måste wrappas i layout.tsx"
- "Alla cart-konsumenter måste importera useCart från rätt path"
- "layout.tsx behöver <CartProvider> runt {children}"

Det handlar alltså inte om tokengräns utan om att modellen utan reasoning saknar ett
planeringssteg för cross-file-dependencies.

Token-användning rapporterades som `null` i loggen — API:et returnerade inte token-counts.
Output-tid var 235s (nästan 4 minuter), vilket tyder på en stor generation.

Rekommendation: undersök om thinking borde vara default-on för ecommerce-scaffold eller för
prompter med hög `contextPolicy` ("heavy"). Alternativt: tvinga thinking vid create-chat init.

### 5. Dynamisk route `product/id` istället för `product/[id]`

LLM:en skapade `app/product/id/page.tsx` (literal path) istället för `app/product/[id]/page.tsx`
(dynamisk App Router-parameter). Verifier flaggade detta som kvalitetssignal Q1.

Trolig orsak: scaffoldens ecommerce-filer har `app/product/[id]/page.tsx` med brackets, men
LLM:en ignorerade detta. Systempromptens `## Route Plan` nämner rätt path men LLM:en följde
inte det.

### 6. Vit preview (typecheck-fel blockerade Next.js build)

25+ TypeScript-fel i VM:en (product possibly undefined, saknade imports). Quality gate passerade
inte → Next.js kunde inte bygga → vit iframe.

Server-verify-lane körde i 75s, hittade typecheck-failure (exit 2), triggar LLM-repair-pass.
Repair-passet reparerade 2 filer men 4 blockerande verifier-signaler kvarstod (B1–B4).

### 7. Next.js vulnerability i exporterad package.json

Den genererade `package.json` pinnade `next` till `16.2.1` som har en känd high-severity
DoS-sårbarhet (GHSA-q4gf-8mx6-v5v3). `npm audit fix` utan `--force` kunde inte lösa det
eftersom `16.2.1` tillåts av `^16.2.0` men fixversionen `16.2.3` ligger utanför den strikta
pin:en. Med `--force` installerades 16.2.3 och 0 vulnerabilities.

## Problem som INTE berodde på template guidance

Alla ovanstående. Template guidance injicerade bara kompakt runtimeGuidance-text (style rules,
section inventory, avoid patterns, quality rubric) i ett befintligt promptblock. Inga imports,
ingen kodinjektion, ingen dependency-påverkan.

Dock: contract gate kan ha gjort att template guidance (init-only) aldrig nådde den faktiska
kodgenereringen som kördes som follow-up. Se punkt 1.

## Pre-existerande problem (noterade under sessionen)

1. **Contract gate UX** — frågan blockerar genereringen och kan förvirra användaren.
   Behöver också undersökas om den "äter upp" init-banan för init-only features.
2. **`ENV_VAR_ENCRYPTION_KEY`** — saknas i `.env.local`, blockerar env-var-sparning i
   projektpanelen. Felmeddelande: "ENV_VAR_ENCRYPTION_KEY must be configured before saving
   sensitive project env vars." + 500-error vid POST till `/api/v0/projects/.../env-vars`.
3. **WSS/HMR till Fly** — WebSocket-proxy till `vm-fly-jakem.fly.dev/_next/webpack-hmr` tappar
   connection. Felmeddelande: "WebSocket connection to 'wss://vm-fly-jakem.fly.dev/...' failed".
4. **Hydration error overlay** — Next.js dev mode visar hydration-varning på landningssidan
   som blockerar UI-klick.
5. **`rocket-logo.webp` preload-varning** — preloadad bild som inte används snabbt nog.
6. **Next.js 16.2.0–16.2.2 vulnerability** — GHSA-q4gf-8mx6-v5v3 (DoS med Server Components).

## Fullständig tidslinje

```
23:38:30  Init-orkestrering startar. Template guidance ON. Ecommerce scaffold vald.
23:38:32  Prompt dump: templateGuidanceEnabled=true, IDs: Your Next Store + Whop SaaS.
23:38:32  Contract gate: Stripe + SQLite + 2 integrations detekterade.
23:38:33  Chat skapad (bb0ccffa). Contracts.inferred loggas.
23:38:37  Tom output (done_empty_output). Systemet väntar på användarens svar.
23:42:03  Användaren svarade "kör på" → follow-up generering startar.
          Ny orkestrering: dataMode=none (contracts nedgraderade efter svaret).
23:46:01  235s output klar. 12 filer genererade.
23:46:05  72 mekaniska fixar (heavy load). 38 saknade imports, 4 saknade export default.
23:46:05  Syntaxvalidering: 1 fel i app/category/slug/page.tsx (oväntad }).
23:46:05  Mekanisk residual: 1 fel kvar → eskaleras till LLM-fixer.
23:46:17  LLM-fixer (gpt-5.3-codex): 1→0 fel. Syntaxfelet löst.
23:46:19  Bildmaterialisering.
23:46:30  Verifier: 7 blockerande (saknade imports, cart-kedja) + 2 kvalitet (route, params).
23:46:30  2 deterministiska filreparationer.
23:46:31  Version 677dbb3c skapad. Preview startar.
23:46:34  Preview status: running. Men vit skärm (typecheck-fel i VM).
23:46:44  Server-verify startar (typecheck-lane).
23:47:58  Typecheck failade (exit 2, 25+ TS-fel). quality-gate passerade inte.
23:49:24  LLM-repair triggas. 2 filer repareras (page.tsx, add-to-cart-button.tsx).
23:50:11  6 nya autofix efter repair. CartContextValue-konflikt löst + imports tillagda.
23:50:16  Verifier: 4 blockerande kvar (useCart saknas i 2 filer, CartContextValue-konflikt,
          StoreProduct saknas i cart-provider).
23:50:17  Version uppdaterad. Preview fortfarande vit.

Lokal körning av exporterad kod:
- npm install: 586 paket, 1 high severity vulnerability (next 16.2.1)
- npm audit fix --force: next 16.2.1 → 16.2.3, 0 vulnerabilities
- npm run dev: Error: useCart must be used within CartProvider (GET / 500)
  CartDrawer i site-header.tsx anropar useCart() men CartProvider saknas i layout.tsx
```

## Rekommenderade åtgärder (prioritetsordning)

1. ~~Uppdatera Next.js-pin i scaffold baseline-deps till `16.2.3` (säkerhet)~~ — ÅTGÄRDAT i
   `src/lib/gen/export/project-scaffold.ts` + alla berörda tester. Next 16.2.1 → 16.2.3,
   eslint-config-next 16.2.1 → 16.2.3. Fixar GHSA-q4gf-8mx6-v5v3 (DoS med Server Components).
2. Undersök om contract gate "äter" init-banan → init-only features (template guidance)
   kan missas när kodgenereringen körs som follow-up efter att användaren svarat.
3. Stärk import-disciplin i systemprompt (saknade imports är #1-felet, 38 av 72).
4. Undersök thinking-routing: varför var thinking av trots `SAJTMASKIN_DEFAULT_THINKING=true`?
   Överväg att tvinga thinking vid create-chat init eller vid ecommerce/heavy context.
5. Sätt `ENV_VAR_ENCRYPTION_KEY` i `.env.local` (behövs för projektpanelens env-sparning).
6. Undersök cart-provider cross-file-kedjan — kanske autofix kan lära sig `useCart`-mönstret,
   eller systemprompt kan betona "wrap Context providers in root layout" tydligare.
7. Överväg att mjuka contract gate för enklare e-handels-prompter (mockdata/demo borde inte
   blockera genereringen med integration-frågor).
