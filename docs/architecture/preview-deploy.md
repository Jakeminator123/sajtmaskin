# Preview, VM och deploy

**Senast uppdaterad:** 2026-04-08 (tier-2 gate vs VM bootstrap tydliggjord)

**Terminologinot:** den relevanta tier-2-previewen just nu är **VM / `preview_host` via Fly.io**. Publika app-routes använder `preview-session`, `preview-status`, `preview-heartbeat`, `preview-destroy` och `preview-hibernate`. Ordet **`sandbox`** lever fortfarande kvar i vissa interna typer, legacy Redis-nycklar och några interna wrapper-moduler, medan DB-kolumnen i `engine_versions` nu är **`preview_url`**. **Quality gate / server-verify** kör nu också via preview-host, men i en **separat verify-lane** och inte i samma workspace som live-previewn.

**Operativt kördokument** för own-engine → finalize → tier-2-preview → iframe. Intent, leveranser och kodpekare: denna fil + [`../../5-steg.txt`](../../5-steg.txt) (samlad 5-stegsbild och kvarvarande problemområden).

## End-to-end: own-engine som ägare och Fidelity 2

**Sanning i produkt:** Genererad kod, versioner och preview ska spåras till **own-engine** (`engine_chats` / `engine_versions`, `files_json`) och **inte** till V0 Platform API.

**Kedja (lyckat fall):**

1. `POST /api/engine/chats/stream` är builderns kanoniska stream-route för own-engine. `/api/v0/chats/stream` är en compat-wrapper runt samma handler.
2. **Finalize** (`finalize-version.ts`) kör autofix, validering, merge, preflight och sparar **`files_json`** på versionen.
3. `startPreviewSession` (kanoniskt interface i `src/lib/gen/preview/preview-session.ts`) bygger fullt projekt och startar sedan **preview_host** över HTTP (VM via Fly.io). Tier-2 i aktiv runtime är preview-host only; `SAJTMASKIN_PREVIEW_HOST_BASE_URL` måste vara satt för att preview ska kunna starta. Runtime-/path-nyckeln är **own-engine `chatId`**, inte appens `appProjectId`.
4. Vid lyckad sessionskapande: **`engine_versions.preview_url`** uppdateras, medan publika app-svar använder **`previewUrl`** och **`previewSessionId`** via `/preview-session`-kontraktet. Klienten visar **Fidelity 2**. **Tier-1 shim** (`/api/preview-render`) är borttagen ur standardflödet och lever bara kvar som legacy/diagnostik.

**Preview mode idag:** public contract har fortfarande `previewMode`, `previewTier` och valfritt `prodBuildVerified`, men den aktiva preview-host-startvägen returnerar i praktiken `previewMode: "dev_only"` och `previewTier: 2`. Verify/build ligger i separat lane, inte i live-previewns runtime.

**V0 Platform** (npm `v0-sdk`, `V0_API_KEY`) ska inte vara del av denna kedja; HTTP-prefixet `/api/v0/` är **API-version 0**, inte leverantören V0.

## Persistensmodell (beslut 2026-03-31)

**Beslut:** den **kanoniska sparade builden** för own-engine är:

- `engine_chats` / `engine_messages` för chatt- och körmetadata
- `engine_versions.files_json` för det genererade filträdet
- `engine_versions.preview_url` för senaste lyckade tier-2-preview

`project_data` finns kvar som **app-/builder-snapshot** (t.ex. `chat_id`, legacy `demo_url`, UI-meta, vissa importerade filer/messages), men ska **inte** behandlas som primär källa för sparad own-engine-kod när en version redan finns i `engine_versions`.

**Varför detta valdes:**

1. `finalize-version.ts` sparar assistant-meddelande + draft-version atomiskt via `chat-repository-pg`, så own-engine-flödet har redan en tydlig och testad persistpunkt.
2. `preview-session` bygger från `filesJson` efter finalize, så preview-kedjan blir enklare om samma artifact är kanon hela vägen.
3. `project_data` duplicerar annars filer/messages och ökar risken för drift mellan builder-UI och engine-store.

**Praktisk tolkning:**

