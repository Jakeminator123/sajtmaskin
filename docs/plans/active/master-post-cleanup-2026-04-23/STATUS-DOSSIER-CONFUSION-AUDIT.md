# STATUS — Dossier-confusion audit

**Datum:** 2026-04-23
**Producerad av:** orkestrator-agent under wave 2-väntan
**Syfte:** Klargöra om "dossier-confusion" är ett verkligt strukturproblem eller bara historisk dimma. Inga filer modifieras.

> Användarens hypotes (parafraserad): det finns ett gammalt dossier-system som inte används, ett nytt med hard/soft-kategorisering, och det finns oklarhet kring vad som hör till F2 vs F3.

## Slutsats först

**Dossier-systemet i sig är inte kaotiskt.** Det är en väldokumenterad v2 (`docs/architecture/dossier-system.md`), 18 aktiva dossiers (10 hard + 10 soft via `data/dossiers/{hard,soft}/`), deterministisk capability-driven selektion (ingen embeddings, ingen fuzzy match). Den gamla pipelinen är **arkiverad** under `archive/dossiers-legacy-2026-04-20/`.

**Den faktiska F2/F3-bryggan finns redan** i `envVars[].enforcement`-fältet:

| Värde | Betyder | F-tier |
|---|---|---|
| `"build"` (default) | Krävs för deploy/build | **F3 blocker** |
| `"feature-runtime"` | UI visar banner/popup om värdet saknas | F3 warning, F2 OK |
| `"warn-only"` | Komponenten self-disables | **F2 OK** |

Det matchar exakt användarens målbild ("F2 = npm run dev kan upp; F3 = npm run build + integrationer fungerar"). **Infrastrukturen är på plats — den behöver bara honoreras konsekvent i pipelinen.**

## Inventering — hard vs soft

### Hard (10 — kräver externa secrets / API-nycklar)

| Capability | Dossier | Env-vars | Default? |
|---|---|---|---|
| `payments` | `stripe-checkout` | STRIPE_SECRET_KEY (build), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (warn-only) | ✓ |
| `auth` | `clerk-auth` | (Clerk keys) | ✓ |
| `error-tracking` | `sentry-error-tracking` | (Sentry DSN) | ✓ |
| `ai-chat` | `openai-chat` | OPENAI_API_KEY | ✓ |
| `contact-form` | `resend-contact-form` | RESEND_API_KEY | ✓ |
| `newsletter-subscribe` | `mailchimp-newsletter` | (Mailchimp keys) | ✓ |
| `analytics` (1 av 2) | `plausible-analytics` | (domain config) | (delas) |
| `analytics` (2 av 2) | `vercel-analytics` | (auto via Vercel) | (delas) |

### Soft (8 — bara npm-deps, inga env-vars)

| Capability | Dossier | Notering |
|---|---|---|
| `visual-3d` | `three-fiber-canvas` | three + @react-three/fiber + drei |
| `carousel` | `embla-carousel` | |
| `command-search` | `cmdk-command-palette` | |
| `faq-section` | `faq-accordion` | |
| `marquee` | `marquee-scroller` | |
| `parallax-pointer` | `pointer-parallax` | |
| `parallax-scroll` | `scroll-parallax` | |
| `pricing-section` | `pricing-tier-table` | |
| `testimonials-section` | `testimonials-grid` | |

### Per capability-map.json: 16 capabilities mappade

`ai-chat, analytics, auth, carousel, command-search, contact-form, error-tracking, faq-section, marquee, newsletter-subscribe, parallax-pointer, parallax-scroll, payments, pricing-section, testimonials-section, visual-3d`

## Var den verkliga "confusion" sitter

### 1. Capability-classifier saknas (eller skippas) — bekräftat av smoke

Run 2 (3D-coffee via inspector): användaren skrev "Skapa en 3d-kaffekopp som hoovrar och flyger ovanför". `three-fiber-canvas`-dossiern under `data/dossiers/soft/visual-3d/` existerar och har `defaultForCapability: true`. Den **borde** ha injicerats automatiskt. Men:

- Timeline visar inget `capability_refresh: visual-3d`-event.
- Ingen `package.json`-uppdatering för three/@react-three/fiber.
- Ingen `Dossier Files To Emit Verbatim`-block i prompten.
- LLM:n improviserade ett tomt `coffee-cup-3d.tsx` istället.

Slutsats: brief-extractorn / capability-detection drar inte `requestedCapabilities` från follow-up-text. Det är inte dossier-systemets fel — det är **steget före** som inte fyller i `requestedCapabilities`.

