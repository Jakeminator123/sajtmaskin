# External review remediation — progress

Source material: `.j_to_agent/1.txt` (landing + integrationer), `2.txt` (own-engine pack), `3.txt` (scaffolds, scripts, orchestrator). **Agent-uppdelning:** `docs/plans/active/orchestrator-workloads-external-review.md`.

Last code touch: **W3 (slice)** — borttagna oanvända `STREAM_RESOLVE_*` i stream-routes; `createOwnEnginePlanModeResponse` använder bara `resolvePhaseModel(..., "planner")` för SSE-meta (ingen dubbel `modelId`). Tidigare: W2 manifest + final sweep (`config-dashboard/`). **Playwright / e2e:** kanon `e2e/vercel-templates/` — se `vercel-templates-playwright-scaffold-integration.txt`.

**Siffror:** **~44%** = ungefärlig andel av *hela* externreview + migrationer (tre dokument). **~72%** = bara *landnings-spåret* (del av `1.txt`), inte hela projektet. **Integrationer + deploy** höjd efter W2 (registry + manifest + deploy-readiness). **Scripts-spåret** ~32% efter README/inventory-sweep; höj till **~43%** helhet när du kört din återstående script/README-runda.

## Commit- och push-rutin (pågående körning)

Vid varje dokumenterad avstämning:

1. Uppdatera tabellen **Overall fill** / **Done** om något nytt levererats.
2. `git add` endast reporelevanta filer (inte lokala `.cursor/run`, `data/`, `logs/`, `.j_to_agent/` om de inte ska in).
3. **Commit-rad:** använd **helhets-%** (Whole vision), t.ex. `chore: remediation ~37pct — kort vad som ändrats`.
4. Valfritt i **commit body:** landnings-% eller spår (integrationer, own-engine) om det hjälper historiken.
5. `git push` till `master` (eller din arbetsbranch).

## Overall fill (approximate)

| Segment | Done | Remaining |
|--------|------|-----------|
| **Whole vision** (alla tre dokument + stora migrationer) | **~44%** | **~56%** |
| **Landing slice** (steg 1–4 i `1.txt`, delvis) | **~72%** | **~28%** |
| **Integrationer + deploy** (`1.txt` steg 5–7) | **~52%** | **~48%** |
| **Own-engine** (`2.txt`) | **~8%** | **~92%** |
| **Scripts / naming hygiene** (`3.txt`) | **~32%** | **~68%** |

## Done (in repo)

