# Miljövariabler (kort översikt)

**Den här filen är inte “source of truth”.** Den ska bara hjälpa människor att snabbt förstå *vad som krävs*, *vad som är valfritt*, och *var sanningen finns i kod*.

**Viktigt:** `.env.local` i **repo-roten** gäller **Sajtmaskin-appen**. En **annan** `.env.local` finns i **användarens genererade Next-projekt** (preview-VM / export) — se avsnitt *Genererade användarsajter*, [`.cursor/rules/terminology.mdc`](../.cursor/rules/terminology.mdc) och [`docs/architecture/glossary.md`](architecture/glossary.md) (§ Env-lager). Rotens `.env*` är ofta gitignorerad **och** borttagen från Cursor-index (`.cursorignore`); agenter ser dem inte om du inte öppnar dem explicit.

| Källa | Roll |
|--------|------|
| [`src/lib/env.ts`](../src/lib/env.ts) | Alla namn som appen faktiskt läser (Zod `serverSchema`). |
| [`config/env-policy.json`](../config/env-policy.json) | Klassificering per nyckel (`shared_runtime`, `optional_runtime`, `vercel_managed`, …), rekommenderade Vercel-miljöer, `knownEmptyOk`, m.m. |
| [`docs/generated/policies.generated.md`](generated/policies.generated.md) | Genererad, hemlighetsfri referens för env- och generationspolicy. Äger inga beslut. |
| [`scripts/env/manage_env.py`](../scripts/env/manage_env.py) | Kanonisk env-CLI för audit / status / sync mot lokala filer och Vercel. |

**Djupare ämnesdokument** (lägg inte in backlog eller långa tabeller här):

- Preview / VM / credentials: [`architecture/llm-pipeline.md`](./architecture/llm-pipeline.md)
- Modeller / assist / builder-generering: [`schemas/model-build-profiles.md`](schemas/model-build-profiles.md), [`generated/models.generated.md`](generated/models.generated.md)
- Historisk nyckeljämförelse (utan hemligheter): borttagen — se git-historik

---

## Måste i praktiken (normal drift)

Utan dessa brukar kärnan inte vara användbar i **preview + production**:

| Variabel | Kommentar |
|----------|-----------|
| `POSTGRES_URL` | Postgres (t.ex. Supabase). Lokalt ska `.env.local` peka på separat dev/staging-target, inte samma target som production. |
| `JWT_SECRET` | Session / auth. |
| `OPENAI_API_KEY` | Own-engine codegen + OpenAI-spår i prompt-assist (se kod). |
| `NEXT_PUBLIC_APP_URL` | Publik bas-URL för appen (default i schema: `http://localhost:3000`). |

Sätt dem i **`.env.local`** lokalt och i **Vercel → Environment Variables** för `development` / `preview` / `production` enligt behov.

> **CI auto-migration-secret — `POSTGRES_URL_PROD`:** GitHub Actions-jobbet `prod-migrations-apply` ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) auto-applicerar DB-migrationer mot prod vid push till master, och kräver repo-secret:en `POSTGRES_URL_PROD` (poolad prod-URL, samma värde som Vercels `POSTGRES_URL` i production). Sätt/rotera med `gh secret set POSTGRES_URL_PROD`. **Saknas den på huvudrepot faller CI-jobbet rött** (inte tyst grönt) så en glömd migration inte kan slinka till prod oupptäckt. Detaljer: [`.cursor/rules/db-env-parity.mdc`](../.cursor/rules/db-env-parity.mdc).

---

## Vanliga tillägg (funktioner ovanpå)

