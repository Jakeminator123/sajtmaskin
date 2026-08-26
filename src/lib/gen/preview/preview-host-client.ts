import { getPreviewHostBaseUrl } from "./tier2-config";
import { VERIFY_REPAIR_ROUTE_BUDGET_SECONDS } from "@/lib/gen/defaults";

export function previewHostAuthHeaders(): Record<string, string> {
  const key = process.env.SAJTMASKIN_PREVIEW_HOST_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

export function isPreviewHostDiskFullMessage(message: string | null | undefined): boolean {
  const normalized = typeof message === "string" ? message.trim() : "";
  return /ENOSPC|no space left on device/i.test(normalized);
}

export function describePreviewHostHttpFailure(params: {
  endpoint:
    | "/preview/session/start"
    | "/preview/session/update"
    | "/preview/session/destroy"
    | "/preview/session/hibernate"
    | "/preview/verify";
  status: number;
  body: Record<string, unknown>;
}): string {
  const { endpoint, status, body } = params;
  const rawMessage =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : `Preview host HTTP ${status}`;

  if (status === 404 && endpoint === "/preview/verify") {
    return `${endpoint} returned 404. The deployed preview-host appears older than this repo and is missing the verify-lane route, or SAJTMASKIN_PREVIEW_HOST_BASE_URL points at the wrong base path. Redeploy preview-host and verify that the base URL is the host root URL.`;
  }

  return rawMessage;
}

/**
 * Klient-side timeouts för anrop mot preview-host. Sammankopplade med
 * preview-host-VM:ets egna budget i `preview-host/src/server.js` —
 * justera båda sidor om budgeten ändras.
 *
 * - START: cold-start på Fly.io kan ta 60–120 s när maskinen är skalad
 *   till 0; lägg på buffer för Next-build + warm-typecheck.
 * - VERIFY: medvetet UNDER de leas-hållande routernas `maxDuration`
 *   (420 s default för quality-gate + repair). 390 s ger ~30 s marginal så routen
 *   hinner fånga abort, markera versionen failed och köra
 *   `finally { releaseVersionLease }` INNAN Vercel hård-dödar funktionen
 *   vid route-budget. Utan marginalen stod leasen `running` till 15-min-TTL och
 *   varje accept/verify/repair fick `version_busy` i fönstret
 *   (BUG-SWARM #260 P2). Ändras detta: håll buffert-testet i synk.
 * - STATUS: poll under boot — håll kort så UI-spinnern inte hänger om
 *   preview-host hängt sig.
 * - CLEANUP: admin-städning av föräldralösa workspaces; körs sällan så
 *   längre timeout är OK.
 */
export const PREVIEW_HOST_CLIENT_TIMEOUTS_MS = {
  start: 300_000,
  status: 15_000,
  verify: VERIFY_REPAIR_ROUTE_BUDGET_SECONDS * 1000 - 30_000,
  cleanup: 30_000,
} as const;

/**
 * `maxDuration` (sekunder) för de Vercel-routes som håller en version-lease
 * runt ett `/preview/verify`-anrop. `verify`-timeouten ovan MÅSTE vara
 * strikt mindre än detta * 1000 så `finally { releaseVersionLease }` hinner
 * köra före Vercels hård-kill. Verifieras av `preview-host-client.test.ts`.
 */
export const LEASE_HOLDING_ROUTE_MAX_DURATION_S =
  VERIFY_REPAIR_ROUTE_BUDGET_SECONDS;

const START_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.start;
const STATUS_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.status;
const VERIFY_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify;
const CLEANUP_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.cleanup;

/**
 * Resolve the effective abort timeout (ms) for a `/preview/verify` call.
 *
 * An optional caller override (the manual repair loop's budget-aware final gate)
 * can only ever SHORTEN the static `VERIFY_TIMEOUT_MS`: it is clamped to the
 * range `[1, VERIFY_TIMEOUT_MS]`, so a per-call timeout can never push the verify
 * past the lease-holding route's `maxDuration` and skip
 * `finally { releaseVersionLease }` (Codex P1 #286). A missing/invalid override
 * falls back to the static timeout (back-compat — callers that pass nothing keep
 * today's behavior).
 */
export function resolvePreviewHostVerifyTimeoutMs(overrideMs?: number): number {
  if (typeof overrideMs !== "number" || !Number.isFinite(overrideMs)) {
    return VERIFY_TIMEOUT_MS;
  }
  return Math.min(VERIFY_TIMEOUT_MS, Math.max(1, Math.floor(overrideMs)));
}

function nonEmptyString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readMutationRevisionFromHostBody(body: Record<string, unknown>): number | null {
  const revision = body.mutationRevision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0
    ? revision
    : null;
}

function readPreviewSessionIdFromHostBody(body: Record<string, unknown>): string | null {
  return nonEmptyString(body.previewSessionId) ?? nonEmptyString(body.sandboxId);
}

function readPreviewUrlFromHostBody(body: Record<string, unknown>): string | null {
  return nonEmptyString(body.previewUrl) ?? nonEmptyString(body.sandboxUrl);
}

function previewSessionRefBody(params: {
  previewSessionId?: string | null;
  sessionId?: string | null;
  lifecycleToken?: string | null;
}): Record<string, string> {
  const previewSessionId = params.previewSessionId?.trim() || null;
  const sessionId = params.sessionId?.trim() || null;
  const lifecycleToken = params.lifecycleToken?.trim() || null;
  return {
    ...(previewSessionId ? { previewSessionId, sandboxId: previewSessionId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(lifecycleToken ? { lifecycleToken } : {}),
  };
}

async function triggerPreviewHostCleanup(): Promise<boolean> {
  const base = getPreviewHostBaseUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/admin/cleanup`, {
      method: "POST",
      headers: {
        ...previewHostAuthHeaders(),
      },
      signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function retryPreviewHostRequestAfterCleanup<T extends { ok: boolean; message?: string }>(
  execute: () => Promise<T>,
): Promise<T> {
  const first = await execute();
  if (first.ok || !isPreviewHostDiskFullMessage(first.message)) {
    return first;
  }
  const cleaned = await triggerPreviewHostCleanup();
  if (!cleaned) {
    return first;
  }
  return execute();
}

/** Host readiness verdict recorded by `waitForReady` (preview-host runtime.js). */
export type PreviewHostReadinessState = "starting" | "ready" | "failed";

/**
 * Regenerated lockfile returned once by the host after a stale-lockfile
 * reconcile (non-frozen install). The app persists it back into the version
 * files and clears the `.sajtmaskin/lockfile-stale.json` marker.
 */
export type PreviewHostRegeneratedLockfile = { path: string; content: string };

export type PreviewHostStatusResult = {
  previewSessionId: string;
  primaryUrl: string;
  lifecycleToken: string | null;
  /** Host-authoritative ordering receipt; null for an older host. */
  mutationRevision: number | null;
  /**
   * `waitForReady` verdict for this exact session/version, or `null` when the
   * host omitted it (older preview-host deploy — callers then fall back to the
   * legacy "running = ready" contract for backwards compatibility).
   */
  readinessState: PreviewHostReadinessState | null;
  /**
   * HTTP-ready + no Next build-error overlay. `false` while `starting`/`failed`.
   * `null` when an older host omitted the field — not the same as `false`.
   */
  httpReady: boolean | null;
  /** Human-readable failure reason when `readinessState === "failed"`. */
  readinessError: string | null;
  /**
   * Structured install-failure snapshot from the host (SM-035). Lives here —
   * not in `readinessError` — so the defect signature stays stable.
   */
  installDiagnostics?: PreviewHostInstallDiagnostics | null;
  regeneratedLockfile: PreviewHostRegeneratedLockfile | null;
};

export type PreviewHostInstallDiagnostics = {
  exitCode: number | null;
  signal: string | null;
  failureReason: string | null;
  memory: {
    freeBytes: number;
    totalBytes: number;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  } | null;
  concurrentRuntimes: number | null;
  inflightBoots: number | null;
  npmDebugLog: {
    /** Basename only — never an absolute host path. */
    path: string;
    mtime: string;
    bytes: number;
    clippedContent: string | null;
  } | null;
};

function readReadinessStateFromHostBody(
  body: Record<string, unknown>,
): PreviewHostReadinessState | null {
  const raw = body.readinessState;
  return raw === "starting" || raw === "ready" || raw === "failed" ? raw : null;
}

function readInstallDiagnosticsFromHostBody(
  body: Record<string, unknown>,
): PreviewHostInstallDiagnostics | null {
  const raw = body.installDiagnostics;
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const memory =
    d.memory && typeof d.memory === "object"
      ? (d.memory as Record<string, unknown>)
      : null;
  const npmDebugLog =
    d.npmDebugLog && typeof d.npmDebugLog === "object"
      ? (d.npmDebugLog as Record<string, unknown>)
      : null;
  return {
    exitCode: typeof d.exitCode === "number" ? d.exitCode : null,
    signal: nonEmptyString(d.signal),
    failureReason: nonEmptyString(d.failureReason),
    memory: memory
      ? {
          freeBytes: typeof memory.freeBytes === "number" ? memory.freeBytes : 0,
          totalBytes: typeof memory.totalBytes === "number" ? memory.totalBytes : 0,
          rssBytes: typeof memory.rssBytes === "number" ? memory.rssBytes : 0,
          heapUsedBytes: typeof memory.heapUsedBytes === "number" ? memory.heapUsedBytes : 0,
          heapTotalBytes: typeof memory.heapTotalBytes === "number" ? memory.heapTotalBytes : 0,
        }
      : null,
    concurrentRuntimes: typeof d.concurrentRuntimes === "number" ? d.concurrentRuntimes : null,
    inflightBoots: typeof d.inflightBoots === "number" ? d.inflightBoots : null,
    npmDebugLog:
      npmDebugLog && typeof npmDebugLog.path === "string"
        ? {
            path: npmDebugLog.path,
            mtime: typeof npmDebugLog.mtime === "string" ? npmDebugLog.mtime : "",
            bytes: typeof npmDebugLog.bytes === "number" ? npmDebugLog.bytes : 0,
            clippedContent:
              typeof npmDebugLog.clippedContent === "string" ? npmDebugLog.clippedContent : null,
          }
        : null,
  };
}

function readRegeneratedLockfileFromHostBody(
  body: Record<string, unknown>,
): PreviewHostRegeneratedLockfile | null {
  const raw = body.regeneratedLockfile;
  if (!raw || typeof raw !== "object") return null;
  const path = nonEmptyString((raw as Record<string, unknown>).path);
  const content = (raw as Record<string, unknown>).content;
  if (!path || typeof content !== "string") return null;
  return { path, content };
}

export async function fetchPreviewHostStatus(
  previewSessionId: string,
  opts?: { expectedVersionId?: string | null; expectedLifecycleToken?: string | null },
): Promise<PreviewHostStatusResult | null> {
  const base = getPreviewHostBaseUrl();
  const id = previewSessionId.trim();
  if (!base || !id) return null;
  try {
    const res = await fetch(
      `${base}/preview/session/${encodeURIComponent(id)}/status`,
      {
        method: "GET",
        headers: { ...previewHostAuthHeaders() },
        cache: "no-store",
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok !== true || body.running !== true) return null;
    const url = readPreviewUrlFromHostBody(body);
    const sid = readPreviewSessionIdFromHostBody(body);
    if (!url || !sid) return null;
    // False-green guard (BUG-SWARM rank 1): the host reports `running:true` for
    // whatever version the VM currently serves (`/status` returns `versionId`,
    // see preview-host/src/server.js). Without checking it, a session pinned to
    // version X can resume "running" against a VM still serving an older build —
    // the builder then shows a stale/white iframe as if it were live for X. When
    // the caller knows the expected version, the host must ECHO that exact
    // version for the session to be resumable — otherwise the caller re-pins
    // (re-create / update) instead of surfacing a stale preview.
    //
    // A MISSING `versionId` is refused too. The host always echoes the version
    // its session is pinned to (`/status` in preview-host/src/server.js), so
    // silence is not agreement — it is the absence of an answer, and resuming on
    // it is the same false-green as resuming on a mismatch. Same fail-safe rule
    // the host applies to `expectedBaseVersionId` on the patch route, where a
    // session with no known version is refused with 409.
    const expectedVersionId = opts?.expectedVersionId?.trim();
    const hostVersionId = nonEmptyString(body.versionId);
    if (expectedVersionId && hostVersionId !== expectedVersionId) {
      return null;
    }
    const hostLifecycleToken = nonEmptyString(body.lifecycleToken);
    const hasLifecycleExpectation = Boolean(
      opts && Object.prototype.hasOwnProperty.call(opts, "expectedLifecycleToken"),
    );
    const expectedLifecycleToken = nonEmptyString(opts?.expectedLifecycleToken);
    if (hasLifecycleExpectation && hostLifecycleToken !== expectedLifecycleToken) return null;
    // Readiness ≠ process liveness (req A5). The object is returned even when
    // readiness is `failed` (process alive but serving a build-error overlay) so
    // status/heartbeat callers can stamp `preview_success=false` + fire repair
    // instead of a false-green. `null` readinessState = legacy host → callers
    // fall back to treating `running` as ready.
    return {
      previewSessionId: sid,
      primaryUrl: url,
      lifecycleToken: hostLifecycleToken,
      mutationRevision: readMutationRevisionFromHostBody(body),
      readinessState: readReadinessStateFromHostBody(body),
      httpReady: body.httpReady === true,
      readinessError: nonEmptyString(body.readinessError),
      installDiagnostics: readInstallDiagnosticsFromHostBody(body),
      regeneratedLockfile: readRegeneratedLockfileFromHostBody(body),
    };
  } catch {
    return null;
  }
}

/**
 * The readiness half of `/status`, readable even when the runtime process is
 * NOT alive.
 *
 * {@link fetchPreviewHostStatus} answers "can this session be resumed?" and so
 * returns `null` the moment `running` is false. That is right for resuming and
 * wrong for diagnosis: a boot that dies during install/postcondition records
 * `readinessState: "failed"` on the host and leaves `running: false`. Read
 * through the resume path only, that boot looks like an idle/stopped session —
 * so `preview_success` was never stamped false, no error row was written, and
 * RepairGate never fired for a preview that provably cannot come up.
 *
 * This function exists to close that hole without loosening the resume
 * contract. `running` is returned verbatim so callers can still tell the two
 * apart.
 */
export type PreviewHostReadinessVerdict = Pick<
  PreviewHostStatusResult,
  | "readinessState"
  | "readinessError"
  | "installDiagnostics"
  | "regeneratedLockfile"
  | "httpReady"
  | "lifecycleToken"
  | "mutationRevision"
> & {
  running: boolean;
  /** Version the host says this session is pinned to, or `null` if unknown. */
  versionId: string | null;
};

export async function fetchPreviewHostReadinessVerdict(
  previewSessionId: string,
  opts?: { expectedVersionId?: string | null; expectedLifecycleToken?: string | null },
): Promise<PreviewHostReadinessVerdict | null> {
  const base = getPreviewHostBaseUrl();
  const id = previewSessionId.trim();
  if (!base || !id) return null;
  try {
    const res = await fetch(
      `${base}/preview/session/${encodeURIComponent(id)}/status`,
      {
        method: "GET",
        headers: { ...previewHostAuthHeaders() },
        cache: "no-store",
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok !== true) return null;
    // Same version binding as the resume path, including the missing-echo case:
    // a verdict is only usable if the host says WHICH version it describes. An
    // unattributed verdict is worse than no verdict — stamping it would either
    // mark preview_success for a version we never saw confirmed or fire
    // RepairGate on another version's failure. Callers that pass no expectation
    // still get the verdict verbatim (with `versionId: null`).
    const expectedVersionId = opts?.expectedVersionId?.trim();
    const hostVersionId = nonEmptyString(body.versionId);
    if (expectedVersionId && hostVersionId !== expectedVersionId) {
      return null;
    }
    const lifecycleToken = nonEmptyString(body.lifecycleToken);
    const hasLifecycleExpectation = Boolean(
      opts && Object.prototype.hasOwnProperty.call(opts, "expectedLifecycleToken"),
    );
    const expectedLifecycleToken = nonEmptyString(opts?.expectedLifecycleToken);
    if (hasLifecycleExpectation && lifecycleToken !== expectedLifecycleToken) return null;
    return {
      running: body.running === true,
      versionId: hostVersionId,
      lifecycleToken,
      mutationRevision: readMutationRevisionFromHostBody(body),
      readinessState: readReadinessStateFromHostBody(body),
      httpReady: typeof body.httpReady === "boolean" ? body.httpReady : null,
      readinessError: nonEmptyString(body.readinessError),
      installDiagnostics: readInstallDiagnosticsFromHostBody(body),
      regeneratedLockfile: readRegeneratedLockfileFromHostBody(body),
    };
  } catch {
    return null;
  }
}

/**
 * Content-hash manifest of the file set preview-host currently holds for a
 * session (`GET /preview/session/:previewSessionId/files-manifest`).
 *
 * This is the authoritative answer to "what is on the VM right now" — the app
 * diffs a new version against it to decide whether the Fast Edit Lane can
 * carry the change (see `planPreviewPatch`). Read-only on the host: it never
 * queues a boot. `null` means unknown (route missing on an older host, network
 * error, unusable session) and every caller must then fall back to the full
 * update path.
 */
export type PreviewHostFilesManifest = {
  previewSessionId: string;
  /** Version the host session is currently pinned to, or `null` if unset. */
  versionId: string | null;
  /** Public running state — same prewarm-aware rule as `/status`. */
  running: boolean;
  /** `path -> sha256 hex of the stored content`. */
  files: Record<string, string>;
};

export async function fetchPreviewHostFilesManifest(
  previewSessionId: string,
): Promise<PreviewHostFilesManifest | null> {
  const base = getPreviewHostBaseUrl();
  const id = previewSessionId.trim();
  if (!base || !id) return null;
  try {
    const res = await fetch(
      `${base}/preview/session/${encodeURIComponent(id)}/files-manifest`,
      {
        method: "GET",
        headers: { ...previewHostAuthHeaders() },
        cache: "no-store",
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    // 404 also covers a preview-host deployed before this route existed, which
    // is exactly the "fall back to /update" case — no special handling needed.
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok !== true) return null;
    const sid = readPreviewSessionIdFromHostBody(body);
    if (!sid) return null;
    // Only sha256 is understood; a host that switches algorithms must not be
    // diffed against locally computed sha256 digests.
    if (nonEmptyString(body.hashAlgorithm) !== "sha256") return null;
    const rawFiles = body.files;
    if (!rawFiles || typeof rawFiles !== "object" || Array.isArray(rawFiles)) return null;
    const files: Record<string, string> = {};
    for (const [path, hash] of Object.entries(rawFiles as Record<string, unknown>)) {
      if (typeof hash !== "string" || !hash) return null;
      files[path] = hash;
    }
    return {
      previewSessionId: sid,
      versionId: nonEmptyString(body.versionId),
      running: body.running === true,
      files,
    };
  } catch {
    return null;
  }
}

export type PreviewHostStartOk = {
  ok: true;
  previewUrl: string;
  previewSessionId: string;
  startOutcome: "resumed" | "recreated";
  /** Host-issued fence for destructive operations on this lifecycle. */
  lifecycleToken: string | null;
  /** Host-authoritative ordering receipt; null for an older host. */
  mutationRevision: number | null;
};

/**
 * Payload describing a transient `version_mismatch` window between a finalized
 * version being persisted in the app and the preview-VM having booted that
 * version. Emitted by preview-host-client consumers so the builder UI (P25)
 * can render a non-blocking overlay instead of leaving a white iframe sitting
 * for ~10s during the restart.
 *
 * Field name `version_mismatch_overlay_payload` (snake_case) is the
 * cross-process channel key used between this module and the builder overlay;
 * the TS type uses our usual camelCase for fields.
 */
export type VersionMismatchOverlayPayload = {
  /** Own-engine chat id whose preview is mid-restart. */
  chatId: string;
  /** Version id the app has finalized and expects the preview to be running. */
  expectedVersionId: string;
  /** Version id the preview-VM most recently booted, or null if unknown. */
  currentVersionId: string | null;
  /** Ordering between selected/expected version and the preview-session-bound version. */
  mismatchDirection?: "session_newer" | "session_older" | "unknown";
  /** Milliseconds elapsed since the mismatch was first observed. */
  msSinceMismatch: number;
  /**
   * Why the mismatch surface is shown. Missing field = `auto_resync_exhausted`
   * (backwards-compatible default):
   * - `auto_resync_exhausted`: det automatiska resync-försöket är förbrukat och
   *   versionen divergerar fortfarande — blocking overlay med manuell
   *   "Försök igen" (force-restart).
   * - `suppressed_failed_version` (M#pv3): den valda versionen är terminalt
   *   `failed` utan egen previewUrl; auto-resync undertrycks medvetet (ingen
   *   omstart har körts) och previewn servar den senast fungerande versionen —
   *   renderas som diskret banner utan force-restart-åtgärd.
   */
  reason?: "auto_resync_exhausted" | "suppressed_failed_version";
};

export type PreviewHostStartErr = {
  ok: false;
  message: string;
  retryable: boolean;
  prewarmDisposition?: "superseded" | "rate_limited";
};

export type PreviewHostDestroyOk = {
  ok: true;
  destroyed: boolean;
  /** A newer lifecycle owns the session; the requested old lifecycle is already gone. */
  superseded?: boolean;
};

export type PreviewHostDestroyErr = {
  ok: false;
  message: string;
  retryable: boolean;
};

export type PreviewHostHibernateOk = {
  ok: true;
  hibernated: boolean;
  superseded?: boolean;
  /**
   * `true` when the preview host returned 404 — i.e. the session was already
   * gone or never existed. Treated as ok (the caller wanted it stopped) but
   * surfaced separately so misconfigured PREVIEW_HOST_BASE_URL doesn't look
   * like an idempotent no-op.
   */
  notFound?: boolean;
};

export type PreviewHostHibernateErr = {
  ok: false;
  message: string;
  retryable: boolean;
};

export type PreviewHostVerifyCheckResult = {
  check: string;
  passed: boolean;
  advisory?: boolean;
  repairable?: boolean;
  failureKind?: "code" | "tooling" | null;
  errorCount?: number;
  warningCount?: number;
  exitCode: number;
  output: string;
  durationMs: number | null;
};

export type PreviewHostVerifyOk = {
  ok: true;
  durationMs: number;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  firstFailureCheck: string | null;
  results: PreviewHostVerifyCheckResult[];
};

export type PreviewHostVerifyErr = {
  ok: false;
  message: string;
  retryable: boolean;
};

/**
 * Creates a session on preview-host (Fly).
 *
 * `preview_host` keys its runtime/path by own-engine `chatId`, not by the app project id.
 * During rollout we still send legacy `projectId` as an alias so older hosts can accept the payload.
 */
export async function startPreviewHostSession(params: {
  chatId: string;
  versionId: string;
  filesJson: Record<string, string>;
  /**
   * A host-side prewarm is conditional: it may only create an unclaimed
   * session and must be rate-bound by this opaque app-generated lease key.
   * Normal finalize starts omit both fields and preserve their current
   * start/update semantics.
   */
  prewarm?: boolean;
  prewarmLeaseKey?: string;
}): Promise<PreviewHostStartOk | PreviewHostStartErr> {
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return {
      ok: false,
      message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL is not set.",
      retryable: false,
    };
  }
  return retryPreviewHostRequestAfterCleanup(async () => {
    try {
      const requestBody = {
        chatId: params.chatId,
        projectId: params.chatId,
        versionId: params.versionId,
        filesJson: params.filesJson,
        changeClass: "fresh",
        ...(params.prewarm
          ? {
              prewarm: true,
              prewarmLeaseKey: params.prewarmLeaseKey,
            }
          : {}),
      };
      const res = await fetch(`${base}/preview/session/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...previewHostAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(START_TIMEOUT_MS),
      });
      const responseBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const hostError =
          typeof responseBody.error === "string" ? responseBody.error.trim() : "";
        const msg = describePreviewHostHttpFailure({
          endpoint: "/preview/session/start",
          status: res.status,
          body: responseBody,
        });
        return {
          ok: false,
          message: msg,
          retryable:
            params.prewarm &&
            (hostError === "prewarm_superseded" || hostError === "prewarm_rate_limited")
              ? false
              : res.status >= 500 || res.status === 429,
          ...(params.prewarm && hostError === "prewarm_superseded"
            ? { prewarmDisposition: "superseded" as const }
            : params.prewarm && hostError === "prewarm_rate_limited"
              ? { prewarmDisposition: "rate_limited" as const }
              : {}),
        };
      }
      const previewUrl = readPreviewUrlFromHostBody(responseBody);
      const previewSessionId = readPreviewSessionIdFromHostBody(responseBody);
      if (!previewUrl || !previewSessionId) {
        return {
          ok: false,
          message: "Preview host returned an invalid session payload.",
          retryable: true,
        };
      }
      const raw =
        typeof responseBody.startOutcome === "string" ? responseBody.startOutcome.trim() : "fresh";
      const startOutcome: "resumed" | "recreated" = raw === "resumed" ? "resumed" : "recreated";
      return {
        ok: true,
        previewUrl,
        previewSessionId,
        startOutcome,
        lifecycleToken: nonEmptyString(responseBody.lifecycleToken),
        mutationRevision: readMutationRevisionFromHostBody(responseBody),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview host request failed";
      return { ok: false, message, retryable: true };
    }
  });
}

