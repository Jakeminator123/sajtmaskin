# Preview, sandbox och deploy

**Senast uppdaterad:** 2026-04-05 (preview/version-lifecycle uppdaterad)

**Terminologinot:** den relevanta tier-2-previewen just nu är primärt **VM / `preview_host` via Fly.io**. Ordet **`sandbox`** lever kvar i routes, fältnamn och symboler som `sandbox_url` och `/sandbox-preview`, och betyder där ofta legacy naming eller delat tier-2-kontrakt snarare än att Vercel Sandbox är huvudvägen. **Quality gate / server-verify** körs nu också via preview-host, men i en **separat verify-lane** och inte i samma workspace som live-previewn.

**Operativt kördokument** för own-engine → finalize → tier-2-preview → iframe. Intent, leveranser och kodpekare: denna fil + [`PROJECT-STATE-AND-DIRECTION.md`](../plans/active/PROJECT-STATE-AND-DIRECTION.md) (backlog/beslut).

## End-to-end: own-engine som ägare och Fidelity 2

**Sanning i produkt:** Genererad kod, versioner och preview ska spåras till **own-engine** (`engine_chats` / `engine_versions`, `files_json`) och **inte** till V0 Platform API.

**Kedja (lyckat fall):**

1. `POST /api/engine/chats/stream` är builderns kanoniska stream-route för own-engine. `/api/v0/chats/stream` är en compat-wrapper runt samma handler.
2. **Finalize** (`finalize-version.ts`) kör autofix, validering, merge, preflight och sparar **`files_json`** på versionen.
3. `startSandboxPreview` (`sandbox-preview.ts`) bygger fullt projekt och väljer sedan **tier-2-provider**: primärt `preview_host` över HTTP (VM via Fly.io), sekundärt Vercel Sandbox. Om `SAJTMASKIN_PREVIEW_HOST_BASE_URL` finns satt och `SAJTMASKIN_TIER2_RUNTIME` är unset används nu **`preview_host`** som strikt default (ingen automatisk Vercel-failover). Vercel fallback kräver explicit `SAJTMASKIN_TIER2_RUNTIME=preview_host_then_vercel`. Standardläge för Vercel-spåret är fortfarande **`dev_only`** (när fallbacken faktiskt används), men läget kan också lösas per generation från `BuildSpec.previewPolicy` + `BuildSpec.verificationPolicy` innan env-fallback används. För `preview_host` är runtime-/path-nyckeln just nu **own-engine `chatId`**, inte appens `appProjectId`.
4. Vid lyckad readiness / sessionskapande: **`engine_versions.sandbox_url`** sätts (legacy kolumnnamn, men nu kan värdet komma från valfri tier-2-provider); klienten visar **Fidelity 2**. **Enda** produktpreviewvägen är tier 2 via samma `/sandbox-*`-kontrakt; **tier-1 shim** (`/api/preview-render`) är borttagen ur flödet (routen kan finnas kvar för bakåtkompatibilitet men länkas inte från buildern).

**Fidelity 3** (`prodBuildVerified: true`, `fidelityTier: 3`) när sandbox körs i `dev_then_build` och byggsteget i VM lyckas — antingen via global env (`SAJTMASKIN_SANDBOX_PREVIEW_MODE=dev_then_build`) eller via per-generation policy från `BuildSpec` — se `runtime-url.ts`. **`prodBuildVerified` utelämnas** (undefined/absent) i SSE och API-svar när ingen production-build körts (preview_host tier-2, resume, reused_url). Klienten tolkar frånvaro som "ej tillämpligt" och visar ingen build-banner.

**V0 Platform** (npm `v0-sdk`, `V0_API_KEY`) ska inte vara del av denna kedja; HTTP-prefixet `/api/v0/` är **API-version 0**, inte leverantören V0.

## Persistensmodell (beslut 2026-03-31)

**Beslut:** den **kanoniska sparade builden** för own-engine är:

- `engine_chats` / `engine_messages` för chatt- och körmetadata
- `engine_versions.files_json` för det genererade filträdet
- `engine_versions.sandbox_url` för senaste lyckade tier-2-preview (legacy fältnamn, även för `preview_host`)