| Område | Exempel på variabler | Kommentar |
|--------|----------------------|-----------|
| Cache / rate limit | `REDIS_URL`, `UPSTASH_REDIS_REST_URL` + token | Cache kan degradera utan Redis. Rate limiting använder Upstash REST när det finns; i produktion failar rate-limitade routes stängt om REST saknas, om du inte explicit sätter `SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD=true` för nödläge/dev-lik deploy. |
| Blob / uppladdning | `BLOB_READ_WRITE_TOKEN` | Vercel Blob; lokalt kan vissa flöden falla tillbaka till filsystem (`DATA_DIR`). |
| Betalning | `STRIPE_*` | Om credits/betalning används. |
| E-post | `RESEND_API_KEY` | Utan: vissa mailflöden noop:ar. |
| OpenClaw / Sajtagenten | `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `IMPLEMENT_UNDERSCORE_CLAW` | Alla tre krävs för att den flytande widgeten och Sajtagenten-ytorna ska aktiveras. Utan en enda av dem visas ingen widget. **`OPENCLAW_GATEWAY_URL` får aldrig peka mot egen Next-host (`http://localhost:3000` eller appens egen prod-URL)** — då loopar `/api/openclaw/chat` och `/api/did/chat` tillbaka till `/v1/chat/completions` på sig själv och returnerar 404. Värdet ska peka mot den **separata gateway-tjänsten** (egen Render-instans, t.ex. `https://<din-gateway>.onrender.com`). Gateway-sidans tillåtna origins styrs av `SAJTAGENT_ALLOWED_ORIGINS` (+ `SAJTAGENT_TARGET_SITE_URL`) i `infra/openclaw/`, inte här — ny hostname kräver ingen kodändring. |
| OpenClaw debug-mode (opt-in) | `OC_DEBUG` (alias `OC_DEBUGG`), `OC_DEBUG_ALLOW_PROD`, `OC_REPO_READ_TOKEN`, `OC_REPO_SLUG` | **Opt-in, default av.** `OC_DEBUG=y` låser upp privilegierad debug-kontext (full genererad kod + verifierings-/reparationsfynd + **läs-only** Sajtmaskin-repo-kontext) och *armerad* bug-hunt-autonomi (OpenClaw får fylla builder-prompten och klicka send först efter ett uttryckligt armeringshandshake, med hårda tak). **Hård spärr:** aktiveras aldrig i production om inte `OC_DEBUG_ALLOW_PROD` också är affirmativ. `OC_REPO_READ_TOKEN` är en GitHub-token med **endast** `contents:read` — OpenClaw har ingen skriv-/PR-väg mot Sajtmaskin. `OC_REPO_SLUG` = `owner/repo`. Läses via `OPENCLAW.debugEnabled` i `src/lib/config.ts`. Modell: gateway bör köra `OPENCLAW_MODEL_PRIMARY=openai/gpt-5.5` (se `infra/openclaw/DEPLOY_INFO.txt`). |
| D-ID avatar (mAIa Klo) | `NEXT_PUBLIC_AVATAR_ENABLED`, `NEXT_PUBLIC_AVATAR_AGENT_ID`, `NEXT_PUBLIC_AVATAR_CLIENT_KEY` | Avataren aktiveras endast när `NEXT_PUBLIC_AVATAR_ENABLED=1` **och** bägge nycklarna finns. **Default av** (flaggan osatt eller `!= 1`) → ren textchatt även om nycklarna är satta. Det gör att nycklarna kan ligga i alla miljöer medan avataren hålls av tills flaggan vänds till `1` per miljö. Styr videokamera-togglen i OpenClaw-widgeten och `/avatar`-pilotytan. Origins måste vara allowlistade i D-ID Studio. |
| Tier 2 live preview | `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY`, `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | Preview-sessioner kör nu via preview-host / Fly. Detaljer: `llm-pipeline.md`. |
| Builder-chat MessageScroller | `NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER` | **Default på.** Bygger builder-chattens scroll på shadcn `@shadcn/react` MessageScroller (streaming utan hopp, förankring vid användarmeddelanden, bevarad läsposition vid historik-laddning, scroll-to-bottom). Sätt `0`/`false` för att falla tillbaka på den gamla enkla overflow-scrollen. Endast den publika flaggan läses — flaggan konsumeras i klientkomponenter, så en server-only-variabel skulle ge hydration-mismatch (SSR och klient renderar olika). Inlineas vid build → kräver ny deploy per miljö för att slå igenom. Källa: `src/lib/builder/message-scroller-feature.ts`, `src/components/ai-elements/conversation.tsx`, `src/components/ui/message-scroller.tsx`. |
| Inspector bridge (opt-in) | `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` (app), `SAJTMASKIN_APP_ORIGIN` (preview-host) | **Opt-in, default av.** Slår på instrumenterad "Inspektera preview" via injicerat script + `postMessage` (ingen Playwright/worker). App-flaggan aktiverar `bridge`-engine + `?inspect=1`-opt-in + serverar scriptet på `/api/inspect-bridge`; preview-hostens `SAJTMASKIN_APP_ORIGIN` är källa för det injicerade scriptet + tillåten parent-origin (tas från env, **aldrig** query). Båda osatta → dagens `map`/`ai`-beteende, ingen injektion. Källa: `src/lib/builder/inspect-bridge-*.ts`, `preview-host/src/runtime.js`. Plan: `docs/plans/avklarat/2026-06-19-inspector-rendering-arkitektur.md`. |
| F2 Product Postcheck | `SAJTMASKIN_F2_PRODUCT_POSTCHECK=true` | **Opt-in.** Kör server-side Playwright-kontroller mot betrodda F2-preview-URL:er (localhost / konfigurerad preview-host / `vm-fly-jakem.fly.dev`) och skriver `product_postcheck.*`-warnings till befintlig versionsdiagnostik. Default av. Fail-open: om Playwright saknas, URL ej tillåts eller timeout sker loggas `product_postcheck.skipped`; F2-render blockas inte. Blockerande produktfel kan däremot stoppa F3-triggern tills F2-previewn fungerar. Källa: `src/lib/gen/verify/product-postcheck.ts` + `/api/engine/chats/[chatId]/product-postcheck`. |
| Dossier-stub-refusal (false-green-härdning, A7-2) | `SAJTMASKIN_REFUSE_DOSSIER_STUBS=true` | **Opt-in (grandmaster A7-2).** När `true`/`1`: autofix vägrar fabricera en tyst null-render-stub för en dossier-exponerad import som LLM:n inte emitterade — den oresolvade importen **degraderar/blockar previewn ärligt** (preview blockad med orsak via `runProjectSanityChecks` `code_structure_failure`) i st.f. att skeppa en ihålig falsk-grön sida. **Default av** (kod-default oförändrad; aktiveras via env). Reversibelt: sätt `false`/unset för tyst-stub-beteendet. **Rekommenderad utrullning:** slå på i **preview** först och bevaka hur ofta legitima byggen blockas (frekvensen är LLM-runtime-beroende) innan production. Källa: `src/lib/gen/autofix/rules/cross-file-import-checker.ts` (`FEATURES.refuseDossierStubs`). |
| Preview-förvärmning (host-väckning + överlappad install) | `SAJTMASKIN_PREVIEW_PREWARM=true` | **Opt-in, default av — sätt inte nu.** Kräver både `SAJTMASKIN_PREVIEW_HOST_BASE_URL` och `SAJTMASKIN_PREVIEW_HOST_API_KEY`; utan API-nyckeln skippar appen prewarm (ingen förutsägbar unkeyed digest), medan vanlig lokal/non-prewarm-preview är oförändrad. En ny chats första riktiga codegen kan överlappa baseline-installationen; plan-mode, kontraktsklargörande och vanliga follow-ups skippar. Före kreditsettlement begränsas hostarbete av persistent lease: verifierad `userId`, annars `rateLimit.ts` betrodda IP-identitet, skickad som API-keyed HMAC. Bootfel behåller cooldown mot install-spray; real claim/update/patch/destroy/cleanup/expiry/reset släpper. HTTP håller skelettet icke-publikt, alla WS nekas; failed replacement visar stabil 503 tills explicit retry. Fast kod-cap 4096, ingen `PREVIEW_HOST_MAX_PREWARM_LEASES`-env. **Deployordning:** host `check`/guards/proxy/smoke + Fly health först, app därefter; ingen aktivering i denna ändring. |
| Pre-VM typecheck | `SAJTMASKIN_PRE_VM_TYPECHECK=true`, ev. `SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT` | Aktiverar `tsc --noEmit` mot varm scaffold-cache före VM. F3-genereringar tvingar alltid på den (men även F3-force skippar fail-open om cachen är kall). Fail-open vid kall cache — flaggan ensam räcker inte, cachen måste vara provisionerad (`npm run provision:warm-cache`, verifiera med `npm run warm-cache:smoke`). Utfall per finalize syns i `site.done` → `warmTsc` (`ran` vs `skipped: cache_cold/feature_flag_disabled`). Källa: `src/lib/gen/preview/warm-typecheck.ts`. |
| Lokal warm-eslint-diagnostik | `SAJTMASKIN_BLOCKING_ESLINT=true`, ev. `SAJTMASKIN_BLOCKING_ESLINT_MAX_WARNINGS=20` | Explicit opt-in lokal diagnostik mot warm-cache. Den anropas inte av finalize, startar aldrig RepairGate och påverkar aldrig promotion. VM-ReleaseGate är enda auktoritativa lintägaren. |
| F2/F3 quality gate på VM | **Inte env** — ligger i `config/ai_models/manifest.json` → `qualityGateTiers` | `designPreview` = `typecheck`; `integrationsBuild` = `typecheck → lint → build`. Läses i `src/lib/gen/verify/quality-gate-checks.ts`. |
| LLM-fixer timeout | `SAJTMASKIN_LLM_FIXER_TIMEOUT_MS`, `SAJTMASKIN_LLM_FIXER_TIMEOUT_RETRY_MS` | Tuning för LLM-fixern i server-verify/manuell repair. Defaults: 180s primär attempt, 240s reducerad retry (höjt 2026-07-01 från 90s/120s — en för snål budget kapade reparationen mitt i och gav truncated/near-silent output). Använd när stora filer ger `llm_fixer_aborted` trots bra felkontext. |
| F2/F3 placeholder-fragments | (inga env-vars; två filer i `config/ai_models/`) | F2 mergar `40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`. F3 (`/finalize-design`) stripar tier-3-stubben och kräver riktiga värden via stored project env vars. Per-key-klassificering: `src/lib/integrations/placeholder-harmless.ts`. |
| Publicerade standardadresser + SEO (F3) | `SAJTMASKIN_BRANDED_LIVE_URLS=true`, `SAJTMASKIN_LIVE_SITE_DOMAIN=sites.sajtmaskin.se` | **Feature-gated.** Varje användarsajt får då en exakt standardadress under den angivna parent-hostnamen. SEO väljer verifierad egen domän, annars verifierad varumärkt standardadress; tills rollout är klar får projektets sparade SEO-URL vara fallback. Sätt inte en global SEO-URL — den skulle peka flera tenants mot samma domän. Aktivera först efter DNS/TLS-verifiering för parent-domänen. |
| Statisk Visual QA (heuristik) | `SAJTMASKIN_VISUAL_QA` satt till `1` eller `true` | Efter att **alla** verify-lanekontroller passerat kan appen köra `analyzeVisualQuality` på exportabla filer (ingen screenshot). Resultatet syns i quality-gate-svar och kan loggas kompakt i `preflight:quality-gate`-meta. Standard är av. Validerad via `serverSchema` i `env.ts` och läses via `getServerEnv()` i `src/lib/gen/verify/visual-qa.ts`. |
| Rate-limit proxy trust | `SAJTMASKIN_TRUST_X_FORWARDED_FOR=true` | **Opt-in för produktion.** Använd bara om edge/proxy är betrodd och strippar spoofade `x-forwarded-for`-headers. Utan flaggan använder produktion `x-real-ip` eller `unknown`; dev/test fortsätter acceptera `x-forwarded-for`. |
| LLM reasoning/thinking | `SAJTMASKIN_DEFAULT_THINKING=true` | Kanonisk server-side default för reasoning/thinking-flaggan i kodgenerering. Gäller när klienten inte skickar ett explicit val. Legacy-aliaset `SAJTMASKIN_SHOW_THINKING` togs bort i omtag-04 (2026-04-23). |
| Dossier pipeline (v2) | `SAJTMASKIN_DOSSIER_PIPELINE=true` | Aktiverar deterministic capability-driven dossier-urval. Läser `data/dossiers/{hard,soft}/<id>/manifest.json` direkt och matchar `brief.requestedCapabilities` 1:1 mot dossiers. Injicerar `## Available Dossiers` + `## Selected Dossier Instructions` + `## Dossier Files To Emit Verbatim` i system-prompten. **Kod-default:** på i alla miljöer; stäng av explicit med `SAJTMASKIN_DOSSIER_PIPELINE=false` eller `0` (fallback i `src/lib/config.ts`). **Deploy-status sedan 2026-04-23:** explicit satt till `true` på alla tre Vercel-miljöer (Development / Preview / Production). Inga tuning-knoppar — det finns inga fler `DOSSIER_*`-variabler. Se [`docs/contracts/dossier-system.md`](contracts/dossier-system.md). |
| Klient-autofix-tak | `NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT=3`, `NEXT_PUBLIC_AUTOFIX_MAX_PER_REASON=1`, `NEXT_PUBLIC_AUTOFIX_DEDUPE_TTL_MS=300000` | Styr klient-driven **automatisk** autofix i [`useAutoFix.ts`](../src/lib/hooks/chat/useAutoFix.ts). Värdena ovan är defaults. Max-per-chat (default **3**) hindrar oändliga repair-loopar; sätt `=1` för den gamla konservativa loopen. Max-per-reason (1) hindrar att samma fel-typ lagas om automatiskt. Manuell "Kör autofix" (Version Diagnostics) bypassar taken. NEXT_PUBLIC_-prefix krävs eftersom värdena läses i klient-bundlen. |
| Deferred extra init routes | `SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT=true` | Opt-in för att låta init-genereringar (inklusive `isFirstCodeGeneration`-fallet efter scaffold/contract-gate) planera flera routes men bara fullt realisera primärrouten direkt. Extrasidor blir då giltiga shells med tydlig `Skapa sida`-yta. På follow-up bevaras shells automatiskt om inte användaren explicit ber om att bygga ut en specifik sida. Default av. |
| Lokal dev-logg | `SAJTMASKIN_DEV_LOG` styr `devLog` (se kod); `GENERATIONSLOGG` styr generationsloggen | Validerade via `serverSchema` men listade i `runtimeOnlyKeys` i `config/env-policy.json` så env-tooling (`manage_env.py`) inte kräver dem i `.env.local`/Vercel-snapshots. Default av. `logs/generationslogg/` behåller bara de 5 senaste körningarna. `SAJTMASKIN_LOG` / `file-logger.ts` är borttagna (2026-04). `SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS` togs bort i omtag-04 (hårdkodat 10 000 ord). |
| Postgres-pool | `POSTGRES_POOL_MAX`, `POSTGRES_POOL_IDLE_TIMEOUT_MS` | Override för pool-storlek + idle-timeout per processinstans i [`src/lib/db/client.ts`](../src/lib/db/client.ts). Default väljs automatiskt: pooled connection (Supabase pgbouncer / `?pgbouncer=true` / hostname `pooler.*` / port 6543/5433) får `max=3` + idle 5s, direkt Postgres får `max=10` + idle 30s. Sätt `POSTGRES_POOL_MAX` lägre om du ser `EMAXCONNSESSION: max clients` i Fly-loggar (SAJ-7 / B1). |
| Övrigt | Se `serverSchema` i `env.ts` | Allt som appen läser ska finnas där. |

