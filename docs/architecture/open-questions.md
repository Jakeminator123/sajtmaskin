# Open questions — assumptions we haven't fully verified

Levande dokument för **antaganden** vi gör i koden eller pratet om systemet, men som vi **inte säkert vet stämmer**. Inte buggar — frågetecken som behöver svar innan de blir antingen "verified" eller "fixed".

**Princip:** Säg inte bara "det buggar". Förstå **varför**. Om vi inte vet — det hör hemma här.

> Skapad: 2026-04-23 efter master-post-cleanup wave 1–4 + DB-pool-fyndet.  
> Senast uppdaterad: 2026-04-24 efter Wave 5 verify Run A + Run B + 4 hot-fixes.

## Verifierat / fixat 2026-04-24 (Wave 5 verify + hot-fixes)

- ✅ **#1 Redis** — verifierat fungera (Redis cache hit i loggar för `pWxuGXN_pRJS61wCBtF3k`).
- ✅ **Lansering truth mismatch** (top-bar "Redo att publicera" + version-history "Repairing"): `buildLifecycleBlocker` saknade `repairing`-grenen. Fixad.
- ✅ **Init-prompt friction** (Plan 01): `useBuilderPageController` auto-startade bara `kostnadsfri`-flödet. Utökade till `freeform` också. Skicka 1 gång räcker nu.
- ✅ **Server-repair "Kvarvarande fel: 0" är förvirrande:** Det är esbuild-syntax-counter, inte tsc. Lade till `remainingErrorsSource` + `syntaxCleanGateFailed` i meta + tydligare meddelande i UI.
- ✅ **Backoffice overview.py CONFIG_NAV_PAGES out-of-sync:** "Research & Dossiers"/"Pipeline" → riktiga sidnamn.

## Nya frågor / buggar 2026-04-24

- ⚠️ **A. Bildmatchning för svensk "gymnastik":** LLM/bildmaterialiseraren tolkar "gymnastiklokal" som amerikanskt gym (weightlifting), inte barngymnastik/akrobatik/trampolin. Hero på Trampolin Studio fick en man med skivstång. Bör adresseras i bildprompt-strategi eller scaffold-hint.
- ⚠️ **B. Repair-LLM returnerar partial files (samma klass som "ButtonProps"):** site-header.tsx hade saknad `}` efter LLM-pass. `runLlmFixer` validerar `parseCodeProject().files.length > 0` men inte att varje fil är komplett (balanced braces / no truncation). Förslag: lägg till complete-files-check i `runLlmFixer` (se Wave5-audit för detaljer).
- ⚠️ **C. Hydration error i Sajtmaskin-skalet** (preexisting, ej från genererad sajt). Synlig i Next.js dev-overlay som "1 Issue".
- ⚠️ **D. Streamlit-backoffice out-of-sync med Plan 11/12:** Saknar info om scaffold-required-files, variant-lock, `history.ndjson`-fält. Operatörsverktyg uppdateras inte automatiskt när TS-koden ändras.
- ⚠️ **E. Strikta zod-schemas saknas:** `createChatSchema`/`sendMessageSchema` strippar okända fält tyst. `meta` är `.passthrough()`. Lossy ytor (5 schemas att strikta först — se Wave5-audit för lista).

## Nya frågor / buggar 2026-04-26

- ⚠️ **F. Versionless restart lineage:** P0-fix för stream-abort UX (commit `7855116b9`) navigerar användaren till `/builder?restartedFrom=<chatId>` när chatten är versionless + aborted. Query-parametern plockas **inte** upp av `deriveBuilderEntryState` idag — `restartedFromChatId` stämplas alltså inte på den nya chatten. UX:en är räddad (användaren kommer till en ren start-yta), men telemetrin/lineage-grafen mellan döda och nya chats finns inte. Wiring kräver: (1) läs `restartedFrom` i `builder-entry.ts`, (2) skicka som `restartedFromChatId` i create-chat-payload, (3) persistera i `engine_chats`-raden, (4) emittera i orchestration-telemetrin. Out of scope för P0-fix:en.