`project_data` finns kvar som **app-/builder-snapshot** (t.ex. `chat_id`, legacy `demo_url`, UI-meta, vissa importerade filer/messages), men ska **inte** behandlas som primär källa för sparad own-engine-kod när en version redan finns i `engine_versions`.

**Varför detta valdes:**

1. `finalize-version.ts` sparar assistant-meddelande + draft-version atomiskt via `chat-repository-pg`, så own-engine-flödet har redan en tydlig och testad persistpunkt.
2. `sandbox-preview` bygger från `filesJson` efter finalize, så preview-kedjan blir enklare om samma artifact är kanon hela vägen.
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
| Kanoniska filer | Sandbox bygger från **`filesJson`** efter finalize, inte primärt `contentForVersion` | `generation-stream.ts`, `sandbox-preview/route.ts` |
| Follow-up underlag | `engine_versions.files_json` via `meta.engineBaseVersionId` (builder) eller annars **preferred** version | `[chatId]/stream/route.ts`, `resolveFollowUpPreviousFiles` i `version-manager.ts`, `useSendMessage.ts` |
| Autofix / retry-bas | Klientautofix som skickar en reparationsprompt pinnas till **den felande versionen** via `engineBaseVersionId`, så retry inte hoppar till en annan vald version i buildern | `useAutoFix.ts`, `useSendMessage.ts`, `[chatId]/stream/route.ts` |
| `previewBlocked` | Betyder att ingen previewyta kan exponeras för versionen; shimfel ensamt ska inte längre stoppa tier-2 | `own-engine-sandbox-gate.ts`, `generation-stream.ts` |
| Tier-2 provider | `preview_host` (HTTP) eller Vercel Sandbox bakom samma `/sandbox-*`-kontrakt; när base URL finns och mode är unset används strikt `preview_host` | `sandbox-preview.ts`, `tier2-config.ts`, `preview-host-client.ts`, `tier2-resume.ts` |
| Readiness | HTTP-probe efter `npm run dev` (2xx + dokumentlik `Content-Type`) | `runtime-url.ts` (`waitForSandboxDevServerReady`) |
| Sandbox-only | Publika `done`-/GET-svar har `previewUrl: null` medan `sandboxPending` kan vara true; äldre interna eller lagrade payloads kan fortfarande bära `demoUrl` | `generation-stream.ts`, `stream-handlers.ts`, `PreviewPanel.tsx` |
| HTTP API | Meningsfulla statuskoder + `retryable` för `/sandbox-preview` | `sandbox-preview-errors.ts`, route |
| Bootstrap-retry | Klienten respekterar `retryable`, **500** med `retryable: true`, `Retry-After` | `sandbox-bootstrap-retry.ts`, `useBuilderPageController.ts` |
| Session / lease | `POST sandbox-heartbeat` — vid `no_session` / `session_mismatch` triggar klienten `handlePreviewSessionSuspect`; `GET sandbox-status` med `running` men annan URL än iframe → uppdatera preview-URL + refresh (telemetri `sandbox_url_resync`). Recover är nu provider-agnostisk via `tryResumeTier2Runtime`. Klient-API: `preview-session/api.ts`. | `sandbox-heartbeat/route.ts`, `sandbox-status/route.ts`, `tier2-resume.ts`, `preview-session/`, `hooks/usePreviewHeartbeat.ts`, `usePreviewSession.ts`, `useBuilderSandboxPreview.ts` |
| Repair-versioner | När server-verify eller manuell repair skapar en ny promotad version markeras den tidigare repair-källan som ersatt/superseded i stället för att lämnas kvar i `repairing`. UI visar detta som `Omtag`. | `server-verify.ts`, `repair/route.ts`, `chat-repository-pg.ts`, `engine-version-lifecycle.ts`, `VersionHistory.tsx` |
| Dubbel repair | `skipRepair: true` när underlag redan är finalizeat (DB / `filesJson`) | `sandbox-preview.ts` |
| Per-generation previewpolicy | `BuildSpec.previewPolicy` / `verificationPolicy` kan lyfta sandbox från `dev_only` till `dev_then_build` utan att ändra global env-default | `build-spec.ts`, `runtime-url.ts`, `sandbox-preview.ts`, `generation-stream-post-finalize.ts` |
| Policy-/preview-telemetri | generation-telemetri sparar nu `BuildSpec`/finalize-path-meta; sandbox-lifecycle loggar policy-aware `sandbox_preview_ready` / `sandbox_preview_failed` med tid från engine-start | `finalize-version.ts`, `generation-telemetry.ts`, `generation-stream-post-finalize.ts`, `sandbox-lifecycle-telemetry.ts` |
| Finalize fast/deep path | Lätta follow-ups kan stanna på finalize fast path och hoppa över deep-path-steg som bildmaterialisering, verifier och polish | `finalize-version.ts`, `finalize-pipeline-contract.ts` |
| VM-resume | Session återanvänds **före** `buildCompleteProject` när session matchar | `sandbox-preview.ts` |
| Scaffold | Pinnade versioner i standard-`package.json` (minimal `^`-drift) | `project-scaffold.ts` |
| Mall | Git-bas + `writeFiles` + `removeSandboxTemplateLeftovers` | `runtime-url.ts` |
| Tester | Bl.a. `httpStatusForSandboxPreviewFailure`, bootstrap-retry, sandbox-gate, repair-idempotens | `*.test.ts` under `src/lib/gen`, `src/lib/builder` |
| Vitest / config-mock | `route.test.ts` mockar `REDIS_KEY_PREFIX` m.m. när `redis.ts` laddas | `src/app/api/v0/chats/stream/route.test.ts` |