- **Follow-up-generering** ska utgå från `engine_versions.files_json` för den version användaren redigerar (skickas som `meta.engineBaseVersionId` från buildern när en specifik version är vald), annars från **preferred** version (`selectPreferredEngineVersion` / `getPreferredVersion`) — inte från `project_data` och inte godtyckligt bara “senaste raden” om preferred skiljer sig från strict latest.
- Under preview-/iterationsfasen ligger användarbyggen **i samma Postgres som plattformen**, men separeras **logiskt** via `app_projects`, `user_id` / `session_id` och tenant-gater.
- Vi inför **inte** separat databas/blob per användare i detta skede.
- Blob/filsystem är **sekundär lagring** för assets, materialiserade bilder, export och vissa backoffice-/template-artefakter; inte för den kanoniska own-engine-källkoden.

## Levererat (preview-kedjan)

Följande är **implementerat** i kod och täcks av denna fil; env-namn finns i `src/lib/env.ts` och [`docs/ENV.md`](../ENV.md) (kort översikt):

| Område | Vad | Var i kod (vägledning) |
|--------|-----|-------------------------|
| Kanoniska filer | Preview-session bygger från **`filesJson`** efter finalize, inte primärt `contentForVersion` | `generation-stream.ts`, `preview-session/route.ts` |
| Follow-up underlag | `engine_versions.files_json` via `meta.engineBaseVersionId` (builder) eller annars **preferred** version | `[chatId]/stream/route.ts`, `resolveFollowUpPreviousFiles` i `version-manager.ts`, `useSendMessage.ts` |
| Autofix / retry-bas | Klientautofix som skickar en reparationsprompt pinnas till **den felande versionen** via `engineBaseVersionId`, så retry inte hoppar till en annan vald version i buildern | `useAutoFix.ts`, `useSendMessage.ts`, `[chatId]/stream/route.ts` |
| `previewBlocked` | Betyder att ingen previewyta kan exponeras för versionen; shimfel ensamt ska inte längre stoppa tier-2 | `should-start-preview.ts`, `generation-stream.ts` |
| Tier-2 provider | `preview_host` (HTTP) är den aktiva tier-2-vägen | `preview-session.ts`, `tier2-config.ts`, `preview-host-client.ts`, `tier2-resume.ts` |
| Readiness | Preview-host svarar med startad session + publik URL; appen normaliserar host/root URL och litar sedan på status/heartbeat-livscykeln | `preview-session.ts`, `tier2-config.ts`, `preview-status/route.ts` |
| Preview-only | Publika `done`-/GET-svar har `previewUrl: null` medan `previewPending` kan vara true; `previewUrlHint` i `done` är endast en tillfällig boot-hint och ska inte behandlas som färdig `previewUrl` | `generation-stream.ts`, `generation-stream-post-finalize.ts`, `stream-handlers.ts`, `PreviewPanel.tsx` |
| HTTP API | Meningsfulla statuskoder + `retryable` för `/preview-session` | `preview-errors.ts`, `preview-session/route.ts` |
| Bootstrap-retry | Klienten respekterar `retryable`, **500** med `retryable: true`, `Retry-After` | `preview-bootstrap-retry.ts`, `useBuilderPageController.ts` |
| Session / lease | `POST preview-heartbeat` uppdaterar bara aktiv session när samma chat+version+session-id fortfarande gäller; dold flik schemalägger `preview-hibernate` efter grace period och `pagehide` försöker hibernatera direkt. `GET preview-status` används för recover/url-resync och ska inte i sig vara den sak som håller previewn vid liv. Recover är provider-agnostisk via `tryResumeTier2Runtime`. Klient-API: `preview-session/api.ts`. | `preview-heartbeat/route.ts`, `preview-status/route.ts`, `tier2-resume.ts`, `preview-session/`, `hooks/usePreviewHeartbeat.ts`, `usePreviewSession.ts`, `useBuilderVmPreview.ts` |
| Repair-versioner | När server-verify eller manuell repair skapar en ny promotad version markeras den tidigare repair-källan som ersatt/superseded i stället för att lämnas kvar i `repairing`. UI visar detta som `Omtag`. | `server-verify.ts`, `repair/route.ts`, `chat-repository-pg.ts`, `engine-version-lifecycle.ts`, `VersionHistory.tsx` |
| Dubbel repair | `skipRepair: true` när underlag redan är finalizeat (DB / `filesJson`) | `preview-session.ts` |
| Repo-import (v0-mallar) | `skipProjectScaffold: true` hoppar över `buildCompleteProject()` helt — zip-projektets egna `package.json`/`tsconfig`/`next.config` behålls orörda. Binära assets (bilder, fonts) importeras som `base64:`-prefixade strängar i `filesJson`; preview-host skriver dem som binära buffers. `buildIntent` härleds per mall via `template-catalog.ts`. | `preview-session.ts`, `local-v0-template-source.ts`, `template/route.ts`, `preview-host/src/runtime.js`, `category/[type]/page.tsx` |
| Per-generation previewpolicy | `BuildSpec.previewPolicy` / `verificationPolicy` följer fortfarande med i telemetri och startparams, men aktiv preview-startväg är preview-host `dev_only` | `build-spec.ts`, `preview-session.ts`, `generation-stream-post-finalize.ts` |
| Policy-/preview-telemetri | generation-telemetri sparar nu `BuildSpec`/finalize-path-meta; preview-lifecycle loggar `preview_ready` / `preview_failed` med tid från engine-start | `finalize-version.ts`, `generation-telemetry.ts`, `generation-stream-post-finalize.ts`, `preview/lifecycle-telemetry.ts` |
| Finalize fast/deep path | Lätta follow-ups kan stanna på finalize fast path och hoppa över deep-path-steg som bildmaterialisering, verifier och polish | `finalize-version.ts`, `finalize-pipeline-contract.ts` |
| VM-resume | Session återanvänds **före** `buildCompleteProject` när session matchar | `preview-session.ts`, `tier2-resume.ts` |
| Versionsrullning | Ny version på samma `chatId` återanvänder normalt samma preview-session / path och restartar runtime med nya filer i stället för att skapa en helt separat långlivad lane per version | `preview-session.ts`, `preview-host/src/server.js`, `preview-host/src/runtime.js` |
| Scaffold | Pinnade versioner i standard-`package.json` (minimal `^`-drift) | `project-scaffold.ts` |
| Tester | Bl.a. `httpStatusForPreviewSessionFailure`, bootstrap-retry, preview-gate, repair-idempotens | `*.test.ts` under `src/lib/gen`, `src/lib/builder` |
| Vitest / config-mock | `route.test.ts` mockar `REDIS_KEY_PREFIX` m.m. när `redis.ts` laddas | `src/app/api/v0/chats/stream/route.test.ts` |

