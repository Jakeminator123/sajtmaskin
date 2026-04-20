# Fas 3 — Preview, Quality Gate och Deploy

Vad som händer efter att en version sparats i databasen: preview-start, post-checks, quality gate och deploy.

**Ordlista:** `docs/architecture/glossary.md`. **Kod är source of truth.**

---

## Översikt

```
Version sparad i DB
  │
  ├─ 1. Preview-session startar (tier-2 VM eller shim)
  │
  ├─ 2. Post-checks (klient)
  │     Diff, SEO, routes, bilder, sanity → readiness
  │
  ├─ 3. Quality Gate (tier-2 verify lane)
  │     Typecheck → ev. visuell QA → ev. repair
  │
  └─ 4. Deploy (manuellt, separat)
        Pre-deploy fix → env-check → Vercel deployment
```

---

## Preview

### Två preview-typer

| Typ | Teknik | När |
|-----|--------|-----|
| **Tier-2 (live)** | Separat Fly-service kör `npm run dev` med riktiga filer | Standard när `SAJTMASKIN_PREVIEW_HOST_BASE_URL` är satt |
| **Shim (compatibility)** | HTML-dokument med CDN React + transpilerad kod i iframe via `/api/preview-render` | Fallback när tier-2 inte är konfigurerad |

### Tier-2 preview-session (`preview-session.ts`)

`startPreviewSession()`:

1. **Dedupe**: Samma `chatId:versionId` delar en in-flight promise.
2. **Resume**: Om lagrad session matchar version → `fetchPreviewHostStatus()` → om running → touch store, returnera `"resumed"`.
3. **Kall start**:
   - Reparera filer (optional)
   - `buildCompleteProject()` (fullständig filstruktur)
   - Injicera placeholder API-route om den saknas
   - Bygg `.env.local` via `buildPreviewEnvLocalContents()` (lager: globala placeholders → projekt-env → genererad env)
   - `POST /preview/session/start` till Fly-host med `filesJson`
4. **Lagra**: `touchPreviewSessionAsync()` sparar session-id + URL (in-memory Map + optional Redis).

### Preview-host (`preview-host/`)

Separat Node-tjänst på Fly:

- Tar emot filer → skriver till workspace → `npm install` → `npm run dev`
- Verify-lane: separat workspace för typecheck
- Sessions med ~1h TTL, opportunistisk cleanup
- Endpoints: `/preview/session/start|update|hibernate|destroy|status`, `/preview/verify`, `/preview/logs/...`

### Session-livscykel (klient)

| Hook | Vad det gör |
|------|-------------|
| `usePreviewHeartbeat` | Var 25s `postPreviewHeartbeat()` → håller sessionen vid liv. Dold tab → efter 60s `postPreviewHibernate()`. `pagehide` → hibernate med keepalive. |
| `usePreviewIframe` | Shim: pollar iframe-dokument för tom root / fel (45s timeout). Tier-2: laddar direkt. Blank → `onPreviewSessionSuspect()`. |

### Shim-preview (compatibility)

`buildPreviewHtml()` i `build-preview-document.ts`:
- Hittar page-fil via `findPageFile()`
- Samlar CSS via `findCssFiles()`
- Transpilerar kod via `buildPreviewScript()` med CDN Tailwind + React UMD
- 7s boot-timeout i injicerat script

---

## Post-checks (`post-checks.ts`)

Körs av klienten efter att stream-hantering och finalize är klar.

### Flöde

1. Parallellt: `fetchChatFiles()` + `fetchChatVersions()`
2. `buildPostCheckBaseline()` — diff, routes, sanity, SEO, analytics
3. `validateImages()` — `POST .../validate-images` med auto-fix
4. `buildPostCheckArtifacts()` — strukturerat resultat

### Readiness-kontroller

| Kontroll | Failure = |
|----------|-----------|
| Inga filändringar | Readiness-fail |
| Saknad demo-URL (om inte preview pending i VM) | Readiness-fail |
| Stream critical anomaly | Readiness-fail |
| Lucide Link-missbruk | Readiness-fail |
| Sanity-fel | Readiness-fail |
| Kritisk install-risk | Readiness-fail |
| Kräver env-konfiguration | Readiness-fail |
| Planerade routes saknas (strikt vid brief-routes + ingen demo) | Readiness-fail |

### Output

- **`qualityTier`**: `none` / `preview` / `tier2`
- **`autoFixQueued`**: true om autofix ska köras
- **`tool:post-check`**: Appendas till assistentmeddelandet i UI

---

## Quality Gate

### Tier-2 Verify Lane

Om ingen autofix köades → `runTier2VerifyLane()`:

