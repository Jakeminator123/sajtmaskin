# Preview Session Contract

## Scope

This document describes the stable human-readable contract for preview-session
identity, preview URLs, and the verify-lane boundary.

Primary code sources:

- `src/lib/gen/preview/preview-contract.ts`
- `src/lib/gen/preview/preview-host-client.ts`
- `src/lib/gen/verify/preview-quality-gate.ts`
- `src/lib/db/chat-repository-pg.ts`
- `preview-host/src/server.js`
- `preview-host/src/validate.js`
- `preview-host/src/runtime.js`
- `src/app/api/engine/chats/[chatId]/accept-repair/route.ts`
- `src/app/api/engine/chats/[chatId]/versions/route.ts`
- `src/app/api/engine/chats/[chatId]/route.ts`
- `src/app/api/engine/chats/[chatId]/readiness/route.ts`
- `docs/architecture/llm-pipeline.md` § FAS 3

Machine-oriented companion:

- `docs/schemas/strict/preview-session-contract.schema.json`

## Identifier surfaces

| Field / ID | Layer | Status | Meaning |
|---|---|---|---|
| `appProjectId` / `projects.id` | builder/app state | canonical | The durable Sajtmaskin project ID |
| `chatId` / `engine_chats.id` | engine + preview lane | canonical | The durable own-engine chat ID and the current preview-host runtime key |
| `versionId` / `engine_versions.id` | version state | canonical | The specific saved version within a chat |
| `previewSessionId` | active preview session | canonical | The active preview-session ID used by app state and preview-host session control |
| `previewUrl` | public API/client | canonical | The public preview/live URL field |
| `preview_url` | DB column (`engine_versions`) | canonical | Persisted F2 (`fidelity2`) preview URL in Postgres |
| `runId` | observability/logs | canonical | Per-run log/telemetry correlation ID |
| `VERCEL_PROJECT_ID` | Vercel auth/config | canonical in Vercel scope | Vercel project ID, not a Sajtmaskin project identifier |

## Preview lane vs verify lane

### Preview lane

The live F2 preview is stateful:

- keyed by `chatId`
- exposed through `previewUrl`
- may keep a warm runtime/session
- may be resumed, hibernated, or destroyed

Current key rule:

- preview-host path/runtime key is `/{chatId}`
- legacy incoming `projectId` in preview-host payloads is accepted only as an
  alias for `chatId`
- generated clients may keep deploy-portable root API URLs (`/api/*`). In a
  multiplexed browser preview the host recovers the current `chatId` from the
  page Referer and proxies the request as `/{chatId}/api/*`, while
  preserving method, body and query. Without a matching live session it does
  not guess or rewrite. External callbacks, server-to-server requests and other
  Referer-less callers must use the explicitly scoped preview URL; this fallback
  is only for browser-initiated traffic from the rendered preview.

### Verify lane

The quality-gate / server-verify lane is isolated from the live preview:

- runs in a separate preview-host workspace
- does not reuse the live preview workspace/process
- installs the exported project's own dependencies with devDependencies included
- runs only project-local TypeScript, ESLint and Next binaries (no implicit `npx` download)
- does not expose a live preview URL

Verify responses can contain extra install-context rows in `results[]`:

- `install-cache-share` (copy-only `node_modules` reuse via exact dependency
  fingerprint + install-policy match; successful reuse skips reinstall)
- `install-peer-fallback` (peer-conflict fallback with `--legacy-peer-deps` was used)

Generated/exportable Next projects pin Next, TypeScript, ESLint and
`eslint-config-next` and ship `eslint.config.mjs`. F2 remains typecheck-only.
F3 runs `typecheck → build` — the `lint` check was removed from the blocking
lane 2026-07-22 (style rules blocked buildable sites). The host still supports
`lint` if the manifest re-enables it; when it runs: lint warnings are Advisory,
lint errors are Blocker, and missing local lint tooling/configuration is a
non-repairable tooling failure rather than a green skip.

Verify reuse is isolated: live `node_modules` is copied, never symlinked, so a
verify command cannot mutate the running site's dependency tree.