**Öppet / senare:** adapters för vissa integrationer, GitHub-export som sekundär väg, ev. vidare shim-förenkling — se [`../../5-steg.txt`](../../5-steg.txt).

**Vit / tom preview:** operativ runbook + checklista — [`preview-white-screen-runbook.md`](./preview-white-screen-runbook.md). Kort hjälptext visas i byggarens iframe-overlay (`previewRunbookLinesForCode` i `preview-diagnostics.ts`).

**Zip-export och lokal utveckling:** `GET .../versions/{versionId}/download` kör `buildCompleteProject` i [`project-scaffold.ts`](../../src/lib/gen/export/project-scaffold.ts). Modellens `package.json` **merge:as** med baseline (så `scripts` som `dev`/`build` och devDependencies som TypeScript/Tailwind inte försvinner), och om `.env.local` saknas läggs en **placeholder-fil** till (samma nycklar som i preview-env, från `config/ai_models/` placeholders).

## Begrepp

| Tier | Vad | Ungefär |
|------|-----|--------|
| 2 — **Runtime preview** | `preview_host` (VM) bakom appens `preview-*`-kontrakt. Kör `npm run dev`, **inte** `npm run build`; preview-sessionen återanvänds eller hibernateras via status/heartbeat/destroy/hibernate och har nu en enhetlig maxtid på ungefär 1 timme. | Enda live-preview i produkt-UI |
| 3 — **Build-check** | lockfile-aware install (npm/pnpm) + `tsc` / `next build` / ev. `eslint` i preview-hosts verify-lane | Validering närmare produktion utan att röra live-previewn |

> **Tier-2: två spår — iframe vs verify-gate.** Själva **preview-sessionen** på VM kör fortfarande `npm install` + `npm run dev` så att iframen får en dev-server (`preview-session.ts`). Den **asynkrona quality-gate** som post-checks kan trigga mot preview-host verify-lanen använder däremot default bara **`typecheck`** (`TIER2_QUALITY_GATE_CHECKS` i `quality-gate-checks.ts`) — alltså inte samma lista som bootstrappen. `next build` hör till tier-3/deploy-kontexten. Background `server-verify` kan använda `SERVER_VERIFY_QUALITY_GATE_CHECKS` (`typecheck` + `lint`). `INTERACTIVE_QUALITY_GATE_CHECKS` och `PROMOTION_QUALITY_GATE_CHECKS` finns för explicitare flöden.

