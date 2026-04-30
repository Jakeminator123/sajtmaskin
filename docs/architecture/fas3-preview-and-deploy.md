# Fas 3 — Preview, Quality Gate och Deploy

Vad som händer efter att en version sparats i databasen: preview-start, post-checks, quality gate och deploy.

**Senast uppdaterad:** 2026-04-20. **Kod är source of truth.** Ordlista: [glossary.md](./glossary.md).

---

## Fasgräns mot Fas 2

| Fas 2 (före) | Fas 3 (denna fil) |
|---|---|
| `finalizeAndSaveVersion()` | `startPreviewSession` + preview lifecycle |
| Persist av `engine_versions.files_json` | Start/resume av VM-session + `preview_url` |
| `done.previewPending` signaleras | `preview-ready` eller `build-error` skickas |

Se [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md).

---

## Översikt

```
Version sparad i DB
  │
  ├─ 1. Preview-session startar (tier-2 VM eller shim)
  ├─ 2. Post-checks (klient): diff, SEO, routes, bilder, sanity → readiness
  ├─ 3. Quality Gate (tier-2 verify lane): typecheck → ev. visuell QA → ev. repair
  └─ 4. Deploy (manuellt): pre-deploy fix → env-check → Vercel deployment
```

End-to-end (lyckat fall): `done` (Fas 2) → post-finalize triggar preview-start → `startPreviewSession` bygger komplett projekt och startar `preview_host` → `engine_versions.preview_url` uppdateras → klienten får `preview-ready`.

Primär previewväg är `preview_host` (Fly). Tier-1 shim (`/api/preview-render`) är legacy/diagnostik.

---

## Kanoniska API-ytor

| Route | Syfte |
|---|---|
| `POST /api/engine/chats/[chatId]/preview-session` | Start/restarta preview-session |
| `GET /api/engine/chats/[chatId]/preview-status` | Status/resync/recover-underlag |
| `POST /api/engine/chats/[chatId]/preview-heartbeat` | Håller aktiv session levande |
| `POST /api/engine/chats/[chatId]/preview-hibernate` | Parkera vid dold flik/pagehide |
| `POST /api/engine/chats/[chatId]/preview-destroy` | Stäng session + rensa preview-url |
| `POST /api/engine/chats/[chatId]/quality-gate` | Interaktiv quality-gate lane |
| `POST /api/engine/chats/[chatId]/repair` | Manual/klientdriven repair |
| `POST /api/engine/chats/[chatId]/accept-repair` | Applicera serverrepair från `repair_available` |
| `POST /api/engine/chats/[chatId]/finalize-design` | F3-trigger ("Bygg integrationer"). Validerar tier-3 readiness mot dossier-`enforcement`-tags + `allowPlaceholdersInF3`-toggle; 412 + `missingByIntegration` bara när `build`-enforcement-keys saknas och inte är placeholder-täckta. |
| `PATCH /api/projects/[id]/preferences` | Sätter app-project-preferenser (P31: `allowPlaceholdersInF3` boolean i `project_data.meta`). |
| `POST /api/v0/deployments` | Deploy till Vercel |
| `POST /api/domains/link` | Länkar domän till det konfigurerade Vercel-projektet. Kräver inloggning + rate-limit, `VERCEL_TOKEN` och `VERCEL_PROJECT_ID`; `VERCEL_TEAM_ID` är valfri. Body-`projectId` får bara matcha konfigurerat `VERCEL_PROJECT_ID` — avvikelse ger 403. `.se`/`.nu` kan även använda valfria `LOOPIA_*` för DNS. |
| `POST /api/domains/verify` | Triggar Vercel-verifiering för domänen mot konfigurerat `VERCEL_PROJECT_ID`. Kräver inloggning + rate-limit; avvikande body-`projectId` ger 403. |
| `POST /api/domains/save` | Sparar domän på deployment-raden efter tenant-/ägarkoll via deployment → chat → project (`setDeploymentDomainForRequest`). |

Sedan 2026-04-20 (P29 Fas 1B) finns **inga** `/api/v0/chats/...` compat-routes kvar — chat-ytan är konsoliderad under `/api/engine/chats/...`. Övriga `/api/v0/*`-segment (deployments, projects, integrations) är Class C legacy med riktiga klient-callsites.

---

## Persistens och source of truth

| Tabell | Vad |
|---|---|
| `engine_chats` / `engine_messages` | Metadata och konversation |
| `engine_versions.files_json` | Kodartifact (kanonisk) |
| `engine_versions.preview_url` | Senaste lyckade live-preview |
| `engine_versions.repaired_files_json` | Pending repair (väntar på accept) |
| `engine_versions.lifecycle_stage` | `"design"` (default) eller `"integrations"` |
| `engine_versions.parent_version_id` | F3-version pekar på sin F2-ursprung |

