import { sfccConfig, validateSfccEnv } from "./config";

validateSfccEnv();

type FetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: HeadersInit;
  body?: unknown;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
  token?: string;
};

function getBaseApiUrl() {
  return `https://${sfccConfig.shortCode}.api.commercecloud.salesforce.com`;
}

export async function sfccFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${getBaseApiUrl()}${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
    next: options.next,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SFCC request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}