## ID och nycklar

| Fält / id | Betyder | Används till |
|-----------|---------|--------------|
| `appProjectId` / `projects.id` | användarens riktiga Sajtmaskin-projekt | ägarskap, builder-state, projekt-env, `engine_chats.project_id` |
| `chatId` / `engine_chats.id` | own-engine-chatten | preview-lane, session-store, preview-host-path `/{chatId}` |
| `versionId` / `engine_versions.id` | specifik version i en chatt | preview-resume, bootstrap, heartbeat |
| `sandboxId` | aktiv tier-2-runtime | status, heartbeat, destroy/resume |
| `VERCEL_PROJECT_ID` | Vercel-projekt-id | endast Vercel Sandbox / API-auth |

**Viktig skillnad:** `preview_host` använder i nuläget **`chatId` som route/runtime-key**. `appProjectId` används separat för projektkoppling och env-merge, inte som publik preview-host-path.

**Produktintent:** **tier-2-URL** (lagrad i `engine_versions.preview_url`; vissa interna lager använder fortfarande legacy-variabler som `sandboxUrl`) är den enda iframe-källan för live-preview. Publik HTTP-yta använder `previewUrl` / `previewSessionId`. Fel (`502`, HMR-brus) och sekvens: följ `generation-stream.ts` → `preview-session.ts` → `PreviewPanel.tsx`.

## Preview-URL-kedja (legacy `demoUrl` finns kvar internt)

1. Efter `done` i SSE är **tier-2 preview** den enda produktpreviewytan. `done` betyder att versionen är sparad, inte att preview redan är live. I publika event/svar är `previewUrl` och `legacyShimPreviewUrl` **`null`** tills preview-sessionen är redo; äldre interna eller lagrade payloads kan fortfarande bära `demoUrl` eller `sandboxUrl`.
2. `done.previewPending` betyder att preview-start väntas efter finalize. `done.previewUrlHint` är en tillfällig VM-hint under boot och får inte ersätta `preview-ready` eller `preview-session` som källa för faktisk live-URL.
3. Kanoniska filer för preview-start är **`filesJson` efter finalize** (merge + preflight), inte rå `contentForVersion`.
4. Om tier-2 är konfigurerad och versionen inte är `previewBlocked`: `startPreviewSession` → `preview-ready` / `build-error`. Preview-host returnerar publik URL och session-id; status/recover går sedan via `preview-status` / `preview-heartbeat` / `preview-destroy` / `preview-hibernate`.
5. `engine_versions.preview_url` uppdateras vid lyckad preview-start.

**HTTP GET `/api/engine/chats/[chatId]` och `.../versions`** (v0-yta finns som compat): publikt fält är `previewUrl`; för own-engine är det **`null`** som huvudsignal tills preview-sessionen finns. Live-preview ligger internt i legacyfältet **`sandboxUrl`**. Shim till `/api/preview-render` exponeras som **`legacyShimPreviewUrl`** (när `canExposeEnginePreview` tillåter), inte som primär preview-signal. DB-kolumnen är fortfarande `demo_url`, och inbound legacy-payloads tolkas via `resolveInboundPreviewUrl()`. Klienten använder preview-sessionen först och null + bootstrap när ingen aktiv session finns, i stället för att låsa iframe till shim som standard. Varje GET till `/api/preview-render` loggas med prefix **`[telemetry:legacy-preview-render]`** för uppföljning innan ev. borttagning.

**Typer / kontrakt:** `src/lib/gen/preview/preview-contract.ts` (SSE/HTTP-fält). **HTTP:** kanonisk route är `/api/engine/chats/[chatId]/preview-session`; `/api/v0/chats/[chatId]/preview-session` är compat-yta. Den returnerar meningsfulla statuskoder (`422` repair, `503`/`504` runtime) och fältet `retryable` (bootstrap retry:ar bara när `retryable !== false`; **500** kräver `retryable: true` för auto-retry) — se `httpStatusForPreviewSessionFailure`. Svar kan innehålla **`startOutcome`**: `reused_url` (redan lagrad tier-2-URL återanvänds), `resumed` (VM återanvänd från session) eller `recreated` (ny provisioning).