### App-side quality gate (Sajtmaskin API, not `POST /preview/verify`)

Engine-routen `POST /api/engine/chats/[chatId]/quality-gate` accepterar en
legacy-kompatibel `checks`-lista; **minst en** check krävs om fältet skickas.
Serverns `lifecycle_stage` väljer ändå den kanoniska F2- eller F3-lanen.

När alla verify-resultat är godkända och `SAJTMASKIN_VISUAL_QA` är på kan Sajtmaskin köra **statisk** Visual QA (`analyzeVisualQuality` i `src/lib/gen/verify/visual-qa.ts`) på exportabla filer. Det är **inte** en del av preview-hostens JSON-svar från verify-lanen, men kan:

- returneras i quality-gate-API-svaret som `visualQA`, och
- sparas kompakt i versionslogg-meta under `preflight:quality-gate` via `buildServerVerifyQualityGateMeta` / `compactVisualQAForQualityGateLog` (`src/lib/gen/verify/server-verify-log-meta.ts`).

Samma villkor och filurval delas av `maybeAnalyzeVisualQAForPassedExportable()` i `src/lib/gen/verify/preview-quality-gate.ts` (anropas från quality-gate-routen, `repair/route.ts` och `server-verify.ts`). Sammanfattningstext för DB vid promote/fail styrs av `describeQualityGateVerification()` i samma modul.

### Repair-available + accept-repair (app-side contract)

När post-repair quality gate passerar sparas reparerade filer tillfälligt i
`repaired_files_json` och versionen får status `repair_available`.

Surface i app-kontrakt:

- `latestVersion.hasPendingRepair`
- `latestVersion.repairAvailableAt`
- `verificationState = "repair_available"`
- SSE: `version-repair-available` (under aktiv stream)

Applicering sker via:

- `POST /api/engine/chats/[chatId]/accept-repair` med `{ versionId }`

Timeout-fallback:

- `maybeAutoAcceptTimedOutRepair()` kan auto-accepta i `chat`, `versions` och
  `readiness` routes när `repairAcceptTimeoutMinutes` passerats.

## Public app/API contracts

### SSE boundary from finalize (`done` -> preview start)

After finalize, stream contract should be read as:

- `done` = version is persisted (not that preview is already live)
- `done.previewPending` = preview bootstrap is expected
- `done.previewUrlHint` = optional temporary VM boot hint
- `version-repair-available` = server-repair passed quality gate and pending fix can be accepted
- `preview-ready` / `build-error` = actual preview start outcome

`previewUrlHint` must not be treated as persisted live `previewUrl` in version APIs.

### F2 preview bootstrap

Canonical route:

- `POST /api/engine/chats/[chatId]/preview-session`

(Tidigare `/api/v0/chats/[chatId]/preview-session`-aliaset borttaget i P29 Fas 1B 2026-04-20.)

Primary response contract lives in:

- `PreviewSessionPostApiJson` in `src/lib/gen/preview/preview-contract.ts`

Important fields:

- `previewUrl`
- `previewSessionId`
- `previewMode`
- `previewTier`
- `prodBuildVerified` (optional — only present when a real `npm run build` ran; omitted for pure F2 dev-preview)
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

(Tidigare `/api/v0/chats/[chatId]/...`-aliases borttagna i P29 Fas 1B 2026-04-20.)

Stable contract types:

- `PreviewStatusApiJson`
- `PreviewHeartbeatApiJson`
- `PreviewHibernateApiJson`
- `PreviewDestroyApiJson`

### `PreviewDestroyApiJson` — host-failure semantics (2026-04-18)

The destroy route now distinguishes between hard and transient host failures
so the user can never end up pointing at a zombie preview VM:

- **Host destroy ok** → 200 + `{ destroyed: <bool>, clearedPreviewUrl: true }`.
- **Host destroy retryable failure** (5xx / network blip) → 200 +
  `{ destroyed: false, clearedPreviewUrl: true, providerDestroyDeferred: true, message }`.
  Local Redis pointer is cleared anyway so the next request boots fresh; the
  host-side orphan is reaped by idle TTL or `POST /admin/cleanup`.
