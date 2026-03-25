# External review remediation — progress

Source material: `.j_to_agent/1.txt` (landing + integrationer), `2.txt` (own-engine pack), `3.txt` (scaffolds, scripts, orchestrator). **Agent-uppdelning:** `docs/plans/active/orchestrator-workloads-external-review.md`.

**Genomförande (checkbox-roadmap, parallella spår, agent-kontrakt):** `docs/plans/active/external-review-execution/README.md` → [MASTER-ROADMAP.md](./external-review-execution/MASTER-ROADMAP.md) + [CONTINUATION.md](./external-review-execution/CONTINUATION.md) (autonoma anhalter, ~4–5 % batch-commits) + track-filer.

**Kritikindex (parallell granskning):** [KRITIK-OVERVIEW.md](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md) · åtgärdade kritik-snapshots: [kritik-addressed/](../../../.j_to_agent/archive/kritik-addressed/README.md). *Separat agent kan samtidigt åtgärda kritikfiler och arkivera till `.j_to_agent/archive/` — undvik att samma session ändrar både `src/`‑remediation och kritikmappen utan koordinering.*

Last code touch: **Meilisearch** i **`integrationRegistry`** + **`DETECTION_PIPELINE`**; **`env-policy`** (`NEXT_PUBLIC_MEILISEARCH_*`, valfri **MEILISEARCH_HOST** / **MEILISEARCH_API_KEY**); Vitest-detektion. **Tidigare:** Algolia; `webscraper-url.test.ts`; W2 CMS + Mongo. **Progress ~84% whole:** tabell nedan.

**Siffror:** **~84%** = ungefärlig andel av *hela* externreview + migrationer (tre dokument). **~82%** = *landnings-spåret*. **Integrationer + deploy:** registry (CMS + Mongo + sök **Algolia** / **Meilisearch** + befintliga inkl. **Sentry**) + manifest + readiness + deploy-409-UX + svensk **lansering**-copy. **Own-engine ~78%**, **scripts ~95%**.

## Commit- och push-rutin (pågående körning)

Vid varje dokumenterad avstämning:

1. Uppdatera tabellen **Overall fill** / **Done** om något nytt levererats.
2. `git add` endast reporelevanta filer (inte lokala `.cursor/run`, `data/`, `logs/`, `.j_to_agent/` om de inte ska in).
3. **Commit-rad:** använd **helhets-%** (Whole vision), t.ex. `chore: remediation ~84pct — kort vad som ändrats`.
4. **Batch:** under pågående orchestrator-remediation, **samla gärna ~4–5 enheter** på Whole vision mellan commits när flera säkra punkter ryms i samma gröna `typecheck`+`vitest` (färre mikrocommits). Se [CONTINUATION.md](./external-review-execution/CONTINUATION.md).
5. Valfritt i **commit body:** landnings-% eller spår (integrationer, own-engine) om det hjälper historiken.
6. `git push` till `master` (eller din arbetsbranch).

### Gren: `master` och `main` (för agenter som “inte ser” ändringar)

- **Remediation i den här körningen pushas till `origin/master`.** Efter push ska `master` och `origin/master` peka på samma commit (`git status -sb` visar `## master...origin/master` utan `[ahead …]` / `[behind …]`).
- Repot har också grenen **`main`** på GitHub. Den kan vara **långt efter** `master` (olika historik). Om du klonar och råkar arbeta på **`main`**, eller om GitHub **default branch** är `main`, syns inte builder-/remediation-commits förrän du byter gren.
- **Rätt koll:**  
  `git fetch origin && git checkout master && git pull origin master`  
  samt `git log -1 --oneline origin/master` — ska matcha senaste kända remediation-/chore-commit.
- **Organisation:** överväg att sätta **default branch** till `master` i GitHub om all aktiv utveckling ska ligga där, eller merga `master` → `main` i en avsiktlig release-rutin (produktbeslut).