### Aktiv preview-session (lease, status, recover)

- **`GET /api/engine/chats/[chatId]/preview-status?versionId=`** (valfritt `&previewSessionId=`; v0-route finns som compat): serverns bild av sessionen — `running` \| `stopped` \| `missing` \| `version_mismatch` samt `previewSessionId`, `previewUrl`, `sessionExpiresAt`, `reason`.
  - Vanliga `reason`-värden: `no_session`, `session_bound_to_other_version`, `preview_session_id_mismatch`, `provider_not_running_or_unreachable` (samt `preview_session_not_configured` när tier-2 saknas).
- **`POST /api/engine/chats/[chatId]/preview-heartbeat`** (v0-route finns som compat): JSON `{ versionId, previewSessionId, viewerId }`. Uppdaterar `lastUsedAt` endast om Redis/minnet fortfarande binder samma chat+version+session-id. Heartbeat körs från synlig flik ungefär var 25:e sekund.
- **`POST /api/engine/chats/[chatId]/preview-hibernate`** (v0-route finns som compat): bygger vidare på samma session-id och ber preview-hosten att hibernatera runtime-processen utan att rensa sessionnyckeln. Klienten försöker detta direkt på `pagehide` och efter kort grace period när fliken blir dold.
- **`POST /api/engine/chats/[chatId]/preview-destroy`** (v0-route finns som compat): builderns "Rensa preview" använder nu den här vägen för att aktivt stänga preview-host/Fly-sessionen, rensa session-store och nolla `engine_versions.preview_url` för versionen.
- **Sessionstid:** appens preview-session-store och hostens session-TTL är nu båda satta till cirka **1 timme**. Det är den förenklade sanningen för hur länge en preview maximalt ska leva utan ny start/update-cykel.
- **Klient:** `PreviewPanel` pingar heartbeat ca var 25s (synlig flik) när livscykel är `live`; `previewSessionId` hålls i builder-state från lyckad `preview-session` och SSE `preview-ready`.
- **Recover:** Misstanke från iframe (t.ex. transportfel, ready-timeout 45s) → status-GET; om `starting` (boot grace 90s) → vänta utan recovery; om inte `running` eller `starting` → tvingad `preview-session` med `forceRestart`, debounce och maxförsök (se `usePreviewSession`).
- **Livscykel-UI:** `PreviewLifecycleState` i `src/lib/builder/preview-lifecycle.ts` — `idle` \| `bootstrapping` \| `live` \| `recovering` \| `failed`.
- **Telemetri:** loggprefix **`[telemetry:preview-lifecycle]`** och eventnamn beskriver nu preview-start/-status/-ready/-failed med tid från engine-start. Tier-2-event bär `tier2Provider: "preview_host"`.
- **Repair / versionsbyte:** Om SSE `done` sätter **`onlySelectVersionIfWasLatest`: true** uppdateras vald version i byggaren **endast** om användaren redan var på föregående server-«latest» (annars behålls manuellt vald äldre version). Normal egen generering skickar inte flaggan — standard är att följa streamens `versionId`. När användaren **manuellt väljer en äldre version** utan egen live-preview ska buildern nu hellre visa tom-/bootstrapping-state för just den versionen än att tyst falla tillbaka till senaste versionens preview.

**Bootstrap (klient):** `src/lib/builder/preview-bootstrap-retry.ts` — samma semantik som ovan; vid `503`/`504` kan servern skicka `Retry-After` (sekunder) som klienten använder som delay före retry (fallback ~6 s).

**Repair en gång:** Filer från `files_json` efter finalize är redan repairade i preflight. `startPreviewSession` anropas med `skipRepair: true` från own-engine-strömmen (när underlaget kommer från `filesJson`) och från preview-session-API:et, så tier-2 inte kör ett andra repair-varv i onödan.