- **W3 (slice, `2.txt`):** Döda konstanter `STREAM_RESOLVE_MAX_ATTEMPTS` / `STREAM_RESOLVE_DELAY_MS` borttagna från `POST /api/v0/chats/stream` och follow-up-stream-routen (användes inte). `createOwnEnginePlanModeResponse` tar inte längre `modelId` i params — planner-modell kommer enbart från `resolvePhaseModel(modelTier, "planner")` i SSE-meta (undviker vilseledande dubbel källa).
- **Repo-städ / dokumentation (final sweep-uppföljning):** `config-dashboard/` + `docs/architecture/config-dashboard-sources.md` spårade; `docs/README.md` länkar dit. Uppdaterade `.cursor/rules/*`, `.cursor/settings.json`, `.cursorignore`. Borttagna duplicerade `.j_to_agent/.../deep-research-report (1|2).md`; kritik-filer under samma mapp trimmade/uppdaterade (inkl. nya anteckningar där de lades till lokalt).
- Landning: statisk copy/data i `landing-chat-data.ts`; delade hooks i `landing-hooks.ts`; state/build-flöde i `useLandingController` (`use-landing-controller.ts`).
- 3D tilt + tech/integration card glow + terminal glow: DOM / CSS-variabler, inte `setState` per rörelse.
- `prefers-reduced-motion` stoppar tilt-uppdateringar.
- Tech stack: Drizzle ORM, Vercel Analytics (stämmer med `@vercel/analytics` + Speed Insights i `src/app/layout.tsx`).
- Integrationer-rad: OpenAI; Sentry bort från listan.
- Zod-feature copy: Drizzle / server actions / API.
- Footer: `/privacy`, `/terms`, `/faq`, `mailto:`; inga falska social-URL:er.
- Video-knapp: väljer Analyserad + toast.
- `integrationRegistry` + typer; `detectIntegrations()` läser namn/envVars/setupGuide därifrån via `DETECTION_PIPELINE` (regex kvar i `detect-integrations.ts`).
- W2 (2026-03-25): Clerk, NextAuth/Auth.js, Google OAuth, GA4, GTM, Vercel Analytics, Plausible, PostHog och Vercel KV ligger i **`integrationRegistry`** med registry-styrda rader i `DETECTION_PIPELINE` (Prisma/SQLite förblir inline med särskild copy).
- W2 manifest + deploy (forts.): **`sajtmaskin.integration-manifest.json`** läggs in vid `finalizeAndSaveVersion` (efter preflight); `detectIntegrationsFromVersionFiles` + `resolveEnvRequirementsFromVersionFiles` använder manifest när `schemaVersion: 1` är giltig, annars heuristisk scan. **`deployReadiness`** (`buildDeployReadiness`) loggas på deploy-precheck och returneras i deploy-API-svaret. **Kvar:** färre pre-deploy auto-fixar uppströms / validera före deploy i separat hård gate om ni vill.
- `vitest.config.ts`: **`e2e/**` exkluderad** så Playwright-specar under `e2e/` inte körs av Vitest (samma idé som befintlig `vercel_templates_levels/**`-exkludering).
- `scripts/run-eval.ts` needle-checks uppdaterade (registry + pipeline).
- `landing-hero.tsx` / `landing-footer.tsx`: hero + footer JSX bort från monolitiska `chat-area.tsx`.
- `extract-landing-chat-data.mjs`: avbryter om monolit-block saknas (förhindrar att gamla radnummer skriver sönder `landing-chat-data.ts`).
- `write-tier2-run.mjs`: valfritt run-id som CLI-arg (`node scripts/write-tier2-run.mjs <id>`).
- `chat-area.tsx`: borttagna oanvända Lucide-/data-imports; oanvända värden från `useLandingController` plockas inte längre ut; terminal ref-merge med tydlig eslint-avsiktskommentar.
- `landing-hero.tsx`: `headlineTilt` destruktureras så `eslint-plugin-react-hooks` ref-regler inte falskt larmar.
- `landing-background.tsx`: shader-orbs + grid + noise flyttade från `ChatArea`; `data-landing-bg` per kategori (`fritext`, `template`, `audit`, `analyserad`); `prefers-reduced-motion` via scoped CSS under `.landing-chat-bg` (lägre opacitet, inga orb-/grid-animationer).
- **Vercel Templates Playwright:** kanon **`e2e/vercel-templates/`** (tracked). Legacy `vercel_templates_levels/` kan ligga **lokalt** (gitignore + cursorignore). Kör → `raw-discovery/current/`; **inte** v0-mallar (`templates:*`). Docs: `vercel-templates-discovery.md`, `vercel-templates-playwright-scaffold-integration.txt`.
- `scripts/README.md` + `scripts-scaffolds-inventory.md`: rättade sökvägar (`scripts/hamta_sidor*`), `npm run template-library:verify-summary`, svenska i scaffold-pipeline-tabellen; **recovery**-skript dokumenterat som **saknat** i repot.

## Next (recommended order)

1. ~~`LandingBackground` (shader/grid/noise) till egen komponent; semantiskt per läge; reduced-motion / in-view för 3D.~~ **Klart** (in-view för övrig 3D kvar vid behov).
2. ~~Utöka `integrationRegistry` + manifest + deploy-readiness~~ **Klart** (uppföljning: tunnare auto-fix / valideringsfas före deploy om behov).
3. Own-engine remediation (`2.txt`) — **pågår** (första slice: dead code + plan-mode API); **kvar:** session-service, transaktionell finalize, golden tests, m.m. enligt `2.txt`.
4. Scripts-städ (`hamta_sidor*`, lab-mappar, README-drift) (`3.txt`).

## Uncertainties / product follow-ups

- Footer “Om oss” / “Blogg” pekar på `/faq` tills dedikerade sidor finns.
- Social copy ersätter länkar tills URL:er finns.
- `IntegrationCard` har kvar CSS `float`-animationer (ej reduced-motion ännu).
