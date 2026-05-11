# 02 — Förbättringar

> **Definition:** Allt funkar idag, men det kan bli **bättre**, **snabbare**, **billigare** eller **enklare att underhålla**. Skiljer sig från en *bugg* (där något inte funkar).

Indelning: **enkla** (≤2h) → **medel** (½–2 dagar) → **stora** (3+ dagar).

---

## §1 ENKLA förbättringar (totalt ~1 dag)

### §1.1 Prometheus/OpenTelemetry-export — **DONE 2026-04-20**

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/observability/metrics.ts` (singleton-modul, hot-reload-säker) + `src/app/api/metrics/route.ts` (auth-skyddad GET) + wire-in i `validate-and-fix.ts` (phase duration + early-stop) + `verifier-pass.ts` (phase duration + per-finding blocking-counter) + `finalize-version.ts` (partial-file-repair outcome) |
| **Status** | Klart 2026-04-20. `prom-client@^15` installerat. Singleton-Registry cachas på `globalThis.__sajtmaskinMetricsRegistry` så Next dev-mode hot-reload inte duplicerar metrics. 12 kanoniska faser i `OBSERVED_PHASES` (utan `pre_vm_typecheck` — uppgår i `validate_syntax` sedan W3). Custom-metric-prefix `sajtmaskin_*`. Default Node process-metrics aktiverade. Auth via bearer-token i `Authorization`-header eller `?token=`-query mot `SAJTMASKIN_METRICS_TOKEN`-env (tom/unset = 503 disabled, fel = 401, rätt = 200 + Prometheus text-format). Token-key dokumenterad i `config/env-policy.json`. **17 nya vitest-tester gröna** (9 metrics-modul + 8 API-route). Helpers `recordPhaseDuration / incFixerCall / incVerifierBlocking / incPartialFileRepair / incEarlyStop` är fail-safe (`try { ... } catch {}` på alla call-sites så telemetri aldrig bryter codegen). Avlåser audit Tier A #12 (P50 metric), #16 (early-stop-inventering) och §3.1-data (FORCE_BLOCKING_IDS rate). |

---

### §1.2 ESLint flat config + `--cache`

| Fält | Värde |
|------|-------|
| **Fil** | `eslint.config.js` (om finns) eller `.eslintrc.*` |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 1 timme |
| **Kostnad infra** | 0 |
| **Värde** | `npm run lint` 5–10× snabbare i utveckling |

**Manual:**

1. Verifiera att flat config används (krävs i ESLint 9 som ni redan har).
2. Lägg `--cache --cache-location .eslintcache` i `package.json` lint-script.
3. Lägg `.eslintcache` i `.gitignore`.

---

### §1.3 `npm run typecheck` — använd `tsc --build` med projektreferenser — **EFFEKTIVT REDAN GJORT 2026-04-20**

| Fält | Värde |
|------|-------|
| **Fil** | `tsconfig.json`, `package.json` |
| **Status** | `tsconfig.json` har redan `incremental: true` (rad 18). `tsc --noEmit` läser och uppdaterar `tsconfig.tsbuildinfo` automatiskt. Mätt 2026-04-20: cold = 27s, warm = 8s (3.4× snabbare). `.tsbuildinfo`-filen är redan i `.gitignore` (rad 22). Audit-rekommendationen att introducera `tsc --build` med `composite: true` skulle krocka med Next.js-setupen (`noEmit: true` + paths-aliasing kan inte enkelt kombineras med composite-mode utan `outDir` + .d.ts-emit). Värdet (3.4× speedup) är redan uppnått utan ändringar — explicit `tsc --build` skulle inte ge mätbar ytterligare vinst utan stort omkast. **Skipped som non-issue.** |

---

### §1.4 Verifiera F2 quality gate-policy

> **Superseded 2026-04-23:** F2 `designPreview` är medvetet typecheck-only. `build`/`lint` ligger i warm-cache-/pre-VM-passen och F3 `integrationsBuild`. Se `docs/schemas/quality-gate.md` och `config/ai_models/manifest.json`.

| Fält | Värde |
|------|-------|
| **Fil** | `config/ai_models/manifest.json` (`qualityGateTiers.designPreview`) |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 1 timme + monitor i en vecka |
| **Kostnad infra** | 0 enligt nuvarande policy (F2 typecheck-only; build/lint i warm-cache/F3) |
| **Värde** | Fångar Next-runtime-fel *före* preview-iframe — undviker "ren HTML"-incidenter |

**Historisk manual:** Se [`01-buggar.md`](./01-buggar.md) §1.5. Ska inte återinföras i F2 utan nytt explicit policybeslut.

> **Trade-off:** Om bootkostnaden är intolerabel, kör `build` bara på explicit "Refresh preview"-klick, inte automatiskt vid varje finalize.

---

### §1.5 Slå ihop `predev` och `prebuild` så de delar logik

> **DONE:** `predev` och `prebuild` delar `preflight:common`; aktuell checkkedja ägs av `package.json`.

| Fält | Värde |
|------|-------|
| **Fil** | `package.json` (`predev`, `prebuild`) |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 30 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Mindre dupliceringsbug: `predev` och `prebuild` ska dela en gemensam preflight-kedja. |

**Manual:**

1. Skapa gemensam preflight-kedja som `predev` och `prebuild` anropar.
2. Låt aktuell checklista ägas av `package.json` → `preflight:common`.

---

### §1.6 Ta bort `data/dossiers/`-untracked spam i `git status`

| Fält | Värde |
|------|-------|
| **Fil** | `.gitignore` |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 30 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Renare `git status` |

**Manual:**

1. Verifiera om `data/dossiers/*/components/` ska commitas eller är generation-output.
2. Om generation-output: lägg pattern i `.gitignore`.
3. Om committed avsiktligt: ingen åtgärd, men dokumentera i `data/dossiers/README.md`.

---

### §1.7 Auto-archive avklarade planer — **DONE 2026-04-20**

| Fält | Värde |
|------|-------|
| **Fil** | `scripts/plans/auto-archive.mjs` |
| **Status** | Klart 2026-04-20. Pragmatisk variant istället för audit-rapportens YAML-frontmatter-approach (våra plan-filer använder prosa-status, inte YAML). Default = `npm run plans:archive` = **dry-run** som listar kandidater; `npm run plans:archive:apply` kör `git mv`. Skippar `Kvarvarande-uppgifter.md` + `README.md` (levande listor). Datum-tröskeln (30 dagar) är slopad — vi har för få plan-filer för att det ska vara meningsfullt; status-rad räcker som signal. README-rad i `docs/plans/avklarat/README.md` läggs medvetet manuellt så att leveransbeskrivningen får meningsfull text. |

---

### §1.8 Lägg `.editorconfig` för konsekvent indentation

| Fält | Värde |
|------|-------|
| **Fil** | `.editorconfig` (ny) |
| **Svårighet** | Enkel |
| **Tidsåtgång** | 15 minuter |
| **Kostnad infra** | 0 |
| **Värde** | Konsekvent indent över IDE:er; stöder onboarding |

---

## §2 MEDEL förbättringar (totalt ~2 veckor)

### §2.1 P50 prompt → live-preview-metric som Top-line OKR

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/observability/`, ny dashboard i Streamlit |
| **Svårighet** | Medel |
| **Tidsåtgång** | 2 dagar |
| **Kostnad infra** | 0 |
| **Värde** | Tvingar fram fokus på user-facing latency (idag mäts pipeline-fas-tid men inte end-to-end-tid som upplevs av användaren) |

**Manual:**

1. Definiera "live-preview" som "första HTML-svar med `<body>` med >100 chars synlig text" från preview-iframe.
2. Mät P50/P95 från `POST /api/engine/chats/stream` start → preview-ready.
3. Visa i `backoffice/pages/observability.py` (eller liknande).
4. Sätt mål: **P50 < 30 sek** för att vara konkurrenskraftig.

---

### §2.2 Switch från `pg` (raw client) till `@neondatabase/serverless` om Neon används

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/db/*` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag |
| **Kostnad infra** | 0 (lika hosting), möjligen lägre cold-starts |
| **Värde** | Bättre Vercel/edge-kompat, lägre latency |

> **Skippa** om ni inte är på Neon. Drizzle-koden är portabel.

---

### §2.3 Konsolidera prompt-assist-modeller till en lista

| Fält | Värde |
|------|-------|
| **Fil** | `config/ai_models/manifest.json` (`promptAssist.allowed`) |
| **Svårighet** | Medel |
| **Tidsåtgång** | ½ dag |
| **Kostnad infra** | 0 |
| **Värde** | Mindre kognitiv last när modeller byts |

Idag finns två separerade arrayer (`gatewayClassModels` och `anthropicDirectModels`). Slå ihop till en `allowed`-lista och låt provider härledas från prefix (`openai/...`, `anthropic/...`, `anthropic-direct/...`).

---

### §2.4 Eval-suite som CI-gate, inte bara CLI

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/gen/eval/`, ny GitHub Action |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag |
| **Kostnad infra** | +20–40 USD/mån (LLM-anrop i CI) |
| **Värde** | Regressioner i prompt-output fångas innan merge |

**Manual:**

1. Sätt up `npm run eval:gate` att köra på PR.
2. Jämför mot baseline `src/lib/gen/eval/eval-baseline.json`.
3. Block merge om regression > X%.
4. Optional: kör bara på changed paths under `src/lib/gen/`.

---

### §2.5 Strukturerad logging (JSON) istället för fritext

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/utils/debug.ts`, `src/lib/logging/*` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 2 dagar |
| **Kostnad infra** | 0 |
| **Värde** | Loggar är queryable (Datadog/Vector/Loki), inte bara grep-bara |

---

### §2.6 Server-Sent Events → WebSocket för stream

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/gen/stream/*` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 3 dagar |
| **Kostnad infra** | 0 |
| **Värde** | Bidirektionell kommunikation tillåter användaren att avbryta/styra mid-generation |

> **Skippa om SSE räcker** — gör bara om ni vill ha live "pause/inject"-funktionalitet i UI.

---

### §2.7 Brief-cache per chatId+promptHash — **DONE 2026-04-20**

> Klart i Etapp K.2 (commit `70b22f861`). `src/lib/api/ai/brief-cache.ts` cacher i Redis 24h på `brief:v1:<modelId>:<chatId-or-anon>:<sha256-24>`. Gated på `FEATURES.useRedisCache`. Headers `X-Brief-Cache: hit|miss|skip`. Counter `sajtmaskin_brief_cache_total{outcome}`. Tester 8/8 + 1 metric-test. Caveat: chatId är alltid `null` i HTTP-routen idag (`briefRequestSchema` accepterar inte chatId); helper-signaturen stödjer chatId för framtida server-auto-brief-callers. Original audit-recipe nedan, behållen som historik.

| Fält | Värde |
|------|-------|
| **Fil** | `src/app/api/ai/brief/route.ts` |
| **Svårighet** | Medel |
| **Tidsåtgång** | ½ dag |
| **Kostnad infra** | -2 USD/mån (mindre brief-LLM) + Redis (redan installerat) |
| **Värde** | Identiska prompts (refresh, retry) går snabbare |

---

### §2.8 Komponenttester på buildern (Vitest + Testing Library)

| Fält | Värde |
|------|-------|
| **Fil** | `src/components/builder/*` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 3 dagar |
| **Kostnad infra** | 0 |
| **Värde** | Höjer förtroendet för UI-refactors |

---

### §2.9 Storybook eller Ladle för komponentkatalog

| Fält | Värde |
|------|-------|
| **Fil** | (ny `.storybook/` eller motsvarande) |
| **Svårighet** | Medel |
| **Tidsåtgång** | 1 dag setup + löpande |
| **Kostnad infra** | 0 |
| **Värde** | Snabbare iteration på UI; designkommunikation |

---

### §2.10 Översätt primärdokumentation till engelska

| Fält | Värde |
|------|-------|
| **Fil** | `docs/architecture/system-overview.md`, `docs/architecture/repo-tree.md`, `docs/architecture/glossary.md`, `AGENTS.md` |
| **Svårighet** | Medel |
| **Tidsåtgång** | 2 dagar |
| **Kostnad infra** | 0 |
| **Värde** | Sänker bus factor från 1 → flera; möjliggör externa bidrag |

> **Politiskt val:** Du kan välja att stanna på svenska. Då accepterar ni bus factor 1.

---

## §3 STORA förbättringar (totalt ~3 månader)

### §3.1 Migrera live-preview från Fly-VM → StackBlitz WebContainers

| Fält | Värde |
|------|-------|
| **Fil** | `preview-host/*` (kommer fasas ut), nytt: `src/lib/preview-webcontainer/*` |
| **Svårighet** | Stor |
| **Tidsåtgång** | 2–3 veckor |
| **Kostnad infra** | -60 USD/mån (Fly-machine bort) + ~99 USD/mån StackBlitz Enterprise (eller gratis fram till volym) |
| **Värde** | **Detta är den enda single-störst-förbättringen som finns.** Boot 2-5 min → ~5 sek. End-user latency går från "tester orkar inte" till "wow". |

**Manual:**

1. **Validera:** kör en POC med `@webcontainer/api` i en sida av buildern, se om Next.js 16 boot:ar i WebContainer.
2. **Identifiera blockers:** WebContainer kör Node.js i webbläsaren — ingen native code, inget riktigt filsystem. Tunga deps (`@react-three/rapier` har WASM, `pdf-parse` använder native) kan kräva fallback.
3. **Hybrid-strategi:** lätta scaffolds (landing-page, blog) → WebContainer; tunga scaffolds (`ecommerce` med rapier) → fortsatt Fly-VM.
4. **Migrera kontraktet:** `preview-session` API ska abstrahera båda backends så switchen är transparent.
5. **Stäng Fly-VM** när 90 % av användare är på WebContainer-pathen.

> **Detta är åtgärden som tar er från 6.5 → 8 i betyg.**

---

### §3.2 Egen finetuning av en open-source-modell för scaffold-aware codegen

| Fält | Värde |
|------|-------|
| **Fil** | (helt ny pipeline) |
| **Svårighet** | Stor |
| **Tidsåtgång** | 2 månader |
| **Kostnad infra** | -100 USD/mån (mindre OpenAI/Anthropic) +50 USD/mån (egen GPU eller Replicate-inference) |
| **Värde** | Lägre löpande kostnad, ingen vendor-lock, snabbare inference för upprepade mönster |

> **Skippa om ni inte når X användare/månad** — ROI är dålig under låg volym.

---

### §3.3 Konvertera scaffolds till runtime-loadable från registry

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/gen/scaffolds/` |
| **Svårighet** | Stor |
| **Tidsåtgång** | 2 veckor |
| **Kostnad infra** | 0 |
| **Värde** | Kunder/community kan bidra med scaffolds utan att forka repot |

---

### §3.4 Visual-QA på preview (Playwright + LLM-vision)

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/gen/verify/visual-qa.ts` (finns redan stub) |
| **Svårighet** | Stor |
| **Tidsåtgång** | 3 veckor |
| **Kostnad infra** | +30 USD/mån (vision-LLM-anrop) |
| **Värde** | Fångar visuella regressions (bruten layout, dåliga kontraster, "ser ut som AI-slop") som typecheck inte ser |

---

### §3.5 Vita-label / multi-tenant deployment

| Fält | Värde |
|------|-------|
| **Fil** | `src/lib/db/schema.ts`, hela auth-laget |
| **Svårighet** | Stor |
| **Tidsåtgång** | 1 månad |
| **Kostnad infra** | 0 |
| **Värde** | SaaS-affärsmodell möjlig |

---

## Statistik

| Svårighet | Antal | Total tid | Total löpande/mån |
|-----------|-------|-----------|-------------------|
| Enkel | 8 | ~1 dag | +0–5 USD |
| Medel | 10 | ~2 veckor | +20–40 USD |
| Stor | 5 | ~3 månader | -100 USD (om §3.1 + §3.2 körs) |
| **Summa** | **23** | **~3 mån** | **netto -60 USD/mån** |

---

## Vad denna fil INTE täcker

- **Buggar** — se [`01-buggar.md`](./01-buggar.md)
- **Pipeline-konsolidering** — se [`03-konsolidering-pipeline.md`](./03-konsolidering-pipeline.md) (där ligger huvudfokus)