> **Termnot — `runtimeOnlyKeys` i `env-policy.json`** styr env-tooling (`manage_env.py`, audit, reconcile) så vissa nycklar inte behöver finnas i `.env.local`/Vercel-snapshots. Det betyder **inte** "saknas i `serverSchema`" — t.ex. `SAJTMASKIN_DEV_LOG` och `SAJTMASKIN_VISUAL_QA` finns i båda. `serverSchema` är fortsatt single source of truth för varje env-var appen läser.

---

## Lokalt vs Vercel

| Plats | Vad |
|--------|-----|
| **`.env.local`** (gitignored) | Lokala hemligheter och dev-overrides. |
| **Vercel Dashboard / `vercel env`** | Sanning för deployade miljöer; samma *nycklar* som i `env.ts`, olika *värden* per `development` / `preview` / `production`. |
| **Vercel-managed** | Nycklar som plattformen eller Next sätter (t.ex. `NODE_ENV`, `VERCEL_URL`) — **pusha inte** egna värden från laptop om policyn säger motsatsen; se `classification: vercel_managed` i `env-policy.json`. |

`.vercel/.env.*.local` från `vercel env pull` är **snapshot**, inte kanon.

---

## Borttagna flaggor (omtag-04, 2026-04-23)

Följande `SAJTMASKIN_*`-flaggor togs bort från `serverSchema` (`src/lib/env.ts`) och `config/env-policy.json`. Beteendet lever kvar som hårdkodade konstanter i `src/lib/config.ts` (`FEATURES`, `FOLLOW_UP_TUNING`) eller `src/lib/logging/devLog.ts`.