---

## Statusguide

| Symbol | Betydelse |
|---|---|
| ❓ | Vi vet inte om antagandet håller |
| 🟡 | Delvis verifierat, en bit kvar |
| ✅ | Verifierat — flytta till relevant arkitekturdoc och ta bort härifrån |
| ❌ | Antagandet visade sig falskt — fix landad eller plan finns |

---

## Aktiva frågor

### 1. ❌ Redis cache — vet vi ens om den körs?

**Antagande:** `useRedisCache` styr brief-cache + rate-limit + preview-session-store. Vi var osäkra på om den var no-op:ad i dev.

**Verifierat 2026-04-23 (chatId `b71dafb3`):** Redis körs aktivt mot Upstash. Lazy-init när någon route faktiskt behöver den (inte vid server-boot).

```
01:20:41.727 [DB] [Redis] Creating client { host: 'alert-silkworm-17000.upstash.io', port: 6379, ... }
01:20:41.826 [DB] [Redis] Connected
01:20:42.237 [DB] [Redis] Ready
```

**Konfiguration:** `REDIS_URL` (eller `UPSTASH_REDIS_REST_URL`) finns i `.env.local`. Tidigare antagande "Redis off i dev" var felaktigt — andra agentens diagnos byggde på en gammal session.

**Sekundärbugg fortfarande:** brief-cache-hits skriver fail till `_unrouted/brief-cache-hit/timeline.ndjson` (ENOENT — directory existerar inte). Cachen FUNGERAR men telemetri-loggen failar tyst:
```
[generationslogg] writeGenerationLogEntry failed: ENOENT ... \brief-cache-hit\timeline.ndjson
```
→ Plan 10-fynd (observatory writer ska mkdir innan write).

---

### 2. ❓ Preview-host VM — Blitz-container i browsern? (HÅLLS AKTIV)

**Antagande:** "Vi har en Blitz-container där VM:en körs i användarens browser."

**Verifierat 2026-04-23:** Nuvarande implementation är **fly.io-VM** (`vm-fly-jakem.fly.dev/<chatId>`), inte browser-side container. Användaren har explicit tydliggjort att browser-side execution (WebContainers / StackBlitz / Bolt-stil) är ett **långsiktigt mål** som vi vill kunna integrera efter wave 5.

**Designmål användaren vill ha:**
- Användaren kan se sin genererade sajt köra i sin egen browser-tab utan fly.io-mellanled
- Snabbare iteration (ingen VM-cold-start)
- Lägre infrastruktur-kostnad
- Enklare offline-utveckling

**Tekniska kandidater:**
- WebContainers (StackBlitz tech) — Node.js i browser via WASM
- Bolt-stil sandbox-iframe med pre-built bundles
- esbuild WASM in-browser bundling

**Hur integrera utan att bryta nuvarande:**
1. Behåll fly.io som default-fallback
2. Feature-flag `SAJTMASKIN_PREVIEW_PROVIDER=webcontainer` för att opta in
3. Båda providers implementerar samma `PreviewHostClient`-interface

**Plan-koppling:** **Nytt projekt efter wave 5.** Inte plan 10/11/12-scope. Värd egen design-doc + spike. Användaren vill hålla spåret öppet — INTE arkivera frågan när wave 5 är klar.

---

### 3. ❌ HMR-läcka i pg.Pool (RESOLVED 2026-04-23)

**Antagande:** "Dev-servern är stabil under långa sessioner."

**Verifierat falskt.** Andra agenten diagnostiserade: `new Pool(...)` på modul-load i `src/lib/db/client.ts` re-evaluerades varje Fast Refresh → 5–10 HMR-cykler senare smällde Supabase pgbouncer (free tier ~15 sessions) med `EMAXCONNSESSION` → 500 från `/api/engine/chats/[chatId]` → klient tolkade som 404 → "Försök reparera sidan" / "Chat not found".

**Fix landad:** commit `9f6e36475` — globalThis-cache (Prisma-pattern) i `db/client.ts`.