**Öppet / senare:** adapters för vissa integrationer, GitHub-export som sekundär väg, ev. vidare shim-förenkling — se backlog i [`PROJECT-STATE-AND-DIRECTION.md`](../plans/active/PROJECT-STATE-AND-DIRECTION.md).

**Vit / tom preview:** operativ runbook + checklista — [`preview-white-screen-runbook.md`](./preview-white-screen-runbook.md). Kort hjälptext visas i byggarens iframe-overlay (`previewRunbookLinesForCode` i `preview-diagnostics.ts`).

**Zip-export och lokal utveckling:** `GET .../versions/{versionId}/download` (och sandbox) kör `buildCompleteProject` i [`project-scaffold.ts`](../../src/lib/gen/project-scaffold.ts). Modellens `package.json` **merge:as** med baseline (så `scripts` som `dev`/`build` och devDependencies som TypeScript/Tailwind inte försvinner), och om `.env.local` saknas läggs en **placeholder-fil** till (samma nycklar som i sandbox-preview, från `config/ai_models/` placeholders).

## Begrepp

| Tier | Vad | Ungefär |
|------|-----|--------|
| 2 — **Runtime preview** | `preview_host` (VM) eller Vercel Sandbox bakom samma `/sandbox-*`-kontrakt. Kör `npm run dev`, **inte** `npm run build`; installsteget är lockfile-aware (`pnpm install` / `npm ci` / `npm install`). | Enda live-preview i produkt-UI |
| 3 — **Build-check** | lockfile-aware install (npm/pnpm) + `tsc` / `next build` / ev. `eslint` i preview-hosts verify-lane | Validering närmare produktion utan att röra live-previewn |

> **Tier-2 verify-gate:** Server-verify och promotion-gate kör default bara `install` + `typecheck` (`TIER2_QUALITY_GATE_CHECKS`). `next build` hör till tier-3/deploy-kontexten och körs inte automatiskt vid tier-2 dev-preview. Interaktiv quality gate från UI kan fortfarande inkludera build och lint via `INTERACTIVE_QUALITY_GATE_CHECKS`.

## ID och nycklar

| Fält / id | Betyder | Används till |
|-----------|---------|--------------|
| `appProjectId` / `projects.id` | användarens riktiga Sajtmaskin-projekt | ägarskap, builder-state, projekt-env, `engine_chats.project_id` |
| `chatId` / `engine_chats.id` | own-engine-chatten | preview-lane, session-store, preview-host-path `/{chatId}` |
| `versionId` / `engine_versions.id` | specifik version i en chatt | preview-resume, bootstrap, heartbeat |
| `sandboxId` | aktiv tier-2-runtime | status, heartbeat, destroy/resume |
| `VERCEL_PROJECT_ID` | Vercel-projekt-id | endast Vercel Sandbox / API-auth |