/**
 * Updates an existing preview-host session with new files / new versionId.
 * Hits `POST /preview/session/update` (preview-host server.js:453).
 *
 * Skiljer sig från `startPreviewHostSession` så här:
 * - Sätter `lastAction: "update"` istället för `"start"` på sessionen
 * - Returnerar alltid `startOutcome: "resumed"` (inte "fresh→recreated")
 * - Kräver att sandboxen redan finns (404 om saknas, fall tillbaka till start)
 *
 * Använd för follow-up-generationer på samma chatId. Telemetry/UI får då
 * "resumed"-signal istället för "recreated", vilket är semantiskt korrekt
 * — samma sandbox lever vidare, bara filerna byts ut.
 */
export type PreviewHostUpdateOk = PreviewHostStartOk;
export type PreviewHostUpdateErr = PreviewHostStartErr & {
  /** True när host returnerade 404 (preview-session saknas). Caller bör då falla tillbaka till `startPreviewHostSession`. */
  sessionMissing?: boolean;
  superseded?: boolean;
};

export async function updatePreviewHostSession(params: {
  previewSessionId: string;
  lifecycleToken?: string | null;
  versionId: string;
  filesJson: Record<string, string>;
}): Promise<PreviewHostUpdateOk | PreviewHostUpdateErr> {
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return {
      ok: false,
      message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL is not set.",
      retryable: false,
    };
  }
  return retryPreviewHostRequestAfterCleanup(async () => {
    try {
      const requestBody = {
        ...previewSessionRefBody({
          previewSessionId: params.previewSessionId,
          lifecycleToken: params.lifecycleToken,
        }),
        versionId: params.versionId,
        filesJson: params.filesJson,
        replaceFiles: true,
        // Must be one of the host's CHANGE_CLASSES (fresh|light|medium|heavy);
        // "patch" was rejected with 400 and forced a full-start fallback. The
        // partial, no-restart fast lane lives on the dedicated /preview/session/patch route.
        changeClass: "light",
      };
      const res = await fetch(`${base}/preview/session/update`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...previewHostAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(START_TIMEOUT_MS),
      });
      const responseBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 404) {
        return {
          ok: false,
          message:
            typeof responseBody.message === "string" && responseBody.message
              ? responseBody.message
              : "preview-host session not found",
          retryable: false,
          sessionMissing: true,
        };
      }
      if (res.status === 409 && responseBody.error === "stale_lifecycle") {
        return {
          ok: false,
          message: "A newer preview lifecycle owns this session.",
          retryable: false,
          superseded: true,
        };
      }
      if (!res.ok) {
        const msg = describePreviewHostHttpFailure({
          endpoint: "/preview/session/update",
          status: res.status,
          body: responseBody,
        });
        return {
          ok: false,
          message: msg,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      const previewUrl = readPreviewUrlFromHostBody(responseBody);
      const previewSessionId = readPreviewSessionIdFromHostBody(responseBody);
      if (!previewUrl || !previewSessionId) {
        return {
          ok: false,
          message: "Preview host returned an invalid update payload.",
          retryable: true,
        };
      }
      return {
        ok: true,
        previewUrl,
        previewSessionId,
        startOutcome: "resumed",
        lifecycleToken: nonEmptyString(responseBody.lifecycleToken),
        mutationRevision: readMutationRevisionFromHostBody(responseBody),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview host update failed";
      return { ok: false, message, retryable: true };
    }
  });
}

