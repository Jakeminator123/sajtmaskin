import { getPreviewHostBaseUrl } from "./tier2-config";

function previewHostAuthHeaders(): Record<string, string> {
  const key = process.env.SAJTMASKIN_PREVIEW_HOST_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

const START_TIMEOUT_MS = 300_000;
const STATUS_TIMEOUT_MS = 15_000;

export async function fetchPreviewHostStatus(
  sandboxId: string,
): Promise<{ sandboxId: string; primaryUrl: string } | null> {
  const base = getPreviewHostBaseUrl();
  const id = sandboxId.trim();
  if (!base || !id) return null;
  try {
    const res = await fetch(
      `${base}/preview/sandbox/${encodeURIComponent(id)}/status`,
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

/**
 * Creates a session on preview-host (Fly). Maps host `startOutcome` `fresh` → `recreated`.
 */
export async function startPreviewHostSession(params: {
  projectId: string;
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
  try {
    const res = await fetch(`${base}/preview/session/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...previewHostAuthHeaders(),
      },
      body: JSON.stringify({
        projectId: params.projectId,
        versionId: params.versionId,
        filesJson: params.filesJson,
        changeClass: "fresh",
      }),
      signal: AbortSignal.timeout(START_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : `Preview host HTTP ${res.status}`;
      return {
        ok: false,
        message: msg,
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    const sandboxUrl = typeof body.previewUrl === "string" ? body.previewUrl.trim() : "";
    const sandboxId = typeof body.sandboxId === "string" ? body.sandboxId.trim() : "";
    if (!sandboxUrl || !sandboxId) {
      return {
        ok: false,
        message: "Preview host returned an invalid session payload.",
        retryable: true,
      };
    }
    const raw = typeof body.startOutcome === "string" ? body.startOutcome.trim() : "fresh";
    const startOutcome: "resumed" | "recreated" = raw === "resumed" ? "resumed" : "recreated";
    return { ok: true, sandboxUrl, sandboxId, startOutcome };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview host request failed";
    return { ok: false, message, retryable: true };
  }
}