**Viktig skillnad:** `preview_host` använder i nuläget **`chatId` som route/runtime-key**. `appProjectId` används separat för projektkoppling och env-merge, inte som publik preview-host-path.

**Produktintent:** **tier-2-URL** (fortfarande exponerad som `sandboxUrl` / `sandbox_url`) är den enda iframe-källan för live-preview. Fel (`502`, HMR-brus) och sekvens: följ `generation-stream.ts` → `sandbox-preview.ts` → `PreviewPanel.tsx`.

## Preview-URL-kedja (legacy `demoUrl` finns kvar internt)

1. Efter `done` i SSE är **sandbox** den enda previewytan. I publika event/svar är `previewUrl` och `legacyShimPreviewUrl` **`null`** tills sandbox är redo; äldre interna eller lagrade payloads kan fortfarande bära `demoUrl`.
2. Kanoniska filer för sandbox är **`filesJson` efter finalize** (merge + preflight), inte rå `contentForVersion`.
3. Om minst en tier-2-provider är konfigurerad och inte `previewBlocked`: `startSandboxPreview` → `sandbox-ready` / `build-error`. Med explicit `preview_host_then_vercel` provas preview-host först och Vercel Sandbox används som fallback vid recoverable fel; i standardläget med base URL + unset runtime körs strikt `preview_host`. För Vercel-spåret körs efter `npm run dev` en **readiness probe** mot preview-URL: **2xx** och dokumentlik `Content-Type` (t.ex. `text/html`), inte bara att undvika 5xx (se `waitForSandboxDevServerReady` i `runtime-url.ts`; timeout: `SAJTMASKIN_SANDBOX_READINESS_MAX_MS` i `src/lib/env.ts`).
4. `engine_versions.sandbox_url` uppdateras vid lyckad sandbox.

**HTTP GET `/api/engine/chats/[chatId]` och `.../versions`** (v0-yta finns som compat; own-engine, 2026-03-30): publikt fält är `previewUrl`; för own-engine är det **`null`** som huvudsignal tills sandbox finns. Live-preview ligger i **`sandboxUrl`**. Shim till `/api/preview-render` exponeras som **`legacyShimPreviewUrl`** (när `canExposeEnginePreview` tillåter), inte som primär preview-signal. DB-kolumnen är fortfarande `demo_url`, och inbound legacy-payloads tolkas via `resolveInboundPreviewUrl()`. Klienten (`useBuilderCallbacks` vid versionsval, `pickVersionPreviewUrl` vid sync) använder **sandbox först** och **null + bootstrap** när sandbox saknas, i stället för att låsa iframe till shim som standard. Varje GET till `/api/preview-render` loggas med prefix **`[telemetry:legacy-preview-render]`** för uppföljning innan ev. borttagning.

**Typer / kontrakt:** `src/lib/gen/preview-contract.ts` (SSE-fält). **HTTP:** kanonisk route är `/api/engine/chats/[chatId]/sandbox-preview`; `/api/v0/chats/[chatId]/sandbox-preview` är compat-yta. Den returnerar meningsfulla statuskoder (`422` repair, `503`/`504` runtime) och fältet `retryable` (bootstrap retry:ar bara när `retryable !== false`; **500** kräver `retryable: true` för auto-retry) — se `httpStatusForSandboxPreviewFailure`. Svar kan innehålla **`startOutcome`**: `reused_url` (redan lagrad tier-2-URL återanvänds), `resumed` (VM återanvänd från session) eller `recreated` (ny provisioning).

### Aktiv preview-session (lease, status, recover)