/**
 * Fast Edit Lane: push ONLY the changed files to an existing preview-host
 * session via `POST /preview/session/patch`. The host writes the changed files
 * into the live workspace without restarting Next dev (unless a structural /
 * dependency-critical path changed), so trivial text/prop edits appear in a few
 * seconds instead of triggering a full rebuild.
 *
 * `patchMode` reports what the host did: `"patched"` (hot, no restart),
 * `"restarted"` (structural change forced a full boot), or `"booted"` (runtime
 * was not running and a fresh boot was queued). 404 -> `sessionMissing: true`,
 * caller should fall back to `updatePreviewHostSession` / `startPreviewHostSession`.
 */
export type PreviewHostPatchMode = "patched" | "restarted" | "booted";
export type PreviewHostPatchOk = PreviewHostStartOk & {
  patchMode: PreviewHostPatchMode;
  patchReason: string | null;
  /**
   * `versionId` the host session ends up pinned to after the patch (echoed
   * from its own store, not from the request). Callers that rely on resume /
   * `/status` staying correct compare it with the version they sent; `null`
   * means the host did not report one.
   */
  hostVersionId: string | null;
};
export type PreviewHostPatchErr = PreviewHostStartErr & {
  sessionMissing?: boolean;
  superseded?: boolean;
  /**
   * Host returned 409: the live session no longer points at `expectedBaseVersionId`
   * (it advanced between our optimistic precheck and the host store lock — the
   * TOCTOU race). Caller should do a full (re)start instead of a partial patch.
   */
  baseMismatch?: boolean;
};