| Borttagen flagga | Ersatt av | Effekt |
|---|---|---|
| `SAJTMASKIN_SHOW_THINKING` | `SAJTMASKIN_DEFAULT_THINKING` | Legacy-alias borttaget; sätt den kanoniska flaggan direkt. |
| `SAJTMASKIN_CONSISTENT_REPAIR_PASS_INDEX` | inlinad i `persist-side-effects.ts` | SAJ-25-härdningen är ovillkorlig (FEATURES.consistentRepairPassIndex togs bort 2026-04-28). |
| `SAJTMASKIN_VERIFIER_RERUN_AFTER_FIX` | inlinad i `verifier-phase.ts` | Verifier-rerun efter LLM-fixer är ovillkorlig (FEATURES.verifierRerunAfterFix togs bort 2026-04-28). |
| `SAJTMASKIN_SKIP_DOUBLE_VALIDATE_AND_FIX_ON_MERGE` | inlinad i `finalize-preflight.ts` | Mekanisk-only på merged-syntax-fail är ovillkorlig (FEATURES.skipDoubleValidateAndFixOnMerge togs bort 2026-04-28). |
| `SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT` | `FEATURES.recurringPatternsInMainPrompt = NODE_ENV === "development"` | Bevarar dev-on/prod-off-defaulten; ändras i kod. |
| `SAJTMASKIN_USE_ERROR_LOG_RAG` | `FEATURES.useErrorLogRag = NODE_ENV !== "test"` | RAG på överallt utom test. Dev = lokal NDJSON + on-disk-snapshot; prod = Postgres-store (`error_log_events`), gated av `dbConfigured` (no-op utan DB). Cross-tenant-träffar redigeras (faultText utelämnas) i prompt-renderingen. |
| `SAJTMASKIN_FOLLOWUP_HISTORY_PAIRS` | `FOLLOW_UP_TUNING.maxRecentHistoryPairs = 4` | Konstant. |
| `SAJTMASKIN_FOLLOWUP_LIGHT_MAX_CHARS` | `FOLLOW_UP_TUNING.lightContextMaxChars = 32_000` | Konstant. |
| `SAJTMASKIN_FOLLOWUP_LIGHT_FILES_MANY` | `FOLLOW_UP_TUNING.lightContextMaxFilesManyFiles = 4` | Konstant. |
| `SAJTMASKIN_FOLLOWUP_LIGHT_FILES_FEW` | `FOLLOW_UP_TUNING.lightContextMaxFilesFewFiles = 6` | Konstant. |
| `SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS` | `DEFAULT_DOC_MAX_WORDS = 10_000` i `devLog.ts` | Konstant. |