- **`GET /api/engine/chats/[chatId]/sandbox-status?versionId=`** (valfritt `&sandboxId=`; v0-route finns som compat): serverns bild av sessionen — `running` \| `stopped` \| `missing` \| `version_mismatch` samt `sandboxId`, `sandboxUrl`, `sessionExpiresAt`, `reason`. `stopped` när den lagrade tier-2-providern inte kan återupptas (`tryResumeTier2Runtime` misslyckas; Vercel VM eller preview-host-status).
- **`POST /api/engine/chats/[chatId]/sandbox-heartbeat`** (v0-route finns som compat): JSON `{ versionId, sandboxId, viewerId }`. Uppdaterar `lastUsedAt` endast om Redis/minnet fortfarande binder samma chat+version+sandboxId.
- **`POST /api/engine/chats/[chatId]/sandbox-destroy`** (v0-route finns som compat): builderns "Rensa preview" använder nu den här vägen för att aktivt stänga preview-host/Fly-sessionen, rensa session-store och nolla `engine_versions.sandbox_url` för versionen. För Vercel-spåret finns ännu ingen lika stark remote-destroy; där blir det främst session-rensning.
- **Klient:** `PreviewPanel` pingar heartbeat ca var 25s (synlig flik) när livscykel är `live`; `sandboxId` hålls i builder-state från lyckad `sandbox-preview` och SSE `sandbox-ready`.
- **Recover:** Misstanke från iframe (t.ex. transportfel, ready-timeout) → status-GET; om inte `running` → tvingad `sandbox-preview` med `forceRestart`, debounce och maxförsök (se `useBuilderPageController`).
- **Livscykel-UI:** `PreviewLifecycleState` i `src/lib/builder/preview-lifecycle.ts` — `idle` \| `bootstrapping` \| `live` \| `recovering` \| `failed`.
- **Telemetri:** loggprefix **`[telemetry:sandbox-lifecycle]`** — heartbeat, `sandbox_status`, recover-faser, `sandbox_start_outcome`, samt policy-aware `sandbox_preview_ready` / `sandbox_preview_failed` med tid från engine-start. Tier-2-event kan nu bära `tier2Provider`, `failoverFrom` och `willFailover`.
- **Repair / versionsbyte:** Om SSE `done` sätter **`onlySelectVersionIfWasLatest`: true** uppdateras vald version i byggaren **endast** om användaren redan var på föregående server-«latest» (annars behålls manuellt vald äldre version). Normal egen generering skickar inte flaggan — standard är att följa streamens `versionId`. När användaren **manuellt väljer en äldre version** utan egen live-preview ska buildern nu hellre visa tom-/bootstrapping-state för just den versionen än att tyst falla tillbaka till senaste versionens preview.

**Bootstrap (klient):** `src/lib/builder/sandbox-bootstrap-retry.ts` — samma semantik som ovan; vid `503`/`504` kan servern skicka `Retry-After` (sekunder) som klienten använder som delay före retry (fallback ~6 s).

**Repair en gång:** Filer från `files_json` efter finalize är redan repairade i preflight. `startSandboxPreview` anropas med `skipRepair: true` från own-engine-strömmen (när underlaget kommer från `filesJson`) och från sandbox-preview-API:et, så tier-2 inte kör ett andra repair-varv i onödan.

**Finalize fast/deep path:** `finalize-version.ts` bär nu ett explicit fast/deep-path-kontrakt. Defaultflödet är fortfarande samma produktkedja, men lätta follow-ups (`BuildSpec` med `verificationPolicy: fast`) kan hoppa över deep-path-steg som bildmaterialisering och polish innan versionen sparas. Parse/merge/preflight/persist ligger kvar i fast path. Efter `done` kan klienten fortfarande köra en separat Blob-bildmaterialisering på sparade filer och visar nu explicit status för om det steget kördes, hoppades över eller misslyckades.

**Sandbox `.env.local`:** Både **`startSandboxPreview`** (builder UI) och **`generateOwnEngineSiteFromPrompt`** (MCP/own-engine) anropar `buildSandboxEnvLocalContents` (`src/lib/gen/sandbox-env-local.ts`) som bygger merged `.env.local` i VM — globala placeholders från `config/ai_models/40-generated-site-integration-placeholders.env.txt`, projekt-preview-token, lagrade projekt-env, sist genererad `.env.local` om modellen skrev en (senare vinner). Se `config/user_degraded_env.txt` och avsnittet *Genererade användarsajter* i [`docs/ENV.md`](../ENV.md).

**Scaffold-beroenden:** Standard-`package.json` i `project-scaffold.ts` använder **exakta versionsnummer** (inga `^`) för reproducerbara `npm install` i sandbox. Paket som `runDepCompleter` lägger till från import-scan kan fortfarande använda intervall — okända paket kräver manuell pin.