**Föregående fix för prod-vägen:** commit `3a4decf0` (2026-04-20). Dev-vägen var oguardad innan idag.

**Kvar:** Plan 11/12-kandidat — diskriminera 503 (transient) vs 404 (chat finns inte) i `/api/engine/chats/[chatId]`-routes så klienten inte fall-tillbaka till "ny chatt"-state vid pool-blowout.

---

### 4. 🟡 Observatorie-routing-läckage (orchestration-styledirection-bucket)

**Antagande:** Per-run-mappen i `logs/generationslogg/` innehåller all data om en specifik körning.

**Verifierat delvis falskt.** Run A (chat `1fa58609`, 2026-04-23 ~00:31) och flera tidigare runs har hela sin trace i `_unrouted/orchestration-styledirection/`-bucket istället för per-run-mapp. 846 KB av events utan runId-association.

**Konsekvens:** Per-run-summarier är **ofullständiga**. Latens-statistik är opålitlig. Plan 02:s modal-truth kan ha rätt men vi kan inte verifiera det åt enskilda runs eftersom datan saknas.

**Plan-koppling:** STATUS-10-CANDIDATES.md har detta som Tier B medel-impact, men efter Run A-buggen där en **bruten generation** skedde utan trace bör det uppgraderas till **Tier A high-impact** för plan 10.

---

### 5. ❌ Scaffolds — saknar enhetligt minimi-fil-kontrakt (REPRODUCERBAR BUGG)

**Antagande:** Scaffold-kontrakt garanterar att deklarerade filer landar i final version.

**Verifierat falskt — REPRODUCERBAR i 2 av 2 init-runs.**

| Run | chatId | scaffoldVariant | page.tsx genererad? | site-footer.tsx? |
|---|---|---|---|---|
| A | `1fa58609` | `editorial-lux` | ❌ NEJ | ✅ Ja |
| B (denna) | `b71dafb3` | `corporate-grid` | ❌ NEJ | ❌ NEJ |

Variant spelar ingen roll. **Systematisk generation-quality-bugg.** LLM:n returnerar inte alltid alla scaffold-filer i sin CodeProject-output, och merge-pipelinen tappar bort dem tyst.

**Specifik skada:** Sajten "promotas" grön men är helt tom (`<main>` är 936 tecken skal-wrapper, 0 sektioner, 0 headings, 0 images). Cross-file-import-checker fångar inte detta för `page.tsx` är auto-discovered av Next.js, inte importerad.

**Vad som behövs:**
- **Scaffold-required-files-check** som validerar "om scaffold deklarerar `app/page.tsx` (och liknande core-routes) så MÅSTE final version ha den med non-trivial content"
- Lägg som blocking-finding i `runFinalizePreflightAll()` (efter plan-05:s konsolidering)
- Enhetligt fil-kontrakt mellan alla 9 scaffolds (per användarens önskemål)

**Plan-koppling:** **HIGH-PRIO för plan 11 (unified repair)** eller egen ny plan. Detta är den enskilda största user-impact-buggen vi hittat.

---

### 7. ❓ `THREE.WebGLRenderer: Context Lost` — IDE-noise eller riktig bugg?

**Antagande:** Det här kommer från Cursor IDE:s egen WebGL-inspektor, inte din genererade sajt.

**Vad vi vet:** Det dyker upp **innan** användaren ens skrivit en 3D-prompt (Run 1, Run A i smoke). Om det vore i previewn skulle det krävt 3D-content.

**Vad vi inte vet:** Är det 100% säkert IDE-noise? Eller kan något i builder-UI:t (preview-iframe-overlay?) ha en webgl-context som tappas vid tab-switch?

**Hur verifiera:** Kör smoke i en vanlig browser (utanför Cursor IDE) och se om varningen försvinner.

---

### 8. ❌ scaffoldVariant lockas inte mellan init och follow-up

**Antagande:** När en follow-up körs på en chat med befintlig version ska systemet låsa till samma `scaffoldVariant` som init valde, så sajten inte byter utseende mellan användarens prompts.

