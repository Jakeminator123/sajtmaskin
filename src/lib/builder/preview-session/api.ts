import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type {
  PreviewDestroyApiJson,
  PreviewHeartbeatApiJson,
  PreviewStatusApiJson,
} from "@/lib/gen/preview/preview-contract";

/** Browser `fetch` mot preview-status; returnerar null vid natverksfel eller icke-ok svar. */
export async function fetchPreviewStatus(params: {
  chatId: string;
  versionId: string;
  previewSessionId?: string | null;
}): Promise<PreviewStatusApiJson | null> {
  const q = new URLSearchParams({ versionId: params.versionId });
  if (params.previewSessionId?.trim()) {
    q.set("previewSessionId", params.previewSessionId.trim());
  }
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/preview-status?${q.toString()}`);
    const data = (await res.json()) as PreviewStatusApiJson;
    if (!res.ok || !data || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  }
}

/** Browser `fetch` mot preview-heartbeat; returnerar parsad kropp eller null. */
export async function postPreviewHeartbeat(params: {
  chatId: string;
  versionId: string;
  previewSessionId: string;
  viewerId: string;
}): Promise<PreviewHeartbeatApiJson | null> {
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/preview-heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: params.versionId,
        previewSessionId: params.previewSessionId,
        viewerId: params.viewerId,
      }),
    });
    try {
      return (await res.json()) as PreviewHeartbeatApiJson;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** Browser `fetch` mot preview-destroy; returnerar parsad kropp eller null. */
export async function postPreviewDestroy(params: {
  chatId: string;
  versionId: string;
  previewSessionId?: string | null;
}): Promise<PreviewDestroyApiJson | null> {
  try {
    const res = await fetch(`${engineChatBaseUrl(params.chatId)}/preview-destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: params.versionId,
        ...(params.previewSessionId?.trim()
          ? { previewSessionId: params.previewSessionId.trim() }
          : {}),
      }),
    });
    try {
      return (await res.json()) as PreviewDestroyApiJson;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