- **Host destroy hard failure** (4xx, non-retryable) → 400 +
  `{ ok: false, reason: "destroy_failed", message }`. Local state is preserved
  so the caller can react.

Best-effort destroy on `forceRestart` and resume-failure inside
`startPreviewSession` follows the same pattern: the host destroy is
fired-and-forgotten before the local pointer is cleared, so the Fly runtime
is released even when the user hasn't explicitly clicked "destroy".

`PreviewStatusApiJson.status` enum: `running | starting | stopped | missing | version_mismatch`.

`starting` is returned during the 90-second boot grace period after session creation
when the preview-host VM has not yet responded to status checks.

For `version_mismatch`, `versionId` is the preview-session-bound version. Optional
`mismatchDirection` clarifies the order relative to the requested query
`versionId`: `session_newer`, `session_older`, or `unknown`.

`PreviewStatusApiJson.reason` (when present) uses these stable values:

- `preview_session_not_configured`
- `no_session`
- `session_bound_to_other_version`
- `preview_session_id_mismatch`
- `provider_not_running_or_unreachable`
- `boot_grace_period`

## Preview-host contracts

### Preview session routes

- `POST /preview/session/start`
- `POST /preview/session/update`
- `POST /preview/session/patch` (Fast Edit Lane — partial, usually no restart)
- `POST /preview/session/hibernate`
- `POST /preview/session/destroy`
- `GET /preview/session/:id`
- `GET /preview/session/:previewSessionId/status`
- `GET /preview/session/:previewSessionId/files-manifest` (Fast Edit Lane — read-only content hashes)
- `GET /preview/sandbox/:previewSessionId/status` (legacy path alias)
- `GET /preview/logs/:previewSessionId`

Every new non-legacy host session returns a `lifecycleToken`. The app stores it
with the preview pointer and sends it on update, patch, hibernate and destroy.
A token-bearing host session rejects a missing or different mutation token with
`409 stale_lifecycle` before mutating store, runtime or workspace. Status and
readiness remain recovery receipts, not UI mutation identities: the route reads
the current Redis pointer and requires the host receipt to echo that lifecycle,
so a cached N receipt cannot approve N+1. A later poll may intentionally follow
the current same-version N+1 lifecycle. Persisted sessions created by an older
host have no token and remain operable without one during rollout.

#### Prewarm start contract (`POST /preview/session/start`)

Ordinary finalize starts keep the existing payload. A prewarm start additionally
sends:

- `prewarm: true`
- `prewarmLeaseKey`: 64 lowercase hex characters; an API-keyed HMAC of the
  app's canonical rate-limit subject. Verified users use `userId`; guests use
  the trusted-IP identity from `getClientId()`, never the rotatable session
  cookie. Raw IDs/IPs are not sent to preview-host. If
  `SAJTMASKIN_PREVIEW_HOST_API_KEY` is absent, optional prewarm is skipped;
  ordinary local/non-prewarm preview remains unchanged.

Host ownership and traffic rules:

- Prewarm may only create an unclaimed `chatId`. A real start/update/patch flips
  ownership under the persistent store lock; delayed prewarm then returns
  `409 prewarm_superseded` and cannot replace `versionId` or `filesJson`.
- `prewarmReplacementPending` is internal host state. It keeps HTTP on the
  host-owned auto-refresh starting page and refuses **all** WebSocket upgrades
  from prewarm creation until the first real replacement passes readiness. It is
  cleared only by that successful, version-matched boot. Ordinary non-prewarm
  restarts continue serving their last-good runtime while a replacement queues.
  Host status reports `running:false` while either prewarm hold is active.
- If a real replacement fails (`prewarmReplacementPending && status:error`),
  HTTP returns a stable, non-refreshing host error page, all WebSockets remain
  refused, and neither proxy nor status polling auto-requeues. A subsequent
  explicit real start/update/patch sets `starting` and may recover.
- An idempotent prewarm returns the existing session. It restart-recovers only
  a missing/dead runtime through the per-chat dedup queue; a healthy running or
  already-booting prewarm is not restarted. Persisted `status: "starting"`
  alone is not considered an in-flight boot after host restart.