Behöver du ändra beteende nu? Justera koden.

---

## Tier 2 preview-host vs app-env

När `preview-host` används på Fly finns **två** olika env-ytor:

- **Repo-rotens `.env.local` (Sajtmaskin-appen):** `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES`, och `SAJTMASKIN_PREVIEW_HOST_API_KEY` när preview-host kör icke-lokalt.
- **Preview-host-tjänsten (Fly):** `PREVIEW_HOST_API_KEY`, plus host-sidans `PREVIEW_HOST_DATA_DIR=/data` i `preview-host/fly.toml` eller motsvarande service-env. Plus `SAJTMASKIN_PREVIEW_DISABLE_HMR` (default `true`) som styr om webpack-HMR-pluginen inaktiveras i preview-VM:ens Next dev — av som default eftersom Fly's edge-proxy droppar WS-handshakes på `/<chatId>/_next/webpack-hmr`-pathen och annars spammar klient-konsolen. Sätt `false` för att återaktivera HMR vid direkt-debug av VM:en. Valfritt även `SAJTMASKIN_APP_ORIGIN=https://<app-origin>` (opt-in inspector-bridge) — källa för det injicerade inspect-scriptet + tillåten parent-origin; osatt → ingen injektion.

Praktisk rekommendation:

- Sätt `SAJTMASKIN_PREVIEW_HOST_BASE_URL=https://<din-app>.fly.dev` (root-URL, inte `/preview`)
- Sätt `SAJTMASKIN_PREVIEW_HOST_API_KEY` i appens env och samma secret som `PREVIEW_HOST_API_KEY` på preview-hosten
- Sätt `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev`
- Låt `PREVIEW_HOST_DATA_DIR=/data` leva på host-sidan (`fly.toml` / Fly-env), inte i repo-rotens `.env.local`
- Låt `SAJTMASKIN_PREVIEW_DISABLE_HMR=true` (default) ligga på host-sidan; ändra bara om du behöver hot-reload mellan kod-ändringar i en pågående preview-VM