**Verifierat falskt 2026-04-23 (chat `b71dafb3`):** Init valde `corporate-grid`. Follow-up försökte locka och gav upp:

```
[scaffold-variant] variant_lock_skip {
  reason: 'missing_prior_variant_id',
  scaffoldId: 'landing-page',
  priorVariantId: null,
  intent: 'neutral'
}
```

Sedan valde follow-up `warm-local` istället. Sajten har därmed olika look mellan v1 och v2, även för en trivial "lägg till mer innehåll"-prompt.

**Sannolik rotsorsak (samma kod-område som page.tsx-loss):** `resolveOrchestrationBase` (eller `engine_versions`-persistens) sparar inte `scaffoldVariantId` på versionen. Vid follow-up läses `priorVariantId: null` från base.

**Konfirmerade variants:** `corporate-grid`, `warm-local`, `editorial-lux`, `bold-startup`, `minimalist-mag` — minst 5 finns i `src/lib/gen/scaffold-variants/`. Variant-systemet är inte trasigt; bara persistensen.

**Plan-koppling:** **Lägg till i investigation-agentens scope** OCH plan 11. Är troligen samma fix som page.tsx-loss eftersom båda bor i samma persistens-/merge-kedja.

---

### 9. 🟡 CSP frame-src violation — iframe med tom src

**Loggrad (server):** `[csp-report] directive=frame-src blocked= doc=http://localhost:3000/builder?chatId=b71dafb3...`

**Browser-rapport:** `Framing '' violates the following report-only Content Security Policy directive: "frame-src 'self' *.vusercontent.net *.vercel.run *.vercel.app https://vm-fly-jakem.fly.dev https://fly.dev https://*.fly.dev"`

**Tolkning:** Källan är **tom string `''`** — något försöker montera en `<iframe>` med:
- tom `src=""` (browser tolkar som "ladda current URL" → rekursiv frame)
- `src="about:blank"` (utan `'self'` mot blank-källa)
- en `javascript:` URL (sällan)

CSP är `report-only` så det loggas men blockas inte. Latent bugg: om CSP byter till enforcing-mode kommer detta att blockera den iframen.

**Prod-logg-hygien 2026-04-30:** `/api/csp-report` filtrerar nu report-only `script-src`/`blocked-uri: eval`-brus i produktion. Övriga CSP-rapporter loggas fortsatt med sammanfattning. Detta är inte samma sak som att tillåta `'unsafe-eval'` i enforcing-läge.

**Troliga kandidater:**
- Hidden `<iframe>` för clipboard/print/download i builder-UI
- Element-inspector mount-point (har sett relaterade buggar tidigare)
- Vercel speed-insights / web-analytics widget injection

**Hur verifiera:** Sök i `src/components/builder/**` efter `<iframe`-användning utan src-attribute eller med `src=""`. Eller sätt CSP till enforcing temporärt och se vilken UI-komponent som breaker.

**Plan-koppling:** Inte plan 11/12-scope. Värd egen 30-min-task för en framtida UI-cleanup-pass.

---

### 12. ❌ Follow-up modifierar inte existing capability-output (re-injicerar istället)

**Antagande:** En follow-up som "gör pricken till en kaffekopp" ska modifiera existing 3D-scen-fil (`floating-coffee-overlay.tsx`), inte skapa parallella filer.

**Verifierat falskt 2026-04-24 (chat `b71dafb3`, v3 efter kaffekopp-prompten):**

| Förväntat | Faktiskt |
|---|---|
| `floating-coffee-overlay.tsx` modifieras till kaffekopp + pour-animation | Filen orörd — gamla bubblan kvar |
| LLM lägger `onPointerEnter` + `useFrame` för pour-animation | 0 träffar i live HTML |
| `mug` / `coffee-cup` / `pour` i koden | 0 träffar |
| 1 fil ändrad | 2 NYA filer skapade (`three-canvas-shell.tsx` + `canvas-error-boundary.tsx`) |