### Språkpolicy: svenska i UI, engelska kvar där det är medvetet

- **Prioriterat på svenska:** synlig copy i **byggaren** (header, inställningar, lansering, tips där vi rört ytan), **byggprofilbeskrivningar** i `MODEL_TIER_OPTIONS`, och **agentterminologi** i `.cursor/rules/terminology.mdc` där den speglar användartext.
- **Medvetet kvar på engelska (eller blandat):** kodkommentarer och utvecklardokumentation på engelska där de redan är det; **AI-elementkatalog** (`ai-elements-catalog.ts`) och liknande **prompt-hints** till modellen; interna **API-/felsträngar** som konsumeras av kod eller loggar; **tekniska namn** (OpenAI, Anthropic, Vercel, Blob, ZIP); **mallen för egna instruktioner** i `defaults.ts` (kan vara engelska för att styra genererad kod). Ny svensk översättning där ska göras medvetet (risk att rubba modellbeteende).

### Arbetsyta: samma innehåll som Git sparar

- **Repots rot** (checkout av `sajtmaskin`) är den katalog där `git commit` skriver ändringar. Öppna **den mappen** i editorn, eller en **workspace-fil med endast den mappen** som root (JSON: `"path": "."` relativt workspace-filen).
- **`sajtmaskin.code-workspace`** finns som spårbar mall: **`sajtmaskin.code-workspace.example`** (kopiera till `sajtmaskin.code-workspace` lokalt). Själva `sajtmaskin.code-workspace` är **gitignorerad** — den checkas alltså inte in, men ska peka på **`.`** (en root). Se `.cursor/README.md` och `.cursor/rules/workspace-hygiene.mdc`.
- **Cursor-projektmappar** under t.ex. `%USERPROFILE%\.cursor\projects\…` är **redaktörens metadata** (historik, terminals), inte en separat klon. Filer du sparar ska ligga under **repots filträd** ovan — annars “finns” inte ändringen i Git.
- **Verifiera att du är rätt:** `git rev-parse --show-toplevel` ska visa repots rot; `git branch --show-current` ska vara **`master`** för remediation-spåret; `git status -sb` ska visa `## master...origin/master` (efter `git fetch`).

### Ska du synka mot `origin/master`?

- **Ja — regelbundet `pull` (hämta + integrera)** om du vill ha exakt samma commithistorik som fjärr:  
  `git fetch origin && git checkout master && git pull origin master`  
  Efter det ska `git rev-parse HEAD` och `git rev-parse origin/master` vara **identiska** tills någon pushar igen.
- **`push`** behöver du bara när **du** har egna commits som ska upp till GitHub. “Pusha en pull” är inte en Git-operation — men **Pull** / **Sync** i Cursor/VS Code motsvarar `git pull` när du står på `master` och remote är `origin`.

## Overall fill (approximate)

| Segment | Done | Remaining |
|--------|------|-----------|
| **Whole vision** (alla tre dokument + stora migrationer) | **~84%** | **~16%** |
| **Landing slice** (steg 1–4 i `1.txt`, delvis) | **~82%** | **~18%** |
| **Integrationer + deploy** (`1.txt` steg 5–7) | **~75%** | **~25%** |
| **Own-engine** (`2.txt`, track W3 Fas A) | **~78%** | **~22%** |
| **Scripts / naming hygiene** (`3.txt`, W4 exit) | **~95%** | **~5%** |

## Återstår (kort)

Ungefär **~16%** av *whole vision* kvar: **integrationer + deploy** (~75% done) — fler providers, e2e kring deploy, produktpolish; ev. own-engine utanför W3-track. **Produkt/UI:** fortsatt förenkling av byggaren (färre parallella “statusytor”, tydligare primär väg för publicering och env) där det inte kräver produktbeslut. **Autonoma anhalter:** [CONTINUATION.md](./external-review-execution/CONTINUATION.md).

## Done (in repo)