### ERESOLVE / peer-dependency-fel vid `npm install`

**Symptom:** Exporterat/nedladdat projekt misslyckas med `npm error ERESOLVE unable to resolve dependency tree`.

**Försvarslager (i ordning):**

1. **`BASELINE_PINNED_DEPS`** i `project-scaffold.ts` — `react`, `react-dom`, `next`, `three`, `@react-three/fiber`, `@react-three/drei` låses alltid till scaffold-baseline så modellen inte kan sänka dem.
2. **`dep-completer.ts`** — `KNOWN_PACKAGES` scannar scoped npm-imports (`@scope/name`) och sätter rätt major-intervall. `dep-completer.test.ts` verifierar att alla överlappande nycklar har samma major som scaffold-baseline.
3. **`runProjectSanityChecks`** — billiga heuristiker som flaggar kända dåliga par (t.ex. fiber <9 + React 19, Next 16 + React 18).
4. **`npm run baseline-deps:tree`** — kör `npm install --package-lock-only` på ren baseline i en temp-mapp; fångar träd-konflikter som `baseline-deps:verify` (bara registry) missar.
5. **Quality gate / sandbox** — `npm install` i riktig VM; `sandbox-preview.ts` klassar `ERESOLVE` i feltext.

**Första kontroll vid nytt ERESOLVE:** merged `package.json` → är alla pinnade deps på rätt major? → `KNOWN_PACKAGES` i synk med baseline? → kör `npm run baseline-deps:tree`.

## Sandbox-mall (git)

`@vercel/sandbox` skapas med `Sandbox.create({ source: { type: "git", url: "…" } })` (officiellt mönster). Vi använder `vercel/sandbox-example-next` som bas, skriver sedan användarfiler med `writeFiles` och kör `removeSandboxTemplateLeftovers()` så mall-artefakter inte läcker. **Alternativ** med lägre drift-risk: egen fork av samma repo med **fast tag/commit** som URL, eller (om SDK stödjer det i er miljö) byta till minimal källa när plattformen tillåter fil-only init — kräver separat spike.

Kodstart: `generation-stream.ts`, `finalize-version.ts`, `sandbox-preview.ts`, `PreviewPanel.tsx`, `stream-handlers.ts`.

## MCP vs builder-stream

`src/lib/mcp/generate-site.ts` kan starta sandbox **utan** samma SSE som UI — viktigt vid felsökning. I sandbox-läge anropas **`createSandboxRuntimeFromFiles`** direkt **utan** `startSandboxPreview` / `sandbox-env-local`-merge; builder-kedjan (`startSandboxPreview`) injicerar däremot `40-generated-site-integration-placeholders.env.txt` enligt ovan.

## Deploy

- **Preflight / auto-fix** före Vercel: `applyPreDeployFixes`, lockfile-normalisering, `"use client"`, m.m. — se `src/app/api/v0/deployments/route.ts` och Vitest `route.test.ts` (`precheckOnly`, `skipAutoFix`).
- **409 DEPLOY_MISSING_ENV** om obligatoriska nycklar saknas.
- Opt-out: `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX` eller `skipAutoFix` i body.

## Felsökning: varför startar inte tier 2 «automatiskt»?

Tier 2 är **inte** ett enda alltid-igång subsystem. Vercel Sandbox startas på begäran, medan `preview_host` kan vara en liten separat HTTP-tjänst som står uppe på Fly. Själva **preview-starten** sker fortfarande först när (a) own-engine-strömmen har sparat en version och anropar `startSandboxPreview`, och/eller (b) klienten POST:ar `/api/engine/chats/.../sandbox-preview` (v0-route finns som compat; bootstrap i `useBuilderPageController`). Följande **stoppar eller fördröjer** tier-2-preview:

| Orsak | Vad händer | Var |
|--------|------------|-----|
| **Ingen tier-2-provider** | varken `SAJTMASKIN_PREVIEW_HOST_BASE_URL` eller fungerande Vercel-credentials finns → API `/sandbox-preview` → **503** `sandbox_disabled` | `tier2-config.ts`, `runtime-url.ts`, `sandbox-preview/route.ts` |
| **`previewBlocked`** | Preflight kunde inte bygga tier-1 preview (`buildPreviewHtml` tomt / undantag) → `shouldRunOwnEngineSandbox` false | `finalize-preflight.ts`, `own-engine-sandbox-gate.ts` |
| **Preview-host-fel** | `preview_host` svarar med fel / timeout; i standardläge (strict `preview_host`) stannar flödet, medan explicit `preview_host_then_vercel` loggar failover och provar Vercel Sandbox | `sandbox-preview.ts`, `preview-host-client.ts`, `tier2-config.ts` |
| **`npm install` / VM-fel** | Vercel-spåret returnerar fel (t.ex. **502** från `/api/sandbox`, eller fel från `createSandboxRuntimeFromFiles`) → `build-error` i SSE, ingen `sandbox_url` | `sandbox-preview.ts`, `runtime-url.ts` |
| **Readiness-timeout** | Dev-server svarar inte HTTP inom `SAJTMASKIN_SANDBOX_READINESS_MAX_MS` | `runtime-url.ts` |
| **Misslyckad quality gate** | `verificationState === failed` → `canExposeEnginePreview` är **false** → POST `/sandbox-preview` → **400** `preview_blocked` (bootstrap kan inte «efterstarta» sandbox för den versionen) | `engine-version-lifecycle.ts`, `sandbox-preview/route.ts` |
| **Bootstrap villkor** | Bootstrap körs bara om användaren är inloggad, own-engine-chatt (ej v0-stil), **ingen** `sandboxUrl` på versionen än, och `currentPreviewUrl` saknas eller inte är sandbox-URL; hoppar över under aktiv streaming | `useBuilderPageController.ts` |
| **Deduplicering** | Samma chat+version delar en in-flight `startSandboxPreview` — om första anropet failar måste fel spåras i logg, inte anta dubbel VM | `sandbox-preview.ts` |

**Intent:** När tier 2 lyckas ska `pickVersionPreviewUrl` redan prioritera `sandboxUrl` i UI — problemet är i praktiken att **VM-steget** eller **credentials** saknas, eller att **versionen** är spärrad för preview efter failed verification.

## Tier-2 provider config

- **Preview-host som primär väg:** `SAJTMASKIN_PREVIEW_HOST_BASE_URL`, `SAJTMASKIN_PREVIEW_HOST_API_KEY` (samma secret som `PREVIEW_HOST_API_KEY` på hosten när den kör icke-lokalt), och `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` för klientens host-detektion.
- **Standard med preview-host:** om `SAJTMASKIN_PREVIEW_HOST_BASE_URL` finns och `SAJTMASKIN_TIER2_RUNTIME` är unset används strikt `preview_host`.
- **Opt-in fallback:** sätt `SAJTMASKIN_TIER2_RUNTIME=preview_host_then_vercel` för preview-host först + Vercel-fallback.
- **Hård cutover (explicit):** sätt `SAJTMASKIN_TIER2_RUNTIME=preview_host`.
- **Vercel fallback / sekundär provider:** `VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` enligt behov.
- **Verifiering/validering:** quality-gate, server-verify och repair re-check använder preview-hosts separata verify-lane. Den kör i isolerad workspace och återanvänder inte live-previewns dev-workspace. Installsteget är lockfile-aware (`npm ci` med `package-lock.json`, `pnpm install --frozen-lockfile` med `pnpm-lock.yaml`, annars `npm install`). **Tier-2 server-verify kör bara `typecheck`** — `next build` körs inte automatiskt. Interaktiv quality gate kan inkludera build/lint. Verify-workspaces rensas efter varje jobb, och preview-hostens cleanup (`POST /admin/cleanup`, API-key-skyddad) rensar nu även stale preview-workspaces / utgångna sessioner. App-sidan försöker en cleanup + en enda retry när preview-host svarar med `ENOSPC`.

Se även [`docs/ENV.md`](../ENV.md) och `src/lib/env.ts`.

## Webhook / deploy events

Vercel → Sajtmaskin webhook: `src/app/api/webhooks/vercel/route.ts` (`VERCEL_WEBHOOK_SECRET`).