**Symptom:** Plan 06:s capability-classifier triggade `capability-add` (för "3D" finns i prompten). Plan 07:s injection-väg aktiverades och re-injicerade dossier-shell + error-boundary istället för att modifiera existing scene-file.

**Trolig rotsorsak:**
- Follow-up-systempromptens "Current File Contents"-sektion inkluderar troligen inte `floating-coffee-overlay.tsx` (eller LLM ignorerar den)
- Det finns ingen "capability-modify-existing"-väg i plan 06/07. Bara `capability-add` (= injicera) eller `capability-refresh` (= ny generation)
- LLM tolkar "gör pricken till X" som "skapa X" istället för "modifiera existing scen att vara X"

**Vad som behövs:**
- Plan 06: identifiera när follow-up-prompt refererar EXISTING capability-output (`pricken`, `bubblan`, `den`) → markera som `capability-modify`, inte `capability-add`
- Plan 07: när `capability-modify` triggas, INTE re-injicera dossier; istället peka LLM till existing scen-fil + uppmuntra modify
- Eller: i system-prompt för follow-ups ALLTID inkludera capability-output-filer från base-version (även om delta är liten)

**Plan-koppling:** **Plan 11/12-prio.** Adderar till investigation-agentens fyndlista som related issue (samma kod-område — `OrchestrationBase` saknar "modify-existing"-signal).

---

### 11. 🟡 Inspector låser sidans scroll — kan bara markera top-of-page

**Antagande:** Plan 02 fixade inspector-buggen (scroll-to-top vid aktivering).

**Verifierat 2026-04-24:** Plan 02:s fix funkar (no scroll-reset). Men en **sekundär bugg** har avslöjats:

- När inspektera-läget är aktivt går det **inte att scrolla sidan** (varken med wheel, page-down, eller drag)
- Inspector-worker markerar block med tooltip (t.ex. `<p> "12+" .text-2xl.font-semibold`) på hover — fungerar ✅
- **Men:** eftersom scroll är blockerad kan användaren bara markera element som syns i initial viewport
- Element längre ner på sidan är otillgängliga

**Trolig rotsorsak:** Inspector-overlayens `<div>` har troligen `overflow: hidden` eller intercepterar scroll-events utan att proxa dem vidare till underliggande iframe-content. Eller body får `overflow: hidden` när inspector aktiveras.

**Filer att kolla:** `src/components/builder/preview-panel/PreviewPanel.tsx` (plan 02 rörde denna), `src/components/builder/preview-panel/hooks/usePreviewPanelInspectMapPlacement.ts` (plan 02 rörde denna), eventuellt globala body-style-mutationer.

**Plan-koppling:** Inte plan 11/12-scope (de är specifika fixes från investigation). Värd egen 30-min-task — kan slås ihop med open-question #9 (CSP frame-src) som båda rör inspector/iframe-interaktion.

---

### 10. ✅ Dossier-injection-mönstret för `visual-3d` — VERIFIED end-to-end

**Antagande:** Capability-detection → dossier-selektion → injection → LLM-scen-overlay → mount fungerar för 3D-prompts.

**Verifierat 2026-04-24 (chat `b71dafb3`):** End-to-end-flödet bekräftat. Pattern dokumenterat här för framtida agent-referens.

**Prompt:** `"lägg till en 3D-figur som svävar ovanpå hela sidan när man scrollar"`

**Pipeline-trace:**

