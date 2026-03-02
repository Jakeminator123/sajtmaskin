# Plan 03 – Produktion & kvalitet

Prioritet: **Medium**
Uppskattad insats: ~4–6 timmar

---

## 1. Testramverk

**Status:** Saknas helt
**Problem:** Inga tester, ingen test-runner, ingen coverage.

### Validering

- Ingen `vitest`, `jest`, eller `@testing-library/*` i `package.json`
- Enda test-script: `test:api` → `node scripts/test-api-usage.mjs` (manuellt API-test)
- Inga `*.test.ts` eller `*.spec.ts` filer i `src/`

### Uppgifter

- [x] `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
- [x] Skapa `vitest.config.ts` med path aliases (`@/` → `src/`)
- [x] Lägg till `"test": "vitest"` och `"test:ci": "vitest run"` i package.json scripts
- [x] Skriv första testerna för kritiska hooks:
  - [x] `src/lib/v0/modelSelection.test.ts` – resolveModelSelection
  - [x] `src/lib/builder/promptLimits.test.ts` – längdvalidering
  - [ ] `src/lib/builder/sectionAnalyzer.test.ts` – sektionsdetektering
  - [ ] `src/lib/builder/messageAdapter.test.ts` – meddelandekonvertering
- [ ] Skriv API-route tester (om Next.js 16 testverktyg finns tillgängliga)
- [ ] Sätt upp CI (GitHub Actions) med `npm run test:ci`

### Prioriterade testområden

| Område | Varför | Filer |
|--------|--------|-------|
| Model selection | Felaktigt val → fel modell, fel kostnad | `src/lib/v0/modelSelection.ts` |
| Prompt limits | Överlånga prompts → API-errors | `src/lib/builder/promptLimits.ts` |
| SSE parsing | Trasig parsing → tappad data | `src/lib/builder/sse.ts` |
| Message adapter | Fel format → trasig UI | `src/lib/builder/messageAdapter.ts` |
| Auth/session | Läckor → säkerhetshål | `src/lib/auth/auth.ts` |

---

## 2. Felövervakning (Sentry)

**Status:** Saknas
**Problem:** Ingen extern felspårning. `ErrorBoundary` rapporterar till egen API.

### Validering

- Ingen `@sentry/*` i `package.json`
- `src/components/builder/ErrorBoundary.tsx` finns – rapporterar till intern endpoint
- "Sentry" nämns bara som integrationsetikett i landing-sidan

### Uppgifter

- [ ] `npm install @sentry/nextjs` — skipped, requires manual setup
- [ ] Kör `npx @sentry/wizard@latest -i nextjs` för initial setup
- [ ] Konfigurera `sentry.client.config.ts` och `sentry.server.config.ts`
- [ ] Wrappa `next.config.ts` med `withSentryConfig()`
- [ ] Skapa `src/app/global-error.tsx` för App Router error boundary
- [ ] Verifiera att `ErrorBoundary.tsx` rapporterar till Sentry utöver intern endpoint
- [ ] Konfigurera environment och release tracking

### Alternativ

Om Sentry känns för tungt initialt:
- [ ] Vercel Log Drain (gratis med Vercel-plan)
- [ ] Axiom (Vercel-integration, enkel setup)

---

## 3. Analytics

**Status:** Minimal
**Problem:** Bara `page_views`-tabell i DB och villkorad `SpeedInsights`.

### Validering

- `@vercel/speed-insights` renderas villkorat i `layout.tsx` (`NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS`)
- `@vercel/analytics` finns **inte** i `package.json`
- `page_views`-tabell i Drizzle schema (bara basic page view logging)
- Ingen PostHog, Plausible, eller liknande

### Uppgifter

- [x] `npm install @vercel/analytics`
- [x] Lägg till `<Analytics />` i `src/app/layout.tsx`
- [ ] Säkerställ att `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS=true` i Vercel env
- [ ] Överväg Vercel Web Analytics dashboard (gratis med Pro-plan)

### Framtida

- [ ] PostHog för produktanalys (funnels, feature flags, session replay)
- [ ] Custom events: "build_started", "deploy_completed", "prompt_enhanced"

---

## 4. SpeedInsights verifiering

**Status:** Klart
**Problem:** Renderades bara om `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === "true"`.

### Validering

- `src/app/layout.tsx`: `<SpeedInsights />` renderas alltid (villkor borttaget)
- Env-variabeln `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS` borttagen från `.env.local` och `.env.production`

### Uppgifter

- [x] Verifiera att `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS=true` satt i Vercel dashboard
- [x] Alternativt: ta bort villkoret och rendera alltid (SpeedInsights är billig)
- [x] Ta bort `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS` från env-filer (onödig nu)
