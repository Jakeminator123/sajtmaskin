import { getPreviewHostBaseUrl } from "./tier2-config";
import { VERIFY_REPAIR_ROUTE_MAX_DURATION_SECONDS } from "@/lib/gen/defaults";

function previewHostAuthHeaders(): Record<string, string> {
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
  verify: VERIFY_REPAIR_ROUTE_MAX_DURATION_SECONDS * 1000 - 30_000,
  cleanup: 30_000,
} as const;

/**
 * `maxDuration` (sekunder) för de Vercel-routes som håller en version-lease
 * runt ett `/preview/verify`-anrop. `verify`-timeouten ovan MÅSTE vara
 * strikt mindre än detta * 1000 så `finally { releaseVersionLease }` hinner
 * köra före Vercels hård-kill. Verifieras av `preview-host-client.test.ts`.
 */
export const LEASE_HOLDING_ROUTE_MAX_DURATION_S =
  VERIFY_REPAIR_ROUTE_MAX_DURATION_SECONDS;

const START_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.start;
const STATUS_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.status;
const VERIFY_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify;
const CLEANUP_TIMEOUT_MS = PREVIEW_HOST_CLIENT_TIMEOUTS_MS.cleanup;

function nonEmptyString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
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
}): Record<string, string> {
  const previewSessionId = params.previewSessionId?.trim() || null;
  const sessionId = params.sessionId?.trim() || null;
  return {
    ...(previewSessionId ? { previewSessionId, sandboxId: previewSessionId } : {}),
    ...(sessionId ? { sessionId } : {}),
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

export async function fetchPreviewHostStatus(
  previewSessionId: string,
  opts?: { expectedVersionId?: string | null },
): Promise<{ previewSessionId: string; primaryUrl: string } | null> {
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
    // the caller knows the expected version and the host reports a *different*
    // one, treat the session as not resumable so the caller re-pins (re-create /
    // update) instead of surfacing a stale preview. Only rejects when BOTH ids
    // are known — older hosts that omit `versionId` keep the prior behaviour.
    const expectedVersionId = opts?.expectedVersionId?.trim();
    const hostVersionId = nonEmptyString(body.versionId);
    if (expectedVersionId && hostVersionId && hostVersionId !== expectedVersionId) {
      return null;
    }
    return { previewSessionId: sid, primaryUrl: url };
  } catch {
    return null;
  }
}

export type PreviewHostStartOk = {
  ok: true;
  previewUrl: string;
  previewSessionId: string;
  startOutcome: "resumed" | "recreated";
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
};

export type PreviewHostStartErr = {
  ok: false;
  message: string;
  retryable: boolean;
};

export type PreviewHostDestroyOk = {
  ok: true;
  destroyed: boolean;
};

export type PreviewHostDestroyErr = {
  ok: false;
  message: string;
  retryable: boolean;
};

export type PreviewHostHibernateOk = {
  ok: true;
  hibernated: boolean;
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
        const msg = describePreviewHostHttpFailure({
          endpoint: "/preview/session/start",
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
          message: "Preview host returned an invalid session payload.",
          retryable: true,
        };
      }
      const raw =
        typeof responseBody.startOutcome === "string" ? responseBody.startOutcome.trim() : "fresh";
      const startOutcome: "resumed" | "recreated" = raw === "resumed" ? "resumed" : "recreated";
      return { ok: true, previewUrl, previewSessionId, startOutcome };
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
};

export async function updatePreviewHostSession(params: {
  previewSessionId: string;
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
        ...previewSessionRefBody({ previewSessionId: params.previewSessionId }),
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
      return { ok: true, previewUrl, previewSessionId, startOutcome: "resumed" };
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
};
export type PreviewHostPatchErr = PreviewHostStartErr & {
  sessionMissing?: boolean;
  /**
   * Host returned 409: the live session no longer points at `expectedBaseVersionId`
   * (it advanced between our optimistic precheck and the host store lock — the
   * TOCTOU race). Caller should do a full (re)start instead of a partial patch.
   */
  baseMismatch?: boolean;
};

export async function patchPreviewHostSession(params: {
  previewSessionId: string;
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
        ...previewSessionRefBody({ previewSessionId: params.previewSessionId }),
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
      body: JSON.stringify(previewSessionRefBody({ previewSessionId, sessionId })),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 404) {
      return { ok: true, destroyed: false };
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
      body: JSON.stringify(previewSessionRefBody({ previewSessionId, sessionId })),
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
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
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
              const durationMs =
                typeof row.durationMs === "number" && Number.isFinite(row.durationMs)
                  ? row.durationMs
                  : null;
              if (!check) return null;
              return { check, passed, exitCode, output, durationMs };
            })
            .filter((entry): entry is PreviewHostVerifyCheckResult => Boolean(entry))
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
