import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { FileEntry, VersionEntry } from "./types";

export type ImageMaterializationStatus = {
  attempted: boolean;
  strategy: "blob";
  /** In-memory / planned URL swaps. Not proof that `files_json` changed. */
  replaced: number;
  uploaded: number;
  skipped: number;
  warningCount: number;
  /**
   * True only when the durable `files_json` write landed (or nothing needed
   * writing). Callers must not start Product Postcheck on `replaced > 0`
   * unless this is true and `filesRevision` is set.
   */
  persisted: boolean;
  filesRevision?: string | null;
  reason?: string;
  error?: string | null;
};

/**
 * Materialiseringen ligger FÖRE post-checks i svansen (den skriver
 * `files_json` och får inte tävla med produktkontrollens revision). Därför
 * måste den ha ett tak: utan det stoppar en hängande request hela svansen.
 * Aborten går med i fetch så servern kan hoppa över persist efter timeout.
 */
export const IMAGE_MATERIALIZATION_TIMEOUT_MS = 30_000;
export const IMAGE_MATERIALIZATION_RETRY_MS = 400;
export const VALIDATE_IMAGES_TIMEOUT_MS = 30_000;

export function bindTimeoutSignal(
  outer: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuter = () => controller.abort();
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener("abort", onOuter, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted && !outer?.aborted,
    cleanup: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

function materializationFailure(
  error: NonNullable<ImageMaterializationStatus["error"]>,
): ImageMaterializationStatus {
  return {
    attempted: true,
    strategy: "blob",
    replaced: 0,
    uploaded: 0,
    skipped: 0,
    warningCount: 0,
    persisted: false,
    filesRevision: null,
    error,
  };
}

export function canProceedToPostcheckAfterMaterialization(
  result: ImageMaterializationStatus | null,
  enabled: boolean,
): boolean {
  if (!enabled) return true;
  if (!result) return false;
  if (result.error) return false;
  if (result.replaced > 0 && (result.persisted !== true || !result.filesRevision)) {
    return false;
  }
  return true;
}

export async function fetchChatVersions(
  chatId: string,
  signal?: AbortSignal,
): Promise<VersionEntry[]> {
  const response = await fetch(`${engineChatBaseUrl(chatId)}/versions`, { signal });
  const data = (await response.json().catch(() => null)) as { versions?: VersionEntry[] } | null;
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        `Failed to fetch versions (HTTP ${response.status})`,
    );
  }
  if (!Array.isArray(data?.versions)) {
    throw new Error("Invalid versions response shape");
  }
  return data.versions;
}

export async function fetchChatFiles(
  chatId: string,
  versionId: string,
  signal?: AbortSignal,
  waitForReady = false,
): Promise<FileEntry[]> {
  const waitParam = waitForReady ? "&wait=1" : "";
  const response = await fetch(
    `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(versionId)}${waitParam}`,
    { signal },
  );
  const data = (await response.json().catch(() => null)) as {
    files?: FileEntry[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
  }
  if (!Array.isArray(data?.files)) {
    throw new Error("Invalid files response shape");
  }
  return data.files;
}

function parseMaterializationPayload(
  data: { imageMaterialization?: ImageMaterializationStatus } | null,
): ImageMaterializationStatus | null {
  const payload = data?.imageMaterialization;
  if (!payload || typeof payload !== "object") return null;
  const replaced =
    typeof payload.replaced === "number" && Number.isFinite(payload.replaced)
      ? payload.replaced
      : 0;
  return {
    attempted: payload.attempted === true,
    strategy: "blob",
    replaced,
    uploaded:
      typeof payload.uploaded === "number" && Number.isFinite(payload.uploaded)
        ? payload.uploaded
        : 0,
    skipped:
      typeof payload.skipped === "number" && Number.isFinite(payload.skipped)
        ? payload.skipped
        : 0,
    warningCount:
      typeof payload.warningCount === "number" && Number.isFinite(payload.warningCount)
        ? payload.warningCount
        : 0,
    persisted: payload.persisted === true,
    filesRevision:
      typeof payload.filesRevision === "string" && payload.filesRevision.trim()
        ? payload.filesRevision.trim()
        : null,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
    error: typeof payload.error === "string" ? payload.error : payload.error ?? null,
  };
}

async function delayUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function triggerImageMaterialization(params: {
  chatId: string;
  versionId: string;
  enabled: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ImageMaterializationStatus | null> {
  if (!params.enabled) {
    return {
      attempted: false,
      strategy: "blob",
      replaced: 0,
      uploaded: 0,
      skipped: 0,
      warningCount: 0,
      persisted: true,
      filesRevision: null,
      reason: "disabled",
    };
  }
  const { chatId, versionId } = params;
  const timeoutMs = params.timeoutMs ?? IMAGE_MATERIALIZATION_TIMEOUT_MS;
  const deadlineAt = Date.now() + timeoutMs;
  const bound = bindTimeoutSignal(params.signal, timeoutMs);
  const failureError = () => (bound.timedOut() ? "timeout" : "aborted");
  try {
    while (true) {
      if (bound.signal.aborted) return materializationFailure(failureError());
      const url = `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(versionId)}&materialize=1`;
      let response: Response;
      try {
        response = await fetch(url, { method: "GET", signal: bound.signal });
      } catch {
        return materializationFailure(bound.signal.aborted ? failureError() : "network_error");
      }
      const data = (await response.json().catch(() => null)) as {
        imageMaterialization?: ImageMaterializationStatus;
      } | null;
      const parsed = parseMaterializationPayload(data);
      if (!parsed) return materializationFailure("network_error");
      if (parsed.error) return parsed;
      if (parsed.replaced <= 0 || (parsed.persisted === true && Boolean(parsed.filesRevision))) {
        return parsed;
      }
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0 || bound.signal.aborted) {
        return {
          ...parsed,
          persisted: false,
          error: failureError(),
        };
      }
      await delayUnlessAborted(Math.min(IMAGE_MATERIALIZATION_RETRY_MS, remainingMs), bound.signal);
    }
  } catch {
    return materializationFailure(bound.signal.aborted ? failureError() : "network_error");
  } finally {
    bound.cleanup();
  }
}

/**
 * Boot/resync the preview VM against the version's current `files_json`
 * (and therefore its current `files_revision`). Used after a confirmed
 * image-mutation persist so Product Postcheck waits on the revision it
 * will attest — not the finalize-time session.
 */
export async function resyncPreviewForRevision(params: {
  chatId: string;
  versionId: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; previewUrl: string | null }> {
  try {
    const response = await fetch(`${engineChatBaseUrl(params.chatId)}/preview-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId: params.versionId }),
      signal: params.signal,
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: unknown;
      previewUrl?: unknown;
    } | null;
    const previewUrl =
      typeof data?.previewUrl === "string" && data.previewUrl.trim()
        ? data.previewUrl.trim()
        : null;
    return { ok: response.ok && data?.ok === true, previewUrl };
  } catch {
    return { ok: false, previewUrl: null };
  }
}
