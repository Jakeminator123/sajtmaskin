# P31 — Feature-Runtime Envs + F3 Placeholder Toggle + TS2749 Autofix

**Status:** kod levererad lokalt 2026-04-21
**Owner:** Cursor agent (Claude Opus 4.7)
**Origin:** Empirisk session där "Bygg integrationer"-knappen krävde 17 envs på en bokcafé-sida + dubbel-prompt med glas + 3D triggade TS2749 utan att repair-loopen löste det.

## TL;DR

F3 ("Bygg integrationer") krävde idag verklig env-värde för ALLT som detection-pipelinen råkade snubbla över i koden — även funktioner skyddade av runtime-popup eller självavstängande komponenter. Resultat: en bokcafé-sida på `app-shell` blockerades av 17 keys, 0 av dem core-funktionalitet.

Den här planen kopplar samman tre infrastrukturlager som redan fanns men inte pratade ihop: `placeholder-harmless`, `tier3-build-spec`, `dossier`-metadata. Plus en deterministisk autofix för TS2749-felen som LLM-fixern inte fångade.

## Empirisk evidens

- Chat `cdc23879...`, version `9534dd5c-a99f-4b1c-aa99-4866b3b31585` (2026-04-21 06:04). Quality-gate failade med två TS2749 i `flying-meatball-canvas.tsx` + `glass-pyramid-canvas.tsx` (PointerPosition imported as value, used as type). Server-repair körde 4 pass utan att lyckas. Min P30 gate-aware-policy lät loopen snurra max passes (vilket var rätt) men rotfelet förblev oåtgärdat.
- "Saknar 17 env-värden för integrationsbygge" på samma sida. Inget av de 17 är affärskritiskt för ett bokcafé.

## Designval

| Fråga | Val | Varför |
|---|---|---|
| Env-required-källa | Dossier-driven (dossier-`enforcement` per envVar) med regex-fallback | Källa-av-sanning där den hör hemma; minimal blast radius |
| F3 visuell-publish | Toggle `allowPlaceholdersInF3` per app_project | Enkel UX; opt-in håller default safe |
| Klarna-mönstret | `enforcement: "feature-runtime"` | Beskriver runtime-skyddat UI (banner/popup) som första-klass |
| Selektion-källa vid readiness | `chat.orchestration_snapshot.brief.requestedCapabilities` | Persisterad redan; ingen ny DB-kolumn |

## Faser och leverans

### Fas 1 — TS2749 autofix

[src/lib/gen/autofix/rules/type-only-import-fixer.ts](../../../src/lib/gen/autofix/rules/type-only-import-fixer.ts) — konverterar `import { X }` till `import type { X }` när X aldrig refereras som value. Konservativ classify-funktion (type/value/unknown); bailar på unknown.

Wire i [pipeline.ts](../../../src/lib/gen/autofix/pipeline.ts) (efter `react-type-import-fixer`) och [repair-generated-files.ts](../../../src/lib/gen/autofix/repair-generated-files.ts). 11 unit-tester täcker positive case, JSX, member access, typeof, new, mixed-import, multi-symbol type-block, idempotens.

### Fas 2 — `enforcement` på dossier-envVars

[docs/schemas/strict/dossier.schema.json](../../schemas/strict/dossier.schema.json) — ny enum `envVars[].enforcement` med `"build"` (default) / `"feature-runtime"` / `"warn-only"`. `additionalProperties: false` förbjuder fortfarande andra fält.

[src/lib/gen/dossiers/types.ts](../../../src/lib/gen/dossiers/types.ts) — `DossierEnvVarEnforcement` typ + optional på `DossierEnvVar`.

Backfill:
- `stripe-checkout` — `STRIPE_SECRET_KEY: build`, publishable: `warn-only`.
- `resend-contact-form` — alla tre keys: `feature-runtime` (route returnerar 503 + UI banner).
- `openai-chat` — `OPENAI_API_KEY: build` med kommentar att det kan promovas till `feature-runtime` när routens graceful-fallback verifieras.
- `plausible-analytics` — båda keys: `warn-only` (komponent returnerar null när tom).

### Fas 3 — Dossier-driven detection

[src/lib/gen/detect-integrations.ts](../../../src/lib/gen/detect-integrations.ts) — nya optional `selectedDossiers` på `DetectIntegrationsOptions`, ny `envEnforcement: Record<string, enforcement>` på `DetectedIntegration`. Cluster-baserad overlay merger envVars per dossier-overlap så `EMAIL_FROM` (i dossier men inte i registry) får rätt enforcement-tag.

7 unit-tester i [detect-integrations.test.ts](../../../src/lib/gen/detect-integrations.test.ts).

### Fas 4 — Tier-3 readiness gate

[src/lib/integrations/tier3-build-spec.ts](../../../src/lib/integrations/tier3-build-spec.ts) — `Tier3IntegrationRequirement` får `featureRuntimeEnvKeys` + `warnOnlyEnvKeys`. `requiredRealEnvKeys` filtreras till bara `build`-enforcement. `validateTier3Readiness` får `allowPlaceholdersForBuildKeys` + `placeholderEnvKeys` options.

[src/lib/project-env-resolver.ts](../../../src/lib/project-env-resolver.ts) — `ResolvedProjectEnvRequirements` får `buildBlockingKeys`, `featureRuntimeKeys`, `warnOnlyKeys`. Tar `selectedDossiers` + `allowPlaceholdersInF3`.

