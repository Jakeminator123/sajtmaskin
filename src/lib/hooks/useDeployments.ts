import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err && (err.error || err.message)) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json();
};

export function useDeployments(chatId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    chatId ? `/api/v0/deployments?chatId=${encodeURIComponent(chatId)}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 5000,
    }
  );

  return {
    deployments: data?.deployments || [],
    isLoading,
    isError: error,
    mutate,
  };
}