| Steg | Komponent | Beslut |
|---|---|---|
| 1 | `detectFollowUpCapabilities()` (`src/lib/builder/follow-up-capability-detection.ts`, plan 06) | Vokabulär-match: `3D` → `visual-3d`. Beteende-markörer: `svävar`, `scrollar`. |
| 2 | Tier-resolver | tier = `specific` (> 8 ord + beteende-markörer, men inga beyond-markörer som `physics`/`@react-three/rapier`). |
| 3 | `classifyFollowUpIntent()` (`src/lib/providers/own-engine/follow-up-clarification.ts`, plan 06) | `followUpIntent: capability-add` (inte `neutral`). UI visar `Capabilities: Motion, 3D, Physics`. |
| 4 | `selectDossiersForRequest()` (`src/lib/gen/dossiers/select.ts`) | `visual-3d` → returnerade `three-fiber-canvas` (har `defaultForCapability: true`). |
| 5 | System-prompt-builder (`src/lib/gen/system-prompt/sections/dossiers.ts`) | Injicerade `manifest.json`-summary + hela `instructions.md` + dossier-shell-fil. |
| 6 | LLM (gpt-5.3-codex) | Genererade `floating-coffee-overlay.tsx` (62L) som monterar `<ThreeCanvasShell>`-shellen från dossiern. |
| 7 | finalize-merge | Inkluderade `three-canvas-stage.tsx` (27L) från dossier + LLM:s `floating-coffee-overlay.tsx` + modifierad `layout.tsx` (91L) med global mount. |
| 8 | `dep-completer` (plan 07, `src/lib/gen/autofix/dep-completer.ts`) | Lade `three: ^0.176`, `@react-three/fiber: ^9`, `@react-three/drei: ^10` i `package.json` — deterministiskt baserat på `visual-3d` i `requestedCapabilities`. |
| 9 | Preview-host VM | Renderade animerad 3D-bubbla globalt. ✅ |

**Stress-test-kandidater (nästa runda för verification):**
- Modifiera existing 3D-fil: `gör pricken till en 3D-kaffekopp som häller kaffe ner i en mugg när jag nuddar den med musen` → tier `specific` förväntas
- Beyond-dossier: `gör pricken till en 3D-kaffekopp med physics — den ska studsa när jag knuffar den med musen` → tier `beyond-dossier` förväntas (physics-marker)

---

### 16. 🚀 KRAFTIG FÖRBÄTTRING: capability-system saknar `game`/`interactive`-tier

**Användar-observation 2026-04-24:** Genererade en TV-spelshemsida med pacman-spel på tredje sidan. Spelets visuella delar renderar (canvas, board, sprites) → F2 OK. Men **spelet går inte att spela** — game-loop, keyboard-handlers, collision-detection saknas i koden. F2-modal säger "fungerar" eftersom sidan visuellt bootar.

**Rotsorsak:** Capability-systemet täcker:
- `visual-3d` (three-fiber)
- `payments`, `auth`, `analytics`, `error-tracking` (hard-integrations)
- `carousel`, `faq-section`, `pricing-section`, `parallax`, `marquee` (soft UI-pattern)

Men INGET för **interaktiv state-management + input-loops:**
- spel (pacman, snake, breakout, chess)
- whiteboard / paint / drawing-canvas
- realtime-collaboration UI
- multi-step animationer styrda av användarinput

**Förslag — ny capability + dossier:**
- Capability: `game` eller `interactive-canvas`
- Soft dossier: `interactive-canvas-shell` med pre-built `useGameLoop()` + `useKeyboardInput()` + `useCollision()`-hooks
- LLM-instruktion: "om capability `game` triggas, MÅSTE du implementera game-loop med `useFrame`/`useEffect` + state + input-handlers, INTE bara visuell board"

**Signifikans:** **HÖG.** Detta är ny capability-class som öppnar en helt ny site-typ för Sajtmaskin (interaktiva sajter, inte bara marketing/SaaS). Värd egen plan EFTER wave 5.

**Plan-koppling:** **Kan möjligen ersätta delar av plan 12** (om PromptKit-scope reduceras). Annars egen ny plan.

---

### 17. 💡 UX-design: inline integrations-manual när användaren mountar dossier-komponent

**Användar-design 2026-04-24 (utomordentligt insiktsfullt):**

> "Om jag genererar en sajt och vill ha Stripe för att ta betalt för mina cd-skivor, ska jag kunna få den produktionsklar genom att trycka på 'bygg nu'... När jag trycker på Stripe-betalningsmodalen ska det komma upp en liten text. Om det inte finns ett bättre flöde i planerna, där det står: 'Vad kul, du vill integrera Stripe. Här följer en manual. Gå till www.stripe.com/dev'... Den sista fasen med alla integrationer kan jag ta nästan sist innan jag är klar med hela projektet."

