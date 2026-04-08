import { getPreviewHostBaseUrl } from "./tier2-config";

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

const START_TIMEOUT_MS = 300_000;
const STATUS_TIMEOUT_MS = 15_000;
const VERIFY_TIMEOUT_MS = 300_000;
const CLEANUP_TIMEOUT_MS = 30_000;

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
  sandboxId: string,
): Promise<{ sandboxId: string; primaryUrl: string } | null> {
  const base = getPreviewHostBaseUrl();
  const id = sandboxId.trim();
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
    const url = typeof body.previewUrl === "string" ? body.previewUrl.trim() : "";
    const sid = typeof body.sandboxId === "string" ? body.sandboxId.trim() : "";
    if (!url || !sid) return null;
    return { sandboxId: sid, primaryUrl: url };
  } catch {
    return null;
  }
}

export type PreviewHostStartOk = {
  ok: true;
  sandboxUrl: string;
  sandboxId: string;
  startOutcome: "resumed" | "recreated";
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
      const sandboxUrl = typeof responseBody.previewUrl === "string" ? responseBody.previewUrl.trim() : "";
      const sandboxId = typeof responseBody.sandboxId === "string" ? responseBody.sandboxId.trim() : "";
      if (!sandboxUrl || !sandboxId) {
        return {
          ok: false,
          message: "Preview host returned an invalid session payload.",
          retryable: true,
        };
      }
      const raw =
        typeof responseBody.startOutcome === "string" ? responseBody.startOutcome.trim() : "fresh";
      const startOutcome: "resumed" | "recreated" = raw === "resumed" ? "resumed" : "recreated";
      return { ok: true, sandboxUrl, sandboxId, startOutcome };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview host request failed";
      return { ok: false, message, retryable: true };
    }
  });
}

/**
 * Destroys a preview-host session by sandboxId or sessionId.
 * Host 404 is treated as already gone, so callers can still clear local state safely.
 */
export async function destroyPreviewHostSession(params: {
  sandboxId?: string | null;
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

  const sandboxId = params.sandboxId?.trim() || null;
  const sessionId = params.sessionId?.trim() || null;
  if (!sandboxId && !sessionId) {
    return {
      ok: false,
      message: "preview-host destroy requires sandboxId or sessionId.",
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
      body: JSON.stringify({
        ...(sandboxId ? { sandboxId } : {}),
        ...(sessionId ? { sessionId } : {}),
      }),
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
  sandboxId?: string | null;
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

  const sandboxId = params.sandboxId?.trim() || null;
  const sessionId = params.sessionId?.trim() || null;
  if (!sandboxId && !sessionId) {
    return {
      ok: false,
      message: "preview-host hibernate requires sandboxId or sessionId.",
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
      body: JSON.stringify({
        ...(sandboxId ? { sandboxId } : {}),
        ...(sessionId ? { sessionId } : {}),
      }),
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 404) {
      return { ok: true, hibernated: false };
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
  checks: Array<"typecheck" | "build" | "lint">;
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
              const output = typeof row.output === "string" ? row.output : "";
              const exitCode = typeof row.exitCode === "number" ? row.exitCode : 1;
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
