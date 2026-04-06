# Preview Session Contract

## Scope

This document describes the stable human-readable contract for preview-session
identity, preview URLs, and the verify-lane boundary.

Primary code sources:

- `src/lib/gen/preview/preview-contract.ts`
- `src/lib/gen/preview/preview-host-client.ts`
- `src/lib/gen/preview-quality-gate.ts`
- `preview-host/src/server.js`
- `preview-host/src/validate.js`
- `preview-host/src/runtime.js`
- `docs/architecture/preview-deploy.md`

Machine-oriented companion:

- `docs/schemas/strict/preview-session-contract.schema.json`

## Identifier surfaces

| Field / ID | Layer | Status | Meaning |
|---|---|---|---|
| `appProjectId` / `projects.id` | builder/app state | canonical | The durable Sajtmaskin project ID |
| `chatId` / `engine_chats.id` | engine + preview lane | canonical | The durable own-engine chat ID and the current preview-host runtime key |
| `versionId` / `engine_versions.id` | version state | canonical | The specific saved version within a chat |
| `sandboxId` | tier-2 runtime/session | legacy canonical | Internal/legacy tier-2 runtime/session ID carried behind public preview-session APIs |
| `previewUrl` | public API/client | canonical | The public preview/live URL field |
| `sandboxUrl` / `sandbox_url` | version/runtime state | legacy structural | Legacy preview field/column name still used in storage/internal state |
| `VERCEL_PROJECT_ID` | Vercel auth/config | canonical in Vercel scope | Vercel project ID, not a Sajtmaskin project identifier |

## Preview lane vs verify lane

### Preview lane

The live tier-2 preview is stateful:

- keyed by `chatId`
- exposed through `previewUrl`
- may keep a warm runtime/session
- may be resumed, hibernated, or destroyed

Current key rule:

- preview-host path/runtime key is `/{chatId}`
- legacy incoming `projectId` in preview-host payloads is accepted only as an
  alias for `chatId`

### Verify lane

The quality-gate / server-verify lane is isolated from the live preview:

- runs in a separate preview-host workspace
- does not reuse the live preview workspace/process
- may run `npm install`, `npx tsc --noEmit`, `npx next build`, and optional lint
- does not expose a live preview URL

### App-side quality gate (Sajtmaskin API, not `POST /preview/verify`)

Engine-routen `POST /api/engine/chats/[chatId]/quality-gate` accepterar en `checks`-lista; **minst en** check krävs (tom lista avvisas vid validering).

När alla verify-resultat är godkända och `SAJTMASKIN_VISUAL_QA` är på kan Sajtmaskin köra **statisk** Visual QA (`analyzeVisualQuality` i `src/lib/gen/visual-qa.ts`) på exportabla filer. Det är **inte** en del av preview-hostens JSON-svar från verify-lanen, men kan:

- returneras i quality-gate-API-svaret som `visualQA`, och
- sparas kompakt i versionslogg-meta under `preflight:quality-gate` via `buildServerVerifyQualityGateMeta` / `compactVisualQAForQualityGateLog` (`src/lib/gen/server-verify-log-meta.ts`).

Samma villkor och filurval delas av `maybeAnalyzeVisualQAForPassedExportable()` i `src/lib/gen/preview-quality-gate.ts` (anropas från quality-gate-routen, `repair/route.ts` och `server-verify.ts`). Sammanfattningstext för DB vid promote/fail styrs av `describeQualityGateVerification()` i samma modul.

## Public app/API contracts

### Tier-2 preview bootstrap

Canonical route:

- `POST /api/engine/chats/[chatId]/preview-session`

Compat route:

- `POST /api/v0/chats/[chatId]/preview-session`

Primary response contract lives in:

- `PreviewSessionPostApiJson` in `src/lib/gen/preview/preview-contract.ts`

Important fields:

- `previewUrl`
- `previewSessionId`
- `previewMode`
- `previewTier`
- `prodBuildVerified` (optional — only present when a real `npm run build` ran; omitted for pure dev-preview tier-2)
- `startOutcome`

`startOutcome` currently allows:

- `reused_url`
- `resumed`
- `recreated`

### Status / heartbeat / destroy

Canonical routes:

- `GET /api/engine/chats/[chatId]/preview-status`
- `POST /api/engine/chats/[chatId]/preview-heartbeat`
- `POST /api/engine/chats/[chatId]/preview-hibernate`
- `POST /api/engine/chats/[chatId]/preview-destroy`

Compat routes exist under `/api/v0/chats/[chatId]/...`.

Stable contract types:

- `PreviewStatusApiJson`
- `PreviewHeartbeatApiJson`
- `PreviewHibernateApiJson`
- `PreviewDestroyApiJson`

## Preview-host contracts

### Preview session routes

- `POST /preview/session/start`
- `POST /preview/session/update`
- `POST /preview/session/hibernate`
- `POST /preview/session/destroy`
- `GET /preview/session/:id`
- `GET /preview/session/:sandboxId/status`
- `GET /preview/logs/:sandboxId`

When preview-host runs outside local development, all `/preview/*` routes require
auth via the shared preview-host key:

- app side: `SAJTMASKIN_PREVIEW_HOST_API_KEY`
- host side: `PREVIEW_HOST_API_KEY`

### Verify route

- `POST /preview/verify`

Request shape is validated in `preview-host/src/validate.js`.

Core fields:

- `chatId`
- legacy alias `projectId`
- `versionId`
- `filesJson`
- `checks`

Response contains:

- `ok`
- `verifyId`
- `chatId`
- `versionId`
- `durationMs`
- `jobStartedAt`
- `jobFinishedAt`
- `firstFailureCheck`
- `results[]`

## Contract boundary rules

1. `appProjectId` is never the preview-host path key.
2. `chatId` is the current preview-host lane key.
3. `sandboxId` remains the legacy tier-2 runtime/session identifier.
4. `previewUrl` is the public field; `sandboxUrl` remains structural legacy naming.
5. The verify lane is part of preview-host infrastructure, but it is not the same
   thing as the live preview lane.

## Remaining `sandbox` wording (explicit allowlist)

Do **not** treat raw `grep \\bsandbox\\b` counts as progress metrics. Keep these
categories unless a dedicated migration removes them:

| Category | Examples | Why it stays |
|---|---|---|
| HTML | `<iframe sandbox="...">` | Browser attribute; unrelated to tier-2 naming. |
| Preview-host / HTTP paths | `/preview/session/:sandboxId/status`, `GET /preview/logs/:sandboxId` | Route segments on the VM host; renaming requires host + client rollout. |
| Storage / Redis | `sandbox-preview:session:` prefix, `sandbox_url` column | Persisted keys and columns — migration scope. |
| Wire / SSE / API fields | `sandboxId`, `sandboxUrl`, `sandboxPending`, `sandbox_disabled` stage | Backwards-compatible payloads until versioned. |
| Heuristics | hostname contains `sandbox`, `.vercel.run` | Detecting legacy preview URLs, not product naming. |
| Provider copy | Resend/email “sandbox mode” | Third-party terminology. |
| Tests / mocks | fixtures using legacy field names | Must mirror production shapes. |

Prefer **preview-** / **tier-2** / **VM** in new comments, docs, and local variable names.

## Local handoff note

This contract is the boundary the rest of the repo should converge on.
If another agent is cleaning unrelated areas, the safest rule is:

- touch `preview-session` / `preview-status` / `preview-heartbeat` / `preview-hibernate` / `preview-destroy`
  only when the change is explicitly about preview/Fly behavior
- treat `sandboxUrl`, `sandbox_url`, and `sandboxId` as **legacy structural names**
  unless the task is a dedicated migration of storage/tests/docs