export async function patchPreviewHostSession(params: {
  previewSessionId: string;
  lifecycleToken?: string | null;
  versionId: string;
  /** Only the changed files (path -> content). Partial set, merged on the host. */
  files: Record<string, string>;
  /** Optional paths to delete from the live workspace. */
  removedPaths?: string[];
  /**
   * Version the `files` were derived from. When set, the host re-checks it under
   * its store lock and returns 409 if the session already advanced past it, so
   * two concurrent quick edits cannot both merge into the same session.
   */
  expectedBaseVersionId?: string;
}): Promise<PreviewHostPatchOk | PreviewHostPatchErr> {
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return {
      ok: false,
      message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL is not set.",
      retryable: false,
    };
  }
  return retryPreviewHostRequestAfterCleanup(async () => {
    try {
      const expectedBaseVersionId = params.expectedBaseVersionId?.trim() || null;
      const requestBody = {
        ...previewSessionRefBody({
          previewSessionId: params.previewSessionId,
          lifecycleToken: params.lifecycleToken,
        }),
        versionId: params.versionId,
        files: params.files,
        ...(params.removedPaths && params.removedPaths.length > 0
          ? { removedPaths: params.removedPaths }
          : {}),
        ...(expectedBaseVersionId ? { expectedBaseVersionId } : {}),
      };
      const res = await fetch(`${base}/preview/session/patch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...previewHostAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(START_TIMEOUT_MS),
      });
      const responseBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 404) {
        return {
          ok: false,
          message:
            typeof responseBody.message === "string" && responseBody.message
              ? responseBody.message
              : "preview-host session not found",
          retryable: false,
          sessionMissing: true,
        };
      }
      if (res.status === 409) {
        if (responseBody.error === "stale_lifecycle") {
          return {
            ok: false,
            message: "A newer preview lifecycle owns this session.",
            retryable: false,
            superseded: true,
          };
        }
        return {
          ok: false,
          message:
            typeof responseBody.message === "string" && responseBody.message
              ? responseBody.message
              : "preview-host session advanced past the expected base version",
          retryable: false,
          baseMismatch: true,
        };
      }
      if (!res.ok) {
        const msg =
          typeof responseBody.message === "string" && responseBody.message.trim()
            ? responseBody.message.trim()
            : `Preview host HTTP ${res.status}`;
        return {
          ok: false,
          message: msg,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      const previewUrl = readPreviewUrlFromHostBody(responseBody);
      const previewSessionId = readPreviewSessionIdFromHostBody(responseBody);
      if (!previewUrl || !previewSessionId) {
        return {
          ok: false,
          message: "Preview host returned an invalid patch payload.",
          retryable: true,
        };
      }
      const rawMode =
        typeof responseBody.patchMode === "string" ? responseBody.patchMode.trim() : "patched";
      const patchMode: PreviewHostPatchMode =
        rawMode === "restarted" || rawMode === "booted" ? rawMode : "patched";
      const patchReason =
        typeof responseBody.patchReason === "string" && responseBody.patchReason.trim()
          ? responseBody.patchReason.trim()
          : null;
      return {
        ok: true,
        previewUrl,
        previewSessionId,
        startOutcome: "resumed",
        patchMode,
        patchReason,
        hostVersionId: nonEmptyString(responseBody.versionId),
        lifecycleToken: nonEmptyString(responseBody.lifecycleToken),
        mutationRevision: readMutationRevisionFromHostBody(responseBody),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview host patch failed";
      return { ok: false, message, retryable: true };
    }
  });
}

/**
 * Destroys a preview-host session by previewSessionId or sessionId.
 * Sends legacy `sandboxId` in the body as a rollout alias for older hosts.
 * Host 404 is treated as already gone, so callers can still clear local state safely.
 */
export async function destroyPreviewHostSession(params: {
  previewSessionId?: string | null;
  sessionId?: string | null;
  lifecycleToken?: string | null;
}): Promise<PreviewHostDestroyOk | PreviewHostDestroyErr> {
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return {
      ok: false,
      message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL is not set.",
      retryable: false,
    };
  }

  const previewSessionId = params.previewSessionId?.trim() || null;
  const sessionId = params.sessionId?.trim() || null;
  const lifecycleToken = params.lifecycleToken?.trim() || null;
  if (!previewSessionId && !sessionId) {
    return {
      ok: false,
      message: "preview-host destroy requires previewSessionId or sessionId.",
      retryable: false,
    };
  }

  try {
    const res = await fetch(`${base}/preview/session/destroy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...previewHostAuthHeaders(),
      },
      body: JSON.stringify(
        previewSessionRefBody({
          previewSessionId,
          sessionId,
          lifecycleToken,
        }),
      ),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 404) {
      return { ok: true, destroyed: false };
    }
    if (res.status === 409 && body.error === "stale_lifecycle") {
      return { ok: true, destroyed: false, superseded: true };
    }
    if (!res.ok) {
      const msg = describePreviewHostHttpFailure({
        endpoint: "/preview/session/destroy",
        status: res.status,
        body,
      });
      return {
        ok: false,
        message: msg,
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    return {
      ok: true,
      destroyed: body.destroyed === true,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview host destroy failed";
    return { ok: false, message, retryable: true };
  }
}

export async function hibernatePreviewHostSession(params: {
  previewSessionId?: string | null;
  sessionId?: string | null;
  lifecycleToken?: string | null;
}): Promise<PreviewHostHibernateOk | PreviewHostHibernateErr> {
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return {
      ok: false,
      message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL is not set.",
      retryable: false,
    };
  }

  const previewSessionId = params.previewSessionId?.trim() || null;
  const sessionId = params.sessionId?.trim() || null;
  const lifecycleToken = params.lifecycleToken?.trim() || null;
  if (!previewSessionId && !sessionId) {
    return {
      ok: false,
      message: "preview-host hibernate requires previewSessionId or sessionId.",
      retryable: false,
    };
  }

  try {
    const res = await fetch(`${base}/preview/session/hibernate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...previewHostAuthHeaders(),
      },
      body: JSON.stringify(
        previewSessionRefBody({ previewSessionId, sessionId, lifecycleToken }),
      ),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 404) {
      // Distinguish "session never existed" / "already gone" from a real
      // hibernate. Previously this returned `{ ok: true, hibernated: false }`
      // identically to a successful no-op call, which silently masked
      // misconfigured base URLs (a 404 on the wrong host looked the same as
      // an idempotent miss). Caller treats `notFound: true` as still ok but
      // can log it as a config-suspicion signal.
      return { ok: true, hibernated: false, notFound: true };
    }
    if (res.status === 409 && body.error === "stale_lifecycle") {
      return { ok: true, hibernated: false, superseded: true };
    }
    if (!res.ok) {
      const msg = describePreviewHostHttpFailure({
        endpoint: "/preview/session/hibernate",
        status: res.status,
        body,
      });
      return {
        ok: false,
        message: msg,
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    return { ok: true, hibernated: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview host hibernate failed";
    return { ok: false, message, retryable: true };
  }
}

export async function runPreviewHostQualityGate(params: {
  chatId: string;
  versionId: string;
  filesJson: Record<string, string>;
  checks: ReadonlyArray<"typecheck" | "build" | "lint">;
  /**
   * Optional ABSOLUTE `Date.now()`-based deadline by which the verify must have
   * aborted. The budget-aware manual-repair final gate passes this so the verify
   * aborts BEFORE the route's `maxDuration` and `finally { releaseVersionLease }`
   * always runs (Codex P1 #286). The per-call abort timeout is derived from this
   * deadline at fetch time (`deadline - Date.now()`), so any async prep before
   * the fetch — and the cleanup-retry delay — is automatically subtracted, and it
   * is clamped to `[1, VERIFY_TIMEOUT_MS]` (never exceeds the route budget).
   * Undefined → the static `VERIFY_TIMEOUT_MS` (back-compat).
   */
  verifyDeadlineEpochMs?: number;
}): Promise<PreviewHostVerifyOk | PreviewHostVerifyErr> {
  const base = getPreviewHostBaseUrl();
  if (!base) {
    return {
      ok: false,
      message: "SAJTMASKIN_PREVIEW_HOST_BASE_URL is not set.",
      retryable: false,
    };
  }
  return retryPreviewHostRequestAfterCleanup(async () => {
    // Derive the abort timeout from the absolute deadline at the LAST moment
    // before the fetch (and again on a cleanup-retry), so elapsed prep never
    // pushes the abort past the route hard-kill. Clamped to (0, VERIFY_TIMEOUT_MS].
    const effectiveVerifyTimeoutMs = resolvePreviewHostVerifyTimeoutMs(
      params.verifyDeadlineEpochMs !== undefined
        ? params.verifyDeadlineEpochMs - Date.now()
        : undefined,
    );
    try {
      const res = await fetch(`${base}/preview/verify`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...previewHostAuthHeaders(),
        },
        body: JSON.stringify({
          chatId: params.chatId,
          projectId: params.chatId,
          versionId: params.versionId,
          filesJson: params.filesJson,
          checks: params.checks,
        }),
        signal: AbortSignal.timeout(effectiveVerifyTimeoutMs),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const msg = describePreviewHostHttpFailure({
          endpoint: "/preview/verify",
          status: res.status,
          body,
        });
        return {
          ok: false,
          message: msg,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      const results = Array.isArray(body.results)
        ? body.results
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const row = entry as Record<string, unknown>;
              const check = typeof row.check === "string" ? row.check : "";
              const exitCode = typeof row.exitCode === "number" ? row.exitCode : 1;
              const rawOutput = typeof row.output === "string" ? row.output : "";
              const output = rawOutput || (row.passed !== true ? `(No ${check || "check"} output captured from verify lane; exit ${exitCode}).` : "");
              const passed = row.passed === true;
              const advisory = row.advisory === true;
              const repairable = row.repairable !== false;
              const failureKind: PreviewHostVerifyCheckResult["failureKind"] =
                row.failureKind === "code" || row.failureKind === "tooling"
                  ? row.failureKind
                  : null;
              const errorCount =
                typeof row.errorCount === "number" && Number.isFinite(row.errorCount)
                  ? row.errorCount
                  : undefined;
              const warningCount =
                typeof row.warningCount === "number" && Number.isFinite(row.warningCount)
                  ? row.warningCount
                  : undefined;
              const durationMs =
                typeof row.durationMs === "number" && Number.isFinite(row.durationMs)
                  ? row.durationMs
                  : null;
              if (!check) return null;
              return {
                check,
                passed,
                advisory,
                repairable,
                failureKind,
                errorCount,
                warningCount,
                exitCode,
                output,
                durationMs,
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        : [];
      return {
        ok: true,
        durationMs: typeof body.durationMs === "number" ? body.durationMs : 0,
        jobStartedAt:
          typeof body.jobStartedAt === "string" && body.jobStartedAt.trim()
            ? body.jobStartedAt.trim()
            : null,
        jobFinishedAt:
          typeof body.jobFinishedAt === "string" && body.jobFinishedAt.trim()
            ? body.jobFinishedAt.trim()
            : null,
        firstFailureCheck:
          typeof body.firstFailureCheck === "string" && body.firstFailureCheck.trim()
            ? body.firstFailureCheck.trim()
            : null,
        results,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview host verify failed";
      return { ok: false, message, retryable: true };
    }
  });
}