När `SAJTMASKIN_PREVIEW_HOST_BASE_URL` finns satt behandlar appen preview-host som den aktiva tier-2-vägen.

### Env-precedence för genererade användarsajter

| Lager | Roll | Stoppar F2/F3? |
|---|---|---|
| `env.example` / genererad env-dokumentation | Dokumentation för användaren | Nej |
| Harmless placeholders + tier-3 stub placeholders | Gör F2-designpreview körbar utan riktiga integrationer | Nej för F2; vanlig F3-codegen strippar tier-3-stubbar. Deterministisk no-build-key-fork bevarar F2-filträdet exakt men behandlar stubbar fortsatt som Advisory/icke-bevis |
| Project env vars (`projectEnvVars`) | Effektiva runtime-värden för F3/deploy | Ja, om dossier-nyckeln har `enforcement: "build"` och saknas |
| Preview-host `.env.local` | Faktisk runtime-fil inne i preview-VM | Speglar lagren ovan via `buildPreviewEnvLocalContents()` |

F3-readiness ska alltså spegla **verkliga integrationkrav**, inte om en nyckel råkar finnas i `env.example`. `feature-runtime` rapporteras som warning och `warn-only` som info; bara `build`-enforcement blockerar. Efter #468 är `clerk-auth` den enda hard-dossiern med `build`-nycklar, så i praktiken är det bara saknade Clerk-nycklar (`CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) som blockerar en F3-publicering.

Om F3-specen helt saknar `requiredRealEnvKeys` är detta inte signal att
capabilityn saknas. `finalize-design` forkar då en ny `integrations`-version
från exakt samma F2-filer och kör ReleaseGate utan LLM. `feature-runtime` och
`warn-only` förblir Advisory tills användaren senare sparar riktiga
`projectEnvVars`; den visuella Byggblock-fallbacken bevaras.