Pre-settlement resource lease:

- One active prewarm lease is allowed per canonical subject. `429
  prewarm_rate_limited` causes no automatic retry/log loop; a short five-second
  process cooldown absorbs immediate duplicates, but the chat is not pinned in
  normal dedup. A later explicit user retry may succeed after lease release/expiry.
- The lease is released when the same chat is claimed by real
  start/update/patch, destroyed, cleaned up, expired, or reset. A prewarm boot
  failure **retains** the cooldown lease to prevent sequential install spray;
  same-chat idempotent recovery remains allowed while another chat is throttled.
  Hibernate is reversible and also retains the cooldown until destroy/expiry.
  Normal/background cleanup prunes expired leases; `POST /admin/destroy-all`
  resets them. The normalized map has a fixed reviewed code cap of 4096 (no
  operator env). `/admin/storage` exposes only active count, earliest expiry and
  cap—never lease keys or subjects.
- This is a host resource lease, not a new billing reservation. Existing credit
  settlement/refund semantics remain unchanged.

By-design limits:

- One active prewarm per canonical user/IP means a parallel second chat simply
  uses normal cold finalize; generation itself is never blocked.
- IP rotation cannot be fully prevented. Missing trusted IP becomes
  `ip:unknown`, which safely groups/throttles such guests.
- Multi-machine locking is future topology work; the current authoritative
  store lock matches the deployed single-host topology.

Lifecycle-token deployment order is app first: deploy the app version that can
store/send an optional token while still accepting tokenless legacy host
responses. Then deploy preview-host with strict fencing for newly created
token-bearing sessions and verify `npm run check`, `npm run test:guards`,
`npm run test:proxy-contract`, and smoke. The independent prewarm flag remains
default OFF and must not be activated before its host support is deployed.

#### Fast Edit Lane patch route (`POST /preview/session/patch`)

Used for trivial, exact edits (file-tree / code-view / inspector) so a single
changed file reaches the live VM without a full generation or a forced Next dev
restart. Distinct from `update`:

- Carries only the changed files in `files` (partial set), plus optional
  `removedPaths` — not a full `filesJson`.
- The host merges `files` into the stored set, writes only those paths into the
  live workspace, and leaves the running dev process alive so Next lazily
  recompiles the changed route. `update` always replaces and restarts.

Request fields (validated in `preview-host/src/validate.js` → `validatePatchPayload`):

- `previewSessionId` (or `sessionId`)
- `versionId`
- `lifecycleToken` for every token-bearing session (`null`/omitted only for
  persisted legacy sessions)
- `expectedBaseVersionId` (optional) — the version the `files` were derived from.
  When set, the host re-checks it **inside the store lock** before advancing the
  session (optimistic-concurrency guard, added 2026-06-23): if the live session no
  longer serves that base, the patch is refused so two near-simultaneous quick
  edits can never merge into a hybrid workspace.
- `files` (object `path -> content`, at least one entry unless `removedPaths` set)
- `removedPaths` (optional `string[]`)

Response adds two fields on top of the standard session response:

- `patchMode`: `patched` (hot, no restart), `restarted` (a dependency/config path
  — or an in-flight boot/restart — forced a full boot), or `booted` (runtime was
  not running and a boot was queued).
- `patchReason`: stable reason string or `null` (e.g. `structural_change`,
  `runtime_not_running`, `runtime_booting`, `prewarm_replacement`). The last
  value means a real patch claimed a prewarm session and therefore forced a
  full readiness-gated restart rather than hot-patching the skeleton.

Error / edge responses:

- `404 session_not_found` → caller should fall back to `update`/`start`.
- `409 stale_lifecycle` → caller must discard the result; the same-version
  session has already advanced to a newer lifecycle.
- `409 base_mismatch` (carries the current `versionId`) → the live session advanced
  past `expectedBaseVersionId`; caller does a full (re)start instead of patching.
