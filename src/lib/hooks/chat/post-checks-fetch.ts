import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { FileEntry, VersionEntry } from "./types";

export type ImageMaterializationStatus = {
  attempted: boolean;
  strategy: "blob";
  replaced: number;
  uploaded: number;
  skipped: number;
  warningCount: number;
  reason?: string;
  error?: string | null;
};

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

export async function triggerImageMaterialization(params: {
  chatId: string;
  versionId: string;
  enabled: boolean;
}): Promise<ImageMaterializationStatus | null> {
  if (!params.enabled) {
    return {
      attempted: false,
      strategy: "blob",
      replaced: 0,
      uploaded: 0,
      skipped: 0,
      warningCount: 0,
      reason: "disabled",
    };
  }
  const { chatId, versionId } = params;
  try {
    const url = `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(versionId)}&materialize=1`;
    const response = await fetch(url, { method: "GET" });
    const data = (await response.json().catch(() => null)) as {
      imageMaterialization?: ImageMaterializationStatus;
    } | null;
    return data?.imageMaterialization ?? null;
  } catch {
    return {
      attempted: true,
      strategy: "blob",
      replaced: 0,
      uploaded: 0,
      skipped: 0,
      warningCount: 0,
      error: "network_error",
    };
  }
}