**Ärlig publiceringsgrind (deploy-409):** `POST /api/v0/deployments` blockerar med `409 DEPLOY_MISSING_ENV` på `buildBlockingKeys` i F3 (`integrations`) — där hård-blockerar `feature-runtime`/placeholder-täckta nycklar aldrig; de surfar som icke-blockerande `EnvDegradationWarning` (`src/app/api/v0/deployments/env-degradation-warnings.ts`). I F2 (`design`) gäller `missingEnvKeys`-backstoppen (medvetet, #461): en okonfigurerad nyckel **utan katalog-placeholder** blockerar oavsett enforcement — dossier-nycklar träffas normalt inte i F2 (server-filer strippas, `env.example`-stubbar filtreras ur detektionen), men modellskrivna `process.env`-referenser utanför katalogen kan 409:a även en F2-publicering. F3-stream/finalize-design gatar dessutom på samma riktiga build-nycklar (`412 tier3_env_not_ready`) och visar serverns exakta nycklar i den persistenta, icke-modala F3-kravytan.

---

## Ny nyckel i projektet

1. Lägg till i [`src/lib/env.ts`](../src/lib/env.ts) (`serverSchema`).
2. Uppdatera [`config/env-policy.json`](../config/env-policy.json) (regel + ev. `extraKnownKeys` / targets).
3. Sätt värde i `.env.local` och i Vercel.
4. Kör `python scripts/env/manage_env.py audit` (eller `--strict` enligt er vana).

Djupare ämnen:

- Modellprofiler och override-nycklar: `docs/schemas/model-build-profiles.md`, `docs/architecture/llm-pipeline.md`, `config/ai_models/manifest.json`
- OpenClaw / avatar: `docs/architecture/system-overview.md`, `src/lib/config.ts`
- Exporterade Next-projekt och preview-host: `docs/architecture/llm-pipeline.md`, `preview-host/README.md`
- DB-skrivskydd: `scripts/README.md`

---

## Genererade användarsajter (preview / VM runtime)

Sajtmaskin **≠** den genererade Next-appen i preview-/VM-runtime. Merge av placeholders och projekt-env i VM sker i kod (`src/lib/gen/preview/env-local.ts`) med underlag från `config/ai_models/` — se **llm-pipeline.md**, avsnitt om tier-2 preview `.env.local`.

**F2-mock-seed:** i F2 (`design`) får varje vald dossiers env-nyckel som fortfarande saknar värde efter de vanliga lagren ett deterministiskt stub-värde (`dossierMockPreviewEnvValue`) i preview-`.env.local`, så dossierns UI renderar sitt mock-/demo-läge — även nycklar utanför placeholder-katalogen (t.ex. `EMAIL_FROM`, `CONTACT_EMAIL_TO`, `FAL_API_KEY`, `MAILCHIMP_*`). Seeden körs **aldrig** i F3 (stub-lagret strippas, riktiga värden krävs), persisteras **aldrig** till `projectEnvVars` och når **aldrig** en deploy, och matchar `stub-env-filter.ts` så den aldrig räknas som integrationsbevis. Ett riktigt användar-/modell-värde vinner alltid över seeden.

### Project env file (`env.example`) — användar­synlig dokumentationsfil

Varje genererad sajt får en egen `env.example`-fil i projektets filträd (syns i builderns filpanel). Den genereras av [`src/lib/gen/preview/project-env-file.ts`](../src/lib/gen/preview/project-env-file.ts) och **regenereras vid varje generering** så lokala ändringar skrivs över — riktiga värden ska in via env-panelen i F3, eller (lokalt) genom att kopiera till `.env.local`.

> **Filnamnet hette tidigare `env.env`.** Renamed 2026-04 till `env.example` för att följa standardkonventionen och tydliggöra att Next.js INTE läser filen vid runtime — det är ren dokumentation. Injectorn rensar gamla `env.env`-filer automatiskt vid nästa generering, så befintliga projekt slipper manuell migrering.

Filen tar bort behovet av att fråga användaren om env-variabler i chatten under F2:

**Dossier-scopad:** `env.example` dumpar inte längre hela placeholder-katalogerna. Preflight skickar **alltid** in de valda dossiers env-nycklar (`dossierEnvScope`, även tom lista) i `injectProjectEnvFileIntoFilesJson` → `buildProjectEnvFileContents`, så filen bara listar (a) användarens sparade värden, (b) nycklar modellen själv skrev i `.env.local`, (c) projekt-preview-tokens och (d) env-nycklar för de **valda** dossiers. En sajt utan dossiers får alltså ingen katalogdump. Det F2-only "Upptäckta integrationer (kommenterade)"-blocket (redan projekt-scopat) behålls. Utan scope (äldre/okända callsites) faller det tillbaka på full dump.

> **Provenance-vakt (2026-07-09):** "(b) modell-emitterad `.env.local`" gäller INTE den placeholder-`.env.local` som Sajtmaskins egen scaffold-merge injicerar i filträdet — den identifieras via markörraden `PIPELINE_ENV_LOCAL_MARKER` ([`env-local.ts`](../src/lib/gen/preview/env-local.ts)) och hoppas över både i `env.example`-byggaren och i preview-VM:ens `.env.local`-merge. Utan vakten läckte hela katalogen tillbaka som "generated"-lager vid varje regenerering och besegrade dossier-scopingen (och kunde skugga användarens env-panel-värden i preview:n).

Samma `dossierEnvScope` styr nu även den pipeline-ägda `.env.local` som
persisteras i `versions.files_json`: finalize ersätter äldre fullkatalogfiler
med det aktuella scopet, och utelämnar artefakten när scopet är tomt. En
modell-emitterad `.env.local` utan pipeline-markören lämnas däremot orörd.
Preview-VM:n bygger fortsatt sin separata runtime-fil med projektets riktiga
`projectEnvVars`; export/deploy strippar `.env.local` vid gränsen.

För dossier-nycklar utan katalog-placeholder skiljer sig F2 och F3: i **F2** får varje sådan nyckel ett deterministiskt demo-värde (`<key>_placeholder_preview_not_real` via `dossierMockPreviewEnvValue`) så den nedladdade filen dokumenterar exakt den stub preview-VM:en bootar med; i **F3** blir det i stället en tom `KEY=`-rad med `purpose`-kommentar eftersom ett riktigt värde krävs. Demo-värdet innehåller stub-vokabulären (`placeholder` + `not_real`) som `stub-env-filter.ts` känner igen, så det aldrig läses som integrationsbevis.

| Stage | Innehåll i `env.example` | Källor |
|-------|---------------------|--------|
| **F2** (`design`) | Projekt-preview-tokens + användar-/genererade lager **+** env-nycklar för valda dossiers (harmless/tier-3-placeholders där de finns, annars ett demo-värde `<key>_placeholder_preview_not_real`). Användaren ser exakt vilka nycklar just den här sajten kan använda, och demo-värdet visar vad preview bootar med. Ingen interaktion krävs — preview-VM:en bootar oberoende av denna fil. | `dossierEnvScope` (valda dossiers) matchat mot `40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt` + `project-preview-env.ts` |
| **F3** (`integrations`) | Vanlig F3-codegen strippar tier-3-stubs och mergar env-panelens `projectEnvVars`; saknade `build`-nycklar blockeras via [`src/lib/integrations/tier3-build-spec.ts`](../src/lib/integrations/tier3-build-spec.ts). Den deterministiska no-build-key-forken är undantaget: hela F2-filträdet, inklusive `env.example`, bevaras exakt och stubbar filtreras fortsatt som icke-bevis/Advisory. | Vanlig F3: F2 utan tier-3 + DB-lagrade `projectEnvVars`. Deterministisk F3: exakt F2-filträd. |

`env.example` skrivs in i `versions.files_json` som vilken annan genererad fil som helst. Preview-host fortsätter parallellt skriva sin egen `.env.local` i VM:en — det är `.env.local` som faktiskt boot:ar previewen, `env.example` är **användarsynlig spegling** + förklaringsdokument. Detaljer: [`src/lib/gen/stream/finalize-version/`](../src/lib/gen/stream/finalize-version/) (post-OMTAG-03 package; `runner.ts` kallar `injectProjectEnvFileIntoFilesJson`).

### Regelkontrakt: F2-tystnad

F2 får aldrig generera env-frågor i chatten. Detta är en hård regel — se [`.cursor/rules/env-flow-f2-mute.mdc`](../.cursor/rules/env-flow-f2-mute.mdc). Fyra lager skydd är på plats:

1. **Tool exposure gate** — `requestEnvVar` / `suggestIntegration` exponeras inte för LLM:n i F2 ([`create-chat-stream-post.ts`](../src/lib/api/engine/chats/create-chat-stream-post.ts), [`chat-message-stream/codegen-turn.ts`](../src/lib/api/engine/chats/chat-message-stream/codegen-turn.ts)).
2. **SSE filter** — om verktygen ändå råkar kallas droppas tool-events av [`generation-stream-tools.ts`](../src/lib/providers/own-engine/generation-stream-tools.ts) i F2 (defense-in-depth, tool-call-pathen).
3. **Panel mount-gate** — `ProjectEnvVarsPanel` renderas bara när `lifecycleStage === "integrations"` ([`BuilderShellContent.tsx`](../src/app/builder/BuilderShellContent.tsx)). I F2 visas en kompakt rad som pekar på `env.example` + "Bygg integrationer"-knappen.
4. **Post-finalize code-scan gate** — efter finalize scannar [`generation-stream-post-finalize.ts`](../src/lib/providers/own-engine/generation-stream-post-finalize.ts) genererad kod efter integrations-imports (Stripe, Upstash etc.). I F2 droppas resultatet (loggas som warning). I F3 emitteras integration-SSE som vanligt. Tillagt 2026-04-18 efter regression där Stripe+Upstash visades i F2-chatten på en museum-prompt.

Lansering-spärren (readiness-route) gatas också på lifecycleStage så att F2 alltid returnerar `ready: true` oavsett vad som detekteras i koden.

---

## Filer som inte committas

`.env.local`, `.env.production`, `.env.*.local`, m.fl. — se `.gitignore`. Håll UTF-8 **LF** utan BOM i env-filer (särskilt viktigt på Windows).