- `500 patch_failed` → the workspace write failed (e.g. ENOSPC); the host **rolls
  the session back** to its pre-patch snapshot so `/status` never advertises a
  version that never actually landed on disk.

A dependency/config-critical change (`package.json`, lockfiles, `next.config.*`,
`tsconfig*.json`, `.env*`, `postcss/tailwind.config.*`) always falls back to a full
restart.

App side: `patchPreviewHostSession` in `src/lib/gen/preview/preview-host-client.ts`,
gated by `SAJTMASKIN_PREVIEW_PATCH_LANE` via `tryPatchPreviewSession` (quick edits)
and the follow-up lane in `src/lib/gen/preview/preview-session.ts`. A successful
quick edit carries the host-returned `lifecycleToken` through service, route,
client result and builder handoff; URL/session without that token is not a
complete modern preview identity. A stale process-exit callback may only delete
the lifecycle it started for, never a later hot-patched lifecycle.

#### Inspector identity on Tier 2

The Fly/preview-host session URL is the rendered site that inspector and visual
capture must observe. The host-owned boot document (`Startar preview`) is only a
temporary HTTP response and is not evidence that a new version has landed.

Inspector bridge messages, Tier-2 element maps and screenshot captures use the
same complete identity: `chatId`, `versionId`, `previewSessionId`, explicit
lifecycle token (`null` only for legacy) and a URL below the current session
base. Preview-host stamps the injected bridge script; the parent rejects
unstamped or mismatched messages for a token-bearing session. Map/capture routes
check the server-owned session both before work and after asynchronous Chromium
work, while the client also discards late responses after an identity change.
Version mismatch, incomplete lifecycle hydration and iframe error keep
inspector overlays non-interactive. Screenshot capture always requires the
tuple. The sole tuple-less exception is element-map against the exact
same-origin `/api/preview-render` compatibility shim.

#### Live file manifest (`GET /preview/session/:previewSessionId/files-manifest`)

The read side of the patch lane: a sha256-per-path view of the file set the host
currently holds for the session (`session.filesJson` — the same set a boot writes
into the workspace). It exists so the app can answer "what is live right now?"
before deciding between `patch` and `update`, without shipping file contents back.

- Read-only: unlike `/status` it never queues a boot.
- `404 session_not_found` for an unknown, destroyed or expired session.
- Response: `ok`, `previewSessionId`, `chatId`, `versionId`, `status`, `running`,
  `hashAlgorithm` (`"sha256"`), `fileCount`, `files` (`path -> sha256 hex`).
- `running` uses the same prewarm-aware rule as `/status`, so an unclaimed prewarm
  skeleton is never reported as patchable.

App side: `fetchPreviewHostFilesManifest` in
`src/lib/gen/preview/preview-host-client.ts`. Any non-200 (including a
preview-host deployed before this route existed) yields `null`, and every caller
falls back to the full update path.

#### Follow-up generations on the patch lane

A follow-up generation (new `versionId` on a live session) used to always call
`POST /preview/session/update` with the whole file set, which restarts Next dev
and pays a first compile even for a text-only change. `startPreviewSession`
(`src/lib/gen/preview/preview-session.ts`) now builds the same update payload and
then tries the patch lane first. It patches **only** when all of these hold —
otherwise it logs the reason and runs the untouched update path:

| Condition | Fallback reason |
|---|---|
| `SAJTMASKIN_PREVIEW_PATCH_LANE` is on | `patch_lane_disabled` |
| The app's session pointer knows the base version | `unknown_base_version` |
| The host returned a manifest | `manifest_unavailable` |
| The host reports `running: true` | `runtime_not_running` |
| The manifest's `versionId` equals the app's base version | `host_version_mismatch` |
| Diff is non-empty, non-structural and within 200 files / 4 MB | `no_changes`, `empty_host_manifest`, `structural_change`, `diff_too_large` |
| The host accepted the patch (`expectedBaseVersionId` re-checked under its lock) | `host_patch_failed` |
| The patch response echoes the NEW `versionId` | `host_version_not_recorded` |