**Finalize fast/deep path:** `finalize-version.ts` bär nu ett explicit fast/deep-path-kontrakt. Defaultflödet är fortfarande samma produktkedja, men lätta follow-ups (`BuildSpec` med `verificationPolicy: fast`) kan hoppa över deep-path-steg som bildmaterialisering och polish innan versionen sparas. Parse/merge/preflight/persist ligger kvar i fast path. Efter `done` kan klienten fortfarande köra en separat Blob-bildmaterialisering på sparade filer och visar nu explicit status för om det steget kördes, hoppades över eller misslyckades.

**Tier-2 preview `.env.local`:** Både **`startPreviewSession`** (builder/UI) och **`generateOwnEngineSiteFromPrompt`** (MCP/own-engine) anropar `buildPreviewEnvLocalContents` (`src/lib/gen/preview/env-local.ts`) som bygger merged `.env.local` i VM — globala placeholders från `config/ai_models/40-generated-site-integration-placeholders.env.txt`, projekt-preview-token, lagrade projekt-env, sist genererad `.env.local` om modellen skrev en (senare vinner). Se `config/user_degraded_env.txt` och avsnittet *Genererade användarsajter* i [`docs/ENV.md`](../ENV.md).

**Scaffold-beroenden:** Standard-`package.json` i `project-scaffold.ts` använder **exakta versionsnummer** (inga `^`) för reproducerbara `npm install` i sandbox. Paket som `runDepCompleter` lägger till från import-scan kan fortfarande använda intervall — okända paket kräver manuell pin. Baseline-projektet innehåller nu också ett litet, självständigt `eslint.config.mjs` och `npm run lint`, men det är **stöd i projektet**, inte en signal att tier-2-preview automatiskt måste köra lint på varje preview-start.

### ERESOLVE / peer-dependency-fel vid `npm install`

**Symptom:** Exporterat/nedladdat projekt misslyckas med `npm error ERESOLVE unable to resolve dependency tree`.

**Försvarslager (i ordning):**

1. **`BASELINE_PINNED_DEPS`** i `project-scaffold.ts` — `react`, `react-dom`, `next`, `three`, `@react-three/fiber`, `@react-three/drei` låses alltid till scaffold-baseline så modellen inte kan sänka dem.
2. **`dep-completer.ts`** — `KNOWN_PACKAGES` scannar scoped npm-imports (`@scope/name`) och sätter rätt major-intervall. `dep-completer.test.ts` verifierar att alla överlappande nycklar har samma major som scaffold-baseline.
3. **`runProjectSanityChecks`** — billiga heuristiker som flaggar kända dåliga par (t.ex. fiber <9 + React 19, Next 16 + React 18).
4. **`npm run baseline-deps:tree`** — kör `npm install --package-lock-only` på ren baseline i en temp-mapp; fångar träd-konflikter som `baseline-deps:verify` (bara registry) missar.
5. **Quality gate / preview runtime** — `npm install` i riktig VM; preview-session-starten klassar `ERESOLVE` i feltext.

**Första kontroll vid nytt ERESOLVE:** merged `package.json` → är alla pinnade deps på rätt major? → `KNOWN_PACKAGES` i synk med baseline? → kör `npm run baseline-deps:tree`.

## Preview-session input

Preview-host får ett färdigbyggt `filesJson`-payload från appen. Det finns inte längre någon aktiv Vercel Sandbox-bas eller git-template i den här kedjan; den publika preview-starten går via `preview-session` och preview-hostens session-API.

Kodstart: `generation-stream.ts`, `finalize-version.ts`, `preview-session.ts`, `PreviewPanel.tsx`, `stream-handlers.ts`.

## MCP vs builder-stream

`src/lib/mcp/generate-site.ts` och `src/lib/mcp/local-engine.ts` använder nu samma preview-session-lager som buildern. Det viktiga vid felsökning är därför främst om körningen gick via builder-SSE eller MCP-adaptern, inte om den gick via olika tier-2-providers.

## Deploy

- **Preflight / auto-fix** före Vercel: `applyPreDeployFixes`, lockfile-normalisering, `"use client"`, m.m. — se `src/app/api/v0/deployments/route.ts` och Vitest `route.test.ts` (`precheckOnly`, `skipAutoFix`).
- **409 DEPLOY_MISSING_ENV** om obligatoriska nycklar saknas.
- Opt-out: `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX` eller `skipAutoFix` i body.

## Felsökning: varför startar inte tier 2 «automatiskt»?