1. `POST /api/engine/chats/{chatId}/quality-gate` med `{ versionId, checks }`
2. **Checks**: Från `DESIGN_PREVIEW_QUALITY_GATE_CHECKS` (F2-lane, manifest-default `["typecheck"]`). F3-lanen heter `INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS` (`["typecheck", "build"]`). Konsoliderat 2026-04 från fyra lanes (`tier2`/`serverVerify`/`promotion`/`interactive`).
3. Engine: `buildExportableProject()` → `runQualityGateChecks()` → preview-host verify lane
4. Optional: visuell QA om checks passerar

### Resultat-hantering (klient)

| Resultat | Åtgärd |
|----------|--------|
| Alla checks PASS | `tool:quality-gate` med pass-resultat |
| FAIL + env-signal | `integrationSignalToToolPart()` → env-vars-förslag i UI |
| FAIL + reparerbart | `tryServerRepair()` → `POST .../repair` → server-repair tool part |
| FAIL + ej reparerbart | `onAutoFix()` med repair-kontext |
| Pass men visuell QA fail | `handleVisualQaAutofix()` |

### Verifier-pass (i Fas 2 finalize)

Skild från quality gate. `runVerifierPass()` är en **read-only LLM-granskning** som rapporterar findings (`blocking` / `quality`) utan att ändra kod. Findings är **advisory** — stoppar inte persist.

---

## Deploy (`/api/v0/deployments/route.ts`)

### POST-flöde

1. Rate limit, bot-check, Zod-validering av body (`chatId`, `versionId`, `projectName`, etc.)
2. Credits-kontroll (`prepareCredits`)
3. Ladda version + filer + chatt + projekt
4. **Pre-deploy fix-pipeline** (om inte `skipAutoFix`):
   - Strip lockfiles
   - Fix/injicera `package.json`
   - `use client`-heuristik
   - Font-weight-fix
   - Broken CSS `@utility`-block
   - Dependency-merge via `ensureDependenciesInPackageJson()`
5. **`resolveEnvRequirementsFromVersionFiles()`** + **`buildDeployReadiness()`**
6. `precheckOnly` → returnera readiness utan deploy
7. Saknade env-vars → **409** `DEPLOY_MISSING_ENV`
8. **Deploy**: `createDeploymentRecord()` → `materializeImagesInTextFiles()` → `createVercelDeployment()` → `syncEnvVarsToVercelProject()` → `updateDeploymentStatus()` → credit commit

### GET

`?chatId=` → lista deploys; refreshar senaste icke-terminala Vercel-deploy-status.

### Deploy-readiness (`deploy-readiness.ts`)

```
buildDeployReadiness() → {
  ready: missingEnv.length === 0,
  missingEnv,
  invalidFiles,
  warnings
}
```

---

## Preview Panel UI (`preview-panel/`)

`PreviewPanel.tsx`:

- **Lägen**: Preview iframe / kod / element registry / composer / inspector
- **Chrome**: Toolbar, route-picker, banners (shim vs live), tier-2 integration strip
- **Frame**: Loading overlay, error overlay med runbook-rader, iframe med `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`
- **Surface labels**: Skiljer compatibility shim / live-preview (tier-2) / recovering / v0 fallback / extern

---

## Kodfiler

| Steg | Fil |
|------|-----|
| Preview-session | `src/lib/gen/preview/preview-session.ts` |
| Preview-host klient | `src/lib/gen/preview/preview-host-client.ts` |
| Session store | `src/lib/gen/preview/session-store.ts` |
| Tier-2 config | `src/lib/gen/preview/tier2-config.ts` |
| Tier-2 resume | `src/lib/gen/preview/tier2-resume.ts` |
| Preview env | `src/lib/gen/preview/env-local.ts` |
| Shim-preview | `src/lib/gen/preview/build-preview-document.ts` |
| Preview diagnostik | `src/lib/gen/preview/diagnostics.ts` |
| Browser preview API | `src/lib/builder/preview-session/api.ts` |
| Post-checks | `src/lib/hooks/chat/post-checks.ts` |
| Post-checks resultat | `src/lib/hooks/chat/post-checks-results.ts` |
| Post-checks preview | `src/lib/hooks/chat/post-checks-preview.ts` |
| Quality gate API | `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` |
| Deploy API | `src/app/api/v0/deployments/route.ts` |
| Deploy readiness | `src/lib/deploy/deploy-readiness.ts` |
| Deploy dependencies | `src/lib/deploy/dependency-utils.ts` |
| Preview-host (Fly) | `preview-host/` |
| Preview panel UI | `src/components/builder/preview-panel/PreviewPanel.tsx` |
