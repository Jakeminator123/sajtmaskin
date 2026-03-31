import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err && (err.error || err.message)) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json();
};

export function useChat(chatId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    chatId ? engineChatBaseUrl(chatId) : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    chat: data,
    isLoading,
    isError: error,
    mutate,
  };
}
