import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

export async function patchEngineChatFile(params: {
  chatId: string;
  versionId: string;
  fileName: string;
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { chatId, versionId, fileName, content } = params;
  try {
    const response = await fetch(`${engineChatBaseUrl(chatId)}/files`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId,
        fileName,
        content,
      }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      return { ok: false, error: data?.error || `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Nätverksfel vid spar",
    };
  }
}
