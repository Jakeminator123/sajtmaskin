import type { SandboxHeartbeatApiJson, SandboxStatusApiJson } from "@/lib/gen/preview-contract";

/** Browser `fetch` mot sandbox-status; returnerar null vid nätverksfel eller icke-ok svar. */
export async function fetchSandboxStatus(params: {
  chatId: string;
  versionId: string;
  sandboxId?: string | null;
}): Promise<SandboxStatusApiJson | null> {
  const q = new URLSearchParams({ versionId: params.versionId });
  if (params.sandboxId?.trim()) {
    q.set("sandboxId", params.sandboxId.trim());
  }
  try {
    const res = await fetch(
      `/api/v0/chats/${encodeURIComponent(params.chatId)}/sandbox-status?${q.toString()}`,
    );
    const data = (await res.json()) as SandboxStatusApiJson;
    if (!res.ok || !data || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  }
}

/** Browser `fetch` mot sandbox-heartbeat; returnerar parsad kropp eller null. */
export async function postSandboxHeartbeat(params: {
  chatId: string;
  versionId: string;
  sandboxId: string;
  viewerId: string;
}): Promise<SandboxHeartbeatApiJson | null> {
  try {
    const res = await fetch(`/api/v0/chats/${encodeURIComponent(params.chatId)}/sandbox-heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: params.versionId,
        sandboxId: params.sandboxId,
        viewerId: params.viewerId,
      }),
    });
    try {
      return (await res.json()) as SandboxHeartbeatApiJson;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