`project_data` är app-/builder-snapshot, inte primär kodsanning när version finns.

---

## Preview

### Två preview-typer

| Typ | Teknik | När |
|---|---|---|
| **Tier-2 (live)** | Separat Fly-service kör `npm run dev` med riktiga filer | Standard när `SAJTMASKIN_PREVIEW_HOST_BASE_URL` är satt |
| **Shim** (legacy) | HTML med CDN React + transpilerad kod via `/api/preview-render` | **Avstängd som default sedan Block D (2026-04-21)** — `SAJTMASKIN_SHIM_PREVIEW_DISABLED` defaultar till true. Operatörer kan opta in genom att sätta `=0`/`false`/`off`/`no`. När shim är på agerar den fallback om tier-2 inte är konfigurerad; när den är av (default) returnerar `buildPreviewUrl()` `null` och `/api/preview-render` svarar `410 Gone`. |

### Tier-2 preview-session (`preview-session.ts`)

`startPreviewSession()`:

1. **Dedupe**: Samma `chatId:versionId` delar in-flight promise.
2. **Resume**: Om lagrad session matchar version → `fetchPreviewHostStatus()` → om running → touch store, returnera `"resumed"`.
3. **Kall start**:
   - Reparera filer (optional)
   - `buildCompleteProject()` (full filstruktur)
   - Injicera placeholder API-route om saknas
   - Bygg `.env.local` via `buildPreviewEnvLocalContents()` (lager: globala placeholders → projekt-env → genererad env)
   - `POST /preview/session/start` till Fly-host med `filesJson`
4. **Lagra**: `touchPreviewSessionAsync()` (in-memory Map + optional Redis).

### Preview-host (`preview-host/`)

Separat Node-tjänst på Fly:

- Tar emot filer → workspace → `npm install` → `npm run dev`
- Verify-lane: separat workspace för typecheck
- Sessions ~1h TTL, opportunistisk cleanup
- Endpoints: `/preview/session/start|update|hibernate|destroy|status`, `/preview/verify`, `/preview/logs/...`

### Session-lifecycle (klient)

| Hook | Vad |
|---|---|
| `usePreviewHeartbeat` | Var 25s `postPreviewHeartbeat()`. Dold tab → 60s → `postPreviewHibernate()`. `pagehide` → hibernate med keepalive |
| `usePreviewIframe` | Shim: pollar iframe för tom root / fel (45s timeout). Tier-2: laddar direkt. Blank → `onPreviewSessionSuspect()` |

### Session-status

`running` / `starting` / `stopped` / `missing` / `version_mismatch`. Recover: klient kan force-restarta efter suspect/timeouts; recover-räknare resetas per chat+version. TTL ~1h (host + app-store).

### SSE-semantik

- `done` = versionen sparad, **inte** att preview är redo
- `done.previewPending=true` = preview-start påbörjas efter `done`
- `previewUrlHint` = tillfällig boot-hint, **inte** kanonisk live-url
- `preview-ready` = robust signal för klar preview-session

### Shim-preview (compatibility)

`buildPreviewHtml()` i `build-preview-document.ts`: hittar page-fil, samlar CSS, transpilerar via `buildPreviewScript()` med CDN Tailwind + React UMD, 7s boot-timeout.

---

## Post-checks (`post-checks.ts`)

Körs av klienten efter stream-hantering + finalize:

1. Parallellt: `fetchChatFiles()` + `fetchChatVersions()`
2. `buildPostCheckBaseline()` — diff, routes, sanity, SEO, analytics
3. `validateImages()` — `POST .../validate-images` med auto-fix
4. `buildPostCheckArtifacts()` — strukturerat resultat

### Readiness-failures

Inga filändringar · Saknad demo-URL (om inte preview pending i VM) · Stream critical anomaly · Lucide Link-missbruk · Sanity-fel · Kritisk install-risk · Kräver env-konfiguration · Planerade routes saknas (strikt vid brief-routes + ingen demo).

### Output

- `qualityTier`: `none` / `preview` / `tier2`
- `autoFixQueued`: bool
- `tool:post-check`: appendas till assistentmeddelandet i UI

---

## Quality Gate

### Tier-2 Verify Lane

Om ingen autofix köades → `runTier2VerifyLane()`:

1. `POST /api/engine/chats/{chatId}/quality-gate` med `{ versionId, checks }`
2. Engine: `buildExportableProject()` → `runQualityGateChecks()` → preview-host verify lane
3. Optional: visuell QA om checks passerar