Diff rules (`planPreviewPatch` in `src/lib/gen/preview/preview-patch-plan.ts`):
content differs or path is new → `files`; path is on the host but absent from the
new version → `removedPaths`. Applying that patch onto the host's stored set
reproduces exactly what `update` would have written, so deletions can never
linger. Structural paths reuse `isStructuralQuickEditPath`, the app-side mirror of
the host's restart rule, and cover removals as well as edits — a changed
`.env.local` (env-panel edit, F2→F3) therefore always takes the update path.

A patched follow-up returns `startOutcome: "resumed"` with `runtimeReady: false`:
a hot patch inherits the previous boot's readiness receipt, so it never stamps a
per-version runtime-ready receipt (M#pv1). Lane choice is logged as
`[telemetry:preview-lifecycle] kind=preview_followup_lane` with `lane`,
`patchMode`, `changedFiles`, `removedPaths` and `durationMs`.

**Version binding (an old revision may never approve a new version).** Session,
`versionId` and the revision actually booted/patched stay bound:

1. A successful patch pins the NEW `versionId` on the host session, and both
   `/status` and `files-manifest` report it from that same store record.
2. A patch that fails mid-way (e.g. ENOSPC in the workspace write) rolls the
   session back to its pre-patch snapshot and returns `500 patch_failed`, so the
   host never claims a version whose files did not land.
3. The app only advances its session pointer after the patch response echoes the
   new `versionId`; otherwise the full `update` path re-pins it.
4. Resume stays version-pinned: `tryResumeTier2Runtime` → `fetchPreviewHostStatus`
   with `expectedVersionId`, so a VM still serving another revision returns `null`
   and the session is rebuilt instead of being surfaced as ready.

Regression coverage: `preview-host/scripts/test-patch-lane-contract.mjs` (host
rollback, `/status` + manifest after patch, refused stale base) and
`src/lib/gen/preview/preview-session.test.ts` (patch → resume only on a matching
host version, stale host forces a rebuild, update remains the authority).

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
3. `previewSessionId` is the canonical active preview-session identifier.
4. `previewUrl` is the public field; `engine_versions.preview_url` is the persisted DB column.
5. The verify lane is part of preview-host infrastructure, but it is not the same
   thing as the live preview lane.
6. `repair_available` means pending server repair exists; files are applied first
   when `accept-repair` (or timeout auto-accept) completes.

## Remaining `sandbox` wording (explicit allowlist)

Do **not** treat raw `grep \\bsandbox\\b` counts as progress metrics. Keep these
categories unless a dedicated migration removes them:

| Category | Examples | Why it stays |
|---|---|---|
| HTML | `<iframe sandbox="...">` | Browser attribute; unrelated to F2/preview naming. |
| Preview-host legacy HTTP paths | `/preview/sandbox/:previewSessionId/status` | Kept for older host clients during rollout. |
| Storage / Redis reads | `sandbox-preview:session:` prefix, legacy `sandbox*` JSON/session fields | Read-only migration input; new writes use `preview-session:session:*` + `previewSessionId`/`previewUrl`. |
| Wire/API aliases | `sandboxId`, `sandboxUrl` | Backwards-compatible preview-host aliases parsed/emitted at the boundary only. |
| Heuristics | hostname contains `sandbox`, `.vercel.run` | Detecting legacy preview URLs, not product naming. |
| Provider copy | Resend/email “sandbox mode” | Third-party terminology. |
| Tests / mocks | fixtures using legacy field names | Must mirror production shapes. |

Prefer **preview-** / **F2** (`fidelity2`) / **VM** in new human-facing comments and docs.
Code identifiers may still say `tier2` / `tier-2` (legacy) — map in prose, do not mass-rename.

## Local handoff note

This contract is the boundary the rest of the repo should converge on.
If another agent is cleaning unrelated areas, the safest rule is:

- touch `preview-session` / `preview-status` / `preview-heartbeat` / `preview-hibernate` / `preview-destroy`
  only when the change is explicitly about preview/Fly behavior
- treat `sandboxUrl` and `sandboxId` as **legacy boundary aliases**; internal preview-session code should use
  `previewUrl` and `previewSessionId`