→ **Plan 06 (Deep Brief delta-contract) + plan 07 (3D capability-path) hänger ihop precis här.** Plan 07 ska säkerställa att 3D-signaler i prompttext blir `visual-3d`-capability. Plan 06 ska göra capability-refresh till en delta-operation som faktiskt körs på follow-up.

### 2. F2/F3 honoreras inte konsekvent

`envVars[].enforcement` finns men spridningen i koden är ojämn:

- `selectDossiersForRequest` checkar bara `required: true` mot `process.env`, inte enforcement-tier (per dossier-system.md p. 4: "preflight check on `envVars[].required`").
- Quality-gate (F3) flagar ALLA missing required env som blockers, även `"warn-only"` enligt dossier-system.md p. 68.

→ **Plan 10/11 (latency budgets + unified repair) bör skärpa det:** quality-gate ska bara blocka på `enforcement: "build"`, inte allt med `required: true`. `"warn-only"` är F2-OK enligt design.

### 3. Doc-konsumtion — redan rensad

| Källa | Status |
|---|---|
| `docs/architecture/dossier-system.md` | ✅ Aktiv, väldokumenterad |
| `docs/architecture/_archived/dossier-format.md` | ✅ Korrekt arkiverad |
| `docs/architecture/_archived/dossier-promotion-flow.md` | ✅ Arkiverad |
| `docs/architecture/_archived/dossier-pipeline-roadmap.md` | ✅ Arkiverad |
| `docs/llm/dossier-selection-flow.md` | ✅ Aktiv (LLM-perspektiv) |
| `docs/operating/dossier-cheatsheet.md` | ✅ Aktiv (operatörs-perspektiv) |
| `docs/llm/dossier-author-template.md` | ✅ Aktiv (för manuell + AI-curation) |
| `docs/plans/avklarat/dossier-brief-sync.md` | Plan-arkiv |
| `docs/plans/avklarat/dossier-cleanup-2026-04-21.md` | Plan-arkiv (= det som rensade legacy-pipelinen) |
| `archive/dossiers-legacy-2026-04-20/` | ✅ Hela gamla 96-dossier-poolen arkiverad där |

Doc-skiktet är **inte** kaotiskt. Vad som finns i v2 är konsistent och pekar åt samma håll.

### 4. `SAJTMASKIN_DOSSIER_PIPELINE` opaketen

`docs/architecture/dossier-system.md` p. 137-143:
- Code default: `true` i development, `false` i preview/production
- Current deploy: `true` på alla tre Vercel-miljöer (explicit override)
- Det betyder att opaketet är på överallt, vilket är bra. Men koddefault skiljer sig från deploy-state — `09-legacy-ripout-and-config-pruning.md` kan rensa koddefault så det matchar verkligheten.

## Vad som EJ är confusion (tvärtom — bra design)

- Hard vs soft path-encoding (`data/dossiers/hard/...` vs `soft/...`) — entydigt och söker enkelt.
- `defaultForCapability` som tie-breaker — undviker non-determinism.
- Per-fil `injectionMode`-override på dossier-level `codeFidelity` — flexibel utan att vara kaotisk.
- Capability-map.json som regenererbar view (inte source of truth) — clean.
- `lastVerified`-fält tvingar manuell validering vid registrering.

## Förslag till framtida planer

| Fynd | Mål-plan | Action |
|---|---|---|
| Capability-classifier saknas/skippas på follow-up | **Plan 06** | Säkerställ att follow-up-classifier kallar capability-extraktion och fyller `requestedCapabilities` |
| 3D-capability ger ingen dossier-injection | **Plan 07** | Bygg explicit "capability-add" follow-up-väg som triggar `selectDossiersForRequest` med `visual-3d` |
| `enforcement: "warn-only"` blockas felaktigt i F3 | **Plan 11** (unified repair) eller separat | quality-gate ska respektera enforcement-tier |
| `SAJTMASKIN_DOSSIER_PIPELINE` koddefault skiljer från deploy | **Plan 09** | Justera default till `true` överallt (matcha verkligheten) |
| Doc-arkivering redan klar | inget | n/a |

## TL;DR till plan-06/07-prompter (när vi kommer dit)

> Dossier-systemet är funktionellt och välbyggt. Buggen är att **capability-classifier inte fyller `requestedCapabilities` på follow-ups**, så `selectDossiersForRequest` får tomt input och hoppar över allt. Fixen sitter i fas 1 (brief / classifier), inte i `data/dossiers/`.