- **W3 (slice, `2.txt`):** Döda konstanter `STREAM_RESOLVE_MAX_ATTEMPTS` / `STREAM_RESOLVE_DELAY_MS` borttagna från `POST /api/v0/chats/stream` och follow-up-stream-routen (användes inte). `createOwnEnginePlanModeResponse` tar inte längre `modelId` i params — planner-modell kommer enbart från `resolvePhaseModel(modelTier, "planner")` i SSE-meta (undviker vilseledande dubbel källa).
- **W3 (namngivning):** `createGenerationPipeline` flyttad till **`src/lib/gen/generation-pipeline.ts`**; `src/lib/gen/fallback.ts` re-exporterar för äldre importvägar. Stream-routes, MCP `generate-site`, Vitest-mocks och `run-eval` needles uppdaterade; `docs/architecture/v0-soft-deprecation.md` justerad.
- **W3 (contract gate):** `createPreGenerationContractGateReadableStream` i **`src/lib/providers/own-engine/pre-generation-contract-gate.ts`** — en SSE-sekvens för pre-generation contract clarification delas av nya chatten och follow-up (ny-chat lägger `chatPrivacy` / `scaffoldLabel` / `capabilities` i meta via explicita nycklar; follow-up utelämnar dem som tidigare).
- **W3 (finalize / orphans):** `finalizeAndSaveVersion` skriver assistant + draft-version **i en DB-transaktion** (`addAssistantMessageAndCreateDraftVersion`); vid tidigare två-stegs-flöde användes `deleteEngineMessage` om draft misslyckades — nu rollback via transaktion. Vitest: misslyckad persist + mocks via `@/lib/db/services`.
- **W3 (SSE golden):** `pre-generation-contract-gate.golden.test.ts` — avkodar SSE från `createPreGenerationContractGateReadableStream`, låser eventordning och skillnad follow-up vs new-chat-meta.
- **W3 (generation SSE golden):** `generation-stream.golden.test.ts` — `createOwnEngineGenerationStream` med inspelad pipeline-SSE; mockad `finalizeAndSaveVersion` + `db`/sandbox; låser `chatId` → `meta` → `content*` → `done` och att finalize får ackumulerat innehåll.
- **W3 (orphan-regression):** `finalize-version.test.ts` — vid lyckad finalize anropas inte `addMessage`; endast `addAssistantMessageAndCreateDraftVersion`.
- **W3 (v0-gräns):** `own-engine-v0-boundary.test.ts` — inga `@/lib/v0/*` eller `v0-sdk` i `src/lib/own-engine/**` eller `src/lib/providers/own-engine/**` (exkl. `*.test.*`); arkitekturnotis i `v0-soft-deprecation.md`.
- **W3 (session slice):** `own-engine-build-session.ts` — `buildOwnEngineGenerationStreamMeta` delas av `POST .../chats/stream` och `POST .../[chatId]/stream`; `own-engine-build-session.test.ts` låser att follow-up inte får `chatPrivacy`/`scaffoldLabel` i meta.
- **W3 (contract-gate params):** `buildPreGenerationContractGateParams` samlar parametrar till `createPreGenerationContractGateReadableStream`; samma två routes; tester för new-chat vs follow-up (`chatPrivacy` / `scaffoldLabel` / `capabilities` endast new-chat).
- **W3 (generation pipeline session):** `createOwnEnginePipelineAndGenerationStream` i **`own-engine-pipeline-generation.ts`** (separat från `own-engine-build-session.ts` så Vitest utan Postgres kan importera meta/contract-hjälpare) — gemensam `createGenerationPipeline` + `createOwnEngineGenerationStream` med `getAgentTools`; båda v0 chat-stream-routes.
- **W3 (plan-mode session):** **`own-engine-plan-mode.ts`** — planner system prompt + preamble, `resolvePlanModePlannerModelId`, `logPlanModeGenerationStart`, `createPlanModePipelineStream` (valfritt `chatHistory` / `referenceAttachments`); båda stream-routes tunnare; **`own-engine-plan-mode.test.ts`**.
- **W4 + process:** `scripts/README.md` § Lab/debug för `scripts/labs/testning_scarf` + npm-tabell; inventory uppdaterad; **`external-review-execution/CONTINUATION.md`** beskriver batch-commits och fortsättning utan ping per checkbox.
- **Repo-städ / dokumentation (final sweep-uppföljning):** `config-dashboard/` + `docs/architecture/config-dashboard-sources.md` spårade; `docs/README.md` länkar dit. Uppdaterade `.cursor/rules/*`, `.cursor/settings.json`, `.cursorignore`. Borttagna duplicerade `.j_to_agent/.../deep-research-report (1|2).md`; kritik-filer under samma mapp trimmade/uppdaterade (inkl. nya anteckningar där de lades till lokalt).
- Landning: statisk copy/data i `landing-chat-data.ts`; delade hooks i `landing-hooks.ts`; state/build-flöde i `useLandingController` (`use-landing-controller.ts`).
- 3D tilt + tech/integration card glow + terminal glow: DOM / CSS-variabler, inte `setState` per rörelse.
- `prefers-reduced-motion` stoppar tilt-uppdateringar.
- Tech stack: Drizzle ORM, Vercel Analytics (stämmer med `@vercel/analytics` + Speed Insights i `src/app/layout.tsx`).
- Integrationer-rad: OpenAI; Sentry bort från listan.
- Zod-feature copy: Drizzle / server actions / API.
- Footer (landning v2): `/om`, `/blogg`, `/privacy`, `/terms`, `/faq`, `mailto:`; inga falska social-URL:er.
- Video-knapp: väljer Analyserad + toast.
- `integrationRegistry` + typer; `detectIntegrations()` läser namn/envVars/setupGuide därifrån via `DETECTION_PIPELINE` (regex kvar i `detect-integrations.ts`).
- **Builder UX (svenska copy, 2026-03-25):** `BuilderHeader` inställningar + modell-dropdowns; `defaults.ts` byggprofilbeskrivningar; agentterminologi (`terminology.mdc`) och routing-doc följer UI-strängar.
- **Builder UX (header Mer, 2026-03-25):** **Mer**-meny: import, sandbox, ZIP; **Ny chat**; svenska etiketter (**Djup brief**, **Resonemang**, **Anpassad** modell); OpenClaw **Mer-meny** / **mer-menyn** i tips-kontext.
- **Builder UX (tips/header, 2026-03-25):** **TipCard** utan duplicerad “var finns UI”-ruta; **tips-toggle** under **Inställningar**; header **Inställningar** + svenska menysektioner; instruktionsdialog **Klar**; OpenClaw-ytor inkl. **lansering**.
- **Builder UX (plotter, 2026-03-25):** ingen separat lanserings-**badge** i **BuilderHeader**; **`formatDeployReadinessStatusLabel`** / **`deployReadinessBadgeClassName`** i `src/lib/builder/deploy-readiness-copy.ts` + Vitest; **Lansering**-kort utan extra informationsruta när status är redo; kortare **Publicera**-tooltip (env) och **409**-hint i `useBuilderDeployActions`.
- **W2 (2026-03-26):** **Meilisearch** i registry + detektion + env-policy + Vitest.
- **W2 (2026-03-26):** **Algolia** i registry + detektion + env-policy + Vitest.
- **Webscraper (2026-03-26):** enhets tester för **`validateAndNormalizeUrl`** / **`getCanonicalUrlKey`** (`src/lib/webscraper-url.test.ts`).
- **W2 (2026-03-26):** **Sanity**, **Contentful**, **Storyblok**, **MongoDB** i **`integrationRegistry`** + **`DETECTION_PIPELINE`**; kategori **`cms`**; `env-policy` uppdaterad; Vitest.
- W2 (2026-03-25): Clerk, NextAuth/Auth.js, Google OAuth, GA4, GTM, Vercel Analytics, Plausible, PostHog, Vercel KV och **Sentry** ligger i **`integrationRegistry`** med registry-styrda rader i `DETECTION_PIPELINE` (Prisma/SQLite förblir inline med särskild copy).
- W2 manifest + deploy (forts.): **`sajtmaskin.integration-manifest.json`** läggs in vid `finalizeAndSaveVersion` (efter preflight); `detectIntegrationsFromVersionFiles` + `resolveEnvRequirementsFromVersionFiles` använder manifest när `schemaVersion: 1` är giltig, annars heuristisk scan. **`deployReadiness`** (`buildDeployReadiness`) loggas på deploy-precheck och returneras i deploy-API-svaret.
- **W2 builder-UX (409):** `useBuilderDeployActions` — vid **`DEPLOY_MISSING_ENV`** visas saknade nycklar i användarfel + versions-`error-log` (`deploy`); `deploy-precheck.md` § Builder.
- W2 deploy-hårdning (2026-03-25): **`docs/architecture/deploy-precheck.md`** beskriver auto-fixar + **opt-out** (`skipAutoFix` / `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX=1`); **`POST /api/v0/deployments`** ger **409** (`DEPLOY_MISSING_ENV`) om obligatoriska env saknas efter preflight; valfri body **`precheckOnly`** för torrkörning utan credits.
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
- **W4 (hamta + lab):** **`hamta_sidor_branch_emil.py`** kanon + **`--legacy-wide-use-cases`**; **`scripts/hamta_sidor.py` borttagen** (ersätts av flaggan). **`scripts/labs/testning_scarf/`** + `package.json` / ignore-filer. Uppdaterat: `scripts/README.md`, `scripts-scaffolds-inventory.md`, `research/external-templates/README.md`, `track-w4-scripts.md`, `scraped-scorefolds-pipeline.md`, `devtools/README.md`.
- **W1 (landning, del):** `ParticleOrb` in-view innan WebGL; reduced-motion → statisk orb; `IntegrationCard` + feature-modal partiklar utan `float-particle-kf` vid reduce (`usePrefersReducedMotion`). **W1 (footer/produkt):** sidor **`/om`**, **`/blogg`** + footer-länkar + sitemap. Se `track-w1-landing-followups.md`.
- **Terminologi / legacy:** `scripts/README.md` + `research/external-templates/README.md` — tydlig särskiljning: **15 = `EVAL_PROMPTS`**, **12+2 = skrap-kärna** (`USE_CASES_CORE`/`EXTENDED`), **5 = scorecard**; **icke-kanon** (`vercel_templates_levels/`, `--legacy-wide-use-cases`). *Lokala eval-rapporter under `eval-output/` (gitignorerad).*

## Next (recommended order)

1. ~~`LandingBackground` (shader/grid/noise) till egen komponent; semantiskt per läge; reduced-motion / in-view för 3D.~~ **Klart** (in-view för övrig 3D kvar vid behov).
2. ~~Utöka `integrationRegistry` + manifest + deploy-readiness~~ **Klart** (uppföljning: tunnare auto-fix / valideringsfas före deploy om behov).
3. ~~Own-engine remediation (`2.txt`) enligt **track W3**~~ **Klart** (se `track-w3-own-engine.md`, Fas A W3 i MASTER-ROADMAP). **Kvar i helhetsbilden:** ev. SSE/own-engine utanför track; integrationer+deploy-segment om ni prioriterar det.
4. ~~Scripts-städ (`3.txt`) — lab-flytt + `package.json`~~ **Klart** (W4 exit; se `track-w4-scripts.md`).

## Uncertainties / product follow-ups

- **Blogg:** sidan `/blogg` är en ärlig placeholder tills riktiga artiklar finns.
- Social copy ersätter länkar tills URL:er finns.
