# Preview, sandbox och deploy

**Senast uppdaterad:** 2026-03-27

**Operativt kördokument** för own-engine → finalize → sandbox → iframe. Intent, leveranser och kodpekare: denna fil + [`PROJECT-STATE-AND-DIRECTION.md`](../plans/active/PROJECT-STATE-AND-DIRECTION.md) (backlog/beslut).

## End-to-end: own-engine som ägare och Fidelity 2

**Sanning i produkt:** Genererad kod, versioner och preview ska spåras till **own-engine** (`engine_chats` / `engine_versions`, `files_json`) och **inte** till V0 Platform API.

**Kedja (lyckat fall):**

1. `POST /api/v0/chats/stream` skapar/uppdaterar engine-chatt och strömmar own-engine-generering.
2. **Finalize** (`finalize-version.ts`) kör autofix, validering, merge, preflight och sparar **`files_json`** på versionen.
3. `startSandboxPreview` (`sandbox-preview.ts`) bygger fullt projekt, kör `npm install` + `npm run dev` i Vercel Sandbox.
4. Vid lyckad readiness: **`engine_versions.sandbox_url`** sätts; klienten visar **Fidelity 2** — `fidelityTier: 2` i `SandboxPreviewResult` (riktig Next dev-server i VM). **Shim** (`/api/preview-render`) är bara **brygga** under uppstart eller vid fel, inte målpreview.

**Fidelity 3** (`prodBuildVerified`, `fidelityTier: 3`) när `SAJTMASKIN_SANDBOX_PREVIEW_MODE=dev_then_build` och byggsteget lyckas — se `runtime-url.ts`.

**V0 Platform** (npm `v0-sdk`, `V0_API_KEY`) ska inte vara del av denna kedja; HTTP-prefixet `/api/v0/` är **API-version 0**, inte leverantören V0.

## Levererat (preview-kedjan)

Följande är **implementerat** i kod och täcks av denna fil + `docs/ENV.md` där det anges:

| Område | Vad | Var i kod (vägledning) |
|--------|-----|-------------------------|
| Kanoniska filer | Sandbox bygger från **`filesJson`** efter finalize, inte primärt `contentForVersion` | `generation-stream.ts`, `sandbox-preview/route.ts` |
| `previewBlocked` | Startar inte tier-2 sandbox när preflight blockerar | `own-engine-sandbox-gate.ts`, `generation-stream.ts` |
| Readiness | HTTP-probe efter `npm run dev` (2xx + dokumentlik `Content-Type`) | `runtime-url.ts` (`waitForSandboxDevServerReady`) |
| Shim under boot | `done` med shim / `sandboxPending` så iframen inte lämnas tom | `generation-stream.ts`, `stream-handlers.ts` |
| HTTP API | Meningsfulla statuskoder + `retryable` för `/sandbox-preview` | `sandbox-preview-errors.ts`, route |
| Bootstrap-retry | Klienten respekterar `retryable`, **500** med `retryable: true`, `Retry-After` | `sandbox-bootstrap-retry.ts`, `useBuilderPageController.ts` |
| Dubbel repair | `skipRepair: true` när underlag redan är finalizeat (DB / `filesJson`) | `sandbox-preview.ts` |
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
| 1 — **Shim** | `/api/preview-render` | Snabb HTML-approximation — **inte** full Next-server |
| 2 — **Sandbox** | Vercel Sandbox / `npm run dev` | Riktigare Next dev-runtime (ephemeral, on-demand) |
| 3 — **Build-check** | `npm run build` i sandbox (läge-beroende) | Validering närmare produktion |

**Produktintent:** när sandbox lyckas ska **sandbox-URL** prioriteras i iframen före shim och övrig `demoUrl`. Fel (`502`, HMR-brus) och sekvens: följ `generation-stream.ts` → `sandbox-preview.ts` → `PreviewPanel.tsx`.

## Demo-URL-kedja

1. Efter `done` i SSE: `demoUrl` / `shimPreviewUrl` pekar på **tier-1 shim** när `previewUrl` finns; om sandbox ska starta men `previewUrl` saknas används `buildOwnEnginePreviewRuntime` → `/api/preview-render` så iframen inte lämnas tom (`sandboxPending` kan vara true medan tier-2 startar).
2. Kanoniska filer för sandbox är **`filesJson` efter finalize** (merge + preflight), inte rå `contentForVersion`.
3. Om sandbox konfigurerad och inte `previewBlocked`: `startSandboxPreview` → `sandbox-ready` / `build-error`. Efter `npm run dev` körs en **readiness probe** mot preview-URL: **2xx** och dokumentlik `Content-Type` (t.ex. `text/html`), inte bara att undvika 5xx (se `waitForSandboxDevServerReady` i `runtime-url.ts`; `SAJTMASKIN_SANDBOX_READINESS_MAX_MS` i `docs/ENV.md`).
4. `engine_versions.sandbox_url` uppdateras vid lyckad sandbox.

**Typer / kontrakt:** `src/lib/gen/preview-contract.ts` (SSE-fält). **HTTP:** `/api/v0/chats/[chatId]/sandbox-preview` returnerar meningsfulla statuskoder (`422` repair, `503`/`504` runtime) och fältet `retryable` (bootstrap retry:ar bara när `retryable !== false`; **500** kräver `retryable: true` för auto-retry) — se `httpStatusForSandboxPreviewFailure`.

**Bootstrap (klient):** `src/lib/builder/sandbox-bootstrap-retry.ts` — samma semantik som ovan; vid `503`/`504` kan servern skicka `Retry-After` (sekunder) som klienten använder som delay före retry (fallback ~6 s).