**Förslag — onboarding-tooltip per dossier-komponent:**
- När användaren klickar på en mountad hard-dossier-komponent (CheckoutButton, ChatPanel, NewsletterForm, etc) i preview/inspector → visa tooltip/popover med integrations-manual
- Innehåll: "Du har lagt till {dossier.label}. För att gå live behöver du: {dossier.envVars}. [Skapa konto på {provider}](url) → kopiera nyckeln hit"
- Gör det till en **graceful degradation** istället för en gate: F2 fungerar utan secrets (med banners/disabled-states i komponenten), F3 är när du fyllt i

**Existerar delvis:** Hard-dossiers har `envVars[].purpose` med beskrivande text. Men UI ytar bara secrets-prompten på F3-knappen, inte inline på själva komponenten.

**Nytt UI-mönster:** På hover/klick på dossier-komponent i inspector-läge → popover med:
- Dossier-label + summary
- Lista med env-vars + purpose (varför, var hitta)
- Länk till provider-onboarding
- "Aktivera när jag är klar"-knapp som markerar dossiern som ready-when-deploy

**Plan-koppling:** Inte plan 11/12-scope. Egen post-wave-5 design-plan ("integrations-onboarding-flow").

---

### 15. ❌ Hard-dossier env-vars false-promptas trots att deps saknas — 2 callsites

**Verifierat 2026-04-24 (chat `b71dafb3`, två separata symptomer):**

**Symptom A — "Bygg integrationer"-knapp (UI):** Prompade om STRIPE_SECRET_KEY trots att Live VM HTML har 0 träffar på `stripe`/`checkout`/`payment`.

**Symptom B — `POST /api/.../finalize-design` returnerar 412:**
```
"Tunga integrationer kräver riktiga env-variabler innan F3 kan köras."
missingByIntegration: [{key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"]}]
requirements: [{key: "algolia", name: "Algolia", requiredRealEnvKeys: []}]
```
Live VM HTML har **0 träffar** på `clerk`, `algolia`, `sign-in`, `sign-up`, `search-index`. Sajten har INTE Clerk eller Algolia installerat. F3-gate vägrar promote pga falskt missing-env-fynd.

**Bekräftad rotsorsak:** Båda callsites (build-integrations-knapp + `finalize-design`-endpoint) använder samma resolver som listar env-vars för **alla hard-dossiers i registrn** (10 st: stripe, clerk, sentry, openai, resend, mailchimp, plausible, vercel-analytics + ai-chat). De skannar inte versionens faktiska `package.json`-deps eller fil-imports.

`PreviewPanelF3Trigger.tsx:79` är den UI-callsite som triggar 412-flödet.

**Korrekt beteende:** Skanna versionens `package.json` + fil-imports för dossier-fingerprints (`stripe`, `@clerk/nextjs`, `@sentry/nextjs`, `algoliasearch`, etc) → bara prompta för env-vars för de dossiers som faktiskt finns i koden. Eller: skanna `requestedCapabilities` på orchestration-base som plan 06 producerar.

**Severity:** **HIGH** — det här blockerar F3-promotion för 99% av sajter (de flesta använder bara 0-2 hard-dossiers, men gate begär secrets för 10).

**Plan-koppling:** **Plan 12-prio** (PromptKit reducerad — istället: dossier-requirement-resolver-fix). Eller egen "post-wave-5 high-prio fix".

---

### 14. ❌ Slug-route bouncer hem efter 1-2 sek — VERIFIERAT MEKANISM

**Verifierat 2026-04-24 (chat `b71dafb3`, version `1b235ac4`, slug `/afrikanska-bonor`):**