Tier 2 är **inte** ett enda alltid-igång subsystem. `preview_host` är en separat HTTP-tjänst som kan stå varm på Fly, men själva **preview-starten** sker först när (a) own-engine-strömmen har sparat en version och anropar `startPreviewSession`, och/eller (b) klienten POST:ar `/api/engine/chats/.../preview-session` (v0-route finns som compat; bootstrap i `useBuilderPageController`). Följande **stoppar eller fördröjer** tier-2-preview:

| Orsak | Vad händer | Var |
|--------|------------|-----|
| **Ingen tier-2-provider** | `SAJTMASKIN_PREVIEW_HOST_BASE_URL` saknas → API `/preview-session` → **503** `preview_session_disabled` | `tier2-config.ts`, `preview-session/route.ts` |
| **`previewBlocked`** | Preflight kunde inte bygga en användbar preview-startkontrakt för versionen → `shouldStartOwnEnginePreview` blir false | `finalize-preflight.ts`, `should-start-preview.ts` |
| **Preview-host-fel** | `preview_host` svarar med fel / timeout → `build-error` eller retrybar bootstrapfail | `preview-session.ts`, `preview-host-client.ts`, `tier2-config.ts` |
| **Misslyckad quality gate** | `verificationState === failed` → `canExposeEnginePreview` är **false** → POST `/preview-session` → **400** `preview_blocked` (bootstrap kan inte efterstarta preview för den versionen) | `engine-version-lifecycle.ts`, `preview-session/route.ts` |
| **Bootstrap villkor** | Bootstrap körs bara om användaren är inloggad, own-engine-chatt (ej v0-stil), **ingen** aktiv `previewUrl` på versionen än, och `currentPreviewUrl` saknas eller inte är en redan fungerande preview-URL; hoppar över under aktiv streaming | `useBuilderPageController.ts` |
| **Deduplicering** | Samma chat+version delar en in-flight `startPreviewSession` — om första anropet failar måste fel spåras i logg, inte anta dubbel VM | `preview-session.ts` |

**Intent:** När tier 2 lyckas ska `pickVersionPreviewUrl` redan prioritera `sandboxUrl` i UI — problemet är i praktiken att **VM-steget** eller **credentials** saknas, eller att **versionen** är spärrad för preview efter failed verification.

## Tier-2 provider config

- **Preview-host som aktiv väg:** `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY` (samma secret som `PREVIEW_HOST_API_KEY` på hosten när den kör icke-lokalt), och `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` för klientens host-detektion. Hosten skriver preview-data under `/data` när `PREVIEW_HOST_DATA_DIR=/data` är satt i host-konfigen.
- **Ingen preview-selector behövs längre:** appen använder preview-host som tier-2-väg när `SAJTMASKIN_PREVIEW_HOST_BASE_URL` finns satt.
- **Verifiering/validering:** quality-gate, server-verify och repair re-check använder preview-hosts separata verify-lane. Den kör i isolerad workspace och återanvänder inte live-previewns dev-workspace. Installsteget är lockfile-aware (`npm ci` med `package-lock.json`, `pnpm install --frozen-lockfile` med `pnpm-lock.yaml`, annars `npm install`). **Tier-2 live-previewns vanliga gate kör default bara `typecheck`, medan background `server-verify` nu använder `typecheck` + `lint`** — `next build` körs inte automatiskt i något av dessa standardflöden. Interaktiv quality gate kan inkludera build/lint. Verify-workspaces rensas efter varje jobb, verify-jobb köas nu lugnare på single-VM-hosts, och preview-hostens cleanup (`POST /admin/cleanup`, API-key-skyddad) rensar stale preview-workspaces / utgångna sessioner. Cleanup stoppar nu även stale runtime-processer innan session/workspace tas bort; om stopp misslyckas bevaras raden till nästa pass i stället för att rensa under en levande process. App-sidan försöker en cleanup + en enda retry när preview-host svarar med `ENOSPC`.
- **Ops-insyn:** preview-hosten exponerar nu också `GET /admin/storage`, `GET /admin/sessions`, `POST /admin/cleanup` och `POST /admin/destroy-all` för drift- och städarbete.

Se även [`docs/ENV.md`](../ENV.md) och `src/lib/env.ts`.

## Webhook / deploy events

Vercel → Sajtmaskin webhook: `src/app/api/webhooks/vercel/route.ts` (`VERCEL_WEBHOOK_SECRET`).
