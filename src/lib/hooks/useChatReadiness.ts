import useSWR from "swr";
import type { ChatReadiness } from "@/lib/chat-readiness";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err && (err.error || err.message)) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json();
};

export function useChatReadiness(chatId: string | null, versionId: string | null) {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  const { data, error, isLoading, mutate } = useSWR(
    chatId ? `/api/v0/chats/${chatId}/readiness${query}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: versionId ? 10000 : 0,
      dedupingInterval: 2000,
    },
  );

  return {
    readiness: (data?.readiness as ChatReadiness | undefined) ?? null,
    isLoading,
    isError: error,
    mutate,
  };
}