| Steg | Vad händer |
|---|---|
| 1 | User klickar `/afrikanska-bonor`-länk |
| 2 | Server returnerar **200, 52 KB HTML** med Suspense fallback `"Laddar sidan om afrikanska bönor..."` |
| 3 | SSR renderar `<main>` 1, `<section>` 1, `<h1>` 1, 12 `<p>` — fullt content |
| 4 | Client hydrate börjar |
| 5 | **`useEffect` med `router.push("/")` eller `redirect("/")` i client-component triggar** |
| 6 | Next.js `RedirectErrorBoundary` + `RedirectBoundary` fångar (bekräftat i HTML JS-stacktrace) |
| 7 | Navigation till `/` (1-2 sek efter visad sida) |

**Bevis från HTML-build:**
```
RedirectErrorBoundary (/data/workspaces/.../app-page.runtime.dev.js:65:65384)
RedirectBoundary (/data/workspaces/.../app-page.runtime.dev.js:65:62915)
```

Båda boundaries är compileras in **bara om koden använder `redirect()`/`router.push()`-anrop**. Sidan finns + renderas korrekt — det är **client-side redirect** som boucer.

**Rotsorsak (LLM-output-bug, inte system-bug):**
LLM:n tolkade scaffoldens `siteKind: "marketing"` + `structureProfile: "one-page-marketing"` som "om någon hamnar på sub-route → bouca hem till one-page-versionen". Det är ett pedagogiskt missförstånd — landing-page får ha sub-routes (sitemap, blog-posts, om-sidor).

**Plan-koppling:**
- Plan 11:s scaffold-required-files-check fångar inte detta (sidan finns + har content)
- **Plan 12 (PromptKit) ska adressera:** lägg system-prompt-regel "om sub-route skapas i landing-page-scaffold, INGEN client-side redirect till `/` från sub-route — låt sidan stå för sig själv"
- Alternativt: scaffold-policy-test som scannar generated code för `router.push("/")` eller `redirect("/")` i sub-routes och flaggar som warning

---

### 13. 💡 UX-förslag: byt "Promoted" → "Fidelity 2" / "Fidelity 3"

**Användarens observation 2026-04-24:** Badge-texten "Promoted" är förvirrande. Den signalerar "denna är live-preview-versionen", inte "F3 verifierat". Användare antar att "Promoted" = "klar för deploy", men det stämmer bara om F3 också grönade.

**Status 2026-05-01:** Delvis åtgärdat i UI-copy: `VersionHistory` visar inte längre `Promoted` utan svensk label `Publicerad`. Förslaget att byta till `Fidelity 2/3` är fortfarande ett produktbeslut och inte gjort i copy-passet.

**Förslag:**
- `Fidelity 2` — preview bootar, sidan renderar, F2-checks gröna
- `Fidelity 3` — F2 + build/integrations/typecheck verifierade
- `Fel` — F3 hittade blocking findings
- (skippa "Fidelity 1" = init-state, inte värdefull att visa)

På svenska: "Trohetsgrad 2" / "Trohetsgrad 3".

**Vad det löser:**
- Användare förstår vad badge betyder utan att läsa runbook
- Tydligare signal när server-verify är klar (F2 → F3-grön/röd)
- Matchar terminology som redan finns i kod (`fidelityTier`, `qualityTarget`)

**Plan-koppling:** Inte plan 11/12-scope (UI-rename, inte logik). Plan 13 eller egen 30-min-task efter wave 5. Värd att samla med andra terminology-rensningar i `docs/architecture/glossary.md`.

---

## Hur använda denna fil

1. **Innan du säger "det buggar"** — kolla om det är listat här. Om ja → läs vad vi vet, lägg till nya datapunkter.
2. **När du upptäcker ett antagande som inte verifierats** — addera ny rad här.
3. **När ett antagande verifierats sant** — flytta till relevant arkitekturdoc, markera ✅ och ta bort härifrån vid nästa cleanup.
4. **När ett antagande visat sig falskt** — markera ❌, dokumentera fix-commit, behåll här som arkiv tills nästa cleanup.

**Referensformat:** `### N. <symbol> Korta-titeln`. Ändra inte numreringen retroaktivt — lägg nya rader i botten.
