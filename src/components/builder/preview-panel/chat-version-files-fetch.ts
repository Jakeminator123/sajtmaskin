import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

/**
 * Shared GET for `/api/engine/chats/:id/files?versionId=` used by code view, registry preload, and route list.
 */

export type ChatVersionFilesApiRow = {
  name: string;
  content?: string;
  locked?: boolean;
};

export type ChatVersionFilesApiResponse = {
  files?: ChatVersionFilesApiRow[];
  error?: string;
};

function chatVersionFilesUrl(chatId: string, versionId: string): string {
  return `${engineChatBaseUrl(chatId)}/files?versionId=${encodeURIComponent(versionId)}`;
}

export async function fetchChatVersionFilesJson(
  chatId: string,
  versionId: string,
  init?: RequestInit,
): Promise<{ response: Response; data: ChatVersionFilesApiResponse | null }> {
  const response = await fetch(chatVersionFilesUrl(chatId, versionId), init);
  const data = (await response.json().catch(() => null)) as ChatVersionFilesApiResponse | null;
  return { response, data };
}