**Repair en gång:** Filer från `files_json` efter finalize är redan repairade i preflight. `startSandboxPreview` anropas med `skipRepair: true` från own-engine-strömmen (när underlaget kommer från `filesJson`) och från sandbox-preview-API:et, så tier-2 inte kör ett andra repair-varv i onödan.

**Sandbox `.env.local`:** Både **`startSandboxPreview`** (builder UI) och **`generateOwnEngineSiteFromPrompt`** (MCP/own-engine) anropar `buildSandboxEnvLocalContents` (`src/lib/gen/sandbox-env-local.ts`) som bygger merged `.env.local` i VM — globala placeholders från `config/ai_models/40-generated-site-integration-placeholders.env.txt`, projekt-preview-token, lagrade projekt-env, sist genererad `.env.local` om modellen skrev en (senare vinner). Se `config/user_degraded_env.txt` och `docs/ENV.md` (avsnitt genererade sajter).

**Scaffold-beroenden:** Standard-`package.json` i `project-scaffold.ts` använder **exakta versionsnummer** (inga `^`) för reproducerbara `npm install` i sandbox. Paket som `runDepCompleter` lägger till från import-scan kan fortfarande använda intervall — okända paket kräver manuell pin.

## Sandbox-mall (git)

`@vercel/sandbox` skapas med `Sandbox.create({ source: { type: "git", url: "…" } })` (officiellt mönster). Vi använder `vercel/sandbox-example-next` som bas, skriver sedan användarfiler med `writeFiles` och kör `removeSandboxTemplateLeftovers()` så mall-artefakter inte läcker. **Alternativ** med lägre drift-risk: egen fork av samma repo med **fast tag/commit** som URL, eller (om SDK stödjer det i er miljö) byta till minimal källa när plattformen tillåter fil-only init — kräver separat spike.

Kodstart: `generation-stream.ts`, `finalize-version.ts`, `sandbox-preview.ts`, `PreviewPanel.tsx`, `stream-handlers.ts`.

## MCP vs builder-stream

`src/lib/mcp/generate-site.ts` kan starta sandbox **utan** samma SSE som UI — viktigt vid felsökning. I sandbox-läge anropas **`createSandboxRuntimeFromFiles`** direkt **utan** `startSandboxPreview` / `sandbox-env-local`-merge; builder-kedjan (`startSandboxPreview`) injicerar däremot `40-generated-site-integration-placeholders.env.txt` enligt ovan.

## Deploy

- **Preflight / auto-fix** före Vercel: `applyPreDeployFixes`, lockfile-normalisering, `"use client"`, m.m. — se `src/app/api/v0/deployments/route.ts` och Vitest `route.test.ts` (`precheckOnly`, `skipAutoFix`).
- **409 DEPLOY_MISSING_ENV** om obligatoriska nycklar saknas.
- Opt-out: `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX` eller `skipAutoFix` i body.

## Felsökning: varför startar inte sandbox «automatiskt»?

Sandbox är **inte** en separat bakgrundstjänst som alltid är igång — den **startar när** (a) own-engine-strömmen har sparat en version och anropar `startSandboxPreview`, och/eller (b) klienten POST:ar `/api/v0/chats/.../sandbox-preview` (bootstrap i `useBuilderPageController`). Följande **stoppar eller fördröjer** tier 2 trots att shim redan visas:

| Orsak | Vad händer | Var |
|--------|------------|-----|
| **Ingen Vercel-credentials** | `isSandboxConfigured()` är false → sandbox körs inte i strömmen; API `/sandbox-preview` → **503** `sandbox_disabled` | `runtime-url.ts`, `sandbox-preview/route.ts` |
| **`previewBlocked`** | Preflight kunde inte bygga tier-1 preview (`buildPreviewHtml` tomt / undantag) → `shouldRunOwnEngineSandbox` false | `finalize-preflight.ts`, `own-engine-sandbox-gate.ts` |
| **`npm install` / VM-fel** | `startSandboxPreview` returnerar fel (t.ex. **502** från `/api/sandbox`, eller fel från `createSandboxRuntimeFromFiles`) → `build-error` i SSE, ingen `sandbox_url` | `sandbox-preview.ts`, `runtime-url.ts` |
| **Readiness-timeout** | Dev-server svarar inte HTTP inom `SAJTMASKIN_SANDBOX_READINESS_MAX_MS` | `runtime-url.ts` |
| **Misslyckad quality gate** | `verificationState === failed` → `canExposeEnginePreview` är **false** → POST `/sandbox-preview` → **400** `preview_blocked` (bootstrap kan inte «efterstarta» sandbox för den versionen) | `engine-version-lifecycle.ts`, `sandbox-preview/route.ts` |
| **Bootstrap villkor** | Bootstrap körs bara om användaren är inloggad, own-engine-chatt (ej v0-stil), **ingen** `sandboxUrl` på versionen än, och `currentDemoUrl` är shim eller tom; hoppar över under aktiv streaming | `useBuilderPageController.ts` |
| **Deduplicering** | Samma chat+version delar en in-flight `startSandboxPreview` — om första anropet failar måste fel spåras i logg, inte anta dubbel VM | `sandbox-preview.ts` |

**Intent:** När tier 2 lyckas ska `pickVersionPreviewUrl` redan prioritera `sandboxUrl` i UI — problemet är i praktiken att **VM-steget** eller **credentials** saknas, eller att **versionen** är spärrad för preview efter failed verification.

## Sandbox-credentials

Vercel Sandbox token / org: [`docs/ENV.md`](../ENV.md) (`VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN`, team/project-id enligt behov).

## Webhook / deploy events

Vercel → Sajtmaskin webhook: `src/app/api/webhooks/vercel/route.ts` (`VERCEL_WEBHOOK_SECRET`).