### Check-profiler (manifest-styrda)

Konsoliderat 2026-04 från fyra (`tier2`/`serverVerify`/`promotion`/`interactive`) till två via `config/ai_models/manifest.json` (`qualityGateTiers`):

| Profil | Checks | När |
|---|---|---|
| `designPreview` (F2) | `["typecheck"]` | Efter finalize och i bakgrunds-server-verify. Slimmad 2026-04-23: `build` och `lint` flyttade till pre-VM warm-cache-passen (`warm-typecheck.ts` + `warm-eslint.ts`) i Sajtmaskin-backend. Sparar ~5–20 s Fly-CPU per finalize. |
| `integrationsBuild` (F3) | `["typecheck", "build", "lint"]` | I `/finalize-design`/promotion-flödet. F3 betalar alltid för full build. Lint tillagd 2026-04-21. |

Verify-lane returnerar även informativa checks: `install-cache-share` (node_modules-delning), `install-peer-fallback` (peer-konflikt fallback med `--legacy-peer-deps`).

### Resultat-hantering (klient)

| Resultat | Åtgärd |
|---|---|
| Alla checks PASS | `tool:quality-gate` med pass-resultat |
| FAIL + env-signal | `integrationSignalToToolPart()` → env-vars-förslag i UI |
| FAIL + reparerbart | `tryServerRepair()` → `POST .../repair` → server-repair tool part |
| FAIL + ej reparerbart | `onAutoFix()` med repair-kontext |
| Pass men visuell QA fail | `handleVisualQaAutofix()` |

### Live-preview vs Verify (viktig skillnad)

Preview-host kör **två separata lanes**: live-preview (iframe, `npm install` + `npm run dev`) och verify (typecheck + build + lint). En version kan vara live i preview men ändå få verify-fail.

### Verifier-pass (Fas 2)

Skild från quality gate. `runVerifierPass()` är read-only LLM-granskning som rapporterar findings (`blocking` / `quality`). Findings är **advisory** — stoppar inte persist (men matas in i `runLlmFixer` direkt efter, se Fas 2).

---

## F2/F3-livscykel (2026-04)

| | F2 (`fidelity2`) | F3 (`fidelity3`) |
|---|---|---|
| Default? | Ja | Nej — explicit trigger |
| Trigger | Init / vanlig follow-up | `POST /api/engine/chats/[chatId]/finalize-design` |
| `lifecycle_stage` | `"design"` | `"integrations"` |
| Tier-3 SDK-imports (Stripe, Supabase, Clerk, Auth.js, Redis, OpenAI, Resend, ...) | Strippas av `tier3-sdk-guard-fixer` → placeholder-baserat | Behålls; kräver riktiga env-keys |
| System prompt | Standard | + `## Tier-3 Integration Build Plan` med per-integration `requiredRealEnvKeys` + 4–8 build-steg |
| `env-local.ts` | Tier-3 stub-lager aktivt | Stub-lager strippas helt (om inte `allowPlaceholdersInF3`-toggle är på) |
| Readiness | Ingen tier-3 check | `validateTier3Readiness` mot `projectEnvVars` filtrerat på dossier-`enforcement: "build"` (P31). 412 + `missingByIntegration` bara om verkligt blockerande keys saknas. `feature-runtime` rapporteras som warning, `warn-only` som info. |

---

## Repair-accept lifecycle

```
quality gate fail
  → server repair (runRepairLoop)
  → quality gate repass
    → pass: saveRepairedFiles → verificationState=repair_available
    → fail: verificationState=failed

repair_available
  → SSE: version-repair-available
  → versions/readiness visar pending repair
  → POST /accept-repair applicerar filer och markerar passed/promoted
  → timeout: auto-accept enligt repairAcceptTimeoutMinutes
```

Om serverrepair passerar quality gate blir versionen `repair_available` istället för att skrivas över. Filerna ligger i `repaired_files_json` tills `accept-repair` (eller timeout-autoaccept) applicerar dem till `files_json`.

`server-verify` och manuell `repair` delar samma repair-kärnlogik (`runRepairLoop`) inkl. targeted/warm repair av trasiga filer och strukturerat `errorManifest`.

---

## Vanliga blockerare