[src/lib/chat-readiness.ts](../../../src/lib/chat-readiness.ts) — `ChatReadinessInfo` får `buildBlockingKeys` + `featureRuntimeKeys`.

[src/app/api/engine/chats/[chatId]/readiness/route.ts](../../../src/app/api/engine/chats/[chatId]/readiness/route.ts):
- Läser `allowPlaceholdersInF3` från `project_data.meta`.
- Resolvar `selectedDossiers` från `chat.orchestration_snapshot.brief.requestedCapabilities` (kör `selectDossiersForRequest` igen — billigt).
- Blockers byggs bara från `buildBlockingKeys` (inte alla missing keys). `featureRuntimeKeys` blir info-warning.

### Fas 5 — UI

- Ny [src/app/api/projects/[id]/preferences/route.ts](../../../src/app/api/projects/[id]/preferences/route.ts) — `PATCH`/`GET` för `allowPlaceholdersInF3`, persisterar i `project_data.meta`.
- Ny [src/components/builder/F3PlaceholderToggle.tsx](../../../src/components/builder/F3PlaceholderToggle.tsx) — switch + förklarande text + felhantering. Default off.
- Monterat i [ProjectEnvVarsPanel.tsx](../../../src/components/builder/ProjectEnvVarsPanel.tsx) i env-tabbet.
- [LaunchReadinessCard.tsx](../../../src/components/builder/LaunchReadinessCard.tsx) — "Öppna miljövariabler"-knappen prefererar `buildBlockingKeys` framför legacy `missingEnvKeys` så panelen öppnas med korrekt subset.

### Fas 6 — Capability-skärpning

[src/lib/gen/capability-inference.ts](../../../src/lib/gen/capability-inference.ts):
- Ny `needsPayments` capability + rule (stripe/klarna/swish/paypal/adyen + svenska "betalningsflöde").
- `needsPremiumVisuals`-regex får svenska `glas` så "parallax-header i glas" triggar bägge capabilities.
- `buildCapabilityHints` får `Payments requested`-sektion som pekar på `CheckoutButton` + flagger `STRIPE_SECRET_KEY` som build-enforcement.

[src/lib/gen/orchestrate.ts](../../../src/lib/gen/orchestrate.ts) — `inferredCapabilityIds` bridge utökad: `needsParallax → ["parallax-scroll", "parallax-pointer"]`, `needsPayments → ["payments"]`.

5 nya phrase-cases + 1 hint-case i [capability-inference.test.ts](../../../src/lib/gen/capability-inference.test.ts).

### Fas 7 — OpenClaw assistant tips

Ny [data/openclaw/builder-prompt-tips.md](../../../data/openclaw/builder-prompt-tips.md) — kort guide assistenten kan citera om hur man promptar för X. Tipsar om visuellt+funktionellt-separation, "en sak per uppföljning", trigger-ord för moduler (utan att avslöja "dossier"-terminologi), samt F3-toggle-förklaring.

Hookad i [src/app/api/openclaw/chat/route.ts](../../../src/app/api/openclaw/chat/route.ts) som tredje system message (efter SYSTEM_PROMPT och routing-prompt). Laddas vid module init med graceful fallback. Lägger även till regel i SYSTEM_PROMPT att aldrig nämna interna namn (dossier, scaffold-matcher, etc).

## Förväntade utfall

För ett bokcafé på `app-shell` med selectedDossiers = []:
- Idag: 17 blockers (alla detected = build).
- Efter (med dossier-context): 0-2 build-blockers, X feature-runtime warnings, Y placeholder-täckta info-rader.
- Utan dossier-context (legacy snapshot): samma som idag (default `build` för alla; ingen regression).

För en explicit Stripe-prompt:
- `needsPayments → "payments"` capability bridge → `stripe-checkout`-dossiern selekteras.
- F3 kräver `STRIPE_SECRET_KEY` (build), inte publishable (warn-only).

För TS2749-felet vi såg:
- Autofix-rule fångar `import { PointerPosition }` när X bara används i type-positions och konverterar till `import type`. Repair-loopen behöver inte ens anropa LLM-fixern.

## Vad jag INTE rörde

- P26 build_intent promotion-glitch (separat scope).
- Migrering av existerande versions — bara nya genereringar / readiness-anrop drar nytta direkt. Existerande versioner får hanteras via "Generera om" eller manuell PATCH till project preferences.
- Vercel-projekt-provisionering vid F3 — toggle påverkar inte vart deployen går.
- Skrivning av `enforcement` i `sajtmaskin.integration-manifest.json`. Manifestet kan utvidgas i en uppföljare om vi vill att enforcement ska vara persisterad i versionen och inte härledd vid readiness-tid.

## Status per fas

| Fas | Levererat | Testat |
|---|---|---|
| 1 | type-only-import-fixer + wire | 11 vitest, alla gröna |
| 2 | schema + types + 4 backfilled manifests | dossier-tests + parity-tests gröna |
| 3 | overlay i detect-integrations | 7 nya vitest, alla gröna |
| 4 | tier3-build-spec + resolver + readiness | 11 + befintliga gröna |
| 5 | F3-toggle (route + component + UI wiring) | manuell smoke pending |
| 6 | needsPayments + phrase-tests | 37/37 capability-tests gröna |
| 7 | OpenClaw tips (file + system-message hook) | n/a (text) |
