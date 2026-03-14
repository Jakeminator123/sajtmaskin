import type { FileEntry, VersionEntry } from "./types";

export async function fetchChatVersions(
  chatId: string,
  signal?: AbortSignal,
): Promise<VersionEntry[]> {
  const response = await fetch(`/api/v0/chats/${encodeURIComponent(chatId)}/versions`, { signal });
  const data = (await response.json().catch(() => null)) as { versions?: VersionEntry[] } | null;
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        `Failed to fetch versions (HTTP ${response.status})`,
    );
  }
  return Array.isArray(data?.versions) ? data.versions : [];
}

export async function fetchChatFiles(
  chatId: string,
  versionId: string,
  signal?: AbortSignal,
  waitForReady = false,
): Promise<FileEntry[]> {
  const waitParam = waitForReady ? "&wait=1" : "";
  const response = await fetch(
    `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
      versionId,
    )}${waitParam}`,
    { signal },
  );
  const data = (await response.json().catch(() => null)) as {
    files?: FileEntry[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
  }
  return Array.isArray(data?.files) ? data.files : [];
}

export async function triggerImageMaterialization(params: {
  chatId: string;
  versionId: string;
  enabled: boolean;
}): Promise<void> {
  if (!params.enabled) return;
  const { chatId, versionId } = params;
  try {
    const url = `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
      versionId,
    )}&materialize=1`;
    await fetch(url, { method: "GET" });
  } catch {
    // best-effort only
  }
}