| Orsak | Effekt |
|---|---|
| `SAJTMASKIN_PREVIEW_HOST_BASE_URL` saknas | `preview_session_disabled` (503) |
| `previewBlocked` / verifieringspolicy blockerar | Ingen exponerad live-preview |
| Preview-host runtimefel | `build-error` eller retrybar bootstrapfail |
| Session/version mismatch | Recover/resync krävs |
| Npm/dependency-fel i VM | Preview startar ej eller kraschar tidigt |
| `repair_available` på senaste version | Deploy-readiness blockerar tills repair accepteras/autoaccepteras |

---

## Deploy (`/api/v0/deployments/route.ts`)

### POST-flöde

1. Rate limit, bot-check, Zod-validering (`chatId`, `versionId`, `projectName`, ...)
2. Credits-kontroll (`prepareCredits`)
3. Ladda version + filer + chatt + projekt
4. **Pre-deploy fix-pipeline** (om inte `skipAutoFix`):
   - Strip lockfiles · Fix/injicera `package.json` · `use client`-heuristik · Font-weight-fix · Broken CSS `@utility`-block · Dependency-merge via `ensureDependenciesInPackageJson()`
5. `resolveEnvRequirementsFromVersionFiles()` + `buildDeployReadiness()`
6. `precheckOnly` → returnera readiness utan deploy
7. Saknade env-vars → **409** `DEPLOY_MISSING_ENV`
8. **Deploy**: `createDeploymentRecord()` → `materializeImagesInTextFiles()` → `createVercelDeployment()` → `syncEnvVarsToVercelProject()` → `updateDeploymentStatus()` → credit commit

### GET

`?chatId=` → lista deploys; refreshar senaste icke-terminala Vercel-deploy-status.

### Env-gate

Endast `missingEnvKeys` blockerar via `DEPLOY_MISSING_ENV` (HTTP 409). `placeholderCoveredKeys` (täckta av harmless eller tier-3 stub-platshållare) går i `deployReadiness.warnings` och stoppar **inte** deployen. Matchar F3-readiness-gaten i `app/api/engine/chats/[chatId]/readiness/route.ts` ("deferred to publish").

### Deploy-readiness (`deploy-readiness.ts`)

```
buildDeployReadiness() → {
  ready: missingEnv.length === 0,
  missingEnv,
  invalidFiles,
  warnings
}
```

### Deploy-SSE

Klienten reconnectar vid transienta nätverksfel (max 3 försök: 2s/4s/8s). Vercel webhook-spåret hanteras av `src/app/api/webhooks/vercel/route.ts`.

---

## Preview Panel UI (`preview-panel/`)

`PreviewPanel.tsx`:

- **Lägen**: Preview iframe / kod / element registry / composer / inspector
- **Chrome**: Toolbar, route-picker, banners (shim vs live), tier-2 integration strip
- **Frame**: Loading overlay, error overlay med runbook-rader, iframe med `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`
- **Surface labels**: Skiljer compatibility shim / live-preview (tier-2) / recovering / extern

---

## Kodfiler

| Område | Fil |
|---|---|
| Preview-session | `src/lib/gen/preview/preview-session.ts` |
| Preview-host klient | `src/lib/gen/preview/preview-host-client.ts` |
| Session store | `src/lib/gen/preview/session-store.ts` |
| Tier-2 config / resume | `src/lib/gen/preview/tier2-config.ts`, `tier2-resume.ts` |
| Preview env | `src/lib/gen/preview/env-local.ts` |
| Shim-preview | `src/lib/gen/preview/build-preview-document.ts` |
| Preview diagnostik | `src/lib/gen/preview/diagnostics.ts` |
| Browser preview API | `src/lib/builder/preview-session/api.ts` |
| Post-checks | `src/lib/hooks/chat/post-checks.ts`, `post-checks-results.ts`, `post-checks-preview.ts` |
| Quality gate API | `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` |
| Quality gate checks | `src/lib/gen/verify/quality-gate-checks.ts` |
| Manifest-loader | `src/lib/ai-models/load-manifest.ts` |
| Deploy API | `src/app/api/v0/deployments/route.ts` |
| Deploy readiness | `src/lib/deploy/deploy-readiness.ts` |
| Deploy dependencies | `src/lib/deploy/dependency-utils.ts` |
| Preview-host (Fly) | `preview-host/` |
| Preview panel UI | `src/components/builder/preview-panel/PreviewPanel.tsx` |
| Stream handlers | `src/lib/hooks/chat/stream-handlers.ts` |
| usePreviewSession | `src/app/builder/usePreviewSession.ts` |

---

## Relaterade dokument

- [fas1-startprompt-flow.md](./fas1-startprompt-flow.md)
- [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md)
- [preview-white-screen-runbook.md](./preview-white-screen-runbook.md)
- `docs/schemas/preview-session-contract.md`
- `docs/ENV.md`
